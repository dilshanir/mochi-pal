---
description: Add new Mochi Pal content (a food, hat, glasses, fur colour, quest, or dialogue lines) the right way. Use when the user asks to add an item, snack, outfit, colour, quest or something Mochi says.
argument-hint: "[food|hat|face|fur|quest|lines] <what to add>"
---

Add this content to Mochi Pal: $ARGUMENTS

Work through it in this order. Read only the files named in each step.

1. **Data first (`js/data.js`).** Add the entry next to its siblings and copy their exact shape.
   - Food: `emoji, name, hunger, fun, price, level`. Keep hunger ÷ price close to its neighbours
     (about 1.5–2.5 hunger per coin). Pick a Unicode emoji from Emoji 13 or older so it renders on older phones.
   - Hat / face item: goes in `ITEMS` with `slot`, `price`, `level`; `exclusive: '<how to earn it>'` means it can't be bought.
   - Fur: `base`, `light`, `dark` hexes. `light` is a pastel of base, `dark` about 25% darker.
     Check the outline `#2E1F47` still reads clearly against `base`.
   - Quest: `{ id, text, n: [...] }`. `id` must be an event that `store.track(id)` already receives,
     or add a `store.track('<id>')` call where the action happens in `js/main.js`.
   - Lines: add to an existing `LINES` key, or create one and use it from main.js. `{pet}` and `{you}` get filled in.
2. **Art, only for hats/face items (`js/pet.js`).** Add a branch to `_drawHat` or `_drawFaceAcc`.
   Coordinates: hats are relative to the top-centre of the head (y grows downward; use
   `headHalfWidth(depth)` to fit the brim); glasses use `EYE_Y` / `EYE_DX`. Use the same stroke
   (`INK`, 4–4.5 width, round joins) and palette hexes. If the hat covers the top of the head,
   add its height to `HAT_LIFT` so the sprout pokes out of it.
3. **Nothing else should need to change.** The feed tray and wardrobe read straight from data.js.
   If you find yourself editing UI code to list the new thing, stop and ask why.
4. **Verify.** Run `npm test`, then render the new thing on Mochi with a quick Playwright
   screenshot at 390×844 (wardrobe tray open, item tried on) and look at it. Hats must not cover
   the eyes and must sit on the head at every growth stage (check stage 0 and stage 5).
5. **Balance.** If you added anything with a price or reward, run `npm run balance` and mention
   whether the "whole shop" time changed meaningfully.

Reply with: what you added, a screenshot path, and one line on balance impact.
