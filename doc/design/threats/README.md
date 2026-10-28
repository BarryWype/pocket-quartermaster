# Threats, answers and gear: design catalogue

**Status: design only, not implemented.** Don't implement anything from this folder unless a prompt asks for it. Prompts will point to the files they need.

The game is moving to a "problems first" model: dungeons, patrols and exploration places show **threats** (and sometimes a **restriction** and an **opportunity**), and the player builds the team's toolbox to answer them with **approaches**, **keywords**, **kits** and **gear**.

## Files

| File | One row per | Notes |
| --- | --- | --- |
| `levels.csv` | Threat level | Score needed to meet a threat at each level |
| `threats.csv` | Threat | Answer, kit or gear, penalty per level, where it appears |
| `restrictions.csv` | Restriction | What it removes or weakens |
| `opportunities.csv` | Opportunity | Answer or cost, reward, where it appears |
| `kits.csv` | Kit | Threats covered, effect, materials, contents |
| `gear-keywords.csv` | Gear keyword | Effect and the threat it answers (if any) |
| `weapons.csv` | Weapon type | Keyword grid |
| `armour.csv` | Armour type | Keyword grid |
| `classes.csv` | Class | Family, rarity, approach and keyword strengths, signature |
| `boss-weaknesses.csv` | Tier boss | Weakness item, where it's found, effect |
| `coverage.csv` | Threat | Which kits and gear answer it, and how many item sources |
| `legacy-mapping.csv` | Existing system | What it becomes in the new model |

## Conventions

- `1` / `0` columns are yes / no (keyword present, appears in dungeons, etc.).
- `Dungeon`, `Patrol`, `Exploration` columns say where a threat or opportunity can appear.
- Percentages and multipliers are written as text in the level columns (for example `12% per trap`, `×1.5`), since they are design targets, not final numbers. The simulator will tune them.
- Class strengths are marked, not scored: approach scores (0–5) aren't set yet.

## Core rules

- **Approaches** (0–5 per hero): Might, Finesse, Wits, Faith, Presence.
- **Threat levels**: 1 Light, 2 Strong, 3 Extreme. An approach threat needs the best hero's score at 2 / 3 / 4; a keyword threat needs 1 / 2 / 3 heroes with the keyword.
- A **kit** adds +2 to its carrier's approach score, or gives its carrier the keyword.
- **Met**: no penalty. **One short**: half penalty. **More than one short**: full penalty. Never an automatic failure.
- **Kits** and consumables share the hero's single consumable slot, are single-use and gone after the run, even if unused.
- **Combat threats** (Undead, Armoured, Swarm, Brute) are answered by gear keywords, not kits.
- **Composition**: early tiers 1 threat; mid tiers 2 threats + 1 opportunity; high tiers the same + sometimes 1 restriction; bosses 3 threats. Patrols 1 threat. Exploration places 1 threat or 1 opportunity.
- Never two threats from the same family or answered by the same kit in one dungeon. A restriction never removes the last answer to a threat in the same dungeon.
- Content is balanced for common classes. A rare class makes a dungeon easier, but is never required.

## Known gaps

- Guard (against Brute) only comes from plate. It needs a second gear source.
- Approach scores per class aren't set.
- Porter and Alchemist both add a slot: keep both, or keep one.
- Today's 11 classes still need re-cutting to fit the class grid.
