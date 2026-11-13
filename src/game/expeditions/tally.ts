// Who did what in a run: per-hero tallies, what each affix, family level,
// consumable, meal and weakness item added, and what each missed threat cost.
// The run collects them as it plays (simulate.ts, `tally: true`) without
// touching its random stream; the report keeps a trimmed copy.

import { expeditionRules } from '@/content/dungeons';

import type { Tag, ThreatId } from '../types';

/** What a contribution came from: an affix on the hero's worn gear, a family level (`wild1`), a consumable or potion slot item, the meal, or a boss weakness item. */
export type ContributionKind = 'affix' | 'family' | 'consumable' | 'meal' | 'weakness';

export type Contribution = {
  kind: ContributionKind;
  /** Affix id, family effect id (family and level), item id, or the meal effect's kind. */
  id: string;
  /** The hero it belongs to; null for the party's family levels and the meal. */
  heroId: string | null;
  /** Enemy HP it took off (extra damage, or a whole hit, poison or summon). */
  damage: number;
  /** Damage it kept off the party. */
  prevented: number;
  healing: number;
  /** Enemy turns it cost the enemies. */
  turns: number;
  /** Fights it skipped. */
  fights: number;
  /** Knockouts it held off or undid. */
  saves: number;
  /** A consumable that fired in the boss fight. */
  boss?: boolean;
  /** A consumable whose hero was still standing at the end of the encounter it fired in. */
  stood?: boolean;
  /** On the report, an affix's piece: the hero's worn piece carrying the most of it, and whether the player forged it. */
  uid?: string;
  itemId?: string;
  forged?: true;
};

export type HeroTally = {
  heroId: string;
  dealt: number;
  taken: number;
  /** Healing the hero gave (their abilities, specials and own gear; consumables count for the consumable). */
  healing: number;
  kills: number;
  /** Kills of elites and bosses. */
  eliteKills: number;
  /** Kills by enemy tag (an enemy with two tags counts for both), for the gear’s earned names; reports from before it have none. */
  killTags?: Partial<Record<Tag, number>>;
  /** The killing blow on the dungeon's boss. */
  bossKill: boolean;
  knockouts: number;
  /** Specials fired (a miss doesn't count). */
  specials: number;
};

/** What a missed threat cost the run. */
export type ThreatCost = {
  /** Extra damage the party took. */
  taken: number;
  /** Damage the party didn't deal: softer hits, and the extra HP of undead. */
  lost: number;
  /** Fights where the enemies struck first. */
  firstStrikes: number;
};

export type RunTally = {
  heroes: HeroTally[];
  contributions: Contribution[];
  threats: Partial<Record<ThreatId, ThreatCost>>;
};

/** A source's share of a hit: `frac` of the damage dealt was its doing (a threat: damage lost per damage dealt). */
export type Share = { kind: ContributionKind | 'threat'; id: string; heroId: string | null; frac: number };

type Amount = 'damage' | 'prevented' | 'healing' | 'turns' | 'fights' | 'saves';

/** The run's running tally; `finish` turns it into a RunTally. */
export function createTally(heroIds: string[]) {
  const contributions = new Map<string, Contribution>();
  const threats: Partial<Record<ThreatId, ThreatCost>> = {};
  const heroes = new Map(heroIds.map((heroId) => [heroId, { healing: 0, kills: 0, eliteKills: 0, killTags: {} as Partial<Record<Tag, number>>, bossKill: false }]));
  /** Consumables that fired, with the encounter they fired in, to settle `boss` and `stood` at the end. */
  const fired: { entry: Contribution; encounter: { kind: string; knockedOut: string[] } }[] = [];

  const entry = (kind: ContributionKind, id: string, heroId: string | null): Contribution => {
    const key = `${kind}|${id}|${heroId ?? ''}`;
    let held = contributions.get(key);
    if (!held) {
      held = { kind, id, heroId, damage: 0, prevented: 0, healing: 0, turns: 0, fights: 0, saves: 0 };
      contributions.set(key, held);
    }
    return held;
  };

  return {
    credit(kind: ContributionKind, id: string, heroId: string | null, amount: Amount, value: number) {
      if (value > 0) entry(kind, id, heroId)[amount] += value;
    },
    /** A consumable fired in this encounter (its amounts are credited separately). */
    fired(id: string, heroId: string, encounter: { kind: string; knockedOut: string[] }) {
      fired.push({ entry: entry('consumable', id, heroId), encounter });
    },
    /** Credits each share of a hit of `amount`. */
    shares(shares: Share[], amount: number) {
      for (const share of shares) {
        if (share.kind === 'threat') this.threat(share.id as ThreatId, 'lost', amount * share.frac);
        else this.credit(share.kind, share.id, share.heroId, 'damage', amount * share.frac);
      }
    },
    threat(id: ThreatId | undefined, amount: keyof ThreatCost, value: number) {
      if (!id || !(value > 0)) return;
      const cost = (threats[id] ??= { taken: 0, lost: 0, firstStrikes: 0 });
      cost[amount] += value;
    },
    healBy(heroId: string | null, amount: number) {
      const hero = heroId ? heroes.get(heroId) : undefined;
      if (hero && amount > 0) hero.healing += amount;
    },
    kill(heroId: string | null, boss: boolean, elite: boolean, tags: readonly Tag[]) {
      const hero = heroId ? heroes.get(heroId) : undefined;
      if (!hero) return;
      hero.kills++;
      for (const tag of tags) hero.killTags[tag] = (hero.killTags[tag] ?? 0) + 1;
      if (elite) hero.eliteKills++;
      if (boss) hero.bossKill = true;
    },
    finish(
      encounters: { kind: string; dealt: Record<string, number>; taken: Record<string, number>; knockedOut: string[]; effects: { heroId: string | null; key: string; missed?: boolean }[] }[],
    ): RunTally {
      for (const { entry, encounter } of fired) {
        if (encounter.kind === 'boss') entry.boss = true;
        if (!encounter.knockedOut.includes(entry.heroId!)) entry.stood = true;
      }
      const sum = (heroId: string, of: (e: (typeof encounters)[number]) => Record<string, number>) =>
        encounters.reduce((total, e) => total + (of(e)[heroId] ?? 0), 0);
      return {
        heroes: [...heroes].map(([heroId, hero]) => ({
          heroId,
          dealt: sum(heroId, (e) => e.dealt),
          taken: sum(heroId, (e) => e.taken),
          ...hero,
          knockouts: encounters.reduce((n, e) => n + e.knockedOut.filter((id) => id === heroId).length, 0),
          specials: encounters.reduce((n, e) => n + e.effects.filter((f) => f.key === 'special' && f.heroId === heroId && !f.missed).length, 0),
        })),
        contributions: [...contributions.values()],
        threats,
      };
    },
  };
}

export type Tally = ReturnType<typeof createTally>;

/** A contribution's size in HP, its turns, fights and saves valued at a share of the party's mean max HP. */
export function contributionSize(c: Contribution, meanMaxHp: number, worth = expeditionRules.tally.worth): number {
  return c.damage + c.prevented + c.healing + (c.turns * worth.turn + c.fights * worth.fight + c.saves * worth.save) * meanMaxHp;
}

/**
 * The tally as a report keeps it: whole numbers, the largest contributions
 * only (`contributionsKept`), threats that cost nothing left out.
 */
export function reportTally(tally: RunTally, meanMaxHp: number, rules = expeditionRules.tally): RunTally {
  const round = (n: number) => Math.round(n);
  const contributions = tally.contributions
    .map((c) => ({ c, size: contributionSize(c, meanMaxHp, rules.worth) }))
    .filter(({ size }) => size >= 1)
    .sort((a, b) => b.size - a.size)
    .slice(0, rules.contributionsKept)
    .map(({ c }) => ({
      ...c,
      damage: round(c.damage),
      prevented: round(c.prevented),
      healing: round(c.healing),
    }));
  const threats = Object.fromEntries(
    Object.entries(tally.threats)
      .map(([id, cost]) => [id, { taken: round(cost.taken), lost: round(cost.lost), firstStrikes: cost.firstStrikes }] as const)
      .filter(([, cost]) => cost.taken + cost.lost + cost.firstStrikes > 0),
  );
  return {
    heroes: tally.heroes.map((h) => ({ ...h, dealt: round(h.dealt), taken: round(h.taken), healing: round(h.healing) })),
    contributions,
    threats,
  };
}
