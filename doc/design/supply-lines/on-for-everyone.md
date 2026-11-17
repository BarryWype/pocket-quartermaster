# On for everyone · proposal (prompt 2, step 3)

**Status: proposal, for review.** Nothing below is built yet. This step makes the network part of the main game.

## 1. The switch goes

- **Removed:** Settings → Developer → "Supply lines (experimental)" (`settingsStore.supplyLines`) and every place that reads it.
  - `useSupplyOn()` and `supplyActive()` become `networkUnlocked(save)`: open at tier 2 through the reveal, or by the debug unlock.
  - The quest rolls' `network` flag follows the same rule, so the parameter goes and `availableObjectives` reads the save.
  - Pocket mode's snapshot, the notification plan (Raids and Orders), the Settings rows for those two categories, walk discovery and the app's upkeep all follow it too.
- **Already for everyone:** the six-day rotation and the end of the material shops and gathering jobs.
- **The simulator:** the `--supply-lines` flag goes. **Every run plays the network** (it's now the game), so the default run's numbers move, as they should.
- **The debug unlock stays,** for testing a save below tier 2.

## 2. Saves of players past tier 1

**No migration is needed.**
- **A player who never turned the switch on** has an empty network: no hall, the first chain at its first step. Their next session past tier 2 shows the network's reveal card, the Network tab, and the first chain's first line ("Place your hall").
- **A tester who played with the switch on** keeps everything (hall, buildings, orders, cart, first chain where it stands). Nothing they own is lost.
- **Quests on removed places** were already swapped by version 60.

## 3. The tutorial and tips

They already mention the network only once it unlocks:
- **Tutorial:** it names no network piece.
- **Reveal card:** the network's appears at tier 2.
- **One-line tips** (building sheet, planner, raid banner) only queue when those sheets open, which needs the network.

I'll add a test that a tier 1 save has no network tip, tab, marker or quest.

## 4. A first balance pass

**Before** (the last full run, 2026-11-13, without the network): regular gold income per tier was

| Tier | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| Income | 3,207 | 6,270 | 10,726 | 17,740 | 22,882 |
| Gold held at the end, change over the tier | 133 | 81 | 654 | 999 | **6,053** |

Heavy players ended tier 5 with **14,176** more gold than they started with. That's the surplus the prompt warns about.

**What the network adds:**
- **New income:** order deliveries (1.25 × shop price per unit), order step gold (×1 at tier 2, up to ×8 at tier 5), more materials to sell at markets, and headline rewards.
- **What it takes away:** the shops' material sales (small), and work tools (5–80 gold, small).

So it adds income mostly at tiers 4–5, where the surplus already is. By rough sums, six buildings at tier 5 add about **1,000 gold a day** with today's step multipliers.

**First changes, before measuring:**

| Number | Now | Proposed | Why |
| --- | --- | --- | --- |
| `orders.tierGold` (step gold by tier) | 1, 1, 2, 4, 8 | 1, 1, 1.5, 2, 3 | The ×8 at tier 5 is most of the new income. |
| `buildings.cost.gold` | 60 at every tier | 60, 60, 90, 140, 200 by tier | A sink that follows the tier, like recruits and gear. |
| `orders.goldPerUnitShare` | 1.25 | 1.25 | Small next to steps; kept. |
| Building limits and reach, order sizes | as built | unchanged | Tune after measuring. |

**Then:**
1. You run `npm run sim`.
2. I read the report's gold per tier against the table above and tune.
3. I give you the before and after side by side.

## 5. Docs

- **`doc/ideas.md`:** the network is built; strike it from ideas.
- **The places design docs:** no material shops; the six-day rotation; sites.
- **The jobs design doc:** only the gatherer remains (a status note is already there).
- **The README's "What you'll do":** a line for the network, and "Explore the map" without "shops".

## What to check in the full simulator run

1. **Gold per tier** for all three profiles, against the table above. The tier 5 change should not grow, and heavy's surplus should come down.
2. **Buildings vs walking by tier** (Supply section): at least 1.5× at tier 2, rising. The band test checks it.
3. **Orders completed share,** and **order gold per day** by profile.
4. **Days per tier:** buildings bring materials faster, so tiers may go quicker. Check against the tier bands.
5. **Materials spent share** (the tier's main material): it should stay at least 75%. If it drops, buildings make more than players can use.
6. **Ambushes and raids per week,** now that every run plays the cart: losses shouldn't dominate.
7. **Gatherer share of walking,** which still has its band.

## Questions for you

1. **Step gold multipliers 1, 1, 1.5, 2, 3** and **building cost rising with tier:** OK as a first pass?
2. **Every simulator run plays the network** from now on (no flag): OK?
