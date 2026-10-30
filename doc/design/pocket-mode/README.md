# Pocket mode: design

**Status: implemented.** Pocket mode is the background mode: the player walks with the phone in a pocket, and the game keeps going quietly.

## Principle: passive only
Pocket mode **never makes a choice for the player**. It does what already happens on its own while walking, and tells the player when something needs them. It never starts or joins a fight event, digs a ruin, enters a place or secret place, buys or sells, launches an expedition, or claims a quest.

## What it does
| Does | Details |
| --- | --- |
| Auto-gather | Collects resources within **30 m** of the path, the same as the tap range (was 20 m). The attentive player still gets more by changing their route to reach nodes. Background fixes up to **35 m** accuracy are kept (was 25 m), so city walks don't lose their path |
| Escort | The escort hero fights patrols on the way (existing) |
| Counts walking | Distance and steps count for quests (walk objectives) and step chests |
| Counts passive wins and gathering | Patrols beaten by the escort and resources auto-gathered count towards quests ("beat N patrols", "gather N herbs") |
| Notifies | See below. Every notification opens the right screen |

A quest whose objective is met in the background becomes **ready to claim**; the player claims it in the app.

## Notifications
The player picks which kinds they want (like the patrol alerts today), and quiet hours apply. At most one notification of each kind every 10 minutes (in config), grouped when several arrive together.

| Kind | When |
| --- | --- |
| Patrol alerts | A patrol is close (existing) |
| Quest ready | A quest's objective was met in the background |
| Quest target near | The player is at or near a quest's target that needs an action (pray at the chapel, dig the ruin) |
| Step chest | A step chest is ready |
| Nearby places | A fight event, a ruin or a treasure spot is close (the player picks which) |
| Secret place | The player is near an active tip's place and has a key |

## Availability
- Available as soon as the tutorial is done **or skipped** (the reworked tutorial has a skip button), with location allowed in the background.
- The auto-stop timer and the limited mode (location only while the app is open) stay as they are.
- Battery: no new location work; the new counts and checks run on the fixes Pocket mode already collects.

## Implementation notes
- **Background vs app open.** The background task never changes the save. On each batch of fixes it steps patrols and the escort (as before), then Pocket mode's watch (`src/game/patrols/pocketMode.ts`): walking turned into estimated steps with the same segments and stride as the app (`pocketCounts.ts`), escort wins from its pending fights, and places nearby (`pocketNearby.ts`). These only predict, to send notifications (`src/game/notifications/pocket.ts`). When the app opens, the walk is processed as before (gathering, steps, walk quests), the escort's fights are merged (patrol quests), and the task gets a new snapshot. So nothing is counted twice; a test checks the prediction matches what the app counts.
- **Quest ready** is sent for walk and patrol quests only. Gather quests count when the app opens: the task can't place nodes on walkable ground without the map tiles, so it can't tell exactly what was gathered.
- **Step chests** in the background use steps estimated from the walk on top of today's count at hand-off (the pedometer doesn't count in the background on Android). Chests it notified are copied into the app's step alert log, so the app doesn't send them again.
- **Quest target near** keeps the existing check: within 50 m (`questRules.arrivalMeters`, the interaction range) of a fixed target. Only objectives that need an action have a fixed target.
- **Nearby places**: fight events, ruins (and ruins grown where dug ones stood) and treasure spots within 150 m (`pocketRules.nearbyMeters`), only kinds the player has revealed and picked; each alerts once. Positions are the generated ones (the map snaps places to walkable ground, a few metres away).
- **Secret place**: tipped places within 150 m while the player held a key at hand-off. The underwater dungeon is left out in the background (finding its spot needs the water check from the map tiles).
- **Limits**: at most one notification per kind every 10 minutes (`pocketRules.notifyEveryMinutes`), several of a kind grouped. Quests and step chests that can't go yet wait for the next turn and for the end of quiet hours; places nearby are dropped (the player will have walked on).
- **Taps** open the quests list, the step chests (inventory), or the map centred on the place (it stays there until re-centred or dragged).
