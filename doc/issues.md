# Issues found in play testing

## 1. Tutorial: resources out of reach (fixed in ff18d01)
Found 2026-10-31. The tutorial's wood (and kit materials) spawn 15–30 m away; GPS drifts, so the player's position moves away from a node and it can't be picked up (tap range 30 m). Some nodes stay out of reach and the tutorial can't be finished from where the player stands.
Notes: nodes now spawn 8–15 m away (6 m apart), the pick-up range is 50 m during the tutorial only, "Collect from here" shows after 30 s and collects every remaining node of the step at once, and the nodes respawn around the player once they are all more than 60 m away.

## 2. Pocket mode keeps asking for location (fixed in e003535)
Found 2026-10-31. Tapping Enable shows "you need to enable location" although location is allowed for the app in the phone's settings; tapping again asks again, forever. Pocket mode needs background location ("Always" / "Allow all the time"), which the phone only grants in its own settings (and never in Expo Go); the code treats "while using only" as denied and repeats the same message.
Notes: cause on this setup was Expo Go (background location unsupported there, so the background request errors and reads as denied). Now the switch distinguishes no location / while-using-only / always: while-using turns Pocket mode on in limited mode with the platform upgrade steps and a settings button, no location keeps the message plus the settings button, Expo Go says it needs the installed app and never asks, and after a refusal the switch explains instead of asking again. Not testable without a real device: the actual system prompts and the settings round-trip.

## 3. Daily quests repeat the same kind (fixed in ISSUE6_HASH)
Found 2026-10-31. Two of the three daily quests are walking quests, which feels redundant. Quest picks are seeded by day and slot only, so two new games (or two players) on the same day get the same first quests.
Notes: fixed with issue 6's commit. The variety rule caps active quests at one per objective (`maxPerObjective` in `src/content/quests.ts`): a day's arrivals never repeat an objective already active, leaving the slot empty when every objective the player can get is taken; a reroll may still land on a taken objective, since the player asked for the exchange.

## 4. Repeated taps open the same screen several times (open)
Found 2026-10-31. When the app lags, tapping a menu button several times opens that many copies of the screen, stacked on top of each other.

## 5. Shop prices not showing (open)
Found 2026-11-01. In the smithy, and probably other shops, the coin icon shows but the price next to it doesn't. Happened before (fixed only in the Guild Hall, 4eae109), so it's a regression.

## 6. Some walking quests never progress (fixed in ISSUE6_HASH)
Found 2026-11-01. With four walking quests active at once, two completed normally and the other two stayed at "0 / 2,000 m" and "0 / 1,000 m" all day while the player walked.
Cause: quest progress was gated on `acceptedAt`, which is only set by `acceptQuests` when the quests list or map screen runs — quests that arrived while no screen was open never counted anything, and the walk baseline (`stepsAtAccept`) was captured at acceptance, losing the walk in between even for quests accepted later. Four walking quests at once was issue 3 (no variety rule).
Notes: walk, gather and patrol objectives now count from the moment the quest arrives (`counts` in `src/game/quests/progress.ts`), with the walk baseline (`stepsAtArrive`) captured at arrival in `newQuest`; every active quest of those kinds counts the same walk independently, in the app and in Pocket mode (the background watch follows arrival too), and progress survives restarts and daily resets. Place objectives still need the list opened, since that is what fixes their map target. Save version 30 (older saves reset).

## 7. Salvage has no confirmation (fixed)
Found 2026-10-31. Tapping Salvage destroys the item at once (only Rare, Legendary and infused pieces asked, via a plain system alert with no red warning). It is easy to lose a good item by mistake.

Fixed the same day: every salvage now asks first in an in-app dialog — the item's name and quality, what it gives back (materials with the Guild Hall bonus, gold, shards for an infused or Legendary piece), and a red warning when it is equipped on a hero, Rare or better, a restored relic, forged with a component or infused; Cancel changes nothing. The dialog's content is computed by `salvageDialog` in `src/game/forging/salvage.ts`.
