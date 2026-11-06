# Families

Designed 2026-11-06. One system for building a team: **family tags** counted across the party unlock set bonuses, like item sets in ARPGs but across the whole team. It replaces approaches, threat keywords and kits as the way threats are answered, and gives builds their names ("a Faith Bulwark", "a Pack of Wild beasts").

## The rules
- **15 families** (`families.csv`): 7 that answer a threat (Faith, Wild, Watch, Cunning, Venom, Warding, Breaker) and 8 playstyles (Bulwark, Bloodrage, Shadow, Volley, Spellweave, Pack, Rally, Plunder).
- **Three levels**, by the number of the family's tags in the party: **2, 4 and 6**. A threat family's level N answers its threat at level N, plus its own effect; a playstyle's levels build on its hook.
- **Tags:**
  - **1 per class** (`class-tags.csv`).
  - **1 per item type** (`item-tags.csv`); a **two-handed weapon counts 2** (it takes the off-hand's place).
  - **Trinkets and work tools: none.**
  - **Rare extras:** some relics carry a second tag; later, a few rare or named trinkets and progression-tree nodes. Keep them scarce: about 2–3 extra tags for a well-equipped endgame party.
- **Reach:** a party of 3 has 3 class tags and up to 9 item tags: 12. Fully focused, two families at level 3; or a main, a secondary and a splash (6 + 4 + 2).
- **No free families:** no class has more than one favoured weapon or armour type in its own family, so a class's natural gear never stacks its family (`item-tags.csv` was solved for this). The simulator checks that a party in its favoured gear, picked without regard to families, rarely passes level 1.
- **Every family has at least one weapon type**, so any family can be reached through items with any heroes (e.g. Venom through flasks or daggers before the Alchemist appears).

## Threats after this change
Seven, one per threat family: **Holy** (undead, desecrated ground), **Beasts**, **Darkness** (darkness, ambush), **Traps** (traps, obstacles), **Poison**, **Element** (5 elements), **Armoured**. Removed: Brute, Locals, Swarm, Casters, Thieves, Maze, Underwater. The three obstacles (rubble, locked, puzzle) merge into Traps. Penalties for an unanswered threat stay as they are per threat (merged threats keep one penalty; briefings may keep flavour variants).

## Opportunities
Answered by families instead of approaches (e.g. hidden cache and sealed vault: Cunning or Plunder; rich vein: Breaker; bounty, prisoners, refugees: Rally; forgotten shrine: Faith; old inscriptions: Watch; trophy beast: Wild). The exact mapping is part of the build.

## What it removes
- **Approaches** (might, finesse, wits, faith, presence), their milestone picks and approach scores.
- **Threat keywords** (calm, blessed, guard, antidote, cleave, light, watchful, pierce) as threat answers. Gear keywords that do something in combat on their own are reviewed in the build: kept as plain effects, or folded into families.
- **Kits**, entirely (provisions keep meals, potions and supplies).
- **Components**, entirely: boss and elite drops become relics (some with a second tag) or monster parts; blueprint overflow becomes monster parts or gold; held components convert in the save migration; gear with a keyword affix gets a matching part affix.
- **The "Steady vs threat" affix.**

## What stays
- Affixes from monster parts at the forge, and the forge flow.
- Specials, jobs, the gear rework.

## Later
- The Armory screen (heroes, gear and forge in one place) with the family strip as its centrepiece.
- A global numbers pass ("week-1 targets": crafts, rares, parts, roster 8).
- More ways to recruit (rescues, quest rewards, mercenary contracts, wanted heroes).
