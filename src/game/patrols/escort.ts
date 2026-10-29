import { healthRules } from '@/content/health';
import { patrolRules, type PatrolRules } from '@/content/patrols';

import { estimatePartyOdds } from '../expeditions/odds';
import { highestUnlockedTier, untriggeredSalvage } from '../expeditions/expeditions';
import { prepareParty, simulateRun, type PartyMember } from '../expeditions/simulate';
import { pickaxeTier } from '../gathering/gathering';
import { patrolRulesAt, trackWindows } from '../gathering/walkEffects';
import { guildBonus } from '../guild/guild';
import { createRng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import type { ExpeditionReport } from '../types';
import type { SaveData } from '../save';
import { applyRunHp } from '../team/health';
import { isAway } from '../team/team';
import { activeLairs } from '../places/fights';
import { grantPatrolWin, patrolDungeon, patrolRewards, patrolRunOptions, settleConsumables, type PatrolRewards } from './fight';
import { isPatrolKind, patrolTier, patrolsAround, pruneByWindow, type PatrolKind, type PatrolSpawn } from './generate';
import { distanceTo, hasFled, inEngageRange, isGone, isVisible } from './visibility';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Which patrols a notification is wanted for. */
export type AlertFor = 'all' | 'banditsTravellers' | 'off';

/** The settings the background task runs with. */
export type PatrolSettings = {
  escortHeroId: string | null;
  alertFor: AlertFor;
  patrolAlerts: boolean;
  escortAlerts: boolean;
};

/** The escort hero as they roam: HP is stored as of `hpAt` and heals lazily. */
export type EscortState = {
  heroId: string;
  /** Stats as they set out; the consumable is dropped after the first fight, as on an expedition. */
  member: PartyMember;
  hp: number;
  hpAt: number;
  maxHp: number;
  /** Absolute HP per minute of home healing, trait included. */
  healPerMinute: number;
  /** Minutes of exhaustion after a knock-out, trait included. */
  exhaustionMinutes: number;
  exhaustedUntil: number | null;
  /** Fighting until then. */
  busyUntil: number;
  /** Too hurt to take on patrols until healed back to the threshold. */
  paused: boolean;
};

/** A fight the escort fought on its own, waiting to be folded into the save. */
export type BackgroundResult = {
  /** Patrol, hero and time: the same fight always has the same id. */
  id: string;
  /** When the fight ended. */
  at: number;
  patrolId: string;
  windowEndsAt: number;
  kind: PatrolKind;
  tier: number;
  heroId: string;
  won: boolean;
  hpBefore: number;
  hpAfter: number;
  maxHp: number;
  /** Consumables that never triggered, broken back down (see threats/salvage.ts). */
  salvaged: ExpeditionReport['salvaged'];
  rewards: PatrolRewards;
};

export type BackgroundAlert =
  | { kind: 'patrolSpotted'; spawn: PatrolSpawn; distance: number; tier: number }
  | { kind: 'escortPaused'; hpShare: number }
  | { kind: 'escortKnockedOut' };

/** Everything the background task keeps between runs, built from the save. */
export type BackgroundState = {
  escort: EscortState | null;
  highestTier: number;
  pickaxeTier: number;
  /** Guild gold bonus, folded into rewards computed here. */
  goldMultiplier: number;
  alertFor: AlertFor;
  patrolAlerts: boolean;
  escortAlerts: boolean;
  /** Patrol id → window end it was alerted in. */
  alerted: Record<string, number>;
  /** Patrol id → when it was first seen. */
  firstSeen: Record<string, number>;
  /** Tracker's eye windows: patrols show from further inside them. */
  trackWindows: { startedAt: number; endsAt: number }[];
  /** Patrols beaten or travellers helped (from the save, and by the escort since) → window end. */
  beaten: Record<string, number>;
  /** Monster lairs the player defeated → when they expire; live lairs are worked out from tile and time, these left out. */
  defeatedLairs: Record<string, number>;
  lastAlertAt: number | null;
  pending: BackgroundResult[];
};

/**
 * The background state from the save: the escort as it is now, and what the
 * player already beat or helped. Alerts and first sightings carry over from
 * `previous`, so a refresh doesn't alert twice or restart a goblin's timer.
 */
export function snapshotBackground(
  save: SaveData,
  settings: PatrolSettings,
  now: number,
  previous: BackgroundState | null = null,
  rules: PatrolRules = patrolRules,
): BackgroundState {
  const hero = save.heroes.find((h) => h.id === settings.escortHeroId && !isAway(save, h.id));
  const member = hero ? prepareParty(save, [hero.id], now, true)[0] : undefined;
  const healRate = member?.abilities.find((a) => a.kind === 'healRate');
  const rate = healRate?.kind === 'healRate' ? healRate : { multiplier: 1, exhaustion: 1 };
  return {
    escort:
      hero && member
        ? {
            heroId: hero.id,
            member,
            hp: member.hp,
            hpAt: now,
            maxHp: member.maxHp,
            healPerMinute: healthRules.healPerMinute * rate.multiplier * member.maxHp,
            exhaustionMinutes: healthRules.exhaustionMinutes * rate.exhaustion,
            exhaustedUntil: hero.exhaustedUntil ?? null,
            busyUntil: 0,
            paused: (previous?.escort?.heroId === hero.id && previous.escort.paused) || member.hp < rules.escort.minHpShare * member.maxHp,
          }
        : null,
    highestTier: highestUnlockedTier(save),
    pickaxeTier: pickaxeTier(save),
    goldMultiplier: 1 + guildBonus(save, 'gold'),
    alertFor: settings.alertFor,
    patrolAlerts: settings.patrolAlerts,
    escortAlerts: settings.escortAlerts,
    alerted: pruneByWindow(previous?.alerted ?? {}, now, rules),
    firstSeen: pruneByWindow(previous?.firstSeen ?? {}, now, rules),
    trackWindows: trackWindows(save.walkEffects),
    beaten: pruneByWindow({ ...save.beatenPatrols, ...save.helpedTravellers }, now, rules),
    defeatedLairs: Object.fromEntries(
      Object.entries(save.usedPlaces).filter(([id, expiresAt]) => id.startsWith('place:monsterLair:') && expiresAt > now),
    ),
    lastAlertAt: previous?.lastAlertAt ?? null,
    pending: [],
  };
}

/** The escort's HP at a time: healed from `hpAt` once any exhaustion is over. */
export function escortHpAt(escort: EscortState, now: number): number {
  const from = Math.max(escort.hpAt, escort.exhaustedUntil ?? -Infinity);
  const minutes = Math.max(0, now - from) / MINUTE;
  return Math.min(escort.maxHp, escort.hp + minutes * escort.healPerMinute);
}

/** Whether a spawn is one the settings want a notification for. */
export function alertAppliesTo(spawn: PatrolSpawn, alertFor: AlertFor) {
  if (alertFor === 'all') return true;
  return alertFor === 'banditsTravellers' && (spawn.kind === 'bandits' || !isPatrolKind(spawn.kind));
}

/**
 * Whether the escort would take this spawn on at this HP: an allowed kind, not
 * elite, the escort not paused, and its odds alone at least the threshold.
 */
function escortTakes(spawn: PatrolSpawn, escort: EscortState | null, hp: number, state: BackgroundState, rules: PatrolRules) {
  const kind = spawn.kind;
  if (!escort || escort.paused || !isPatrolKind(kind) || !rules.escort.types.includes(kind) || spawn.tierRoll === 'elite') return false;
  const { tier } = patrolTier(spawn, state.highestTier);
  const odds = estimatePartyOdds(
    [{ ...escort.member, hp }],
    patrolDungeon(spawn, tier, false, rules),
    rules.escort.oddsRuns,
    patrolRunOptions(kind),
  );
  return odds.success >= rules.escort.minOdds;
}

/**
 * Follows the player's path, fix by fix: spawns get seen, the escort takes on
 * what it can handle within engage range, and alerts are raised — one per
 * spawn, none for what the escort will take, none closer together than the
 * cooldown. The escort pauses below the HP threshold and resumes once healed.
 */
export function backgroundStep(
  state: BackgroundState,
  fixes: { position: LatLng; timestamp: number }[],
  now: number,
  rules: PatrolRules = patrolRules,
): { state: BackgroundState; alerts: BackgroundAlert[] } {
  let next: BackgroundState = { ...state, alerted: { ...state.alerted }, firstSeen: { ...state.firstSeen }, beaten: { ...state.beaten }, pending: [...state.pending] };
  const alerts: BackgroundAlert[] = [];
  const minShare = rules.escort.minHpShare;

  for (const { position, timestamp: at } of [...fixes].sort((a, b) => a.timestamp - b.timestamp)) {
    if (next.escort) {
      const share = escortHpAt(next.escort, at) / Math.max(1, next.escort.maxHp);
      if (!next.escort.paused && share < minShare) {
        next.escort = { ...next.escort, paused: true };
        if (next.escortAlerts) alerts.push({ kind: 'escortPaused', hpShare: share });
      } else if (next.escort.paused && share >= minShare) {
        next.escort = { ...next.escort, paused: false };
      }
    }

    // More patrols around live lairs, as on the map; states stored before lairs existed have no defeated ones.
    const lairs = activeLairs(position, at, next.defeatedLairs ?? {});
    const spawns = patrolsAround(position, at, rules, lairs).filter(
      (spawn) => !isGone(spawn, next.beaten, at) && !hasFled(spawn, next.firstSeen[spawn.id], at, rules),
    );
    // The tracker's eye widens patrol sight per fix, so a window can end mid-walk.
    const atRules = patrolRulesAt(rules, next.trackWindows, at);
    for (const spawn of spawns) {
      if (next.firstSeen[spawn.id] === undefined && isVisible(spawn, position, at, atRules)) next.firstSeen[spawn.id] = at;
    }

    const escort = next.escort;
    const hp = escort ? escortHpAt(escort, at) : 0;
    const takes = new Map<string, boolean>();
    const willTake = (spawn: PatrolSpawn) => {
      if (!takes.has(spawn.id)) takes.set(spawn.id, escortTakes(spawn, escort, hp, next, rules));
      return takes.get(spawn.id)!;
    };

    const target = escort && at >= escort.busyUntil ? spawns.find((s) => inEngageRange(s, position, at, rules) && willTake(s)) : undefined;
    if (escort && target && isPatrolKind(target.kind)) {
      const { tier } = patrolTier(target, next.highestTier);
      const dungeon = patrolDungeon(target, tier, false, rules);
      const id = `escort|${target.id}|${escort.heroId}|${at}`;
      const run = simulateRun([{ ...escort.member, hp }], dungeon, id, patrolRunOptions(target.kind));
      const end = at + dungeon.durationMinutes * MINUTE;
      const hpAfter = run.hp[0]?.hp ?? 0;
      const rewards: PatrolRewards = run.bossDefeated
        ? patrolRewards(
            { goldMultiplier: next.goldMultiplier, pickaxeTier: next.pickaxeTier, luck: escort.member.luck },
            target,
            tier,
            false,
            createRng(`${id}|rewards`),
            rules,
          )
        : { gold: 0, xp: 0, materials: [] };
      next.pending.push({
        id,
        at: end,
        patrolId: target.id,
        windowEndsAt: target.endsAt,
        kind: target.kind,
        tier,
        heroId: escort.heroId,
        won: run.bossDefeated,
        hpBefore: hp,
        hpAfter,
        maxHp: escort.maxHp,
        salvaged: untriggeredSalvage([{ ...escort.member, hp }], run, { barren: false, gold: 0 }),
        rewards,
      });
      if (run.bossDefeated) next.beaten[target.id] = target.endsAt;
      const knockedOut = hpAfter <= 0;
      if (knockedOut && next.escortAlerts) alerts.push({ kind: 'escortKnockedOut' });
      next.escort = {
        ...escort,
        member: { ...escort.member, consumable: null },
        hp: hpAfter,
        hpAt: end,
        busyUntil: end,
        // A knock-out says so itself; no second "paused" alert.
        paused: escort.paused || hpAfter < minShare * escort.maxHp,
        exhaustedUntil: knockedOut ? end + escort.exhaustionMinutes * MINUTE : escort.exhaustedUntil,
      };
      if (!knockedOut && hpAfter < minShare * escort.maxHp && next.escortAlerts) alerts.push({ kind: 'escortPaused', hpShare: hpAfter / escort.maxHp });
    }

    for (const spawn of spawns) {
      if (!next.patrolAlerts || next.alerted[spawn.id] !== undefined || next.beaten[spawn.id] !== undefined) continue;
      if (!alertAppliesTo(spawn, next.alertFor)) continue;
      if (next.lastAlertAt !== null && at - next.lastAlertAt < rules.alerts.cooldownMinutes * MINUTE) continue;
      const distance = distanceTo(spawn, position, at);
      if (distance > atRules.visibleMeters || willTake(spawn)) continue;
      alerts.push({ kind: 'patrolSpotted', spawn, distance, tier: patrolTier(spawn, next.highestTier).tier });
      next.alerted[spawn.id] = spawn.endsAt;
      next.lastAlertAt = at;
    }
  }

  return {
    state: {
      ...next,
      alerted: pruneByWindow(next.alerted, now, rules),
      firstSeen: pruneByWindow(next.firstSeen, now, rules),
      beaten: pruneByWindow(next.beaten, now, rules),
    },
    alerts,
  };
}

/**
 * Folds background results into the save, oldest first: HP as of the fight's
 * end (healing picks up from there), the consumable slot, rewards, and the
 * win's mark on the patrol. Ids already applied are skipped, so applying the
 * same results twice changes nothing.
 */
export function applyBackgroundResults(save: SaveData, results: BackgroundResult[], now: number, rules: PatrolRules = patrolRules): SaveData {
  let next = save;
  for (const result of [...results].sort((a, b) => a.at - b.at)) {
    if (next.appliedBackgroundResults[result.id] !== undefined) continue;
    next = { ...next, appliedBackgroundResults: { ...next.appliedBackgroundResults, [result.id]: result.at } };
    // A hero dismissed since still counts the fight as done; one sent away since keeps the HP they left with.
    if (!next.heroes.some((h) => h.id === result.heroId)) continue;
    if (result.won) next = grantPatrolWin(next, [result.heroId], result.rewards, result.patrolId, result.windowEndsAt);
    if (isAway(next, result.heroId)) continue;
    next = settleConsumables(next, [result.heroId], result.salvaged);
    next = applyRunHp(next, [{ heroId: result.heroId, hp: result.hpAfter, maxHp: result.maxHp }], result.at);
  }
  const cutoff = now - rules.appliedResultDays * DAY;
  return {
    ...next,
    appliedBackgroundResults: Object.fromEntries(Object.entries(next.appliedBackgroundResults).filter(([, at]) => at > cutoff)),
    beatenPatrols: pruneByWindow(next.beatenPatrols, now, rules),
  };
}
