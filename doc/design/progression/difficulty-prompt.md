Progression pass: difficulty bands (easy / medium / hard / boss) for dungeons, patrols and fight events, a dungeon chain per tier, loot that grows with difficulty, and one coloured ring on the map and in the lists that shows it.

Why: a new player with ~1.5 items per hero sees 10–20% odds on everything. After this pass, every tier always has something winnable (easy), something to work towards (medium), and something worth preparing for (hard). The player sees which is which at a glance.

---

## 0. Workflow rules (read first, follow strictly)

- `git status` first. Leave unrelated changes alone (`doc/design/simulator/report.md`, `summary.json` and `.claude/settings.local.json` are already modified). Create a branch named `progression-difficulty` from `main`.
- One commit per numbered step below, with a clear message.
- After each step, run `npm run typecheck`, `npm run lint` and **only the tests next to the files you touched**. Run the full `npx jest` once, at the end.
- **Fix test failures in batches.** Run the suite once, group the failures by cause, fix every group, then run it again. Never do one test at a time.
- When a test asserts an old number that this pass changes on purpose, rewrite it to read the value from the config (`difficultyRules…`). Don't paste the new literal. When a test asserts behaviour, keep the behaviour.
- **No tuning loops.** Strength factors come from the fitting script in step 7, run once. Don't hand-tweak numbers and rerun the simulator to see what happens.
- **Time limits:**
  - `npm run sim:quick` at most twice.
  - The full `npm run sim` once, at the very end, and don't iterate on its result.
  - If any single command would take more than ~3 minutes, cut its run count and say so in the report.
- If you're stuck on the same problem after two attempts, stop and report it. Don't guess.
- All new player-facing text goes in both `en` and `fr` (the `content/fr/` files).
- Don't create sprites or art. Where a new enemy kind has no art, reuse the closest existing sprite or icon, and list it under "Art needed" in the report.

Naming: `src/game/sim/bands.test.ts` already uses "bands" for the simulator's target ranges. Call the new concept **difficulty** (`Difficulty = 'easy' | 'medium' | 'hard' | 'boss'`) everywhere, so the two don't get mixed up.

---

## 1. The difficulty model (one source of truth)

Create `src/content/difficulty.ts`. Everything else reads from it: no colours, multipliers or targets hard-coded anywhere else.

```ts
export type Difficulty = 'easy' | 'medium' | 'hard' | 'boss';

export const difficultyRules = {
  order: ['easy', 'medium', 'hard', 'boss'],
  /** Win-odds targets for the reference teams (step 7): [min, max] at the tier's start and end. */
  oddsTargets: {
    easy:   { start: [0.55, 0.65], end: [0.85, 0.90] },
    medium: { start: [0.25, 0.40], end: [0.65, 0.75] },
    hard:   { start: [0.05, 0.15], end: [0.50, 0.60] }, // measured with the kit that answers its threat
    // boss: keep the simulator's existing boss targets
  },
  /** Threat level by difficulty, before and from tier 3. Capped at 3. */
  threatLevel: { easy: [1, 1], medium: [1, 2], hard: [2, 3], boss: null /* unchanged */ },
  /** Party size for patrols by difficulty. */
  patrolParty: { easy: 1, medium: 2, hard: 3 },
  /** Patrol spawns by difficulty; the two kinds of a difficulty split it evenly. */
  patrolWeights: { easy: 0.5, medium: 0.35, hard: 0.15 },
  /** Rewards (step 5). */
  rewards: {
    easy:   { goldXp: 1,   chance: 1,    amount: 1,   qualitySteps: 0 },
    medium: { goldXp: 1.3, chance: 1.25, amount: 1.25, qualitySteps: 0 },
    hard:   { goldXp: 1.7, chance: 1.5,  amount: 1.5, qualitySteps: 1 },
    boss:   { goldXp: 1,   chance: 1,    amount: 1,   qualitySteps: 0 }, // bosses keep their own rows
  },
};
```

Also export the labels "Easy / Medium / Hard / Boss" (fr: "Facile / Moyen / Difficile / Boss").

**Display tokens.** Add them to the existing UI tokens in `src/components/ui/`, next to `good`, `bad` and the others:

| Difficulty | Ring colour | Ring width | Pips |
|---|---|---|---|
| easy | `#4E9A3E` | 2 px | 1 brass diamond |
| medium | `#D98A2E` | 3 px | 2 brass diamonds |
| hard | `#C9473A` | 4 px | 3 brass diamonds |
| boss | `#C9473A` inner ring, plus an outer `#C9A04E` brass ring | 4 + 2 px | a small brass crown instead of diamonds |

The pips use `brass #C9A04E` with the `outline #1E120A` edge. Colour is never the only signal: the pips and ring width carry the same information, for colour-blind players.

---

## 2. Dungeons: a chain of 6 plus the boss, per tier

Today each tier has 3 `short` and 3 `long` regular dungeons, a boss dungeon (`isBoss`), and a daily rotation that opens one short and one long dungeon (`game/dungeons/rotation.ts`, `content/rotation.ts`).

**New structure.**

- **Difficulty instead of slot.** Replace `slot: 'short' | 'long'` on `DungeonDef` with `difficulty: Difficulty` and `chainIndex: 0..6`. Order the regular ones easy, easy, medium, medium, hard, hard, then the boss at 6.
- **Assigning the existing dungeons.** Rank the 6 regular dungeons of each tier by their current win odds with the end-of-tier reference team (step 7's helper). The two easiest become easy, the next two medium, the two hardest hard. Tier 1's first dungeon must stay the one the tutorial uses (check `content/tutorial.ts`). If the tutorial uses one that ranks lower, put it first anyway and say so in the report.
- **Duration.** Easy uses the tier's current short duration, hard the current long one, and medium the rounded midpoint.
- **Encounter count.** Easy and medium `[4, 5]`, hard `[5, 6]`.
- **Gold and XP.** The tier's current short-slot gold and XP × `rewards[difficulty].goldXp`. Replace `tier1Gold` and `slotGold` with a difficulty-based helper. The boss keeps its own gold.
- **Strength.** Keep each dungeon's enemies, trap and boss. Only its strength factor changes, from step 7.

**Unlocking.** Rewrite `isDungeonUnlocked` in `game/dungeons/unlock.ts`:

- Tier 1, `chainIndex` 0 is open from the start.
- Tier N, index 0 opens when the tier N−1 boss is cleared (as today).
- Index i opens when index i−1 of the same tier is in `save.clearedDungeons`.
- **Existing saves:** a dungeon also counts as unlocked if any dungeon later in its tier's chain is cleared, or if its tier's boss is cleared. Nobody loses access. Add a test for each rule.

**The daily rotation stays, but it rotates briefings, not dungeons.** Every unlocked dungeon is open every day. What changes each day, at the same reset hour (`rotationRules`) and the same for every player, is each open dungeon's **briefing**: its threats (drawn from its table, as `composeBriefing` does today), its restriction and its opportunity. The surge stays too.

- **Remove:** the short/long slot picking and the `TierRotation.short` / `long` fields.
- **Keep the variety rules, applied to briefings instead:**
  - A dungeon's briefing must differ from its own briefing yesterday: at least one threat, or the restriction or opportunity. If the roll comes out identical, re-roll with a salted seed (`threats|${day}|${id}|1`, and so on). Keep it deterministic.
  - Within a tier, two open dungeons should not share the same main threat on the same day where the tables allow it. This replaces the old "the long slot avoids the short slot's main tag" rule.
- **Keep:**
  - the `Rotation` type, as `{ day, tiers: Record<tier, { briefings: Record<dungeonId, Briefing>; surge }> }`
  - `nextRotationAt`
  - the debug briefing overrides (drop the slot overrides)
  - the countdown to the next rotation in the expeditions screen, relabelled "New briefings in {time}" (en/fr)
- **Tip text:** the dungeons tip in `content/reveal.ts` says the list changes every day. Change it to say every dungeon's threats and conditions change every day (en/fr).
- **Tests:** rewrite `rotation.test.ts` for the new behaviour. It should cover the same briefings for everyone on a given day, a change from yesterday, the main-threat spread within a tier, and the surge.
- **Callers:** check every caller of `dailyRotation` and `TierRotation` (the expeditions screen, `isDungeonAvailable`, the quick sim, the bot, debug) and update them.

**Unchanged:** the overnight expeditions, unlocked with the tier (they count as **easy**), and the secret underwater dungeons (they count as **hard**). The underwater ones currently find "the tier's long dungeon": point that lookup at the tier's first hard dungeon instead.

**Dungeon list UI** (`DungeonCard.tsx` and the expeditions screen):

- Show the tier's chain in order.
- Each card has the difficulty ring around its icon, plus the pips.
- The next locked dungeon shows greyed, with a lock and "Clear {previous name} first" (en/fr). Later locked ones are hidden behind a single "{n} more to discover" line.

---

## 3. Patrols: 6 kinds per tier, 2 per difficulty

Replace `PatrolKind` (`goblins | herd | bandits`) with these kinds. Each kind enters as hard and moves down one difficulty per tier:

| Tier | Easy | Medium | Hard |
|---|---|---|---|
| I | herd, wolves | goblins, bandits | orcs, spiders |
| II | goblins, bandits | orcs, spiders | eliteGoblins, outlaws |
| III | orcs, spiders | eliteGoblins, outlaws | ogres, eliteOrcs |
| IV | eliteGoblins, outlaws | ogres, eliteOrcs | trolls, wraiths |
| V | ogres, eliteOrcs | trolls, wraiths | wyverns, golems |

Put this table in `content/patrols.ts` as data (`patrolTable[tier][difficulty] = [kindA, kindB]`), and derive "which tier and difficulty is this kind" from it.

**Kinds.** Each needs a template in `enemies.ts` (hp, damage, tags, foes) like the existing three, plus a name (en/fr), a threat in `patrolThreats`, and a material theme.

- `eliteGoblins`, `outlaws` and `eliteOrcs` reuse the goblins, bandits and orcs templates with the existing elite mob mechanism, rather than new templates.
- Keep the old ids `goblins`, `herd` and `bandits` unchanged, so saved patrol results still resolve.
- Material themes use **existing materials only**. Don't invent materials.

| Kind | Tags | Threat | Notes |
|---|---|---|---|
| herd | beast | beasts | existing |
| wolves | beast | swarm | can reuse the herd sprite |
| goblins | locals | ambush | existing, keeps its flee rule |
| bandits | locals | thieves | existing |
| orcs | brute | brute | new |
| spiders | vermin | poison | new |
| eliteGoblins | locals | ambush | elite goblins |
| outlaws | locals | thieves | elite bandits |
| ogres | brute | brute | new |
| eliteOrcs | brute | armoured | elite orcs |
| trolls | brute | brute | new |
| wraiths | spirit | undead | new |
| wyverns | dragon | element | new; pick an element per spawn as fight events do |
| golems | construct | armoured | new |

The two kinds sharing a difficulty in a tier must carry **different** threats. The table already satisfies this, so keep it that way if you change anything.

**Threat level** comes from `difficultyRules.threatLevel` for the patrol's difficulty and tier, not a fixed 1.

**Spawning** (`game/patrols/generate.ts`):

- Remove `tierWeights` (current, below, elite) and `patrolTier`'s "below" roll. A patrol always fights at the highest unlocked tier.
- Roll the difficulty with `patrolWeights`, then pick one of that difficulty's two kinds evenly. Keep the rolls seeded as they are now, so spawns stay the same for everyone in a tile and window.
- `kindWeights` goes away.

**Party and groups.** Party size comes from `patrolParty[difficulty]`. Fight groups (`patrolKinds[*].groups`, `fightMinutes`) are per difficulty:

- easy: the current goblins setup
- medium: the current bandits setup
- hard: three weak and two normal across two groups, 6 minutes

**Escort** (pocket mode): replace `escort.types` with `escort.difficulties: ['easy', 'medium']`. Keep `minOdds` and `minHpShare`.

**Map and panel:**

- `PatrolMarker` gets the difficulty ring and pips.
- `PatrolPanel` shows a difficulty chip (ring colour, pips and label) beside the name.
- Patrol alerts mention the difficulty: "Hard patrol nearby: Orcs".

---

## 4. Fight events and every other fight

Every source that shows win odds and starts a fight gets a difficulty. To find them all, list the callers of `estimateOdds`, `estimatePartyOdds` and `patrolOdds`, plus `placeFightDungeon`. Known ones:

| Source | Difficulty |
|---|---|
| bandit camp, abandoned caravan | easy |
| goblin raid, beast den | medium |
| haunted crypt, elemental rift, Wanted Outlaw, monster lair | hard |
| patrols | from the table in step 3 |
| regular dungeons | from the chain |
| tier boss dungeons | boss |
| overnight expedition | easy |
| underwater secret dungeons | hard |
| sanctum guardian fights | hard |

- Add `difficulty` to `PlaceFightKindRules`.
- Fight events' party size and groups stay as they are. Their threat level follows `difficultyRules.threatLevel`.
- If you find another fight source not in this table, give it the difficulty its current end-of-tier odds put it in, and list it in the report.

**The Wanted Outlaw never spawned in the last simulator run.** Check whether it can spawn at all (place generation weights, unlock conditions, density) and fix it if it's a bug. Explain what you found in the report.

**Map:** every fight-event marker and the sanctum marker get the ring and pips. Places with no fight (ruins, travellers, taverns, shops, treasure, docks and the like) keep their plain brass frame. That's the rule: **a coloured ring always means a fight, and its colour is how risky that fight is.**

---

## 5. Loot grows with difficulty

The loot matrix is generated from `doc/design/loot/matrix.csv` by `npm run loot:matrix`. Edit the CSV and regenerate. Never edit `matrix.ts` by hand.

1. **Patrol rows:** replace `patrolGoblins`, `patrolHerd` and `patrolBandits` with a single `patrol` row, whose marks are the current `patrolGoblins` row. Keep per-kind flavour through `lootConfig.materialThemes`, keyed by patrol kind. Bandits and outlaws keep `cache: true`, herd and wolves `meat/hide/bone`, and so on. Update `LootSourceId`, `sourceMultipliers` and every reference, including the sim's metrics and config.
2. **The difficulty multiplier.** Wherever a loot roll knows its source's difficulty (patrols, fight events, dungeon runs, first win, overnight, underwater, sanctums), apply `difficultyRules.rewards[difficulty]`:
   - `goldXp` multiplies gold and XP.
   - `chance` multiplies every non-`A` mark's drop chance, still capped by `lootConfig.maxChance`.
   - `amount` multiplies material, shard and monster-part amounts, rounded half up, at least 1.
   - `qualitySteps` raises gear quality the same way the charm's `qualitySteps` does.

   Do it in one place in the loot roll (pass `difficulty` in), not per source.
3. **First clear of each chain dungeon:** add a `firstDungeonClear` matrix row, paid once per dungeon (track it like `clearedDungeons`). Gold A, XP A, gear A, blueprints S, everything else as `dungeonRun`. It stacks with the difficulty multiplier, so the first hard clear pays a gear piece at least one quality step up. Keep `firstTierClear` for the boss as it is.
4. **The result UI** (`LootReveal` / `ReportCard`) shows the difficulty chip on the report header. That's all: no new reward screens.

---

## 6. One ring component, used everywhere

In `src/components/ui/`, add:

- `DifficultyRing`: wraps any marker or icon and draws the ring (and the boss's double ring) from the tokens in step 1. Square pixel corners, matching the rest of the UI kit.
- `DifficultyPips`: 1–3 brass diamonds, or the crown for the boss.
- `DifficultyChip`: ring colour, pips and label, for panels, cards and reports.
- Export all three from `index.ts` and add them to the debug UI kit section.

**Map markers become diamonds.** The square tile markers on the map become squares rotated 45°, matching the diamond icons of the UI kit (`DiamondRail`, `DiamondButton`):

- **Which markers:** every tile marker on the map: `PatrolMarker` (patrols and travellers), `SanctumMarker`, the place markers in `MapMarkers` (fight events, ruins, taverns, shops, docks, treasure and the rest) **and the resource markers in `SpawnMarker`** (wood, ore, herbs, animals).
- **Resource markers specifically:**
  - Their border is coloured by kind today (`borderColors`: herb green `#2f6b2a`, animal brown and so on), which would read as a difficulty ring. Change the border to the neutral `outline #1E120A`, and move the kind colour **inside**, as a light tint of the diamond's fill: wood `#E8D3B8`, ore `#DADAD6`, animal `#EBD7BC`, herb `#D7E6C8`. Resources then never wear a coloured ring.
  - Keep the in-range, fleeing and locked states. In-range combines the rotation and the scale in one transform (`[{ rotate: '45deg' }, { scale: 1.2 }]`).
  - The tree sway stays on the counter-rotated icon, never on the diamond itself.
  - The tile is 30 px today, so add `hitSlop` to bring the tap target to 44 pt.
- **How:** rotate the tile, not its content. The emoji or icon inside is counter-rotated so it stays upright. Keep the current footprint: a rotated square's width is its side × 1.41, so shrink the side until the diamond's width matches the old tile's width. Keep the tap target at least 44 × 44 pt.
- **The ring follows the diamond.** `DifficultyRing` draws a diamond-shaped ring around diamond markers, and a square one around square icons in lists and cards (`shape: 'diamond' | 'square'` prop). Non-fight places keep their plain brass outline, now diamond-shaped. Resources get the neutral dark outline described above.
- **Pips** sit centred just below the diamond's bottom point, never inside it.
- **Badges:**
  - Patrols now always fight at the highest unlocked tier, so drop the tier badge and the elite styling from patrol markers. The difficulty ring and pips replace both.
  - Other markers that still need a corner badge (e.g. a sanctum's tier) put it on the diamond's right point.
- **The "fresh" pulse** (`PatrolMarker`'s border animation) animates the difficulty ring's width now, from its base width to double, not the tile border.

Then use the ring, pips and chip on every fight source from step 4, and **nowhere else**. Check each of these:

- `PatrolMarker`, `MapMarkers` / `SpawnMarker` (fight events), `SanctumMarker`
- `PatrolPanel`, `PlaceFightPanel`, `SanctumPanel`, `SendDialog` (header chip)
- `DungeonCard`, `OvernightCard`, the expeditions dungeon list, `ReportCard`
- patrol alert notifications (text only)

Accessibility: each ringed marker's `accessibilityLabel` includes the difficulty label ("Orcs, hard patrol").

Add a test that renders `DifficultyRing` for each difficulty and checks it reads its colour and width from the tokens, so nobody hard-codes them later.

---

## 7. Strength fitting and simulator checks

**Reference teams.** Extend `src/game/sim/reference.ts` with two presets per tier t, using the sim's usual class mix sized to the fight's party:

- **start of tier t:** the level `expectedLevels` gives at the tier's start, Common quality, tier `max(1, t−1)` gear. At tier 1, weapon only (no armour), to stand in for a new player with about 1.5 items per hero.
- **end of tier t:** the level at the tier's end, Uncommon quality, tier t weapon and armour.
- Both carry healing potions. **Hard** sources are also measured with the consumable or kit that answers their threat, as the sim's prepared loadout does.

**Fitting script.** Write `scripts/sim/fitDifficulty.ts` (with an npm script `sim:fit`):

1. For every source × tier, bisect its strength factor until the end-of-tier odds hit the middle of `oddsTargets[difficulty].end`. Use a fixed seed, ~200 runs per estimate and at most 8 bisection steps.
2. Then measure the start-of-tier odds at that factor and record pass or fail against `.start`. Don't refit for the start. If it misses, report it. It means the tier's gear jump is too big or small, which is a design call.
3. Write the factors to a generated file, `src/content/difficultyFactors.ts`, with a "generated, do not edit" header like `matrix.ts`. `enemies.ts` and `dungeons.ts` read from it, replacing the `*_FACTORS` arrays and the `kindFit` hack where they're superseded.

   Sources: each patrol kind at each tier it appears in, each fight-event kind, and each chain dungeon. Bosses keep their current factors, **except** the tier 4 and 5 bosses, which the last report found too weak: fit them to the existing boss target too.

The whole script must run in under ~3 minutes. If it doesn't, lower the runs per estimate and say so.

**Simulator.**

- Add the per-difficulty odds (start and end of each tier) to `quick.ts`'s output and to `summary.json`.
- Add matching checks to `bands.test.ts`, under `SIM_CHECK`.
- The bot (`bot.ts`) must follow the chain: it can only run unlocked dungeons. Prefer the highest-difficulty dungeon whose odds are at least the bot's existing threshold, otherwise the best odds available.
- Patrols in the bot use the new spawn table.
- The loot matrix's `visitsPerDay` for `dungeonRun` is 6, but the last report saw ~4.5 launches a day. Set it to 5.
- In the report, name the stone or copper bottleneck in tiers 2–3 if you still see it. Don't fix it in this pass.

Run `npm run sim:fit` once, `npm run sim:quick` once to confirm, then the full `npm run sim` once at the very end.

---

## 8. Final report

Keep it short, in this order:

1. **What changed**, one line per step, with its commit.
2. **Odds table:** source × tier × start and end odds, marking misses.
3. **Dungeon assignment per tier:** which dungeon became easy 1, easy 2, and so on, plus any tutorial exception.
4. **Fight sources found** beyond the table in step 4, and the difficulty given to each.
5. **Wanted Outlaw:** the cause, and the fix or the reason there's none.
6. **Art needed:** each new patrol kind and the sprite it's borrowing for now.
7. **Simulator summary:** days per tier and total, and anything still out of range.
8. **Anything you stopped on**, after two attempts.
