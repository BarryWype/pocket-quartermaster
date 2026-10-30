import type { PlaceKind } from './places';

/** Map features that appear on the map over time; their condition is in `revealRules`. */
export type RevealKind =
  | 'resources'
  | 'animals'
  | 'dungeons'
  | 'quests'
  | 'commonPlaces'
  | 'patrols'
  | 'fightEvents'
  | 'ruins'
  | 'treasure'
  | 'taverns'
  | 'guildHall'
  | 'rarePlaces'
  | 'sanctums'
  | 'secrets';

/** Item kinds that get a tip the first time one is held. */
export type ItemTipKind = 'charms' | 'components' | 'relics' | 'trinkets' | 'valuables' | 'keyFragments';

export type TipId = RevealKind | ItemTipKind;

/** What has to be true for a kind to show; read by `isRevealed`. */
export type RevealCondition =
  | { kind: 'tutorialDone' }
  | { kind: 'patrolsWon'; count: number }
  | { kind: 'questsDone'; count: number }
  | { kind: 'guildOpen' }
  | { kind: 'tier'; tier: number }
  | { kind: 'secretTip' };

/** Each kind's reveal condition (the design doc's "Gradual reveal" table). */
export const revealRules: Record<RevealKind, RevealCondition> = {
  resources: { kind: 'tutorialDone' },
  animals: { kind: 'tutorialDone' },
  dungeons: { kind: 'tutorialDone' },
  quests: { kind: 'tutorialDone' },
  commonPlaces: { kind: 'tutorialDone' },
  patrols: { kind: 'tutorialDone' },
  fightEvents: { kind: 'patrolsWon', count: 1 },
  ruins: { kind: 'questsDone', count: 1 },
  treasure: { kind: 'questsDone', count: 1 },
  taverns: { kind: 'guildOpen' },
  guildHall: { kind: 'guildOpen' },
  rarePlaces: { kind: 'tier', tier: 2 },
  sanctums: { kind: 'tier', tier: 2 },
  secrets: { kind: 'secretTip' },
};

/** The reveal kind each place kind belongs to. */
export const placeRevealKinds: Record<PlaceKind, RevealKind> = {
  tavern: 'taverns',
  sawmill: 'commonPlaces',
  quarry: 'commonPlaces',
  copperMine: 'commonPlaces',
  ironMine: 'commonPlaces',
  coalPit: 'commonPlaces',
  huntingLodge: 'commonPlaces',
  smithy: 'commonPlaces',
  apothecary: 'commonPlaces',
  chapel: 'commonPlaces',
  market: 'commonPlaces',
  ruins: 'ruins',
  library: 'rarePlaces',
  thievesGuild: 'rarePlaces',
  monsterLair: 'rarePlaces',
  fishingDock: 'rarePlaces',
  banditCamp: 'fightEvents',
  goblinRaid: 'fightEvents',
  beastDen: 'fightEvents',
  hauntedCrypt: 'fightEvents',
  elementalRift: 'fightEvents',
  abandonedCaravan: 'fightEvents',
  wantedOutlaw: 'fightEvents',
  hiddenDen: 'secrets',
  blackMarket: 'secrets',
  underwaterDungeon: 'secrets',
};

/** Kinds that are not markers on the map; their tip comes when revealed. */
export const offMapRevealKinds: RevealKind[] = ['dungeons', 'quests', 'guildHall'];

/** One line per tip, shown the first time its kind applies. */
export const tipTexts: Record<TipId, string> = {
  resources: 'Trees, rocks and herbs: tap one within 30 m to gather it.',
  animals: 'Animals roam nearby. Walk up slowly: they flee from runners.',
  dungeons: 'Expeditions: send up to three heroes to a dungeon. The list changes every day.',
  quests: 'Quests arrive on their own, 2–3 a day. Accept one and walk to its target.',
  commonPlaces: 'Shops and services: buy materials, sell gear, heal heroes. They move on after a few days.',
  patrols: 'Patrols and travellers roam the map. Get close to fight a patrol or help a traveller.',
  fightEvents: 'Fight events: camps and dens that stay a day. Beat one for its loot.',
  ruins: 'Ruins: dig each once for materials and key fragments. Five digs give a relic.',
  treasure: 'A treasure spot: walk there and dig up what the map promised.',
  taverns: 'Taverns are open: recruit heroes and buy emergency supply.',
  guildHall: 'The Guild Hall is open: spend gold and materials on lasting upgrades.',
  rarePlaces: 'Rarer places: libraries, thieves’ guilds, fishing docks. They’re further apart.',
  sanctums: 'Sanctums: elemental shrines. Spend a Sigil to challenge the guardian for shards.',
  secrets: 'A tip marked a secret place. You need a mysterious key to enter.',
  charms: 'Charms go in the consumable slot and raise what a run finds.',
  components: 'Components: forge one into an item to add its effect.',
  relics: 'Relics: restore one at the forge to get an item with a fixed effect.',
  trinkets: 'Trinkets: loot-only gear with rare stats like Luck and Crit.',
  valuables: 'Valuables: sell them at a market. Collectors pay more for some.',
  keyFragments: 'Key fragments: four make a mysterious key, which opens secret places.',
};
