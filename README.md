# Syndicate Sky 3884

> A sci-fi/cyberpunk vertical shooter inspired by *1942*.

Blast through waves of hostile corporate fleets, dodge relentless bullet patterns, and dismantle the rogue syndicates threatening the outer colonies.

---

## Controls

### Keyboard

| Key | Action |
|-----|--------|
| `← → ↑ ↓` / `W A S D` | Move spacecraft |
| `Space` / `Z` | Fire weapons |
| `Shift` | Boost (increased speed) |

### Touch (Mobile)

| Gesture | Action |
|---------|--------|
| **Tap & drag** | Move spacecraft toward touch point |
| **Double tap** | Fire weapons |
| **Hold** | Sustained fire after short delay |

---

## Features

- **Square 800×800 canvas** — high-resolution rendering that scales to fit any viewport
- **Arne16 palette** — every colour drawn from the strict 16-colour palette
- **Progressive waves** — enemy variety and difficulty scale with each wave
- **Boss fights** — every 5th wave features a powerful syndicate boss
- **Combo system** — chain kills for multiplied score
- **Power-ups** — collect weapon upgrades, shields, and extra lives
- **Particle effects** — neon explosions, engine trails, and cyberpunk ambiance
- **CRT scanline overlay** — retro aesthetic filter
- **High score** — persisted in `localStorage`
- **Zero dependencies** — pure HTML5 Canvas + vanilla JavaScript

---

## Arne16 Color Palette

All visuals use **only** these 16 hex colours:

| | | | |
|--|--|--|--|
| `#000000` Black | `#9D9D9D` Gray | `#FFFFFF` White | `#BE2633` Red |
| `#E06F8B` Pink | `#493C2B` Brown | `#A46422` Ochre | `#EB8931` Orange |
| `#F7E26B` Yellow | `#2F484E` Teal | `#44891A` Green | `#A3CE27` Lime |
| `#1B2632` Navy | `#005784` Blue | `#31A2F2` Sky | `#B2DCEF` Cyan |

---

## File Structure

```
syndicate-sky-3884/
├── index.html   — HTML shell, HUD overlay, start/game-over screens
├── game.js      — All game logic (entities, rendering, input, loop)
└── README.md    — This file
```

---

## Playing

Open **`index.html`** in any modern browser. No server required — it runs from the file system. For the best experience on mobile, add the page to your home screen for fullscreen playback.

---

*Syndicate Sky 3884 — Pure HTML5. No libraries. No excuses.*
