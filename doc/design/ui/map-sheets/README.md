# Map sheets

The map UI pass (`Claude outputs/map-ui-pass-prompts.md`): every sheet that opens from a map tap works the same way.

- `audit.html`: the sheets as they were at 9b24e24, far and here, with what each answers at a glance, where its main action is, what it hides when far, and what does or says nothing (prompt 1, step 1).
- `template.html`: the shared template on a smithy, a patrol and a network building, peek and full, far and here, and the chooser for overlapping markers (prompt 1, step 2). Approved 2026-11-19 with the defaults it lists; fights keep their range rule (no sending heroes from afar).

## The template (approved)

1. **Header:** the kind's icon inside its time ring (a difficulty ring for fights), the name, and one status line: distance or "You're here", and time left.
2. **What's here, in one line**, with items as small tiles.
3. **One main action** in the footer, changing with the situation; secondary actions in a row under it. No Close button: a tap outside, a swipe down and Android back close.
4. **Tabs** in the full sheet, in a fixed order: what the place does; its order, with its progress in the label ("Order · 40%"); Details.
5. **Items as tiles** everywhere; tapping one opens its card with the price and the action.
6. **Peek and full.** A tap opens the peek (header, summary, main action, sized to its content). Swiping up, *More*, or walking into range opens the full sheet. Swiping down goes back to the peek, then closes.
7. **Locked actions say why in their own label:** "Walk 320 m to trade". Far, the walk button centres the map on the place.
8. **Overlapping markers:** a tap that hits two or more opens a chooser anchored to the tap; picking one opens its peek.

## Built (step 3)

- **`MapSheet`** (`src/components/MapSheet.tsx`), on `Overlay` and `Sheet`: the header (icon in its `TimeRing` or `DifficultyRing`, name, `mapSheetStatus` line), the summary, the footer with the main action and a secondary row, and tabs in the full sheet. It reads only its props: no store subscription, so a save change never re-renders it (tested).
- **Heights.** Peek first. More (44 pt), a tap on the title, a swipe up, or `inRange` turning true opens the full sheet; a swipe down goes back to the peek, then closes. The switch happens on release and does not follow the finger, so the body's ScrollView keeps its own scroll and nothing fights it on Android.
- **Main action** (`mainAction`, `src/game/places/mainAction.ts`): `act`, `walk` (out of range; the button reads "Walk 320 m to trade", is never disabled, centres the map through `onWalk` and goes back to the peek) or `blocked` (the rule's reason, said in the button's own label). Distance is judged there and a rule's own `tooFar` is ignored; `anywhere` marks actions that work from any distance.
- **Time left** reads "3 days" from two days up, "5 h" from an hour, "40 min" below (`formatTimeLeft`).
- `Sheet` gained `badge`, `headerRight`, `onHeaderPress`, `headerHint` and `footerStyle`; every current sheet is unchanged.

## Built (step 4): visible from afar

Every map sheet shows what is there at any distance: shop stock and prices, what a place buys, care, the blessing, the dig, the catch, the heist, training, a tavern's recruits and supply, a fight's foes, threats and trophy, the Sanctum's guardian and sigils, a secret place's description and time left, a traveller's ask. "You are too far to see what is here" is gone.

Actions that need the player there stay shown but locked, and say why in their own label: "Walk 320 m to buy", "Walk 320 m to recruit", "Walk 320 m to fight" (`walkTo`, `src/components/walkLabel.ts`, from the rule's own `tooFar`). The separate "Walk closer" and "Get within 50 m" lines are gone wherever the label now says it. Far, Sell all waits until the player is there, so a row carries one walk label, not two.

Fights keep their range rule (decided 2026-11-19): heroes can't be sent from afar, so "Send heroes" appears nowhere yet.

Still hidden, on purpose:
- **A secret place's offer** (the hidden den's recruit, the black market's goods) stays behind the key, at any distance.
- **An undiscovered network place's order**: discovery is a game rule (it makes the order and the stop exist).
- **An unvisited site's quality and buildings**: learnt by walking there.
- **A traveller's reward**: a surprise until they are helped. Their ask shows from afar.

## Built (step 5): places on the template

`PlacePanel` (425 lines, every kind in one sheet) and `TavernPanel` are gone. Each place opens a short sheet on `MapSheet`, from shared pieces in `src/components/places/`:

| Sheet | Kinds | Main action | Secondary | Tabs, in order |
|---|---|---|---|---|
| `ShopSheet` | smithy, market | Buy (opens the shop); with a tile picked, "Buy that · price" | Sell; Deliver | Buy · Sell, Order, Details |
| `ApothecarySheet` | apothecary | as the shop | Care; Deliver | Buy · Sell, Care, Order, Details |
| `ChapelSheet` | chapel | Take the blessing | Care | Care, Buy (when it stocks a boss weakness), Details |
| `FindSheet` | ruins, fishing dock | Dig / Fish | | Buy (when stocked), Details |
| `LibrarySheet` | library | Train (opens the tab); with a hero picked, "Train Bram · price" | | Train, Buy, Details |
| `ThievesGuildSheet` | thieves' guild | Send a heist (opens the party dialog) | | Buy (when stocked), Details |
| `TavernSheet` | tavern | Recruit (opens the tab); with a recruit picked, "Recruit Ada · price" | Deliver | Recruits, Buy (emergency supply and stock), Order, Details |

- **Shared** (`usePlaceSheet`): the time ring (the place's life left; its last hour is the urgent colour), the status line, the walk (centres the map on the place through `focusPlace`, and the sheet goes back to its peek), the main action's decision (`mainAction`), the order tab, Deliver, Details (description, time left, gold held) and the "walk here to discover it" line.
- **Buy and Sell** (`useShop`) are tiles with their price under them. Tapping one opens its card under the grid (the inventory's own `GearCard` or `ItemPopup`, with a boss weakness, a blueprint's inputs or a ledger's place) and turns the main action into "Buy Knight's longsword · 120 gold". Stacks (materials and consumables) get a quantity stepper (−, the count, +, All); gear, blueprints and ledgers don't. On the shop with nothing picked, the main action is locked and says "Pick something to buy". Sold-out and known lines stay as dimmed tiles labelled "Sold out".
- **The order** is a tab after the place's own content, its progress in the label ("Order · 40%"); Deliver is a secondary action whenever there is something to hand over, and opens that tab.
- **The heist** picks its one hero in `PartyDialog` (one slot, the guild's Traps threat as the briefing, the heist's own odds), like every other fight.
- **Dig and Fish** show what they brought in the loot grid under the summary, as before; the button then says "Already dug here".
- **Locked actions say why** in their own label: "Sold out", "Not enough gold", "Already known", "A heist is under way", "Beat the Bandit Stockade first".
- `MapSheet`'s `action` and `secondary` can be functions of what the sheet shows (`{ full, tab, open }`), so "Buy" in the peek opens the shop and on the shop it buys the picked tile.
- Unchanged rules: ranges (50 m), prices, stock, care, the blessing, training, recruiting, heists.
- **Speed** (`src/perf/placeSheetFirstOpen.test.tsx`, dev machine, 2026-11-19): a place sheet's peek opens cold in 6–14 ms (the tavern 36 ms), the full sheet adds 4–12 ms; warm, peek and full together take 7–19 ms. The old one-piece panels took 5–15 ms cold (the tavern 39 ms). The first sheet of a run pays the module warm-up (smithy 39 ms now, 144 ms before). Sheets still open through `mapPanelsStore`, so the map's markers don't re-render.

## Built (step 6): fights, secrets, travellers, overlapping markers, the empty tap

`PatrolPanel`, `PlaceFightPanel`, `SanctumPanel`, `SecretPanel`, `TravellerPanel` and `SupplyCellPanel` are gone. The fight sheets live in `src/components/fights/`, the secret place in `src/components/places/SecretSheet.tsx`, the hall in `src/components/HallSheet.tsx`.

| Sheet | Ring | Peek summary | Main action | Secondary | Tabs, in order |
|---|---|---|---|---|---|
| `PatrolSheet` | difficulty, with the time left | foes, threats with their level, drops | Fight (opens the party dialog) | | Foes (with their tags), Details (tier, length, party, rewards, escort, trophy) |
| `PlaceFightSheet` | difficulty, with the time left | as the patrol | Fight | | Foes (and the opportunity), Details |
| `SanctumSheet` | hard | element, guardian, drops; after the fight its log and loot | Challenge (asks once, as before); Skip while the log plays; Done | | Sigil (the tiers held, as chips), Guardian; none after the fight |
| `TravellerSheet` | time left | who they are and what they ask | Help, or the pilgrim's meal or supply; the trader's Trade opens the tab; after helping, "Recruit Ada" or "Walk on" | the pilgrim's other gift; Decline | Trades (trader only) |
| `SecretSheet` | time left | the key line (held, none yet with the fragments, or entered) | Enter; once in, Recruit (or the black market's Goods); the underwater dungeon's Dive in | | Recruit, Goods, Foes (underwater), Details |
| `HallSheet` | none | place or move the hall here, moves left | Place the hall here / Move the hall here (asks before a move, as before) | Pick a spot on the map; Open the building | none |

- **The fight summary** (`FightSummary`): one line of foes ("3 foes: cutpurse, bandit, bandit archer"), the threat chips with their level pips, and a row of small drop tiles read from the loot matrix (`lootMatrix[source]`): "always" and "often" drops plain, "sometimes" and "rare" ones faded, XP left out. The row's accessibility label lists them ("Drops: Gold, Materials, …").
- **Locked fights say why** in the button: "Already gone", "Already beaten this week", "Needs a Sanctum Sigil", "No hero free to fight"; a secret place without a key says "Needs a key to enter".
- **Overlapping markers** (`src/game/map/overlap.ts`, `src/components/markerHits.ts`, `MarkerChooser`): a tap on a marker whose centre lies within 40 points of others (at the map's current zoom) opens a small chooser by the tap instead of a sheet, listing the tapped marker first and then the others nearest first, each with its icon, name and status (distance, time left). Picking a row opens that marker's own sheet; a tap outside or Back closes it. It covers Sanctums, taverns, places, secret places, patrols and travellers; the network's own markers (sites, buildings, hall, cart) are not in it. The markers' callbacks stay stable: the hits and the zoom are read from refs at tap time, so the chooser never re-renders the markers.
- **The empty map tap does nothing**, except while the route planner is adjusting a stop or while the hall is being placed. Hall placement moved to the player's own marker (it opens `HallSheet` for the player's cell, with "Place the hall here"), to the Network tab (a "Place the hall here" button on the hall line, and the first steps' "Place hall here", which places it at once in the player's cell) and to "Pick a spot on the map" in the hall sheet, which shows a bar ("Tap a spot on the map to place your hall") until the next tap opens the hall sheet for that spot.
- Unchanged rules: ranges, fights, odds, the Sanctum's one attempt, the hall's moves and their limit.
- **Speed** (`src/perf/fightSheetFirstOpen.test.tsx`, dev machine, 2026-11-19), cold peek / full / warm peek and full: patrol 36 / 11 / 14 ms (the first of the run, so it pays the module warm-up), place fight 15 / 6 / 12, Sanctum 9 / 6 / 10, trader 9 / 10 / 21, secret place 7 / 16 / 8, hall 7 / no tabs / 4. The old panels took 5–15 ms cold. Sheets and the chooser open through `mapPanelsStore`, so the markers don't re-render.

## Proposed (prompt 2, step 1): the network, made easy

For review, no code change. `network.html` mocks up route mode on the map, the building, site and cart sheets on the template, the network markers with their badges and the Network tab as a flow picture. `route-prototype.html` is a clickable prototype of route mode, to try on a phone before any game code.

- **Route mode** dims everything that can't be a stop and shows the hall, the buildings and the discovered places that want something as large pins. Tapping a pin adds it as the next numbered stop; tapping a numbered pin takes it off. The route redraws along the streets after each change.
- **The slim bar** sits above the island menu: the stops as chips (number, icon, what is loaded or delivered), then "Loop 42 min · 1 risky street · home: 6 stone", then Cancel, Suggest order and Save.
- **Grab points** (Clovis's design, replacing "Route through…"): a tap anywhere on the route adds a brass grab point there, on that leg, without changing the route. Drag it straight away, or hold it (0.3 s) and drag; a jittery finger never cancels the drag: a dashed line shows the bend while the finger moves; on release the point snaps to the nearest street and the route redraws along the streets through it. Tap a grab point for Remove. Several are allowed; each is a via point between the stops it sits between. Streets have no direction: the cart takes any street either way.
- **Reordering:** long-press a chip and drag it sideways; or tap a chip for "◀ Earlier · Later ▶ · Remove", which is also the accessible way.
- **Expiring stops** get ⏳ on their pin and chip, and a line under the stats; a place the cart would reach after it leaves says "gone by then".
- **Leaving with changes** asks once: "Leave without saving?" with Keep editing (main) and Leave without saving.
- **Auto-added stops** (step 2) show a toast: "Quarry added to the delivery route · Undo · Edit".
- **Badges**, at most one per network marker, most urgent first: raid coming ⚔️, last day ⏳, full 📦, nothing collecting it 🛒, no worker 👤.
- **Suggest order** keeps today's rule: nearest next from the hall, a place waits for the building in the route that serves it.

## Built (prompt 2, step 2): routes that look after themselves

- **New stops join the route by themselves** (`src/game/supply/autoRoute.ts`). Building on a site adds the building; discovering a place adds it when its order wants something a building already on the route makes (a market: any building). Each stop goes where Suggest order would put it relative to the others (a place after every building on the route that makes what it wants, a building before the first place it serves) and, among those slots, where it adds the least distance, so the player's own order of the other stops is kept. A stop beyond the hall's reach is left out. While a loop runs, the change waits for the next departure, like any route change.
- **The first building makes the route**: with no route yet, hall → building → hall. The cart is not started: that stays the player's call.
- **Stops whose time is up leave the route** whenever the network settles (a gone building, a place whose order has left). The street path keeps its points, so the cart drives past where the stop was until the new path is found; a route with no stop left is emptied and the cart parks after its loop. The old "A stop on the cart's route has left" line on the Network tab now only shows in the moment before that.
- **The route toast** (`RouteToast`) says what changed: "Farm added to the delivery route" with Undo (the route as it was; Undo of the first route parks the cart with no route) and Edit (the route planner, until step 3's route mode replaces it), or "Farm left the delivery route: its time is up" with Edit. Several at once: "2 stops added…". It sits under the top bar, waits while a sheet covers the map or another tab is in front (so the toast after building shows once the building's sheet closes), then stays six seconds. Its buttons are 44 pt with their own accessibility labels.
- **The street path** after an automatic change is found off the press (`useRoutePathKeeper`, sharing `findStreetPath` with the planner) and kept only if the route didn't change meanwhile; until then the cart has the straight path.
- **The setting**: "Add new stops to the route automatically" under the cart on the Network tab, on by default. It lives in the device settings (`settingsStore.autoRoute`), not the save, so no save migration. Off: nothing is added; expired stops still leave.
- **Simulator**: unchanged. Its bot already rebuilds the whole route with Suggest order each time it plans, which is what auto-add approximates.

## Built (prompt 2, step 3): route mode on the map

Replaces `RoutePlannerSheet` (removed, with its three-step sheet and the "Adjust on the map" bar).

- **Entering**: every way in opens route mode on the map with every sheet closed: Set the route on the Network tab and in the cart's sheet, Add to route on a building or a place (the stop is already added), and Edit on the route toast. State: `mapPanelsStore.routeMode` (`draft`, and `start` to tell whether leaving loses changes), `routePath` (the draft along the streets) and `selectedGrab`.
- **Dimming**: a dark wash (a background layer at 45 %) dims the ground, the streets and the cells, under the route line. Every marker goes to 30 %, through `MapMarker` and `RouteDimContext` in `MapMarkers` and `SupplyMarkers`; the same element either way, so entering and leaving re-render the markers once and remount nothing. A tap on a dimmed marker opens nothing but says on the bar, for five seconds or until the next edit, why it can't be a stop (`whyNotStop` in `planner.ts`, the same tests as the pins, the lasting ones first): "A site is not a stop: build on it first…", "The Monster lair doesn’t trade with your network…", "Quarry is too far from your hall. Stops must be within 800 m of it.", "Visit the Crooked Mug first…", "The Crooked Mug wants nothing right now…", and for anything else the general rule. Read aloud as an alert.
- **Pins** (`routeMode/RouteModePins`): the hall, every building and every discovered place with a live order within the hall's reach, 48 pt, numbered when on the draft (the number badge, not only the violet ring, says it is on), ⏳ when it leaves before the next loop ends. A tap adds it as the next stop or takes it off; accessibility labels say which ("Farm: tap to add it as stop 3").
- **Grab points**: a tap on the route line (the line's own 44 pt hitbox, within 60 m) adds a brass grab point on that leg. On the phone a grab point is MapLibre's draggable annotation: hold it, then drag; on release it snaps to the nearest street (`snapGrab`, the planner's street graph) and the route redraws through it. Unlike the prototype, the drag starts after the hold, not on the first move: that is the native annotation's gesture. Tap a grab point for Remove grab point in the bar.
- **The slim bar** (`routeMode/RouteBar`), above the island menu: the stops as chips (number, icon, up to two goods loaded ▲ or unloaded ▼, ⏳), "Loop 42 min · 1 risky street · home:" and the goods that come home, a ⏳ line per stop that leaves before the next loop ends, the "no street" lines, then Cancel, Suggest order and Save. A risky street is a cell the path crosses where an ambush can happen today (danger level 1 or more; `loopPreview().riskyCells`). Save says why it is locked in its own label: "Add a stop to save", "Farm is too far", "Finding streets…". With no stop yet, the bar says what to do.
- **Reordering**: tap a chip for Earlier, Later and Remove (the accessible way; grab points keep their legs). Or hold a chip (0.35 s) and drag it sideways; the bar's scroll is off while a chip is held, and the chip drops among the others by their middles. Built with React Native's PanResponder, not react-native-gesture-handler: gesture-handler isn't a direct dependency of the app, and adding it means a new development build; PanResponder does the job without one. If drag fights the scroll on the phone, say so and I'll switch.
- **Leaving** with changes asks once: "Leave without saving?" with Keep editing (main) and Leave without saving. Cancel and the phone's back button both go through it; without changes they just leave.
- **Tests**: `routeEdit.test.ts` (toggling, Earlier/Later over grab points, reordering, which leg a tap lands on, grab points, where a dragged chip drops), `RouteMode.test.tsx` (pins, chips, Save and its locked labels, leaving, grab points from a line tap, ⏳, and that pin taps never re-render the other markers).
- **Speed** (`src/perf/routeModeTap.test.tsx`, eight buildings, this machine; phone ≈ ×4): entering 12 ms (markers dimming 6, pins and bar 4); a pin tap 16 ms median for the pins, the bar and the line (≈ 64 ms on a phone), 0 ms for the other markers. The pins' list of possible stops is memoised on the save and the clock, so a tap never regenerates the places.

## Built (prompt 2, step 4): network sheets and map badges

- **The building's sheet** (`SupplyCampPanel`, now on `MapSheet`): status "★★☆ · 320 m away · leaves in 2 days" with the time ring; one summary line, "Making 3.4 grain an hour · 12 of 36 stored · the cart calls every 42 min" (or "nothing collects it", "the cart is parked"), with the raid banner and the last-day box under it. The main action is the next useful step: Post a hero, then Add to the delivery route, then Collect n (a walk when away). In the last day, with something stored, Collect comes first. Secondary: Add to the delivery route or Edit delivery route. Tabs: **Making** (fill bar, "12 of 36 stored · full in 8 h", the goods, Goes to "the Crooked Mug, stop 2", Next call), **People** (the posted hero as a portrait slot; a tap, or the main action Post a hero / Change worker, opens the hero picker; Recall under it), **Details** (ground, distance from the hall, time left, the six-day rule; debug buttons).
- **The site's sheet** (`SupplySitePanel`): undiscovered, "Walk here to see how good the ground is and what you can build" and "Walk 320 m to discover it"; in range, the button waits ("Looking around…") for the automatic discovery. Discovered: "Poor ground · a Farm here makes 2 grain an hour · 2 places nearby want it" for the picked kind (until a pick, the kind most wanted nearby). Main action "Build a Farm", locked with its reason when a rule holds wherever the player stands ("Place your hall first", "Too far from the hall", "All 3 buildings placed", "Not enough gold or wood"), otherwise a walk until there. Secondary in the peek: See what you can build. Tabs: **Build** (the open kinds as tiles with their rate, radio-like; the picked kind's goods, who wants them nearby with distance, or "it goes home to the hall", "Added to the delivery route when built", the cost), **Details** (ground, from the hall, time left, buildings near the hall). Building still needs the player there, as before.
- **The cart's sheet** (`SupplyCartPanel`): status as before ("On its way to the Farm, back at the hall in 12 min", "Parked at the hall."). Summary: "No delivery route yet. Pick the stops on the map…", "Route ready: 2 stops, loop 42 min · no risky street", or, running, "Carrying to the Crooked Mug:" with the cargo as icons, "· loop 42 min · 1 risky street". Main action: Plan the delivery route, then Choose a driver (opens Crew on the driver's picker; Start the cart stays as a secondary, since a cart may go without one), then Start the cart (locked "Crew too hurt to set out", "A crew member is busy"), and Edit delivery route while it runs, with Stop after this loop. Tabs: **Route** (the stops in order with what is loaded + and unloaded −, a place leaving before the loop ends, "Loop 42 min · 2.1 km along streets", what comes home, risky streets and the ambush risk), **Crew** (driver and escorts as portrait slots, pace and capacity, the picker), **Last loops** (the sentences).
- **Shared pieces**: `network/networkBits.tsx` (stars, `GoodsRow`, `InfoRow`, `PortraitSlot`: 56 pt, "+" when empty, the label says what a tap does). Tests share `network/sheetTestKit.ts`.
- **Badges** (`src/game/supply/badges.ts`, `buildingBadge`): one per building marker, most urgent first: raid coming ⚔️, last day ⏳, full 📦, nothing collecting it 🛒 (off the delivery route, or the cart parked), no worker 👤. A 20 pt square at the icon's top right with its own icon and colour; the marker's accessibility label says it ("Farm, last day, 5 h left", "Farm, full, 36 of 36 stored"). It replaces the stock count and the raid countdown under the marker. Places keep their own time ring; sites have none.
- **The route line** has chevrons along it in the direction the cart drives (a symbol layer with the `route-arrow` sprite, drawn by `scripts/generate-map-textures.py`), and a tap on it outside route mode opens the cart's sheet. A map layer has no accessibility label of its own: the cart's sheet stays reachable from the cart marker and the Network tab.
- **The cart marker** shows the good it carries most of as one small icon beside the horse, and says it ("The cart, carrying grain").
- **The Network toggle** (🕸️ in the top bar, once the supply lines are on and the hall is placed; a check in its corner when on, `accessibilityRole="switch"`): everything that isn't the network dims to 30 % and takes no taps; the hall, the buildings, the sites, the discovered network places, the player and the cart stay lit, over a lighter wash (30 %). `mapPanelsStore.networkOnly`; `RouteDimContext` now carries 'none' | 'route' | 'network' and `MapMarker` takes `network`. Not saved: it is off when the app starts.
- **Speed** (`src/perf/networkSheets.test.tsx`, eight buildings each with a badge; this machine, phone ≈ ×4): the markers mount in 11–14 ms; the Network toggle re-renders them in 4–6 ms (≈ 20 ms on a phone); first opens: building 4 ms, site 14–16 ms (it generates the places around the site to say who wants what), cart 5 ms. The first network sheet of a session pays ≈ 45 ms for the shared pieces' first mount.

## Built (prompt 2, step 5): the Network tab as a picture

- **The top is unchanged**: the first-steps checklist until the first chain is done, then the one "Next:" line and its button.
- **The flow picture** (`network/FlowPicture.tsx`, model in `src/game/supply/flow.ts`): buildings on the left, the cart in the middle, places with a live order on the right, each a box with its icon, its name and its key number with its unit ("12 of 36 stored", "wants 30 grain", "wants 20 of anything", "order filled"; the cart "back in 12 min", "parked · loop 42 min" or "no delivery route", with its main cargo as one icon). Lines:
  - **solid, in the route's violet**: the delivery route carries it now; a building on the route to the cart, the cart to a place on the route that one of its buildings feeds;
  - **dashed**: a building makes what a place wants, but the route doesn't join them yet (straight across, under the cart);
  - **dotted stub**: an item nothing joins.
  The style, not only the colour, tells them apart, and a small legend under the picture says what each means. The lines are plain views (the app has no SVG library; adding one would need a new development build).
- **Badges** on the item they concern: a building's one map badge (shared with the markers through `network/NetworkBadge.tsx`), ⏳ on a place in its last day.
- **Taps**: a building opens its sheet on the map; a place centres the map on it (as the order cards do); the cart opens route mode on the current route. Each box's accessibility label says what its lines show in words: "Farm, 12 of 36 stored, goes to the Crooked Mug", "Quarry, …, could go to the Smithy, not on the delivery route yet", "The Crooked Mug, wants 30 grain, gets it from Farm, last day, leaves in 5 h".
- **Up to five a side**, last day first, then soonest to leave; the rest are counted ("+2 more below") and left to the cards.
- **The cards below** are as before, anything in its last day first under "Leaving soonest". A building card now says "12 of 36 stored" (was "12 / 36"), an order card "40% delivered" (was "40%").
- **Wording**: "delivery route" everywhere it was "the cart's route", "the route" or "Set the route", in English and French ("itinéraire de livraison"). The button beside "A stop on the delivery route has left" is now "Edit the delivery route".
- **With nothing built and no order**, the greyed sketch stays as it was.
- **Speed** (`src/perf/networkSheets.test.tsx`, eight buildings; phone ≈ ×4): the picture's first draw 5 ms, a minute tick 5 ms.
- **Usability check**: `usability-network.md` beside this file.
