# Loot: design catalogue

**Status: implemented** (loot base, monster parts and loot trinkets, blueprints, trophies and relics, trinkets). Components were removed in the families rework (see Trophies); valuables and the market collector were removed later, their worth folded into gold. The source for discussion is the Loot Design doc; this folder is the version to build from, and `matrix.csv` wins over any table elsewhere.

Loot is designed from scratch on top of the new dungeons, bosses, places, events and shops, not on the old reward code.

## Principles
1. **Materials only where you walk**: gathering, shops, map events, patrols, ruins, the monster lair. Expeditions launched from the phone give no materials. **The one exception is the foothold**: a tier boss's first clear gives the next tier's blueprint of the weapon of choice of the starting-trio class the player fields most (its most levelled hero stands for that), with that tier's main material for one craft of it, so a new tier never opens with nothing to forge (`nextTierReward`). The same clear gives the next tier's armour and helmet blueprints and one piece of its gear, and the tier 2 boss an elemental stone for tier 3, the elemental tier (`lootConfig.bossStones`).
2. **Loot feeds the forge instead of replacing it**: looted gear is random and usually average; forging gives the chosen type and an ingredient's affix (see `doc/design/gear/`). Most looted gear is salvaged into materials.
3. **Something after every fight**: monster parts make every win rewarding without handing out gear every time.
4. **Tuning is cheap** (see below): no loot numbers in logic.

## Files
| File | What |
| --- | --- |
| `matrix.csv` | What drops where: one row per source, one mark per category (`—`, `R/2`, `R`, `S`, `O`, `A`), visits per day for the regular player, notes |
| `reward-types.csv` | Every reward type and its rule |
| `qualities.csv` | Gear qualities. Superseded by the gear rework (`doc/design/gear/`): rarity and affixes replace them |
| `treasure-maps.csv`, `training-manuals.csv` | Map rarity (distance, loot); manual XP cap by tier band |
| `monster-parts.csv` | 12 parts, one per enemy family tag, and their uses |
| `trinkets.csv` | Trinket kinds, plus the nine loot trinkets and their recipes |
| `part-recipes.csv` | Potions made with parts: second recipes and part-only recipes, plus Viper oil |
| `components.csv` | **Removed** in the families rework; kept as a record of the 13 components that boss and elite drops used to give |
| `relics.csv` | 25 relics: tier, type, unique effect |
| `purposes.csv` | Purpose tags on base items, with icons |
| `enemy-tags.csv` | Every enemy's family tags, in order (from the enemy tags change) |
| `tools/pacing.py` | Weekly drops for the regular player from `matrix.csv` |

## Rules

### Rolls
- Each category is rolled separately on a win, with the chance of its mark: R 7%, R/2 3.5%, S 25%, O 60%, A 100%.
- **Run length**: for dungeon runs and overnight expeditions, every R/2, R, S and O chance is multiplied by run minutes ÷ 45 (between ×0.25 and ×2, never above 95%). The first win of the day isn't scaled.
- **Luck**: the party's total Luck multiplies every non-A chance by 1% per point (up to +30%); every 10 points add +1 to the looted gear rarity roll. Never touches A drops or amounts.
- **Loot trinkets**: worn in the trinket slot, so permanent. A "×1.25" one multiplies that category's chance (with Luck, never above 95%); the others give +10% gold, +8% XP, or a 50% chance of one rarity step on looted gear. The same modifier id from two heroes counts once.
- **Quantities per drop**: gold and XP by tier and source (existing scaling); materials 2–4 of the tier's materials; shards 2–4 of one element; monster parts 1–2 (2–3 on A sources); everything else 1.
- **Step chests**: at 2,000, 5,000, 8,000 and 12,000 steps each day, each rolling the Step chest row; the third and fourth roll at ×1.5.
- **Ruins**: every 5th dig gives a relic (progress kept across ruins).

### Tuning
- Every source's chances come from `matrix.csv`, generated into content. Logic only reads it.
- Marks map to chances in one place, with a **multiplier per category** and a **multiplier per source** on top (all 1 by default).
- A pacing report in the simulator gives the same weekly numbers as `tools/pacing.py`, so design and code can be compared.
- Debug: show a source's roll table with its final chances (after Luck, loot trinkets, run length); force a drop.
- Pacing balance tests come later, skipped until balancing.
- Gold follows one curve per tier, ×1, ×1.9, ×3, ×4.2, ×5.6 for tiers 1–5 (the enemy strength curve; `lootConfig.goldByTier`): dungeon and overnight gold, the first-win and first-clear bonuses, every source paid as a share of the tier's short dungeon (quests, step chests, treasure spots, patrols, fight events) and a duplicate secret tip. Dungeon rows also pay their finds as gold, with no roll (`lootConfig.dungeonFinds`): `worth` × the tier's gold curve × the row's find chance, scaled like a drop chance.

### Targets
Families ask players to swap gear for each place, over four gear slots (weapon, armour, helmet, off-hand) plus trinkets, so looted gear is set for that:
- **Pieces:** about **36 gear pieces a week** for the regular player (trinkets apart), `pacing.py`'s Gear row (it was 26.8 for three slots, ×4/3 for the helmet).
- **Rares:** about one every **2–3 days** for the regular player, every **4–5 days** for the casual player.
- **Legendaries:** clearly rarer than Rares on every ladder and source, about **one per tier** for the regular player.
- The simulator checks them (`src/game/sim/targets.ts`, `gear`), with the gear pieces per week by source in its report.

### Gear as loot
- Stats, rarity and affixes: see `doc/design/gear/` (stat ranges on 3d6, rarity = number of affixes, loot rarity from each source's ladder). Quality and crafting mastery are superseded by the gear rework (`doc/design/gear/`).
- Rarity: the source ladders keep their order, basic < big fights < bosses < monster lair (`lootConfig.gearRarity`): basic is 70% Common, 30% Uncommon, then its own upgrade roll gives a Rare 2.5% and a Legendary 1% of the time; big fights 35/30/30/5% and bosses 20/30/40/10% (Common, Uncommon, Rare, Legendary). On every ladder a Legendary is at most half as likely as a Rare, with up to 29 Luck.
- Rarity steps (Hard sources, the Tinker's lodestone, Plunder) lift a piece up to Rare at most: a Legendary only comes from a ladder's own roll. (A step used to lift Rares to Legendary, so the Hard wanted outlaw dropped more Legendaries than Rares and every piece from the monster lair was Legendary.)
- Type: random, but 30% of the time (`lootConfig.usefulDrops`) one of the useful types (`src/game/loot/useful.ts`): the types carrying a threat family that one of the briefings open at the player's tier needs and that no free hero can wear yet (a free hero could wear the type, but the roster holds no piece of it of the tier or one below that isn't away on a run); failing those, the types some hero could wear that the roster owns none of. Rolls without a clock (the background escort) stay random.
- Tier: expeditions give the dungeon's tier; map events, patrols and the lair give the player's tier 70% of the time, one below 30%, never more than one below.

### Inventory
- The gear inventory has no cap, so more loot never turns pieces away; a regular player who never salvages gains about 45 pieces a week (gear and trinkets). No auto-salvage for now (revisit if the gear page gets unwieldy).
- Salvage gives back a share of the piece's recipe by rarity (40% for a Common, at least 1 of the first input) for every gear type and tier, helmets included, or gold for a trinket; never a monster part.

### Blueprints
- One per forgeable type and tier (110). Never a duplicate: a drop picks an unknown one of the source's tier, weighted towards types the roster favours. Once the tier is complete it gives 2–3 monster parts of the enemies' family instead, or gold (30 × the tier's gold curve) from a source without enemies (`lootConfig.blueprints`).
- The player starts with two tier 1 blueprints (one weapon, one armour). The first tutorial dungeon (always won) gives a third through the normal first-win-of-the-day rule.

### Monster parts and loot trinkets
- Each part belongs to an enemy family tag (`monster-parts.csv`). An enemy with several tags can drop the part of any of them; its first tag counts double. Elemental enemies (`elemental` tag) drop shards of their element instead of a part.
- Parts are sellable at the hunting lodge or the apothecary.
- A loot trinket or part recipe unlocks the first time the player gets its part: no blueprint.
- **Loot trinkets** are worn in the trinket slot — one slot, so a combat trinket and a loot trinket compete for it. They raise what the wearer's runs find, never materials, and are forged from 8 parts at the forge (the Lucky ear is gone). They drop with weight 1 among the trinket groups.
- **Part recipes**: a part replaces one secondary ingredient of an existing potion; the tier's main material stays. Common potions keep both recipes (same item, stacks), the others switch to the part recipe only (`part-recipes.csv`). Part potions never answer a threat.

### Trophies
- The Trophies column (it was Components) is what a boss or elite leaves, set per source in `lootConfig.trophies`:
  - **a relic** of the source's tier: tier bosses, treasure spots, fishing docks. It rolls on top of the Relics column, so a tier boss now gives a relic about 30% of the time (it was 7%);
  - **2–3 monster parts** of the enemies' family, the elites' first: monster lair, beast den, long quests;
  - **an elemental stone** of the source's element: elemental rifts and sanctums.
- Components are removed: their keyword affixes went with them (families do those jobs now), the black market sells Rare trinkets only, salvage gives no component back, and held components and component affixes were converted by the save migration.

### Relics
- A relic is a one-off item in the inventory. Restoring it at the forge costs its type's recipe at its tier ×1.5 plus gold (5 × the tier's gold curve up to tier 3, 30 × it above; `lootConfig.restore.gold`) and turns it into the finished item: Legendary, with 3 affixes and its fixed effect as the unique (`doc/design/gear/`). It teaches no blueprint and never shows in the craftable list; two relics make two items.
- The effect is paid from the item's stat budget (like other extras), so a relic has slightly lower stats than the best forged item of its tier.
- Every effect is situational (an enemy family, a threat, an element, the first fight), never two keywords at once.
- The holy kit is **Holy symbols** (it was "Holy relics"; the ids `holyRelics` and `blessedRelics` stay).

### Trinkets
- Loot only, never crafted. They carry what's rare elsewhere: Luck, Crit, Speed, Evasion, +1 to an approach (uncommon drops), elemental resistance. Stat trinkets scale with tier and roll the gear stat range; rarity gives them affixes from the any-slot pool (`doc/design/gear/`).
- The Ring of fortune (+Luck) only ever drops Legendary.

### Item purposes
- Every base item (not equipment, not consumables) has one or more purpose tags (`purposes.csv`), shown as an icon on its inventory tile and usable as inventory filters. Tapping the item shows what's next (recipes, best place to sell, the boss it's for, set progress, restore cost, or the action).
