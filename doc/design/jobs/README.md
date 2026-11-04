# Jobs

Step 2 of the roadmap in `doc/ideas.md` ("Heroes, jobs and expeditions"). Designed 2026-11-04.

## Split of step 2
- **2a. The job system, with one job: the woodcutter.** This document. Built 2026-11-04.
- 2b. Work traits: **postponed** to roadmap step 8 (after every job and activity exists), so heroes' traits don't need reworking each time a job is added.
- **2c-1. Guild gathering jobs: forager, trapper, miner, charcoal burner** (below). Built 2026-11-05.
- **2c-2. The outdoor gatherer** (below). Built 2026-11-05.
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

## Work traits (postponed)
Designed 2026-11-04, then postponed the same day to roadmap step 8: the trait list should be fixed once every job and activity is in the game. Kept here as a first draft. A second trait per hero, separate from the combat trait, for jobs (and later trade and gathering): `work-traits.csv`.
- Every hero has exactly one, rolled at recruitment: 60% positive, 40% negative, rolled independently of the combat trait, so a strong fighter can be a poor worker.
- Only traits that do something with the jobs that exist ship (phase `2b`). The others arrive with their job (farmer, miner, outdoor jobs, research, the infirmary, shop orders).
- Existing heroes roll one through a save migration, seeded by hero id.
- Shown wherever the combat trait is (recruit offers, hero card), and on the Jobs tab next to each worker.
- Names avoid clashes: "Clumsy" is a combat trait, so this one is Butterfingers; "Scholar" is a class, so this one is Bookworm.
- Effects are small, because job output is small next to walking (woodcutter 0.3 wood/h): Hard worker on the woodcutter makes about 8.6 wood a full day instead of 7.2.

## Guild gathering jobs (2c-1, built 2026-11-05)
Designed 2026-11-04. Same system as the woodcutter (energy, 8 h cap, collect, recall). Walk first: rates stay low, about the woodcutter's.
- **Forager** (from the start): each unit is a weighted roll, herbs 50, berries 30, mushrooms 20.
- **Trapper** (from the start): meat 45, hide 35, bone 20.
- **Miner** (tier 2): one job; the player picks the ore among those unlocked (stone at tier 2, copper at tier 3, iron at tier 4). Switching ore keeps what was mined so far.
- **Charcoal burner** (tier 5): coal.
- The weights are a starting guess, set by feel: they account for how often things are made (healing potions use herbs far more than walking gives), not only how many recipes use them. Tune later from play.
- Rolls are seeded (job, hero, unit index), so the same moment always gives the same result.
- No new materials: jobs are a second, smaller source of existing ones.

## The outdoor gatherer (2c-2, built 2026-11-05)
Designed 2026-11-04. A job of its own kind, with its own niche: it **picks up what the player leaves behind**.
- The player sets up a **camp** where they stand. The hero works within **250 m** of it.
- It collects only resource nodes the player **didn't** collect before they expired: never competing with the player, using what would go to waste.
- It gathers what actually spawns there (the same nodes as the map, the same rules as the player's Collect, pickaxe included), so it's predictable and can give the current tier's materials, but only what spawns around the camp: walking still covers far more ground.
- Pace: one node every 20 minutes at most (to tune), 8 h cap like other jobs.
- Outdoor work drains energy 1.5× faster (100 lasts 16 h).
- Small risk: a small chance per node of a minor wound (HP loss), so a hero back from the gatherer may need to heal before a dungeon.
- The camp and the hero walking between nodes show on the map.
- As built: the cap is 24 nodes (8 h ÷ 20 min). A node counts once its window has ended uncollected; the hero picks it inside its window, at the pace, in order of window end. The 250 m check uses generated node positions, not the map's snapped ones. The hero on the map walks a seeded loop inside the circle (cosmetic).
