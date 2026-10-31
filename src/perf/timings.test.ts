import { startingHeroes } from '@/content/heroes';
import { placeGroups } from '@/content/places';
import { patrolRules } from '@/content/patrols';
import { highestUnlockedTier } from '@/game/expeditions/expeditions';
import { pickaxeTier } from '@/game/gathering/gathering';
import { trackedRange } from '@/game/gathering/walkEffects';
import { generateSpawnsAround } from '@/game/generation/spawns';
import type { LatLng } from '@/game/generation/types';
import { visibleSpawns } from '@/game/generation/visibility';
import { isFightPlace, placeFightBriefing, placeFightOdds } from '@/game/places/fights';
import { isPlaceVisible, placesAround, showsForPlayer, type PlaceSpawn } from '@/game/places/generate';
import { sanctumOdds } from '@/game/sanctums/sanctums';
import { sanctums } from '@/content/sanctums';
import { isPatrolKind, patrolsAround, type PatrolSpawn } from '@/game/patrols/generate';
import { patrolOdds } from '@/game/patrols/fight';
import { isVisible } from '@/game/patrols/visibility';
import { createInitialSave, type SaveData } from '@/game/save';
import { equip } from '@/game/team/team';
import { generateTavernsAround } from '@/game/taverns/taverns';

/**
 * The timing script for issue 13: how long the map's pure computations and the
 * panels' first computations take on a debug save at tier 3 near many places.
 * The numbers are logged, not asserted — run this before and after a change
 * (`npx jest src/perf/timings.test.ts`) and compare.
 */
const POSITION: LatLng = { latitude: -41.2865, longitude: 174.7762 };
const NOW = 1_767_000_000_000;
const MINUTE = Math.floor(NOW / 60_000) * 60_000;
const PARTY = startingHeroes.slice(0, 3).map((hero) => hero.id);
const MAX_FIGHTS = 4;
const MAX_PATROLS = 4;

/** A debug-style save at tier 3: heroes in the tier's weapons and armour, each with a healing potion. */
function debugSave(): SaveData {
  const base = createInitialSave();
  let save: SaveData = {
    ...base,
    tutorial: { ...base.tutorial, step: 'done' },
    clearedDungeons: ['banditStockade', 'ogreQuarry', 'drownedCrypt', 'giantsHall'],
    heroes: base.heroes.map((h) => ({ ...h, level: 5 })),
    consumables: { ...base.consumables, healingPotion: 3 },
    gear: startingHeroes.flatMap((_, i) => [
      { uid: `w${i}`, itemId: `sword3`, quality: 'normal' as const },
      { uid: `a${i}`, itemId: `mail3`, quality: 'normal' as const },
    ]),
  };
  startingHeroes.forEach((hero, i) => {
    save = equip(equip(equip(save, hero.id, 'weapon', `w${i}`), hero.id, 'armor', `a${i}`), hero.id, 'consumable', 'healingPotion');
  });
  return save;
}

/** Runs `run`, logs its duration, and returns its value. */
function perf<T>(name: string, run: () => T): T {
  const start = Date.now();
  const value = run();
  console.log(`PERF ${name}: ${Date.now() - start}ms`);
  return value;
}

describe('map and panel timings (logged, not asserted)', () => {
  const save = debugSave();
  const shownGroups = placeGroups.filter((group) => group.id !== 'tavern');

  it('times the map screen and the panels first computations at tier 3', () => {
    const spawns = perf('map: generateSpawnsAround', () => generateSpawnsAround(POSITION, MINUTE));
    const shown = perf('map: visibleSpawns', () =>
      visibleSpawns(spawns, POSITION, NOW, undefined, trackedRange(save, NOW)).filter(
        ({ spawn }) => !(spawn.id in save.collected),
      ),
    );
    const places = perf('map: placesAround', () => placesAround(POSITION, MINUTE, shownGroups));
    const inSight = perf('map: placesInSight', () =>
      places.filter((place) => isPlaceVisible(place, POSITION, NOW) && !(place.id in save.usedPlaces) && showsForPlayer(place, pickaxeTier(save))),
    );
    const taverns = perf('map: generateTavernsAround', () => generateTavernsAround(POSITION, MINUTE));
    const patrols = perf('map: patrolsAround', () => patrolsAround(POSITION, MINUTE, patrolRules));
    const fights = perf('map: visiblePatrols', () =>
      patrols.filter((spawn) => isPatrolKind(spawn.kind) && isVisible(spawn, POSITION, NOW, patrolRules)),
    );

    // Sanity, so an empty world can't measure as "fast".
    expect(spawns.length).toBeGreaterThan(0);
    expect(places.length).toBeGreaterThan(0);
    expect(inSight.length).toBeGreaterThan(0);

    // The panels' first computations: what opening them used to block on.
    const fightPlaces = inSight.filter((place) => isFightPlace(place.kind)).slice(0, MAX_FIGHTS) as PlaceSpawn[];
    fightPlaces.forEach((place) => {
      const odds = perf(`panel: placeFightOdds (${place.kind})`, () => placeFightOdds(save, place, PARTY, NOW));
      expect(odds.success).toBeGreaterThanOrEqual(0);
      perf(`panel: placeFightBriefing (${place.kind})`, () => placeFightBriefing(save, place));
    });
    const shownPatrols = (fights.length > 0 ? fights : patrols.filter((spawn) => isPatrolKind(spawn.kind))).slice(
      0,
      MAX_PATROLS,
    ) as PatrolSpawn[];
    shownPatrols.forEach((spawn) => {
      const odds = perf(`panel: patrolOdds (${spawn.kind})`, () => patrolOdds(save, spawn, PARTY, NOW));
      expect(odds.success).toBeGreaterThanOrEqual(0);
    });
    // The Sanctum panel's challenge odds are the same kind of simulation.
    const sanctum = sanctums[0];
    perf(`panel: sanctumOdds (${sanctum.id})`, () => sanctumOdds(save, PARTY, sanctum, 3, undefined, NOW));

    // And the Expeditions screen's first computations, for comparison.
    const tier = highestUnlockedTier(save);
    console.log(`PERF tier: ${tier}`);
    console.log(
      `PERF counts: ${spawns.length} spawns (${shown.length} shown), ${places.length} places (${inSight.length} in sight), ` +
        `${taverns.length} taverns, ${patrols.length} patrols (${fights.length} shown)`,
    );
  });
});
