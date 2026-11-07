---
description: Release Mochi Pal to GitHub Pages (bump cache version, test, commit, push, confirm it's live).
disable-model-invocation: true
argument-hint: "[short note about what changed]"
---

Ship Mochi Pal. Change note: $ARGUMENTS

1. `git status`. If there are unrelated or surprising changes, list them and ask before continuing.
2. Bump `VERSION` in `sw.js` (`mochi-pal-vN` → `vN+1`). If files were added under `js/`, `css/`,
   `fonts/` or `icons/`, make sure they're in `SHELL` too.
3. Run `npm test`. Stop and report if anything fails.
4. Commit with a message in this shape: `<area>: <what players will notice>` (for example
   `wardrobe: add sun hat and three new fur colours`). Push to `main`.
5. GitHub Pages rebuilds in about a minute. Check that the live URL from the README loads and the
   new `VERSION` appears in `sw.js` there (`curl -s <url>/sw.js | head -8`).
6. Tell the user: the live link, what changed in one line, and that returning players get the
   update on their second visit (stale-while-revalidate).
