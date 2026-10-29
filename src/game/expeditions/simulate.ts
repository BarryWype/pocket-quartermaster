import { expeditionRules } from '@/content/dungeons';
import { mobById, mobTags, npcMobId, TIER_SCALE } from '@/content/enemies';
import { eventById } from '@/content/events';
import { localsRules, npcById } from '@/content/npcs';
import { heroClasses } from '@/content/heroes';
import { restrictionRules } from '@/content/threats';
import { gearKeywordRules } from '@/content/equipment';
import { infusionRules } from '@/content/sanctums';
import { travellerRules } from '@/content/patrols';
import { gearName, itemById, opportunityById } from '@/content/lookup';
import { serviceRules } from '@/content/services';
import { weaknessByBoss, type WeaknessEffect } from '@/content/weaknesses';

import { ELEMENTS, beats, incomingMultiplier, shardId, weaponMultiplier, type Element } from '../elements';
import { createRng } from '../generation/rng';
import type { SaveData } from '../save';
import { currentHp } from '../team/health';
import { heroAbilities, heroDamageStat, heroStats, gearKeywordsOf } from '../team/team';
import { classApproaches, gearApproachBonus, heroApproachBonus } from '../team/stats';
import { heroAnswers, type AnswersMember, type HeroAnswers } from '../threats/answers';
import { threatPenalties, type AppliedPenalty } from '../threats/penalties';
import { scoreBriefing, scoreOpportunity, type ThreatScore } from '../threats/score';
import { partyMeal, penaltyReduction, signatureBriefing, type SignatureBriefing } from '../threats/signatures';
import type {
  Ability,
  Approach,
  BossDef,
  Briefing,
  ConsumableDef,
  DamageStat,
  DungeonDef,
  EncounterDef,
  ExpeditionOutcome,
  GearDef,
  HeroClassId,
  HeroState as Hero,
  Hunger,
  Keyword,
  MaterialStack,
  MealEffect,
  MobDef,
  MobGroup,
  NpcHelp,
  OpportunityOutcome,
  RestrictionId,
  Tag,
} from '../types';
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
  weaponName: string | null;
  /** The keywords of the hero's weapon, armour and off-hand; magic pieces marked. */
  gearKeywords: { keyword: Keyword; magic: boolean }[];
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
  /** % points: enemy hits are avoided with chance min(Evasion, evasionCap) %. */
  evasion: number;
  speed: number;
  /** % points: the hero's crit chance. */
  crit: number;
  luck: number;
  /** The hero's recruit roll and approach picks, as +1s on their approaches. */
  approachBonus?: Partial<Record<Approach, number>>;
  /** The class's approach scores for this hero (a Gambler's roll of the day). */
  classApproaches?: Record<Approach, number>;
  threat: number;
  /** Elements this hero takes no extra damage from (class resist, protective consumable). */
  resists: Element[];
  /** Class abilities and trait effects. */
  abilities: Ability[];
  /** The infused weapon's element, or the class's innate one. */
  weaponElement?: Element;
  armourElement?: Element;
  /** Potion, kit, ward salve or charm. */
  consumable: ConsumableDef | null;
  /** The class's keywords for this hero: a Monk's fists add Pierce. */
  classKeywords?: Keyword[];
  /** A Porter's kit, carried for this hero, and that Porter: it counts as theirs. */
  carriedKit?: ConsumableDef | null;
  carriedBy?: string | null;
  /** A Porter carrying their kit for another hero of the party. */
  carriesFor?: string | null;
  /** The Alchemist's second slot: a healing consumable. */
  potion?: ConsumableDef | null;
};

/** An ability that changed an encounter, for the log. `heroId` is null for a local's tip. */
export type AbilityEffect = {
  heroId: string | null;
  key:
    | 'tagBonus'
    | 'tip'
    | 'trapReduce'
    | 'pickpocket'
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
    /** An enemy caster wounded this hero before the fight. */
    | 'casters'
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
    /** An Alchemist drank the potion in their second slot. */
    | 'secondPotion';
  tag?: Tag;
  /** The ally a `protect` shielded. */
  allyId?: string;
};

export type LocalsReaction = 'help' | 'fight' | 'steal' | 'neutral';

/** What happened in one encounter, for rewards and the log. Per-hero maps are keyed by hero id. */
export type EncounterResult = {
  kind: 'fight' | 'boss' | 'trap' | 'locals' | 'quiet' | 'mishap';
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
  reaction?: LocalsReaction;
  /** What the locals did to help. */
  help?: NpcHelp;
  /** Pickpocketed locals noticed and fought. */
  noticed?: boolean;
};

/** The briefing's opportunity at the run's midpoint, and what it gave. */
export type RunOpportunity = OpportunityOutcome & {
  /** The hero whose kit answered it, when one did (see salvage). */
  kitHeroId?: string | null;
};

export type RunResult = {
  encounters: EncounterResult[];
  encounterCount: number;
  encountersCleared: number;
  bossDefeated: boolean;
  outcome: ExpeditionOutcome;
  bonusGold: number;
  hp: { heroId: string; hp: number; maxHp: number }[];
  /** Heroes whose healing consumable (potion or kit heal) was used up during the run. */
  consumed: string[];
  /** Heroes who attacked at least once (a crit charm that never did is salvaged). */
  attacked: string[];
  /** Elements whose damage each ward salve holder took (salvage decides on them). */
  damageElements: Record<string, Element[]>;
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
  /** Share of the dungeon's gold and materials lost to missed threats (0-1). */
  lostLoot: number;
  /** Share of expedition time the missed threats add (paid at launch). */
  delay: number;
  /** The briefing as the party's signatures left it. */
  signed: SignatureBriefing;
  /** Alchemists who drank the potion in their second slot. */
  potionsDrunk: string[];
  /** Porters whose carried kit healed the hero they carried it for. */
  carriedHealed: string[];
  /** Gold a Smuggler fenced from the Thieves threat (part of the bonus gold). */
  fenceGold: number;
  /** The meal the party got: none under Spoiled stores, more with a Cook. */
  meal: MealEffect | null;
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

type HeroState = {
  member: PartyMember;
  hp: number;
  out: boolean;
  consumableLeft: boolean;
  /** The Alchemist's second potion, and a Porter's kit heal, still to use. */
  potionLeft: boolean;
  carriedLeft: boolean;
  /** Damage multiplier from the supply status. */
  fed: number;
  /** The hero's keywords after the restriction, whatever their source. */
  keywords: Set<Keyword>;
};
/** `maxHp` is the def's HP after a weakness cut; thresholds like enrage use it. */
type EnemyState = { def: MobDef | BossDef; hp: number; maxHp: number; staggered: boolean };

/** A party member as `heroAnswers` sees them: weapon, kit and class resists. */
export function answersMemberOf(member: PartyMember): AnswersMember {
  return {
    heroId: member.heroId,
    classId: member.classId,
    traitId: member.traitId,
    gearKeywords: member.gearKeywords,
    // A Porter's kit counts for the hero they carry it for, not for them.
    kit: member.consumable?.kit && !member.carriesFor ? { itemId: member.consumable.id, effect: member.consumable.kit } : null,
    salveElement: member.carriesFor ? null : (member.consumable?.protectsAgainst ?? null),
    classKeywords: member.classKeywords,
    carriedKit:
      member.carriedKit?.kit && member.carriedBy
        ? {
            itemId: member.carriedKit.id,
            effect: member.carriedKit.kit,
            porterId: member.carriedBy,
            salveElement: member.carriedKit.protectsAgainst ?? null,
          }
        : null,
    classResists: heroClasses[member.classId].resists ?? [],
    approachBonus: member.approachBonus,
    classApproaches: member.classApproaches,
  };
}

/** The +1s from a hero's roll, picks and gear, added together. */
function mergeApproachBonus(...sources: Partial<Record<Approach, number>>[]): Partial<Record<Approach, number>> {
  const bonus: Partial<Record<Approach, number>> = {};
  for (const source of sources) {
    for (const [approach, add] of Object.entries(source)) bonus[approach as Approach] = (bonus[approach as Approach] ?? 0) + add;
  }
  return bonus;
}

/**
 * The heroes as they set out, with their HP at `now` (heroes away keep the HP
 * they left with; left out, HP as stored).
 */
export function prepareParty(save: SaveData, heroIds: string[], now = 0, elixirs = false): PartyMember[] {
  const heroes = save.heroes.filter((hero) => heroIds.includes(hero.id));
  /** A Porter's kit and the hero of the party it is carried for. */
  const carrierFor = (hero: Hero) =>
    heroClasses[hero.classId].abilities.some((a) => a.kind === 'carryKit') &&
    hero.kitFor &&
    hero.kitFor !== hero.id &&
    heroes.some((h) => h.id === hero.kitFor) &&
    hero.equipment.consumable &&
    (itemById[hero.equipment.consumable] as ConsumableDef | undefined)?.kit
      ? hero.kitFor
      : null;
  return heroes
    .map((hero) => {
      const heroClass = heroClasses[hero.classId];
      const stats = heroStats(save, hero);
      const weapon = save.gear.find((g) => g.uid === hero.equipment.weapon);
      const armour = save.gear.find((g) => g.uid === hero.equipment.armor);
      const offhand = save.gear.find((g) => g.uid === hero.equipment.offhand);
      const weaponItem = weapon ? (itemById[weapon.itemId] as GearDef) : null;
      const offhandItem = offhand ? (itemById[offhand.itemId] as GearDef) : null;
      // Heavy and Concealed read the equipped pieces; no pieces count as concealed.
      const pieces = [weaponItem, armour ? (itemById[armour.itemId] as GearDef) : null, offhandItem].flatMap(
        (item) => (item ? [item] : []),
      );
      const item = hero.equipment.consumable ? itemById[hero.equipment.consumable] : null;
      const consumable = item?.slot === 'consumable' ? item : null;
      const carriesFor = carrierFor(hero);
      const porter = heroes.find((h) => carrierFor(h) === hero.id);
      // A Monk's fists (no weapon, or knuckles) pierce armour.
      const fists = heroClass.abilities.some((a) => a.kind === 'fistsPierce') && (!weaponItem || weaponItem.gearType === 'knuckles');
      const charm = consumable?.charm;
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
        weaponName: weapon ? gearName(weapon) : null,
        gearKeywords: gearKeywordsOf(save, hero),
        heavy: pieces.some((item) => item.heavy),
        concealed: [weaponItem, offhandItem].every((item) => !item || item.concealed),
        maxHp: stats.hp,
        hp: currentHp(save, hero, now),
        power: statOf('power'),
        magic: statOf('magic'),
        damageStat,
        armour: statOf('armour'),
        resistance: statOf('resistance'),
        evasion: stats.evasion,
        speed: stats.speed + (elixir?.kind === 'speed' ? elixir.add : 0),
        crit: stats.crit,
        luck: stats.luck,
        approachBonus: mergeApproachBonus(heroApproachBonus(hero), gearApproachBonus(save, hero)),
        classApproaches: classApproaches(hero),
        threat: heroClass.threat,
        resists: [
          ...(heroClass.resists ?? []),
          ...(consumable?.protectsAgainst && !carriesFor ? [consumable.protectsAgainst] : []),
          ...(porter ? [itemById[porter.equipment.consumable!] as ConsumableDef].flatMap((kit) => (kit.protectsAgainst ? [kit.protectsAgainst] : [])) : []),
        ],
        abilities: [
          ...heroAbilities(hero),
          ...(charm?.kind === 'crit' ? [{ kind: 'critBonus', chance: charm.chance } satisfies Ability] : []),
        ],
        weaponElement:
          elixir?.kind === 'oil' && weapon ? elixir.element : (weapon?.element ?? heroClass.element),
        armourElement: armour?.element,
        consumable,
        classKeywords: fists ? [...new Set([...heroClass.keywords, 'pierce' as const])] : heroClass.keywords,
        carriedKit: porter ? (itemById[porter.equipment.consumable!] as ConsumableDef) : null,
        carriedBy: porter?.id ?? null,
        carriesFor,
        potion: heroClass.abilities.some((a) => a.kind === 'potionSlot') && hero.equipment.potion ? healingPotion(hero.equipment.potion) : null,
      };
    });
}

/** A healing consumable by id, or null: only these go in the Alchemist's second slot. */
export function healingPotion(itemId: string): ConsumableDef | null {
  const item = itemById[itemId];
  return item?.slot === 'consumable' && item.when === 'lowHp' && item.heal !== undefined ? item : null;
}

/** The party after the meal they ate: max HP, speed and resistance last the run. */
export function mealParty(party: PartyMember[], meal: MealEffect | null | undefined): PartyMember[] {
  return party.map((member) => {
    if (meal?.kind === 'maxHp') {
      const maxHp = Math.round(member.maxHp * meal.multiplier);
      return { ...member, maxHp, hp: Math.min(maxHp, Math.round(member.hp * meal.multiplier)) };
    }
    if (meal?.kind === 'speed') return { ...member, speed: member.speed + meal.add };
    if (meal?.kind === 'resistance') return { ...member, resistance: Math.round(member.resistance * meal.multiplier) };
    return member;
  });
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

/**
 * Runs a party through a dungeon: encounters drawn from the seed, fought round
 * by round, ending at the boss or when every hero is knocked out. The briefing
 * is scored against the party first: what it missed shapes the run.
 */
export function simulateRun(
  party: PartyMember[],
  dungeon: DungeonDef,
  seed: string,
  { rules = expeditionRules, guaranteed = false, hunger = 'fed', meal: eaten = null, briefing = null, optIn = false, elixirs = false, blessed = false }: RunOptions = {},
): RunResult {
  // The party's signatures first: a cancelled restriction, a lowered threat, a Cook's meal.
  const classIds = party.map((member) => member.classId);
  const signed = signatureBriefing(briefing ?? EMPTY_BRIEFING, party.map(answersMemberOf));
  const activeBriefing: Briefing = signed.briefing;
  const restriction = activeBriefing.restriction;
  const meal = partyMeal(eaten, activeBriefing, classIds);
  const rng = createRng(seed);
  // How the day goes for the whole party: a good day hits harder and gets hurt less.
  // Unlike per-hit variance this doesn't average out, so weaker teams keep a real chance.
  const fortune = 1 + (rng.next() * 2 - 1) * rules.fortune;
  // The briefing against this party: what was met, and what it costs.
  const members = mealParty(party, meal);
  const answers: HeroAnswers[] = members.map((member) => heroAnswers(answersMemberOf(member), restriction));
  const heroes: HeroState[] = members.map((member, i) => {
    const { damage, hpLoss } = hungerEffect(hunger, member.abilities);
    // Starving costs HP before the first step, but never knocks anyone out.
    const hp = Math.min(member.maxHp, member.hp > 0 ? Math.max(Math.min(member.hp, 1), member.hp - hpLoss * member.maxHp) : 0);
    return {
      member,
      hp,
      // A hero with no HP to start with can't act at all.
      out: hp <= 0,
      consumableLeft: member.consumable !== null,
      potionLeft: !!member.potion,
      carriedLeft: member.carriedKit?.kit?.heal !== undefined,
      fed: damage,
      keywords: new Set(answers[i].keywords.map((k) => k.keyword)),
    };
  });
  const alive = () => heroes.filter((h) => !h.out);

  const scores = scoreBriefing(activeBriefing, answers);
  // A Smuggler fences what the thieves would take: no loot lost, a little gold instead.
  const fence = party.flatMap((m) => m.abilities).find((a): a is Extract<Ability, { kind: 'fence' }> => a.kind === 'fence');
  const thieves = activeBriefing.threats.find((t) => t.id === 'thieves');
  const fenceGold = fence && thieves ? Math.round(fence.shares[thieves.level - 1] * dungeon.gold[1]) : 0;
  const penalties: AppliedPenalty[] = scores.threats
    .flatMap((score) => threatPenalties(score, undefined, penaltyReduction(classIds)))
    .filter((p) => !(fence && p.threatId === 'thieves' && p.kind === 'lostLoot'));
  const ofKind = <K extends AppliedPenalty['kind']>(kind: K) =>
    penalties.filter((p): p is Extract<AppliedPenalty, { kind: K }> => p.kind === kind);
  const weakenedAgainst = ofKind('weakenedAgainst').reduce((m, p) => m * (1 - p.pct), 1);
  /** Heavy wearers take the Underwater weakened penalty double. */
  const weakenedOf = (member: PartyMember) =>
    Math.max(
      0,
      ofKind('weakened').reduce(
        (m, p) => m * (1 - p.pct * (member.heavy && p.threatId === 'underwater' ? gearKeywordRules.heavy.underwaterMultiplier : 1)),
        1,
      ),
    );
  const beastDamage = ofKind('enemyDamage').reduce((m, p) => m * (1 + p.pct), 1);
  const undeadHp = ofKind('enemyHp').reduce((m, p) => m * (1 + p.pct), 1);
  const bruteDamage = ofKind('bruteDamage').reduce((m, p) => m * (1 + p.pct), 1);
  const extraEnemies = ofKind('extraEnemies');
  const exposedPenalties = ofKind('exposed');
  const poisonWounds = ofKind('fightWounds').filter((p) => p.targets === 'all');
  const casterWounds = ofKind('fightWounds').filter((p) => p.targets === 'one');
  const trapWounds = ofKind('trapWounds')[0]?.pct ?? 0;
  const extraFight = ofKind('extraFight')[0]?.chance ?? 0;
  const elementThreat = activeBriefing.threats.find((t) => t.id === 'element' && t.element) ?? null;
  const elementalDamage = ofKind('elementalDamage')[0]?.multiplier ?? 1;
  const magicFactor = restriction === 'antiMagic' ? restrictionRules.antiMagic : 1;
  const partyHealFactor = restriction === 'antiMagic' ? restrictionRules.antiMagic : 1;
  const healing =
    ofKind('healingHalved').reduce((m, p) => m * p.multiplier, 1) * (restriction === 'noHealing' ? restrictionRules.noHealing : 1);
  const lostLoot = 1 - ofKind('lostLoot').reduce((m, p) => m * (1 - p.pct), 1);
  const delay = ofKind('delay').reduce((m, p) => m * (1 + p.pct), 1) - 1;

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

  /** ±variance, sometimes a crit; cursed luck means there are no crits. */
  const roll = (value: number, critChance = rules.enemyCritChance, onCrit?: () => void, critMultiplier = rules.critMultiplier) => {
    const varied = value * (1 + (rng.next() * 2 - 1) * rules.damageVariance);
    if (restriction === 'cursedLuck' || !rng.chance(critChance)) return varied;
    onCrit?.();
    return varied * critMultiplier;
  };
  const elementFactor = (hero: HeroState, attack?: Element) =>
    incomingMultiplier(attack, { armour: hero.member.armourElement, resists: hero.member.resists });

  /** Elements whose damage a ward salve holder has taken, for salvage. */
  const damageElements: Record<string, Element[]> = {};
  /** Heroes whose elixir (bomb, draught) triggered, for salvage. */
  const elixirsUsed: string[] = [];
  /** The hero whose weakness item weakened the boss fight, if one did. */
  let weaknessUsedBy: string | null = null;
  /** The run's first fight is where a firebomb lands; later fights see none. */
  let firebombThrown = false;
  /** A smoke bomb ended the run: no knock-out, the party slipped away. */
  let escaped = false;
  const potionsDrunk: string[] = [];
  const carriedHealed: string[] = [];
  /** A Monk's own damage ignores some restrictions. */
  const ignores = (hero: HeroState, id: RestrictionId) => own(hero, 'ignoresRestrictions')?.restrictions.includes(id) ?? false;
  /** Raised enemies who fight for the party in the next fight, and the threats whose fallen were already raised. */
  let raised: { def: MobDef | BossDef; damage: number; heroId: string; tag: Tag }[] = [];
  const raisedFor = new Set<string>();
  const tookDamage = (hero: HeroState, element: Element | undefined) => {
    const salve = hero.member.consumable?.protectsAgainst;
    if (!element || salve !== element) return;
    damageElements[hero.member.heroId] = [...(damageElements[hero.member.heroId] ?? []), element];
  };

  const heal = (hero: HeroState, share: number, result: EncounterResult) => {
    const amount = Math.min(hero.member.maxHp - hero.hp, share * hero.member.maxHp * healing);
    hero.hp += amount;
    add(result.healed, hero.member.heroId, amount);
  };

  const hurt = (hero: HeroState, raw: number, result: EncounterResult) => {
    const amount = raw * (own(hero, 'damageTaken')?.multiplier ?? 1);
    hero.hp -= amount;
    add(result.taken, hero.member.heroId, amount);
    if (hero.hp <= 0) {
      if (guaranteed) {
        hero.hp = 1;
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
            return;
          }
        }
      }
    }
    // A Porter's kit heals the hero it is carried for, not the Porter.
    const potion = hero.member.carriesFor ? null : hero.member.consumable;
    const threshold = rules.potionThreshold + (own(hero, 'potionThreshold')?.add ?? 0);
    const low = () => hero.hp < threshold * hero.member.maxHp;
    const healShare = potion?.when === 'lowHp' ? potion.heal : potion?.kit?.heal;
    if (hero.consumableLeft && healShare !== undefined && low()) {
      hero.consumableLeft = false;
      heal(hero, healShare, result);
      result.consumed.push(hero.member.heroId);
    }
    if (hero.carriedLeft && low()) {
      hero.carriedLeft = false;
      heal(hero, hero.member.carriedKit!.kit!.heal!, result);
      carriedHealed.push(hero.member.carriedBy!);
    }
    // The Alchemist's second potion, once the first is gone or isn't one.
    if (hero.potionLeft && low()) {
      hero.potionLeft = false;
      heal(hero, hero.member.potion!.heal!, result);
      potionsDrunk.push(hero.member.heroId);
      result.effects.push({ heroId: hero.member.heroId, key: 'secondPotion' });
    }
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
    // Swarm: every big fight gets copies of its weakest mob.
    const weakest = [...enemyDefs].sort((a, b) => a.hp - b.hp)[0];
    const copies =
      enemyDefs.length >= 3
        ? extraEnemies.flatMap((penalty) => {
            const whole = Math.floor(penalty.count);
            const extra = penalty.count > whole && rng.chance(penalty.count - whole) ? 1 : 0;
            return Array< MobDef | BossDef >(whole + extra).fill(weakest);
          })
        : [];
    const enemies: EnemyState[] = [...enemyDefs, ...copies].map((def) => {
      // A weakness item cuts the boss's max HP up front.
      const maxHp = def.hp * (isBoss && weakness?.hpCut ? 1 - weakness.hpCut : 1);
      // The dead walk here: undead are harder to put down.
      return { def, hp: maxHp * (enemyTags(def).includes('undead') ? undeadHp : 1), maxHp, staggered: false };
    });
    if (escaped) return;
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
    /** Heroes whose Brace already softened a hit in this fight. */
    const braced = new Set<string>();
    /** Logs an effect once per encounter and hero. */
    const note = (heroId: string | null, key: AbilityEffect['key'], extra: Partial<AbilityEffect> = {}) => {
      if (!result.effects.some((e) => e.key === key && e.heroId === heroId)) result.effects.push({ heroId, key, ...extra });
    };
    const heroesAttack = (attackers: HeroState[]) => {
      // The best buff of a conscious hero lifts everyone; buffs don't stack.
      const buffer = alive()
        .map((h) => ({ h, buff: own(h, 'partyDamageBuff') }))
        .filter((b) => b.buff)
        .sort((a, b) => b.buff!.multiplier - a.buff!.multiplier)[0];
      if (buffer) note(buffer.h.member.heroId, 'buff');
      // Inspire lifts the whole party while a conscious hero has it, on top of the best buff.
      const inspired = alive().some((h) => h.keywords.has('inspire')) ? gearKeywordRules.inspire.multiplier : 1;
      for (const hero of attackers) {
        // A hero quicker than the fastest living enemy may land one second blow.
        const heroAttack = (second = false) => {
          const target = enemies.find((e) => e.hp > 0);
          if (!target) return;
          const id = hero.member.heroId;
          const tags = enemyTags(target.def);
          // An armoured target blunts Power in full and Magic only partly; Pierce ignores it.
          const armourFactor = hero.keywords.has('pierce')
            ? 1
            : hero.member.damageStat === 'power'
              ? weakenedAgainst
              : 1 - rules.magicArmourShare * (1 - weakenedAgainst);
          let bonus = blessing * (buffer?.buff?.multiplier ?? 1) * inspired * shrine * weakenedOf(hero.member) * armourFactor;
          for (const ability of hero.member.abilities) {
            if (ability.kind !== 'damageVsTag' || !tags.includes(ability.tag)) continue;
            bonus *= ability.multiplier;
            note(id, 'tagBonus', { tag: ability.tag });
          }
          // Sacred ground dulls every weapon it can see.
          if (restriction === 'sacredGround' && !hero.member.concealed && !ignores(hero, 'sacredGround')) {
            bonus *= restrictionRules.sacredGround;
          }
          const rage = own(hero, 'rage');
          if (rage && hero.hp < rage.belowPct * hero.member.maxHp) {
            bonus *= rage.multiplier;
            note(id, 'rage');
          }
          const targetElement = enemyElement(target.def);
          const advantage = own(hero, 'elementalAdvantage');
          // The wheel only touches the elemental part of a hit.
          const wheel = (element: Element | undefined) => {
            let multiplier = weaponMultiplier(element, targetElement);
            const channel = hero.keywords.has('channel') ? gearKeywordRules.channel.advantage : 1;
            if (element && targetElement && beats(element, targetElement) && (advantage || channel > 1)) {
              // Channel lifts the wheel's advantage; Anti-magic cuts the bonus above 1 in half.
              const bonus = Math.max(advantage?.multiplier ?? multiplier, channel);
              multiplier = restriction === 'antiMagic' && !ignores(hero, 'antiMagic') ? 1 + (bonus - 1) * restrictionRules.antiMagic : bonus;
              if (advantage) note(id, 'advantage');
            }
            return multiplier;
          };
          // Anti-magic halves Magic; Power only turns elemental through an infused weapon.
          const magic = hero.member.damageStat === 'magic';
          const base = magic ? hero.member.magic * (ignores(hero, 'antiMagic') ? 1 : magicFactor) : hero.member.power;
          const element = hero.member.weaponElement;
          const physical = magic ? 0 : base * (element ? infusionRules.physicalShare : 1);
          const elemental = magic
            ? base * wheel(element)
            : element
              ? (base * infusionRules.elementalShare + hero.member.power * infusionRules.bonusShare) * wheel(element)
              : 0;
          const critBonus = hero.member.abilities.reduce((sum, a) => sum + (a.kind === 'critBonus' ? a.chance : 0), 0);
          // A Duelist's crits hit harder in a fight against a lone enemy.
          const duel = enemies.length === 1 ? own(hero, 'singleEnemyCrit') : undefined;
          const onCrit = duel ? () => note(id, 'duel') : critBonus > 0 ? () => note(id, 'crit') : undefined;
          const hit = roll(physical + elemental, hero.member.crit / 100 + critBonus, onCrit, duel?.multiplier);
          const damage = hit * fortune * bonus * hero.fed;
          target.hp -= damage;
          add(result.dealt, id, damage);
          attacked.add(id);
          // Cleave splashes onto the next living enemy after the target.
          if (hero.keywords.has('cleave')) {
            const splashTarget = enemies.slice(enemies.indexOf(target) + 1).find((e) => e.hp > 0);
            if (splashTarget) {
              const splash = damage * gearKeywordRules.cleave.splash;
              splashTarget.hp -= splash;
              add(result.dealt, id, splash);
            }
          }
          // Stagger makes the target lose its next attack, once at a time.
          if (
            hero.keywords.has('stagger') &&
            target.hp > 0 &&
            !target.staggered &&
            rng.chance(gearKeywordRules.stagger.chance)
          ) {
            target.staggered = true;
          }
          if (second) return;
          const living = enemies.filter((e) => e.hp > 0);
          const gap = living.length > 0 ? hero.member.speed - Math.max(...living.map((e) => e.def.speed)) : 0;
          if (gap > 0 && rng.chance(Math.min(rules.speed.secondAttackPerPoint * gap, rules.speed.max))) heroAttack(true);
        };
        heroAttack();
      }
    };
    /** A protector takes a share of the hits aimed at the most hurt ally. */
    const shielded = (target: HeroState, amount: number) => {
      // A sweep can knock out the whole party before it reaches this hero.
      const living = alive();
      if (!living.includes(target)) return amount;
      const lowest = living.reduce((low, h) => (h.hp / h.member.maxHp < low.hp / low.member.maxHp ? h : low));
      if (lowest !== target) return amount;
      const protector = alive().find((h) => h !== target && own(h, 'protect'));
      if (!protector) return amount;
      const moved = amount * own(protector, 'protect')!.share;
      note(protector.member.heroId, 'protect', { allyId: target.member.heroId });
      hurt(protector, moved, result);
      return amount - moved;
    };
    const enemiesAttack = (round: number) => {
      for (const enemy of enemies.filter((e) => e.hp > 0)) {
        // A staggered enemy loses this attack.
        if (enemy.staggered) {
          enemy.staggered = false;
          continue;
        }
        // A drugged boss sleeps through the fight's first rounds.
        if (weakness?.freeRounds && round <= weakness.freeRounds) continue;
        // The boss encounter takes the brute's extra damage, effect or not.
        const boss: BossDef | null = isBoss || 'effect' in enemy.def ? (enemy.def as BossDef) : null;
        const enraged = boss?.effect === 'enrage' && !weakness?.noEnrage && enemy.hp < enemy.maxHp / 2;
        const beast = enemyTags(enemy.def).includes('beast');
        const base =
          enemy.def.damage *
          (enraged ? rules.enrageMultiplier : 1) *
          (boss ? bruteDamage : 1) *
          (beast ? beastDamage : 1) *
          (weakness?.damageCut ? 1 - weakness.damageCut : 1);
        const sweeping = boss?.effect === 'sweep' && !weakness?.noSweep;
        const targets =
          sweeping
            ? alive()
            : alive().length
              ? [
                  rng.weighted(
                    alive(),
                    (h) => h.member.threat * (h.keywords.has('guard') ? gearKeywordRules.guard.targetWeight : 1),
                  ),
                ]
              : [];
        for (const hero of targets) {
          // Quick heroes slip out of the way.
          if (rng.chance(Math.min(hero.member.evasion, rules.evasionCap) / 100)) continue;
          // Parry turns a physical hit away entirely.
          if (enemy.def.damageType === 'power' && hero.keywords.has('parry') && rng.chance(gearKeywordRules.parry.chance)) {
            continue;
          }
          const element = enemyElement(enemy.def);
          let incoming = roll(sweeping ? base * rules.sweepShare : base) * elementFactor(hero, element);
          // The Element threat bites heroes without Resist.
          if (element !== undefined && element === elementThreat?.element && !hero.member.resists.includes(element)) {
            incoming *= elementalDamage;
          }
          // Power hits are blunted by Armour, Magic by Resistance.
          const defence = enemy.def.damageType === 'power' ? hero.member.armour : hero.member.resistance;
          let taken = (incoming * 100) / (100 + rules.defenseFactor * defence) / fortune;
          // Brace softens the first big hit of the fight.
          if (
            hero.keywords.has('brace') &&
            !braced.has(hero.member.heroId) &&
            taken > gearKeywordRules.brace.above * hero.member.maxHp
          ) {
            braced.add(hero.member.heroId);
            taken *= gearKeywordRules.brace.multiplier;
          }
          hurt(hero, shielded(hero, taken), result);
          tookDamage(hero, element);
          if (escaped) return;
        }
      }
    };

    const maxRounds = guaranteed ? rules.maxRounds * 10 : rules.maxRounds;
    for (let round = 1; round <= maxRounds; round++) {
      result.rounds = round;
      // An exposed fight gives the enemies the first strike; after that it plays like any fight.
      const ambushed = enemiesFirst && round === 1;
      // Reach acts before the enemies in round 1 of every fight, exposed or not.
      const reach = round === 1 ? alive().filter((h) => h.keywords.has('reach')) : [];
      if (reach.length > 0) {
        heroesAttack(reach);
        if (enemies.every((e) => e.hp <= 0)) {
          result.cleared = true;
          return;
        }
      }
      // Heroes at least as fast as the fastest living enemy strike first; the rest strike after them.
      const rest = alive().filter((h) => !reach.includes(h));
      const fastest = Math.max(...enemies.filter((e) => e.hp > 0).map((e) => e.def.speed));
      const quick = ambushed ? rest : rest.filter((h) => h.member.speed >= fastest);
      const slow = ambushed ? [] : rest.filter((h) => h.member.speed < fastest);
      if (ambushed) enemiesAttack(round);
      if (escaped || alive().length === 0) return;
      // Raised enemies strike every round and are never targeted.
      for (const ally of allies) {
        const target = enemies.find((e) => e.hp > 0);
        if (!target) break;
        target.hp -= ally.def.damage * ally.damage;
        note(ally.heroId, 'allies', { tag: ally.tag });
      }
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
  };

  /** A fight with the wounds the briefing's missed threats inflict around it. */
  const runFight = (
    enemyDefs: (MobDef | BossDef)[],
    result: EncounterResult,
    enemiesFirst: boolean,
    isBoss = false,
    weakness?: WeaknessEffect,
  ) => {
    if (enemiesFirst) result.effects.push({ heroId: null, key: 'exposed' });
    // Enemy casters wound one hero before every fight.
    for (const penalty of casterWounds) {
      const victims = alive();
      if (victims.length === 0) break;
      const victim = rng.weighted(victims, () => 1);
      result.effects.push({ heroId: victim.member.heroId, key: 'casters' });
      hurt(victim, penalty.pct * victim.member.maxHp, result);
    }
    const allies = raised;
    raised = [];
    fight(enemyDefs, result, enemiesFirst, isBoss, weakness, allies);
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
      for (const hero of alive()) hurt(hero, penalty.pct * hero.member.maxHp, result);
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
        heal(lowest, gearKeywordRules.mend.pct, result);
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

  /** A quiet step: cleared, nothing happens, no log line. */
  const quietResult = (name: string): EncounterResult => {
    const result = emptyResult('quiet', name);
    result.cleared = true;
    return result;
  };

  /** A local's tip: the next trap is skipped. */
  let tipped = false;

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
    if (scored.kitHeroId) taken.kitHeroId = scored.kitHeroId;
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
      // A local's tip: the next trap is skipped.
      if (tipped) {
        tipped = false;
        result.effects.push({ heroId: null, key: 'tip' });
        return result;
      }
      // A met threat's trap never catches anyone; the worse it was missed, the harder it bites.
      result.trapTriggered = trapWounds > 0;
      if (trapWounds > 0) {
        const reducer = withAbility('trapReduce');
        if (reducer) result.effects.push({ heroId: reducer.hero.member.heroId, key: 'trapReduce' });
        const reduce = reducer?.ability.multiplier ?? 1;
        const caught = encounter.targets === 'all' ? alive() : [rng.weighted(alive(), () => 1)];
        for (const hero of caught) {
          const raw = trapWounds * hero.member.maxHp * reduce * elementFactor(hero, encounter.element);
          hurt(hero, raw, result);
          tookDamage(hero, encounter.element);
        }
      }
      result.cleared = alive().length > 0;
      return result;
    }
    if (encounter.type === 'locals') {
      // Locals are live only when the briefing has the locals threat.
      const score = scores.threats.find((t) => t.threat.id === 'locals');
      if (!score) return quietResult(npcById[encounter.npcId].name);
      const npc = npcById[encounter.npcId];
      const result = emptyResult('locals', npc.name);
      const hostile = [{ mobId: npcMobId(npc.id, dungeon.tier), count: npc.hostile.count }];
      const thief = withAbility('pickpocket');
      result.cleared = true;
      if (thief && (score.intimidated || score.state !== 'met')) {
        result.effects.push({ heroId: thief.hero.member.heroId, key: 'pickpocket' });
      }
      const fightThem = () => {
        result.reaction = 'fight';
        result.mobs = hostile;
        result.cleared = false;
        runFight(expand(hostile), result, false);
      };
      if (score.state === 'met' && !score.intimidated) {
        result.reaction = 'help';
        result.help = npc.help;
        const { help } = npc;
        if (help.kind === 'heal') alive().forEach((hero) => heal(hero, help.pct, result));
        if (help.kind === 'gold') result.gold = Math.round(help.share * dungeon.gold[1]);
        if (help.kind === 'tip') tipped = true;
      } else if (thief && (score.intimidated || score.state !== 'met')) {
        // Intimidated locals keep their distance; unfriendly ones lose their purse first.
        result.reaction = 'steal';
        result.gold = Math.round(localsRules.pickpocketGoldShare * dungeon.gold[1]);
        if (rng.chance(localsRules.noticeChance)) {
          result.noticed = true;
          result.mobs = hostile;
          result.cleared = false;
          runFight(expand(hostile), result, false);
        }
      } else if (!score.intimidated && score.state !== 'met' && rng.chance(extraFight)) {
        fightThem();
      } else {
        result.reaction = 'neutral';
      }
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
  const guarantee = (threatId: 'traps' | 'locals', type: 'trap' | 'locals') => {
    if (!activeBriefing.threats.some((t) => t.id === threatId) || drawn(type)) return;
    const entry = dungeon.encounters.find((e) => e.type === type);
    if (entry && lastFree >= 0) steps[lastFree--] = entry;
  };
  guarantee('traps', 'trap');
  guarantee('locals', 'locals');
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
      const result = runEncounter(steps[i]);
      encounters.push(result);
      if (!result.cleared) break;
      if (i === midpoint && i < encounterCount - 1) opportunity = resolveOpportunity(result);
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
    encounters.push(result);
  }

  const encountersCleared = encounters.filter((e) => e.cleared).length;
  const bossDefeated = encounters.some((e) => e.kind === 'boss' && e.cleared);
  const anyKnockedOut = encounters.some((e) => e.knockedOut.length > 0);
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
    encounters,
    encounterCount,
    encountersCleared,
    bossDefeated,
    outcome,
    bonusGold: encounters.reduce((sum, e) => sum + e.gold, 0) + (opportunity?.gold ?? 0) + fenceGold,
    hp: heroes.map((h) => ({ heroId: h.member.heroId, hp: Math.round(h.hp), maxHp: h.member.maxHp })),
    consumed: encounters.flatMap((e) => e.consumed),
    attacked: [...attacked],
    damageElements,
    elixirsUsed,
    weaknessUsedBy,
    ...(escaped ? { escaped: true } : {}),
    threats: scores.threats,
    opportunity,
    lostLoot,
    delay,
    signed,
    meal,
    potionsDrunk,
    carriedHealed,
    fenceGold,
  };
}
