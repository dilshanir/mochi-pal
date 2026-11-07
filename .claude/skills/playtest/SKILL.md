---
description: Run Mochi Pal's automated playtest, review the screenshots, and report what looks or works wrong. Use after any change to the game, or when the user says test, check, or playtest.
---

Playtest Mochi Pal.

1. If `node_modules/playwright` is missing: `npm install` then `npx playwright install chromium`.
2. Run `npm test`. It plays the whole game on a headless phone (390×844), time-travels 9 hours to
   test the welcome-back flow, loads an old save, and checks a 360×640 screen.
3. Open **every** PNG in `tools/out/` and look for: overlapping text, Mochi hidden behind a sheet,
   cut-off buttons, unreadable contrast, a hat sitting wrong, empty states with no guidance.
4. If the change you're testing isn't covered, add a `step()` for it to `tools/playtest.mjs`
   (keep each step short and independent; call `closeSheet()` first).

Report as a short list: ✅ what passed, ❌ what failed with the screenshot name, and the one fix you
recommend first. Don't claim it passed if you didn't look at the screenshots.
