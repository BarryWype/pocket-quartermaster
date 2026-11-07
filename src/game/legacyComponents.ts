/**
 * The removed components and their affixes, as they were the moment they were
 * deleted (families rework). Read by the save migration and nothing else.
 */

/** Each removed component and the monster part a held one becomes two of: the family of the enemy it came from. */
export const LEGACY_COMPONENT_PARTS: Record<string, string> = {
  captainsSpurs: 'tatteredInsignia',
  ogreKnucklebone: 'bruteBlood',
  phylacteryShard: 'graveDust',
  giantsHeartstone: 'bruteBlood',
  dragonClaw: 'scale',
  drakeFang: 'fangOrHorn',
  harpyFlightFeather: 'feather',
  clockworkEscapement: 'cog',
  golemCore: 'cog',
  trollHide: 'bruteBlood',
  orcWarDrumSkin: 'goblinEar',
  spiderSilk: 'venomSac',
};

/** Monster parts a held component becomes. */
export const LEGACY_COMPONENT_PART_COUNT = 2;

/**
 * Each removed component affix: the component it came from, its rolled range
 * (fixed ones had none), and the closest part affix on an offensive and on a
 * defensive piece.
 */
export const LEGACY_KEYWORD_AFFIXES: Record<
  string,
  { componentId: string; range?: { min: number; max: number }; weapon: string; armourOffhand: string }
> = {
  staggering: { componentId: 'ogreKnucklebone', weapon: 'sundering', armourOffhand: 'bulwark' },
  channeling: { componentId: 'phylacteryShard', weapon: 'opener', armourOffhand: 'spiritWard' },
  guarding: { componentId: 'giantsHeartstone', weapon: 'sundering', armourOffhand: 'bulwark' },
  cleaving: { componentId: 'dragonClaw', weapon: 'bloodthirsty', armourOffhand: 'reinforced' },
  piercing: { componentId: 'drakeFang', weapon: 'sundering', armourOffhand: 'reinforced' },
  reaching: { componentId: 'harpyFlightFeather', weapon: 'opener', armourOffhand: 'light' },
  parrying: { componentId: 'clockworkEscapement', weapon: 'swift', armourOffhand: 'light' },
  bracing: { componentId: 'golemCore', weapon: 'hunter', armourOffhand: 'reinforced' },
  mending: { componentId: 'trollHide', weapon: 'bloodthirsty', armourOffhand: 'potionAffinity' },
  inspiring: { componentId: 'orcWarDrumSkin', weapon: 'veteran', armourOffhand: 'soldiers' },
  fleet: { componentId: 'captainsSpurs', range: { min: 2, max: 4 }, weapon: 'swift', armourOffhand: 'light' },
  silken: { componentId: 'spiderSilk', range: { min: 4, max: 8 }, weapon: 'swift', armourOffhand: 'light' },
};

/** The removed "Steady vs <threat>" affixes' ids, as in `steadyPoison`. */
export const LEGACY_STEADY = /^steady[A-Z]/;
