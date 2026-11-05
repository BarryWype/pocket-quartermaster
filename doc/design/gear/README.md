# Gear rework: rarity, affixes, forge and loot

Roadmap step 3 in `doc/ideas.md`. Designed 2026-11-05. Replaces quality multipliers, crafting mastery, the component forge and infusion with one system: **stat ranges + rarity = number of affixes**.

## Pillars
- The forge gives control (base, tier, one chosen ingredient); loot gives surprise (more affixes, random).
- Tier sets base stats: a higher tier always wins in a straight fight. Affixes are situational, utility, economy or walking, never raw power, so a lower-tier piece can stay useful in its niche (or on a hero doing jobs).
- Walking materials stay the fuel (forging, rerolling).
- Few layers, one job each.

## Stats: rolled ranges instead of quality multipliers
- Quality multipliers (crappy ×0.85 … legendary ×1.3) are removed. Each stat rolls within a range that spans what they gave, with the old ±6% roll: about ×0.80 to ×1.38 of the base value (e.g. a 5-damage sword rolls 4–7). Bell curve (3d6).
- Rarity nudges the curve up a little: +1 on the dice for Rare, +2 for Legendary.
- Forged and looted gear roll the same curve (mastery is gone).

## Rarity = number of affixes
| Rarity | Affixes | Where from |
|---|---|---|
| Common | 0 | forge (no ingredient), loot |
| Uncommon | 1 | forge (one ingredient), loot, an elemental stone on a common piece |
| Rare | 2 | loot |
| Legendary | 3 + a unique effect | loot, restored relics |
"Crappy" and "Normal" are gone: both become Common.

## The forge
- Pick base and tier, as today (known blueprints only), then optionally add **one ingredient**:
  - a **monster part**: gives its family affix; offensive pieces (weapons and damage off-hands: quiver, off-hand blade, tome, focus) get the offensive affix, defensive ones (armour, shield, buckler) the defensive affix (`affixes.csv`);
  - or a **component** (boss and elite drops): gives its keyword affix, only on the types it fits.
- With an ingredient the piece is Uncommon, with that affix and a rolled value. Without, Common.
- One ingredient only, so crafting stays partly random (the stat roll, the affix value).
- Components no longer swap a recipe material or guarantee Rare.
- **Crafting mastery is removed** (a progression tree may bring something like it later).

## Elemental stones
- Apply to a finished piece: on a piece with affixes, replaces one at random with its element affix (Infused on offensive pieces, Warding on defensive ones); on a Common piece, adds it and makes it Uncommon.
- Elemental hearts merge into elemental stones. Infusion as a separate action is removed.

## Reroll
- At the forge, on Uncommon or better only: rerolls **all** affixes (which ones and their values) from the piece's pool (offensive or defensive). Base stats don't change.
- Costs walking materials plus gold, rising with each reroll of the same piece.
- Existing pieces keep the affixes they rolled; only new rolls, rerolls and stones follow the offensive/defensive rule.

## Loot
- Looted gear keeps each source's own d20 ladder, floors (monster lair ≥ Rare, first tier clear ≥ Uncommon) and quality steps (Tinker's lodestone, Hard difficulty), now as rarity steps; Luck keeps its +1 per 10 points. The ladders' results map to rarities (Crappy and Normal → Common). No per-source split target: keep the order basic < big fights < bosses < monster lair, and tune to overall rates for the regular profile per tier (Luck included): about one Rare every 2–4 days, a Legendary about once per tier (relics aside), at least one Uncommon a day. Adjust big fights first, then bosses, then (only if needed) a small Rare chance on basic, at most 3% and below big fights. Basic sources get it as their own upgrade roll after the d20 (`lootConfig.gearRarity.upgrades`: 2.5% Rare, 2.75% Legendary), which no rarity step raises; Legendaries must come at least 1.3 times per tier (relics aside), and bosses alone can't give that. Affixes are random from the slot's pool, including loot-only ones (Steady, walking affixes) and, rarely, keyword affixes.
- Gear may drop a little more often than today (tuned in the simulator).

## Relics and uniques
- Restoring works as today; the result is a Legendary piece: 3 affixes plus the relic's effect as its unique, with the relic's name.
- Every other Legendary (looted, or forged before this rework) has one unique rolled from the relic effects that fit its slot or type (`doc/design/loot/relics.csv`), seeded by uid, shown as "Unique: <effect>" without a relic name.
- One unique per piece; a reroll changes the affixes, never the unique.

## Trinkets
- Keep their stat lines (not turned into affixes), rolled like all gear: base value × the rolled range, with the rarity shift; no quality multiplier. Rarity gives them affixes from the "any slot" pool. The Ring of fortune stays Legendary-only.

## Not now
- Job affixes: added with each new job later (they join the pool; existing gear isn't touched).
- More bases and signature item types (step E), then mastery by family (step D) — after this rework.
