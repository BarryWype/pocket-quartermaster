# Supply lines (experimental)

**Status: built** (steps 0–6 of `Claude outputs/supply-lines-small-prompt.md`), on branch `feat/supply-lines`. It answers one question: is it fun to scout ground, found camps, draw a cart route around danger and decide who guards what?

The whole feature sits behind **Settings → Developer → "Supply lines (experimental)"**, off by default. With it off, nothing changes or shows, and the simulator's default run doesn't play it. Every number lives in `src/content/supplyLines.ts` (table below). The rules are pure functions in `src/game/supply/` and `src/game/discovery/`, settled from timestamps when read; nothing runs on a timer except one timeout for the next cart or raid moment while the app is open.

Decided at step 0 (2026-11-13): danger counts live patrols (option A); the prompt's ambush chances are kept; the trade names stay even though Woodcutter and Trapper are also guild job names; the starting trio is Bram Woodcutter, Lyra Trapper, Mira Teamster; cart legs may cross open water.

## How it plays

1. Turn the switch on. Three cards wait on the map: place the hall, walk to scout, found a camp where you stand.
2. Tap the map (or your own marker) to open a cell's sheet, and place the **hall** there.
3. **Walk.** Every cell you cross is scouted: zoomed in, it shows its richness as dots.
4. Stand on good ground and **found a camp** from your cell's sheet. Locals work it slowly; **post a hero** for the full rate.
5. **Plan the cart's route** on the map, around danger. Give it a **crew**, start it, and it carries the camps' stock home loop after loop.
6. **Raids** are announced against a camp. Send defenders, empty it, or let it go.

## Cells and terrain

- **One grid, geohash precision 7:** 153 m north–south, 115 m east–west at Wellington. It is the grid of animal and herb spawns, and sits inside the patrol tiles (precision 6) and place tiles (precision 5). Precision 6 is too coarse to route around anything; precision 8 is finer than the 35 m GPS accuracy Pocket mode accepts.
- **Cells along a path** come from stepping a straight segment every 35 m (`cellsAlong`).
- **Terrain** comes from the zoom 14 vector tiles spawn placement already decodes (never what the map renders). The decode keeps one more polygon list, `green`: landcover wood, grass, wetland and farmland except private gardens; landuse cemetery and playground; park polygons.
- **Classification:** a 4 × 4 grid of points per cell, each looked up in its own map tile, then in this order:
  1. **Open water:** every point in water. No terrain; nothing can be founded there.
  2. **Green:** at least a quarter of the points in green areas.
  3. **Water's edge:** any point in or within 50 m of water.
  4. **Built-up:** the rest.
- **Unknown terrain:** while a tile loads or can't be fetched, the terrain is unknown and founding is refused. A camp stores its terrain when founded, so production never needs tiles.
- **Measured** around the Wellington fixture, across its 3 × 3 block of zoom 14 tiles: 912 land cells, of which 31% are green, 24% water's edge and 45% built-up (the fixture tile alone is mostly harbour). Classifying a cell costs well under a millisecond; terrain is computed lazily per cell and cached.

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

## Trades

- **Every hero has a trade** beside their class: Woodcutter, Trapper, Teamster or Watchman. It's rolled at even weights from the offer's id for tavern, traveller and secret recruits (so the offer shows what the hero gets), from the hero's id otherwise. The starting trio is fixed.
- **Level 1 to 3**, by hours spent using it: posted at a matching camp (any camp for a Watchman), or driving the cart for a Teamster. A level-up applies from the next settle.
- **Where it shows:** offers, the hero sheet and the hero pickers, only while the switch is on.
- **Guild jobs** are untouched.

## The hall, scouting and camps

- **The hall:** placed from a cell's sheet and stored as its cell.
  - The first move is free; after that, once a week.
  - A move is refused while a camp would end up more than 2 km away.
- **Scouting:** a cell is scouted when your path crosses it.
  - Covered: live GPS while the app is open, and walks from Pocket mode and "app open only" (the same walk segments the step counter accepts, processed on open).
  - Only while the switch is on.
  - The set is stored compactly (by precision 5 prefix and period, 2 characters per cell): a few KB for a year of walking. Its functions are general, for a future fog of war.
- **Richness:** 0 to 3 per resource the terrain allows, rolled from cell, resource and the 3-week period, so it's the same for every player.
  - Timber grows only on green cells; game grows everywhere, poorest in built-up cells.
  - Only scouted cells show theirs. A cell last walked in an earlier period shows that period's values greyed.
- **Camps:** a timber camp (green only, makes wood) or a trapper's camp (any land cell, makes meat, hide and bone).
  - Founding needs you standing in the cell, the hall within 2 km, and 50 gold and 10 wood.
  - At most 3 camps, counting packed-up slots still cooling down. One camp per cell.
- **Packing up** works from anywhere, loses the stock, and frees the slot after 6 hours.

## Production and postings

- **Rate:** richness × base rate per hour, at the full rate.
  - Timber: 1.0 wood per richness point.
  - Trapper's camp: 0.8 units per point, rolled with the trapper job's weights (meat 45, hide 35, bone 20).
  - Guild jobs make 0.3 an hour.
- **Locals** work an empty camp at 40% of the rate. Set `localsShare` to 0 and an empty camp makes nothing.
- **Posting** a hero runs the camp at the full rate.
  - A matching trade (Woodcutter at timber, Trapper at a trapper's camp) adds 25/50/100% by level. Any other trade gets the full rate with no bonus.
  - A posted hero is busy like a hero on a guild job: shown as "Posted", and recalled automatically by any send.
- **Stock** fills up to 12 hours of full output, then stops.
- **Collecting** in person within 100 m moves the stock to the inventory and inspects the camp: +25% for 24 hours.
- **Settling:** a camp settles in pieces split at every rate change (inspection, closure, period), so settling once or often gives the same stock.
- **The Network tab** (Expeditions screen) shows the hall, each camp's line of numbers, the cart and raids. Its badge and the menu's count camps at their cap.

## The cart and its route

- **One cart** runs loops (hall → route points in order → hall) while a route is set, in straight lines between cell centres.
- **The route planner** is a mode on the map. Tap camps in order, and scouted cells as waypoints. A bottom bar shows the length, loop time and chance of at least one ambush per loop, and crossed cells are tinted by danger. Unscouted cells count as level 2.
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

- **Three cards on switch-on:** the hall, scouting and camps. They go through the game's tip queue, shown one at a time on the map.
- **One-line tips** queue the first time a camp's sheet, the route planner and a raid banner appear. All six also land in Field notes.

## Save

- **Version 52** adds `save.supply`, fully shaped and empty, and a trade on every hero.
  - The starting trio gets its fixed trades; anyone else rolls from their id.
  - Renumber it whenever the branch is brought up to date with main.
- **No other bump:** later steps only changed shapes that existing saves hold as null (the cart's loop, the raid).
- **Types** are in `src/game/supply/types.ts`.
- **The switch** is a setting, not save data.

## Simulator

- **The flag:** `npm run sim -- --supply-lines` plays the supply lines with a minimal bot (`src/game/sim/supply.ts`) and adds a **Supply lines** section to the report. Without the flag nothing runs, so today's numbers don't move.
- **The bot:**
  - places the hall at home and scouts a triangle loop as long as the profile's walks;
  - founds a camp on the richest free cell of each walk;
  - defends an announced raid when its odds reach the profile's threshold;
  - at the day's last session, sends the cart round every camp (nearest first) with one spare escort, then posts the heroes still home, recalling them and stopping the cart the next morning.
- **Terrain:** the sim has no map tiles, so terrain is drawn per cell at the measured Wellington shares.
- **The section:** cart deliveries per day against walking (wood, meat, hide and bone), camps, ambushes and raids per week by outcome, and hero-hours posted and on the cart.
- **A first 10-day regular run** (a test, not the report):
  - 3 camps; the cart delivered about 35 units a day against roughly 40 of the same materials walked;
  - about 4 ambushes a day, nearly all with nobody aboard;
  - raids landed on camps nobody guarded during the day.

## Config (`src/content/supplyLines.ts`)

| Number | Value | What it does |
| --- | --- | --- |
| `trade.levelHours` | 0 / 40 / 120 | Hours of use to reach trade levels 1, 2, 3. |
| `startingTrades` | Bram woodcutter, Lyra trapper, Mira teamster | The starting trio's trades. |
| `cellPrecision` | 7 | The geohash grid of the feature. |
| `periodWeeks` | 3 | Richness rerolls each period. |
| `scoutStepMeters` | 35 | Step along a path when collecting the cells it crosses. |
| `hall.moveEveryDays` | 7 | The hall moves at most once this often (the first move is free). |
| `camps.max` | 3 | Camps at once, counting packed-up slots cooling down. |
| `camps.maxHallMeters` | 2000 | Camps must be within this distance of the hall. |
| `camps.foundCost` | 50 gold, 10 wood | What founding costs. |
| `camps.packUpCooldownHours` | 6 | A packed-up slot frees after this long. |
| `terrain.samplesPerSide` | 4 | A cell is classified on this many points per side. |
| `terrain.greenShare` | 0.25 | Share of points in green that makes a cell green. |
| `terrain.waterEdgeMeters` | 50 | How close to water still counts as water's edge. |
| `richness` | timber on green 0.40/0.35/0.18/0.07; game on green the same, water's edge 0.45/0.35/0.15/0.05, built-up 0.60/0.30/0.08/0.02 | Weights of richness 0–3 per resource and terrain. |
| `production.baseRate` | timber 1.0, trapper 0.8 | Units per hour per richness point at the full rate. |
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
| `danger.unscoutedLevel` | 2 | The level an unscouted cell counts as. |
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
- **Sim terrain** is drawn at measured shares; the sim's walk is a triangle loop.
- **`supply.seen`** is unused: the cards and tips use the game's tip queue instead.

## What I'd build next

1. **Fewer, fairer ambushes first:** lower per-level chances (0 / 0.5 / 2 / 5%) or patrol-free routing. At today's numbers about 40% of loops meet one, which drowns the routing choice.
2. **A raiders' camp to win back stolen cargo:** a temporary place near the raided camp, the stock as its loot. It turns a loss into a goal instead of a tax.
3. **More camp kinds by terrain:** a fishing camp on water's edge, a quarry on built-up ground, so terrain matters beyond timber.
4. **Heroes patrolling cells to lower their danger:** a posting on a cell instead of a camp. It gives the Watchman a second job and makes routes plannable.
5. **Orders from temporary places:** a market or smithy asks for N units by a deadline, delivered by cart. It gives deliveries a destination besides the stock.
6. **A second cart**, once one cart's choices feel right.
7. **Defences:** a palisade or a watchtower bought with materials, to lower a camp's raid weight or announce raids earlier.
8. **If supply lines go ahead,** the guild gathering jobs (woodcutter, forager, trapper, miner, charcoal burner) fold into camps. A camp is the same idea, with richness, a place on the map and risk.
