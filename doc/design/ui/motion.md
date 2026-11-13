# Motion

The game looks like wood, brass and parchment, and moves like it: short, weighty, physical. Every animation confirms something the player did or earned. Nothing moves on its own to decorate.

## Rules

- **Never delay input.** An animation never blocks a tap or holds navigation. Anything longer than 300 ms can be skipped by tapping.
- **Off the JS thread.** Animations use `react-native-reanimated` and run on the UI thread: no `setState` per frame, no JS timers driving frames. An animation's end callback never re-arms an animation unless it finished (issue 18: two orphaned clocks re-arming each other pinned the JS thread at 100%).
- **Stops when unseen.** Nothing animates on a screen that isn't focused, behind an open sheet, or while the app is in the background. No loops, except the ambient map ones that already exist (sky, sway), which run only at the Full level, focused and in the foreground (`useAnimationsEnabled`).
- **Short.** Every duration, easing and spring comes from `src/content/motion.ts`, never an inline number.
- **Three levels.** Settings → Game → Animations: **Full**, **Reduced** (fades only: no movement, scale or spring) and **Off**. The phone's reduce-motion setting lowers Full to Reduced. The debug screen's "No screen transition animation" switch still turns off the stack's animation on its own.
- **One hook.** `useMotion()` (`src/hooks/useMotion.ts`) gives a component the level and the config; no component reads the setting or the phone's reduce-motion flag itself. `timing(duration, easing)` and `spring(name)` build Reanimated configs from the config, with Reanimated's own reduce-motion check turned off (the level already decides, and the library's check would skip the Reduced fades).
- **One place for feel.** Components call `feel(moment, options)` (`src/services/feel.ts`), never the haptics library. Each moment has a haptic and an empty sound slot. Settings → Game → Haptics turns every haptic off.
- **Measured.** No first-open budget in `src/perf/` gets worse and no screen gains idle commits. Every animated component is mounted at each level by `src/components/motion/motion.test.tsx`, which checks nothing it started still runs after unmount (`expectNothingLeftRunning` in `motionHarness.tsx`).

## Config (`src/content/motion.ts`)

| name | value | for |
| --- | --- | --- |
| press | 90 ms | a control going down under the finger |
| small | 150 ms | closing, a Reduced fade, a switch thumb |
| medium | 220 ms | a number ticking, a bar filling, a piece appearing |
| large | 320 ms | bigger moves (sheets, screens) |
| easing `out` | bezier(0.2, 0, 0, 1) | things arriving |
| easing `inOut` | bezier(0.4, 0, 0.2, 1) | things moving between two places |
| spring `settle` | damping 26, stiffness 320, mass 1 | comes to rest without a bounce: sheets, press release |
| spring `pop` | damping 12, stiffness 420, mass 0.8 | one small overshoot: a slot an item lands in |
| pressScale | 0.96 | a pressed control at Full |
| dialogScale | 0.95 | a centred dialog opening |
| popupScale | 0.9 | a popup growing out of its slot |
| sheetDrag | 80 px or 0.8 px/ms | a sheet dragged down past this closes |
| appearRise | 8 px | a piece rising as it appears |
| reveal | 280 / 150 / 380 ms | the loot grid's beat, pause and best find |

## Shared pieces (`src/components/motion/`)

| piece | Full | Reduced | Off |
| --- | --- | --- | --- |
| `PressScale`: a `Pressable` (plain style; the pressed look goes in the children) that plays `feel('press')` | shrinks to 0.96 on press-in (press duration), eases back on release (small); native CSS transitions, no shared value per button | only the control's own pressed look (an animated opacity would override a disabled fade) | same as Reduced |
| `Appear`: fades in on mount, once; `delay` staggers | fades and rises 8 px | fades | shown at once |
| `CountUp`: a whole number | ticks from old to new (medium), drawn on the UI thread over the final number, which holds the layout; a gain floats "+N" up and fades | the new number fades in; "+N" fades without rising | changes at once |
| `FillBar`: the segmented pixel gauge (`segments={1}`: a smooth bar to the exact share) | each block fills from the left in turn, up or down (medium) | blocks fade in or out | jumps |

Only a change seen live animates (`useLiveChange`, `src/hooks/useLiveChange.ts`): the screen focused and the app in front both on the render before the change and on the change. The first value shows as is, and so does a value that changed while the screen was covered: the map, frozen behind a menu screen, thaws with its new gold in the same render that shows it again. `CountUp` mounts its ticking layer (a read-only `TextInput`) only after its first change, so a screen full of counts opens without them. A disabled `PressScale` never moves.

Where they are: `CountUp` on the gold in the map's top bar and the screen headers (`Price counting`), the inventory's counts (`ItemSlot liveCount`), the map's step count (ticking without a "+N", since it grows all the time while walking) and the quests' count progress (walk quests show a distance, which stays plain text). `FillBar` on every HP, XP, energy, job output and gatherer bar (it replaced `PixelBar`) and the quest progress bars. The Guild Hall's rank pips pop their brass in when a rank is bought on screen (Reduced: fade). The report and the loot grid keep their own staged reveal.

`CountUp`'s ticking digits are grouped on the UI thread by `groupDigits`, which a test pins to `formatNumber` in English and French.

## Feel moments (`src/services/feel.ts`)

| moment | haptic (Android / iOS) | sound | fired by |
| --- | --- | --- | --- |
| `press` | Virtual_Key / impact Soft | — | every `PressScale` on press (not press-in, so a scroll that starts on a button stays silent), a map marker tap, a `Tip` |
| `toggle` | Toggle_On, Toggle_Off / selection | — | `PixelSwitch` |
| `reward` | Context_Click / impact Light; Legendary: Confirm / notification Success | — | the loot grid, as each best find lands |
| `equip` | Context_Click / impact Light | — | not fired yet: the press that equips already buzzes (kept for items that travel, prompt B) |
| `forge` | Confirm / notification Success | — | a forge, a relic restored, a tool made, a brew or a dish made |

On Android the haptics use `performAndroidHapticsAsync`, which feels like iOS's and needs no vibrate permission.

## Settings

Kept in the settings store (`src/store/settingsStore.ts`), not the save: `animations` (`full` by default) and `haptics` (on by default). Settings saved before they existed get the defaults through the store's `merge`.

## Pressables

Every control that takes a tap is a `PressScale`: the shared buttons (`Button`, `WoodButton`, `EmberButton`, `DiamondButton`, `ItemSlot`, `Row`, `PixelSwitch`), the island menu's craft dropdown, and every screen- or panel-level tappable (chips, choice buttons, list rows, close and back buttons). Each keeps its own pressed look (the bevel flip, the lit diamond, the dimmed row), which goes in its children as `({ pressed }) => …`; `PressScale` adds the scale. `PixelSwitch`'s knob slides across in the small duration at Full and jumps otherwise; it plays `toggle` instead of `press`.

Not a `PressScale`, on purpose:
- Backdrops that close what's open (`Overlay`, the island menu's dropdown): not controls.
- The loot grid's tap-to-skip layer: it covers the whole grid.
- `Tip`: it measures itself as its bubble's anchor, and Reanimated's animated `Pressable` doesn't hand its ref to the view; it plays `press` itself.
- Map markers: MapLibre's `Marker` reports only the tap, not a press-in, so they play `press` and don't scale.
- `Chip` takes no tap; the chips that do (`ThreatChip`, `FamilyTag`) are `PressScale`s.

## Sheets, dialogs, popups and toasts

Every drawer, dialog and popup sits on the shared `Overlay` (`src/components/Overlay.tsx`), so they all move the same way:
- **Opening.** The modal fades the backdrop in natively. Its panel slot, `OverlayPanel` (`src/components/motion/OverlayPanel.tsx`), moves the panel at the Full level: a bottom panel starts below the screen and slides up by its own height (known after its first layout) with the settle spring; a centred dialog fades in from 0.95. Below Full only the modal's fade shows; at Off the modal doesn't fade either. The panel's content renders on the first frame either way.
- **Closing.** Callers unmount the overlay as soon as it closes (a backdrop tap, the back button, the panel's own Close or action button), so nothing inside it can play an exit. The modal's native fade takes everything out instead, at the system's speed. A real reverse (the sheet sliding back down in the small duration) would need every caller to keep the overlay mounted until the exit finishes, or overlays drawn in a root host instead of a `Modal`. Not done.
- **Drag to close.** A `Sheet`'s header (the title band) is its handle: pulled down past 80 px, or flicked, it closes; otherwise it springs back. It uses React Native's `PanResponder` on the header only. The body is a `ScrollView`, and a responder over it would compete with its scrolling on both platforms, so the body never drags. The panels that aren't a `Sheet` (party dialog, hero and gear pickers) don't drag. An overlay that must be answered (`dismissOnBackdrop={false}`) springs back.
- **Popups.** `AnchoredPopup` (and through it every `ItemPopup`, the forge confirm, the loot grid's tile cards) opts out of the panel motion and grows itself from 0.9 out of the slot it points at, once it has been measured and placed. `Tip`'s bubble fades with the modal only.
- **Toasts.** `Toast` (`src/components/motion/Toast.tsx`) uses Reanimated's enter and exit animations, which keep a leaving toast on screen while it fades: at Full it slides in from its edge with the settle spring and fades out in the small duration; at Reduced it fades in and out; at Off it just shows. `RecipeToast` and `SecretToast` share one column at the top of the root layout, so two at once stack, and when one leaves the other moves up (a layout transition) instead of jumping. The map's gain toast comes in from the bottom.

## Tabs, lists and small states

- **Selected markers.** `DiamondRail` has a brass marker on its right edge beside the selected diamond, which moves to the next pick; `SwipeTabs` draws its wood tabs behind and a parchment face over them, which moves to the next tab under the labels. Both are native transitions on `transform` (`transformTransition`, `src/components/motion/transitions.ts`), small duration, Full only; below Full they jump. The pager follows the swipe as before.
- **Ghost to content.** `Deferred` and `useLazyPages` wrap the ghost in `GhostFade`: when the content replaces it, the ghost fades out over the content in the small duration (Reanimated's exit animation keeps it on screen while it fades), and the content is laid out in place from its first frame. Off: no fade.
- **New rows.** `useFreshRows` (`src/hooks/useFreshRows.ts`) keeps, for as long as a list is mounted, the rows that were new when it first showed them; `AppearIf` wraps only those in `Appear`. Quests and reports use their `seen` flag (unseen when the list opens, or arriving while it is open). Blueprints have no such record in the save, so the forge remembers what it has shown since the app started: the first opening in a session shows none as new, later ones show what was learned since.
- **Equipping.** The hero sheet's equipment slots and the party dialog's gear slots are wrapped in `Pulse`: a piece landing there, seen live, pulses the slot to 1.08 and back with the pop spring (Reduced: a short dip in opacity).
- **Crafting.** Each brew or dish made from a recipe's popup flashes the popup card's border once (`Flash`, large duration) and plays `feel('forge')`. Forging, restoring a relic and making a tool play `feel('forge')`; the forge's confirm popup closes as it forges, so its flash is left to prompt B's forge moment.
- **Map nodes.** A resource node whose border turns green (in reach) pulses once (`MarkerPulse`). Markers count as seen while the app is in front instead of following focus: the map freezes while covered, and following focus would re-render every marker on each screen change.
- **Guild Hall.** A rank pip bought on screen pops its brass in (Reduced: fades in).

## Cost

Everything animated starts as plain views and mounts Reanimated state only when something moves: `CountUp` is a `Text` until its first change, `FillBar` draws plain blocks and animates only the blocks a live change moves, `Pulse` and the rank pips mount their animated view on a landing seen live. `PressScale`, the rail marker, the tab face and the switch knob use native CSS transitions instead of shared values. Measured per instance in jest: a `PressScale` costs about 70 µs against 35 µs for a plain `Pressable`; a shared value with an animated style costs about 90 µs.

First opening of each menu screen, `src/perf/menuFirstOpen.test.tsx`, dev machine, before (e7519fd) and after prompt A, two runs each (cold = fresh module registry, warm = second opening):

| screen | cold before | cold after | warm before | warm after |
| --- | --- | --- | --- | --- |
| expeditions | 317–513 ms | 330–337 ms | 13–19 ms | 15–17 ms |
| forge | 13–16 ms | 17 ms | 11–12 ms | 13 ms |
| provisions | 11–14 ms | 21 ms | 10–13 ms | 13–15 ms |
| inventory | 11–15 ms | 13–15 ms | 7–8 ms | 10–11 ms |
| team | 16–19 ms | 27–35 ms | 12–15 ms | 19–20 ms |
| hero | 20–22 ms | 26–30 ms | 9–10 ms | 11–12 ms |
| quests | 6–8 ms | 7–8 ms | 3 ms | 4–9 ms |
| guild | 12–14 ms | 16–17 ms | 9 ms | 11–12 ms |
| settings | 16–24 ms | 21–23 ms | 13–16 ms | 17–19 ms |
| tips | 2–3 ms | 2–4 ms | 1–2 ms | 1 ms |
| report (30 tiles) | 6–7 ms | 8–9 ms | 3–6 ms | 5–6 ms |

Every budget test still passes and idle commits are unchanged (expeditions 1, team 0, hero 1, inventory 1 per 10 s). The first-open times are still a few milliseconds above before (team the most: one `PressScale` and one `FillBar` per hero row). The cold gap is larger than the warm one, which points at Reanimated's one-time setup on the first animated component a fresh module registry mounts: every cold jest run pays it per screen, the app once per launch. Not measured on a phone: the native side (CSS transitions, the hidden ticker inputs) and the debug profiler's `tap→content` on a release build.

