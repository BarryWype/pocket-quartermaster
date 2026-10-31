# Quests: design catalogue

**Status: designed, not implemented.** Implement only what a prompt asks for.

Daily **quests** are short walking objectives that arrive on their own. They replace the old "daily contracts" outline in `doc/ideas.md`. Today's quests (dungeon-like runs launched from the phone, including the overnight one) are renamed back to **expeditions** (the overnight quest becomes the **overnight expedition**).

## Rules
- **Arrival**: 2–3 new quests every 24 h, stacking up to 6. No board to walk to; they appear in the quests list (the floating menu bar).
- **Variety**: at most one active quest per objective (`maxPerObjective` in `src/content/quests.ts`); when every objective the player can get is already active, the day's remaining slots stay empty rather than repeat one. A reroll may land on a taken objective, since the player asked for the exchange.
- **Counting from arrival**: walk, gather and patrol objectives count everything from the moment the quest **arrives** — not from when the player first opens the list. Opening the list only fixes a place target; players never lose a walk for not having looked. Every active quest of those kinds counts the same walk, independently, in the app and in Pocket mode.
- **Lifetime**: 48 h each. Ignoring a quest costs nothing. One free reroll per day.
- **Distance bands**: short **500 m**, medium **1 km**, long **2 km**. Nothing in a quest is ever more than 2 km away (straight line from where the quest was given). Rewards grow with the band.
- **Targets**: "the nearest X" that exists within the band's distance. If no place of that kind is within range (rarer places are often more than 2 km away), pick another objective. Only kinds the player has seen or unlocked, at their tier (`objectives.csv`).
- **No extra patrols along the route**: players will have a quest active most of the time.
- **Pocket mode**: reaching the target sends a notification; the step resolves when the app opens (as patrols do).
- **Rewards**: the "Quest, short / medium / long" rows of `doc/design/loot/matrix.csv`.

## Secret quest
- Pops when the player **completes 4 quests within 5 hours**. A player gets at most 3 a day and can stack 6, so it takes saving quests for one long outing.
- **At most one secret quest a day.**
- It's a single objective close by, and gives the **tip for a secret place within about 1 km** of where it popped (never another 2 km walk). The place still needs a mysterious key.
- Quests become the third tip source for the hidden den, black market and underwater dungeon.

## Chain quest (later, not in the first prompt)
- Pops once a week, starting after the player's first week.
- 4 steps, each a normal quest objective with a line of story; each step's target is within 1 km of the previous one.
- Stays in the quests list until the next chain pops; only one chain at a time.
- Ends with a key fragment and something extra (a relic now and then).

## Rewards: rows to add to `doc/design/loot/matrix.csv`
Added by the quests prompt (with the rename of "Overnight quest" to "Overnight expedition"), so the content test and the CSV change together. Quests are a walking source, so materials are allowed.

| Source | Visits/day | Gold | XP | Materials | Shards | Blueprints | Gear | Trinkets | Components | Relics | Monster parts | Valuables | Consumables | Treasure maps | Manuals | Key fragments | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Quest, short (500 m) | 1.2 | A | — | O | — | — | R | — | — | — | S | S | S | R | — | R/2 | |
| Quest, medium (1 km) | 0.9 | A | — | O | R | R | S | R | — | — | S | S | S | R | R | R | |
| Quest, long (2 km) | 0.4 | A | — | A | S | S | S | S | R | R | O | O | S | S | S | R | |
| Secret quest | 0.15 | A | — | — | — | — | — | — | — | — | — | S | — | — | — | — | Gives a secret place tip within ~1 km |

With these rows the regular player gets about 6 key fragments a week (a key every 4–5 days) and about 8 training manuals a week.
