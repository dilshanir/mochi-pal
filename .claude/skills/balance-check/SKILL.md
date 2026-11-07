---
description: Check and tune Mochi Pal's economy and growth pacing (XP curve, coin rewards, prices, need decay). Use when the user asks about balance, progression speed, "too easy/too grindy", or after changing numbers in data.js.
argument-hint: "[what feels off, optional]"
---

Review Mochi Pal's balance. Player concern (may be empty): $ARGUMENTS

1. Run `npm run balance` and read the table.
2. Judge it against these targets for a daily-habit pet game:
   - Casual player: first evolution (Seedling) on **day 1**, Blossom in **~2 weeks**, Starbloom in **~6–7 weeks**.
   - Light player (one short visit a day) reaches Blossom within ~6 weeks, so they don't give up.
   - Needs: from full, the lowest need should cross 25% after roughly **8–12 hours** away, so one
     morning + one evening visit keeps Mochi happy. Compute this from `DECAY` in `js/data.js`.
   - A casual player can afford a new wardrobe item every 1–3 days, and the whole shop takes
     at least 2 weeks. If it takes less, the fix is usually more items, not higher prices.
3. Propose changes **only in `js/data.js`** (xpNeed, rewards, prices, DECAY, DAILY_XP_CAP). Show a
   before/after table. Change as few numbers as possible.
4. Apply them, rerun `npm run balance`, and show the new table.
5. Old saves keep their level and XP; tell the user if a change would make existing players
   suddenly level up several times (a big xpNeed cut does that).

Never make Mochi able to die, and never add punishments for missing days. Faster rewards are fine,
guilt is not.
