# Mochi Pal: notes for Claude Code

A virtual-pet web game (think "Talking Tom", but with an original character). Mochi is a squishy
rice-cake creature with a sprout on its head that grows as it levels up. Plain HTML/CSS/JS ES
modules, no framework, **no build step**. Hosted on GitHub Pages from the `main` branch root.

## Run, test, ship
- Run locally: `npm run dev`, then open http://localhost:8080 (any static server works; ES modules
  need http://, not file://).
- Automated playtest: `npm test` (Playwright, headless phone). It fails on any console error.
  Screenshots land in `tools/out/`. Look at them; don't just trust the exit code.
- Economy check: `npm run balance` prints how many days a light/casual/heavy player needs to reach
  each growth stage. Run it after changing any number in `js/data.js`.
- Before every deploy, bump `VERSION` in `sw.js`, or returning players keep the old cached files.

## Map
| File | Owns | Never put here |
|---|---|---|
| `js/data.js` | all content + tuning numbers (foods, hats, furs, quests, lines, decay, rewards) | logic |
| `js/store.js` | game state `S`, save/load/migrate, every rule that changes `S`; emits events | DOM |
| `js/pet.js` | drawing + animating Mochi (SVG, springs, expressions, hats) | game rules |
| `js/fx.js` | particles, floating text, screen shake | state |
| `js/ui.js` | sheet / card / toast / bubble helpers, `h()` DOM builder | game rules |
| `js/games.js` | mini-games (canvas). Return a score; main.js pays out | save data |
| `js/sfx.js` | every sound, synthesized with Web Audio (zero audio files) | |
| `js/voice.js` | talk-back: mic → detect speech → replay pitched up. Audio never leaves the device | |
| `js/main.js` | wiring: input, actions, menus, retention loops, boot | content numbers |
| `css/style.css` | design tokens on `:root`, sticker-toy look, time-of-day themes | |
| `sw.js` | offline cache (stale-while-revalidate) | |

Data flow: input → `main.js` → `store.*()` mutates `S` → `emit(event)` → HUD/listeners redraw.
The HUD is event-driven; don't poll `S` in the render loop (needs dials are the one exception, 2×/sec).

## Invariants (breaking these hurts real players)
1. **Never break old saves.** `S` is plain JSON with schema `v`. New field → add it to `fresh()` in
   store.js; `migrate()` merges old saves onto it. Renaming/removing a field needs a version bump and
   an explicit migration. Keep the `.bak` fallback in `load()`.
2. **Every `localStorage` access stays inside try/catch.** Private mode and blocked storage must still play.
3. **Content lives in `data.js`.** If you type a price, rate, XP amount or line of dialogue into
   main.js, move it to data.js.
4. **Mochi never dies, runs away, or guilt-trips.** Needs floor at `OFFLINE_FLOOR` while away.
   Retention comes from rewards and growth, never punishment. No real-money purchases, no ads,
   no dark patterns (fake timers, confirm-shaming, hidden costs).
5. **Repeatable actions have daily XP caps** (`DAILY_XP_CAP` in data.js), so spamming can't skip growth.
6. **Privacy:** no analytics, no network calls, no accounts. The mic is only used while the mic
   button is on, and audio is processed in memory.
7. **Mobile first.** Test at 390×844 and 360×640. Tap targets ≥ 44px. Respect
   `env(safe-area-inset-*)`. Respect `prefers-reduced-motion` *and* the in-game Reduce motion toggle.
8. **Original art only.** Mochi and every item are drawn in code (SVG/canvas). Don't add copyrighted
   characters, logos or ripped sprites.
9. **Comment the why, not the what.** Each file starts with a header comment saying what it owns.
   Comment non-obvious maths, tuning choices and browser workarounds.

## Style
- ES modules, 2-space indent, single quotes, semicolons, `const` first. Small pure helpers in util.js.
- Build DOM with `h('button.btn.btn-mango', { onclick }, 'Claim')` from ui.js; never use `innerHTML`
  with player-typed text.
- Colours come from CSS tokens (`--ink`, `--lagoon`, `--mango`, `--hibiscus`, `--leaf`, `--lilac`, `--rice`).
  The look is "sticker toy": 3px `--ink` outlines + hard offset shadow (`--pop`), squash on press.
- UI copy: sentence case, plain verbs, Mochi's voice is warm and silly. The button that says
  "Claim" leads to a toast that says "claimed". No ALL CAPS labels.
- Motion: ease with overshoot (`--spring`) for pops, `--settle` for exits. Juice must return to rest.

## Game feel tiers (from the bundled `game-feel` skill)
- small (tap, boop): sound + 2–4 particles
- medium (feed, quest claim, catch): sound + burst + floating text + squash
- large (level up, Day 7, jackpot, evolution): fanfare + confetti + shake 0.4–0.5 + card
Shake moves `#room` only (fx.js trauma model). Never shake on routine actions.

## Bundled skills (`.claude/skills/`)
Project skills, run as slash commands: `/add-content`, `/new-minigame`, `/juice-pass`,
`/balance-check`, `/playtest`, `/ship`.
Reference skills from gamedev-skills/awesome-gamedev-agent-skills (Apache-2.0, unmodified):
`game-feel`, `game-ui-ux`, `save-systems`, `audio-design`. Their code samples are Godot/Unity;
apply the *patterns* to this web stack (SVG + canvas + Web Audio).

## Definition of done
- `npm test` passes and you have looked at the new screenshots.
- Works at 390×844 and 360×640, keyboard reachable, no console errors.
- Old saves still load (`npm test` covers a v1 save). Any new state field is in `fresh()`.
- `sw.js` `VERSION` bumped and new files added to `SHELL` when you add files.
- Comments explain anything a newcomer wouldn't guess.

More ready-made feature prompts: see `PROMPTS.md`.
