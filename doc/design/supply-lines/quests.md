# Quests in the network's language · proposal (prompt 2, step 2)

**Status: proposal, for review.** Nothing below is built yet.

## Where quests stand

- **Objectives** (`src/content/quests.ts`) group into six kinds: visit (chapel, library, ruins, dock), fight (fight event, patrols, lair), deliver (a potion or meal to an apothecary or tavern), gather (herbs on the way), trade (sell goods for gold) and walk.
- **Variety:** at most one quest per kind while other kinds are free; when every unlocked kind is taken a kind may repeat, never Walk twice.
- **Distance bands:** short 0–500 m, medium 500 m–1 km, long 1–2 km, rolled 48/36/16. They place a target, and set the amount for objectives that have one.
- **What named removed places:** the "mine" objective (buy at the sawmill, lodge or a mine) and the never-rolled "visit" list. Both were handled in step 1: "mine" left the pool, open ones were swapped, and the six places left "visit". **Nothing else names them,** so this step is about adding the network's quests.

## Five new objectives, one new kind: **Network** 🏠

They form their own kind, so the variety rule gives at most **one network quest at a time** (more only when every other kind is taken). Their weight is 1 each, like the rest.

| Objective | What it asks | Short / medium / long | Target |
| --- | --- | --- | --- |
| **Discover** 👣 | Discover N new sites or order places | 1 / 2 / 3 | none: any you find |
| **Build** 🔨 | Build on a site | 1 (short and medium only) | none: any site |
| **Order step** 📈 | Reach a step (25%, 50% or 100%) of any order | 1 (medium and long only) | none: any order |
| **Supply** 📦 | Deliver N units of a good to a kind of place: grain to taverns, stone to smithies, herbs to apothecaries, any good to markets | 10 / 20 / 40 | none: any place of that kind, by cart or by hand |
| **Ride the route** 🛤️ | Walk your cart's route: pass within 50 m of each of its stops, in any order, then return to the hall | 1 (long only) | the route's stops, fixed when the quest arrives |

- **Kind and good for Supply:** drawn from what the player can make now (a good from a building kind open at their tier). It also shows on the order sheet: "Counts for a quest".
- **Ride the route:** only offered when the cart's route has at least two stops. If a stop leaves while the quest runs, it drops off the list. The quest's map marks are the remaining stops.
- **Counting:** progress counts from the quest's arrival only (as Walk and Gather do), and works from the app and from Pocket mode walks processed on open.
- **Rewards:** as every quest's: by band, with the same tables.

## When they're offered

- **Only once the network is open:** tier 2, through the reveal. Until step 3 removes the switch, the quest roll also needs the switch on. The store passes that in, since quest rolls are pure and can't read settings. Step 3 then drops the flag.
- **Pocket mode:** "quest ready" alerts stay limited to walk and patrol quests, as agreed for Pocket mode, so network quests never alert in the background.

## Save

Quests keep their shape. A Supply quest stores its good and place kind; a Ride-the-route quest stores its stop list and which are passed (`itemId` and `target` style fields, as Deliver uses today). No migration is needed: open quests don't change.

## Simulator

The bot already discovers, builds, delivers and runs the cart. Each objective gets its counting hook, so the quests table in the report covers them. The bot rides its route on a walk when that quest is open and the route is under its walk length.

## Questions for you

1. **One network kind** (at most one network quest at a time), or spread them over the existing kinds (Discover as visit, Supply as deliver, Ride as walk), which allows more at once?
2. **"Walk a cart route end to end"** read as **you** walking past every stop and back to the hall (recommended)? Or should it be the **cart** finishing a loop with something delivered, which is passive?
3. **Supply amounts 10 / 20 / 40**, against a tavern order of about 80 units: OK?
