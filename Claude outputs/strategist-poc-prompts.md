# Strategist POC – Prompts for Claude Code

A proof of concept for a new game built on Pocket Quartermaster's code: a dungeon-crawler roguelike where the player is a strategist who can't fight. Run each step as its own prompt, in order. Every step ends with tests, a typecheck and lint, a short summary of what changed, and a stop for review.

Mockups: https://claude.ai/artifact/KxSpWSKPopkg15UkZr6khc (the bottom row, "The strategist's map", is the target look; the top row shows the same screens as plain cards).

---

## Shared context (paste at the top of every step)

You are building a proof of concept for a new mobile game, separate from Pocket Quartermaster (PQ). The goal is to test whether one loop is fun, not to ship a game. Keep everything small, pure and tested; no polish beyond what the steps ask.

**The fantasy.** The player is the party's strategist: an old mentor who can't fight. The heroes are always one room ahead. The player briefs them for the next room, and while they fight it, deals with the aftermath of the room they just cleared.

**The loop, per room.**
1. **Brief.** The player sees the next room in full: its 2–4 crossings (entrances), each with its terrain, its enemy pack, when the pack arrives (round 1 or later) and its threats. They assign heroes from the roster to crossings, move gear and hand out consumables. Tired and wounded heroes are visible on the bench.
2. **Fight and aftermath.** The fight is simulated once, as soon as the briefing is confirmed. The player is now in the previous room, with a small action budget (3 by default): search the bodies, tend a wounded hero, use the peddler, bury a fallen hero, and so on. Each action spent reveals the next slice of the fight: the tug-of-war at each crossing moves, and news lines arrive.
3. **Go forward to help (optional).** At any point the player can leave the previous room for good to help the heroes: bring one thing (a potion to a hero, a flask on a crossing, a benched hero sent in). The engine takes the snapshot at the current slice, applies the help, and re-simulates the rest. Unused actions and everything left in the previous room are lost.
4. **Report.** Each crossing ends Held, Bent or Broken. Deaths, wounds, fatigue and earned titles are shown. The loot of this room waits for the next aftermath.

**Key rules.**
- Full information on the next room; how far ahead the run map shows rooms (sight) is the resource, not hidden details.
- Families count **per crossing**, not across the party.
- Heroes can die: the first knockout puts a hero at **death's door**; a knockout while at death's door kills them. Tending in the aftermath brings a hero back from death's door.
- **Fatigue:** a hero who fought two rooms in a row is tired (weaker) until they sit out a room.
- No orders during fights. Behaviour comes from class, families and specials.
- Everything done in the aftermath pays off one room later: an aftermath action must never touch the fight in progress (only "Go forward" does, through the snapshot).

**Where code comes from.** PQ lives at `../pocket-quartermaster`. Copy what you need (do not import across repos or symlink), and note at the top of each copied file `// From pocket-quartermaster <path>, trimmed for the POC.` Useful sources:
- Seeded RNG: `src/game/generation/rng.ts` (seedrandom).
- Fight engine to learn from and trim: `src/game/expeditions/simulate.ts`, `familyEffects.ts`, `party.ts`, `log.ts`.
- Content: `src/content/families.ts`, `heroes.ts`, `traits.ts`, `threats.ts`, `enemies.ts`, `elements.ts`, `gear.ts`, `equipment.ts`, `classSpecials.ts`, `abilities.ts`, `provisions.ts`.
- Design notes: `doc/design/families/README.md`, `doc/design/threats/`, `doc/design/abilities/`.
- UI: `src/theme.ts`, `src/components/Button.tsx`, `Panel.tsx`, `HpBar.tsx`, `IconLabel.tsx`; the font `assets/fonts/FantaisieArtistique.ttf`; class portraits in `assets/characters/<class>/`; icons in `assets/icons/`; licences in `assets/licenses/`.

**Conventions.** Same stack as PQ: Expo SDK 58, Expo Router, React Native 0.88, zustand, TypeScript, Jest. Follow PQ's `AGENTS.md` (Expo docs over memory, `npx expo install`, no hand-edited native folders, the emoji-in-Text rule). Game logic is pure TypeScript under `src/game/`, content under `src/content/`, screens under `src/app/`. English only. Save compatibility does not matter in the POC: a changed save may reset.

---

## Step 1 – Scaffold

1. Create a new Expo app `strategist-poc` next to PQ (`../strategist-poc`) with the same Expo SDK, React Native, Expo Router, zustand, TypeScript and Jest setup as PQ. Copy PQ's `AGENTS.md`, adapted: drop the simulator, saves-migration, walking and delegation sections.
2. Copy the seeded RNG. Make its state serialisable (seedrandom's `{ state: true }` option and `.state()`), so a fight can be snapshotted mid-run and resumed with the same random stream. Test: a stream resumed from a saved state continues exactly as the original.
3. Copy the theme, font, `Button`, `Panel`, `HpBar` and `IconLabel`, the class portraits and the licence files for any assets copied.
4. Add `react-native-svg` with `npx expo install`.
5. Create placeholder screens: `index` (start a run), `run` (run map), `brief`, `room` (fight and aftermath), `report`.
6. Check: `npm test`, typecheck and lint pass; the app starts in a development build.

Stop for review.

---

## Step 2 – Content subset

Copy and trim PQ content into `src/content/`. Keep ids and names from PQ where they exist.

- **Families: 8.** Faith, Wild, Watch, Cunning (threat families) and Bulwark, Bloodrage, Spellweave, Rally (playstyles). Thresholds **2/3/4 tags per crossing** (PQ uses 2/4/6 across a party). Keep each family's three effect levels from PQ's `familyEffectRules`, trimmed to what a crossing fight can express.
- **Threats: 4.** Holy (Faith), Beasts (Wild), Darkness (Watch), Traps (Cunning). A threat at level N needs N tags of its family **on that crossing**. Keep PQ's penalties for a missed threat.
- **Classes: about 10**, each with one family tag: Warrior, Paladin (Bulwark), Barbarian (Bloodrage), Fire mage (Spellweave), Troubadour (Rally), Cleric, Exorcist (Faith), Druid (Wild), Scout (Watch), Thief (Cunning). Base stats, damage stat and one special each, from PQ.
- **Gear:** only weapons carry family tags (one-handed 1 + 1 of another family, two-handed 2 of one family, as in PQ's `doc/design/families/item-tags.csv`). Armour gives stats only. One tier of gear is enough.
- **Consumables:** healing draught, fire flask, holy water (Faith +1 on one crossing for one fight).
- **Enemies:** 3–4 per tag (undead, beast, construct, cultist), with PQ's tag system, plus 2 elites and 1 boss, the Drowned King, with weaknesses shown from the start: Electric damage, and Spellweave (its effects are stronger against him).
- **Hero traits:** 6 from PQ's `traits.ts` that make sense in a run (Resilient, Tough, Lucky, Quick healer as "tended heroes come back with more HP", Light eater, Hardy).
- Data tests: every family has at least one weapon; every threat can be answered with the starting roster and starting gear; no class alone reaches level 2 of its own family.

Stop for review.

---

## Step 3 – Crossing fight engine

Pure, deterministic, under `src/game/fight/`. Learn from PQ's `simulate.ts`, but write a new, smaller engine: one room is several fights side by side.

**Input:** the room (crossings with terrain, packs, arrival round, threats), the assignment (heroes per crossing with gear, consumables and their state: fresh, tired, death's door), a seed.

**Rules.**
- Rounds run for all crossings at once. A pack enters its crossing on its arrival round.
- Inside a crossing, a fight works like PQ's (speed order, damage, armour, crits, specials, families counted on that crossing, threat penalties if the crossing's threats are not answered). Terrain modifies it: Narrow (at most 2 enemies attack per round, Bulwark stronger), Open (no limit), Dark (Darkness threat), Flooded (speed −2).
- A crossing with no hero is broken at its pack's arrival.
- **Breach:** when all heroes on a crossing are down, it is Broken and its remaining enemies move to the centre, then join the crossing whose heroes have the most HP left, from the next round.
- **Knockouts:** a fresh hero knocked out goes to death's door and leaves the fight; a hero already at death's door who is knocked out dies.
- **Tired** heroes deal 20% less damage.
- The room ends when every crossing is cleared or broken, or after a round cap.
- **Tug-of-war value** per crossing, 0 to 1 each round: the heroes' share of the crossing's total remaining strength (HP times damage). The end result is Held (no hero knocked out), Bent (cleared with a knockout) or Broken.

**Output:** a timeline: one snapshot per round (every hero's and enemy's HP and state, per-crossing tug value, the full engine state including the RNG state) and a list of events, each with a type, the crossing, the heroes involved, a short English line and an importance (1 minor, 2 notable, 3 key: a crossing bending below 0.35, a knockout, a death, a breach, a family level-3 effect).

**Snapshot and resume.** `resumeFight(snapshot, intervention, seed)` continues from any round snapshot after applying an intervention (heal a hero, a consumable on a crossing, add a benched hero to a crossing). The resumed stream uses a seed derived from the original seed, the round and the intervention, so it doesn't simply replay the same rolls.

**Tests:** determinism (same input, same timeline); resuming from a snapshot with no intervention gives the same timeline as the original; an intervention changes the result; breach routing; death's door then death; threat penalties per crossing; families counted per crossing (the same heroes split across two crossings lose their level).

Stop for review.

---

## Step 4 – Slicing the timeline

Pure, under `src/game/fight/slices.ts`.

- `sliceTimeline(timeline, count)` returns `count` slices. Each slice ends on a round that follows a key event when there is one, preferring the most uncertain moment (a tug value closest to 0.5 or falling fastest); the last slice always ends at the end of the fight. With fewer key events than slices, cut evenly by rounds; a slice with no notable event gets a calm line ("East culvert: quiet so far").
- Each slice carries the snapshot at its end (for the tug bars and "Go forward") and the events to show, key events first, at most 3 lines.
- The number of slices equals the actions the player has for this aftermath, plus a final one revealed by ending the turn.
- Tests: slice count, ends on key events, last slice ends the fight, calm slices on a quiet fight.

Stop for review.

---

## Step 5 – The run

Pure logic under `src/game/run/`, state in a zustand store with persistence.

- **Run map:** 9 rows from the entrance to the boss; 2–3 nodes per row; each node links to 1–2 nodes of the next row. Node types: fight (most), elite, camp (no fight, 5 actions instead of 3), sealed vault (a fight whose reward needs Cunning 2 on any crossing), boss. The boss and its weaknesses are shown from the start. Seeded from the run seed.
- **Sight:** the player sees full details of the next room and the node types of the row after it (sight 2). A Scout or Watch 2 anywhere in the party adds one row. Rows beyond sight show only that a node exists.
- **Room generation:** 2–4 crossings by row depth, each with terrain, a pack drawn from the room's enemy tags, an arrival round (1, 2 or 3) and 0–1 threats at level 1–2 (bosses and elites 2).
- **Roster:** start with 6 heroes and starting gear; up to 8. Recruit at the peddler.
- **Supplies:** rations, 1 per room per hero sent; none left means every hero is tired.
- **Aftermath actions** (each costs 1): search the bodies (gold, consumables, a weapon drop by enemy tags), tend a hero at death's door, the peddler (buy, sell, recruit; buying several items is one action), bury a fallen hero (recover their gear and a keepsake: +1 to a family tag of one surviving hero for the rest of the run), repair (remove "tired" from one hero).
- **Go forward:** ends the aftermath, everything left in that room is lost, then applies the intervention through `resumeFight`.
- **Earned titles:** simple counters per hero. Unbroken (held a crossing alone 3 times: +1 Bulwark), Beastslayer (10 beasts: +1 Wild), Gravewalker (came back from death's door: +1 Faith). A title adds a family tag for the rest of the run.
- **End of run:** win by beating the boss; lose when no hero is alive or the party can't field one hero. No meta-progression in the POC.
- Tests: map generation determinism and connectivity, sight, action budget, lost actions on Go forward, titles, end conditions.

Stop for review.

---

## Step 6 – Screens, the strategist's map

Follow the bottom row of the mockups. Everything is drawn with `react-native-svg` on a parchment ground (a radial gradient from #e9dcbf to #c9b48a; ink #3b2a1a; red ink #8e2a1c; brass #b08a4a; dark wood #1d1612 around it). Room drawings are built from a few reusable pieces: a chamber, corridors with variants per terrain (stairs: cross lines; flooded: hatching and waves; dark: hatching; open: wide), and a link to the previous room. Map labels use a serif in italic; UI uses the game font.

- **Run map:** nodes as small inked rooms (door ticks for crossings), camps as tents, vaults with a keyhole, the boss as a red seal with its name and weaknesses. The route taken is a dotted red trail; the fog covers rows beyond sight, with a dashed "edge of sight" line. The party's tokens along the bottom.
- **Brief:** the next room's map, enemy packs as red wax seals with their count, threats as small diamond seals beside them (gold when answered on that crossing, red outline when not). Heroes are round tokens with their portrait; tap a token then a crossing to place it (drag later). Small italic notes per crossing show active families ("Faith ●"). Bench below with state rings: red for death's door, greyed for tired. "Send them in".
- **Room (fight and aftermath):** top, the room ahead: a red ink front line per crossing whose position follows the tug value, tokens and seals beside it, animated between slices. A news ribbon under it with the slice's lines. Bottom, the previous room as a map with tappable points: bodies, the peddler's tent, a fallen hero's grave, a wounded hero's token. Action diamonds. "Go forward to help" with "You leave the room for good" under it, opening a sheet: one choice among the possible interventions and the list of what's left behind.
- **Report:** per crossing, a Held / Bent / Broken stamp; a fallen hero's portrait greyed with a black ribbon and one line about their last fight; titles earned, new wounds and fatigue; what waits in the room for the next aftermath; the next room's name and threats.
- Portrait states are overlays only: greyscale for dead and tired, a red ring for death's door, a black ribbon for dead.
- Every touch target at least 44 px. Test the screens with the existing PQ testing approach.

Stop for review.

---

## Step 7 – A quick balance check

A Node script `npm run sim:poc` that plays 200 runs with a simple bot: it assigns heroes greedily to answer threats on each crossing, then by strength, spends actions on tending first, then searching, and goes forward when a crossing's tug is below 0.3 and it holds a healing draught. Report: win rate, room reached, deaths per run, how often each crossing result happens, how often "Go forward" changed a crossing's result. Write the report to `doc/sim-report.md`. Agents run it; it should take under a minute.

Stop for review, with the numbers and a short list of what looks off.
