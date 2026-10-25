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

### Tutorial

A fresh save walks you through the whole loop in a few minutes. A one-line 🧭 hint at the top of each screen says what to do next, and the menu button you need lights up.

1. **Gather:** only wood shows on the map, plus one guaranteed tree about 10 m from you, even indoors. Tap it for 3 wood.
2. **Forge:** Craft → Forge has a single recipe, the **Wooden sword**. Make it. Animals and herbs start appearing on the map.
3. **Equip:** in Team, give the sword to a hero (Bram the warrior suits it best).
4. **Send:** in Expeditions, only the Rat Cellar can be picked. It shows its real odds, but this first trip always succeeds and takes about 5 seconds. Tap it under "Under way" to watch its progress bar.
   - It pays a little gold, the **wooden bow** blueprint and a **mysterious key**. What the key opens comes later.
5. **Explore:** animals and herbs have been on the map since the sword was forged; gather some while the team is away.
6. **Read:** when they're back, open Expeditions to read the report.
7. A last tip on the map explains what comes next. Tap it to close the tutorial.

**Skip it:** on Debug, tap **Skip tutorial**. **Reset save data** starts it again.

### Map and spawns

1. Open the **Map** tab. It centres on you and follows you. The 🧙 marker is you.
2. Markers are spawns. Each one gives 1–2 per tap, and each kind is visible from a different distance:
   - Wood (trees): 120 m.
   - Ore: 500 m. Only ore your pickaxe can mine is shown: stone needs the wooden pickaxe, copper the stone pickaxe, iron the copper pickaxe, coal the iron pickaxe.
   - Animals (🐇 🦌 🐗): 150 m. Animals wander.
   - Herbs (🌿 🫐 🍄): 50 m.
   - **Where they appear:** on footpaths, tracks, streets up to secondary roads, piers, pedestrian squares, parks and playgrounds. Never on motorways, trunk or primary roads, private driveways or gardens, indoors, in tunnels or in water.
     - The rules are in `src/content/walkable.ts`.
     - Placement reads OpenFreeMap's map data, so every phone puts a spawn in the same place.
     - Offline, spawns keep their generated position instead.
3. **Test without walking:** on Debug, turn on **Mock location**. Then use the N/S/E/W buttons, or tap the map to teleport.
4. **Determinism:** two phones at the same place, in the same time window, see the same spawns.
5. **Time of day:** on Debug, change **Time of day**. Deer get more common at dawn and dusk, coal and boars at night.
6. **Refresh:** set **Spawn refresh window** to 1 min to see spawns change quickly.

### Gathering

1. Move within **30 m** of a marker. It grows and turns yellow.
2. Tap it. A banner shows what you gathered, and the spawn disappears until its window refreshes.
3. Tap a marker that's further away and you'll get "Too far: N m away".
4. Animals show 💨 and can't be gathered when you move faster than about 18 km/h. Try this on a bike or in a car, not in mock mode.

### Inventory, forge and alchemy

1. **Inventory** lists gold, materials, gear (with durability) and consumables.
2. To skip the walking, on Debug tap **+10 of every material**.
3. **Forge** lists the recipes you know, showing what you have against what's needed, e.g. `🪨 3/4`. Locked recipes are hidden.
   - The button is only active when you have every input. Pickaxes are crafted once and then show **Owned**.
   - Tiers go wood → stone → copper → iron → steel. Only the **Wooden sword** is known at first. Each tier's bow, wand and armour drop in that tier's dungeons.
   - Each tier boss drops a pickaxe that opens the next tier: the wooden pickaxe mines stone and teaches the stone sword, the stone pickaxe mines copper and teaches the copper sword, and so on.
   - The iron pickaxe mines coal and teaches **Steel ingot** smelting (2 iron + 1 coal). Steel has no map nodes. The steel pickaxe is the final boss's trophy.
4. **Alchemy** brews potions and rations. Step chests can teach the fire resistance elixir.

### Team

1. **Team** shows Bram (warrior), Lyra (archer) and Mira (fire mage), with level, XP and stats.
2. Tap **Change** on a slot to equip gear or a consumable.
   - Stats update straight away.
   - Class affinities apply: swords boost Bram, bows boost Lyra, wands boost Mira.

### Expeditions

1. **Expeditions:** pick the party, then tap **Send** on a dungeon. Each dungeon shows the party's estimated chance of beating its boss, with a band: Risky below 40%, Fair from 40 to 75%, Safe at 75% or more. The estimate comes from simulating 100 runs and updates as you change the party or its gear.
   - **How a run works:** it is a series of encounters: fights, traps, a healing spring, a hidden cache or an ambush. The boss always comes last. Heroes lose HP as they go and are knocked out at 0. The run ends when the boss falls or the whole party is down.
   - **What stats do:** damage is attack + magic, defense reduces the damage taken, and HP is each hero's buffer. Enemies aim at warriors more often. Gear gives most of a hero's power; levels add only a little.
   - **Luck:** each run has a good or bad day (±25% damage dealt and taken), and a 3% chance of a mishap, such as a cave-in, that ends it early. Only the tutorial run is certain.
   - **Consumables:** a healing potion is drunk automatically below 35% HP and heals to full; it goes back to your stock if nobody needed it. A ration heals before the boss fight. A fire resistance elixir protects its hero from fire damage for the whole run. Mira resists fire anyway.
2. There are 5 tiers of 3 dungeons. Only tier 1 shows at first; a tier appears once the previous tier's boss (its third dungeon) has been beaten.

   | Tier | Dungeons (boss last) | Durations |
   |---|---|---|
   | 1 | Rat Cellar, Goblin Warren, Bandit Stockade | 5 min, 15 min, 30 min |
   | 2 | Wolf Den, Troll Bridge, Ogre Quarry | 10 min, 30 min, 1 h |
   | 3 | Haunted Mine, Cinder Hollow 🔥, Drowned Crypt | 20 min, 45 min, 1 h 30 |
   | 4 | Harpy Cliffs, Orc Warcamp, Giant's Hall | 30 min, 1 h, 2 h |
   | 5 | Wyvern Peaks, Ashen Citadel 🔥, Dragon's Lair 🔥 | 45 min, 1 h 30, 3 h |

   🔥 = fire hazard: fire resistance elixirs help, and Mira is immune.
3. **Skip ahead:** on Debug, **Beat next boss** reveals the next tier, and **Grant next pickaxe** crafts the next pickaxe.

4. Heroes who are away can't be re-equipped.
5. **Shorter timers:** on Debug, turn on **Fast expeditions** (minutes become seconds), or tap **Finish all expeditions now**.
6. When an expedition ends:
   - You get a notification, even if the app is closed.
   - A report appears with the outcome, the encounters cleared, gold, loot, any recipe, XP, each hero's HP and a log of one line per encounter.
   - **Outcomes:** Flawless (boss beaten, nobody knocked out), Success (boss beaten), Retreat (some encounters cleared), Defeat (the party fell at the first encounter).
   - **Rewards on a retreat:** gold, loot and XP scale with the share of encounters cleared. Recipes and unlocking the next tier need the boss beaten.
   - The tab shows a badge until you've read it.
7. **Closed-app check:** send a 5-minute expedition, close the app completely, wait, then reopen it. The result is resolved on launch.
8. Gear wears down on each expedition and breaks at 0 durability.

### Sanctums, elements and main rewards

1. **Main rewards:** a successful expedition may bring back one extra reward (a gold pouch, Sanctum Sigil, treasure map or lure), listed in its report.
   - Chances: 30% for a tier's first dungeon, 75% for the second, and 100% plus a 50% second roll for the boss.
   - The first win at the Bandit Stockade always gives a Sigil, and so does the next success after 10 in a row without one.
   - You can hold 3 Sigils and 3 maps; any more become gold pouches.
2. **Sanctums:** five elemental places on the map, shown from 4.5 km away, greyed out with a 🔒 when you hold no Sigil. Zoom out to spot far ones.
   - Tap one for its guardian, a Sigil-tier choice, your heroes at home and the estimated odds.
   - Within 50 m, challenge it once. Win or lose, the Sigil is spent and that Sanctum closes for you until it refreshes (every 24 h).
   - The fight plays out line by line, then pays shards or stones of its element.
3. **Elements:** fire beats grass, grass beats stone, stone beats electric, electric beats water, and water beats fire.
   - A weapon deals ×1.5 against the element it beats and ×0.75 against the one that beats it.
   - Armour halves damage from its own element.
   - 10 shards merge into a stone.
4. **Infuse:** Forge → **Infuse** tab. Use a stone on a plain weapon or armour to give it that element, e.g. "Fire Wooden sword". Each piece can be infused once. Recycling an infused piece destroys it and gives 1 shard back.
5. **Treasure maps:** Inventory → **Read** marks a 💰 300–1,500 m away on your map. Walk there and tap it within 30 m. Maps expire 48 h after they drop.
6. **Lures:** Inventory → **Activate**. For 30 minutes extra herbs and animals appear around you, and a timer shows on the map.
7. **Debug:** add Sigils by tier, shards or stones by element, maps and lures; place a Sanctum next to you; reset used Sanctums and the Sigil pity; force the next main reward.

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
| Spawns take a moment to appear | The map data for your area is downloading (up to about 1 MB per tile in dense cities). It's cached for the session. |
| "Finding you…" never ends | Go outside or near a window. Readings worse than 40 m accuracy are ignored. You can also use Mock location. |
| Native changes don't show up | Rebuild with `npx expo run:android --device`. |
| Build is in a weird state | `npx expo prebuild --clean --platform android`, then rebuild. This regenerates `android/`. |
