import { frNames } from '@/content/fr/names';
import { dungeonById, itemById } from '@/content/lookup';
import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';
import { serviceRules } from '@/content/services';
import { expeditionRules } from '@/content/dungeons';

import type { PlaceKind } from '@/content/places';
import { highestUnlockedTier } from '../dungeons/unlock';
import { startExpedition } from '../expeditions/expeditions';
import { simulateRun, type PartyMember, type RunResult } from '../expeditions/simulate';
import type { LatLng } from '../generation/types';
import type { ConsumableDef } from '../types';
import { createInitialSave, type SaveData } from '../save';
import { isExhausted, setHeroHp } from '../team/health';
import { addXp } from '../team/team';
import { heroAnswers, type AnswersMember } from '../threats/answers';
import { approachScore } from '../threats/score';
import type { PlaceSpawn } from './generate';
import {
  apothecaryCare,
  apothecaryCarePrice,
  apothecaryCareProblem,
  blessRelics,
  blessRelicsProblem,
  chapelBlessingProblem,
  chapelCare,
  chapelCareProblem,
  takeChapelBlessing,
  trainHero,
  trainPrice,
  trainProblem,
  trainXp,
} from './services';

const at: LatLng = { latitude: 48.85, longitude: 2.35 };

const spawnOf = (kind: PlaceKind, id = `${kind}:0`, position = at): PlaceSpawn => ({
  id,
  kind,
  group: kind,
  tile: 't',
  position,
  startsAt: 0,
  expiresAt: 10 * 60_000,
  roll: 0,
});

/** A fresh save, tutorial done, with every hero home. */
const base = (): SaveData => ({ ...createInitialSave(), tutorial: { ...createInitialSave().tutorial, step: 'done' } });
const hero = (save: SaveData, id = 'bram') => save.heroes.find((h) => h.id === id)!;

describe('map place services', () => {
  it('heals a hero once per chapel visit', () => {
    const save = setHeroHp(setHeroHp(base(), 'bram', 0.5, 0), 'lyra', 0.5, 0);
    const chapel = spawnOf('chapel');
    const out = chapelCare(save, chapel, 'bram', 'heal', at, 0);
    expect(hero(out).hp).toBeUndefined();
    expect(out.chapelVisits[chapel.id]).toBe(chapel.expiresAt);
    expect(chapelCareProblem(out, chapel, 'lyra', 'heal', at, 0)).toBe('visited');
    expect(chapelCareProblem(out, spawnOf('chapel', 'chapel:1'), 'lyra', 'heal', at, 0)).toBeNull();
  });

  it('clears exhaustion with a chapel rest', () => {
    const save = setHeroHp(base(), 'bram', 0.5, 0, true);
    expect(isExhausted(hero(save), 0)).toBe(true);
    const out = chapelCare(save, spawnOf('chapel'), 'bram', 'rest', at, 0);
    expect(isExhausted(hero(out), 0)).toBe(false);
  });

  it('turns held holy symbols into blessed ones, leaving a carried set alone', () => {
    const save = { ...base(), consumables: { holyRelics: 2 }, heroes: base().heroes.map((h) => (h.id === 'bram' ? { ...h, equipment: { ...h.equipment, consumable: 'holyRelics' } } : h)) };
    const out = blessRelics(save, spawnOf('chapel'), at, 0);
    expect(out.consumables).toMatchObject({ holyRelics: 0, blessedRelics: 2 });
    expect(hero(out).equipment.consumable).toBe('holyRelics');
  });

  it('refuses blessing without holy symbols, from afar, or once the place is gone', () => {
    expect(blessRelicsProblem(base(), spawnOf('chapel'), at, 0)).toBe('noRelics');
    expect(blessRelicsProblem({ ...base(), consumables: { holyRelics: 1 } }, spawnOf('chapel'), { latitude: 48.9, longitude: 2.35 }, 0)).toBe('tooFar');
    expect(blessRelicsProblem({ ...base(), consumables: { holyRelics: 1 } }, spawnOf('chapel'), at, 20 * 60_000)).toBe('gone');
    expect(blessRelicsProblem({ ...base(), consumables: { holyRelics: 1 } }, spawnOf('library'), at, 0)).toBe('gone');
  });

  it('takes the chapel blessing once, waiting for the next expedition', () => {
    const save = base();
    expect(chapelBlessingProblem(save, spawnOf('chapel'), at, 0)).toBeNull();
    const blessed = takeChapelBlessing(save, spawnOf('chapel'), at, 0);
    expect(blessed.expeditionBlessing).toBe(true);
    expect(chapelBlessingProblem(blessed, spawnOf('chapel'), at, 0)).toBe('alreadyBlessed');
  });

  it('names the holy kit Holy symbols in English and French', () => {
    expect(itemById.holyRelics.name).toBe('Holy symbols');
    expect(itemById.blessedRelics.name).toBe('Blessed symbols');
    expect(frNames['Holy symbols']).toBe('Symboles sacrés');
    expect(frNames['Blessed symbols']).toBe('Symboles bénis');
    expect(en.places.bless).toBe('Bless holy symbols');
    expect(fr.places.bless).toBe('Bénir les symboles sacrés');
  });

  it('scores Faith +3 with blessed symbols, against +2 with plain ones', () => {
    const carrier = (itemId: string): AnswersMember => ({
      heroId: 'bram',
      classId: 'warrior',
      traitId: 'resilient',
      gearKeywords: [],
      kit: { itemId, effect: (itemById[itemId] as ConsumableDef).kit! },
      salveElement: null,
      classResists: [],
    });
    const faith = heroAnswers(carrier('holyRelics')).approaches.faith;
    expect(approachScore(heroAnswers(carrier('holyRelics')), 'desecrated', 'faith', true)).toBe(faith + 2);
    expect(approachScore(heroAnswers(carrier('blessedRelics')), 'desecrated', 'faith', true)).toBe(faith + 3);
  });

  it('spends the blessing on the next expedition only', () => {
    const save = { ...base(), expeditionBlessing: true };
    const out = startExpedition(save, 'ratCellar', ['bram'], 0);
    expect(out.expeditions[0].blessed).toBe(true);
    expect(out.expeditionBlessing).toBe(false);
    const again = startExpedition(out, 'ratCellar', ['lyra'], 0);
    expect(again.expeditions[1].blessed).toBeUndefined();
    expect(again.expeditionBlessing).toBe(false);
  });

  it('a blessed run deals more damage', () => {
    const steady = { ...expeditionRules, mishapChance: 0, fortune: 0, damageVariance: 0, enemyCritChance: 0 };
    const member: PartyMember = {
      heroId: 'a',
      name: 'a',
      classId: 'warrior',
      traitId: 'none',
      weaponName: null,
      gearKeywords: [],
      heavy: false,
      concealed: false,
      maxHp: 100,
      hp: 100,
      power: 10,
      magic: 0,
      damageStat: 'power',
      armour: 0,
      resistance: 0,
      evasion: 0,
      speed: 5,
      crit: 0,
      luck: 0,
      threat: 1,
      resists: [],
      abilities: [],
      consumable: null,
    };
    const dealt = (run: RunResult) =>
      run.encounters.reduce((sum, e) => sum + Object.values(e.dealt).reduce((a, b) => a + b, 0), 0);
    const rules = { ...steady };
    const plain = simulateRun([member], dungeonById.ratCellar, 's', { rules });
    const blessed = simulateRun([member], dungeonById.ratCellar, 's', { rules, blessed: true });
    expect(dealt(blessed)).toBeGreaterThan(dealt(plain));
  });

  it('charges the apothecary its tier price and refuses without gold', () => {
    const apothecary = spawnOf('apothecary');
    const broke = setHeroHp({ ...base(), gold: 0 }, 'bram', 0.5, 0);
    expect(apothecaryCarePrice(broke, 'heal')).toBe(serviceRules.apothecary.healPrice[highestUnlockedTier(broke) - 1]);
    expect(apothecaryCareProblem(broke, apothecary, 'bram', 'heal', at, 0)).toBe('gold');
    const out = apothecaryCare(setHeroHp({ ...base(), gold: 100 }, 'bram', 0.5, 0), apothecary, 'bram', 'heal', at, 0);
    expect(out.gold).toBe(100 - apothecaryCarePrice(broke, 'heal'));
    expect(hero(out).hp).toBeUndefined();
  });

  it('trains a hero at the library for the configured XP, refusing at the cap or without gold', () => {
    const library = spawnOf('library');
    const save = { ...base(), gold: 100 };
    expect(trainXp(save)).toBe(serviceRules.library.trainXp[highestUnlockedTier(save) - 1]);
    const out = trainHero(save, library, 'bram', at, 0);
    expect(out.gold).toBe(100 - trainPrice(save));
    expect(hero(out)).toEqual(addXp(hero(save), trainXp(save)));
    const capped = { ...save, heroes: save.heroes.map((h) => ({ ...h, level: 15, xp: 0 })) };
    expect(trainProblem(capped, library, 'bram', at, 0)).toBe('maxLevel');
    expect(trainProblem({ ...save, gold: 0 }, library, 'bram', at, 0)).toBe('gold');
  });

  it('refuses care from afar or once the place is gone', () => {
    expect(chapelCareProblem(setHeroHp(base(), 'bram', 0.5, 0), spawnOf('chapel'), 'bram', 'heal', { latitude: 48.9, longitude: 2.35 }, 0)).toBe('tooFar');
    expect(chapelCareProblem(setHeroHp(base(), 'bram', 0.5, 0), spawnOf('chapel'), 'bram', 'heal', at, 20 * 60_000)).toBe('gone');
    expect(trainProblem(base(), spawnOf('library'), 'bram', { latitude: 48.9, longitude: 2.35 }, 0)).toBe('tooFar');
  });
});
