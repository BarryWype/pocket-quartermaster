# Map places and events: design catalogue

**Status: implemented**, secret places included. Don't implement anything new from this folder unless a prompt asks for it.

`density.csv` sets how far the nearest place of each kind should be, the matching density and visibility. Target: a 20-minute walk passes at least 2 places and 1 fight event, with about 16-18 places within 1.2 km plus fight events within 500 m: players should choose between several close places.

`places.csv` lists every place, event, fight event and secret place, with what it does and its lifetime.

## Rules
- Every place is temporary: it resets after 72 hours at most, even if nobody reached it; fight events last 24 hours. The village fair (weekends) is left out for now.
- Spawns are seeded like patrols: every player sees the same places at the same time.
- A used-up place (stock sold out, ruins dug, a fight won) disappears early.
- Places tied to a material above the player's tier show greyed out and locked.
- A place or event can carry 1 threat or 1 opportunity from the threat catalogue (`doc/design/threats/`).
- Shops sell small stocks (5-10 of a material).
- 4 key fragments make a mysterious key, which opens secret places and the Sealed vault.
- **Secret places**: a tip places a marker on the map; the place stays until it resets; entering uses up a mysterious key. Two tip sources each, never a place that sells a boss weakness item (tavern, hunting lodge, chapel, apothecary, market). Daily quests can become a third source later.

| Secret place | Tip sources | Gives |
| --- | --- | --- |
| Hidden den | Library (an old ledger), traveller | One random rare class, expensive |
| Black market | Thieves' guild heist, bandit camp (a fence's note) | One random rare class, expensive; 2-3 components or trinkets for gold |
| Underwater dungeon | Fishing dock, monster lair (a drowned captain's log) | A Rare item (Legendary ~5%) or a relic |
| Sealed vault | None: a dungeon opportunity | A Rare item (Legendary ~5%) or a relic |

- Once the hidden den exists, travellers stop offering rare classes and give the den tip instead.

## Open
- Spawn frequency of each place and event.
- Daily contracts and chains (later, not tied to taverns).
- Fish recipes.
