import { dungeons } from '@/content/dungeons';
import { rotationDay } from '@/game/dungeons/rotation';
import { gearId, gearRecipes } from '@/content/equipment';
import { resolveExpedition, startExpedition } from '@/game/expeditions/expeditions';
import { createInitialSave, type SaveData } from '@/game/save';
import type { ActiveExpedition, DungeonDef, GearType } from '@/game/types';

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

/** Every tier 1 gear blueprint id, known or not. */
const tier1Blueprints = (Object.keys(gearRecipes) as GearType[]).map((type) => gearId(type, 1));

describe('the day’s first win', () => {
  it('always teaches a blueprint of the dungeon’s tier, once per rotation day', () => {
    const at = rotationDay(Date.UTC(2026, 5, 10)) * DAY;
    const first = win(saveWith([]), ratCellar, at);
    expect(first.report.success).toBe(true);
    expect(first.report.firstWin).toBe(true);
    expect(first.report.loot.recipeIds.length).toBeGreaterThanOrEqual(1);
    for (const id of first.report.loot.recipeIds) expect(first.save.knownRecipes).toContain(id);

    // A repeat win of the same day rolls no first win.
    const second = win(first.save, ratCellar, at + 3 * 60_000);
    expect(second.report.firstWin).toBeUndefined();
    expect(second.save.firstWinDay).toBe(first.save.firstWinDay);

    // The next rotation day, the guarantee is back.
    const tomorrow = win(first.save, ratCellar, at + DAY);
    expect(tomorrow.report.firstWin).toBe(true);
    expect(tomorrow.report.loot.recipeIds.length).toBeGreaterThanOrEqual(1);
  });

  it('is one per day across all dungeons', () => {
    const at = rotationDay(Date.UTC(2026, 5, 12)) * DAY;
    const first = win(saveWith([]), ratCellar, at);
    expect(first.report.firstWin).toBe(true);
    const other = dungeons.find((d) => d.tier === 1 && d.id !== ratCellar.id && !d.overnight && !d.isBoss)!;
    const second = win(first.save, other, at + 60 * 60_000);
    expect(second.report.success).toBe(true);
    expect(second.report.firstWin).toBeUndefined();
  });

  it('turns into mastery progress when every blueprint of the tier is already known', () => {
    const at = rotationDay(Date.UTC(2026, 5, 11)) * DAY;
    const save = saveWith(tier1Blueprints.filter((id) => !createInitialSave().knownRecipes.includes(id)));
    const result = win(save, ratCellar, at);
    expect(result.report.firstWin).toBe(true);
    expect(result.report.loot.recipeIds).toEqual([]);
    expect(result.report.loot.mastery.length).toBeGreaterThanOrEqual(1);
    for (const entry of result.report.loot.mastery) expect(entry).toMatchObject({ tier: 1, forges: 2 });
  });
});
