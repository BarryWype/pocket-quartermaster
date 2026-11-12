import type { ExpeditionRow, RunLog } from './bot';
import { rotationOf } from './rotation';

/** A log with only the fields `rotationOf` reads. */
const log = (parts: { days: number; milestones?: Record<string, number>; daily?: { day: number; roster: number }[]; expeditions?: Partial<ExpeditionRow>[] }): RunLog =>
  ({ milestones: {}, daily: [], expeditions: [], ...parts } as unknown as RunLog);

const run = (day: number, classes: string[], heroIds: string[]) => ({ day, classes, heroIds }) as ExpeditionRow;

describe('rotationOf', () => {
  it("assigns an expedition's day to the tier the bot was in at its start (boss:N milestones)", () => {
    const r = rotationOf([
      log({ days: 10, milestones: { 'boss:1': 5 }, expeditions: [run(4, ['ranger'], ['h1']), run(6, ['ranger'], ['h1'])] }),
    ]);
    expect(r.tiers[1]!.slots.ranger).toBe(1);
    expect(r.tiers[2]!.slots.ranger).toBe(1);
    expect(r.tiers[3]!.slots).toEqual({});
  });

  it("counts a week's distinct heroes once each, however many days they fielded", () => {
    const r = rotationOf([
      log({ days: 7, expeditions: [run(1, ['ranger'], ['h1', 'h2']), run(2, ['ranger'], ['h1', 'h3']), run(3, ['ranger'], ['h2', 'h3'])] }),
    ]);
    expect(r.tiers[1]!.heroesPerWeek.median).toBe(3);
  });

  it('ignores the incomplete last week and gives a tier with no complete week null', () => {
    const r = rotationOf([log({ days: 9, expeditions: [run(8, ['ranger'], ['h1', 'h2', 'h3'])] })]);
    expect(r.tiers[1]!.heroesPerWeek.median).toBe(0);
    expect(r.tiers[2]!.heroesPerWeek.median).toBe(null);
  });

  it('counts only expeditions after the day the roster reached 8 heroes', () => {
    const r = rotationOf([
      log({
        days: 10,
        daily: [{ day: 3, roster: 8 }],
        expeditions: [run(3, ['ranger'], ['h1']), run(4, ['ranger'], ['h1']), run(5, ['ranger'], ['h1']), run(6, ['wizard'], ['h2'])],
      }),
    ]);
    expect(r.topClassShare.median).toBeCloseTo(2 / 3);
    expect(r.topClass).toBe('ranger');
  });

  it('gives null when the roster never reaches 8 heroes', () => {
    const r = rotationOf([log({ days: 5, daily: [{ day: 1, roster: 3 }], expeditions: [run(1, ['ranger'], ['h1'])] })]);
    expect(r.topClassShare.median).toBe(null);
    expect(r.topClass).toBe(null);
  });

  it('takes the fewest weekly distinct heroes from the fromTier on', () => {
    const r = rotationOf([
      log({
        days: 14,
        milestones: { 'boss:1': 5 },
        expeditions: [run(1, ['ranger'], ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']), run(8, ['ranger'], ['h1', 'h2', 'h3', 'h4'])],
      }),
    ]);
    expect(r.fewestHeroesPerWeek.median).toBe(4);
  });
});
