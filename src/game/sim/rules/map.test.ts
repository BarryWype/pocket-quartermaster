import { heroClasses } from '@/content/heroes';

import { dailyRotation, rotationDay } from '../../dungeons/rotation';
import { offsetPosition } from '../../generation/geo';
import { createRng } from '../../generation/rng';
import type { LatLng } from '../../generation/types';
import type { PlaceSpawn } from '../../places/generate';
import { createInitialSave, type SaveData } from '../../save';
import type { HeroClassId } from '../../types';
import { generateTavernsAround } from '../../taverns/taverns';
import type { RunLog, Sim } from '../bot';
import { profiles, simConfig } from '../config';
import type { WalkRates } from '../walking';
import { nearestSpawn, openSecrets, visitPlaces } from './map';

const DAY = 86_400_000;
const LOCATION = simConfig.location;

const RATES: WalkRates = { perMinute: [], lure: {}, lureSpawns: 0, gathersPerMinute: [], autoPerMinute: [], autoGathersPerMinute: [], nodes: [] };

const makeLog = (): RunLog => ({
  profile: 'regular',
  seed: 'map-test',
  days: 0,
  milestones: {},
  daily: [],
  expeditions: [],
  crafts: [],
  goldIn: [],
  loot: {},
  goldOut: [],
  gathered: {},
  used: {},
  missing: {},
  sanctums: [],
  recruits: [],
  guildBuys: [],
  patrols: { seen: [], fights: [], travellers: { wounded: 0, pilgrim: 0, trader: 0 }, rewards: { loot: 0, recruit: 0 }, recruits: [], keyFragments: 0, trades: 0 },
  potionsAtHome: 0,
  emergencySupply: 0,
  quests: { claimed: { short: 0, medium: 0, long: 0, secret: 0 }, tips: 0 },
  places: [],
  skipped: {},
  finished: false,
});

const makeSim = (save: SaveData = createInitialSave(), now = simConfig.startDay): Sim => ({
  save,
  now,
  day: 1,
  startedAt: now,
  profile: profiles.regular,
  config: simConfig,
  rates: RATES,
  due: {},
  met: new Set(),
  rng: createRng('map-test'),
  rotation: dailyRotation(rotationDay(now)),
  location: LOCATION,
  tavern: generateTavernsAround(LOCATION, now)[0],
  reach: { meters: 0, tavern: true, sanctums: [], maps: new Map() },
  bonusGathers: 0,
  collectionAt: (time) => time,
  oddsCache: new Map(),
  launched: new Map(),
  waiting: new Set(),
  log: makeLog(),
});

const spawnAt = (id: string, kind: PlaceSpawn['kind'], meters: number): PlaceSpawn => ({
  id,
  kind,
  group: 'test',
  tile: 'test',
  position: offsetPosition(LOCATION, meters, 0),
  startsAt: 0,
  expiresAt: Number.MAX_SAFE_INTEGER,
  roll: 0,
});

describe('nearestSpawn', () => {
  const spawns = [spawnAt('a', 'ruins', 800), spawnAt('b', 'market', 100), spawnAt('c', 'ruins', 300), spawnAt('d', 'ruins', 100)];
  const any = () => true;

  it('picks the nearest accepted spawn of the kind', () => {
    expect(nearestSpawn(spawns, 'ruins', LOCATION, any)?.id).toBe('d');
    expect(nearestSpawn(spawns, 'market', LOCATION, any)?.id).toBe('b');
    expect(nearestSpawn(spawns, 'ruins', LOCATION, (s) => s.id !== 'd')?.id).toBe('c');
  });

  it('returns undefined for another kind or when every spawn is rejected', () => {
    expect(nearestSpawn(spawns, 'fishingDock', LOCATION, any)).toBeUndefined();
    expect(nearestSpawn(spawns, 'ruins', LOCATION, () => false)).toBeUndefined();
  });
});

describe('map rules', () => {
  it('takes no visit when nothing is owed', () => {
    const sim = makeSim();
    visitPlaces(sim);
    openSecrets(sim);
    expect(sim.log.places).toEqual([]);
    expect(sim.log.skipped).toEqual({});
    expect(sim.due).toEqual({});
  });

  it('enters a tipped den with a key and hires its rare class', () => {
    const now = simConfig.startDay;
    const anchor: LatLng = LOCATION;
    const save: SaveData = {
      ...createInitialSave(),
      gold: 10_000,
      keyFragments: 4,
      secretTips: [{ id: 'hiddenDen|test', secret: 'hiddenDen', source: 'quest', sourceId: 'q', anchor, foundAt: now - 1, expiresAt: now + DAY, position: anchor }],
    };
    const sim = makeSim(save, now);
    openSecrets(sim);
    expect(sim.log.places).toEqual([{ day: 1, kind: 'hiddenDen', tier: 1, odds: null, won: null }]);
    expect(sim.log.milestones.secretPlace).toBe(1);
    expect(sim.save.keyFragments).toBe(0);
    expect(sim.save.heroes.some((h) => heroClasses[h.classId].rarity === 'rare')).toBe(true);
    expect(heroClasses[sim.log.recruits[0].classId as HeroClassId].rarity).toBe('rare');
  });
});
