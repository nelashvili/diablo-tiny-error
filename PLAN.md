# Diablo Tiny Error — Game Plan (v2)

A browser-based action RPG for ages 9–10 that **plays like Diablo II**. It has
the full skill trees, stats, items, acts, and difficulties, but the content is
toned down to a **PG adventure-fantasy** level instead of gore and horror. It's
isometric, works on desktop, Chromebooks, and tablets, and is deployed to
Vercel as a static site.

> **Changes from v1:** the full D2 skill trees and stat system are back, the
> tone is now "adventure, not baby", there are 3 classes at launch, there's no
> co-op, tablets are a launch requirement, there's no artist (we use CC0 3D
> asset packs), and implementation is built for **parallel sub-agents** (§13).

---

## 1. Design pillars

1. **It's Diablo II.** Someone who knows D2 should feel at home: the class
   trees, the 5 stat points per level, attack rating vs. defense, resistances,
   magic/rare/set/unique loot, sockets, mercenaries, and 3 difficulties. We
   lean on 20+ years of D2 design knowledge instead of reinventing it.
2. **Exciting, not gory.** The tone is like *Minecraft Dungeons*, *Zelda*, or
   *Torchlight* (target is roughly ESRB E10+ / PEGI 7). Monsters are real
   monsters and battles feel dangerous, but there's no blood, no gore, no
   corpses, no demons or hell imagery, and no torture or horror themes.
3. **Modern quality-of-life, not dumbing-down.** We remove D2 *friction*
   (corpse runs, unidentified items, tiny fonts) and keep D2 *depth*.
4. **Runs anywhere.** It plays in a browser tab on a Chromebook or iPad at
   60 fps (30 fps minimum) with nothing to install, no accounts, and no
   data collection.

---

## 2. Tone & content rules

| Topic | Rule |
|---|---|
| Death of enemies | Enemies **dissolve into dark smoke / crystal shards**. They leave a short-lived glowing "remnant" for a few seconds (used by skills like *Find Item*) and then fade. There are no corpses or body parts. |
| Hits | Colored impact sparks per damage type (white physical, orange fire, blue cold, yellow lightning, green poison). There's no blood. |
| Enemies | Goblins, skeletons, shamblers (mud and moss creatures), giant beetles, wraiths, golems, elementals, and corrupted beasts. "Shadeborn" replace demons. |
| Villains | Menacing but not disturbing. They're corrupted beings, not devils, with no religious or satanic imagery. |
| Player death | "**Defeated**". You respawn in town with all your gear. There's no corpse run. You lose some gold, and a small XP loss applies only on higher difficulties (like D2). |
| Language | Clear, adventurous, with light humor allowed. No profanity, and dialogue is written for a 4th–5th grade reading level. |
| Safety | No chat, no UGC, no external links, no ads, no purchases, no identifying analytics (COPPA-friendly). |

### Story: "The Tiny Error"
A young apprentice made a tiny error in a spell that guarded the **Heartstone**,
the crystal that keeps the world in balance. A hairline crack let out
**The Error**, a living corruption that splits itself into powerful champions
and twists creatures into monsters. The player follows the crack's trail across
four acts and stops each champion, then faces The Error itself. This mirrors
D2's chase after the Wanderer, the Prime Evils, and the Worldstone.

---

## 3. Classes (3 at launch, D2-style trees)

The launch trio covers the classic roles: melee, ranged physical, and caster.

### Class rules (D2 rules, kept)
- **3 trees × 10 skills** per class, with skill tiers unlocking at character
  level **1 / 6 / 12 / 18 / 24 / 30**.
- **Prerequisites** (e.g. Frozen Orb needs Ice Blast and Frost Nova).
- **1 skill point per level**, plus **quest rewards** (+1 skill ×3 across the
  acts, as in D2).
- **Max 20 hard points** per skill, and **+skills from items** can go beyond 20.
- **Synergies**: points in one skill boost related skills (e.g. Fire Bolt
  boosts Fire Ball).
- **Respec**: one free respec per difficulty (Akara-style), plus a craftable
  *Token of Renewal* (like the Token of Absolution).
- An optional **"Build Guide" overlay** highlights a suggested path for kids
  who want help. It's off by default and doesn't change any rules.

### Vanguard (Barbarian analog)
| Tier | Combat | Masteries | Warcries |
|---|---|---|---|
| 1 | Bash | Blade Mastery, Axe Mastery, Hammer Mastery | Howl, Find Potion |
| 6 | Leap, Double Swing | Throwing Mastery, Spear Mastery | Taunt, Shout |
| 12 | Stun, Double Throw | Increased Stamina | Find Item |
| 18 | Leap Attack, Concentrate | Iron Skin | Battle Cry |
| 24 | Frenzy | Increased Speed | Battle Orders, Rally Banner |
| 30 | Whirlwind, Berserk | Natural Resistance | War Cry, Battle Command |

### Ranger (Amazon analog)
| Tier | Bow & Crossbow | Passive & Magic | Javelin & Spear |
|---|---|---|---|
| 1 | Magic Arrow, Fire Arrow | Inner Sight, Critical Strike | Jab |
| 6 | Cold Arrow, Multiple Shot | Dodge | Power Strike, Venom Javelin |
| 12 | Exploding Arrow | Slow Missiles, Avoid | Impale, Lightning Bolt |
| 18 | Ice Arrow, Guided Arrow | Penetrate | Charged Strike, Toxic Cloud |
| 24 | Strafe, Blazing Arrow | Decoy, Evade | Fend |
| 30 | Freezing Arrow | Spirit Guardian, Pierce | Lightning Strike, Lightning Fury |

### Elementalist (Sorceress analog)
| Tier | Fire | Lightning | Cold |
|---|---|---|---|
| 1 | Fire Bolt, Warmth | Charged Bolt | Ice Bolt, Frozen Armor |
| 6 | Inferno | Static Field, Telekinesis | Frost Nova, Ice Blast |
| 12 | Blaze, Fire Ball | Nova, Lightning | Shiver Armor |
| 18 | Fire Wall, Enchant | Chain Lightning, Teleport | Glacial Spike |
| 24 | Meteor | Thunder Storm, Energy Shield | Blizzard, Chilling Armor |
| 30 | Fire Mastery, Hydra | Lightning Mastery | Frozen Orb, Cold Mastery |

**Post-launch classes** (the data model supports them from day 1): a
**Warden** (Paladin analog with auras), a **Beastcaller** (Druid analog with
summons and shapeshifting), and a **Tinker** (Assassin analog with traps).
A Necromancer analog fits poorly with the "no corpses" rule. If we add one, it
would be a "Spiritbinder" who uses enemy remnants.

---

## 4. Character stats (D2 system, kept)

- **Strength / Dexterity / Vitality / Energy**, with class-specific starting
  values (e.g. Vanguard 30/20/25/10, Ranger 20/25/20/15, Elementalist 10/25/10/35).
- **5 stat points per level**, plus **+5 from an Act III quest** (Lam Esen analog).
- Life, mana, and stamina per level and per point vary by class, using D2-style
  values.
- **Item requirements** (Str/Dex/level) and **Strength/Dexterity damage bonus**
  per weapon type.
- **Attack Rating vs. Defense** hit chance, **Block** chance, and **Resistances**
  (fire/cold/lightning/poison) with a per-difficulty penalty (−0 / −40 / −100
  like D2), capped at 75%.
- Secondary stats: Increased Attack Speed, Faster Cast Rate, Faster Hit Recovery,
  Faster Run/Walk, Life/Mana steal, Crushing Blow, Deadly Strike, Magic Find,
  Gold Find, Cannot Be Frozen, and so on.
- **One deliberate deviation:** speed stats scale *continuously* rather than
  in D2's animation-frame **breakpoints**. Breakpoints came from D2's 25 fps
  sprite engine and are opaque to kids. The effective formulas otherwise follow
  D2.
- Stats are never auto-assigned. A **"Suggested" hint** (optional, like the Build
  Guide) shows what this class usually raises.

---

## 5. World & progression

**4 acts** (D2 has 5; our Act IV is short like D2's) × **3 difficulties:
Normal / Nightmare → "Heroic" / Hell → "Legend"**. The level cap is **75**, with
an XP curve tuned so finishing Legend takes about lvl 65–75.

| Act | Setting | Town | Key areas (randomized layouts) | Quests (6 / 6 / 4 / 3 like D2) | Boss |
|---|---|---|---|---|---|
| **I** | Greenmarch Wilds: forests, moors, an old abbey | Hearthwatch Camp | Bramble Moor, Den of Shadows, Cold Plains, Old Barrow, Stony Field, Dark Wood, Black Marsh, Forgotten Tower, Silverbell Abbey, Catacombs | Den (+1 skill), Old Barrow, Rescue the Sage, Forgotten Tower, Tools of the Trade (imbue), The Abbey | **The Thornmother** (Andariel analog) |
| **II** | Sunscar Desert: dunes, tombs, a palace | Sandhaven | Rocky Waste, Dry Hills, Far Oasis, Lost City, Sewers, Palace, Arcane Sanctum, 7 Tombs (1 true) | Sewer Beast (+1 skill), Horadric Staff analog, Tainted Sun, Arcane Sanctum, Summoner, Seven Tombs | **The Sand Wyrm** (Duriel analog) |
| **III** | Verdant Deep: jungle, a flooded ruined city | Port Mirel | Spider Forest → "Beetle Forest", Great Marsh, Flayer Jungle → "Lurker Jungle", Kurast analogs, Temples, Travincal, Durance | Golden Bird (+20 life), Gidbinn, Khalim's Will analog, **Lam Esen's Tome (+5 stats)**, Blackened Temple, Guardian | **The Hollow Council** → **The Mirrorborn** (Mephisto analog) |
| **IV** | The Fractured Realm: crystal wastes inside the crack | Last Light Bastion | Outer Steppes, Plains of Static, City of Shards, River of Light, **Heart Sanctum** (3 seals, each guarded by a champion, like Chaos Sanctuary) | Fallen Hero (+1 skill: Izual analog), Hellforge → "Shard Forge", Terror's End | **The Error** |

- **Waypoints**, **Town Portal** (scroll/tome), **mercenaries** (an act-based
  hireling per act with D2-style auras/skills), **D2-style monster packs**
  (champions, uniques with random modifiers such as *Extra Fast*,
  *Fire Enchanted*, *Cursed*, *Multishot*, *Lightning Enchanted*), and the
  **goblin + shaman revive** mechanic (Fallen/Fallen Shaman analog) all stay.
- The **Cow Level analog** is a secret level: the **Moo-tant Meadow**, a silly
  secret area as a reward for curious kids.

---

## 6. Items & economy (D2 system)

- **Quality:** Inferior (grey) → Normal (white) → Magic (blue) → Rare (yellow)
  → Set (green) → Unique (gold). Crafted (orange) comes post-launch.
- **Base tiers:** Normal / Exceptional / Elite per base type (e.g. Short Sword →
  Gladius → Falcata). There are D2-style weapon classes (swords, axes, maces,
  spears, javelins, bows, crossbows, staves, wands, orbs) and armor slots
  (helm, body, gloves, belt, boots, shield, 2 rings, amulet).
- **Affixes:** a D2-style prefix/suffix table with item level (ilvl) and
  affix level (alvl) rules, plus **class-specific items** (Ranger bows, Elementalist
  orbs, Vanguard helms) with +skills.
- **Sockets, gems (chipped → perfect), and runes**, with **Runewords** in
  post-launch milestone M8.
- **Horadric Cube analog ("Tinkerer's Box")** with basic recipes (gem upgrades,
  rerolls). Charms come post-launch.
- **Shared stash** across characters.
- **Kept with quality-of-life changes:**
  - Items **auto-identify** on pickup.
  - Inventory is a **D2-style grid with item sizes**, plus an **auto-sort**
    button.
  - Gold is **auto-picked up**, and you can **pick up potions straight into
    the belt**.
  - **Compare tooltips** with green/red deltas, and a loot filter
    (hide grey/white) setting.

---

## 7. Controls & devices (tablets are a launch requirement)

| Input | Scheme |
|---|---|
| Mouse + keyboard | D2 classic: left-click move/attack, right-click skill, F1–F8 skill hotkeys, Tab map, Alt shows items, Shift stand-still, TAB/I/S/C/Q panels |
| Gamepad | Left stick move, face buttons are 4 skills plus primary attack, auto-target nearest (like D2R controller mode) |
| **Touch / tablet** | **Virtual joystick** (left) **or tap-to-move** (setting). The **skill wheel** (right, D2R controller layout) has 6 skill buttons plus potion buttons. **Tap enemy** to attack with soft auto-aim. **Long-press** shows a tooltip instead of hover. **Drag-and-drop** inventory. Pinch disabled; fixed zoom with 2 presets |

- UI is **responsive**: it adapts to 16:9 laptop, 4:3 iPad, and phone landscape
  (best effort). Minimum touch target is 44 px.
- Tablet-specific handling covers iOS Safari audio unlock, fullscreen/PWA
  "Add to Home Screen", `visibilitychange` auto-pause, and avoiding the
  iOS 300 ms delay and scroll bounce.

---

## 8. Art & audio without an artist

### Key decision: real-time 3D with a fixed isometric camera
With no artist, **pre-rendered sprites** would mean building a Blender rendering
pipeline for every model × animation × 8 directions × equipment variant.
Instead we **render low-poly 3D models live with an orthographic isometric
camera**:
- It looks exactly isometric (D2 / D2R / *Hades* camera), and it's "simple and
  modern".
- It has free smooth rotation (no 8-direction limit), real lighting, and
  shadows.
- **Equipment shows on the character** by attaching weapon and helm meshes to
  bones. D2 had this, and kids love it.
- It uses massive **CC0 3D asset libraries**, which are consistent and already
  animated.

### Asset sources (license must be CC0 or similar)
| Need | Source | License |
|---|---|---|
| Heroes (rigged, animated), skeletons, weapons | **KayKit** Adventurers, Skeletons, and other packs (Kay Lousberg) | CC0 |
| Monsters | **Quaternius** Ultimate Monsters / RPG packs | CC0 |
| Dungeon/forest/desert tilesets & props | KayKit Dungeon / Forest, **Kenney** 3D packs, Quaternius nature packs | CC0 |
| Skill & item icons | **game-icons.net** (recolored SVGs) | CC BY 3.0 → `CREDITS.md` |
| UI frames/fonts | Kenney UI packs; Google Fonts (e.g. Cinzel + Nunito) | CC0 / OFL |
| SFX | Kenney audio, OpenGameArt CC0, Sonniss GDC bundles | CC0 / royalty-free |
| Music | OpenGameArt / freepd.com fantasy tracks | CC0 / CC BY |

- A unifying **toon shader + outline pass + per-act color grading** makes mixed
  packs look like one game.
- **Skill VFX are procedural**: particles, shader effects, and textured quads.
  We need about 90 skill effects, so we build a small VFX toolkit (projectile,
  nova, beam, aoe-zone, aura, buff-glow) and give skills data-driven parameters.
- **Every asset's license is tracked** in `assets/manifest.json` and generated
  into `CREDITS.md` at build time.

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
| **M1** | Core feel slice | One class (Vanguard) walks and fights skeletons in a generated area on desktop **and touch**, with combat formulas, death/respawn, and dissolve VFX |
| **M2** | RPG systems | Full stats, all 3 skill trees for all 3 classes (the data and the first ~10 skills of each class playable), XP/leveling, items/affixes/loot, inventory/belt/stash UI, and save/load |
| **M3** | Act I complete | Town, NPCs (vendor, smith, healer/respec, merc hire), waypoints/TP, Act I areas/quests/monsters, and the Thornmother. **First playtest with kids** |
| **M4** | All skills | All 90 skills, synergies, and mercenaries are implemented and balanced across Act I |
| **M5** | Acts II–IV | All areas, quests, monsters, and bosses, plus music. Normal difficulty is completable |
| **M6** | Difficulties & endgame | Heroic/Legend, resist penalties, monster scaling, sets/uniques complete, Moo-tant Meadow |
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
| 1–3 | Vanguard: Combat / Masteries / Warcries trees |
| 4–6 | Ranger: Bow / Passive / Javelin trees |
| 7–9 | Elementalist: Fire / Lightning / Cold trees |
| 10 | `core/monsters` + `core/ai` (pack spawning, modifiers, revive shaman, boss script framework) |
| 11 | `core/mercs` + `core/player` (leveling, respec, death rules) |
| 12 | `core/quests` engine + town NPC/vendor flows |

**Wave 3: one agent per act, plus specialists**
| Agent | Owns |
|---|---|
| 1 | Act I content (levels, presets, monsters, quests, boss, dialogue) |
| 2 | Act II content |
| 3 | Act III content |
| 4 | Act IV content |
| 5 | Uniques & sets data |
| 6 | Audio/music integration |
| 7 | Balance simulator: a headless sim that runs builds through acts and reports time-to-kill and survival |

**Ongoing:** a **review agent** per merge wave (bugs, contract violations),
a **QA agent** running Playwright and touch-emulation play-throughs, and a
**performance agent** profiling on low-end settings.

---

## 14. Remaining open questions
1. Do the class names (Vanguard / Ranger / Elementalist) and act/boss names
   work for you, or do you want to name them?
2. Is skeletons-as-enemies OK? They're common in E10+ games such as Minecraft.
   Or should we avoid them entirely?
3. Is the **real-time 3D with an iso camera** decision OK, versus 2D
   pre-rendered sprites? I strongly recommend it given there's no artist.
