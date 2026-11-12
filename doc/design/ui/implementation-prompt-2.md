Wood & brass UI, part 2: move the remaining screens to the new style. Do this only after part 1 (`doc/design/ui/implementation-prompt.md`) is finished and committed on `ui-wood-brass`.

Same rules as part 1:
- Reuse the shared components in `src/components/ui/` and the `ui` tokens.
- Visual changes only. Store hooks and game functions stay as they are, and any new text goes into both `en.ts` and `fr.ts`.
- One commit per screen, then a short report.
- Lint, typecheck and the touched tests per step; the full `npx jest` once at the end.
- At most two attempts when stuck, then stop and report.

## Mockups

All in `doc/design/ui/mockups/`. Read them as specs, as in part 1:

- InventoryWood
- GuildWood
- InfuseWood
- SettingsWood (Alerts section)
- SettingsGameWood (Game section)
- TipsWood

## Screens

1. **Inventory** (`src/app/inventory.tsx`): mockup InventoryWood.
   - The header reads "Storeroom", with the gold count on the right.
   - Replace the current pager with a `DiamondRail` of its six pages: Materials, Gear, Provisions, Treasures, Finds, Secrets, using the existing page keys.
   - Each page is an `ItemSlot` grid with counts. Tapping a slot opens an `ItemPopup` holding what that page already shows for the item:
     - **Materials:** what it's used in, as chips.
     - **Gear:** wearer and Salvage, with its existing warnings.
     - **Treasures:** read or marked status.
     - **Secrets:** sigils and keys.
     - **Lures:** Activate.
   - Keep every current action. Only how they're laid out changes.
2. **Guild Hall** (`src/app/guild.tsx`): mockup GuildWood.
   - A `DiamondRail` of the five buildings: War room, Treasury, Barracks, Quest board, Workshop.
   - Each upgrade is a `ParchmentCard` with rank diamonds (filled up to the current rank), "Now" (the current effect) and "Next" (the next rank's effect, from the track's `describe`).
   - Then either the cost (gold, plus materials where the rank needs them) with an `EmberButton` Buy, or a dashed locked note using the existing gate and requires texts.
   - The gold count sits in the header. Keep the "hall locked" state as a single centred parchment card.
3. **Infusion** (`src/app/infuse.tsx`, `InfuseStation.tsx`): mockup InfuseWood.
   - **Stones:** a row of the five element stones (fire, grass, stone, electric, water) as sockets with counts and "n/10 shards" below. Faded when none are held.
   - **Weapons:** a grid of the player's weapons, each with a small marker when it's infused.
   - **Selected weapon:** a parchment card with an element choice as diamonds, disabled when no stone is held.
   - **Effect line:** built from `elementRules` (`beats`, `strongMultiplier`, `weakMultiplier`), e.g. "×1.5 damage to fire foes · ×0.75 to electric foes".
   - **Salvage note:** shards back = `shardsPerStone` minus the salvage loss, as the game computes it.
   - **Main action:** an `EmberButton` "Infuse · 1 water stone".
4. **Settings** (`src/app/settings.tsx`): mockups SettingsGameWood and SettingsWood.
   - Split the page into a `DiamondRail` with four sections, each a short page of `ParchmentCard`s:
     - **Game:** Pocket mode auto-stop (15 / 30 / 60), a link to Field notes (Tips), and Progression (reset, in a red-rimmed box, with the existing confirm dialog).
     - **Language:** the Phone / English / Français choice.
     - **Alerts:** the existing notification switches with a one-line hint each, plus quiet hours and "still send expedition results".
     - **About:** app version, Credits & licences (step 6), and the developer debug-tools switch with its existing confirm.
   - Add a pixel on/off switch component to `src/components/ui/` (a square track, green when on, with a square parchment knob). It must keep the native accessibility role and state (`accessibilityRole="switch"`, `accessibilityState={{ checked }}`).
   - New settings later go in as cards within a section, or a new rail item. Build the section list as data so that stays easy.
5. **Tips** (`src/app/tips.tsx`): mockup TipsWood. Title it "Field notes", as one long `ParchmentCard` listing the seen tips in order. Each tip has a diamond icon, its kind's short name as the title, and its existing text. Keep the empty state text.
6. **Credits & licences** (new route under settings, e.g. `src/app/settings/credits.tsx` or a modal, whichever fits the router setup):
   - list the fonts (FantaisieArtistique, and Alegreya under the SIL Open Font License 1.1) and any other third-party art or sound the app ships
   - each entry has its copyright line and a button that shows its full licence text
   - put the licence texts in `assets/licenses/` (copy `OFL.txt` from the `@expo-google-fonts/alegreya` package if it ships one; otherwise use the standard OFL 1.1 text with Alegreya's copyright line)
   - check FantaisieArtistique's own licence: if it can't be found in the repo, list it as "licence to confirm" and say so in your report rather than guessing.
