// Banda sonora generativa de la isla (100 % original, hecha con Web Audio: sin archivos ni derechos de terceros).
// - Música chill lo-fi: acordes suaves, bajo, melodía pentatónica con eco y crujido de vinilo. Más tenue de noche.
// - Ambiente: olas, viento, río, pájaros y gaviotas (día), grillos (noche), lluvia/truenos (clima),
//   zumbido de la mano de piedra y murmullo en la plaza según dónde mire la cámara.
// Funciona en vivo (AudioContext) y offline para los Reels (OfflineAudioContext → WAV).

const CHORDS = [ // Cmaj7 – Am7 – Fmaj7 – G6 (MIDI)
  [48, 55, 59, 64], [45, 52, 55, 60], [41, 48, 52, 57], [43, 50, 52, 59],
];
const PENTA = [72, 74, 76, 79, 81, 84, 86, 88];
const BPM = 70, BEAT = 60 / BPM, BAR = BEAT * 4;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function noiseBuffer(ctx, secs = 4, brown = false) {
  const b = ctx.createBuffer(1, ctx.sampleRate * secs, ctx.sampleRate); const d = b.getChannelData(0); let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
  return b;
}
function reverbIR(ctx, secs = 3.2) {
  const b = ctx.createBuffer(2, ctx.sampleRate * secs, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2.6; }
  return b;
}

export class IslandSound {
  // env(): { hour, weather, sea, river, plaza, figure, social }  (0..1 las proximidades)
  constructor(ctx, env, { seed = 7, live = true, reverbSecs = 3.2, mobile = false } = {}) {
    this.ctx = ctx; this.env = env; this.r = rng(seed); this.live = live; this.mobile = mobile;
    const c = ctx;
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -12; this.limiter.knee.value = 12; this.limiter.ratio.value = 6;
    this.limiter.attack.value = 0.005; this.limiter.release.value = 0.15;
    this.limiter.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = 0.85; this.master.connect(this.limiter);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0.55;
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 0.75;
    this.musicBus.connect(this.master); this.sfxBus.connect(this.master);
    // Reverb + eco compartidos por la música (en móvil omitimos ConvolverNode para evitar chasquidos)
    this.delay = c.createDelay(2); this.delay.delayTime.value = BEAT * 0.75; const fb = c.createGain(); fb.gain.value = 0.3; const dl = c.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2000;
    this.delay.connect(dl); dl.connect(fb); fb.connect(this.delay); dl.connect(this.musicBus);
    this.warm = c.createBiquadFilter(); this.warm.type = 'lowpass'; this.warm.frequency.value = 2400; this.warm.connect(this.musicBus);
    if (!mobile) {
      this.verb = c.createConvolver(); this.verb.buffer = reverbIR(c, reverbSecs); const vg = c.createGain(); vg.gain.value = 0.32; this.verb.connect(vg); vg.connect(this.musicBus);
      this.warm.connect(this.verb);
    }
    this.#ambience();
    this.nextBar = c.currentTime + 0.1; this.bar = 0; this.nextSfx = c.currentTime + 0.5;
  }

  setMusic(on) { if (this.ctx.state !== 'closed') this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.4); }
  setSfx(on) { if (this.ctx.state !== 'closed') this.sfxBus.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.4); }
  resume() { return this.ctx.state !== 'running' && this.ctx.state !== 'closed' ? this.ctx.resume().catch(() => {}) : Promise.resolve(); }
  suspend() { return this.ctx.state === 'running' ? this.ctx.suspend().catch(() => {}) : Promise.resolve(); }

  // ---------- capas continuas ----------
  #loop(buffer, filterType, freq, q = 0.7) {
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = buffer; s.loop = true;
    const f = c.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.sfxBus); s.start();
    return { f, g };
  }
  #ambience() {
    const c = this.ctx; const white = noiseBuffer(c, 4), brown = noiseBuffer(c, 6, true);
    this.waves = this.#loop(brown, 'lowpass', 520);
    this.foam = this.#loop(white, 'highpass', 2500);
    this.wind = this.#loop(brown, 'bandpass', 380, 0.6);
    this.river = this.#loop(white, 'bandpass', 1300, 1.1);
    this.rain = this.#loop(white, 'highpass', 1700);
    this.crowd = this.#loop(brown, 'bandpass', 650, 1.4);
    this.vinyl = this.#loop(white, 'highpass', 4000); // crujido lo-fi (se modula en update)
    // zumbido de la mano de piedra
    this.hum = c.createGain(); this.hum.gain.value = 0; this.hum.connect(this.sfxBus);
    for (const [f, t] of [[110, 'sine'], [164.8, 'sine'], [220.4, 'triangle']]) { const o = c.createOscillator(); o.type = t; o.frequency.value = f; const g = c.createGain(); g.gain.value = 0.33; o.connect(g); g.connect(this.hum); o.start(); }
  }

  // ---------- notas ----------
  #pad(time, midi, dur, vel) {
    const c = this.ctx;
    for (const det of (this.mobile ? [0] : [-6, 6])) {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(midi); o.detune.value = det;
      const g = c.createGain(); g.gain.setValueAtTime(0, time); g.gain.linearRampToValueAtTime(this.mobile ? vel * 1.4 : vel, time + 1.0); g.gain.setTargetAtTime(0, time + dur - 0.5, 0.45);
      o.connect(g); g.connect(this.warm); o.start(time); o.stop(time + dur + 2.2);
    }
  }
  #pluck(time, midi, vel) {
    const c = this.ctx; const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(midi);
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = mtof(midi) * 2.001;
    const g = c.createGain(); g.gain.setValueAtTime(0, time); g.gain.linearRampToValueAtTime(vel, time + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, time + 1.4);
    const g2 = c.createGain(); g2.gain.value = 0.15;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.warm); g.connect(this.delay);
    o.start(time); o2.start(time); o.stop(time + 1.5); o2.stop(time + 1.5);
  }
  #bass(time, midi, dur) {
    const c = this.ctx; const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(midi - 12);
    const g = c.createGain(); g.gain.setValueAtTime(0, time); g.gain.linearRampToValueAtTime(0.16, time + 0.05); g.gain.setTargetAtTime(0, time + dur * 0.8, 0.3);
    o.connect(g); g.connect(this.musicBus); o.start(time); o.stop(time + dur + 1);
  }
  #softKick(time) {
    const c = this.ctx; const o = c.createOscillator(); o.frequency.setValueAtTime(110, time); o.frequency.exponentialRampToValueAtTime(45, time + 0.18);
    const g = c.createGain(); g.gain.setValueAtTime(0.22, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.3); o.connect(g); g.connect(this.musicBus); o.start(time); o.stop(time + 0.35);
  }

  // ---------- efectos puntuales ----------
  #chirp(time) { // pajarito
    const c = this.ctx; const n = 2 + Math.floor(this.r() * 2); const base = 1850 + this.r() * 800;
    for (let i = 0; i < n; i++) {
      const t = time + i * (0.09 + this.r() * 0.05); const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * 1.32, t + 0.06);
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + 0.1);
    }
  }
  #gull(time) { // gaviota lejana
    const c = this.ctx; const o = c.createOscillator(); o.type = 'triangle'; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 2.5;
    o.frequency.setValueAtTime(920, time); o.frequency.linearRampToValueAtTime(700, time + 0.35); o.frequency.linearRampToValueAtTime(800, time + 0.5);
    const g = c.createGain(); g.gain.setValueAtTime(0, time); g.gain.linearRampToValueAtTime(0.02, time + 0.05); g.gain.linearRampToValueAtTime(0, time + 0.55);
    o.connect(f); f.connect(g); g.connect(this.sfxBus); o.start(time); o.stop(time + 0.6);
  }
  #crickets(time) {
    const c = this.ctx; const o = c.createOscillator(); o.frequency.value = 3400 + this.r() * 450; const am = c.createOscillator(); am.frequency.value = 24 + this.r() * 6;
    const amg = c.createGain(); amg.gain.value = 0.45; const g = c.createGain(); g.gain.value = 0.5; am.connect(amg); amg.connect(g.gain);
    const env = c.createGain(); const len = 0.35 + this.r() * 0.6; env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(0.007, time + 0.05); env.gain.setValueAtTime(0.007, time + len); env.gain.linearRampToValueAtTime(0, time + len + 0.05);
    o.connect(g); g.connect(env); env.connect(this.sfxBus); o.start(time); am.start(time); o.stop(time + len + 0.1); am.stop(time + len + 0.1);
  }
  #thunder(time) {
    const c = this.ctx; const s = c.createBufferSource(); s.buffer = noiseBuffer(c, 3, true); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160;
    const g = c.createGain(); g.gain.setValueAtTime(0, time); g.gain.linearRampToValueAtTime(0.6, time + 0.08); g.gain.exponentialRampToValueAtTime(0.001, time + 2.8);
    s.connect(f); f.connect(g); g.connect(this.sfxBus); s.start(time); s.stop(time + 3);
  }

  // Programa todo lo que suena entre "ahora" y "hasta" (en vivo se llama cada ~0.25 s; offline una vez).
  schedule(until) {
    const now = this.ctx.currentTime;
    if (this.nextBar < now - 0.1) this.nextBar = now + 0.05;
    if (this.nextSfx < now - 0.1) this.nextSfx = now + 0.1;
    const e = this.env(); const night = e.hour < 6 || e.hour >= 20; const dusk = e.hour >= 18 && e.hour < 20;
    while (this.nextBar < until) {
      const t = this.nextBar; const ch = CHORDS[this.bar % CHORDS.length];
      ch.forEach((m) => this.#pad(t, m, BAR, night ? 0.025 : 0.035));
      this.#bass(t, ch[0], BEAT * 2); this.#bass(t + BEAT * 2, ch[0] + (this.r() < 0.5 ? 7 : 0), BEAT * 2);
      if (!night) { this.#softKick(t); this.#softKick(t + BEAT * 2.5); }
      let idx = Math.floor(this.r() * PENTA.length);
      for (let b = 0; b < 8; b++) { // corcheas con probabilidad: melodía que nunca se repite igual
        if (this.r() < (night ? 0.22 : 0.45)) { idx = Math.max(0, Math.min(PENTA.length - 1, idx + Math.floor(this.r() * 5) - 2)); this.#pluck(t + b * BEAT / 2 + (this.r() - 0.5) * 0.03, PENTA[idx] - (night ? 12 : 0), 0.05 + this.r() * 0.03); }
      }
      this.nextBar += BAR; this.bar++;
    }
    while (this.nextSfx < until) {
      const t = this.nextSfx; const rainy = e.weather === 'lluvia' || e.weather === 'tormenta';
      if (!night && !rainy && this.r() < 0.35 * (1 - e.sea * 0.5)) this.#chirp(t);
      if (!night && this.r() < 0.12 * e.sea) this.#gull(t + 0.3);
      if ((night || dusk) && this.r() < 0.7) this.#crickets(t + this.r() * 0.5);
      if (e.weather === 'tormenta' && this.r() < 0.04) this.#thunder(t);
      this.nextSfx += 1;
    }
  }

  // Ajusta las capas continuas según hora, clima y cámara.
  update() {
    const e = this.env(); const now = this.ctx.currentTime; const set = (p, v) => p.setTargetAtTime(v, now, 0.8);
    const rainy = e.weather === 'lluvia' || e.weather === 'tormenta'; const storm = e.weather === 'tormenta';
    const swell = 0.6 + 0.4 * Math.sin(now * 0.5) * Math.sin(now * 0.13);
    set(this.waves.g.gain, (0.05 + 0.12 * e.sea) * swell); set(this.foam.g.gain, 0.012 * e.sea * swell);
    set(this.wind.g.gain, storm ? 0.09 : rainy ? 0.05 : 0.025); this.wind.f.frequency.setTargetAtTime(300 + 200 * Math.sin(now * 0.07), now, 1);
    set(this.river.g.gain, 0.006 + 0.03 * e.river);
    set(this.rain.g.gain, rainy ? (storm ? 0.1 : 0.06) : 0);
    set(this.crowd.g.gain, 0.05 * e.plaza * e.social);
    set(this.vinyl.g.gain, 0.0025);
    set(this.hum.gain, 0.05 * e.figure * (e.hour < 6 || e.hour >= 19 ? 1.6 : 1));
    this.warm.frequency.setTargetAtTime(e.hour < 6 || e.hour >= 20 ? 1400 : 2600, now, 2);
  }
}

// ---------- en vivo ----------
export function startLiveSound(envFn, { mobile = false } = {}) {
  const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return null;
  let ctx;
  try { ctx = new Ctx(mobile ? { latencyHint: 'playback', sampleRate: 24000 } : undefined); } catch { ctx = new Ctx(); }
  ctx.resume?.().catch(() => {});
  const s = new IslandSound(ctx, envFn, { seed: Math.floor(Math.random() * 1e9), reverbSecs: mobile ? 1.2 : 3.2, mobile });
  const tick = () => {
    if (ctx.state !== 'running') return;
    s.update(); s.schedule(ctx.currentTime + (mobile ? 1.9 : 1.2));
  };
  tick(); s.timer = setInterval(tick, mobile ? 650 : 250);
  return s;
}

// ---------- offline para Reels: devuelve un WAV ----------
export async function renderSoundtrack(seconds, envFn, seed = 7) {
  const sr = 44100; const ctx = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
  const s = new IslandSound(ctx, envFn, { seed, live: false });
  // en offline el "ahora" es 0: se programa todo de golpe y las capas continuas con valores fijos
  s.update(); s.schedule(seconds);
  const buf = await ctx.startRendering();
  return toWav(buf);
}

function toWav(buf) {
  const ch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate; const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, len * ch * 2, true);
  const data = [...Array(ch).keys()].map((c) => buf.getChannelData(c)); let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const v = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Blob([out], { type: 'audio/wav' });
}
