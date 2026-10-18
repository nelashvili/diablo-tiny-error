# Working on Diablo Tiny Error (rules for every agent)

Read `PLAN.md` first (design). This file is the engineering contract.

## Layout & ownership

- `src/core/**` — pure TypeScript simulation. **No Three.js, Preact, DOM, `Math.random`, or `Date.now`.**
  Use `Rng` from `core/rng.ts`. ESLint enforces the import ban.
- `src/data/**` — pure data tables conforming to `data/schema.ts`. Auto-loaded by `data/db.ts` via
  `import.meta.glob`: add `data/<table>/<file>.ts` with `export default [...] satisfies XDef[]`.
  Never edit a shared registry. Display text goes in `data/names/<file>.ts` (`export default {key: text}`)
  and is shown with `t(key)` — never hard-code visible strings in data.
- `src/render/**` — Three.js. Reads `WorldView`, never mutates sim.
- `src/ui/**` — Preact overlay. Reads `UiStore`, sends `Command`s via `dispatch`.
- `src/game/**` — composition root / integration. **Owned by the lead only.**

**You may only edit the folders your task assigns you, plus tests next to them.**
Files marked `CONTRACT FILE` and `STUB (Wave 0)` belong to someone specific:

- CONTRACT files: lead only. If you need a change, describe it in your final report (an exact diff
  is ideal) and work around it locally (e.g. a local type) until the lead merges.
- STUB files: only the agent named in the stub header replaces them, keeping exported signatures.
- Do not modify `package.json`/lockfile. If you truly need a dependency, say so in your report.
- Do not edit `PLAN.md`, `AGENTS.md`, configs, CI, `index.html`, `src/main.ts`, `src/game/**`.

## Conventions

- Sim units: tiles; time: seconds; fixed tick 25 Hz (`TICK_SECONDS`). Angles: radians, `atan2(dy,dx)`.
- Three.js mapping: sim (x, y) → world (x, 0, y). Isometric orthographic camera.
- IDs: camelCase def ids (`litesaberStrike`, `battleDroyd`). Level ids `a1.mossfields`.
- Model ids: `hero.<classId>`, `mon.<monsterId>`, `npc.<npcId>`, `item.<baseId>`, `prop.<name>`,
  `tile.<tileset>.<tileKind>`, `obj.<objectId>` (waypoint, chest, stash, portal, shrine). Unknown
  model ids MUST render as a procedural placeholder (the game must always run without assets).
- VFX ids: `vfx.<name>` registered in `data/vfx/*.ts` (`VfxDef`).
- D2 knowledge is the spec: when unsure about a formula/rule, use Diablo II (LoD 1.14 / D2R) behavior,
  except: continuous speed scaling (no breakpoints), no corpses (remnants), auto-identify.
- Tone (PLAN §2): no blood/gore/corpses. Organic enemies → dark smoke; droyds → sparks & scrap.
- Testing in a browser (Playwright etc.): always open the game muted with `?mute`
  (`http://localhost:5173/?mute`); it zeroes master volume for that page only, saved settings untouched.
- Formatting: Prettier (single quotes, width 110). Run `npm run format` before committing.

## Definition of done (every task)

1. `npm run typecheck && npm run lint && npm test` all pass. `npx vite build` passes.
2. New logic has Vitest tests (`*.test.ts` next to the code). Core math gets thorough tests.
3. Commit on your branch with a clear message. Final report: branch name, commit sha, what you
   built, public API summary, any contract change requests, known gaps/TODOs.
