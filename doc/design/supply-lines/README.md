# Supply network

**Status: part of the main game** on branch `feat/supply-lines`, following `Claude outputs/supply-network-prompts.md` (prompt 1, steps 0–8, and prompt 2, steps 1–3, built). The first trial (`Claude outputs/supply-lines-small-prompt.md`) scouted ground and founded camps anywhere; the network replaces that with sites you discover and buildings you put on them. A short page for new players is in `how-to-play.md`.

The network is on for everyone and opens at tier 2 (prompt 2 step 3, `on-for-everyone.md`); the developer switch is gone, and every simulator run plays it. Every number lives in `src/content/supplyLines.ts` (table below). The rules are pure functions in `src/game/supply/`, settled from timestamps when read; nothing runs on a timer except one timeout for the next cart or raid moment while the app is open.

Decided at the trial's step 0 (2026-11-13): danger counts live patrols (option A); the prompt's ambush chances are kept; cart legs may cross open water.

## How it plays

1. The network opens at tier 2. The Network tab's first chain leads the way.
2. Tap the map (or your own marker) to open a cell's sheet, and place the **hall** there.
3. **Walk** to sites and places to discover them.
4. **Build** a farm, quarry or herb garden on a discovered site, standing on it. Locals work it slowly; **post a hero** for the full rate.
5. **Serve orders:** taverns, smithies, apothecaries and markets want what buildings make, and pay for it.
6. **Plan the cart's route** through buildings and places along the streets. Give it a **crew**, start it, and it carries goods loop after loop.
7. **Raids** are announced against a building. Send defenders, empty it, or let it go.

## Unlock and the first chain

- **Unlock:** the network opens at **tier 2** through the reveal (`network`, a tier reveal like rarer places and Sanctums), with its reveal card. Before that nothing of it shows or runs. `networkUnlocked` (`src/game/supply/unlock.ts`, `useSupplyOn` in components) gates every screen, hook and background read. Debug: "Unlock the network on this save".
- **The first chain** (`src/game/supply/firstChain.ts`): place your hall; walk to a site; build a farm; walk to a tavern; set the cart's route (a building and a place); make your first delivery. One line is lit at a time on the Network tab, with one button that takes you there (your cell's sheet, or the map centred on the nearest site, the site to build on, the nearest tavern, the planner with your stops picked, the nearest order). Steps advance as soon as their condition holds, several at once if need be. At the end: 75 gold and a note on the map, once.

## The Network tab

Rebuilt after `mockups/NetworkTab.html`:

- **What next:** the first chain's checklist until it's done, then one line and one button for the most useful next step. In order: answer a raid, place the hall, discover a site, build on a free site, find a place that wants what you make, set a route, give the cart a driver, post a hero, claim a reward. With nothing to do: "Your network runs on its own."
- **The flow picture:** buildings (stock, FULL, ⏳) → the cart (load, destination) → places (order %, ✓, ⏳), three per column then "+n"; greyed when empty.
- **Cards:** leaving soonest first, then buildings, places, the cart, the hall's moves left, and the route warning when a stop has left.
- **Buttons centre the map** on a place or site rather than opening its sheet from the tab: the tab regenerates places without the map's snapping, so their sheet is opened from the marker.

## Places: the six-day rotation

Always on (decided 2026-11-17; the proposal and its reasoning are in `rotation.md`).

- **Six days:** every place group except fight events lasts 144 h: taverns, shops, chapels, markets, ruins, libraries, thieves' guilds, monster lairs, fishing docks, and the sites to come. Fight events keep their 24 h random phases.
- **Three groups:** each slot belongs to one of three groups, seeded from the group, tile and slot (the seed of its old random phase), so the world stays shared. Group *g* is replaced on day 2*g* of every 6-day cycle, counted in local days from 1 January 2026: every second day a third of the places changes, and two thirds hold.
- **At night, on the phone's clock:** places change at 04:00 local time (`placeRules.changeHourLocal`), so the world is shared within a time zone and moves with daylight saving (`src/game/generation/localDays.ts`). Server time can replace it later.
- **Density, placement, kinds and ids** are unchanged; an id still names its window.
- **The tavern guarantee:** unchanged, a tavern within 800 m of the period's first map position. The personal tavern now lasts a two-day period, until the next group change.
- **Tested** over a seeded year (`src/game/places/rotation.test.ts`), in any time zone: each third of a place's life holds 28–38% of the live places at every sample, and no change hour replaces more than 40%.

## Discovering places

Only the places the network will trade with are discovered: taverns (the personal tavern too), smithies, apothecaries and markets (`supplyRules.discovery.kinds`); sites join in step 4. Other places look and work as before.

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

- **Every hero has a trade** beside their class: Farmer, Herbalist, Woodcutter, Hunter, Miner, Teamster or Watchman. It's rolled at even weights from the offer's id for tavern, traveller and secret recruits (so the offer shows what the hero gets), from the hero's id otherwise. The starting trio: Bram Herbalist, Lyra Farmer, Mira Teamster.
- **Level 1 to 3**, by hours spent using it: posted at a matching building (any building for a Watchman), or driving the cart for a Teamster.
- **Where it shows:** offers, the hero sheet and the hero pickers, once the network is open.
- **Older trades** were mapped, keeping their hours: the trial's Woodcutter → Herbalist and Trapper → Farmer (version 56), then Quarryman → Miner (version 60).

## The hall, sites and buildings

- **The hall:** placed from a cell's sheet and stored as its cell.
  - The first placement is free and doesn't count as a move.
  - After that it moves **twice in any 7 days**. The sheet's button says when the next move comes back once both are used.
  - A move asks first, in a dialog: the moves left this week, when the next one comes back, and how many buildings would end up beyond the tier's reach of it (a warning, not a refusal).
- **Sites** are places of their own (`siteGroup`, kept out of the map's other place groups): six days, the three-group rotation, 0.8 per km² (about 2–3 within 1 km), placed on walkable ground like other places. Only shown once the network is open.
  - **The guarantee:** if no site is within 800 m of the period's first map position, a personal site appears 300–700 m away for the two-day period, like the personal tavern.
  - **Quality:** 1 to 3 stars (50%, 35%, 15%), drawn from the site's seed and revealed by discovering it.
- **Buildings:** any of three on any discovered site, built in person (within 50 m) for 10 wood and 60 gold (90, 140, 200 at tiers 3–5). Building resets the site's life: a building lasts six days.

  | Building | Makes, per unit | Base rate per star | Mainly for | Opens at | Trade |
  | --- | --- | --- | --- | --- | --- |
  | Farm | grain 85%, meat 15% | 1.0 / h | Taverns | tier 2 | Farmer |
  | Herb garden | herbs 50%, berries 30%, mushrooms 20% | 0.8 / h | Apothecaries | tier 2 | Herbalist |
  | Quarry | stone | 0.8 / h | Smithies | tier 2 | Miner |
  | Lumber camp | wood | 1.0 / h | your workshop | tier 2 | Woodcutter |
  | Hunting camp | meat 45%, hide 35%, bone 20% | 0.8 / h | your workshop | tier 2 | Hunter |
  | Copper mine | copper | 0.6 / h | your workshop | tier 3 | Miner |
  | Iron mine | iron | 0.5 / h | your workshop | tier 4 | Miner |
  | Charcoal kiln | coal | 0.4 / h | your workshop | tier 5 | Woodcutter |

  Dearer ores come slower, so each building's gold per hour stays close. Goods "for your workshop" go home, or to markets, which take every good. A save unlocked before tier 2 (debug) builds as at tier 2.

- **Limits by tier:** buildings at once, each within this distance of the hall: tiers 1–2: 3 within 1 km; tier 3: 4 within 1.5 km; tier 4: 5 within 2 km; tier 5: 6 within 2.5 km.
- **Why not:** a build is refused, in this order, for no hall, a site not discovered, one already built, too far from the hall, all buildings placed, not standing there, or the cost. The site's sheet shows the first that blocks every building as a banner and each one's reason under its button.
- **When it leaves:** the cart's calls before that moment still collect; then the stock left is lost, the posted hero is free again, and a raid on it is dropped. The sheet says so in its last day, and the marker gets an hourglass badge.
- **Grain** is a new material, made only by farms, wanted by taverns and markets.

## Orders

The full proposal, approved as written on 2026-11-17, is `orders.md`.

- **One order per discovered tavern, smithy, apothecary and market**, made at discovery (seeded from the place and you) and kept in `save.supply.orders` until the place leaves.
- **Wants:** taverns grain and meat, smithies stone, apothecaries herbs and berries, markets any network good. **Size:** one average building (1.65 stars) at 60% of its full rate fills it in 3.5 days, ±20% (a tavern wants about 70 grain and 12 meat).
- **Gold per unit delivered:** 1.25 × the shop price, fractions carried on the order.
- **Steps** at 25%, 50% and 100%: gold (×1 at tiers 1–2, ×1.5, ×2, ×3 at tiers 3–5), then meals you can cook (taverns), your tier's ore (smithies) or your best healing potion (apothecaries), then gold and the **headline**.
- **Headlines, found nowhere else:** Banquet roast, Wayfarer's feast and Stormbread (meals); Phoenix, Giant's and Sage's draughts (potions), or one time in five a Rare flask weapon (apothecaries); a Rare piece of a type your heroes wear (smithies); any of these (markets). A new order avoids the headlines of your other live orders of that kind.
- **Deliver from my bag** within 50 m hands over every wanted good you carry, up to the need, with a preview of the goods and gold first. Cart deliveries come with step 7.
- **Claim** each reached step with a tap; the rewards show in the loot grid. When the place leaves, reached steps not claimed are paid automatically; the rest is lost.
- **The day before** a place leaves with its order 25–99% filled: one notification, "Leaves tomorrow: Smithy", in the Orders setting (shown once the network is open).
- **Grain's use** is delivering: wanted goods carry a "Deliver" use on their item card.
- **On screen:** the order sits at the top of the place's sheet (`OrderSection`, after the approved mockup); the Network tab lists live orders by time left.

## Time made visible

After the approved map mockup (`mockups/MapNetwork.html`).

- **The time ring:** a diamond outline around every temporary marker (places, taverns, the personal ones, replacement ruins, secret places, sites and buildings) that drains clockwise from its top over the marker's life: a faint track, the time left in brass. In the last 24 hours it turns ember **and** gains an hourglass badge, and the spoken label adds "last day". Fight events keep only their difficulty ring; a monster lair shows its difficulty ring inside and the time ring outside.
- **Built with views,** no new native code: `TimeRing` sits beside `DifficultyRing` in `src/components/ui/DifficultyRing.tsx`, and `DifficultyRing` takes an optional `time`. The share left moves in 1/48 steps (`timeLeftShare`), on the map's existing slow clock, so markers stay memoised between steps.
- **A timer in every temporary sheet:** the "Leaves in …" strip under the header (ember, with "LAST DAY", in the last day) on places, taverns, monster lairs, sites and buildings, once per sheet.
- **The Network tab** puts a "Leaving soonest" section first whenever a building or an order is in its last day.

## What the network replaced

Prompt 2, step 1 (proposal approved as written in `replacements.md`).

- **The six material shops left the map:** sawmills, quarries, copper and iron mines, coal pits and hunting lodges. The fishing dock stays.
  - The market still sells every material (ores up to your pickaxe) and now buys monster parts, with the apothecary.
  - The "mine" quest left the pool; mine tiers and locked mines went; the tier ore table moved to content (`tierOres`).
  - **Strong ale** (the Ogre Chieftain's weakness) is sold at the market and given at tavern orders' 50% step while the boss is unlocked and unbeaten.
- **The guild gathering jobs left:** woodcutter, forager, trapper, miner and charcoal burner, with their work tools (hatchet, sickle, snare, mining pick, tongs) and the tools' scavenging.
  - The **outdoor gatherer stays**: the Expeditions tab "Jobs" is now "Gatherer".
  - The job engine stays generic (energy cycles, output), with the gatherer its only job.
- **Hand gathering is untouched.** The simulator's supply section compares, by tier, what the bot's buildings make with what its walks gather of the same goods; a band test wants at least 1.5× at tier 2 and a ratio that never falls as tiers rise (`targets.buildingsOverWalking`).

## Network quests

Prompt 2, step 2 (proposal approved as written in `quests.md`).

- **A new quest kind, Network,** so the variety rule keeps at most one network quest at a time (more only when every other kind is taken):
  - **Discover** 1 / 2 / 3 new sites or order places.
  - **Build** on a site (short and medium).
  - **Order step:** reach a 25%, 50% or 100% step of any order (medium and long).
  - **Supply** 10 / 20 / 40 of a good to a kind of place, by cart or by hand: a good the open buildings make, to the place kind it serves (markets for goods that serve none). An order sheet whose goods count says "Counts for a quest".
  - **Ride the route** (long): walk past every stop of the cart's route, in any order, then back to the hall; a stop that leaves counts as passed. Only offered with two stops or more on the route.
- **Offered once the network is open:** quest rolls read `networkUnlocked`; retargets and old migrations leave network objectives out (`availableObjectives`' `network` argument).
- **Counted from arrival,** from the events where they happen: discovering (`discoverAt`, which also walks Ride the route on), building (`build`), and deliveries by cart or hand (`deliverGoods`: the goods and a step reached).
- **Not in Pocket mode's "quest ready" alerts,** which stay with walk and patrol quests.
- **The simulator's bot** counts them through the same actions, and rides its route on a walk when that quest is open and the loop fits its walk.
- **No migration:** open quests keep their shape.

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

- **One cart** runs loops (hall → stops in order → hall) while a route is set, along the streets (proposal and measurements in `streets.md`).
- **Stops** are buildings and discovered places with a live order, within the tier's reach of the hall, plus streets the player forces the route through.
  - At a building it loads everything it can carry, largest stock first.
  - At a place it unloads everything that place's order still wants (a market takes any good), paid and counted exactly like a delivery in person.
  - What remains comes home to the hall.
  - A stop that has left is skipped: the cart still drives the stored path past it, and the Network tab asks for the route to be set again.
- **Streets:** the walkable ways of the zoom-14 tiles over the hall's reach plus 300 m, with way ends joined to the nearest point within 15 m (on the Wellington fixture: 53 pieces become 8, the largest holding 94%). The hall and stops snap to the nearest way within 200 m, with a straight last leg; shortest paths between them (Dijkstra). A leg with no street path is straight, and the planner says so.
- **Found once, stored with the route:** the path is computed when the route is set (`useStreetPath`, off the press) and stored with it (`cart.path`, simplified to 5 m). Settling never touches tiles or searches; a stored path stays until the route is next changed, even when the map data updates.
- **The planner** is a guided sheet (`RoutePlannerSheet`, after `mockups/RoutePlanner.html`): pick stops (what each gives or wants, time left), order them (arrows, and "Suggest": buildings before the places they serve, nearest next), see the result (a flow strip of loads, unloads and what comes home, the loop time, the street length, the ambush chance per loop, warnings for stops leaving before the next loop ends and for straight legs). A tap on a street at the result step forces the route through it. Opened from the cart's sheet, the Network tab, and "Add to the cart's route" on a building or an order.
- **Speed and load:** 3 km/h, or 60% of that with no driver. It carries 20 units.
  - A Teamster driving adds 15/30/50% speed and 25/50/100% capacity.
- **Crew:** a driver and up to two escorts. They are away during a loop, and the crew can only change while the cart is parked.
- **Ambushes:** at departure, each distinct crossed cell rolls its level's chance once, seeded by loop and cell, at the cell's **day average** danger (8 samples over the local day, cached per cell and day), the same the planner shows.
  - The ambusher is the strongest patrol touching the cell then. With none, a patrol of your tier at the level's difficulty.
  - The fights are played out at departure with the patrol fight simulation, so the whole loop is fixed when it starts.
  - **Won:** the cart goes on, and damage, consumables and loot are applied at home.
  - **Lost, or nobody aboard:** the cargo is lost, and the cart is back empty 30 minutes later.
- **Back home:** a crew member under half HP parks the cart until you start it again.
- **Changes:** a route changed mid-loop applies from the next departure; Stop parks the cart after the current loop.
- **Offline time:** opening the app after hours replays every loop in between, in one pass; 8 hours take about 30 ms.
- **On the map:** the route along the streets (dashed while a change waits for the next departure), the cart moving on the map's slow clock, a note for an ambush or a delivery ("Delivered 12 grain to the Rusty Tankard"), and at the Full animation level a small "+12" pop over the cart.
- **The cart's sheet:** where it is, its cargo by icon, its crew, and the last ten loops in plain sentences ("Delivered 12 grain to the Rusty Tankard, 8 stone home."). An order's section shows what the cart will unload there next, and when.

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

- **One-line tips** queue the first time a building's sheet, the route planner and a raid banner appear. They also land in Field notes. The trial's three first-run cards are gone; the network's reveal card and the first chain replace them.

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
- **Version 57** adds `save.supply.orders`, empty.
- **Version 58** stores the street path with the route (`cart.path`, `nextPath`); the trial's waypoint cells became forced street points.
- **Version 59** adds `supply.debugUnlocked` and `supply.firstChain`.
- **Version 60** follows what the network replaced (`toV60`): open mine quests are swapped for fresh ones of the same band, quests aimed at removed places retarget, and the removed kinds leave seen kinds; each guild job's waiting units plus its work since the last settlement (at the old rate, tool bonus and cap) go into the materials and its hero comes off the job; every work tool is unequipped, removed and refunded at its shop price (5/10/20/40/80 by tier); the two job tips go; Quarrymen become Miners.
- Renumber all nine whenever the branch is brought up to date with main.
- **Types** are in `src/game/supply/types.ts`.
- **No migration for step 3:** a save that never used the network has no hall and the first chain at its first step, so its next session past tier 2 starts the chain; testers keep their networks.

## Simulator

- **Every run** plays the network with a bot (`src/game/sim/supply.ts`), and the report has a **Supply network** section.
- **The bot,** from tier 2 only:
  - places the hall at home;
  - discovers network places and sites along its walks; with a building slot free, the walk goes to the nearest undiscovered site within the hall's reach it can walk to and back (half its walk), otherwise it detours to the nearest undiscovered site within 400 m; and one detour per walk to the nearest undiscovered order place within 400 m;
  - builds on the best discovered site within reach (stars, then nearness to the hall) the kind serving the order whose headline it values most (gear its heroes can use, then meals and potions), keeping twice the cost in gold;
  - sets the route at the day's last session (its buildings, then the places it serves, in the suggested order; straight paths, since the sim has no map tiles) and starts the cart with one spare escort;
  - hands goods over when a walk passes a place it serves, claims reached steps, defends raids and posts heroes as before.
- **The section,** per day: goods made by buildings, delivered home, delivered to places (by cart and by hand); gold from orders; order rewards claimed; the share of served orders completed; buildings lost to expiry with stock in them; ambushes, raids and hero-hours as before.

## Config (`src/content/supplyLines.ts`)

| Number | Value | What it does |
| --- | --- | --- |
| `trade.levelHours` | 0 / 40 / 120 | Hours of use to reach trade levels 1, 2, 3. |
| `startingTrades` | Bram herbalist, Lyra farmer, Mira teamster | The starting trio's trades. |
| `cellPrecision` | 7 | The geohash grid of the feature. |
| `cellStepMeters` | 35 | Step along a segment when listing the cells it crosses. |
| `hall.movesPerWeek` | 2 | Moves of the hall in any 7 days (the first placement doesn't count). |
| `buildings.limits` | 3/1 km (tiers 1–2), 4/1.5 km, 5/2 km, 6/2.5 km | Buildings at once, each within this distance of the hall. |
| `buildings.cost` / `lifeDays` / `lastDayHours` | 60/60/90/140/200 gold by tier + 10 wood / 6 / 24 | What building costs, how long a building lasts, when its last day starts. |
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

## Debug (Settings → Developer)

- **Place a site here** with 1, 2 or 3 stars, 20 m north of you.
- **Discover everything in view** (1.2 km): network places and sites.
- **Age the network by two days:** buildings, the cart and raids replay two more days; map places follow the real clock.
- On a site's sheet: **Build free** and **Expire this site now**; on a building's: **Expire now** and the raid button.
- **Unlock the network on this save** (with why it's open: tier 2 or debug).
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
