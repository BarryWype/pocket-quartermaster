# Phase 2 implementation spec: stats and equipment

**Status: proposal, waiting for approval.** The design catalogue (`README.md`, the CSVs and `tools/gear-budget.py`) is the source for names and numbers; this file says how they map onto the code. As in phase 1: no balancing, no simulator runs, `targets.ts` untouched.

## Ground rules

Same as phase 1: rules in `src/game` (pure TS, no React/Expo), content and numbers in `src/content`, strict TS, `rules = xRules` default parameters, seeded rngs, English + French. Done means `npx jest`, `npx tsc --noEmit`, `npx expo lint` pass and `npm run sim` still runs (not analysed).

## Two commits

- **2a: stats and growth.** New `Stats`, class base stats, growth, milestones and approach picks, recruitment roll and grade, Luck, enemy damage type and Speed, the new combat formulas (Power/Magic, Armour/Resistance, Evasion, Speed, Crit), infusion. Today's gear keeps working through a thin conversion (attack → Power, defense → Armour, wand/staff/lute deal Magic). Hero card, tavern grade, approach picker, level cap and new XP curve. Save migration 15 → 16 (levels above 15 brought down; every new hero field is optional: missing roll = average roll, no picks yet).
- **2b: equipment.** Item types, budget, slots, affinities, gear keywords, Heavy/Concealed, casting penalty, recipes and the temporary unlock rule, the equipment and forge screens, debug tools, the save migration (store version 16 → 17), the simulator bot.

## Max level and XP curve

- **Today there is no cap.** XP to the next level is `100 × L^1.5`. The simulator measured the party at levels 2, 4, 6, 8, 10 at each tier boss's first attempt (`expectedLevels`), i.e. at 100 / 903 / 2.8k / 6.1k / 11.1k total XP.
- **New curve: `25 × L^1.65`** (`xpRules.base` 25, `exponent` 1.65, `maxLevel` 15). Fitted so the same total XP lands on levels 3 / 6 / 9 / 12 / 15: level 15 at the tier 5 boss.

| Level | XP to next | Total XP to reach | | Level | XP to next | Total XP to reach |
|---|---|---|---|---|---|---|
| 1 | 25 | 0 | | 9 | 939 | 2,732 |
| 2 | 78 | 25 | | 10 | 1,117 | 3,671 |
| 3 | 153 | 103 | | 11 | 1,307 | 4,788 |
| 4 | 246 | 256 | | 12 | 1,509 | 6,095 |
| 5 | 356 | 502 | | 13 | 1,722 | 7,604 |
| 6 | 481 | 858 | | 14 | 1,946 | 9,326 |
| 7 | 620 | 1,339 | | 15 | — | 11,272 |
| 8 | 773 | 1,959 | | | | |

- **Where heroes would be**: tier 1 → 3, tier 2 → 6, tier 3 → 9, tier 4 → 12, tier 5 → 15. Milestone 5 lands in tier 2, 10 in tier 4. This assumes today's XP income; the balancing phase's sim run will confirm it. `expectedLevels` in `sim/config.ts` becomes `[3, 6, 9, 12, 15]` (not `targets.ts`).
- At level 15, XP is simply not gained (`addXp` returns the hero unchanged, xp stays 0). Training XP and the lower-tier share unchanged. The XP bar shows "Max level".
- **Migration** (2a): levels above 15 → 15 with xp 0. Other heroes keep their level; xp clamped below the new next-level need. Nobody is re-levelled from total XP (it isn't stored).

## Part 1: stats (2a)

### Types

```ts
export type StatKey = 'hp' | 'power' | 'magic' | 'armour' | 'resistance' | 'evasion' | 'speed' | 'crit';
export type Stats = Record<StatKey, number> & { luck: number };   // evasion and crit in % points
export type DamageStat = 'power' | 'magic';
```

`HeroClassDef` loses `growth`, `affinities` (2b) and gains `primary: [StatKey, StatKey, StatKey]`, `halfRate?: StatKey`, `damageStat: DamageStat` (unarmed attacks; from `affinities.csv`). `MobDef` gains `damageType: 'physical' | 'magic'` and `speed: number`.

`HeroState` gains `roll?: { base: Record<StatKey, number>; growth: Record<StatKey, number>; approach?: Approach }` (3d6 sums, 3–18; missing = 10.5 everywhere, the average roll) and `approachPicks?: Approach[]` (the level 5 and 10 choices, in order).

### Class base stats (`content/heroes.ts`)

Converted from today: HP = hp, Power = attack, Magic = magic, Armour = defense. New stats get a flat baseline, a bit more when they are primary: Resistance 1 (primary 3), Evasion 0 (primary 5), Speed 5 (primary 7), Crit 5 (primary 10; today everyone has 10%). Primaries from `classes.csv`. Bold = primary.

| Class | HP | Power | Magic | Armour | Resistance | Evasion | Speed | Crit | Damage stat |
|---|---|---|---|---|---|---|---|---|---|
| Warrior | **30** | **4** | 0 | **3** | 1 | 0 | 5 | 5 | Power |
| Barbarian | **32** | **6** | 0 | 0 | 1 | 0 | 5 | **10** | Power |
| Paladin | **32** | 3 | 0 | **4** | **3** | 0 | 5 | 5 | Power |
| Ranger | 24 | **5** | 0 | 1 | 1 | **5** | **7** | 5 | Power |
| Thief | 22 | **5** | 0 | 1 | 1 | **5** | 5 | **10** | Power |
| Fire mage | 22 | 0 | **6** | 0 | 1 | 0 | **7** | **10** | Magic |
| Frost mage | 22 | 0 | **6** | **0** | **3** | 0 | 5 | 5 | Magic |
| Sorcerer | 20 | 0 | **6** | 0 | **3** | 0 | 5 | **10** | Magic |
| Cleric | **26** | 2 | **3** | 2 | **3** | 0 | 5 | 5 | Magic |
| Druid | **24** | 0 | **5** | 1 | 1 | **5** | 5 | 5 | Magic |
| Troubadour | 22 | 2 | **2** | 1 | 1 | **5** | **7** | 5 | Magic |

Class abilities stay (Thief's +15% crit, Sorcerer's advantage, etc.). Note the scale shift: growth steps from `stats.csv` (HP +8, Power/Magic +2 per level) are much bigger than today's (+2–3.5 HP, +0.6–0.9 attack), and the new gear budgets are smaller than today's gear. Dungeons will feel different until the balancing phase.

### Growth (`src/game/team/stats.ts`, numbers in `content/heroes.ts` as `growthRules`)

At level L, for each combat stat, with `b`, `g` the roll factors:
- base × (1 + b)
- primary: + step × (L − 1) × (1 + g)
- secondary: + step × (milestones reached among 5, 10, 15) × (1 + g)
- half-rate stat (data only, unused): + step / 2 × (L − 1) × (1 + g)
- Luck: +1 at level 15.

Steps from `stats.csv`: HP 8, Power 2, Magic 2, Armour 1, Resistance 1, Evasion 1, Speed 1, Crit 1. Then gear (2b) and trait multipliers on top, rounded for display (Evasion shown capped at 40).

**Approach picks**: pending = (milestones 5 and 10 reached) − picks made. A hero with a pending pick gets a badge on the team list and the hero screen opens the picker (5 approaches, the ones at 5 disabled). `pickApproach(save, heroId, approach)` throws if nothing is pending or the approach is at the cap. Approaches = class + trait + recruit bonus + picks + gear (lute, tome, 2b), clamped 0–5; kits +2 on top as in phase 1. Existing heroes at 5 or 10 get their pending picks for free (derived).

### Recruitment roll (`src/game/taverns/roll.ts`, numbers in `recruitRules.roll`)

- Seed `recruitRoll|${offer.id}` (offer id = tavern + day + index), drawn separately so today's class/name/trait draws don't move. Same recruit for every player.
- 3d6 per stat, base and growth: factor = (sum − 10.5) / 7.5 × 15% (base) or × 8% (growth). Luck isn't rolled.
- 10% chance of +1 on a random approach.
- **Grade** from the total of the 16 sums (mean 168, σ ≈ 11.8): S ≥ +18, A ≥ +6, B ≥ −6, else C (≈ 7 / 24 / 38 / 31%). Price × 0.85 / 1 / 1.2 / 1.5 for C / B / A / S, on top of today's trait factor.
- **Arrows**: per stat, ▲ if base + growth sums are ≥ 3 above average, ▼ if ≥ 3 below.

### Combat (`simulate.ts`, numbers in `expeditionRules`)

`PartyMember` swaps `damage / magic / defense` for `power, magic, damageStat, armour, resistance, evasion, speed, crit, luck`, plus (2b) `keywords`, `heavy`, `concealed`, `channel`.

- **Attack**: the weapon's damage stat (unarmed: the class's). Power hits have no element (unless infused, below). Magic hits use the weapon's infusion, else the class element, and the wheel (×1.5 / ×0.75; Channel 1.7, Sorcerer's ability as today).
- **Armoured threat**: its `weakenedAgainst` penalty applies fully to Power hits and at half strength to Magic hits ("partly ignores Armour", `magicArmourShare: 0.5`). Pierce heroes ignore it (2b).
- **Taken**: physical enemies → `× 100 / (100 + 4 × Armour)`; magic enemies → same with Resistance. Element rules (armour infusion, resists, Element threat) stay on top.
- **Evasion**: each enemy hit on a hero is avoided with chance `min(Evasion, 40)%`.
- **Speed**: each round, compared with the fastest living enemy: heroes at least as fast act before the enemies, slower heroes after them. Exposed fights: enemies act first in round 1 whatever the Speed. Each hero faster than that enemy gets a second attack with chance `0.1 × difference`, max 50% (`speed: { secondAttackPerPoint: 0.1, max: 0.5 }`).
- **Crit**: hero chance = Crit % + crit abilities and charms; multiplier stays ×1.5. Enemies keep today's flat 10% (`enemyCritChance`). Cursed luck still removes all crits.
- **Anti-magic zone**: hero Magic × 0.5 (all Magic, gear included), partyHeal × 0.5 as today. Keyword sources: see 2b.
- **Luck** (`luckRules`): party Luck = sum of heroes' Luck. Gold and materials × (1 + 5% per point); recipe drop and main reward chances × (1 + 10% per point). Patrol and Sanctum rewards the same.

### Infusion (`infusionRules` in `content/sanctums.ts`)

- Physical weapon: 70% of the hit stays physical (no element), 30% becomes the element, plus 10% of Power as extra elemental damage; the elemental part follows the wheel (+30% / +10% / 0% overall, as `infusion.csv`).
- Magic weapon: the infusion replaces the element.
- Armour infusion: unchanged.

### Enemies (`content/enemies.ts`)

- **Damage type**: magic if the enemy has an element, or is a caster (orc shaman, lich of the deep, mine wraith, mine ghost, barrow wight, grave lord, shaft haunt); everything else physical. Patrols and hostile locals physical; Sanctum minions and guardians magic (they have an element).
- **Speed**: `slow 3 / normal 5 / fast 7`, plus `+1 per tier above 1` (`speedPerTier`), so tier 5 normal enemies have 9. Patrols: herds fast, goblins and bandits normal. Hostile locals, Sanctum enemies normal. With heroes at 5–7 base and primaries +1 a level, Speed classes stay ahead; others tie early and fall slightly behind late.
- Full table at the end of this file.

## Part 2: equipment (2b)

### Types and content

```ts
export type WeaponType = 'sword' | 'axe' | 'mace' | 'dagger' | 'bow' | 'spear' | 'warhammer' | 'wand' | 'staff' | 'lute' | 'censer' | 'knuckles';
export type ArmourType = 'plate' | 'mail' | 'leather' | 'robes';
export type OffhandType = 'shield' | 'buckler' | 'offhandBlade' | 'quiver' | 'tome' | 'focus';
export type GearType = WeaponType | ArmourType | OffhandType;     // also the mastery key (22)
export type EquipmentSlot = 'weapon' | 'armor' | 'offhand' | 'trinket' | 'consumable';
```

(`instrument` becomes `lute`; the save key `armor` stays to keep the migration small.)

- `src/content/equipment.ts`: `gearProfiles` (one per type, from `equipment-profiles.csv`: slot, damage stat, hands, extras, keywords, heavy, concealed, split, emoji), `gearBudgetRules` (every constant of `gear-budget.py`: tier scale, slot budgets, extra costs, major/minor keywords, two-handed share 0.9, HP per point 10, +1% Evasion per tier), `gearNames` (`item-names.csv`), `gearRecipes` (`equipment-recipes.csv`, as data), `classAffinities` (the 11 classes from `affinities.csv`), `affinityRules` (×1.2 / ×1 / ×0.6), `castingPenalty` (mail 0.15, plate 0.3), `gearKeywordRules`, `gearLuckRules` (Legendary: 5% chance of +1 Luck).
- `src/game/equipment/budget.ts`: `gearItemStats(profile, tier, rules)` — the same maths as `item()` in `gear-budget.py`. `items.ts` builds the 110 `GearDef`s from it at load (id `${type}${tier}`, e.g. `sword3`, `offhandBlade2`; existing sword/bow/wand icons kept). A test checks a sample against `equipment-tiers.csv` (sword 1–5, warhammer 3, dagger 5, plate 4, leather 2, robes 5, shield 1, buckler 3, focus 4).
- Quality, the forge roll and mastery keep working; quality × roll × affinity multiply the scaling stats (Power, Magic, Armour, Resistance, HP) only. Speed, Crit and Evasion extras stay flat (a ×0.6 on a −2 Speed malus would read oddly).
- Legendary forges roll the Luck chance (seed `${uid}|luck`), stored on `GearInstance.luck`.
- Names: "Rare Copper sword" (quality first; Normal shows no prefix as today), with a small T1–T5 badge. French names written per type and tier in `content/fr/names.ts`.
- Trinket: one debug item, `testCharm` (slot `trinket`: +1 Luck, +2% Crit), never crafted or dropped.

### Slots (`src/game/equipment/slots.ts`)

`slotProblem(save, hero, slot, gear)` returns null or a reason (`twoHanded`, `shieldNeedsOneHanded`, `quiverBowOnly`, `bowQuiverOnly`, `needsMagicWeapon`):
- A two-handed weapon (warhammer, staff) takes the off-hand: equipping it unequips the off-hand; the off-hand slot shows locked.
- Shield: only with a one-handed weapon. Quiver: only with a bow. Tome and focus: only with a Magic weapon. Buckler, parrying dagger: any one-handed weapon or none.
- **Bow**: fully functional alone; its off-hand can only be a quiver or empty, and the quiver adds its stats and Reach on top.
- Changing the weapon unequips an off-hand that no longer fits.

### Affinities and casting

- `affinityOf(classId, type)`: favoured / usable / unfit for weapon and armour types; off-hands and trinkets always usable. Nothing is restricted: `canWield` goes, all gear is open to all classes.
- Casting penalty: hero Magic × 0.85 in mail, × 0.7 in plate, unless that armour is favoured for the class.

### Gear keywords (`Keyword` gains parry, reach, stagger, brace, channel, inspire, mend)

Keywords come from the equipped weapon, armour and off-hand (any affinity), plus class, trait and kit as in phase 1 (`source: 'gear'` replaces `'weapon'`). `weaponKeywords` goes. The Paladin keeps Guard as a class keyword. Numbers in `gearKeywordRules`, first guesses:

| Keyword | Rule |
|---|---|
| Pierce, Cleave, Blessed, Guard | Count for Armoured, Swarm, Undead, Brute as in phase 1. Plus: Pierce hits ignore the Armoured penalty; Cleave hits also deal 30% to a second enemy; Guard ×1.5 to the hero's chance of being targeted. Blessed has no extra effect (no regeneration exists yet). |
| Parry | 15% chance to block a physical hit |
| Reach | Acts before the enemies in round 1 of every fight, exposed or not |
| Stagger | 15% chance per hit that the target loses its next attack |
| Brace | The first hit of each fight above 10% of max HP is halved |
| Channel | Elemental advantage ×1.7 instead of ×1.5 |
| Inspire | Party damage ×1.05 while the hero is up (counts once, stacks with the Troubadour's buff) |
| Mend | After each fight, the most wounded conscious hero heals 5% max HP (healing rules apply) |

- **Heavy** (warhammer, plate): the Speed malus is in the profile; the Underwater threat's `weakened` penalty counts double for the wearer (penalties keep their threat id for this).
- **Concealed** (dagger, wand, lute, knuckles, parrying dagger): on Sacred ground a hero counts fully when weapon and off-hand are both concealed or empty; otherwise × 0.6. `concealedWeapons` goes (the staff isn't concealed any more).
- **Anti-magic zone answers**: keywords from a magic source don't count: a Magic weapon or off-hand (wand, staff, lute, censer, tome, focus), or a class whose damage stat is Magic (fire mage, frost mage, sorcerer, cleric, druid, troubadour). Kits, traits and physical gear keep working. `magicClasses` goes (derived from `damageStat`). The composition check (`restrictionKeepsAnswers`) uses the same rule, so a restriction still never removes the last answer to a threat in that dungeon.
- Kit keywords, class keywords and Light sleeper stay as they are.

### Recipes and the temporary unlock rule

- `recipes.ts`: 110 gear recipes from `gearRecipes` (id = item id), pickaxes, steel smelting and provisions unchanged. Old gear recipes removed. `extraWeaponTypes`, `WEAPON_POWER`, `extraWeaponInputs` go.
- `knownRecipes` stays the single source: a gear recipe can only be crafted when known.
- **`src/game/crafting/recipeUnlocks.ts`, marked TEMPORARY (replaced by blueprints)**, holds the whole rule:
  - `startingRecipes`: sword1, bow1, quiver1, wand1, mail1, shield1.
  - `tierRecipes(tier)`: every type of a tier. The pickaxe recipes' `unlocks` call it (wood pickaxe → tier 2, …, iron pickaxe → tier 5 + smelting).
  - Recruiting teaches nothing: `learnWeaponTypes` and its call in `recruit` go.
  - `legacyRecipeId(oldId)`: old id → new (`copperBow` → `bow3`, `ironArmour` → `mail4`, `stoneLute` → `lute2`). Dungeon `recipeDrops` in content are rewritten to the new ids; the daily blueprint keeps choosing among them (ranking by favoured types instead of `canWield`).
- Mastery: per type (22). A type met first through a later-tier recipe starts at the cap of the tier before, as today.

## Part 3: UI

- **Hero screen**: HP, Power or Magic (the weapon's), Armour, Speed large; Resistance, Evasion ("capped" at 40), Crit, Luck small; approaches as pips ●●●○○; keywords as chips; the pending-pick badge and picker.
- **Equipment**: weapon, armour, off-hand (locked under a two-handed weapon), trinket, consumable. The picker lists every item of the slot with its quality colour, T badge, ▲/▼ for the hero, the stat changes it would make (with affinity and casting penalty), and greys out the ones that can't go in, with the reason.
- **Forge**: gear recipes grouped by type, a T1–T5 row each, known and unknown (unknown greyed, inputs shown).
- **Tavern**: grade letter and ▲/▼ per stat on each recruit.
- ▲/▼ markers wherever gear is listed for a selected hero (picker, inventory with the hero filter if any, forge result).
- English and French strings.

## Part 4: simulator (minimal)

The bot forges and equips per hero: the best tier it can craft, favoured types first (weapon of the class's damage stat, then armour, then the off-hand that fits: quiver for bows, focus for Magic, shield for one-handed Power). Pending approach picks go to the class's first marked approach in `classes.csv`, else Might. The report keeps compiling; columns that read attack/defense switch to the new stats. Tests that assert tuned odds (balance bands, patrol and Sanctum odds) get `skip` with the phase 1 comment if they break.

## Debug tools (`src/app/debug.tsx`)

Grant any gear type × tier × quality; grant the test trinket; learn or forget any recipe (and "learn all"); set a hero's level (pending picks follow); reroll a tavern's recruits (exists, extended to show the roll).

## Save migrations

**2a (15 → 16)**: levels capped at 15 (see "Max level and XP curve"); no other change, new hero fields are optional.

**2b (16 → 17)**:

- **Gear**: every owned or equipped piece → same type and tier, quality, roll and infusion kept (`*Armour` → mail, `*Lute` → lute). Bows stay as they are (they work without a quiver).
- **Known recipes**: mapped one to one; each owned pickaxe opens the next tier's types; the tier 1 starting set added.
- **Mastery**: weapon types carry over, `instrument` → `lute`, `armour` → `mail`.
- **Heroes**: no stored stats to convert. `offhand` and `trinket` slots added empty, no roll (= average), no picks (so heroes at 5 or 10 have pending picks). The old `canWield` check goes.
- **Running expeditions**: resolved with the party recomputed at resolution (as today, `prepareParty` runs at resolve). There's no snapshot of launch stats to replay, and the mapped gear exists under its new id, so recomputing is the safe path.
- Debug store: forced item lists reset if they hold old ids.

## Tests

As listed in the request: damage, Evasion cap, Speed order and second attack, Crit, infusion, growth and milestones, picks and cap, Luck at 15, no XP at level 15, bow with and without a quiver, Anti-magic on magic-sourced keywords, roll bounds / grade / determinism, budget vs `equipment-tiers.csv`, slot constraints, affinity multipliers, keywords on unfit items, casting penalty, Heavy, Concealed, Anti-magic, gear keywords answering threats, recipes vs `equipment-recipes.csv`, unknown recipes, starting set, tier unlock, migration.

## Placeholders for the balance phase

The keyword numbers, the speed scale (3/5/7 + 1 per tier), the Resistance/Evasion/Speed/Crit baselines, the grade thresholds and prices, the Luck bonuses and the XP curve are first guesses, all in config.

## Enemy damage type and Speed

Speed class: slow 3, normal 5, fast 7, +1 per tier above 1.

| Tier | Dungeon | Enemy | Damage | Speed class |
|---|---|---|---|---|
| 1 | banditStockade | guard dog | physical | fast |
| 1 | banditStockade | bandit | physical | normal |
| 1 | banditStockade | bandit archer | physical | normal |
| 1 | banditStockade | bandit captain (boss) | physical | normal |
| 1 | goblinWarren | goblin runt | physical | fast |
| 1 | goblinWarren | goblin | physical | normal |
| 1 | goblinWarren | goblin slinger | physical | normal |
| 1 | goblinWarren | goblin chief (boss) | physical | normal |
| 1 | millRuins | mill rat | physical | fast |
| 1 | millRuins | squatter | physical | normal |
| 1 | millRuins | mill brute | physical | slow |
| 1 | millRuins | mill ogre (boss) | physical | slow |
| 1 | nightWatch1 | night prowler (boss) | physical | fast |
| 1 | oldGraveyard | restless bones | physical | normal |
| 1 | oldGraveyard | grave robber | physical | normal |
| 1 | oldGraveyard | ghoul | physical | normal |
| 1 | oldGraveyard | grave lord (boss) | magic (caster) | normal |
| 1 | ratCellar | giant rat | physical | fast |
| 1 | ratCellar | cellar spider | physical | normal |
| 1 | ratCellar | rat swarm | physical | slow |
| 1 | ratCellar | rat king (boss) | physical | normal |
| 1 | smugglersCove | cutpurse | physical | fast |
| 1 | smugglersCove | smuggler | physical | normal |
| 1 | smugglersCove | cove enforcer | physical | normal |
| 1 | smugglersCove | smuggler queen (boss) | physical | normal |
| 1 | spiderBurrow | webling | physical | fast |
| 1 | spiderBurrow | burrow spider | physical | normal |
| 1 | spiderBurrow | brood guard | physical | normal |
| 1 | spiderBurrow | brood mother (boss) | physical | slow |
| 2 | barrowMounds | barrow rat | physical | fast |
| 2 | barrowMounds | barrow wight | magic (caster) | normal |
| 2 | barrowMounds | mould knight | physical | slow |
| 2 | barrowMounds | barrow king (boss) | physical | normal |
| 2 | boarThicket | thorn piglet | magic (element grass) | normal |
| 2 | boarThicket | wild boar | magic (element grass) | slow |
| 2 | boarThicket | briar tusker | magic (element grass) | slow |
| 2 | boarThicket | great thicket boar (boss) | magic (element grass) | slow |
| 2 | nightWatch2 | road stalker (boss) | physical | fast |
| 2 | ogreQuarry | ogre brute | physical | slow |
| 2 | ogreQuarry | rock golem | physical | slow |
| 2 | ogreQuarry | quarry ogre | physical | slow |
| 2 | ogreQuarry | ogre chieftain (boss) | physical | slow |
| 2 | sunkenFord | ford leech | magic (element water) | slow |
| 2 | sunkenFord | river sprite | magic (element water) | normal |
| 2 | sunkenFord | drowned soldier | magic (element water) | normal |
| 2 | sunkenFord | ford hag (boss) | magic (element water) | normal |
| 2 | trollBridge | bog hound | physical | fast |
| 2 | trollBridge | bandit | physical | normal |
| 2 | trollBridge | river troll | physical | slow |
| 2 | trollBridge | bridge troll (boss) | physical | slow |
| 2 | watchtower | tower crow | physical | fast |
| 2 | watchtower | deserter | physical | normal |
| 2 | watchtower | tower sergeant | physical | normal |
| 2 | watchtower | turncoat knight (boss) | physical | normal |
| 2 | wolfDen | wolf pup | physical | fast |
| 2 | wolfDen | grey wolf | physical | fast |
| 2 | wolfDen | dire wolf | physical | fast |
| 2 | wolfDen | alpha wolf (boss) | physical | fast |
| 3 | cinderHollow | fire imp | magic (element fire) | fast |
| 3 | cinderHollow | magma slug | magic (element fire) | slow |
| 3 | cinderHollow | ember hound | magic (element fire) | fast |
| 3 | cinderHollow | ash wyrm (boss) | magic (element fire) | normal |
| 3 | drownedCrypt | crypt eel | physical | fast |
| 3 | drownedCrypt | drowned dead | physical | slow |
| 3 | drownedCrypt | bone knight | physical | slow |
| 3 | drownedCrypt | lich of the deep (boss) | magic (caster) | normal |
| 3 | dwarfhold | tunnel beetle | physical | normal |
| 3 | dwarfhold | stone warden | magic (element stone) | slow |
| 3 | dwarfhold | rune golem | magic (element stone) | slow |
| 3 | dwarfhold | forge guardian (boss) | magic (element stone) | slow |
| 3 | fungalGrotto | sporeling | magic (element grass) | fast |
| 3 | fungalGrotto | cap crawler | magic (element grass) | normal |
| 3 | fungalGrotto | mycel troll | magic (element grass) | slow |
| 3 | fungalGrotto | spore queen (boss) | magic (element grass) | normal |
| 3 | hauntedMine | ghost bat | physical | fast |
| 3 | hauntedMine | skeleton miner | physical | normal |
| 3 | hauntedMine | mine ghost | magic (caster) | normal |
| 3 | hauntedMine | mine wraith (boss) | magic (caster) | normal |
| 3 | nightWatch3 | shaft haunt (boss) | magic (caster) | normal |
| 3 | stormRidge | spark moth | magic (element electric) | fast |
| 3 | stormRidge | storm hawk | magic (element electric) | fast |
| 3 | stormRidge | bolt elemental | magic (element electric) | normal |
| 3 | stormRidge | storm roc (boss) | magic (element electric) | fast |
| 3 | witchMarsh | marsh toad | magic (element grass) | normal |
| 3 | witchMarsh | bogling | magic (element grass) | normal |
| 3 | witchMarsh | hexed hunter | physical | normal |
| 3 | witchMarsh | marsh witch (boss) | magic (element grass) | normal |
| 4 | boneField | bone crawler | physical | normal |
| 4 | boneField | fallen legionary | physical | normal |
| 4 | boneField | death captain | physical | normal |
| 4 | boneField | bone general (boss) | physical | normal |
| 4 | clockworkVault | brass beetle | physical | normal |
| 4 | clockworkVault | clockwork guard | physical | normal |
| 4 | clockworkVault | vault automaton | physical | slow |
| 4 | clockworkVault | clockwork warden (boss) | physical | slow |
| 4 | frozenLake | ice seal | magic (element water) | slow |
| 4 | frozenLake | frost nymph | magic (element water) | normal |
| 4 | frozenLake | lake serpent | magic (element water) | normal |
| 4 | frozenLake | ice wyrm (boss) | magic (element water) | normal |
| 4 | giantsHall | giant hound | physical | fast |
| 4 | giantsHall | stone sentinel | physical | slow |
| 4 | giantsHall | hill giant | physical | slow |
| 4 | giantsHall | giant king (boss) | physical | slow |
| 4 | harpyCliffs | rock lizard | physical | fast |
| 4 | harpyCliffs | cliff eagle | physical | fast |
| 4 | harpyCliffs | harpy | physical | fast |
| 4 | harpyCliffs | harpy matriarch (boss) | physical | fast |
| 4 | nightWatch4 | camp raider (boss) | physical | normal |
| 4 | orcWarcamp | orc grunt | physical | normal |
| 4 | orcWarcamp | orc raider | physical | normal |
| 4 | orcWarcamp | orc shaman | magic (caster) | normal |
| 4 | orcWarcamp | orc warlord (boss) | physical | normal |
| 4 | thunderPlateau | storm ram | magic (element electric) | normal |
| 4 | thunderPlateau | thunderbird | magic (element electric) | fast |
| 4 | thunderPlateau | skyfall golem | magic (element electric) | slow |
| 4 | thunderPlateau | thunder titan (boss) | magic (element electric) | slow |
| 5 | abyssalDepths | deep angler | magic (element water) | normal |
| 5 | abyssalDepths | abyssal priest | magic (element water) | normal |
| 5 | abyssalDepths | kraken spawn | magic (element water) | slow |
| 5 | abyssalDepths | abyssal horror (boss) | magic (element water) | slow |
| 5 | ashenCitadel | flame cultist | magic (element fire) | normal |
| 5 | ashenCitadel | cinder golem | magic (element fire) | slow |
| 5 | ashenCitadel | ash knight | magic (element fire) | normal |
| 5 | ashenCitadel | ash lord (boss) | magic (element fire) | normal |
| 5 | dragonLair | dragon cultist | magic (element fire) | normal |
| 5 | dragonLair | drake | magic (element fire) | fast |
| 5 | dragonLair | fire elemental | magic (element fire) | normal |
| 5 | dragonLair | elder dragon (boss) | magic (element fire) | normal |
| 5 | nightWatch5 | ash stalker (boss) | magic (element fire) | fast |
| 5 | ossuary | crypt guard | physical | normal |
| 5 | ossuary | bone lord | physical | normal |
| 5 | ossuary | death knight | physical | slow |
| 5 | ossuary | ossuary king (boss) | physical | normal |
| 5 | stormIsle | storm eel | magic (element electric) | fast |
| 5 | stormIsle | tempest caller | magic (element electric) | normal |
| 5 | stormIsle | thunder drake | magic (element electric) | fast |
| 5 | stormIsle | stormcaller (boss) | magic (element electric) | normal |
| 5 | titanRuins | ruin crawler | physical | normal |
| 5 | titanRuins | titan shard | magic (element stone) | slow |
| 5 | titanRuins | colossus arm | magic (element stone) | slow |
| 5 | titanRuins | titan heart (boss) | magic (element stone) | slow |
| 5 | wyvernPeaks | frost wolf | physical | fast |
| 5 | wyvernPeaks | mountain troll | physical | slow |
| 5 | wyvernPeaks | wyvern | physical | fast |
| 5 | wyvernPeaks | wyvern queen (boss) | physical | fast |

Not in `enemies.ts` lists: patrols (goblins, bandits physical normal; herds physical fast), hostile locals (physical normal), Sanctum minions and guardians (magic, their element, normal).
