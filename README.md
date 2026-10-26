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

On first launch, allow **location** and **physical activity**. Notification permission is asked when you send your first expedition.

The **🐞 Debug** screen lets you test everything from your desk. It's always there in development builds; in a release build, turn it on in ⚙️ Settings → Developer → **Debug tools** (turning it off resets every debug option).

### Tutorial

A fresh save walks you through the whole loop in a few minutes. A one-line 🧭 hint at the top of each screen says what to do next, and the menu button you need lights up.

1. **Gather:** only wood shows on the map, plus one guaranteed tree about 10 m from you, even indoors. Tap it for 3 wood.
2. **Forge:** Craft → Forge has a single recipe, the **Wooden sword**. Make it. Animals and herbs start appearing on the map.
3. **Equip:** in Team, give the sword to a hero (Bram the warrior suits it best).
4. **Send:** in Expeditions, only the Rat Cellar can be picked. It shows its real odds, but this first trip always succeeds and takes about 5 seconds. Tap it under "Under way" to watch its progress bar.
   - It pays a little gold, the **wooden bow** blueprint and a tier 1 **Sanctum Sigil**. The Sigil is a lucky extra: it doesn't replace the one guaranteed by the first Bandit Stockade win.
5. **Explore:** animals and herbs have been on the map since the sword was forged; gather some while the team is away.
6. **Read:** when they're back, open Expeditions to read the report.
7. **Find a Sanctum:** back on the map, a tip says you got lucky with the Sigil and asks you to look for a Sanctum (zoom out to see farther). Sanctums can be up to 4.5 km away; place one next to you from Debug to test at your desk.
8. **Sanctum tip:** tapping a Sanctum shows how it works (walk within 50 m, spend a Sigil, one try, shards for infusing). Tap the tip to close it.
9. A last tip on the map explains what comes next. Tap it to close the tutorial.

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

### Quality, mastery and salvage

1. **Quality:** every forged weapon or armour piece is Crappy (×0.85 stats, grey), Normal (×1, ink), Rare (×1.15, blue) or Legendary (×1.3, gold). Names read e.g. "Rare Fire Stone sword"; Normal is left out.
2. **Mastery:** swords, bows, wands and armour each have a level, shown under each recipe in the Forge with the quality odds.
   - Each material tier caps it: wood 4, stone 6, copper 8, iron 10, steel 12. Forging an item whose cap you've reached gives no progress, so the Forge tells you to move to the next tier.
   - Forges per level: 3 up to level 6, then 4. That's about 30 min of walking to max wood swords, 50 min for stone, 1.5 h copper, 3 h iron and 5 h steel (simulated walks).
   - The closer you are to the item's cap, the better the odds: 3+ levels below is 80% Crappy; maxed is 10–12% Crappy, 75% Normal, 12% Rare and 1–3% Legendary.
3. **Salvage:** Inventory → **Salvage** on gear nobody is wearing. You get back 25% / 40% / 60% / 100% of the recipe (by quality, at least 1 of the first input), 5 shards if infused, and for a Legendary piece 1 shard per tier of a random element. Rare, Legendary and infused pieces ask first.
4. **Debug → Forging:** set each mastery level, force the next forge's quality, or add any gear piece with a quality and element.

### Inventory, forge and alchemy

1. **Inventory** lists gold, materials, gear (in its quality colour, with its stats) and consumables. Gear that isn't worn can be **salvaged** (see below).
2. To skip the walking, on Debug tap **+10 of every material**.
3. **Forge** lists the recipes you know, showing what you have against what's needed, e.g. `🪨 3/4`. Locked recipes are hidden.
   - The button is only active when you have every input. Pickaxes are crafted once and then show **Owned**.
   - Tiers go wood → stone → copper → iron → steel. Only the **Wooden sword** is known at first. Each tier's bow, wand and armour drop in that tier's dungeons.
   - Each tier boss drops a pickaxe that opens the next tier: the wooden pickaxe mines stone and teaches the stone sword, the stone pickaxe mines copper and teaches the copper sword, and so on.
   - The iron pickaxe mines coal and teaches **Steel ingot** smelting (2 iron + 1 coal). Steel has no map nodes. The steel pickaxe is the final boss's trophy.
4. **Alchemy** brews potions and rations. Step chests can teach the fire resistance elixir.

### Team

1. **Team** shows Bram (warrior, Tough), Lyra (ranger, Lucky) and Mira (fire mage, Quick learner), with level, XP, trait and stats. Up to 3 heroes go on each expedition; the roster holds 6.
2. Tap **Change** on a slot to equip gear or a consumable.
   - Stats update straight away.
   - Class affinities apply: swords boost Bram, bows boost Lyra, wands boost Mira.

### Expeditions

1. **Expeditions:** pick the party, then tap **Send** on a dungeon. Each dungeon shows the party's estimated chance of beating its boss, with a band: Risky below 40%, Fair from 40 to 75%, Safe at 75% or more. The estimate comes from simulating 100 runs and updates as you change the party or its gear.
   - **How a run works:** it is a series of encounters: fights, traps, a healing spring, a hidden cache or an ambush. The boss always comes last. Heroes lose HP as they go and are knocked out at 0. The run ends when the boss falls or the whole party is down.
   - **What stats do:** damage is attack + magic, defense reduces the damage taken, and HP is each hero's buffer. Enemies aim at warriors more often. Gear gives most of a hero's power; levels add only a little.
   - **Luck:** each run has a good or bad day (±25% damage dealt and taken), and a 3% chance of a mishap, such as a cave-in, that ends it early. Only the tutorial run is certain.
   - **Consumables:** a healing potion is drunk automatically below 35% HP and heals to full; it goes back to your stock if nobody needed it. A ration heals before the boss fight. A fire resistance elixir protects its hero from fire damage for the whole run. Mira resists fire anyway.
2. **Tiers and the daily rotation:** 5 tiers, one per gear material. Only tier 1 shows at first; a tier appears once the previous tier's boss has been beaten.
   - Each tier has a fixed **boss** dungeon, always open, plus a pool of 3 **short** and 3 **long** dungeons. Each day one short and one long are open per tier.
   - The rotation is the same for every player and changes at 00:00 UTC (countdown on the Expeditions screen). A slot never repeats the previous day's dungeon, and the two open dungeons of a tier never share their main tag.
   - Expeditions already under way keep their dungeon when the rotation changes. The Rat Cellar stays open until the tutorial is done.
   - **Daily modifiers:** on about 60% of days, one dungeon per tier gets a modifier that fits its tags: Restless dead (more undead), Flooded (water enemies), Booby-trapped (more traps), Rich veins (+30% materials), Bounty (+30% gold) or Pack hunt (more beasts).
   - **First clear:** the first win in each pool dungeon pays a one-time bonus (its top gold reward and half its XP). Dungeons never cleared are marked ✨.

   | Tier | Short | Long | Boss |
   |---|---|---|---|
   | 1 | Rat Cellar, Spider Burrow, Old Graveyard | Goblin Warren, Collapsed Mill, Smugglers’ Cove | Bandit Stockade |
   | 2 | Wolf Den, Barrow Mounds, Boar Thicket | Troll Bridge, Sunken Ford, Abandoned Watchtower | Ogre Quarry |
   | 3 | Haunted Mine, Fungal Grotto, Storm Ridge | Cinder Hollow 🔥, Collapsed Dwarfhold, Marsh Witch Hut | Drowned Crypt |
   | 4 | Harpy Cliffs, Thunder Plateau, Bone Field | Orc Warcamp, Clockwork Vault, Frozen Lake | Giant's Hall |
   | 5 | Wyvern Peaks, Ossuary of Kings, Stormcaller Isle | Ashen Citadel 🔥, Abyssal Depths, Titan Ruins | Dragon's Lair 🔥 |

   🔥 = fire hazard: fire resistance elixirs help, and Mira is immune.
3. **Tags and counters:** each dungeon card shows its main tags: 💀 Undead, 🐺 Beasts, ⚙️ Traps, 🪨 Obstacles, 🧑 Locals and elements. Heroes' abilities counter them:
   - **Bram (warrior)** shoulders rubble aside. **Lyra (ranger)** halves trap damage for the party and deals +50% to beasts. **Mira (fire mage)** burns barricades; so does anyone with a fire-infused weapon.
   - **Obstacles** (rubble, barricades, locked doors) are free for a hero who can solve them; otherwise everyone loses 6% HP and there's a 35% chance of a detour fight. Locked doors have no solver yet.
   - **Locals** (toll troll, wandering hermit, pedlar, lost miner, poachers' camp) ignore the party unless someone can charm, provoke or pickpocket them; no current class can.
   - Tap a dungeon to highlight it: heroes who counter it get a **Good here** badge; tap the badge to see why. Every ability that triggers gets a line in the report.
4. **Skip ahead:** on Debug, **Beat next boss** reveals the next tier, and **Grant next pickaxe** crafts the next pickaxe.

5. Heroes who are away can't be re-equipped.
6. **Shorter timers:** on Debug, turn on **Fast expeditions** (minutes become seconds), or tap **Finish all expeditions now**.
7. When an expedition ends:
   - You get a notification, even if the app is closed (see **Notifications** below).
   - A report appears with the outcome, the encounters cleared, gold, loot, any recipe, XP, each hero's HP and a log of one line per encounter.
   - **Outcomes:** Flawless (boss beaten, nobody knocked out), Success (boss beaten), Retreat (some encounters cleared), Defeat (the party fell at the first encounter).
   - **Rewards on a retreat:** gold, loot and XP scale with the share of encounters cleared. Recipes and unlocking the next tier need the boss beaten.
   - The tab shows a badge until you've read it.
8. **Closed-app check:** send a 5-minute expedition, close the app completely, wait, then reopen it. The result is resolved on launch.
9. **Debug → Dungeon rotation:** shift the rotation day back or forward, force a dungeon into a tier's short or long slot, force or clear a tier's modifier, and reset first-clear bonuses.

### Taverns, classes and traits

1. **Taverns** 🍺 sit in fixed places on the map (1–2 per ~5 km tile), visible from 4.5 km. They open once the Bandit Stockade is beaten; a tip on the map says so.
2. Within 50 m, tap one to see its **3 recruits** for the day (they change at 00:00 UTC with the dungeon rotation): class, name, level, trait, abilities and price.
   - About 60% common classes (warrior, ranger, fire mage, frost mage) and 40% uncommon (thief, barbarian, cleric, paladin, druid, troubadour, sorcerer).
   - **Level:** the roster's average level minus 1.
   - **Price:** base (80 common, 180 uncommon) × (1 + 25% per level above 1) × (1 + 35% per hero beyond 3) × trait (×1.15 positive, ×0.75 negative).
   - A recruited offer is gone until the next day. You can't recruit with a full roster (6).
3. **Classes** only use their own weapon types (armour is open to all): axes, maces, daggers, staves and lutes are new. Recruiting the first hero who uses a type teaches its recipes up to your highest tier, with mastery starting at the previous tier's cap; later tiers drop from dungeons.
   - Fire mages attack with fire, frost mages with water, druids with grass, unless their weapon is infused.
   - Thieves disarm traps, pick locks and pockets and find more in caches. Barbarians clear rubble, provoke locals and rage when hurt. Clerics heal the party between encounters; paladins shield the most hurt ally; both hit the undead hard. Druids calm beasts. Troubadours charm locals and lift the party's damage. Sorcerers get more from elemental advantage.
4. **Traits:** every hero has one. Positive: Tough, Thrifty, Lucky, Quick learner, Light sleeper, Iron stomach. Negative: Clumsy, Greedy, Coward, Loud. Party-wide ones (gold, traps, locals, ambushes) count once per trait.
5. **Dismiss** a hero from their page; their gear and consumable return to the inventory. Not while they're away, and not your last hero.
6. **Debug → Taverns and heroes:** place a tavern next to you, roll new offers, add a hero of any class, trait and level, and add gold.

### Guild Hall

1. **Guild** in the island menu opens it from anywhere, once the Bandit Stockade is beaten (taverns open at the same time). It spends gold on upgrades that speed up the economy and unlock features; it never raises hero stats.
2. Three buildings: **🗺️ War room** (Hero XP, Faster expeditions, Better retreats, Scouting report, ⭐ Extra party slot), **💰 Treasury** (Gold, Main rewards, Shards, Step chests, ⭐ Sigil cap) and **🛏️ Barracks** (Tavern discount, Extra tavern offer, Training, ⭐ Roster slots 7 and 8).
   - Rank cost = base × 1.8^(rank − 1). Rank 1 opens with the hall, rank 2 needs it too, rank 3 the tier 2 boss (+15 stone), rank 4 the tier 3 boss (+10 copper).
   - ⭐ Milestones also cost a **charter** 📜: one for the first win against each tier boss, and a 10% chance per Sanctum win. They ask for confirmation. Nothing is refunded.
   - **Training** gives heroes at home XP per hour, credited when you open or return to the app (up to 24 h at a time).
   - **Scouting report** adds a **Tomorrow** button on Expeditions, showing the next day's dungeons and modifiers.
3. All tracks, costs, gates and materials are in `src/content/guild.ts`. `src/game/balance/economy.ts` models the gold economy; its test checks that the Gold and Main rewards ranks pay back in 3–7 days.
4. **Debug → Guild Hall:** add charters, set any track's rank, reset the hall (and +1,000 gold further down).

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
4. **Infuse:** Forge → **Infuse** tab. Use a stone on a plain weapon or armour to give it that element, e.g. "Fire Wooden sword". Each piece can be infused once. Salvaging an infused piece gives 5 shards of its element back.
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

### Notifications

The ⚙️ button on the map opens **Settings**: a master switch, one switch per notification type and quiet hours.

| Type | When | Default |
| --- | --- | --- |
| Expedition finished | A team is back, with the outcome. Teams back within 2 minutes share one notification. | On |
| Big result | Same, highlighted for a boss victory, a blueprint or a Sanctum Sigil. | On |
| Heroes idle | 4 h with nobody on an expedition. One reminder, moved whenever a team leaves or returns. | Off |
| Step chest unlocked | Today's steps open a chest. | On |
| Close to the next chest | Within 1,000 steps of the next chest, once per chest per day. | On |
| Daily reset | Midnight: new step chests. | Off |

- **Quiet hours** (22:00–08:00 by default) hold notifications until they end. **Allow expedition results during quiet hours** lets results through.
- If notifications are blocked, Settings says so and links to the system settings.
- Android has one channel per group (Expeditions & heroes, Steps & daily goals), also adjustable in the system settings.
- **What works with the app closed:** expedition results, the idle reminder and the daily reset are scheduled ahead, so they arrive with the app closed. Expedition outcomes are worked out when the team leaves.
- **What needs the app:** step alerts. Expo can't count steps in the background on Android, and iOS has no reliable background trigger without an extra native module. Steps are checked when the app opens, comes back to the foreground, and while it's open.
- **Debug → Notifications** sends one of each type now, ignoring settings and quiet hours. To test the real flow, turn on **Fast expeditions**, send a team, close the app and wait. For step alerts, use **+1,000** / **+5,000** steps.

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

### Balance lab

Plays 30 days with a bot for each player profile and writes `report.html`, `summary.json` and CSVs to `sim-output/<timestamp>/`. The first run measures walk yields and caches them in `sim-output/.cache/`.

```bash
npm run sim -- --profile all --days 30
```

Try a number without editing files, and compare with an earlier run:

```bash
npm run sim -- --set guild.gold.baseCost=80 --compare sim-output/<earlier>/summary.json
```

Profiles, bot settings and targets live in `src/game/sim/config.ts` and `src/game/sim/targets.ts`. `npm run sim -- --help` lists the options.

---

## 7. Releases

A GitHub Actions workflow (`.github/workflows/release.yml`) builds a signed release APK and attaches it to a GitHub release whenever a `v*` tag is pushed.

**One-time setup**

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

**Releasing**

```bash
git tag v0.2.0 && git push origin v0.2.0
```

About 15 minutes later the release page has `pocket-quartermaster-v0.2.0.apk`. The workflow runs the typecheck and tests first. The version shown in the app comes from the tag; the Android version code is the workflow run number, so each APK installs over the previous one.

- Release builds are signed by `plugins/withReleaseSigning.js` when the `PQ_RELEASE_*` Gradle properties are set, and with the debug key otherwise. Versions come from `app.config.js` (`APP_VERSION`, `ANDROID_VERSION_CODE`).
- The first release-signed APK can't install over a debug-signed one: uninstall it first (this loses that phone's save).
- On the phone, open the release page, download the APK and allow installing apps from the browser.

## 8. Project structure

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
- **Animated foliage:** bushes and trees are scattered on open ground (`src/game/generation/foliage.ts`, drawn by `src/components/MapFoliage.tsx`). They skip roads, water, buildings and residential areas, and trees are more common in woods and parks. Each plant has 4 sway frames played at 4 fps, which pause when the app is in the background or the phone's reduce-motion setting is on. The placeholder sprites in `assets/sprites/` come from `scripts/generate-foliage-sprites.py`. Replace them with real art under the same names (`bush-0…3`, `tree-0…3`, with `@2x`/`@3x` versions), then rebuild the development app.
- **Menu and font:** the floating menu on the map is `src/components/IslandMenu.tsx`; add a crafting station to its `CRAFT_LINKS` to list it under Craft. Shared colours and the font name are in `src/theme.ts`. The font, [Fantaisie Artistique](https://www.1001fonts.com/fantaisieartistique-font.html), is loaded from `assets/fonts/FantaisieArtistique.ttf`. Use `Text` and `Button` from `src/components/` instead of the React Native ones so it applies.

---

## 9. Troubleshooting

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
