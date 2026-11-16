# Supply lines (experimental)

**Status: being reshaped** on branch `feat/supply-lines`, following `Claude outputs/supply-network-prompts.md` (steps 0–4 built). The first trial (`Claude outputs/supply-lines-small-prompt.md`) scouted ground and founded camps anywhere; the network replaces that with sites you discover and buildings you put on them. Orders at places, street routes and the guided first chain come next.

The whole feature sits behind **Settings → Developer → "Supply lines (experimental)"**, off by default. With it off, nothing changes or shows, and the simulator's default run doesn't play it. Every number lives in `src/content/supplyLines.ts` (table below). The rules are pure functions in `src/game/supply/`, settled from timestamps when read; nothing runs on a timer except one timeout for the next cart or raid moment while the app is open.

Decided at the trial's step 0 (2026-11-13): danger counts live patrols (option A); the prompt's ambush chances are kept; cart legs may cross open water.

## How it plays

1. Turn the switch on.
2. Tap the map (or your own marker) to open a cell's sheet, and place the **hall** there.
3. **Walk** to sites and places to discover them.
4. **Build** a farm, quarry or herb garden on a discovered site, standing on it. Locals work it slowly; **post a hero** for the full rate.
5. **Plan the cart's route** around danger. Give it a **crew**, start it, and it carries the buildings' stock home loop after loop.
6. **Raids** are announced against a building. Send defenders, empty it, or let it go.

## Places: the six-day rotation

Always on, with or without the switch (decided 2026-11-17; the proposal and its reasoning are in `rotation.md`).

- **Six days:** every place group except fight events lasts 144 h: taverns, shops, chapels, markets, ruins, libraries, thieves' guilds, monster lairs, fishing docks, and the sites to come. Fight events keep their 24 h random phases.
- **Three groups:** each slot belongs to one of three groups, seeded from the group, tile and slot (the seed of its old random phase), so the world stays shared. Group *g* is replaced on day 2*g* of every 6-day cycle, counted in local days from 1 January 2026: every second day a third of the places changes, and two thirds hold.
- **At night, on the phone's clock:** places change at 04:00 local time (`placeRules.changeHourLocal`), so the world is shared within a time zone and moves with daylight saving (`src/game/generation/localDays.ts`). Server time can replace it later.
- **Density, placement, kinds and ids** are unchanged; an id still names its window.
- **The tavern guarantee:** unchanged, a tavern within 800 m of the period's first map position. The personal tavern now lasts a two-day period, until the next group change.
- **Tested** over a seeded year (`src/game/places/rotation.test.ts`), in any time zone: each third of a place's life holds 28–38% of the live places at every sample, and no change hour replaces more than 40%.

## Discovering places

Behind the switch. Only the places the network will trade with are discovered: taverns (the personal tavern too), smithies, apothecaries and markets (`supplyRules.discovery.kinds`); sites join in step 4. Other places look and work as before.

- **Discovered** when you come within a place's interaction range (50 m): live, from each position the map reports (`useDiscovery`), and along walks processed on open (Pocket mode and "app open only"), each fix seeing the places of its own time.
- **Kept** in `save.supply.discovered` (place id → when it leaves), pruned with the other place bookkeeping once the place has gone.
- **Not visited yet:** a 👣 badge on the marker's top-right (and "not visited" in its spoken label), and "Walk here to discover it" at the top of its sheet.
- **Found:** a note on the map names it and what its kind wants ("Discovered: The Rusty Tankard. Taverns want grain and meat."), one note for several at once.
- **Pocket mode** alerts "Something new is nearby" for an undiscovered network place within 150 m of the walk, under the existing "Places nearby" notifications. It never discovers, builds or routes.
- **Cost:** a two-hour processed walk takes about 0.3 s on a laptop: the places around a fix are generated once per tile and local day.

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

## Trades

- **Every hero has a trade** beside their class: Farmer, Quarryman, Herbalist, Teamster or Watchman. It's rolled at even weights from the offer's id for tavern, traveller and secret recruits (so the offer shows what the hero gets), from the hero's id otherwise. The starting trio: Bram Herbalist, Lyra Farmer, Mira Teamster.
- **Level 1 to 3**, by hours spent using it: posted at a matching building (any building for a Watchman), or driving the cart for a Teamster.
- **Where it shows:** offers, the hero sheet and the hero pickers, only while the switch is on.
- **The trial's trades** became network ones in save version 56, keeping their hours: Woodcutter → Herbalist, Trapper → Farmer.

## The hall, sites and buildings

- **The hall:** placed from a cell's sheet and stored as its cell.
  - The first placement is free and doesn't count as a move.
  - After that it moves **twice in any 7 days**. The sheet's button says when the next move comes back once both are used.
  - A move asks first, in a dialog: the moves left this week, when the next one comes back, and how many buildings would end up beyond the tier's reach of it (a warning, not a refusal).
- **Sites** are places of their own (`siteGroup`, kept out of the map's other place groups): six days, the three-group rotation, 0.8 per km² (about 2–3 within 1 km), placed on walkable ground like other places. Only shown while the switch is on.
  - **The guarantee:** if no site is within 800 m of the period's first map position, a personal site appears 300–700 m away for the two-day period, like the personal tavern.
  - **Quality:** 1 to 3 stars (50%, 35%, 15%), drawn from the site's seed and revealed by discovering it.
- **Buildings:** any of three on any discovered site, built in person (within 50 m) for 60 gold and 10 wood. Building resets the site's life: a building lasts six days.

  | Building | Makes, per unit | Base rate per star | Mainly for |
  | --- | --- | --- | --- |
  | Farm | grain 85%, meat 15% | 1.0 / h | Taverns |
  | Quarry | stone | 0.8 / h | Smithies |
  | Herb garden | herbs 50%, berries 30%, mushrooms 20% | 0.8 / h | Apothecaries |

- **Limits by tier:** buildings at once, each within this distance of the hall: tiers 1–2: 3 within 1 km; tier 3: 4 within 1.5 km; tier 4: 5 within 2 km; tier 5: 6 within 2.5 km.
- **Why not:** a build is refused, in this order, for no hall, a site not discovered, one already built, too far from the hall, all buildings placed, not standing there, or the cost. The site's sheet shows the first that blocks every building as a banner and each one's reason under its button.
- **When it leaves:** the cart's calls before that moment still collect; then the stock left is lost, the posted hero is free again, and a raid on it is dropped. The sheet says so in its last day, and the marker gets an hourglass badge.
- **Grain** is a new material, made only by farms. Its use comes with orders (step 5).

## Production and postings

- **Rate:** quality × the building's base rate per hour, at the full rate (guild jobs make 0.3 an hour).
- **Locals** work an empty building at 40% of the rate. Set `localsShare` to 0 and an empty building makes nothing.
- **Posting** a hero runs the building at the full rate.
  - A matching trade (Farmer at a farm, Quarryman at a quarry, Herbalist at a herb garden) adds 25/50/100% by level. Any other trade gets the full rate with no bonus.
  - A posted hero is busy like a hero on a guild job: shown as "Posted", and recalled automatically by any send.
- **Stock** fills up to 12 hours of full output, then stops.
- **Collecting** in person within 100 m moves the stock to the inventory and inspects the building: +25% for 24 hours.
- **Settling:** a building settles in pieces split at every rate change (inspection, closure, expiry), so settling once or often gives the same stock.
- **The sheets** follow the approved mockups (`mockups/SiteSheet.html`, `mockups/BuildingSheet.html`): a "Leaves in …" strip under the header (ember with "LAST DAY" in the last 24 h), the building's flow (worker → goods per hour → stock → cart or you), who works it, its stock and the cart, with one ember button for the next step.
- **The Network tab** lists the hall, each building (stock, time left), the cart and raids. Its full rebuild comes with the first chain.

## The cart and its route

- **One cart** runs loops (hall → route points in order → hall) while a route is set, in straight lines between cell centres.
- **The route planner** is a mode on the map. Tap buildings in order, and any cell as a waypoint. A bottom bar shows the length, loop time and chance of at least one ambush per loop, and crossed cells are tinted by danger.
- **Speed and load:** 3 km/h, or 60% of that with no driver. It carries 20 units. It loads at each building, largest material first, and delivers at the hall.
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
- **Target:** weighted by projected stock at landing × (1 + average danger of the building's cell and its 8 neighbours). No raid if no building will hold stock.
- **Raiders:** the strongest patrol around the building, else one of your tier's medium kinds. They fight as a medium patrol fight, or easy when a Watchman is among the defenders.
- **Announced** 2 hours before landing, or 4/5/6 hours with a Watchman posted at the target. It comes as a notification (its own setting, quiet hours respected), a banner on the Network tab and the building's sheet, and a countdown on its marker.
- **Before it lands:**
  - **Defend:** send up to 3 heroes from the hall at 4 km/h; a party that would arrive too late can't go. The party dialog shows the odds and arrival time.
  - **Empty the building:** collect it in person, or let the cart call first.
  - **Leave it.**
- **When it lands:** the posted hero and the arrived defenders fight.
  - **Won:** nothing is lost, plus the patrol loot roll.
  - **Lost, or nobody there:** the stock is taken, and the building is closed for 6 hours. A posted hero who loses comes home hurt and unposted.
- **Afterwards:** defenders wait for the raid, then walk back as long as they walked out.
- **Settling order:** the cart up to the landing, then the raid, then everything to now, so a cart call before the landing saves its cargo.

## First run

- **One-line tips** queue the first time a building's sheet, the route planner and a raid banner appear. They also land in Field notes. The trial's three first-run cards are gone; the guided first chain replaces them later.

## Save

- **Version 52** adds `save.supply`, fully shaped and empty, and a trade on every hero.
  - The starting trio gets its fixed trades; anyone else rolls from their id.
- **Version 53** removes the trial's scouting and founding (`toV53`):
  - every camp closes and its stock, with the cart's cargo, goes to the inventory;
  - the cart parks with its crew and no route; a pending raid is dropped;
  - the hall keeps its cell, with its last move counted in the new 7-day window;
  - the scouted cells, the packed-up slots and the three first-run tips leave the save.
- **Version 54** follows the six-day rotation (`toV54`): open quests aimed at a place retarget to a live one (progress kept), and the personal tavern is checked again under its two-day period (`personalTavern.day` becomes `period`).
- **Version 55** adds `save.supply.discovered`, empty.
- **Version 56** turns camps into buildings (`toV56`): `supply.camps` becomes an empty `supply.buildings`, route points name buildings, a pending raid is dropped, `personalSite` is added, and the trial's trades become Herbalist and Farmer.
- Renumber all five whenever the branch is brought up to date with main.
- **Types** are in `src/game/supply/types.ts`. **The switch** is a setting, not save data.

## Simulator

- **The flag:** `npm run sim -- --supply-lines` plays the supply lines with a minimal bot (`src/game/sim/supply.ts`) and adds a **Supply lines** section to the report. Without the flag nothing runs, so today's numbers don't move.
- **The bot** places the hall at home and doesn't build yet (step 8), so the cart, postings and raids stay idle and the section reads zero.

## Config (`src/content/supplyLines.ts`)

| Number | Value | What it does |
| --- | --- | --- |
| `trade.levelHours` | 0 / 40 / 120 | Hours of use to reach trade levels 1, 2, 3. |
| `startingTrades` | Bram herbalist, Lyra farmer, Mira teamster | The starting trio's trades. |
| `cellPrecision` | 7 | The geohash grid of the feature. |
| `cellStepMeters` | 35 | Step along a segment when listing the cells it crosses. |
| `hall.movesPerWeek` | 2 | Moves of the hall in any 7 days (the first placement doesn't count). |
| `buildings.limits` | 3/1 km (tiers 1–2), 4/1.5 km, 5/2 km, 6/2.5 km | Buildings at once, each within this distance of the hall. |
| `buildings.cost` / `lifeDays` / `lastDayHours` | 60 gold + 10 wood / 6 / 24 | What building costs, how long a building lasts, when its last day starts. |
| `buildings.kinds` | see the table above | What each building makes, its base rate per star, the place kind it serves. |
| `sites.qualityShares` | 0.5 / 0.35 / 0.15 | Chances of 1, 2 and 3 stars. |
| `sites.guaranteeMeters` / `personal.meters` | 800 / 300–700 | The site guarantee and where a personal site goes. |
| `siteGroup` | 0.8 per km², six days, three groups | How sites spawn. |
| `terrain.samplesPerSide` | 4 | A cell is classified on this many points per side. |
| `terrain.greenShare` | 0.25 | Share of points in green that makes a cell green. |
| `terrain.waterEdgeMeters` | 50 | How close to water still counts as water's edge. |
| `production.localsShare` | 0.4 | Share of the rate locals make with nobody posted (0 works). |
| `production.tradeBonus` | 0.25 / 0.5 / 1.0 | A matching trade's bonus by level. |
| `production.capHours` | 12 | Stock holds this many hours of full output. |
| `production.inspectHours` / `inspectBonus` | 24 / 0.25 | Collecting in person inspects the building: +25% for a day. |
| `production.collectMeters` | 100 | Collect range from the building. |
| `matchingTrade` | farm farmer, quarry quarryman, herb garden herbalist | The trade that raises each building. |
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
| `raids.closedHours` | 6 | A building that lost a raid makes nothing this long. |
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

## Debug (Settings → Developer, Supply lines)

- **Place a site here** with 1, 2 or 3 stars, 20 m north of you.
- **Discover everything in view** (1.2 km): network places and sites.
- **Age the network by two days:** buildings, the cart and raids replay two more days; map places follow the real clock.
- On a site's sheet: **Build free** and **Expire this site now**; on a building's: **Expire now** and the raid button.
- **Place the hall here**, **Show danger levels**.

## From the trial: what I'd build next

1. **Fewer, fairer ambushes first:** lower per-level chances (0 / 0.5 / 2 / 5%) or patrol-free routing. At today's numbers about 40% of loops meet one, which drowns the routing choice.
2. **A raiders' camp to win back stolen cargo:** a temporary place near the raided camp, the stock as its loot. It turns a loss into a goal instead of a tax.
3. **More camp kinds by terrain:** a fishing camp on water's edge, a quarry on built-up ground, so terrain matters beyond timber.
4. **Heroes patrolling cells to lower their danger:** a posting on a cell instead of a camp. It gives the Watchman a second job and makes routes plannable.
5. **Orders from temporary places:** a market or smithy asks for N units by a deadline, delivered by cart. It gives deliveries a destination besides the stock.
6. **A second cart**, once one cart's choices feel right.
7. **Defences:** a palisade or a watchtower bought with materials, to lower a camp's raid weight or announce raids earlier.
8. **If supply lines go ahead,** the guild gathering jobs (woodcutter, forager, trapper, miner, charcoal burner) fold into camps. A camp is the same idea, with richness, a place on the map and risk.
