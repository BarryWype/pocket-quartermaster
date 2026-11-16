# The supply network – Prompts for Claude Code

Written 2026-11-16, after play-testing the first supply-lines trial. It replaces the trial's scouting grid and free founding with **sites you discover, buildings you put on them, and places that want what they make**.

Two prompts, both on the existing `feat/supply-lines` branch:

- **Prompt 1 – The network, behind the switch.** Sites, three buildings, orders at four kinds of place, the cart serving them, street routes, the six-day rotation and expiry rings. The rest of the game is untouched while I test.
- **Prompt 2 – Making it the game.** Removes what the network replaces (material shops, guild gathering jobs), reworks quests, and turns the switch on for everyone. Run only after I've played prompt 1 and said so; expect me to revise it first.

Paste the context block above whichever prompt you run.

---

## Context (paste at the top of either prompt)

You are working on Pocket Quartermaster, on the branch `feat/supply-lines`. Follow `AGENTS.md` in full (Expo docs over memory, the emoji-in-Text rule, saves must survive, never run the full `npm run sim`). Read `doc/design/supply-lines/README.md` for what the first trial built.

### The design

The player builds the supply side; the world provides the demand side; a cart links them; both ends keep changing.

- **Sites.** Empty spots spawn on the map like other places. The player walks to one to discover it, then builds on it in person.
- **Buildings.** A building makes one kind of goods over time. Locals work it slowly; a posted hero works it at the full rate, with a bonus for a matching trade, and is its only defender.
- **Places with orders.** Taverns, smithies, apothecaries and markets, once the player has walked to them, want goods. Each pays gold per delivery and has **one order**: a list of goods, a progress bar, rewards at steps along it, and a headline reward shown from the start.
- **The cart.** Fixed stops in an order the player chooses. At a building it loads everything; at a place it unloads what that place wants; whatever is left comes home to the hall. The order of stops is the whole decision.
- **The hall.** The player's base, placed where it suits them (home or work).
- **Time.** Everything on the map lasts six days, and a third of it changes every two days, so two thirds of a network holds while one third needs attention.
- **Walking.** Hand gathering stays exactly as it is; buildings simply make more. The player can always hand goods to a place in person.
- **Unlock.** The network opens at tier 2 (after the tier 1 boss).

Not in scope, on purpose: risk that grows with the value of stock or cargo; the village that will replace the Guild Hall; permanent sites; processing buildings; cart orders by kind.

### Experiment rules

- Everything in prompt 1 stays behind Settings → About → Developer → "Supply lines (experimental)". With it off, the game is exactly as on `main`.
- Every number goes in `src/content/supplyLines.ts` with a comment. Balance comes later: gameplay first.
- Rules are pure functions in `src/game/supply/`, unit-tested, settled from timestamps when read. State lives under `save.supply`. A save change bumps the store version with a tested migration; `main` will bump the version too, so renumber when the branch is brought up to date.
- Texts in English and French.

### Visual design and UX: this feature must be easy to read

It is the most complex system in the game, played on a phone, often one-handed, sometimes while walking. Clarity matters more than density. These rules apply to every screen and marker in both prompts.

1. **Mock up before building.** For each new screen or sheet, write an HTML mockup at phone width (390) in `doc/design/supply-lines/mockups/`, in the style of `doc/design/ui/mockups/`, using the wood, brass and parchment palette in `src/theme.ts` and the game's own icons. Show the empty state, a normal state and a full state. Stop for my review before coding the screen.
2. **Use what exists.** `Sheet`, `Overlay`, `ParchmentCard`, `WoodButton`, `EmberButton`, `ItemSlot`, `LootGrid` tiles for rewards, `Price` for gold, `FillBar` and `CountUp` from the motion work, the framed diamond markers every other place uses, `feel()` for haptics. No new visual language.
3. **One vocabulary, used everywhere.** Site, building, place, order, cart, stop, hall. Verbs: Discover, Build, Post, Deliver, Collect. Never two words for one thing. Add the terms to the French texts with the same care.
4. **Every good has one icon,** shown the same way everywhere: on the building that makes it, in the cart's cargo, on the order that wants it. A player should be able to follow a good across the screen by its icon alone.
5. **Always answer "what do I do next?".** The Network tab opens with one line and one button for the most useful next step (discover a site, build, discover a place that wants your goods, set a route, crew the cart, answer a raid). Every empty state says what to do, not just that it's empty.
6. **Always answer "why can't I?".** A disabled button shows its reason in one short line beneath it. No silent failures: an action that does nothing must say why.
7. **Show flow, not tables.** Where goods move, draw it: building → cart → place, with icons and small counts, left to right. Numbers support the picture; they don't replace it.
8. **Never colour alone.** Every state shown by colour also has a shape, icon or word (expiring soon, order complete, cart stopped, raid coming), and passes contrast on parchment and on the map.
9. **Time is always visible.** Anything temporary shows how long it has left, the same way everywhere (step 6 of prompt 1).
10. **Keep the map calm.** Network markers follow the map's existing zoom thresholds and culling. Labels appear only at high zoom. A "Network" filter chip dims everything that isn't part of the network, for planning.
11. **Big targets, few taps.** Touch targets at least 44 pt. Building, posting and adding a stop take at most two taps from the map. Destructive or costly actions confirm once, in an in-app dialog.
12. **Teach by doing, once.** One guided first chain (step 8 of prompt 1). After that, one-line tips the first time each sheet opens, reread in Settings → Tips.
13. **Accessibility:** every marker and control has an accessibility label; text respects the system font scale without clipping; animations follow the Animations setting; nothing depends on sound or haptics.
14. **Performance is part of clarity.** No new work on the map's render path: markers through the memoised layer, panels through the panels store, clocks through the existing slow clocks. Re-run the map and first-open performance tests and report the numbers.

### How to work

After each step: `npm run test:changed`, then `npm test`, `npm run typecheck` and `npx expo lint`; a short summary; **commit on the branch**; stop for review. Keep `doc/design/supply-lines/README.md` as the rules as built, and add a short "How to play" page a new player could read.

---

## Prompt 1 – The network, behind the switch

### Step 0 – Clean start

1. The first trial is still uncommitted on this branch. Commit it as it stands.
2. Two bugs from play-testing: after founding a camp, **no marker showed on the map**, and **more than three trapper camps could be founded**. Reproduce on a fresh save (debug buttons and the cell sheet). Check whether founded camps persist in the save and show on the Network tab. Find the cause before changing code, fix it, and add a test that fails without the fix. Tell me the cause: the same fault may affect what follows.
3. Remove from the trial: the scouting grid and scouted cells, richness and its dots, timber and trapper camps founded on any cell, packing up and its cooldown, the three first-run cards, and their debug buttons. Trial saves migrate: existing camps close and their stock is delivered to the inventory.
4. Keep: the hall, trades on heroes, postings, the cart and its crew, cell danger and ambushes, raids, the Network tab, the debug block. Raids and ambushes keep their flat risk.
5. The hall can move **twice a week**. The confirmation dialog says how many moves are left this week and when the next one comes back, and warns if a building would end up out of reach.

Stop for review.

### Step 1 – Mockups (no code)

Mock up, for review, in this order: a site's sheet (undiscovered, discovered, built); a building's sheet; a place's order sheet; the route planner; the Network tab; the map with network markers and expiry rings at two zoom levels. Follow the UX rules above. For each, list the questions it must answer at a glance and show where the answer is.

Stop for review. Don't build screens until I've approved these.

### Step 2 – The six-day rotation

1. With the switch on, places, sites and taverns last **six days** and are split into **three groups**, each replaced on its own day, two days apart: every two days a third of the map changes. Group membership is seeded, so the world stays shared and deterministic. Fight events keep their 24 hours.
2. Read how places and taverns are generated and windowed today (`src/content/places.ts`, `src/game/places/generate.ts`, `src/game/taverns/`), and propose the change before making it: how the groups are assigned, how the existing guarantees hold (a tavern within 800 m), and what happens to quests, tips and digs tied to a place when the switch is flipped. Turning the switch on or off regenerates the map; say so in the switch's description.
3. A data test over a seeded year: at any moment about a third of places are in each third of their life, and no day replaces more than about 40% of them.

Stop for review after the proposal, and again after building.

### Step 3 – Discovering

1. **A place is discovered** when the player comes within its interaction range, in the app or on a Pocket mode walk processed on open. The save keeps the discovered ids; they are pruned when the place expires.
2. An undiscovered place or site within visibility shows as it does today, with a small "not visited" mark; its sheet says "Walk here to discover it" and shows no order. Nothing about orders, building or cart stops is available until it is discovered.
3. Discovering shows a short toast naming what was found and what it wants or allows.
4. Pocket mode may notify "Something new is nearby" under the existing nearby-places setting. It never builds or routes.

Stop for review.

### Step 4 – Sites and buildings

1. **Sites** are a new place kind, spawned with the others: seeded, shared, on walkable ground, about two or three within 1 km at any time, and at least one within 800 m of the day's first map position (the same guarantee taverns have).
2. A site is plain until discovered. Discovering reveals its **quality**, one to three stars. Any of the available buildings can go on any site: quality and distance are what tell sites apart.
3. **Three buildings**, each making one good:

   | Building | Makes | Mainly for |
   | --- | --- | --- |
   | Farm | Grain (a new good) and a little meat | Taverns |
   | Quarry | Stone | Smithies |
   | Herb garden | Herbs, berries and mushrooms | Apothecaries |

4. **Building** happens in person at a discovered site, for a small cost. Limits by tier, in config: three buildings within 1 km of the hall at tier 2, rising to six within 2.5 km at tier 5. Building resets the site's remaining life to six days.
5. **Output** is quality × the base rate, with locals at a share, a posted hero at the full rate, the trade bonus, a stock cap, collecting in person and the inspected bonus, as the trial has them.
6. **Trades** become: Farmer, Quarryman, Herbalist, Teamster, Watchman. Migrate the trial's Woodcutter and Trapper.
7. **When a site expires** the posted hero comes home, and any stock the cart hasn't taken is lost. The building's sheet and marker warn in its last day.
8. Debug: place a site of a chosen quality next to me, discover everything in view, expire this site now, skip two days.

Stop for review.

### Step 5 – Orders

1. Each discovered tavern, smithy, apothecary and market has **one order**, seeded from the place and the player, fixed when first discovered:
   - **What it wants:** one or two goods the player can make at their tier. Places of one kind want the same goods.
   - **How much:** sized so one building of average quality can fill it in three to four days.
   - **Gold per unit delivered,** always, set a little above the shop's sell price.
   - **Steps** at 25%, 50% and 100% of the bar, each with a reward, and a **headline reward** at 100% shown from the start. Two places of one kind have different headline rewards, so the player chooses which to serve.
2. **Rewards by place** (propose the exact items before building; the exclusive ones must be obtainable nowhere else):

   | Place | Along the bar | Headline |
   | --- | --- | --- |
   | Tavern | Gold, meals | An expedition supply the player can't craft, with a bonus for one run |
   | Smithy | Gold, materials | A Rare piece of gear of a stated type |
   | Apothecary | Gold, potions | A potion the player can't craft, or sometimes a flask weapon |
   | Market | Gold | Any of the above, and it takes every good |

3. **Delivering in person:** standing at a discovered place, the player can hand over goods from the inventory. Same gold, same progress.
4. **When a place expires** with its order part-filled, the steps already reached stay paid and the rest is lost. One notification the day before, if the order is between 25% and 99%: "The smithy leaves tomorrow: its order is 70% filled."
5. **The order sheet** shows, top to bottom: the place and its time left; the headline reward as a large tile; the bar with its steps and their reward tiles; what it wants with icons and how much is still needed; what is on its way by cart; and the two actions, "Deliver from my bag" and "Add to the cart's route".
6. Rewards are claimed through the loot grid.

Stop for review.

### Step 6 – Time made visible

1. **A draining ring** around every temporary marker on the map while the switch is on: full when new, emptying clockwise over its life. In its last day it changes colour **and** gains a small hourglass badge. `DifficultyRing` already draws rings: extend or pair with it, don't add a second ring system.
2. **A timer in every sheet** for something temporary, in the same position and wording everywhere: "Leaves in 2 days 4 h".
3. The Network tab lists buildings and served places with time left, and sorts "leaving soonest" first when anything is in its last day.
4. The ring is drawn without per-frame work: it updates on the map's slow clock.

Stop for review.

### Step 7 – The cart serves places, on real streets

1. **Stops** are buildings and discovered places. The route runs hall → stops in order → hall. At a building the cart loads everything it can carry; at a place it unloads everything that place still wants; what remains comes home. A stop that has expired is skipped, and the Network tab flags the route.
2. **Street routes.** Propose first, then build: the cart follows the walkable ways the game already decodes from map tiles at the fixed zoom. Build a network across the tiles within reach of the hall; snap the hall and each stop to its nearest way, with a straight last leg where needed; find paths with a shortest-path search. The path is found when the route is set and stored with it, so settling never recomputes it. If no path exists, fall back to a straight line and say so. Tell me the cost on a phone, the tiles needed, and what happens to a stored route when the map data changes.
3. **The planner** is a guided flow, not a blank map: (1) pick stops from a list of what's available, each showing what it gives or wants; (2) reorder them by dragging or with up and down buttons; (3) see the result. The result shows a flow strip (what is loaded and unloaded at each stop, by icon and count, and what reaches the hall), the loop time, the danger along the way, and a warning for any stop that will expire before the next loop ends. One tap on "Suggest" fills in a sensible order. A tap on a street forces the route through it.
4. **Danger** along a route uses the day's average per cell, not the current 30-minute window, so a route can be planned.
5. **The cart's sheet** shows where it is, what it carries by icon, the last loops in plain sentences ("Delivered 12 grain to The Rusty Tankard, 8 stone home"), and its crew.
6. On the map: the route along the streets, the cart moving on the slow clock, a small unload animation at a stop if the app is open.

Stop for review after the proposal, and again after building.

### Step 8 – First chain, Network tab and simulator

1. **Unlock** at tier 2 through the reveal, with the switch on. A debug button unlocks it on any save.
2. **The first chain** is guided as a checklist on the Network tab, one line lit at a time, each with a button that takes the player to the right spot: place your hall; walk to a site; build a farm; walk to a tavern; set the cart's route; make your first delivery. It gives a small reward at the end and never shows again.
3. **The Network tab**, rebuilt from the approved mockup: the next-step line; a flow picture of buildings, cart and places; then each as a card with stock, time left, order progress and warnings. It must be readable in five seconds.
4. **Simulator:** the bot discovers sites and places on its walks, builds on the best sites, serves the order with the headline reward it values most, and hand-delivers when it passes. A report section: goods made, delivered home and delivered to places per day; gold and rewards from orders; share of orders completed; buildings lost to expiry with stock in them. The switch stays off in the default run.
5. Write the "How to play" page and tell me what to try on the phone, in order, with the debug shortcuts.

Stop for review.

---

## Prompt 2 – Making it the game

Run only after I've played prompt 1 and asked for this. The network stops being an experiment and replaces what it makes redundant. Propose each step before building it: this prompt changes the main game.

### Step 1 – What the network replaces

1. **Remove the material shops** as map places: sawmill, quarry, copper mine, iron mine, coal pit and hunting lodge. **The fishing dock stays** as it is. For each removed place, list everything that depended on it (stock, sell lists, quests, tips, the reveal, boss weakness items, treasure and secret tips) and say where each goes.
2. **Add the buildings that replace them**, so no material loses its source: a lumber camp (wood), a hunting camp (meat, hide, bone), a mine for each tier's ore, and a charcoal kiln at tier 5, each unlocked with its tier and with a matching trade.
3. **Remove the guild gathering jobs** (woodcutter, forager, trapper, miner, charcoal burner) and their work tools, with refunds and a migration. The outdoor gatherer and the Jobs tab: propose what happens to them.
4. **Boss weakness items** sold by the removed shops move to order steps at a fitting place, or to the market.
5. **Hand gathering is not touched**: same nodes, same amounts. Check with the simulator that at each tier a regular player's buildings make clearly more than their walking gathers, growing with the tier.

Stop for review.

### Step 2 – Quests in the network's language

Rework the daily quests that named removed places, and add: discover N new places; build on a site; fill a step of an order; deliver N of a good to a kind of place; walk a cart route end to end. Keep the variety rule and the distance bands.

Stop for review.

### Step 3 – On for everyone

1. Remove the developer switch. The six-day rotation applies to everyone; the network unlocks at tier 2 through the reveal, with the guided first chain.
2. Migration for players past tier 1: the hall is unplaced and the first chain starts at their next session; nothing they own is lost; open quests on removed places are swapped as earlier migrations did.
3. The tutorial and the tips mention the network only once it unlocks.
4. Building limits and reach by tier, order sizes and gold values get a first balance pass against the simulator. Give me gold per tier before and after: this adds income to an economy that already had a surplus at tier 5.
5. Update `doc/ideas.md`, the places and jobs design docs and the README's "What you'll do".

Stop for review, with the list of what to check in the full simulator run.
