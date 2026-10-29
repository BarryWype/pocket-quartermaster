# Phase 1 implementation spec: threats, restrictions, opportunities, kits

The agreed plan for phase 1. The design catalogue (`README.md` and the CSVs in this folder) is the source for names and numbers; this file says how they map onto the code. Classes, stats and gear are about to be reworked: don't tune anything around today's class or gear values, and don't rebalance.

## Ground rules

- Rules are pure TypeScript in `src/game` (no React/Expo imports). Content and numbers go in `src/content`.
- Strict TypeScript, no `any`. Follow the existing style: small comments that explain how things work, `rules = xRules` default parameters, seeded rngs from `createRng`.
- Player-facing text needs English and French (see `src/i18n/en.ts`, `src/i18n/fr.ts`, `src/content/fr/*`; `contentTexts()` in `src/content/fr/contentTexts.ts` lists content names that need a French entry in `frNames`, and `src/i18n/i18n.test.ts` checks it).
- Done means: `npx jest`, `npx tsc --noEmit` and `npx expo lint` pass.

## Vocabulary and types (`src/game/types.ts`)

```ts
export type Approach = 'might' | 'finesse' | 'wits' | 'faith' | 'presence';
export type Keyword = 'light' | 'watchful' | 'calm' | 'antidote' | 'pierce' | 'cleave' | 'blessed' | 'guard';
export type ThreatId =
  | 'traps' | 'element' | 'beasts' | 'undead' | 'brute'
  | 'rubble' | 'poison' | 'locals' | 'swarm'
  | 'darkness' | 'locked' | 'desecrated' | 'casters' | 'ambush' | 'thieves' | 'armoured'
  | 'puzzle' | 'maze' | 'underwater';
export type ThreatCategory = 'environment' | 'obstacle' | 'holy' | 'enemy' | 'social';
export type ThreatLevel = 1 | 2 | 3;
export type RestrictionId = 'antiMagic' | 'sacredGround' | 'noHealing' | 'cursedLuck' | 'thickFog' | 'barren' | 'narrowPassages' | 'spoiledStores';
export type OpportunityId = 'healingSpring' | 'hiddenCache' | 'richVein' | 'bounty' | 'prisoners' | 'refugees' | 'forgottenShrine' | 'oldInscriptions' | 'trophyBeast';

/** What meets a threat: the best hero's approach score, the number of heroes with a keyword, or with Resist(element). */
export type ThreatAnswer = { kind: 'approach'; approach: Approach } | { kind: 'keyword'; keyword: Keyword } | { kind: 'resist' };

/** One effect of a missed threat. A half penalty halves every number (see "Half penalties"). */
export type ThreatPenalty =
  | { kind: 'exposed'; fights: number | 'all' }        // enemies strike first in the first N fights
  | { kind: 'weakened'; pct: number }                  // party damage × (1 − pct)
  | { kind: 'trapWounds'; pct: number }                // share of max HP per hero a trap catches
  | { kind: 'fightWounds'; pct: number; targets: 'all' | 'one' } // after (poison: all) / before (casters: one) each fight, ignores armour
  | { kind: 'delay'; pct: number }                     // expedition time × (1 + pct)
  | { kind: 'hunger'; supply: number }                 // extra supply points needed at launch
  | { kind: 'lostLoot'; pct: number }                  // gold and materials × (1 − pct)
  | { kind: 'extraFight' }                             // locals turn hostile
  | { kind: 'elementalDamage'; multiplier: number }    // damage of the threat's element taken by heroes without Resist
  | { kind: 'enemyDamage'; tag: 'beast'; pct: number }
  | { kind: 'enemyHp'; tag: 'undead'; pct: number }
  | { kind: 'weakenedAgainst'; pct: number }           // Armoured: party damage against every enemy × (1 − pct)
  | { kind: 'extraEnemies'; count: number }            // per fight of 3+ enemies, copies of its weakest mob
  | { kind: 'bruteDamage'; pct: number }               // the boss deals × (1 + pct)
  | { kind: 'healingHalved' };

export type ThreatDef = {
  id: ThreatId; name: string; emoji: string; category: ThreatCategory;
  firstTier: number;
  answer: ThreatAnswer;
  /** Locked: Might forces it (loses some loot). Locals: Might intimidates them (no help, no fight). */
  alternative?: Approach;
  /** Penalties at levels 1, 2, 3. */
  penalties: [ThreatPenalty[], ThreatPenalty[], ThreatPenalty[]];
  description: string; // one short line: what it is and what happens if missed
};

export type ActiveThreat = { id: ThreatId; level: ThreatLevel; element?: Element; /** Daily surge name, when it raised the level. */ surge?: 'restlessDead' | 'boobyTrapped' | 'packHunt' };
/** What a dungeon shows today, kept by an expedition for its whole run. */
export type Briefing = { threats: ActiveThreat[]; restriction: RestrictionId | null; opportunity: OpportunityId | null };
```

Opportunities: `OpportunityDef = { id, name, emoji, description, answers: OpportunityAnswer[] /* empty = free; any one answers */, cost?: { supply: number }, reward: OpportunityReward }` with `OpportunityAnswer = { approach: Approach; score: number } | { keyword: Keyword }` and `OpportunityReward` a union, one kind per opportunity (numbers below).

Restrictions: `RestrictionDef = { id, name, emoji, description }`.

Kits are consumables (`ConsumableDef`) with a new field:

```ts
/** What a kit gives its carrier. `approach: 'threat'` adds to the answer approach of the listed threats only (Explorer's kit). */
export type KitEffect = { threats: ThreatId[]; approach?: Approach | 'threat'; keywords?: Keyword[]; /** Healed once, like a potion. */ heal?: number };
```

Ward salves are consumables with `protectsAgainst: element` (as the old fire elixir), which gives Resist(element).

`HeroClassDef` gets `approaches: Partial<Record<Approach, number>>` (missing = default) and `keywords: Keyword[]`.

New `Ability` kinds (for traits): `{ kind: 'approach'; approach: Approach; add: number }` and `{ kind: 'keyword'; keyword: Keyword }`.

## Content (`src/content/threats.ts`, plus edits)

### Approaches and keywords (temporary, until the class rework)

`approachRules = { base: 1, min: 0, max: 5, kitBonus: 2 }`.

| Class | Approaches (others 1) | Class keywords |
|---|---|---|
| warrior | might 3 | — |
| barbarian | might 3 | cleave |
| paladin | faith 3 | blessed, guard |
| ranger | wits 3 | watchful |
| thief | finesse 4 | — |
| fireMage | — | light, cleave |
| frostMage | wits 3 | — |
| sorcerer | wits 3 | — |
| cleric | faith 3 | antidote, blessed |
| druid | — | calm, antidote |
| troubadour | presence 3 | — |

Traits: `clumsy` → `{ approach finesse −1 }`, `loud` → `{ approach presence −1 }`, `lightSleeper` → `{ keyword watchful }` (these replace their old effects; update their descriptions).

Weapon keywords (`weaponKeywords: Partial<Record<WeaponType, Keyword[]>>`): dagger, bow → pierce; axe, staff → cleave; mace → blessed.

Mage classes for Anti-magic (`magicClasses`): fireMage, frostMage, sorcerer. Concealed weapons for Sacred ground (`concealedWeapons`): dagger, wand, instrument (lute), staff; an unarmed hero counts as concealed.

### Threats (from `threats.csv`)

| id | category | first tier | answer | alt | L1 | L2 | L3 |
|---|---|---|---|---|---|---|---|
| traps | environment | 1 | finesse | | trapWounds 8% | 12% | 18% |
| element | environment | 1 | resist | | elementalDamage ×1.25 | ×1.5 | ×1.75 |
| beasts | enemy | 1 | calm | | enemyDamage beast +20% | +35% | +50% |
| undead | enemy | 1 | blessed | | enemyHp undead +20% | +40% | +60% |
| brute | enemy | 1 | guard | | bruteDamage +25% | +50% | +75% |
| rubble | obstacle | 2 | might | | delay 10%, hunger 1 | delay 20%, hunger 1 | delay 30%, hunger 2 |
| poison | environment | 2 | antidote | | fightWounds 5% all | 10% | 15% |
| locals | social | 2 | presence | might | extraFight | extraFight | extraFight |
| swarm | enemy | 2 | cleave | | extraEnemies 1 | 2 | 3 |
| darkness | environment | 3 | light | | exposed 1 | exposed 2, weakened 10% | exposed all, weakened 20% |
| locked | obstacle | 3 | finesse | might | lostLoot 15% | 25% | 40% |
| desecrated | holy | 3 | faith | | weakened 10% | 20% | weakened 30%, healingHalved |
| casters | enemy | 3 | faith | | fightWounds 6% one | 10% | 15% |
| ambush | enemy | 3 | watchful | | exposed 1 | exposed 2 | exposed all |
| thieves | enemy | 3 | finesse | | lostLoot 10% | 20% | 30% |
| armoured | enemy | 3 | pierce | | weakenedAgainst 20% | 35% | 50% |
| puzzle | obstacle | 4 | wits | | delay 15%, hunger 1 | delay 30%, hunger 2 | delay 45%, hunger 2 |
| maze | environment | 4 | wits | | delay 20%, hunger 1 | delay 35%, hunger 2 | delay 50%, hunger 3 |
| underwater | environment | 4 | wits | | weakened 15% | 25% | 40% |

`threatRules` also holds: `forcedLockLoss: 0.1` (Locked forced with Might), `levels` thresholds from `levels.csv` (`approach: [2, 3, 4]`, `keyword: [1, 2, 3]`), `halfShare: 0.5`.

### Restrictions (`restrictions.csv`)

antiMagic, sacredGround, noHealing, cursedLuck, thickFog, barren, narrowPassages, spoiledStores. Numbers in `restrictionRules`: `antiMagic: 0.5`, `sacredGround: 0.6` (non-concealed weapon damage multiplier), `noHealing: 0.5`, `narrowPartySize: 3`.

### Opportunities (`opportunities.csv`, minus Friendly merchant and Sealed vault)

| id | answers | cost | reward (config) |
|---|---|---|---|
| healingSpring | free | | heal 30% max HP, every conscious hero |
| hiddenCache | finesse 2 | | 25% of the dungeon's top gold (Thief `cacheBonus` ×2 still applies) |
| richVein | might 2 | | `3 + tier` of the tier's ore: wood, stone, copper, iron, coal for tiers 1–5 |
| bounty | presence 2 | | gold × 1.3 |
| prisoners | finesse 3 or might 3 | | 20% of top gold, 10% chance a prisoner joins the roster (random class, positive trait) if there's room, else nothing more |
| refugees | free, opt-in | 3 supply | one roll of the pilgrim traveller's reward table (`travellerRules.pilgrimRewards`: blessing = full heal at home, gold, key fragment) |
| forgottenShrine | faith 3 | | party damage × 1.1 for the rest of the run |
| oldInscriptions | wits 3 | | XP × 1.25, and 20% chance to teach one unknown Provisions recipe (like chests) |
| trophyBeast | calm, or might 3 | | hide 2–3, bone 2, 15% chance of 1 shard of a random element |

Opportunities resolve at the run's midpoint: right after the non-boss encounter at index `floor((encounterCount − 1) / 2)` (if the party is still standing).

### Composition (`threatRules.compose`)

- Threat count by tier: tier 1 → 1; tiers 2–5 → 2. Opportunity: tiers 2–5 only. Restriction: tiers 4–5, 35% of days, never on overnight quests. Bosses follow their tier.
- Eligible threats: the dungeon's weight entries whose `firstTier ≤ dungeon.tier`.
- Max level: `min(3, 1 + dungeon.tier − firstTier)`. The level is drawn among `1…max` with weights by rank from the top: highest 50, next 35, next 15.
- Draws are weighted, without replacement. Reject a draw that would give a second obstacle-category threat, or a threat that shares a kit with one already drawn (`kit.threats` from the kits). Stop when the count is reached or nothing is eligible.
- Opportunity: equal weights; `trophyBeast` only where the dungeon has a beast-tagged mob or boss.
- Restriction: uniform; reject one that leaves any drawn threat with no possible source of its answer (class, trait, weapon or kit, with the restriction's rules applied; Narrow passages also rejects a keyword threat needing more heroes than 3).
- Seeds: `threats|${day}|${dungeon.id}`. Same day, same briefing for everyone.
- Daily surge (replaces Restless dead, Booby-trapped, Pack hunt): per tier and day, 30% chance (seed `surge|${day}|${tier}`). Pick, uniformly, one of that day's tier dungeons (boss, short, long) with an `undead`, `traps` or `beasts` threat; raise that threat by +1 level (cap 3; it may exceed the tier's max) and set `surge` (`restlessDead`, `boobyTrapped`, `packHunt`).
- Element threat: the element comes from the dungeon's weight entry (`element`).
- Flooded, Rich veins and Bounty modifiers are replaced by the weights below (water Element) and by opportunities. The old modifier system goes.

### Threat weights per dungeon (`dungeonThreats: Record<dungeonId, { weights: Partial<Record<ThreatId, number>>; element?: Element }>`)

| Dungeon | Weights | Element |
|---|---|---|
| ratCellar | beasts 3, poison 2, traps 2, darkness 2, swarm 2, ambush 1, element 1 | water |
| spiderBurrow | poison 3, traps 3, beasts 2, darkness 2, ambush 2, swarm 1 | |
| oldGraveyard | undead 4, desecrated 3, darkness 2, traps 1, locals 1, casters 1 | |
| goblinWarren | rubble 3, ambush 3, traps 2, swarm 2, thieves 2, darkness 1 | |
| millRuins | rubble 4, beasts 2, locals 2, brute 2, thieves 1, traps 1 | |
| smugglersCove | thieves 4, locals 3, locked 2, ambush 2, traps 1, darkness 1, element 1 | water |
| banditStockade | ambush 3, brute 3, thieves 2, traps 2, beasts 2, armoured 1, rubble 1 | |
| wolfDen | beasts 4, ambush 3, darkness 1, rubble 1, traps 1 | |
| barrowMounds | undead 4, desecrated 3, darkness 2, poison 1, armoured 1, maze 1 | |
| boarThicket | beasts 3, element 3, locals 2, brute 2, poison 1 | grass |
| trollBridge | locals 4, thieves 3, brute 2, beasts 1, rubble 1, element 1 | water |
| sunkenFord | element 4, underwater 3, undead 2, poison 1, rubble 1 | water |
| watchtower | locked 3, ambush 3, armoured 2, rubble 2, traps 2, darkness 1, brute 1 | |
| ogreQuarry | rubble 4, brute 3, armoured 3, traps 1, swarm 1 | |
| hauntedMine | undead 4, darkness 4, rubble 2, maze 2, locals 1, desecrated 1 | |
| fungalGrotto | poison 4, element 3, darkness 2, swarm 2, beasts 1, maze 1 | grass |
| stormRidge | element 4, beasts 3, ambush 2, rubble 1 | electric |
| cinderHollow | element 4, beasts 2, swarm 2, darkness 1, poison 1 | fire |
| dwarfhold | puzzle 4, locked 3, armoured 3, element 2, traps 2, darkness 2, locals 1 | stone |
| witchMarsh | casters 3, element 3, locals 3, poison 3, maze 2, beasts 1 | grass |
| drownedCrypt | undead 4, underwater 3, casters 3, traps 2, armoured 2, element 2, locked 1, brute 1 | water |
| harpyCliffs | beasts 4, ambush 3, swarm 2, rubble 2 | |
| thunderPlateau | element 4, beasts 3, armoured 2, brute 2 | electric |
| boneField | undead 4, desecrated 3, swarm 2, armoured 2, casters 1, brute 1 | |
| orcWarcamp | ambush 3, swarm 3, brute 3, thieves 2, traps 2, casters 2, rubble 2, locked 1 | |
| clockworkVault | traps 4, puzzle 4, armoured 4, locked 3, maze 2, darkness 1 | |
| frozenLake | element 4, underwater 3, beasts 3, ambush 1 | water |
| giantsHall | brute 4, rubble 3, armoured 2, beasts 1, traps 1, locked 1 | |
| wyvernPeaks | beasts 4, brute 2, rubble 2, ambush 2, swarm 1 | |
| ossuary | undead 4, desecrated 4, darkness 2, armoured 2, locked 1, casters 1 | |
| stormIsle | element 4, casters 3, beasts 2, underwater 2 | electric |
| ashenCitadel | element 4, casters 3, armoured 2, brute 2, undead 1, locked 1 | fire |
| abyssalDepths | underwater 4, element 4, darkness 3, beasts 2, casters 2, maze 1 | water |
| titanRuins | rubble 4, armoured 3, element 3, puzzle 2, brute 2, maze 2, locals 1 | stone |
| dragonLair | element 4, brute 3, beasts 2, casters 2, armoured 2, locked 1 | fire |
| nightWatch1 | ambush 3, darkness 3, beasts 2, thieves 1 | |
| nightWatch2 | ambush 3, beasts 3, darkness 2, thieves 1, traps 1 | |
| nightWatch3 | undead 3, ambush 3, darkness 3, beasts 1 | |
| nightWatch4 | ambush 3, beasts 3, thieves 2, darkness 2 | |
| nightWatch5 | ambush 3, beasts 2, darkness 2, element 2, thieves 1 | fire |

Locals only make sense where the dungeon's pool has a `locals` encounter; a dungeon without one never draws `locals` (filter it out at draw time).

Patrol threats (`patrolThreats`): goblins → ambush L1, herd → beasts L1, bandits → thieves L1. Travellers unchanged. Patrol kinds lose their `trap`.

### Kits and salves (`kits.csv`), in `items.ts` as consumables, recipes in `recipes.ts` (Provisions, `alchemy` tab)

| item id | kit effect | available from tier | recipe (main material first) |
|---|---|---|---|
| roguesRoll | threats traps, locked, thieves; approach finesse | 1 | bone 2, hide 1 |
| huntersPack | threats beasts; keywords calm | 1 | meat 2, herb 1, hide 1 |
| emberWardSalve / tideWardSalve / stormWardSalve / stoneWardSalve / thornWardSalve | `protectsAgainst` fire / water / electric / stone / grass; threats element | 1 | that element's shard 1, herb 2 |
| explorersKit | threats rubble, underwater; approach 'threat' | 2 | stone 1, wood 2, hide 2 |
| healersSatchel | threats poison; keywords antidote; heal 0.1 | 2 | herb 2, berries 1, mushroom 1 |
| giftBasket | threats locals; approach presence | 2 | berries 2, meat 1, bone 1 |
| lantern | threats darkness, ambush; keywords light, watchful | 3 | copper 1, wood 2, meat 1 |
| holyRelics | threats desecrated, casters; approach faith | 3 | stone 2, herb 2 |
| scholarsSatchel | threats puzzle, maze; approach wits | 4 | copper 2, wood 1, berries 2 |

Names, emoji, descriptions from `kits.csv` (Contents column makes a good description). `RecipeDef` gets `availableFromTier?: number`: such a recipe counts as known once the player's highest unlocked tier reaches it (`isKnown` in `src/game/crafting/crafting.ts`; avoid import cycles by computing the tier from `save.clearedDungeons` and the dungeon list, the way `highestUnlockedTier` does). These kit recipes are `unlockedByDefault: false`.

Removed: provisions `lockpicks`, `ropeAndPitons`, `torches`, `bait`, `gifts`, `holyWater` (and the party `KitEffect` on `ProvisionDef`), consumables `wardBone` and `fireResistanceElixir`, their recipes, `provisionRules.kits`, the `wardTrap` charm.

### Salvage

Everything in a consumable slot is gone after the run. An item that **never triggered** is salvaged instead:

- healing potion / any `heal` + `when: 'lowHp'`: never drunk;
- a kit: removing it wouldn't change any threat's or the opportunity's result (state, forced, intimidated, answered), and (Healer's satchel) its heal never happened;
- a ward salve: it changed nothing in the Element threat and the carrier never took damage of its element;
- crit charm: the carrier never attacked; gold charm: it wasn't the counted one, or the run paid no gold, or Barren applied.

Salvage = for each recipe input `floor(amount / 2)`, the first (main) input at least 1. No recipe → `threatRules.salvageGold` (3) gold. The report lists what was salvaged.

## Rules (`src/game/threats/`)

### Hero answers (`answers.ts`)

`heroAnswers(member, restriction)` → `{ heroId, approaches: Record<Approach, number>, keywords: { keyword, source: 'class' | 'trait' | 'weapon' | 'kit' }[], resists: Element[], kitItemId: string | null }`.

- Approaches: class value or `approachRules.base`, plus trait `approach` abilities, clamped 0–5. The kit's +2 is added during scoring (only for the threats it covers when `approach: 'threat'`), still capped at 5.
- Keywords: class keywords, trait keywords, weapon keywords, kit keywords; each keyword counts once per hero.
- Resists: class resists and a ward salve.
- Thick fog: watchful only counts from a kit. Anti-magic: light and cleave from a mage class or a staff don't count.

`PartyMember` (in `simulate.ts`) gets what this needs: `approaches`, `keywords` (with sources), `weaponType`, and `magic` (the magic part of `damage`), so the same function works for the odds and the real run.

### Scoring (`score.ts`)

- Approach threat: `have` = best hero score (with kits), `needed` = `levels.approach[level − 1]`. Keyword threat: `have` = heroes with the keyword, `needed` = `levels.keyword[level − 1]`. Element: heroes with Resist(element).
- Shortfall 0 → `met`, 1 → `half`, 2+ → `full`.
- Locked: if Finesse doesn't meet it but Might does → `met` with `forced: true` (lostLoot `forcedLockLoss`).
- Locals: Presence met → `met` (help). Else Might met → `met` with `intimidated: true` (no help, no fight). Else the Presence state.
- Result per threat: `{ threat, state, have, needed, forced?, intimidated?, coveredBy: { heroId, source }[] }`, plus which heroes' kits changed it (score again without each kit).
- `scoreOpportunity(opportunity, party, optIn)` → answered or not (+ which kit helped).

### Half penalties

Percentages and multiplier bonuses are halved (×1.5 → ×1.25). Counts are halved; a fractional count rolls a chance for the last one (exposed 1 → 50% chance of one exposed fight; extra fight → 50%; extra enemies 1 → 50% per swarm fight). `'all'` halved → every other fight. Hunger supply halves rounding down. `healingHalved` at half → healing × 0.75.

### Composition (`compose.ts`)

`composeBriefing(dungeon, day, rules)` and `restrictionKeepsAnswers(threats, restriction)` as above. Surges are applied in `dailyRotation` (see Integration).

## Integration

- **Encounters.** Pools keep their entries. Fights are unchanged. In a run: a `trap` encounter is live only if the briefing has `traps` (it wounds each hero it catches — its `targets` one/all — by the level's pct × the state, through the element rules for elemental traps; Ranger's `trapReduce` still applies); a `locals` encounter is live only if the briefing has `locals` (help / intimidated / extra fight with the NPC's hostile form, half → 50% chance; the Thief's pickpocket perk still works when the locals don't help). Every other non-fight encounter (obstacles, spring, cache, ambush events) is a quiet step: cleared, nothing happens (result kind `quiet`). If `traps` or `locals` is drawn and the run rolled none, the last encounter before the boss becomes one (the pool's first trap / locals entry). Remove trap `damagePct` and `triggerChance`, obstacle `hpCostPct` and `detourChance` from the types and content.
- **Removed abilities**: `trapDisarm`, `obstacleSolve` (and the fire weapon's barricade solve), `calmBeasts`, `localsReaction` charm and provoke (pickpocket becomes `{ kind: 'pickpocket' }`), `ambushAlert`, `trapTrigger`, `hostileLocals`, every `damageVsTag` on `undead`. `src/game/dungeons/counters.ts` goes (the "Good here" badge is replaced by threat coverage). Keep the rest (cacheBonus, trapReduce, Ranger's beast damage, partyHeal, protect, rage, partyDamageBuff, critBonus, elementalAdvantage, traits).
- **Boss enrage and sweep stay.** Brute adds on top.
- **Run effects** (in `simulateRun`, from the briefing scored against the party): exposed fights (the first N fight or boss encounters; enemies strike first in round 1), weakened (multiplies hero damage; several multiply), weakenedAgainst, enemyDamage on beast-tagged enemies, enemyHp on undead-tagged enemies, extraEnemies in fights of 3+ enemies, bruteDamage on the boss, fightWounds (poison: every conscious hero after each fight; casters: one random conscious hero before each fight; % of max HP, ignores defense), elementalDamage (the Element threat sets every enemy's element for the run, like the old Flooded, and multiplies that element's damage to heroes without Resist), healing multiplier (healingHalved, No healing).
- **Restrictions in the run**: antiMagic (magic part of damage × 0.5, partyHeal × 0.5, elementalAdvantage bonus halved); sacredGround (non-concealed weapon heroes' damage × 0.6); noHealing (all healing during the run × 0.5); cursedLuck (no crits); barren (at resolve, trait, charm and meal gold multipliers above 1 are ignored); narrowPassages (`startExpedition` rejects more than 3 heroes); spoiledStores (the meal has no effect); thickFog and antiMagic answers in `heroAnswers`.
- **Launch** (`expeditions.ts`): `Loadout = { mealId?, optIn? }` (no `kitId`). The expedition stores `briefing` (from the rotation; for overnight quests and when no rotation is passed, `composeBriefing(dungeon, rotationDay(now))`; the tutorial's guaranteed run gets an empty briefing) and `optIn`. `launchPlan(save, dungeon, heroIds, loadout, briefing)` adds the delay to the time, and hunger supply plus the opted-in cost to the supply need, from the threat scores of the heroes as equipped. The report keeps the briefing's scores.
- **Resolve**: `expedition.briefing ?? empty` (expeditions launched before the update resolve with no threats). Lost loot cuts gold and materials. Opportunity rewards apply. Consumables: every equipped item is gone; un-triggered ones are salvaged (materials or gold added, listed in the report). `ExpeditionReport` gets `briefing`, `threats: { id, level, element?, state, forced?, intimidated? }[]`, `opportunity: { id, answered, … what it gave }`, `salvaged: { heroId, itemId, materials, gold }[]`; it loses `kitId` and `kitUsed`.
- **Odds**: `estimateOdds(save, heroIds, dungeon, runs, { now, loadout, fullHp, briefing })` passes the briefing to `simulateRun`.
- **Log** (`log.ts`, templates in `src/content/logTemplates.ts` and `src/content/fr/logTemplates.ts`): one line per threat at the start (met / half / missed, with who or what answered: "The lantern kept the ambush at bay.", "Nobody could read the glyphs: the party lost time."), lines for traps, locals, exposed fights, poison and casters wounds, the opportunity, and salvage.
- **Rotation** (`src/game/dungeons/rotation.ts`): `TierRotation.modifier` becomes `surge: { dungeonId, threatId } | null`; `briefingFor(rotation, dungeonId, day)` returns the composed briefing with the surge applied; `RotationOverrides` loses `modifiers` and gains `briefings: Record<dungeonId, Briefing>` (debug force). `src/content/modifiers.ts`, `DungeonModifier`, `withModifier`, `allowedModifiers`, `modifierFor` and `DungeonDef.modifierId` / `enemyElement` / `rewardMultipliers` go. `tags.ts` stays only for the rotation's "no two dungeons with the same main tag" rule.
- **Patrols**: `patrolDungeon` has no trap; the patrol fight and the escort odds pass the patrol's briefing (`{ threats: [patrol threat], restriction: null, opportunity: null }`).
- **Simulator** (`src/game/sim/`, `scripts/sim/`): keeps compiling and running with threats on. The bot equips no kits, never opts in, doesn't craft kits or salves, and uses the briefing where it used the modifier. The report's modifier column becomes a short threats summary. Results aren't used yet; don't touch `targets.ts`.
- **Balance tests**: skip the expedition progression bands and the fire elixir test in `src/game/balance/balance.test.ts` with `describe.skip` / `it.skip` and the comment `// Skipped until the class and gear rework rebalances dungeons around threats.` Keep the other tests passing.
- **Save migration** (`src/game/migrations.ts`, store version 14 → 15 in `src/store/gameStore.ts`): stock and equipped consumables lockpicks → roguesRoll, ropeAndPitons → explorersKit, torches → lantern, bait → huntersPack, gifts → giftBasket, holyWater → holyRelics, fireResistanceElixir → emberWardSalve, wardBone → roguesRoll; old recipe ids dropped from `knownRecipes`; each running expedition's `kitId` is refunded to stock as its new kit, then `kitId` and `modifierId` dropped (no briefing → no threats); old reports' `kitId`, `kitUsed` dropped and `consumablesUsed` ids remapped. Debug store: `forcedModifiers` → `forcedBriefings` (bump its version, start empty).

## Tests (pure logic, `src/game/threats/*.test.ts` and existing suites)

Scoring at each level for approach and keyword threats, with and without a kit; half and full penalties; kit +2 capped at 5; one item per hero; a kit counts once; Locked forced by Might loses loot; Locals answered by Might gives no help and no fight; composition counts per tier, first-tier gating and max levels, at most one obstacle, no two threats sharing a kit, a restriction never removes the last answer, deterministic per day, a running expedition keeps its briefing; surges add +1; each restriction's effect; each opportunity (answered gives the reward, missed costs nothing, an opted-in cost is paid); every consumable gone after the run, un-triggered ones salvaged (half recipe, ≥1 main) or gold without a recipe; patrol threats and escort odds; save migration.
