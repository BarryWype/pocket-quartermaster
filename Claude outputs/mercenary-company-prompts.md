# Mercenary company – Prompts for Claude Code

Six prompts, written 2026-11-12, to run after `gameplay-review-prompts.md` (trim, preparation and builds, roster, report). They turn the game towards managing a company of heroes: a larger roster, several groups out at once, the map discovered by walking, heroes sent to map events, expeditions as chains, a regional threat fought as a tug of war, and outdoor jobs.

Run each as its own prompt, in this order. Each depends on the ones before it.

1. Roster 12, easier heroes, any number of groups, the dispatch board
2. Fog of war
3. Errands: groups sent to map places and events
4. Chains: expeditions link by link
5. Regional threats: a tug of war
6. Outdoor jobs

Paste the shared context at the top of every prompt.

---

## Shared context (paste at the top of every prompt)

You are working on Pocket Quartermaster. Follow `AGENTS.md` in full (Expo docs over memory, the emoji-in-Text rule, saves must survive, never run the full `npm run sim`).

**Direction.** The game is still a walking game with short check-ins: walking stays the best source of everything, and a check-in should take about two minutes. What changes is scale: the player runs a company of heroes with many things going on at once. Every feature here is an experiment: keep numbers in config so they are cheap to change, and prefer the simple version.

**How to work.**
- Each prompt is split into steps. After each step: run `npm run test:changed`, then `npm test`, `npm run typecheck` and `npx expo lint`; summarise what changed in a few lines; stop for review.
- Content is data: numbers go in `src/content/`, rules in `src/game/` (pure, unit-tested), no numbers in logic.
- Time is computed from timestamps, as jobs and HP are: no timers running the rules.
- Any change to `SaveData` bumps the persisted store version and adds a pure migration step in `src/game/migrations.ts`, tested with a save of the previous version. Nothing the player earned is lost.
- Every player-facing text in English and French; `src/i18n/placeholders.test.ts` must pass.
- New systems are covered by the simulator bot and report (`src/game/sim/`, `scripts/sim/`). Use `npm run sim:quick` while tuning. At the end of the prompt, list what I should look at when I run `npm run sim` myself.
- New map things follow the gradual reveal (`src/game/reveal/`) with a one-line tip the first time.
- Pocket mode stays passive: it never sends heroes, chooses or collects. It may notify.
- Update the design docs the change touches (`doc/design/…`, a new folder per new system, and the Done list in `doc/ideas.md`).
- If a step needs a design decision this prompt doesn't settle, stop and ask instead of choosing.

---

## Prompt 1 – Roster 12, easier heroes, any number of groups, the dispatch board

**Goal.** Room for more and different heroes, cheap enough to try them, with no limit on how many groups are out at once other than the heroes themselves. One screen shows where everyone is.

Read first: `src/content/roster.ts`, `taverns.ts`, `guild.ts`; `src/game/taverns/`; `src/game/team/`; `src/game/jobs/`; `src/app/expeditions.tsx`, `src/app/team/`; `src/components/PartyDialog.tsx`, `HeroPicker.tsx`, `workingHeroes.ts`; `doc/design/guild/tracks.csv`; `src/game/sim/bot.ts` (recruiting, party picks).

### Step 1 – Roster and prices

1. `rosterRules.rosterCap` goes from 6 to **12**. The Guild Hall's "Roster slot 7" and "Roster slot 8" ranks become slots **13** and **14** (same track, same gates; owned ranks carry over).
2. Recruit prices were built to make the sixth hero a save-up (`freeHeroes: 3`, `perExtraHero: 0.45`). Flatten: start with `freeHeroes: 6`, `perExtraHero: 0.15`. Give me the price of the 4th, 8th and 12th hero per tier before and after, against the simulator's gold income per tier.
3. Taverns offer one more recruit (`offersPerTavern` 3 → 4).
4. Dismissing a hero returns their gear to the inventory (check it does) and asks once; the title confirmation from the report prompt stays.
5. Check every screen that lists heroes with 14 of them: the Barracks, pickers, the party dialog, the Jobs tab.

Stop for review.

### Step 2 – More ways to get heroes

1. **Rescues.** Winning a bandit camp, a goblin raiding party or a monster lair has a chance (in config, start at 20%) to free a prisoner: a recruit of the player's tier, rolled like a tavern offer, who joins for free if there is room, shown in the fight's report. With a full roster the prisoner pays a small gold reward instead.
2. **Quest reward.** Long (2 km) quests can roll "a recruit" as their reward at a low chance, shown on the quest before it is accepted, so it can be a reason to do that walk.
3. **Wanted this week** (from the roster prompt) stays; with four offers, the family in town takes the first two.
4. The loot matrix gains a "Recruit" column for these sources (`doc/design/loot/matrix.csv` and its content test).

Stop for review.

### Step 3 – Any number of groups

1. Remove whatever limits the number of expeditions, place fights, patrol fights and heists running at the same time, if anything does. The only limit is that a hero is in one place at a time. List what you found.
2. A group is 1 to 3 heroes (`partySize` stays 3 as the maximum). Dungeons still expect 3 unless their content says otherwise; the party dialog already handles fewer.
3. **Gear follows the plan.** "Suggest a party" may take gear from heroes who are free or on a guild job, never from heroes who are out. Heroes on guild jobs need no gear. When Suggest moves a piece, the dialog says from whom.
4. The odds cache key must still be right with many groups out (HP and gear state by hero).

Stop for review.

### Step 4 – The dispatch board

One place to see and act on every hero. It replaces the Expeditions screen's "Teams" tab and becomes its first tab.

1. **Layout.** Heroes grouped by state, each group a section with a count: **Back** (something to collect: a report, job output), **Out** (expedition, fight, heist, and later errand, chain link, outdoor job: where, with whom, a countdown), **Working** (guild jobs, with output and energy), **Resting** (hurt or winded, with the time left), **Free**.
2. **Collect all**: one button collects every report and every job output, then shows the reports one after another (swipe), each with the report card from the report prompt.
3. **Free heroes** have one-tap actions: Send (opens the place list), Put to work.
4. A pure function builds the board from the save and the time (`src/game/dispatch/`), unit-tested; the component renders. It must be cheap: no odds, no simulation.
5. The menu badge counts the "Back" section.
6. The board is built so later prompts add states by adding a kind, not by editing the layout.

Stop for review. Then list what to check in the full simulator run: roster size per tier, recruit gold, distinct heroes fielded, expeditions per day (it should rise with the roster: say by how much, since income rises with it).

---

## Prompt 2 – Fog of war

**Goal.** The map is discovered by walking. Ground the player has never walked lies under a soft fog; walking lifts it for good. It gives walking somewhere new a reward, and it sets where heroes can be sent (prompt 3).

**Rules that must hold.**
- The fog is **soft**: streets, parks and water stay readable under it (a parchment haze, not black). This is a real map people navigate with.
- Fog **never comes back**.
- The world stays shared and deterministic: fog is a per-player view on top of it, never a change to what spawns.

Read first: `src/content/map.ts`, `spawnConfig.ts`, `mapStyle.ts`; `src/game/generation/` (geohash tiles, culling); `src/game/reveal/`; `src/services/walkTracking.ts`, `src/hooks/useAutoGather.ts`; `doc/design/pocket-mode/README.md`; issues 13 and 18 in `doc/issues.md` (map performance).

### Step 1 – Discovery

1. The save holds the set of discovered cells: geohash cells of about 150 m (precision 7, the animals' tile). Store them compactly and say how large a year of daily walking would make the save.
2. A cell is discovered when the player's path passes within a radius of it (start at 120 m, in config), from GPS fixes that pass the accuracy rule already used for gathering. Pocket mode's walk discovers cells when the app opens and processes the walk, like gathering.
3. **Migration**: existing players start with every cell within 400 m of their current position discovered when they first open the app after the update (there is no stored walk history; if there is one I've missed, use it instead and tell me).
4. New games: the tutorial plays in a discovered bubble around the player.
5. Pure functions in `src/game/discovery/`, tested with a recorded path: cells discovered, no cell lost, the same path gives the same set.

Stop for review.

### Step 2 – What fog does

1. **Drawing.** Fogged cells in view are drawn as one haze layer above the base map and below markers. Measure it on the map's existing performance tests; it must not re-render markers. Hidden below the zoom where decorations hide.
2. **In the fog**, by kind:
   - Resources, animals and herbs: unchanged. Their visibility ranges already act as a fog, and hiding them would punish walking somewhere new.
   - Places, fight events, ruins, taverns, Sanctums: within their visibility range but in a fogged cell they show as a **rumour**: a "?" marker with only the kind's family (a place, a fight, something old). The real marker and its panel appear when the cell is discovered. Quest targets are never rumours.
   - Patrols: unchanged.
3. **First footsteps.** Discovering cells pays a small reward on a curve: every N new cells (start at 10) a roll on a new "Discovery" row of the loot matrix (gold, a small chance of a treasure map or key fragment). A toast, never a dialog.
4. **A number to chase.** Settings or the map's top bar shows cells discovered and the distance walked in new ground this week. No percentage of a town: there is no town boundary.
5. Quests: add one Walk objective, "Discover N new cells", only offered when fogged cells exist within the quest's band.
6. Pocket mode's "nearby places" notification still fires for a place in fog ("Something is nearby").

Stop for review.

### Step 3 – Simulator

The bot's walks discover ground: model a home area that fills in over the first weeks, then a slow frontier, per profile (casual, regular, heavy), in the sim config. Report: cells discovered per week and the share of place visits that were in already-discovered ground. List what to check in the full run: discovery rewards per week against the loot pacing table, and that place visits per day did not drop.

---

## Prompt 3 – Errands: groups sent to map places and events

**Goal.** In the simulator the regular player does 0.59 of 4.76 planned place visits a day: most map content is walked past. Let the player send a group of heroes to something they can see. Going in person stays better.

**Rules.**
- A group of 1–3 heroes can be sent to a **discovered** place or event within range.
- **Heroes leave from where the player stands** when they are sent (there is no home base in the game). Travel time comes from the straight-line distance, there and back, at a walking speed in config (start at 4 km/h, so 500 m is about 15 minutes for the round trip), with a minimum.
- Maximum range: 2 km to start.
- **Heroes fight, dig, haul and sell. Only the player buys, recruits, talks, prays, picks options and enters Sanctums, taverns and secret places.**
- Going in person is immediate and gives one extra loot roll on fights and digs, and full shop prices.

Read first: `doc/design/places/`; `src/game/places/` (`fights.ts`, `shops.ts`), `src/content/places.ts`, `placeFights.ts`, `placeActivities.ts`; `src/game/patrols/` (`fight.ts`, `escort.ts`); `src/components/PlacePanel.tsx`, `PlaceFightPanel.tsx`, `PartyDialog.tsx`; the dispatch board from prompt 1; discovery from prompt 2.

### Step 1 – The errand

1. An errand is saved with: the group, the target, the kind, the time sent, the time it arrives and the time it is back. Everything is settled from those times when read.
2. **Kinds, first version:**
   - **Fight**: fight events and the monster lair. Resolved on arrival with the existing place fight simulation, seeded so the result is fixed when sent. Loot from the fight's matrix row, without the in-person extra roll.
   - **Dig**: a ruin. One dig, counting towards the 5-dig relic like the player's.
   - **Treasure spot**: collects it.
   - **Sell** (step 2).
3. **The target must still be there on arrival.** Places and events have lifetimes: if it ends or the player uses it first, the group comes back with nothing and a line saying so. The send dialog warns when the place ends before arrival.
4. HP, winded and the report work as for a place fight today. The errand's report uses the report card.
5. **Sending**: every place panel that supports an errand gets "Send heroes" beside the in-person action when the player is out of interaction range (and in range too, for fights). It opens the party dialog with the travel time, the odds for fights, and what going in person would add.
6. The map draws a small marker for a group on its way along the straight line, updated on the map's slow clock. Tapping it opens the dispatch board on that group.
7. The dispatch board gains the errand kind in "Out" and "Back".
8. Quests: an errand's fight or dig counts for "defeat" and "dig" objectives; visit, pray and deliver objectives still need the player.
9. Notifications: "Bram's group is back from the bandit camp", under the existing expedition setting.

Stop for review.

### Step 2 – Carrying goods to sell

1. An errand to a place that buys (smithy, market, the material shops that buy) carries goods chosen in the send dialog: gear and materials from the inventory, up to a haul limit per hero (start at 6 items or stacks per hero; the Porter class carries double).
2. Goods leave the inventory when the group leaves and are sold on arrival at the shop's price **× 0.8** (in config): in person pays full. Gold arrives when the group is back. If the shop is gone on arrival, the goods come back.
3. The dialog shows what the shop will pay per item and the total, using the same price functions as the shop panel.
4. Sold goods count for the "sell goods worth N gold" quest when the group is back.
5. Buying is not part of this prompt.

Stop for review.

### Step 3 – Simulator and balance

1. The bot sends free groups on errands to places its walk passed but did not use, respecting its odds threshold, and sells surplus by errand when it would not pass a shop that day.
2. Report: errands per day by kind, the share of place content done in person and by errand, gold from errand sales, time heroes spend travelling.
3. Guard the walking rule with a band test: for the regular profile, loot value from in-person place visits per day stays above loot value from errands.

Stop for review, then list what to check in the full run: "Visits planned vs done" for places, gold per tier, and whether expeditions per day fell because heroes were on errands.

---

## Prompt 4 – Chains: expeditions link by link

**Goal.** An expedition becomes an exploration: a chain of links, each one its own expedition as today. Winning a link reveals what lies beyond it, and the player chooses where to go next, towards a boss whose reward they could see from the start.

**Decisions already made.**
- **Each link is a separate expedition**: the heroes go, come back, and report. Nothing carries inside a chain except what the game already carries (HP, rest, winded). No route planning ahead.
- **Chains sit beside the current dungeons.** The static per-tier chain of 6 dungeons and its boss stay as they are for now. If chains work, the static dungeons retire later: build nothing that would make that hard.
- Any group may take any open link; several links of one chain, or of different chains, can be out at once.

Read first: `doc/design/progression/`, `doc/design/expeditions/README.md`; `src/content/dungeons.ts`, `enemies.ts`, `difficulty.ts`, `rotation.ts`; `src/game/dungeons/` (rotation, briefings), `src/game/threats/compose.ts`; `src/game/expeditions/expeditions.ts`; `src/app/expeditions.tsx`; `doc/design/loot/matrix.csv`.

### Step 1 – The chain model and generator

1. **Shape.** A chain is a small map: 3 or 4 depths before the boss, 2 or 3 links per depth, 6–9 links in all, then the boss. Each link names which links of the next depth it opens (1 or 2). Every link can reach the boss.
2. **A link** is a dungeon definition built from existing parts: an enemy family theme for the whole chain, a difficulty that rises with depth (easy at depth 1, hard just before the boss), a duration, a briefing composed like today's (threats, maybe a favour or a bar), and a **reward focus**: one loot category it is better at (blueprint, gear, trinket, relic, monster parts, key fragment, gold, a recruit), shown as an icon.
3. **The boss** has a reward shown from the day the chain appears: one named thing from a short list by tier (a Rare piece of a stated type, a relic, a blueprint the player lacks, a rare-class recruit).
4. **Generation** is seeded per player and chain number, from content tables (themes, link name parts, reward focuses per tier, boss rewards). The same seed always gives the same chain. A data test generates a few hundred per tier and checks: every link reaches the boss, depth difficulty rises, every briefing is answerable under the existing answerability test at tiers 1–2, no chain has the same focus on every link of a depth.
5. **How many.** Two chains open at a time at the player's tier. A finished chain is replaced the next rotation day. A chain left untouched for 7 days is replaced; one in progress never expires.
6. Unlock: chains appear after the tier 1 boss, through the reveal, with a tip.

Stop for review, with three generated chains printed as text.

### Step 2 – Playing a chain

1. Save: for each open chain, the links cleared, the links open, and the links out.
2. Depth 1's links are open from the start. Winning a link opens the links it leads to. A retreat or a loss leaves it open to try again.
3. A cleared link can't be run again. Its siblings at the same depth stay open: clearing a second one is allowed and opens its own ways forward, so a player can sweep a chain for loot or go straight for the boss.
4. Loot: each link rolls a "Chain link" row of the loot matrix, with its focus category raised one mark (R → S, S → O, O → A). The boss rolls a "Chain boss" row and gives the shown reward. Like every expedition launched from the phone, no materials.
5. Fit link strength to the tier's easy, medium and hard targets with the existing fitting script; the chain boss to the tier boss target with the tier's gear.
6. Chains don't change tier progression: the tier boss still opens the next tier.

Stop for review.

### Step 3 – The screen, and anticipation

1. A new tab, **Chains**, on the Expeditions screen. Each chain is drawn as its map on parchment: links as nodes by depth, lines between them, the boss at the end with its reward.
2. **What the player can see:**
   - Cleared links: stamped.
   - Open links: full notice (name, difficulty pips, duration, threat sockets, focus icon, readiness stamp), tap to open the party dialog.
   - Links one step beyond an open link: a **silhouette** with its focus icon and difficulty pips only.
   - Anything further: an unmarked node. The boss and its reward are always shown.
3. **The reveal.** When a link's report is collected, the chain map opens and the way forward draws in: the lines extend, the next links turn from silhouette to full notice one after another, and what was unmarked becomes a silhouette. Short, skippable by tap, static with reduce-motion on.
4. While a group is out on a link, its node shows the group's portraits and the countdown.
5. The report of a won link ends with "Beyond: <names of the links it opened>".
6. Build the map as a pure layout function (nodes and lines from a chain), unit-tested; the component draws it.
7. The dispatch board shows chain links like any expedition, naming the chain.

Stop for review.

### Step 4 – Simulator

1. The bot plays chains: it picks the open link with the focus it needs most among those above its odds threshold, and heads for the boss when its reward is something it lacks.
2. Report: chains finished per week per profile, links run per chain (straight to the boss or swept), win rates by depth, the boss's first-attempt odds, and loot per category from chains against static dungeons.
3. List what to check in the full run: days per tier (chains add loot, so the pace may quicken), gear rarity per tier, and whether static dungeons are still being run at all.

---

## Prompt 5 – Regional threats: a tug of war

**Goal.** Something is happening in the player's region, and what they do each day pushes it back or lets it advance. It gives daily quests a reason, makes each enemy family matter in turn, and ends in a stronghold to storm.

**The rules, decided.**
- **One regional threat at a time.** It has a theme: an enemy family and its patrol, fight event and chain content (start with three: an orc invasion, a restless dead rising, a beast migration; in content, so adding one is data).
- **The rope**: a position from −100 (the threat is winning) to +100 (the player is winning), starting at 0.
- **It pulls**: every day at the rotation reset the rope moves towards the threat by a daily amount.
- **The player pulls**: beating the threat's patrols, winning its fight events (in person or by errand), clearing links of its chain, and completing its daily quest, each worth points (in config).
- **Stages** at thresholds on both sides, shown as notches on the rope:
  - Threat side (−30, −60, −90): more of its patrols and fight events within the existing difficulty bands; then one themed resource is scarcer (animals for beasts or orcs, herbs for the dead), **never ore, never more than −30%**; then one place kind near the player is occupied (a tavern, a market or a chapel shows as occupied and closed) until the rope is back above −60.
  - Player side (+30, +60): boons that last while the rope is there: its patrols drop one more monster part; shops of one kind sell 10% cheaper.
  - **+100: the stronghold appears.** The threat's last stand, as a chain (prompt 4) whose links are all of its family and whose boss ends the threat.
- **The end.** Beating the stronghold's boss ends the threat with a reward, then a peace of 3 days with a small boon, then a new threat of another theme.
- **Never punishing an absent player.** If the app hasn't been opened for 2 days, the rope stops moving until it is opened again. Nothing is ever lost for good: occupied places come back, scarce resources return.
- **Boost, never gate**: no resource disappears, no tier is blocked, the tier boss and static dungeons are untouched.

Read first: `doc/ideas.md` ("Adventures and regional threats"), `doc/design/quests/`; `src/content/quests.ts`, `src/game/quests/`; `src/content/patrols.ts`, `placeFights.ts`, `spawnConfig.ts`; `src/game/generation/` (how spawns are generated and filtered); `src/game/places/`; chains from prompt 4.

### Step 1 – The rope

1. Save: the current threat (theme, start day, rope position, last settled day, the stage effects in force) and a short history. Settled from timestamps when read: days passed pull the rope, with the 2-day absence rule.
2. Pull values and thresholds in `src/content/regionalThreats.ts`. Start so that a regular player doing the threat's quest and three or four of its fights a day gains ground slowly, a casual player holds around zero, and a player ignoring it reaches −60 in about a week. Give me the three curves over 30 days from a small script.
3. Pure functions in `src/game/regional/`, tested: settling days, pulls from each source, stage changes both ways, the absence rule, the end and the peace.
4. Unlock after the tier 2 boss, through the reveal, with a short introduction dialog the first time.

Stop for review.

### Step 2 – Effects on the world

1. **More of its patrols and events**: weight the threat's kinds in the existing spawn picks for this player. The shared world rule changes here on purpose: say exactly how (patrols and fight events become partly per-player while a threat is active) and keep everything else shared.
2. **Scarcer resource**: a deterministic per-player filter on the themed resource's spawns (drop a seeded share), never a change to generation. A test checks ore is never touched and the share never exceeds the cap.
3. **Occupied place**: the nearest discovered place of the kind is marked occupied: its panel says who holds it and what frees it. Never the personal tavern, a quest target or a place with a tip on it.
4. **Boons**: applied through the existing loot and shop price functions as modifiers.
5. Each stage change shows once: a toast on the map and a line on the threat's card.

Stop for review.

### Step 3 – Quests from the threat

1. While a threat is active, **one of each day's new quests is the threat's quest**, marked with its banner: "Defeat 3 orc patrols", "Clear an orc camp", "Clear a link of the stronghold", "Walk 1 km through ground the orcs hold" (near its events). The other quests stay as they are, and the variety rule still applies across all of them.
2. The threat's quest pays its normal reward plus rope points, shown on the quest.
3. Objectives only use things that exist within the quest's band; else fall back to "defeat N of its patrols", which spawn anywhere.
4. Pocket mode counts the patrol objective as it does today.

Stop for review.

### Step 4 – The screen

1. A card at the top of the Quests screen: the threat's name and art, **the rope** drawn as a bar with the notches, a marker, and which side is ahead; what is in force now; what the next notch brings each way; today's pull so far.
2. The map's top bar shows a small rope marker once a threat is active; tapping it opens the card.
3. At +100, the card becomes the stronghold's announcement and links to its chain.
4. A notification (its own setting, on by default, respecting quiet hours) when a stage changes against the player and when the stronghold appears. Not daily.

Stop for review.

### Step 5 – Simulator

1. The bot treats the threat's quest like any quest and prefers its patrols and events when they pass its odds threshold.
2. Report: rope position over time per profile, days per threat, stages reached on each side, days spent with a scarce resource or an occupied place, and the materials lost to scarcity as a share of the tier's needs.
3. Band tests on the quick machinery or a short dedicated run: the casual profile never spends more than a third of its days below −60; the regular profile reaches the stronghold in 10–20 days.
4. List what to check in the full run: days per tier, the main material per tier, quests done per day.

---

## Prompt 6 – Outdoor jobs

**Goal.** Heroes can be posted out in the world, at places the player has discovered. Each job has its own kind of output, so they are choices and not four timers of the same thing.

**Rules.**
- Outdoor jobs use the job system as it is: energy, an output that fills after 8 hours, collect, recall, no HP loss, one job per hero.
- A job is held **at a discovered place** of the right kind within errand range of where the player stands when posting the hero. Travel there and back uses the errand's travel time. When the place resets, the hero comes home with what they made.
- Walk first: the band test that holds job output at 10–15% of a regular player's daily needs applies to every job that gives materials.

| Job | Where | Gives |
| --- | --- | --- |
| Watch duty | A chapel, market or tavern (any place the threat could occupy) | Holds the rope: while a hero stands watch, the regional threat's daily pull is reduced (start at −25% per watcher, at most −50%), and the watched place can't be occupied |
| Bodyguard | A market or smithy | Gold, on the tier's gold curve; a small chance per shift of a tip (a blueprint for sale at that shop next rotation) |
| Fishing | A fishing dock | Fish for the kitchen; rarely a sunken chest (the roll already designed for the fishing mini game) |
| Hunting | A hunting lodge | Meat, hide and bone like the trapper, at a higher rate, since the trapper stays home |

Read first: `doc/design/jobs/README.md`, `jobs.csv`; `src/content/jobs.ts`, `src/game/jobs/` (`jobs.ts`, `gatherer.ts`); `src/components/JobsTab.tsx`, `GathererCard.tsx`; errands (prompt 3), the regional threat (prompt 5), the dispatch board (prompt 1).

### Step 1 – Posting a hero

1. Extend the job model with a place and travel times. Output only builds between arrival and departure. Settled from timestamps.
2. The place panel of each kind above gets "Post a hero" with the job's line: what it gives per hour, the travel time, when the place resets.
3. The Jobs tab lists outdoor posts under the guild stations, each with its place name and distance; the dispatch board shows them in "Working" with the place, and in "Back" when the place has reset or the output is full.
4. Recall: the hero walks back (travel time) and keeps what was made.
5. Class leanings, small and in config: Scouts and Rangers hunt faster, Paladins and Warriors guard better, a Cook fishes better. Shown in the picker.
6. Work tools: check which existing tools should apply (the hunting and fishing ones if they exist) and list any gap instead of inventing tools.

Stop for review.

### Step 2 – The four jobs

Build them in this order, one commit each, with their rates in config and a unit test per job: hunting, fishing, bodyguard, watch duty. Watch duty needs the rope's settle function to read watchers over time (who stood watch on which day): extend it and its tests.

Stop for review.

### Step 3 – Simulator

1. The bot posts free heroes it is not planning to send: a watcher when the rope is below zero, hunters and fishers when it lacks kitchen ingredients, bodyguards otherwise.
2. Report: hours per job per tier, each job's output against the tier's needs, the rope with and without watchers.
3. Extend the jobs band test to hunting and fishing. Add one for gold: bodyguard gold stays under 10% of the regular profile's income per tier.
4. List what to check in the full run: the Jobs section, gold per tier, and how many heroes are idle per check-in now (the roster of 12 should be mostly busy: say what share is).
