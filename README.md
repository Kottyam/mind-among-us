# ഉള്ളിലെ ശത്രു — The Mind Among Us

A dark escape-room puzzle thriller with 150+ puzzles and solo AI co-op. No chat box, no accounts, no paid APIs, no build step.

## How It Plays

- **Escape Mode (3 Chambers):** Unlock three vault doors by cracking lock pins. Each pin is a puzzle drawn randomly from a **154-puzzle bank** across 8 categories (Malayalam കടങ്കഥ riddles, math, sequences, logic, ciphers, word scrambles, SVG visual puzzles, and memory flashes).
- **100-Puzzle Challenge (Marathon):** Play through 20 vault locks (100 puzzles total) with team help.
- **Team Cooperation & The Mind Twist:** Four AI teammates solve pins alongside you. Ask any teammate for help when stuck, or step in to solve their stuck puzzles (+10s bonus). One teammate is secretly **ഉള്ളിലെ ശത്രു (The Mind)** and may feed you wrong hints or lock a corrupted pin — inspect pins or accuse suspects to lock them out.

## Files

- `puzzles.js` — 154-puzzle bank + SVG diagram helpers
- `logic.js` — JSON-serializable game engine (ready for future room-code multiplayer)
- `game.js`, `styles.css`, `index.html` — mobile-first dark escape-room UI + WebAudio SFX
- `test.js` — automated puzzle bank & playthrough tests

## Test

```bash
node --check puzzles.js logic.js game.js test.js
node test.js
```
