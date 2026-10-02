// Web Audio 합성 효과음 + 절차 생성 BGM. 에셋 파일 없음.
// 타격/베기/패링류/대시를 따로 합성하고 피치를 조금씩 흔든다. BGM은 상황(탐험/전투/보스)에 따라 층이 쌓인다.

const rnd = (a, b) => a + Math.random() * (b - a);
const jit = (k = 0.1) => 1 + (Math.random() - 0.5) * k * 2;

// A 마이너 진행: Am - F - C - G
const BASS = [55, 43.65, 65.41, 49];
const CHORD = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];

class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('nb_muted') === '1'; } catch {}
    this.mode = 'quiet';  // quiet | explore | combat | boss
    this.step = 0;
    this.next = 0;
    this._warnT = 0;
    this.vol = 0.8; this.musicVol = 0.6;
  }

  // 빗소리 켜기/끄기 (설정)
  setRain(on) { this.rainOn = on; if (this.rainGain) this.rainGain.gain.value = on ? 0.045 : 0; }

  setVolumes(master, music) {
    this.vol = master; this.musicVol = music;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.vol;
    if (this.music) this.music.gain.value = 0.5 * (this.musicVol / 0.6);
  }

  unlock() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.vol;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.5 * (this.musicVol / 0.6); this.music.connect(this.master);
    // 공용 노이즈 버퍼
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._rain();
    this.next = ctx.currentTime + 0.1;
    this._timer = setInterval(() => this._tick(), 25);
    this.bindVisibility();
  }

  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('nb_muted', this.muted ? '1' : '0'); } catch {}
    if (this.master) this.master.gain.value = this.muted ? 0 : this.vol;
    return this.muted;
  }

  setMode(m) { this.mode = m; }

  // 다른 탭/앱으로 가면 소리를 완전히 멈추고, 돌아오면 다시 켠다 (빗소리 같은 반복음이 뒤에서 계속 나지 않게)
  bindVisibility() {
    const sync = () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend?.();
      else this.ctx.resume?.();
    };
    document.addEventListener('visibilitychange', sync);
    addEventListener('pagehide', () => this.ctx?.suspend?.());
    addEventListener('pageshow', sync);
  }

  // ---------- 합성 부품 ----------
  _tone(type, f0, f1, dur, vol, o = {}) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
    node.connect(g); g.connect(o.bus || this.sfx);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  _noise(dur, vol, type, f0, f1, o = {}) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.bus || this.sfx);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  // ---------- 효과음 ----------
  slash(heavy = false) {
    const r = jit(0.12);
    if (heavy) { this._noise(0.28, 0.3, 'bandpass', 500 * r, 2200 * r, { q: 1.2 }); this._tone('sawtooth', 220 * r, 70, 0.26, 0.1, { lp: 900 }); }
    else this._noise(0.14, 0.22, 'bandpass', 1300 * r, 3800 * r, { q: 1.5 });
  }
  hit(heavy = false, killed = false) {
    const r = jit(0.1);
    if (heavy) { this._tone('sine', 110 * r, 36, 0.32, 0.75); this._noise(0.1, 0.4, 'highpass', 2500, 2500); }
    else { this._tone('sine', 170 * r, 58, 0.16, 0.5); this._noise(0.06, 0.28, 'highpass', 3200 * r, 3200 * r); }
    this._tone('triangle', 1500 * r, 1100 * r, 0.14, 0.07, { delay: 0.01 });  // 금속 울림
    if (killed) this.kill();
  }
  kill() {
    this._noise(0.5, 0.45, 'lowpass', 2400, 160);
    this._tone('sine', 90, 28, 0.55, 0.7);
    for (let i = 0; i < 4; i++) this._tone('triangle', rnd(1400, 3200), rnd(300, 900), 0.18, 0.05, { delay: rnd(0.02, 0.18) });
  }
  execution() {
    this._noise(0.35, 0.4, 'highpass', 4000, 9000);
    this._tone('sine', 62, 24, 0.9, 0.85);
    this._tone('sawtooth', 300, 50, 0.4, 0.15, { lp: 1200, delay: 0.05 });
    this.kill();
  }
  dash() {
    const r = jit(0.08);
    this._noise(0.24, 0.32, 'bandpass', 350 * r, 3200 * r, { q: 1.1 });
    this._tone('sine', 280 * r, 900 * r, 0.2, 0.1);
  }
  dodge() {
    this._tone('sine', 1568, 1568, 0.7, 0.14); this._tone('sine', 2349, 2349, 0.6, 0.1, { delay: 0.05 });
    this._noise(0.4, 0.22, 'lowpass', 400, 7000, { attack: 0.3 });
    this._tone('sine', 90, 45, 0.5, 0.4);
  }
  hurt() {
    this._tone('sawtooth', 150, 48, 0.3, 0.5, { lp: 700 });
    this._noise(0.2, 0.4, 'lowpass', 900, 200);
    this._tone('square', 90, 60, 0.15, 0.1);
  }
  guard() {
    const r = jit(0.06);
    [1, 2.76, 5.4, 8.93].forEach((m, i) => this._tone(i % 2 ? 'sine' : 'triangle', 640 * m * r, 640 * m * r * 0.98, 0.28 - i * 0.04, 0.09 / (i + 1)));
    this._noise(0.05, 0.3, 'highpass', 4500, 4500);
  }
  broke() {
    this._tone('square', 950, 190, 0.28, 0.2, { lp: 3000 });
    this._noise(0.3, 0.35, 'bandpass', 2400, 700, { q: 2 });
    this._tone('sine', 80, 40, 0.3, 0.5);
  }
  warn() {
    const t = this.ctx?.currentTime || 0;
    if (t - this._warnT < 0.18) return;
    this._warnT = t;
    this._tone('square', 880, 880, 0.07, 0.07, { lp: 2400 });
    this._tone('square', 1175, 1175, 0.09, 0.07, { lp: 2400, delay: 0.1 });
  }
  shot() {
    this._tone('sawtooth', 1000, 130, 0.22, 0.14, { lp: 3000 });
    this._noise(0.12, 0.2, 'bandpass', 3000, 900, { q: 2 });
  }
  gauge() { this._tone('sine', 660, 990, 0.12, 0.1); this._tone('sine', 990, 1320, 0.1, 0.07, { delay: 0.05 }); }
  rampage(on) {
    if (on) {
      this._tone('sawtooth', 90, 900, 0.7, 0.14, { lp: 3000, attack: 0.3 });
      [220, 277.18, 329.63, 440].forEach((f, i) => this._tone('triangle', f, f, 0.9, 0.08, { delay: 0.45 + i * 0.03 }));
      this._noise(0.5, 0.3, 'highpass', 1500, 6000, { attack: 0.35 });
    } else this._tone('sawtooth', 700, 80, 0.5, 0.12, { lp: 1800 });
  }
  roar() {
    this._tone('sawtooth', 75, 38, 1.5, 0.5, { lp: 500, attack: 0.1 });
    this._tone('square', 150, 70, 1.3, 0.15, { lp: 700, attack: 0.1 });
    this._noise(1.2, 0.3, 'lowpass', 900, 150, { attack: 0.15 });
  }
  gateOpen() {
    this._noise(0.9, 0.3, 'bandpass', 3800, 300, { q: 1.2, attack: 0.02 });
    this._tone('sawtooth', 600, 70, 0.9, 0.16, { lp: 1800 });
    [392, 523.25, 659.25].forEach((f, i) => this._tone('triangle', f, f, 0.8, 0.09, { delay: 0.2 + i * 0.1 }));
  }
  chip() { [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => this._tone('triangle', f, f, 0.35, 0.09, { delay: i * 0.07 })); }
  bump() { this._tone('square', 140, 90, 0.12, 0.08, { lp: 800 }); this._noise(0.15, 0.12, 'bandpass', 1500, 600); }
  ui() { this._tone('sine', 720, 960, 0.06, 0.09); }
  select() { this._tone('triangle', 520, 780, 0.09, 0.1); this._tone('triangle', 780, 1040, 0.09, 0.08, { delay: 0.06 }); }
  death() {
    this._tone('sawtooth', 220, 30, 1.3, 0.4, { lp: 900 });
    this._noise(1.0, 0.35, 'lowpass', 1500, 100);
  }
  clear() {
    [440, 523.25, 659.25, 880].forEach((f, i) => this._tone('triangle', f, f, 1.1, 0.12, { delay: i * 0.14 }));
    this._tone('sine', 110, 110, 1.6, 0.2);
  }

  // ---------- 빗소리 ----------
  _rain() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 7000;
    const g = (this.rainGain = ctx.createGain()); g.gain.value = this.rainOn === false ? 0 : 0.045;
    src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(this.sfx);
    src.start();
  }

  // ---------- BGM 시퀀서 ----------
  _tick() {
    const ctx = this.ctx; if (!ctx) return;
    const tempo = this.mode === 'boss' ? 128 : this.mode === 'combat' ? 112 : 92;
    const dur = 60 / tempo / 4;
    while (this.next < ctx.currentTime + 0.14) {
      this._schedule(this.step, this.next, dur);
      this.next += dur;
      this.step++;
    }
  }

  _note(type, f, t, dur, vol, lp, bus) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
    osc.type = type; osc.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(lp, t); fl.frequency.exponentialRampToValueAtTime(Math.max(120, lp * 0.3), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(fl); fl.connect(g); g.connect(bus || this.music);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  _drum(kind, t, vol) {
    const ctx = this.ctx;
    if (kind === 'kick') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.25);
    } else {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = kind === 'hat' ? 'highpass' : 'bandpass';
      f.frequency.value = kind === 'hat' ? 7500 : 1800; f.Q.value = 0.9;
      const g = ctx.createGain(); const d = kind === 'hat' ? 0.05 : 0.16;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      src.connect(f); f.connect(g); g.connect(this.music); src.start(t, Math.random(), d + 0.05);
    }
  }

  _schedule(step, t, dur) {
    const m = this.mode, s = step % 16, bar = Math.floor(step / 16) % 4;
    const combat = m === 'combat' || m === 'boss', boss = m === 'boss';
    const root = BASS[bar], chord = CHORD[bar];
    const q = m === 'quiet';

    // 패드: 마디 첫 박에 길게
    if (s === 0) chord.forEach((f, i) => { this._note('sawtooth', f * (1 + (i - 1) * 0.003), t, dur * 16 * 0.98, q ? 0.035 : 0.045, 900); this._note('sawtooth', f * 0.5, t, dur * 16 * 0.98, 0.03, 500); });
    if (q) return;

    // 베이스
    if (combat) {
      if (s % 2 === 0) this._note('sawtooth', root * (s === 6 || s === 14 ? 2 : 1), t, dur * 1.8, boss ? 0.2 : 0.17, boss ? 1400 : 900);
    } else if (s === 0 || s === 8 || s === 11) this._note('sawtooth', root, t, dur * 5, 0.14, 500);

    // 아르페지오
    const arpGap = boss ? 1 : combat ? 1 : 4;
    if (s % arpGap === 0) {
      const f = chord[(s / arpGap | 0) % 3] * (combat ? (s % 8 < 4 ? 2 : 4) : 2);
      this._note(combat ? 'square' : 'triangle', f, t, dur * 1.4, combat ? 0.05 : 0.04, combat ? 2800 : 1800);
    }

    // 드럼
    if (combat) {
      if (s % 4 === 0 || (boss && s === 14)) this._drum('kick', t, 0.55);
      if (s === 4 || s === 12) this._drum('snare', t, 0.22);
      if (boss ? true : s % 2 === 0) this._drum('hat', t, s % 4 === 2 ? 0.12 : 0.07);
    } else {
      if (s === 0 || s === 8) this._drum('kick', t, 0.3);
      if (s % 4 === 2) this._drum('hat', t, 0.045);
    }
  }
}

export const audio = new AudioSys();
