'use strict';
// ============ 通用工具 ============
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const aabb = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

// roundRect 兼容旧浏览器
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

// 确定性伪随机（用于背景装饰，避免每帧闪烁）
function seeded(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ============ 粒子 ============
class Particle {
  constructor(x, y, vx, vy, life, size, color, grav = 0) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.size = size; this.color = color; this.grav = grav;
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vy += this.grav * dt;
    this.life -= dt;
    return this.life > 0;
  }
  render(ctx) {
    const a = clamp(this.life / this.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    const s = this.size * (0.5 + 0.5 * a);
    ctx.fillRect(this.x - s / 2, this.y - s / 2, s, s);
    ctx.globalAlpha = 1;
  }
}

// 伤害飘字
class DmgNum {
  constructor(x, y, text, color = '#ffd873', big = false) {
    this.x = x + rand(-8, 8); this.y = y;
    this.text = text; this.color = color; this.big = big;
    this.life = 0.8; this.maxLife = 0.8;
  }
  update(dt) { this.y -= 60 * dt; this.life -= dt; return this.life > 0; }
  render(ctx) {
    ctx.globalAlpha = clamp(this.life / this.maxLife * 1.5, 0, 1);
    ctx.font = (this.big ? 'bold 26px' : 'bold 17px') + ' "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1a120b';
    ctx.fillText(this.text, this.x + 1, this.y + 1);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.globalAlpha = 1;
  }
}

// ============ 简易音效（WebAudio 合成，无素材文件） ============
const SFX = {
  ctx: null,
  init() {
    if (this.ctx) return;
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* 无音频也不影响游戏 */ }
  },
  tone(freq, dur, type = 'square', vol = 0.12, slide = 0) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + dur);
    } catch (e) { }
  },
  noise(dur, vol = 0.1) {
    if (!this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
      s.buffer = buf; g.gain.value = vol;
      s.connect(g); g.connect(this.ctx.destination); s.start(t);
    } catch (e) { }
  },
  swing() { this.noise(0.08, 0.06); },
  hit() { this.tone(180, 0.08, 'square', 0.1, -120); this.noise(0.05, 0.08); },
  heavy() { this.tone(90, 0.25, 'sawtooth', 0.16, -60); this.noise(0.18, 0.14); },
  hurt() { this.tone(140, 0.2, 'sawtooth', 0.12, -90); },
  heal() { this.tone(520, 0.3, 'sine', 0.08, 200); },
  freeze() { this.tone(880, 0.4, 'sine', 0.08, -600); },
  shot() { this.tone(600, 0.06, 'square', 0.05, -300); },
  roar() { this.tone(70, 0.6, 'sawtooth', 0.18, -30); this.noise(0.4, 0.12); },
  die() { this.tone(220, 0.5, 'triangle', 0.1, -180); }
};

// ============ 平台物理（玩家与敌人共用） ============
// ent: {x,y,w,h,vx,vy,onGround}   platforms: [{x,y,w,h,type:'solid'|'plat'}]
function physicsStep(ent, level, dt) {
  // 水平
  ent.x += ent.vx * dt;
  for (const p of level.platforms) {
    if (p.type !== 'solid') continue;
    if (aabb(ent, p)) {
      if (ent.vx > 0 && ent.x + ent.w - p.x < 30) ent.x = p.x - ent.w;
      else if (ent.vx < 0 && p.x + p.w - ent.x < 30) ent.x = p.x + p.w;
    }
  }
  ent.x = clamp(ent.x, 0, level.width - ent.w);
  // 垂直
  const prevBottom = ent.y + ent.h;
  ent.y += ent.vy * dt;
  ent.onGround = false;
  for (const p of level.platforms) {
    if (!aabb(ent, p)) continue;
    if (ent.vy >= 0 && prevBottom <= p.y + 8) {          // 从上方落到平台
      ent.y = p.y - ent.h; ent.vy = 0; ent.onGround = true;
    } else if (p.type === 'solid' && ent.vy < 0 && prevBottom > p.y + 8) { // 顶头
      if (ent.y < p.y + p.h && ent.y + ent.h > p.y + p.h) { ent.y = p.y + p.h; ent.vy = 0; }
    }
  }
}
