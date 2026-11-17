# Orders · proposal (step 5)

**Status: approved as proposed and built 2026-11-17.** The rules as built are in the README ("Orders"); numbers live in `src/content/supplyLines.ts`.

## The order

- **One per discovered tavern, smithy, apothecary and market**, made when you first discover the place, seeded from the place and you, and kept in `save.supply.orders` until the place leaves.
- **What it wants:** the same goods for every place of a kind.

  | Place | Wants | Size (units) |
  | --- | --- | --- |
  | Tavern | grain, meat | 70 grain, 12 meat |
  | Smithy | stone | 66 |
  | Apothecary | herbs, berries | 33 herbs, 20 berries |
  | Market | any network good, in any mix | 60 in all |

- **How big:** one building of average quality (1.65 stars) running at 60% of its full rate (between locals at 40% and a posted hero at 100%) fills it in 3.5 days. Each order then varies by ±20%, seeded. The table shows the middle.
- **Gold per unit delivered:** 1.25 × the shop price of the good, so 1.25 for most goods and 2.5 for mushrooms. Fractions build up on the order and are paid as whole gold. A tavern order is worth about 100 gold from deliveries alone.
- **Steps at 25%, 50% and 100%**, each with a reward, plus the **headline reward** at 100%, shown from the start.

## Rewards

Gold steps scale with tier (×1 at tier 2, ×2 at 3, ×4 at 4, ×8 at 5, like gear prices).

| Place | 25% | 50% | 100% |
| --- | --- | --- | --- |
| Tavern | 20 gold | 2 meals you can cook (random) | 40 gold + **headline** |
| Smithy | 20 gold | 6 of your tier's ore (copper at tier 2, iron at 3…) | 40 gold + **headline** |
| Apothecary | 20 gold | 2 of the best healing potion you can brew | 40 gold + **headline** |
| Market | 20 gold | 30 gold | 50 gold + **headline** |

### Headlines

**New items, obtainable nowhere else** (no recipe, no shop, no loot table). Each is a stronger version of an effect the game already has, so no new rules.

- **Tavern: a meal for one run.** It takes the run's meal slot, like any meal.
  - **Banquet roast:** +20% max HP for the party (the hearty roast gives 10%).
  - **Wayfarer's feast:** +35% gold (the merchant's pie gives 15%).
  - **Stormbread:** +2 Speed for the party (spiced skewers give 1).
- **Smithy: a Rare piece of gear of a stated type**, at your tier. The type is drawn from the types your heroes' classes can wear, so it's always usable ("Rare spear, tier 2").
- **Apothecary: a potion, one hero, one run.**
  - **Phoenix draught:** back up at 60% HP when knocked out (the revival draught gives 30%).
  - **Giant's draught:** +30% Power (the strength draught gives 15%).
  - **Sage's draught:** +30% Magic (the arcane tonic gives 15%).
  - **One time in five:** a **Rare flask weapon** at your tier instead.
- **Market:** any of the above, drawn from all three pools.

**Two places of one kind differ:** when an order is made, its headline avoids the headlines of your other live orders of that kind, while the pool has another to give. So two nearby taverns offer different prizes.

## Delivering

- **In person:** standing at the place (50 m), **Deliver from my bag** hands over every wanted good you carry, up to what the order still needs. One tap; the sheet shows what will go and the gold it pays before you tap.
- **By cart:** step 7. Until then the sheet's "On its way" line stays hidden.
- **Rewards** are claimed with a tap per step ("Claim the 25% reward"), through the loot grid.

## When the place leaves

- Steps already reached stay; claim them any time before the place leaves (unclaimed ones are paid automatically when it goes). The rest is lost.
- **The day before** it leaves, if the order is between 25% and 99%: one notification, "The smithy leaves tomorrow: its order is 70% filled." It goes in a new **Orders** notification setting, shown only while the switch is on, with quiet hours respected.

## Grain

Grain's use is orders: delivering it to taverns and markets. The "every item has a use" test gains a **deliver** use, for goods some place's order wants. It shows on the item's card as "Wanted by taverns and markets".

## Save

Version 57 adds `save.supply.orders` (place id → order), empty.

## Questions for you

1. **Gold per unit at 1.25 × the shop price:** yes, or another rate?
2. **Headlines as stronger meals and potions** (no new rules), or do you want new effects?
3. **Unclaimed steps paid automatically** when a place leaves, or lost if not claimed?
