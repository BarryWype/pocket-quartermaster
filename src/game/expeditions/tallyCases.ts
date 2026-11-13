import { affixById } from '@/content/affixes';
import { dungeons } from '@/content/dungeons';
import { families } from '@/content/families';
import { startingHeroes } from '@/content/heroes';
import { itemById } from '@/content/lookup';
import { specials } from '@/content/specials';
import { weaknessByBoss } from '@/content/weaknesses';

import { rotationDay } from '../dungeons/rotation';
import { ELEMENTS } from '../elements';
import { createRng } from '../generation/rng';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import { composeBriefing } from '../threats/compose';
import type { ConsumableDef, DungeonDef, SpecialId } from '../types';
import { prepareParty, type PartyMember, type RunOptions } from './simulate';

/** Affix effect kinds a fight reads. */
const COMBAT_KINDS = [
  'damageVs',
  'damageFrom',
  'poisonOnHit',
  'healOnKill',
  'lastStand',
  'fightShield',
  'critVs',
  'firstRoundCrit',
  'specialPower',
  'potionHealing',
  'dotDuration',
  'warding',
  'elementResistAll',
  'magicDamageTaken',
  'partyDamage',
  'targetWeight',
  'critTaken',
  'specialUses',
  'firstRoundSpeed',
];
const AFFIXES = Object.values(affixById)
  .filter((a) => a.effect && COMBAT_KINDS.includes(a.effect.kind))
  .map((a) => a.id);
const CONSUMABLES = ['healingPotion', 'firebomb', 'revivalDraught', 'smokeBomb', 'strengthDraught', 'arcaneTonic', 'ironskinBrew', 'nullrootTincture', 'viperOil', 'quicksilver', 'emberOil'];
const MEALS = ['bossHeal', 'maxHp', 'speed', 'resistance', 'crit', 'penaltyCut'] as const;
const IDS = startingHeroes.map((h) => h.id);

/** The starting heroes at a tier's level, in its sword and mail. */
function tierSave(tier: number): SaveData {
  const base = createInitialSave();
  let save: SaveData = {
    ...base,
    tutorial: { ...base.tutorial, step: 'done' },
    heroes: base.heroes.map((h) => ({ ...h, level: 1 + (tier - 1) * 2 })),
    gear: IDS.flatMap((_, i) => [
      { uid: `w${i}`, itemId: `sword${tier}`, rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      { uid: `a${i}`, itemId: `mail${tier}`, rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
    ]),
  };
  IDS.forEach((id, i) => {
    save = equip(equip(save, id, 'weapon', `w${i}`), id, 'armor', `a${i}`);
  });
  return save;
}

/**
 * A varied run for the tally tests: a real dungeon and briefing, the starting
 * heroes at its tier with random affixes, family tags, specials, consumables,
 * a meal and sometimes the boss's weakness item.
 */
export function tallyCase(i: number): { party: PartyMember[]; dungeon: DungeonDef; options: RunOptions; seed: string } {
  const rng = createRng(`tally-case|${i}`);
  const pick = <T>(items: readonly T[]) => items[rng.int(0, items.length - 1)];
  const dungeon = pick(dungeons.filter((d) => !d.secret));
  const save = tierSave(dungeon.tier);
  const weakness = weaknessByBoss[dungeon.boss.id];
  const party = prepareParty(save, IDS, 0, true).map((m, index) => {
    const item = rng.chance(0.25) && weakness ? weakness.itemId : pick(CONSUMABLES);
    return {
      ...m,
      special: rng.chance(0.8) ? (pick(Object.keys(specials)) as SpecialId) : undefined,
      affixes: Object.fromEntries(Array.from({ length: rng.int(0, 4) }, () => [pick(AFFIXES), rng.int(5, 30)])),
      familyTags: Array.from({ length: rng.int(0, 3) }, () => ({ family: pick(families).id, count: rng.int(1, 4), source: 'gear' as const })),
      consumable: rng.chance(0.8) ? (itemById[item] as ConsumableDef) : null,
      evasion: m.evasion + rng.int(0, 15),
      crit: m.crit + rng.int(0, 15),
      ranged: index === 0 && rng.chance(0.5),
      ...(rng.chance(0.3) ? { weaponElement: pick(ELEMENTS) } : {}),
    };
  });
  const kind = pick(MEALS);
  const meal =
    kind === 'bossHeal'
      ? { kind, pct: 0.3 }
      : kind === 'maxHp'
        ? { kind, multiplier: 1.2 }
        : kind === 'speed'
          ? { kind, add: 2 }
          : kind === 'resistance'
            ? { kind, multiplier: 1.3 }
            : kind === 'crit'
              ? { kind, add: 10 }
              : { kind, threats: ['beasts' as const, 'poison' as const], multiplier: 0.5 };
  return {
    party,
    dungeon,
    options: { briefing: composeBriefing(dungeon, rotationDay(i * 86_400_000)), meal, elixirs: true, optIn: rng.chance(0.5), hunger: pick(['fed', 'underfed'] as const) },
    seed: `tally|${i}`,
  };
}
