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

/**
 * The specials tip: due once the tutorial is done and a hero is fielded. The jobs tip: due once
 * the Jobs tab is opened. The per-job tips: due once their station opens at the guild.
 */
export type TipId =
  | RevealKind
  | ItemTipKind
  | 'affixes'
  | 'ingredients'
  | 'stones'
  | 'reroll'
  | 'specials'
  | 'jobs'
  | 'jobMiner'
  | 'jobCharcoalBurner'
  | 'jobGatherer';

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
  taverns: { kind: 'questsDone', count: 1 },
  guildHall: { kind: 'guildOpen' },
  rarePlaces: { kind: 'tier', tier: 2 },
  sanctums: { kind: 'tier', tier: 2 },
  secrets: { kind: 'secretTip' },
};

/** Every kind, in the order the rules table lists them. */
export const REVEAL_KINDS: RevealKind[] = Object.keys(revealRules) as RevealKind[];

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
  dungeons: 'Expeditions: send up to three heroes to a dungeon. Every dungeon’s threats and conditions change every day.',
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
  affixes: 'Affixes: named effects a piece of gear carries, shown under its stats. Uncommon pieces have one, Rare two, Legendary three.',
  ingredients: 'Ingredients: monster parts and components. Forging a blueprint with one makes the piece Uncommon and adds its affix.',
  stones: "Elemental stones give a piece their element — Infused on weapons, Warding on armour. Apply one at the forge's Rework page.",
  reroll: "An Uncommon or better piece can reroll all of its affixes at the forge's Rework page, for materials and gold.",
  specials: 'Specials: every hero has one, rolled from its class. It fires on its own in fights, a limited number of times; rare ones are marked ✦.',
  jobs: "A hero at a job produces slowly while you're away. Output fills up after 8 hours, so collect on check-in. Work tires them over a day, and tired heroes rest at the station before working again. Working heroes must be recalled before they can be sent out.",
  jobMiner:
    'The Miner is open at the guild: a hero there digs the ore you pick. Stone now, copper and iron as tiers open. Switching ore keeps what was mined.',
  jobCharcoalBurner: "The Charcoal burner is open at the guild: a hero there makes coal while you're away.",
  jobGatherer:
    'The outdoor gatherer works around you: a hero gathers the resources you can see on the map, the closest first, about 4 an hour at most. It works best in Pocket mode, while you walk. Pick a focus if you need one material. Outdoor work tires faster, and wildlife can hurt the hero a little.',
};
