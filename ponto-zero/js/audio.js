// Sons 100% sintetizados com Web Audio (sem arquivos). Áudio posicional com HRTF.

let ctx = null;
let master = null;
let sfxBus = null;
let reverb = null;
let noiseBuf = null;
let volume = 0.7;
const listenerPos = { x: 0, y: 0, z: 0 };

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.connect(master);
  // ruído branco
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // reverb curto (eco de vila)
  reverb = ctx.createConvolver();
  const len = ctx.sampleRate * 1.6;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const x = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * 0.6;
  }
  reverb.buffer = ir;
  const rvGain = ctx.createGain();
  rvGain.gain.value = 0.35;
  reverb.connect(rvGain).connect(master);
}

export function setVolume(v) {
  volume = v;
  if (master) master.gain.value = v;
}

export function updateListener(x, y, z, fx, fy, fz) {
  listenerPos.x = x; listenerPos.y = y; listenerPos.z = z;
  if (!ctx) return;
  const l = ctx.listener;
  if (l.positionX) {
    const t = ctx.currentTime;
    l.positionX.setValueAtTime(x, t);
    l.positionY.setValueAtTime(y, t);
    l.positionZ.setValueAtTime(z, t);
    l.forwardX.setValueAtTime(fx, t);
    l.forwardY.setValueAtTime(fy, t);
    l.forwardZ.setValueAtTime(fz, t);
    l.upX.setValueAtTime(0, t);
    l.upY.setValueAtTime(1, t);
    l.upZ.setValueAtTime(0, t);
  } else {
    l.setPosition(x, y, z);
    l.setOrientation(fx, fy, fz, 0, 1, 0);
  }
}

function out(pos, refDistance = 4, wet = 0.5) {
  // retorna o nó de entrada que leva ao destino (posicional ou não)
  const g = ctx.createGain();
  if (pos) {
    const dist = Math.hypot(pos.x - listenerPos.x, pos.y - listenerPos.y, pos.z - listenerPos.z);
    if (dist > 140) return null;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDistance;
    p.rolloffFactor = 1.1;
    p.maxDistance = 200;
    if (p.positionX) {
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    } else p.setPosition(pos.x, pos.y, pos.z);
    g.connect(p).connect(sfxBus);
  } else {
    g.connect(sfxBus);
  }
  if (wet > 0 && reverb) {
    const w = ctx.createGain();
    w.gain.value = wet;
    g.connect(w).connect(reverb);
  }
  return g;
}

function noise(dest, t, dur, { type = 'lowpass', freq = 2000, q = 0.7, gain = 1, attack = 0.002, freqEnd = null, rate = 1 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = rate;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

function tone(dest, t, dur, { type = 'sine', freq = 440, freqEnd = null, gain = 0.5, attack = 0.002 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const SHOT = {
  pistol: { f: 3200, d: 0.12, g: 0.8, thump: 160, tg: 0.5, wet: 0.35 },
  magnum: { f: 2200, d: 0.22, g: 1.0, thump: 110, tg: 0.9, wet: 0.5 },
  smg: { f: 3600, d: 0.08, g: 0.65, thump: 180, tg: 0.4, wet: 0.25 },
  shotgun: { f: 1500, d: 0.3, g: 1.1, thump: 80, tg: 1.0, wet: 0.55 },
  rifle: { f: 2600, d: 0.14, g: 0.95, thump: 120, tg: 0.75, wet: 0.4 },
  rifle2: { f: 3000, d: 0.12, g: 0.85, thump: 135, tg: 0.65, wet: 0.38 },
  sniper: { f: 1800, d: 0.45, g: 1.2, thump: 70, tg: 1.2, wet: 0.8 },
  scout: { f: 2500, d: 0.3, g: 1.0, thump: 95, tg: 0.9, wet: 0.65 },
  lmg: { f: 2300, d: 0.16, g: 1.0, thump: 100, tg: 0.85, wet: 0.45 },
};

export function playShot(kind, pos) {
  if (!ctx) return;
  const s = SHOT[kind] || SHOT.rifle;
  const dest = out(pos, 6, s.wet);
  if (!dest) return;
  const t = ctx.currentTime;
  const j = 0.92 + Math.random() * 0.16;
  noise(dest, t, s.d, { type: 'lowpass', freq: s.f * j, freqEnd: 300, gain: s.g, q: 0.8 });
  noise(dest, t, 0.03, { type: 'highpass', freq: 4000, gain: s.g * 0.6 });
  tone(dest, t, s.d * 0.9, { type: 'sine', freq: s.thump * 1.6 * j, freqEnd: s.thump * 0.5, gain: s.tg });
}

export function playKnife(pos, hit) {
  if (!ctx) return;
  const dest = out(pos, 2, 0.1);
  if (!dest) return;
  const t = ctx.currentTime;
  noise(dest, t, 0.18, { type: 'bandpass', freq: 1800, freqEnd: 600, q: 1.5, gain: 0.45, attack: 0.03 });
  if (hit) tone(dest, t + 0.05, 0.12, { type: 'triangle', freq: 220, freqEnd: 90, gain: 0.6 });
}

export function playFootstep(pos, loud = 1) {
  if (!ctx) return;
  const dest = out(pos, 2.5, 0.08);
  if (!dest) return;
  const t = ctx.currentTime;
  noise(dest, t, 0.09, { type: 'bandpass', freq: 350 + Math.random() * 250, q: 1.2, gain: 0.55 * loud, attack: 0.004 });
  noise(dest, t, 0.04, { type: 'highpass', freq: 2500, gain: 0.12 * loud });
}

export function playLand(pos) {
  if (!ctx) return;
  const dest = out(pos, 3, 0.1);
  if (!dest) return;
  const t = ctx.currentTime;
  noise(dest, t, 0.14, { type: 'lowpass', freq: 600, gain: 0.7 });
}

export function playClick() {
  if (!ctx) return;
  const dest = out(null, 1, 0);
  const t = ctx.currentTime;
  tone(dest, t, 0.03, { type: 'square', freq: 1800, gain: 0.15 });
}

export function playReload(stage, pos) {
  if (!ctx) return;
  const dest = out(pos, 2, 0.05);
  if (!dest) return;
  const t = ctx.currentTime;
  const f = stage === 0 ? 900 : stage === 1 ? 1300 : 700;
  tone(dest, t, 0.05, { type: 'square', freq: f, gain: 0.12 });
  noise(dest, t, 0.06, { type: 'bandpass', freq: f * 2, q: 2, gain: 0.3 });
}

export function playHit(head) {
  if (!ctx) return;
  const dest = out(null, 1, 0);
  const t = ctx.currentTime;
  if (head) {
    tone(dest, t, 0.25, { type: 'sine', freq: 1900, gain: 0.35 });
    tone(dest, t, 0.2, { type: 'triangle', freq: 2850, gain: 0.15 });
  } else {
    tone(dest, t, 0.06, { type: 'triangle', freq: 1100, gain: 0.22 });
  }
}

export function playHurt() {
  if (!ctx) return;
  const dest = out(null, 1, 0);
  const t = ctx.currentTime;
  noise(dest, t, 0.15, { type: 'lowpass', freq: 500, gain: 0.8 });
  tone(dest, t, 0.12, { type: 'sine', freq: 140, freqEnd: 60, gain: 0.6 });
}

export function playImpact(pos, kind) {
  if (!ctx) return;
  const dest = out(pos, 1.5, 0.05);
  if (!dest) return;
  const t = ctx.currentTime;
  if (kind === 'crate') noise(dest, t, 0.08, { type: 'bandpass', freq: 700, q: 3, gain: 0.35 });
  else noise(dest, t, 0.06, { type: 'bandpass', freq: 2400, q: 1.5, gain: 0.25 });
}

export function playExplosion(pos) {
  if (!ctx) return;
  const dest = out(pos, 10, 0.9);
  if (!dest) return;
  const t = ctx.currentTime;
  noise(dest, t, 1.4, { type: 'lowpass', freq: 1500, freqEnd: 80, gain: 1.6, attack: 0.005 });
  tone(dest, t, 1.0, { type: 'sine', freq: 90, freqEnd: 28, gain: 1.4 });
}

export function playBigExplosion(pos) {
  if (!ctx) return;
  const dest = out(pos, 25, 1.0);
  if (!dest) return;
  const t = ctx.currentTime;
  noise(dest, t, 2.6, { type: 'lowpass', freq: 1200, freqEnd: 50, gain: 2.2, attack: 0.01 });
  tone(dest, t, 2.0, { type: 'sine', freq: 70, freqEnd: 20, gain: 1.8 });
}

export function playFlashBang(pos) {
  if (!ctx) return;
  const dest = out(pos, 8, 0.7);
  if (!dest) return;
  const t = ctx.currentTime;
  noise(dest, t, 0.5, { type: 'highpass', freq: 1500, gain: 1.2 });
  tone(dest, t, 0.3, { type: 'sine', freq: 180, freqEnd: 60, gain: 0.8 });
}

let ringNode = null;
export function playRinging(seconds) {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (ringNode) { try { ringNode.stop(); } catch (e) { /* ignora */ } }
  const o = ctx.createOscillator();
  o.frequency.value = 3600;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + seconds + 0.1);
  ringNode = o;
  // abafa o resto
  sfxBus.gain.cancelScheduledValues(t);
  sfxBus.gain.setValueAtTime(0.25, t);
  sfxBus.gain.linearRampToValueAtTime(1, t + seconds);
}

export function playSmoke(pos) {
  if (!ctx) return;
  const dest = out(pos, 5, 0.3);
  if (!dest) return;
  const t = ctx.currentTime;
  noise(dest, t, 2.2, { type: 'bandpass', freq: 900, freqEnd: 400, q: 0.6, gain: 0.5, attack: 0.1 });
}

export function playBounce(pos) {
  if (!ctx) return;
  const dest = out(pos, 2, 0.05);
  if (!dest) return;
  const t = ctx.currentTime;
  tone(dest, t, 0.06, { type: 'triangle', freq: 900 + Math.random() * 300, gain: 0.25 });
}

export function playThrow(pos) {
  if (!ctx) return;
  const dest = out(pos, 2, 0.05);
  if (!dest) return;
  const t = ctx.currentTime;
  noise(dest, t, 0.2, { type: 'bandpass', freq: 1200, freqEnd: 500, q: 1, gain: 0.3, attack: 0.04 });
}

export function playBeep(pos, urgent) {
  if (!ctx) return;
  const dest = out(pos, 8, 0.2);
  if (!dest) return;
  const t = ctx.currentTime;
  tone(dest, t, 0.09, { type: 'square', freq: urgent ? 2300 : 2000, gain: 0.25 });
}

export function playPlant() {
  if (!ctx) return;
  const dest = out(null, 1, 0.1);
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) tone(dest, t + i * 0.12, 0.08, { type: 'square', freq: 1500 + i * 200, gain: 0.15 });
}

export function playBuy() {
  if (!ctx) return;
  const dest = out(null, 1, 0);
  const t = ctx.currentTime;
  noise(dest, t, 0.12, { type: 'bandpass', freq: 1500, q: 2, gain: 0.3 });
  tone(dest, t + 0.03, 0.06, { type: 'square', freq: 1200, gain: 0.08 });
}

export function playDraw() {
  if (!ctx) return;
  const dest = out(null, 1, 0);
  const t = ctx.currentTime;
  noise(dest, t, 0.1, { type: 'bandpass', freq: 2200, q: 2, gain: 0.18, attack: 0.02 });
}

export function playJingle(kind) {
  if (!ctx) return;
  const dest = out(null, 1, 0.3);
  const t = ctx.currentTime;
  const seqs = {
    start: [[523, 0], [784, 0.12]],
    win: [[523, 0], [659, 0.12], [784, 0.24], [1046, 0.36]],
    lose: [[392, 0], [349, 0.16], [262, 0.32]],
    match: [[523, 0], [659, 0.1], [784, 0.2], [1046, 0.3], [784, 0.45], [1046, 0.6]],
    kill: [[880, 0], [1320, 0.06]],
  };
  for (const [f, dt] of seqs[kind] || []) {
    tone(dest, t + dt, 0.22, { type: 'triangle', freq: f, gain: 0.22 });
  }
}

export function playChat() {
  if (!ctx) return;
  const dest = out(null, 1, 0);
  tone(dest, ctx.currentTime, 0.08, { type: 'sine', freq: 1400, gain: 0.12 });
}

export function playFireStart(pos) {
  if (!ctx) return;
  const dest = out(pos, 5, 0.3);
  if (!dest) return;
  const t = ctx.currentTime;
  noise(dest, t, 0.6, { type: 'lowpass', freq: 1200, freqEnd: 300, gain: 0.9, attack: 0.01 });
  tone(dest, t, 0.15, { type: 'triangle', freq: 1800, freqEnd: 600, gain: 0.2 }); // vidro
}

export function playCrackle(pos) {
  if (!ctx) return;
  const dest = out(pos, 3, 0.1);
  if (!dest) return;
  const t = ctx.currentTime;
  noise(dest, t, 0.25, { type: 'bandpass', freq: 600 + Math.random() * 600, q: 0.8, gain: 0.35, attack: 0.02 });
  if (Math.random() < 0.5) noise(dest, t + Math.random() * 0.1, 0.03, { type: 'highpass', freq: 3000, gain: 0.3 });
}
