Rework the Pocket Quartermaster interface into the "wood & brass" style that was approved in design mockups. This is a visual rework only: no game logic, balance or save changes.

## Reference

- The mockups are in `doc/design/ui/mockups/*.html`, one per screen: MapWood, ForgeWood, ProvisionsWood, QuestsWood, TeamWood, HeroWood, HeroStatsWood, HeroGearWood, DungeonsWood, TeamsOutWood, ReportWood.
- They are design-tool sources, not runnable pages. Read them as specs: the inline styles hold the exact colours, borders, sizes and layout. `{{…}}` holes are filled from the `renderVals()` data at the bottom of each file. `/_blob/…` URLs point to the app's own pixel icons (`assets/icons/scaled/*.png`) and `assets/fonts/FantaisieArtistique.ttf`.
- Where a mockup uses a simple line-drawn SVG, use the app's existing pixel icon or emoji instead.
- The mockups show sample data. Always render the app's real data.

## The style in five rules

1. **Materials.** Dark wood for frames, bars, the rail and item sockets. Parchment for anything the player reads (cards, pop-ups, labels). Brass for borders, the selected state and highlights.
2. **Pixel edges.** Thick dark outlines (2–3 px `outline`), square corners, a bevel of a light top-left and dark bottom-right inner edge. No soft shadows, no glows, no rounded corners. A hard 4 px drop "shadow" below cards is a solid `outline`-coloured strip, not a blur.
3. **The game's own assets.** The pixel icons (render them crisp, no smoothing) and FantaisieArtistique for titles, tab labels and buttons.
4. **One accent.** Forge red-orange (`ember`) only for each screen's main action: Forge, Cook, Gather, Claim, Send, Collect.
5. **Structure.**
   - A plank header with a centred title, back on the left, and an optional action on the right.
   - A left **diamond rail** wherever a screen has sections: Forge (Weapons / Armour / Off-hand), Provisions (Kitchen / Alchemy), Quests (Daily / Chests), Expeditions (Dungeons / Teams out / Reports).
   - **Swipe tabs** along the top for the hero (Summary / Stats / Equipment).
   - **Item grids of slots**, with a **pop-up card** (parchment, plank title band, pointer towards the slot) for the selected item.

## Tokens: add them to `src/theme.ts`

Keep the existing keys working: other screens still use them until they're migrated.

```ts
export const ui = {
  outline: '#1E120A',
  woodDeep: '#2A180D', woodDark: '#3A2314', woodMid: '#5A3820', woodSeam: '#4E301B', woodSelected: '#7A4A26',
  brass: '#C9A04E', brassDim: '#8A6A34', brassLight: '#F6D98E',
  parchment: '#F2E4C2', parchmentShade: '#E6D3A8', parchmentRule: '#B9A27A',
  ink: '#3A2314', inkMuted: '#6A4A2C', onWood: '#F2E4C2', onWoodMuted: '#C9B48A',
  ember: '#B4471C', emberLight: '#E07A3E', emberDark: '#6E2A0E', onEmber: '#FFF1DC',
  good: '#2F6B32', goodBg: '#DDE8C8', bad: '#8A2E1C', badBg: '#F2D3C2',
  keyword: '#2E4E8A', keywordBg: '#D3DCEE',
  hp: '#4E9A3E', hpLow: '#D98A2E', xp: '#C9A04E', gold: '#E8B83A',
};
```

Fonts: titles, tab labels and buttons use FantaisieArtistique. For body text and numbers, add a readable serif: Alegreya, via `npx expo install @expo-google-fonts/alegreya expo-font`, weights 500 and 700, loaded in `app/_layout.tsx` beside the existing font. If that package doesn't install cleanly on SDK 58, stop and report; don't swap in another library.

## Shared components (`src/components/ui/`)

Build these first, each small, typed and with no game logic:

- **`WoodPanel`:** a dark-wood fill with plank seams drawn as 1 px `woodSeam` lines every 16 px (absolutely positioned Views, or a tiny repeated image), a 2–3 px `outline` border and an optional brass inner rim. Props: `rim?`, `style`.
- **`ParchmentCard`:** a parchment fill, a 3 px `outline` border, a double inner rim (parchment then brass) and the 4 px solid drop strip. Optional `titleBand` (a plank strip with a brass-light title in Fantaisie), `pinned` (red pin dot) and `tilt` (±1°, for quest notices).
- **`ScreenHeader`:** a plank bar with a brass bottom rim, a back button (a square wood button with a brass inner outline), a centred Fantaisie title at 30 with a 2 px dark text shadow, and an optional right action. It replaces the current header in `_layout.tsx` for migrated screens.
- **`DiamondRail` + `DiamondButton`:** a 74 px column on `woodDeep` with a right `outline` edge. Each item is a 52 px square rotated 45° (the touch target must stay ≥ 44 px), with the icon counter-rotated and a Fantaisie label below.
  - Selected: `woodSelected` fill, a `brassLight` inner outline and a brass ring.
  - Not selected: `woodDark` with a `brassDim` inner outline.
  - Optional badge: a small square in `ember`.
  - Also used, smaller, for the tier selector on the Dungeons screen and in the map's bottom menu.
- **`ItemSlot`:** a square socket in states `selected | ready | short | empty | locked`.
  - **Background:** `woodDeep`, with an inner shadow.
  - **Inner outline by state:** `brassDim` for ready, `brassLight` plus a brass ring for selected, dashed for empty.
  - **Short:** a red corner square (missing materials) and the icon at 55% opacity.
  - **Overlays:** an optional count bottom-right and an optional ▲/▼ mark top-left.
- **`ItemPopup`:** a `ParchmentCard` with a title band (icon, name, sub-line), a centred big stat value, keyword lines in `keyword` blue with what each does, class lines (▲ in `good`, ▼ in `bad`), a dashed rule, ingredient `ItemSlot`s with have/need counts, and the main `EmberButton`. It shows over the grid, anchored near the selected slot, with a pointer. It replaces the forge confirm dialog's content (keep that dialog's logic).
- **`EmberButton`:** a 3 px `outline` border, `ember` fill, a bevel of `emberLight` top-left and `emberDark` bottom-right, a Fantaisie label in `onEmber` and an optional pixel icon. Disabled: parchment shade with muted text.
- **`WoodButton`:** the secondary button, with a wood fill, a brass inner outline and a brass-light label.
- **`PixelBar`:** restyle the existing one (a `woodDark` track, an `outline` border and a fill with a light top highlight) and keep its API.
- **`SwipeTabs`:** a tab strip over `PagerView`, which the project already uses in `quests.tsx`, `inventory.tsx` and `ForgeStation.tsx`. The active tab is parchment and joins the page below it; inactive tabs are `woodSeam` with muted text.
- **`Chip`:** for good, bad, keyword and neutral (a light fill, a 2 px border in the tone colour, bold text).

Add a "UI kit" section to `src/app/debug.tsx` that shows every component in each state. That's where you check them.

## Screens

Do them in this order, one commit each.

1. **Forge** (`src/components/ForgeStation.tsx`, `ForgeConfirmDialog.tsx`, `app/forge.tsx`): mockup ForgeWood.
   - The rail takes the place of the current pager pages: Weapons / Armour / Off-hand, with Off-hand added as a section if it isn't one yet.
   - Items form a 4-column grid of `ItemSlot`s, followed by blueprints not yet found as empty slots, and the tier line "Tier I · Wood   5 of 22 known".
   - A material counter strip sits below the grid.
   - Tapping a slot opens the `ItemPopup`, with Forge as its main action.
2. **Provisions** (`src/app/provisions.tsx`, `CraftingStation.tsx`): mockup ProvisionsWood.
   - The rail has Kitchen and Alchemy. Kitchen has two `SwipeTabs`, Meals and Supplies.
   - Recipes are slots with the stock count in the corner, and the pop-up has Cook.
   - **Remove the ×5 and ×10 buttons** (the owner's decision). Cook makes one.
3. **Quests** (`src/app/quests.tsx`, `StepChests.tsx`): mockup QuestsWood.
   - The rail has Daily and Chests, replacing the current two-page pager while keeping the swipe between them.
   - Each quest is a pinned, slightly tilted `ParchmentCard` with a progress bar and reward slots ("maybe" rewards dashed and faded), with Claim (ember) or Reroll (wood).
4. **Team** (`src/app/team/index.tsx`): mockup TeamWood, titled Barracks.
   - Each hero is a parchment card with a wood-framed portrait (the class icon in pixel art), a level diamond in ember, an HP bar, four key stats and a status line.
   - Empty roster places show as dashed "Empty bunk · recruit at a tavern" rows.
5. **Hero** (`src/app/team/[heroId].tsx`): mockups HeroWood, HeroStatsWood and HeroGearWood.
   - `SwipeTabs`: Summary / Stats / Equipment, with next-hero arrows in the header.
   - **Equipment:** a paper doll on a `WoodPanel` with five slots (Weapon left, Armour top, Off-hand right, Trinket bottom-left, Consumable bottom-right), each tapping into the existing equip picker.
   - **Storeroom:** a grid of equippable items with ▲/▼ marks. Tapping one shows a parchment comparison against what's worn (stat deltas in good or bad colours, keywords gained or lost). Compute the deltas from the real gear functions; don't hard-code them.
6. **Expeditions** (`src/app/expeditions.tsx`, `DungeonCard.tsx`, `ReportCard.tsx`, `OvernightCard.tsx`): mockups DungeonsWood, TeamsOutWood and ReportWood.
   - The rail has Dungeons, Teams out and Reports, with badges.
   - **Dungeons:** tier diamonds I–V (locked ones greyed). Dungeon cards show threat chips (good when answered, bad when not), rewards, an odds badge and Send.
   - **Teams out:** party cards with hero portraits, a progress bar and Collect the loot.
   - **Reports:** a title band with a Victory or Retreat chip, spoils slots, XP and HP lines, the run log with diamond bullets, and older reports as wood rows.
7. **Map HUD** (`src/app/index.tsx`, `IslandMenu.tsx`, `PocketModePanel.tsx`, the map panels): mockup MapWood.
   - **Don't change the map rendering itself.**
   - **Top bar:** a plank bar with tier, gold and the step-chest bar, plus a settings button.
   - **Banners and toggles:** the "Fresh legs" banner and the Pocket mode switch become parchment labels.
   - **Tapped node or place:** a parchment card with Gather.
   - **Bottom menu:** a plank bar with diamond buttons and their pixel icons and labels, keeping the island menu's current entries and badges.

Other screens (inventory, guild, settings, tips, infuse) are out of scope. They keep working with the old tokens.

## How to work

- **Branch and protect unrelated work.** Run `git status` first. If there are changes you didn't make, stop and ask. Then work on a new branch, `ui-wood-brass`.
- **Visual changes only.** Store hooks, game functions and i18n keys stay as they are. Any new text goes into both `src/i18n/en.ts` and `src/i18n/fr.ts`.
- **Re-check Expo before writing Expo code.** Expo is on SDK 58: before writing code that touches an Expo or React Native API, check the SDK 58 docs as AGENTS.md says.
- **Accessibility.** Every pressable has an `accessibilityLabel`, touch targets are at least 44 px, and text contrast is at least 4.5:1 (the token pairs above pass; don't put `onWoodMuted` on parchment).
- **Checks per step.** Run `npx tsc --noEmit` and `npx expo lint`, plus the tests for the files you touched (`npx jest <paths>`); fix all failures in one batch, then re-run only those that failed. Run the full `npx jest` once at the very end. No simulator runs: nothing here affects balance.
- **When stuck.** If something can't be done as described, make two attempts at most, then stop and report. Don't redesign.
- **One commit per step** (tokens and components, then each screen), in the repo's descriptive commit style.
- **Report back after each screen:** what changed, and anything that differs from the mockup and why. The owner checks it on the Android emulator.
