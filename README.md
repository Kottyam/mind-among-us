# ഉള്ളിലെ ശത്രു — The Mind Among Us

A psychological-thriller social-deduction mind game. Solo demo: you play against five rule-based AI characters. No accounts, no paid APIs, no build step.

## Play

Open `index.html` in a browser, or serve the folder as a static site.

One round is about 10 minutes and has three stages (code lock, three boxes, three doors). Each person gets a private clue. One participant is secretly **The Mind** and misleads the team. After every stage there is a discussion and a vote to eject a suspect. Wrong answers and wrong ejections cost the team; three mistakes and the room closes.

Replayability: the Mind, clues, puzzles, bot names, and personalities are randomized each game.

## Files

- `index.html`, `styles.css`, `game.js` — UI
- `logic.js` — game engine (also used by tests)
- `test.js` — Node sanity checks
- `manifest.json` — add-to-home-screen
- `vercel.json` — static deploy

## Test

```bash
node --check logic.js game.js test.js
node test.js
```

Group (multiplayer) mode is not in this demo.
