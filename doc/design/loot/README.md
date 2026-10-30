# Loot: design catalogue

**Status: implemented** (loot base, monster parts and charms, blueprints, components and relics, trinkets and valuables). The source for discussion is the Loot Design doc; this folder is the version to build from, and `matrix.csv` wins over any table elsewhere.

Loot is designed from scratch on top of the new dungeons, bosses, places, events and shops, not on the old reward code.

## Principles
1. **Materials only where you walk**: gathering, shops, map events, patrols, ruins, the monster lair. Expeditions launched from the phone give no materials.
2. **Loot feeds the forge instead of replacing it**: looted gear is random and usually average; forging gives the chosen type and quality. Most looted gear is salvaged into materials and mastery XP for its type.
3. **Something after every fight**: monster parts and valuables make every win rewarding without handing out gear every time.
4. **Tuning is cheap** (see below): no loot numbers in logic.

## Files
| File | What |
| --- | --- |
| `matrix.csv` | What drops where: one row per source, one mark per category (`—`, `R/2`, `R`, `S`, `O`, `A`), visits per day for the regular player, notes |
| `reward-types.csv` | Every reward type and its rule |
| `qualities.csv` | Gear qualities, with the new Uncommon |
| `treasure-maps.csv`, `training-manuals.csv` | Map rarity (distance, loot); manual XP cap by tier band |
| `monster-parts.csv` | 12 parts, one per enemy family tag, and their uses |
| `charms.csv` | 10 charms (consumable slot) and their recipes |
| `part-recipes.csv` | Potions made with parts: second recipes and part-only recipes, plus Viper oil |
| `components.csv` | 13 components: source, slots they fit, what they add |
| `relics.csv` | 25 relics: tier, type, unique effect |
| `trinkets.csv` | Trinket kinds |
| `valuables.csv` | Valuables and their rarity |
| `purposes.csv` | Purpose tags on base items, with icons |
| `enemy-tags.csv` | Every enemy's family tags, in order (from the enemy tags change) |
| `tools/pacing.py` | Weekly drops for the regular player from `matrix.csv` |

## Rules

### Rolls
- Each category is rolled separately on a win, with the chance of its mark: R 7%, R/2 3.5%, S 25%, O 60%, A 100%.
- **Run length**: for dungeon runs and overnight expeditions, every R/2, R, S and O chance is multiplied by run minutes ÷ 45 (between ×0.25 and ×2, never above 95%). The first win of the day isn't scaled.
- **Luck**: the party's total Luck multiplies every non-A chance by 1% per point (up to +30%); every 10 points add +1 to the looted gear quality roll. Never touches A drops or amounts.
- **Charms**: a "×1.5" charm multiplies that category's chance (with Luck, never above 95%). The same charm doesn't stack across the party.
- **Quantities per drop**: gold and XP by tier and source (existing scaling); materials 2–4 of the tier's materials; shards 2–4 of one element; monster parts 1–2 (2–3 on A sources); everything else 1.
- **Step chests**: at 2,000, 5,000, 8,000 and 12,000 steps each day, each rolling the Step chest row; the third and fourth roll at ×1.5.
- **Ruins**: every 5th dig gives a relic (progress kept across ruins).

### Tuning
- Every source's chances come from `matrix.csv`, generated into content. Logic only reads it.
- Marks map to chances in one place, with a **multiplier per category** and a **multiplier per source** on top (all 1 by default).
- A pacing report in the simulator gives the same weekly numbers as `tools/pacing.py`, so design and code can be compared.
- Debug: show a source's roll table with its final chances (after Luck, charms, run length); force a drop.
- Pacing balance tests come later, skipped until balancing.
- Gold follows one curve per tier, ×1, ×1.9, ×3, ×4.2, ×5.6 for tiers 1–5 (the enemy strength curve; `lootConfig.goldByTier`): dungeon and overnight gold, the first-win and first-clear bonuses, every source paid as a share of the tier's short dungeon (quests, step chests, treasure spots, patrols, fight events) and a duplicate secret tip. Valuable prices use the same curve.

### Gear as loot
- Forged and looted gear both roll on a bell curve (3d6, ±6%). Mastery shifts the forge's curve upwards; looted gear is centred on average.
- Quality: mostly Crappy to Uncommon; Rare from big fights; Legendary only from bosses and the monster lair. A new **Uncommon** quality (×1.07) sits between Normal and Rare.
- Tier: expeditions give the dungeon's tier; map events, patrols and the lair give the player's tier 70% of the time, one below 30%, never more than one below.

### Blueprints
- One per forgeable type and tier (110). Never a duplicate: a drop picks an unknown one of the source's tier, weighted towards types the roster favours, and becomes mastery XP or a component once the tier is complete.
- The player starts with two tier 1 blueprints (one weapon, one armour). The first tutorial dungeon (always won) gives a third through the normal first-win-of-the-day rule.

### Monster parts and charms
- Each part belongs to an enemy family tag (`monster-parts.csv`). An enemy with several tags can drop the part of any of them; its first tag counts double. Elemental enemies (`elemental` tag) drop shards of their element instead of a part.
- Parts are sellable at the hunting lodge or the apothecary.
- A charm or part recipe unlocks the first time the player gets its part: no blueprint.
- **Charms** go in the consumable slot, single-use. They raise what a run finds, never materials. They compete with kits on purpose: kits lower risk, charms raise rewards.
- **Part recipes**: a part replaces one secondary ingredient of an existing potion; the tier's main material stays. Common potions keep both recipes (same item, stacks), the others switch to the part recipe only (`part-recipes.csv`). Part potions never answer a threat.

### Components
- Forging with a component swaps a secondary material in the type's recipe, needs the base blueprint, and adds the component's effect or keyword. The result is at least Rare.
- Each component lists the item types it fits. **One component per item.** Blessed is never a component.
- Boss components are the boss's own and drop only from it.

### Relics
- A relic is a one-off item in the inventory. Restoring it at the forge costs its type's recipe at its tier ×1.5 (plus gems, see valuables) and turns it into the finished item: at least Rare, with its fixed effect. It teaches no blueprint and never shows in the craftable list; two relics make two items.
- The effect is paid from the item's stat budget (like other extras), so a relic has slightly lower stats than the best forged item of its tier.
- Every effect is situational (an enemy family, a threat, an element, the first fight), never two keywords at once.
- The holy kit is **Holy symbols** (it was "Holy relics"; the ids `holyRelics` and `blessedRelics` stay).

### Trinkets
- Loot only, never crafted. They carry what's rare elsewhere: Luck, Crit, Speed, Evasion, +1 to an approach (uncommon drops), elemental resistance. Stat trinkets scale with tier and quality.
- The Ring of fortune (+Luck) only ever drops Legendary.

### Valuables
- Full price at the market (or the thieves' guild fence), half price anywhere else.
- The market sometimes wants one kind ("a collector pays double for old coins today").
- Gems are also ingredients (Prism charm, Architect's seal, relic restoring). Value rises with the source's tier.

### Item purposes
- Every base item (not equipment, not consumables) has one or more purpose tags (`purposes.csv`), shown as an icon on its inventory tile and usable as inventory filters. Tapping the item shows what's next (recipes, best place to sell, the boss it's for, set progress, restore cost, or the action).
- Good only goes on items whose main purpose is selling.
