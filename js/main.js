// Mochi Pal: entry point. Wires the pet, the room, the menus and the daily loops together.
//
// Map of the codebase (more detail in CLAUDE.md):
//   data.js   all content + tuning numbers (foods, hats, quests, decay rates, lines)
//   store.js  game state `S`, saving, and every rule that changes it (emits events)
//   pet.js    draws + animates Mochi (SVG springs). No game rules inside.
//   fx.js     particles, floating text, screen shake
//   ui.js     sheet / card / toast / speech-bubble helpers + h() DOM builder
//   games.js  Snack Catch + Vine Hop (canvas)
//   sfx.js    synthesized sounds (Web Audio, zero audio files)
//   voice.js  talk-back: records your voice and repeats it squeaky
//
// Why players come back (the retention loops, all in store.js + here):
//   1. Needs drop in real time while you are away; Mochi is visibly hungry/sleepy/dirty.
//   2. Daily login calendar with a streak and exclusive Day-7 rewards.
//   3. Three fresh daily quests + a bonus chest when all are done.
//   4. A gift box that refills every 3 hours (shows a live countdown).
//   5. Growth: the sprout on Mochi's head evolves at levels 4, 8, 12, 15 and 25.
//   6. "Welcome back" card with coins Mochi found while you were away.
//   7. The tab title changes when Mochi needs you, and the app badge counts ready rewards.
// Mochi never dies or runs away: needs bottom out at a floor. Kind loops, no guilt traps.
import { $, $$, clamp, rand, pick, dayKey, fmtDur, fmtClock, reducedMotion } from './util.js';
import {
  FOODS, ITEMS, FURS, STARTER_FURS, STAGES, LINES, STREAK_LINES, DAILY, DECAY, xpNeed,
  GAMES, GAME_ENERGY_COST, MIN_ENERGY_TO_PLAY, ROUND_XP_MAX, DAILY_XP_CAP, DANCE, QUEST_REWARD, QUEST_BONUS,
} from './data.js';
import * as store from './store.js';
import { S, on, fill, petName } from './store.js';
import { sfx, unlockAudio, setSound, soundOn, playDanceTune } from './sfx.js';
import { Talker, micSupported, speak, ttsSupported } from './voice.js';
import { Pet } from './pet.js';
import { initFx, burst, floatText, shake, confettiRain, updateFx, setReducedFx } from './fx.js';
import { initUI, openSheet, closeSheet, refreshSheet, sheetId, showCard, closeCard, cardShowing, toast, say, hush, h } from './ui.js';
import { playGame } from './games.js';

// ---------- session-only state (never saved) ----------
let pet;                    // the main Mochi
const pets = [];            // every animated Pet (main + previews inside cards)
let mode = 'room';          // room | bath | game
let talker = null;
let preview = null;         // wardrobe try-on: { slot: 'hat'|'face'|'fur', id }
let lastInteract = performance.now();
let nextChatter = performance.now() + 9000;
let pokes = [];
let lastPurr = 0, lastScrub = 0, lastSnore = 0;
let bath = null;            // { start, rubbed }
let danceUntil = 0;
let deferredInstall = null; // beforeinstallprompt event (Chrome/Edge/Android)
let lastDay = dayKey();
let heldCards = [];         // cards waiting until a mini-game ends
const app = $('#app');
const fmtN = n => Math.round(n).toLocaleString();
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// Like el.append, but skips null/false so optional pieces can be written inline.
const add = (el, ...kids) => el.append(...kids.flat().filter(k => k != null && k !== false));
const rectCenter = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

// =====================================================================
// Boot
// =====================================================================
function boot() {
  store.load();
  setSound(S.settings.sound);
  applyMotion();
  initUI();
  initFx({ canvasEl: $('#fx'), textLayer: $('#textLayer'), shakeTarget: $('#room') });
  pet = new Pet($('#petWrap'));
  pets.push(pet);
  refreshLook();
  setSleepVisual(S.sleeping);
  bindEvents();
  updateTimeOfDay();

  const off = store.applyOffline();
  renderHUD();
  renderNeeds();
  requestAnimationFrame(loop);

  if (!S.hatched) startHatch();
  else welcome(off);
  registerSW();
}

function applyMotion() {
  const on = S.settings.reduceMotion || reducedMotion();
  app.classList.toggle('reduce-motion', !!S.settings.reduceMotion);
  setReducedFx(on);
  if (pet) pet.setReducedMotion(on);
}

// Everything that changes how Mochi looks goes through here (wardrobe previews included).
function refreshLook() {
  const look = { fur: S.pet.fur, stage: store.stageIndex(), hat: S.wear.hat, face: S.wear.face };
  if (preview) {
    if (preview.slot === 'fur') look.fur = preview.id;
    else look[preview.slot] = preview.id;
  }
  pet.setLook(look);
}

// =====================================================================
// Main loop: needs tick in real time; slower checks run twice a second.
// =====================================================================
let last = performance.now(), lastWall = Date.now(), slowAcc = 0, saveAcc = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const wall = Date.now();
  // If frames stopped for a while (tab hidden, phone locked), count it as time away.
  if (wall - lastWall > 4000 && S.hatched) resumeFromAway();
  lastWall = wall;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (S.hatched) { store.tickNeeds(dt); S.lastSeen = wall; }
  for (const p of pets) p.update(dt, now);
  updateFx(dt);
  slowAcc += dt;
  if (slowAcc >= 0.5) { slowAcc = 0; slowTick(now); }
  saveAcc += dt;
  if (saveAcc >= 8) { saveAcc = 0; store.save(); }
}

function slowTick(now) {
  renderNeeds();
  updateMood();
  renderGift();
  placeBubble();
  const today = dayKey();
  if (today !== lastDay) { // midnight rolled over while playing
    lastDay = today;
    store.newDayCheck();
    renderHUD();
    toast('A new day! Fresh quests and a daily reward are waiting.');
  }
  if (S.sleeping) {
    if (S.needs.energy >= 99.5) wakeUp(false, true);
    else if (now - lastSnore > 3200) { lastSnore = now; sfx.snore(); }
    updateModeBar();
  }
  if (now > nextChatter) chatter(now);
  // Idle look-around when nobody has touched the screen for a while.
  if (now - lastInteract > 3500 && Math.random() < 0.25) pet.lookAt(rand(-1, 1), rand(-0.6, 0.5));
  if (now % 60000 < 500) updateTimeOfDay();
  updateBadge();
}

function resumeFromAway() {
  const off = store.applyOffline();
  if (off.hours >= 0.5) welcome(off);
  else if (off.found) store.addCoins(off.found);
  renderHUD();
}

// The window sky follows the player's real clock.
function updateTimeOfDay() {
  const hr = new Date().getHours() + new Date().getMinutes() / 60;
  app.dataset.tod = hr >= 5 && hr < 10 ? 'morning' : hr < 17 ? 'day' : hr < 19.5 ? 'evening' : 'night';
}
const timeLines = () => {
  const t = app.dataset.tod;
  return t === 'morning' ? LINES.morning : t === 'day' ? LINES.noon : t === 'evening' ? LINES.evening : LINES.night;
};

// =====================================================================
// HUD (event-driven: store emits, we redraw only what changed)
// =====================================================================
function renderHUD() {
  $('#lvlNum').textContent = S.level;
  $('#petNameLbl').textContent = petName();
  $('#stageLbl').textContent = store.stage().name;
  $('#xpFill').style.width = clamp((S.xp / xpNeed(S.level)) * 100, 0, 100) + '%';
  $('#coins').textContent = fmtN(S.coins);
  const st = store.dailyStatus();
  $('#streak').textContent = st.streak;
  $('#dailyBadge').hidden = st.claimed || !S.hatched;
  const q = store.questsReady();
  $('#questBadge').hidden = !q;
  $('#questBadge').textContent = q;
  renderGift();
}

function renderNeeds() {
  for (const el of $$('.need')) {
    const k = el.dataset.need;
    const v = S.needs[k];
    el.querySelector('.dial').style.setProperty('--v', v.toFixed(1));
    el.classList.toggle('low', v < 25);
    el.classList.toggle('mid', v >= 25 && v < 50);
    el.setAttribute('aria-label', `${el.querySelector('.need-lbl').textContent} ${Math.round(v)}%`);
  }
}

function renderGift() {
  const ready = store.giftReady();
  $('#giftBtn').classList.toggle('ready', ready && S.hatched);
  $('#giftTimer').textContent = ready ? 'Open!' : fmtClock(S.gift.nextAt - Date.now());
}

// Speech bubble floats just above Mochi's sprout, wherever Mochi currently is.
function placeBubble() {
  const room = $('#room').getBoundingClientRect();
  const y = clamp(pet.crownClientY() - room.top - 6, 70, room.height * 0.7);
  $('#room').style.setProperty('--head-y', y + 'px');
}

// Tab title + home-screen badge: the gentle "come back" nudges.
function updateBadge() {
  const n = store.questsReady() + (store.dailyStatus().claimed ? 0 : 1) + (store.giftReady() ? 1 : 0);
  try { if (navigator.setAppBadge) n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch (e) { /* unsupported */ }
}
let hiddenTimer = 0;
function hiddenTitle() {
  // Project needs forward (nothing ticks while hidden) and say what Mochi needs most.
  const hrs = (Date.now() - S.lastSeen) / 3600000;
  const proj = k => S.needs[k] - (S.sleeping && k === 'energy' ? 0 : DECAY[k] * hrs);
  const low = ['hunger', 'energy', 'fun', 'clean'].map(k => [k, proj(k)]).sort((a, b) => a[1] - b[1])[0];
  const word = { hunger: 'hungry', energy: 'sleepy', fun: 'bored', clean: 'a bit stinky' }[low[0]];
  if (low[1] < 30) document.title = `(!) ${petName()} is ${word}`;
  else if (store.giftReady()) document.title = `🎁 A gift is waiting | Mochi Pal`;
  else document.title = `${petName()} misses you | Mochi Pal`;
}

on('coins', ({ delta }) => {
  $('#coins').textContent = fmtN(S.coins);
  if (delta > 0) { const b = $('#coinsBtn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
});
on('xp', () => { $('#xpFill').style.width = clamp((S.xp / xpNeed(S.level)) * 100, 0, 100) + '%'; });
on('needs', () => renderNeeds());
on('quests', () => { renderHUD(); refreshSheet('quests'); });
on('daily', () => renderHUD());
on('questdone', q => {
  sfx.fanfare();
  toast(`Quest done: ${store.questText(q)}. Claim it in Quests.`);
  renderHUD();
});
on('levelup', d => {
  renderHUD();
  refreshLook();
  queueCard(() => levelCard(d));
});

// Cards that would pop up during a mini-game wait until it ends.
function queueCard(fn) { if (mode === 'game') heldCards.push(fn); else fn(); }

// =====================================================================
// Mood, idle chatter
// =====================================================================
function moodKey() {
  if (S.sleeping) return 'sleep';
  const m = store.mood();
  if (m.lowVal < 22) return { hunger: 'hungry', energy: 'tired', fun: 'bored', clean: 'dirty' }[m.lowKey];
  if (m.avg < 40) return 'sad';
  return 'content';
}
function updateMood() {
  pet.setMood(moodKey());
  pet.setDirt(clamp((55 - S.needs.clean) / 45, 0, 1));
}

const busy = () => mode !== 'room' || cardShowing() || (talker && talker.on) || performance.now() < danceUntil;

function chatter(now) {
  nextChatter = now + rand(16000, 28000);
  if (busy() || S.sleeping || !S.hatched || document.hidden) return;
  const m = store.mood();
  let pool;
  if (m.lowVal < 30) pool = LINES[{ hunger: 'hungry', energy: 'tired', fun: 'bored', clean: 'dirty' }[m.lowKey]];
  else { const r = Math.random(); pool = r < 0.4 ? timeLines() : r < 0.75 ? LINES.idle : LINES.happy; }
  talk(fill(pick(pool)));
  if (m.avg > 70 && Math.random() < 0.4) pet.hop(260);
}

// Mochi "says" something: bubble + babble sound + moving mouth.
function talk(text, ms = 3000) {
  say(text, ms);
  const dur = sfx.babble(Math.min(6, 2 + Math.floor(text.length / 12)));
  if (!soundOn()) return;
  pet.setTalkLevel(() => Math.abs(Math.sin(performance.now() / 70)) * 0.75);
  setTimeout(() => { if (!(talker && talker.state === 'speak')) pet.setTalkLevel(null); }, dur * 1000);
}

// =====================================================================
// Touching Mochi: boop (head), tickle (tummy), stroke (drag) and scrub (bath)
// =====================================================================
let ptr = null;
function bindPet() {
  const wrap = $('#petWrap');
  wrap.addEventListener('pointerdown', e => {
    unlockAudio();
    const region = pet.regionAt(e.clientX, e.clientY);
    if (!region) return;
    e.preventDefault();
    try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
    ptr = { x: e.clientX, y: e.clientY, travel: 0, acc: 0, t0: performance.now(), region };
    markInteract();
    if (mode === 'bath') scrub(e, 0);
  });
  wrap.addEventListener('pointermove', e => {
    if (!ptr) return;
    const d = Math.hypot(e.clientX - ptr.x, e.clientY - ptr.y);
    ptr.x = e.clientX; ptr.y = e.clientY; ptr.travel += d; ptr.acc += d;
    if (mode === 'bath') { scrub(e, d); return; }
    if (S.sleeping || mode !== 'room') return;
    if (ptr.acc > 70 && pet.regionAt(e.clientX, e.clientY)) { ptr.acc = 0; stroke(e); }
  });
  const up = () => {
    if (!ptr) return;
    const p = ptr; ptr = null;
    if (p.travel < 14 && performance.now() - p.t0 < 450 && mode === 'room') tapPet(p.region, p.x, p.y);
  };
  wrap.addEventListener('pointerup', up);
  wrap.addEventListener('pointercancel', () => { ptr = null; });
  wrap.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const c = rectCenter(wrap);
    tapPet(e.shiftKey ? 'belly' : 'head', c.x, c.y);
  });
  // Eyes follow the pointer anywhere in the room.
  $('#room').addEventListener('pointermove', e => { pet.lookAtClient(e.clientX, e.clientY); lastInteract = performance.now(); });
}
const markInteract = () => { lastInteract = performance.now(); nextChatter = Math.max(nextChatter, lastInteract + 9000); };

function tapPet(region, x, y) {
  if (S.sleeping) return wakeUp(true);
  const now = performance.now();
  pokes = pokes.filter(t => now - t < 3500);
  pokes.push(now);
  if (pokes.length >= 9) { // too many pokes: Mochi gets grumpy (keeps poking from being free fun)
    pokes = [];
    pet.react('annoyed', 1400); sfx.nope();
    say(fill(pick(LINES.annoyed)));
    store.changeNeed('fun', -2);
    return;
  }
  if (region === 'belly') {
    sfx.giggle(); pet.react('giggle', 1100);
    burst('sparkle', x, y, 6);
    store.changeNeed('fun', 3);
    store.track('tickle');
    store.addXP(2, 'tickle', DAILY_XP_CAP.tickle);
    if (Math.random() < 0.3) say(pick(LINES.tickle), 1600);
  } else if (region === 'head') {
    sfx.boop(); pet.react('boop', 520);
    burst('sparkle', x, y, 4);
    store.changeNeed('fun', 1);
  } else {
    pet.react(Math.random() < 0.5 ? 'surprised' : 'happy', 700);
    if (Math.random() < 0.35) talk(fill(pick(LINES.happy)));
    else sfx.pop();
    store.changeNeed('fun', 1);
  }
}

function stroke(e) {
  const now = performance.now();
  if (now - lastPurr > 650) { lastPurr = now; sfx.purr(); }
  pet.react('love', 800);
  burst('heart', e.clientX, e.clientY - 10, 2, { angle: -Math.PI / 2, spread: 0.9, speed: [60, 150] });
  store.changeNeed('fun', 1.2);
  store.track('pet');
  store.addXP(1, 'pet', DAILY_XP_CAP.pet);
  if (Math.random() < 0.06) say(pick(LINES.pet), 1800);
}

// =====================================================================
// Bath: scrub foam onto Mochi, then rinse
// =====================================================================
function enterBath() {
  if (S.sleeping) return toast(`${petName()} is asleep. Tap Wake first.`);
  closeSheet(true);
  mode = 'bath';
  bath = { start: S.needs.clean, rubbed: 0 };
  app.classList.add('bath-mode');
  setActive('bath');
  say(S.needs.clean > 90 ? pick(LINES.bathClean) : pick(LINES.bathStart), 2600);
  updateModeBar();
}
function scrub(e, dist) {
  if (!pet.regionAt(e.clientX, e.clientY)) return;
  bath.rubbed += dist;
  const now = performance.now();
  if (now - lastScrub > 90) { lastScrub = now; sfx.scrub(); }
  if (bath.rubbed > 16 || dist === 0) {
    bath.rubbed = 0;
    const p = pet.toSvg(e.clientX, e.clientY);
    pet.addFoam(p.x, p.y); // visual only; stops adding at a cap, cleaning keeps going
    store.changeNeed('clean', 0.8);
    if (Math.random() < 0.3) { burst('bubble', e.clientX, e.clientY, 1, { angle: -Math.PI / 2, speed: [30, 90] }); sfx.bubble(); }
    if (Math.random() < 0.08) pet.react('giggle', 500);
    updateModeBar();
  }
}
function rinse() {
  if (pet.foamCount() < 4) { say('Scrub me with bubbles first!', 1800); pet.react('nope', 600); return; }
  sfx.splash();
  const r = $('#petWrap').getBoundingClientRect();
  for (let i = 0; i < 6; i++) setTimeout(() => burst('drop', r.left + rand(r.width * 0.2, r.width * 0.8), r.top + r.height * 0.15, 6, { angle: Math.PI / 2, spread: 0.3, speed: [80, 240] }), i * 90);
  setTimeout(() => {
    pet.clearFoam();
    store.changeNeed('clean', 6);
    const c = rectCenter($('#petWrap'));
    burst('sparkle', c.x, c.y, 10);
    pet.react('happy', 900);
    sfx.chest();
    if (S.needs.clean - bath.start >= 12 || S.needs.clean >= 95) {
      store.track('bath');
      store.addXP(8);
      floatText('+8 XP', c.x, c.y - 60, 'xp');
    }
    talk(pick(LINES.clean));
    setTimeout(exitBath, 900);
  }, 600);
}
function exitBath() {
  if (mode !== 'bath') return;
  mode = 'room';
  pet.clearFoam();
  app.classList.remove('bath-mode');
  setActive(null);
  updateModeBar();
}

// =====================================================================
// Sleep
// =====================================================================
function toggleSleep() { if (S.sleeping) wakeUp(false); else tuckIn(); }
function tuckIn() {
  if (mode === 'bath') exitBath();
  if (S.needs.energy > 80) { pet.react('nope', 800); say(pick(LINES.notSleepy)); return; }
  S.sleeping = true;
  setSleepVisual(true);
  sfx.whoosh();
  say(fill(pick(LINES.goodnight)), 2200);
  store.track('sleep');
  store.saveSoon();
}
function wakeUp(grumpy, rested = false) {
  S.sleeping = false;
  setSleepVisual(false);
  if (rested) { pet.react('happy', 1000); sfx.levelup(); talk(pick(LINES.rested)); }
  else if (grumpy && S.needs.energy < 70) { pet.react('wake', 1600); say(pick(LINES.wake)); sfx.nope(); }
  else pet.react('wake', 700);
  store.saveSoon();
}
function setSleepVisual(on) {
  pet.setSleeping(on);
  app.classList.toggle('sleeping', on);
  $('#sleepLbl').textContent = on ? 'Wake' : 'Sleep';
  setActive(on ? 'sleep' : null);
  updateModeBar();
}

// The little bar at the bottom of the room for bath / sleep progress.
function updateModeBar() {
  const bar = $('#modeBar');
  if (mode === 'bath') {
    bar.hidden = false;
    if (!bar.dataset.mode || bar.dataset.mode !== 'bath') {
      bar.dataset.mode = 'bath';
      bar.innerHTML = '';
      bar.append(
        h('div.meter', {}, h('i', { id: 'modeFill' }), h('span', { id: 'modeTxt' })),
        h('button.btn', { onclick: () => { sfx.tap(); rinse(); } }, 'Rinse'),
        h('button.btn.btn-ghost', { onclick: () => { sfx.tap(); exitBath(); } }, 'Done'));
    }
    $('#modeFill').style.width = S.needs.clean + '%';
    $('#modeTxt').textContent = `Clean ${Math.round(S.needs.clean)}%`;
  } else if (S.sleeping) {
    bar.hidden = false;
    if (bar.dataset.mode !== 'sleep') {
      bar.dataset.mode = 'sleep';
      bar.innerHTML = '';
      bar.append(h('div.meter', {}, h('i', { id: 'modeFill', style: { background: '#FFE27A' } }), h('span', { id: 'modeTxt' })));
    }
    $('#modeFill').style.width = S.needs.energy + '%';
    $('#modeTxt').textContent = `Recharging ${Math.round(S.needs.energy)}%`;
  } else { bar.hidden = true; bar.dataset.mode = ''; }
}
function setActive(act) { $$('.act').forEach(b => b.classList.toggle('active', b.dataset.act === act)); }

// =====================================================================
// Feeding (tray keeps Mochi visible; food flies into Mochi's mouth)
// =====================================================================
function openFeed() {
  if (S.sleeping) return toast(`${petName()} is asleep. Tap Wake first.`);
  if (mode === 'bath') exitBath();
  openSheet('feed', 'Snacks', renderFeed, { tray: true, onOpen: liftForTray });
}
function renderFeed(body) {
  body.innerHTML = '';
  const foods = Object.entries(FOODS).sort((a, b) => ((S.food[b[0]] || 0) > 0) - ((S.food[a[0]] || 0) > 0) || a[1].level - b[1].level);
  const grid = h('div.grid');
  for (const [key, f] of foods) {
    const owned = S.food[key] || 0;
    const locked = S.level < f.level;
    const tag = locked ? h('span.tag', {}, `Lv ${f.level}`) : owned ? h('span.tag', {}, `×${owned}`) : h('span.tag.price', {}, f.price);
    const t = h('button.tile' + (locked ? '.locked' : ''), {
      type: 'button', 'aria-label': `${f.name}. ${locked ? `Unlocks at level ${f.level}` : owned ? `${owned} in your basket` : `${f.price} coins`}`,
      onclick: e => feed(key, e.currentTarget),
    }, h('span.em', {}, f.emoji), h('span.nm', {}, f.name), tag);
    grid.append(t);
  }
  body.append(grid);
}
function feed(key, tile) {
  unlockAudio();
  const f = FOODS[key];
  const r = store.feedFrom(key);
  if (!r.ok) {
    if (r.reason === 'full') { pet.react('nope', 900); sfx.nope(); say(pick(LINES.full)); }
    else if (r.reason === 'coins') { sfx.nope(); toast(`You need ${r.need} more coins. Play a mini-game or open the gift box.`); }
    else if (r.reason === 'locked') { sfx.nope(); toast(`${f.name} unlocks at level ${f.level}.`); }
    return;
  }
  sfx.whoosh();
  pet.react('surprised', 600); // mouth opens as the food flies in
  const from = rectCenter(tile), to = pet.mouthClientPoint();
  flyEmoji(f.emoji, from, to, 520).then(() => {
    const m = pet.mouthClientPoint();
    sfx.munch();
    pet.react('eat', 900);
    burst('crumb', m.x, m.y, 7, { angle: Math.PI / 2, spread: 1.2, speed: [60, 160] });
    floatText('+4 XP', m.x + 40, m.y - 30, 'xp');
    setTimeout(() => {
      if (f.spicy) { pet.react('spicy', 1700); sfx.spicy(); say(pick(LINES.spicy), 1800); shake(0.25); }
      else { sfx.yum(); pet.react('happy', 700); if (Math.random() < 0.25) talk('Yum!', 1200); }
    }, 900);
  });
  refreshSheet('feed');
}
function flyEmoji(em, from, to, ms) {
  const layer = $('#textLayer'), lr = layer.getBoundingClientRect();
  const d = h('span.fly', {}, em);
  layer.append(d);
  const x0 = from.x - lr.left, y0 = from.y - lr.top, x1 = to.x - lr.left, y1 = to.y - lr.top;
  const midY = Math.min(y0, y1) - 80;
  const anim = d.animate([
    { transform: `translate(${x0}px, ${y0}px) translate(-50%, -50%) scale(1)` },
    { transform: `translate(${(x0 + x1) / 2}px, ${midY}px) translate(-50%, -50%) scale(1.25) rotate(-20deg)`, offset: 0.5 },
    { transform: `translate(${x1}px, ${y1}px) translate(-50%, -50%) scale(.45) rotate(10deg)` },
  ], { duration: ms, easing: 'cubic-bezier(.3,.7,.4,1)' });
  return anim.finished.then(() => d.remove(), () => d.remove());
}
// Raise Mochi above the tray so you can watch it eat / try on clothes.
function liftForTray(sheetEl) {
  requestAnimationFrame(() => {
    const lift = Math.max(0, sheetEl.getBoundingClientRect().height - $('.actions').getBoundingClientRect().height + 10);
    $('#stage').style.setProperty('--lift', lift + 'px');
  });
}

// =====================================================================
// Wardrobe: hats, glasses, fur. Tap once to try on, tap again to buy.
// =====================================================================
let styleTab = 'hat';
function openStyle() {
  if (mode === 'bath') exitBath();
  openSheet('style', 'Wardrobe', renderStyle, { tray: true, onOpen: liftForTray, onClose: () => { preview = null; refreshLook(); } });
}
function miniPet(host, look, viewBox) {
  const p = new Pet(host);
  p.svg.setAttribute('viewBox', viewBox);
  p.setLook(look);
  p.setMood('content');
  p.update(0.016, performance.now());
  return p;
}
function renderStyle(body) {
  body.innerHTML = '';
  const tabs = h('div.tabs', { role: 'tablist' },
    ...[['hat', 'Hats'], ['face', 'Glasses'], ['fur', 'Fur']].map(([id, label]) =>
      h('button.tab', { role: 'tab', 'aria-selected': String(styleTab === id), onclick: () => { styleTab = id; preview = null; refreshLook(); sfx.tap(); refreshSheet('style'); } }, label)));
  const grid = h('div.grid');
  const stage = store.stageIndex();
  if (styleTab === 'fur') {
    for (const [id, f] of Object.entries(FURS)) {
      const owned = S.owned.furs.includes(id);
      const locked = !owned && (f.exclusive || S.level < (f.level || 1));
      const tag = S.pet.fur === id ? h('span.tag', {}, 'On') : owned ? null
        : f.exclusive ? h('span.tag', {}, 'Streak') : S.level < (f.level || 1) ? h('span.tag', {}, `Lv ${f.level}`) : h('span.tag.price', {}, f.price);
      const t = h('button.tile' + (S.pet.fur === id ? '.on' : '') + (locked ? '.locked' : ''), { type: 'button', 'aria-label': `${f.name} fur`, onclick: () => pickFur(id) },
        h('span.mini'), h('span.nm', {}, f.name), tag);
      miniPet(t.querySelector('.mini'), { fur: id, stage, hat: '', face: '' }, '30 90 240 200');
      grid.append(t);
    }
  } else {
    const none = h('button.tile' + (!S.wear[styleTab] ? '.on' : ''), { type: 'button', 'aria-label': 'Nothing', onclick: () => { S.wear[styleTab] = ''; preview = null; sfx.pop(); refreshLook(); store.saveSoon(); refreshSheet('style'); } },
      h('span.em', {}, '✕'), h('span.nm', {}, 'Nothing'));
    grid.append(none);
    for (const it of ITEMS.filter(i => i.slot === styleTab)) {
      const owned = S.owned.items.includes(it.id);
      const worn = S.wear[it.slot] === it.id;
      const tag = worn ? h('span.tag', {}, 'On') : owned ? null
        : it.exclusive ? h('span.tag', {}, 'Streak') : S.level < it.level ? h('span.tag', {}, `Lv ${it.level}`) : h('span.tag.price', {}, it.price);
      const t = h('button.tile' + (worn ? '.on' : '') + (!owned && (it.exclusive || S.level < it.level) ? '.locked' : ''),
        { type: 'button', 'aria-label': it.name, onclick: () => pickItem(it) }, h('span.mini'), h('span.nm', {}, it.name), tag);
      const look = { fur: S.pet.fur, stage, hat: it.slot === 'hat' ? it.id : '', face: it.slot === 'face' ? it.id : '' };
      miniPet(t.querySelector('.mini'), look, it.slot === 'hat' ? '20 10 260 210' : '60 110 180 130');
      grid.append(t);
    }
  }
  body.append(tabs, grid);
}
function tryOn(slot, id) { preview = { slot, id }; refreshLook(); pet.react('happy', 600); sfx.pop(); }
function pickItem(it) {
  const owned = S.owned.items.includes(it.id);
  if (owned) {
    S.wear[it.slot] = S.wear[it.slot] === it.id ? '' : it.id;
    preview = null; refreshLook(); pet.react('happy', 700); sfx.pop(); store.saveSoon(); refreshSheet('style');
    return;
  }
  if (it.exclusive) { tryOn(it.slot, it.id); return toast(`Trying on the ${it.name}. Earn it with the ${it.exclusive}.`); }
  if (S.level < it.level) { tryOn(it.slot, it.id); return toast(`The ${it.name} unlocks at level ${it.level}.`); }
  if (preview && preview.id === it.id) {
    if (store.buyItem(it.id)) {
      S.wear[it.slot] = it.id; preview = null;
      sfx.coin(); confettiRain(30); refreshLook(); pet.react('love', 900);
      toast(`Bought the ${it.name}!`); refreshSheet('style');
    } else toast(`You need ${it.price - S.coins} more coins.`);
    return;
  }
  tryOn(it.slot, it.id);
  toast(`Trying on the ${it.name}. Tap again to buy it for ${it.price} coins.`);
}
function pickFur(id) {
  const f = FURS[id];
  if (S.owned.furs.includes(id)) {
    S.pet.fur = id; preview = null; refreshLook(); pet.react('happy', 700); sfx.pop(); store.saveSoon(); refreshSheet('style');
    return;
  }
  if (f.exclusive) { tryOn('fur', id); return toast(`${f.name} fur is the ${f.exclusive}.`); }
  if (S.level < (f.level || 1)) { tryOn('fur', id); return toast(`${f.name} fur unlocks at level ${f.level}.`); }
  if (preview && preview.id === id) {
    if (store.buyFur(id)) { S.pet.fur = id; preview = null; sfx.coin(); confettiRain(30); refreshLook(); toast(`${f.name} fur unlocked!`); refreshSheet('style'); }
    else toast(`You need ${f.price - S.coins} more coins.`);
    return;
  }
  tryOn('fur', id);
  toast(`Trying on ${f.name} fur. Tap again to buy it for ${f.price} coins.`);
}

// =====================================================================
// Play: mini-games + dance party
// =====================================================================
function openPlay() {
  if (S.sleeping) return toast(`${petName()} is asleep. Tap Wake first.`);
  if (mode === 'bath') exitBath();
  openSheet('play', 'Play', body => {
    body.innerHTML = '';
    const tired = S.needs.energy < MIN_ENERGY_TO_PLAY;
    if (tired) body.append(h('p.sheet-note', {}, `${petName()} is too tired to play. A short nap fills energy back up.`));
    const rows = h('div.rows');
    for (const [kind, g] of Object.entries(GAMES)) {
      const best = kind === 'catch' ? S.stats.catchBest : S.stats.hopBest;
      rows.append(h('div.row', {}, h('span.em', {}, g.emoji),
        h('div.grow', {}, h('div.t', {}, g.name), h('div.s', {}, g.blurb), h('div.s', {}, `Best ${best}. Uses ${GAME_ENERGY_COST} energy.`)),
        h('button.btn.btn-sm', { disabled: tired || null, onclick: () => startGame(kind) }, 'Play')));
    }
    rows.append(h('div.row', {}, h('span.em', {}, '🪩'),
      h('div.grow', {}, h('div.t', {}, 'Dance party'), h('div.s', {}, 'Put on a tune and dance together.')),
      h('button.btn.btn-sm.btn-mango', { disabled: S.needs.energy < 6 || null, onclick: danceParty }, 'Dance')));
    body.append(rows);
  });
}

async function startGame(kind) {
  unlockAudio();
  closeSheet(true);
  if (S.needs.energy < MIN_ENERGY_TO_PLAY) { say(pick(LINES.tooTired)); return; }
  if (talker && talker.on) talker.stop();
  mode = 'game';
  hush();
  const best = kind === 'catch' ? S.stats.catchBest : S.stats.hopBest;
  await playGame(kind, { fur: S.pet.fur, level: S.level, best, onRound: score => payRound(kind, score) });
  mode = 'room';
  const pending = heldCards; heldCards = [];
  pending.forEach(fn => fn());
  pet.react('happy', 900);
  setTimeout(() => talk(pick(LINES.gameEnd)), 400);
  renderHUD();
}

// Pays out one finished round and returns what to show on the results card.
function payRound(kind, score) {
  const G = GAMES[kind];
  const prevBest = kind === 'catch' ? S.stats.catchBest : S.stats.hopBest;
  const coins = Math.round(score * G.coinsPer);
  const want = Math.min(ROUND_XP_MAX, Math.round(score * G.xpPer));
  store.newDayCheck();
  const xp = Math.min(want, Math.max(0, DAILY_XP_CAP.game - S.caps.game));
  store.addCoins(coins);
  if (want) store.addXP(want, 'game', DAILY_XP_CAP.game);
  store.changeNeed('fun', G.fun);
  store.changeNeed('energy', -GAME_ENERGY_COST);
  store.changeNeed('hunger', -3);
  store.track('game');
  store.track(kind, score);
  const canReplay = S.needs.energy >= MIN_ENERGY_TO_PLAY;
  return {
    coins, xp, best: score > prevBest && score > 0, canReplay,
    note: !canReplay ? `${petName()} is worn out. Time for a nap!` : want > xp ? 'Game XP for today is maxed out. Coins still count!' : '',
  };
}

function danceParty() {
  closeSheet(true);
  if (S.needs.energy < 6) { say(pick(LINES.tooTired)); return; }
  unlockAudio();
  danceUntil = performance.now() + DANCE.seconds * 1000;
  pet.dance(DANCE.seconds);
  playDanceTune(DANCE.seconds);
  confettiRain(40);
  const c = () => rectCenter($('#petWrap'));
  const notes = setInterval(() => { const p = c(); burst('note', p.x + rand(-120, 120), p.y - 60, 1, { angle: -Math.PI / 2, speed: [30, 80] }); }, 260);
  setTimeout(() => {
    clearInterval(notes);
    store.changeNeed('fun', DANCE.fun);
    store.changeNeed('energy', -DANCE.energy);
    store.track('dance');
    store.addXP(DANCE.xp, 'dance', DAILY_XP_CAP.dance);
    pet.react('happy', 900);
    talk(pick(LINES.danceEnd));
  }, DANCE.seconds * 1000);
}

// =====================================================================
// Quests, daily calendar, gift box
// =====================================================================
function untilMidnight() { const d = new Date(); d.setHours(24, 0, 0, 0); return d - Date.now(); }

function openQuests() {
  store.ensureQuests();
  openSheet('quests', 'Daily quests', body => {
    body.innerHTML = '';
    body.append(h('p.sheet-note', {}, `New quests in ${fmtDur(untilMidnight())}. Each one pays ${QUEST_REWARD.coins} coins and ${QUEST_REWARD.xp} XP.`));
    const rows = h('div.rows');
    S.quests.list.forEach((q, i) => {
      const pct = Math.min(100, (q.p / q.n) * 100);
      const btn = q.claimed ? h('button.btn.btn-sm.btn-ghost', { disabled: true }, 'Claimed')
        : q.done ? h('button.btn.btn-sm.btn-mango', { onclick: e => claimQuest(i, e.currentTarget) }, 'Claim')
          : h('span.s', {}, `${q.p}/${q.n}`);
      rows.append(h('div.row' + (q.claimed ? '.claimed' : q.done ? '.done' : ''), {},
        h('div.grow', {}, h('div.t', {}, store.questText(q)), h('div.bar', {}, h('i', { style: { width: pct + '%' } }))), btn));
    });
    const all = S.quests.list.every(q => q.claimed);
    rows.append(h('div.row' + (S.quests.bonus ? '.claimed' : ''), {}, h('span.em', {}, '🧰'),
      h('div.grow', {}, h('div.t', {}, 'Bonus chest'), h('div.s', {}, `Finish all three for ${QUEST_BONUS.coins} coins and ${QUEST_BONUS.xp} XP.`)),
      S.quests.bonus ? h('button.btn.btn-sm.btn-ghost', { disabled: true }, 'Opened')
        : h('button.btn.btn-sm.btn-pink', { disabled: !all || null, onclick: e => claimBonus(e.currentTarget) }, 'Open')));
    body.append(rows);
  });
}
function rewardFx(el, coins, xp) {
  const c = rectCenter(el);
  sfx.coin();
  burst('coin', c.x, c.y, 10, { angle: -Math.PI / 2, spread: 1.2, speed: [120, 280] });
  floatText(`+${coins}`, c.x, c.y - 10, 'coin');
  if (xp) setTimeout(() => floatText(`+${xp} XP`, c.x, c.y - 10, 'xp'), 250);
}
function claimQuest(i, btn) {
  const r = store.claimQuest(i);
  if (r) rewardFx(btn, r.coins, r.xp);
}
function claimBonus(btn) {
  const r = store.claimBonus();
  if (!r) return;
  rewardFx(btn, r.coins, r.xp);
  sfx.chest(); shake(0.3); confettiRain(50);
}

function openDaily() {
  openSheet('daily', 'Daily rewards', renderDaily);
}
function day7Reward() {
  const c = S.daily.cycles;
  return c === 0 ? { em: '👑', txt: 'Golden Crown' } : c === 1 ? { em: '✨', txt: 'Golden fur' } : { em: '🎂', txt: 'Party Cake' };
}
function renderDaily(body) {
  body.innerHTML = '';
  const st = store.dailyStatus();
  body.append(h('p.streak-line', {}, h('span', { style: { fontSize: '28px' } }, '🔥'), h('b', {}, st.streak), h('span', {}, st.streak === 1 ? 'day in a row' : 'days in a row')));
  if (st.broken) body.append(h('p.sheet-note', {}, 'Your streak started over. Visit every day to keep it growing.'));
  const grid = h('div.daily-grid');
  DAILY.forEach((d, i) => {
    const n = i + 1;
    const past = st.claimed ? n <= st.day : n < st.day;
    const today = !st.claimed && n === st.day;
    const special = d.special ? day7Reward() : null;
    const em = special ? special.em : d.food ? FOODS[Object.keys(d.food)[0]].emoji : '🪙';
    grid.append(h('div.day' + (past ? '.past' : '') + (today ? '.today' : '') + (d.special ? '.big' : ''), {},
      h('span.d', {}, `Day ${n}`), h('span.em', {}, em),
      h('span.r', {}, special ? special.txt : d.food ? `${d.coins} + snacks` : `${d.coins}`)));
  });
  body.append(grid);
  if (st.claimed) {
    body.append(h('button.btn.btn-wide', { disabled: true }, `Next reward in ${fmtDur(untilMidnight())}`));
  } else {
    body.append(h('button.btn.btn-wide.btn-mango', { onclick: e => claimDaily(e.currentTarget), autofocus: true }, `Claim day ${st.day}`));
  }
}
function claimDaily(btn) {
  const out = store.claimDaily();
  if (!out) return;
  rewardFx(btn, out.coins, 10);
  sfx.chest();
  refreshSheet('daily');
  renderHUD();
  const lines = [`+${out.coins} coins`];
  if (out.food) for (const [k, v] of Object.entries(out.food)) lines.push(`${FOODS[k].emoji} ×${v}`);
  if (out.item || out.fur) {
    confettiRain(100); shake(0.4);
    queueCard(() => showCard((card, close) => {
      card.append(h('h2', {}, 'Day 7 treasure!'), h('span.hero-em', {}, out.item ? '👑' : '✨'),
        h('p', {}, out.item ? `The Golden Crown is yours. Put it on in the Wardrobe.` : `Golden fur unlocked. Find it in the Wardrobe.`),
        h('div.loot', {}, ...lines.map(l => h('span', {}, l))),
        h('div.actions-row', {}, h('button.btn', { onclick: () => { close(); closeSheet(); openStyle(); } }, 'Open Wardrobe'),
          h('button.btn.btn-ghost', { onclick: close }, 'Later')));
    }));
  } else {
    toast(`Day ${out.day} reward: ${lines.join(', ')}`);
  }
  const n = S.daily.streak;
  setTimeout(() => talk(n === 1 ? fill('Our first day together, {you}! Come back tomorrow?') : fill(pick(STREAK_LINES), { n })), 500);
}

function openGift() {
  unlockAudio();
  if (!store.giftReady()) { sfx.nope(); toast(`The next gift is ready in ${fmtDur(S.gift.nextAt - Date.now())}.`); return; }
  const out = store.openGift();
  const c = rectCenter($('#giftBtn'));
  sfx.chest(); shake(out.jackpot ? 0.5 : 0.25);
  burst('coin', c.x, c.y, out.jackpot ? 24 : 10, { speed: [120, 300] });
  burst('sparkle', c.x, c.y, 10);
  renderGift();
  showCard((card, close) => {
    card.append(h('h2', {}, out.jackpot ? 'Jackpot!' : 'Gift box!'), h('span.hero-em', {}, out.food ? out.emoji : out.jackpot ? '💰' : '🎁'),
      h('div.loot', {}, h('span', {}, `+${out.coins} coins`), out.food ? h('span', {}, `${out.emoji} ${out.name} ×${out.n}`) : null),
      h('p', {}, 'A new gift box arrives in 3 hours.'),
      h('div.actions-row', {}, h('button.btn', { onclick: close, autofocus: true }, 'Yay!')));
    if (out.jackpot) confettiRain(80);
  });
}

// =====================================================================
// Talk-back: Mochi repeats what you say in a squeaky voice
// =====================================================================
let listenHintShown = false;
async function toggleTalk() {
  unlockAudio();
  if (talker && talker.on) { talker.stop(); hush(); return; }
  if (S.sleeping) return toast(`${petName()} is asleep. Wake ${petName()} up to talk.`);
  if (!micSupported()) return openTalkSheet();
  if (!talker) talker = new Talker({ onState: talkState, onRepeat: talkRepeated });
  try { await talker.start(); }
  catch (e) { toast('The microphone is blocked, so you can type to Mochi instead.'); openTalkSheet(); }
}
function talkState(s) {
  const b = $('#talkBtn');
  b.setAttribute('aria-pressed', String(s !== 'off'));
  b.dataset.state = s;
  if (s === 'listen' && !listenHintShown) { listenHintShown = true; say("I'm listening! Say something.", 2400); }
  if (s === 'hear') { pet.react('listen', 6000); hush(); }
  if (s === 'speak') pet.setTalkLevel(() => talker.mouthLevel());
  else pet.setTalkLevel(null);
  if (s === 'cool' || s === 'listen') pet.react('content', 10);
}
function talkRepeated() {
  markInteract();
  store.track('talk');
  store.addXP(3, 'talk', DAILY_XP_CAP.talk);
  store.changeNeed('fun', 2);
}
function openTalkSheet() {
  openSheet('talk', `Talk to ${petName()}`, body => {
    body.innerHTML = '';
    const field = h('input.field', { type: 'text', maxlength: 80, placeholder: 'Type something…', 'aria-label': 'Message', autofocus: true });
    const send = () => {
      const text = field.value.trim();
      if (!text) return;
      field.value = '';
      closeSheet();
      say(text, 3200);
      const osc = () => 0.3 + Math.abs(Math.sin(performance.now() / 80)) * 0.6;
      const ok = soundOn() && ttsSupported() && speak(text, { onStart: () => pet.setTalkLevel(osc), onEnd: () => pet.setTalkLevel(null) });
      if (!ok) talk(text);
      talkRepeated();
    };
    field.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    body.append(h('p.sheet-note', {}, `${petName()} repeats what you say in a squeaky voice. Use the mic button to talk out loud.`),
      h('div.inline', {}, field, h('button.btn', { onclick: send }, 'Say it')));
  });
}

// =====================================================================
// Cards: welcome back, level up, growth info
// =====================================================================
function welcome(off) {
  const away = off.hours >= 0.5;
  if (off.found) store.addCoins(off.found);
  const after = () => setTimeout(() => {
    if (!store.dailyStatus().claimed) openDaily();
    else maybeInstallNudge();
  }, 500);
  if (!away) { setTimeout(() => talk(fill(pick(LINES.greet))), 700); after(); return; }
  const m = store.mood();
  const needWord = { hunger: 'is hungry', energy: 'is sleepy', fun: 'wants to play', clean: 'needs a bath' }[m.lowKey];
  showCard((card, close) => {
    const host = h('div.pet-mini');
    add(card, h('h2', {}, fill(pick(LINES.missed))), host,
      h('p', {}, `You were away for ${fmtDur(off.away)}.${m.lowVal < 40 ? ` ${petName()} ${needWord}.` : ''}`),
      off.found ? h('div.loot', {}, h('span', {}, `🪙 ${petName()} found ${off.found} coins while you were gone`)) : null,
      h('div.actions-row', {}, h('button.btn', { onclick: close, autofocus: true }, `Hi, ${petName()}!`)));
    mountPreview(host, { fur: S.pet.fur, stage: store.stageIndex(), hat: S.wear.hat, face: S.wear.face }, 'happy');
  }, { onClose: () => { unmountPreviews(); unlockAudio(); sfx.giggle(); pet.react('happy', 1000); after(); } });
}

// A live, animated Mochi inside a card.
let previews = [];
function mountPreview(host, look, mood = 'content') {
  const p = new Pet(host);
  p.setLook(look); p.setMood(mood);
  pets.push(p); previews.push(p);
  setTimeout(() => p.hop(320), 300);
  return p;
}
function unmountPreviews() {
  for (const p of previews) { const i = pets.indexOf(p); if (i >= 0) pets.splice(i, 1); }
  previews = [];
}

function levelCard(d) {
  sfx.levelup();
  confettiRain(d.evolved ? 140 : 60);
  shake(d.evolved ? 0.5 : 0.25);
  showCard((card, close) => {
    const host = d.evolved ? h('div.pet-mini') : null;
    card.append(h('h2', {}, `Level ${d.level}!`), host || h('span.hero-em', {}, '🌱'),
      h('p', {}, d.evolved ? `${petName()} grew into a ${d.stage.name}! Look at that sprout.` : `${petName()} is growing stronger.`),
      h('div.loot', {}, h('span', {}, `+${d.bonus} coins`), ...d.unlocks.map(u => h('span', {}, `New: ${u}`))),
      h('div.actions-row', {}, h('button.btn', { onclick: close, autofocus: true }, 'Yay!')));
    if (host) mountPreview(host, { fur: S.pet.fur, stage: store.stageIndex(), hat: '', face: '' }, 'happy');
  }, { onClose: () => { unmountPreviews(); pet.react('happy', 900); } });
}

function growthCard() {
  showCard((card, close) => {
    const cur = store.stageIndex();
    const left = xpNeed(S.level) - S.xp;
    card.append(h('h2', {}, `${petName()} the ${store.stage().name}`),
      h('p', {}, `Level ${S.level}. ${left} XP to level ${S.level + 1}. You have been together for ${plural(store.daysTogether(), 'day', 'days')}.`),
      h('div.rows', { style: { textAlign: 'left', marginBottom: '14px' } },
        ...STAGES.map((st, i) => h('div.row' + (i < cur ? '.claimed' : i === cur ? '.done' : ''), {},
          h('span.em', {}, ['🌰', '🌱', '🌿', '🌷', '🌸', '🌟'][i]),
          h('div.grow', {}, h('div.t', {}, st.name), h('div.s', {}, i === cur ? 'Now' : i < cur ? 'Grown' : `Reach level ${st.min}`))))),
      h('button.btn.btn-wide', { onclick: close, autofocus: true }, 'Close'));
  });
}

// =====================================================================
// Settings: names, sound, motion, share, install, backup, reset
// =====================================================================
function openSettings() {
  openSheet('settings', 'Settings', body => {
    body.innerHTML = '';
    const sw = (label, on, fn) => {
      const b = h('button.switch', { role: 'switch', 'aria-checked': String(on), 'aria-label': label, onclick: () => { fn(); refreshSheet('settings'); } });
      return h('div.setting', {}, h('label', {}, label), b);
    };
    const petField = h('input.field', { value: S.pet.name, maxlength: 14, 'aria-label': 'Pet name' });
    const youField = h('input.field', { value: S.owner, maxlength: 16, placeholder: 'Your name', 'aria-label': 'Your name' });
    const saveNames = () => {
      S.pet.name = petField.value.trim() || 'Mochi';
      S.owner = youField.value.trim();
      store.save(); renderHUD(); toast('Names saved.'); sfx.pop();
    };
    add(body,
      h('div.stack', {}, h('label', {}, 'Pet name'), petField, h('label', {}, 'What Mochi calls you'), youField,
        h('button.btn.btn-ghost', { onclick: saveNames }, 'Save names')),
      sw('Sound', S.settings.sound, () => { S.settings.sound = !S.settings.sound; setSound(S.settings.sound); store.saveSoon(); }),
      sw('Reduce motion', S.settings.reduceMotion, () => { S.settings.reduceMotion = !S.settings.reduceMotion; applyMotion(); store.saveSoon(); }),
      h('div.setting', {}, h('label', {}, `Share ${petName()} with a friend`), h('button.btn.btn-sm', { onclick: share }, 'Share')),
      deferredInstall ? h('div.setting', {}, h('label', {}, 'Put Mochi on your home screen'), h('button.btn.btn-sm.btn-mango', { onclick: install }, 'Install')) : null,
      isIOS() && !isStandalone() ? h('p.sheet-note', {}, 'On iPhone: tap Share in Safari, then Add to Home Screen.') : null,
      h('div.setting', {}, h('label', {}, 'Move Mochi to another device'), h('button.btn.btn-sm.btn-ghost', { onclick: backupCard }, 'Backup')),
      h('div.setting', {}, h('label', {}, 'Stats'), h('span', { style: { fontSize: '13px', textAlign: 'right' } },
        `${plural(store.daysTogether(), 'day', 'days')} together, ${fmtN(S.stats.coinsEarned)} coins earned, best catch ${S.stats.catchBest}, best hop ${S.stats.hopBest}`)),
      h('div.setting', {}, h('label', {}, 'Start over'), h('button.btn.btn-sm.btn-pink', { onclick: resetCard }, 'Reset')),
      h('p.sheet-note', { style: { marginTop: '10px' } }, 'Mochi lives in this browser. Nothing is sent to a server. The microphone is only used for talk-back and never leaves your device.'));
  });
}
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

async function share() {
  const url = location.href.split('#')[0].split('?')[0];
  const text = `Meet ${petName()}, my level ${S.level} ${store.stage().name}! Raise your own squishy pet:`;
  try {
    if (navigator.share) await navigator.share({ title: 'Mochi Pal', text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); toast('Link copied. Paste it to a friend!'); }
  } catch (e) { /* share sheet closed */ }
}
async function install() {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  try { await deferredInstall.userChoice; } catch (e) { /* ignore */ }
  deferredInstall = null;
  refreshSheet('settings');
}
// After a couple of days, suggest installing so Mochi is one tap away.
function maybeInstallNudge() {
  if (!deferredInstall || S.tips.install || S.stats.days < 2 || isStandalone()) return;
  S.tips.install = true; store.saveSoon();
  showCard((card, close) => card.append(h('h2', {}, 'Keep Mochi close'), h('span.hero-em', {}, '📱'),
    h('p', {}, `Add ${petName()} to your home screen and open it like an app. It works offline too.`),
    h('div.actions-row', {}, h('button.btn', { onclick: () => { close(); install(); }, autofocus: true }, 'Install'),
      h('button.btn.btn-ghost', { onclick: close }, 'Not now'))));
}

function backupCard() {
  showCard((card, close) => {
    const code = store.exportCode();
    const out = h('textarea.field', { readonly: true, 'aria-label': 'Backup code' }); out.value = code;
    const inp = h('textarea.field', { placeholder: 'Paste a backup code here', 'aria-label': 'Restore code' });
    card.append(h('h2', {}, 'Backup'),
      h('p', {}, 'Copy this code and paste it on your other device to bring Mochi along.'),
      h('div.stack', {}, out, h('button.btn.btn-ghost', { onclick: async () => { try { await navigator.clipboard.writeText(code); toast('Backup code copied.'); } catch (e) { out.select(); } } }, 'Copy code'),
        inp, h('button.btn', { onclick: () => {
          try { store.importCode(inp.value); location.reload(); }
          catch (e) { toast(e.message.includes('Mochi') ? e.message : 'That code is not a Mochi Pal backup. Check you copied all of it.'); }
        } }, 'Restore from code')),
      h('button.btn.btn-ghost.btn-wide', { onclick: close }, 'Close'));
  });
}
function resetCard() {
  showCard((card, close) => card.append(h('h2', {}, 'Start over?'),
    h('p', {}, `This deletes ${petName()} and all progress in this browser. It can't be undone.`),
    h('div.actions-row', {}, h('button.btn.btn-pink', { onclick: () => { store.resetAll(); location.reload(); } }, `Delete ${petName()} and start over`),
      h('button.btn.btn-ghost', { onclick: close, autofocus: true }, 'Keep my pet'))));
}

// =====================================================================
// First run: hatch the egg, pick a colour and a name
// =====================================================================
function eggSVG() {
  return `<svg viewBox="0 0 180 210" aria-hidden="true">
    <ellipse cx="90" cy="198" rx="60" ry="9" fill="#2E1F47" opacity=".15"/>
    <path d="M90 14c44 0 72 70 72 116 0 42-32 66-72 66s-72-24-72-66C18 84 46 14 90 14Z" fill="#FFF7EE" stroke="#2E1F47" stroke-width="6"/>
    <path d="M40 120c18 8 34-6 50 2s34 6 50-4" fill="none" stroke="#FF8FC3" stroke-width="8" stroke-linecap="round"/>
    <circle cx="62" cy="80" r="7" fill="#9C7BFF"/><circle cx="118" cy="66" r="5" fill="#2FB7B0"/><circle cx="124" cy="150" r="6" fill="#FFC23D"/><circle cx="58" cy="160" r="5" fill="#2FB7B0"/>
    <path d="M90 14c-2-8 2-12 8-14-1 6-3 10-8 14Z" fill="#6CCB5F" stroke="#2E1F47" stroke-width="3"/>
    <g class="cracks" fill="none" stroke="#2E1F47" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <path data-k="1" d="M62 60l10 12-6 10" opacity="0"/>
      <path data-k="2" d="M126 98l-12 8 6 12" opacity="0"/>
      <path data-k="3" d="M56 132l14-4 4 12" opacity="0"/>
      <path data-k="4" d="M30 104l20 4 10-12 16 10 14-12 16 12 14-10 16 10 14-6" opacity="0"/>
    </g>
    <ellipse cx="66" cy="54" rx="12" ry="7" fill="#fff" transform="rotate(-30 66 54)"/>
  </svg>`;
}
function startHatch() {
  let taps = 0;
  showCard((card, close) => {
    const egg = h('div.egg-wrap', { role: 'button', tabindex: '0', 'aria-label': 'Tap the egg', html: eggSVG() });
    const hint = h('p', {}, 'Something is wiggling inside. Tap the egg to help it hatch.');
    const hit = () => {
      unlockAudio();
      taps++;
      egg.classList.remove('tap'); void egg.offsetWidth; egg.classList.add('tap');
      const c = rectCenter(egg);
      burst('sparkle', c.x + rand(-40, 40), c.y + rand(-50, 30), 4);
      egg.querySelectorAll('.cracks path').forEach(p => { if (+p.dataset.k <= taps) p.setAttribute('opacity', 1); });
      if (taps < 5) { sfx.pop(); hint.textContent = ['Keep going!', 'It\'s cracking!', 'Almost there…', 'One more tap!'][taps - 1]; return; }
      sfx.chest(); shake(0.5); confettiRain(120);
      burst('sparkle', c.x, c.y, 24, { speed: [150, 380] });
      close();
    };
    egg.addEventListener('click', hit);
    egg.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hit(); } });
    card.append(h('h2', {}, 'A new friend is coming'), egg, hint);
    setTimeout(() => egg.focus(), 50);
  }, { dismissable: false, onClose: nameCard });
}
function nameCard() {
  let fur = 'peach';
  showCard((card, close) => {
    const host = h('div.pet-mini');
    const furRow = h('div.fur-row', { role: 'radiogroup', 'aria-label': 'Colour' });
    const nameF = h('input.field', { value: 'Mochi', maxlength: 14, 'aria-label': 'Pet name' });
    const youF = h('input.field', { maxlength: 16, placeholder: 'Your name (optional)', 'aria-label': 'Your name' });
    let preview2;
    STARTER_FURS.forEach(id => {
      const b = h('button.swatch', { type: 'button', role: 'radio', 'aria-checked': String(id === fur), 'aria-label': FURS[id].name, style: { background: FURS[id].base } });
      b.addEventListener('click', () => {
        fur = id; sfx.pop();
        furRow.querySelectorAll('.swatch').forEach(s => s.setAttribute('aria-checked', String(s === b)));
        preview2.setLook({ fur, stage: 0, hat: '', face: '' }); preview2.hop(300);
      });
      furRow.append(b);
    });
    const go = () => {
      S.pet.name = nameF.value.trim() || 'Mochi';
      S.pet.fur = fur;
      S.owner = youF.value.trim();
      S.hatched = true;
      S.created = Date.now();
      S.lastSeen = Date.now();
      store.ensureQuests();
      store.save();
      close();
    };
    card.append(h('h2', {}, 'Say hello!'), host, h('p', {}, 'Pick a colour and a name. You can change the name later.'), furRow,
      h('div.stack', {}, h('label.lbl', {}, 'Pet name'), nameF, h('label.lbl', {}, 'What should your pet call you?'), youF),
      h('button.btn.btn-wide', { onclick: go }, "Let's go!"));
    preview2 = mountPreview(host, { fur, stage: 0, hat: '', face: '' }, 'happy');
  }, {
    dismissable: false,
    onClose: () => {
      unmountPreviews();
      refreshLook(); renderHUD();
      pet.react('happy', 1200); sfx.giggle();
      setTimeout(() => talk(fill("Hi {you}! I'm {pet}!")), 400);
      setTimeout(() => talk(LINES.tutorial[0], 3600), 3800);
      setTimeout(openDaily, 8000);
    },
  });
}

// =====================================================================
// Wiring + PWA
// =====================================================================
function bindEvents() {
  bindPet();
  $$('.act').forEach(b => b.addEventListener('click', () => {
    unlockAudio(); sfx.tap();
    const a = b.dataset.act;
    if (a === 'feed') openFeed();
    else if (a === 'bath') mode === 'bath' ? exitBath() : enterBath();
    else if (a === 'sleep') toggleSleep();
    else if (a === 'play') openPlay();
    else if (a === 'style') openStyle();
  }));
  $('#giftBtn').addEventListener('click', openGift);
  $('#dailyBtn').addEventListener('click', () => { sfx.tap(); openDaily(); });
  $('#streakBtn').addEventListener('click', () => { sfx.tap(); openDaily(); });
  $('#questBtn').addEventListener('click', () => { sfx.tap(); openQuests(); });
  $('#talkBtn').addEventListener('click', toggleTalk);
  $('#settingsBtn').addEventListener('click', () => { sfx.tap(); openSettings(); });
  $('#lvlBtn').addEventListener('click', () => { sfx.tap(); growthCard(); });
  $('#coinsBtn').addEventListener('click', () => { sfx.tap(); toast('Earn coins from mini-games, quests, the gift box and daily rewards.'); });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      store.save();
      if (talker && talker.on) talker.stop();
      hiddenTitle();
      hiddenTimer = setInterval(hiddenTitle, 60000);
    } else {
      clearInterval(hiddenTimer);
      document.title = 'Mochi Pal';
      updateTimeOfDay();
    }
  });
  window.addEventListener('pagehide', () => store.save());
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
}

boot();
