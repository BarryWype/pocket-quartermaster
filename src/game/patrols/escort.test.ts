import { patrolRules } from '@/content/patrols';

import { offsetPosition } from '../generation/geo';
import type { SaveData } from '../save';
import { currentHp, setHeroHp } from '../team/health';
import { alertAppliesTo, applyBackgroundResults, backgroundStep, snapshotBackground, type BackgroundState, type PatrolSettings } from './escort';
import { patrolPositionAt, type PatrolSpawn } from './generate';
import { findSpawn, fixOn, tierTeam } from './testHelpers';

const MINUTE = 60_000;
const settings: PatrolSettings = { escortHeroId: 'bram', alertFor: 'all', patrolAlerts: true, escortAlerts: true };
const { spawn: goblins, at } = findSpawn((s) => s.kind === 'goblins' && s.tierRoll === 'current');

/** A fix this far east of the spawn. */
const near = (spawn: PatrolSpawn, time: number, meters: number) => ({ position: offsetPosition(patrolPositionAt(spawn, time), 0, meters), timestamp: time });
const state = (save: SaveData = tierTeam(), s: PatrolSettings = settings, time = at - MINUTE) => snapshotBackground(save, s, time);
/** Alerts for the goblins under test (other spawns may be in view too). */
const spotted = (alerts: ReturnType<typeof backgroundStep>['alerts']) => alerts.filter((a) => a.kind === 'patrolSpotted' && a.spawn.id === goblins.id);

describe('the escort', () => {
  it('takes on a goblin patrol in engage range, with its current HP', () => {
    const { state: next } = backgroundStep(state(), [fixOn(goblins, at)], at);
    expect(next.pending).toHaveLength(1);
    const result = next.pending[0];
    expect(result).toMatchObject({ patrolId: goblins.id, heroId: 'bram', kind: 'goblins', at: at + 2 * MINUTE });
    expect(next.escort!.busyUntil).toBe(at + 2 * MINUTE);
    if (result.won) expect(next.beaten[goblins.id]).toBe(goblins.endsAt);
  });

  it('leaves bandits and elites alone', () => {
    const bandits = findSpawn((s) => s.kind === 'bandits');
    const elite = findSpawn((s) => s.kind === 'goblins' && s.tierRoll === 'elite');
    for (const { spawn, at: time } of [bandits, elite]) {
      expect(backgroundStep(state(tierTeam(), settings, time), [fixOn(spawn, time)], time).state.pending).toHaveLength(0);
    }
  });

  it('only engages with odds of at least 80%', () => {
    const outmatched: BackgroundState = { ...state(), highestTier: 5 };
    expect(backgroundStep(outmatched, [fixOn(goblins, at)], at).state.pending).toHaveLength(0);
  });

  it('pauses below half HP, says so once, and resumes once healed', () => {
    const hurt = state(setHeroHp(tierTeam(), 'bram', 0.55, at - MINUTE));
    // Healthy enough at the start; hurt by hand to cross the threshold mid-walk.
    const below: BackgroundState = { ...hurt, escort: { ...hurt.escort!, hp: hurt.escort!.maxHp * 0.4, hpAt: at } };
    const far = (time: number) => near(goblins, time, 1000);
    const step = backgroundStep(below, [far(at), far(at + MINUTE)], at + MINUTE);
    expect(step.state.escort!.paused).toBe(true);
    expect(step.alerts.filter((a) => a.kind === 'escortPaused')).toHaveLength(1);
    expect(backgroundStep(step.state, [fixOn(goblins, at + 2 * MINUTE)], at + 2 * MINUTE).state.pending).toHaveLength(0);
    // 10% of max HP back takes 6 minutes at home.
    const healed = backgroundStep(step.state, [far(at + 8 * MINUTE)], at + 8 * MINUTE);
    expect(healed.state.escort!.paused).toBe(false);
  });

  it('says when a fight knocks it out, without a second "paused" alert', () => {
    const reckless = { ...patrolRules, escort: { ...patrolRules.escort, minOdds: 0 } };
    const outmatched: BackgroundState = { ...state(), highestTier: 5 };
    const { state: next, alerts } = backgroundStep(outmatched, [fixOn(goblins, at)], at, reckless);
    expect(next.pending[0].hpAfter).toBe(0);
    expect(alerts.map((a) => a.kind)).toEqual(['escortKnockedOut']);
    expect(next.escort!.exhaustedUntil).toBe(at + 2 * MINUTE + 20 * MINUTE);
  });

  it('keeps patrols already beaten in the save out of play', () => {
    const save = { ...tierTeam(), beatenPatrols: { [goblins.id]: goblins.endsAt } };
    expect(backgroundStep(state(save), [fixOn(goblins, at)], at).state.pending).toHaveLength(0);
  });
});

describe('background results', () => {
  const save = tierTeam();
  const { state: fought } = backgroundStep(state(), [fixOn(goblins, at)], at);
  const result = fought.pending[0];

  it('fold into the save once, however often they are applied', () => {
    const once = applyBackgroundResults(save, [result], at + 5 * MINUTE);
    const twice = applyBackgroundResults(once, [result, result], at + 5 * MINUTE);
    expect(twice).toEqual(once);
    expect(once.gold).toBe(save.gold + result.rewards.gold);
    const bram = once.heroes.find((h) => h.id === 'bram')!;
    expect(currentHp(once, bram, result.at)).toBeCloseTo(result.hpAfter, 5);
  });

  it('apply in time order, so the latest fight sets the HP', () => {
    const later = { ...result, id: 'later', at: result.at + 10 * MINUTE, hpAfter: result.maxHp * 0.3, won: false };
    const merged = applyBackgroundResults(save, [later, result], later.at);
    const bram = merged.heroes.find((h) => h.id === 'bram')!;
    expect(currentHp(merged, bram, later.at)).toBeCloseTo(result.maxHp * 0.3, 5);
  });

  it('keep the reward but not the HP of a hero sent away since', () => {
    const away = { ...save, patrolFights: [{ ...result, id: 'f', tier: 1, elite: false, heroIds: ['bram'], startedAt: at, endsAt: at + 99 * MINUTE, hp: [], salvaged: [] }] };
    const merged = applyBackgroundResults(away, [{ ...result, won: true }], at + 5 * MINUTE);
    expect(merged.gold).toBe(save.gold + result.rewards.gold);
    expect(merged.heroes.find((h) => h.id === 'bram')!.hp).toBeUndefined();
  });
});

describe('patrol alerts', () => {
  const quiet: PatrolSettings = { ...settings, escortHeroId: null };

  it('alert once per patrol in visible range', () => {
    const first = backgroundStep(state(tierTeam(), quiet), [near(goblins, at, 200)], at);
    expect(spotted(first.alerts)).toHaveLength(1);
    const again = backgroundStep(first.state, [near(goblins, at + 10 * MINUTE, 150)], at + 10 * MINUTE);
    expect(spotted(again.alerts)).toHaveLength(0);
    expect(spotted(backgroundStep(state(tierTeam(), quiet), [near(goblins, at, 400)], at).alerts)).toHaveLength(0);
  });

  it('wait out the cooldown between alerts', () => {
    const base = state(tierTeam(), quiet);
    expect(spotted(backgroundStep({ ...base, lastAlertAt: at - 2 * MINUTE }, [near(goblins, at, 200)], at).alerts)).toHaveLength(0);
    expect(spotted(backgroundStep({ ...base, lastAlertAt: at - 6 * MINUTE }, [near(goblins, at, 200)], at).alerts)).toHaveLength(1);
  });

  it('follow the "alert for" setting', () => {
    const bandits = findSpawn((s) => s.kind === 'bandits').spawn;
    const traveller = findSpawn((s) => s.kind === 'wounded').spawn;
    expect(alertAppliesTo(goblins, 'banditsTravellers')).toBe(false);
    expect(alertAppliesTo(bandits, 'banditsTravellers')).toBe(true);
    expect(alertAppliesTo(traveller, 'banditsTravellers')).toBe(true);
    expect(alertAppliesTo(bandits, 'off')).toBe(false);
    expect(spotted(backgroundStep(state(tierTeam(), { ...quiet, alertFor: 'off' }), [near(goblins, at, 200)], at).alerts)).toHaveLength(0);
    expect(spotted(backgroundStep(state(tierTeam(), { ...quiet, patrolAlerts: false }), [near(goblins, at, 200)], at).alerts)).toHaveLength(0);
  });

  it('leave out patrols the escort will handle', () => {
    expect(spotted(backgroundStep(state(), [near(goblins, at, 200)], at).alerts)).toHaveLength(0);
  });

  it('stay quiet for goblins that already fled', () => {
    const seen: BackgroundState = { ...state(tierTeam(), quiet), firstSeen: { [goblins.id]: at - 11 * MINUTE } };
    expect(spotted(backgroundStep(seen, [near(goblins, at, 200)], at).alerts)).toHaveLength(0);
  });
});
