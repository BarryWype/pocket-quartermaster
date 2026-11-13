# The report is the reward

The expedition report credits the player's own work by name, says what one change would have made the difference, and lets gear and heroes build a history. Built in four steps (prompt 4); this page grows with each.

## Step 1: the run records who did what

`simulateRun(..., { tally: true })` keeps a tally as the fight plays (`src/game/expeditions/tally.ts`, collected in `simulate.ts`). Nothing in it draws from the run's random stream or changes a number the run uses: `tally.test.ts` plays 150 varied runs (`tallyCases.ts`: real dungeons and briefings, random affixes, family tags, specials, consumables, meals and weakness items) with the tally on and off and compares them exactly. Odds estimates and every other caller leave it off; only `resolveExpedition` turns it on, so the odds preview is no slower.

### Per hero
Damage dealt and taken, healing given (abilities, specials, own gear and relics; consumables count for the consumable), kills, kills of elites and bosses, the killing blow on the dungeon's boss, knockouts, specials fired (a miss doesn't count).

### Per source
Each affix (by hero and affix id), family level (`wild1`), consumable or potion-slot item (by hero), the meal (by its effect kind) and boss weakness item (by its carrier) gets: damage, damage prevented, healing, enemy turns denied, fights skipped, knockouts saved; a consumable also notes whether it fired in the boss fight and whether its hero was still standing at the end of that encounter.

How each is measured:
- **A share of a hit.** A source that multiplies a hit (a damageVs or Commander affix, a family level's multiplier, armour ignored or wheel bonus, a power or magic elixir) is credited the part of the hit it added: the hit without it alone, every other factor kept. A crit's extra damage is split over the crit chance each source added (an Opener or Predator affix, a family level, Viper oil, the crit meal).
- **A whole hit.** Damage dealt while a family hook runs (a Cunning trap, Shadow's strike, a chained spell, a reflection, a counter, Bloodrage's extra blow) is all that level's; so are its summons and tamed beasts, and the volley's blow on the other enemies. A Venomous poison is the affix's or the family's that made the hit poison; a firebomb's is the bomb's.
- **Damage prevented.** A defensive affix (damageFrom, Spirit ward, warding, element resist), defence elixir or the resistance meal is credited what the hit would have been without it alone. A family hook that cuts or swallows an incoming hit is credited the cut, minus what it moved onto another hero (Bulwark 2). A dodge that only the family's evasion made keeps off an estimate of the hit (its base damage through the hero's defence). A Bulwark affix's shield, an Antivenom affix's cut of poison wounds and a weakness item's damage cut, enrage or sweep called off count too.
- **Turns and fights.** An enemy that loses its turn to a family stagger (Breaker 2), an ambushed fight's first turn (Watch 2: each living enemy) or a drugged boss's free round; a fight a family effect skips.
- **Saves.** Unyielding's hold, a revival draught, Faith 3's revive (with the HP it gave as healing), a smoke bomb's escape.
- Left out: turn order (Watch 1, Volley 1 and Watch 3 moving a hero first), target weight, enemy crit cuts, speed, and loot effects (Plunder, Cunning caches): none has an amount in these units.

### Per threat
For each threat the briefing missed (half or full), what it cost: extra damage taken (beasts' harder hits, the element's extra damage, trap and poison wounds, the hits of an exposed first round), damage the party didn't deal (Darkness's softer hits, the armour an Armoured threat lends, the undead's extra HP), and the fights where the enemies struck first. Whether each threat was met, half or missed stays in `report.threats`.

### On the report
`ExpeditionReport.tally` keeps whole numbers, every hero's line, the threats that cost something, and the ten largest contributions (`expeditionRules.tally.contributionsKept`). Contributions are ranked in HP; a denied turn counts as 10% of the party's mean max HP, a skipped fight and a saved knockout 50% (`expeditionRules.tally.worth`). A report's tally is about 1.1 KB (1.7 KB at most over 300 varied runs); the save keeps 20 reports (`expeditionRules.reportsKept`), so about 35 KB at most. Reports from before step 1 have no tally; the field is optional, so no save version bump.

## Step 2: the report credits your work

`reportCard(report, heroes)` (`src/game/expeditions/reportCard.ts`) turns a report into the card's sections; `ReportCard.tsx` only renders them, top to bottom: the outcome line (in the title, with how long ago), "Your work", "What would have helped", "Hero of the run", the heroes' HP, "The run" (the log, collapsed until tapped) and the loot (step 2b turns it into a grid). The numbers are in `expeditionRules.card`.

- **Outcome line.** Won, retreated or lost, with the time the party was out ("Won in 25m", "Retreated after 25m · 3/5 fights"). Reports from before step 2 have no start time and show the fights only.
- **Your work.** The largest contributions, ranked as the tally ranks them (`contributionSize`), at most three (`workLines`), each worth at least a quarter of the party's mean max HP (`workThreshold`). Each line names its source and says its largest amount: a share of the party's damage from 10% (`damageShareFrom`), else the damage added; damage kept off; HP healed; enemy turns denied; fights spared; knockouts saved. A consumable that fired at the boss with its hero still standing says so ("Lyra's Minor healing potion kept Lyra standing against the goblin chief"). Sources: an affix by its piece ("Bram's Wooden spear (Venomous)": the hero's worn piece carrying the most of it, stored on the contribution when the report is made), a family's tags, its levels read as one ("Your Wild tags"), a consumable or weakness item by its hero, the meal by name. A piece the player forged says so ("…(Venomous), forged by you, did 38%…"; `forged` is stored on the contribution).
- **What would have helped.** Only after a loss, a retreat or a win with a knockout; never more than one line. The missed (or half-met) threat whose miss cost the most (damage taken plus damage not dealt), in the briefing's words: what it cost (the first strikes when it had any, else the larger of the two amounts) and how many more tags of its family would have lit its gem (`short` on the report's threat). Nothing else is counted as fixable: the briefing is the plan the player can change.
- **Hero of the run.** What each hero did for the party in HP, damage dealt plus healing given plus half the hits taken (standing heroes only), as a share of the party's total, plus 0.25 for the boss's killing blow (`heroOfRun`). The reason shown is the killing blow if they landed it, else the largest thing they did most of in the party.

## Step 2b: the loot grid

Every reward is a grid of tiles, four across on a phone (`src/components/LootGrid.tsx`), built by one pure function (`lootTiles` and `reportTiles` in `src/game/loot/tiles.ts`). The text forms in `lootText.ts` stay for notifications, the log and the debug screen.

- **One tile model.** `{ key, kind, emoji, icon, label, count, rarity, isNew, best, itemRef }`. The label under a tile is the amount for gold and XP (gold through `formatPrice`), the count for stacks ("×3", stacks of one material merged), the kind for one-off finds ("Blueprint", "Relic", "Trinket", "Map T2", "Manual", "Key fragment", "Sigil T2"), and the rarity for gear. Expedition reports leave XP out of the grid: it goes on the hero plates.
- **Order.** Gold and XP, materials and parts, consumables, gear by rarity (the rarest last), blueprints, relics, then other one-offs (maps, manuals, key fragments, lures, Sigils).
- **Frames.** Gear, maps and manuals wear their rarity in the inventory's colours (`gearRules.colors`); common stays plain. Blueprints get a light brass frame, relics an ember one. Gold, XP, materials and parts stay plain (`ItemSlot`'s new `frame`).
- **The reveal.** The best one or two finds (legendary, then rare gear, then blueprints and relics; `bestTileKeys`) reveal last. The other tiles pop in together (280 ms), then each best find after a 150 ms pause (380 ms), growing in slightly larger (×1.08) with a brass glow and a light haptic (`expo-haptics`: Android's context click, iOS's light impact). About 1.4 s in all; a tap skips it, and it is static with reduce motion on. A reward with nothing rare just pops in. It plays in the expedition's loot reveal, dig and fishing results, step chests, quest claims, traveller gifts and Sanctum results; the report card, toasts and previews are static.
- **"New".** A ribbon on a tile the first time the player gets that blueprint (`knownRecipes`), monster part (`seenParts`), trinket, relic or gear type (sword, bow…). The last three had no record of what was ever found, so the save gains `seenFinds` (version 49, `loot/finds.ts`), noted in `grantLoot`; the migration counts what the save holds now. `seeParts` now notes every monster part (the goblin ear wasn't, as no part recipe needs it); the migration adds the parts the save holds. The ribbon needs the save from before the reward, so it shows on fresh rewards (the reveal, results, toasts) and not on a report re-read later.
- **Tap a tile** to open the inventory's own card over the reward (`AnchoredPopup`). For gear, the piece (an expedition report keeps the uid each piece was granted with; elsewhere `withGrantedUids` matches the pieces the save gained) with one "Equip on <hero>" button per hero at home, or "no longer in your inventory". For a blueprint, what it makes and needs, and "Forge", which opens the forge on that blueprint's section with its confirmation open (`/forge?recipe=`). For materials, parts and relics, their used-for chips (`usedInChips`, shared with the inventory). For consumables, their description.
- **Hero XP** is on the hero plates: in the loot reveal, each hero's portrait, the XP gained, a bar that fills from where they were, and a level-up badge; on the report card, each hero's row gains a portrait and the run's XP beside their HP.
- **Everywhere.** The expedition report card and loot reveal, the map's toasts (patrol and place fight wins, heists, treasure spots: up to four 34 px tiles, then "+N", not tappable), dig and fishing results, step chests, quest claims, traveller gifts and Sanctum results. Quest notices preview their rewards as "?" tiles (the rarer categories faded). No screen shows a chain boss's reward before the run, so there was none to convert.
- **Collect all** waits for the dispatch board: one combined grid of everything collected, stacks merged, before the individual reports.
- **Performance.** The grid's tiles mount a frame after the space they fill (`Deferred`). `src/perf/menuFirstOpen.test.tsx` opens a report with 30 tiles (`src/perf/reportFixture.tsx`) beside the menu screens and checks its first frame stays under the menus' 25 ms gate: 6 ms first frame, 7 ms with the tiles, on the dev machine.
- **Icon gaps** (shown as their emoji until they get art): steel ingot, goblin ear, cog, the lutes, key fragments, lures and Sigils.

## Step 3: gear with a history

Rules in `src/game/gear/history.ts`, epithets and thresholds in `src/content/gearNames.ts` (French in `content/fr/names.ts`). Names give no stats.

- **Where it came from.** `forged`: true when the player forged it (a forged recipe or a restored relic), false when found or bought; `foundIn`: the dungeon, or the kind of place (patrol, traveller, map fight, ruins, heist, dock, treasure spot, Sanctum, step chest, quest, shop, market), passed to `grantLoot` by each reward. Pieces from before version 50 know neither and show nothing.
- **Tallies** (`history`), grown by each expedition report (`noteRunOnGear` in `resolveExpedition`): every piece each party hero wore counts the run and, on a win, the boss's id (once each); the hero's weapon counts their kills, by enemy tag too (the tally now counts kills by tag, `HeroTally.killTags`). Patrols, map fights and Sanctums make no report and add nothing.
- **Earned names**, once: "<hero>'s <epithet>" after the hero who carried it then, the first that applies:
  - the killing blow on a tier boss names the weapon after that boss ("Ogre-bane");
  - its first kill milestone (50) names the weapon after the enemy tag it killed most (beasts "Wolf-biter", undead "Grave-warden", 13 tags; "Bloodied" when none counts);
  - 100 runs name any worn piece "Old Faithful".
  The later kill milestones (200, 500) grow the same epithet a step (Wolf-biter, Wolf-bane, Wolf-king; Ogre-bane, Ogre-breaker, Ogre-doom); a name is never replaced. Only weapons count kills, so armour named by its runs keeps its first form.
- **Shown** wherever the piece's name is (`gearName` returns the earned name); the card's subtitle keeps the rarity and base item underneath. The card's History block: forged by you or found where, runs and kills, the bosses beaten, and the day the name was earned.
- **Salvage** warns first, in red, when a piece has a name.
- **The report** announces a name earned or grown at the top of "Your work", framed in brass (`report.gearNames`); the loot reveal pops it in with a brass frame once the loot has shown.
- **Migration** (version 50): existing pieces get zero tallies; `forged` stays unknown. The starting leather armour begins with an empty history.

## Step 4: heroes with a history

Rules in `src/game/team/record.ts`, titles in `src/content/heroTitles.ts` (French in `content/fr/names.ts`). Titles and companions give no stats.

- **The record** (`HeroState.record`), grown by each expedition report (`noteRunOnHeroes` in `resolveExpedition`, from `factsOfReport`): runs, wins, knockouts, kills, bosses beaten, times hero of the run (`pickHeroOfRun`, the report card's pick), tier boss killing blows, the current run of runs without a knockout, runs as the party's least-damaged hero who healed, and runs with each other hero. The hero sheet's Record section shows it, with who they ran with most.
- **Titles** (12), earned once each when the record reaches them: Giant-slayer (a tier boss's killing blow), the Unbroken (20 runs in a row without a knockout), the Patient (10 runs as the least-hurt hero who healed), the Seasoned (25 runs), Old hand (100 runs), the Victorious (50 wins), Tyrant-breaker (10 bosses), Monster-hunter (300 kills), Hero of the hour (hero of the run 10 times), the Scarred (10 knockouts), the Loyal (a companion), Friend to all (8 different heroes run with). The first earned shows under the name on the hero sheet and the party plates; the player picks another in the Record section, or taps the shown one to hide it (`HeroState.title`, null when hidden).
- **Companions.** Two heroes who have run together 15 times. A line on both sheets, and one run in four with companions in the party slips a line into the log ("Bram covered Lyra's retreat.", 5 lines, English and French) from its own random stream, so the rest of the log is unchanged. No stats in this pass: a small bonus could follow (say +5% damage while both stand) once the simulator covers it.
- **Dismissing** a hero with a title asks a second time, naming the shown title (or the last earned).
- **The report** announces a new title or companionship under "Hero of the run" (`report.heroNews`), framed in brass, and the loot reveal pops it in after the loot.
- **Migration** (version 51): each hero's record starts from the reports still in the save, oldest first (up to 20; titles they reach are earned and shown), else at zero. A report from before step 1 only knows who came back at 0 HP (counted as a knockout); kills and the hero of the run start from step 1's reports.

## Outcomes unchanged

Nothing in steps 1–4 moves balance. `tally.test.ts` plays 150 varied runs with the tally on and off and compares them exactly; `expeditions.test.ts` resolves 30 seeds for a party whose gear has names and long histories and whose heroes have titles and companions, and for the same party without, and compares every report field but the log and the announcements. `npm run sim:quick` reads exactly the same before step 1 and after step 4 (compared on 2026-11-13).
