Issue 18: menu screens take 3–4 s to open again, with no sign that the tap registered. Log it in `doc/issues.md` as issue 18, in the same format as issue 17, and fix it.

## Rules (from issue 17 and AGENTS.md: read issue 17 first)

- **Measure first, then change only what the numbers point to.** Issue 17's first attempt stacked five fixes, including an idle warm-up on the map, made every screen take 5 s and had to be reverted. Don't add background warm-ups, idle precomputation on the map, or preloads.
- Create a branch named `perf-menu-open` from `main`, with one commit per step.
- If a step doesn't improve its measured number, revert that step. Don't stack another fix on top of it.
- Run typecheck, lint and the tests you touched per step, and the full `npx jest` once at the end.
- At most two attempts on any one problem, then stop and report.

## What's already known

These come from reading the code after the last merges (#21 progression-difficulty, #22 ui-quest-fixes):

1. **The rotation replay got about 5× slower.** The new `dailyRotation` replays every day since `rotationRules.startDay`, and for each day walks every chain dungeon of every tier (35) with up to `SALTS = 8` calls to `composeThreats`. Measured cold in node: **314 ms** (issue 17's fix had it at 61 ms), so about 1.3 s on a phone. It's paid synchronously by Expeditions' first render (`currentRotation` in a `useMemo`) and by `SendDialog`.
2. **Every rail screen renders all of its pages at once.** In `inventory.tsx` (6 pages), `expeditions.tsx` (3, new in cd68309), `ForgeStation.tsx` (3–4), `guild.tsx` (5), `settings.tsx`, `quests.tsx` and `SwipeTabs`, every `PagerView` child mounts on open. Each screen therefore pays for 3–6 pages before its first frame.
3. **Expeditions now shows 7 dungeons per tier plus the overnight card,** each running `cachedEstimateOdds` during render: roughly twice issue 17's ~121 ms, ×4 on a phone.
4. **Only the map and Expeditions are wrapped in `timed()`,** so `tap→open` is never recorded for the other screens.

## Steps

### 1. Measure

- Wrap every screen the bottom menu and the hero list open in `timed()`, so the debug profiler records `tap→open <screen>` for each one: forge, provisions, quests, team, the hero screen, expeditions, inventory, guild, infuse, settings, tips.
- Extend `src/perf/expeditionsFirstOpen.test.ts` (or add `src/perf/menuFirstOpen.test.ts` beside it) to time each screen's first render in jest, cold and warm, with a mid-game save of about 3 tiers unlocked, ~40 gear items and a full inventory. Time `dailyRotation` cold separately.
- Put a table of the numbers in issue 18 (dev machine, and ×4 as the phone estimate), and commit.

### 2. Instant feedback: ghost screens

Do this step whatever the numbers say, because a tap must always show it registered.

- **Press feedback.** `DiamondButton` (and the bottom menu's buttons) show their pressed state on press-in, in the same frame, before navigating.
- **A ghost shell first.** Add `src/components/ui/GhostScreen.tsx`, the screen's real `ScreenHeader` and its `DiamondRail` (if it has one), with ghost content below:
  - **Ghost blocks:** parchment-coloured blocks at about 45% opacity, with the same borders as `ParchmentCard` but no text.
  - **Variants:** `cards` (3–4 stacked card shapes), `grid` (a slot grid like the storeroom's), `hero` (a portrait block, a stat bar block and a slot grid).
  - **Pulse:** a slow opacity pulse (0.35 ↔ 0.55, 900 ms) with `useNativeDriver: true`. Static when `useAnimationsEnabled()` is false.
- **Deferring the content.** Add `useAfterFirstFrame()`, which returns `false` on the first render and `true` once the first frame has painted (two `requestAnimationFrame`s, with a 250 ms `setTimeout` as a safety net). Each screen renders `GhostScreen` until it's `true`, then its real content.
  - The header and rail are real from the first frame, so the screen looks ready at once.
  - This is not "start after the transition" from issue 17's first attempt. It runs no work in the background. It only moves the screen's own first render one frame later, so the ghost shows first.
- **Gate:** the ghost must appear within ~100 ms of the tap on a phone (≈ 25 ms in the jest timing). Record it in the table.

### 3. Lazy pager pages

- Add one shared helper (e.g. `LazyPages` in `src/components/ui/`) that every `PagerView` screen uses. It renders the **active page** and **pages already visited**. Every other page holds a `GhostScreen` body of the right variant, so a swipe shows a ghost for a moment rather than a blank.
- Keep `collapsable={false}`, the initial page, the remembered page (`lastPage`), and the rail/pager sync from d556d22.
- Use it in inventory, expeditions, forge, guild, settings, quests and `SwipeTabs` (the hero tabs and the kitchen tabs).
- Measure again. If it doesn't cut first-open time, revert it.

### 4. Rotation replay: a fixed window instead of the full history

- Replay only the last **14 days** before the requested day, starting from `null` (no yesterday), instead of every day since `startDay`. The salt choice for a day only reads the day before, so two replays that start at different days converge within a day or two.
- **Prove it with a test:** for every day from `startDay` to a year ahead, the windowed result must equal the full replay. If any day differs, raise the window (21, then 28) until none do. Pin the window size in `rotationRules.replayDays` with a comment pointing to the test.
- Keep the in-memory cache of the built day.
- **Target:** `dailyRotation(today)` cold under 30 ms on the dev machine.

### 5. Expeditions odds after the first frame

- Each dungeon card shows "…" for its odds on the first frame, then fills in from `cachedEstimateOdds` one tick later. That's the same pattern the patrol and place panels use since issue 16 (`fightOddsKey`, "…" standing in).
- Compute odds only for the tier that's shown, not every unlocked tier.

### 6. Re-measure and report

- Update issue 18 with a before/after table for every screen: `tap→ghost` and `tap→content`.
- Note which steps were kept and which were reverted.
- Mark it fixed only if every screen shows its ghost within ~100 ms and its content within ~600 ms on the phone estimate. Otherwise leave it open and list what's left.
