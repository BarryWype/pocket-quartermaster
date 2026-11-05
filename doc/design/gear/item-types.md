# New item types and class affinities

Designed 2026-11-05 (step E of the gear brainstorm). Builds on the gear rework (`README.md`, `affixes.csv`).

## Why
Weapon styles were uneven: 10 melee classes had 7 weapon types, 5 ranged classes shared the bow, 11 casters shared 4 types. Several classes had no weapon of their own.

## Weapon styles after this change
| Style | Types | Classes |
|---|---|---|
| Melee, physical | sword, axe, mace, dagger, spear, warhammer, knuckles | 10 |
| Ranged, physical | bow, **crossbow**, **throwing weapons** | 5 (+ hybrids) |
| Magic | wand, staff, lute, censer, **totem**, **runestone**, **flasks** | 11 |

## New weapon types
| Type | Style | Hands | Notes | Icons |
|---|---|---|---|---|
| Crossbow | ranged physical | one weapon + ammunition | slower and harder-hitting than the bow | `crossbow-*` (20+) |
| Throwing weapons | ranged physical | one-handed | knives, crescents, axes, javelins; pairs with buckler, shield or off-hand blade | `dual-*` (11) |
| Totem | magic | two-handed | a big carved pole: slower, a bit stronger | `totem-*` (4, one more needed) |
| Runestone | magic | one-handed | pairs with focus or tome | `rune-*` (10) |
| Flasks | thrown | one-handed | hits with the thrower's own damage stat (Power or Magic); later bases by content (poison, fire, frost) | `bottle-*`, `potion-*` |

Billhook was considered and dropped (flasks cover the Alchemist; the crossbow covers the Engineer). Orb dropped (overlaps the focus off-hand). Grimoire becomes a base of the tome later.

## Off-hands
- The quiver becomes **Ammunition**: works with bows and crossbows. Variants (broadhead, light fletching, barbed, heavy bolts) come later as bases.
- Focus and tome also pair with totems? No: the totem is two-handed. They pair with runestones and wands.
- **Work tools** (new): an off-hand line for workers, always Common, no affixes, weak combat stats, no damage stat.

| Tool | Job | Sold only at |
|---|---|---|
| Hatchet | woodcutter | sawmill |
| Sickle | forager | apothecary |
| Snare | trapper | hunting lodge |
| Mining pick | miner | quarry, copper mine, iron mine |
| Tongs | charcoal burner | coal pit |

- A tool's own line: **+job output** on its job, and **scavenge**: +1 unit of its job's material(s) per won fight when the hero fights instead (weighted like the job). Tiers follow the player's highest tier; the bonus grows with tier. Durable, bought once per tier. Walk first: the simulator keeps tool output within the jobs' limits.
- Not the player's own tools (the pickaxe the player owns for gathering): those stay as they are.
- Satchel (hauling) parked for roadmap step 6. Flask bandolier dropped (flasks became a weapon).

## Class affinities (favoured weapons and armour)
Each class keeps the same number of favoured types as before. Changes in bold.

| Class | Weapons | Armour |
|---|---|---|
| Warrior | sword, spear, axe | plate, mail |
| Barbarian | axe, warhammer, knuckles | mail, leather |
| Paladin | sword, mace, warhammer | plate, mail |
| Duelist | sword, dagger, spear | leather |
| Exorcist | mace, warhammer | mail |
| Porter | axe, spear, warhammer | mail |
| Cook | axe, mace, dagger | mail, leather |
| Monk | spear, knuckles | leather, robes |
| Thief | dagger, knuckles, **throwing** (was sword) | leather |
| Gambler | dagger, **throwing** (was lute) | leather |
| Ranger | dagger, bow, spear | leather |
| Scout | dagger, bow, **crossbow** (was spear) | leather |
| Smuggler | **crossbow, throwing** (were dagger, bow) | leather |
| Engineer | **crossbow** (was bow), axe, **flasks** (was warhammer) | plate, mail |
| Beastmaster | axe, bow, spear | leather |
| Fire mage | wand, staff | robes |
| Frost mage | wand, staff | mail, robes |
| Sorcerer | wand, staff | robes |
| Cleric | staff, censer | mail |
| Druid | **totem** (was wand), staff | leather, robes |
| Troubadour | wand, lute | leather |
| Scholar | **runestone, flasks** (were wand, staff) | robes |
| Diplomat | wand, lute | leather, robes |
| Necromancer | **totem, runestone** (were wand, censer), staff | robes |
| Alchemist | wand, **flasks** (was censer) | leather, robes |
| Curse-breaker | **runestone, totem** (were wand, staff), censer | mail, robes |

Classes per weapon type: sword 3, axe 6, mace 3, dagger 6, spear 5, warhammer 4, knuckles 3, bow 3, crossbow 3, throwing 3, wand 6, staff 6, lute 2, censer 2, totem 3, runestone 3, flasks 3.

## Unique icons
- Every relic gets its own icon, chosen by hand (spare one-offs: `crossbow-fire`, `sword-ghost-blade`, `mace-arcane-morning-star`, gilded and ruby variants, gems, rings).
- Other Legendaries keep their base's icon with a gold Legendary frame.

## Later
Bases within types (sabre, longsword, rapier; ammunition variants; grimoire as a tome base; flask contents).
