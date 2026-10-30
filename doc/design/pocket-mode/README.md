# Pocket mode: design

**Status: designed, not implemented.** Pocket mode is the background mode: the player walks with the phone in a pocket, and the game keeps going quietly.

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
