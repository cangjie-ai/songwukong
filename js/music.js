'use strict';
// ============ 程序化背景音乐（WebAudio 合成，无音频文件） ============
// 两条音轨：forest（黑风山·阴郁紧张的巡林脉动）/ temple（Boss 战·急促驱动）
const Music = {
  playing: null, muted: false, timer: null, nextTime: 0, step: 0, master: null,

  ensureMaster() {
    if (!SFX.ctx) return false;
    if (!this.master) {
      try {
        this.master = SFX.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(SFX.ctx.destination);
      } catch (e) { return false; }
    }
    return true;
  },

  // 每帧调用：desired 为 'forest' / 'temple' / null
  update(desired) {
    if (this.muted) desired = null;
    if (desired === this.playing) return;
    this.stopTrack();
    if (desired && this.ensureMaster()) this.startTrack(desired);
  },

  startTrack(name) {
    this.playing = name; this.step = 0;
    this.nextTime = SFX.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.schedule(), 60);
  },

  stopTrack() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null; this.playing = null;
  },

  // 提前调度（lookahead），保证节拍稳定
  schedule() {
    const ctx = SFX.ctx;
    if (!ctx || !this.playing) return;
    while (this.nextTime < ctx.currentTime + 0.22) {
      this.playStep(this.playing, this.step, this.nextTime);
      const bpm = this.playing === 'temple' ? 164 : 134;
      this.nextTime += 30 / bpm;          // 八分音符
      this.step = (this.step + 1) % 64;
    }
  },

  n(freq, t, dur, type = 'triangle', vol = 0.05, cut = 0) {
    const ctx = SFX.ctx;
    try {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      if (cut) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = cut;
        o.connect(f); f.connect(g);
      } else o.connect(g);
      g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { }
  },

  kick(t, vol = 0.12) {
    const ctx = SFX.ctx;
    try {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.2);
    } catch (e) { }
  },

  noiseHit(t, dur, hp, vol) {
    const ctx = SFX.ctx;
    try {
      const len = ctx.sampleRate * dur | 0;
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'highpass'; f.frequency.value = hp;
      g.gain.value = vol;
      s.buffer = b; s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t);
    } catch (e) { }
  },
  hat(t, vol = 0.012) { this.noiseHit(t, 0.03, 5000, vol); },
  snare(t, vol = 0.06) { this.noiseHit(t, 0.09, 1600, vol); },

  playStep(track, s, t) {
    const A1 = 55;
    const semi = (root, st) => root * Math.pow(2, st / 12);
    if (track === 'forest') {
      // 低音脉动：A A C A | A A G A（小调阴郁）
      const bassPat = [0, 0, 3, 0, 0, 0, -2, 0];
      this.n(semi(A1, bassPat[s % 8]), t, 0.20, 'sawtooth', 0.045, 420);
      if (s % 8 === 0) this.kick(t, 0.10);
      if (s % 2 === 1) this.hat(t);
      if (s % 16 === 14) this.kick(t, 0.055);
      // 稀疏旋律（A 小调五声 + 偶发小二度制造不安）
      const mel = { 0: 7, 6: 3, 12: 0, 20: 10, 28: 7, 34: 3, 40: 12, 44: 10, 52: 7, 58: 2 };
      if (mel[s] !== undefined) {
        const f = semi(220, mel[s]);
        this.n(f, t, 0.6, 'triangle', 0.035);
        this.n(f, t + 0.18, 0.5, 'sine', 0.015);   // 回声
      }
    } else {
      // Boss 战：驱动低音 + 急促琶音
      const bassPat = [0, 0, 3, 0, -2, 0, 3, 5];
      this.n(semi(A1, bassPat[s % 8]), t, 0.14, 'sawtooth', 0.06, 620);
      this.n(semi(A1 * 2, bassPat[s % 8]), t, 0.10, 'square', 0.018, 900);
      if (s % 4 === 0) this.kick(t, 0.13);
      if (s % 8 === 4) this.snare(t, 0.07);
      this.hat(t, 0.014);
      const arp = [12, 15, 19, 15, 12, 15, 20, 15];   // A C E C … + 小六度紧张音
      if (s % 2 === 0) this.n(semi(110, arp[(s / 2 | 0) % 8]), t, 0.16, 'square', 0.02, 1600);
      if (s === 32) this.n(semi(220, 13), t, 1.2, 'sawtooth', 0.018, 800);  // 小九度长音压迫感
    }
  }
};
