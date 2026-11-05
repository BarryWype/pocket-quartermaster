# Ideas

A place to collect ideas for Pocket Quartermaster. This is not a spec and not a list of features to build: nothing here is committed. Ideas can be added, expanded, reworked, merged or dropped freely.

## Status and roadmap

Design catalogues for what's built or being built live in `doc/design/` (threats, places, loot, quests, guild, pocket mode, progression, tutorial, simulator, UI). Bugs and their fixes are in `doc/issues.md`. This file stays for ideas that aren't designed yet.

**Done**
- Threats, restrictions, opportunities and kits (phase 1).
- Stats, growth, recruitment roll and equipment rebuilt (phase 2).
- Kit recipes using each tier's main material; threats can appear before their kit, rarer and milder.
- New alchemy and kitchen items (hero consumables, meals, walking consumables, home care); infusion salvage.
- Places and fight events on the map; boss weaknesses; 26 classes; healing potions in three strengths and fish recipes.
- Loot rework (`doc/design/loot/`): the loot matrix, monster parts and charms, part recipes, blueprints, components and relics, trinkets and valuables.
- Secret places and the mysterious key: hidden den, black market, underwater dungeons and the Sealed vault, with their tip sources (library, travellers, heists, bandit camps, catches, lairs, quests).
- Daily quests and the secret quest (`doc/design/quests/`).
- Guild Hall rework: five buildings (`doc/design/guild/`).
- Simulator rework and balance passes 1–4 (`doc/design/simulator/`).
- Tutorial rework with the gradual reveal and tips; Pocket mode rework (background notifications).
- 0.7 out; fixes since are under "After 0.7" below.
- Wood & brass UI on every screen.
- Progression pass (`doc/design/progression/`): a chain of 6 dungeons plus the boss per tier, unlocked in order; daily briefings instead of a daily dungeon pick; patrols as 6 kinds per tier, 2 per difficulty; difficulty rings and pips on everything that fights; diamond map markers; loot growing with difficulty.
- Odds shown as labels instead of percentages; a personal tavern when none is near.

**Experimenting**
- Live combat for places, patrols and Sanctums, with route, damage forecast and enemy intent (branch `feature/live-combat`).

**Roadmap: heroes, jobs and expeditions** (planned 2026-11-03, details in "Heroes, jobs and expeditions" below)

Direction: the game stays a walking game with short, dense check-ins at home (direction A). Walking must stay the best source of resources, but no longer the only one. Every step adds output to the economy, so run the simulator after each one.

1. **Special abilities.** Done (2026-11-04) for the first version: one special per hero from its class pool, fired automatically by its own rule (see `doc/design/abilities/`). Later: more picks with level (choose one to equip), manuals that teach or reroll one.
2. **Hero assignment, gatherer jobs and the resource rework.** Done (2026-11-05): the job system with the woodcutter and energy (2a), the forager, trapper, miner and charcoal burner (2c-1), and the outdoor gatherer (2c-2); see `doc/design/jobs/`. Work traits (2b) moved to step 8; more ways to recruit heroes (2d: rescues, quest rewards) parked, as later steps may rework or ease it.
3. **Gear rework and affixes.** Done (2026-11-05): stat ranges on 3d6, rarity as the number of affixes (Uncommon 1, Rare 2, Legendary 3 plus a unique), the one-ingredient forge, elemental stones and reroll, crafting mastery removed; see `doc/design/gear/`. Loot ladders to tune from the full simulator run.
4. **Monster research.** A job on step 2's assignment system (a hero researches, Scholars faster), fuelled by monster parts. Enemy-family research tracks: kit recipes, then trinket recipes, then higher kit tiers and better trinkets. The best trinkets stay drop-only.
5. **Crafting jobs.** Forge apprentice, cook and herbalist, supplied by step 2's gatherers.
6. **Expedition rework, part 1: heroes on the map.** Send heroes to places to fight and haul, or to fill shop orders (a shop asks for items, consumables or materials and pays gold, materials, blueprints or consumables); local missions (protect a village, escort a caravan, bodyguard, investigate a murder, recover stolen goods); outdoor jobs (fishing, hunting, tavern bard, watch duty, smuggling) and the kennel. Heroes fight and haul; only the player trades, talks, recruits and makes choices at places.
7. **Expedition rework, part 2: adventures and regional threats.** Chained-quest expeditions towards a final boss, with a choice of next location by reward. Regional threats: the one the player ignores grows on the map (more of its patrols and events, with its loot), capped, with a deadline and a recoverable consequence. Quests reworked to come from the active threats.
8. **Later.** Work traits (a second trait per hero for jobs, trade and gathering; designed in `doc/design/jobs/`, moved here on 2026-11-04 so the list is set once every job and activity exists, instead of reworking existing heroes' traits each time a job is added). Builder (guild hall improvements cost gold plus builder time), mentor and training yard (once abilities tie into levels), reputation and affiliations.

**Saves are kept (from save version 30, 2026-10-31):** a change to the saved state bumps the store version and adds a migration that carries the old save forward. No more resets. Only saves older than version 30 are reset.

**Parked**
- Overlapping map icons: a screen-space spread of overlapping icons, plus a pulsing ring on icons in reach, was tried on `feat/map-icon-spread` (2026-11-04) and didn't work; abandoned. A chooser list for ambiguous taps is the untried alternative.
- Village fair (weekends at the market, absorbs the circus): contests and special stock.
- Boss weaknesses for non-tier bosses.
- Friendly merchant opportunity (the Sealed vault is built).
- Sigil and elemental stone surplus (the simulator showed far too many Sanctum attempts).
- Global trade between players.
- Fishing mini game (see below).
- Battle plan: cards (hero specials, gear cards, battle consumables) placed on a run's fights before sending, unplaced ones kept for the boss; mockup PlanWood in the UI canvas. Felt clunky, especially for patrols.
- Reputation and affiliations: towns and organisations, each shop and mission tied to one; filling orders and missions raises standing (better prices, rarer stock).
- Enemy tags beyond loot: elite components by tag (a drake fang from any dragon elite), and threat dungeons whose enemies match the threat (a Casters threat dungeon holds caster-tagged enemies).

## Pitch

A location-based mobile game where the player is the quartermaster of a team of adventurers. Walk around your city to gather ores, herbs and materials, then forge gear, brew potions and cook meals for your heroes, and prepare the team's toolbox for each job before sending them on idle expeditions into dungeons. Think Pokémon GO meets an auto-battler.

## Core loop

1. Walk around the real world to collect ores and materials spawned around the player's GPS position.
2. Store materials in your inventory.
3. Forge equipment from anywhere using recipes (no fixed forge location).
4. Equip your team members with the forged gear.
5. Send the team on timed expeditions (dungeons, overnight expeditions).
6. Receive results: gold, new recipes, rare materials, XP.
7. Use rewards to recruit mercenaries, unlock recipes, and tackle harder dungeons.

## Giving walks a destination

Goal: give players a reason to go out with a destination, not only to wander. Possible order: stats and items first (more loot means more possible rewards), then places, then contracts.

### Daily contracts

*Built as daily quests: see `doc/design/quests/`. Quests are to be reworked to come from regional threats (see "Adventures and regional threats").*

- 2–3 new contracts every 24 h, stacking up to 6. A Guild Hall upgrade raises the cap.
- No board to walk to: contracts arrive automatically and target "the nearest X", so there's always one within reach.
- Example objectives: deliver 2 potions to a doctor, pray at a chapel, defeat 3 patrols, mine at an iron mine, walk 3 km, clear a goblin lair.
- Distance tiers (short ~500 m, medium ~1–1.5 km, long ~1.5–2 km), with rewards growing with distance.
- While a contract is active, patrols are more likely along the route, so the walk becomes a small adventure.
- No pressure: contracts last 24–48 h, ignoring them costs nothing, and one free reroll per day.
- Arriving in Pocket mode sends a notification, and the encounter is resolved when the app opens (consistent with patrols).

### Chained contracts

*Not built. Folded into adventures (see "Adventures and regional threats").*

- 3–5 steps over a few hours, at most one per day, with a big reward at the end (a unique named item or a key fragment).
- Example: a traveller → the ruins → a monster lair → a key. That gives secret places a story arc instead of a plain drop.

### Exploration places

*Built: see `doc/design/places/`. The final list differs (places were merged and some dropped).*

Standalone places on the map, worth visiting even without a contract. Each has a clear interaction type:

- **Shop** (rotating daily stock): weapon store, armour store, alchemist shop, market or trading post.
- **Service** (immediate effect): doctor's office (heal heroes for gold), chapel (blessing, lift a curse, holy water).
- **Gathering site** (a burst of materials on a cooldown): quarry, sawmill, copper mine, iron mine, hunting lodge.
- **Recruitment**: thieves' guild (rogues, lockpicks, a fence, link to the black market), circus (bards, acrobats).
- **Event** (temporary): village fair (weekends?), circus passing through.
- More: monster lair (the source of patrols: clearing it stops patrols nearby for a day), outpost or camp (heal heroes on the spot, delivery target), ruins or dig site (excavated over several visits, gives relics and key fragments), shrine (blessing for the next expedition), watchtower (reveals patrols and rare nodes in a large radius for an hour), hermit or trainer (teaches a trait, gives XP), library (scrolls, XP), mage tower (elemental stones), cartographer (dungeon maps), herbalist, fishing dock, stables.

Leaning towards: stores sell materials (wood at the sawmill, stone at the quarry, ore at the mines, hide at the hunting lodge). You still have to walk to the store. (The rule that only walking gives resources is being relaxed: walking should give the most, not everything.) Stock is limited (a stack of 5–10 per store) so it stays a side reward, not the main source of materials. Buying works as a gold sink, which then lets us increase gold from other sources.

Watch out for unreachable destinations (a lake, a motorway, a private garden). Use a generous arrival radius (~50 m), a free "move this destination" once per contract, and avoid water using the map layers if possible.

## Exploration and gathering

- Ore nodes spawn around the player's position.
- Ore types could depend on real-world location type (e.g. crystals near water, iron in urban areas, wood in parks), encouraging varied walks.
- Recipe scrolls could be hidden near landmarks (monuments, parks).

### Temporary drops

*Partly built as lures (a consumable that draws herbs and animals near the player). Timed rare drops with alerts are not built.*

- Rare materials occasionally spawn for a limited time only (e.g. 1 hour).
- A notification alerts nearby players, creating urgency and a reason to go out right now.
- Could tie into time of day or weather (e.g. moonstone only at night).

### Visibility layers

*Built.*

Each resource type has a different discovery range, which makes walks more interesting:

- Ore nodes: static, visible from far away. They guide the player's route.
- Animals: moving, visible within roughly 100–200 m. A surprise along the way.
- Herbs and plants: static, visible only up close. They reward looking around.

### Animals

*Built.*

- Deer, boars, rabbits, etc. move around the map and provide leather, bones and horns.
- Behavior tied to context: deer at dawn and dusk, boars in wooded areas, rabbits in parks.
- Animals flee if the player approaches too fast, rewarding real walking (and discouraging driving).
- Paths are generated deterministically (seeded by map tile and time window), so all players see the same animal on the same path without a server.
- Without a server, hunting an animal only removes it for that player. That's acceptable, and arguably friendlier.
- Forged hunting gear (knife, bow) can improve leather and horn yields, linking forging and gathering.

### Foraging

*Built.*

- Herbs, berries, mushrooms, flowers, etc. feed alchemy.
- Alchemy is a lighter side job next to the main forging activity.

### Fishing mini game

For the fishing dock, later. A short, physical moment instead of a button that just gives fish.

- **Cast**: a "Fish" button starts it. A float bobs slowly on the water.
- **Bite**: after a random 2–13 s, a big bite: the phone vibrates, a small sound plays and a "!" shows.
- **Strike**: the player pulls the phone up (or taps "Strike"). Too slow and the fish gets away.
- **Reel**: a side view of a fly-fishing reel. The player turns it by circling the phone, or by drawing circles on the reel.
- **Stop**: from time to time a "Stop" shows with a vibration. The player must stop reeling for 1–3 s, then go on. Reeling during a Stop costs progress (or snaps the line). A grace time after "Stop" shows (about 0.5 s, in config) doesn't count, since nobody can stop instantly.
- **Catch**: a bar fills while reeling; the fight lasts about 5–8 s.
- **Loot**: a catch usually gives fish. Rarely (under 10%, in config) the line brings up a **sunken chest** instead, which holds one of: a component, a relic, a treasure map or a blueprint (each rare).
- Open questions: does skill change the catch (size, rare fish, a tip for the underwater dungeon)? A no-motion option for accessibility (the tap and draw controls cover it).

## Time of day and events

*Time of day built (spawns); weekly world events not built.*

- Real seasons are too slow for most players to notice, and hard gating creates frustration.
- Principle: boost, never gate. Every resource is always available; context only makes it more common or higher quality.
- Time of day (dawn, day, dusk, night) gives variety within a single walk and is cheap to implement.
- Weekly world events (e.g. "Frost Week") shift several systems at once: more ice crystals, ice dungeons open, fire gear more valuable in trades, warming potions useful.

## Crafting

### Forging

*Built. Durability is not planned: single-use consumables already create recurring demand.*

- Forge anywhere from stored components.
- Recipes are unlocked through dungeon loot, scrolls, or the shop.

### Alchemy

*Built: see `doc/design/threats/consumables.csv`.*

- A second crafting branch alongside forging: potions, food, elixirs, buffs.
- Alchemy resources spawn on the map too (herbs, mushrooms, flowers, water sources), with their own location affinities (e.g. herbs in parks).
- Consumables are used up during expeditions (healing potions, rations, resistance elixirs), so they create recurring demand.
- Lets the player prepare a team for a specific dungeon (e.g. fire resistance potions before a dragon lair).

### Item quality and crafting mastery

*Superseded (2026-11-05) by the gear rework: rarity and affixes replace quality, crafting mastery is removed; see `doc/design/gear/`.*

- Each item has quality levels: Poor, Normal, Rare, Legendary.
- Each recipe has its own mastery XP bar: crafting the item fills it and raises the chance of better quality.
- Unwanted items can be salvaged/disenchanted for a bit of mastery XP, so mass-crafting an item to level it up is a valid strategy.

## Team and mercenaries

*Built: 26 classes, see `doc/design/threats/classes.csv`.*

- The player manages a team of NPC heroes.
- Choose who to equip first: a strategic resource allocation decision.
- A shop/tavern lets you hire mercenaries (e.g. a fire mage) with gold.
- Each class benefits from specific gear (wands for mages, blades for warriors, etc.).

### Hidden taverns

*Designed as secret places (hidden den, black market), not built.*

- Secret taverns that only appear under specific conditions: time of day, weather, a location type, a step streak, or carrying a certain item.
- They host rare NPCs that can't be recruited anywhere else (legendary classes, unique heroes).
- May also sell rare recipes or offer special quests.
- Adds mystery and rewards curious, regular explorers.

## Expeditions (auto-battle)

*Built: timed runs with briefings, a chain of dungeons per tier, overnight expeditions, reports with a log. Live combat is being tried on a branch; a reworked shape is in "Heroes, jobs and expeditions".*

- Expeditions are idle and timed, so progression is not too fast.
- Results are delivered as text.
- Results come as a short narrative expedition log, e.g. "The fire mage burned three goblins, but his staff cracked." This adds flavor and highlights the gear the player forged.
- Push notification when the team returns.

### Elemental map events

*Built as Sanctums.*

- Rare locked locations on the map, each guarded by one elemental monster: Labyrinth, Abandoned Watchtower, Abandoned Mine, Cave/Grotto.
- Elements for now: water, fire, lightning, plant (plant is a placeholder).
- Successful dungeon runs can drop a random elemental key. The player must really walk to find a matching location and use it there, with one attempt only.
- Victory gives an elemental stone used to craft elemental gear.
- Dungeons (at least tier bosses) are strong against one element and weak against another, so elemental gear becomes a preparation choice.

## Step counter rewards

*Built; contents to rework with the loot rework.*

- Daily random chest unlocked by reaching step goals.
- Tiered chests: e.g. wooden chest at 5,000 steps, iron chest at 10,000 steps, with increasingly rare loot.
- Rewards players even when walking in areas without ore nodes, and builds a daily habit.
- Known risk: step cheating (shaking the phone). Acceptable.

## Global trade

- A global marketplace between all players, with no currency: barter only (item for item, material for material).
- Encourages specialization (one player farms crystals, another forges blades) and makes regional materials valuable worldwide.
- Keeps the in-game gold economy separate from player trading, limiting inflation and real-money abuse.
- To consider: trade limits per day, trade request listings, and protection against scams or bots.

## Heroes, jobs and expeditions

*Discussed 2026-11-03; the order is in the roadmap at the top. Special abilities are built (2026-11-04); the rest is not designed or built.*

### Special abilities

*Built 2026-11-04 (first version): see `doc/design/abilities/`. 32 specials (22 shared, 10 unique), a pool of 4 per class (three common, one rare at 15%), set class by class rather than by archetype; effect and trigger kept separate so a special can later be played by hand. Not built yet: more picks with level, manuals that teach or reroll one, playing a special on a chosen fight.*

- Each hero gets one random special from its class (or class type) pool: heal, regen, protect, bless for clerics and paladins; sure crit, cleave, triple strike, guard for warriors and barbarians; and so on. Some can be rarer than others, for the chase.
- It fires automatically by its own rule (cleave on the first fight with 3+ enemies, guard when the boss winds up, heal below 40%), so it needs no planning screen.
- More abilities unlock with level (e.g. levels 10 and 20, a pick of 1 of 2); the hero equips one. Manuals can teach or reroll one.
- Every ability should be worth about the same on average, so the simulator can check none dominates.

### Non-combat traits

*Postponed to roadmap step 8 (2026-11-04): the list is only fixed once every job and activity is in the game. A first list is in `doc/design/jobs/work-traits.csv`.*

A second trait per hero, rolled at recruitment, for jobs, trade and gathering: Green thumb (farming), Woodsman and Prospector (wood or ore, small chance of a rarer find), Pack mule (hauls more), Haggler (shop orders pay more), Tinkerer (forge apprentice faster), Scholar (decrypting and research faster), Homebody and Wanderlust (guild jobs vs the road), Night owl (job output caps later), Bedside manner (infirmary), Clumsy (may waste materials), Idle (lower job output).

### Jobs

Rules: jobs trickle and fill up after about 8 hours (check-ins, not staying in the app); an hour of walking should be worth more than a day of jobs; class and traits change output; Guild buildings open job slots; heroes are shown at their station or moving on the map.

At the guild:
- **Gatherers** (farmer with a garden plot, woodcutter, miner): a slow resource trickle.
- **Builder:** guild improvements cost gold plus builder time.
- **Scribe:** decrypts secret maps.
- **Monster research:** see below.
- **Forge apprentice, cook, herbalist:** crafting continues while away. Needs the resource rework.
- **Kennel or stables:** tames animals brought back by hunting into pack animals (haul more) or mounts (travel faster).
- **Infirmary:** resting heroes recover HP faster; a cleric, paladin or Bedside manner hero on duty boosts it.
- **Mentor and training yard:** later, once abilities tie into levels.

Out in the world:
- **Gathering:** one hero walks slowly to nearby visible resources, shown on the map.
- **Fishing** at the docks, **hunting** (meat, hide, monster parts, live animals for the kennel).
- **Tavern bard:** gold, and rumours that reveal secrets or hidden places.
- **Watch duty:** slows an escalating regional threat's spawns a little.
- **Smuggling:** high gold, with a risk of coming back hurt or empty-handed.

Dropped: recruiter (a must-have you'd just assign before visiting a tavern), scouting, courier, pilgrimage, bounty hunting (overlaps quests and adventures), treasure hunting (treasure maps stay walking-only), clerk (overlaps shop orders).

### Monster research

Per enemy family (undead, beasts, goblinoids, brutes...), fuelled by that family's monster parts: rank 1 unlocks the family's threat kit recipe, rank 2 a themed trinket recipe, rank 3 the higher kit tier and a better trinket. The best trinkets stay drop-only.

### Affixes

Uncommon gear rolls 1 affix, rare 2, legendary 3, from a small pool (10–15), each with a bell-curve roll shown as a bar. Drops and crafted gear both roll them, so gear can drop more often; walking materials pay to reroll one affix at the forge. No extraction (too complex for now). Icons, not text.

Affixes are a net plus on top of the item's stats, never a trade-off. They stay in check by being situational or by not adding fighting power at all:

- **Situational combat:** +damage against one enemy family, +Resistance against one element, +Crit in the first exchange or against an enemy at full HP. Worth it only when the briefing matches, so they reward preparation.
- **Threat safety net:** a missed threat of one kind costs less (e.g. 25% less for Undead). Never a full answer, so kits keep their role.
- **Run economy:** more gold, XP, monster parts, shards or salvage; a better sell price.
- **Walking:** worn gear helps the player's walks: a chance of an extra herb or ore when gathering, a wider gather radius, better Pocket mode yields. Ties gear back to walking.
- **Survival utility:** a small shield at the start of each fight, potions heal this hero more, poison and bleed wear off faster.
- **Later, jobs:** a bonus to one job (woodcutting, research...) once jobs exist.

Balance: the simulator's reference teams count the average affix value of their gear, so enemy strength is fitted with affixes in.

### Heroes on the map

- Heroes go to any place visible on the map; the distance sets the travel time, with patrol encounters on the way.
- **Fight and haul:** fight events, patrols, ruins, treasure spots.
- **Shop orders:** each shop posts 1–2 orders matching its trade ("2 swords and 1 shield"), paying gold, materials, a blueprint or a consumable, worth more than selling. Orders refresh with the place's 48 h reset and only ask for what the player can craft at their tier. It gives crafting a buyer. Watch the gold inflow.
- **Only the player** trades, talks, recruits, helps travellers, solves sanctums and makes choices at places.
- **Local missions:** protect a village (on the map for a limited time, a reason to check in), escort a caravan (long, low risk, ambushes), bodyguard, investigate a murder, recover stolen goods, rescue a prisoner (a recruit).

### Adventures and regional threats

- **Adventures:** chained-quest expeditions over days; each check-in picks the next location from 2–3 by its reward icon (reward targeting), ending with a boss. They could become the tier structure: the dungeon chain as a branching regional map ("The Orc Menace").
- **Regional threats:** usually a choice of 2. The one the player ignores grows on the map (its patrol and event kinds weigh more within the difficulty bands, and drop its loot), up to 3 levels, fading once dealt with. A threat left past its deadline wins something recoverable: the orcs occupy a village, whose tavern or shop closes until a defence mission frees it. A new threat appears when one ends.
- **Quests** come from the active threats ("defeat 3 orc patrols", "walk to the scouted warcamp", "deliver 5 hide to the besieged village").
- **Walk there yourself or send heroes:** the player going in person is faster and gets a bonus.

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
- Active play at home: decided to stay a walking game with short check-ins (direction A); active depth comes from heroes, jobs, crafting and expeditions, not minigames. Live combat is an experiment.
- How much non-walking sources may give: walking must stay clearly the best (target: an hour of walking beats a day of jobs).

## After 0.7

### Inventory: show which gear is equipped

*Done in commit "Inventory: equipped gear wears a shield badge, comes first, and names its hero".*

- Every listed gear piece a hero wears carries a small shield badge on its icon's corner (`EquippedBadge`, through `ItemSlot` and `Row`): the inventory's Gear page, the equip picker, the hero's storeroom and the infuse station.
- The inventory lists equipped gear first, then spare gear, each in the old order; the piece's pop-up names the hero ("Equipped: Bram"). The salvage dialog's red warning is unchanged.
- Who wears what is one pure lookup, `wearers` in `src/game/forging/salvage.ts`, with `equippedFirst` for the order.

### Hero stats: the small stats work like the main ones

*Done in commit "Hero stats: the small stats are tiles too, and every tile's tip shows where its value comes from".*

- The four small stats (Resistance, Evasion, Crit, Luck) are the same tile as the four main ones, a little smaller, in one row of four under them; a tap opens the same tip.
- Every tile's tip gives what the stat does, then where the value comes from and the total: the class at level 1, the level growth, and gear and class abilities together (`statSources` in `src/game/team/team.ts`). Approach picks don't change these stats, so they have no line. Evasion at its cap says so in the tip.

### The island menu on every screen

*Done in commit "Island menu on every screen: rendered once at the root, replaces the screen it leaves, highlights where you are".*

- The menu is rendered once in the root layout, outside the `Stack`, and stays mounted; no screen renders it. Its store subscriptions are unchanged (badge counts, reveals and the tutorial target); the only new one is the current path, for the highlight. `src/components/IslandMenu.test.tsx` checks that save writes which change no badge don't re-render it.
- From the map a menu tap pushes the screen; from any other screen it replaces it (`navigate(href, { replace: true })`), so Back returns to the map. Tapping the current screen's button does nothing. A hero sheet opened from the Barracks is replaced like any screen, so Back from there goes to the Barracks first.
- Every screen but the map gets bottom padding of the menu's height plus the safe area, once, through the stack's `contentStyle`. Sheets and dialogs are modals, so they open above it. It hides (stays mounted) while the keyboard is open.
- Tap-to-first-frame on a mid-game save (`src/perf/menuFirstOpen.test.tsx`, content cold, dev machine) before → after: forge 9–11 → 9–10 ms, infuse 2–4 → 3 ms, provisions 12–13 → 13–17 ms, inventory 9–10 → 10 ms, team 15 → 14–20 ms, hero 11–12 → 10–12 ms, quests 5 → 5 ms, guild 11 → 10–11 ms, settings 13–14 → 13–14 ms, tips 2 → 2–3 ms, expeditions 399–415 → 418–434 ms (its `dailyRotation` replay, which varied 365–398 ms on its own). The differences are run-to-run noise: no screen's tree changed. Not measured on a phone.

### Daily quests: "sell goods worth N gold" replaces the impossible collector

*Done in commit "Quests: sell goods worth N gold, and the collector quest only asks for a valuable you hold (save version 31)".*

- New Trade objective, "Sell goods worth N gold": every valuable, material or gear piece sold (market, smithy, part buyers, trader) counts its gold, from the quest's arrival. N is by tier in `questRules.sellGoodsGold` (50, 140, 190, 300, 320: about a regular player's daily selling gold per tier in the simulator summary).
- The collector quest now names a valuable picked among those held when it arrives (or when it swaps in at acceptance), and is done when that valuable is sold at its market; without a valuable held it is never rolled. Both are Trade, so at most one is active.
- Save version 31 (`src/game/migrations.ts`): an open collector quest whose market wants a valuable the player holds keeps it as its item; any other open one becomes a "sell goods" quest of the player's tier, keeping its id (so its reward), band, arrival and expiry.
- The simulator bot sells through the game's own functions, so these quests progress there with no bot change. Run `npm run sim` to check the effect.

### A tavern always within walking distance

- Once taverns are open, the day's first map position always has a tavern within 800 m: a world one when there is, else a personal one 300–700 m away on a walkable spot, seeded by player seed and rotation day, lasting until the rotation reset (`src/game/taverns/personal.ts`, save version 32).
