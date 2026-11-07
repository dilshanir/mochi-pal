---
description: Design and build a new Mochi Pal mini-game on the shared canvas runner. Use when the user wants a new game, arcade mode, or "something else to play".
argument-hint: "<game idea in a sentence>"
---

Build a new mini-game for Mochi Pal: $ARGUMENTS

**Design first, in 5 lines max, then build.** State: the one verb the player repeats, the fail
condition, how difficulty ramps over ~60 seconds, what a "point" is, and a typical score for a
casual player (you need this for payouts). A round should last 30–90 seconds. One input only
(tap or drag) so it works on phones; add keyboard as a second input.

Build it the way `js/games.js` builds Snack Catch and Vine Hop:
1. A `makeX(fur, level)` factory returning `{ score, lives, update(dt) → 'over' | null, draw(dt), pointer?, tap?, key?, hint }`.
   `update` holds all rules; `draw` only paints. Use `dt` everywhere, never frame counts.
2. Draw Mochi with `drawMochi(ctx, x, feetY, r, fur, { sx, sy, tilt, eyes })`. Squash on impacts
   (`sx 1.15, sy 0.85` and spring back), `eyes: 'x'` when hurt, `'happy'` on a good move.
3. Juice by tier (see the `game-feel` skill): point = `sfx.pop()` + `pop('+1', …)`; streak every 5 = `sfx.coin()`;
   hit = `sfx.hurt()` + `shake(0.5)` + `vibrate(60)`. Nothing on routine frames.
4. Register it: add `kind` handling in `playGame()`; add an entry in `GAMES` in `js/data.js`
   (`name, emoji, blurb, coinsPer, xpPer, fun`). Pick `coinsPer` so a typical round pays 15–30 coins.
   Add a best score to `S.stats` in `fresh()` (store.js) and update it in `store.track`.
5. Add a quest to `QUESTS` for it (`'<kind>'` with `mode: 'max'`).
6. Pause on `visibilitychange` already works through the runner; don't add your own loop.

Verify: add a step to `tools/playtest.mjs` that starts the game, plays ~3 seconds of input and quits.
Run `npm test`, open the screenshot, and play a round yourself in headed Playwright if possible.
Run `npm run balance` after setting the payout and report the coin impact.
