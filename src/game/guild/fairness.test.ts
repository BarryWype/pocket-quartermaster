import { readFileSync } from 'fs';
import { join } from 'path';

import { dungeons } from '@/content/dungeons';
import { guildTracks, type GuildTrackId } from '@/content/guild';

import { estimateOdds } from '../expeditions/odds';
import { createRng } from '../generation/rng';
import { rollForSave } from '../loot/context';
import { LOOT_SOURCES } from '../loot/types';
import { createInitialSave, type SaveData } from '../save';

// The Guild Hall never raises loot chances or win odds (doc/design/guild/README.md).

const ALL = ['bram', 'lyra', 'mira'];
/** An import of the Guild Hall or a read of its ranks (a "Thieves' guild" row doesn't count). */
const READS_GUILD = /guild\/guild|content\/guild|guildBonus|guildRank|\.guild\b/;
const BOSSES = ['banditStockade', 'ogreQuarry', 'drownedCrypt', 'giantsHall'];

const plain: SaveData = { ...createInitialSave(), tutorial: { ...createInitialSave().tutorial, step: 'done' }, clearedDungeons: BOSSES };
const maxed: SaveData = {
  ...plain,
  guild: Object.fromEntries(guildTracks.map((t) => [t.id, t.ranks])) as Partial<Record<GuildTrackId, number>>,
};

describe('the Guild Hall at every max rank', () => {
  it('rolls the same loot from every source, gold aside', () => {
    for (const source of LOOT_SOURCES) {
      for (let seed = 0; seed < 20; seed++) {
        const { gold: _a, ...base } = rollForSave(plain, source, createRng(`fair|${source}|${seed}`));
        const { gold: _b, ...ranked } = rollForSave(maxed, source, createRng(`fair|${source}|${seed}`));
        expect(ranked).toEqual(base);
      }
    }
  });

  it('leaves expedition odds unchanged', () => {
    for (const dungeon of dungeons.filter((d) => d.tier <= 2)) {
      expect(estimateOdds(maxed, ALL, dungeon, 60)).toEqual(estimateOdds(plain, ALL, dungeon, 60));
    }
  });

  it('is never read where loot chances, multipliers or fights are computed', () => {
    const files = [
      'loot/chances.ts',
      'loot/roll.ts',
      'loot/generators.ts',
      'loot/matrixCsv.ts',
      'expeditions/simulate.ts',
      'expeditions/odds.ts',
      'threats/score.ts',
      'threats/penalties.ts',
      'threats/answers.ts',
    ];
    for (const file of files) {
      const source = readFileSync(join(__dirname, '..', file), 'utf8');
      expect({ file, guild: READS_GUILD.test(source) }).toEqual({ file, guild: false });
    }
    const config = readFileSync(join(__dirname, '../../content/loot/config.ts'), 'utf8');
    expect(READS_GUILD.test(config)).toBe(false);
  });
});
