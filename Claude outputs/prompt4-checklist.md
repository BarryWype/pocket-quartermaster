# Prompt 4 – phone checklist

Every place the loot grid now appears, and how to see a newly named gear piece, a new hero title and a "What would have helped" line, each with the debug-screen shortcut that gets you there fast. Section names below are the debug screen's headings.

## Before you start

- **Tutorial and reveal → Skip tutorial**, then **Reveal everything**, so every screen and place kind shows.
- **Location → Mock location** on, if you test indoors: the map places and patrols below are placed next to the mock position, and the N/S/E/W buttons walk you to them.
- **Expeditions → Fast expeditions** on (minutes become seconds), or **Finish all expeditions now** after sending.
- A new development build is needed (expo-haptics was added).
- Only reports made after this update have a tally: "Your work", "What would have helped" and "Hero of the run" are empty on older reports.

## The loot grid

What to check on each: tiles four across (or small, on the toasts), labels under them (amount, "×3", kind or rarity), rarity frames on gear, maps and manuals, brass frame on blueprints, ember frame on relics, the "New" ribbon on a first find, and tapping a tile opens its card (except on toasts and previews).

| # | Where | Debug shortcut | What to check |
| --- | --- | --- | --- |
| 1 | **Expedition loot reveal** (after Collect) | Send any party, then **Expeditions → Finish all expeditions now**, and tap Collect on the Expeditions screen | Plain tiles pop in together, the best one or two (rare or legendary gear, blueprints, relics) grow in last with a glow and a light vibration; a tap skips it; under 2 s. Hero plates: portrait, XP gained, XP bar filling, level-up badge. To be sure of a blueprint or gear find: **Sanctums and rewards → Force a loot category on the next successful expedition** (blueprints or gear) |
| 2 | **Expedition report card** (Expeditions → Reports, tap a report) | Same run as 1, then **Read the report** | Static grid at the bottom; hero rows with portrait and "+N XP" beside HP |
| 3 | Tapping a **gear** tile (in 1 or 2) | As 1, with a gear drop | Its card with stats, affixes and History; "Equip on <hero>" buttons for heroes at home; equipping closes the card |
| 4 | Tapping a **blueprint** tile | As 1, forcing blueprints | What it makes and needs; "Forge" opens the forge on that blueprint's section with its confirmation open |
| 5 | Tapping a **material / part / relic** tile | As 1 | Used-for chips; relics show their effect |
| 6 | **Map toast: patrol win** | **Patrols → Spawn next to me** (easy), fight it from the map, wait for the fight to end | Up to 4 small tiles, then "+N"; not tappable |
| 7 | **Map toast: map fight win** | **Places →** pick a fight kind (bandit camp, beast den…) **→ Place it next to me**, fight it | Same as 6 |
| 8 | **Map toast: heist** | **Places → Thieves' guild → Place it next to me**, send a hero on a heist | Same as 6, on a successful heist |
| 9 | **Map toast: treasure spot** | **Loot → + common map** (or rare / legendary), read it in Inventory, walk to the mark (mock location N/S/E/W) and dig | Same as 6 |
| 10 | **Dig result** (ruins panel) | **Places → Ruins → Place it next to me**; **Places → Ruins dug: 4** to get the relic on the next dig | Grid with the reveal under "dug" text; the 5th dig shows the relic tile |
| 11 | **Fishing result** (dock panel) | **Places → Fishing dock → Place it next to me**, Fish | Grid with the reveal |
| 12 | **Step chests** (Quests → Chests, or Inventory → Finds while quests are hidden) | **Steps → +5,000** (twice for the bigger chests), then Open | Grid with the reveal under the chest list |
| 13 | **Quest claim** (Quests) | **Quests → Grant quest**, then **Complete …** on it, then Claim on the Quests screen | Grid with the reveal in the "claimed" box |
| 14 | **Quest reward preview** (quest notice) | **Quests → Grant quest** | Category tiles with "?" under them; the rarer categories faded |
| 15 | **Traveller gift** | **Patrols → Spawn next to me →** a traveller (pilgrim, merchant…), help them | Grid with the reveal in the traveller sheet (loot rewards only; a recruit shows the recruit) |
| 16 | **Sanctum result** | **Sanctums and rewards → Add a Sigil (T1)**, **Place a Sanctum next to you**, challenge it | "Victory! You gain:" then shard, stone and XP tiles with the reveal, light labels on wood |
| 17 | **Reduce motion** | Phone settings → accessibility → remove animations, then repeat 1 | Every reveal shows at once, no animation |
| 18 | **French** | Settings → language → Français, then repeat 1 and 2 | Labels ("Plan", "Relique", "Bibelot", "Nouveau") and card texts in French |

## A newly named gear piece

Fastest route: a tier boss's killing blow by a lone hero. The same run also earns the Giant-slayer title (next section).

1. **Progression → Beat next boss** once: tier 1's boss (Bandit Stockade, the mill ogre) is open.
2. **Taverns and heroes → Add hero** at level 8 or so (any class with a weapon), or **Set level** on one you have.
3. **Forging → Add gear**: a T2 or T3 weapon at Rare, then equip it on that hero (hero sheet, weapon slot). Debug-added gear has no origin, so its History shows no "Forged by you" line; to see that line, forge the weapon instead (**Forging → Force the rarity of the next forge: Rare**, then forge it on the Forge screen).
4. Send that hero **alone** to Bandit Stockade, **Expeditions → Finish all expeditions now**, Collect.

What to check:
- The loot reveal pops in "<item> earned a name: <hero>'s Ogre-bane." in a brass frame after the loot.
- The report card's "Your work" starts with the same line, framed in brass.
- The piece's name everywhere is now "<hero>'s Ogre-bane" (hero sheet, inventory, pickers); its card subtitle keeps rarity and base item; its History block shows "Forged by you" (if forged) or "Found in …", runs, kills, bosses beaten and the day the name was earned.
- **Salvage** on it warns first, in red: "It has earned its name: its story ends here".
- Growing a name needs 200 kills on that weapon; there's no debug shortcut for kill counts. A forged piece's affix lines in "Your work" say "forged by you".

## A new hero title

The run above gives the lone hero **Giant-slayer** (a tier boss's killing blow).

What to check:
- The report card shows "<hero> earned a title: Giant-slayer." under "Hero of the run", framed in brass; the loot reveal pops it in too.
- The hero sheet shows "Giant-slayer" under the name, and a Record section (runs, wins, knockouts, kills, bosses, hero of the run, who they ran with most) with the earned titles: tap another to show it, tap the shown one to hide it.
- The party dialog (sending an expedition) shows the title under the hero's name.
- **Dismiss** on that hero asks twice; the second asks naming the title.
- Companions take 15 runs together; there's no debug shortcut. With **Fast expeditions** on, sending the same pair 15 times shows "<a> and <b> are now companions." on the 15th report, a "Companion of …" line on both sheets, and now and then a companion line in later logs.

## A "What would have helped" line

It shows only after a loss, a retreat or a win with a knockout, when a threat was missed or half met and cost something.

1. The first 2 expeditions after the tutorial have no threats (safe start): send any 2 first.
2. **Threats →** pick an open dungeon, **Add a threat** (Darkness or Beasts at level 2 or 3 works well; Darkness gives the "struck first in N fights" wording). Make sure nobody in the party has that threat's family tags (Watch for Darkness, Wild for Beasts).
3. Send an under-levelled party (or **Hero HP and provisions → 30%** on each hero first), **Finish all expeditions now**, Collect.

What to check:
- The report card shows one line under "What would have helped", for example "Nobody answered Darkness: the enemy struck first in 3 fights. 2 more Watch tags would light it.", with the threat's icon.
- A clean win (no knockout) never shows the section.
- In French: "Personne n'a répondu à la menace …".
