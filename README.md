# Pocket Quartermaster

**Your daily walk keeps a band of fantasy heroes supplied.**

Pocket Quartermaster is a walking game for your phone, a bit like Pokémon GO, except you never fight yourself. You're the quartermaster: the one who keeps the heroes armed, fed and ready.

Walk around your real neighbourhood to pick up wood, ore, herbs and animal materials that appear on paths and in parks. Turn them into weapons, armour and potions. Equip your heroes, then send them on timed expeditions into dungeons and read how it went when they come back.

**Walk → gather → forge → equip → send an expedition → read the report**

## What you'll do

- 🚶 **Walk and gather.** Resources spawn on footpaths, streets and parks around you. Everyone at the same place sees the same spawns.
- ⚒️ **Craft.** Forge gear from wood up to steel, brew potions and rations, and infuse weapons with elements.
- 🧙 **Build a team.** Recruit heroes from taverns on the map. Each class and trait has its strengths.
- 🏰 **Send expeditions.** Every dungeon shows its dangers up front, so the real game is picking the right heroes and gear for the job. Dungeons rotate daily, across 5 tiers, each ending in a boss.
- 🗺️ **Explore the map.** Shops, ruins to dig, fights that last a day, Sanctums guarded by elemental bosses, treasure maps and secret places that open with a mysterious key.
- 👖 **Play from your pocket.** With the phone in your pocket, the game still gathers nearby resources, counts your steps and tells you when something needs you.

The game is in English and French. Everything runs on the phone: there's no account and no server.

## Install the game

Android only for now (Android 7.0 or newer). iOS should work but hasn't been tried.

1. On your phone, open the [latest release](https://github.com/BarryWype/pocket-quartermaster/releases/latest).
2. Download the `.apk` file and allow your browser to install apps when asked.
3. Open **Pocket Quartermaster** and allow **location** and **physical activity**. The tutorial takes you through your first walk, forge and expedition in a few minutes.

---

# For developers

- [1. Set up your computer](#1-set-up-your-computer-one-time)
- [2. Install dependencies](#2-install-dependencies)
- [3. Build the app on your phone](#3-build-the-app-on-your-phone)
- [4. Daily workflow](#4-daily-workflow)
- [5. Test the game](#5-test-the-game)
- [6. Checks and balance](#6-checks-and-balance)
- [7. Releases](#7-releases)
- [8. Project structure](#8-project-structure)
- [9. Troubleshooting](#9-troubleshooting)

## 1. Set up your computer (one-time)

### Node 24

React Native 0.88 needs Node 22.13+ or 24.3+. The repo pins Node 24 in `.nvmrc`:

```bash
nvm install
```

```bash
nvm use
```

Check it with `node -v`, which should print `v24.x`.

### Android Studio, SDK and JDK 17

1. Install [Android Studio](https://developer.android.com/studio).
2. In **Settings → Languages & Frameworks → Android SDK**, install:
   - **SDK Platforms:** Android API 37.
   - **SDK Tools:** Android SDK Build-Tools 37, Android SDK Platform-Tools, Android SDK Command-line Tools.

   Gradle can also download missing pieces during the first build, as long as the SDK licences are accepted.
3. Point your shell at the SDK and at Android Studio's bundled JDK 17. Add these lines to `~/.zshrc`, then open a new terminal:

   ```bash
   export ANDROID_HOME="$HOME/Library/Android/sdk"
   export PATH="$ANDROID_HOME/platform-tools:$PATH"
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
   ```

### Your Android phone

The phone needs Android 7.0 (API 24) or newer.

1. **Settings → About phone →** tap **Build number** 7 times to unlock Developer options.
2. **Settings → System → Developer options →** turn on **USB debugging**.
3. Plug the phone in with a USB cable and accept the **Allow USB debugging** prompt on the phone.
4. Check that the computer sees the phone:

   ```bash
   adb devices
   ```

   You should see one line ending in `device`. If it says `unauthorized`, unlock the phone and accept the prompt.

## 2. Install dependencies

```bash
npm install
```

## 3. Build the app on your phone

The map (MapLibre), notifications and the pedometer use native code, so the app doesn't run in **Expo Go**. You build your own development app instead. It works like Expo Go, but contains this project's native modules.

With the phone plugged in:

```bash
npx expo run:android --device
```

Pick your phone if asked.

- The first build takes several minutes. It generates the `android/` folder, which is gitignored and must never be edited by hand.
- When it's done, **Pocket Quartermaster** is installed on the phone and opens connected to the dev server.

**When to rebuild:** only when a native dependency or the native config in `app.json` changes. JavaScript and TypeScript changes never need a rebuild. After any change to `app.json` plugins or permissions, rebuild with `npm run android:fresh`: it regenerates the `android/` folder (`prebuild --clean`), which `expo run:android` alone reuses as it is.

## 4. Daily workflow

Start the dev server:

```bash
npx expo start
```

Then open **Pocket Quartermaster** on the phone, not Expo Go.

- **Same Wi-Fi:** the app finds the server on its own.
- **Over USB:** run this first, then reload the app:

  ```bash
  adb reverse tcp:8081 tcp:8081
  ```

Saving a file reloads the app. Shake the phone to open the dev menu.

## 5. Test the game

The **🐞 Debug** screen lets you test everything from your desk: mock location, extra materials, fast expeditions, skipping the tutorial and more. It's always there in development builds; in a release build, turn it on in ⚙️ Settings → Developer → **Debug tools**.

The [testing guide](doc/testing-guide.md) walks through each system and how to test it. Design notes live in [`doc/design/`](doc/design/).

## 6. Checks and balance

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npx expo-doctor
```

### Balance lab

The simulator plays the whole game, up to the end of tier 5, with simple bots for a casual, regular and heavy player.

| Command | What it does | Time |
|---|---|---|
| `npm run sim:quick` | Prints the win odds per tier against the targets, for tuning | A few seconds |
| `npm run sim` | Plays full games and writes `doc/design/simulator/report.md` and `summary.json` (CSVs go to `sim-output/`) | A few minutes |
| `npm run sim:check` | Runs `sim`, then the balance band tests on its summary | A few minutes |

Profiles, targets and how it works are in [`doc/design/simulator/README.md`](doc/design/simulator/README.md).

## 7. Releases

A GitHub Actions workflow (`.github/workflows/release.yml`) builds a signed release APK and attaches it to a GitHub release whenever a `v*` tag is pushed.

### One-time setup

1. Create the release signing key, outside the repo, and back it up with its password (losing it means no build can update installed copies):

   ```bash
   keytool -genkeypair -v -storetype PKCS12 -keystore ~/pocket-quartermaster-release.keystore -alias pocketquartermaster -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Add the repository secrets (the password ones prompt for the value; with PKCS12 the key password is the keystore password):

   ```bash
   base64 -i ~/pocket-quartermaster-release.keystore | pbcopy
   gh secret set ANDROID_KEYSTORE_BASE64 --body "$(pbpaste)"
   gh secret set ANDROID_KEYSTORE_PASSWORD
   gh secret set ANDROID_KEY_ALIAS --body "pocketquartermaster"
   gh secret set ANDROID_KEY_PASSWORD
   ```

3. Optional, to sign local release builds with the same key: add these lines to `~/.gradle/gradle.properties`, then rebuild with `npx expo prebuild --platform android` first.

   ```properties
   PQ_RELEASE_STORE_FILE=/Users/you/pocket-quartermaster-release.keystore
   PQ_RELEASE_STORE_PASSWORD=...
   PQ_RELEASE_KEY_ALIAS=pocketquartermaster
   PQ_RELEASE_KEY_PASSWORD=...
   ```

### Releasing

```bash
git tag v0.2.0 && git push origin v0.2.0
```

About 15 minutes later the release page has `pocket-quartermaster-v0.2.0.apk`. The workflow runs the typecheck and tests first. The version shown in the app comes from the tag; the Android version code is the build time, so each APK installs over any older build, including a local release build signed with the same key.

- Release builds are signed by `plugins/withReleaseSigning.js` when the `PQ_RELEASE_*` Gradle properties are set, and with the debug key otherwise. The version name comes from `app.config.js` (`APP_VERSION`), the version code from `plugins/withBuildTimeVersionCode.js`.
- The first release-signed APK can't install over a debug-signed one: uninstall it first (this loses that phone's save).

## 8. Project structure

```
src/
  app/          Screens (Expo Router): map, forge, inventory, team, expeditions, quests, guild, settings, debug
  game/         Pure game rules, no React or Expo, all unit-tested (gathering, crafting, team, expeditions,
                places, quests, loot, save migrations, the balance simulator…)
  content/      Game data: resources, recipes, heroes, dungeons, enemies, places, quests, map style, French texts
  store/        Zustand stores persisted to AsyncStorage (game save, debug settings)
  services/     Wrappers around device APIs: location, notifications, pedometer
  hooks/        Player location and step tracking
  i18n/         Translations
  components/   Shared UI
```

- **Content is data.** To tune the game, edit the files in `src/content/`, then run `npm test` and `npm run sim:quick`.
- **Saves must survive updates.** A change to the saved state needs a store version bump and a migration step (`src/game/migrations.ts`).
- **Map style:** the pixel-style map look is in `src/content/mapStyle.ts`, a MapLibre style over [OpenFreeMap](https://openfreemap.org) vector tiles. They're free, with no API key, and the OpenStreetMap credit stays visible.
- **Animated foliage:** bushes and trees are scattered on open ground (`src/game/generation/foliage.ts`, drawn by `src/components/MapFoliage.tsx`). They skip roads, water, buildings and residential areas, and trees are more common in woods and parks. Each plant has 4 sway frames played at 4 fps, which pause when the app is in the background or the phone's reduce-motion setting is on. The placeholder sprites in `assets/sprites/` come from `scripts/generate-foliage-sprites.py`. Replace them with real art under the same names (`bush-0…3`, `tree-0…3`, with `@2x`/`@3x` versions), then rebuild the development app.
- **Menu and font:** the floating menu on the map is `src/components/IslandMenu.tsx`; add a crafting station to its `CRAFT_LINKS` to list it under Craft. Shared colours and the font name are in `src/theme.ts`. The font, [Fantaisie Artistique](https://www.1001fonts.com/fantaisieartistique-font.html), is loaded from `assets/fonts/FantaisieArtistique.ttf`. Use `Text` and `Button` from `src/components/` instead of the React Native ones so it applies. It has no emoji glyphs: put emoji in their own element (`IconLabel`).

## 9. Troubleshooting

| Problem | Fix |
|---|---|
| Build fails mentioning the Node version | Run `nvm use` and check that `node -v` prints v24. |
| `JAVA_HOME` / "Unsupported class file" errors | Point `JAVA_HOME` at Android Studio's JDK 17 (see [section 1](#1-set-up-your-computer-one-time)). |
| `SDK location not found` | Set `ANDROID_HOME`, or create `android/local.properties` with `sdk.dir=/Users/<you>/Library/Android/sdk`. |
| `adb devices` shows nothing | Try another cable or USB port, and check that USB debugging is on. |
| The app can't reach the dev server | Use the same Wi-Fi, or run `adb reverse tcp:8081 tcp:8081`. |
| The map is blank | The phone needs internet for the map tiles. Check the dev server log for errors. |
| Spawns take a moment to appear | The map data for your area is downloading (up to about 1 MB per tile in dense cities). It's cached for the session. |
| "Finding you…" never ends | Go outside or near a window. Readings worse than 40 m accuracy are ignored. You can also use Mock location on the Debug screen. |
| Native changes don't show up | Rebuild with `npx expo run:android --device`. |
| Build is in a weird state | `npx expo prebuild --clean --platform android`, then rebuild. This regenerates `android/`. |
