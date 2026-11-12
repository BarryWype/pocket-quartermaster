import { guildRules } from '@/content/guild';
import { revealRules, type RevealKind } from '@/content/reveal';
import { newHero } from '@/content/heroes';
import { setLocale } from '@/i18n/locale';

import { emptyLoot } from '../loot/types';
import { tierBoss } from '../guild/guild';
import { grantPatrolWin } from '../patrols/fight';
import { complete } from '../quests/progress';
import type { Quest } from '../quests/types';
import { availableObjectives } from '../quests/unlocks';
import { createInitialSave, type SaveData } from '../save';
import type { SecretTip } from '../types';
import { closeTip, dueTips, heldItemKinds, isPlaceRevealed, isRevealed, nextTip, noteTips, tipText } from './reveal';

const KINDS = Object.keys(revealRules) as RevealKind[];

const opened = (): SaveData => {
  const save = createInitialSave();
  save.tutorial.step = 'done';
  return save;
};

const quest = (id: string): Quest => ({
  id,
  objective: 'walk',
  band: 'short',
  arrivedAt: 0,
  expiresAt: 86_400_000,
  acceptedAt: 0,
  amount: 1,
  progress: 1,
  target: null,
  doneAt: null,
  seen: true,
});

const tip = (): SecretTip => ({
  id: 'secret|s1',
  secret: 'hiddenDen',
  source: 'library',
  sourceId: 'place1',
  anchor: { latitude: 0, longitude: 0 },
  foundAt: 0,
  expiresAt: 86_400_000,
});

describe('isRevealed', () => {
  it('reveals nothing before the tutorial is done, everything with revealAll', () => {
    const save = createInitialSave();
    expect(KINDS.every((kind) => !isRevealed(save, kind))).toBe(true);
    save.revealAll = true;
    expect(KINDS.every((kind) => isRevealed(save, kind))).toBe(true);
  });

  it('reveals the tutorial kinds right after the tutorial', () => {
    const save = opened();
    for (const kind of ['resources', 'animals', 'dungeons', 'quests', 'commonPlaces', 'patrols'] as const) {
      expect(isRevealed(save, kind)).toBe(true);
    }
    expect(isRevealed(save, 'fightEvents')).toBe(false);
  });

  it('reveals fight events once a patrol has been won', () => {
    const save = opened();
    const won = grantPatrolWin(save, [], emptyLoot(), 'p1', 0, 0);
    expect(won.stats.patrolsWon).toBe(1);
    expect(isRevealed(won, 'fightEvents')).toBe(true);
  });

  it('reveals ruins, treasure and taverns once a quest has been completed', () => {
    const save = opened();
    save.quests.list = [quest('q1')];
    expect(isRevealed(save, 'taverns')).toBe(false);
    const done = complete(save, save.quests.list[0], 0);
    expect(done.stats.questsDone).toBe(1);
    expect(isRevealed(done, 'ruins')).toBe(true);
    expect(isRevealed(done, 'treasure')).toBe(true);
    expect(isRevealed(done, 'taverns')).toBe(true);
  });

  it('reveals the Guild Hall when it opens', () => {
    const save = opened();
    expect(isRevealed(save, 'guildHall')).toBe(false);
    save.clearedDungeons = [guildRules.unlockedBy];
    expect(isRevealed(save, 'guildHall')).toBe(true);
  });

  it('reveals rare places and Sanctums at tier 2', () => {
    const save = opened();
    expect(isRevealed(save, 'rarePlaces')).toBe(false);
    expect(isRevealed(save, 'sanctums')).toBe(false);
    save.clearedDungeons = [tierBoss(1).id];
    expect(isRevealed(save, 'rarePlaces')).toBe(true);
    expect(isRevealed(save, 'sanctums')).toBe(true);
  });

  it('reveals secrets with a secret tip', () => {
    const save = opened();
    expect(isRevealed(save, 'secrets')).toBe(false);
    save.secretTips = [tip()];
    expect(isRevealed(save, 'secrets')).toBe(true);
  });
});

describe('isPlaceRevealed', () => {
  it('maps place kinds to their reveal kind', () => {
    const save = opened();
    expect(isPlaceRevealed(save, 'market')).toBe(true);
    expect(isPlaceRevealed(save, 'tavern')).toBe(false);
    expect(isPlaceRevealed(save, 'banditCamp')).toBe(false);
    save.stats.patrolsWon = 1;
    expect(isPlaceRevealed(save, 'banditCamp')).toBe(true);
  });
});

describe('heldItemKinds', () => {
  it('lists each held item kind', () => {
    const save = opened();
    expect(heldItemKinds(save)).toEqual([]);
    save.consumables = { luckyEar: 1 };
    expect(heldItemKinds(save)).toEqual(['charms']);
    save.relics = [{ uid: 'r1', relicId: 'any' }];
    save.gear = [{ uid: 'g1', itemId: 'hawkEyeRing1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 }];
    save.keyFragments = 4;
    expect(heldItemKinds(save)).toEqual(['charms', 'relics', 'trinkets', 'keyFragments']);
  });

  it('counts a charm a hero carries', () => {
    const save = opened();
    save.consumables = {};
    save.heroes = [{ ...save.heroes[0], equipment: { ...save.heroes[0].equipment, consumable: 'luckyEar' } }];
    expect(heldItemKinds(save)).toEqual(['charms']);
  });
});

describe('tips', () => {
  it('queues each tip once, seen tips never again', () => {
    const save = opened();
    const queued = noteTips(save, ['ruins', 'ruins', 'charms']);
    expect(queued.tips.pending).toEqual(['ruins', 'charms']);
    expect(noteTips(queued, ['ruins'])).toBe(queued);
  });

  it('closes a tip into seen and shows the oldest first', () => {
    const save = noteTips(opened(), ['ruins', 'charms']);
    expect(nextTip(save, true)).toBe('ruins');
    const closed = closeTip(save, 'ruins');
    expect(nextTip(closed, true)).toBe('charms');
    expect(closed.tips.seen).toEqual(['ruins']);
    expect(closeTip(closed, 'ruins').tips.seen).toEqual(['ruins']);
  });

  it('shows tips only on the map, keeping them queued elsewhere', () => {
    const save = noteTips(opened(), ['ruins']);
    expect(nextTip(save, false)).toBeNull();
    expect(save.tips.pending).toEqual(['ruins']);
    expect(nextTip(save, true)).toBe('ruins');
    const two = noteTips(save, ['charms']);
    expect(nextTip(two, true)).toBe('ruins');
    const afterFirst = closeTip(two, 'ruins');
    expect(nextTip(afterFirst, true)).toBe('charms');
  });
});

describe('dueTips', () => {
  it('includes the off-map kinds as they open', () => {
    const save = createInitialSave();
    expect(dueTips(save)).toEqual([]);
    const done = noteTips(opened(), dueTips(opened()));
    expect(done.tips.pending).toEqual(['specials', 'dungeons', 'quests']);
    const guild = opened();
    guild.clearedDungeons = [guildRules.unlockedBy];
    guild.tips.seen = ['specials', 'dungeons', 'quests'];
    const owed = noteTips(guild, dueTips(guild));
    expect(owed.tips.pending).toEqual(['guildHall', 'jobMiner']);
  });

  it('queues the Miner tip once tier 2 opens, and not before', () => {
    const save = opened();
    expect(dueTips(save)).not.toContain('jobMiner');
    save.clearedDungeons = [tierBoss(1).id];
    expect(dueTips(save)).toContain('jobMiner');
    expect(dueTips(save)).not.toContain('jobCharcoalBurner');
  });

  it('queues each gear tip once, when its piece or stock is first held', () => {
    const save = opened();
    expect(dueTips(save)).not.toContain('affixes');
    save.gear = [
      { uid: 'g1', itemId: 'stoneSword', rarity: 'uncommon' as const, roll: 12, affixes: [{ id: 'hunter', value: 22 }], rerolls: 0 },
    ];
    save.materials = { fangOrHorn: 1, fireStone: 1 };
    expect(dueTips(save)).toEqual(expect.arrayContaining(['affixes', 'ingredients', 'stones', 'reroll']));
    const queued = noteTips(save, dueTips(save));
    expect(queued.tips.pending).toEqual(['specials', 'affixes', 'ingredients', 'stones', 'reroll', 'dungeons', 'quests']);
    expect(noteTips(queued, dueTips(queued))).toBe(queued);
  });

  it('queues the family level tip once a run’s report shows a family level', () => {
    const save = opened();
    const report = { families: {} } as (typeof save.reports)[number];
    save.reports = [report];
    expect(dueTips(save)).not.toContain('familyLevel');
    save.reports = [{ ...report, families: { faith: 1 } }];
    expect(dueTips(save)).toContain('familyLevel');
  });

  it('leaves the families and threats tips to the hero screen and the first briefing with a threat', () => {
    const save = opened();
    save.heroes = [newHero('h', 'H', 'warrior', 'resilient')];
    expect(dueTips(save)).not.toContain('families');
    expect(dueTips(save)).not.toContain('threats');
  });

  it('names the strongest family of the latest run that reached a level', () => {
    setLocale('en');
    const reports = [{ families: {} }, { families: { faith: 1, bulwark: 2 } }, { families: { rally: 3 } }];
    expect(tipText('familyLevel', reports)).toBe('Your party reached ●●○ Bulwark. Tap a family banner to see what it does.');
    expect(tipText('familyLevel')).toBe('Your party reached a family level. Tap a family banner to see what it does.');
  });
});

describe('quest objectives', () => {
  it('keeps fight events out until a patrol is won', () => {
    const save = opened();
    save.seenPlaceKinds = ['banditCamp', 'chapel', 'market'];
    expect(availableObjectives(save, 'short')).not.toContain('fightEvent');
    save.stats.patrolsWon = 1;
    expect(availableObjectives(save, 'short')).toContain('fightEvent');
  });
});

describe('tips state', () => {
  it('starts with no counters and no tips', () => {
    const save = createInitialSave();
    expect(save.stats).toEqual({ patrolsWon: 0, questsDone: 0, expeditionsLaunched: 0 });
    expect(save.tips).toEqual({ seen: [], pending: [] });
  });

  it('translates a tip', () => {
    setLocale('en');
    expect(tipText('charms')).toMatch(/^Charms /);
    setLocale('fr');
    expect(tipText('charms')).toMatch(/^Les charmes /);
    setLocale('en');
  });
});
