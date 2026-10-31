# Issues found in play testing

## 1. Tutorial: resources out of reach (fixed in ff18d01)
Found 2026-10-31. The tutorial's wood (and kit materials) spawn 15–30 m away; GPS drifts, so the player's position moves away from a node and it can't be picked up (tap range 30 m). Some nodes stay out of reach and the tutorial can't be finished from where the player stands.
Notes: nodes now spawn 8–15 m away (6 m apart), the pick-up range is 50 m during the tutorial only, "Collect from here" shows after 30 s and collects every remaining node of the step at once, and the nodes respawn around the player once they are all more than 60 m away.

## 2. Pocket mode keeps asking for location (open)
Found 2026-10-31. Tapping Enable shows "you need to enable location" although location is allowed for the app in the phone's settings; tapping again asks again, forever. Pocket mode needs background location ("Always" / "Allow all the time"), which the phone only grants in its own settings (and never in Expo Go); the code treats "while using only" as denied and repeats the same message.

## 3. Daily quests repeat the same kind (open)
Found 2026-10-31. Two of the three daily quests are walking quests, which feels redundant. Quest picks are seeded by day and slot only, so two new games (or two players) on the same day get the same first quests.

## 4. Repeated taps open the same screen several times (open)
Found 2026-10-31. When the app lags, tapping a menu button several times opens that many copies of the screen, stacked on top of each other.

## 5. Shop prices not showing (open)
Found 2026-11-01. In the smithy, and probably other shops, the coin icon shows but the price next to it doesn't. Happened before (fixed only in the Guild Hall, 4eae109), so it's a regression.
