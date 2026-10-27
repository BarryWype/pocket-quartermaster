# Change request: pacing for casual players

Overnight quests, a daily walking bonus, daily blueprints, more map resources, stat rolls on gear, and no forge fee.

## Context

The balance lab (30 days, 3–5 seeds) shows that casual players fall far behind, and that tiers 2–4 are late for everyone since hero health and provisions were added.

| Profile | Boss days, tiers 1–5 | Targets | Heroes #4 / #6 |
|---|---|---|---|
| Casual | 4 / 16 / 28 / – / – | 1–4 / 5–9 / 12–18 / 21–33 / 37–54 | day 10 / day 21 |
| Regular | 3 / 7 / 13 / 19 / 26 | 1–2 / 3–5 / 7–10 / 12–18 / 21–30 | day 4 / day 10 |
| Dedicated | 2 / 4 / 7 / 10 / 14 | 1–2 / 1–3 / 4–6 / 7–11 / 12–18 | day 2 / day 4 |

What the what-if runs showed (`--set`, 3 seeds):
- **Healing speed doesn't matter.** Sessions are hours apart, so heroes are always back to full HP.
- **The Guild Hall isn't what slows progression.** Doubling its prices changes nothing.
- **Casual players are short of materials, runs and gold.** With 20 minutes of walking and 2 sessions a day, they get about 2 runs per party per day.
  - Walking yields +30% gave casual players back about 8 days at tier 3.
  - Removing the forge fee brought casual heroes #4 and #6 to days 4 and 10, from 10 and 21.
- **The forge fee doesn't change how often players forge.** About 20–25 forges per tier with or without it, because materials are the real limit. It only takes gold away.
- **Tiers 2–3 are late for everyone** because blueprint drops are luck-based and the daily rotation decides which dungeons are open.

**Goal:** casual players progress at a decent pace without speeding up dedicated players. The approach is rewards that follow time away and daily caps, not rewards that follow taps.

**Don't change the milestone targets** in `src/game/sim/targets.ts`. Change the game so it meets them.

Expeditions are now called **Quests**, and finished runs wait for the player to tap **Collect loot**. Build on that screen and flow.

## Before writing code

1. Keep a baseline:
   ```bash
   npm run sim -- --profile all --days 30 --out sim-output/pacing-baseline
   ```
2. Read the relevant code:
   - Gathering and spawns: `src/game/gathering/`, `src/game/generation/spawns.ts`, `src/content/resources.ts`, `src/content/spawnConfig.ts`, and the map in `src/app/index.tsx` and `SpawnMarker`.
   - Expeditions and odds: `src/game/expeditions/` (including provisions), `src/content/dungeons.ts`, the rotation in `src/game/dungeons/rotation.ts`.
   - Crafting and forging: `src/game/crafting/crafting.ts`, `src/game/forging/`, `src/content/forging.ts`, `src/components/CraftingStation.tsx`.
   - Taverns and recruit prices: `src/game/taverns/taverns.ts`, `src/content/roster.ts`.
   - The Quests screen and the save and migrations.
   - The simulator: `src/game/sim/` (bot, engine, walking, metrics) and `scripts/sim/` (report).
3. Propose a short implementation plan and wait for my approval. The plan must cover the open choices marked **Decide in the plan** below.

---

## Part 1: remove the forge fee

- Remove the gold fee on forging: `forgeRules.fees`, `forgeFee`, the fee check in `canCraft` and the charge in `craft`.
- Remove the fee display in the forge UI, the bot's handling of it, and the fee tests.
- Without the fee, regular players recruit a bit too early (hero #4 on day 2, #6 on day 6 in the test).
  - Retune `recruitRules.price` (base prices or `perTier`) to bring the regular profile back to hero #4 on days 3–5 and #6 on days 7–12.
  - Check casual players stay within their scaled targets.

## Part 2: overnight quests

A long, safe, well-paying quest for when the player won't be back for hours.

- **One per tier,** open every day alongside the rotation and not part of it. It's unlocked with its tier.
- **Duration:** 8 hours by default, in config.
- **Rewards** follow time away, not taps:
  - Gold and XP for a full run worth about **3 short runs of the tier** (config). It's the best choice when the player can't come back, and worse than short runs for someone who checks in often.
  - A normal main reward chance, no first-clear bonus and no daily blueprint.
- **Difficulty:** a low-danger "patrol". Target about 85–90% odds with the tier's Normal gear at the expected level, and little HP lost.
  - Use new encounter content or reuse the tier's mobs at low strength. Don't change the combat formulas.
- **Supply.** Today's rule (1 point per hero per started hour) would cost 8 points per hero.
  - **Decide in the plan:** a lower or capped supply need for overnight quests (for example counted as 3 hours), in config.
- **UI:** a section or card on the Quests screen showing the duration, "back at HH:MM" and the expected rewards. The existing "expedition finished" notification covers its return.
- **Bot:** at the last session of the day, and whenever the gap to the next session is at least the quest's duration, send idle heroes on the overnight quest if its odds pass the profile threshold.

## Part 3: daily walking bonus

The first stretch of walking each day yields more. This mostly helps short walkers.

- **Decide in the plan:** the unit, so it can be measured in the app. Default: **the first 15 gathers each local day give ×1.5 yield** (rounded up), in config.
- **Map:** show a small indicator such as "Fresh legs: 7 bonus gathers left". The tutorial's guaranteed wood node doesn't count.
- **Simulator:** apply the bonus to the first part of each day's walk.

## Part 4: a guaranteed blueprint on each dungeon's first clear of the day

- The **first win in each regular (pool) dungeon on each rotation day** always teaches one of that dungeon's blueprints the player doesn't know. Bosses are excluded; they already have a daily bonus and the pickaxe unlocks.
- **Prefer** blueprints for weapon types a hero in the roster can use, then armour, then the others. If every blueprint is already known, nothing extra drops.
- Normal drop chances still apply on every other run.
- **Storage:** add a per-dungeon "last day claimed", like `bossBonusDays`, with a save migration.
- **Dungeon card:** show "📜 Blueprint guaranteed today" until it's claimed, in English and French.
- **Bot:** value the guaranteed blueprint in its expected-value choice.

## Part 5: more resources on the map

### Locked nodes: half become gatherable, half stay greyed out

- For nodes the player can't gather yet (pickaxe tier too low), a **deterministic 50%**, picked by hashing the spawn id, are read as a resource the player *can* gather.
  - The converted node is an ore of a tier the player can mine, weighted towards their highest tier. For example, an iron node becomes stone or copper.
  - The map stays the same for every player; only how a node is read depends on the player's pickaxes. It must not change while the player stands next to it, unless they gain a pickaxe.
- The **other 50% stay visible but greyed out**, not gatherable, with a hint such as "Needs a copper pickaxe". This shows that there is a progression.
- Once a pickaxe unlocks a resource, its nodes are simply that resource. The share of converted nodes shrinks on its own as the player progresses.
- Update `canGather` and `collectSpawn`, the visibility filter and `SpawnMarker` (greyed-out style plus hint), in English and French.

### More animals and plants

- Raise the spawn density of animals and plants (herbs, berries, mushrooms). Start at +30% and tune with the simulator so that:
  - food use (`targets.foodUse`) stays within 60–80% for the regular profile;
  - casual players aren't short of hide, bone or herbs for gear and potions.
- Update the gathering balance tests to the new yields, and explain the change.

## Part 6: stat rolls on gear

- Every forged weapon and armour piece rolls a **stat factor** that multiplies its base stats, seeded by its uid like quality, so it can't be rerolled by reopening. Quality multiplies on top.
- **Range:** keep the quality order intact. The lowest roll of a quality must still beat the highest roll of the quality below. With multipliers 0.85 / 1 / 1.15 / 1.3, that means about **±6% (0.94–1.06)**. Put the range in config and add a test for the ordering.
- **Mastery** tilts the roll a little towards the top, for example at max mastery about two thirds of rolls land in the upper half. This keeps re-forging worth it past the quality cap.
- **UI:** show the roll where stats are shown (for example "Attack 6.4 · roll 6 / 7", or a small bar) in the forge result, the inventory and equip picker, and the hero screen.
- **Save:** existing gear migrates with a neutral roll (1.0).
- **Balance tests and the odds matrix:** use a neutral roll for reference teams.
- **Bot:** when deciding whether to keep a re-forged piece, compare the final stat (quality × roll). Re-forging now costs only materials.
- Salvage returns are unchanged.

## Part 7: simulator and report

Cover every system above in the bot and the report. New report numbers:
- Overnight quests: runs per day per profile, and their share of gold and XP.
- Walking bonus: share of gathered materials.
- Daily blueprints: claimed per run, and the day each tier's core kit (sword, bow, wand, armour) is fully known.
- Map nodes: converted vs greyed-out locked nodes seen, by tier.
- Stat rolls: roll distribution by tier, and re-forges per tier.

## Tests (pure logic in `src/game`)

- No forge fee: forging only needs known recipes and materials.
- Recruit prices with the retuned numbers.
- Overnight quests: available per tier, duration, reward scaling, the supply rule, and odds within their band.
- Walking bonus: the first N gathers per local day get the multiplier, it resets the next day, and the tutorial node doesn't count.
- Daily blueprint:
  - guaranteed on a pool dungeon's first win of the day only, and never on bosses;
  - prefers usable weapon types;
  - resets with the rotation day;
  - gives nothing when every blueprint is known.
- Locked nodes: about 50% converted and deterministic per spawn id and pickaxe tier; converted nodes are gatherable; the rest are visible but refused by `collectSpawn` with "needs a tool".
- Stat rolls: deterministic per uid, the range and the quality ordering, the mastery tilt, and the neutral migration.
- Updated gathering and balance tests.

## Save migration

Add the per-dungeon daily blueprint tracking, the walking bonus counter and the gear roll (1.0 for existing pieces). Keep everything else as it is.

## When done

1. Run the tests, `npx tsc --noEmit` and `npx expo lint`.
2. Run:
   ```bash
   npm run sim -- --profile all --days 30 --compare sim-output/pacing-baseline/summary.json
   ```
3. Summarise:
   - Milestones vs targets for each profile, with casual first.
   - Gold earned vs spent, and the share coming from overnight quests.
   - What each new system contributes: walking bonus, daily blueprints, converted nodes, stat rolls.
   - Any walking yield or spawn changes, and why.
   - The remaining warnings.
   - The three numbers you think I should look at next.

## Out of scope

- Motion-based forging and cooking (next batch).
- A late-game gold sink for dedicated players: report the numbers, don't fix them.
- Changing the milestone targets.
- New classes or abilities.

## Working agreements

- Keep all rules in `src/game` as pure TypeScript, with no React or Expo imports. Content and numbers go in `src/content` or config.
- Use TypeScript strictly and avoid `any`.
- Follow `AGENTS.md` for anything touching Expo APIs.
- Update the simulator and report for every rule change.
- Add every new player-facing text in English and French.
