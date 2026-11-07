// Game state, persistence, and all progression rules (needs, XP, coins, daily, quests, gifts).
//
// Save model (from the gamedev "save-systems" skill):
//   - The whole game is one plain-data object `S` (no DOM nodes, no class instances).
//   - Every save carries a schema version `v`; migrate() upgrades old saves field by field,
//     so adding a new feature never wipes a returning player's pet.
//   - Two slots: the live save and a ".bak" copy of the last save that parsed cleanly.
//     If the live one is ever corrupted, load() falls back to the backup.
//   - Nothing here touches the DOM. UI listens to events (on/emit) instead of polling.
import { dayKey, daysBetween, clamp, seeded, pick, randi } from './util.js';
import {
  FOODS, ITEMS, FURS, STARTER_FURS, STARTER_FOOD, STAGES, xpNeed, DECAY, OFFLINE_FLOOR,
  SLEEP_ONLINE_PER_SEC, SLEEP_OFFLINE_PER_HOUR, GIFT_COOLDOWN_MS, DAILY, QUESTS, QUEST_REWARD, QUEST_BONUS,
} from './data.js';

const KEY = 'mochi-pal-save-v1';
const BAK = KEY + '.bak';
const SCHEMA = 1;

// ---------- tiny event bus ----------
const listeners = {};
export const on = (evt, fn) => (listeners[evt] || (listeners[evt] = [])).push(fn);
export const emit = (evt, data) => (listeners[evt] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });

export function fresh() {
  const t = Date.now();
  return {
    v: SCHEMA,
    created: t,
    lastSeen: t,
    hatched: false,
    pet: { name: 'Mochi', fur: 'peach' },
    owner: '',
    needs: { hunger: 75, energy: 85, fun: 70, clean: 80 },
    sleeping: false,
    level: 1,
    xp: 0,
    coins: 60,
    food: { ...STARTER_FOOD },
    owned: { items: [], furs: [...STARTER_FURS] },
    wear: { hat: '', face: '' },
    daily: { last: '', streak: 0, cycles: 0 },
    gift: { nextAt: 0 },
    quests: { day: '', list: [], bonus: false },
    stats: { feed: 0, pet: 0, tickle: 0, bath: 0, game: 0, talk: 0, sleep: 0, dance: 0, gift: 0, spend: 0, catchBest: 0, hopBest: 0, days: 0, coinsEarned: 0 },
    // Daily XP caps for repeatable actions, so tapping forever can't skip the growth curve.
    caps: { day: '', pet: 0, talk: 0, tickle: 0, game: 0, dance: 0 },
    lastDay: '',
    settings: { sound: true, reduceMotion: false },
    tips: {},
  };
}

export let S = fresh();

function merge(base, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return base;
  for (const k of Object.keys(base)) {
    if (!(k in data)) continue;
    const b = base[k], d = data[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) base[k] = merge(b, d);
    else if (typeof d === typeof b || b === null) base[k] = d;
  }
  // keep unknown keys inside open-ended maps (food counts, tips)
  return base;
}

function migrate(data) {
  const s = merge(fresh(), data);
  if (data && data.food) s.food = { ...data.food };
  if (data && data.tips) s.tips = { ...data.tips };
  if (!FURS[s.pet.fur]) s.pet.fur = 'peach';
  s.v = SCHEMA;
  return s;
}

// Try the live save, then the backup. Storage can throw (private mode, blocked cookies),
// in which case the game still runs; it just won't remember between visits.
export function load() {
  for (const k of [KEY, BAK]) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (data && data.pet && data.needs) { S = migrate(data); return S; }
    } catch (e) { /* corrupted or unavailable: try the next slot */ }
  }
  S = fresh();
  return S;
}

let lastGood = '';
export function save() {
  S.lastSeen = Date.now();
  try {
    const json = JSON.stringify(S);
    localStorage.setItem(KEY, json);
    // Refresh the backup at most once per session start + whenever the level changes,
    // so a bad write can never overwrite both copies at the same moment.
    const tag = S.level + ':' + S.hatched;
    if (lastGood !== tag) { localStorage.setItem(BAK, json); lastGood = tag; }
  } catch (e) { /* storage full or blocked */ }
}
let saveTimer = 0;
export function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 500); }

export function exportCode() {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(S)))); } catch (e) { return ''; }
}
export function importCode(code) {
  const data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
  if (!data || !data.pet || !data.needs) throw new Error('That code is not a Mochi Pal backup.');
  S = migrate(data);
  save();
}
export function resetAll() {
  S = fresh();
  try { localStorage.removeItem(KEY); localStorage.removeItem(BAK); } catch (e) { /* ignore */ }
}

// ---------- helpers ----------
export const petName = () => S.pet.name || 'Mochi';
export const ownerName = () => S.owner || 'friend';
export const fill = (txt, extra = {}) => txt
  .replace(/\{pet\}/g, petName())
  .replace(/\{you\}/g, ownerName())
  .replace(/\{(\w+)\}/g, (m, k) => (k in extra ? extra[k] : m));

export function stageIndex(level = S.level) {
  let i = 0;
  STAGES.forEach((st, idx) => { if (level >= st.min) i = idx; });
  return i;
}
export const stage = (level = S.level) => STAGES[stageIndex(level)];
export const daysTogether = () => daysBetween(dayKey(S.created), dayKey()) + 1;

export function mood() {
  const n = S.needs;
  const avg = (n.hunger + n.energy + n.fun + n.clean) / 4;
  const low = Object.entries(n).sort((a, b) => a[1] - b[1])[0];
  return { avg, lowKey: low[0], lowVal: low[1] };
}

// Runs whenever anything happens: rolls the daily caps and quests over at local midnight.
export function newDayCheck() {
  const today = dayKey();
  if (S.caps.day !== today) S.caps = { day: today, pet: 0, talk: 0, tickle: 0, game: 0, dance: 0 };
  if (S.lastDay !== today) { S.lastDay = today; S.stats.days++; }
  ensureQuests();
}

// ---------- needs ----------
export function tickNeeds(dtSec) {
  const h = dtSec / 3600;
  const n = S.needs;
  for (const k of Object.keys(DECAY)) {
    if (k === 'energy' && S.sleeping) continue;
    const rate = S.sleeping ? DECAY[k] * 0.5 : DECAY[k];
    n[k] = clamp(n[k] - rate * h, 4, 100);
  }
  if (S.sleeping) n.energy = clamp(n.energy + SLEEP_ONLINE_PER_SEC * dtSec, 0, 100);
}

// Apply time passed while the app was closed. Returns a summary for the welcome-back card.
export function applyOffline() {
  const now = Date.now();
  const away = clamp(now - (S.lastSeen || now), 0, 14 * 86400000);
  const hours = away / 3600000;
  const before = { ...S.needs };
  for (const k of Object.keys(DECAY)) {
    if (k === 'energy' && S.sleeping) continue;
    const rate = S.sleeping ? DECAY[k] * 0.5 : DECAY[k];
    const floor = Math.min(before[k], OFFLINE_FLOOR);
    S.needs[k] = clamp(S.needs[k] - rate * hours, floor, 100);
  }
  if (S.sleeping) S.needs.energy = clamp(S.needs.energy + SLEEP_OFFLINE_PER_HOUR * hours, 0, 100);
  const found = hours >= 0.5 ? Math.min(40, Math.floor(hours * 5)) : 0;
  newDayCheck();
  return { away, hours, before, found };
}

export function changeNeed(k, delta) {
  S.needs[k] = clamp(S.needs[k] + delta, 0, 100);
  emit('needs');
}

// ---------- coins & XP ----------
export function addCoins(n) {
  if (!n) return;
  S.coins += n;
  if (n > 0) S.stats.coinsEarned += n;
  emit('coins', { delta: n });
  saveSoon();
}
export function spend(n) {
  if (S.coins < n) return false;
  S.coins -= n;
  emit('coins', { delta: -n });
  track('spend', n);
  return true;
}

export function addXP(n, capKey, cap) {
  if (capKey) {
    newDayCheck();
    const room = Math.max(0, cap - S.caps[capKey]);
    n = Math.min(n, room);
    S.caps[capKey] += n;
  }
  if (n <= 0) return;
  S.xp += n;
  emit('xp', { delta: n });
  while (S.xp >= xpNeed(S.level)) {
    S.xp -= xpNeed(S.level);
    const prevStage = stageIndex(S.level);
    S.level++;
    const bonus = S.level * 10;
    S.coins += bonus;
    const unlocks = [
      ...Object.values(FOODS).filter(f => f.level === S.level).map(f => `${f.emoji} ${f.name}`),
      ...ITEMS.filter(i => i.level === S.level && !i.exclusive).map(i => i.name),
      ...Object.values(FURS).filter(f => f.level === S.level).map(f => `${f.name} fur`),
    ];
    emit('levelup', { level: S.level, bonus, unlocks, evolved: stageIndex(S.level) !== prevStage, stage: stage() });
    emit('coins', { delta: bonus });
  }
  saveSoon();
}

// ---------- quests ----------
export function ensureQuests() {
  const today = dayKey();
  if (S.quests.day === today && S.quests.list.length) return;
  const rng = seeded(today + ':' + S.created);
  const pool = [...QUESTS];
  const list = [];
  while (list.length < 3 && pool.length) {
    const q = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    list.push({ id: q.id, n: pick(q.n, rng), p: 0, done: false, claimed: false });
  }
  S.quests = { day: today, list, bonus: false };
}

export const questDef = id => QUESTS.find(q => q.id === id);
export const questText = q => fill(questDef(q.id).text, { n: q.n });
export const questsReady = () => S.quests.list.filter(q => q.done && !q.claimed).length + (bonusReady() ? 1 : 0);
export const bonusReady = () => !S.quests.bonus && S.quests.list.length > 0 && S.quests.list.every(q => q.claimed);

export function track(evt, amount = 1) {
  newDayCheck();
  const def = questDef(evt);
  if (evt === 'catch') S.stats.catchBest = Math.max(S.stats.catchBest, amount);
  else if (evt === 'hop') S.stats.hopBest = Math.max(S.stats.hopBest, amount);
  else if (evt in S.stats) S.stats[evt] += amount;
  for (const q of S.quests.list) {
    if (q.id !== evt || q.done) continue;
    q.p = def && def.mode === 'max' ? Math.max(q.p, amount) : q.p + amount;
    if (q.p >= q.n) { q.p = q.n; q.done = true; emit('questdone', q); }
  }
  emit('quests');
  saveSoon();
}

export function claimQuest(i) {
  const q = S.quests.list[i];
  if (!q || !q.done || q.claimed) return null;
  q.claimed = true;
  addCoins(QUEST_REWARD.coins);
  addXP(QUEST_REWARD.xp);
  emit('quests');
  return QUEST_REWARD;
}
export function claimBonus() {
  if (!bonusReady()) return null;
  S.quests.bonus = true;
  addCoins(QUEST_BONUS.coins);
  addXP(QUEST_BONUS.xp);
  emit('quests');
  return QUEST_BONUS;
}

// ---------- daily login calendar ----------
export function dailyStatus() {
  const today = dayKey();
  const last = S.daily.last;
  if (last === today) return { claimed: true, day: ((S.daily.streak - 1) % 7) + 1, streak: S.daily.streak };
  const gap = last ? daysBetween(last, today) : Infinity;
  const streak = gap === 1 ? S.daily.streak : 0;
  return { claimed: false, day: (streak % 7) + 1, streak, broken: !!last && gap > 1 && S.daily.streak > 1 };
}

export function claimDaily() {
  const st = dailyStatus();
  if (st.claimed) return null;
  S.daily.streak = st.streak + 1;
  S.daily.last = dayKey();
  const r = DAILY[st.day - 1];
  const out = { day: st.day, coins: r.coins, food: r.food || null, item: null, fur: null };
  if (r.special) {
    const cycle = S.daily.cycles++;
    if (cycle === 0 && !S.owned.items.includes('crown')) { S.owned.items.push('crown'); out.item = 'Golden Crown'; }
    else if (cycle === 1 && !S.owned.furs.includes('golden')) { S.owned.furs.push('golden'); out.fur = 'Golden fur'; }
    else { out.food = { cake: 1 }; }
  }
  addCoins(out.coins);
  if (out.food) for (const [k, v] of Object.entries(out.food)) S.food[k] = (S.food[k] || 0) + v;
  addXP(10);
  emit('daily');
  saveSoon();
  return out;
}

// ---------- gift box ----------
export const giftReady = () => Date.now() >= S.gift.nextAt;
export function openGift() {
  if (!giftReady()) return null;
  S.gift.nextAt = Date.now() + GIFT_COOLDOWN_MS;
  const roll = Math.random();
  let out;
  if (roll < 0.1) out = { coins: 75, jackpot: true };
  else if (roll < 0.45) {
    const unlocked = Object.entries(FOODS).filter(([, f]) => f.level <= S.level);
    const [key, f] = unlocked[Math.floor(Math.random() * unlocked.length)];
    const n = randi(1, 2);
    S.food[key] = (S.food[key] || 0) + n;
    out = { food: key, n, emoji: f.emoji, name: f.name, coins: 10 };
  } else out = { coins: randi(15, 40) };
  addCoins(out.coins);
  track('gift');
  emit('gift');
  return out;
}

// ---------- food & shop ----------
export function feedFrom(key) {
  const f = FOODS[key];
  if (!f) return { ok: false, reason: 'unknown' };
  if (S.level < f.level) return { ok: false, reason: 'locked' };
  if (S.needs.hunger >= 97 && !f.spicy) return { ok: false, reason: 'full' };
  if ((S.food[key] || 0) > 0) S.food[key]--;
  else if (!spend(f.price)) return { ok: false, reason: 'coins', need: f.price - S.coins };
  changeNeed('hunger', f.hunger);
  if (f.fun) changeNeed('fun', f.fun);
  track('feed');
  addXP(4);
  emit('food');
  return { ok: true, food: f };
}

export function buyItem(id) {
  const it = ITEMS.find(i => i.id === id);
  if (!it || it.exclusive || S.owned.items.includes(id)) return false;
  if (S.level < it.level) return false;
  if (!spend(it.price)) return false;
  S.owned.items.push(id);
  saveSoon();
  return true;
}
export function buyFur(id) {
  const f = FURS[id];
  if (!f || f.exclusive || S.owned.furs.includes(id)) return false;
  if (S.level < (f.level || 1)) return false;
  if (!spend(f.price)) return false;
  S.owned.furs.push(id);
  saveSoon();
  return true;
}
