import { feminine, pluralNames, plurals, silentH } from '@/content/fr/nouns';

const feminines = new Set(feminine);
const pluralSet = new Set(pluralNames);
const silentHs = new Set(silentH);
/** Words after these stay as they are in a plural: "araignées de cave". */
const STOP_WORDS = new Set(['de', 'des', 'du', 'à', 'au', 'aux', 'en']);

const headNoun = (noun: string) => noun.toLowerCase().split(' ')[0];
const elides = (noun: string) => /^[aeiouyéèêàâîôœ]/i.test(noun) || silentHs.has(headNoun(noun));

/** "un rat", "une araignée", "le rat", "l’ermite", "du rat", "de la tour", "au roi", "des Ruines". */
export function article(kind: string, noun: string) {
  const isPlural = pluralSet.has(noun.toLowerCase());
  const isFeminine = feminines.has(headNoun(noun)) || feminines.has(noun.toLowerCase());
  const elided = elides(noun);
  switch (kind) {
    case 'un':
      return `${isPlural ? 'des' : isFeminine ? 'une' : 'un'} ${noun}`;
    case 'le':
      return isPlural ? `les ${noun}` : elided ? `l’${noun}` : `${isFeminine ? 'la' : 'le'} ${noun}`;
    case 'du':
      return isPlural ? `des ${noun}` : elided ? `de l’${noun}` : `${isFeminine ? 'de la' : 'du'} ${noun}`;
    case 'au':
      return isPlural ? `aux ${noun}` : elided ? `à l’${noun}` : `${isFeminine ? 'à la' : 'au'} ${noun}`;
    default:
      return noun;
  }
}

const pluralWord = (word: string) => {
  if (/[sxz]$/.test(word)) return word;
  if (/(eau|eu)$/.test(word)) return `${word}x`;
  if (/al$/.test(word)) return `${word.slice(0, -2)}aux`;
  return `${word}s`;
};

/** "rat géant" → "rats géants", "araignée de cave" → "araignées de cave". */
export function plural(noun: string) {
  if (plurals[noun]) return plurals[noun];
  const words = noun.split(' ');
  const stop = words.findIndex((word) => STOP_WORDS.has(word) || word.startsWith('d’'));
  return words.map((word, i) => (stop !== -1 && i >= stop ? word : pluralWord(word))).join(' ');
}
