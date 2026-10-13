# Diablo Tiny Error — Game Plan (v4)

A browser-based action RPG for ages 9–10 that **plays like Diablo II** but is set
in a **Star Wars parody galaxy**. Every name is a **funny typo of the real
thing**: *Yedi Knights*, *Litesabers*, *the Forse*, *Darth Vapor*, *Tatoonie*.
The game has the full D2 skill trees, stats, items, acts, and difficulties. The
tone is exciting and can be a little scary, but it's never gory. It's isometric
3D, works on desktop, Chromebooks, and tablets, and is deployed to Vercel as a
static site.

> **Changes from v3:** the original-name setting is replaced by
> **funny-typo parody names** (§2a glossary).

> **Naming / IP note:** typo parody names are a *Spaceballs*-style parody
> posture. They're more recognizable than the original names were, but also
> closer to Lucasfilm/Disney trademarks. Parody is a common defense but not a
> guarantee, so the game should never use real logos, the official font, John
> Williams' music, or actual character likenesses, and it should stay
> free/non-commercial. **All names live in one locale file** (`data/names.ts`),
> so if there's ever a takedown request we can swap to neutral names in minutes.

---

## 1. Design pillars

1. **It's Diablo II.** Someone who knows D2 should feel at home: the class trees,
   5 stat points per level, attack rating vs. defense, resistances,
   magic/rare/set/unique loot, sockets, mercenaries, and 3 difficulties.
2. **It feels like Star Wars.** It has laser-sword duels, blaster fire,
   cantinas, droids, a scrappy Rebel Allowance against the Galactic Umpire, mystic powers,
   and every act on a different planet.
3. **Thrilling, not gory.** It can be scary, with dark cultists, shadowy
   wraiths, and big beasts. The target is roughly **ESRB E10+ / PEGI 7–12**,
   similar to *LEGO Star Wars*, the *Clone Wars* cartoon, and *Minecraft
   Dungeons*. There's no blood, no dismemberment, and no corpses.
4. **Modern quality-of-life, not dumbing-down.** We remove D2 *friction* (corpse
   runs, unidentified items, tiny fonts) and keep D2 *depth*.
5. **Runs anywhere.** It plays in a browser tab on a Chromebook or iPad at
   60 fps (30 fps minimum) with nothing to install, no accounts, and no data
   collection.

---

## 2. Tone & content rules

| Topic | Rule |
|---|---|
| Organic enemies | When defeated they **collapse into dark smoke** and leave a short-lived glowing "remnant" (used by skills like *Salvage*), which then fades. |
| Droids / machines | They **burst into sparks and scrap** that fades. Droids make up a large share of enemies, so combat can feel intense without anything being "hurt". |
| Hits | Colored impact sparks per damage type. Physical is white, plasma is orange, cryo is blue, storm is yellow, and toxin is green. There's no blood, and laser swords never dismember. |
| Scary is OK | Dark cultists, hooded shadow-wraiths, swamp horrors, giant insects, and creepy ruined temples. Bosses get dramatic intros and music. |
| Player death | "**Defeated**". A med-droyd revives you in a Bakta tank at base with all your gear. There's no corpse run. You lose some Creditz, and a small XP loss applies only on higher difficulties (like D2). |
| Language | Adventurous, with banter and light humor (droid sidekicks). No profanity, and dialogue is written for a 4th–5th grade reading level. |
| Safety | No chat, no UGC, no external links, no ads, no purchases, no identifying analytics (COPPA-friendly). |

### Story: "The Tiny Error"
The galaxy is held in balance by **the Forse**, a mystical energy that flows
through all living things. It is anchored by the ancient **Kybur Heart**, a
giant crystal in the hidden Yedi Temple. A young Padawon made a **tiny error**
(a typo!) while re-tuning the crystal. The resulting hairline crack woke
**The Error**, a dark presence that was sealed inside long ago. The Error
whispers to the **Syth**, who split into **three dark champions**. They spread
across the galaxy to build the **Deaf Star** for the **Galactic Umpire**.

The player is a hero of the **Rebel Allowance**. They follow the trail
planet by planet, defeat each champion, and then board the Deaf Star to face
**Emperor Palpitate**, the host of The Error. This mirrors D2's chase after the
Wanderer, the Prime Evils, and the Worldstone. The typo theme is a running
joke: the whole universe is "slightly misspelled" because of the Error.

---

## 2a. Name glossary (funny typos)

Names are stored in `data/names.ts` and are never hard-coded.

| Real | In-game | | Real | In-game |
|---|---|---|---|---|
| Jedi | **Yedi** | | Sith | **Syth** |
| Padawan | **Padawon** | | The Force | **The Forse** |
| Lightsaber | **Litesaber** | | Blaster | **Blastur** |
| Droid | **Droyd** | | Stormtrooper | **Normtrooper** |
| Rebel Alliance | **Rebel Allowance** | | Galactic Empire | **Galactic Umpire** |
| Death Star | **Deaf Star** | | Millennium Falcon | **Millennium Falcone** |
| Darth Vader | **Darth Vapor** | | Emperor Palpatine | **Emperor Palpitate** |
| Darth Maul | **Darth Mole** | | Count Dooku | **Count Dooky** |
| General Grievous | **General Grevious** | | Grand Moff Tarkin | **Grand Moff Tarkin't** |
| Yoda | **Master Yoduh** | | Jabba the Hutt | **Jabbo the Hutz** |
| Wookiee | **Wookie-Cookie** | | Ewoks | **Ewokz** |
| Jawas | **Jawwas** | | Tusken Raiders | **Tuskin Raiders** |
| Sarlacc | **Sarlack** | | Rancor | **Rankor** |
| Wampa | **Wompa** | | Bantha | **Banthaa** |
| Porg | **Porg** (already perfect) | | Holocron | **Holocrumb** |
| Kyber crystal | **Kybur crystal** | | Bacta | **Bakta** |
| Credits | **Creditz** | | Cantina | **Cantino** |
| Tatooine | **Tatoonie** | | Endor | **Endoor** |
| Dagobah | **Dagobaa** | | Kashyyyk | **Kashyyyyyk** |
| Mos Eisley | **Moss Easily** | | Sandcrawler | **Sandcrawlr** |
| AT-AT Walker | **AT-AT Walkur** | | "Roger, roger" | **"Rodger, rodger"** |

Writers' rules: one obvious typo per name, so it's still instantly
recognizable. Keep jokes kind (no bathroom humor beyond "Count Dooky"). NPCs
occasionally notice the typos ("Did that sign always say *Deaf* Star?").

---

## 3. Classes (3 at launch, D2-style trees)

The launch trio covers the classic roles: melee, ranged physical, and caster.

### Class rules (D2 rules, kept)
- **3 trees × 10 skills** per class, with skill tiers unlocking at character
  level **1 / 6 / 12 / 18 / 24 / 30**.
- **Prerequisites** and **synergies** follow D2. For example, Plasma Bolt
  boosts Plasma Orb, and Frozen Orb requires Ice Blast and Frost Nova.
- **1 skill point per level**, plus **quest rewards** (+1 skill ×3 across the
  acts).
- **Max 20 hard points** per skill, and **+skills from items** can go beyond 20.
- **Respec**: one free respec per difficulty, plus a craftable *Memory Wipe
  Chip* (from a protocol droyd) (Token of Absolution analog).
- An optional **"Build Guide" overlay** suggests a path. It's off by default
  and doesn't change any rules.

### Yedi Knight (Barbarian analog): Litesaber warrior
Trees: **Saber Forms**, **Masteries**, **Commands**.

| Tier | Saber Forms (Combat) | Masteries | Commands (Warcries) |
|---|---|---|---|
| 1 | Litesaber Strike *(Bash)* | Saber Mastery, Double-Litesaber Mastery, Vibro-Axe Mastery | Fear Roar *(Howl)*, Scavenge Stim *(Find Potion)* |
| 6 | Forse Leap *(Leap)*, Twin Strike *(Double Swing)* | Throwing Mastery, Pike Mastery | Provoke *(Taunt)*, Rally *(Shout)* |
| 12 | Stun Strike *(Stun)*, Twin Throw *(Double Throw)* | Endurance *(Inc. Stamina)* | Salvage *(Find Item)* |
| 18 | Leap Strike *(Leap Attack)*, Focus Strike *(Concentrate)* | Iron Will *(Iron Skin)* | Forse Roar *(Battle Cry)* |
| 24 | Saber Flurry *(Frenzy)* | Swift Step *(Inc. Speed)* | Battle Orders, Command Banner |
| 30 | **Saber Cyclone** *(Whirlwind)*, Overcharge *(Berserk)* | Forse Resilience *(Natural Res.)* | Shockwave *(War Cry)*, Battle Command |

### Bounty Huntur (Amazon analog): blastur & vibro-spear sharpshooter
Trees: **Blasters**, **Instincts**, **Spear & Arc**.

| Tier | Blasters (Bow) | Instincts (Passive & Magic) | Spear & Arc (Javelin) |
|---|---|---|---|
| 1 | Charged Shot, Plasma Shot | Scan Pulse *(Inner Sight)*, Precision *(Critical Strike)* | Vibro-Jab |
| 6 | Cryo Shot, Spread Shot *(Multishot)* | Dodge | Power Thrust, Toxin Dart |
| 12 | Burst Round *(Exploding Arrow)* | Deflector Field *(Slow Missiles)*, Avoid | Impale, Arc Javelin *(Lightning Bolt)* |
| 18 | Freeze Round, Seeker Round *(Guided Arrow)* | Armor Piercing *(Penetrate)* | Charged Thrust, Toxin Cloud |
| 24 | Rapid Fire *(Strafe)*, Incendiary Round | Holo-Decoy, Evade | Fend |
| 30 | **Cryo Burst** *(Freezing Arrow)* | **Battle Droyd** *(Valkyrie)*, Overpenetrate *(Pierce)* | Thunder Thrust, **Arc Fury** |

### Forse Adept (Sorceress analog): wielder of the Forse
Trees: **Plasma** (fire), **Storm** (lightning), **Cryo** (cold).

| Tier | Plasma | Storm | Cryo |
|---|---|---|---|
| 1 | Plasma Bolt, Inner Heat *(Warmth)* | Spark Bolts *(Charged Bolt)* | Ice Bolt, Frost Armor |
| 6 | Plasma Stream *(Inferno)* | Static Field, **Forse Pull** *(Telekinesis)* | Frost Nova, Ice Blast |
| 12 | Burning Trail *(Blaze)*, Plasma Orb *(Fire Ball)* | Storm Nova, Lightning | Shiver Armor |
| 18 | Plasma Wall, Empower *(Enchant)* | Chain Lightning, **Forse Blink** *(Teleport)* | Glacial Spike |
| 24 | **Starfall** *(Meteor)* | Storm Cloud *(Thunder Storm)*, Forse Shield *(Energy Shield)* | Blizzard, Chill Armor |
| 30 | Plasma Mastery, Blastur Turret *(Hydra)* | Storm Mastery | **Frozen Orb**, Cryo Mastery |

**Post-launch classes** (the data model supports them from day 1):
- **Guardian** (Paladin analog): auras and shield. A Yedi Guardian defender.
- **Beastmaster** (Druid analog): alien beast companions and shapeshifting.
- **Infiltrator** (Assassin analog): traps, cloaking, and martial arts.
- **Droydsmith** (Necromancer analog): builds droyd minions from **salvaged
  scrap**. This replaces corpse-raising and fits the no-corpse rule.

---

## 4. Character stats (D2 system, kept)

- **Strength / Dexterity / Vitality / Energy**, with class-specific starting
  values (Yedi Knight 30/20/25/10, Bounty Huntur 20/25/20/15, Forse Adept 10/25/10/35).
- **5 stat points per level**, plus **+5 from an Act III quest** (Lam Esen analog).
- Life, mana ("**Forse**" for the Forse Adept, "**Energy**" for the others), and
  stamina per level and per point vary by class, using D2-style values.
- **Item requirements** (Str/Dex/level) and Str/Dex damage bonuses per weapon type.
- **Attack Rating vs. Defense**, **Block**, and **Resistances**
  (plasma/cryo/storm/toxin, the D2 fire/cold/lightning/poison equivalents)
  with a per-difficulty penalty (−0 / −40 / −100), capped at 75%.
- Secondary stats: Increased Attack Speed, Faster Cast Rate, Faster Hit Recovery,
  Faster Run/Walk, Life/Energy steal, Crushing Blow, Deadly Strike, Salvage Find
  (Magic Find), Creditz Find, Cannot Be Frozen, and so on.
- **One deliberate deviation:** speed stats scale *continuously* rather than
  in D2's animation-frame breakpoints, which are opaque.
- Stats are never auto-assigned. An optional **"Suggested" hint** is available.

---

## 5. World & progression: one planet per act

**4 acts** × **3 difficulties: Normal / Veteran / Legend**. The level cap is
**75**.

| Act | Planet / setting | Hub (town) | Key areas (randomized layouts) | Quests | Champion boss |
|---|---|---|---|---|---|
| **I** | **Endoor**, a misty forest moon with Ewokz and ancient ruins | Rebel Allowance Outpost | Mossfields, Tuskin Den *(Den of Evil)*, Crash Site *(Burial Grounds)*, Standing Stones, Ewokz Village Ruins *(Tristram)*, Darkwood, Dagobaa Swamp, Old Comm Tower *(Forgotten Tower)*, Old Yedi Temple *(Monastery)*, Undercroft *(Catacombs)* | Clear the Den (+1 skill), Crash Site, Rescue Master Yoduh *(Cain)*, Comm Tower, Tools of the Trade (imbue), The Old Yedi Temple | **Count Dooky**, Syth Lord *(Andariel)* |
| **II** | **Tatoonie**, a twin-sun desert planet | Moss Easily Spaceport (with the Cantino, Jabbo's palace, and the hangar) | Dune Sea, Jundland Canyons, Far Oasis, Jawwa Sandcrawlr, Undercity *(Sewers)*, Jabbo's Palace, Hidden Holo-Archive *(Arcane Sanctuary)*, Seven Vaults *(Tombs)* | Undercity Rankor (+1 skill), Assemble the Star-Key *(Horadric Staff)*, Twin Suns Eclipse, Hidden Archive, The Archivist *(Summoner)*, Seven Vaults | **The Great Sarlack**, a giant pit beast *(Duriel)* |
| **III** | **Kashyyyyyk** (yes, extra y's), a giant-tree Wookie-Cookie jungle world | Treehouse Station | Wompa Forest, Great Swamp, Lurker Jungle, Lower/Upper Ruins, Temples, Syth Stronghold *(Travincal)*, The Deep Vault *(Durance)* | Golden Porg (+20 life), Ancient Litesaber *(Gidbinn)*, The Eye Relic *(Khalim's Will)*, **Lost Holocrumb (+5 stats)**, Blackened Temple, The Guardian | **The Syth Council** → **Darth Mole** *(Mephisto)* |
| **IV** | **The Deaf Star**, the Umpire's battle station orbiting a dying star | *Millennium Falcone* (docked in a hangar) | Docking Bay, Trash Compactorz, Reactor City, Plasma Trench, **Kybur Core** (3 seals, each guarded by **Darth Vapor**, General Grevious, and Grand Moff Tarkin't, like Chaos Sanctuary) | Fallen Yedi (+1 skill), Kybur Forge *(Hellforge)*, The Error's End | **Emperor Palpitate**, host of **The Error** |

**Kept from D2, reskinned:**
- **Waypoints** → **Holo-Beacons**.
- **Town Portal** → **Recall Beacon** (a consumable or a rechargeable module).
- **Gold** → **Creditz**.
- **Potions** → **Bakta stims** (life) and **Energy cells** (mana/rejuvenation).
- **Mercenaries** → **hirelings per act**: Rebel Allowance troopers (Act I, Rogue
  analog), Moss Easily guards with auras (Act II), Wookie-Cookie warriors (Act III), and
  battle droyds.
- **Monster packs** keep D2 champions and uniques with random modifiers:
  *Extra Fast*, *Plasma Enchanted*, *Cursed*, *Multishot*, *Storm Enchanted*,
  and so on.
- **The goblin + shaman revive mechanic** → **Jawwas** that
  repair and revive fallen **Battle Droydz**. It's the same "kill the healer first" lesson.

**Enemy families:** Normtroopers (famously bad aim, but they come in big
squads), Battle Droydz ("Rodger rodger"), Tuskin Raiders, Jawwas, Probe Droydz,
Wompas, Rankors, Syth cultists, Nightsistahs, swamp horrors, AT-AT Walkurs
(mini-boss), and Error-touched shadow-wraiths.

**Secret level:** the **Moo-n**, a moon full of armored space-Banthaas ("moo"). It's the
Cow Level analog.

---

## 6. Items & economy (D2 system)

- **Quality:** Inferior (grey) → Normal (white) → Magic (blue) → Rare (yellow)
  → Set (green) → Unique (gold). Crafted (orange) comes post-launch.
- **Base tiers:** Normal / Exceptional / Elite per base (e.g. Training Litesaber →
  Duelist Litesaber → Masterwork Litesaber).
- **Weapon classes (D2 mapping):**

  | Ours | D2 analog |
  |---|---|
  | Litesabers | Swords |
  | Double Litesabers | 2-handed swords |
  | Vibro-axes | Axes |
  | Shock batons | Maces |
  | Vibro-pikes | Polearms |
  | Throwing discs | Throwing weapons |
  | Javelins | Javelins |
  | Blastur pistols / rifles | Bows / crossbows |
  | Forse staffs and Kybur crystals | Staves and orbs |

- **Armor slots:** helmet, chest armor, gloves, utility belt, boots, energy
  shield (off-hand), 2 rings, amulet.
- **Affixes** are a D2-style prefix/suffix table with ilvl/alvl rules, plus
  **class-specific items** (Bounty Huntur blasturs, Forse Adept focus crystals, Yedi Knight
  helms) with +skills.
- **Sockets** hold **Kybur crystals** (gem analog, chipped → perfect) and
  **data-glyphs** (rune analog). **Glyphwords** (runewords) are in M8.
- **Droyd Workshop** (Horadric Cube analog) with basic recipes. Charms come
  post-launch.
- **Shared stash** across characters.
- **Kept with quality-of-life changes:**
  - Items auto-identify on pickup.
  - Inventory is a D2-style grid with item sizes, plus an auto-sort button.
  - Creditz are auto-picked up, and you can pick up stims straight into the
    belt.
  - Compare tooltips show green/red deltas, and there's a loot filter setting.

---

## 7. Controls & devices (tablets are a launch requirement)

| Input | Scheme |
|---|---|
| Mouse + keyboard | D2 classic: left-click move/attack, right-click skill, F1–F8 skill hotkeys, Tab map, Alt shows items, Shift stand-still, I/S/C/Q panels |
| Gamepad | Left stick move, face buttons are 4 skills plus primary attack, auto-target nearest (like D2R controller mode) |
| **Touch / tablet** | **Virtual joystick** (left) **or tap-to-move** (setting). The **skill wheel** (right) has 6 skill buttons plus stim buttons. **Tap enemy** to attack with soft auto-aim. **Long-press** shows a tooltip. **Drag-and-drop** inventory. Fixed zoom with 2 presets |

- UI is responsive: 16:9 laptop, 4:3 iPad, and phone landscape (best effort).
  Minimum touch target is 44 px.
- Tablet-specific handling covers iOS Safari audio unlock, fullscreen/PWA
  "Add to Home Screen", auto-pause on `visibilitychange`, and no scroll bounce.

---

## 8. Art & audio without an artist (approved: real-time 3D, isometric camera)

Low-poly 3D models are **rendered live with an orthographic isometric camera**.
This gives the D2/D2R camera angle, smooth rotation, real lighting, and
**equipment that shows on the character**. Litesabers get colored glowing
blades, and helmets and armor are visible. It uses free CC0 asset libraries.

### Asset sources (license must be CC0 or similar)
| Need | Source | License |
|---|---|---|
| Heroes (rigged, animated) | **Quaternius** Ultimate Animated Character / Sci-Fi packs, **KayKit** Adventurers (re-skinned with sci-fi gear) | CC0 |
| Droids, aliens, creatures | **Quaternius** Ultimate Space Kit / Monsters / Animated Robots, **KayKit** packs | CC0 |
| Environments (outposts, spaceport, ruins, ships) | **Kenney** Space Kit / Space Station Kit / Blaster Kit, **KayKit** Space Base, **Quaternius** Sci-Fi Essentials, nature and desert packs | CC0 |
| Weapons | Kenney Blaster Kit, Quaternius sci-fi guns. Litesaber blades are procedural glowing meshes | CC0 |
| Skill & item icons | **game-icons.net** (recolored SVGs) | CC BY 3.0 → `CREDITS.md` |
| UI frames / fonts | Kenney Sci-Fi UI; Google Fonts (e.g. Orbitron + Nunito) | CC0 / OFL |
| SFX (blaster, saber hum, droids) | Kenney Sci-Fi Sounds, OpenGameArt CC0, Sonniss GDC bundles, plus **procedurally synthesized** saber hum and blaster zaps (Web Audio) | CC0 / royalty-free |
| Music | OpenGameArt / freepd.com orchestral and sci-fi tracks | CC0 / CC BY |

- A unifying **toon shader + outline pass + per-planet color grading** makes
  mixed packs look like one game. **Bloom** gives Litesabers, blaster bolts, and
  Forse powers their glow.
- **Skill VFX are procedural.** A small toolkit (projectile/bolt, beam, nova,
  aoe-zone, aura, buff-glow, saber-trail) drives about 90 skills from data.
- **Every asset's license is tracked** in `assets/manifest.json` and generated
  into `CREDITS.md`.

---

## 9. Tech stack

| Concern | Choice |
|---|---|
| Language / build | **TypeScript + Vite**, static output |
| Rendering | **Three.js** with an orthographic iso camera, InstancedMesh for tiles and props, glTF/GLB models, KTX2/Draco compression |
| Animation | Three.js `AnimationMixer` with crossfades and bone attachments for gear |
| UI / HUD | **Preact + signals** DOM overlay. The life/mana orbs, belt, skill bar, panels, tooltips, and touch controls all live here because DOM is crisp, accessible, and responsive |
| Simulation | **Engine-agnostic TypeScript core** with a fixed 25 Hz tick (D2's rate, which makes formulas map directly) and interpolated rendering |
| Pathfinding / collision | Grid A* (subtile resolution like D2) and a spatial hash for entity collision/queries |
| Map generation | D2-style: **preset tiles** (handmade room chunks) stitched by generators per area type (maze, outdoor-with-paths, multi-level dungeon) |
| RNG | Seeded PRNG (map seed per game, separate loot stream) |
| Data | Typed TS data tables (classes, skills, monsters, items, affixes, uniques, sets, levels, treasure classes), mirroring D2's `.txt` tables |
| Save | IndexedDB (multiple characters + shared stash), versioned with migrations, plus export/import as a file |
| Audio | Howler.js (handles iOS unlock and codecs) |
| Tests | **Vitest** (formulas, loot, mapgen, skills), **Playwright** (boot, play-through smoke, touch emulation on an iPad viewport) |
| Quality | ESLint, Prettier, `tsc --noEmit`, GitHub Actions CI |
| Hosting | **Vercel** static, with preview deploys per PR and immutable cache headers on hashed assets. A PWA manifest and service worker give offline play |

### Performance budget
- Target is 60 fps (30 fps minimum) on a 4 GB Chromebook and an iPad 9th gen.
- First load is **under 15 MB**, and each act's assets are lazy-loaded.
- Pools are used for projectiles, particles, and damage numbers. There's a
  draw-call budget of about 150, chunked map culling, a GPU-instanced
  environment, and a dynamic resolution scale on weak devices.

---

## 10. Architecture

```
src/
  main.ts
  core/                    # PURE TS — no Three.js, no DOM. Unit-tested.
    sim/                   # fixed-tick loop, entity store, event bus
    stats/                 # stat calc, modifiers pipeline (base→items→skills→auras)
    combat/                # AR vs DEF, damage types, resists, block, leech, CB/DS
    skills/                # skill runtime, synergies, prereqs, +skills
    items/                 # bases, affix rolling (ilvl/alvl), uniques, sets, sockets
    loot/                  # treasure classes, magic find, drop rolls
    monsters/              # spawn packs, champions/uniques, modifiers
    ai/                    # behaviors: melee, ranged, caster, revive-shaman, boss scripts
    mercs/                 # hireling logic
    world/                 # level defs, mapgen, waypoints, portals, collision, pathfinding
    quests/                # quest state machines & rewards
    player/                # leveling, XP curve, respec, death rules
    save/                  # schema, migrations
  data/                    # D2-style tables (pure data)
    classes/ skills/ items/ affixes/ uniques/ sets/ monsters/ levels/ quests/ treasure/
  render/                  # Three.js — reads sim state, never mutates it
    scene/ camera/ models/ animation/ vfx/ shaders/ map/ culling/
  ui/                      # Preact overlay
    hud/ panels/ (inventory, stash, character, skilltree, quest, waypoint, vendor)
    touch/ input/ tooltips/ menus/
  audio/
  platform/                # storage, fullscreen, PWA, device detection
assets/                    # glTF, textures, audio + manifest.json (licenses)
tests/                     # vitest + playwright
```

**Rules:**
- `core` never imports `render` or `ui`.
- `render` and `ui` read state and send **commands** (move, cast, pick up,
  equip).
- This boundary lets agents work in parallel safely, keeps the logic testable,
  and leaves the door open for co-op later.

---

## 11. Deployment (Vercel)

- Vite preset, `npm run build`, output `dist/`.
- `vercel.json` sets long-cache headers for `/assets/*` (hashed) and no-cache
  for `index.html`, plus correct MIME types for `.glb`, `.ktx2`, and `.wasm`
  (Draco/Basis decoders).
- PRs get preview URLs to playtest on a real iPad and Chromebook, and `main`
  deploys to production.

---

## 12. Milestones

| # | Milestone | Done when… |
|---|---|---|
| **M0** | Skeleton & contracts | Repo, tooling, CI, and Vercel deploy are in place. `core` interfaces (entity, stats, modifiers, skill def, item def, commands, events) are written and frozen. An iso camera shows a test map |
| **M1** | Core feel slice | One class (Yedi Knight) walks and fights Battle Droydz and Tuskin Raiders in a generated area on desktop **and touch**, with combat formulas, death/respawn, and dissolve VFX |
| **M2** | RPG systems | Full stats, all 3 skill trees for all 3 classes (the data and the first ~10 skills of each class playable), XP/leveling, items/affixes/loot, inventory/belt/stash UI, and save/load |
| **M3** | Act I complete | Town, NPCs (vendor, smith, healer/respec, merc hire), waypoints/TP, Act I areas/quests/monsters, and Count Dooky. **First playtest with kids** |
| **M4** | All skills | All 90 skills, synergies, and mercenaries are implemented and balanced across Act I |
| **M5** | Acts II–IV | All areas, quests, monsters, and bosses, plus music. Normal difficulty is completable |
| **M6** | Difficulties & endgame | Veteran/Legend, resist penalties, monster scaling, sets/uniques complete, the Moo-n secret level |
| **M7** | Release polish | Performance on Chromebook/iPad, gamepad, accessibility (colorblind, text size, screen shake), PWA, and credits |
| *M8* | *Post-launch* | Runewords, crafting, charms, and classes 4–6 |

---

## 13. Implementation strategy: maximum parallel sub-agents

The codebase is shaped so that many sub-agents can work **at the same time**
without stepping on each other.

**How it runs**
- The lead agent (me) owns the contracts, merges, and integration.
- Each sub-agent works in its **own git worktree** on a scoped task with a clear
  "done" definition (tests pass, typecheck clean, and a short report back).
- I review each result, merge it into `claude/trusting-johnson-w0uzzt`, run the
  full test suite and build, and then launch the next wave.
- **Ownership is by folder**: an agent may only edit its folder plus tests,
  which avoids merge conflicts.
- If an agent needs a contract change, it reports that back instead of editing
  `core` interfaces itself.

**Wave 0: serial, lead only (M0)**
Scaffold, tooling, CI, Vercel config, and the **frozen interfaces** in
`core/sim`, `core/stats`, and `data` schemas. Everything else depends on these.

**Wave 1: about 10 agents in parallel (M1–M2 foundations)**
| Agent | Owns |
|---|---|
| 1 | `core/stats` + `core/combat` (D2 formulas, with extensive unit tests) |
| 2 | `core/items` + `core/loot` + `data/items,affixes,treasure` |
| 3 | `core/world/mapgen` + pathfinding + collision |
| 4 | `render/scene, camera, map, culling` (iso camera, instanced tiles) |
| 5 | `render/models, animation` (glTF loading, mixer, gear attachment) |
| 6 | `render/vfx` + shaders (toon/outline, VFX toolkit, dissolve) |
| 7 | `ui/hud` + `ui/panels` (orbs, belt, skill bar, inventory grid, tooltips) |
| 8 | `ui/input` + `ui/touch` (mouse/kb/gamepad/touch → commands) |
| 9 | `core/save` + `platform/` (IndexedDB, migrations, PWA) |
| 10 | Asset sourcing: download and curate CC0 packs, compress (KTX2/Draco), `manifest.json`/`CREDITS.md` |

**Wave 2: about 9 agents (skills & monsters)**
| Agent | Owns |
|---|---|
| 1–3 | Yedi Knight: Saber Forms / Masteries / Commands trees |
| 4–6 | Bounty Huntur: Blasters / Instincts / Spear & Arc trees |
| 7–9 | Forse Adept: Plasma / Storm / Cryo trees |
| 10 | `core/monsters` + `core/ai` (pack spawning, modifiers, revive shaman, boss script framework) |
| 11 | `core/mercs` + `core/player` (leveling, respec, death rules) |
| 12 | `core/quests` engine + hub NPC/vendor flows |

**Wave 3: one agent per act, plus specialists**
| Agent | Owns |
|---|---|
| 1 | Act I (Endoor) content (levels, presets, monsters, quests, boss, dialogue) |
| 2 | Act II (Tatoonie) content |
| 3 | Act III (Kashyyyyyk) content |
| 4 | Act IV (Deaf Star) content |
| 5 | Uniques & sets data |
| 6 | Audio/music integration |
| 7 | Balance simulator: a headless sim that runs builds through acts and reports time-to-kill and survival |

**Ongoing:** a **review agent** per merge wave (bugs, contract violations),
a **QA agent** running Playwright and touch-emulation play-throughs, and a
**performance agent** profiling on low-end settings.

---

## 14. Remaining open questions
- None blocking. Names can be tweaked any time in `data/names.ts`.
