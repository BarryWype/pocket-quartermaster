# Pocket Quartermaster – Change Requests

Instructions for Claude Code. Work through each section, run `balance.test.ts` and the other tests after changes, and update the test bounds where the intended balance changed. Summarize what changed and stop for review after each section.

## 0. Spawn Placement on Paths and Parks (Next Priority)

Implement this first. Resources currently spawn at random points in their tile, which can land on private property, motorways or water.

- Spawns (ore, animals, herbs, rare drops, camps) must only appear on walkable ways and in parks: footways, paths, pedestrian streets, small residential streets, park areas.
- Exclude motorways, trunk and primary roads, water, buildings and private areas.
- Approach: keep the current deterministic generation (seed = tile + time window), then snap each generated point to the nearest allowed feature (point on a path line, or inside a park polygon). If nothing allowed is nearby, drop the spawn.
- Use the OpenFreeMap vector tile data (OpenMapTiles schema, e.g. `transportation` and `park` / `landuse` layers), fetched and decoded directly. Do not use features rendered on screen (e.g. `queryRenderedFeatures`), since they depend on zoom and viewport and would make spawns differ between players.
- Fetch tiles at one fixed zoom level for generation so every device uses the same geometry. Cache decoded tiles.
- Animal paths should also follow allowed ways where possible.
- Note: OpenFreeMap data updates periodically, so spawns may shift slightly after an update. Acceptable.
- Add unit tests with a fixture tile: snapped points must lie on allowed features, and generation must stay deterministic.

## 0b. Onboarding (High Priority)

Teach the core loop by doing, one action at a time, with almost no text. The player should see the whole loop in under 5 minutes.

1. Guaranteed first spawn right next to the player (within ~20 m), even indoors and regardless of path/park placement rules.
2. The player collects it and is guided to forge their first weapon right away (top up materials if needed so it always works).
3. The player equips it on a hero.
4. The player launches a first expedition of ~2 minutes with guaranteed success. The report arrives while they explore.

Then unlock features progressively, when they become useful:

- Alchemy unlocks when the player picks up their first herb.
- Step chests appear after the first 1,000 steps.
- Other systems (second dungeon, roster, camps, etc.) unlock as the player reaches them.

Keep hints short and contextual (one line, pointing at the relevant UI). Store onboarding progress in the save so it never repeats, and add a debug option to reset it.

## 1. Ore Spawns

Current state (`src/content/spawnConfig.ts`, `src/content/resources.ts`): ore uses geohash precision 6 tiles (~1.2 × 0.6 km), 3–6 nodes per tile, 6 h window. Weights: iron 6, copper 4, crystal 1.5. Players see too few ore nodes.

Changes:

- Roughly double overall ore density: change ore `minPerTile` / `maxPerTile` from 3–6 to about 6–10.
- Crystal should only increase by about 30–40% in absolute terms, not double. Doubling the nodes per tile would double crystal automatically, so its relative weight must go down. Expected crystal per tile today ≈ 4.5 nodes × 13% ≈ 0.6; target ≈ 0.8. With ~8 nodes per tile that means a crystal share of about 10% (e.g. iron 6, copper 4, crystal ~1.1). Compute the exact weight from the final min/max values.
- Night boost on crystal stays as is.
- Update the ore bounds in `balance.test.ts` accordingly.

## 2. Animal Movement

Current state (`src/game/generation/animalPaths.ts`): each animal loops through 4 random waypoints inside its own 150 m tile (precision 7) on a 20 min loop. It never leaves its tile, so animals feel static and rarely cross the player's view.

Changes:

- Animals should roam much more widely, so that an animal can walk into the player's view range even if the player doesn't go to it. The goal is a lively, natural feel.
- Suggested approach: keep generation deterministic (seeded by tile + time window) but let the path's waypoints spread over the tile and its neighbors (or a larger radius, e.g. 300–500 m), and make the movement speed plausible for each animal.
- Spawn visibility must still work: an animal generated in a nearby tile must be considered when it wanders into range. Make sure `generateSpawnsAround` covers enough tiles for the larger roaming radius.
- Animal fleeing behavior (reacting to the player approaching) is out of scope for now. Keep the existing speed-based flee check as is.

## 3. Dungeon Progression

Current state (`src/content/dungeons.ts`): 3 standalone dungeons, all available from the start, each with a few random recipe drops.

Target design:

- Tiers of 3 dungeons. Long term: 4–5 tiers (12–15 dungeons). For now, implement 2 tiers (6 dungeons).
- Each tier has:
  - 2 farm dungeons, each with a specialty (e.g. one mostly ore, one mostly hide and bone, or one with a hazard like fire that requires potions/elixirs).
  - 1 boss dungeon: harder and longer, drops the tier's key recipes.
- Difficulty, duration and rewards scale by tier: roughly ×2 difficulty from one tier to the next, rewards following. Dungeons within a tier have similar difficulty and differ by specialty.
- Recipes are tied to tiers: each tier's dungeons drop recipes for that tier's gear, which is needed to beat the next tier. Example: tier 1 iron and leather, tier 2 crystal and bone, tier 3 star metal.
- Unlock chain: only the first farm dungeon is available at the start. Clearing it once unlocks the second farm dungeon. Clearing both unlocks the boss. Beating the boss unlocks the first dungeon of the next tier.
- Anti bad luck: guarantee a recipe drop on the first successful clear of each dungeon, then use a pity counter that increases recipe drop chance after each run without a recipe.
- End-of-dungeon chests/loot focus on materials and gold.
- The current 3 dungeons can be reused and reworked into this structure.
- Add new content (dungeons, recipes, items) as needed in the content files, and extend `balance.test.ts` so each tier is roughly a coin flip with the previous tier's gear and clearly winnable with the current tier's gear.

## 4. Gear and Material Tiers

- One gear tier per dungeon tier. Tier N farm dungeons drop tier N gear recipes; tier N gear is what beats the tier N boss. The boss drops the key recipe for tier N+1, usually one using a new material.
- Each tier introduces its materials: e.g. tier 1 iron, copper, hide; tier 2 crystal, bone; tier 3 star metal.

## 5. Player Tools

- The player crafts their own gathering tools: pickaxe (ore), butcher knife (animals), sickle (herbs, berries, mushrooms).
- Tool tier gates gathering: a tier N pickaxe can mine tier N ore and below.
- Next-tier tool recipes are dropped by dungeons, typically the tier boss (e.g. beating the tier 1 boss gives the tier 2 pickaxe recipe).
- Higher-tier resources are still shown on the map but greyed out / locked, with a hint like "Requires a steel pickaxe", to tease progression.
- No manual tool selection: the game automatically uses the right tool for each resource. Tools can be shown in the inventory or a player profile.
- Optional later: tools give a gathering yield bonus.

## 6. Inventory Capacity

- No static personal chest for now (decided it adds little gameplay).
- Add a limited-capacity bag that can be upgraded, so players make choices about what to keep.
- A home base / camp may come later only if it brings concrete benefits (e.g. crafting bonuses).

## 7. Navigation Bar

- Redesign the bottom navigation as a floating island: slightly above the bottom edge of the screen instead of docked, so the map has more room.

## 8. Wandering Camps and Mercenaries

- Add wandering camps as a new map spawn kind, where players recruit new mercenary classes.
- Rarity: about 3–4 camps on a 10,000-step walk (~7–8 km), i.e. roughly one camp every 2 km.
- Refresh every 24 h (configurable; 48 h or weekly considered but likely too long for players with routine routes).
- Visibility ~300 m: further than animals (150 m) and herbs (50 m), closer than ore (500 m).
- Recruitment costs gold, priced by rarity: common ~150, rare ~400, legendary ~1,000. Reference: current dungeon income is ~15 / ~50 / ~180 gold per run, so a common recruit is about 2–3 runs of the second dungeon. Camps mostly offer commons, occasionally a rare; legendaries are very rare.
- New classes beyond warrior, archer and fire mage, each with its own specialty: e.g. healer, rogue/thief, and more later.

## 9. Hero Roster

- Expeditions still send a team of 3.
- Add a roster (reserve) of 4–5 hero slots from the start; the player picks which 3 go on each expedition depending on the dungeon.
- Players can dismiss heroes they don't use, to make room for new recruits. Keeping the roster small is intentional: it creates the management aspect.
- Later progression (out of scope for now): upgrades / a talent tree to unlock more roster slots, then multiple teams running expeditions in parallel.

## 10. Class Weapon and Armor Restrictions

- Each class gets a list of allowed weapon types and an armor weight. For the MVP, only the 3 current classes:
  - Warrior: swords, axes; heavy armor.
  - Archer: bows, daggers/knives; leather (medium) armor.
  - Fire mage: wands, staves; cloth (light) armor.
- Implementation: add an allowed weapon list (and armor weight) to `heroClasses` next to the existing affinities; block equipping disallowed items in `equip` and in the UI.

### Weapon Type Traits

Combat is resolved by calculation, so each weapon type gets a small trait:

- Sword: balanced; some attack and some defense, good durability. Good for farming.
- Axe: higher attack, bonus against bosses, but wears faster and gives no defense.
- The player has a real choice: axe for the boss, sword for farming without breaking gear.

## 11. Injuries and Dungeon Profiles

Replace the single success roll with a run made of several encounters.

- A dungeon is split into a few encounters. At each one, heroes lose HP based on enemy strength and their defense.
- A tank absorbs damage for the others; a healer restores HP (future classes; design the calculation so they can plug in).
- If the team's HP drops too low, it retreats early with only part of the loot. Heroes are never killed.
- On return, injured heroes need real-time rest before leaving again.
- Potions have a double use: carried into a dungeon, they heal mid-run and can prevent a retreat; given at home, they shorten rest. The player chooses which.
- This makes the roster useful: rotate heroes while injured ones rest.
- Dungeon profiles: dungeons can differ by danger, not just difficulty. E.g. a short, intense, dangerous dungeon vs one that lasts 2–3× longer but deals much less damage.
- The expedition log should reflect encounters, damage, potion use and retreats.

## Later (Do Not Implement Yet)

Ideas kept for after the MVP. Claude Code should not work on these now.

### Class Differentiation

When adding classes beyond warrior, archer and fire mage, differentiate them on three axes:

- Gear restrictions: each class has allowed weapon types and an armor weight (heavy, medium, light). E.g. warrior wears plate; archer wears leather with bow or crossbow; mage wears cloth with wand or staff.
- A unique class effect on expedition results, not just raw power. E.g. healer reduces gear wear and failure penalties; rogue brings back more gold and loot; scout shortens expedition duration. Today `heroPower` sums all stats the same way, so classes are nearly interchangeable.
- Dungeons that favor certain classes: e.g. an undead dungeon where the healer shines, a trapped dungeon where the rogue avoids damage.

### Metal Tiers and Alloys

- Tier ladder alternating base ores and alloys: copper → bronze (copper + tin) → iron → steel (iron + coal) → mithril → adamantite.
- Star metal stays outside the ladder as a rare legendary material for top pieces.
- Crystal remains the magic line, possibly with its own tiers for mages.
- Old ores stay useful because they feed alloys.
- Add a smelting step in the forge: combine ores into ingots, then forge with ingots.

### Coal

- Coal is needed only for smelting alloys, not for every forge action, to avoid tedium.
- No coal tiers. Instead, several ways to obtain coal:
  - Found on the map as a fairly common resource.
  - Crafted as charcoal from wood gathered in parks, using a recipe dropped in tier 2 or tier 3 dungeons.
- This gives wood a purpose and links foraging to the forge.

## Notes from the Code Review

Not requested yet, but worth checking during the balance pass:

- Hide may be a bottleneck: leather armor needs 4, the bow 2, and a rabbit gives 1.
- The crystal wand has only 20 durability and costs 2 crystals; broken gear is destroyed.
- Consumables add little power (+2 to +4).
- The hunting gear yield bonus from the concept is not implemented yet.
