import type { ImageSourcePropType } from 'react-native';

import type { PlaceKind } from './places';

/** The work tools: an off-hand line for workers, bought at their job's places (doc/design/gear/item-types.md). */
export type WorkToolKind = 'hatchet' | 'sickle' | 'snare' | 'miningPick' | 'tongs';

export const workToolRules = {
  /** Share of the off-hand budget a tool's weak stats draw from, scaled by tier like other gear. */
  budgetShare: 0.3,
  /** Weak combat stats, split like a small off-hand; no damage stat. */
  shares: { armour: 0.6, hp: 0.4 },
  /** About half of shopRules.gearPrice for the tier's Common piece. */
  price: [5, 10, 20, 40, 80],
  /** Job output bonus by the tool's tier (1–5). */
  outputBonus: [0.2, 0.25, 0.3, 0.35, 0.4],
  /** Job material units a fighter wearing the tool scavenges per won fight. */
  scavengePerWin: 1,
};

export type WorkToolDef = {
  kind: WorkToolKind;
  /** The station job the tool boosts and scavenges for. */
  job: string;
  /** The places that stock it, and only while the job is open. */
  places: PlaceKind[];
  emoji: string;
  icon: ImageSourcePropType;
};

export const workTools: WorkToolDef[] = [
  { kind: 'hatchet', job: 'woodcutter', places: ['sawmill'], emoji: '🪓', icon: require('../../assets/icons/rpg/tool-hatchet.png') },
  { kind: 'sickle', job: 'forager', places: ['apothecary'], emoji: '🌾', icon: require('../../assets/icons/rpg/dual-sickles.png') },
  { kind: 'snare', job: 'trapper', places: ['huntingLodge'], emoji: '🪤', icon: require('../../assets/icons/relics/rope-coil.png') },
  {
    kind: 'miningPick',
    job: 'miner',
    places: ['quarry', 'copperMine', 'ironMine'],
    emoji: '⛏️',
    icon: require('../../assets/icons/rpg/tool-pickaxe.png'),
  },
  { kind: 'tongs', job: 'charcoalBurner', places: ['coalPit'], emoji: '🥢', icon: require('../../assets/icons/rpg/tool-hammer.png') },
];

export const workToolByKind: Record<WorkToolKind, WorkToolDef> = Object.fromEntries(workTools.map((tool) => [tool.kind, tool])) as Record<
  WorkToolKind,
  WorkToolDef
>;

/** The item id of a work tool and tier, e.g. `hatchet3`. */
export const workToolId = (kind: WorkToolKind, tier: number) => `${kind}${tier}`;

/** Names per kind and tier (1–5), material word + tool, like gearNames. */
export const workToolNames: Record<WorkToolKind, [string, string, string, string, string]> = {
  hatchet: ['Bone hatchet', 'Flint hatchet', 'Copper hatchet', 'Iron hatchet', 'Steel hatchet'],
  sickle: ['Bone sickle', 'Flint sickle', 'Copper sickle', 'Iron sickle', 'Steel sickle'],
  snare: ['Hide snare', 'Sinew snare', 'Copper-wire snare', 'Iron-wire snare', 'Steel-wire snare'],
  miningPick: ['Stone mining pick', 'Flint mining pick', 'Copper mining pick', 'Iron mining pick', 'Steel mining pick'],
  tongs: ['Bone tongs', 'Stone tongs', 'Copper tongs', 'Iron tongs', 'Steel tongs'],
};
