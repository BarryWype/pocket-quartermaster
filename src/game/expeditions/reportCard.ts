// The report card's sections, from a report: the outcome line, the player's
// own work, what would have helped, and the hero of the run. The component
// (components/ReportCard.tsx) only renders them.

import type { ImageSourcePropType } from 'react-native';

import { affixById } from '@/content/affixes';
import { expeditionRules } from '@/content/dungeons';
import { elementInfo } from '@/content/elements';
import { familyById, familyOfThreat, type FamilyId } from '@/content/families';
import { heroTitleById } from '@/content/heroTitles';
import { dungeonById, earnedNameText, itemById, threatById } from '@/content/lookup';
import { formatDuration, formatPercent, getLocale, t, tr } from '@/i18n';

import type { ExpeditionReport, HeroState } from '../types';
import { contributionSize, type Contribution, type RunTally } from './tally';

/** One line of the card: its source's icon, then the sentence. */
export type CardLine = { emoji: string; icon?: ImageSourcePropType; text: string; /** A name earned: drawn with a flourish. */ flourish?: true };

export type HeroOfRunReason = 'bossKill' | 'damage' | 'healing' | 'taken';

export type ReportCardView = {
  /** Won, retreated or lost, with the duration. */
  outcome: string;
  /** Up to `card.workLines` lines, the largest contributions first. */
  work: CardLine[];
  /** The single largest fixable cost: only on a loss, a retreat or a win with a knockout. */
  helped: CardLine | null;
  hero: { heroId: string; reason: HeroOfRunReason; text: string } | null;
  /** Titles earned and companionships formed, under the hero of the run. */
  heroNews: CardLine[];
};

type Rules = typeof expeditionRules;
type Heroes = Pick<HeroState, 'id' | 'name'>[];

const won = (report: ExpeditionReport) => report.outcome === 'flawless' || report.outcome === 'success';

function outcomeLine(report: ExpeditionReport): string {
  const kind = won(report) ? 'won' : report.outcome === 'retreat' ? 'retreated' : 'lost';
  const cleared = { cleared: report.encountersCleared, count: report.encounterCount };
  if (report.startedAt === undefined) return t(`expeditions.card.outcome.${kind}`, cleared);
  return t(`expeditions.card.outcomeIn.${kind}`, { ...cleared, time: formatDuration(report.finishedAt - report.startedAt, false) });
}

/** What a contribution came from, as the card names it, and its icon. */
function source(c: Contribution, report: ExpeditionReport, name: (heroId: string | null) => string): { emoji: string; icon?: ImageSourcePropType; text: string } | null {
  switch (c.kind) {
    case 'affix': {
      const affix = affixById[c.id];
      const item = c.itemId ? itemById[c.itemId] : undefined;
      if (!affix) return null;
      const affixName = getLocale() === 'fr' ? affix.nameFr : affix.name;
      if (!item) return { emoji: '✨', text: t('expeditions.card.source.affix', { hero: name(c.heroId), affix: affixName }) };
      return { emoji: item.emoji, text: t(c.forged ? 'expeditions.card.source.pieceForged' : 'expeditions.card.source.piece', { hero: name(c.heroId), item: tr(item.name), affix: affixName }) };
    }
    case 'family': {
      const family = familyById[c.id.replace(/\d+$/, '') as FamilyId];
      if (!family) return null;
      return { emoji: family.emoji, icon: family.icon, text: t('expeditions.card.source.family', { family: tr(family.name) }) };
    }
    case 'meal': {
      const meal = report.mealId ? itemById[report.mealId] : undefined;
      return meal ? { emoji: meal.emoji, text: tr(meal.name) } : null;
    }
    default: {
      const item = itemById[c.id];
      if (!item) return null;
      return { emoji: item.emoji, text: t('expeditions.card.source.item', { hero: name(c.heroId), item: tr(item.name) }) };
    }
  }
}

/** The sentence for a contribution's largest amount. */
function workText(c: Contribution, from: string, report: ExpeditionReport, tally: RunTally, meanMaxHp: number, rules: Rules, name: (heroId: string | null) => string): string {
  const { worth } = rules.tally;
  const amounts = [
    ['damage', c.damage],
    ['prevented', c.prevented],
    ['healing', c.healing],
    ['turns', c.turns * worth.turn * meanMaxHp],
    ['fights', c.fights * worth.fight * meanMaxHp],
    ['saves', c.saves * worth.save * meanMaxHp],
  ] as const;
  const [main] = amounts.reduce((best, a) => (a[1] > best[1] ? a : best));
  if (c.kind === 'consumable' && c.boss && c.stood && c.heroId && main !== 'damage') {
    return t('expeditions.card.work.boss', { source: from, hero: name(c.heroId), boss: tr(dungeonById[report.dungeonId].boss.name) });
  }
  if (main === 'damage') {
    const dealt = tally.heroes.reduce((sum, h) => sum + h.dealt, 0);
    const share = dealt > 0 ? c.damage / dealt : 0;
    if (share >= rules.card.damageShareFrom) return t('expeditions.card.work.damageShare', { source: from, pct: formatPercent(share) });
    return t('expeditions.card.work.damage', { source: from, count: c.damage });
  }
  const count = main === 'turns' ? c.turns : main === 'fights' ? c.fights : main === 'saves' ? c.saves : c[main];
  return t(`expeditions.card.work.${main}`, { source: from, count });
}

/** A family's levels as one contribution (`pack1` and `pack2` read as "Your Pack tags"). */
function byFamily(contributions: Contribution[]): Contribution[] {
  const merged = new Map<string, Contribution>();
  for (const c of contributions) {
    const key = c.kind === 'family' ? `family|${c.id.replace(/\d+$/, '')}` : `${c.kind}|${c.id}|${c.heroId}`;
    const held = merged.get(key);
    if (!held) merged.set(key, c);
    else
      merged.set(key, {
        ...held,
        damage: held.damage + c.damage,
        prevented: held.prevented + c.prevented,
        healing: held.healing + c.healing,
        turns: held.turns + c.turns,
        fights: held.fights + c.fights,
        saves: held.saves + c.saves,
      });
  }
  return [...merged.values()];
}

/** The largest contributions over the threshold, as lines. */
function workLines(report: ExpeditionReport, tally: RunTally, meanMaxHp: number, rules: Rules, name: (heroId: string | null) => string): CardLine[] {
  return byFamily(tally.contributions)
    .filter((c) => contributionSize(c, meanMaxHp, rules.tally.worth) >= rules.card.workThreshold * meanMaxHp)
    .sort((a, b) => contributionSize(b, meanMaxHp, rules.tally.worth) - contributionSize(a, meanMaxHp, rules.tally.worth))
    .flatMap((c) => {
      const from = source(c, report, name);
      return from ? [{ emoji: from.emoji, icon: from.icon, text: workText(c, from.text, report, tally, meanMaxHp, rules, name) }] : [];
    })
    .slice(0, rules.card.workLines);
}

/** The missed threat that cost the most, in the briefing's words, and the tags that would have answered it. */
function helpedLine(report: ExpeditionReport, tally: RunTally): CardLine | null {
  const knockedOut = tally.heroes.some((h) => h.knockouts > 0);
  if (won(report) && !knockedOut) return null;
  const worst = report.threats
    .filter((th) => th.state !== 'met' && tally.threats[th.id])
    .map((th) => ({ th, cost: tally.threats[th.id]! }))
    .sort((a, b) => b.cost.taken + b.cost.lost - (a.cost.taken + a.cost.lost))[0];
  if (!worst) return null;
  const { th, cost } = worst;
  const def = threatById[th.id];
  const threat = th.element ? tr(elementInfo[th.element].name) : tr(def.name);
  const family = tr(familyById[familyOfThreat(th.id)].name);
  const costText =
    cost.firstStrikes > 0
      ? t('expeditions.card.helped.firstStrikes', { count: cost.firstStrikes })
      : cost.taken >= cost.lost
        ? t('expeditions.card.helped.taken', { count: cost.taken })
        : t('expeditions.card.helped.lost', { count: cost.lost });
  const short = th.short ?? (th.state === 'half' ? 1 : th.level);
  return {
    emoji: th.element ? elementInfo[th.element].emoji : def.emoji,
    icon: th.element ? undefined : def.icon,
    text: t(`expeditions.card.helped.${th.state === 'half' ? 'half' : 'missed'}`, { threat, cost: costText, fix: t('expeditions.card.helped.fix', { count: short, family }) }),
  };
}

/**
 * The hero who did the most for the party, in HP: damage dealt, healing given
 * and (standing heroes only) a share of the hits taken, over the party's total,
 * plus a bonus for the boss's killing blow. Their reason is the killing blow,
 * else what they did most of in the party.
 */
export function pickHeroOfRun(tally: RunTally, rules: Rules = expeditionRules): { heroId: string; reason: HeroOfRunReason } | null {
  const { heroOfRun: weights } = rules.card;
  const parts = (h: RunTally['heroes'][number]): [HeroOfRunReason, number][] => [
    ['damage', h.dealt],
    ['healing', h.healing],
    ['taken', h.knockouts === 0 ? h.taken * weights.taken : 0],
  ];
  const total = tally.heroes.reduce((sum, h) => sum + parts(h).reduce((n, [, hp]) => n + hp, 0), 0);
  if (total <= 0) return null;
  const scored = tally.heroes.map((h) => {
    const own = parts(h);
    const score = own.reduce((n, [, hp]) => n + hp, 0) / total + (h.bossKill ? weights.bossKill : 0);
    const leads = own.filter(([, hp], i) => hp > 0 && tally.heroes.every((o) => o === h || parts(o)[i][1] < hp));
    const reason = h.bossKill ? 'bossKill' : (leads.length > 0 ? leads : own).reduce((best, p) => (p[1] > best[1] ? p : best))[0];
    return { heroId: h.heroId, score, reason };
  });
  const { heroId, reason } = scored.reduce((top, s) => (s.score > top.score ? s : top));
  return { heroId, reason };
}

/** The hero of the run, with the sentence that says why. */
function heroOfRun(report: ExpeditionReport, tally: RunTally, rules: Rules, name: (heroId: string | null) => string): ReportCardView['hero'] {
  const pick = pickHeroOfRun(tally, rules);
  if (!pick) return null;
  const h = tally.heroes.find((hero) => hero.heroId === pick.heroId)!;
  const dealt = tally.heroes.reduce((sum, o) => sum + o.dealt, 0);
  const vars = {
    hero: name(h.heroId),
    boss: tr(dungeonById[report.dungeonId].boss.name),
    pct: formatPercent(dealt > 0 ? h.dealt / dealt : 0),
    count: pick.reason === 'healing' ? h.healing : h.taken,
  };
  return { ...pick, text: t(`expeditions.card.hero.${pick.reason}`, vars) };
}

/** The gear that earned or grew its name on the run, one line each. */
export function gearNameLines(report: ExpeditionReport): CardLine[] {
  return (report.gearNames ?? []).flatMap(({ itemId, name, grew }) => {
    const item = itemById[itemId];
    const text = earnedNameText(name);
    if (!item || !text) return [];
    return [{ emoji: item.emoji, text: t(grew ? 'expeditions.card.work.nameGrew' : 'expeditions.card.work.named', { item: tr(item.name), name: text }), flourish: true as const }];
  });
}

/** The titles earned and the companions made on the run, one line each. */
export function heroNewsLines(report: ExpeditionReport, heroes: Heroes): CardLine[] {
  const name = (heroId: string) => heroes.find((h) => h.id === heroId)?.name ?? t('expeditions.card.someone');
  const news = report.heroNews;
  if (!news) return [];
  return [
    ...news.titles.flatMap(({ heroId, titleId }) => {
      const title = heroTitleById[titleId];
      return title ? [{ emoji: '🏅', text: t('expeditions.card.news.title', { hero: name(heroId), title: tr(title.name) }), flourish: true as const }] : [];
    }),
    ...news.companions.map(([a, b]) => ({ emoji: '🤝', text: t('expeditions.card.news.companions', { a: name(a), b: name(b) }), flourish: true as const })),
  ];
}

/** The report card's sections; reports from before the tally show only the outcome. */
export function reportCard(report: ExpeditionReport, heroes: Heroes, rules: Rules = expeditionRules): ReportCardView {
  const name = (heroId: string | null) => heroes.find((h) => h.id === heroId)?.name ?? t('expeditions.card.someone');
  const outcome = outcomeLine(report);
  const tally = report.tally;
  if (!tally) return { outcome, work: [], helped: null, hero: null, heroNews: heroNewsLines(report, heroes) };
  const meanMaxHp = report.heroHp.reduce((sum, h) => sum + h.maxHp, 0) / Math.max(1, report.heroHp.length);
  return {
    outcome,
    work: [...gearNameLines(report), ...workLines(report, tally, meanMaxHp, rules, name)],
    helped: helpedLine(report, tally),
    hero: heroOfRun(report, tally, rules, name),
    heroNews: heroNewsLines(report, heroes),
  };
}
