import { lootMatrix } from '@/content/loot/matrix';
import { recruitRules } from '@/content/roster';
import { growthRules, newHero } from '@/content/heroes';
import { secretRules } from '@/content/secrets';

import { distanceMeters } from '../generation/geo';
import type { LatLng } from '../generation/types';
import { rosterCap } from '../guild/guild';
import { LOOT_CATEGORIES } from '../loot/types';
import { createInitialSave, type SaveData } from '../save';
import { grantTip, tipPosition } from '../secrets/tips';
import { claimProblem, claimQuest, QUEST_SOURCES, questLoot, questLuck, questRecruit, reachMark } from './rewards';
import type { Quest } from './types';

const DAY = 86_400_000;
const mark: LatLng = { latitude: 51.5, longitude: -0.12 };

const quest = (band: Quest['band'], overrides: Partial<Quest> = {}): Quest => ({
  id: `q|${band}`,
  objective: band === 'secret' ? 'mark' : 'walk',
  band,
  arrivedAt: 0,
  expiresAt: 2 * DAY,
  acceptedAt: 0,
  amount: 1,
  progress: 1,
  target: null,
  doneAt: 10,
  seen: true,
  ...overrides,
});

const withQuests = (...quests: Quest[]): SaveData => {
  const save = createInitialSave();
  return { ...save, quests: { ...save.quests, list: quests } };
};

describe('quest rewards', () => {
  it('pays from the band’s matrix row', () => {
    for (const band of ['short', 'medium', 'long', 'secret'] as const) {
      const row = lootMatrix[QUEST_SOURCES[band]];
      const allowed = LOOT_CATEGORIES.filter((category) => row.marks[category] !== '—');
      for (let i = 0; i < 50; i++) {
        const loot = questLoot(createInitialSave(), quest(band, { id: `q|${band}|${i}` }));
        for (const category of loot.dropped) expect(allowed).toContain(category);
        expect(loot.gold).toBeGreaterThan(0);
        expect(loot.xp).toBe(0);
      }
    }
  });

  it('is fixed by the quest, and paid once on claim', () => {
    const save = withQuests(quest('medium'));
    expect(questLoot(save, save.quests.list[0])).toEqual(questLoot(save, save.quests.list[0]));
    const { save: claimed, loot } = claimQuest(save, 'q|medium', 20);
    expect(claimed.gold).toBe(save.gold + loot.gold);
    expect(claimed.quests.list).toEqual([]);
    expect(claimProblem(claimed, 'q|medium')).toBe('gone');
  });

  it('waits until the quest is done', () => {
    const save = withQuests(quest('short', { doneAt: null, progress: 0 }));
    expect(claimProblem(save, 'q|short')).toBe('notDone');
    expect(() => claimQuest(save, 'q|short', 20)).toThrow();
  });

  it('reads the Luck of the three luckiest heroes', () => {
    const save = createInitialSave();
    const lucky = save.heroes.map((hero) => ({ ...hero, level: growthRules.luckLevel }));
    expect(questLuck({ ...save, heroes: lucky })).toBe(Math.min(3, lucky.length) * growthRules.luck);
    expect(questLuck({ ...save, heroes: [...lucky, ...lucky.map((h) => ({ ...h, id: `${h.id}2` }))] })).toBe(3 * growthRules.luck);
  });
});

describe('quest recruits', () => {
  it('roll on long quests only, fixed by the save and the quest', () => {
    const save = createInitialSave();
    expect(questRecruit(save, quest('short'))).toBe(false);
    expect(questRecruit(save, quest('medium'))).toBe(false);
    expect(questRecruit(save, quest('secret'))).toBe(false);
    const rolled = questRecruit(save, quest('long'));
    expect(questRecruit(save, quest('long'))).toBe(rolled);
    // Some long quests roll one and some do not, or the mark would be dead content.
    const ids = Array.from({ length: 200 }, (_, i) => `q|long|${i}`);
    expect(ids.some((id) => questRecruit(save, quest('long', { id })))).toBe(true);
    expect(ids.some((id) => !questRecruit(save, quest('long', { id })))).toBe(true);
  });

  it('add a hero when a claimed long quest rolls a recruit', () => {
    const save = createInitialSave();
    const id = Array.from({ length: 200 }, (_, i) => `q|long|${i}`).find((candidate) => questRecruit(save, quest('long', { id: candidate })))!;
    const withQuest = { ...save, quests: { ...save.quests, list: [quest('long', { id })] } };
    const { save: claimed, recruit } = claimQuest(withQuest, id, 20);
    expect(recruit?.joined).toBe(true);
    expect(claimed.heroes).toHaveLength(withQuest.heroes.length + 1);
    expect(claimed.heroes.at(-1)).toMatchObject({ name: recruit!.offer.name, classId: recruit!.offer.classId });
  });

  it('pay the tier’s full-roster gold when the roster is full', () => {
    const save = createInitialSave();
    const id = Array.from({ length: 200 }, (_, i) => `q|long|${i}`).find((candidate) => questRecruit(save, quest('long', { id: candidate })))!;
    let withQuest = { ...save, quests: { ...save.quests, list: [quest('long', { id })] } };
    while (withQuest.heroes.length < rosterCap(withQuest)) {
      withQuest = { ...withQuest, heroes: [...withQuest.heroes, newHero(`x${withQuest.heroes.length}`, 'X', 'warrior', 'resilient')] };
    }
    const { save: claimed, loot, recruit } = claimQuest(withQuest, id, 20);
    expect(recruit?.joined).toBe(false);
    expect(recruit?.gold).toBe(recruitRules.fullRosterGold[0]);
    expect(claimed.gold).toBe(withQuest.gold + loot.gold + recruitRules.fullRosterGold[0]);
    expect(claimed.heroes).toHaveLength(withQuest.heroes.length);
  });
});

describe('reaching the strange mark', () => {
  const secret = () =>
    quest('secret', {
      id: 's|5',
      doneAt: null,
      progress: 0,
      acceptedAt: 0,
      target: { placeId: 'mark:s|5', kind: 'mark', position: mark, from: mark, expiresAt: 2 * DAY },
    });

  it('completes the quest and tips off a place within about 1 km of the mark', () => {
    const { save, tip } = reachMark(withQuests(secret()), 's|5', 100);
    expect(save.quests.list[0].doneAt).toBe(100);
    if (tip?.kind !== 'tip') throw new Error('expected a tip');
    expect(tip.tip.source).toBe('quest');
    expect(['hiddenDen', 'blackMarket']).toContain(tip.tip.secret);
    expect(distanceMeters(mark, tipPosition(tip.tip)!)).toBeLessThanOrEqual(secretRules.questDistanceMeters[1] + 1);
  });

  it('tips off a place that has no active tip', () => {
    const den = grantTip(withQuests(secret()), { source: 'library', sourceId: 'lib', anchor: mark }, 0).save;
    const { tip } = reachMark(den, 's|5', 100);
    expect(tip?.kind === 'tip' && tip.tip.secret).toBe('blackMarket');
  });

  it('pays a little gold when all three already have tips', () => {
    let save = withQuests(secret());
    save = grantTip(save, { source: 'library', sourceId: 'lib', anchor: mark }, 0).save;
    save = grantTip(save, { source: 'heist', sourceId: 'heist', anchor: mark }, 0).save;
    save = grantTip(save, { source: 'fishingDock', sourceId: 'dock', anchor: mark }, 0).save;
    const { save: after, tip } = reachMark(save, 's|5', 100, () => true);
    expect(tip?.kind).toBe('gold');
    expect(after.gold).toBeGreaterThan(save.gold);
    expect(after.secretTips).toHaveLength(3);
  });

  it('does nothing before the quest is accepted', () => {
    const save = withQuests({ ...secret(), acceptedAt: null });
    expect(reachMark(save, 's|5', 100)).toEqual({ save, tip: null });
  });
});
