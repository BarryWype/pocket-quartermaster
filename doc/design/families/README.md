# Families

Designed 2026-11-06. One system for building a team: **family tags** counted across the party unlock set bonuses, like item sets in ARPGs but across the whole team. It replaces approaches, threat keywords and kits as the way threats are answered, and gives builds their names ("a Faith Bulwark", "a Pack of Wild beasts").

## The rules
- **15 families** (`families.csv`): 7 that answer a threat (Faith, Wild, Watch, Cunning, Venom, Warding, Breaker) and 8 playstyles (Bulwark, Bloodrage, Shadow, Volley, Spellweave, Pack, Rally, Plunder).
- **Threats count tags, not levels (revised 2026-11-08 after play-testing):** a threat at level N needs **N tags** of its family in the party. Beasts 2 means "bring 2 Wild". The briefing shows the requirement as sockets that light up with the family's icon. Before this, a threat at level N needed the family at level N (2N tags): too hard to reach with a small early roster, and too hard to read.
- **Three levels**, by the number of the family's tags in the party: **2, 4 and 6**. Levels are for **bonuses only**: each family's effects at ●○○, ●●○, ●●●. They no longer gate threats. The interface counts tags and shows levels as pips.
- **No family effect may depend on missing its own threat (2026-11-08).** A family at level 1 has 2 tags and answers its threat up to level 2; at level 2 it has 4 and always answers it. An effect that only acts on a missed threat (halving its wounds, turning its ambush) would never fire once the family is built. Revised then: Cunning 1 springs a trap on a random enemy (10% of its HP) as each fight starts, Venom 1 gives every hit a 10% chance to poison, Watch 2 skips the run's weakest fight.
- **Tags:**
  - **1 per class** (`class-tags.csv`).
  - **1 per item type** (`item-tags.csv`); a **two-handed weapon counts 2** (it takes the off-hand's place).
  - **One-handed weapons carry a second tag** of another family (`item-tags.csv`, column `second`; added 2026-11-08). Every weapon slot is then worth 2 tags: two-handed = 2 of one family (focused), one-handed = 1 + 1 (flexible). The weapon becomes the main build choice. Checked against the cap: no class goes above 3 of its own family.
  - **Trinkets and work tools: none.**
  - **Rare extras:** some relics carry a second tag; later, a few rare or named trinkets and progression-tree nodes. Keep them scarce: about 2–3 extra tags for a well-equipped endgame party.
- **Reach:** a party of 3 has 3 class tags and up to 12 item tags (weapons count 2): 15. Fully focused, two families at level 3; or a main, a secondary and a splash (6 + 4 + 2).
- **No free families (a guideline, not a rule):** a class's natural gear shouldn't hand it a high family level without any choice. Item identity comes first: a tag that fits the item's theme wins over the guideline when they clash. The first tag table was solved strictly (at most one favoured weapon or armour type in a class's own family) and some tags were pulled away from their obvious theme for it. Restored on 2026-11-06: sword and plate → Bulwark (mail → Warding), robes → Spellweave, spear → Wild, dagger → Shadow. Revised on 2026-11-07 after the step 1 report: no family may sit on all three gear slots, so sword → Rally, tome → Watch, mail → Faith. Bulwark has no weapon on purpose: it lives on plate and shield, and a tank's weapon is how it mixes in a second family. **Data check (a test, not a player rule):** no class, in any gear it can use, gets more than 3 tags of its own family, so one hero alone reaches level 1 at most and level 2 needs a second hero. Known gap for the numbers pass: Engineer (1), Thief and Cook (1 in favoured gear) and Scout (2) can't anchor their family alone; fix with class affinities rather than tags. The simulator reports how often parties in their favoured gear, picked without regard to families, reach level 2 or 3; if that's too easy, prefer adjusting a few tags or the thresholds over bending item identity.
- **Every family has at least one item type**, so any family can be reached through items with any heroes (e.g. Venom through flasks or daggers before the Alchemist appears). Bulwark has no weapon.

## Answering threats early (2026-11-08)
Threats must never be gated behind finding the right hero. Gear is the flexible answer:
- **Every threat family has a tier-1 item type** that's sold or forgeable from day 1, cheap, and usable (not unfit) by most classes. A data test checks every tier-1 and tier-2 briefing is answerable with the starting heroes and tier-1 shop gear.
- **The tier-1 recruit pool** gains a Wild class and a Watch class (the tier-1 dungeons are mostly Beasts, Darkness and Poison).
- **Starting heroes** carry different families.
- **Restrictions that disable tags are removed** (they undermine the one rule players learn). **Surges** raise a threat by 1 at most.
- **Kits stay gone.** If gaps remain, the fallback is a family charm in the trinket slot (+1 tag, costs the trinket's stats); not built now.
- **Built (step 9):** starting blueprints sword, mail (Faith), spear (Wild, Watch), lute (Cunning), flasks (Venom), focus (Warding) and knuckles (Breaker); Druid and Scholar join the tier-1 pool; Thick fog is gone and Anti-magic no longer drops tags. Venom and Cunning sit only on weapons, so Poison plus a surged Traps 3 needed 4 weapon tags from 3 heroes: Traps left the Barrow mounds' and Sunken ford's tables.

## Helmets (2026-11-08)
A fourth gear slot, ordinary gear like armour: each **helmet type carries one family tag**, with stats, affixes and class affinities (favoured, usable, unfit; heavy helms unfit for casters). It is **not** a threat slot: armour and helmets together simply make sure every threat family can be worn outside the weapon and off-hand slots.

| Helmet | Weight | Family | Answers |
|---|---|---|---|
| Great helm | heavy | Breaker | Armoured |
| Sentry's sallet | medium | Watch | Darkness |
| Hood | light | Cunning | Traps |
| Plague mask | light | Venom | Poison |
| Rune circlet | cloth | Warding | Element |

With mail (Faith) and leather (Wild), armour and helmets cover all seven threat families, so three heroes can wear six threat tags without touching weapons or off-hands: enough for any tier 1–2 briefing. **Weapons are many and their blueprints random; armour and helmets are few, so all four armour types and all five helmet types are starting blueprints at tier 1, cheap.** A new player can forge an answer to any threat from day 1.

- **Cap:** some classes reach 4 tags of their own family with a matching helmet (Scholar or Scout with a sallet, Frost mage or Curse-breaker with a circlet, Thief with a hood, Alchemist with a mask). The cap test allows 4 until the thresholds are raised in the balance pass.
- **Class portraits** use six helmet icons; those stay portraits only, so a hero and their helmet never look alike.
- **Affixes:** a helmet pool still to design (draft direction: the "mind" slot: specials, crits, initiative, status resistance, knowledge; one helmet affix per monster part).
- **Balance later:** a fourth piece adds stats and up to 3 tags per party; thresholds can go to 3/6/9.

## A safe start (2026-11-08)
New players must not get stuck failing threats they can't answer yet:
- **The first two expeditions have no threats** (both easy).
- **The board always shows at least one READY place** at tiers 1 and 2; if the roll would leave none, one notice is rerolled.
- **A lost expedition still pays** some XP and monster parts.

## Expedition screens (2026-11-08)
Mockup: `doc/design/expeditions/` (the design canvas boards). The list shows no heroes and no odds: each place is a pinned notice with its needs as gem sockets and a readiness stamp (Ready, Needs gear, No <family>). Picking a place opens the party dialog: needs and party families at the top, three hero plates with their gear slots (each with its family gem), odds only once a hero is in, refreshed on every hero or gear change. Gear changes made there are permanent. Pickers sort what covers a need first (▲) and show the odds after each choice. A Suggest button fills heroes and gear. The same dialog serves patrols, place fights and Sanctums.

## Threats after this change
Seven, one per threat family: **Holy** (undead, desecrated ground), **Beasts**, **Darkness** (darkness, ambush), **Traps** (traps, obstacles), **Poison**, **Element** (5 elements), **Armoured**. Removed: Brute, Locals, Swarm, Casters, Thieves, Maze, Underwater. The three obstacles (rubble, locked, puzzle) merge into Traps. Penalties for an unanswered threat stay as they are per threat (merged threats keep one penalty; briefings may keep flavour variants).

## Opportunities
Answered by families instead of approaches (e.g. hidden cache and sealed vault: Cunning or Plunder; rich vein: Breaker; bounty, prisoners, refugees: Rally; forgotten shrine: Faith; old inscriptions: Watch; trophy beast: Wild). The exact mapping is part of the build.

## What it removes
- **Approaches** (might, finesse, wits, faith, presence), their milestone picks and approach scores.
- **Threat keywords** (calm, blessed, guard, antidote, cleave, light, watchful, pierce) as threat answers. Gear keywords that do something in combat on their own are reviewed in the build: kept as plain effects, or folded into families.
- **Kits**, entirely (provisions keep meals, potions and supplies).
- **Components**, entirely: boss and elite drops become relics (some with a second tag) or monster parts; blueprint overflow becomes monster parts or gold; held components convert in the save migration; gear with a keyword affix gets a matching part affix.
- **The "Steady vs threat" affix.**

## What stays
- Affixes from monster parts at the forge, and the forge flow.
- Specials, jobs, the gear rework.

## Later
- The Armory screen (heroes, gear and forge in one place) with the family strip as its centrepiece.
- A global numbers pass ("week-1 targets": crafts, rares, parts, roster 8).
- More ways to recruit (rescues, quest rewards, mercenary contracts, wanted heroes).
