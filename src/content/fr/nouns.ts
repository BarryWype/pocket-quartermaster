// Grammar for the French names in `names.ts`, used to pick "un/une", "le/la/l’"
// and plurals. Lists hold lowercase head nouns (the first word of a name) or
// whole names; everything else is masculine and singular.

export const feminine = [
  // Gear and consumables
  'épée', 'baguette', 'armure', 'hache', 'masse', 'dague', 'pioche', 'potion', 'ration',
  // Places
  'cave', 'garenne', 'crique', 'palissade', 'tanière', 'tour', 'carrière', 'mine', 'grotte', 'crête',
  'forteresse', 'cabane', 'crypte', 'falaises', 'chambre', 'salle', 'île', 'citadelle', 'profondeurs',
  'ruines', 'flèche', 'forge',
  // Traps and obstacles
  'toile', 'tombe', 'fosse', 'barricade', 'meule', 'poutre', 'clochette', 'trappe', 'salve', 'porte',
  'planche', 'arche', 'meurtrière', 'chute', 'explosion', 'cheminée', 'galerie', 'corniche', 'pierre',
  'main', 'grille', 'lame', 'glace', 'avalanche', 'frappe', 'pression', 'statue', 'chaussée',
  // Creatures and people
  'mère', 'reine', 'sorcière', 'liche', 'matriarche', 'horreur', 'araignée', 'nuée', 'goule', 'brute',
  'sangsue', 'chauve-souris', 'limace', 'phalène', 'anguille', 'harpie', 'nymphe', 'sentinelle',
  'vouivre', 'baudroie', 'mère-ronce', 'fouetteuse', 'aile-foudre', 'taupe',
  // Events
  'source', 'cachette', 'embuscade',
];

/** Names that are plural: "les Tertres funéraires", "des Ruines du titan". */
export const pluralNames = ['tertres funéraires', 'falaises des harpies', 'pics des vouivres', 'profondeurs abyssales', 'ruines du titan'];

/** Head nouns starting with a silent "h", which take "l’". */
export const silentH = ['horreur', 'homme', 'herbe'];

/** Plurals the usual rule gets wrong. */
export const plurals: Record<string, string> = {
  'chauve-souris fantôme': 'chauves-souris fantômes',
  'oiseau-tonnerre': 'oiseaux-tonnerre',
  'homme de main de la crique': 'hommes de main de la crique',
};
