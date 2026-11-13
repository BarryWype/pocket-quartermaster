import type { Tag } from '@/game/types';

// Earned names for gear (see game/gear/history.ts): a piece that lands the
// killing blow on a tier boss, reaches its first kill milestone or many runs
// earns "<hero>'s <epithet>" once; its later kill milestones grow the same
// epithet one step. Names give no stats.

export const gearNameRules = {
  /** Kills a weapon earns its name at (the first), then grows it at (the others). */
  killMilestones: [50, 200, 500],
  /** Runs any worn piece earns its name at, when nothing named it first. */
  runs: 100,
};

/** An epithet's three forms: as earned, then grown at the second and third kill milestones. */
export type EpithetForms = [string, string, string];

/** A tier boss's killing blow, by boss id. */
export const bossEpithets: Record<string, EpithetForms> = {
  millOgre: ['Ogre-bane', 'Ogre-breaker', 'Ogre-doom'],
  barrowKing: ['Barrow-bane', 'Crown-breaker', 'King-slayer'],
  sporeQueen: ['Spore-bane', 'Queen-cutter', 'Blight-ender'],
  boneGeneral: ['Bone-breaker', 'General-bane', 'Legion-breaker'],
  ossuaryKing: ['Ossuary-bane', 'Crypt-sunderer', 'Death’s end'],
};

/** A kill milestone, by the enemy tag the weapon killed most of; the order breaks ties. */
export const tagEpithets: Partial<Record<Tag, EpithetForms>> = {
  beast: ['Wolf-biter', 'Wolf-bane', 'Wolf-king'],
  undead: ['Grave-warden', 'Grave-keeper', 'Grave-lord'],
  goblinoid: ['Goblin-sticker', 'Goblin-bane', 'Goblin-doom'],
  humanoid: ['Brigand-bane', 'Outlaw-ender', 'Warlord’s end'],
  brute: ['Brute-tamer', 'Giant-feller', 'Giant-breaker'],
  vermin: ['Rat-catcher', 'Vermin-bane', 'Plague-ender'],
  bird: ['Feather-plucker', 'Sky-cutter', 'Storm-taker'],
  carapace: ['Shell-cracker', 'Shell-splitter', 'Shell-breaker'],
  spirit: ['Ghost-biter', 'Spirit-bane', 'Soul-reaver'],
  construct: ['Gear-grinder', 'Golem-breaker', 'Iron-ender'],
  dragon: ['Scale-splitter', 'Wyrm-bane', 'Dragon-doom'],
  caster: ['Spell-cutter', 'Mage-bane', 'Witch-ender'],
  elemental: ['Flame-tamer', 'Element-bane', 'Rift-closer'],
};

/** A kill milestone on a weapon whose kills carry none of the tags above. */
export const killEpithet: EpithetForms = ['Bloodied', 'Blood-drinker', 'Widow-maker'];

/** Many runs, on any worn piece. */
export const runsEpithet: EpithetForms = ['Old Faithful', 'Old Reliable', 'Old Unbroken'];

/** Every epithet by its id: `boss:<id>`, `tag:<tag>`, `kills` or `runs`. */
export function epithetForms(id: string): EpithetForms | undefined {
  if (id === 'kills') return killEpithet;
  if (id === 'runs') return runsEpithet;
  const [kind, key] = id.split(':');
  return kind === 'boss' ? bossEpithets[key] : kind === 'tag' ? tagEpithets[key as Tag] : undefined;
}

/** Every epithet form, for the French names check. */
export const allEpithets = (): string[] => [...Object.values(bossEpithets), ...Object.values(tagEpithets), killEpithet, runsEpithet].flat();
