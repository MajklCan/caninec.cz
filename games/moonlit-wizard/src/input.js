import { unlockAudio } from './audio.js';

export const KEYS = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
  jump: ['Space', 'KeyZ', 'ArrowUp', 'KeyW'],
  q: ['KeyQ', 'KeyJ'], e: ['KeyE'], r: ['KeyR'],
  start: ['Space', 'Enter'], mute: ['KeyM'], pause: ['Escape', 'KeyP'],
  up: ['ArrowUp', 'KeyW', 'PadUp'], down: ['ArrowDown', 'KeyS'],
};
const GAME_KEYS = new Set(Object.values(KEYS).flat().concat('ArrowDown'));
const down = new Set();
/** Keys pressed since the last fixed update — cleared by the main loop. */
export const hit = new Set();
const touch = {};
export const isTouch = matchMedia('(pointer: coarse)').matches;

/** A virtual pad (duel AI): while set, held()/tapped() read it instead of the keyboard. */
let virt = null;
export const setVirtual = v => { virt = v; };
export const held = a => virt ? !!virt.held[a] : !!touch[a] || KEYS[a].some(k => down.has(k));
export const tapped = a => virt ? !!virt.tap[a] : hit.has('touch:' + a) || (KEYS[a] || []).some(k => hit.has(k));

/* ================= GAMEPAD (PS / Xbox, USB or Bluetooth — incl. a DualSense paired to a Tesla) =================
 * Standard mapping. The pad "presses keys": each button feeds the same codes as the keyboard, so every screen
 * (menus, pause, select, duel) works with it unchanged. Stick/d-pad up is 'PadUp' (menus only — it never jumps). */
const PAD_BTN = { 0: 'Space', 2: 'KeyQ', 1: 'KeyE', 3: 'KeyR', 5: 'KeyQ', 7: 'KeyQ', 4: 'KeyE', 6: 'KeyR', 9: 'Escape', 8: 'KeyM',
  12: 'PadUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' };
const padHeld = new Set();
export let padConnected = false;
/** Called once per animation frame by the main loop: diff the pad state into `down` / `hit`. */
export function pollPads() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  const now = new Set();
  for (const p of pads) {
    p.buttons.forEach((b, i) => { if (PAD_BTN[i] && (b.pressed || b.value > 0.5)) now.add(PAD_BTN[i]); });
    const [ax = 0, ay = 0] = p.axes;
    if (ax < -0.45) now.add('ArrowLeft'); else if (ax > 0.45) now.add('ArrowRight');
    if (ay < -0.6) now.add('PadUp'); else if (ay > 0.6) now.add('ArrowDown');
  }
  padConnected = pads.length > 0;
  for (const c of now) if (!padHeld.has(c)) { hit.add(c); down.add(c); unlockAudio(); }
  for (const c of padHeld) if (!now.has(c)) down.delete(c);
  padHeld.clear(); for (const c of now) padHeld.add(c);
}

export function initInput(screen) {
  addEventListener('keydown', e => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) hit.add(e.code);
    down.add(e.code);
    unlockAudio();
  });
  addEventListener('keyup', e => down.delete(e.code));
  addEventListener('blur', () => { down.clear(); for (const k in touch) touch[k] = false; });

  document.querySelectorAll('[data-k]').forEach(btn => {
    const k = btn.dataset.k;
    const off = () => { touch[k] = false; btn.classList.remove('on'); };
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      btn.setPointerCapture?.(e.pointerId);
      touch[k] = true; hit.add('touch:' + k); hit.add('touch:start');
      btn.classList.add('on');
      unlockAudio();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => btn.addEventListener(ev, off));
  });
  screen.addEventListener('pointerdown', () => { hit.add('touch:start'); unlockAudio(); });

  // Mouse: hold left button = Q (orbs), right button = E (shield). Touch taps keep their menu meaning.
  screen.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') return;
    if (e.button === 0) { touch.q = true; hit.add('touch:q'); }
    if (e.button === 2) { touch.e = true; hit.add('touch:e'); }
  });
  addEventListener('pointerup', e => {
    if (e.pointerType !== 'mouse') return;
    if (e.button === 0) touch.q = false;
    if (e.button === 2) touch.e = false;
  });
  screen.addEventListener('contextmenu', e => e.preventDefault());
}
