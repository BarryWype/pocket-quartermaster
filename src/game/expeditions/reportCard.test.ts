import { itemById } from '@/content/lookup';
import { setLocale } from '@/i18n';

import { emptyLoot } from '../loot/types';
import type { ExpeditionReport } from '../types';
import { reportCard } from './reportCard';
import type { Contribution, HeroTally, RunTally } from './tally';

const heroes = [
  { id: 'bram', name: 'Bram' },
  { id: 'lyra', name: 'Lyra' },
];
const hero = (heroId: string, extra: Partial<HeroTally> = {}): HeroTally => ({
  heroId,
  dealt: 0,
  taken: 0,
  healing: 0,
  kills: 0,
  eliteKills: 0,
  bossKill: false,
  knockouts: 0,
  specials: 0,
  ...extra,
});
const entry = (kind: Contribution['kind'], id: string, heroId: string | null, extra: Partial<Contribution>): Contribution => ({
  kind,
  id,
  heroId,
  damage: 0,
  prevented: 0,
  healing: 0,
  turns: 0,
  fights: 0,
  saves: 0,
  ...extra,
});
const tally = (extra: Partial<RunTally> = {}): RunTally => ({
  heroes: [hero('bram', { dealt: 200, taken: 40 }), hero('lyra', { dealt: 100, taken: 20, healing: 30 })],
  contributions: [],
  threats: {},
  ...extra,
});
/** A won Goblin Warren run of 25 minutes; two heroes of 100 max HP. */
const report = (extra: Partial<ExpeditionReport> = {}): ExpeditionReport => ({
  id: 'r',
  dungeonId: 'goblinWarren',
  heroIds: ['bram', 'lyra'],
  startedAt: 0,
  finishedAt: 25 * 60_000,
  outcome: 'success',
  success: true,
  encountersCleared: 5,
  encounterCount: 5,
  heroHp: [
    { heroId: 'bram', hp: 60, maxHp: 100 },
    { heroId: 'lyra', hp: 80, maxHp: 100 },
  ],
  threats: [],
  opportunity: null,
  salvaged: [],
  loot: emptyLoot(),
  gold: 0,
  xp: 0,
  consumablesUsed: [],
  log: [],
  seen: false,
  tally: tally(),
  ...extra,
});

describe('report card', () => {
  it('opens on the outcome and the duration', () => {
    expect(reportCard(report(), heroes).outcome).toBe('Won in 25m');
    expect(reportCard(report({ outcome: 'retreat', success: false, encountersCleared: 3 }), heroes).outcome).toBe('Retreated after 25m · 3/5 fights');
    expect(reportCard(report({ outcome: 'defeat', success: false, encountersCleared: 2, startedAt: undefined }), heroes).outcome).toBe('Lost · 2/5 fights');
  });

  it('shows only the outcome for a report from before the tally', () => {
    expect(reportCard(report({ tally: undefined }), heroes)).toEqual({ outcome: 'Won in 25m', work: [], helped: null, hero: null, heroNews: [] });
  });

  it('credits the player’s work by name, the largest first, at most three lines over the threshold', () => {
    const contributions = [
      entry('meal', 'bossHeal', null, { healing: 60 }),
      entry('affix', 'venomous', 'bram', { damage: 114, uid: 'g1', itemId: 'spear1' }),
      entry('family', 'wild1', null, { prevented: 41 }),
      entry('consumable', 'healingPotion', 'lyra', { healing: 30, boss: true, stood: true }),
      // Under the threshold: a quarter of the party's mean max HP.
      entry('affix', 'hunter', 'lyra', { damage: 20 }),
    ];
    const card = reportCard(report({ mealId: 'huntersStew', tally: tally({ contributions }) }), heroes);
    expect(card.work.map((line) => line.text)).toEqual([
      'Bram’s Wooden spear (Venomous) did 38% of the damage.',
      'Hunter’s stew healed 60 HP over the run.',
      'Your Wild tags kept 41 damage off.',
    ]);
    expect(card.work[0].emoji).toBe(itemById.spear1.emoji);
  });

  it('announces a name earned or grown first, and credits a forged piece as the player’s', () => {
    const contributions = [entry('affix', 'venomous', 'bram', { damage: 114, itemId: 'spear1', forged: true })];
    const gearNames = [{ uid: 'g1', itemId: 'spear1', name: { epithet: 'boss:millOgre', step: 0, hero: 'Bram', at: 0 }, grew: false }];
    const card = reportCard(report({ gearNames, tally: tally({ contributions }) }), heroes);
    expect(card.work).toEqual([
      expect.objectContaining({ text: 'Wooden spear earned a name: Bram’s Ogre-bane.', flourish: true }),
      expect.objectContaining({ text: 'Bram’s Wooden spear (Venomous), forged by you, did 38% of the damage.' }),
    ]);
    const grown = reportCard(report({ gearNames: [{ ...gearNames[0], name: { ...gearNames[0].name, step: 1 }, grew: true }] }), heroes);
    expect(grown.work[0].text).toBe('Wooden spear’s name grew: Bram’s Ogre-breaker.');
  });

  it('writes a line for each kind of contribution', () => {
    const lines = (c: Contribution) => reportCard(report({ tally: tally({ contributions: [c] }) }), heroes).work.map((line) => line.text);
    expect(lines(entry('consumable', 'healingPotion', 'lyra', { healing: 30, boss: true, stood: true }))).toEqual([
      'Lyra’s Minor healing potion kept Lyra standing against the goblin chief.',
    ]);
    expect(lines(entry('affix', 'hunter', 'bram', { damage: 26 }))).toEqual(['Bram’s Hunter affix added 26 damage.']);
    expect(lines(entry('family', 'breaker2', null, { turns: 3 }))).toEqual(['Your Breaker tags cost the enemy 3 turns.']);
    expect(lines(entry('family', 'watch2', null, { fights: 1 }))).toEqual(['Your Watch tags spared the party 1 fight.']);
    expect(lines(entry('affix', 'unyielding', 'bram', { saves: 1, itemId: 'mail1' }))).toEqual([`Bram’s ${itemById.mail1.name} (Unyielding) saved a hero from a knockout.`]);
  });

  it('reads a family’s levels as one line', () => {
    const contributions = [entry('family', 'pack1', null, { damage: 40 }), entry('family', 'pack2', null, { damage: 30 }), entry('affix', 'hunter', 'bram', { damage: 50 })];
    const card = reportCard(report({ tally: tally({ contributions }) }), heroes);
    expect(card.work.map((line) => line.text)).toEqual(['Your Pack tags did 23% of the damage.', 'Bram’s Hunter affix did 17% of the damage.']);
  });

  it('says what would have helped only after a loss, a retreat or a knockout', () => {
    const threats: ExpeditionReport['threats'] = [
      { id: 'darkness', level: 2, state: 'half', short: 1 },
      { id: 'beasts', level: 1, state: 'full', short: 2 },
    ];
    const costs = tally({ threats: { darkness: { taken: 30, lost: 50, firstStrikes: 4 }, beasts: { taken: 20, lost: 0, firstStrikes: 0 } } });
    expect(reportCard(report({ threats, tally: costs }), heroes).helped).toBeNull();
    const knocked = { ...costs, heroes: [hero('bram', { dealt: 10, knockouts: 1 }), hero('lyra')] };
    expect(reportCard(report({ threats, tally: knocked }), heroes).helped!.text).toBe(
      'Darkness was only half answered: the enemy struck first in 4 fights. One more Watch tag would light it.',
    );
    const lost = report({ outcome: 'defeat', success: false, threats: [{ id: 'beasts', level: 2, state: 'full', short: 2 }], tally: costs });
    expect(reportCard(lost, heroes).helped!.text).toBe('Nobody answered Beasts: 20 extra damage taken. 2 more Wild tags would light it.');
    expect(reportCard(report({ outcome: 'defeat', success: false, threats: [], tally: costs }), heroes).helped).toBeNull();
  });

  it('names the element of a missed Element threat', () => {
    const lost = report({
      outcome: 'retreat',
      success: false,
      threats: [{ id: 'element', level: 1, element: 'fire', state: 'half', short: 1 }],
      tally: tally({ threats: { element: { taken: 25, lost: 0, firstStrikes: 0 } } }),
    });
    expect(reportCard(lost, heroes).helped).toMatchObject({ emoji: '🔥', text: 'Fire was only half answered: 25 extra damage taken. One more Warding tag would light it.' });
  });

  it('picks the hero of the run: the boss’s killing blow, most damage, most healing or the hits taken', () => {
    const pick = (heroTallies: HeroTally[]) => reportCard(report({ tally: tally({ heroes: heroTallies }) }), heroes).hero;
    expect(pick([hero('bram', { dealt: 200 }), hero('lyra', { dealt: 150, bossKill: true })])).toEqual({
      heroId: 'lyra',
      reason: 'bossKill',
      text: 'Lyra landed the killing blow on the goblin chief.',
    });
    expect(pick([hero('bram', { dealt: 300 }), hero('lyra', { dealt: 100 })])).toMatchObject({ heroId: 'bram', text: 'Bram did 75% of the damage.' });
    expect(pick([hero('bram', { dealt: 100 }), hero('lyra', { dealt: 100, healing: 80 })])).toMatchObject({ heroId: 'lyra', text: 'Lyra healed 80 HP.' });
    expect(pick([hero('bram', { dealt: 100, taken: 90 }), hero('lyra', { dealt: 100, taken: 10 })])).toMatchObject({ heroId: 'bram', reason: 'taken', text: 'Bram took the hits: 90 damage.' });
    // A sliver of healing doesn't outweigh the damage.
    expect(pick([hero('bram', { dealt: 300 }), hero('lyra', { dealt: 100, healing: 2 })])).toMatchObject({ heroId: 'bram', reason: 'damage' });
    // A hero knocked out didn't take the hits standing.
    expect(pick([hero('bram', { dealt: 100, taken: 90, knockouts: 1 }), hero('lyra', { dealt: 110, taken: 10 })])).toMatchObject({ heroId: 'lyra', reason: 'damage' });
  });

  it('announces titles earned and companions made under the hero of the run', () => {
    const card = reportCard(report({ heroNews: { titles: [{ heroId: 'bram', titleId: 'unbroken' }], companions: [['bram', 'lyra']] } }), heroes);
    expect(card.heroNews.map((line) => line.text)).toEqual(['Bram earned a title: the Unbroken.', 'Bram and Lyra are now companions.']);
  });

  it('reads in French', () => {
    setLocale('fr');
    try {
      const contributions = [entry('affix', 'venomous', 'bram', { damage: 114, itemId: 'spear1' })];
      const card = reportCard(report({ tally: tally({ contributions }) }), heroes);
      expect(card.outcome).toBe('Victoire en 25\u00a0min');
      expect(card.work[0].text).toBe('Lance en bois de Bram (Venimeux) : 38\u00a0% des dégâts.');
    } finally {
      setLocale('en');
    }
  });
});
