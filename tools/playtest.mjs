// Automated playtest: plays through the whole game on a headless phone and fails on any error.
// Usage: npm test   (first time: npm install && npx playwright install chromium)
// Screenshots go to tools/out/. Open them: a passing run can still look wrong.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const OUT = new URL('./out/', import.meta.url).pathname;
await mkdir(OUT, { recursive: true });
const server = await serve(0);
const URL_ = `http://localhost:${server.address().port}/`;
const KEY = 'mochi-pal-save-v1';
const problems = [];
const step = async (name, fn) => {
  try { await fn(); console.log('  ok  ', name); }
  catch (e) { problems.push(`${name}: ${e.message.split('\n')[0]}`); console.log('  FAIL', name); }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: false });
const watch = p => {
  p.on('pageerror', e => problems.push('page error: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
};
let p = await ctx.newPage(); watch(p);
const shot = n => p.screenshot({ path: `${OUT}${n}.png` });
// Level-up / gift cards can pop up at any time (that's the game working). Dismiss them first.
const dismissCards = async () => {
  for (let i = 0; i < 4 && await p.locator('#overlay:not([hidden])').count(); i++) {
    await p.locator('#card .btn').last().click(); await p.waitForTimeout(350);
  }
};
const closeSheet = async () => {
  await dismissCards();
  if (await p.locator('#sheet:not([hidden])').count()) await p.click('#sheetClose');
  await p.waitForTimeout(300);
  await dismissCards();
};

console.log('Mochi Pal playtest');
await p.goto(URL_);
await step('hatch the egg', async () => {
  for (let i = 0; i < 5; i++) { await p.click('.egg-wrap'); await p.waitForTimeout(120); }
  await p.waitForSelector('text=Say hello!', { timeout: 3000 });
});
await step('name the pet', async () => {
  await p.fill('.card input[aria-label="Pet name"]', 'Tester');
  await p.click('.card .btn-wide');
  await p.waitForSelector('#overlay', { state: 'hidden' });
  await shot('01-room');
});
await step('claim the daily reward', async () => {
  await p.click('#dailyBtn'); await p.waitForTimeout(400);
  await p.click('#sheet .btn-mango'); await p.waitForTimeout(400);
  if ((await p.textContent('#streak')).trim() !== '1') throw new Error('streak did not become 1');
  await closeSheet();
});
await step('feed', async () => {
  await p.click('[data-act=feed]'); await p.waitForTimeout(500);
  await p.click('#sheet .tile >> nth=0'); await p.waitForTimeout(1300);
  await shot('02-feed'); await closeSheet();
});
await step('wardrobe try-on', async () => {
  await p.click('[data-act=style]'); await p.waitForTimeout(500);
  await p.click('#sheet .tile >> nth=1'); await p.waitForTimeout(300);
  await shot('03-wardrobe'); await closeSheet();
});
await step('bath: scrub and rinse', async () => {
  await p.click('[data-act=bath]');
  const r = await p.locator('#petWrap').boundingBox();
  await p.mouse.move(r.x + r.width * 0.35, r.y + r.height * 0.65); await p.mouse.down();
  for (let i = 0; i < 30; i++) await p.mouse.move(r.x + r.width * (0.3 + 0.4 * Math.abs(Math.sin(i / 4))), r.y + r.height * 0.62, { steps: 2 });
  await p.mouse.up(); await shot('04-bath');
  await p.click('#modeBar .btn >> nth=0'); await p.waitForTimeout(1800);
});
await step('pet + tickle', async () => {
  const r = await p.locator('#petWrap').boundingBox();
  await p.mouse.move(r.x + r.width * 0.35, r.y + r.height * 0.55); await p.mouse.down();
  for (let i = 0; i < 10; i++) await p.mouse.move(r.x + r.width * (0.35 + (i % 2) * 0.3), r.y + r.height * 0.55, { steps: 4 });
  await p.mouse.up();
  await p.mouse.click(r.x + r.width * 0.5, r.y + r.height * 0.85);
});
await step('mini-game: Snack Catch', async () => {
  await closeSheet();
  await p.click('[data-act=play]'); await p.waitForTimeout(400);
  await p.click('#sheet .row >> nth=0 >> .btn'); await p.waitForTimeout(300);
  await p.click('#gameMsg .btn');
  for (let i = 0; i < 20; i++) { await p.mouse.move(60 + (i * 41) % 280, 600); await p.waitForTimeout(90); }
  await shot('05-catch'); await p.click('#gameQuit'); await p.waitForTimeout(600);
});
await step('mini-game: Vine Hop', async () => {
  await closeSheet();
  await p.click('[data-act=play]'); await p.waitForTimeout(400);
  await p.click('#sheet .row >> nth=1 >> .btn'); await p.waitForTimeout(300);
  await p.click('#gameMsg .btn');
  for (let i = 0; i < 6; i++) { await p.mouse.click(200, 400); await p.waitForTimeout(600); }
  await shot('06-hop'); await p.click('#gameQuit'); await p.waitForTimeout(600);
});
await step('quests + settings open', async () => {
  await closeSheet();
  await p.click('#questBtn'); await p.waitForTimeout(300); await shot('07-quests'); await closeSheet();
  await p.click('#settingsBtn'); await p.waitForTimeout(300); await shot('08-settings'); await closeSheet();
});

// Time travel: pretend the player was away 9 hours, then reopen.
await p.close();
p = await ctx.newPage(); watch(p);
await p.goto(URL_ + 'manifest.webmanifest');
await p.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.lastSeen -= 9 * 3600e3; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
await p.goto(URL_);
await step('welcome-back card after 9h away', async () => {
  await p.waitForSelector('.card h2', { timeout: 3000 });
  await shot('09-welcome-back');
  await p.click('.card .btn');
});

// An old, minimal v1 save (missing newer fields) must load without wiping the pet.
await p.close();
p = await ctx.newPage(); watch(p);
await p.goto(URL_ + 'manifest.webmanifest');
await p.evaluate(k => localStorage.setItem(k, JSON.stringify({
  v: 1, hatched: true, created: Date.now() - 3 * 864e5, lastSeen: Date.now(),
  pet: { name: 'Oldie', fur: 'mint' }, needs: { hunger: 50, energy: 50, fun: 50, clean: 50 }, level: 6, xp: 10, coins: 123,
})), KEY);
await p.goto(URL_);
await step('old save migrates', async () => {
  await p.waitForTimeout(800);
  if ((await p.textContent('#petNameLbl')).trim() !== 'Oldie') throw new Error('pet name lost');
  if ((await p.textContent('#lvlNum')).trim() !== '6') throw new Error('level lost');
});
await step('small phone layout (360×640)', async () => {
  await closeSheet();
  if (await p.locator('#overlay:not([hidden])').count()) await p.keyboard.press('Escape');
  await p.setViewportSize({ width: 360, height: 640 }); await p.waitForTimeout(400);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) throw new Error('horizontal scroll at 360px');
  await shot('10-small-phone');
});

await browser.close();
server.close();
const real = problems.filter(m => !/ERR_TUNNEL|ERR_PROXY|net::ERR_NAME/.test(m));
console.log(real.length ? `\n${real.length} problem(s):\n- ${real.join('\n- ')}` : `\nAll good. Screenshots in ${OUT}`);
process.exit(real.length ? 1 : 0);
