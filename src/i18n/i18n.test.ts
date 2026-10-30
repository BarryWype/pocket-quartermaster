import { contentTexts } from '@/content/fr/contentTexts';
import { frLogTemplates } from '@/content/fr/logTemplates';
import { frNames } from '@/content/fr/names';
import { frNotificationTexts } from '@/content/fr/notifications';
import { frTutorialHints } from '@/content/fr/tutorial';
import { logTemplates } from '@/content/logTemplates';
import { notificationTexts } from '@/content/notifications';
import { tutorialHints } from '@/content/tutorial';
import { describeMobs } from '@/game/expeditions/log';

import { en } from './en';
import { fr } from './fr';
import { article, plural } from './french';
import { fill, formatDuration, formatNumber, setLocale, t, tr } from '.';

/** Every string in a nested object, by path. */
function strings(value: unknown, path = ''): Record<string, string> {
  if (typeof value === 'string') return { [path]: value };
  if (value && typeof value === 'object') {
    return Object.assign({}, ...Object.entries(value).map(([key, child]) => strings(child, path ? `${path}.${key}` : key)));
  }
  return {};
}

const placeholders = (text: string) => [...text.matchAll(/\{(?:\w+:)?(\w+)\}/g)].map((m) => m[1]).sort();

describe.each([
  ['UI texts', en, fr],
  ['log templates', logTemplates, frLogTemplates],
  ['tutorial hints', tutorialHints, frTutorialHints],
  ['notification texts', notificationTexts, frNotificationTexts],
])('French %s', (_name, english, french) => {
  const enStrings = strings(english);
  const frStrings = strings(french);

  it('has exactly the English keys', () => {
    expect(Object.keys(frStrings).sort()).toEqual(Object.keys(enStrings).sort());
  });

  it('uses the same placeholders', () => {
    for (const [path, text] of Object.entries(enStrings)) {
      expect([path, placeholders(frStrings[path] ?? '')]).toEqual([path, placeholders(text)]);
    }
  });
});

describe('French content names', () => {
  it('cover every content name and description', () => {
    expect(contentTexts().filter((text) => !(text in frNames))).toEqual([]);
  });
});

describe('French grammar', () => {
  it('picks agreeing articles', () => {
    expect(article('un', 'araignée de cave')).toBe('une araignée de cave');
    expect(article('le', 'ermite errant')).toBe('l’ermite errant');
    expect(article('le', 'hache en bois')).toBe('la hache en bois');
    expect(article('du', 'Cave aux rats')).toBe('de la Cave aux rats');
    expect(article('du', 'Ruines du titan')).toBe('des Ruines du titan');
    expect(article('au', 'roi des rats')).toBe('au roi des rats');
  });

  it('makes plurals', () => {
    expect(plural('rat géant')).toBe('rats géants');
    expect(plural('araignée de cave')).toBe('araignées de cave');
    expect(plural('louveteau')).toBe('louveteaux');
    expect(plural('loup gris')).toBe('loups gris');
  });
});

describe('language switch', () => {
  afterEach(() => setLocale('en'));

  it('keeps English texts as they were', () => {
    expect(t('expeditions.party', { count: 2, max: 3 })).toBe('Party (2/3)');
    expect(t('common.charters', { count: 1 })).toBe('1 charter');
    expect(t('common.charters', { count: 0 })).toBe('0 charters');
    expect(formatNumber(12345)).toBe('12,345');
    expect(formatDuration(65_000)).toBe('1m 05s');
    expect(tr('Rat Cellar')).toBe('Rat Cellar');
    expect(describeMobs([{ mobId: 'giantRat', count: 1 }, { mobId: 'cellarSpider', count: 2 }])).toBe(
      'a giant rat and 2 cellar spiders',
    );
  });

  it('switches to French', () => {
    setLocale('fr');
    expect(t('expeditions.party', { count: 2, max: 3 })).toBe('Groupe (2/3)');
    expect(t('common.charters', { count: 0 })).toBe('0 charte');
    expect(formatNumber(12345)).toBe('12 345');
    expect(tr('Rat Cellar')).toBe('Cave aux rats');
    expect(fill(frLogTemplates.trapMissed[0], { trap: tr('spike pit') })).toBe('Le groupe a évité une fosse à pieux.');
    expect(describeMobs([{ mobId: 'giantRat', count: 1 }, { mobId: 'cellarSpider', count: 2 }])).toBe(
      'un rat géant et 2 araignées de cave',
    );
  });
});

describe('expedition wording', () => {
  // Runs launched from the phone are expeditions; "quest" means the daily quests.
  it('never calls an expedition a quest', () => {
    const texts = {
      ...strings(en.expeditions, 'en'),
      ...strings(fr.expeditions, 'fr'),
      en: en.menu.expeditions,
      fr: fr.menu.expeditions,
      enScreen: en.screens.expeditions,
      frScreen: fr.screens.expeditions,
      ...strings(tutorialHints, 'tutorial'),
      ...strings(frTutorialHints, 'frTutorial'),
      ...strings(logTemplates, 'log'),
      ...strings(frLogTemplates, 'frLog'),
    };
    const quests = Object.entries(texts).filter(([, text]) => /qu[eê]te?s?\b|\bquest/i.test(text));
    expect(quests).toEqual([]);
  });
});
