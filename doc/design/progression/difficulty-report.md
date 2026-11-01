# Progression pass: difficulty — report

Branch `progression-difficulty` (7 commits, not pushed). Full simulator output of this branch: [sim/report.md](sim/report.md), [sim/summary.json](sim/summary.json). Your own `doc/design/simulator/report.md` and `summary.json` were left untouched.

## 1. What changed

| Step | Commit | What |
| --- | --- | --- |
| 1 | ddfc346 | `content/difficulty.ts` (rules, labels en/fr), `difficultyTokens` in `theme.ts` |
| 2 | 3931db9 | Chain of 6 + boss per tier, chain unlock (+ old-save rule), rotation now rotates briefings |
| 3 | 3e78462 | 14 patrol kinds, spawn table, difficulty per spawn, party/groups/threat level by difficulty, escort easy+medium |
| 4 | 54aaa23 | Fight events carry a difficulty; threat level from `threatLevelFor` |
| 5 | 1091036 | One Patrol loot row, difficulty multiplier in the loot roll, first clear per chain dungeon, dungeon runs 5/day |
| 6 | 94e4b37 | `DifficultyRing` / `Pips` / `Chip`, diamond map markers, used on every fight source |
| 7 | 2c8e44d | Reference teams, `npm run sim:fit`, generated `difficultyFactors.ts`, per-difficulty odds in quick/summary/bands, bot follows the chain |

Notes:
- Display tokens live in `src/theme.ts` (where `good`/`bad` are), not `src/components/ui/`.
- `firstTierClear` now pays on the tier boss's first win (it used to pay on the tier's first win of any dungeon, which is now always chain dungeon 0, which pays `firstDungeonClear`).
- No save shape change: first clears reuse `clearedDungeons`, so no store version bump.
- Bot: the top tier's next uncleared chain dungeon only needs the boss bar (45%) instead of 60%, otherwise the hard steps (fitted to 55%) blocked the chain. `sim.test` tier 1 horizon 14 → 21 days (the boss now falls on day 16 for that seed).

## 2. Odds (end fitted to the middle of each target; start measured, not refitted)

Every source hits its end-of-tier target. Start-of-tier misses (✗) are a design call: the start team (level 1/expected level of the previous tier, Common, previous tier's gear, tier 1 weapon only) is far below what the factors assume in tiers 1–2.

| source | tier | difficulty | factor | start | end |
| --- | --- | --- | --- | --- | --- |
| ratCellar | 1 | easy | 3.3 | 9% ✗ | 87% ✓ |
| spiderBurrow | 1 | easy | 3.88 | 6% ✗ | 89% ✓ |
| oldGraveyard | 1 | medium | 3.48 | 2% ✗ | 70% ✓ |
| goblinWarren | 1 | medium | 4.58 | 0% ✗ | 71% ✓ |
| smugglersCove | 1 | hard | 4.65 | 0% ✗ | 54% ✓ |
| millRuins | 1 | hard | 4.49 | 0% ✗ | 56% ✓ |
| patrol herd | 1 | easy | 3.17 | 1% ✗ | 86% ✓ |
| patrol wolves | 1 | easy | 4.16 | 1% ✗ | 88% ✓ |
| patrol goblins | 1 | medium | 9.49 | 0% ✗ | 73% ✓ |
| patrol bandits | 1 | medium | 6.7 | 0% ✗ | 68% ✓ |
| patrol orcs | 1 | hard | 6.78 | 1% ✗ | 56% ✓ |
| patrol spiders | 1 | hard | 12.55 | 0% ✗ | 55% ✓ |
| sunkenFord | 2 | easy | 2.12 | 2% ✗ | 87% ✓ |
| boarThicket | 2 | easy | 2.98 | 8% ✗ | 87% ✓ |
| wolfDen | 2 | medium | 3.28 | 1% ✗ | 70% ✓ |
| trollBridge | 2 | medium | 2.71 | 1% ✗ | 72% ✓ |
| watchtower | 2 | hard | 3.54 | 1% ✗ | 56% ✓ |
| barrowMounds | 2 | hard | 2.72 | 0% ✗ | 55% ✓ |
| patrol goblins | 2 | easy | 4.64 | 0% ✗ | 88% ✓ |
| patrol bandits | 2 | easy | 3.2 | 1% ✗ | 88% ✓ |
| patrol orcs | 2 | medium | 5.26 | 0% ✗ | 70% ✓ |
| patrol spiders | 2 | medium | 8.87 | 1% ✗ | 71% ✓ |
| patrol eliteGoblins | 2 | hard | 10.69 | 0% ✗ | 56% ✓ |
| patrol outlaws | 2 | hard | 7.61 | 0% ✗ | 55% ✓ |
| stormRidge | 3 | easy | 1.75 | 28% ✗ | 87% ✓ |
| dwarfhold | 3 | easy | 2.27 | 30% ✗ | 88% ✓ |
| witchMarsh | 3 | medium | 2.69 | 13% ✗ | 70% ✓ |
| fungalGrotto | 3 | medium | 2.49 | 19% ✗ | 71% ✓ |
| cinderHollow | 3 | hard | 2.7 | 6% ✓ | 57% ✓ |
| hauntedMine | 3 | hard | 2.95 | 12% ✓ | 55% ✓ |
| patrol orcs | 3 | easy | 2.28 | 7% ✗ | 88% ✓ |
| patrol spiders | 3 | easy | 3.97 | 12% ✗ | 88% ✓ |
| patrol eliteGoblins | 3 | medium | 7.05 | 8% ✗ | 70% ✓ |
| patrol outlaws | 3 | medium | 5.02 | 8% ✗ | 70% ✓ |
| patrol ogres | 3 | hard | 5.72 | 10% ✓ | 56% ✓ |
| patrol eliteOrcs | 3 | hard | 6.03 | 12% ✓ | 56% ✓ |
| clockworkVault | 4 | easy | 2.33 | 13% ✗ | 87% ✓ |
| thunderPlateau | 4 | easy | 1.47 | 38% ✗ | 88% ✓ |
| harpyCliffs | 4 | medium | 2.46 | 19% ✗ | 69% ✓ |
| frozenLake | 4 | medium | 1.8 | 14% ✗ | 71% ✓ |
| orcWarcamp | 4 | hard | 2.51 | 10% ✓ | 55% ✓ |
| boneField | 4 | hard | 2.41 | 14% ✓ | 55% ✓ |
| patrol eliteGoblins | 4 | easy | 3.47 | 24% ✗ | 89% ✓ |
| patrol outlaws | 4 | easy | 2.42 | 25% ✗ | 88% ✓ |
| patrol ogres | 4 | medium | 3.98 | 13% ✗ | 71% ✓ |
| patrol eliteOrcs | 4 | medium | 4.84 | 20% ✗ | 70% ✓ |
| patrol trolls | 4 | hard | 5.88 | 14% ✓ | 56% ✓ |
| patrol wraiths | 4 | hard | 8.5 | 10% ✓ | 56% ✓ |
| stormIsle | 5 | easy | 1.37 | 43% ✗ | 87% ✓ |
| abyssalDepths | 5 | easy | 1.13 | 34% ✗ | 88% ✓ |
| ashenCitadel | 5 | medium | 1.44 | 24% ✗ | 71% ✓ |
| titanRuins | 5 | medium | 2.07 | 19% ✗ | 72% ✓ |
| wyvernPeaks | 5 | hard | 2.83 | 7% ✓ | 55% ✓ |
| ossuary | 5 | hard | 2.84 | 13% ✓ | 56% ✓ |
| patrol ogres | 5 | easy | 2.3 | 31% ✗ | 88% ✓ |
| patrol eliteOrcs | 5 | easy | 2.27 | 17% ✗ | 87% ✓ |
| patrol trolls | 5 | medium | 4.21 | 12% ✗ | 70% ✓ |
| patrol wraiths | 5 | medium | 6.09 | 21% ✗ | 70% ✓ |
| patrol wyverns | 5 | hard | 6.93 | 18% ✗ | 55% ✓ |
| patrol golems | 5 | hard | 7.81 | 18% ✗ | 56% ✓ |
| event banditCamp | 1 | easy | 7.47 | 2% ✗ | 88% ✓ |
| event banditCamp | 2 | easy | 7.28 | 6% ✗ | 86% ✓ |
| event banditCamp | 3 | easy | 6.17 | 35% ✗ | 88% ✓ |
| event banditCamp | 4 | easy | 6.92 | 28% ✗ | 88% ✓ |
| event banditCamp | 5 | easy | 6.64 | 46% ✗ | 89% ✓ |
| event goblinRaid | 1 | medium | 11.89 | 2% ✗ | 71% ✓ |
| event goblinRaid | 2 | medium | 11.51 | 4% ✗ | 71% ✓ |
| event goblinRaid | 3 | medium | 9.63 | 26% ✓ | 70% ✓ |
| event goblinRaid | 4 | medium | 9.91 | 30% ✓ | 69% ✓ |
| event goblinRaid | 5 | medium | 9.66 | 39% ✓ | 70% ✓ |
| event beastDen | 1 | medium | 9.88 | 0% ✗ | 71% ✓ |
| event beastDen | 2 | medium | 10.3 | 0% ✗ | 70% ✓ |
| event beastDen | 3 | medium | 7.92 | 15% ✗ | 70% ✓ |
| event beastDen | 4 | medium | 8.19 | 28% ✓ | 71% ✓ |
| event beastDen | 5 | medium | 8.52 | 27% ✓ | 70% ✓ |
| event hauntedCrypt | 1 | hard | 9.77 | 0% ✗ | 55% ✓ |
| event hauntedCrypt | 2 | hard | 9.04 | 0% ✗ | 56% ✓ |
| event hauntedCrypt | 3 | hard | 8 | 8% ✓ | 56% ✓ |
| event hauntedCrypt | 4 | hard | 8.28 | 15% ✓ | 56% ✓ |
| event hauntedCrypt | 5 | hard | 8.52 | 21% ✗ | 56% ✓ |
| event elementalRift | 1 | hard | 11.37 | 0% ✗ | 54% ✓ |
| event elementalRift | 2 | hard | 10.99 | 1% ✗ | 56% ✓ |
| event elementalRift | 3 | hard | 10.05 | 12% ✓ | 55% ✓ |
| event elementalRift | 4 | hard | 10.06 | 12% ✓ | 54% ✓ |
| event elementalRift | 5 | hard | 10.02 | 19% ✗ | 55% ✓ |
| event abandonedCaravan | 1 | easy | 6.85 | 5% ✗ | 88% ✓ |
| event abandonedCaravan | 2 | easy | 6.47 | 16% ✗ | 88% ✓ |
| event abandonedCaravan | 3 | easy | 6.37 | 37% ✗ | 88% ✓ |
| event abandonedCaravan | 4 | easy | 6.21 | 44% ✗ | 88% ✓ |
| event abandonedCaravan | 5 | easy | 6.78 | 45% ✗ | 88% ✓ |
| event wantedOutlaw | 1 | hard | 5.89 | 1% ✗ | 55% ✓ |
| event wantedOutlaw | 2 | hard | 5.44 | 1% ✗ | 55% ✓ |
| event wantedOutlaw | 3 | hard | 5.24 | 6% ✓ | 55% ✓ |
| event wantedOutlaw | 4 | hard | 5.16 | 8% ✓ | 55% ✓ |
| event wantedOutlaw | 5 | hard | 5.17 | 13% ✓ | 55% ✓ |
| event monsterLair | 1 | hard | 5.28 | 1% ✗ | 59% ✓ |
| event monsterLair | 2 | hard | 5.56 | 1% ✗ | 56% ✓ |
| event monsterLair | 3 | hard | 4.91 | 14% ✓ | 56% ✓ |
| event monsterLair | 4 | hard | 5.45 | 13% ✓ | 56% ✓ |
| event monsterLair | 5 | hard | 5.46 | 18% ✗ | 55% ✓ |
| boss giantsHall | 4 | boss | 1.91 | — | 55% ✓ |
| boss dragonLair | 5 | boss | 1.07 | — | 56% ✓ |

Per difficulty (means, `npm run sim:quick`):

| tier | easy start | easy end | medium start | medium end | hard start | hard end |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 4% ✗ | 88% ✓ | 1% ✗ | 70% ✓ | 0% ✗ | 55% ✓ |
| 2 | 6% ✗ | 87% ✓ | 1% ✗ | 70% ✓ | 1% ✗ | 54% ✓ |
| 3 | 25% ✗ | 88% ✓ | 15% ✗ | 70% ✓ | 10% ✓ | 56% ✓ |
| 4 | 29% ✗ | 88% ✓ | 21% ✗ | 71% ✓ | 12% ✓ | 55% ✓ |
| 5 | 37% ✗ | 86% ✓ | 25% ✗ | 71% ✓ | 16% ✗ | 54% ✓ |

## 3. Dungeon assignment (ranked by end-of-tier odds; Rat Cellar ranks first, no tutorial exception)

| Tier | easy 1 | easy 2 | medium 1 | medium 2 | hard 1 | hard 2 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ratCellar | spiderBurrow | oldGraveyard | goblinWarren | smugglersCove | millRuins |
| 2 | sunkenFord | boarThicket | wolfDen | trollBridge | watchtower | barrowMounds |
| 3 | stormRidge | dwarfhold | witchMarsh | fungalGrotto | cinderHollow | hauntedMine |
| 4 | clockworkVault | thunderPlateau | harpyCliffs | frozenLake | orcWarcamp | boneField |
| 5 | stormIsle | abyssalDepths | ashenCitadel | titanRuins | wyvernPeaks | ossuary |

## 4. Fight sources beyond the table

None. Heists (thieves' guild) show odds but are a single-hero roll, not a fight, so they get no difficulty.

## 5. Wanted Outlaw

Not a spawn bug: it spawns as often as the other fight events (≈290 spawns in 30 days within 2 km of the sim's location). The bot skipped every visit on odds: an elite brute fight, below the bot's 60% bar for most of each tier. Refitted as hard it is now fought (1–2 per tier per profile in the new run).

## 6. Art needed (patrol markers use emoji; borrowed for now)

wolves 🐺 · orcs 👹 · spiders 🕷️ · eliteGoblins 👺 (goblins') · outlaws 🗡️ (bandits') · ogres 👹 · eliteOrcs 👹 · trolls 👹 · wraiths 👻 · wyverns 🐉 · golems 🗿

## 7. Simulator summary (4 seeds per profile, 256 s)

| Profile | Target | T1 | T2 | T3 | T4 | T5 | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| casual | 12–16 | 12 ⚠ | 25 ⚠ | 13 | 7 ⚠ | 12 | 69 |
| regular | 6–8 | 9 ⚠ | 12 ⚠ | 8 | 5 ⚠ | 6 ⚠ | 38 |
| heavy | 3–4 | 8 ⚠ | 6 ⚠ | 4 | 4 | 2 ⚠ | 26 |

Still out of range: tiers 1–2 slow, tiers 4–5 fast; "not prepared" odds far above 30–45% (the gap between prepared and not prepared is 4–27 pts); events and patrols end at 85–93% vs 70–80%; tier 3–5 bosses end above 60% (tier 4 up to 97%). Bottleneck: **stone in tier 2** — every profile spends more than it gathers (101–103%), and tier 2 is the slowest tier. Copper in tier 3 sits at 96–100%.

## 8. Stopped on

Nothing blocked. The implementer ran out of turns twice on step 3 (patrols), so that step was finished by hand.
