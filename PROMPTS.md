# Mochi Pal: prompt playbook for Claude Code

Copy a prompt, paste it into Claude Code inside this repo, and let it run. Each prompt is
self-contained: `CLAUDE.md` loads automatically, so the prompts don't repeat the house rules.

**Why these prompts work.** Each one has the same five parts. Keep them when you write your own:
1. **Outcome for the player**, not the code ("players come back to see…").
2. **Where it lives**: which files own it, so Claude doesn't scatter logic.
3. **Hard limits**: what must not break (saves, privacy, mobile, no guilt mechanics).
4. **Done means**: checkable acceptance criteria.
5. **Prove it**: run `npm test`, look at screenshots, report back in a fixed shape.

Slash commands already in the repo: `/add-content`, `/new-minigame`, `/juice-pass`,
`/balance-check`, `/playtest`, `/ship`. Use them for routine work; use the prompts below for features.

---

## 1. Sticker album (collections)
```text
Add a sticker album: players earn stickers for milestones (first bath, 7-day streak, catch 50 snacks,
reach each growth stage, try every food, etc. — design 24, mixing easy/medium/rare).
Where: sticker list in js/data.js; unlock checks in store.js, hooked into existing events
(track, levelup, daily), never by polling; album screen as a sheet in main.js opened from a new
side button; each new sticker pops a medium-tier toast + sparkle.
Limits: add `stickers: {}` to fresh() so old saves migrate; stickers are drawn in SVG/CSS,
no emoji-only art; locked stickers show a silhouette and a hint, never "???".
Done means: unlocks persist after reload, album shows x/24, the playtest covers one unlock.
Prove it: npm test, screenshot the album with 3 unlocked, list all 24 with their conditions.
```

## 2. Mochi's diary
```text
Give Mochi a diary that writes one short entry per real day from what actually happened
(foods eaten, games played, best score, who visited, mood), in Mochi's silly voice, 2–3 sentences.
Where: a daily summary object in S (rolled over in newDayCheck), entry text built from
templates in js/data.js (at least 30 sentence templates so it rarely repeats); diary sheet with
"Today", "Yesterday" and "On this day last week".
Limits: no network, no AI calls; keep only the last 60 days; old saves get an empty diary.
Done means: playing a session then time-travelling a day (edit lastSeen) produces a sensible entry.
Prove it: add a playtest step for this, show me 3 example entries generated from different days.
```

## 3. Sri Lankan festival events
```text
Add seasonal events that change the room and add limited items: Sinhala & Tamil New Year (Avurudu),
Vesak (lanterns), Deepavali, Christmas, and a "monsoon week" in May–June. Each event: window/room
decoration, 1 limited food, 1 limited hat, 3 themed lines for Mochi, and a banner on first visit.
Where: an EVENTS table in js/data.js with explicit start/end dates per year for 2026–2028
(Vesak and Deepavali move each year: look up the official dates, cite your sources in a comment,
don't guess); active-event check in store.js; visuals via CSS classes on #app.
Limits: limited items stay owned forever after the event; nothing is lost if you miss an event.
Done means: setting the device date into each event window shows the right decoration.
Prove it: a screenshot per event (fake the clock in Playwright), plus the date table with sources.
```

## 4. Sinhala and Tamil
```text
Make the game fully playable in English, Sinhala and Tamil, with a language picker in Settings and
auto-pick from navigator.language on first run.
Where: move every player-facing string (index.html, main.js, games.js, data.js names and LINES)
into js/i18n/{en,si,ta}.js with a t(key, vars) helper; {pet} and {you} placeholders keep working.
Fonts: Mochiy Pop One has no Sinhala/Tamil glyphs, so self-host Noto Sans Sinhala and Noto Sans
Tamil subsets (OFL) the same way fonts/ already works, and add them to the CSS font stacks + sw.js SHELL.
Limits: translations must sound natural and playful, not literal. Flag any you're unsure of
in a TODO list for a native speaker. Text must not overflow buttons at 360px in any language.
Done means: switching language updates the whole UI without reload, and the choice persists.
Prove it: screenshots of the room, feed tray and daily sheet in all three languages at 360×640.
```

## 5. Calendar reminder (a comeback hook that needs no server)
```text
Add "Remind me every day" in Settings: the player picks a time, and we generate an .ics file with a
daily recurring event ("Visit Mochi 🍙") whose URL/description links back to the game. On phones
the file opens straight into the calendar app.
Where: a small ics builder in js/util.js (RFC 5545: CRLF line endings, DTSTART with the player's
local TZID, RRULE:FREQ=DAILY, a VALARM 0 minutes before, a stable UID); button + time picker in
the settings sheet.
Limits: no network, no Notification permission prompts. Explain in one line what will happen
before the file downloads.
Done means: the file imports cleanly into Google Calendar and Apple Calendar (validate it with an
.ics validator and paste the result).
Prove it: show the generated file contents and a settings screenshot.
```

## 6. Friend visits with a share link (still no server)
```text
Let players send a link that makes their Mochi "visit" a friend's room. The link carries the
visiting pet's look in the URL hash (name, fur, hat, glasses, stage), signed with a short checksum
so typos don't crash anything. When opened, the visitor walks in, the two Mochis greet and bounce
together for ~8 seconds, and both players get a "friendship" gift once per friend per day.
Where: encode/decode in js/util.js; a second Pet instance in the room (pet.js already supports
several); visit flow in main.js; friends list (name + last visit day) in S with a migration.
Limits: never trust the hash; validate every field against data.js and fall back to defaults;
cap stored friends at 50. The visitor link must still open the normal game for new players
(hatch first, then the visit).
Done means: two Playwright contexts can exchange a link and both see the visit + gift.
Prove it: screenshots of the visit, and the decode function's tests for bad input.
```

## 7. Mochi Mart: a rotating daily shop
```text
Expand the economy: add 12 new wardrobe items (4 hats, 4 glasses/face, 4 furs, original designs
that suit a rice-cake pet), plus "Mochi Mart": each day 3 items are on sale at 30% off,
picked with the existing seeded RNG so every player sees the same deals that day.
Use /add-content for each item. Mart lives as a tab in the wardrobe; a countdown shows when the
deals change; the side badge lights up when today's deals include something unowned.
Limits: no fake urgency ("only 2 left!"), the sale is real and simple.
Done means: npm run balance shows a casual player needs 3+ weeks for the whole shop.
Prove it: wardrobe screenshots of every new item on Mochi at stage 1 and stage 5.
```

## 8. First-three-minutes polish
```text
Act as a mobile game UX lead. Play the first 3 minutes as a new player (fresh context, 390×844)
with Playwright, screenshot every 10 seconds, and write a friction log: every moment the player
might be confused, bored, or not know what to tap. Then fix the top 5 issues, which might mean
clearer tutorial bubbles, a pulsing hint on the first action, or a guaranteed level-up in the
first session. Keep the hatch → name → first daily reward flow. Use the game-ui-ux skill.
Done means: a new player reaches level 2 and opens every main action within 3 minutes without hints
from us. Prove it: before/after friction log and screenshots.
```

## 9. Low-end Android performance
```text
Profile Mochi Pal as if on a cheap Android phone: Playwright with CPU throttling 6× and a 360×640
viewport. Measure frame times in the room (idle, petting with heart particles, bath foam) and in
both mini-games. Target: no frame over 33 ms during normal play.
Fix the worst offenders (likely: SVG attribute churn in pet.js, particle count, canvas DPR,
layout reads in the loop). Keep the look identical.
Prove it: before/after frame-time table per scenario and the diff summary.
```

## 10. Third mini-game: Bubble Pop
```text
/new-minigame Bubble Pop: soap bubbles float up from Mochi's bath; tap them before they leave the
screen. Golden bubbles are worth 5, grey "stinky" bubbles cost a life. Speed ramps over 60 s.
Payout should feel similar to Snack Catch.
```

---

## Everyday helper prompts

**Plan before coding (use for anything bigger than an hour):**
```text
Before writing code, give me a plan for: <feature>. List the files you'll touch and why, the new
state fields and their migration, the UI states (empty, normal, error), and how you'll test it.
Wait for my OK.
```

**Bug report:**
```text
Bug: <what happened> when I <steps>, on <device/browser>. Expected: <what should happen>.
Reproduce it in Playwright first and show me the failing screenshot, then fix the root cause
(not the symptom), add a playtest step that would have caught it, and run npm test.
```

**Review before shipping:**
```text
Review the uncommitted changes as a senior game developer. Check: old saves still load, every
localStorage call is in try/catch, numbers live in data.js, nothing breaks at 360px, Reduce motion
is respected, new files are in sw.js SHELL. List problems by severity, then fix the real ones.
```
