# Map places and events: design catalogue

**Status: implemented**, secret places included. Don't implement anything new from this folder unless a prompt asks for it.

`density.csv` sets how far the nearest place of each kind should be, the matching density and visibility. Target: a 20-minute walk passes at least 2 places and 1 fight event, with about 16-18 places within 1.2 km plus fight events within 500 m: players should choose between several close places.

`places.csv` lists every place, event, fight event and secret place, with what it does and its lifetime.

## Rules
- Every place is temporary. Places last six days in three groups, one group changing every second day at 04:00 phone time (`doc/design/supply-lines/rotation.md`); fight events last 24 hours; the personal tavern two days. The village fair (weekends) is left out for now.
- Spawns are seeded like patrols: every player sees the same places at the same time.
- A used-up place (stock sold out, ruins dug, a fight won) disappears early.
- A place or event can carry 1 threat or 1 opportunity from the threat catalogue (`doc/design/threats/`).
- The six material shops (sawmill, quarry, copper and iron mines, coal pit, hunting lodge) left the map with the supply network (2026-11-18, `doc/design/supply-lines/replacements.md`); its buildings make those materials, and the market sells every material.
- 4 key fragments make a mysterious key, which opens secret places and the Sealed vault.
- **Secret places**: a tip places a marker on the map; the place stays until it resets; entering uses up a mysterious key. Two tip sources each, never a place that sells a boss weakness item (tavern, chapel, apothecary, market). Daily quests can become a third source later.

| Secret place | Tip sources | Gives |
| --- | --- | --- |
| Hidden den | Library (an old ledger), traveller | One random rare class, expensive |
| Black market | Thieves' guild heist, bandit camp (a fence's note) | One random rare class, expensive; 2-3 Rare trinkets for gold |
| Underwater dungeon | Fishing dock, monster lair (a drowned captain's log) | A Rare item (Legendary ~5%) or a relic |
| Sealed vault | None: a dungeon opportunity | A Rare item (Legendary ~5%) or a relic |

- Once the hidden den exists, travellers stop offering rare classes and give the den tip instead.

## Taverns
- Once taverns are open, the day's first map position always has a tavern within 800 m: a world tavern when one is there, else a personal one for the day.
- The personal tavern stands 300–700 m from that first position, on the first seeded spot that snaps onto a walkable place (seeded by player seed and rotation day, so it is stable for the day), and lasts until the rotation reset; its name and offers work like any tavern's.

## Open
- Spawn frequency of each place and event.
- Daily contracts and chains (later, not tied to taverns).
- Fish recipes.
