/** Same order as `tavernNames` in `../taverns.ts`. */
const adjectives: { m: string; f: string }[] = [
  { m: 'Rouillé', f: 'Rouillée' },
  { m: 'Fringant', f: 'Fringante' },
  { m: 'Somnolent', f: 'Somnolente' },
  { m: 'Doré', f: 'Dorée' },
  { m: 'Tordu', f: 'Tordue' },
  { m: 'Joyeux', f: 'Joyeuse' },
  { m: 'Percé', f: 'Percée' },
  { m: 'd’Or', f: 'd’Or' },
  { m: 'Endormi', f: 'Endormie' },
  { m: 'Chanceux', f: 'Chanceuse' },
];
const nouns: { name: string; feminine?: boolean }[] = [
  { name: 'Chope', feminine: true },
  { name: 'Poney' },
  { name: 'Dragon' },
  { name: 'Oie', feminine: true },
  { name: 'Tonneau' },
  { name: 'Lanterne', feminine: true },
  { name: 'Enclume', feminine: true },
  { name: 'Violoneux' },
  { name: 'Sanglier' },
  { name: 'Bouilloire', feminine: true },
];

/** "Au Dragon Doré", "À la Chope Rouillée", "À l’Oie Joyeuse". */
export function frTavernName(adjective: number, noun: number) {
  const { name, feminine } = nouns[noun];
  const words = `${name} ${feminine ? adjectives[adjective].f : adjectives[adjective].m}`;
  if (/^[AEIOU]/.test(name)) return `À l’${words}`;
  return feminine ? `À la ${words}` : `Au ${words}`;
}
