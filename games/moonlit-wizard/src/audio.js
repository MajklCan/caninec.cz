// Tiny WebAudio synth — every sound effect is generated, no audio files.
// Local development always starts muted (M toggles); on the published site the choice is remembered.
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const remembered = k => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const remember = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* private mode — fine */ } };
let ac = null, out = null, muted = LOCAL || remembered('moonlit.muteAll');

export function unlockAudio() {
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      out = ac.createGain();
      out.gain.value = muted ? 0 : 0.9;
      out.connect(ac.destination);
    } catch { return; }
  }
  if (ac.state === 'suspended') ac.resume();
  audioReady.forEach(fn => fn(ac, out));
  audioReady.length = 0;
}
const audioReady = [];
/** Run fn(ctx, masterOut) once audio is unlocked (browsers need a user gesture first). */
export const onAudio = fn => (ac ? fn(ac, out) : audioReady.push(fn));
export const toggleMute = () => {
  muted = !muted;
  if (out) out.gain.setTargetAtTime(muted ? 0 : 0.9, ac.currentTime, 0.02);
  if (!LOCAL) remember('moonlit.muteAll', muted);
  return muted;
};
export const isMuted = () => muted;
/* Music has its own switch (sound effects keep playing). music.js routes its bus through `musicGain`. */
let musicMuted = remembered('moonlit.muteMusic'), musicGain = null;
export function musicOut(ctx) { musicGain = ctx.createGain(); musicGain.gain.value = musicMuted ? 0 : 1; musicGain.connect(out); return musicGain; }
export const toggleMusicMute = () => {
  musicMuted = !musicMuted; remember('moonlit.muteMusic', musicMuted);
  if (musicGain) musicGain.gain.setTargetAtTime(musicMuted ? 0 : 1, ac.currentTime, 0.05);
  return musicMuted;
};
export const isMusicMuted = () => musicMuted;

function tone({ type = 'square', f = 440, f2 = 0, dur = 0.1, vol = 0.06, at = 0 }) {
  if (!ac || muted) return;
  const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur = 0.15, vol = 0.08, lowpass = 0, at = 0) {
  if (!ac || muted) return;
  const len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = buf; g.gain.value = vol;
  let node = s;
  if (lowpass) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; node.connect(f); node = f; }
  node.connect(g).connect(out);
  s.start(ac.currentTime + at);
}

export const sfx = {
  jump: () => tone({ f: 240, f2: 520, dur: 0.12, vol: 0.045 }),
  land: () => noise(0.05, 0.03),
  orb: () => tone({ type: 'sawtooth', f: 380 + Math.random() * 60, f2: 900, dur: 0.1, vol: 0.03 }),
  boom: r => { const k = Math.min(1, r / 30); noise(0.2 + r / 80, 0.16 * k, 500 + (1 - k) * 900); tone({ type: 'sine', f: 110 + (1 - k) * 80, f2: 32, dur: 0.25 + 0.15 * k, vol: 0.18 * k }); },
  shield: () => [660, 990, 1320].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.18, vol: 0.045, at: i * 0.04 })),
  reflect: () => tone({ type: 'triangle', f: 1800, f2: 2600, dur: 0.08, vol: 0.05 }),
  moonfall: () => { tone({ type: 'sawtooth', f: 55, f2: 40, dur: 1.2, vol: 0.08 }); [880, 740, 587, 440].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.3, vol: 0.05, at: i * 0.12 })); },
  tink: () => { tone({ type: 'square', f: 2400, f2: 1800, dur: 0.05, vol: 0.03 }); tone({ type: 'triangle', f: 3200, dur: 0.08, vol: 0.02 }); },
  bow: () => tone({ type: 'triangle', f: 420, f2: 180, dur: 0.1, vol: 0.05 }),
  hex: () => tone({ type: 'sine', f: 200, f2: 600, dur: 0.3, vol: 0.05 }),
  teleport: () => tone({ type: 'sine', f: 1200, f2: 300, dur: 0.18, vol: 0.04 }),
  shriek: () => tone({ type: 'sawtooth', f: 900, f2: 1400, dur: 0.25, vol: 0.035 }),
  swing: () => noise(0.12, 0.06, 3000),
  alert: () => tone({ type: 'square', f: 880, dur: 0.05, vol: 0.025 }),
  denied: () => tone({ type: 'square', f: 140, dur: 0.09, vol: 0.05 }),
  ready: () => tone({ type: 'triangle', f: 1320, dur: 0.07, vol: 0.03 }),
  collect: () => { tone({ type: 'triangle', f: 988, dur: 0.07, vol: 0.07 }); tone({ type: 'triangle', f: 1480, dur: 0.16, vol: 0.07, at: 0.06 }); },
  stomp: () => tone({ f: 330, f2: 110, dur: 0.12, vol: 0.06 }),
  pop: () => { noise(0.12, 0.07); tone({ f: 200, f2: 60, dur: 0.12, vol: 0.04 }); },
  hurt: () => { noise(0.2, 0.1); tone({ type: 'sawtooth', f: 220, f2: 70, dur: 0.3, vol: 0.06 }); },
  die: () => [440, 330, 220, 110].forEach((f, i) => tone({ type: 'square', f, dur: 0.18, vol: 0.05, at: i * 0.1 })),
  light: () => [523, 659, 784, 1047].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.2, vol: 0.05, at: i * 0.07 })),
  win: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', f, dur: 0.35, vol: 0.05, at: i * 0.1 })),
};
