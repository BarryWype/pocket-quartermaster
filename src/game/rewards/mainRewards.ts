import { mainRewardPool, mainRewardRules } from '@/content/mainRewards';

import type { Rng } from '../generation/rng';
import { guildBonus } from '../guild/guild';
import type { SaveData } from '../save';
import type { DungeonDef, MainReward, MainRewardKind } from '../types';

type Rules = typeof mainRewardRules;

export type MainRewardOptions = {
  /** Debug: replace the rolls with this reward. */
  force?: MainRewardKind;
  rules?: Rules;
  /** Guild Hall gold bonus: pouches are based on the dungeon's gold roll, so they follow it. */
  goldMultiplier?: number;
  /** Guild Hall main reward bonus on both roll chances (capped at 100%). */
  chanceMultiplier?: number;
};

/** Bonus gold: 2–3× a fresh roll of the dungeon's gold. */
function goldPouch(dungeon: DungeonDef, rng: Rng, rules: Rules, goldMultiplier: number): Extract<MainReward, { kind: 'goldPouch' }> {
  const [min, max] = rules.goldPouchMultiplier;
  const multiplier = min + rng.next() * (max - min);
  return { kind: 'goldPouch', gold: Math.round(rng.int(dungeon.gold[0], dungeon.gold[1]) * multiplier * goldMultiplier) };
}

/**
 * Rolls a successful expedition's main rewards and applies them. A roll may
 * happen (dungeon chance), a boss may roll twice, the first tier 1 boss win and
 * the pity timer guarantee a Sigil, and anything over its cap becomes a gold pouch.
 */
export function grantMainRewards(
  save: SaveData,
  dungeon: DungeonDef,
  rng: Rng,
  finishedAt: number,
  { force, rules = mainRewardRules, goldMultiplier = 1, chanceMultiplier = 1 }: MainRewardOptions = {},
): { save: SaveData; rewards: MainReward[] } {
  const pick = () => rng.weighted(mainRewardPool, (entry) => entry.weight).kind;
  const kinds: MainRewardKind[] = [];
  if (force) {
    kinds.push(force);
  } else {
    const chance = (base: number) => Math.min(1, base * chanceMultiplier);
    if (rng.chance(chance(dungeon.mainRewardChance))) kinds.push(pick());
    if (dungeon.mainRewardExtraRollChance && rng.chance(chance(dungeon.mainRewardExtraRollChance))) kinds.push(pick());
  }
  const firstSigil = !save.firstSigilGiven && dungeon.tier === 1 && !!dungeon.isBoss;
  const pityDue = save.sigilPity >= rules.sigilPityAfter;
  if ((firstSigil || pityDue) && !kinds.includes('sigil')) kinds.push('sigil');

  let next = save;
  const rewards: MainReward[] = [];
  for (const kind of kinds) {
    if (kind === 'sigil' && next.sigils.length < rules.sigilCap + guildBonus(save, 'sigilCap')) {
      next = { ...next, sigils: [...next.sigils, dungeon.tier] };
      rewards.push({ kind: 'sigil', tier: dungeon.tier });
    } else if (kind === 'treasureMap' && next.treasureMaps.length < rules.treasureMapCap) {
      const map = {
        id: `map${next.nextUid}`,
        tier: dungeon.tier,
        expiresAt: finishedAt + rules.treasureMapLifetimeHours * 3_600_000,
        location: null,
      };
      next = { ...next, treasureMaps: [...next.treasureMaps, map], nextUid: next.nextUid + 1 };
      rewards.push({ kind: 'treasureMap', mapId: map.id, tier: map.tier });
    } else if (kind === 'lure') {
      next = { ...next, lures: next.lures + 1 };
      rewards.push({ kind: 'lure' });
    } else {
      // Gold pouches, and Sigils or maps that would go over their cap.
      const pouch = goldPouch(dungeon, rng, rules, goldMultiplier);
      next = { ...next, gold: next.gold + pouch.gold };
      rewards.push(pouch);
    }
  }

  const gotSigil = rewards.some((r) => r.kind === 'sigil');
  return {
    save: {
      ...next,
      sigilPity: gotSigil ? 0 : next.sigilPity + 1,
      firstSigilGiven: next.firstSigilGiven || gotSigil,
    },
    rewards,
  };
}
