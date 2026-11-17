# Street routes · proposal (step 7)

**Status: proposal, for review.** Nothing below is built yet. Once approved and built, the rules move into the README.

## What the game already has

- **Walkable ways:** spawn placement decodes OpenFreeMap vector tiles at a fixed **zoom 14** (`src/game/generation/walkable.ts`). It keeps each walkable way (paths, tracks, minor, service, tertiary and secondary roads, piers) as a polyline. Motorways, trunk and primary roads are left out (the data doesn't say whether they have a footpath), and so are tunnels, indoor, private and no-foot ways. A zoom-14 tile is about 1.8 km across at Wellington. Tiles are fetched and cached by `src/services/mapTiles.ts`.
- **The cart today** drives straight lines between cell centres (`src/game/supply/cart.ts`). Its loop is fixed when it departs and replayed from timestamps.

## Measured on the Wellington fixture tile (central city and harbour)

| | |
| --- | --- |
| Ways / points | 154 ways, 1,512 points (68 KB tile) |
| Decode the tile | 5 ms (already done for spawns, cached) |
| Build the graph | 8 ms |
| One shortest-path search | 0.15 ms |
| Connected, as decoded | 53 separate pieces; the largest holds 70% of the points; 27 of 50 random pairs can reach each other |
| Connected, after joining loose ends within 15 m | 8 pieces; the largest holds 94% |

**Why it's split:** in vector tiles, a junction isn't always a shared point, and a way often stops a few metres short of the road it meets. Joining each way's two ends to the nearest point of another way within **15 m** repairs that. What stays apart is real: piers, and footpaths cut off by the excluded main roads. Adding primary roads changed nothing on this tile.

## The proposal

1. **The street network** is built from the zoom-14 tiles covering the hall's building reach plus 300 m: 2 × 2 to 3 × 3 tiles at tier 2 (1 km), up to 4 × 4 at tier 5 (2.5 km). It reuses the walkable ways as they are and joins loose ends within 15 m, across tile edges too. **No new decoding:** the cart goes where people walk.
2. **Snapping:** the hall and each stop snap to the nearest point on a way within 200 m. The leg between that point and the stop itself is a straight line (the "last leg").
3. **Path search:** shortest path (Dijkstra with a heap) between consecutive stops, hall → stops in order → hall, and through any street the player taps to force the route that way.
4. **Found once, stored with the route:** the path is worked out when the route is set (and again only when the player changes it), simplified to points about 5 m apart in a straight line, and stored with the route. **Settling never touches tiles or searches:** the cart drives the stored points, so offline replays stay as cheap as today.
5. **No path:** if two stops sit in different pieces, or a stop has no way within 200 m, that leg is a straight line. The planner says so: "No street from the quarry to the Rusty Tankard: the cart cuts across."
6. **When the map data changes** (OpenFreeMap updates its tiles every few weeks): a stored route keeps the path it was set with; nothing moves under the player. The path is only recomputed from fresh tiles when the player next changes the route. Spawns snap against the new tiles meanwhile, so for a while the cart may cut a corner a new path wouldn't. Harmless.

### Cost on a phone

About 5 times the laptop figures:

- **Setting a route at tier 5:** about 0.6 s to build a 16-tile graph (around 24,000 points), and about 30 ms per leg. The planner shows "Finding the streets…" for that moment.
- **At tier 2:** under 0.2 s.
- **Tiles:** the same cached zoom-14 tiles spawns use. A first route at tier 5 may fetch up to 16 tiles (about 1 MB) the map hasn't shown yet.
- **Save:** a 3 km loop stores about 200 points, under 5 KB.
- **Map:** the route line is one GeoJSON line drawn once; the cart moves along it on the map's slow clock (every 5 s), as today.

## The rest of step 7, briefly (as the prompt and the approved planner mockup say)

- **Stops** are buildings and discovered places within the tier's reach of the hall.
  - At a building the cart loads everything it can carry, largest stock first.
  - At a place it unloads everything that place's order still wants (a market takes any good), paid and counted exactly like a delivery in person.
  - What remains comes home to the hall.
  - An expired stop is skipped (the cart still drives the stored path past it) and the Network tab flags the route.
- **Danger along a route** uses each crossed cell's **day average** (the mean over the day's 48 patrol windows, plus that day's fight events and lairs), both in the planner and for the ambush rolls, so what you planned is what happens. The ambusher is still the strongest patrol touching the cell when the cart crosses it, else a patrol of your tier.
- **The planner** becomes the guided sheet from `mockups/RoutePlanner.html`: pick stops, order them (drag or arrows, and "Suggest"), see the result. The result shows the flow strip, the loop time, the street length, the ambush chance per loop and warnings for stops leaving before the next loop ends. A tap on a street forces the route through it.
- **The cart's sheet:** where it is, its cargo by icon, the last loops in plain sentences ("Delivered 12 grain to the Rusty Tankard, 8 stone home"), and its crew.
- **On the map:** the route along the streets, the cart moving on the slow clock, and a small unload pop at a stop when the app is open (Full animations only).
- **Save version 58:** route points name buildings, places or a forced street point; the stored path and which legs are straight. Today's waypoint cells become forced street points.

## Questions for you

1. **Join distance of 15 m** for loose ends, and **200 m** for snapping a stop to the streets: fine?
2. **Walkable ways only**, or should the cart also use primary and trunk roads (a small decode change)? On the fixture it makes no difference; elsewhere it could shorten routes but send the cart along main roads.
3. **Danger by day average for the ambush rolls too** (what you plan is what happens), or keep rolling on the live 30-minute window while the planner shows the average?
