# Diablo Tiny Error

A Diablo II–style action RPG for kids, set in a slightly misspelled galaxy. Runs in the browser
(desktop, Chromebook, iPad). See `PLAN.md` for the design and `AGENTS.md` for engineering rules.

## Play it on your computer

You need [Node.js 22+](https://nodejs.org) and git.

```bash
git clone https://github.com/nelashvili/diablo-tiny-error.git
cd diablo-tiny-error
git checkout claude/trusting-johnson-w0uzzt   # until this branch is merged into main
npm install
npm start                                       # opens http://localhost:5173
```

Play on an iPad or another device on the same Wi-Fi: `npm run dev -- --host`, then open the
"Network" URL it prints.

### Controls

|                     |                                                     |
| ------------------- | --------------------------------------------------- |
| Left click          | Move / attack / talk / pick up (hold to keep going) |
| Right click         | Use right-hand skill                                |
| Shift + click       | Attack without moving                               |
| 1–4                 | Use belt (Bakta stims)                              |
| F1–F8               | Pick right-hand skill                               |
| I / C / S / Q / Tab | Inventory / Character / Skills / Quests / Map       |
| T                   | Recall portal to town                               |
| Esc                 | Close panels                                        |

On touch screens: left thumb joystick to move, right thumb skill wheel to fight.

## Develop

```bash
npm run check      # typecheck + lint + unit tests
npm run build      # production build into dist/
npm run test:e2e   # Playwright smoke tests
```

Deployed on Vercel as a static site (`vercel.json`).
