import { dungeons } from '@/content/dungeons';
import { itemById } from '@/content/lookup';
import { items } from '@/content/items';

import { tierChain } from '../dungeons/unlock';
import { composeBriefing } from '../threats/compose';
import { estimateOdds } from '../expeditions/odds';
import type { GearDef, HeroClassId, WeaponType } from '../types';
import { expectedLevels, simConfig } from './config';
import { FIT_DAYS, FIT_NOW, prepared } from './difficultyOdds';
import { referenceTeam, weaponFor } from './reference';

/** What `weaponFor` would pick from a given favoured list: the first weapon item in item order whose type is in it. */
export function weaponFromList(tier: number, favoured: WeaponType[]): GearDef {
  return items.find(
    (i): i is GearDef => i.slot === 'weapon' && i.tier === tier && !!i.gearType && favoured.includes(i.gearType as WeaponType),
  )!;
}

/**
 * The reference win odds of a team of three of one class at a tier's end, in
 * Uncommon gear wielding `itemId`: the mean over the fitting days of the tier's
 * chain dungeons (prepared when hard) and its boss (prepared).
 */
export function classWeaponOdds(classId: HeroClassId, tier: number, itemId: string, runs: number): number {
  let save = referenceTeam([classId, classId, classId], tier, 'uncommon', expectedLevels[tier - 1], () => itemById[itemId] as GearDef);
  save = { ...save, clearedDungeons: dungeons.filter((d) => d.tier <= tier).map((d) => d.id) };
  const ids = save.heroes.map((h) => h.id);
  const values: number[] = [];
  for (const day of FIT_DAYS) {
    for (const dungeon of tierChain(tier).filter((d) => !d.overnight)) {
      const briefing = composeBriefing(dungeon, day);
      const withKit = dungeon.difficulty === 'hard' || dungeon.isBoss ? prepared(save, ids, dungeon, briefing) : save;
      values.push(estimateOdds(withKit, ids, dungeon, runs, { now: FIT_NOW, briefing }).success);
    }
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** One class whose favoured weapons changed: its old and new reference weapon's odds per tier. */
export type AffinityChange = {
  classId: HeroClassId;
  tiers: { tier: number; oldWeapon: string; newWeapon: string; oldOdds: number; newOdds: number }[];
};

/** The per-tier reference odds with the old and the new favoured weapon lists, measured with the quick odds machinery. */
export function affinityChanges(changed: { classId: HeroClassId; oldFavoured: WeaponType[] }[], runs = simConfig.quick.runs): AffinityChange[] {
  return changed.map(({ classId, oldFavoured }) => ({
    classId,
    tiers: [1, 2, 3, 4, 5].map((tier) => {
      const oldWeapon = weaponFromList(tier, oldFavoured).id;
      const newWeapon = weaponFor(classId, tier)!.id;
      return { tier, oldWeapon, newWeapon, oldOdds: classWeaponOdds(classId, tier, oldWeapon, runs), newOdds: classWeaponOdds(classId, tier, newWeapon, runs) };
    }),
  }));
}
