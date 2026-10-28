import { gatheringConfig } from '@/content/gatheringConfig';

import { walkToShow, type WalkPatrols } from '../gathering/autoGather';
import { createInitialSave, type SaveData } from '../save';
import { applyBackgroundResults, backgroundStep, snapshotBackground, type BackgroundResult, type PatrolSettings } from './escort';
import { resolvePatrolFights, startPatrolFight, type PatrolFight } from './fight';
import { findSpawn, fixOn, tierTeam } from './testHelpers';
import { addPatrolsToWalks, escortHpChange, walkPatrolsFrom } from './walkPatrols';

const MINUTE = 60_000;
const escortSettings: PatrolSettings = { escortHeroId: 'bram', alertFor: 'all', patrolAlerts: true, escortAlerts: true };
const { spawn: escortSpawn, at: escortAt } = findSpawn((s) => s.kind === 'goblins' && s.tierRoll === 'current');
const { spawn: goblins, at } = findSpawn((s) => s.kind === 'goblins' && s.tierRoll !== 'elite');
const player = fixOn(goblins, at).position;

/** The escort's real fight with the goblins under test, as the background task plays it out. */
const escortResult = () =>
  backgroundStep(snapshotBackground(tierTeam(), escortSettings, escortAt - MINUTE), [fixOn(escortSpawn, escortAt)], escortAt).state.pending[0];

/** The player's own fight with the full team, resolved once its time is up. */
const wonFight = () => resolvePatrolFights(startPatrolFight(tierTeam(), goblins, ['bram', 'lyra', 'mira'], player, at), at + 2 * MINUTE).resolved;

const result = (overrides: Partial<BackgroundResult> = {}): BackgroundResult => ({
  id: 'r1',
  at: 0,
  patrolId: 'patrol:1',
  windowEndsAt: 10 * MINUTE,
  kind: 'goblins',
  tier: 2,
  heroId: 'bram',
  won: true,
  hpBefore: 90,
  hpAfter: 40,
  maxHp: 100,
  consumed: [],
  rewards: { gold: 10, xp: 7, materials: [{ materialId: 'wood', amount: 2 }], shards: { element: 'fire', amount: 1 } },
  ...overrides,
});

const fight = (overrides: Partial<PatrolFight> = {}): PatrolFight => ({
  id: 'f1',
  patrolId: 'patrol:2',
  kind: 'herd',
  tier: 1,
  elite: false,
  heroIds: ['bram', 'lyra'],
  startedAt: 0,
  endsAt: 2 * MINUTE,
  windowEndsAt: 10 * MINUTE,
  won: true,
  hp: [],
  consumed: [],
  rewards: { gold: 5, xp: 3, materials: [{ materialId: 'hide', amount: 1 }] },
  ...overrides,
});

const patrols = (overrides: Partial<WalkPatrols> = {}): WalkPatrols => ({
  fights: [{ kind: 'goblins', tier: 1, elite: false, by: 'escort', won: true }],
  escortHp: { heroId: 'bram', before: 90, after: 40, max: 100 },
  travellers: [],
  gold: 10,
  xp: 7,
  materials: [{ materialId: 'wood', amount: 2 }],
  ...overrides,
});

/** A save whose walk history holds these walks, newest first. */
const withHistory = (walks: { seen: boolean; nodes?: number; patrols?: WalkPatrols }[]): SaveData => ({
  ...createInitialSave(),
  autoGather: {
    processedUntil: 0,
    anchor: null,
    history: walks.map((walk) => ({
      startedAt: 0,
      endedAt: 0,
      distanceMeters: 100,
      nodes: walk.nodes ?? 1,
      gained: [],
      steps: 0,
      stepsEstimated: false,
      ignored: {},
      autoStopped: false,
      patrols: walk.patrols,
      seen: walk.seen,
    })),
  },
});

describe('walkPatrolsFrom', () => {
  it('sums gold, materials and XP per hero from won fights only', () => {
    const lost = { gold: 50, xp: 50, materials: [{ materialId: 'wood', amount: 99 }] };
    const summary = walkPatrolsFrom([result(), result({ id: 'lost', won: false, rewards: lost })], [fight(), fight({ id: 'lostToo', won: false, rewards: lost })], {
      heroId: 'bram',
      before: 90,
      after: 40,
      max: 100,
    });
    expect(summary).toEqual({
      fights: [
        { kind: 'goblins', tier: 2, elite: false, by: 'escort', won: true },
        { kind: 'goblins', tier: 2, elite: false, by: 'escort', won: false },
        { kind: 'herd', tier: 1, elite: false, by: 'you', won: true },
        { kind: 'herd', tier: 1, elite: false, by: 'you', won: false },
      ],
      escortHp: { heroId: 'bram', before: 90, after: 40, max: 100 },
      travellers: [],
      gold: 15,
      xp: 7 + 3 * 2,
      materials: [
        { materialId: 'wood', amount: 2 },
        { materialId: 'fireShard', amount: 1 },
        { materialId: 'hide', amount: 1 },
      ],
    });
  });

  it('lists the escort’s fights and the player’s, each with their own flags', () => {
    const escort = escortResult();
    const [won] = wonFight();
    const summary = walkPatrolsFrom([escort], [won]);
    expect(summary.fights).toEqual([
      { kind: 'goblins', tier: escort.tier, elite: false, by: 'escort', won: escort.won },
      { kind: 'goblins', tier: won.tier, elite: false, by: 'you', won: true },
    ]);
    expect(summary.gold).toBe((escort.won ? escort.rewards.gold : 0) + won.rewards.gold);
    expect(summary.xp).toBe((escort.won ? escort.rewards.xp : 0) + won.rewards.xp * won.heroIds.length);
    expect(walkPatrolsFrom([], []).escortHp).toBeNull();
  });

  it('takes the background task’s real results into a summary over an applied save', () => {
    const escort = escortResult();
    const applied = applyBackgroundResults(withHistory([{ seen: false }]), [escort], escortAt + 5 * MINUTE);
    const merged = addPatrolsToWalks(applied, walkPatrolsFrom([escort], [], escortHpChange([escort])), escortAt + 5 * MINUTE);
    const summary = merged.autoGather.history[0].patrols!;
    expect(summary.fights).toEqual([{ kind: 'goblins', tier: escort.tier, elite: false, by: 'escort', won: escort.won }]);
    expect(summary.gold).toBe(escort.won ? escort.rewards.gold : 0);
    expect(summary.escortHp).toEqual({ heroId: 'bram', before: escort.hpBefore, after: escort.hpAfter, max: escort.maxHp });
  });
});

describe('escortHpChange', () => {
  it('spans the earliest fight to the latest', () => {
    expect(escortHpChange([])).toBeNull();
    const later = result({ id: 'later', at: 2 * MINUTE, hpBefore: 60, hpAfter: 30 });
    expect(escortHpChange([later, result()])).toEqual({ heroId: 'bram', before: 90, after: 30, max: 100 });
  });
});

describe('addPatrolsToWalks', () => {
  it('adds nothing without fights or travellers', () => {
    const save = withHistory([{ seen: false }]);
    expect(addPatrolsToWalks(save, patrols({ fights: [], travellers: [] }), at)).toBe(save);
  });

  it('merges into the newest walk the player has not dismissed', () => {
    const earlier = patrols({
      escortHp: { heroId: 'bram', before: 100, after: 90, max: 120 },
      gold: 5,
      xp: 2,
      materials: [{ materialId: 'hide', amount: 1 }],
    });
    const walk = addPatrolsToWalks(withHistory([{ seen: false, patrols: earlier }]), patrols(), at).autoGather.history[0];
    expect(walk).toEqual({
      startedAt: 0,
      endedAt: 0,
      distanceMeters: 100,
      nodes: 1,
      gained: [],
      steps: 0,
      stepsEstimated: false,
      ignored: {},
      autoStopped: false,
      seen: false,
      patrols: {
        fights: [...earlier.fights, ...patrols().fights],
        escortHp: { heroId: 'bram', before: 100, after: 40, max: 100 },
        travellers: [],
        gold: 15,
        xp: 9,
        materials: [
          { materialId: 'hide', amount: 1 },
          { materialId: 'wood', amount: 2 },
        ],
      },
    });
  });

  it('merges into an unseen walk that met no patrols yet', () => {
    expect(addPatrolsToWalks(withHistory([{ seen: false }]), patrols(), at).autoGather.history[0].patrols).toEqual(patrols());
  });

  it('records a walk of its own when the newest walk is dismissed', () => {
    const added = addPatrolsToWalks(withHistory([{ seen: true }]), patrols(), at);
    expect(added.autoGather.history[0]).toEqual({
      startedAt: at,
      endedAt: at,
      distanceMeters: 0,
      nodes: 0,
      gained: [],
      steps: 0,
      stepsEstimated: false,
      ignored: {},
      autoStopped: false,
      patrols: patrols(),
      seen: false,
    });
    expect(added.autoGather.history[1].seen).toBe(true);
  });

  it('caps the history like recordWalk does', () => {
    const full = withHistory(Array.from({ length: gatheringConfig.autoGather.historySize }, () => ({ seen: true })));
    const added = addPatrolsToWalks(full, patrols(), at);
    expect(added.autoGather.history).toHaveLength(gatheringConfig.autoGather.historySize);
    expect(added.autoGather.history[0].seen).toBe(false);
  });
});

describe('walkToShow', () => {
  it('shows a walk that met patrol fights, gathered or not', () => {
    const empty = withHistory([{ seen: false, nodes: 0 }]);
    expect(walkToShow(empty)).toBeNull();
    expect(walkToShow(addPatrolsToWalks(empty, patrols(), at))?.patrols).toEqual(patrols());
    expect(walkToShow(withHistory([{ seen: true, nodes: 0, patrols: patrols() }]))).toBeNull();
  });
});
