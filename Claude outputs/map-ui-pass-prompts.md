# Map UI pass – Prompts for Claude Code

Written 2026-11-19, after play-testing the supply network. Two prompts, both on `feat/supply-lines` (the network screens only exist there, and doing the map sheets on the same branch avoids two rewrites of the same files):

- **Prompt 1 – Map sheets.** One template for everything that opens from a map tap, a short "peek" that grows into the full sheet, contents visible from afar, the place sheet split by kind. Starts with a quick fix for the route planner so the network stays playable meanwhile.
- **Prompt 2 – The network, made easy.** Route mode on the map instead of the three-step planner, routes that update themselves, one way in, state badges on the map, and the Network tab as a picture.

Paste the context block above whichever prompt you run.

---

## Context (paste at the top of either prompt)

You are working on Pocket Quartermaster, on the branch `feat/supply-lines`. Follow `AGENTS.md` in full (Expo docs over memory, the emoji-in-Text rule, saves must survive, never run the full `npm run sim`).

**Why this pass.** The map's sheets were built one at a time, so no two look or behave alike: twelve sheets, the main action in a different place in each, a Close button in every footer, shops that hide their stock until you're close, the network order pushed to the top of every shop, and a route planner that is a form over a map problem. Play-testing found the planner's buttons unreachable and sheets opening behind other sheets. This pass makes every map sheet work the same way, so a player learns it once.

**Who it's for.** A player walking, phone in one hand, glancing at the screen. The first thing a sheet shows must answer: *what is this, how far is it, how long will it stay, and what can I do here?*

### Rules for every screen in this pass

1. **Mock up before building.** Each new or reworked sheet gets an HTML mockup at phone width (390) in `doc/design/ui/map-sheets/`, in the style of `doc/design/ui/mockups/`, with the wood, brass and parchment palette in `src/theme.ts` and the game's own icons. Show near and far, empty and full. Stop for my review before coding it.
2. **Build from what exists.** `Overlay`, `Sheet`, `ParchmentCard`, `WoodButton`, `EmberButton`, `ItemSlot`, the loot grid's tiles, `Price`, `IconLabel`, `DifficultyRing`, the time ring, `PartyDialog`, the motion pieces (`PressScale`, `Appear`, `FillBar`) and `feel()`. No new visual language; extend these where they fall short.
3. **One main action per sheet,** always in the same place (the footer), changing with the situation. Secondary actions sit in a row under it. No Close buttons: tapping outside, swiping down and Android back all close.
4. **Say why, always.** A locked action says what unlocks it in its own label ("Walk 320 m to trade", "Needs a free hero"), not in a separate grey line elsewhere.
5. **Never colour alone.** Every state shown by colour also has an icon or a word, and passes contrast on parchment and on the map.
6. **Big targets.** 44 pt at least. Anything the player does often takes at most two taps from the map.
7. **One vocabulary.** Site, building, place, order, stop, delivery route, hall. Verbs: Walk, Send, Build, Post, Deliver, Collect, Buy, Sell, Recruit, Fight. Never two words for one thing; French with the same care.
8. **Accessibility.** Accessibility labels on every marker and control; the system font scale must not clip text; motion follows the Animations setting; nothing depends on sound or haptics.
9. **Performance is a rule.** Sheets go through the panels store (`src/store/mapPanelsStore.ts`), markers through the memoised layers, clocks through the existing slow clocks (issues 13, 14 and 18 in `doc/issues.md`). Opening or closing a sheet must not re-render markers. Re-run the map and first-open performance tests and report the numbers.

### How to work

After each step: `npm run test:changed`, then `npm test`, `npm run typecheck` and `npx expo lint`; a short summary; **commit on the branch**; stop for review. Record the rules as built in `doc/design/ui/map-sheets/README.md`. No game rule changes in this pass unless a step says so.

---

## Prompt 1 – Map sheets

### Step 0 – Quick fix: the route planner (until prompt 2 replaces it)

Causes already found:

1. `openRoutePlanner` in `src/store/mapPanelsStore.ts` only closes the cart's sheet, so "Add to the cart's route" from a building's sheet or a place's order opens the planner **behind** that sheet (sheets are modals; the planner isn't). Opening the planner closes every other map sheet.
2. On the map, `RoutePlannerSheet` is drawn as a plain absolute panel (`styles.overMap`), not through `Overlay`. The island menu covers its footer, so its buttons can't be reached, and there is no backdrop, so a tap outside doesn't close it (on the result step it even adds a via point). Render it through `Overlay` like the others. Drop the "tap the map for a via point" behaviour for now; prompt 2 brings it back properly.

A test for each: the planner closes other sheets; its footer is reachable; a backdrop tap closes it.

Stop for review.

### Step 1 – Audit (no code change)

1. Make `doc/design/ui/map-sheets/audit.html`: every sheet that opens from a map tap, as it is today, near and far. Today that is the place sheet for each kind it serves (smithy, market, apothecary, chapel, ruins, library, fishing dock, thieves' guild), tavern, patrol, place fight, Sanctum, secret place, traveller, network site, building, cart and cell. Take the screenshots from the app on the debug build, or from component renders if that's not possible; say which.
2. For each sheet, list: what it must answer at a glance; where its main action is; what is hidden when far and why; anything that does nothing or says nothing when tapped.
3. Check the history for **why shops hide their contents when far** ("too far to see"). If it was a deliberate design choice (for example so secret places stay secret), list where it must stay.
4. End with a short list of inconsistencies, worst first.

Stop for review.

### Step 2 – Mockups of the template

Mock up the template on three very different sheets, each **peek** and **full**, **far** and **here**: a smithy, a patrol, and a network building. Then a fourth: the chooser for overlapping markers (step 6).

The template, top to bottom:
1. **Header:** the kind's icon inside its time ring (or difficulty ring for fights), the name, and one status line: distance or "You're here", and time left ("leaves in 2 days").
2. **What's here, in one line:** "Sells 4 pieces and a sword blueprint · wants stone"; "3 goblins · Beasts 2 · drops hide"; "Making 3 grain an hour · 12 of 36 stored".
3. **The main action** in the footer, changing with the situation: far → "Walk 320 m to trade" (opens nothing, or centres the map on it) or "Send heroes" where heroes can go; here → Buy, Recruit, Fight, Dig, Fish, Build, Collect.
4. **Tabs** in the full sheet, in a fixed order: what the place does (Buy · Sell, Recruit, Care, Dig, Foes); then its network order, with its progress in the tab label ("Order · 40%"); then Details.
5. **Items as tiles** everywhere (shop stock, recruits, rewards, order rewards), the loot grid's tiles; tapping one opens its card with the price and the action.

**Peek and full.** A tap opens the peek: header, the one-line summary and the main action, sized to its content. Swiping up, tapping "More", or arriving within interaction range opens the full sheet. Swiping down goes back to the peek, then closes.

Stop for review. Don't build until I've approved these.

### Step 3 – The shared template

1. A `MapSheet` component with the two heights (peek and full), the header, the summary line, the footer action slot and the tabs, built on `Overlay` and `Sheet`. Dragging between heights follows the finger where the platform allows; if a custom gesture fights the scroll view, use buttons to switch heights and say so.
2. A small helper for the distance-aware main action: given a place, the player's position and what can be done, it returns the label, whether it's enabled and what it does. Unit-tested.
3. Time and difficulty rings in the header reuse the existing ring components.
4. Tests: peek and full render, backdrop and back close, the main action label at near and far, nothing in the template subscribes to the whole save.

Stop for review.

### Step 4 – Visible from afar

1. Shops, taverns, the chapel, the apothecary and the network places show their contents at any distance within visibility: stock, recruits, care, orders, rewards. Actions that need the player there are shown but locked, their label saying how far to walk.
2. Keep hidden only what the audit found to be hidden on purpose, and say so in the README.
3. "Send heroes" appears only where heroes can actually go today (fights; network deliveries come in prompt 2).

Stop for review.

### Step 5 – Places, rebuilt on the template

1. Split the place sheet (`PlacePanel`, 425 lines) into one short sheet per kind, each built from `MapSheet` and shared sections: smithy, market, apothecary, chapel, ruins, library, fishing dock, thieves' guild. Tavern on the same template.
2. Buy and Sell become tabs of tiles. Buying asks for a quantity only where a stack makes sense.
3. The network order moves into its own tab, after the place's own content.
4. The heist picks its hero with `PartyDialog` (one hero), like every other fight.
5. Dig and Fish results show in the loot grid in the sheet, as today.

Stop for review.

### Step 6 – Fights and the rest, and map behaviour

1. Patrol, place fight, Sanctum, secret place and traveller sheets on the template. The fight sheets' one-line summary: foes, threats with their level, and what they drop, as tiles.
2. **Overlapping markers:** a tap that hits more than one marker opens a small chooser listing them (icon, name, distance); picking one opens its sheet. Your ideas file lists this as the untried alternative to spreading the icons.
3. **Empty map tap does nothing,** except while placing or moving the hall. Remove the leftover cell sheet (`SupplyCellPanel`) and move hall placement to a "Place hall here" action on the player's own marker and in the Network tab.

Stop for review, with a list of what to try on the phone, sheet by sheet.

---

## Prompt 2 – The network, made easy

Run after prompt 1. The network sheets move to the template, and routes are planned on the map.

### Step 1 – Mockups

Mock up, for review: route mode on the map (stops numbered, the route on the streets, the slim bar), the building, site and cart sheets on the template, the map markers with state badges, and the Network tab as a flow picture. Also a **clickable HTML prototype of route mode** I can open on my phone: tap stops in order, reorder, see the bar update. It's the riskiest piece, so I want to try it before any game code.

Stop for review.

### Step 2 – Routes that look after themselves

1. When the player builds on a site, or discovers a place that wants something their buildings make, the game **adds it to the delivery route** at the best position (the existing suggest-order logic) and says so in a toast: "Farm added to the delivery route · Undo · Edit".
2. When a stop expires it is removed from the route automatically, with a toast saying so.
3. With no route yet, building the first building creates one: hall → building → hall.
4. A setting under the Network tab, on by default: "Add new stops to the route automatically".

Stop for review.

### Step 3 – Route mode on the map

Replaces `RoutePlannerSheet`.

1. **Entering** route mode (from the Network tab, the cart's sheet, or "Add to route" on any building or place, which closes that sheet first and adds it as a stop) dims every marker that isn't the hall, a building or a discovered place that wants something, and shows those as large pins.
2. **Tapping** a pin adds it as the next numbered stop; tapping a numbered stop removes it. The route redraws along the streets after each change (the street routing from step 7 of the network prompt).
3. **The slim bar** sits above the island menu: the stops in order as chips (icon, number, what is loaded or unloaded), the loop time, the risk ("1 risky street"), what goes home, and Cancel, Suggest order, Save. Reordering is dragging a chip in the bar; if drag fights the scroll, use long-press then up and down, and say so.
4. **Routing through a street:** dragging the drawn route line onto another street adds a via point there. If dragging a line on the map isn't reliable, a "Route through…" button lets the player tap a street once instead.
5. Stops that expire before the loop ends are marked on their pin and their chip.
6. Leaving route mode without saving asks once if there are changes.
7. Tests for the route maths, the add and remove rules and the auto-add; the map screen must not re-render in full on each tap in route mode.

Stop for review.

### Step 4 – Network sheets and map badges

1. Site, building and cart sheets on the template. The building's summary line: "Making 3 grain an hour · 12 of 36 stored · the cart calls every 42 min". Its people section: the posted hero as a portrait slot; tapping it opens the hero picker.
2. **Badges on network markers**, small and readable at map zoom, each with an icon and an accessibility label: full, no worker, nothing collecting it, last day, raid coming. At most one badge per marker, the most urgent.
3. **The route line** gets direction arrows; tapping it opens the cart's sheet. The cart marker shows its cargo as one icon.
4. **A "Network" toggle** on the map dims everything that isn't part of the network.

Stop for review.

### Step 5 – The Network tab as a picture

1. The top keeps the one "next step" line and its button.
2. Below it, a flow picture: buildings on the left, places on the right, the cart in the middle, lines showing what flows where, problems as badges on the item they concern. Tapping any item opens its sheet; tapping the cart opens route mode.
3. Below the picture, the cards as today, sorted with anything in its last day first.
4. Wording: "delivery route" everywhere; every number has its unit and meaning ("12 of 36 stored", not "12/36").

Stop for review, with what to try on the phone in order, and a short script for a usability check: hand the phone to someone who hasn't seen the network, ask them to "get grain to a tavern", and note where they hesitate.
