import { heroRecordRules } from '@/content/heroTitles';

import { withCompanionLine } from '../expeditions/log';
import { createRng } from '../generation/rng';
import { toV51 } from '../migrations';
import { createInitialSave, type SaveData } from '../save';
import type { ExpeditionReport, HeroRecord } from '../types';
import { chooseTitle, companionPairs, emptyRecord, factsOfReport, mostRunWith, noteRunOnHeroes, standingTitle, type RunFacts } from './record';

type Part = RunFacts['heroes'][number];
const part = (heroId: string, extra: Partial<Part> = {}): Part => ({ heroId, kills: 0, knockouts: 0, taken: 10, healing: 0, bossKill: false, ...extra });
const facts = (heroes: Part[], extra: Partial<RunFacts> = {}): RunFacts => ({
  heroIds: heroes.map((h) => h.heroId),
  win: true,
  bossBeaten: true,
  tierBoss: false,
  heroes,
  heroOfRun: heroes[0]?.heroId ?? null,
  ...extra,
});
const withRecord = (save: SaveData, heroId: string, record: Partial<HeroRecord>, title?: string | null): SaveData => ({
  ...save,
  heroes: save.heroes.map((h) => (h.id === heroId ? { ...h, record: { ...emptyRecord(), ...record }, ...(title !== undefined ? { title } : {}) } : h)),
});
const record = (save: SaveData, heroId: string) => save.heroes.find((h) => h.id === heroId)!.record!;
const hero = (save: SaveData, heroId: string) => save.heroes.find((h) => h.id === heroId)!;

describe('hero records', () => {
  it('counts the run for everyone who went', () => {
    const { save } = noteRunOnHeroes(
      createInitialSave(),
      facts([part('bram', { kills: 5, knockouts: 1, taken: 40 }), part('lyra', { kills: 2, taken: 5, healing: 12 })], { heroOfRun: 'lyra' }),
    );
    expect(record(save, 'bram')).toMatchObject({ runs: 1, wins: 1, knockouts: 1, kills: 5, bosses: 1, heroOfRun: 0, cleanStreak: 0, patient: 0, with: { lyra: 1 } });
    // Lyra took the least damage and healed: a patient run.
    expect(record(save, 'lyra')).toMatchObject({ runs: 1, kills: 2, heroOfRun: 1, cleanStreak: 1, patient: 1, with: { bram: 1 } });
    expect(record(save, 'mira')).toEqual(emptyRecord());
    expect(mostRunWith(record(save, 'bram'))).toEqual({ heroId: 'lyra', runs: 1 });
  });

  it('earns each title once, shows the first unless the player hid them, and keeps the choice', () => {
    const start = withRecord(createInitialSave(), 'bram', { cleanStreak: 19 });
    const first = noteRunOnHeroes(start, facts([part('bram', { bossKill: true })], { tierBoss: true }));
    expect(first.news.titles).toEqual([
      { heroId: 'bram', titleId: 'giantSlayer' },
      { heroId: 'bram', titleId: 'unbroken' },
    ]);
    expect(hero(first.save, 'bram')).toMatchObject({ title: 'giantSlayer', record: { titles: ['giantSlayer', 'unbroken'] } });
    expect(noteRunOnHeroes(first.save, facts([part('bram', { bossKill: true })], { tierBoss: true })).news.titles).toEqual([]);
    // The player picks among the earned titles, or none.
    expect(hero(chooseTitle(first.save, 'bram', 'unbroken'), 'bram').title).toBe('unbroken');
    expect(hero(chooseTitle(first.save, 'bram', 'oldHand'), 'bram').title).toBe('giantSlayer');
    const hidden = chooseTitle(first.save, 'bram', null);
    expect(hero(noteRunOnHeroes(withRecord(hidden, 'bram', { ...record(hidden, 'bram'), runs: 24 }, null), facts([part('bram')])).save, 'bram').title).toBeNull();
    expect(standingTitle(hero(hidden, 'bram'))).toBe('unbroken');
  });

  it('makes two heroes companions after their 15th run together, and tells the report once', () => {
    let save = withRecord(withRecord(createInitialSave(), 'bram', { with: { lyra: heroRecordRules.companionRuns - 1 } }), 'lyra', { with: { bram: heroRecordRules.companionRuns - 1 } });
    expect(companionPairs(save, ['bram', 'lyra'])).toEqual([]);
    const run = noteRunOnHeroes(save, facts([part('bram'), part('lyra')]));
    expect(run.news.companions).toEqual([['bram', 'lyra']]);
    expect(run.news.titles).toEqual(expect.arrayContaining([{ heroId: 'bram', titleId: 'loyal' }, { heroId: 'lyra', titleId: 'loyal' }]));
    save = run.save;
    expect(companionPairs(save, ['bram', 'lyra', 'mira'])).toEqual([['bram', 'lyra']]);
    expect(noteRunOnHeroes(save, facts([part('bram'), part('lyra')])).news.companions).toEqual([]);
  });

  it('reads an old report without a tally as well as it can', () => {
    const old = { heroIds: ['bram', 'lyra'], success: false, dungeonId: 'millRuins', heroHp: [{ heroId: 'bram', hp: 0, maxHp: 30 }, { heroId: 'lyra', hp: 12, maxHp: 30 }] } as unknown as ExpeditionReport;
    expect(factsOfReport(old)).toMatchObject({ win: false, bossBeaten: false, heroOfRun: null, heroes: [{ heroId: 'bram', knockouts: 1 }, { heroId: 'lyra', knockouts: 0 }] });
  });

  it('starts each hero’s record from the reports still in the save (version 51)', () => {
    const report = (id: string, success: boolean) =>
      ({ id, heroIds: ['bram', 'lyra'], success, dungeonId: 'goblinWarren', heroHp: [{ heroId: 'bram', hp: 10, maxHp: 30 }, { heroId: 'lyra', hp: 0, maxHp: 30 }] }) as unknown as ExpeditionReport;
    const base = createInitialSave();
    const v50 = { ...base, heroes: base.heroes.map(({ record: _record, ...h }) => h), reports: [report('r2', false), report('r1', true)] } as SaveData;
    const next = toV51(v50);
    expect(record(next, 'bram')).toMatchObject({ runs: 2, wins: 1, bosses: 1, cleanStreak: 2, with: { lyra: 2 } });
    expect(record(next, 'lyra')).toMatchObject({ runs: 2, knockouts: 2, cleanStreak: 0 });
    expect(record(next, 'mira')).toEqual(emptyRecord());
    expect(toV51(next)).toBe(next);
  });
});

describe('the companion line', () => {
  const log = ['First fight.', 'Second fight.', 'The goblin chief fell.'];

  it('now and then slips a line between companions among the encounters, never first', () => {
    const lines = Array.from({ length: 40 }, (_, i) => withCompanionLine(log, [['Bram', 'Lyra']], createRng(`c${i}`), 0.5));
    const told = lines.filter((l) => l.length === log.length + 1);
    expect(told.length).toBeGreaterThan(5);
    expect(told.length).toBeLessThan(35);
    for (const l of told) {
      expect(l[0]).toBe(log[0]);
      expect(l.filter((line) => !log.includes(line))[0]).toMatch(/Bram|Lyra/);
    }
  });

  it('adds nothing without companions in the party', () => {
    expect(withCompanionLine(log, [], createRng('x'), 1)).toBe(log);
  });
});
