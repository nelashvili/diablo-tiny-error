# Diablo Tiny Error — Game Plan

A browser-based, kid-friendly action RPG for ages 9–10. It borrows the structure of
Diablo II (town hub, acts, quests, random dungeons, loot, skill trees, boss fights)
but trades gore and dread for silly, colorful adventure. It's isometric, plays well
on a school Chromebook, and is deployed to Vercel as a static site.

> Working title: **"Diablo Tiny Error"**. A possible in-game name is
> **"Glitch Quest: The Tiny Error"**. The story is that a tiny coding error in the
> Kingdom's Wish Machine scrambled every friendly creature into a grumpy one, and
> the heroes fix them.

---

## 1. Design pillars

1. **Funny, not scary.** Enemies are *grumpy*, not evil. When defeated they go
   *poof* into confetti and stars and turn back into happy critters that run off
   waving. There's no blood, no corpses, no skulls, and no horror music.
2. **Diablo's satisfying loop.** Click, fight, loot, level up, and get stronger.
   Colored loot drops, gold showers, and a level-up fanfare are the core
   dopamine.
3. **Easy to pick up.** A 9-year-old can play with no instructions. Text is short
   and readable (about a 3rd–4th grade level), icons come first, and there are no
   fiddly systems.
4. **Fair and forgiving.** No permanent loss, no harsh death penalty, and no
   inventory tetris.
5. **Runs anywhere.** It plays in a browser tab on a low-end Chromebook at 60 fps
   with nothing to install, no accounts, and no data collection.

---

## 2. What we keep from Diablo II and what we change

| Diablo II | Tiny Error version |
|---|---|
| 4–5 Acts, each with a town | **3 Acts + a finale**, each with a town hub |
| Skill trees (3 trees × 10 skills) | **1 tree per class, 8 skills**, unlocked at set levels |
| Manual stat points (Str/Dex/Vit/Energy) | **3 stats** (Power / Speed / Heart), with an **auto-assign** button by default |
| Death drops your corpse and gold | You "**get bonked**". You respawn in town with everything and lose a little gold at most |
| Grid inventory with item sizes | **Every item takes 1 slot**, with auto-sort and auto-pickup gold/potions |
| Item identification, Cain | Items arrive identified. **Rarity colors stay** (grey/white/blue/yellow/gold/green set) |
| Waypoints | Kept, as **Teleport Mushrooms** |
| Town portal scroll | Kept, as a **Home Bubble** with infinite uses on a cooldown |
| Belt + potion spam | **2 potion buttons** (health/mana) that refill in town |
| Mercenaries | **Pet buddy**: a cute companion that fights alongside you and carries extra loot |
| Hardcore, ladder, trading | Cut |
| Multiplayer | Cut from v1. The architecture allows a later **2-player same-screen / online co-op** |
| Difficulty tiers (Normal/NM/Hell) | **New Game+** ("Super Silly Mode") after the finale |

---

## 3. Classes (4 at launch, a 5th as a stretch goal)

Each class has a clear playstyle, one big signature "wow" skill, and a funny theme.

| Class | D2 analog | Playstyle | Example skills (8 total) | Signature |
|---|---|---|---|---|
| **Knight of Pillows** | Barbarian / Paladin | Melee tank | Pillow Bash, Shield Bump, Cheer Shout (party buff), Spin-to-Win, Ground Pound, Hug of Protection (aura), Leap, Mega Pillow Fort | **Spin-to-Win** (whirlwind) |
| **Bubble Wizard** | Sorceress | Ranged caster | Bubble Bolt, Freeze Pop, Sparkle Chain (chain lightning), Fizzy Nova, Blink, Soap Shield, Meteor-ite (giant cupcake), Rainbow Beam | **Giant Cupcake Meteor** |
| **Ranger of the Woods** | Amazon | Ranged physical | Acorn Arrow, Multi-Shot, Sticky Sap Arrow (slow), Owl Scout, Dodge Roll, Pinecone Rain, Piercing Shot, Hawk Friend | **Pinecone Rain** |
| **Beast Buddy** | Druid / Necromancer | Summoner | Call Bunny, Call Turtle (tank), Call Bee Swarm, Grow Vine (root), Pet Heal, Become Bear (shapeshift), Stampede, Dragon Pal | **Dragon Pal** |
| *(stretch)* **Gizmo Tinker** | Assassin | Traps / gadgets | Spring Trap, Bubblegum Mine, Robo-Turret, Grapple, Gear Throw, Decoy Dummy, Zapper Fence, Mega Mech | **Mega Mech** |

**Skill system:**
- One skill point per level, with skills unlocking at levels 1/3/6/10/14/18/22/26.
- Each skill goes up to rank 5. A **free respec** at the town trainer means no bad
  builds are possible.
- Left click is the main attack, right click is the selected skill, and keys 1–4
  are skill hotbar slots.

**Level cap:** 30 in the main game, 50 in New Game+.

---

## 4. World & content

| Act | Theme | Town | Areas (random layouts) | Boss |
|---|---|---|---|---|
| **1. Sprinkle Meadows** | Grassy hills, mushrooms, a candy-ish forest | Cozy Hollow | Meadow, Mushroom Caves (2 floors), Old Windmill | **King Grumblebee**, a giant cranky bee |
| **2. Sandcastle Coast** | Beach, tide pools, a pirate ship | Driftwood Dock | Dunes, Crab Caves, Sunken Ship (3 decks) | **Captain Pinchbeard**, a crab pirate |
| **3. Frostcake Peaks** | Snowy mountains, ice-cream glaciers | Cocoa Lodge | Snowfields, Ice Palace (3 floors), Yeti Den | **The Big Brr**, a yeti who misses his mittens |
| **Finale: The Glitch Core** | Digital/pixel world inside the Wish Machine | — | Glitch Maze | **The Tiny Error**, a cute glitchy bug that splits into copies |

- **About 4–6 quests per act.** Kill-the-boss, fetch, rescue-the-critter, and one
  optional puzzle quest (simple switch or color puzzles) per act.
- **Enemy families** (5–8 per act with color variants): Grumpy Slimes, Bossy
  Bats, Sneezy Mushrooms, Snippy Crabs, Snowball Gnomes, Glitch Bugs. Champion and
  "unique" packs get a silly name tag ("Sir Wobbles the Extra Grumpy").
- **Target playtime** is about 6–10 hours for the main story. That's good for
  repeated short sessions of 20–40 minutes.

---

## 5. Loot & economy

- **Rarity tiers:** Plain (grey) → Normal (white) → Magic (blue) → Rare (yellow)
  → Legendary (gold) → Set (green).
- **Slots:** Weapon, Off-hand, Hat, Armor, Gloves, Boots, Belt, 2 × Ring, Amulet.
  That's fewer than D2 and easier to read.
- **Affixes** are data-driven, with funny names like "Boots *of Extra Bounce*" or
  "*Wobbly* Sword of Sparkles".
- **Cosmetics are visible.** Hats and armor change how your character looks.
  Kids love this.
- **Comparison tooltips** show green ▲ and red ▼ arrows instead of raw number
  walls.
- **Town NPCs:** Shopkeeper (buy/sell), Blacksmith (upgrade item +1…+5 with gold),
  Trainer (respec), Stash Chest (shared across characters), and the Pet Shop
  (cosmetic pets).
- **No real money and no ads.** This is non-negotiable for a kids' audience.

---

## 6. Ease-of-use & kid-friendly features

- **Controls:** Click-to-move/attack (classic), plus **WASD + mouse aim**, plus
  **gamepad** support. Touch is a stretch goal for tablets.
- Big readable UI fonts (≥16 px), high-contrast outlines on enemies and loot,
  and loot labels when you hold Alt (on by default).
- **Quest arrow / sparkle trail** toward the current objective, and a minimap that
  is always on.
- **Optional read-aloud** of NPC dialogue using the browser `speechSynthesis` API.
- **Auto-save** on every zone change and every 60 s, with 3 save slots.
- Difficulty slider ("Relaxed / Normal / Spicy") that can be changed at any time.
- Accessibility: colorblind-safe rarity (shape + color), reduced screen-shake
  toggle, and remappable keys.
- **Parent-friendly:** an optional session timer ("Time for a break!" after N
  minutes), no chat, no accounts, and no tracking.

---

## 7. Visual & audio direction

- **Isometric 2D** at a 2:1 diamond tile ratio (e.g. 64×32 tiles) with bright
  saturated palettes, soft shadows, and chunky outlines. It aims for a modern
  "toy-like" look, close to *Kingdom Rush* or *Torchlight* colors on D2's camera.
- **Sprite pipeline (recommended):** model simple low-poly characters in Blender
  and **pre-render them to sprite sheets** in 8 directions. This is how D2 did it,
  and it gives clean, consistent art cheaply. Animations per character are idle,
  walk, attack, cast, hit, and bonked.
- **Placeholder art:** start with Kenney.nl isometric packs (CC0) so gameplay can
  be built before the final art exists.
- **Juice:** hit-flash, damage numbers that pop and bounce, confetti on kills,
  screen-shake (toggleable), and a loot "beam" for Legendary drops.
- **Audio:** cheerful chiptune/orchestral-lite music per act, squeaky and boingy
  hit sounds, and a satisfying "ding" for loot. Sourced CC0 at first
  (OpenGameArt, Kenney), with custom tracks later.

---

## 8. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Safety on a growing codebase |
| Build | **Vite** | Fast dev server, static output that Vercel deploys natively |
| Game engine | **Phaser 3** (WebGL with Canvas fallback) | Mature 2D engine with built-in sprites, tilemaps, input, gamepad, audio, and cameras. Works well on low-end hardware |
| UI (menus, inventory, tooltips) | **Phaser scenes** for the in-game HUD. Optionally a thin DOM/Preact overlay for inventory and menus to make text-heavy UI easier | DOM text is crisper and more accessible |
| Pathfinding | A* on the iso grid (`easystarjs` or a small custom implementation) | Click-to-move |
| Procedural maps | Custom generators (rooms+corridors / BSP for dungeons, noise + prefabs for outdoor) | D2-style random layouts |
| Game data | **JSON/TS data files** for classes, skills, items, affixes, monsters, and quests | Content can be added without engine changes |
| Save | `localStorage` / IndexedDB, versioned save schema, plus export/import save as a file | No backend needed and no personal data |
| Tests | **Vitest** for pure logic (damage, loot rolls, leveling, map gen), **Playwright** smoke test that the game boots | Fast feedback |
| Lint/format | ESLint + Prettier | — |
| Hosting | **Vercel** static deploy, with preview deploys per PR | Matches the requirement and costs nothing to start |
| Assets | Texture atlases (TexturePacker or free-tex-packer), compressed audio (`.ogg` + `.m4a`) | Load performance |

**No backend in v1.** Online co-op or cloud saves later would mean adding a small
service (e.g. Vercel Functions + a KV store, or Colyseus for real-time co-op).

### Performance budget (Chromebook target)
- Initial download under **10 MB**, with acts lazy-loaded per zone.
- 60 fps with up to about 60 enemies and 200 particles on screen.
- Object pooling for projectiles, damage numbers, and particles.
- Only the visible area is culled and drawn, and the tilemap is chunked.

---

## 9. Architecture

```
src/
  main.ts                 # Phaser game config, boot
  scenes/
    BootScene.ts          # load minimal assets, splash
    TitleScene.ts         # title, save-slot select, character create
    TownScene.ts          # hub (NPCs, stash, waypoints)
    DungeonScene.ts       # generated areas (shared by all acts)
    HudScene.ts           # runs in parallel: health/mana orbs, hotbar, minimap
    UiScene.ts            # inventory, skills, quest log, dialogs
  core/
    ecs/                  # lightweight entity/component system (or plain classes)
    combat/               # damage calc, status effects, hit detection
    stats/                # stat formulas, leveling, XP curve
    loot/                 # drop tables, affix rolling, rarity
    ai/                   # monster behaviors (chase, ranged, flee, summon, boss phases)
    skills/               # skill runtime: projectiles, auras, summons, areas
    world/
      iso.ts              # cart <-> iso conversion, depth sorting
      mapgen/             # dungeon & outdoor generators
      pathfinding.ts
    quests/               # quest state machine
    save/                 # serialize/deserialize, migrations
  data/                   # pure data, no logic
    classes/*.ts
    skills/*.ts
    items/{bases,affixes,uniques,sets}.ts
    monsters/*.ts
    acts/{act1,act2,act3,finale}.ts
    dialogue/*.ts
  ui/                     # (optional) DOM/Preact overlay components
public/assets/            # atlases, audio, fonts
tests/                    # vitest unit tests, playwright smoke
```

**Key principles**
- **Logic stays separate from rendering.** Combat, loot, and stats are pure
  TypeScript, unit-tested, and engine-agnostic. That makes balancing and future
  multiplayer easier.
- **Data-driven content.** A new monster or skill should mostly be a data entry
  plus maybe one behavior function.
- **Fixed-timestep simulation** (e.g. 30 Hz logic, render interpolated). Results
  are deterministic, and later co-op is easier.
- **Seeded RNG** for map generation and loot, so bugs can be reproduced.

---

## 10. Deployment (Vercel)

- Framework preset: **Vite**, build command `npm run build`, output `dist/`.
- `vercel.json` adds long-cache headers for hashed assets
  (`/assets/*` → `Cache-Control: public, max-age=31536000, immutable`).
- Every PR gets a **preview URL** for playtesting, and `main` deploys to production.
- An optional PWA manifest and service worker give "install to desktop" and
  offline play after the first load.

---

## 11. Roadmap / milestones

| # | Milestone | Contents | Rough size |
|---|---|---|---|
| **M0** | Project skeleton | Vite + TS + Phaser, ESLint/Prettier, Vitest, Vercel deploy of a "Hello iso world" | 1–2 days |
| **M1** | Vertical slice: core feel | Iso tile rendering, depth sorting, click-to-move + A*, camera, 1 class (Knight), 1 enemy type, melee combat, health/death/respawn, confetti kills | 1–2 weeks |
| **M2** | RPG loop | XP & leveling, stats + auto-assign, skill tree + hotbar, loot drops & rarity, inventory/equipment UI, potions, save/load | 2–3 weeks |
| **M3** | World structure | Town hub with NPCs (shop, blacksmith, stash), procedural dungeon generator, teleport mushrooms, Home Bubble, quest system, minimap | 2–3 weeks |
| **M4** | Act 1 complete | All Act 1 zones, monsters, quests, King Grumblebee boss; **playtest with real kids** | 2 weeks |
| **M5** | All classes | Bubble Wizard, Ranger, Beast Buddy (summons + pet AI), class balance pass | 3 weeks |
| **M6** | Acts 2, 3 & Finale | Remaining content, bosses, music | 4–6 weeks |
| **M7** | Polish & release | Final art swap, audio, accessibility options, gamepad, performance on Chromebook, PWA, New Game+ | 2–3 weeks |
| *M8* | *Stretch* | Gizmo Tinker class, touch controls, local/online co-op | — |

The **vertical slice (M1–M2)** is the most important checkpoint. If clicking
grumpy slimes and watching them burst into confetti isn't fun by then, adjust
before building content.

---

## 12. Safety & content guidelines (for writing/art)

- No blood, gore, skulls, corpses, demons, or religious imagery. Defeated
  enemies always *transform back* or *poof*, and are never shown dying.
- Weapons are allowed but stay soft or whimsical (pillows, foam swords,
  acorn bows, wands).
- Humor is slapstick and wordplay, with no mean-spirited jokes.
- No chat, no user-generated text visible to others, no external links in-game,
  and no analytics that identify a child (COPPA-friendly by design).

---

## 13. Open questions

1. **Art:** do we have an artist, or should we plan on Blender pre-renders plus
   CC0 asset packs, or AI-assisted concept art?
2. **Class count at launch:** 4 (recommended) or 3 to ship faster?
3. **Co-op:** is playing together (siblings or friends) important enough to plan
   the netcode in from v1?
4. **Devices:** must it support tablets/touch at launch, or is
   keyboard/mouse/gamepad enough?
5. **Language:** English only, or should localization be built in from the start?
