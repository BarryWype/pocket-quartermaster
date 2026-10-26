import { dungeons } from '@/content/dungeons';
import { heroClasses, newHero, startingHeroes } from '@/content/heroes';
import { items } from '@/content/items';
import type { DungeonDef, GearDef, HeroClassId, HeroState, Quality } from '@/game/types';

import { countersFor } from '../dungeons/counters';
import { estimateOdds } from '../expeditions/odds';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import { simConfig, type SimConfig } from './config';

const MATRIX_QUALITIES: Quality[] = ['crappy', 'normal', 'rare'];

export type MatrixRow = {
  dungeonId: string;
  tier: number;
  boss: boolean;
  /** Success with the starting classes, by gear quality. */
  base: Record<string, number>;
  /** The same with the best countering class swapped in, or null when no class counters it. */
  counter: { classId: HeroClassId; odds: Record<string, number> } | null;
};

/** The class's best weapon of a tier: its highest-affinity type. */
function weaponFor(classId: HeroClassId, tier: number) {
  const affinities = heroClasses[classId].affinities;
  return items
    .filter((i): i is GearDef => i.slot === 'weapon' && i.tier === tier && !!i.weaponType && i.weaponType in affinities)
    .sort((a, b) => (affinities[b.weaponType!] ?? 0) - (affinities[a.weaponType!] ?? 0))[0];
}

/** A team in the tier's gear at one quality, each with a healing potion. Traits are left out. */
function team(classes: HeroClassId[], tier: number, quality: Quality, level: number): SaveData {
  const heroes: HeroState[] = classes.map((classId, i) => newHero(`h${i}`, classId, classId, '', level));
  const armour = items.find((i) => i.slot === 'armor' && i.tier === tier)!;
  let save: SaveData = {
    ...createInitialSave(),
    heroes,
    consumables: { healingPotion: classes.length },
    gear: classes.flatMap((classId, i) => [
      { uid: `w${i}`, itemId: weaponFor(classId, tier).id, quality },
      { uid: `a${i}`, itemId: armour.id, quality },
    ]),
  };
  heroes.forEach((hero, i) => {
    save = equip(equip(equip(save, hero.id, 'weapon', `w${i}`), hero.id, 'armor', `a${i}`), hero.id, 'consumable', 'healingPotion');
  });
  return save;
}

function oddsByQuality(classes: HeroClassId[], dungeon: DungeonDef, level: number, runs: number) {
  return Object.fromEntries(
    MATRIX_QUALITIES.map((q) => {
      const save = team(classes, dungeon.tier, q, level);
      return [q, estimateOdds(save, save.heroes.map((h) => h.id), dungeon, runs).success];
    }),
  );
}

/** Every dungeon against the starting classes in its tier's gear, with and without a countering class. */
export function oddsMatrix(config: SimConfig = simConfig): MatrixRow[] {
  const base = startingHeroes.map((h) => h.classId);
  const { runs, levels } = config.matrix;
  return dungeons.map((dungeon) => {
    const level = levels[dungeon.tier - 1];
    const counters = (Object.keys(heroClasses) as HeroClassId[]).filter(
      (c) => !base.includes(c) && countersFor(heroClasses[c].abilities, dungeon).length > 0,
    );
    // The countering class and the starting hero it replaces that do best at Normal (quick estimate).
    let best: { classes: HeroClassId[]; odds: number } | null = null;
    for (const classId of counters) {
      for (let i = 0; i < base.length; i++) {
        const classes = base.map((c, j) => (j === i ? classId : c));
        const save = team(classes, dungeon.tier, 'normal', level);
        const odds = estimateOdds(save, save.heroes.map((h) => h.id), dungeon, Math.ceil(runs / 4)).success;
        if (!best || odds > best.odds) best = { classes, odds };
      }
    }
    return {
      dungeonId: dungeon.id,
      tier: dungeon.tier,
      boss: !!dungeon.isBoss,
      base: oddsByQuality(base, dungeon, level, runs),
      counter: best ? { classId: best.classes.find((c) => !base.includes(c))!, odds: oddsByQuality(best.classes, dungeon, level, runs) } : null,
    };
  });
}
