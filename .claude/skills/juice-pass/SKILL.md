---
description: Make a Mochi Pal interaction feel more satisfying (sound, particles, squash, shake, text pops) without overdoing it. Use when something "feels flat", "needs juice", or after adding a new action.
argument-hint: "<interaction or screen>"
---

Do a juice pass on: $ARGUMENTS

Load the `game-feel` skill for the theory. Then:

1. **Find the event.** Locate the exact function in `js/main.js` (or `js/games.js`) where the action
   succeeds. Juice attaches there, never inside `store.js`.
2. **Decide its tier** and stay inside it:
   - small (taps, boops): 1 sound + 2–4 particles. No shake.
   - medium (feed, claim, catch, buy): sound + `burst()` + `floatText()` + a `pet.react()` squash.
   - large (level up, evolution, Day 7, jackpot): fanfare + `confettiRain()` + `shake(0.4–0.5)` + a card.
3. **Available tools:** `sfx.*` (js/sfx.js, add a new synthesized sound there if needed, ≤ 0.6 s),
   `burst(kind, x, y, n, opts)` with kinds heart, bubble, coin, confetti, sparkle, crumb, drop, note;
   `floatText(text, x, y, 'coin'|'xp'|'big')`; `shake(amount)`; `pet.react(name, ms)`; `pet.hop(v)`;
   `pet.squash(a)`; `vibrate(ms)`.
4. **Rules:** every effect returns to rest; nothing blocks input for more than ~150 ms; honour
   Reduce motion (fx.js and pet.js already scale down, so use their APIs rather than raw CSS animation);
   don't add an effect to something that happens every second.
5. **Write down the before/after** as a short list: event → channels added.

Verify with `npm test` and a screenshot taken mid-effect. If you can't see the difference in the
screenshot, it's probably too subtle for a phone. If it covers Mochi's face, it's too much.
