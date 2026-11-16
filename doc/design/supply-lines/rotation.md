# The six-day rotation · proposal (step 2)

**Status: proposal, for review.** Nothing below is built yet. Once approved and built, its rules move into the README.

## How places work today

- **Groups** (`src/content/places.ts`): every place kind except fight events is its own group, with a 72 h window, a density per km² and a visibility of 1.2 km. Fight events are one mixed group: 24 h windows, 500 m visibility.
- **Generation** (`src/game/places/generate.ts`, `generateTilePlaces`): for each group and geohash tile, the slot count follows the tile's area and density. **Each slot has its own random phase** within the window, so places in an area change one at a time, at any hour. A slot's kind, position and id (`place:<kind>:<tile>:<slot>:<window>`) are drawn from the group, tile, slot and window number. Same for every player.
- **Taverns** are the `tavern` place group (`src/game/taverns/taverns.ts`); only their recruits change, on each rotation day (00:00 UTC).
- **The tavern guarantee** (`src/game/taverns/personal.ts`): once a day, if no world tavern is within 800 m of the day's first map position, the player gets a personal tavern 300 to 700 m away until the next reset.
- **Callers:** the map, quest targets (`useQuestPlaces`, `quests/targets.ts`), Pocket mode's "nearby" alerts (in the background task), monster lair fights, supply danger, the debug screen and the simulator. All go through `placesAround`, `placesWithin` or `generateTilePlaces`.

## The change

### Six days, three groups

- With the switch on, **every place group except fight events** gets a **6-day (144 h) window** instead of 72 h: taverns, shops, chapels, markets, ruins, libraries, thieves' guilds, monster lairs, fishing docks, and the sites to come. Fight events keep their 24 h and their random phases.
- **Each slot belongs to one of three groups**, drawn from the same seed that sets its phase today (group id, tile, slot). That keeps it shared and deterministic.
- **Group *g* is replaced on day 2*g* of every 6-day cycle**, at the rotation reset (00:00 UTC, 1 pm in New Zealand), with the cycle counted from the rotation's start day (1 January 2026). So every second day, at the reset, one third of the map changes, and two thirds hold.
- **In code:** a group gains `phases: 3`; `generateTilePlaces` aligns those slots' windows to the reset and to their group instead of a random offset. The density, placement, kinds and the id format stay as they are, so a place's id still names its window.

### How the switch reaches every caller

Every caller must agree, or a quest would point at a place the map doesn't show. Two ways:

1. **Recommended: an explicit argument.** `placeGroupsFor(network: boolean)` returns the right list, and `placesAround`, `placesWithin` and `placeGroupOf` take it **without a default**, so the compiler finds every call site. The app passes the setting, the simulator passes its `--supply-lines` flag, and the background task gets the flag in the snapshot the foreground already writes for it (`syncBackground`), like its other settings.
2. A module-level mode set by the settings store. Fewer edits, but the background task and the simulator would each have to set it, and a forgotten path fails silently.

### The guarantees

- **A tavern within 800 m:** unchanged. The daily check looks at whichever world taverns exist under the active rule. With 6-day taverns, a player near a tavern keeps it for days, and the personal tavern is needed less often.
- **The personal tavern** keeps its one-day life: it's a fallback, re-checked each day.
- **Density:** unchanged at any moment. Longer windows only mean less churn, so about half as many places change hands per week.

## When the switch is flipped

The switch's description will say so: *"Turning this on or off regenerates the places on the map."*

| What | Tied to a place by | On a flip |
| --- | --- | --- |
| **Daily quests** with a place target | the place's id, position and expiry, stored on the quest | Their target is set to expire at once, so the existing retarget picks a live place of the same kind. Progress and the quest's own expiry are kept. |
| **Shops sold out, ruins dug, places won** (`usedPlaces`) | place id | Old ids match nothing, so the new places are fresh. The entries are pruned at their stored expiry, as now. |
| **Shop purchases** (`placePurchases`), **chapel care** (`chapelVisits`) | place id | Same: the new places start fresh. |
| **Dug ruins** and their 24 h replacement | the dig's own record (id, time, position) | Unchanged: a replacement ruin still grows nearby a day after a dig, whichever rule is on. It keeps its own lifetime (`ruinRules.lifetimeHours`), outside the three groups, and gets a ring like any place. |
| **Fights at lairs and fight events**, **heists** under way | the fight's own record (heroes, end time, result) | Finish as normal; they don't need the place to still exist. |
| **Secret tips** | a position, not a place | Unaffected. |
| **Tavern recruits taken** | offer id | Unaffected; offers refresh daily anyway. |
| **Seen place kinds** (quest unlocks) | kind | Unaffected. |
| **Pocket mode "nearby"** | kinds, recomputed on each sync | Follows the flag from the next sync. |

So a flip can restock a shop the player had emptied, which doesn't matter for a developer switch.

## The data test

One test (`src/game/places/rotation.test.ts`) over a seeded year, sampled every hour across a 3 × 3 block of precision-5 tiles around the Wellington fixture:

- **Ages:** at any sampled moment, the share of live places in each third of their life (0–2 days, 2–4 days, 4–6 days old) is between 28% and 38%.
- **Churn:** on every day of the year, the share of places replaced at that day's reset is at most 40% (about 33% on change days, 0 on the others).
- **Fight events** still change on their own 24 h phases.
- **With the switch off**, the places generated are exactly today's (same ids at the same times).

## Questions for you

1. **Explicit argument (recommended) or module-level mode?**
2. **The change moment:** the rotation reset (00:00 UTC, 1 pm in New Zealand), shared with dungeons and recruits. Or would you rather it fell at night, say 15:00 UTC (4 am in New Zealand)?
3. **Monster lairs** last six days like other places, so they weigh on route danger for longer. Keep them in, or leave lairs at 72 h with the fight events?
4. **The personal tavern:** keep its one-day life, or make it last until the next group change (2 days)?
