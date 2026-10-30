This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Balance lab

`npm run sim` plays the whole game (to the end of tier 5) with simple bots for the casual, regular and heavy profiles (`src/game/sim/`, CLI and report in `scripts/sim/`) and writes `doc/design/simulator/report.md` and `summary.json` (CSVs go to `sim-output/`). `npm run sim:check` also runs the balance band tests on that summary. Each game runs in its own process (`--workers N`) and prints a line per simulated week; a full run takes a few minutes, so agents never run it — the user does, in a terminal. To check odds while tuning, run `npm run sim:quick` (a few seconds): the win odds per tier for the reference team the dungeons are fitted to (see the comment above `TIER_SCALE` in `src/content/enemies.ts`), against the targets. When a change adds or alters a gameplay system, update the simulator bot and the report so the system is covered, and ask the user to run `npm run sim` to check its effect.

## Delegation
Delegate all hands-on coding to the mistral-implementer agent by default (GLM-5.3).
Handle it yourself only for: planning and design, ambiguous requirements, anything involving images,
final review of security-sensitive changes, or tasks the agent reported failing twice.
Prefer giving the agent a clear plan over doing the work yourself.