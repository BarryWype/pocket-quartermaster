# Expedition screens: mockup

Designed 2026-11-08 (design canvas: "Expeditions and party mockups"). These are the canvas boards as HTML, phone size (390 wide). They are a reference for layout, wording and states, not code to copy: build them with the app's own components (`ParchmentCard`, `WoodButton`, `EmberButton`, `ItemSlot`, `FamilyTag`, the `ui` palette in `src/theme.ts`).

| Board | What it shows |
|---|---|
| `Main.dc.html` | The expedition list as pinned notices on a wooden board: name, difficulty pips, duration, needs as gem sockets, rewards, a readiness stamp (READY, NEEDS GEAR, NO VENOM). No heroes, no odds. Tabs: Places, Out now, Jobs. |
| `Party-empty.dc.html` | The party dialog with nobody picked: "This place needs" sockets (dashed, faded), "Party families" empty, three empty hero plates, Suggest a party, the odds medallion showing "?", Send disabled. |
| `Party-filled.dc.html` | Three heroes in: Wild sockets lit, Watch socket red with a hint, family banners with tag count and three pips, hero plates with portrait and three gear slots each with a family gem in the corner, the swap-worthy slot glowing, odds 58%, Send. |
| `Gear-picker.dc.html` | Tapping Lyra's off-hand: a slot grid of off-hands (▲ covers a need, "worn" marks the current one, another hero's item dimmed with their name), then a detail card for the selected item: family, "lights the Darkness gem", stat changes, family count change, odds before → after, and "Equip on Lyra". |
| `Hero-picker.dc.html` | Picking the third hero: portrait grid (▲ covers a need; busy or injured heroes greyed with "hurt 2 h" or "out 40 m"), a detail card for the selected hero (class and gear with family gems, what they light, odds before → after), "Add Sela". |

## Images in the boards
The boards load the game's own icons and font from the canvas (`/_blob/<id>`). Mapping to repo assets:

| Blob id | Asset |
|---|---|
| b832aa39943fd83d650a4a3571bdc3aa | assets/fonts/FantaisieArtistique.ttf |
| 1578086010507f494351178e576649a6 | icons/abilities-scaled/holy-star.png (Faith) |
| de06f428570b66d4fdca11832bf05d1f | icons/abilities-scaled/bull-head.png (Wild) |
| 54f843edb151fef0987493404b4bf829 | icons/abilities-scaled/stone-tower.png (Watch) |
| d09a5887c91646b5871a8ccf399f2e21 | icons/abilities-scaled/poison-net.png (Venom) |
| cde2d257f6e7e7b7e40af5b0a933dbf0 | icons/abilities-scaled/ice-shield.png (Warding) |
| dc931e874462d9cc66212a90134cb4b3 | icons/abilities-scaled/bronze-shield.png (Bulwark) |
| 60ec4706c5d8ec36f6065582c0966650 | icons/abilities-scaled/crossed-daggers.png (Shadow) |
| e45d7c3b4da053f6a16c4251adb542e1 | icons/abilities-scaled/arrow-strike.png (Volley) |
| c9cd1eb1d178b6c493e5781c07bbd2d1 | icons/rpg/helmet-great-helm.png (Warrior) |
| ba19eb305a3e41c10b08356633737a9f | icons/relics/book-holy-blue.png (Cleric) |
| affa2c1506f6684afb88ea8cd7f25d64 | icons/rpg/helmet-green-hood.png (Ranger) |
| 9d7336702c3b37b7c5a0a2bb28ea47c1 | icons/relics/horn-gold-tipped.png (Scout) |
| 83f091c3f125d345175ae3a9c88e026d | icons/rpg/shield-knight-crest.png (Paladin) |
| 654f7aeaaef7fe350874ff0643eec7ae | icons/rpg/helmet-red-wizard-hat.png (Fire mage) |
| 056250f69597de09ea3cb7570b804471 | icons/rpg/spear-iron.png |
| 0e5ea503bb5734d64123dfd272911123 | icons/rpg/armor-leather-vest.png |
| d4bedb700dc5a1e581f9f2042fbe0678 | icons/rpg/shield-round-wooden.png |
| 462bde7c21a74c57f6964cf1bde0f483 | icons/relics/censer-iron-smoking.png |
| 1d2db23118d29a052fb803df00d6f062 | icons/rpg/armor-chainmail.png |
| a3651caec11774f56c528367d3253298 | icons/rpg/bow-short-wooden.png |
| a4c641b527d3f10c08d06fdff1df3375 | icons/rpg/crossbow-light-wooden.png (quiver) |
| e4c18b49c91f1ffc48422e824cd36252 | icons/rpg/book-leather.png (tome) |
| 620833573552122abfecb7dae3971119 | icons/magic/orb-teal.png (focus) |
| efe2c6eda4c4e9ad6298c8dc01317e42 | icons/rpg/shield-wooden-buckler.png |

Numbers in the boards (odds, levels, HP) are examples.
