# Supply lines, small version – Prompt for Claude Code

Written 2026-11-12. One prompt, six steps. It tests one question: **is it fun to scout ground, found camps, draw a cart route around danger and decide who guards what?** Everything else waits for the answer.

It doesn't depend on the prompts in `mercenary-company-prompts.md` (roster 12, fog of war, errands), which haven't been run. Where it overlaps them, it says so.

---

## Context

You are working on Pocket Quartermaster. Follow `AGENTS.md` in full (Expo docs over memory, the emoji-in-Text rule, saves must survive, never run the full `npm run sim`).

**The idea.** The player runs a small supply network on the real map:
- They **scout** ground by walking: each map cell has a hidden richness per resource, revealed when walked.
- They **found camps** on good ground, in person. A camp produces a material over time.
- Each hero has a **trade** beside their class. A hero posted at a camp raises its output and is its only defender.
- A **cart** carries stock from the camps to the hall along a route the player draws. Cells are more or less dangerous; the route trades distance against risk, and heroes can escort it.
- **Raids** are announced ahead of time against a camp.
- Camps aren't permanent: richness moves over the weeks, and a camp can be packed up and founded elsewhere.

**Experiment rules.**
- Build on a branch, `feat/supply-lines`.
- The whole feature sits behind one switch, Settings → Developer → "Supply lines (experimental)", off by default. With it off, nothing in the game changes or shows.
- Balance is not the goal: walking and the network will be balanced later. Every number goes in one config file, `src/content/supplyLines.ts`, with a comment, so I can change it from play.
- Prefer the simple version of everything. Where this prompt leaves a choice, take the simpler one and say so in the summary.

**How to work.**
- After each step: `npm run test:changed`, then `npm test`, `npm run typecheck` and `npx expo lint`; a short summary; stop for review.
- Rules are pure functions in `src/game/supply/`, unit-tested. Everything is settled from timestamps when read, as jobs and HP are: no timers running the rules.
- A change to `SaveData` bumps the store version with a migration step and its test. New state lives under one key, `save.supply`.
- Texts in English and French.
- Pocket mode stays passive. It may notify (step 5).
- Design notes go in a new folder, `doc/design/supply-lines/`, with a README that states the rules as built.

---

## Step 0 – Read, then propose (no game change)

Read: `src/game/generation/` (`tiles.ts`, `geo.ts`, `walkable.ts`, `spawns.ts`, `rng.ts`, `time.ts`), `src/game/patrols/generate.ts`, `fight.ts`, `escort.ts`, `src/content/patrols.ts`, `src/game/places/fights.ts`, `src/game/jobs/`, `src/content/jobs.ts`, `src/content/heroes.ts`, `traits.ts`, `doc/design/jobs/README.md` and `work-traits.csv`, `src/components/MapMarkers.tsx`, `MapPanels.tsx`, `PartyDialog.tsx`, issues 13 and 18 in `doc/issues.md` (map performance).

Then write `doc/design/supply-lines/README.md` with a proposal for the four things below, and stop.

1. **Cells.** One grid for everything in this feature: geohash precision 7 (about 150 m), unless the generation code suggests a better fit.
2. **Terrain per cell.** How to classify a cell as green (park, wood, grass), water's edge, or built-up, from the map tile data the game already decodes at a fixed zoom (the same source as spawn placement, never rendered features). Say what share of cells come out as each around the Wellington fixture tile.
3. **Danger per cell**, from what the world already generates:
   - every patrol whose path passes through or within a radius of the cell during the current time window adds to it, weighted by difficulty (easy 1, medium 2, hard 3 as a start);
   - every fight event and monster lair adds danger in a radius around it;
   - the total maps to four levels, 0 to 3;
   - each level has a chance of an ambush when a cart crosses the cell (start: 0%, 2%, 5%, 10%).
   Give the exact formula against the real patrol generation, how often it changes (patrol windows), how the ambushing patrol kind is picked, and the cost of computing it for a route of 20 cells. Danger is per player only where patrols already are; otherwise it follows the shared world.
4. **The save shape** under `save.supply`, and the migration.

Stop for review.

---

## Step 1 – Trades

1. Every hero gets one **trade**, shown beside their class. Four trades in this version:

   | Trade | Does |
   | --- | --- |
   | Woodcutter | Raises a timber camp's output |
   | Trapper | Raises a trapper's camp's output |
   | Teamster | Driving the cart: more capacity and speed |
   | Watchman | Posted at a camp: raids on it are announced earlier, and the watchman fights there with a bonus |

2. A trade has a level, 1 to 3, raised by time spent using it (thresholds in config). The level sets the size of the effect.
3. Rolled at recruitment, independent of class and combat trait, even weights. Existing heroes get one through the migration, seeded by hero id. Make sure the starting trio doesn't come out with three of the same.
4. Shown on tavern offers, the hero sheet and hero pickers, only while the switch is on.
5. Guild jobs are untouched in this version. A trade does nothing for them yet. Note in the README that guild gathering jobs would fold into camps if this goes ahead.

Stop for review.

---

## Step 2 – The hall, scouting and camps

1. **The hall.** The player places it: "here" or by tapping the map. One marker. It can be moved, at most once a week (config). The save stores it rounded to its cell. Everything the network delivers arrives in the normal inventory when it reaches the hall.
2. **Scouting.** A cell is scouted when the player's path passes through it, in the app or from a Pocket mode walk processed on open. The save keeps the set of scouted cells, compactly; say how large a year of walking makes it. When the fog of war prompt is built, this set becomes its discovered cells: keep the functions general (`src/game/discovery/`).
3. **Richness.** Each cell has a richness from 0 to 3 for each resource its terrain allows, generated from a seed of the cell and the current **period** (3 weeks, config), so it is the same for every player and moves when the period changes. Most cells are 0 or 1; a 3 is rare. Only scouted cells show theirs, as small pips on the map at high zoom and in a cell's sheet on tap. When the period changes, scouted cells show their old value greyed until walked again.
4. **Camps.** Two kinds:
   - **Timber camp**: green cells only. Makes wood.
   - **Trapper's camp**: any cell. Makes meat, hide and bone with the trapper job's weights.
   Founding: the player must be standing in the cell. Costs a little gold and wood (config). At most **3 camps** (config), each within 2 km of the hall.
5. **Packing up.** A camp can be packed up from anywhere. It keeps nothing of its stock, and the slot is free again after 6 hours (config).
6. **Markers** for the hall and camps, drawn by the memoised marker layer without re-rendering other markers. Tapping a camp opens its sheet (the shared `Sheet`).
7. **Debug screen**, a "Supply lines" block: place the hall here, scout every cell in view, found a camp here without walking, skip to the next period, show danger levels in view.

Stop for review.

---

## Step 3 – Production and postings

1. A camp makes **richness × base rate** per hour of its material (base rates in config, well above the guild jobs' so the camp is worth founding). On a richness 0 cell it makes nothing.
2. **Locals** work a camp with nobody posted, at `localsShare` of the rate: **0.4** to start. Setting it to 0 must work and means an empty camp makes nothing: I want to try both.
3. **Posting a hero**: the camp runs at the full rate, times a bonus when the hero's trade matches the camp (level 1, 2, 3: +25%, +50%, +100% to start). A posted hero is away like a hero on a guild job: pickers show them as "Posted", with recall. No energy in this version.
4. **A posted hero is the camp's garrison** (step 5). A watchman can be posted at any camp for the watchman effects without raising output.
5. **Stock** builds at the camp up to a cap (about 12 hours of full output, config), then stops.
6. **Visiting in person**: within interaction range, "Collect" moves the stock straight to the inventory and marks the camp **inspected** for 24 hours (+25% output, config).
7. **The camp sheet** shows: terrain and richness, what it makes per hour and why (locals or the posted hero, trade, inspected), stock against the cap, Post, Recall, Collect when in range, Pack up.
8. **The postings view**: a new tab on the Expeditions screen, "Network", listing the hall, each camp with its line of numbers, and the cart (step 4). One screen to see the whole thing. Its menu badge counts camps at their cap.

Stop for review.

---

## Step 4 – The cart and its route

1. **One cart.** It runs a loop: hall → camp(s) → hall, again and again, while a route is set.
2. **Drawing the route.** In a route planner on the map: tap camps to visit, in order, and optionally tap cells as waypoints between stops. The path is straight lines between consecutive points; the cells it crosses are worked out from that. The planner shows, live: the length, the loop time, each crossed cell tinted by danger level, and the chance of at least one ambush per loop. Only scouted cells can be waypoints; unscouted cells crossed by a straight leg count as danger level 2 (config), which makes scouting a route worth it.
3. **Travel.** Speed in config (start at 3 km/h). At each camp the cart loads up to its free capacity (start at 20 units, config). At the hall everything is delivered to the inventory.
4. **Crew.** A driver slot and up to two escort slots, heroes who are then away with the cart. With no driver the cart still runs, slower. A Teamster driving raises capacity and speed by trade level.
5. **Ambushes.** For each loop, each crossed cell rolls its level's chance once, seeded by cart, loop number and cell, so the result is fixed when the loop starts. An ambush is a fight between the crew and the patrol kind picked in step 0, at the player's tier, with the existing patrol fight simulation:
   - **won**: the cart goes on; the crew takes the fight's damage and its normal loot roll;
   - **lost, or nobody aboard**: the cargo carried at that moment is lost and the cart returns to the hall empty, after a delay (config).
   Hurt crew stay aboard until the cart is home, then rest as usual; the cart waits for the player to confirm or change the crew if anyone is too hurt to go.
6. **A log** on the cart's sheet: the last ten loops, what was delivered, any ambush and how it went, in one line each.
7. **On the map**: the route as a line, the cart as a marker moving along it on the map's slow clock, an ambush as a short toast if the app is open.
8. Everything is settled from timestamps: opening the app after eight hours replays the loops in between, in order, in one pass. Test this with a long gap, a mid-loop gap, a route changed mid-loop (it applies from the next departure) and a camp packed up while the cart is on its way to it.

Stop for review.

---

## Step 5 – Raids

1. **At most one raid a day** (config), only while at least one camp holds stock, and never while the app hasn't been opened for 2 days: on return, no raid is pending and none is announced for the first 2 hours.
2. **The target** is picked among the camps, weighted by stock and by the danger level of the camp's cell and its neighbours. The raiders are the patrol kind dominating that danger, at the player's tier, as a medium fight.
3. **Announced ahead**: 2 hours before it lands (config), 4 if a watchman is posted at the target. A notification under its own setting, on by default, respecting quiet hours; a banner on the Network tab and on the camp's marker with a countdown.
4. **What the player can do before it lands:**
   - **Defend**: send up to three heroes to the camp. They arrive after a travel time from the hall (distance at walking speed, config); if they arrive after the raid lands they are too late. The party dialog shows the odds and the arrival time.
   - **Empty it**: collect in person, or let the cart take what it can if it calls there in time.
   - **Leave it.**
5. **When it lands**, defenders are the posted hero plus anyone sent who arrived, against the raiders, with the existing fight simulation:
   - **won**: nothing is lost; the normal patrol loot roll; a report line.
   - **lost, or nobody there**: the stock is taken and the camp is closed for 6 hours (config). A posted hero who loses comes home hurt. Nothing is destroyed.
6. Defenders go home after the raid (travel time back).
7. Debug: "Raid this camp in 2 minutes".

Stop for review.

---

## Step 6 – First-run flow, simulator, and what to tell me

1. **First run.** Turning the switch on shows three short cards: place your hall; walk to scout, look for pips; found a camp where you stand. Then one-line tips the first time each sheet opens (camp, route planner, a raid banner). No tutorial beyond that.
2. **Simulator.** A minimal bot, enough to keep the report honest and no more: it places the hall at its home, founds camps on the best scouted cells of its walks, posts heroes it wouldn't send that day, runs the cart on the direct route with one escort when it has a spare hero, and defends a raid when the odds pass its threshold. Report section "Supply lines": materials delivered per day against materials gathered by walking, ambushes and raids per week and their outcomes, hours heroes spent posted or on the cart. The switch is off in the default sim run and on with a flag, so today's numbers don't move.
3. **Write-up** in `doc/design/supply-lines/README.md`: the rules as built, every config number with what it does, what was simplified, and a short list of what you'd build next and why (recovering stolen cargo from a raiders' camp, more camp kinds by terrain, orders from temporary places, heroes patrolling cells to lower danger, a second cart, defences).
4. Tell me what to try first on the phone, in order, with the debug shortcuts for each.

Stop for review.
