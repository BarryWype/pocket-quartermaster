# Supply lines (experimental)

**Status: being reshaped** on branch `feat/supply-lines`. The first trial (steps 0–6 of `Claude outputs/supply-lines-small-prompt.md`) scouted ground and founded camps anywhere. Step 0 of `Claude outputs/supply-network-prompts.md` removed the scouting grid, richness, founding on any cell and packing up: camps, postings, the cart and raids stay, waiting for the sites and buildings of the next steps. Nothing in the game creates a camp until then.

The whole feature sits behind **Settings → Developer → "Supply lines (experimental)"**, off by default. With it off, nothing changes or shows, and the simulator's default run doesn't play it. Every number lives in `src/content/supplyLines.ts` (table below). The rules are pure functions in `src/game/supply/`, settled from timestamps when read; nothing runs on a timer except one timeout for the next cart or raid moment while the app is open.

Decided at step 0 (2026-11-13): danger counts live patrols (option A); the prompt's ambush chances are kept; the trade names stay even though Woodcutter and Trapper are also guild job names; the starting trio is Bram Woodcutter, Lyra Trapper, Mira Teamster; cart legs may cross open water.

## How it plays

1. Turn the switch on.
2. Tap the map (or your own marker) to open a cell's sheet, and place the **hall** there.
3. Camps (made by buildings on sites, in a later step) produce over time. Locals work them slowly; **post a hero** for the full rate.
4. **Plan the cart's route** on the map, around danger. Give it a **crew**, start it, and it carries the camps' stock home loop after loop.
5. **Raids** are announced against a camp. Send defenders, empty it, or let it go.

## Cells and terrain

- **One grid, geohash precision 7:** 153 m north–south, 115 m east–west at Wellington. It is the grid of animal and herb spawns, and sits inside the patrol tiles (precision 6) and place tiles (precision 5). Danger is scored per cell, and the cart's route crosses cells.
- **Cells along a path** come from stepping a straight segment every 35 m (`cellsAlong`).
- **Terrain** comes from the zoom 14 vector tiles spawn placement already decodes (never what the map renders): open water, green, water's edge or built-up, from a 4 × 4 grid of points per cell. Today it only names a cell on its sheet.

## Danger

- **Score** of a cell at a time, from what the world already generates:
  - each patrol (not travellers, not beaten) whose track during the current 30-minute window comes within 150 m of the cell's centre: easy 1, medium 2, hard 3;
  - each live fight event within 300 m: its difficulty's weight;
  - each live lair within 500 m: 3.
- **Levels:** score 0 → level 0, 1–2 → 1, 3–4 → 2, 5 and over → 3.
- **Ambush chance per crossing:** 0%, 2%, 5% and 10% by level.
- **Shared world:** positions and difficulties are the same for every player. Only the patrol kind (by tier), beaten patrols and used places differ, which is where patrols already differ.
- **Measured** around Wellington at tier 1: 46% of cells at level 0, 25% level 1, 21% level 2, 8% level 3.
- **How often it changes:** the patrol part every 30 minutes, fight events daily per slot, lairs every 72 hours.
- **Cost:** a 20-cell route costs a few ms; tints are computed off the first frame and cached per window.

eady generates:
  - each patrol (not travellers, not beaten) whose track during the current 30-minute window comes within 150 m of the cell's centre: easy 1, medium 2, hard 3;
  - each live fight event within 300 m: its difficulty's weight;
  - each live lair within 500 m: 3.
- **Levels:** score 0 → level 0, 1–2 → 1, 3–4 → 2, 5 and over → 3.
- **Ambush chance per crossing:** 0%, 2%, 5% and 10% by level.
- **Shared world:** positions and difficulties are the same for every player. Only the patrol kind (by tier), beaten patrols and used places differ, which is where patrols already differ.

## The hall and camps

- **The hall:** placed from a cell's sheet and stored as its cell.
  - The first placement is free and doesn't count as a move.
  - After that it moves **twice in any 7 days**. The sheet's button says when the next move comes back once both are used.
  - A move asks first, in a dialog: the moves left this week, when the next one comes back, and how many camps would end up more than 2 km away, out of the hall's reach (a warning, not a refusal).
- **Camps:** a timber camp (makes wood) or a trapper's camp (makes meat, hide and bone), each with a **quality** of 1 to 3 stars. Nothing creates them in this step: buildings on sites will.

## Production and postings

- **Rate:** quality × base rate per hour, at the full rate.
  - Timber: 1.0 wood per star.
  - Trapper's camp: 0.8 units per star, rolled with the trapper job's weights (meat 45, hide 35, bone 20).
  - Guild jobs make 0.3 an hour.
- **Locals** work an empty camp at 40% of the rate. Set `localsShare` to 0 and an empty camp makes nothing.
- **Posting** a hero runs the camp at the full rate.
  - A matching trade (Woodcutter at timber, Trapper at a trapper's camp) adds 25/50/100% by level. Any other trade gets the full rate with no bonus.
  - A posted hero is busy like a hero on a guild job: shown as "Posted", and recalled automatically by any send.
- **Stock** fills up to 12 hours of full output, then stops.
- **Collecting** in person within 100 m moves the stock to the inventory and inspects the camp: +25% for 24 hours.
- **Settling:** a camp settles in pieces split at every rate change (inspection, closure), so settling once or often gives the same stock.
- **The Network tab** (Expeditions screen) shows the hall, each camp's line of numbers, the cart and raids. Its badge and the menu's count camps at their cap.

## The cart and its route

- **One cart** runs loops (hall → route points in order → hall) while a route is set, in straight lines between cell centres.
- **The route planner** is a mode on the map. Tap camps in order, and any cell as a waypoint. A bottom bar shows the length, loop time and chance of at least one ambush per loop, and crossed cells are tinted by danger.
- **Speed and load:** 3 km/h, or 60% of that with no driver. It carries 20 units. It loads at each camp, largest material first, and delivers at the hall.
  - A Teamster driving adds 15/30/50% speed and 25/50/100% capacity.
- **Crew:** a driver and up to two escorts. They are away during a loop, and the crew can only change while the cart is parked.
- **Ambushes:** at departure, each distinct crossed cell rolls its level's chance once, seeded by loop and cell, at the danger of the window it's crossed in.
  - The ambusher is the strongest patrol touching the cell then. With none, a patrol of your tier at the level's difficulty.
  - The fights are played out at departure with the patrol fight simulation, so the whole loop is fixed when it starts.
  - **Won:** the cart goes on, and damage, consumables and loot are applied at home.
  - **Lost, or nobody aboard:** the cargo is lost, and the cart is back empty 30 minutes later.
- **Back home:** a crew member under half HP parks the cart until you start it again.
- **Changes:** a route changed mid-loop applies from the next departure; Stop parks the cart after the current loop.
- **Offline time:** opening the app after hours replays every loop in between, in one pass; 8 hours take about 30 ms.
- **On the map:** the route line, the cart moving on the map's slow clock, a toast for an ambush, and the last ten loops on the cart's sheet.

## Raids

- **The daily roll:** on each day the app is opened, one roll (50%) decides whether a raid lands later that day.
  - Never announced in the past, and nothing announced in the first 2 hours after an absence of 2 days or more.
  - At most one a day.
- **Target:** weighted by projected stock at landing × (1 + average danger of the camp's cell and its 8 neighbours). No raid if no camp will hold stock.
- **Raiders:** the strongest patrol around the camp, else one of your tier's medium kinds. They fight as a medium patrol fight, or easy when a Watchman is among the defenders.
- **Announced** 2 hours before landing, or 4/5/6 hours with a Watchman posted at the target. It comes as a notification (its own setting, quiet hours respected), a banner on the Network tab and the camp sheet, and a countdown on the camp's marker.
- **Before it lands:**
  - **Defend:** send up to 3 heroes from the hall at 4 km/h; a party that would arrive too late can't go. The party dialog shows the odds and arrival time.
  - **Empty the camp:** collect it in person, or let the cart call first.
  - **Leave it.**
- **When it lands:** the posted hero and the arrived defenders fight.
  - **Won:** nothing is lost, plus the patrol loot roll.
  - **Lost, or nobody there:** the stock is taken, and the camp is closed for 6 hours. A posted hero who loses comes home hurt and unposted.
- **Afterwards:** defenders wait for the raid, then walk back as long as they walked out.
- **Settling order:** the cart up to the landing, then the raid, then everything to now, so a cart call before the landing saves its cargo.

## First run

- **One-line tips** queue the first time a camp's sheet, the route planner and a raid banner appear. They also land in Field notes. The trial's three first-run cards are gone; the guided first chain replaces them later.

## Save

- **Version 52** adds `save.supply`, fully shaped and empty, and a trade on every hero.
  - The starting trio gets its fixed trades; anyone else rolls from their id.
- **Version 53** removes the trial's scouting and founding (`toV53`):
  - every camp closes and its stock, with the cart's cargo, goes to the inventory;
  - the cart parks with its crew and no route; a pending raid is dropped;
  - the hall keeps its cell, with its last move counted in the new 7-day window;
  - the scouted cells, the packed-up slots and the three first-run tips leave the save.
- Renumber both whenever the branch is brought up to date with main.
- **Types** are in `src/game/supply/types.ts`. **The switch** is a setting, not save data.

## Simulator

- **The flag:** `npm run sim -- --supply-lines` plays the supply lines with a minimal bot (`src/game/sim/supply.ts`) and adds a **Supply lines** section to the report. Without the flag nothing runs, so today's numbers don't move.
- **The bot** places the hall at home. With no way to make camps in this step, the cart, postings and raids stay idle and the section reads zero until sites and buildings land.

## Config (`src/content/supplyLines.ts`)

| Number | Value | What it does |
| --- | --- | --- |
| `trade.levelHours` | 0 / 40 / 120 | Hours of use to reach trade levels 1, 2, 3. |
| `startingTrades` | Bram woodcutter, Lyra trapper, Mira teamster | The starting trio's trades. |
| `cellPrecision` | 7 | The geohash grid of the feature. |
| `cellStepMeters` | 35 | Step along a segment when listing the cells it crosses. |
| `hall.movesPerWeek` | 2 | Moves of the hall in any 7 days (the first placement doesn't count). |
| `camps.maxHallMeters` | 2000 | A move warns about camps farther than this from the new hall. |
| `terrain.samplesPerSide` | 4 | A cell is classified on this many points per side. |
| `terrain.greenShare` | 0.25 | Share of points in green that makes a cell green. |
| `terrain.waterEdgeMeters` | 50 | How close to water still counts as water's edge. |
| `production.baseRate` | timber 1.0, trapper 0.8 | Units per hour per quality star at the full rate. |
| `production.localsShare` | 0.4 | Share of the rate locals make with nobody posted (0 works). |
| `production.tradeBonus` | 0.25 / 0.5 / 1.0 | A matching trade's bonus by level. |
| `production.capHours` | 12 | Stock holds this many hours of full output. |
| `production.inspectHours` / `inspectBonus` | 24 / 0.25 | Collecting in person inspects the camp: +25% for a day. |
| `production.collectMeters` | 100 | Collect range from the camp cell's centre. |
| `matchingTrade` | timber woodcutter, trapper trapper | The trade that raises each camp kind. |
| `cart.speedKmh` | 3 | The cart's speed with a driver. |
| `cart.noDriverSpeed` | 0.6 | Share of the speed with nobody driving. |
| `cart.capacity` | 20 | Units the cart carries. |
| `cart.maxEscorts` | 2 | Escorts beside the driver. |
| `cart.teamster.speed` / `.capacity` | 0.15/0.3/0.5, 0.25/0.5/1.0 | A Teamster driver's bonuses by level. |
| `cart.lostReturnMinutes` | 30 | An emptied cart is home this long after a lost ambush. |
| `cart.minCrewHpShare` | 0.5 | A crew member under this share of HP parks the cart. |
| `cart.logSize` | 10 | Loops kept in the log. |
| `danger.patrolMeters` | 150 | A patrol's track this close to a cell's centre counts. |
| `danger.eventMeters` | 300 | Fight events this close count. |
| `danger.lairMeters` / `lairWeight` | 500 / 3 | Lairs this close add this much. |
| `danger.weights` | easy 1, medium 2, hard 3 | Score per difficulty. |
| `danger.levelFrom` | 1 / 3 / 5 | Scores where levels 1, 2, 3 start. |
| `danger.ambushChance` | 0 / 0.02 / 0.05 / 0.10 | Ambush chance per crossing by level. |
| `danger.trackStepMinutes` | 2 | A patrol's track is sampled this often. |
| `raids.dailyChance` | 0.5 | Chance of a raid on a day the app is opened. |
| `raids.announceHours` | 2 | Lead between announcement and landing. |
| `raids.watchmanAnnounceHours` | 4 / 5 / 6 | The lead with a Watchman posted, by level. |
| `raids.awayDays` / `returnQuietHours` | 2 / 2 | After 2 days away, nothing is announced for 2 hours. |
| `raids.closedHours` | 6 | A camp that lost a raid makes nothing this long. |
| `raids.maxDefenders` | 3 | Heroes you can send, on top of the posted one. |
| `raids.walkKmh` | 4 | Defenders' walking speed. |

## What was simplified

- **No energy** for posted heroes or crew, and no travel time to post or recall.
- **Crew can only change while the cart is parked.** Crew and defenders can't be recalled by a send; they are away.
- **Patrol danger reshuffles every 30 minutes**, so routes can only really plan around fight events and lairs.
- **Ambushes, raids and their fights are decided early:** ambushes when the loop departs, the raid's target and raiders when its day is rolled.
- **Trade levels** apply from the settle that crosses the threshold.
- **The danger tint** for a route uses the current window; the ambush roll uses the crossing window.
- **Raid announcements** move with a Watchman posted at the target; the day itself is rolled only once.
- **Open water:** cart legs may cross it.
- **Out of reach** after a hall move is only a warning for now; buildings give it a consequence later.
- **`supply.seen`** is unused: the tips use the game's tip queue instead.

## What I'd build next

1. **Fewer, fairer ambushes first:** lower per-level chances (0 / 0.5 / 2 / 5%) or patrol-free routing. At today's numbers about 40% of loops meet one, which drowns the routing choice.
2. **A raiders' camp to win back stolen cargo:** a temporary place near the raided camp, the stock as its loot. It turns a loss into a goal instead of a tax.
3. **More camp kinds by terrain:** a fishing camp on water's edge, a quarry on built-up ground, so terrain matters beyond timber.
4. **Heroes patrolling cells to lower their danger:** a posting on a cell instead of a camp. It gives the Watchman a second job and makes routes plannable.
5. **Orders from temporary places:** a market or smithy asks for N units by a deadline, delivered by cart. It gives deliveries a destination besides the stock.
6. **A second cart**, once one cart's choices feel right.
7. **Defences:** a palisade or a watchtower bought with materials, to lower a camp's raid weight or announce raids earlier.
8. **If supply lines go ahead,** the guild gathering jobs (woodcutter, forager, trapper, miner, charcoal burner) fold into camps. A camp is the same idea, with richness, a place on the map and risk.
