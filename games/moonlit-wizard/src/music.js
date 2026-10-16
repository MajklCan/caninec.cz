// Procedural chiptune. Each track is a small recipe (key, scale, chord loop, voices); melodies are
// generated from a seed as motifs (A A' B A'') that snap to the current chord — so it loops musically
// but no file is ever loaded. A look-ahead scheduler queues notes on the WebAudio clock.
import { onAudio, musicOut } from './audio.js';
import { rng } from './gfx.js';

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11], major: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11],
};
/** Each place has a few songs (variants); one is picked at random every time you enter it — never the same twice in a row. */
const TRACKS = {
  title: [
    { bpm: 76,  root: 57, scale: 'minor',    prog: [0, 5, 3, 4],             seed: 3,  drums: 0, bass: 'half',   arp: 'up8',   lead: 'triangle', leadVol: 0.05, pad: 0.035, echo: true },                                                   // moonlit lullaby
    { bpm: 70,  root: 55, scale: 'dorian',     prog: [0, 3, 5, 4],             seed: 51, drums: 0, bass: 'half',  arp: 'bell',   lead: 'sine',     leadVol: 0.06, pad: 0.04, echo: true },   // nocturne
    { bpm: 96,  root: 60, scale: 'mixolydian', prog: [0, 6, 3, 4],             seed: 53, drums: 1, bass: 'pulse', arp: 'broken', lead: 'triangle', leadVol: 0.05, pad: 0.02, echo: true },   // heroes gather
    { bpm: 82,  root: 57, scale: 'harmonic',   prog: [0, 5, 3, 4, 0, 5, 1, 4], seed: 55, drums: 0, bass: 'walk',  arp: 'pluck',  lead: 'triangle', leadVol: 0.045, pad: 0.035, echo: true },  // old legend
  ],
  night: [
    { bpm: 104, root: 57, scale: 'minor',    prog: [0, 5, 2, 6],             seed: 7,  drums: 1, bass: 'eighth', arp: 'up16',  lead: 'square',   leadVol: 0.04, pad: 0.02 },
    { bpm: 112, root: 55, scale: 'minor',      prog: [0, 3, 6, 4],             seed: 61, drums: 3, bass: 'walk',  arp: 'pluck',  lead: 'square',   leadVol: 0.035, pad: 0.015 },            // castle watch
    { bpm: 98,  root: 57, scale: 'dorian',     prog: [0, 6, 5, 4],             seed: 63, drums: 1, bass: 'pulse', arp: 'broken', lead: 'triangle', leadVol: 0.05, pad: 0.02, echo: true },   // torches on the walls
  ],
  frost: [
    { bpm: 88,  root: 62, scale: 'dorian',   prog: [0, 3, 6, 4],             seed: 11, drums: 1, bass: 'half',   arp: 'bell',  lead: 'triangle', leadVol: 0.06, pad: 0.03, echo: true },
    { bpm: 76,  root: 64, scale: 'lydian',     prog: [0, 4, 5, 3],             seed: 67, drums: 0, bass: 'half',  arp: 'bell',   lead: 'sine',     leadVol: 0.06, pad: 0.04, echo: true },   // aurora
    { bpm: 100, root: 62, scale: 'minor',      prog: [0, 5, 6, 4],             seed: 69, drums: 1, bass: 'eighth', arp: 'pluck', lead: 'triangle', leadVol: 0.05, pad: 0.025 },            // the climb
  ],
  sunken: [
    { bpm: 72,  root: 55, scale: 'minor',    prog: [0, 3, 5, 4],             seed: 13, drums: 0, bass: 'half',   arp: 'bell',  lead: 'sine',     leadVol: 0.06, pad: 0.045, echo: true },
    { bpm: 66,  root: 53, scale: 'harmonic',   prog: [0, 3, 4, 5],             seed: 71, drums: 0, bass: 'half',  arp: 'broken', lead: 'sine',     leadVol: 0.055, pad: 0.05, echo: true },  // drowned hymn
    { bpm: 84,  root: 57, scale: 'dorian',     prog: [0, 4, 3, 6],             seed: 73, drums: 0, bass: 'walk',  arp: 'bell',   lead: 'triangle', leadVol: 0.05, pad: 0.04, echo: true },   // kelp and candles
  ],
  clock: [
    { bpm: 124, root: 60, scale: 'dorian',   prog: [0, 4, 3, 6],             seed: 17, drums: 1, bass: 'eighth', arp: 'up16',  lead: 'square',   leadVol: 0.035, pad: 0.015 },
    { bpm: 132, root: 58, scale: 'mixolydian', prog: [0, 6, 4, 0],             seed: 77, drums: 3, bass: 'pulse', arp: 'up16',   lead: 'square',   leadVol: 0.035, pad: 0.01 },             // gears in motion
    { bpm: 118, root: 60, scale: 'harmonic',   prog: [0, 4, 5, 4],             seed: 79, drums: 1, bass: 'walk',  arp: 'broken', lead: 'triangle', leadVol: 0.045, pad: 0.02 },             // the tick-tock waltz
  ],
  lunar: [
    { bpm: 80,  root: 64, scale: 'major',    prog: [0, 5, 3, 4],             seed: 23, drums: 0, bass: 'half',   arp: 'bell',  lead: 'triangle', leadVol: 0.05, pad: 0.04, echo: true },
    { bpm: 72,  root: 62, scale: 'lydian',     prog: [0, 1, 4, 3],             seed: 83, drums: 0, bass: 'half',  arp: 'pluck',  lead: 'sine',     leadVol: 0.055, pad: 0.045, echo: true },  // low gravity
    { bpm: 90,  root: 60, scale: 'dorian',     prog: [0, 5, 3, 6],             seed: 85, drums: 1, bass: 'pulse', arp: 'bell',   lead: 'triangle', leadVol: 0.05, pad: 0.035, echo: true },  // earthrise
  ],
  woodland: [
    { bpm: 92,  root: 55, scale: 'dorian',   prog: [0, 3, 4, 0, 5, 3, 6, 4], seed: 41, drums: 1, bass: 'half',   arp: 'bell',  lead: 'triangle', leadVol: 0.055, pad: 0.03, echo: true },
    { bpm: 108, root: 60, scale: 'mixolydian', prog: [0, 3, 6, 4],             seed: 89, drums: 3, bass: 'walk',  arp: 'pluck',  lead: 'triangle', leadVol: 0.05, pad: 0.02 },             // forest jig
    { bpm: 74,  root: 57, scale: 'lydian',     prog: [0, 4, 3, 1],             seed: 91, drums: 0, bass: 'half',  arp: 'bell',   lead: 'sine',     leadVol: 0.06, pad: 0.04, echo: true },   // dusk glade
  ],
  boss:    { bpm: 148, root: 52, scale: 'phrygian', prog: [0, 0, 1, 0, 5, 5, 6, 1], seed: 5,  drums: 2, bass: 'drive',  arp: 'up16',  lead: 'square',   leadVol: 0.045, pad: 0 },
  moon:    { bpm: 156, root: 50, scale: 'harmonic', prog: [0, 5, 3, 4, 0, 5, 1, 4], seed: 9,  drums: 2, bass: 'drive',  arp: 'down16', lead: 'sawtooth', leadVol: 0.03, pad: 0.025, echo: true },
  organ:     { bpm: 132, root: 57, scale: 'harmonic', prog: [0, 3, 4, 0, 5, 3, 1, 4], seed: 29, drums: 1, bass: 'drive',  arp: 'down16', lead: 'sawtooth', leadVol: 0.03, pad: 0.05, echo: true },
  clockboss: { bpm: 150, root: 53, scale: 'phrygian', prog: [0, 1, 0, 6, 0, 1, 5, 4], seed: 31, drums: 2, bass: 'drive',  arp: 'up16',  lead: 'square',   leadVol: 0.04, pad: 0 },
  eclipse:   { bpm: 160, root: 52, scale: 'harmonic', prog: [0, 5, 1, 4, 0, 5, 6, 4], seed: 37, drums: 2, bass: 'drive',  arp: 'down16', lead: 'sawtooth', leadVol: 0.03, pad: 0.03, echo: true },
  stag:      { bpm: 140, root: 50, scale: 'dorian',   prog: [0, 0, 3, 4, 0, 6, 5, 4], seed: 43, drums: 2, bass: 'drive',  arp: 'up16',  lead: 'square',   leadVol: 0.04, pad: 0.02 },
  victory: { bpm: 96,  root: 60, scale: 'major',    prog: [0, 3, 4, 0, 5, 3, 4, 4], seed: 21, drums: 1, bass: 'eighth', arp: 'up8',   lead: 'triangle', leadVol: 0.06, pad: 0.03, echo: true },
};

const hz = n => 440 * Math.pow(2, (n - 69) / 12);
const deg = (scale, d) => SCALES[scale][((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
const chordDegs = root => [root, root + 2, root + 4];

/** Two 2-bar motifs of scale degrees. Strong beats prefer chord tones; phrases end on long notes. */
function motifs(seed) {
  const R = rng(seed), make = () => {
    const notes = [];
    let d = 2 + Math.floor(R() * 3);
    for (let s = 0; s < 32; s++) {
      const strong = s % 4 === 0, p = strong ? 0.85 : s % 2 === 0 ? 0.45 : 0.18;
      if (s > 26 && s !== 28) continue;                                   // breathe before the repeat
      if (R() > p) continue;
      d += Math.round((R() - 0.5) * (strong ? 4 : 3));
      d = Math.max(-1, Math.min(9, d));
      notes.push({ s, d, strong });
    }
    notes.forEach((n, i) => (n.len = ((notes[i + 1]?.s ?? 32) - n.s)));
    return notes;
  };
  const A = make(), B = make();
  const A2 = A.map((n, i) => (i >= A.length - 2 ? { ...n, d: n.d + (R() < 0.5 ? 2 : -2) } : n));
  return [A, A2, B, A];                                                    // 8-bar form: A A' B A
}

let ac = null, bus = null, echo = null, noiseBuf = null;
let cur = null, want = null, T = null, form = null, step = 0, nextTime = 0, timer = null, bar = 0;

function setup(ctx, out) {
  ac = ctx;
  bus = ac.createGain(); bus.gain.value = 0; bus.connect(musicOut(ac));   // own mute switch, then the master out
  const delay = ac.createDelay(1), fb = ac.createGain(), wet = ac.createGain();
  delay.delayTime.value = 0.3; fb.gain.value = 0.32; wet.gain.value = 0.5;
  delay.connect(fb).connect(delay); delay.connect(wet).connect(bus);
  echo = delay;
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  timer = setInterval(tick, 25);
  if (want) start(want);
}
onAudio(setup);

function voice(t, freq, dur, type, vol, { attack = 0.005, send = false, slide = 0 } = {}) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus);
  if (send) g.connect(echo);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(t, dur, vol, hp) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
const kick = t => voice(t, 150, 0.16, 'sine', 0.5, { slide: 0.28 });
const snare = t => { noise(t, 0.14, 0.14, 1200); voice(t, 190, 0.08, 'triangle', 0.08); };
const hat = (t, v = 0.035) => noise(t, 0.03, v, 7000);

function scheduleStep(s, t) {
  const sixteenth = 60 / T.bpm / 4, sb = s % 16, root = T.prog[bar % T.prog.length];
  const chord = chordDegs(root), key = T.root, sc = T.scale;
  const note = (d, oct = 0) => hz(key + deg(sc, d) + 12 * oct);

  // drums
  if (T.drums === 3) {                                                     // shuffle: a lilting, skipping groove
    if (sb === 0 || sb === 6 || sb === 10) kick(t);
    if (sb === 4 || sb === 12) snare(t);
    if (sb % 4 === 0 || sb % 4 === 3) hat(t, sb % 4 === 0 ? 0.04 : 0.022);
  } else if (T.drums >= 1) {
    if (sb === 0 || sb === 8 || (T.drums > 1 && (sb === 10 || sb === 6))) kick(t);
    if (T.drums > 1 ? sb === 4 || sb === 12 : sb === 12 && bar % 2) snare(t);
    if (T.drums > 1 ? sb % 2 === 0 || Math.random() < 0.3 : sb % 4 === 2) hat(t, sb % 4 === 2 ? 0.045 : 0.025);
  }
  // bass
  const b = note(root, -2);
  if (T.bass === 'half' && sb % 8 === 0) voice(t, b, sixteenth * 7.5, 'triangle', 0.16);
  if (T.bass === 'eighth' && sb % 2 === 0) voice(t, sb % 8 === 6 ? b * 2 : b, sixteenth * 1.8, 'triangle', 0.15);
  if (T.bass === 'drive') voice(t, sb % 4 === 3 ? b * 2 : b, sixteenth * 0.9, 'square', sb % 4 === 0 ? 0.07 : 0.045);
  if (T.bass === 'walk' && sb % 4 === 0) voice(t, note(chord[(sb / 4) % 3] - (sb === 12 ? 1 : 0), -2), sixteenth * 3.6, 'triangle', 0.14);   // walking quarters, a step into the next bar
  if (T.bass === 'pulse' && [0, 3, 6, 8, 11, 14].includes(sb)) voice(t, sb === 14 ? b * 2 : b, sixteenth * 1.6, 'triangle', 0.13);
  // pad (one soft chord per bar)
  if (T.pad && sb === 0) chord.forEach(d => voice(t, note(d, -1), sixteenth * 15, 'sine', T.pad, { attack: 0.25 }));
  // arpeggio
  const tones = [...chord, chord[0] + 7];
  if (T.arp === 'up16') voice(t, note(tones[sb % 4]), sixteenth * 0.8, 'square', 0.018);
  if (T.arp === 'down16') voice(t, note(tones[3 - (sb % 4)], 1), sixteenth * 0.8, 'square', 0.014);
  if (T.arp === 'up8' && sb % 2 === 0) voice(t, note(tones[(sb / 2) % 4]), sixteenth * 1.6, 'triangle', 0.03, { send: T.echo });
  if (T.arp === 'broken' && sb % 2 === 0) voice(t, note(tones[[0, 2, 1, 3][(sb / 2) % 4]], (sb / 2) % 8 < 4 ? 0 : 1), sixteenth * 1.7, 'triangle', 0.03, { send: T.echo });
  if (T.arp === 'pluck' && sb % 2 === 0) voice(t, note(tones[(sb / 2 + bar) % 4], sb % 4 === 0 ? 0 : 1), sixteenth * 1.2, 'sine', 0.04, { send: T.echo });
  if (T.arp === 'bell' && sb % 4 === 0) voice(t, note(tones[(sb / 4 + bar) % 4], 1), sixteenth * 3.5, 'triangle', 0.035, { send: true });
  // lead motif (bars in pairs → motif half)
  const phrase = form[Math.floor(bar / 2) % 4], local = (bar % 2) * 16 + sb;
  const n = phrase.find(m => m.s === local);
  if (n) {
    let d = n.d;
    if (n.strong) d = chord.concat(chord.map(c => c + 7)).reduce((a, c) => (Math.abs(c - d) < Math.abs(a - d) ? c : a));
    voice(t, note(d, 1), Math.min(n.len, 6) * sixteenth * 0.95, T.lead, T.leadVol, { send: T.echo, attack: 0.01 });
  }
}

function tick() {
  if (!T) return;
  while (nextTime < ac.currentTime + 0.12) {
    scheduleStep(step, nextTime);
    nextTime += 60 / T.bpm / 4;
    step++;
    if (step % 16 === 0) bar++;
  }
}

function start(name) {
  const fadeOut = cur ? 0.35 : 0;
  bus.gain.cancelScheduledValues(ac.currentTime);
  bus.gain.setTargetAtTime(0, ac.currentTime, 0.08);
  cur = name;
  setTimeout(() => {
    if (cur !== name) return;
    T = pickSong(name); form = motifs(T.seed); step = 0; bar = 0;
    nextTime = ac.currentTime + 0.05;
    bus.gain.setTargetAtTime(0.32, ac.currentTime, 0.15);
  }, fadeOut * 1000);
}

const lastPick = {};
/** A place with several songs gets a random one — never the same one twice in a row. */
function pickSong(name) {
  const def = TRACKS[name];
  if (!Array.isArray(def)) return def;
  let i = Math.floor(Math.random() * def.length);
  if (def.length > 1 && i === lastPick[name]) i = (i + 1 + Math.floor(Math.random() * (def.length - 1))) % def.length;
  lastPick[name] = i;
  return def[i];
}

/** Switch tracks (cross-fades; safe to call every frame). */
export function playMusic(name) {
  if (want === name) return;
  want = name;
  if (ac) start(name);
}
