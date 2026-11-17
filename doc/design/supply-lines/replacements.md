# What the network replaces · proposal (prompt 2, step 1)

**Status: approved as proposed and built 2026-11-18** (question 1: for everyone now). The rules as built are in the README ("What the network replaced"); numbers stay placeholders until the balance pass in step 3.

## 1. The six material shops leave the map

`sawmill`, `quarry`, `copperMine`, `ironMine`, `coalPit` and `huntingLodge` stop spawning. **The fishing dock stays.**

| What depended on them | Where it goes |
| --- | --- |
| **Spawning:** one place group each, 0.25 per km² (`src/content/places.ts`) | Groups removed. The other places keep their densities, so the map has 1.5 fewer places per km². |
| **Mine tiers and locked mines:** `mineTiers`, `lockedMineShare`, `isLockedMine`, `showsForPlayer`, greyed markers, the "locked mine" sheet line | Removed. The tier → ore mapping (stone 1, copper 2, iron 3, coal 4) moves to a small content table. Orders' "ore of your tier" step uses it now. Pickaxes still gate ore nodes on walks. |
| **Shop stock:** wood, stone, copper, iron, coal 5–10 each; hide, meat, bone 2–4 each | Gone from shops. **The market keeps selling all of them** (its pool already holds every material, ores up to your pickaxe). Buildings become the main source. |
| **Buying monster parts:** the hunting lodge and the apothecary buy them | **The market** buys them alongside the apothecary. |
| **Quests:** the "mine" objective (buy N at a sawmill, lodge or the ore place of your tier) and the unused "visit" list | "Mine" leaves the pool. Open "mine" quests are swapped for another objective of the same band, as earlier migrations did. The six leave the "visit" list. Step 2 brings the network's own quests. |
| **Reveal:** all six map to "common places" | Mapping removed. The tip text names none of them, so nothing to rewrite. |
| **Boss weakness:** the hunting lodge sells *a cask of strong ale* (Ogre Chieftain) | See section 4. |
| **Work tools** sold at the sawmill, lodge, quarry and mines | They go with the jobs (section 3). |
| **Treasure, secret tips, Pocket mode "nearby"** | Not tied to these places; nothing changes. |
| **Simulator:** buying forge materials at mines and the sawmill, selling parts at the lodge, buying work tools | Forge materials at the market, parts at the market or apothecary, no tools. The bot's buildings supply the rest. |
| **Debug** place picker defaults to the sawmill; docs (`places.csv`, `density.csv`, `objectives.csv`, `boss-weaknesses.csv`, `item-types.md`) | Default becomes the smithy. The docs are updated, including the stale "pitch for the troll" line and the 72 h lifetimes. |
| **Saves:** used places, purchases and quest targets keyed by those places' ids | They simply stop matching and are pruned at expiry. Open quests targeting them retarget (section 5). |

## 2. Buildings that replace them

So that no material loses its source, each building opens with its tier and has a matching trade.

| Building | Makes | Opens at | Base rate per star | Trade |
| --- | --- | --- | --- | --- |
| Farm | grain 85%, meat 15% | tier 2 | 1.0 / h | Farmer |
| Herb garden | herbs, berries, mushrooms | tier 2 | 0.8 / h | Herbalist |
| **Lumber camp** | wood | tier 2 | 1.0 / h | **Woodcutter** |
| **Hunting camp** | meat 45%, hide 35%, bone 20% (the old trapper's weights) | tier 2 | 0.8 / h | **Hunter** |
| Quarry | stone | tier 2 | 0.8 / h | **Miner** (was Quarryman) |
| **Copper mine** | copper | tier 3 | 0.6 / h | Miner |
| **Iron mine** | iron | tier 4 | 0.5 / h | Miner |
| **Charcoal kiln** | coal | tier 5 | 0.4 / h | Woodcutter |

- **Lower rates for dearer goods:** the rates fall as the goods' prices rise (copper 2, iron 3, coal 4 gold), so each building's value per hour stays close.
- **Trades:** Farmer, Herbalist, Woodcutter, Hunter, Miner, Teamster, Watchman (seven). Quarryman becomes Miner, keeping its hours. New recruits roll among the seven, and existing heroes keep theirs.
- **What they serve:** the new buildings serve no particular place. Their goods go home, or to markets, which take every good. On a site's sheet their card says "For your workshop".
- **Limits:** the building limits by tier stay as they are (3 within 1 km at tier 2 … 6 within 2.5 km at tier 5). More kinds now compete for the same slots, which is the choice the design wants.

## 3. The guild gathering jobs leave

`woodcutter`, `forager`, `trapper`, `miner` and `charcoalBurner` (0.3 units an hour each) go, with their **work tools** (hatchet, sickle, snare, mining pick, tongs; tiers 1–5, sold only at shops).

The migration (save version 60) does this:
- **Uncollected output:** each hero on one of those jobs has it settled and paid into the inventory, then comes off the job. Nothing is lost.
- **Work tools:** every tool in the save is **refunded at its shop price** (5/10/20/40/80 gold by tier) and removed, after being unequipped from any hero.
- **Leftovers:** the job choices and output bookkeeping for those jobs, the `jobMiner` and `jobCharcoalBurner` tips, and their "full" and "tired" notifications go too.

**The outdoor gatherer and the Jobs tab.** I recommend:
- **Keep the gatherer** as it is. It's walking by proxy: a hero follows your path and gathers the nodes you would, which is hand gathering, not a building. It also exists from tier 1, before the network opens.
- **The Jobs tab** then holds only the gatherer's card. I'd rename it **"Gatherer"**, and fold it into the Network tab later if you like.
- **The alternative:** remove the gatherer too and make the Jobs tab disappear. That's simpler, but it takes away a tier 1 activity.

## 4. Boss weakness items

Only one is sold by a removed shop: **a cask of strong ale** (the Ogre Chieftain, tier 2, 30 gold).
- **Tavern orders** give one at their 50% step while the Ogre Chieftain's dungeon is open and the boss isn't beaten, in place of the meals. An ale at a tavern fits.
- **The market** sells it too, under the same condition, so a player who doesn't serve taverns can still get it.

## 5. Hand gathering is not touched

The same nodes, amounts and daily bonus.

**The check:** the simulator's supply section gains rows by tier, comparing **what a regular player's buildings make** with **what their walks gather** per day, for the same materials. The target is that buildings make clearly more, and the gap grows with the tier: roughly 1.5× at tier 2 rising to 3× at tier 5. I'll add the rows and a band test; you run `npm run sim -- --supply-lines` to read them. Rates then get tuned in step 3.

## Questions for you

1. **When it applies:** the switch only goes away in step 3. Should the shops and jobs go **for everyone now** (this branch is the experiment; until step 3 a player without the network has walking and the market) or **only while the network is active**, with the switch-off game unchanged until step 3?
2. **Trades:** Woodcutter back (lumber camp, kiln), Hunter (hunting camp), Quarryman renamed Miner (quarry and mines): seven trades in all. OK?
3. **The gatherer and the Jobs tab:** keep the gatherer, with the tab renamed "Gatherer" (recommended), or remove it too?
4. **Strong ale** from tavern orders plus the market: OK?
