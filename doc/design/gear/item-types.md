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

## As built (2026-11-05)
- **Types:** `crossbow` (Speed −1, Pierce), `throwing` (Speed +1), `totem` (two-handed, Speed −1), `runestone` (Channel), `flasks` (`damageStat: 'wielder'`: the piece's Power counts as the wielder's class damage stat; `pieceDamageStat` in `src/game/equipment/damageStat.ts`). Stats from the usual budget maths (`gear-budget.py`, `equipment-tiers.csv`); 135 gear pieces in all.
- **Recipes:** crossbow wood + hide + main material; throwing hide + main; totem wood + bone + herb + main; runestone bone + herb at tier 1 (stone is a tier 2 material), stone at tier 2, stone + main after; flasks herb + berries + main.
- **Icons:** crossbow pale, long, spiked, bone, silver; throwing serrated knives, crescent blades, iron battleaxes, steel spears, steel axes; totem green, ox, red, feathered and a steel-tinted copy (`relics/totem-steel.png`); runestone fehu, serpent, double cross, othala, uruz; flasks empty bulb, then green, blue and orange bulbs and red round.
- **Ammunition:** the type id stays `quiver` (saves); only the display name changed. It fits bows and crossbows, and they take nothing else. Its icons are still crossbows.
- **Affix fits:** Piercing + crossbow, throwing; Cleaving + throwing; Channeling + runestone, totem; Reaching + crossbow; Staggering + throwing. All five roll the offensive pool and take Infused.
- **Work tools** (`src/content/workTools.ts`): ids `hatchet1`–`tongs5`, off-hand, no gear type (never forged, dropped, reforged or sold at smithies and markets), Common, no affixes. Stats are 30% of the off-hand budget (Armour and HP). Prices 5, 10, 20, 40, 80 gold by tier. Output +10, 12.5, 15, 17.5, 20% by tier; scavenge: a 50% chance of 1 unit per won fight (halved after the first full sim run put the forager and miner at up to 27% of walking) (expeditions, place fights, escorts; the miner's chosen ore, else its highest). They fit with no weapon or any one-handed weapon, but not with a bow or crossbow, which take ammunition only. Equipping settles the jobs first, so a tool's bonus counts only from then on.
- **Relic icons:** one each, listed in `doc/design/loot/relics.csv`. Four are tinted copies made for them: hedge-witch robes, Stormcaller robes, the lamp-staff and the drowned bell. The Siren's lute uses a horn, since the lute has no icon set. Restored relics show their icon (`gearIconOf`); other Legendaries get the gold frame.
- **Simulator:** reference teams and the bot use each class's favoured types; the bot buys and fits its workers' tools. `sim:quick`'s odds per tier are unchanged by this change (the fitted reference team's classes kept their weapons), so no refit. It also prints the old vs new reference weapon odds for the 10 classes whose favoured weapons changed. Biggest moves: smuggler (dagger → crossbow, about +10 to +30 points at tiers 2–5), druid and necromancer (wand → staff, +5 to +22 points); scholar and curse-breaker stay very low. The full report adds those and a work-tool table (output and scavenge against walking, 15% cap).
