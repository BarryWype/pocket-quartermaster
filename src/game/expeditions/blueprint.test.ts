import { dungeons } from '@/content/dungeons';
import { rotationDay } from '@/game/dungeons/rotation';
import { blueprintBonusAvailable, guaranteedBlueprint, resolveExpedition, startExpedition } from '@/game/expeditions/expeditions';
import { createInitialSave, type SaveData } from '@/game/save';
import type { ActiveExpedition, DungeonDef } from '@/game/types';

const DAY = 86_400_000;
const ratCellar = dungeons.find((d) => d.id === 'ratCellar')!;

/** A save past the tutorial, with extra known recipes and veterans who win tier 1. */
function saveWith(known: string[], extra: Partial<SaveData> = {}): SaveData {
  return {
    ...createInitialSave(),
    tutorial: { step: 'done', woodSpot: null },
    knownRecipes: [...createInitialSave().knownRecipes, ...known],
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level: 20 })),
    ...extra,
  };
}

/** A successful expedition to `dungeon`, resolved through the game. */
function win(save: SaveData, dungeon: DungeonDef, endsAt: number) {
  const started = startExpedition(save, dungeon.id, save.heroes.map((h) => h.id), endsAt - dungeon.durationMinutes * 60_000, 1, undefined, {});
  const expedition: ActiveExpedition = { ...started.expeditions[0], endsAt, guaranteed: false };
  return resolveExpedition(started, expedition);
}

/**
 * A moment on `day` where the normal blueprint rolls all miss, so the run's
 * teaching (if any) comes from the guaranteed daily blueprint.
 */
function quietMoment(save: SaveData, dungeon: DungeonDef, day: number) {
  for (let i = 0; i < 400; i++) {
    const at = day * DAY + i * 60_000;
    const result = win(save, dungeon, at);
    if (!result.report.recipeId) return { result, at };
  }
  throw new Error('No quiet moment found');
}

describe('guaranteed daily blueprint', () => {
  it('is guaranteed on a pool dungeon’s first win of the day, and never on bosses or overnight quests', () => {
    const day = rotationDay(Date.UTC(2026, 5, 10));
    // A moment where the normal rolls miss: the first win still teaches a blueprint.
    const { result: first, at } = quietMoment(saveWith([]), ratCellar, day);
    expect(first.report.dailyBlueprint).toBeTruthy();
    expect(first.save.knownRecipes).toContain(first.report.dailyBlueprint!);
    expect(blueprintBonusAvailable(first.save, ratCellar.id, at)).toBe(false);

    // The second win of the same day: nothing extra, however the rolls land.
    const second = win(first.save, ratCellar, at + 3_600_000);
    expect(second.report.dailyBlueprint).toBeUndefined();

    const boss = dungeons.find((d) => d.tier === 1 && d.isBoss)!;
    expect(guaranteedBlueprint(saveWith([]), boss)).toBeNull();
    const overnight = dungeons.find((d) => d.overnight && d.tier === 1)!;
    expect(guaranteedBlueprint(saveWith([]), overnight)).toBeNull();
  });

  it('is guaranteed again the next rotation day', () => {
    const day1 = rotationDay(Date.UTC(2026, 5, 10));
    const { result: first } = quietMoment(saveWith([]), ratCellar, day1);
    // The axe (favoured by a roster hero) was taught; the dagger is still unknown.
    expect(first.report.dailyBlueprint).toBe('axe1');
    expect(first.save.knownRecipes).not.toContain('dagger1');

    const day2 = day1 + 1;
    const { result: second } = quietMoment(first.save, ratCellar, day2);
    expect(second.report.dailyBlueprint).toBe('dagger1');
  });

  it('prefers blueprints a roster hero favours, then the drop order', () => {
    // Only Mira favours the staff, so it beats the axe and the dagger despite the drop order.
    const mage = saveWith([], { heroes: [createInitialSave().heroes.find((h) => h.id === 'mira')!] });
    expect(guaranteedBlueprint(mage, ratCellar)).toBe('staff1');
    // No roster hero favours any of the three: the first in the drop order comes.
    const paladin = saveWith([], {
      heroes: [{ ...createInitialSave().heroes[0], classId: 'paladin' as const }],
    });
    expect(guaranteedBlueprint(paladin, ratCellar)).toBe('axe1');
  });

  it('resets with the rotation day', () => {
    const at = rotationDay(Date.UTC(2026, 5, 12)) * DAY;
    const claimed = saveWith([], { blueprintBonusDays: { [ratCellar.id]: rotationDay(at) } });
    expect(blueprintBonusAvailable(claimed, ratCellar.id, at)).toBe(false);
    expect(blueprintBonusAvailable(claimed, ratCellar.id, at + DAY)).toBe(true);
  });

  it('gives nothing when every blueprint is already known', () => {
    const save = saveWith(['axe1', 'dagger1', 'staff1']);
    expect(guaranteedBlueprint(save, ratCellar)).toBeNull();
    const result = win(save, ratCellar, rotationDay(Date.UTC(2026, 5, 11)) * DAY);
    expect(result.report.dailyBlueprint).toBeUndefined();
  });

  it('keeps normal drop chances on every other run', () => {
    const day = rotationDay(Date.UTC(2026, 5, 13));
    // The axe and the dagger are known, the staff is not, and ratCellar's daily
    // guarantee is already claimed: only the normal 15% staff roll can teach it now.
    const start = saveWith(['axe1', 'dagger1'], { blueprintBonusDays: { [ratCellar.id]: day } });
    let save = start;
    let taught = 0;
    for (let i = 1; i <= 40; i++) {
      const before = save.knownRecipes.length;
      save = win(save, ratCellar, day * DAY + i * 60_000).save;
      if (save.knownRecipes.length > before) taught++;
    }
    expect(taught).toBeGreaterThan(0);
  });
});
