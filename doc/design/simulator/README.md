# Simulator: design spec

**Status: implemented.** `npm run sim` writes `report.md` and `summary.json` next to this file; `npm run sim:check` runs the balance band tests on them.

The simulator plays the game with simple bots, for several player profiles, and checks the results against targets. It's the balancing tool for the release.

## Priorities
1. **Pace**, judged on the **regular** player first, the casual player second. We don't want to lose regular players because a tier takes too long, but the game should give a fair amount of play.
2. **Win odds**, nearly as important as pace. Expeditions and encounters must never be "tap Start and win". **For now, a little too hard is better than too easy.**
3. Everything else (loot pacing, gold, materials, levels) supports those two.

## Player profiles (per day)
| Profile | Expeditions | Quests | Walking | Step chests | Other |
| --- | --- | --- | --- | --- | --- |
| Casual | 3 | 2 | One 20-minute walk | 1 | 1 patrol, 1 fight event, ruins every other day |
| Regular | 7 (one is the first win) + 1 overnight | 3 | Two walks | 2 | 4 patrols, 3 fight events, 1 ruins dig (the visits column of `doc/design/loot/matrix.csv`) |
| Heavy | 12 + 1 overnight | 3 + a secret quest every other day | Three walks | 4 | 6 patrols, 5 fight events, 2 ruins digs |

## Targets
| Target | Value |
| --- | --- |
| Days per tier | Regular **about 7**, casual **about 14**, heavy **3–4** |
| Win odds, normal expedition, team prepared (right kits, gear of the tier) | **65–75%** |
| Win odds, normal expedition, team not prepared (no kits for the threats) | **30–45%** |
| Win odds, tier boss, prepared | **50–60%** |
| Win odds, fight events and patrols, prepared | 70–80% |
| Loot pacing | Within 20% of `doc/design/loot/tools/pacing.py` for the regular profile |
| Gold | Income covers recruits, healing, shops and weakness items with a small surplus; never piles up over a tier |
| Materials | The tier's main material stays tight (spent about as fast as it's gathered) |
| Levels | Heroes reach the top of the tier's level band around the end of the tier |

"Prepared" vs "not prepared" is the point of the toolbox design: the gap between the two lines must stay wide. If the bot wins without kits, the game is too easy.

## Bot rules (simple, not clever)
- **Before a run**: kits for the threats it can answer; a charm only when its odds are already high (the safe-or-greedy choice); a potion otherwise.
- **Forge**: the best known blueprint for each hero's slots; a component on the best fitting item; restore a relic when its type fits a hero.
- **Inventory**: equip the best trinket by its stat; sell valuables at the market (to the collector when it wants one); craft charms and part potions when it has the parts.
- **Map**: do quests (all in the regular and heavy profiles), dig ruins, open a secret place when it has a key and a tip, recruit rare classes.
- **Team**: field the three heroes with the best answers to the dungeon's threats.

## Health reports
These catch design problems, not just balance:
- **Pile-ups**: items whose stock keeps growing and never gets used.
- **Dead content**: items, recipes, classes or places the bot never uses.
- **Class spread**: how often each class is fielded.
- **Milestones**: days to the first key, the first secret place, the first relic, the first component.
- **Win odds per tier**, prepared and not prepared, against the targets above.

## Notes for the design
- With about 7 days per tier, a regular player finds about 12 of a tier's 22 blueprints before moving on. That's acceptable (types the roster favours come first), but the loot pacing table's target ("a tier's 22 in about 2 weeks") is now a stretch goal, not a requirement.
- 5 tiers at about a week each is about 5 weeks to the last tier for a regular player. Play after that relies on the tier 5 loop (relics, components, secret places, quests).
- The balance band tests (`src/game/sim/bands.test.ts`, targets in `targets.ts`) stay skipped until tuning brings the numbers in range; `npm run sim:check` runs them on demand.
