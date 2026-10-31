import { rotationRules } from '@/content/rotation';
import { startingHeroes } from '@/content/heroes';
import { dungeons } from '@/content/dungeons';
import { dungeonById } from '@/content/lookup';

import * as compose from '../threats/compose';
import { dailyRotation, openDungeonIds, rotationDay, warmRotationUpTo, type Rotation } from '../dungeons/rotation';
import { highestUnlockedTier, isDungeonUnlocked } from '../dungeons/unlock';
import { createInitialSave, type SaveData } from '../save';
import { equip, isOnExpedition } from '../team/team';
import * as odds from './odds';
import { cachedOdds, storeOdds } from './oddsCache';
import { defaultParty, expeditionOddsKeys } from './oddsWarmup';

const DAY = rotationDay(Date.UTC(2026, 10, 30));
const ALL = startingHeroes.map((hero) => hero.id);

/** The starting heroes at a level, in a tier's weapons and armour (Normal), each with a healing potion. */
function team(tier: number, level: number): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    tutorial: { ...createInitialSave().tutorial, step: 'done' },
    clearedDungeons: ['banditStockade', 'ogreQuarry', 'drownedCrypt', 'giantsHall'],
    heroes: createInitialSave().heroes.map((hero) => ({ ...hero, level })),
    consumables: { ...createInitialSave().consumables, healingPotion: 3 },
    gear: ALL.flatMap((_, i) => [
      { uid: `w${i}`, itemId: 'sword' + tier, quality: 'normal' as const },
      { uid: `a${i}`, itemId: 'mail' + tier, quality: 'normal' as const },
    ]),
  };
  ALL.forEach((id, i) => {
    save = equip(equip(equip(save, id, 'weapon', `w${i}`), id, 'armor', `a${i}`), id, 'consumable', 'healingPotion');
  });
  return save;
}

/** The dungeons the Expeditions screen shows for its default tier, in the screen's order. */
function shownList(save: SaveData, rotation: Rotation) {
  const open = openDungeonIds(rotation)
    .map((id) => dungeonById[id])
    .filter((dungeon) => isDungeonUnlocked(save, dungeon))
    .sort((a, b) => a.tier - b.tier);
  const tier = highestUnlockedTier(save);
  const overnight = dungeons.filter(
    (dungeon) => dungeon.overnight && dungeon.tier === tier && isDungeonUnlocked(save, dungeon),
  );
  return [...open.filter((dungeon) => dungeon.tier === tier), ...overnight];
}

/**
 * The deferral test for issue 17: what the Expeditions screen's first render
 * pays must be nothing cold. After the app-start warm-up (the rotation history
 * replayed in slices), the first render — the rotation read and the odds keys —
 * runs no odds estimate and no replay: a replayed day composes three briefings
 * per tier, so the composeBriefing spy doubles as the replay detector (the
 * rotation now carries the day's briefings, so a warm read composes nothing).
 */
describe('the Expeditions first render defers its cold work', () => {
  it('computes no odds and replays no rotation after the warm-up', () => {
    // App start, as the warm-up runs it: the rotation history replayed in slices.
    let reached = -1;
    while (reached < DAY) reached = warmRotationUpTo(DAY, rotationRules.warmDaysPerSlice);

    const save = team(3, 5);
    const party = defaultParty(save);
    expect(party).toEqual(save.heroes.filter((hero) => !isOnExpedition(save, hero.id)).slice(0, 3).map((hero) => hero.id));

    const estimateOdds = jest.spyOn(odds, 'estimateOdds');
    const estimatePartyOdds = jest.spyOn(odds, 'estimatePartyOdds');
    const composed = jest.spyOn(compose, 'composeBriefing');

    // The first render's synchronous reads: the rotation, then the odds keys.
    const rotation = dailyRotation(DAY);
    const minute = Math.floor(Date.UTC(2026, 10, 30) / 60_000);
    const keys = expeditionOddsKeys(save, party, shownList(save, rotation), rotation, minute);

    // Nothing cold ran: no odds estimate, no replay, no briefing composed.
    expect(estimateOdds).not.toHaveBeenCalled();
    expect(estimatePartyOdds).not.toHaveBeenCalled();
    expect(composed).not.toHaveBeenCalled();
    expect(Object.keys(keys).length).toBeGreaterThan(0);
  });

  it('finds every warmed odds value in the cache after the warm-up', () => {
    const save = team(3, 5);
    const party = defaultParty(save);
    const rotation = dailyRotation(DAY);
    const minute = 5;
    const keys = expeditionOddsKeys(save, party, shownList(save, rotation), rotation, minute);
    expect(Object.keys(keys).length).toBeGreaterThan(0);
    // The warm-up stores every one of them; the screen's read of a key never estimates.
    for (const key of Object.values(keys)) storeOdds(key, { success: 0.5, flawless: 0.2, progress: 0.8 });
    for (const key of Object.values(keys)) expect(cachedOdds(key)).toBeDefined();
  });
});
