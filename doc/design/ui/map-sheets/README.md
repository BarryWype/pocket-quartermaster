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
