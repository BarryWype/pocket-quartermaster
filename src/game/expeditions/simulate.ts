import { affixById, type AffixEffect } from '@/content/affixes';
import { expeditionRules } from '@/content/dungeons';
import { familyEffectRules, type FamilyEffectId, type FamilyId } from '@/content/families';
import { mobById, TIER_SCALE } from '@/content/enemies';
import { eventById } from '@/content/events';
import { npcById } from '@/content/npcs';
import { heroClasses } from '@/content/heroes';
import { restrictionRules } from '@/content/threats';
import { gearKeywordRules } from '@/content/equipment';
import { infusionRules } from '@/content/sanctums';
import { travellerRules } from '@/content/patrols';
import { gearName, itemById, opportunityById } from '@/content/lookup';
import { serviceRules } from '@/content/services';
import { specials } from '@/content/specials';
import { traitById } from '@/content/traits';
import { weaknessByBoss, type WeaknessEffect } from '@/content/weaknesses';

import { ELEMENTS, beats, incomingMultiplier, shardId, weaponMultiplier, type Element } from '../elements';
import { createRng } from '../generation/rng';
import { mobTags } from '../enemies/tags';
import type { SaveData } from '../save';
import { trinketEffect } from '../loot/trinkets';
import { affixEffects, infusedElement } from '../gear/affixes';
import { familyCountsOf, familyLevels, heroFamilyTagSources, type FamilyLevels, type HeroFamilyTag } from '../families/families';
import { currentHp } from '../team/health';
import { equippedGear, heroAbilities, heroDamageStat, heroStats, gearKeywordsOf, healingPotion, relicEffectsOf, type GearKeywordEntry, type WornRelicEffect } from '../team/team';
import { heroAnswers, type AnswersMember, type HeroAnswers } from '../threats/answers';
import { threatPenalties, type AppliedPenalty, type PenaltyReduction } from '../threats/penalties';
import { scoreBriefing, scoreOpportunity, type ThreatScore } from '../threats/score';
import { partyMeal, penaltyReduction, signatureBriefing, type SignatureBriefing } from '../threats/signatures';
import type {
  Ability,
  BossDef,
  Briefing,
  ConsumableDef,
  DamageStat,
  DungeonDef,
  EncounterDef,
  ExpeditionOutcome,
  GearCondition,
  GearDef,
  HeroClassId,
  Hunger,
  Keyword,
  MaterialStack,
  MealEffect,
  MobDef,
  MobGroup,
  OpportunityOutcome,
  RelicEffect,
  RestrictionId,
  SpecialDef,
  SpecialId,
  Tag,
  ThreatId,
} from '../types';
import { activeHooks, type ActiveHooks, type Attack, type FamilyBase, type Incoming } from './familyEffects';
import { hungerEffect } from './provisions';

export type ExpeditionRules = typeof expeditionRules;

/** A briefing with nothing in it: expeditions launched before briefings existed play this. */
export const EMPTY_BRIEFING: Briefing = { threats: [], restriction: null, opportunity: null };

/** A hero as they set out; stats stay fixed for the whole run. */
export type PartyMember = {
  heroId: string;
  name: string;
  classId: HeroClassId;
  /** Personal trait id; party-wide trait effects count once per trait. */
  traitId: string;
  /** The hero's special (see content/specials.ts), fired on its trigger during the run. */
  special?: SpecialId;
  weaponName: string | null;
  /** The weapon is a ranged one (bow, crossbow, throwing weapons): Volley reads it. */
  ranged?: boolean;
  /** The keywords of the hero's weapon, armour and off-hand; magic pieces marked, strong ones doubled, relic ones behind their condition. */
  gearKeywords: GearKeywordEntry[];
  /** The non-keyword effects of the relics restored into the hero's weapon, armour and off-hand. */
  relicEffects?: WornRelicEffect[];
  /** The values of the affixes on the hero's worn pieces, summed by affix id. */
  affixes?: Record<string, number>;
  /** Any equipped piece is heavy (warhammer, plate). */
  heavy: boolean;
  /** Weapon and off-hand are each empty or Concealed; unarmed heroes with a free off-hand count. */
  concealed: boolean;
  maxHp: number;
  /** HP at the start of the run. */
  hp: number;
  /** The hero's stats; their hits roll with `damageStat` (see team/team.ts). */
  power: number;
  magic: number;
  damageStat: DamageStat;
  armour: number;
  resistance: number;
  /** An amulet's extra Resistance against magic hits of one element. */
  elementResist?: { element: Element; amount: number };
  /** % points: enemy hits are avoided with chance min(Evasion, evasionCap) %. */
  evasion: number;
  speed: number;
  /** % points: the hero's crit chance. */
  crit: number;
  luck: number;
  threat: number;
  /** Elements this hero takes no extra damage from (class resist, protective consumable). */
  resists: Element[];
  /** The hero's family tags, with their source (see heroFamilyTagSources). */
  familyTags: HeroFamilyTag[];
  /** Class abilities and trait effects. */
  abilities: Ability[];
  /** The infused weapon's element, or the class's innate one. */
  weaponElement?: Element;
  /** Potion, elixir or charm. */
  consumable: ConsumableDef | null;
  /** The class's keywords for this hero: a Monk's fists add Pierce. */
  classKeywords?: Keyword[];
  /** The Alchemist's second slot: a healing consumable. */
  potion?: ConsumableDef | null;
};

/**
 * The member's summed affix values of one effect kind. The tagged families
 * (damageVs, damageFrom) count only against a foe that matches a tag, and a
 * warding affix only for a hit of its element.
 */
const affixTotal = (member: PartyMember, kind: AffixEffect['kind'], foe?: { tags?: Tag[]; element?: Element }): number => {
  const tags = foe?.tags;
  const element = foe?.element;
  return Object.entries(member.affixes ?? {}).reduce((sum, [id, value]) => {
    const effect = affixById[id]?.effect;
    if (effect?.kind !== kind) return sum;
    if (tags !== undefined && 'tags' in effect && !effect.tags.some((tag) => tags.includes(tag))) return sum;
    if (element !== undefined && 'element' in effect && effect.element !== element) return sum;
    return sum + value;
  }, 0);
};

/** An ability that changed an encounter, for the log. `heroId` is null for a local's tip. */
export type AbilityEffect = {
  heroId: string | null;
  key:
    | 'tagBonus'
    | 'tip'
    | 'trapReduce'
    | 'rage'
    | 'buff'
    | 'protect'
    | 'partyHeal'
    | 'crit'
    | 'cacheBonus'
    | 'advantage'
    /** The enemies struck first in this fight (an exposed fight). */
    | 'exposed'
    /** Poison wounds after the fight. */
    | 'poison'
    /** Hunter's stew before the boss (`heroId` null). */
    | 'stew'
    /** A weakness item's carrier weakened this boss fight. */
    | 'weakness'
    /** A firebomb carrier opened the run's first fight. */
    | 'firebomb'
    /** A revival draught got a knocked-out carrier back up. */
    | 'revive'
    /** A smoke bomb ended the run in an escape. */
    | 'smokeBomb'
    /** A Necromancer or Beastmaster bound this fight's fallen (`tag`) to the party. */
    | 'raise'
    /** Raised enemies (`tag`) fought for the party in this fight. */
    | 'allies'
    /** A Duelist's crit against a lone enemy. */
    | 'duel'
    /** A Cook's bite to eat after the fight. */
    | 'fightHeal'
    /** A relic answered for this hero in this encounter. */
    | 'relic'
    /** An Alchemist drank the potion in their second slot. */
    | 'secondPotion'
    /** A hero's special fired (`specialId`); once per firing, however often it fires. */
    | 'special'
    /** A family effect fired (`familyEffect`); once per encounter. */
    | 'family';
  tag?: Tag;
  /** The ally a `protect` shielded. */
  allyId?: string;
  /** The relic behind a `relic` note. */
  relicId?: string;
  /** The special behind a `special` note. */
  specialId?: SpecialId;
  /** How many enemies or hits a `special` note covered. */
  count?: number;
  /** A Double or nothing that missed. */
  missed?: boolean;
  /** The family effect behind a `family` note. */
  familyEffect?: FamilyEffectId;
};

export type EncounterResult = {
  kind: 'fight' | 'boss' | 'trap' | 'quiet' | 'mishap';
  /** Trap, NPC, event or boss name. */
  name: string;
  /** The enemies of a fight. */
  mobs: MobGroup[];
  cleared: boolean;
  rounds: number;
  dealt: Record<string, number>;
  taken: Record<string, number>;
  healed: Record<string, number>;
  /** Heroes who drank a potion or ate a ration here. */
  consumed: string[];
  knockedOut: string[];
  /** A live trap went off (a met threat's trap never catches anyone). */
  trapTriggered: boolean;
  gold: number;
  effects: AbilityEffect[];
};

/** The briefing's opportunity at the run's midpoint, and what it gave. */
export type RunOpportunity = OpportunityOutcome;

export type RunResult = {
  encounters: EncounterResult[];
  encounterCount: number;
  encountersCleared: number;
  bossDefeated: boolean;
  outcome: ExpeditionOutcome;
  bonusGold: number;
  hp: { heroId: string; hp: number; maxHp: number }[];
  /** Heroes whose healing consumable (potion) was used up during the run. */
  consumed: string[];
  /** Heroes who attacked at least once (a crit charm that never did is salvaged). */
  attacked: string[];
  /** Heroes whose elixir (bomb, draught) triggered during the run; stat, speed and oil elixirs always count as used. */
  elixirsUsed: string[];
  /** The hero whose weakness item weakened the boss fight, if one did. */
  weaknessUsedBy: string | null;
  /** The run ended in a smoke bomb escape, with nobody knocked out. */
  escaped?: boolean;
  /** The briefing's threats scored against this party. */
  threats: ThreatScore[];
  /** The midpoint opportunity and what it gave, or null when there was none. */
  opportunity: RunOpportunity | null;
  /** The briefing as the party's signatures left it. */
  signed: SignatureBriefing;
  /** Alchemists who drank the potion in their second slot. */
  potionsDrunk: string[];
  /** The meal the party got: none under Spoiled stores, more with a Cook. */
  meal: MealEffect | null;
  /** Extra rolls of the main loot row a won run pays (a special's bonus). */
  extraLootRolls: number;
  /** Materials the family effects found in won fights (monster parts). */
  familyMaterials: MaterialStack[];
  /** The party's family levels the run played with. */
  families: FamilyLevels;
};

/** What the party ate and signed up for: the same for the odds preview and the real run. */
export type RunProvisions = {
  hunger?: Hunger;
  /** The meal taken; the run decides what it does (Spoiled stores, a Cook). */
  meal?: MealEffect | null;
  /** The dungeon's briefing: what the run plays against. Empty when left out. */
  briefing?: Briefing | null;
  /** The party opted into the briefing's opportunity cost. */
  optIn?: boolean;
};

export type RunOptions = RunProvisions & {
  rules?: ExpeditionRules;
  /** The tutorial run: heroes can't drop below 1 HP, so the boss always falls eventually. */
  guaranteed?: boolean;
  /** Hero consumable elixirs take effect; Sanctum fights, which keep the slot, leave them out. */
  elixirs?: boolean;
  /** A chapel's blessing: the party hits harder (see serviceRules.chapel). */
  blessed?: boolean;
};

export type HeroState = {
  member: PartyMember;
  hp: number;
  out: boolean;
  consumableLeft: boolean;
  /** The Alchemist's second potion, still to use. */
  potionLeft: boolean;
  /** Damage multiplier from the supply status. */
  fed: number;
  /** The hero's keywords after the restriction, whatever their source. */
  keywords: Set<Keyword>;
  /** The hero's strong keywords the restriction left standing (see gearKeywordsOf). */
  strong: Set<Keyword>;
  /** The weakened-penalty damage factor, in the run's first fight and after it (a relic ignores them early on). */
  weakenedFirst: number;
  weakenedRest: number;
};
/** `maxHp` is the def's HP after a weakness cut; thresholds like enrage use it. */
/** `armour` is the share of the enemy's armour still standing (a shred lowers it for the fight). */
export type EnemyState = { def: MobDef | BossDef; hp: number; maxHp: number; staggered: boolean; armour: number };

/** A party member as `heroAnswers` sees them: their family tags. */
export function answersMemberOf(member: PartyMember): AnswersMember {
  return {
    heroId: member.heroId,
    classId: member.classId,
    traitId: member.traitId,
    familyTags: member.familyTags,
  };
}

/**
 * The heroes as they set out, with their HP at `now` (heroes away keep the HP
 * they left with; left out, HP as stored).
 */
export function prepareParty(save: SaveData, heroIds: string[], now = 0, elixirs = false): PartyMember[] {
  const heroes = save.heroes.filter((hero) => heroIds.includes(hero.id));
  return heroes
    .map((hero) => {
      const heroClass = heroClasses[hero.classId];
      const stats = heroStats(save, hero);
      const weapon = save.gear.find((g) => g.uid === hero.equipment.weapon);
      const armour = save.gear.find((g) => g.uid === hero.equipment.armor);
      const helmet = save.gear.find((g) => g.uid === hero.equipment.helmet);
      const offhand = save.gear.find((g) => g.uid === hero.equipment.offhand);
      const weaponItem = weapon ? (itemById[weapon.itemId] as GearDef) : null;
      const offhandItem = offhand ? (itemById[offhand.itemId] as GearDef) : null;
      const trinket = save.gear.find((g) => g.uid === hero.equipment.trinket);
      const elementResist = trinket ? trinketEffect(itemById[trinket.itemId] as GearDef, trinket).elementResist : undefined;
      // Heavy and Concealed read the equipped pieces; no pieces count as concealed.
      const pieces = [weaponItem, armour ? (itemById[armour.itemId] as GearDef) : null, helmet ? (itemById[helmet.itemId] as GearDef) : null, offhandItem].flatMap(
        (item) => (item ? [item] : []),
      );
      const item = hero.equipment.consumable ? itemById[hero.equipment.consumable] : null;
      const consumable = item?.slot === 'consumable' ? item : null;
      // A Monk's fists (no weapon, or knuckles) pierce armour.
      const fists = heroClass.abilities.some((a) => a.kind === 'fistsPierce') && (!weaponItem || weaponItem.gearType === 'knuckles');
      const relicEffects = relicEffectsOf(save, hero);
      // The hero's hits roll with their damage stat; only the Magic part is halved in an anti-magic zone.
      const damageStat = heroDamageStat(save, hero);
      const elixir = elixirs ? consumable?.elixir : undefined;
      // A stat elixir multiplies its stat, rounded like heroStats; an oil infuses the weapon.
      const statOf = (key: 'power' | 'magic' | 'armour' | 'resistance') =>
        elixir?.kind === 'stat' && elixir.stat === key ? Math.round(stats[key] * elixir.multiplier) : stats[key];
      return {
        heroId: hero.id,
        name: hero.name,
        classId: hero.classId,
        traitId: hero.trait,
        special: hero.special,
        weaponName: weapon ? gearName(weapon) : null,
        ranged: !!weaponItem?.gearType && familyEffectRules.volley.gearTypes.includes(weaponItem.gearType),
        gearKeywords: gearKeywordsOf(save, hero),
        relicEffects,
        affixes: affixEffects(equippedGear(save, hero)),
        heavy: pieces.some((item) => item.heavy),
        concealed: [weaponItem, offhandItem].every((item) => !item || item.concealed),
        maxHp: stats.hp,
        hp: currentHp(save, hero, now),
        power: statOf('power'),
        magic: statOf('magic'),
        damageStat,
        armour: statOf('armour'),
        resistance: statOf('resistance'),
        ...(elementResist ? { elementResist } : {}),
        evasion: stats.evasion,
        speed: stats.speed + (elixir?.kind === 'speed' ? elixir.add : 0),
        crit: stats.crit + (elixir?.kind === 'crit' ? elixir.add : 0),
        luck: stats.luck,
        threat: heroClass.threat,
        resists: [
          ...(heroClass.resists ?? []),
          ...(relicEffects.filter((e) => e.effect.kind === 'immune').map((e) => (e.effect as Extract<RelicEffect, { kind: 'immune' }>).element)),
        ],
        familyTags: heroFamilyTagSources(save, hero),
        abilities: [
          ...heroAbilities(hero),
        ],
        weaponElement:
          elixir?.kind === 'oil' && weapon
            ? elixir.element
            : (infusedElement(weapon) ?? infusedElement(offhand) ?? heroClass.element),
        consumable,
        classKeywords: fists ? [...new Set([...heroClass.keywords, 'pierce' as const])] : heroClass.keywords,
        potion: heroClass.abilities.some((a) => a.kind === 'potionSlot') && hero.equipment.potion ? healingPotion(hero.equipment.potion) : null,
      };
    });
}

/** The party after the meal they ate: max HP, speed and resistance last the run. */
export function mealParty(party: PartyMember[], meal: MealEffect | null | undefined): PartyMember[] {
  return party.map((member) => {
    if (meal?.kind === 'maxHp') {
      const maxHp = Math.round(member.maxHp * meal.multiplier);
      return { ...member, maxHp, hp: Math.min(maxHp, Math.round(member.hp * meal.multiplier)) };
    }
    if (meal?.kind === 'speed') return { ...member, speed: member.speed + meal.add };
    if (meal?.kind === 'crit') return { ...member, crit: member.crit + meal.add };
    if (meal?.kind === 'resistance') return { ...member, resistance: Math.round(member.resistance * meal.multiplier) };
    return member;
  });
}

/**
 * The hero's combat keywords after the restriction, whatever their source:
 * class, trait or gear. Anti-magic drops the magic sources.
 */
function combatKeywords(member: PartyMember, restriction: RestrictionId | null): Set<Keyword> {
  const caster = heroClasses[member.classId].damageStat === 'magic';
  const kept = (source: 'class' | 'trait' | 'gear', magic: boolean, keyword: Keyword) => {
    if (restriction === 'antiMagic' && magic) return false;
    return true;
  };
  const set = new Set<Keyword>();
  const add = (keyword: Keyword, source: 'class' | 'trait' | 'gear', magic = false) => {
    if (kept(source, magic, keyword)) set.add(keyword);
  };
  for (const keyword of member.classKeywords ?? heroClasses[member.classId].keywords) add(keyword, 'class', caster);
  for (const effect of traitById[member.traitId]?.effects ?? []) if (effect.kind === 'keyword') add(effect.keyword, 'trait');
  for (const entry of member.gearKeywords) if (!entry.when) add(entry.keyword, 'gear', entry.magic);
  return set;
}

function emptyResult(kind: EncounterResult['kind'], name: string, mobs: MobGroup[] = []): EncounterResult {
  return {
    kind,
    name,
    mobs,
    cleared: false,
    rounds: 0,
    dealt: {},
    taken: {},
    healed: {},
    consumed: [],
    knockedOut: [],
    trapTriggered: false,
    gold: 0,
    effects: [],
  };
}

const add = (map: Record<string, number>, key: string, amount: number) => {
  map[key] = (map[key] ?? 0) + amount;
};

/** The penalties of one kind, narrowed from the applied list. */
type PenaltyOfKind<K extends AppliedPenalty['kind']> = Extract<AppliedPenalty, { kind: K }>;

/**
 * Everything a run reads that no rng draw touches: the party's signatures, the
 * answers, the briefing's penalties and the heroes as they set out. One
 * preparation serves any number of runs of the same party, dungeon and options.
 */
export type PreparedSimulation = {
  rules: ExpeditionRules;
  guaranteed: boolean;
  optIn: boolean;
  elixirs: boolean;
  blessed: boolean;
  dungeon: DungeonDef;
  signed: SignatureBriefing;
  activeBriefing: Briefing;
  restriction: Briefing['restriction'];
  meal: MealEffect | null;
  answers: HeroAnswers[];
  scores: ReturnType<typeof scoreBriefing>;
  /** The heroes as they set out; each run takes its own copy. */
  heroStart: HeroState[];
  weakenedAgainst: number;
  beastDamage: number;
  undeadHp: number;
  exposedPenalties: PenaltyOfKind<'exposed'>[];
  poisonWounds: PenaltyOfKind<'fightWounds'>[];
  trapWounds: number;
  elementThreat: Briefing['threats'][number] | null;
  elementalDamage: number;
  /** The Element penalty in the run's first fight, ignored by a relic (the Drowned bell). */
  elementalDamageFirst: number;
  magicFactor: number;
  partyHealFactor: number;
  healing: number;
  /** The party's family levels, from the tags the restriction leaves standing (as the threats see them). */
  families: FamilyLevels;
  hooks: ActiveHooks;
};

/**
 * Prepares a party's run of a dungeon: everything the outcome reads that no rng
 * draw touches, so the odds preview can compute it once for all its runs.
 */
export function prepareSimulation(
  party: PartyMember[],
  dungeon: DungeonDef,
  { rules = expeditionRules, guaranteed = false, hunger = 'fed', meal: eaten = null, briefing = null, optIn = false, elixirs = false, blessed = false }: RunOptions = {},
): PreparedSimulation {
  // The party's signatures first: a cancelled restriction, a lowered threat, a Cook's meal.
  const classIds = party.map((member) => member.classId);
  const signed = signatureBriefing(briefing ?? EMPTY_BRIEFING, party.map(answersMemberOf));
  const activeBriefing: Briefing = signed.briefing;
  const restriction = activeBriefing.restriction;
  const meal = partyMeal(eaten, activeBriefing, classIds);
  // The briefing against this party: what was met, and what it costs.
  const members = mealParty(party, meal);
  const answers: HeroAnswers[] = members.map((member) => heroAnswers(answersMemberOf(member)));
  const scores = scoreBriefing(activeBriefing, answers);
  // The chowder multiplies the penalties of the threats it lists.
  const reduction: PenaltyReduction = penaltyReduction(classIds);
  const threatCuts: Partial<Record<ThreatId, number>> =
    meal?.kind === 'penaltyCut' ? Object.fromEntries(meal.threats.map((id) => [id, meal.multiplier])) : {};
  const withCuts: PenaltyReduction = Object.keys(threatCuts).length > 0 ? { threats: threatCuts } : {};
  const reduce: PenaltyReduction = {
    ...withCuts,
    threats: { ...reduction.threats, ...withCuts.threats },
  };
  // A restored relic cancels a threat's penalties for the whole party (the Smuggler's coat: no trap wounds).
  const cancelled = new Set(
    party.flatMap((m) => (m.relicEffects ?? []).flatMap((e) => (e.effect.kind === 'cancelPenalty' ? [e.effect.threat] : []))),
  );
  const penalties: AppliedPenalty[] = scores.threats
    .flatMap((score) => threatPenalties(score, undefined, reduce))
    .filter((p) => !cancelled.has(p.threatId));
  const ofKind = <K extends AppliedPenalty['kind']>(kind: K) =>
    penalties.filter((p): p is Extract<AppliedPenalty, { kind: K }> => p.kind === kind);
  const weakenedAgainst = ofKind('weakenedAgainst').reduce((m, p) => m * (1 - p.pct), 1);
  // A relic's condition, as it holds while the run's first fight is still ahead.
  const holdsFirst = (when: GearCondition) => {
    if ('firstFight' in when) return true;
    if ('threat' in when) return activeBriefing.threats.some((t) => t.id === when.threat);
    return false;
  };
  /** A relic ignores a threat's weakened penalty in the run's first fight (the Drowned bell). */
  const weakenedOf = (member: PartyMember, firstFight: boolean) =>
    Math.max(
      0,
      ofKind('weakened').reduce(
        (m, p) =>
          firstFight &&
          party.some((m2) =>
            (m2.relicEffects ?? []).some(
              (e): e is WornRelicEffect & { effect: Extract<RelicEffect, { kind: 'ignorePenalty' }> } =>
                e.effect.kind === 'ignorePenalty' && e.effect.threat === p.threatId && holdsFirst(e.effect.when),
            ),
          )
            ? m
            : m * (1 - p.pct),
        1,
      ),
    );
  const heroStart: HeroState[] = members.map((member) => {
    const { damage, hpLoss } = hungerEffect(hunger, member.abilities);
    // Starving costs HP before the first step, but never knocks anyone out.
    const hp = Math.min(member.maxHp, member.hp > 0 ? Math.max(Math.min(member.hp, 1), member.hp - hpLoss * member.maxHp) : 0);
    const keywords = combatKeywords(member, restriction);
    return {
      member,
      hp,
      // A hero with no HP to start with can't act at all.
      out: hp <= 0,
      consumableLeft: member.consumable !== null,
      potionLeft: !!member.potion,
      fed: damage,
      keywords,
      // A relic's own keyword doubles only while its condition holds, so conditional entries wait for isStrong.
      strong: new Set(member.gearKeywords.filter((k) => k.strong && !k.when && keywords.has(k.keyword)).map((k) => k.keyword)),
      // The weakened penalties, once for the run's first fight and once for the rest of it.
      weakenedFirst: weakenedOf(member, true),
      weakenedRest: weakenedOf(member, false),
    };
  });
  const beastDamage = ofKind('enemyDamage').reduce((m, p) => m * (1 + p.pct), 1);
  const undeadHp = ofKind('enemyHp').reduce((m, p) => m * (1 + p.pct), 1);
  const exposedPenalties = ofKind('exposed');
  const poisonWounds = ofKind('fightWounds');
  const trapWounds = ofKind('trapWounds')[0]?.pct ?? 0;
  const elementThreat = activeBriefing.threats.find((t) => t.id === 'element' && t.element) ?? null;
  const elementalDamage = ofKind('elementalDamage')[0]?.multiplier ?? 1;
  const elementalDamageFirst = party.some((m) =>
    (m.relicEffects ?? []).some((e) => e.effect.kind === 'ignorePenalty' && e.effect.threat === 'element' && holdsFirst(e.effect.when)),
  )
    ? 1
    : elementalDamage;
  const magicFactor = restriction === 'antiMagic' ? restrictionRules.antiMagic : 1;
  const partyHealFactor = restriction === 'antiMagic' ? restrictionRules.antiMagic : 1;
  const healing = restriction === 'noHealing' ? restrictionRules.noHealing : 1;
  const families = familyLevels(familyCountsOf(answers.flatMap((a) => a.tags)));
  return {
    rules,
    guaranteed,
    optIn,
    elixirs,
    blessed,
    dungeon,
    signed,
    activeBriefing,
    restriction,
    meal,
    answers,
    scores,
    heroStart,
    weakenedAgainst,
    beastDamage,
    undeadHp,
    exposedPenalties,
    poisonWounds,
    trapWounds,
    elementThreat,
    elementalDamage,
    elementalDamageFirst,
    magicFactor,
    partyHealFactor,
    healing,
    families,
    hooks: activeHooks(families),
  };
}

/**
 * Plays one prepared run: the seed's first draw is the day's fortune, then the
 * encounters are drawn and fought round by round, to the boss or the party's
 * knock-out.
 */
export function runPrepared(prepared: PreparedSimulation, seed: string): RunResult {
  const {
    rules,
    guaranteed,
    optIn,
    elixirs,
    blessed,
    dungeon,
    signed,
    activeBriefing,
    restriction,
    meal,
    answers,
    scores,
    heroStart,
    weakenedAgainst,
    beastDamage,
    undeadHp,
    exposedPenalties,
    poisonWounds,
    trapWounds,
    elementThreat,
    elementalDamage,
    elementalDamageFirst,
    magicFactor,
    partyHealFactor,
    healing,
    families,
    hooks,
  } = prepared;
  const rng = createRng(seed);
  // Specials draw from their own stream, so a special changes only what it does, not every later roll.
  const specialRng = createRng(`${seed}|specials`);
  // How the day goes for the whole party: a good day hits harder and gets hurt less.
  // Unlike per-hit variance this doesn't average out, so weaker teams keep a real chance.
  const fortune = 1 + (rng.next() * 2 - 1) * rules.fortune;
  // Every run fights with its own heroes: HP and consumables change with the run,
  // while the keyword sets are only ever read.
  const heroes: HeroState[] = heroStart.map((hero) => ({ ...hero }));
  const alive = () => heroes.filter((h) => !h.out);

  /** The first conscious hero with an ability of this kind that passes `test`. */
  const withAbility = <K extends Ability['kind']>(kind: K, test: (ability: Extract<Ability, { kind: K }>) => boolean = () => true) => {
    for (const hero of alive()) {
      const ability = hero.member.abilities.find(
        (a): a is Extract<Ability, { kind: K }> => a.kind === kind && test(a as Extract<Ability, { kind: K }>),
      );
      if (ability) return { hero, ability };
    }
    return null;
  };
  /** A hero's own ability of this kind (not the party's). */
  const own = <K extends Ability['kind']>(hero: HeroState, kind: K) =>
    hero.member.abilities.find((a): a is Extract<Ability, { kind: K }> => a.kind === kind);
  const enemyElement = (def: MobDef | BossDef): Element | undefined => elementThreat?.element ?? def.element;
  const enemyTags = (def: MobDef | BossDef): Tag[] => {
    const element = enemyElement(def);
    return element ? [...def.tags, element] : mobTags(def);
  };

  /** A relic's condition, checked where it applies: the foe's tags, the run's first fight, or the briefing. */
  const holds = (when: GearCondition, tags?: Tag[]) => {
    if ('firstFight' in when) return fightsSeen === 0;
    if ('threat' in when) return activeBriefing.threats.some((t) => t.id === when.threat);
    return tags !== undefined && tags.includes(when.tag);
  };
  /** A conditional gear keyword that holds here; a magic piece's falls in an anti-magic zone. */
  const holdsKeyword = (entry: GearKeywordEntry, tags?: Tag[]) =>
    !!entry.when && !(restriction === 'antiMagic' && entry.magic) && holds(entry.when, tags);
  /** The keyword the hero has here, plain, strong from gear, or held by a relic's condition. */
  const has = (hero: HeroState, keyword: Keyword, tags?: Tag[]) => {
    if (hero.keywords.has(keyword)) return true;
    for (const entry of hero.member.gearKeywords) {
      if (entry.keyword === keyword && holdsKeyword(entry, tags)) return true;
    }
    return false;
  };
  const isStrong = (hero: HeroState, keyword: Keyword, tags?: Tag[]) => {
    if (hero.strong.has(keyword)) return true;
    for (const entry of hero.member.gearKeywords) {
      if (entry.keyword === keyword && entry.strong && holdsKeyword(entry, tags)) return true;
    }
    return false;
  };
  /** The hero's relic effects of this kind whose condition holds here. */
  const relicEffect = <K extends RelicEffect['kind']>(hero: HeroState, kind: K, tags?: Tag[]) =>
    (hero.member.relicEffects ?? []).find(
      (e): e is WornRelicEffect & { effect: Extract<RelicEffect, { kind: K }> } => {
        if (e.effect.kind !== kind) return false;
        const when = 'when' in e.effect ? e.effect.when : undefined;
        return when ? holds(when, tags) : true;
      },
    );

  /** ±variance, sometimes a crit; cursed luck means there are no crits. */
  const roll = (value: number, critChance = rules.enemyCritChance, onCrit?: () => void, critMultiplier = rules.critMultiplier) => {
    const varied = value * (1 + (rng.next() * 2 - 1) * rules.damageVariance);
    if (restriction === 'cursedLuck' || !rng.chance(critChance)) return varied;
    onCrit?.();
    return varied * critMultiplier;
  };
  const elementFactor = (hero: HeroState, attack?: Element) => incomingMultiplier(attack, { resists: hero.member.resists });

  /** Heroes whose elixir (bomb, draught) triggered, for salvage. */
  const elixirsUsed: string[] = [];
  /** The hero whose weakness item weakened the boss fight, if one did. */
  let weaknessUsedBy: string | null = null;
  /** The run's first fight is where a firebomb lands; later fights see none. */
  let firebombThrown = false;
  /** A smoke bomb ended the run: no knock-out, the party slipped away. */
  let escaped = false;
  const potionsDrunk: string[] = [];
  /** A Monk's own damage ignores some restrictions. */
  const ignores = (hero: HeroState, id: RestrictionId) => own(hero, 'ignoresRestrictions')?.restrictions.includes(id) ?? false;
  /** Raised enemies who fight for the party in the next fight, and the threats whose fallen were already raised. */
  let raised: { def: MobDef | BossDef; damage: number; heroId: string; tag: Tag }[] = [];
  const raisedFor = new Set<string>();
  /** A relic effect at work: one note per encounter and hero. */
  const noteRelic = (result: EncounterResult, heroId: string, relicId: string) => {
    if (!result.effects.some((e) => e.key === 'relic' && e.heroId === heroId)) result.effects.push({ heroId, key: 'relic', relicId });
  };
  /** Heroes whose first spell already struck every enemy of the run's first fight. */
  const firstSpellUsed = new Set<string>();
  /** Heroes whose once-per-expedition special already fired. */
  const specialRunSpent = new Set<string>();
  /** Heroes whose next hit is a sure crit (Aimed strike). */
  const sureCrits = new Set<string>();
  /** A hero's next attack, multiplied (Focus). */
  const nextAttackMultiplier = new Map<string, number>();
  /** Extra rolls of the main loot row a won run pays (Steal, Cunning 3). */
  let extraLootRolls = 0;
  const familyMaterials: MaterialStack[] = [];
  /** The hero's special, when they have one. */
  const specialOf = (hero: HeroState) => (hero.member.special ? specials[hero.member.special] : undefined);
  /** Fires the specials triggered by damage or a knock-out; set while a fight runs. */
  let damageTriggers: ((hero: HeroState, knockedOut: boolean) => void) | null = null;
  /** The Bulwark shields of the running fight, so hurt() can spend them; null between fights. */
  let fightShields: Map<string, number> | null = null;
  /** Heroes whose Unyielding save already fired this run. */
  const lastStands = new Set<string>();
  /** The family effects' once-only flags: the running fight's, and the run's. */
  let fightOnce = new Set<string>();
  const runOnce = new Set<string>();
  /** The family hooks' shared tools, logging into `result`. */
  const familyBase = (result: EncounterResult): FamilyBase => ({
    once: (key, scope = 'fight') => {
      const used = scope === 'run' ? runOnce : fightOnce;
      if (used.has(key)) return false;
      used.add(key);
      return true;
    },
    log: (effect, heroId, allyId) => {
      if (result.effects.some((e) => e.key === 'family' && e.familyEffect === effect)) return;
      result.effects.push({ heroId, key: 'family', familyEffect: effect, ...(allyId ? { allyId } : {}) });
    },
    heroOf: (family) => alive().find((h) => h.member.familyTags.some((t) => t.family === family)) ?? alive()[0],
    alive,
    chance: (p) => p >= 1 || rng.chance(p),
    pick: (items) => items[rng.int(0, items.length - 1)],
    heal: (hero, share) => {
      const before = hero.hp;
      heal(hero, share, result);
      return hero.hp - before;
    },
  });

  /** Uses each hero's special has left in the run once its own are spent. */
  const bonusUses = new Map<string, number>();
  if (hooks.runStart.length > 0) {
    const start = { specialUses: 0 };
    for (const hook of hooks.runStart) hook(start);
    for (const hero of heroes) if (start.specialUses > 0) bonusUses.set(hero.member.heroId, start.specialUses);
  }

  const heal = (hero: HeroState, share: number, result: EncounterResult) => {
    const amount = Math.min(hero.member.maxHp - hero.hp, share * hero.member.maxHp * healing);
    hero.hp += amount;
    add(result.healed, hero.member.heroId, amount);
  };

  /** A Potion affinity multiplies the healing consumables used on the hero. */
  const potionFactor = (hero: HeroState) => 1 + affixTotal(hero.member, 'potionHealing') / 100;

  const hurt = (hero: HeroState, raw: number, result: EncounterResult) => {
    // The fight's Bulwark shield soaks damage before it lands.
    const shield = fightShields?.get(hero.member.heroId) ?? 0;
    if (shield > 0) fightShields!.set(hero.member.heroId, Math.max(0, shield - raw));
    const amount = Math.max(0, raw - shield) * (own(hero, 'damageTaken')?.multiplier ?? 1);
    hero.hp -= amount;
    add(result.taken, hero.member.heroId, amount);
    if (hero.hp <= 0) {
      let revive: number | null = null;
      if (!guaranteed && hooks.knockout.length > 0) {
        const knockout = { ...familyBase(result), hero, revive };
        for (const hook of hooks.knockout) hook(knockout);
        revive = knockout.revive;
      }
      if (guaranteed) {
        hero.hp = 1;
      } else if (revive !== null) {
        // A family revival gets the hero back up before any draught; the run still counts them as knocked out.
        hero.hp = Math.max(1, Math.round(revive * hero.member.maxHp));
        result.knockedOut.push(hero.member.heroId);
      } else {
        const elixir = hero.member.consumable?.elixir;
        // A revival draught gets the carrier back up once; the run still counts them as knocked out.
        if (elixirs && elixir?.kind === 'revive' && hero.consumableLeft) {
          hero.hp = Math.max(1, Math.round(elixir.hp * hero.member.maxHp));
          hero.consumableLeft = false;
          elixirsUsed.push(hero.member.heroId);
          result.effects.push({ heroId: hero.member.heroId, key: 'revive' });
          result.knockedOut.push(hero.member.heroId);
        } else {
          // Unyielding may hold the hero at 1 HP at their first would-be fall of the expedition.
          const lastStand = affixTotal(hero.member, 'lastStand');
          const firstFall = lastStand > 0 && !lastStands.has(hero.member.heroId);
          if (firstFall) lastStands.add(hero.member.heroId);
          if (firstFall && rng.chance(lastStand / 100)) {
            hero.hp = 1;
          } else {
            // A conscious holder's smoke bomb leaves the hero at 1 HP and ends the run in an escape.
            const bomber = elixirs
              ? alive().find((h) => h.consumableLeft && h.member.consumable?.elixir?.kind === 'smokeBomb')
              : undefined;
            if (bomber) {
              hero.hp = 1;
              bomber.consumableLeft = false;
              elixirsUsed.push(bomber.member.heroId);
              escaped = true;
              result.effects.push({ heroId: bomber.member.heroId, key: 'smokeBomb' });
            } else {
              hero.hp = 0;
              hero.out = true;
              result.knockedOut.push(hero.member.heroId);
              // A fall wakes the specials that answer one (Resurrection).
              damageTriggers?.(hero, true);
              return;
            }
          }
        }
      }
    }
    const potion = hero.member.consumable;
    const threshold = rules.potionThreshold + (own(hero, 'potionThreshold')?.add ?? 0);
    const low = () => hero.hp < threshold * hero.member.maxHp;
    const healShare = potion?.when === 'lowHp' ? potion.heal : undefined;
    if (hero.consumableLeft && healShare !== undefined && low()) {
      hero.consumableLeft = false;
      heal(hero, healShare * potionFactor(hero), result);
      result.consumed.push(hero.member.heroId);
    }
    // The Alchemist's second potion, once the first is gone or isn't one.
    if (hero.potionLeft && low()) {
      hero.potionLeft = false;
      heal(hero, hero.member.potion!.heal! * potionFactor(hero), result);
      potionsDrunk.push(hero.member.heroId);
      result.effects.push({ heroId: hero.member.heroId, key: 'secondPotion' });
    }
    // The specials that watch for damage fire after everything else is settled.
    damageTriggers?.(hero, false);
  };

  /** The Forgotten shrine's multiplier, set at the midpoint. */
  let shrine = 1;
  /** A chapel's blessing lifts every hit for the whole run. */
  const blessing = blessed ? 1 + serviceRules.chapel.blessingDamage : 1;
  /** Heroes who attacked at least once. */
  const attacked = new Set<string>();

  const fight = (
    enemyDefs: (MobDef | BossDef)[],
    result: EncounterResult,
    enemiesFirst: boolean,
    isBoss = false,
    weakness?: WeaknessEffect,
    allies: typeof raised = [],
  ) => {
    const enemies: EnemyState[] = enemyDefs.map((def) => {
      // A weakness item cuts the boss's max HP up front.
      const maxHp = def.hp * (isBoss && weakness?.hpCut ? 1 - weakness.hpCut : 1);
      // The dead walk here: undead are harder to put down.
      return { def, hp: maxHp * (enemyTags(def).includes('undead') ? undeadHp : 1), maxHp, staggered: false, armour: 1 };
    });
    if (escaped) return;
    fightOnce = new Set();
    const family = familyBase(result);
    /** The enemies strike first in round 1; a family effect may turn the ambush. */
    let ambush = enemiesFirst;
    if (hooks.fightStart.length > 0) {
      const ctx = {
        ...family,
        enemies,
        isBoss,
        ambush,
        strikeDown: (hero: HeroState, enemy: EnemyState) => {
          add(result.dealt, hero.member.heroId, Math.max(0, enemy.hp));
          enemy.hp = 0;
        },
        strike: (hero: HeroState, enemy: EnemyState, amount: number) => {
          const dealt = Math.min(Math.max(0, enemy.hp), amount);
          add(result.dealt, hero.member.heroId, dealt);
          enemy.hp -= dealt;
        },
      };
      for (const hook of hooks.fightStart) hook(ctx);
      ambush = ctx.ambush;
    }
    if (ambush) result.effects.push({ heroId: null, key: 'exposed' });
    // The run's first fight opens with every conscious carrier's firebomb.
    if (elixirs && !firebombThrown) {
      firebombThrown = true;
      for (const hero of alive()) {
        const elixir = hero.member.consumable?.elixir;
        if (elixir?.kind !== 'firebomb' || !hero.consumableLeft) continue;
        hero.consumableLeft = false;
        elixirsUsed.push(hero.member.heroId);
        result.effects.push({ heroId: hero.member.heroId, key: 'firebomb' });
        for (const enemy of enemies) {
          const damage = Math.round(elixir.damage * TIER_SCALE[dungeon.tier - 1] * weaponMultiplier('fire', enemyElement(enemy.def)));
          enemy.hp -= damage;
          add(result.dealt, hero.member.heroId, damage);
        }
      }
    }
    /** How many big hits each hero's Brace has softened in this fight. */
    const braced = new Map<string, number>();
    /** Logs an effect once per encounter and hero. */
    const note = (heroId: string | null, key: AbilityEffect['key'], extra: Partial<AbilityEffect> = {}) => {
      if (!result.effects.some((e) => e.key === key && e.heroId === heroId)) result.effects.push({ heroId, key, ...extra });
    };
    /** The tags of every enemy of this fight, for the relic conditions that hold against any of them. */
    const anyTags = [...new Set(enemies.flatMap((e) => enemyTags(e.def)))];
    /** This fight's special-ability state: uses spent, and the effects that last. */
    const ctx: {
      spent: Set<string>;
      /** The heroes who already took a hit in this fight. */
      hitsTaken: Set<string>;
      /** The Riposte counters left, by hero. */
      counters: Map<string, { hits: number; share: number }>;
      /** Rounds of Vanish left, by hero. */
      dodges: Map<string, number>;
      /** The hits left that a Mana shield or Ward absorbs, by hero. */
      absorbs: Map<string, number>;
      taunt: { heroId: string; rounds: number; damageTaken: number } | null;
      shield: { rounds: number } | null;
      hot: { pct: number; rounds: number } | null;
      party: { multiplier: number; rounds: number } | null;
      dots: { heroId: string; enemy: EnemyState; damage: number; rounds: number; source?: 'venomous' }[];
      summons: { heroId: string; damage: number; rounds: number | null }[];
      /** Whether the boss's first turn already fired its specials. */
      bossTurn: boolean;
    } = {
      spent: new Set(),
      hitsTaken: new Set(),
      counters: new Map(),
      dodges: new Map(),
      absorbs: new Map(),
      taunt: null,
      shield: null,
      hot: null,
      party: null,
      dots: [],
      summons: [],
      bossTurn: false,
    };
    // A Bulwark affix shields its wearer for this fight, and only for this fight.
    fightShields = new Map(
      alive()
        .map((hero) => [hero.member.heroId, (affixTotal(hero.member, 'fightShield') / 100) * hero.member.maxHp] as [string, number])
        .filter(([, shield]) => shield > 0),
    );
    const living = () => enemies.filter((e) => e.hp > 0);
    /** A summon joining the party's side, after the family effects that scale it. */
    const summoned = (hero: HeroState, damage: number, rounds: number | null) => {
      if (hooks.summon.length === 0) return { damage, rounds };
      const joining = { ...family, hero, damage, rounds };
      for (const hook of hooks.summon) hook(joining);
      return { damage: joining.damage, rounds: joining.rounds };
    };
    const bossOf = () => (isBoss ? enemies[0] : enemies.find((e) => 'effect' in e.def));
    const strongest = (foes: EnemyState[]) => foes.reduce((best, e) => (e.def.damage > best.def.damage ? e : best));
    const isElite = (enemy: EnemyState) => isBoss || 'effect' in enemy.def || enemy.def.id.includes(':elite');
    /** Each conscious hero's speed this round, after the family effects. */
    let roundSpeed = new Map<HeroState, number>();
    /** Whether the hero's special still has its use, this fight or this run. */
    const ownUseLeft = (hero: HeroState, def: SpecialDef) =>
      def.uses === 'betweenFights' ||
      (def.uses === 'perFight' ? !ctx.spent.has(hero.member.heroId) : !specialRunSpent.has(hero.member.heroId));
    const hasUseLeft = (hero: HeroState, def: SpecialDef) => ownUseLeft(hero, def) || (bonusUses.get(hero.member.heroId) ?? 0) > 0;
    /**
     * A normal hit of `hero` on `target`: the hero's own attack maths (fortune,
     * buffs, blessing, wheel, armour, fed, weakened, crits), with the overrides a
     * special needs — a crit chance, a multiplier, or the whole hit through the
     * elemental wheel.
     */
    const normalHit = (
      hero: HeroState,
      target: EnemyState,
      {
        critChance,
        multiplier = 1,
        elemental = false,
        main = false,
      }: { critChance?: number; multiplier?: number; elemental?: boolean; main?: boolean } = {},
    ) => {
      const id = hero.member.heroId;
      const tags = enemyTags(target.def);
      const pierce = has(hero, 'pierce', tags);
      // The target's natural armour, and the armour a missed Armoured threat lends every enemy.
      const armour = 1 - (1 - (target.def.armour ?? 0)) * weakenedAgainst;
      const element = hero.member.weaponElement;
      const targetElement = enemyElement(target.def);
      let attack: Attack | undefined;
      if (hooks.beforeAttack.length > 0) {
        attack = {
          ...family,
          hero,
          target,
          tags,
          elite: isElite(target),
          round: currentRound,
          multiplier: 1,
          critAdd: 0,
          armourKept: 1,
          armoured: !pierce && armour > 0 && target.armour > 0,
          poisoned: ctx.dots.some((d) => d.enemy === target),
          beats: !!element && !!targetElement && beats(element, targetElement),
          advantageScale: 1,
          main,
          allEnemies: false,
        };
        for (const hook of hooks.beforeAttack) hook(attack);
      }
      // An armoured target blunts Power in full and Magic only partly; Pierce ignores it.
      const blocked = armour * target.armour * (attack?.armourKept ?? 1);
      const armourFactor = pierce ? 1 : hero.member.damageStat === 'power' ? 1 - blocked : 1 - rules.magicArmourShare * blocked;
      // The best buff of a conscious hero lifts everyone; buffs don't stack.
      let buffer: { buff: Extract<Ability, { kind: 'partyDamageBuff' }> } | undefined;
      for (const other of alive()) {
        const buff = own(other, 'partyDamageBuff');
        if (buff && (!buffer || buff.multiplier > buffer.buff.multiplier)) buffer = { buff };
      }
      let bonus =
        blessing *
        (buffer?.buff?.multiplier ?? 1) *
        (alive().some((h) => has(h, 'inspire', anyTags))
          ? alive().some((h) => isStrong(h, 'inspire', anyTags))
            ? gearKeywordRules.strong.inspire.multiplier
            : gearKeywordRules.inspire.multiplier
          : 1) *
        shrine *
        (fightsSeen === 0 ? hero.weakenedFirst : hero.weakenedRest) *
        armourFactor;
      for (const ability of hero.member.abilities) {
        if (ability.kind !== 'damageVsTag' || !tags.includes(ability.tag)) continue;
        bonus *= ability.multiplier;
        note(id, 'tagBonus', { tag: ability.tag });
      }
      // A damageVs affix lifts the hit against a foe it names.
      const vs = affixTotal(hero.member, 'damageVs', { tags });
      if (vs > 0) bonus *= 1 + vs / 100;
      // Sacred ground dulls every weapon it can see.
      if (restriction === 'sacredGround' && !hero.member.concealed && !ignores(hero, 'sacredGround')) {
        bonus *= restrictionRules.sacredGround;
      }
      const rage = own(hero, 'rage');
      if (rage && hero.hp < rage.belowPct * hero.member.maxHp) {
        bonus *= rage.multiplier;
        note(id, 'rage');
      }
      const advantage = own(hero, 'elementalAdvantage');
      // The wheel only touches the elemental part of a hit.
      const wheel = (element: Element | undefined) => {
        let multiplier = weaponMultiplier(element, targetElement);
        const channel = has(hero, 'channel', tags)
          ? isStrong(hero, 'channel', tags)
            ? gearKeywordRules.strong.channel.advantage
            : gearKeywordRules.channel.advantage
          : 1;
        if (element && targetElement && beats(element, targetElement)) {
          // Channel lifts the wheel's advantage; a family effect may scale the bonus above 1; Anti-magic then cuts that bonus in half.
          const lifted = !!advantage || channel > 1;
          if (lifted) multiplier = Math.max(advantage?.multiplier ?? multiplier, channel);
          multiplier = 1 + (multiplier - 1) * (attack?.advantageScale ?? 1);
          if (lifted && restriction === 'antiMagic' && !ignores(hero, 'antiMagic')) multiplier = 1 + (multiplier - 1) * restrictionRules.antiMagic;
          if (advantage) note(id, 'advantage');
        }
        return multiplier;
      };
      // Anti-magic halves Magic; Power only turns elemental through an infused weapon.
      const magic = hero.member.damageStat === 'magic';
      const base = magic ? hero.member.magic * (ignores(hero, 'antiMagic') ? 1 : magicFactor) : hero.member.power;
      const physical = elemental && element ? 0 : magic ? 0 : base * (element ? infusionRules.physicalShare : 1);
      const elementalPart = elemental && element
        ? base * wheel(element)
        : magic
          ? base * wheel(element)
          : element
            ? (base * infusionRules.elementalShare + hero.member.power * infusionRules.bonusShare) * wheel(element)
            : 0;
      const critBonus = hero.member.abilities.reduce((sum, a) => sum + (a.kind === 'critBonus' ? a.chance : 0), 0);
      // A Duelist's crits hit harder in a fight against a lone enemy.
      const duel = enemies.length === 1 ? own(hero, 'singleEnemyCrit') : undefined;
      // A relic's crit damage against a matching foe replaces the usual crit multiplier.
      const critDamage = relicEffect(hero, 'critDamage', tags);
      const staggerOnCrit = relicEffect(hero, 'staggerOnCrit', tags);
      let crit = false;
      const onCrit = () => {
        crit = true;
        if (duel) note(id, 'duel');
        else if (critBonus > 0) note(id, 'crit');
        if (critDamage) noteRelic(result, id, critDamage.relicId);
      };
      // An Aimed strike makes the hero's next hit a sure crit; an Opener affix sharpens the first round of the fight.
      const opener = currentRound === 1 ? affixTotal(hero.member, 'firstRoundCrit') / 100 : 0;
      const chance = critChance ?? (sureCrits.delete(id) ? 1 : hero.member.crit / 100 + critBonus + opener + (attack?.critAdd ?? 0));
      const hit = roll(physical + elementalPart, chance, onCrit, duel?.multiplier ?? critDamage?.effect.multiplier);
      return {
        damage: hit * fortune * bonus * hero.fed * multiplier * (ctx.party ? ctx.party.multiplier : 1) * (attack?.multiplier ?? 1),
        crit,
        staggerOnCrit,
        allEnemies: attack?.allEnemies ?? false,
      };
    };
    /**
     * Fires the hero's special in this fight: the effect, its use spent, and a
     * note pushed to the encounter. False when the effect found no target, so
     * the use is kept.
     */
    const fireSpecial = (hero: HeroState, def: SpecialDef, opts: { target?: EnemyState; victim?: HeroState } = {}): boolean => {
      const id = hero.member.heroId;
      const log = (extra: Partial<AbilityEffect> = {}) => result.effects.push({ heroId: id, key: 'special', specialId: def.id, ...extra });
      switch (def.effect.kind) {
        case 'allEnemies': {
          const foes = living();
          if (foes.length === 0) return false;
          for (const foe of foes) {
            const damage = normalHit(hero, foe, { elemental: def.effect.elemental, multiplier: def.effect.share }).damage;
            foe.hp -= damage;
            add(result.dealt, id, damage);
          }
          log({ count: foes.length });
          break;
        }
        case 'sureCrit':
          sureCrits.add(id);
          log();
          break;
        case 'multiHit': {
          let foe = opts.target ?? living()[0];
          if (!foe) return false;
          for (let i = 0; i < def.effect.hits && foe; i++) {
            const damage = normalHit(hero, foe, { multiplier: def.effect.share }).damage;
            foe.hp -= damage;
            add(result.dealt, id, damage);
            if (foe.hp <= 0) foe = living()[0];
          }
          log({ count: def.effect.hits });
          break;
        }
        case 'damageOverTime': {
          const foe = opts.target ?? living()[0];
          if (!foe) return false;
          // The damage is computed once, when applied.
          ctx.dots.push({ heroId: id, enemy: foe, damage: normalHit(hero, foe, { multiplier: def.effect.share }).damage, rounds: def.effect.rounds });
          log();
          break;
        }
        case 'strike': {
          const e = def.effect;
          const foe =
            e.target === 'boss'
              ? bossOf()
              : e.target === 'tags'
                ? living().find((x) => enemyTags(x.def).some((tag) => e.tags!.includes(tag)))
                : e.target === 'belowHp'
                  ? living().find((x) => x.hp < x.maxHp * e.belowPct!)
                  : opts.target ?? living()[0];
          if (!foe || foe.hp <= 0) return false;
          if (e.missChance !== undefined && specialRng.chance(e.missChance)) {
            log({ missed: true });
            break;
          }
          const damage = normalHit(hero, foe, { multiplier: e.multiplier }).damage;
          foe.hp -= damage;
          add(result.dealt, id, damage);
          log();
          break;
        }
        case 'nextAttack':
          nextAttackMultiplier.set(id, def.effect.multiplier);
          log();
          break;
        case 'skipTurn': {
          const e = def.effect;
          const foes = (
            e.target === 'strongest'
              ? [living().length > 0 ? strongest(living()) : undefined]
              : e.target === 'one'
                ? [opts.target ?? living()[0]]
                : e.target === 'boss'
                  ? [bossOf()]
                  : living()
          ).filter((foe): foe is EnemyState => !!foe && foe.hp > 0);
          if (foes.length === 0) return false;
          // The foes may shake it off: the use is spent either way.
          if (specialRng.chance(e.chance)) foes.forEach((foe) => (foe.staggered = true));
          else break;
          log(e.target === 'all' ? { count: foes.length } : {});
          break;
        }
        case 'taunt':
          ctx.taunt = { heroId: id, rounds: def.effect.rounds, damageTaken: def.effect.damageTaken };
          log();
          break;
        case 'shieldWeakest':
          ctx.shield = { rounds: def.effect.rounds };
          log();
          break;
        case 'absorb': {
          const target =
            def.effect.target === 'self' || alive().length < 2
              ? hero
              : alive().filter((h) => h !== hero).reduce((low, h) => (h.hp / h.member.maxHp < low.hp / low.member.maxHp ? h : low));
          ctx.absorbs.set(target.member.heroId, def.effect.hits);
          log(def.effect.target === 'ally' && target !== hero ? { allyId: target.member.heroId } : {});
          break;
        }
        case 'dodge':
          ctx.dodges.set(id, def.effect.rounds);
          log();
          break;
        case 'counter':
          ctx.counters.set(id, { hits: def.effect.hits, share: def.effect.share });
          log();
          break;
        case 'heal': {
          const e = def.effect;
          const targets =
            e.target === 'self' ? [hero] : e.target === 'party' ? alive() : [alive().reduce((low, h) => (h.hp / h.member.maxHp < low.hp / low.member.maxHp ? h : low))];
          if (!targets.some((h) => h.hp < h.member.maxHp)) return false;
          targets.forEach((h) => heal(h, e.pct, result));
          log(e.target === 'weakest' ? { allyId: targets[0].member.heroId } : {});
          break;
        }
        case 'healOverTime':
          ctx.hot = { pct: def.effect.pct, rounds: def.effect.rounds };
          log();
          break;
        case 'revive': {
          const victim = opts.victim;
          if (!victim) return false;
          // The prayer may go unanswered: the use is spent either way.
          if (!specialRng.chance(def.effect.chance)) break;
          victim.hp = Math.max(1, Math.round(def.effect.pct * victim.member.maxHp));
          victim.out = false;
          log({ allyId: victim.member.heroId });
          break;
        }
        case 'partyDamage':
          ctx.party = { multiplier: def.effect.multiplier, rounds: def.effect.rounds };
          log();
          break;
        case 'removeEnemy': {
          const e = def.effect;
          // Never the boss.
          const foes = living().filter((foe) => !('effect' in foe.def));
          const foe = e.tags ? foes.find((x) => enemyTags(x.def).some((tag) => e.tags!.includes(tag))) : foes.length > 0 ? strongest(foes) : undefined;
          if (!foe) return false;
          // The foe may refuse: the use is spent either way.
          if (!specialRng.chance(e.chance)) break;
          foe.hp = 0;
          log();
          break;
        }
        case 'ally': {
          const foe = opts.target ?? living()[0];
          if (!foe) return false;
          // The summon's damage is fixed at summoning, and never crits.
          ctx.summons.push({ heroId: id, ...summoned(hero, normalHit(hero, foe, { critChance: 0, multiplier: def.effect.share }).damage, def.effect.rounds) });
          log();
          break;
        }
      }
      if (!ownUseLeft(hero, def)) {
        bonusUses.set(id, bonusUses.get(id)! - 1);
        family.log('rally3', id);
      }
      if (def.uses === 'perFight') ctx.spent.add(id);
      if (def.uses === 'perExpedition') specialRunSpent.add(id);
      return true;
    };
    /**
     * The specials that fire at the start of the hero's own attack; false when
     * a strike or flurry replaces it.
     */
    const turnSpecial = (hero: HeroState, target: EnemyState): boolean => {
      const def = specialOf(hero);
      if (!def) return true;
      const t = def.trigger;
      if (t.kind === 'heroTurn') {
        if (!hasUseLeft(hero, def) || !specialRng.chance(t.chance)) return true;
      } else if (t.kind === 'heroTurnVsTags') {
        if (!hasUseLeft(hero, def) || !enemyTags(target.def).some((tag) => t.tags.includes(tag))) return true;
      } else if (t.kind === 'enemyBelow') {
        // The boss itself when the trigger says so, any living enemy when not.
        const below = (e: EnemyState) => e.hp > 0 && (!t.boss || e === bossOf()) && e.hp < e.maxHp * t.pct;
        if (!hasUseLeft(hero, def) || !enemies.some(below)) return true;
      } else {
        return true;
      }
      if (!fireSpecial(hero, def, { target })) return true;
      return def.effect.kind !== 'strike' && def.effect.kind !== 'multiHit';
    };
    const heroesAttack = (attackers: HeroState[]) => {
      // Nobody is hurt while the heroes strike, so the conscious heroes hold for all of it.
      const conscious = alive();
      // The best buff of a conscious hero lifts everyone; buffs don't stack.
      let buffer: { h: HeroState; buff: Extract<Ability, { kind: 'partyDamageBuff' }> } | undefined;
      for (const hero of conscious) {
        const buff = own(hero, 'partyDamageBuff');
        if (buff && (!buffer || buff.multiplier > buffer.buff.multiplier)) buffer = { h: hero, buff };
      }
      if (buffer) note(buffer.h.member.heroId, 'buff');
      for (const hero of attackers) {
        // A hero quicker than the fastest living enemy may land one second blow.
        const heroAttack = (second = false) => {
          let target = enemies.find((e) => e.hp > 0);
          if (!target) return;
          const id = hero.member.heroId;
          // A special can fire on the hero's turn; a strike or flurry replaces the attack.
          if (!second && !turnSpecial(hero, target)) return;
          // The special may have felled the target; the attack falls to the next foe.
          if (target.hp <= 0) {
            target = enemies.find((e) => e.hp > 0);
            if (!target) return;
          }
          const tags = enemyTags(target.def);
          const { damage: hit, crit, staggerOnCrit, allEnemies } = normalHit(hero, target, { main: true });
          // Focus multiplies the hero's next attack.
          const focus = nextAttackMultiplier.get(id);
          if (focus !== undefined) nextAttackMultiplier.delete(id);
          const damage = hit * (focus ?? 1);
          // The first spell of the run's first fight strikes every living enemy instead of one.
          const firstSpell =
            fightsSeen === 0 && hero.member.damageStat === 'magic' && !firstSpellUsed.has(id) && relicEffect(hero, 'firstSpellAll');
          for (const foe of firstSpell || allEnemies ? enemies.filter((e) => e.hp > 0) : [target]) {
            foe.hp -= damage;
            add(result.dealt, id, damage);
          }
          if (firstSpell) {
            firstSpellUsed.add(id);
            noteRelic(result, id, firstSpell.relicId);
          }
          attacked.add(id);
          if (hooks.onHit.length > 0 || hooks.onKill.length > 0) {
            const hit = {
              ...family,
              hero,
              target,
              tags,
              crit,
              damage,
              round: currentRound,
              elite: isElite(target),
              jump: (share: number) => {
                if (!hero.member.weaponElement) return null;
                const others = enemies.filter((e) => e.hp > 0 && e !== target);
                if (others.length === 0) return null;
                const second = others.find((e) => enemies.indexOf(e) > enemies.indexOf(target)) ?? others[0];
                const chained = normalHit(hero, second, { elemental: true, multiplier: share, critChance: 0 }).damage;
                second.hp -= chained;
                add(result.dealt, id, chained);
                return second;
              },
            };
            for (const hook of hooks.onHit) hook(hit);
            if (target.hp <= 0) for (const hook of hooks.onKill) hook(hit);
          }
          // A relic heals its wearer when their hit kills a matching foe.
          const healOnKill = relicEffect(hero, 'healOnKill', tags);
          if (healOnKill && target.hp <= 0) {
            heal(hero, healOnKill.effect.pct, result);
            noteRelic(result, id, healOnKill.relicId);
          }
          // A Bloodthirsty piece heals its wearer for every kill.
          const onKill = affixTotal(hero.member, 'healOnKill');
          if (onKill > 0 && target.hp <= 0) heal(hero, onKill / 100, result);
          // A Venomous piece, or a family effect, may poison the hit's target: a share of the hit, ticking for three rounds.
          // An enemy carries at most a few Venomous poisons at a time: a proc past the cap refreshes the one closest to wearing off.
          const venom = affixTotal(hero.member, 'poisonOnHit');
          let poisons = false;
          if (venom > 0 || hooks.poisonChance.length > 0) {
            const roll = { ...family, hero, target, roll: rng.next(), affixChance: venom / 100, poisons: false };
            roll.poisons = roll.roll < roll.affixChance;
            for (const hook of hooks.poisonChance) hook(roll);
            poisons = roll.poisons;
          }
          if (poisons) {
            const stacks = ctx.dots.filter((d) => d.enemy === target && d.source === 'venomous');
            let cap = familyEffectRules.venom.baseStacks;
            if (hooks.poisonCap.length > 0) {
              const poisonCap = { ...family, hero, target, stacks: stacks.length, cap };
              for (const hook of hooks.poisonCap) hook(poisonCap);
              cap = poisonCap.cap;
            }
            const dotDamage = damage * familyEffectRules.venom.dotShare;
            if (stacks.length < cap) {
              ctx.dots.push({ heroId: id, enemy: target, damage: dotDamage, rounds: familyEffectRules.venom.dotRounds, source: 'venomous' });
            } else {
              const lowest = stacks.reduce((low, d) => (d.rounds < low.rounds ? d : low));
              lowest.rounds = familyEffectRules.venom.dotRounds;
              lowest.damage = Math.max(lowest.damage, dotDamage);
            }
          }
          // Cleave splashes onto the next living enemy after the target.
          if (has(hero, 'cleave', tags)) {
            const splashTarget = enemies.slice(enemies.indexOf(target) + 1).find((e) => e.hp > 0);
            if (splashTarget) {
              const splash = damage * (isStrong(hero, 'cleave', tags) ? gearKeywordRules.strong.cleave.splash : gearKeywordRules.cleave.splash);
              splashTarget.hp -= splash;
              add(result.dealt, id, splash);
            }
          }
          // Stagger makes the target lose its next attack, once at a time.
          if (
            has(hero, 'stagger', tags) &&
            target.hp > 0 &&
            !target.staggered &&
            rng.chance(isStrong(hero, 'stagger', tags) ? gearKeywordRules.strong.stagger.chance : gearKeywordRules.stagger.chance)
          ) {
            target.staggered = true;
          }
          // A relic staggers a matching foe on every crit.
          if (crit && staggerOnCrit && target.hp > 0 && !target.staggered) {
            target.staggered = true;
            noteRelic(result, id, staggerOnCrit.relicId);
          }
          if (second) return;
          const living = enemies.filter((e) => e.hp > 0);
          const gap = living.length > 0 ? (roundSpeed.get(hero) ?? hero.member.speed) - Math.max(...living.map((e) => e.def.speed)) : 0;
          if (gap > 0 && rng.chance(Math.min(rules.speed.secondAttackPerPoint * gap, rules.speed.max))) heroAttack(true);
        };
        heroAttack();
        if (hooks.afterAttack.length > 0 && !hero.out) {
          const after = { ...family, hero, round: currentRound, extra: false };
          for (const hook of hooks.afterAttack) hook(after);
          if (after.extra) heroAttack(true);
        }
      }
    };
    /** A protector takes a share of the hits aimed at the most hurt ally. */
    const shielded = (target: HeroState, amount: number) => {
      // A sweep can knock out the whole party before it reaches this hero.
      const living = alive();
      if (!living.includes(target)) return amount;
      const lowest = living.reduce((low, h) => (h.hp / h.member.maxHp < low.hp / low.member.maxHp ? h : low));
      if (lowest !== target) return amount;
      const protector = living.find((h) => h !== target && own(h, 'protect'));
      if (!protector) return amount;
      const moved = amount * own(protector, 'protect')!.share;
      note(protector.member.heroId, 'protect', { allyId: target.member.heroId });
      hurt(protector, moved, result);
      return amount - moved;
    };
    const enemiesAttack = (round: number) => {
      // The boss's first turn is when the specials waiting for it fire.
      if (isBoss && !ctx.bossTurn) {
        ctx.bossTurn = true;
        for (const hero of alive()) {
          const def = specialOf(hero);
          if (def?.trigger.kind === 'bossFirstTurn' && hasUseLeft(hero, def)) fireSpecial(hero, def);
        }
      }
      for (const enemy of enemies.filter((e) => e.hp > 0)) {
        // A staggered enemy loses this attack.
        if (enemy.staggered) {
          enemy.staggered = false;
          continue;
        }
        // A drugged boss sleeps through the fight's first rounds.
        if (weakness?.freeRounds && round <= weakness.freeRounds) continue;
        const boss: BossDef | null = isBoss || 'effect' in enemy.def ? (enemy.def as BossDef) : null;
        const enraged = boss?.effect === 'enrage' && !weakness?.noEnrage && enemy.hp < enemy.maxHp / 2;
        const attackerTags = enemyTags(enemy.def);
        const beast = attackerTags.includes('beast');
        const base =
          enemy.def.damage *
          (enraged ? rules.enrageMultiplier : 1) *
          (beast ? beastDamage : 1) *
          (weakness?.damageCut ? 1 - weakness.damageCut : 1);
        const sweeping = boss?.effect === 'sweep' && !weakness?.noSweep;
        // Nobody is hurt between these reads, so one pass over the conscious heroes serves.
        const living = alive();
        // A taunt pulls every single-target attack onto its hero; a distraction leaves the weakest ally alone.
        const taunting = ctx.taunt && living.find((h) => h.member.heroId === ctx.taunt!.heroId);
        const spared = ctx.shield && living.length > 1 ? living.reduce((low, h) => (h.hp / h.member.maxHp < low.hp / low.member.maxHp ? h : low)) : undefined;
        const pool = spared ? living.filter((h) => h !== spared) : living;
        const threatOf = (h: HeroState) =>
          h.member.threat *
          (has(h, 'guard', attackerTags)
            ? isStrong(h, 'guard', attackerTags)
              ? gearKeywordRules.strong.guard.targetWeight
              : gearKeywordRules.guard.targetWeight
            : 1);
        // Zero-threat heroes can still be the only target left; then anyone will do.
        const targets =
          sweeping
            ? pool
            : taunting
              ? [taunting]
              : pool.length
                ? [rng.weighted(pool, pool.some((h) => threatOf(h) > 0) ? threatOf : () => 1)]
                : [];
        for (const hero of targets) {
          // A Vanished hero slips out of the way of every attack.
          if ((ctx.dodges.get(hero.member.heroId) ?? 0) > 0) continue;
          // Quick heroes slip out of the way.
          let evasion = hero.member.evasion;
          if (hooks.beforeDefend.length > 0) {
            const defend = { ...family, hero, attacker: enemy, evasion };
            for (const hook of hooks.beforeDefend) hook(defend);
            evasion = defend.evasion;
          }
          if (rng.chance(Math.min(evasion, rules.evasionCap) / 100)) {
            if (hooks.onDodge.length === 0) continue;
            const dodge = {
              ...family,
              hero,
              attacker: enemy,
              counter: (share: number) => {
                if (enemy.hp <= 0 || hero.out) return;
                const back = normalHit(hero, enemy, { multiplier: share }).damage;
                enemy.hp -= back;
                add(result.dealt, hero.member.heroId, back);
              },
            };
            for (const hook of hooks.onDodge) hook(dodge);
            continue;
          }
          // Parry turns a physical hit away entirely.
          if (
            enemy.def.damageType === 'power' &&
            has(hero, 'parry', attackerTags) &&
            rng.chance(isStrong(hero, 'parry', attackerTags) ? gearKeywordRules.strong.parry.chance : gearKeywordRules.parry.chance)
          ) {
            continue;
          }
          const element = enemyElement(enemy.def);
          let incoming = roll(sweeping ? base * rules.sweepShare : base) * elementFactor(hero, element);
          // The Element threat bites heroes without Resist.
          if (element !== undefined && element === elementThreat?.element && !hero.member.resists.includes(element)) {
            incoming *= fightsSeen === 0 ? elementalDamageFirst : elementalDamage;
          }
          // Power hits are blunted by Armour, Magic by Resistance.
          const { elementResist } = hero.member;
          const amulet = elementResist && elementResist.element === element ? elementResist.amount : 0;
          const defence = enemy.def.damageType === 'power' ? hero.member.armour : hero.member.resistance + amulet;
          let taken = (incoming * 100) / (100 + rules.defenseFactor * defence) / fortune;
          // Brace softens the first big hits of the fight (one, two when strong).
          const bracedSoFar = braced.get(hero.member.heroId) ?? 0;
          const braceHits = isStrong(hero, 'brace', attackerTags) ? gearKeywordRules.strong.brace.hits : 1;
          if (
            has(hero, 'brace', attackerTags) &&
            bracedSoFar < braceHits &&
            taken > gearKeywordRules.brace.above * hero.member.maxHp
          ) {
            braced.set(hero.member.heroId, bracedSoFar + 1);
            taken *= gearKeywordRules.brace.multiplier;
          }
          // A relic's immunity halves the hits of its element.
          const immune = (hero.member.relicEffects ?? []).find(
            (e): e is WornRelicEffect & { effect: Extract<RelicEffect, { kind: 'immune' }> } =>
              e.effect.kind === 'immune' && e.effect.element === element,
          );
          if (immune) {
            taken *= immune.effect.multiplier;
            noteRelic(result, hero.member.heroId, immune.relicId);
          }
          // The wearer's affixes blunt the hit: by the attacker's tags, its magic and its element.
          const from = affixTotal(hero.member, 'damageFrom', { tags: attackerTags });
          if (from > 0) taken *= 1 - from / 100;
          const spiritWard = enemy.def.damageType === 'magic' ? affixTotal(hero.member, 'magicDamageTaken') : 0;
          if (spiritWard > 0) taken *= 1 - spiritWard / 100;
          if (element !== undefined) {
            const ward = (1 - affixTotal(hero.member, 'warding', { element }) / 100) * (1 - affixTotal(hero.member, 'elementResistAll') / 100);
            if (ward < 1) taken *= ward;
          }
          // A taunting hero braces for the hits they draw.
          if (ctx.taunt?.heroId === hero.member.heroId) taken *= ctx.taunt.damageTaken;
          // A Mana shield or Ward swallows the whole hit.
          const absorbed = ctx.absorbs.get(hero.member.heroId);
          if (absorbed !== undefined) {
            if (absorbed <= 1) ctx.absorbs.delete(hero.member.heroId);
            else ctx.absorbs.set(hero.member.heroId, absorbed - 1);
            continue;
          }
          const standing = alive();
          if (hooks.incoming.length > 0 && standing.length > 0) {
            const incoming: Incoming = {
              ...family,
              hero,
              attacker: enemy,
              tags: attackerTags,
              element,
              damage: taken,
              absorbed: false,
              front: standing.reduce((top, h) => (h.member.threat > top.member.threat ? h : top)),
              weakest: standing.reduce((low, h) => (h.hp / h.member.maxHp < low.hp / low.member.maxHp ? h : low)),
              hurt: (other, amount) => hurt(other, amount, result),
            };
            for (const hook of hooks.incoming) {
              hook(incoming);
              if (incoming.absorbed) break;
            }
            if (incoming.absorbed) continue;
            taken = incoming.damage;
          }
          const landed = shielded(hero, taken);
          hurt(hero, landed, result);
          if (hooks.afterTaken.length > 0 && landed > 0) {
            const after = {
              ...family,
              hero,
              attacker: enemy,
              element,
              taken: landed,
              reflect: (amount: number) => {
                enemy.hp -= amount;
                add(result.dealt, hero.member.heroId, amount);
              },
            };
            for (const hook of hooks.afterTaken) hook(after);
          }
          // A Riposte answers the hit with a strike of its own.
          const counter = ctx.counters.get(hero.member.heroId);
          if (counter && !hero.out) {
            const back = normalHit(hero, enemy, { multiplier: counter.share }).damage;
            enemy.hp -= back;
            add(result.dealt, hero.member.heroId, back);
            if (--counter.hits <= 0) ctx.counters.delete(hero.member.heroId);
          }
          if (escaped) return;
        }
      }
      // The attack phase counts a taunt's, a distraction's and a Vanish's rounds down.
      if (ctx.taunt && --ctx.taunt.rounds <= 0) ctx.taunt = null;
      if (ctx.shield && --ctx.shield.rounds <= 0) ctx.shield = null;
      ctx.dodges = new Map([...ctx.dodges].filter(([, left]) => left > 1).map(([id, left]) => [id, left - 1]));
    };

    const maxRounds = guaranteed ? rules.maxRounds * 10 : rules.maxRounds;
    /** The round now playing; the Opener's crit lift reads it. */
    let currentRound = 0;
    // The specials that fire at the fight's start, once the enemies stand and the firebombs are out.
    for (const hero of alive()) {
      const def = specialOf(hero);
      if (def?.trigger.kind !== 'fightStart') continue;
      const t = def.trigger;
      if ((t.minEnemies !== undefined && enemies.length < t.minEnemies) || (t.boss && !isBoss)) continue;
      if (hasUseLeft(hero, def)) fireSpecial(hero, def);
    }
    // Raised enemies join with the family effects that scale summons; their damage multiplies their own.
    const raisedAllies = allies.map((ally) => {
      const hero = heroes.find((h) => h.member.heroId === ally.heroId)!;
      return { ...ally, damage: summoned(hero, ally.damage, null).damage };
    });
    if (hooks.fightReady.length > 0) {
      const ready = {
        ...family,
        enemies,
        isBoss,
        summon: (hero: HeroState, share: number, rounds: number) => {
          const foe = living()[0];
          if (!foe) return false;
          ctx.summons.push({ heroId: hero.member.heroId, ...summoned(hero, normalHit(hero, foe, { critChance: 0, multiplier: share }).damage, rounds) });
          return true;
        },
        tame: (hero: HeroState, enemy: EnemyState) => {
          enemy.hp = 0;
          ctx.summons.push({ heroId: hero.member.heroId, ...summoned(hero, enemy.def.damage, null) });
        },
      };
      for (const hook of hooks.fightReady) hook(ready);
    }
    // While the fight runs, hurt() hands the specials that watch for damage or a fall over to it.
    damageTriggers = (hero, knockedOut) => {
      const firstHit = !ctx.hitsTaken.has(hero.member.heroId);
      ctx.hitsTaken.add(hero.member.heroId);
      for (const other of alive()) {
        const def = specialOf(other);
        if (!def) continue;
        const t = def.trigger;
        // A fall wakes the specials that answer one; a hero knocked out can't act.
        if (t.kind === 'allyKnockedOut') {
          if (knockedOut && hasUseLeft(other, def)) fireSpecial(other, def, { victim: hero });
        } else if (t.kind === 'hpBelow' && !knockedOut) {
          const below = (h: HeroState) => h.hp < t.pct * h.member.maxHp;
          const applies = t.who === 'self' ? other === hero && below(other) : alive().some(below);
          if (applies && hasUseLeft(other, def)) fireSpecial(other, def);
        } else if (t.kind === 'partyBelow' && !knockedOut) {
          const living = alive();
          const share = living.reduce((sum, h) => sum + h.hp / h.member.maxHp, 0) / living.length;
          if (share < t.pct && hasUseLeft(other, def)) fireSpecial(other, def);
        } else if (t.kind === 'firstHit' && !knockedOut && other === hero && firstHit && !hero.out && hasUseLeft(other, def)) {
          fireSpecial(other, def);
        }
      }
    };
    try {
      for (let round = 1; round <= maxRounds; round++) {
        result.rounds = round;
        currentRound = round;
        // A special's lasting effects: poison wears, regrowth heals, rally's rounds count down.
        for (const dot of ctx.dots) {
          if (dot.enemy.hp <= 0) continue;
          dot.enemy.hp -= dot.damage;
          add(result.dealt, dot.heroId, dot.damage);
          dot.rounds--;
        }
        ctx.dots = ctx.dots.filter((dot) => dot.rounds > 0 && dot.enemy.hp > 0);
        if (ctx.hot) {
          alive().forEach((h) => heal(h, ctx.hot!.pct, result));
          ctx.hot.rounds--;
          if (ctx.hot.rounds <= 0) ctx.hot = null;
        }
        // The round it fires in is past, so the multiplier counts down from the next round.
        if (ctx.party && --ctx.party.rounds < 0) ctx.party = null;
        // An exposed fight gives the enemies the first strike; after that it plays like any fight.
        const ambushed = ambush && round === 1;
        // Reach acts before the enemies in round 1 of every fight (rounds 1-2 when strong); family effects may add others.
        const firstSet = new Set(
          alive().filter((h) => has(h, 'reach', anyTags) && round <= (isStrong(h, 'reach', anyTags) ? gearKeywordRules.strong.reach.rounds : 1)),
        );
        roundSpeed = new Map(alive().map((h) => [h, h.member.speed]));
        if (hooks.turnOrder.length > 0) {
          const fastestNow = Math.max(...enemies.filter((e) => e.hp > 0).map((e) => e.def.speed));
          for (const hero of alive()) {
            const order = { ...family, round, hero, speed: hero.member.speed, first: firstSet.has(hero), fastest: fastestNow, ambushed };
            for (const hook of hooks.turnOrder) hook(order);
            roundSpeed.set(hero, order.speed);
            if (order.first) firstSet.add(hero);
          }
        }
        const first = alive().filter((h) => firstSet.has(h));
        if (first.length > 0) {
          heroesAttack(first);
          if (enemies.every((e) => e.hp <= 0)) {
            result.cleared = true;
            return;
          }
        }
        // Heroes at least as fast as the fastest living enemy strike first; the rest strike after them.
        const rest = alive().filter((h) => !firstSet.has(h));
        const fastest = Math.max(...enemies.filter((e) => e.hp > 0).map((e) => e.def.speed));
        const speedOf = (h: HeroState) => roundSpeed.get(h) ?? h.member.speed;
        const quick = ambushed ? rest : rest.filter((h) => speedOf(h) >= fastest);
        const slow = ambushed ? [] : rest.filter((h) => speedOf(h) < fastest);
        if (ambushed) enemiesAttack(round);
        if (escaped || alive().length === 0) return;
        // Raised enemies strike every round and are never targeted; a special's summons fight beside them.
        for (const ally of [...raisedAllies, ...ctx.summons]) {
          const target = enemies.find((e) => e.hp > 0);
          if (!target) break;
          if ('tag' in ally) {
            target.hp -= ally.def.damage * ally.damage;
            note(ally.heroId, 'allies', { tag: ally.tag });
          } else {
            target.hp -= ally.damage;
          }
        }
        ctx.summons = ctx.summons
          .map((summon) => (summon.rounds === null ? summon : { ...summon, rounds: summon.rounds - 1 }))
          .filter((summon) => summon.rounds === null || summon.rounds > 0);
        heroesAttack(quick);
        if (enemies.every((e) => e.hp <= 0)) {
          result.cleared = true;
          return;
        }
        if (!ambushed) enemiesAttack(round);
        if (escaped || alive().length === 0) return;
        heroesAttack(slow);
        if (enemies.every((e) => e.hp <= 0)) {
          result.cleared = true;
          return;
        }
      }
    } finally {
      damageTriggers = null;
      fightShields = null;
    }
  };

  /** A fight with the wounds the briefing's missed threats inflict around it. */
  const runFight = (
    enemyDefs: (MobDef | BossDef)[],
    result: EncounterResult,
    enemiesFirst: boolean,
    isBoss = false,
    weakness?: WeaknessEffect,
  ) => {
    const allies = raised;
    raised = [];
    fight(enemyDefs, result, enemiesFirst, isBoss, weakness, allies);
    if (result.cleared && hooks.afterFight.length > 0 && alive().length > 0) {
      const after = {
        ...familyBase(result),
        heroes: alive(),
        tags: [...new Set(enemyDefs.flatMap(enemyTags))],
        foes: enemyDefs.map(enemyTags),
        isBoss,
        addMaterial: (materialId: string, amount: number) => {
          const held = familyMaterials.find((stack) => stack.materialId === materialId);
          if (held) held.amount += amount;
          else familyMaterials.push({ materialId, amount });
        },
      };
      for (const hook of hooks.afterFight) hook(after);
    }
    // The first fight with the tag, at the signature's threat level: its fallen fight for the party next.
    for (const hero of heroes) {
      for (const ability of hero.member.abilities) {
        if (ability.kind !== 'raiseAllies' || raisedFor.has(ability.threat)) continue;
        if (!activeBriefing.threats.some((t) => t.id === ability.threat && t.level === ability.level)) continue;
        const fallen = enemyDefs.filter((def) => enemyTags(def).includes(ability.tag));
        if (fallen.length === 0) continue;
        raisedFor.add(ability.threat);
        if (!result.cleared || hero.out) continue;
        raised = fallen.slice(0, ability.max).map((def) => ({ def, damage: ability.damage, heroId: hero.member.heroId, tag: ability.tag }));
        result.effects.push({ heroId: hero.member.heroId, key: 'raise', tag: ability.tag });
      }
    }
    // Poison wears at everyone after every fight.
    for (const penalty of poisonWounds) {
      for (const hero of alive()) {
        // A relic cuts its wearer's share of the wounds (the Hedge-witch's robes).
        const cut = (hero.member.relicEffects ?? []).find(
          (e): e is WornRelicEffect & { effect: Extract<RelicEffect, { kind: 'penaltyCut' }> } =>
            e.effect.kind === 'penaltyCut' && e.effect.threat === penalty.threatId,
        );
        // An Antivenom affix makes the poison wear off faster on its wearer: a smaller share.
        const antivenom = 1 - affixTotal(hero.member, 'dotDuration') / 100;
        hurt(hero, penalty.pct * hero.member.maxHp * (cut?.effect.multiplier ?? 1) * antivenom, result);
        if (cut) noteRelic(result, hero.member.heroId, cut.relicId);
      }
      result.effects.push({ heroId: null, key: 'poison' });
    }
    // A conscious Cook feeds everyone a bite after every fight.
    const cook = withAbility('fightHeal');
    if (cook && alive().some((h) => h.hp < h.member.maxHp)) {
      alive().forEach((hero) => heal(hero, cook.ability.pct, result));
      result.effects.push({ heroId: cook.hero.member.heroId, key: 'fightHeal' });
    }
    // A conscious Mender patches up the most wounded hero after every fight.
    if (alive().some((h) => h.keywords.has('mend'))) {
      const wounded = alive().filter((h) => h.hp < h.member.maxHp);
      if (wounded.length > 0) {
        const lowest = wounded.reduce((low, h) => (h.hp / h.member.maxHp < low.hp / low.member.maxHp ? h : low));
        heal(
          lowest,
          alive().some((h) => h.strong.has('mend')) ? gearKeywordRules.strong.mend.pct : gearKeywordRules.mend.pct,
          result,
        );
      }
    }
  };

  /** Whether the fight at `index` (bosses included) is exposed by a missed threat. */
  let fightsSeen = 0;
  const exposedAt = (index: number) =>
    exposedPenalties.some((penalty) => {
      if (penalty.fights === 'all') return penalty.everyOther ? index % 2 === 0 : true;
      const whole = Math.floor(penalty.fights);
      return index < whole || (penalty.fights > whole && index === whole && rng.chance(penalty.fights - whole));
    });

  const expand = (groups: MobGroup[]) => groups.flatMap(({ mobId, count }) => Array(count).fill(mobById[mobId]));

  /** Whether the encounter came to blows: a fight or the boss. */
  const fought = (result: EncounterResult) => result.kind === 'fight' || result.kind === 'boss';

  /** A quiet step: cleared, nothing happens, no log line. */
  const quietResult = (name: string): EncounterResult => {
    const result = emptyResult('quiet', name);
    result.cleared = true;
    return result;
  };

  // Honey cakes: the opportunity pays this much more; a multiplier only grows by its excess.
  const mealBonus = meal?.kind === 'opportunity' ? meal.multiplier : 1;
  const excess = (multiplier: number) => 1 + (multiplier - 1) * mealBonus;
  /** The midpoint opportunity: what the party took, and what it gave. */
  const resolveOpportunity = (at: EncounterResult): RunOpportunity | null => {
    const id = activeBriefing.opportunity;
    if (!id || alive().length === 0) return null;
    const def = opportunityById[id];
    const scored = scoreOpportunity(def, answers, optIn);
    const taken: RunOpportunity = { id, answered: scored.answered };
    if (!scored.answered) {
      return taken;
    }
    const { reward } = def;
    // A Scholar's inscriptions, a Diplomat's bounty: the reward's bonus grows.
    const boost = withAbility('opportunityBoost', (a) => a.opportunity === id)?.ability.multiplier ?? 1;
    const boosted = (multiplier: number) => 1 + (excess(multiplier) - 1) * boost;
    switch (reward.kind) {
      case 'heal':
        alive().forEach((hero) => heal(hero, reward.pct * mealBonus, at));
        break;
      case 'goldShare': {
        const finder = withAbility('cacheBonus');
        taken.gold = Math.round(reward.share * dungeon.gold[1] * mealBonus * (finder?.ability.multiplier ?? 1));
        break;
      }
      case 'ore':
        taken.materials = [
          {
            materialId: reward.materials[Math.min(reward.materials.length, dungeon.tier) - 1],
            amount: Math.ceil((reward.base + dungeon.tier) * mealBonus),
          },
        ];
        break;
      case 'goldMultiplier':
        taken.goldMultiplier = boosted(reward.multiplier);
        break;
      case 'prisoners':
        taken.gold = Math.round(reward.share * dungeon.gold[1] * mealBonus);
        taken.recruit = rng.chance(reward.recruitChance);
        break;
      case 'pilgrimReward':
        taken.pilgrim = rng.weighted([...travellerRules.pilgrimRewards], (entry) => entry.weight).kind;
        break;
      case 'partyDamage':
        shrine = excess(reward.multiplier);
        taken.damageMultiplier = excess(reward.multiplier);
        break;
      case 'xp':
        taken.xpMultiplier = boosted(reward.multiplier);
        taken.recipe = rng.chance(Math.min(1, reward.recipeChance * boost));
        break;
      case 'trophy': {
        const materials: MaterialStack[] = [
          { materialId: 'hide', amount: Math.ceil(rng.int(reward.hide[0], reward.hide[1]) * mealBonus) },
          { materialId: 'bone', amount: Math.ceil(reward.bone * mealBonus) },
        ];
        if (rng.chance(reward.shardChance)) {
          const element = ELEMENTS[rng.int(0, ELEMENTS.length - 1)];
          materials.push({ materialId: shardId(element), amount: 1 });
        }
        taken.materials = materials;
        break;
      }
      case 'vault':
        break;
    }
    if ((reward.kind === 'goldShare' || reward.kind === 'vault') && hooks.cache.length > 0) {
      const cache = { ...familyBase(at), step: false, worth: 0, gold: 0, rolls: 0 };
      for (const hook of hooks.cache) hook(cache);
      extraLootRolls += cache.rolls;
    }
    return taken;
  };

  const runEncounter = (encounter: EncounterDef): EncounterResult => {
    if (encounter.type === 'fight') {
      const result = emptyResult('fight', '', encounter.mobs);
      runFight(expand(encounter.mobs), result, exposedAt(fightsSeen));
      fightsSeen++;
      return result;
    }
    if (encounter.type === 'trap') {
      // A trap is live only when the briefing has the traps threat; otherwise it is a quiet step.
      if (!activeBriefing.threats.some((t) => t.id === 'traps')) return quietResult(encounter.name);
      const result = emptyResult('trap', encounter.name);
      result.cleared = true;
      // A met threat's trap never catches anyone; the worse it was missed, the harder it bites.
      result.trapTriggered = trapWounds > 0;
      if (trapWounds > 0) {
        const reducer = withAbility('trapReduce');
        if (reducer) result.effects.push({ heroId: reducer.hero.member.heroId, key: 'trapReduce' });
        const reduce = reducer?.ability.multiplier ?? 1;
        const caught = encounter.targets === 'all' ? alive() : [rng.weighted(alive(), () => 1)];
        for (const hero of caught) {
          hurt(hero, trapWounds * hero.member.maxHp * reduce * elementFactor(hero, encounter.element), result);
        }
      }
      result.cleared = alive().length > 0;
      return result;
    }
    if (encounter.type === 'locals') {
      // With no Locals threat, locals are always a quiet step.
      return quietResult(npcById[encounter.npcId].name);
    }
    // A hidden cache is a quiet step unless a family effect opens it.
    const event = encounter.type === 'event' ? eventById[encounter.eventId] : undefined;
    if (event?.kind === 'cache' && hooks.cache.length > 0) {
      const result = quietResult(event.name);
      const finder = withAbility('cacheBonus');
      const cache = { ...familyBase(result), step: true, worth: event.goldShare * dungeon.gold[1] * (finder?.ability.multiplier ?? 1), gold: 0, rolls: 0 };
      for (const hook of hooks.cache) hook(cache);
      result.gold = Math.round(cache.gold);
      extraLootRolls += cache.rolls;
      return result;
    }
    // Every other non-fight encounter is a quiet step.
    return quietResult(encounter.type === 'obstacle' ? encounter.name : eventById[encounter.eventId].name);
  };

  const encounterCount = rng.int(dungeon.encounterCount[0], dungeon.encounterCount[1]);
  // A small chance of bad luck no stats can prevent, so no run is ever certain (except the tutorial's).
  const mishapAt = !guaranteed && rng.chance(rules.mishapChance) ? rng.int(0, encounterCount - 1) : -1;
  // The steps before the boss, drawn up front so a drawn threat can be guaranteed its encounter.
  const steps: EncounterDef[] = Array.from({ length: encounterCount - 1 }, () => rng.weighted(dungeon.encounters, (e) => e.weight));
  const drawn = (type: EncounterDef['type']) => steps.some((e) => e.type === type);
  // A drawn threat that never came up takes the last free step before the boss.
  let lastFree = steps.length - 1;
  const guarantee = (threatId: 'traps', type: 'trap') => {
    if (!activeBriefing.threats.some((t) => t.id === threatId) || drawn(type)) return;
    const entry = dungeon.encounters.find((e) => e.type === type);
    if (entry && lastFree >= 0) steps[lastFree--] = entry;
  };
  guarantee('traps', 'trap');
  /** Steps a family effect skips (Watch 2), with the effect to log on each. */
  const skipped = new Map<number, { effect: FamilyEffectId; heroId: string | null }>();
  if (hooks.runPlan.length > 0) {
    // A fight's strength: its enemies' HP times their damage, summed.
    const fights = steps.flatMap((step, index) =>
      step.type === 'fight' ? [{ index, strength: expand(step.mobs).reduce((sum: number, mob: MobDef) => sum + mob.hp * mob.damage, 0) }] : [],
    );
    const plan = {
      fights,
      heroOf: (family: FamilyId) => heroes.find((h) => h.member.familyTags.some((t) => t.family === family)) ?? heroes[0],
      skip: (index: number, effect: FamilyEffectId, heroId: string | null) => skipped.set(index, { effect, heroId }),
    };
    for (const hook of hooks.runPlan) hook(plan);
  }
  const midpoint = Math.floor((encounterCount - 1) / 2);
  /** The midpoint opportunity's outcome, once the party reaches it. */
  let opportunity: RunOpportunity | null = null;

  const encounters: EncounterResult[] = [];
  for (let i = 0; i < encounterCount && alive().length > 0 && !escaped; i++) {
    if (i === mishapAt) {
      encounters.push(emptyResult('mishap', rules.mishaps[rng.int(0, rules.mishaps.length - 1)]));
      break;
    }
    if (i < encounterCount - 1) {
      const skip = skipped.get(i);
      if (skip) {
        const result = quietResult('');
        result.effects.push({ heroId: skip.heroId, key: 'family', familyEffect: skip.effect });
        encounters.push(result);
        if (i === midpoint) opportunity = resolveOpportunity(result);
        continue;
      }
      const result = runEncounter(steps[i]);
      encounters.push(result);
      if (!result.cleared) break;
      if (i === midpoint && i < encounterCount - 1) opportunity = resolveOpportunity(result);
      // The family effects between fights, then a hero's between-fights special, before the healer.
      if (fought(result) && hooks.betweenFights.length > 0 && alive().length > 0) {
        const between = { ...familyBase(result), heroes: alive() };
        for (const hook of hooks.betweenFights) hook(between);
      }
      if (fought(result)) {
        for (const hero of alive()) {
          const def = specialOf(hero);
          if (def?.trigger.kind === 'betweenFights' && def.effect.kind === 'heal' && alive().some((h) => h.hp < h.member.maxHp)) {
            for (const h of alive()) heal(h, def.effect.pct, result);
            result.effects.push({ heroId: hero.member.heroId, key: 'special', specialId: def.id });
          }
        }
      }
      // A healer tends the party between encounters.
      const healer = withAbility('partyHeal');
      if (healer && alive().some((h) => h.hp < h.member.maxHp)) {
        alive().forEach((hero) => heal(hero, healer.ability.pct * partyHealFactor, result));
        result.effects.push({ heroId: healer.hero.member.heroId, key: 'partyHeal' });
      }
      continue;
    }
    const result = emptyResult('boss', dungeon.boss.name);
    if (meal?.kind === 'bossHeal' && alive().length > 0) {
      for (const hero of alive()) heal(hero, meal.pct * (own(hero, 'stewBoost')?.multiplier ?? 1), result);
      result.effects.push({ heroId: null, key: 'stew' });
    }
    // A conscious carrier's weakness item weakens its boss, used up on the spot; other copies never trigger.
    const weakness = weaknessByBoss[dungeon.boss.id];
    const carrier = weakness && alive().find((h) => h.consumableLeft && h.member.consumable?.weakness === dungeon.boss.id);
    if (carrier) {
      carrier.consumableLeft = false;
      weaknessUsedBy = carrier.member.heroId;
      result.effects.push({ heroId: carrier.member.heroId, key: 'weakness' });
    }
    runFight([dungeon.boss], result, exposedAt(fightsSeen), true, carrier ? weakness.effect : undefined);
    fightsSeen++;
    // A won boss fight pays a hero's Steal its extra loot rolls.
    if (result.cleared) {
      for (const hero of alive()) {
        const def = specialOf(hero);
        if (def?.trigger.kind !== 'bossWon' || def.effect.kind !== 'extraLoot') continue;
        extraLootRolls += def.effect.rolls;
        specialRunSpent.add(hero.member.heroId);
        result.effects.push({ heroId: hero.member.heroId, key: 'special', specialId: def.id });
      }
    }
    encounters.push(result);
  }

  // The tutorial run cannot fail: whatever happened reads as a full clear.
  const finalEncounters = guaranteed ? encounters.map((e) => ({ ...e, cleared: true })) : encounters;
  const encountersCleared = guaranteed ? encounterCount : finalEncounters.filter((e) => e.cleared).length;
  const bossDefeated = guaranteed || finalEncounters.some((e) => e.kind === 'boss' && e.cleared);
  const anyKnockedOut = finalEncounters.some((e) => e.knockedOut.length > 0);
  // The run's last encounter carries the notes of the family effects paid once the run is over.
  if (hooks.runEnd.length > 0 && encounters.length > 0) {
    const end = { ...familyBase(encounters[encounters.length - 1]), won: bossDefeated, cleared: encountersCleared };
    for (const hook of hooks.runEnd) hook(end);
  }
  // A smoke bomb escape is a retreat however little was cleared, with nobody out.
  const outcome: ExpeditionOutcome = escaped
    ? 'retreat'
    : bossDefeated
      ? anyKnockedOut
        ? 'success'
        : 'flawless'
      : encountersCleared > 0
        ? 'retreat'
        : 'defeat';

  return {
    encounters: finalEncounters,
    encounterCount,
    encountersCleared,
    bossDefeated,
    outcome,
    bonusGold: encounters.reduce((sum, e) => sum + e.gold, 0) + (opportunity?.gold ?? 0),
    hp: heroes.map((h) => ({ heroId: h.member.heroId, hp: Math.round(h.hp), maxHp: h.member.maxHp })),
    consumed: encounters.flatMap((e) => e.consumed),
    attacked: [...attacked],
    elixirsUsed,
    weaknessUsedBy,
    ...(escaped ? { escaped: true } : {}),
    threats: scores.threats,
    opportunity,
    signed,
    meal,
    extraLootRolls,
    familyMaterials,
    potionsDrunk,
    families,
  };
}

/**
 * Runs a party through a dungeon: encounters drawn from the seed, fought round
 * by round, ending at the boss or when every hero is knocked out. The briefing
 * is scored against the party first: what it missed shapes the run.
 */
export function simulateRun(party: PartyMember[], dungeon: DungeonDef, seed: string, options: RunOptions = {}): RunResult {
  return runPrepared(prepareSimulation(party, dungeon, options), seed);
}
