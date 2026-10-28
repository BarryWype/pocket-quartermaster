# Ideas

A place to collect ideas for Pocket Quartermaster. This is not a spec and not a list of features to build: nothing here is committed. Ideas can be added, expanded, reworked, merged or dropped freely.

## Pitch

A location-based mobile game where the player is the blacksmith of a team of adventurers. Walk around your city to gather ores and materials, forge gear for your heroes, and send them on idle expeditions into dungeons. Think Pokémon GO meets an auto-battler.

## Core loop

1. Walk around the real world to collect ores and materials spawned around the player's GPS position.
2. Store materials in your inventory.
3. Forge equipment from anywhere using recipes (no fixed forge location).
4. Equip your team members with the forged gear.
5. Send the team on timed expeditions (dungeons, quests).
6. Receive results: gold, new recipes, rare materials, XP.
7. Use rewards to recruit mercenaries, unlock recipes, and tackle harder dungeons.

## Giving walks a destination

Goal: give players a reason to go out with a destination, not only to wander. Possible order: stats and items first (more loot means more possible rewards), then places, then contracts.

### Daily contracts

- 2–3 new contracts every 24 h, stacking up to 6. A Guild Hall upgrade raises the cap.
- No board to walk to: contracts arrive automatically and target "the nearest X", so there's always one within reach.
- Example objectives: deliver 2 potions to a doctor, pray at a chapel, defeat 3 patrols, mine at an iron mine, walk 3 km, clear a goblin lair.
- Distance tiers (short ~500 m, medium ~1–1.5 km, long ~2–3 km), with rewards growing with distance.
- While a contract is active, patrols are more likely along the route, so the walk becomes a small adventure.
- No pressure: contracts last 24–48 h, ignoring them costs nothing, and one free reroll per day.
- Arriving in Pocket mode sends a notification, and the encounter is resolved when the app opens (consistent with patrols).

### Chained contracts

- 3–5 steps over a few hours, at most one per day, with a big reward at the end (a unique named item or a key fragment).
- Example: a traveller → the ruins → a monster lair → a key. That gives secret places a story arc instead of a plain drop.

### Exploration places

Standalone places on the map, worth visiting even without a contract. Each has a clear interaction type:

- **Shop** (rotating daily stock): weapon store, armour store, alchemist shop, market or trading post.
- **Service** (immediate effect): doctor's office (heal heroes for gold), chapel (blessing, lift a curse, holy water).
- **Gathering site** (a burst of materials on a cooldown): quarry, sawmill, copper mine, iron mine, hunting lodge.
- **Recruitment**: thieves' guild (rogues, lockpicks, a fence, link to the black market), circus (bards, acrobats).
- **Event** (temporary): village fair (weekends?), circus passing through.
- More: monster lair (the source of patrols: clearing it stops patrols nearby for a day), outpost or camp (heal heroes on the spot, delivery target), ruins or dig site (excavated over several visits, gives relics and key fragments), shrine (blessing for the next expedition), watchtower (reveals patrols and rare nodes in a large radius for an hour), hermit or trainer (teaches a trait, gives XP), library (scrolls, XP), mage tower (elemental stones), cartographer (dungeon maps), herbalist, fishing dock, stables.

Leaning towards: stores sell materials (wood at the sawmill, stone at the quarry, ore at the mines, hide at the hunting lodge). It still respects the walking rule, since you have to walk to the store. Stock is limited (a stack of 5–10 per store) so it stays a side reward, not the main source of materials. Buying works as a gold sink, which then lets us increase gold from other sources.

Watch out for unreachable destinations (a lake, a motorway, a private garden). Use a generous arrival radius (~50 m), a free "move this destination" once per contract, and avoid water using the map layers if possible.

## Exploration and gathering

- Ore nodes spawn around the player's position.
- Ore types could depend on real-world location type (e.g. crystals near water, iron in urban areas, wood in parks), encouraging varied walks.
- Recipe scrolls could be hidden near landmarks (monuments, parks).

### Temporary drops

- Rare materials occasionally spawn for a limited time only (e.g. 1 hour).
- A notification alerts nearby players, creating urgency and a reason to go out right now.
- Could tie into time of day or weather (e.g. moonstone only at night).

### Visibility layers

Each resource type has a different discovery range, which makes walks more interesting:

- Ore nodes: static, visible from far away. They guide the player's route.
- Animals: moving, visible within roughly 100–200 m. A surprise along the way.
- Herbs and plants: static, visible only up close. They reward looking around.

### Animals

- Deer, boars, rabbits, etc. move around the map and provide leather, bones and horns.
- Behavior tied to context: deer at dawn and dusk, boars in wooded areas, rabbits in parks.
- Animals flee if the player approaches too fast, rewarding real walking (and discouraging driving).
- Paths are generated deterministically (seeded by map tile and time window), so all players see the same animal on the same path without a server.
- Without a server, hunting an animal only removes it for that player. That's acceptable, and arguably friendlier.
- Forged hunting gear (knife, bow) can improve leather and horn yields, linking forging and gathering.

### Foraging

- Herbs, berries, mushrooms, flowers, etc. feed alchemy.
- Alchemy is a lighter side job next to the main forging activity.

## Time of day and events

- Real seasons are too slow for most players to notice, and hard gating creates frustration.
- Principle: boost, never gate. Every resource is always available; context only makes it more common or higher quality.
- Time of day (dawn, day, dusk, night) gives variety within a single walk and is cheap to implement.
- Weekly world events (e.g. "Frost Week") shift several systems at once: more ice crystals, ice dungeons open, fire gear more valuable in trades, warming potions useful.

## Crafting

### Forging

- Forge anywhere from stored components.
- Recipes are unlocked through dungeon loot, scrolls, or the shop.
- Gear wears down during expeditions (durability), giving a constant reason to go out and gather again.

### Alchemy

- A second crafting branch alongside forging: potions, food, elixirs, buffs.
- Alchemy resources spawn on the map too (herbs, mushrooms, flowers, water sources), with their own location affinities (e.g. herbs in parks).
- Consumables are used up during expeditions (healing potions, rations, resistance elixirs), so they create recurring demand.
- Lets the player prepare a team for a specific dungeon (e.g. fire resistance potions before a dragon lair).

### Item quality and crafting mastery

- Each item has quality levels: Poor, Normal, Rare, Legendary.
- Each recipe has its own mastery XP bar: crafting the item fills it and raises the chance of better quality.
- Unwanted items can be salvaged/disenchanted for a bit of mastery XP, so mass-crafting an item to level it up is a valid strategy.

## Team and mercenaries

- The player manages a team of NPC heroes.
- Choose who to equip first: a strategic resource allocation decision.
- A shop/tavern lets you hire mercenaries (e.g. a fire mage) with gold.
- Each class benefits from specific gear (wands for mages, blades for warriors, etc.).

### Hidden taverns

- Secret taverns that only appear under specific conditions: time of day, weather, a location type, a step streak, or carrying a certain item.
- They host rare NPCs that can't be recruited anywhere else (legendary classes, unique heroes).
- May also sell rare recipes or offer special quests.
- Adds mystery and rewards curious, regular explorers.

## Expeditions (auto-battle)

- Expeditions are idle and timed (e.g. a few hours), so progression is not too fast.
- No real-time combat visuals at first: results are delivered as text.
- Results come as a short narrative expedition log, e.g. "The fire mage burned three goblins, but his staff cracked." This adds flavor and highlights the gear the player forged.
- Push notification when the team returns.

### Elemental map events

- Rare locked locations on the map, each guarded by one elemental monster: Labyrinth, Abandoned Watchtower, Abandoned Mine, Cave/Grotto.
- Elements for now: water, fire, lightning, plant (plant is a placeholder).
- Successful dungeon runs can drop a random elemental key. The player must really walk to find a matching location and use it there, with one attempt only.
- Victory gives an elemental stone used to craft elemental gear.
- Dungeons (at least tier bosses) are strong against one element and weak against another, so elemental gear becomes a preparation choice.

## Step counter rewards

- Daily random chest unlocked by reaching step goals.
- Tiered chests: e.g. wooden chest at 5,000 steps, iron chest at 10,000 steps, with increasingly rare loot.
- Rewards players even when walking in areas without ore nodes, and builds a daily habit.
- Known risk: step cheating (shaking the phone). Acceptable.

## Global trade

- A global marketplace between all players, with no currency: barter only (item for item, material for material).
- Encourages specialization (one player farms crystals, another forges blades) and makes regional materials valuable worldwide.
- Keeps the in-game gold economy separate from player trading, limiting inflation and real-money abuse.
- To consider: trade limits per day, trade request listings, and protection against scams or bots.

## Tech and architecture notes

- Keep most logic on the device, and use a small backend only where players interact.
- Shared map through deterministic generation: ore, animals, herbs and temporary drops are generated from a seed based on the map tile (e.g. geohash) and the current time window. Every phone computes the same world, so all players see the same spawns with zero backend.
- Forging, alchemy, expeditions, the step counter and chest rewards all run locally.
- Backend needed for: trade (matching barter offers and swapping items safely), accounts and sync (progress survives a phone change), and possibly validating items entering the trade market.
- Backend candidates: Supabase (Postgres, auth, realtime, functions, Expo-friendly JS client; row-level security covers "players only touch their own inventory"), Firebase as an alternative. AWS Lambda works but needs a lot of plumbing for a solo dev. Check free-tier limits (free projects can pause when inactive).

## Open questions

- Expedition duration and balancing.
- Monetization (if any).
- Ore spawn density and refresh rate.
- Multiplayer features: trading between players, specialization.
- Visual combat replay later (assets could be sourced or generated).
