# Special abilities

Step 1 of the roadmap in `doc/ideas.md` ("Heroes, jobs and expeditions"). Designed 2026-11-04.

## What they are
- **Active** abilities, separate from the classes' existing **passive** abilities (`abilities` in `src/content/heroes.ts`, which stay as they are).
- Each hero has **one special**, rolled at recruitment from **its class's pool of 4** (`class-specials.csv`): three common rolls and one rare roll.
- Pools are set **class by class**, not by archetype. Abilities overlap between classes (Warrior and Barbarian share three), which keeps the catalogue small: 22 shared and 10 unique abilities (`specials.csv`).
- They fire **automatically** during fights (dungeons, overnight runs, patrols, fight events, place fights, Sanctums), by their own trigger, and show in the run's log.

## Rules
- **Effect and trigger are separate.** The effect is what happens; the trigger is when it fires on its own. Later, players will be able to "play" a special on a chosen fight (alongside gear and consumables), which only replaces the trigger.
- **Limited uses:** once per fight, or once per expedition for the strong ones (`uses` column).
- **Rare roll:** the class's `rare` ability, about 15% of rolls (config). The three common ones share the rest equally. A rare special is more striking, not stronger: every special should be worth about the same on average, and the simulator checks it.
- **Seen everywhere a hero is judged:** tavern and traveller offers, the hero card, the expedition and fight pickers, the report log.
- **Existing heroes** roll one through a save migration, seeded by hero id, so nobody is behind.

## Balance
- `npm run sim:specials` (about 2 minutes) gives one hero of the quick reference trio each special in turn and compares the win odds on every tier's chain dungeons with the same trio without specials. The table goes into `doc/design/simulator/report.md`.
- A special is flagged when its average gain is above 1.5× or below 0.5× the median gain. The numbers in `specials.csv` are the tuned ones; none is flagged.
- Steal only adds loot, so it never changes the odds: it is listed as loot only and never flagged.
- Some strong effects can fail, so their numbers can be tuned: a lost turn (Stagger, Entangle, Dirty trick, Deep freeze), Parley and Resurrection have a chance to work. A failed one still spends its use.
- Taunt also halves the damage its hero takes while it lasts, otherwise drawing the hits onto a frail hero costs the party. Feast heals 18% instead of to full.
- Parley's "no loot from it" has no effect: loot is rolled per source, not per enemy.
- Specials draw their random numbers from their own stream of the run's seed, so a special changes only what it does, not every later roll.

## Not in the first version
- More specials with levels (levels 10 and 20, pick 1 of 2, equip one).
- Manuals that teach or reroll a special.
- Playing a special by hand on a chosen fight.

## Files
- `specials.csv`: the catalogue (id, name, shared or unique, effect, trigger, uses). Numbers are a starting point for the simulator to tune.
- `class-specials.csv`: each class's pool (three common, one rare).
