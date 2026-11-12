# Testing guide

A tour of every system, with the Debug screen shortcuts to test it from your desk. Setup is in the [README](../README.md).

On first launch, allow **location** and **physical activity**. Notification permission is asked when you send your first expedition.

The **🐞 Debug** screen lets you test everything from your desk. It's always there in development builds; in a release build, turn it on in ⚙️ Settings → Developer → **Debug tools** (turning it off resets every debug option).

## Tutorial

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

## Map and spawns

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

## Gathering

1. Move within **30 m** of a marker. It grows and turns yellow.
2. Tap it. A banner shows what you gathered, and the spawn disappears until its window refreshes.
3. Tap a marker that's further away and you'll get "Too far: N m away".
4. Animals show 💨 and can't be gathered when you move faster than about 18 km/h. Try this on a bike or in a car, not in mock mode.

## Rarity, affixes, forge and salvage

1. **Rarity:** every piece is Common (ink), Uncommon (green, 1 affix), Rare (blue, 2), or Legendary (gold, 3 plus a unique effect). Stats roll in a range (about ×0.80–1.38 of the base, 3d6; +1 on the dice for Rare, +2 for Legendary). Each affix shows as one line with its value, e.g. "Hunter: +22% damage to beasts".
2. **Forge:** pick a blueprint, then optionally one ingredient (a monster part or a component that fits the piece). Without one the piece is Common; with one it is Uncommon with that affix. The confirmation shows the stat ranges, the rarity and the cost.
3. **Rework (forge page):** an elemental stone adds its affix to a Common piece (it becomes Uncommon) or replaces one affix at random; a reroll changes all affixes of an Uncommon-or-better piece for its tier material and gold, rising with each reroll. Both ask first.
4. **Salvage:** Inventory → **Salvage** on gear nobody is wearing. You get back 40% / 50% / 60% / 100% of the recipe by rarity (at least 1 of the first input); a piece with a keyword affix has a 50% chance to return its component. Rare, Legendary, relic and affixed pieces ask first.
5. **Old saves:** pieces keep their stats as close as possible; components, infusions and Legendary Luck become affixes, held elemental hearts become stones.
6. **Debug → Forging:** force the next forge's rarity, or add any gear piece with a rarity.

## Inventory, forge and alchemy

1. **Inventory** lists gold, materials, gear (in its quality colour, with its stats) and consumables. Gear that isn't worn can be **salvaged** (see below).
2. To skip the walking, on Debug tap **+10 of every material**.
3. **Forge** lists the recipes you know, showing what you have against what's needed, e.g. `🪨 3/4`. Locked recipes are hidden.
   - The button is only active when you have every input. Pickaxes are crafted once and then show **Owned**.
   - Tiers go wood → stone → copper → iron → steel. Only the **Wooden sword** is known at first. Each tier's bow, wand and armour drop in that tier's dungeons.
   - Each tier boss drops a pickaxe that opens the next tier: the wooden pickaxe mines stone and teaches the stone sword, the stone pickaxe mines copper and teaches the copper sword, and so on.
   - The iron pickaxe mines coal and teaches **Steel ingot** smelting (2 iron + 1 coal). Steel has no map nodes. The steel pickaxe is the final boss's trophy.
4. **Alchemy** brews potions and rations. Step chests can teach the fire resistance elixir.

## Team

1. **Team** shows Bram (warrior, Tough), Lyra (ranger, Lucky) and Mira (fire mage, Quick learner), with level, XP, trait and stats. Up to 3 heroes go on each expedition; the roster holds 6, then 2 more for each of the first four tier bosses beaten (8, 10, 12, 14), plus the Barracks' extra slots.
2. Tap **Change** on a slot to equip gear or a consumable.
   - Stats update straight away.
   - Class affinities apply: swords boost Bram, bows boost Lyra, wands boost Mira.

## Expeditions

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

## Taverns, classes and traits

1. **Taverns** 🍺 sit in fixed places on the map (1–2 per ~5 km tile), visible from 4.5 km. They open once the Bandit Stockade is beaten; a tip on the map says so.
2. Within 50 m, tap one to see its **4 recruits** for the day (they change at 00:00 UTC with the dungeon rotation): class, name, level, trait, abilities and price.
   - Every class of the tier's pool weighs the same, a class that just opened 1.5×, a class you already have 0.3×: each class you lack shows about once a week at one tavern.
   - **Wanted this week:** a banner names the week's family; the first offer of every tavern is one of its classes. The family changes with the rotation week, the same for everyone.
   - **Level:** one under the roster's median level, never below the bottom of your tier band.
   - **Price:** base (80 common, 180 uncommon) × (1 + 25% per level above 1) × (1 + 35% per hero beyond 3) × trait (×1.15 positive, ×0.75 negative).
   - A recruited offer is gone until the next day. You can't recruit with a full roster.
3. **Classes** only use their own weapon types (armour is open to all): axes, maces, daggers, staves and lutes are new. Recruiting the first hero who uses a type teaches its recipes up to your highest tier; later tiers drop from dungeons.
   - Fire mages attack with fire, frost mages with water, druids with grass, unless their weapon is infused.
   - Thieves disarm traps, pick locks and pockets and find more in caches. Barbarians clear rubble, provoke locals and rage when hurt. Clerics heal the party between encounters; paladins shield the most hurt ally; both hit the undead hard. Druids calm beasts. Troubadours charm locals and lift the party's damage. Sorcerers get more from elemental advantage.
4. **Traits:** every hero has one. Positive: Tough, Thrifty, Lucky, Quick learner, Light sleeper, Iron stomach. Negative: Clumsy, Greedy, Coward, Loud. Party-wide ones (gold, traps, locals, ambushes) count once per trait.
5. **Dismiss** a hero from their page; their gear and consumable return to the inventory, and they leave a training manual (Common under level 6, Rare from 6, Legendary from 11; the dialog names it). Not while they're away, and not your last hero.
6. **Free recruit:** beating the Bandit Stockade the first time offers one free hero among three classes, each of a family your roster lacks. Pick one in that report, or later from Team; it waits while the roster is full.
7. **Catch-up:** a hero more than 2 levels under your best earns +50% XP from runs.
8. **Debug → Taverns and heroes:** place a tavern next to you, roll new offers, add a hero of any class, trait and level, and add gold.

## Guild Hall

1. **Guild** in the island menu opens it from anywhere, once the Bandit Stockade is beaten (taverns open at the same time). It spends gold on upgrades that speed up the economy and unlock features; it never raises hero stats.
2. Three buildings: **🗺️ War room** (Hero XP, Faster expeditions, Better retreats, Scouting report, ⭐ Extra party slot), **💰 Treasury** (Gold, Main rewards, Shards, Step chests, ⭐ Sigil cap) and **🛏️ Barracks** (Tavern discount, Extra tavern offer, Training, ⭐ Roster slots 7 and 8).
   - Rank cost = base × 1.8^(rank − 1). Rank 1 opens with the hall, rank 2 needs it too, rank 3 the tier 2 boss (+15 stone), rank 4 the tier 3 boss (+10 copper).
   - ⭐ Milestones also cost a **charter** 📜: one for the first win against each tier boss, and a 10% chance per Sanctum win. They ask for confirmation. Nothing is refunded.
   - **Training** gives heroes at home XP per hour, credited when you open or return to the app (up to 24 h at a time).
   - **Scouting report** adds a **Tomorrow** button on Expeditions, showing the next day's dungeons and modifiers.
3. All tracks, costs, gates and materials are in `src/content/guild.ts`. `src/game/balance/economy.ts` models the gold economy; its test checks that the Gold and Main rewards ranks pay back in 3–7 days.
4. **Debug → Guild Hall:** add charters, set any track's rank, reset the hall (and +1,000 gold further down).

## Sanctums, elements and main rewards

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

## Daily step chests

1. The top of **Inventory** shows today's steps and two chests:
   - Wooden chest: 5,000 steps.
   - Iron chest: 10,000 steps.
2. Each chest opens once per day.
3. On Debug, **+5,000** steps unlocks them without walking.
4. **Android limitation:** steps only count while the app is open. iOS reads the full day from the phone's history.

## Notifications

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

## Reset

On Debug, **Reset save data** starts over, after a confirmation.
