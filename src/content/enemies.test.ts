import { readFileSync } from 'fs';
import { join } from 'path';

import { bossById, bosses, mobById, mobs, npcMobId, patrolMobId, sanctumGuardian, sanctumMinionId } from './enemies';
import fixture from './enemyThreatTags.fixture.json';
import { npcs } from './npcs';
import { sanctumRules, sanctums } from './sanctums';
import { dungeons } from './dungeons';

import { familyTags } from '@/game/enemies/tags';
import type { Tag } from '@/game/types';

/** The approved family tags table; each row is `Enemy,Source,Tags`. */
const csvRows: [string, string][] = readFileSync(join(__dirname, '../../doc/design/loot/enemy-tags.csv'), 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .slice(1)
  .map((line) => {
    const [name, source, tags] = line.split(',');
    return [`${name}|${source}`, tags];
  });

/** The same rows, built from the content instead of the CSV. */
const contentRows = new Map<string, string>();
const addRow = (name: string, source: string, tags: Tag[]) => {
  const key = `${name}|${source}`;
  const joined = tags.join(' ');
  expect(contentRows.get(key) ?? joined).toBe(joined);
  contentRows.set(key, joined);
};

const overnightBossIds = new Set(dungeons.filter((d) => d.overnight).map((d) => d.boss.id));
const guardians = sanctums.flatMap((s) => sanctumRules.tierStrength.map((_, i) => sanctumGuardian(s, i + 1)));
const guardianById = Object.fromEntries(guardians.map((g) => [g.id, g]));

beforeAll(() => {
  mobs.forEach((m) => addRow(m.name, 'dungeon', m.tags));
  bosses.forEach((b) => addRow(b.name, overnightBossIds.has(b.id) ? 'overnight' : 'boss', b.tags));
  npcs.forEach((n) => {
    const mob = mobById[npcMobId(n.id, 1)];
    addRow(mob.name, 'npc', mob.tags);
  });
  for (const [id, mob] of Object.entries(mobById)) {
    const patrol = /^patrol:([^:]+):\d+:(?:weak|normal|boss)$/.exec(id);
    const place = /^place:([^:]+):\d+:(?:weak|normal|boss)(?::[a-z]+)?$/.exec(id);
    if (patrol) addRow(mob.name, `patrol:${patrol[1]}`, mob.tags);
    if (place && !id.includes(':elite')) addRow(mob.name, `place:${place[1]}`, mob.tags);
  }
  sanctums.forEach((s) => {
    (['weak', 'strong'] as const).forEach((which) => {
      const mob = mobById[sanctumMinionId(s.id, which, 1)];
      addRow(mob.name, `sanctum:${s.id}`, mob.tags);
    });
    addRow(sanctumGuardian(s, 1).name, `sanctum:${s.id}`, sanctumGuardian(s, 1).tags);
  });
});

describe('enemies', () => {
  it('scales Speed by class and tier', () => {
    expect(mobById['ratSwarm'].speed).toBe(3);
    expect(mobById['cryptGuard'].speed).toBe(9);
    expect(mobById[patrolMobId('herd', 1, 'weak')].speed).toBe(7);
  });

  it('makes casters hit with Magic, everyone else with Power', () => {
    expect(mobById['orcShaman'].damageType).toBe('magic');
    expect(mobById['ratSwarm'].damageType).toBe('power');
    expect(mobById[patrolMobId('goblins', 1, 'weak')].damageType).toBe('power');
  });

  it('gives every enemy a family tag', () => {
    [...Object.values(mobById), ...Object.values(bossById), ...guardians].forEach((enemy) => {
      expect(familyTags(enemy)).not.toHaveLength(0);
    });
  });

  it('keeps the beast, undead and locals tags from the fixture', () => {
    const kept: Tag[] = ['beast', 'undead', 'locals'];
    // The one approved change: the Sanctum beasts gain `beast`.
    const sanctumBeasts = new Set(['briar hound', 'drowned eel', 'storm hound', 'slag hound']);
    Object.entries(fixture).forEach(([id, expected]) => {
      const enemy = mobById[id] ?? bossById[id] ?? guardianById[id];
      expect(enemy).toBeDefined();
      const actual = enemy.tags.filter((t) => kept.includes(t));
      expect(actual).toEqual(sanctumBeasts.has(enemy.name) && expected.length === 0 ? ['beast'] : expected);
    });
  });

  it('covers every enemy exactly once', () => {
    const guardianIds = sanctums.flatMap((s) => sanctumRules.tierStrength.map((_, i) => `${s.id}:guardian:${i + 1}`));
    expect(Object.keys(fixture).sort()).toEqual([...Object.keys(mobById), ...Object.keys(bossById), ...guardianIds].sort());
  });

  it('matches the approved family tags table', () => {
    expect(contentRows).toEqual(new Map(csvRows));
  });
});
