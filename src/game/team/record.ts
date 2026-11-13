// Heroes with a history: each expedition report adds to the record of every
// hero who went (runs, wins, knockouts, kills, bosses, hero of the run, who
// they ran with). Titles are earned once each from the record
// (content/heroTitles.ts); two heroes who ran together often enough become
// companions. Titles and companions give no stats.

import { dungeonById } from '@/content/lookup';
import { heroRecordRules, heroTitles, type TitleCondition } from '@/content/heroTitles';

import { pickHeroOfRun } from '../expeditions/reportCard';
import type { SaveData } from '../save';
import type { ExpeditionReport, HeroRecord } from '../types';

type Rules = typeof heroRecordRules;

export const emptyRecord = (): HeroRecord => ({
  runs: 0,
  wins: 0,
  knockouts: 0,
  kills: 0,
  bosses: 0,
  heroOfRun: 0,
  tierBossKills: 0,
  cleanStreak: 0,
  patient: 0,
  with: {},
  titles: [],
});

/** The other heroes a hero counts as companions, by id. */
export const companionsOf = (record: HeroRecord | undefined, rules: Rules = heroRecordRules) =>
  Object.entries(record?.with ?? {})
    .filter(([, runs]) => runs >= rules.companionRuns)
    .map(([id]) => id);

/** Who the hero has run with most, and how often; null before their first run with anyone. */
export function mostRunWith(record: HeroRecord | undefined): { heroId: string; runs: number } | null {
  const best = Object.entries(record?.with ?? {}).reduce<[string, number] | null>((top, entry) => (top && top[1] >= entry[1] ? top : entry), null);
  return best ? { heroId: best[0], runs: best[1] } : null;
}

function holds(condition: TitleCondition, record: HeroRecord, rules: Rules): boolean {
  switch (condition.kind) {
    case 'companions':
      return companionsOf(record, rules).length >= condition.count;
    case 'partners':
      return Object.keys(record.with).length >= condition.count;
    default:
      return record[condition.kind] >= condition.count;
  }
}

/** One run as a report tells it: who went, and what each of them did. */
export type RunFacts = {
  heroIds: string[];
  win: boolean;
  /** The boss beaten, if the party won, and whether it is a tier boss. */
  bossBeaten: boolean;
  tierBoss: boolean;
  heroes: { heroId: string; kills: number; knockouts: number; taken: number; healing: number; bossKill: boolean }[];
  heroOfRun: string | null;
};

/** A report's run facts; a report from before the tally only knows who came back at 0 HP. */
export function factsOfReport(report: ExpeditionReport): RunFacts {
  const tally = report.tally;
  const heroes = tally
    ? tally.heroes.map(({ heroId, kills, knockouts, taken, healing, bossKill }) => ({ heroId, kills, knockouts, taken, healing, bossKill }))
    : report.heroHp.map((h) => ({ heroId: h.heroId, kills: 0, knockouts: h.hp <= 0 ? 1 : 0, taken: 0, healing: 0, bossKill: false }));
  return {
    heroIds: report.heroIds,
    win: report.success,
    bossBeaten: report.success,
    tierBoss: !!dungeonById[report.dungeonId]?.isBoss,
    heroes,
    heroOfRun: tally ? (pickHeroOfRun(tally)?.heroId ?? null) : null,
  };
}

export type HeroNews = { titles: { heroId: string; titleId: string }[]; companions: [string, string][] };

/**
 * Adds a run to the record of each hero who went: titles newly earned (the
 * first shown under the name when none is), companionships formed. Pure.
 */
export function noteRunOnHeroes(save: SaveData, facts: RunFacts, rules: Rules = heroRecordRules): { save: SaveData; news: HeroNews } {
  const news: HeroNews = { titles: [], companions: [] };
  const party = facts.heroIds.filter((id) => save.heroes.some((h) => h.id === id));
  const part = (id: string) => facts.heroes.find((h) => h.heroId === id);
  // The patient: the least-damaged hero who healed, in a party of two or more.
  const least = Math.min(...party.map((id) => part(id)?.taken ?? 0));
  const heroes = save.heroes.map((hero) => {
    if (!party.includes(hero.id)) return hero;
    const was = hero.record ?? emptyRecord();
    const own = part(hero.id);
    const knockouts = own?.knockouts ?? 0;
    const together = { ...was.with };
    for (const other of party) {
      if (other === hero.id) continue;
      together[other] = (together[other] ?? 0) + 1;
      if (together[other] === rules.companionRuns && hero.id < other) news.companions.push([hero.id, other]);
    }
    const record: HeroRecord = {
      ...was,
      runs: was.runs + 1,
      wins: was.wins + (facts.win ? 1 : 0),
      knockouts: was.knockouts + knockouts,
      kills: was.kills + (own?.kills ?? 0),
      bosses: was.bosses + (facts.bossBeaten ? 1 : 0),
      heroOfRun: was.heroOfRun + (facts.heroOfRun === hero.id ? 1 : 0),
      tierBossKills: was.tierBossKills + (facts.win && facts.tierBoss && own?.bossKill ? 1 : 0),
      cleanStreak: knockouts > 0 ? 0 : was.cleanStreak + 1,
      patient: was.patient + (party.length > 1 && own && own.healing > 0 && own.taken === least ? 1 : 0),
      with: together,
    };
    const fresh = heroTitles.filter((title) => !record.titles.includes(title.id) && holds(title.condition, record, rules)).map((title) => title.id);
    for (const titleId of fresh) news.titles.push({ heroId: hero.id, titleId });
    const titles = [...record.titles, ...fresh];
    return { ...hero, record: { ...record, titles }, ...(hero.title === undefined && titles.length > 0 ? { title: titles[0] } : {}) };
  });
  return { save: { ...save, heroes }, news };
}

/** Shows one of the hero's earned titles under their name, or none. */
export function chooseTitle(save: SaveData, heroId: string, titleId: string | null): SaveData {
  return {
    ...save,
    heroes: save.heroes.map((hero) =>
      hero.id === heroId && (titleId === null || hero.record?.titles.includes(titleId)) ? { ...hero, title: titleId } : hero,
    ),
  };
}

/** The title to name when dismissing a hero: the one shown, else the last earned; null without any. */
export function standingTitle(hero: { title?: string | null; record?: HeroRecord }): string | null {
  return hero.title ?? hero.record?.titles.at(-1) ?? null;
}

/** The companion pairs in a party, from their records before this run. */
export function companionPairs(save: SaveData, heroIds: string[], rules: Rules = heroRecordRules): [string, string][] {
  const pairs: [string, string][] = [];
  for (const hero of save.heroes) {
    if (!heroIds.includes(hero.id)) continue;
    for (const other of companionsOf(hero.record, rules)) if (heroIds.includes(other) && hero.id < other) pairs.push([hero.id, other]);
  }
  return pairs;
}
