# Jobs

Step 2 of the roadmap in `doc/ideas.md` ("Heroes, jobs and expeditions"). Designed 2026-11-04.

## Split of step 2
- **2a. The job system, with one job: the woodcutter.** This document. Built 2026-11-04.
- 2b. Non-combat traits (a second trait per hero).
- 2c. Farmer, miner, the outdoor gatherer, and the resource rework (each material's main source and other sources).
- 2d. More ways to recruit (rescues, quest rewards).

## Rules (2a)
- **Walk first.** Walking stays the best source of every material. Job rates are low: a full day of woodcutting gives about **10–15% of the wood a regular player needs in a day** at their tier. The woodcutter makes **0.3 wood per hour of work** (`src/content/jobs.ts`): the regular player checks in at 8:00, 12:30 and 19:00, so a worker left at the station puts in about 15 productive hours a day (the overnight gap stops at the 8-hour cap, and the tired phase takes its share), about 4.5 wood, against a tier-1 spend of about 35 wood a day. The simulator report's Jobs section measures the share at every tier, and a band test holds the regular profile at 10–15%.
- **Slots:** open from the start. Any hero not away (expedition, patrol or place fight, heist) can take a job. A progression system may gate slots later.
- **One job per hero.** A working hero isn't free for expeditions or fights until recalled. Pickers show them as "working", with a one-tap recall.
- **Output** builds up while the hero works and **fills after 8 hours**, then stops until collected. Collecting is a check-in action.
- **Recall** at any time: the output made so far is kept.
- **Energy:** each hero has 0–100.
  - Working drains it: 100 lasts **24 hours** of work.
  - Not working refills it: 0 to 100 in **6 hours**. Time on an expedition, a patrol or place fight, or a heist counts as rest.
  - At 0 the hero stops producing and shows as **tired**. They stay at their station until reassigned or recalled, and start again on their own once energy comes back.
  - Expeditions and fights don't cost energy, and tired heroes may go on them.
- **No risk** on guild jobs: no HP loss.
- **Computed from timestamps**, like HP healing: no timers. Energy and output are settled when read or acted on. A worker's energy runs a 30-hour cycle (24 hours working, 6 hours tired); a `tired` flag in the hero's job plus the energy's timestamp place them in it, so days left alone are worked out with whole cycles, not hour by hour (`src/game/jobs/jobs.ts`).

## Interface
- The Expeditions screen's tab rail (Dungeons, Teams, Reports) gets a fourth tab, **Jobs**. Its menu button stays where it is. Later tabs (heroes on the map, outdoor jobs) join the same rail, and the screen may then be renamed.
- **Jobs tab:** one card per station (the woodcutter for now) with the worker, an output bar towards the 8-hour cap, the worker's energy, and Collect, Assign and Recall. Free heroes are listed to assign in one tap.
- **The menu badge** counts full jobs and tired workers, on top of today's count.
- **Hero card:** "Put to work" opens the Jobs tab with that hero selected; a working hero shows their job and energy.
- **Notifications** (the Jobs setting, on by default): "Woodcutter: output full" when the cap is reached, "<hero> is tired" when energy reaches 0. Both are planned from the rules, at the time they happen.
- **Pickers** (expedition, patrol, place fight, heist, Sanctum, secret places, the escort) list working heroes as "Working"; sending one turns the button into **Recall and send**.
- A first-time tip explains jobs the first time the Jobs tab opens.

## Later
- Farmer and miner (2c), outdoor jobs (fishing, hunting, gathering on the map), forge apprentice, cook and herbalist, infirmary (faster energy and HP recovery), scribe, builder.
- Non-combat traits that change output and energy (Homebody, Wanderlust, Idle, Green thumb…).
- Energy for expeditions, or a penalty for tired heroes, only if play shows the same heroes being sent everywhere.
