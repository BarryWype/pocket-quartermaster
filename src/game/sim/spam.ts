import { dungeons } from '@/content/dungeons';

import { resolveExpedition, startExpedition } from '../expeditions/expeditions';
import type { SaveData } from '../save';
import { currentHp, maxHp } from '../team/health';
import { expectedLevels } from './config';
import { referenceTeam } from './reference';
import { targets, type Targets } from './targets';

export type SpamResult = { xpPerHour: number; goldPerHour: number };
export type SpamCheck = {
  dungeonId: string;
  hours: number;
  /** The same 3 heroes every time. */
  spam: SpamResult;
  /** The 3 healthiest of 6 every time. */
  rotate: SpamResult;
  /** Rotate ÷ spam, for XP and for gold. */
  ratio: { xp: number; gold: number };
  ok: boolean;
};

/**
 * Sends one party at a time to the shortest tier 1 dungeon, relaunching as
 * soon as it is back, for `hours`: either always the same three heroes, or
 * the three healthiest of a roster of six (two sets of the starting classes
 * in tier 1 gear and plenty of supply). No potions: a spammer would need one
 * per hero every few minutes.
 */
export function spamCheck(hours = 8, t: Targets = targets): SpamCheck {
  const dungeon = dungeons.filter((d) => d.tier === 1).sort((a, b) => a.durationMinutes - b.durationMinutes)[0];
  const play = (rotate: boolean): SpamResult => {
    let save: SaveData = referenceTeam(['warrior', 'ranger', 'fireMage', 'warrior', 'ranger', 'fireMage'], 1, 'normal', expectedLevels[0]);
    save = { ...save, consumables: { trailMix: 10_000 } };
    save = { ...save, heroes: save.heroes.map((h) => ({ ...h, equipment: { ...h.equipment, consumable: null } })) };
    const ids = save.heroes.map((h) => h.id);
    const start = Date.UTC(2026, 10, 2, 8);
    const end = start + hours * 3_600_000;
    let now = start;
    let xp = 0;
    let gold = 0;
    for (let i = 0; now < end; i++) {
      const share = (id: string) => {
        const hero = save.heroes.find((h) => h.id === id)!;
        return currentHp(save, hero, now) / maxHp(save, hero);
      };
      const party = rotate ? [...ids].sort((a, b) => share(b) - share(a)).slice(0, 3) : ids.slice(0, 3);
      save = startExpedition({ ...save, nextUid: 1000 + i }, dungeon.id, party, now);
      const expedition = save.expeditions[0];
      const result = resolveExpedition(save, expedition);
      save = result.save;
      xp += result.report.xp * party.length;
      gold += result.report.gold;
      now = expedition.endsAt;
    }
    return { xpPerHour: Math.round(xp / hours), goldPerHour: Math.round(gold / hours) };
  };
  const spam = play(false);
  const rotate = play(true);
  const ratio = {
    xp: Math.round((rotate.xpPerHour / Math.max(1, spam.xpPerHour)) * 100) / 100,
    gold: Math.round((rotate.goldPerHour / Math.max(1, spam.goldPerHour)) * 100) / 100,
  };
  return { dungeonId: dungeon.id, hours, spam, rotate, ratio, ok: ratio.xp >= t.spamAdvantage && ratio.gold >= t.spamAdvantage };
}
