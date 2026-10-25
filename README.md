# Pocket Quartermaster

A location-based mobile game. You are the quartermaster of a small band of heroes: walk around your neighbourhood to gather ore, animal materials and herbs, forge gear, and send your heroes on timed expeditions.

This is the MVP, a playable proof of the core loop. Everything runs on the device: there is no backend.

**Walk → gather → forge → equip → send expedition → read results**

Android is the first target. iOS should work but hasn't been tried.

---

## 1. Prerequisites (one-time)

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

---

## 2. Install dependencies

```bash
npm install
```

---

## 3. Build and install the app on your phone

The map (MapLibre), notifications and the pedometer use native code, so the app doesn't run in **Expo Go**. You build your own development app instead. It works like Expo Go, but contains this project's native modules.

With the phone plugged in:

```bash
npx expo run:android --device
```

Pick your phone if asked.

- The first build takes several minutes. It generates the `android/` folder, which is gitignored and must never be edited by hand.
- When it's done, **Pocket Quartermaster** is installed on the phone and opens connected to the dev server.

**When to rebuild:** only when a native dependency or the native config in `app.json` changes. JavaScript and TypeScript changes never need a rebuild.

---

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

---

## 5. Test the core loop

On first launch, allow **location**, **notifications** and **physical activity**.

The **🐞 Debug** tab (development builds only) lets you test everything from your desk.

### Map and spawns

1. Open the **Map** tab. It centres on you and follows you. The 🧙 marker is you.
2. Markers are spawns. Each kind is visible from a different distance:
   - Ore (🪨 🟠 💎): 500 m.
   - Animals (🐇 🦌 🐗): 150 m. Animals wander.
   - Herbs (🌿 🫐 🍄): 50 m.
   - Rare drops (🌠 🌸): 200 m, and they only last an hour.
3. **Test without walking:** on Debug, turn on **Mock location**. Then use the N/S/E/W buttons, or tap the map to teleport.
4. **Determinism:** two phones at the same place, in the same time window, see the same spawns.
5. **Time of day:** on Debug, change **Time of day**. Deer get more common at dawn and dusk, crystals and boars at night.
6. **Refresh:** set **Spawn refresh window** to 1 min to see spawns change quickly.

### Gathering

1. Move within **30 m** of a marker. It grows and turns yellow.
2. Tap it. A banner shows what you gathered, and the spawn disappears until its window refreshes.
3. Tap a marker that's further away and you'll get "Too far: N m away".
4. Animals show 💨 and can't be gathered when you move faster than about 18 km/h. Try this on a bike or in a car, not in mock mode.

### Inventory, forge and alchemy

1. **Inventory** lists gold, materials, gear (with durability) and consumables.
2. To skip the walking, on Debug tap **+10 of every material**.
3. **Forge** lists forge and alchemy recipes, showing what you have against what's needed, e.g. `🪨 3/4`.
   - The button is only active when you have every input.
   - 🔒 recipes are unlocked by expedition or chest rewards.

### Team

1. **Team** shows Bram (warrior), Lyra (archer) and Mira (fire mage), with level, XP and stats.
2. Tap **Change** on a slot to equip gear or a consumable.
   - Stats update straight away.
   - Class affinities apply: swords boost Bram, bows boost Lyra, wands boost Mira.

### Expeditions

1. **Expeditions:** pick the party, then tap **Send** on a dungeon. Each one shows its success chance for the current party.

   | Dungeon | Duration | Notes |
   |---|---|---|
   | Goblin Warren | 5 min | |
   | Troll Bridge | 30 min | |
   | Cinder Hollow | 2 h | Fire hazard: fire resistance elixirs help, and Mira is immune |

2. Heroes who are away can't be re-equipped.
3. **Shorter timers:** on Debug, turn on **Fast expeditions** (minutes become seconds), or tap **Finish all expeditions now**.
4. When an expedition ends:
   - You get a notification, even if the app is closed.
   - A report appears with success or failure, gold, loot, any recipe, XP and a short log.
   - The tab shows a badge until you've read it.
5. **Closed-app check:** send a 5-minute expedition, close the app completely, wait, then reopen it. The result is resolved on launch.
6. Gear wears down on each expedition and breaks at 0 durability.

### Daily step chests

1. The top of **Inventory** shows today's steps and two chests:
   - Wooden chest: 5,000 steps.
   - Iron chest: 10,000 steps.
2. Each chest opens once per day.
3. On Debug, **+5,000** steps unlocks them without walking.
4. **Android limitation:** steps only count while the app is open. iOS reads the full day from the phone's history.

### Reset

On Debug, **Reset save data** starts over, after a confirmation.

---

## 6. Checks

```bash
npm test
```

```bash
npm run typecheck
```

```bash
npx expo-doctor
```

---

## 7. Project structure

```
src/
  app/          Screens (Expo Router): map, forge, alchemy, inventory, team + character sheet, expeditions, debug
  game/         Pure game rules, no React or Expo, all unit-tested
    generation/   Seeded RNG, geohash tiles, time windows, spawns, animal paths, visibility
    gathering/    Collecting spawns, fleeing animals, GPS filtering
    crafting/     Recipes and crafting
    team/         Hero stats, equipment, XP
    expeditions/  Starting, resolving, log generation
    rewards/      Loot rolls, step chests
    balance/      Simulated walk + balance guard-rail tests
  content/      Data: resources, materials, items, recipes, heroes, dungeons, chests, log templates, map style
  store/        Zustand stores persisted to AsyncStorage (game save, debug settings)
  services/     Wrappers around device APIs: location, notifications, pedometer
  hooks/        Player location and step tracking
  components/   Shared UI
```

- **Content is data.** To tune the game, edit the files in `src/content/`. Run `npm test` afterwards: `src/game/balance/balance.test.ts` fails if the yields or difficulty curve drift too far.
- **Map style:** the pixel-style map look is in `src/content/mapStyle.ts`, a MapLibre style over [OpenFreeMap](https://openfreemap.org) vector tiles. They're free, with no API key, and the OpenStreetMap credit stays visible.
- **Menu and font:** the floating menu on the map is `src/components/IslandMenu.tsx`; add a crafting station to its `CRAFT_LINKS` to list it under Craft. Shared colours and the font name are in `src/theme.ts`. The font, [Fantaisie Artistique](https://www.1001fonts.com/fantaisieartistique-font.html), is loaded from `assets/fonts/FantaisieArtistique.ttf`. Use `Text` and `Button` from `src/components/` instead of the React Native ones so it applies.

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| Build fails mentioning the Node version | Run `nvm use` and check that `node -v` prints v24. |
| `JAVA_HOME` / "Unsupported class file" errors | Point `JAVA_HOME` at Android Studio's JDK 17 (see Prerequisites). |
| `SDK location not found` | Set `ANDROID_HOME`, or create `android/local.properties` with `sdk.dir=/Users/<you>/Library/Android/sdk`. |
| `adb devices` shows nothing | Try another cable or USB port, and check that USB debugging is on. |
| The app can't reach the dev server | Use the same Wi-Fi, or run `adb reverse tcp:8081 tcp:8081`. |
| The map is blank | The phone needs internet for the map tiles. Check the dev server log for errors. |
| "Finding you…" never ends | Go outside or near a window. Readings worse than 40 m accuracy are ignored. You can also use Mock location. |
| Native changes don't show up | Rebuild with `npx expo run:android --device`. |
| Build is in a weird state | `npx expo prebuild --clean --platform android`, then rebuild. This regenerates `android/`. |
