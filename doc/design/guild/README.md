# Guild Hall: design catalogue

**Status: designed, not implemented.** Implement only what a prompt asks for.

The Guild Hall is the player's gold sink and progression outside heroes and gear. It's reworked for the new systems (loot, quests, secret places, relics).

## Principles
- **Never raises loot chances or win odds.** It gives capacity, convenience, gold, XP and discounts. Loot is tuned only in `doc/design/loot/matrix.csv`, and fights stay as hard as the simulator targets say (`doc/design/simulator/README.md`).
- **Done by tier 5**: every rank is gated by a tier boss beaten, at most tier 4's (so everything is available once the player reaches tier 5).
- **Data-driven gates**: ranks, effects, costs and gates live in config, with no special cases in code. Adding a tier later means adding ranks and gates in config.
- **No charters.** The charter item is removed (its Sanctum drop, inventory and UI). Milestone upgrades (Sigil cap, roster slots) are gated by tier bosses and gold only.

## Buildings and tracks
`tracks.csv` lists every track: kept, changed, moved, new or removed, with its ranks, effect per rank and the tier boss needed for each rank. Five buildings:
- **War room** (expeditions): hero XP, faster expeditions, better retreats.
- **Treasury**: gold, shards, Sigil cap, collector's contacts.
- **Barracks**: tavern discount, extra tavern offer, training, roster slots 7 and 8.
- **Quest board** (new): quest cap, extra reroll, step chests.
- **Workshop** (new): relic restoring, salvage, mastery.

## Costs
- Gold: rank r costs base cost × 1.8^(r − 1) (existing rule), with the existing exceptions.
- Materials on top for high ranks: the main material of the rank's gate tier (instead of fixed stone and copper).
- New tracks' base costs are proposals in `tracks.csv`; the simulator will tune them.
