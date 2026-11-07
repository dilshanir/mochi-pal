// Screens and messages: bottom sheet, centre cards, toast, Mochi's speech bubble.
//
// Screen model (game-ui-ux skill): a small stack. A sheet sits over the room, a card sits
// over everything, and Escape / the scrim closes whatever is on top. Every screen moves
// keyboard focus to its first control on open and gives it back to the opener on close.
import { $ } from './util.js';
import { sfx } from './sfx.js';

let sheet, sheetBody, sheetTitle, scrim, overlay, card, toastEl, bubbleEl;
let current = null;         // { id, render, opts, opener }
const cards = [];           // queued centre cards: { render, opts }
let cardOpen = null;
let toastTimer = 0, bubbleTimer = 0;

export function initUI() {
  sheet = $('#sheet'); sheetBody = $('#sheetBody'); sheetTitle = $('#sheetTitle');
  scrim = $('#scrim'); overlay = $('#overlay'); card = $('#card');
  toastEl = $('#toast'); bubbleEl = $('#bubble');
  $('#sheetClose').addEventListener('click', () => { sfx.tap(); closeSheet(); });
  scrim.addEventListener('click', () => closeSheet());
  overlay.addEventListener('click', e => { if (e.target === overlay && cardOpen?.opts.dismissable !== false) closeCard(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (cardOpen) { if (cardOpen.opts.dismissable !== false) closeCard(); }
    else if (current) closeSheet();
  });
}

const focusFirst = root => {
  const f = root.querySelector('[autofocus], button:not([disabled]), input, [tabindex="0"]');
  if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
};

// ---------- bottom sheet ----------
// render(body) builds the content; call refreshSheet() after state changes to rebuild it.
// opts.tray = short sheet that keeps Mochi visible (feed / wardrobe); opts.onClose runs once.
export function openSheet(id, title, render, opts = {}) {
  if (current && current.id !== id) closeSheet(true);
  const opener = current?.opener || document.activeElement;
  current = { id, render, opts, opener };
  sheetTitle.textContent = title;
  sheet.classList.toggle('tray', !!opts.tray);
  sheet.classList.remove('closing');
  sheet.hidden = false;
  scrim.hidden = false;
  scrim.classList.toggle('clear', !!opts.tray);
  document.body.classList.toggle('tray-open', !!opts.tray);
  render(sheetBody);
  sheetBody.scrollTop = 0;
  focusFirst(sheet);
  if (opts.onOpen) opts.onOpen(sheet);
}

export function refreshSheet(id) {
  if (!current || (id && current.id !== id)) return;
  const y = sheetBody.scrollTop, x = sheetBody.scrollLeft;
  current.render(sheetBody);
  sheetBody.scrollTop = y; sheetBody.scrollLeft = x;
}

export function closeSheet(instant = false) {
  if (!current) return;
  const c = current;
  current = null;
  document.body.classList.remove('tray-open');
  scrim.hidden = true;
  const done = () => { sheet.hidden = true; sheet.classList.remove('closing'); };
  if (instant) done();
  else { sheet.classList.add('closing'); setTimeout(done, 190); }
  if (c.opts.onClose) c.opts.onClose();
  if (c.opener && c.opener.focus && !instant) c.opener.focus({ preventScroll: true });
}
export const sheetId = () => (current ? current.id : null);

// ---------- centre cards (queued, one at a time) ----------
// opts.dismissable=false hides the scrim-tap / Escape close (used for the hatching flow).
export function showCard(render, opts = {}) {
  cards.push({ render, opts });
  if (!cardOpen) nextCard();
}
function nextCard() {
  const c = cards.shift();
  if (!c) { cardOpen = null; overlay.hidden = true; return; }
  cardOpen = c;
  card.innerHTML = '';
  card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
  overlay.hidden = false;
  c.render(card, closeCard);
  focusFirst(card);
}
export function closeCard() {
  if (!cardOpen) return;
  const c = cardOpen;
  cardOpen = null;
  if (c.opts.onClose) c.opts.onClose();
  // onClose may itself have opened the next card (hatch → name); don't skip past it.
  if (!cardOpen) nextCard();
}
export const cardShowing = () => !!cardOpen;

// ---------- toast ----------
export function toast(msg, ms = 2400) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// ---------- speech bubble ----------
export function say(text, ms = 2800) {
  if (!text) return;
  bubbleEl.textContent = text;
  bubbleEl.classList.remove('show'); void bubbleEl.offsetWidth;
  bubbleEl.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubbleEl.classList.remove('show'), ms);
}
export function hush() { clearTimeout(bubbleTimer); bubbleEl.classList.remove('show'); }

// ---------- tiny DOM builder used by every sheet/card ----------
// h('button.btn.btn-mango', { onclick }, 'Claim')
export function h(tag, props = {}, ...kids) {
  const [name, ...cls] = tag.split('.');
  const n = document.createElement(name || 'div');
  if (cls.length) n.className = cls.join(' ');
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : String(kid));
  return n;
}
