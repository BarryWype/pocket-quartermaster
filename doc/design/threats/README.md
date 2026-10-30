# Threats, answers and gear: design catalogue

**Status: design only, not implemented.** Don't implement anything from this folder unless a prompt asks for it. Prompts will point to the files they need.

The game is moving to a "problems first" model: dungeons, patrols and exploration places show **threats** (and sometimes a **restriction** and an **opportunity**), and the player builds the team's toolbox to answer them with **approaches**, **keywords**, **kits** and **gear**.

## Files

| File | One row per | Notes |
| --- | --- | --- |
| `stats.csv` | Combat stat | What it does, what it was, one growth step |
| `growth.csv` | Growth rule | What grows every level, at milestones, and the recruitment roll |
| `infusion.csv` | Weapon damage type | How elemental infusion works |
| `slots.csv` | Equipment slot | Contents, role, where items come from |
| `loot-types.csv` | Loot type | What it is, how it feeds crafting, quality rule |
| `equipment-profiles.csv` | Weapon, armour or off-hand type | Hands, extras (Speed, Crit, Evasion, approach, keywords) and how the rest of the budget is split |
| `equipment-tiers.csv` | Type × tier | The resulting stats at each of the 5 tiers |
| `equipment-check-offence.csv`, `equipment-check-defence.csv` | Loadout | Quick check of damage and effective HP at tier 3 (not the simulator) |
| `affinities.csv` | Class | Favoured, usable or unfit for each weapon and armour type |
| `equipment-check-caster.csv` | Hero × armour | Magic and effective HP for casters in each armour (casting penalty) |
| `equipment-recipes.csv` | Type × tier | Recipe inputs |
| `item-names.csv` | Type | Item name at each tier |
| `consumables.csv` | Consumable | New alchemy and kitchen items: use, effect, tier, proposed recipe |
| `levels.csv` | Threat level | Score needed to meet a threat at each level |
| `threats.csv` | Threat | Answer, kit or gear, penalty per level, where it appears |
| `restrictions.csv` | Restriction | What it removes or weakens |
| `opportunities.csv` | Opportunity | Answer or cost, reward, where it appears |
| `kits.csv` | Kit | Threats covered, effect, materials, contents |
| `gear-keywords.csv` | Gear keyword | Effect and the threat it answers (if any) |
| `weapons.csv` | Weapon type | Keyword grid |
| `armour.csv` | Armour type | Keyword grid |
| `classes.csv` | Class | Family, rarity, approach and keyword strengths, signature |
| `boss-weaknesses.csv` | Tier boss | Weakness item, where it's found, effect |
| `coverage.csv` | Threat | Which kits and gear answer it, and how many item sources |
| `legacy-mapping.csv` | Existing system | What it becomes in the new model |

## Conventions

- `1` / `0` columns are yes / no (keyword present, appears in dungeons, etc.).
- `Dungeon`, `Patrol`, `Exploration` columns say where a threat or opportunity can appear.
- Percentages and multipliers are written as text in the level columns (for example `12% per trap`, `×1.5`), since they are design targets, not final numbers. The simulator will tune them.
- Class strengths are marked, not scored: approach scores (0–5) aren't set yet.

## Core rules

- **Combat stats**: HP, Power, Magic, Armour, Resistance, Evasion (cap 40%), Speed, Crit, plus Luck (born with, rare heroes only). The weapon decides whether a hero deals Power (physical) or Magic (elemental) damage.
- **Growth**: max level 15 (no XP gained there); the class's 3 primary stats grow every level; utility classes also grow their damage stat at half rate; every secondary stat grows at levels 5, 10 and 15; the player picks +1 approach at levels 5 and 10; +1 Luck at level 15.
- **Recruitment roll**: 3d6 per stat (base ±15%, growth ±8%), shown as a C / B / A / S grade, seeded by tavern and day.
- **Approaches** (0–5 per hero): Might, Finesse, Wits, Faith, Presence.
- **Threat levels**: 1 Light, 2 Strong, 3 Extreme. An approach threat needs the best hero's score at 2 / 3 / 4; a keyword threat needs 1 / 2 / 3 heroes with the keyword.
- A **kit** adds +2 to its carrier's approach score, or gives its carrier the keyword.
- **Met**: no penalty. **One short**: half penalty. **More than one short**: full penalty. Never an automatic failure.
- **Kits** and consumables share the hero's single consumable slot, are single-use and gone after the run, even if unused.
- **Combat threats** (Undead, Armoured, Swarm, Brute) are answered by gear keywords, not kits.
- **Composition**: early tiers 1 threat; mid tiers 2 threats + 1 opportunity; high tiers the same + sometimes 1 restriction; bosses 3 threats. Patrols 1 threat. Exploration places 1 threat or 1 opportunity.
- In one dungeon: at most one Obstacle threat (rubble, locked, puzzle), and never two threats answered by the same kit. Two threats of the same category (for example Undead + Swarm) are fine.
- **Progression:** each threat has a first tier (`First tier` in `threats.csv`): it appears at level 1 in that tier, can reach level 2 one tier later and level 3 two tiers later. Kits have their own tier (`Available from tier` in `kits.csv`) and use that tier's main material, so they compete with gear on purpose. A threat can appear before its kit exists (classes, approaches, another dungeon or accepting the penalty still work), but until then its draw weight is halved and its level is capped at 1. This affects Element (tiers 1-3, ward salve at tier 4) and Puzzle and Maze (tier 4, Scholar's satchel at tier 5). Kits cost about 3 units.
- Content is balanced for common classes. A rare class makes a dungeon easier, but is never required.

- **Equipment**: 4 equipment slots (weapon, armour, off-hand, trinket) + the consumable slot; two-handed weapons also take the off-hand. A bow works alone; a quiver (bow only) adds a bonus on top. Crafting gives the stats, loot gives the effects: a looted item never beats the best craftable item of its tier on stats. Trinkets are never crafted.
- **Quality**: regular crafting follows mastery; recipes with a component and restored relics are at least Rare with a much better Legendary chance. Luck only appears on Legendary items.

- **Equipment budget**: every item of a tier gets the same budget (tier 1: weapon 5, armour 6, off-hand 3 points; 1 point = 1 Power, Magic, Armour or Resistance, or 10 HP), scaled by enemy strength per tier (×1, ×1.9, ×3, ×4.2, ×5.6). Extras (Speed, Crit, Evasion, approach, keywords) cost a share of the budget; Heavy refunds some. Two-handed weapons (warhammer, staff) absorb 90% of the off-hand budget. `tools/gear-budget.py` regenerates the equipment CSVs: `python3 tools/gear-budget.py <output folder>`.

- **Affinities**: each weapon and armour type is Favoured (item stats ×1.2), Usable (×1.0) or Unfit (×0.6) for a class. Keywords always work, even on an unfit item. Nothing is restricted. Off-hands and trinkets are open to every class (off-hands keep their mechanical constraints). Shown as a green ▲ (favoured) or a red ▼ (unfit).
- **Casting in metal**: mail gives −15% Magic and plate −30% Magic, unless that armour is favoured for the hero's class. Robes put part of their budget into Magic.

- **Recipes**: every type has one recipe pattern; the tier only swaps the main material (tier 1 wood or bone, tier 2 stone, tier 3 copper, tier 4 iron, tier 5 steel). Weapons and off-hands cost about 3–4 units, armour and two-handed weapons 6. Each type and tier is its own blueprint (110 in total), looted one at a time: the first dungeon cleared in a new tier drops a blueprint of that tier, and the first dungeon of each day drops one of that dungeon's tier (an unknown one, weighted towards types the roster favours; mastery XP or a component once all are known). Recruits, events, travellers and shops are other sources. A component recipe is the type's recipe with one secondary material replaced by the component; it needs the base blueprint at the chosen tier and no blueprint of its own. A relic needs no blueprint and teaches none: it is a one-off item, and restoring it costs its type's recipe at its tier ×1.5 and turns it into the finished item (never in the craftable list; two relics make two items). The player starts with two tier 1 blueprints (one weapon, one armour); the first tutorial dungeon gives a third. See `doc/design/loot/`.

- **Consumables**: hero consumables (elixirs, bombs, oils) share the consumable slot with kits and are single-use with salvage; meals are one per expedition for the party; walking consumables are used on the map; home care heals or rests heroes at home. About 3 units each, using their tier's main material for alchemy; kitchen items use food materials.
- **Infusion**: salvaging an infused weapon refunds 8 of its 10 shards, so an infusion carries over to the next tier's weapon for 2 shards. Elemental oil gives the same effect for one run (2 shards) but takes the consumable slot.

- **Classes**: every class has 8 approach points (`Might score`…`Presence score` in `classes.csv`; the Gambler's are rolled daily). Base stats follow the existing pattern: primary stats start higher. Classes join the tavern pool by tier (`Tavern pool from tier`); a class that just opened has double weight during its tier; within the pool, the rarity weighting applies (common 60%, uncommon 40%). Rare classes (Necromancer, Beastmaster, Curse-breaker) come from secret places later; until then about 5% of traveller recruits offer one. The Porter's carried kit takes the Porter's own consumable slot.

## Known gaps

- Charms (rabbit's foot, lucky tooth) need a redesign: they should affect what a run finds (Luck, blueprint, component and relic chances, materials). Parked until the loot rework.

- Guard comes from plate, the shield (off-hand) and the Paladin class.
- Exact numbers for class signatures are still to propose.
- Hide is in demand (gear, leather, kits) while animals are rarer than plants: check gathering yields during balancing.
- The equipment check doesn't model support value (Inspire, Mend, approaches) or defensive keywords on weapons (Parry, Reach, Brace), so support and defensive loadouts look weaker than they are.
