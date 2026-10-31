# Issue 13 task context

Repo: /Users/clovis/server/pocket-quartermaster. Expo SDK 58, no bun.lock (use npx). Jest preset jest-expo. Scripts: npm test, npm run typecheck, npm run lint (expo lint). No expo-clipboard installed; SDK 58 recommends ~58.0.4 via `npx expo install expo-clipboard`.

No subagent tool available -> implement myself.

Issue 13 (doc/issues.md line 53). Issue 12 fixed in 8cbfce8: oddsCache pattern + optimistic stack + pending lock.

Key facts:
- index.tsx (799): whole-save subscribe, TICK_MS 3000, panel state inline, all markers inline. onRegionIsChanging -> skyPan.update + setDecor(showsDecoration(zoom)) each frame (setDecor unconditional).
- ambience.ts: decorationMinZoom 16.
- navigation.ts module stack+lock; _layout effect dep [routeNames] new array each render -> overwrites optimistic stack.
- NavLock {target,until,pending{target,until}}; rules tapLockMs 500, pendingMaxMs 3000.
- PlaceFightPanel odds useMemo [save,place,heroIds,openedAt,kind] -> placeFightOdds; PatrolPanel -> patrolOdds.
- oddsCache: oddsKey JSON, cachedOdds/cachedEstimateOdds, cacheMax 64.
- MapSky useSkyClock: setInterval(1000/12) setValue on nativeValue(); clock.seconds() used by Flock. MapWater useAnimationFrame(1). MapFoliage useAnimationFrame(4) %frames, LAYERS frames^2 symbol layers, minzoom decorationMinZoom, posts minzoom 15.
- useAnimationsEnabled: useIsFocused + AppState + reduceMotion.

Phases 1-6 per user message; commit each; tests+tsc+lint before each; never npm run sim.
