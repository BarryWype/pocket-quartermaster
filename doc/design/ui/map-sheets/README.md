# Map sheets

The map UI pass (`Claude outputs/map-ui-pass-prompts.md`): every sheet that opens from a map tap works the same way.

- `audit.html`: the sheets as they were at 9b24e24, far and here, with what each answers at a glance, where its main action is, what it hides when far, and what does or says nothing (prompt 1, step 1).
- `template.html`: the shared template on a smithy, a patrol and a network building, peek and full, far and here, and the chooser for overlapping markers (prompt 1, step 2). Approved 2026-11-19 with the defaults it lists; fights keep their range rule (no sending heroes from afar).

## The template (approved)

1. **Header:** the kind's icon inside its time ring (a difficulty ring for fights), the name, and one status line: distance or "You're here", and time left.
2. **What's here, in one line**, with items as small tiles.
3. **One main action** in the footer, changing with the situation; secondary actions in a row under it. No Close button: a tap outside, a swipe down and Android back close.
4. **Tabs** in the full sheet, in a fixed order: what the place does; its order, with its progress in the label ("Order · 40%"); Details.
5. **Items as tiles** everywhere; tapping one opens its card with the price and the action.
6. **Peek and full.** A tap opens the peek (header, summary, main action, sized to its content). Swiping up, *More*, or walking into range opens the full sheet. Swiping down goes back to the peek, then closes.
7. **Locked actions say why in their own label:** "Walk 320 m to trade". Far, the walk button centres the map on the place.
8. **Overlapping markers:** a tap that hits two or more opens a chooser anchored to the tap; picking one opens its peek.

## Built (step 3)

- **`MapSheet`** (`src/components/MapSheet.tsx`), on `Overlay` and `Sheet`: the header (icon in its `TimeRing` or `DifficultyRing`, name, `mapSheetStatus` line), the summary, the footer with the main action and a secondary row, and tabs in the full sheet. It reads only its props: no store subscription, so a save change never re-renders it (tested).
- **Heights.** Peek first. More (44 pt), a tap on the title, a swipe up, or `inRange` turning true opens the full sheet; a swipe down goes back to the peek, then closes. The switch happens on release and does not follow the finger, so the body's ScrollView keeps its own scroll and nothing fights it on Android.
- **Main action** (`mainAction`, `src/game/places/mainAction.ts`): `act`, `walk` (out of range; the button reads "Walk 320 m to trade", is never disabled, centres the map through `onWalk` and goes back to the peek) or `blocked` (the rule's reason, said in the button's own label). Distance is judged there and a rule's own `tooFar` is ignored; `anywhere` marks actions that work from any distance.
- **Time left** reads "3 days" from two days up, "5 h" from an hour, "40 min" below (`formatTimeLeft`).
- `Sheet` gained `badge`, `headerRight`, `onHeaderPress`, `headerHint` and `footerStyle`; every current sheet is unchanged.

## Built (step 4): visible from afar

Every map sheet shows what is there at any distance: shop stock and prices, what a place buys, care, the blessing, the dig, the catch, the heist, training, a tavern's recruits and supply, a fight's foes, threats and trophy, the Sanctum's guardian and sigils, a secret place's description and time left, a traveller's ask. "You are too far to see what is here" is gone.

Actions that need the player there stay shown but locked, and say why in their own label: "Walk 320 m to buy", "Walk 320 m to recruit", "Walk 320 m to fight" (`walkTo`, `src/components/walkLabel.ts`, from the rule's own `tooFar`). The separate "Walk closer" and "Get within 50 m" lines are gone wherever the label now says it. Far, Sell all waits until the player is there, so a row carries one walk label, not two.

Fights keep their range rule (decided 2026-11-19): heroes can't be sent from afar, so "Send heroes" appears nowhere yet.

Still hidden, on purpose:
- **A secret place's offer** (the hidden den's recruit, the black market's goods) stays behind the key, at any distance.
- **An undiscovered network place's order**: discovery is a game rule (it makes the order and the stop exist).
- **An unvisited site's quality and buildings**: learnt by walking there.
- **A traveller's reward**: a surprise until they are helped. Their ask shows from afar.
