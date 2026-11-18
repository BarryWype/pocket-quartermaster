# On for everyone · proposal (prompt 2, step 3)

**Status: approved as proposed and built 2026-11-18.** The rules as built are in the README. The gold numbers below are a first pass; they get tuned after the next full simulator run ("after" goes next to "before" here).

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

## After the first full run (2026-11-18)

The run (report of 2026-11-17 in `doc/design/simulator/report.md`) played the network in every game, with the step gold and building cost above.

**Gold per tier, regular player** (medians over 4 seeds; "after" income leaves out order gold, which the gold table didn't record yet):

| Tier | Income before → after | Spent before → after | Gold held, change before → after |
| --- | --- | --- | --- |
| 1 | 3,207 → 2,944 | 2,453 → 2,849 | +133 → +84 |
| 2 | 6,270 → 5,538 | 6,059 → 6,251 | +81 → +366 |
| 3 | 10,726 → 11,031 | 9,611 → 9,771 | +654 → +1,957 |
| 4 | 17,740 → 17,669 | 15,240 → 18,855 | +999 → −1,415 |
| 5 | 22,882 → 23,684 | 18,024 → 5,270 | +6,053 → +19,679 |

Heavy tier 5: +14,176 → +18,647; casual tier 5: +1,094 → +4,542.

- **Orders add little gold:** 56 / 72 / 88 a day (casual / regular / heavy), about 3% of a regular player's tier 5 income (2,694 a day). The step multipliers aren't what moves the surplus, so they stay.
- **The tier 5 surplus comes from spending:** regular recruits fell from 12,587 to 3,582 and the guild from 4,485 to 970 (the guild's upgrades moved to tier 4: 8,415 against 6,235). The seeds spread widely (−5,203 to +28,027). A sink for tier 5 gold is a question of its own, older than the network.
- **Buildings make far less than walking:** 0.06–0.5× by tier, against at least 1.5× (the prompt: "buildings make clearly more"). With a one-seed run of the regular bot:
  - The bot rarely found a site within the hall's reach: its walk heads one way each day and only detoured 400 m. **Fixed:** with a building slot free, the walk now goes to the nearest site within reach that it can walk to and back (half its walk, 800 m). Tier 2 then fills its three slots.
  - A building stops at 12 hours of stock, and the cart takes 20 units in one loop a day, so most buildings sit full. Locals make 0.4 of the rate, and heroes are posted overnight only.
  - Cart capacity 60 and 24 hours of stock, with locals at 0.6 and 1.2 sites per km², reached about 0.5–0.7× walking. 1.5× needs roughly three times the buildings' output.
- **The gold table now counts** order gold (`orders`) and building costs (`building`). `--set` reaches `supply.…` and `siteGroup.…`.

## Building output tripled (2026-11-18)

You chose to triple the buildings' output. Tested on one regular seed (bosses fell on the same days, so tiers don't go faster):

| Number | Was | Now |
| --- | --- | --- |
| Base rates per star | farm and lumber camp 1.0, herb garden, quarry and hunting camp 0.8, copper 0.6, iron 0.5, coal 0.4 | three times: 3.0, 2.4, 1.8, 1.5, 1.2 |
| `production.localsShare` | 0.4 | 0.6 |
| `production.capHours` | 12 | 24 |
| `cart.capacity` | 20 | 100 |
| `siteGroup.densityPerKm2` | 0.8 | 1.2 |

- **One seed, made / walked per day:** about 170 / 116 early in tier 2, 125–170 / 110–135 at tier 3, 280–330 / 120 at tier 4. So about 1.5× at tier 2, rising to 2–2.5×.
- **Orders grow with the rates** (their size follows the serving building's rate): a tavern wants about 210 grain and 37 meat. Delivery gold per order grows with them, so order gold should roughly double or triple. That's still small next to tier 5 income; check it in the next run.
- **To check in the next full run:** buildings ÷ walking by tier (the band test), order gold per day, the materials spent share (at least 75%), days per tier, and gold per tier against the tables above.

## Second full run, with the tripled output (2026-11-18)

**Gold per tier, regular player** (medians over 4 seeds; order gold and building costs now in the table):

| Tier | Income: before network → first run → now | Spent: before → now | Gold held, change: before → first run → now | Orders in the income |
| --- | --- | --- | --- | --- |
| 1 | 3,207 → 2,944 → 3,249 | 2,453 → 3,025 | +133 → +84 → +46 | none |
| 2 | 6,270 → 5,538 → 6,542 | 6,059 → 6,432 | +81 → +366 → +354 | 966 |
| 3 | 10,726 → 11,031 → 13,766 | 9,611 → 12,161 | +654 → +1,957 → +1,748 | 1,729 |
| 4 | 17,740 → 17,669 → 17,060 | 15,240 → 14,547 | +999 → −1,415 → +1,848 | under the top four |
| 5 | 22,882 → 23,684 → 28,446 | 18,024 → 17,059 | +6,053 → +19,679 → +10,952 | under the top four |

Heavy tier 5: +14,176 → +18,647 → +21,606; casual tier 5: +1,094 → +4,542 → +3,746 (its "gold piles up" band now passes).

- **Order gold:** 121 / 128 / 172 a day (casual / regular / heavy), up from 56 / 72 / 88, about 5% of a regular player's tier 5 income. Buildings cost 285–1,700 a tier. Tier 5 income is still where the surplus is, as before the network.
- **Buildings ÷ walking (regular):** 1.25× at tier 2 (band: 1.5×), then 1.98×, 2.10×, 2.18×, rising. Casual 2.9–3.9×; heavy 0.84–0.96× (heavy walks twice as much; the band is for regular).
- **Made isn't received:** a regular player's buildings make 160 units a day, but the cart brings 17 home and 71 go to places (by cart and by hand); 36 a day are lost when buildings expire full. The bot runs one cart loop a day.
- **Pace holds:** days to the end are 68 / 44 / 29 (casual / regular / heavy), against 69 / 44 / 27 before the network. Main-material spent share stays 87–151%.
- **Losses dominate the cart and raids:** a regular player's cart meets 9 ambushes a week (0.1 won, 4.1 lost, 5.0 unguarded); raids 0.1 won, 1.6 lost, 0.9 unguarded.
- **Other bands:** 140 fail against 144 last run. They're mostly the win odds and the gatherer's share bands, which also failed last run, and they move from run to run. The supply band at tier 2 is the only one for the network.
