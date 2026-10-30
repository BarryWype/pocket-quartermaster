# Tutorial: design

**Status: implemented.** Rules in `src/game/tutorial/` and `src/game/reveal/`, numbers and texts in `src/content/tutorial.ts` and `src/content/reveal.ts`.

The tutorial teaches the core loop in a few minutes, on the real map: walk and gather, forge, equip, answer a threat with a kit, run an expedition, collect loot. Then it hands over to a first quest and reveals the map gradually.

Permissions (location, motion and steps) are asked when the app first starts, before the tutorial.

## Steps
1. **Empty map**: everything is hidden except the player.
2. **Wood**: wood nodes spawn close to the player (15–30 m, on walkable spots, not overlapping). The player walks and picks them up.
3. **Forge**: craft a tier 1 sword (the player starts knowing the sword and mail blueprints).
4. **Equip**: give the sword to the warrior. The three heroes are introduced here, one line each.
5. **A threat**: the tutorial expedition's card shows one threat, **Beasts level 1**, in red, "not answered".
6. **Kit materials**: meat, hide and bone spawn close to the player (same rules as the wood). The player picks them up.
7. **Craft the kit**: a Hunter's pack. Give it to a hero: the threat turns green, "answered".
8. **Expedition**: send the team. It lasts a few seconds and always succeeds. A line says real ones take longer ("Most expeditions take 15–45 minutes").
9. **Loot**: the normal first-win-of-the-day roll, except the third blueprint is always the tier 1 bow (the ranger favours it; if the bow is somehow already known, the normal rule applies), with the line "Expeditions are where new blueprints come from".
10. **Back to the map**: zoom out a little, start the gradual reveal (below) and give the **first quest**: a short (500 m) quest to the nearest place, so the player knows what to do next.

## Walking fallback
Players indoors, with bad GPS or who can't walk now must not get stuck. If nothing has been picked up a minute after a spawn, a "Collect from here" button appears, once per spawn, during the tutorial only.

## Skip
A **Skip tutorial** button, available at every step. Skipping gives everything the tutorial would have given:
- The tier 1 sword, equipped on the warrior.
- A Hunter's pack in the inventory.
- The materials left over from the steps (the tutorial's wood, meat, hide and bone minus what the crafts used).
- The tutorial expedition's rewards: the same first-win roll, including the bow blueprint.
- The tutorial marked done, the first quest given and the gradual reveal started, exactly as at step 10.

## Gradual reveal
Not all 14 place kinds at once. Each kind appears when its condition is met, with a one-line tip the first time it's shown (all in config):

| Shown | When |
| --- | --- |
| Resources, animals, dungeons, quests | End of the tutorial |
| Common places (smithy, apothecary, sawmill, hunting lodge, mine of the tier, market, chapel) | End of the tutorial |
| Patrols | End of the tutorial |
| Fight events | First patrol won |
| Ruins, treasure spots | First quest completed |
| Taverns and the Guild Hall | When the Guild Hall opens today (the tier 1 boss) |
| Rarer places (library, thieves' guild, monster lair, fishing dock), Sanctums | Tier 2 |
| Secret place markers | When the player has a tip |

New item kinds (charms, components, relics, trinkets, valuables, key fragments) also get a one-line tip the first time one is obtained.

## Implementation notes
- The tutorial run pays only the first-win roll (no fixed gold, no Sigil: Sanctums show from tier 2). The roll is seeded apart, so skipping gives the same loot; the bow blueprint is set after it.
- "Collect from here" waits a minute after the phase spawned or after the last pickup, whichever is later; each tap picks up one node.
- If no common place is within 500 m, the first quest points at the nearest one within 2 km, in that distance's band.
- Travellers show with patrols. Mines above the player's tier still show greyed out once common places are revealed. The monster lair isn't drawn on the map; its tip comes with the rarer places.
- Tips are reread in Settings → Tips.
