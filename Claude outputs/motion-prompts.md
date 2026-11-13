# Motion – Prompts for Claude Code

Written 2026-11-13. Two prompts, each ready to paste with the context block above it.

- **Prompt A – Quick wins.** Press feedback, sheets and dialogs, counting numbers, tabs and toasts. Shared components only, low risk. Run this first and play with it.
- **Prompt B – Heavier motion.** Screen transitions, items that travel, the map, the forge and milestone moments. Touches navigation and the map, where this project has had slow screens before. Run it only after A feels right.

---

## Context (paste at the top of either prompt)

You are working on Pocket Quartermaster. Follow `AGENTS.md` in full (Expo docs over memory: check the versioned docs for every animation, haptics and navigation API you use; the emoji-in-Text rule; saves must survive; never run the full `npm run sim`).

**What this is for.** The game looks like wood, brass and parchment, and should move like it: short, weighty, physical. Every animation confirms something the player did or earned. Nothing moves on its own to decorate.

**Rules for every animation.**
- **Never delay input.** An animation never blocks a tap, never holds navigation, and anything longer than 300 ms can be skipped by tapping.
- **Off the JS thread.** Use `react-native-reanimated` (already used by `LootGrid` and `LootReveal`), running on the UI thread. Check it is a direct dependency in `package.json`; if it isn't, add it with `npx expo install` and tell me a native rebuild is needed. No `setState` per frame, no JS timers driving frames. Read issues 13, 17 and 18 in `doc/issues.md` first: an animation clock once pinned the JS thread at 100%.
- **Stops when unseen.** Nothing animates on a screen that isn't focused, behind an open sheet, or while the app is in the background. Loops are forbidden except where this prompt names one.
- **Short.** Durations and easings come from one config, `src/content/motion.ts`, never inline numbers: press 90 ms, small 150 ms, medium 220 ms, large 320 ms, one "settle" spring, one "pop" spring.
- **Three levels**, one setting in Settings → Game, "Animations": **Full**, **Reduced** (fades only: no movement, scale or springs) and **Off**. The phone's reduce-motion setting forces Reduced. The debug screen's existing "No screen transition animation" switch keeps working. One hook, `useMotion()`, gives components the level and the config; no component reads the setting itself.
- **One place for feel.** Create `src/services/feel.ts`: `feel('press')`, `feel('reward', { rarity })`, `feel('forge')` and so on. For now each moment maps to a haptic (move the haptics in `LootGrid` here) and has an empty slot for a sound, which a later prompt fills. Haptics get their own on/off setting. Components call `feel`, never the haptics library.
- **Measured.** `src/perf/` has first-open budgets for the menu screens and idle-render counts. No budget may get worse, and no screen may gain idle commits. Add a test that mounts each animated component at each motion level and checks no timer or animation is left running after unmount.

**How to work.** After each step: `npm run test:changed`, then `npm test`, `npm run typecheck` and `npx expo lint`; a short summary; stop for review. Texts in English and French. Write the rules as built in `doc/design/ui/motion.md`. This changes no game rule and no save data beyond the two settings.

---

## Prompt A – Quick wins

### Step 1 – Foundations

1. `src/content/motion.ts`, `useMotion()`, the Animations and Haptics settings (with their migration defaults: Full, on), `src/services/feel.ts` with its moment table, and the unmount test harness.
2. A small set of shared pieces in `src/components/motion/`, each honouring the three levels:
   - `PressScale`: wraps a pressable; scales to 0.96 on press-in and springs back on release.
   - `Appear`: fades and rises 8 px on mount; takes a delay for staggering.
   - `CountUp`: a number that ticks from its old value to its new one over the medium duration, using the i18n number format, with no layout jump (fixed-width digits or a measured width).
   - `FillBar`: a bar whose fill animates to its new value.
   Unit-test each at the three levels.

Stop for review.

### Step 2 – Everything pressable answers the finger

1. Apply `PressScale` and `feel('press')` inside the shared buttons, not at call sites: `Button`, `WoodButton`, `EmberButton`, `DiamondButton`, `ItemSlot`, `Chip`, `PixelSwitch`, the island menu's buttons, list rows that open something, and map markers. Keep each one's existing pressed look (the bevel flip) and add the scale to it.
2. A disabled control doesn't scale and gives no haptic.
3. Switches and toggles slide their thumb, in the small duration.
4. List every pressable in `src/app` and `src/components` that doesn't go through one of these shared components, and either move it onto one or say why not.

Stop for review.

### Step 3 – Sheets, dialogs and toasts

1. `Sheet` slides up from the bottom with the settle spring; `Overlay`'s centred dialogs scale from 0.95 with a fade; the backdrop fades. Closing reverses, faster (small duration). Because the sheet and overlay are shared, every panel gets this at once: check the list in issue 14.
2. The content of a sheet doesn't wait for the animation: it renders on the first frame, as today.
3. A sheet can be dragged down to close when its content is scrolled to the top. If that fights the scroll view on either platform, drop it and say so: don't add a custom gesture layer.
4. Toasts (`RecipeToast`, `SecretToast`, the map's gain toasts) slide in from their edge and fade out; several at once stack with a small offset and don't jump.
5. `AnchoredPopup` and `ItemPopup` scale in from their anchor.

Stop for review.

### Step 4 – Numbers and bars

1. `CountUp` on: gold in the map's top bar and screen headers, material and consumable counts in the inventory when they change while visible, the step counter, quest progress numbers.
2. `FillBar` on: HP bars, XP bars, energy bars, job output bars, quest progress bars, the Guild Hall's rank progress. A bar that goes down animates down too.
3. A value that changed while the screen wasn't visible does **not** animate when the screen opens: it shows the current value. Only changes seen live animate. The exception is the report and loot grid, which already stage their own reveal.
4. A gain shows a small "+N" that floats up from the number and fades, once.

Stop for review.

### Step 5 – Tabs, lists and small states

1. `DiamondRail` and `SwipeTabs`: the selected marker slides between tabs; the page follows the swipe as today.
2. Lists that load in (`Deferred`, `LazyPages` and the ghost screens): the real content cross-fades over the ghost in the small duration, without a layout jump.
3. New rows (a new quest, a new report, a newly learned blueprint in the forge) use `Appear` once, the first time they are shown.
4. Equipping a piece: the slot it lands in pulses once (scale to 1.08 and back). Crafting: the Craft button's card flashes its border once and `feel('forge')` fires.
5. A map node coming into reach pulses once when its border turns green. One pulse, not a loop.

Stop for review, with a list of what to try on the phone, screen by screen, and the measured budgets before and after.

---

## Prompt B – Heavier motion

Run after prompt A is merged and played. Read `doc/design/ui/motion.md` and reuse its pieces.

### Step 1 – Screen transitions

1. Read how the stack is configured in `src/app/_layout.tsx` and how the map freezes behind other screens (issue 18: it freezes on the stack's `transitionEnd` and thaws on `transitionStart`). Any change here must keep that working: test opening and closing every menu screen ten times in a row with Pocket mode on, and watch the JS thread stays idle afterwards.
2. One transition for menu screens opened from the island menu: a cross-fade with a 12 px rise, medium duration. Going from one menu screen to another (a replace) cross-fades only. Back to the map reverses the rise. Use the navigator's own animation options; if the look can't be reached with them, take the closest built-in and say so. Don't write a custom transition layer.
3. A hero sheet opened from the Barracks slides in from the right and back, as a drill-down.
4. The ghost screen stays as the first frame; the transition must not delay it.
5. Reduced level: fades only. Off: none.

Stop for review, with first-open timings before and after from the debug profiler on a release build if I can run one, else from the jest budgets.

### Step 2 – Items that travel

A shared "flight" layer: one overlay at the root that can move a copy of an icon from one screen position to another on the UI thread, then remove it. Sources and targets register their position by a key. Pure position maths is unit-tested; the layer holds at most a handful of flights and drops extra ones.

Use it for exactly these, and nothing else yet:
1. **Collecting on the map**: the resource's icon flies from the node to the bag button in the island menu, which bumps once. Several nodes collected at once (auto-gather on open) merge into one flight per resource type, at most three.
2. **Equipping**: the piece flies from the picker row to the hero's slot.
3. **Collecting a report's loot**: when the loot grid is dismissed, its two or three best tiles fly to the bag button and gold to the gold counter, which then counts up.
4. **Buying and selling**: the item flies to or from the shop row; coins fly the other way.

A flight never blocks the action: the save changes at once and the flight is decoration that can be interrupted by navigating away. Reduced and Off: no flight, the target just bumps or nothing.

Stop for review.

### Step 3 – The map

1. A collected node shrinks and fades out, where today it disappears.
2. A newly visible place or patrol marker drops in with a small bounce, once, only the first time it enters view in a session.
3. A returning group's marker (errands, later) and the "expedition back" badge on the menu bounce once.
4. The recentre button, the Pocket mode pill and the top bar slide away while a sheet is open and back after, if that costs no extra map renders (check with the existing marker render counts).
5. Nothing here may re-render markers that didn't change, and nothing loops. Re-run the map's performance tests and give me the numbers.

Stop for review.

### Step 4 – The forge and the kitchen

1. **Forging** becomes a three-beat moment of under a second, skippable by tap: the materials slide into the anvil, a strike (a flash, a small screen shake of the card only, `feel('forge')`), then the finished piece rises with its rarity frame and its stats appear with `Appear`. An Uncommon or better piece gets the loot grid's rarity flourish.
2. **Rerolling** affixes: the old affix lines flip over to the new ones, one after another.
3. **Brewing and cooking**: the ingredients drop into the pot or flask, which fills with the product's colour, then the product pops out.
4. Crafting several in a row quickly must not queue animations: a new craft cuts the previous one short.

Stop for review.

### Step 5 – Milestones

A few big moments, each once, each skippable, each under two seconds:
1. **A dungeon cleared for the first time**: a wax-seal stamp slams onto its notice on the board.
2. **A tier boss beaten**: a banner unrolls across the report with the tier's name, then the new tier's board slides in when the Expeditions screen is next opened.
3. **A hero levels up**: the plate flashes and the level number rolls to the new one. Outside a report, a small badge on the hero's portrait until their sheet is opened.
4. **A new title or a named gear piece** (from the report prompt): the name writes itself in, letter by letter.
5. **A Guild Hall rank bought**: the building's card gets a hammer strike and its new rank pip fills.
6. **A quest claimed**: its card is stamped and slides away; the list closes the gap.

Each one calls `feel` with its own moment so sound can attach later. Keep a list of the moments and where they fire in `doc/design/ui/motion.md`.

Stop for review, with the full list of what to try on the phone and the debug shortcuts that trigger each milestone.
