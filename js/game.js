'use strict';
// ============ 游戏主体 ============
const FONT_TITLE = '"STKaiti", "KaiTi", "Noto Serif SC", serif';

const Game = {
  canvas: null, ctx: null,
  state: 'title', levelIndex: 1, level: null,
  player: null, enemies: [], arrows: [], patches: [], particles: [], dmgNums: [], rings: [],
  boss: null,
  camX: 0, shakeMag: 0, hitPause: 0,
  time: 0, splash: 0, fade: 0, stateT: 0,
  checkpoint: null,   // {level, x} 土地庙存档
  ambientT: 0,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    Input.init();
    window.addEventListener('resize', () => this.resize());
    this.resize();

    const q = new URLSearchParams(location.search);
    const lv = parseInt(q.get('level') || '1');
    if (q.get('start')) { this.loadLevel(clamp(lv, 1, 2)); this.state = 'play'; }

    let last = performance.now();
    const frame = (ts) => {
      const dt = Math.min((ts - last) / 1000, 1 / 30);
      last = ts;
      this.tick(dt);
      Input.endFrame();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  },

  resize() {
    const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
    this.canvas.style.width = VIEW_W * s + 'px';
    this.canvas.style.height = VIEW_H * s + 'px';
  },

  loadLevel(n) {
    this.levelIndex = n;
    this.level = makeLevel(n);
    this.player = new Player(this.level.playerStart.x, this.level.playerStart.y);
    this.enemies = this.level.spawns.map(s => {
      if (s.type === 'wolf') return new WolfMinion(s.x, s.y !== undefined ? s.y : this.level.groundY - 60, s.a, s.b);
      if (s.type === 'archer') return new WolfArcher(s.x, s.y !== undefined ? s.y : this.level.groundY - 60);
      return new BossGuangzhi(s.x, s.y);
    });
    this.boss = this.enemies.find(e => e.isBoss) || null;
    this.arrows = []; this.patches = []; this.particles = []; this.dmgNums = []; this.rings = [];
    this.camX = clamp(this.player.x - VIEW_W * 0.4, 0, this.level.width - VIEW_W);
    this.splash = 3.2; this.shakeMag = 0; this.hitPause = 0;
    // 土地庙存档恢复
    if (this.checkpoint && this.checkpoint.level === n) {
      this.player.x = this.checkpoint.x;
      if (this.level.shrine) this.level.shrine.active = true;
      this.camX = clamp(this.player.x - VIEW_W * 0.4, 0, this.level.width - VIEW_W);
    }
  },

  respawnX() { return this.checkpoint && this.checkpoint.level === this.levelIndex ? this.checkpoint.x : this.level.playerStart.x; },

  shake(m) { this.shakeMag = Math.max(this.shakeMag, m); },

  castFreeze(x, y) {
    SFX.freeze();
    this.rings.push({ x, y, r: 20, max: 300, life: 0.5, maxLife: 0.5 });
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (dist(x, y, e.cx, e.y + e.h / 2) < 320) {
        e.frozen = e.isBoss ? 1.3 : 3;
        this.dmgNums.push(new DmgNum(e.cx, e.y - 10, '定！', '#9cc8ff'));
      }
    }
  },

  // ---------- 更新 ----------
  tick(dt) {
    this.time += dt;
    if (this.hitPause > 0) { this.hitPause -= dt; this.render(); return; }
    this.stateT += dt;

    switch (this.state) {
      case 'title':
        if (Input.anyKey) { this.checkpoint = null; this.loadLevel(1); this.state = 'play'; this.stateT = 0; }
        break;
      case 'play': this.updatePlay(dt); break;
      case 'dead':
        if (Input.wasPressed('KeyR')) { this.loadLevel(this.levelIndex); this.state = 'play'; this.stateT = 0; }
        break;
      case 'clear':
        if (this.stateT > 1.6) { this.loadLevel(2); this.state = 'play'; this.stateT = 0; }
        break;
      case 'victory':
        if (this.stateT > 2 && Input.anyKey) { this.state = 'title'; this.stateT = 0; }
        break;
    }
    this.render();
  },

  updatePlay(dt) {
    const p = this.player, lv = this.level;
    p.update(dt, this);
    for (const e of this.enemies) e.update(dt, this);
    this.enemies = this.enemies.filter(e => e.alive || e.deadTimer < 3);

    // 玩家攻击 → 敌人
    const hb = p.getAttackHitbox();
    if (hb) for (const e of this.enemies) if (e.alive && aabb(hb, e)) e.hurt(hb, p.facing, this, p);

    // 箭矢
    this.arrows = this.arrows.filter(a => {
      a.vy += 260 * dt; a.x += a.vx * dt; a.y += a.vy * dt; a.life -= dt;
      const rect = { x: a.x - 5, y: a.y - 3, w: 10, h: 6 };
      if (aabb(rect, p)) { p.takeDamage(10, a.vx > 0 ? 1 : -1, this); return false; }
      if (a.y > lv.groundY + 4 || a.life <= 0) return false;
      return true;
    });

    this.patches = this.patches.filter(fp => fp.update(dt, this));
    this.particles = this.particles.filter(pt => pt.update(dt));
    this.dmgNums = this.dmgNums.filter(d => d.update(dt));
    this.rings = this.rings.filter(r => { r.life -= dt; r.r = lerp(20, r.max, 1 - r.life / r.maxLife); return r.life > 0; });

    // 土地庙
    if (lv.shrine && !lv.shrine.active) {
      const zone = { x: lv.shrine.x - 30, y: lv.shrine.y, w: lv.shrine.w + 60, h: lv.shrine.h };
      if (aabb(zone, p)) {
        lv.shrine.active = true;
        this.checkpoint = { level: this.levelIndex, x: lv.shrine.x };
        p.hp = p.maxHp; p.gourds = p.maxGourds;
        this.dmgNums.push(new DmgNum(lv.shrine.x + lv.shrine.w / 2, lv.shrine.y - 20, '土地庙 · 已参拜', '#ffcf7a', true));
        SFX.heal();
        for (let i = 0; i < 20; i++) this.particles.push(new Particle(lv.shrine.x + lv.shrine.w / 2, lv.shrine.y + 40, rand(-60, 60), rand(-140, -40), 0.9, 4, '#ffcf7a'));
      }
    }
    // 山门过关
    if (lv.gate && aabb(lv.gate, p)) { this.state = 'clear'; this.stateT = 0; return; }
    // Boss 战胜利
    if (lv.boss && this.boss && !this.boss.alive && this.boss.deadTimer > 2) { this.state = 'victory'; this.stateT = 0; return; }
    // 死亡
    if (p.dead && p.deadTimer > 1.3) { this.state = 'dead'; this.stateT = 0; return; }

    // 镜头
    const target = clamp(p.x + p.w / 2 - VIEW_W * 0.45 + p.facing * 40, 0, lv.width - VIEW_W);
    this.camX = lerp(this.camX, target, 1 - Math.exp(-5 * dt));
    this.shakeMag = Math.max(0, this.shakeMag - 40 * dt);

    // 环境氛围粒子
    this.ambientT -= dt;
    if (this.ambientT <= 0) {
      this.ambientT = lv.theme === 'forest' ? 0.25 : 0.08;
      const x = this.camX + rand(0, VIEW_W);
      if (lv.theme === 'forest')
        this.particles.push(new Particle(x, rand(200, 600), rand(-12, 12), rand(-8, 8), rand(2, 4), 2.5, 'rgba(190,230,140,0.7)'));
      else
        this.particles.push(new Particle(x, rand(500, 680), rand(-20, 20), rand(-90, -40), rand(1, 2.5), 3, Math.random() < 0.5 ? '#ff9040' : '#ffce60'));
    }
  },

  // ---------- 绘制 ----------
  render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    if (this.state === 'title') { this.renderTitle(ctx); return; }
    if (!this.level) return;

    renderBackground(ctx, this.level, this.camX, this.time);

    const sx = this.shakeMag > 0 ? rand(-this.shakeMag, this.shakeMag) : 0;
    const sy = this.shakeMag > 0 ? rand(-this.shakeMag, this.shakeMag) * 0.6 : 0;
    ctx.save();
    ctx.translate(-this.camX + sx, sy);

    renderPlatforms(ctx, this.level, this.time);
    if (this.level.shrine) renderShrine(ctx, this.level.shrine, this.time);
    if (this.level.gate) renderGate(ctx, this.level.gate, this.time);
    for (const fp of this.patches) fp.render(ctx, this.time);
    for (const e of this.enemies) e.render(ctx, this.time);
    // 箭矢
    for (const a of this.arrows) {
      const ang = Math.atan2(a.vy, a.vx);
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang);
      ctx.strokeStyle = '#9c8058'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(8, 0); ctx.stroke();
      ctx.fillStyle = '#d8d2c4';
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(6, -3); ctx.lineTo(6, 3); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    this.player.render(ctx, this.time);
    for (const pt of this.particles) pt.render(ctx);
    for (const d of this.dmgNums) d.render(ctx);
    // 定身术法环
    for (const r of this.rings) {
      ctx.globalAlpha = r.life / r.maxLife;
      ctx.strokeStyle = '#aecfff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // 暗角
    const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, this.level.theme === 'temple' ? 'rgba(20,4,2,0.55)' : 'rgba(2,4,10,0.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    this.renderHUD(ctx);
    this.renderOverlays(ctx);
  },

  renderHUD(ctx) {
    const p = this.player;
    // 血条
    ctx.fillStyle = 'rgba(10,8,6,0.75)';
    ctx.fillRect(26, 24, 264, 18);
    ctx.fillStyle = '#5e1712';
    ctx.fillRect(28, 26, 260, 14);
    ctx.fillStyle = '#b03024';
    ctx.fillRect(28, 26, 260 * clamp(p.hp / p.maxHp, 0, 1), 14);
    ctx.strokeStyle = '#c9a05a'; ctx.lineWidth = 1.5;
    ctx.strokeRect(26, 24, 264, 18);

    // 棍势（三颗金珠 + 充能条）
    for (let i = 0; i < 3; i++) {
      const x = 38 + i * 30, y = 58;
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = i < p.focusPoints ? '#e8b33a' : 'rgba(60,50,30,0.8)';
      ctx.fillRect(-7, -7, 14, 14);
      ctx.strokeStyle = '#c9a05a'; ctx.lineWidth = 1.5;
      ctx.strokeRect(-7, -7, 14, 14);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(60,50,30,0.8)';
    ctx.fillRect(120, 54, 90, 6);
    ctx.fillStyle = '#c9a05a';
    ctx.fillRect(120, 54, 90 * clamp(p.focusCharge / 100, 0, 1), 6);

    // 葫芦
    ctx.fillStyle = '#8a3b2a';
    ctx.beginPath(); ctx.arc(40, 96, 8, 0, Math.PI * 2); ctx.arc(40, 85, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8d9b8';
    ctx.font = 'bold 15px ' + FONT_TITLE; ctx.textAlign = 'left';
    ctx.fillText('× ' + p.gourds, 56, 101);
    ctx.font = '11px ' + FONT_TITLE; ctx.fillStyle = 'rgba(230,215,180,0.5)';
    ctx.fillText('H', 34, 118);

    // 定身术
    const cd = p.spellCD / 12;
    ctx.fillStyle = 'rgba(10,8,6,0.75)';
    ctx.beginPath(); ctx.arc(120, 96, 15, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = cd <= 0 ? '#9cc8ff' : '#4a5a70'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(120, 96, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = cd <= 0 ? '#cfe4ff' : '#6a7a90';
    ctx.font = 'bold 14px ' + FONT_TITLE; ctx.textAlign = 'center';
    ctx.fillText('定', 120, 101);
    if (cd > 0) {
      ctx.fillStyle = 'rgba(20,30,50,0.65)';
      ctx.beginPath(); ctx.moveTo(120, 96);
      ctx.arc(120, 96, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cd); ctx.closePath(); ctx.fill();
    }
    ctx.font = '11px ' + FONT_TITLE; ctx.fillStyle = 'rgba(230,215,180,0.5)';
    ctx.fillText('U', 120, 122);

    // 关卡名（右上）
    ctx.font = '16px ' + FONT_TITLE; ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(230,215,180,0.55)';
    ctx.fillText(this.level.name + ' · ' + this.level.sub, VIEW_W - 28, 40);

    // Boss 血条
    if (this.level.boss && this.boss && (this.boss.alive || this.boss.deadTimer < 1)) {
      const bw = 560, bx = (VIEW_W - bw) / 2, by = VIEW_H - 64;
      ctx.font = '18px ' + FONT_TITLE; ctx.textAlign = 'center';
      ctx.fillStyle = '#e8d9b8';
      ctx.fillText(this.boss.name, VIEW_W / 2, by - 8);
      ctx.fillStyle = 'rgba(10,8,6,0.75)';
      ctx.fillRect(bx - 2, by - 2, bw + 4, 14);
      ctx.fillStyle = '#3a1210';
      ctx.fillRect(bx, by, bw, 10);
      ctx.fillStyle = this.boss.phase === 2 ? '#d85820' : '#a02818';
      ctx.fillRect(bx, by, bw * clamp(this.boss.hp / this.boss.maxHp, 0, 1), 10);
      ctx.strokeStyle = '#c9a05a'; ctx.lineWidth = 1;
      ctx.strokeRect(bx - 2, by - 2, bw + 4, 14);
    }
  },

  renderOverlays(ctx) {
    // 关卡标题浮现
    if (this.splash > 0 && this.state === 'play') {
      this.splash -= 1 / 60;
      const a = clamp(Math.min(this.splash, 3.2 - this.splash) * 1.2, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = '#e8d9b8';
      ctx.font = '54px ' + FONT_TITLE; ctx.textAlign = 'center';
      ctx.fillText(this.level.name, VIEW_W / 2, 250);
      ctx.font = '26px ' + FONT_TITLE;
      ctx.fillStyle = '#c9a05a';
      ctx.fillText('—— ' + this.level.sub + ' ——', VIEW_W / 2, 300);
      ctx.globalAlpha = 1;
    }
    if (this.state === 'dead') {
      ctx.fillStyle = 'rgba(8,2,2,' + clamp(this.stateT, 0, 0.6) + ')';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = '#b03024';
      ctx.font = '80px ' + FONT_TITLE; ctx.textAlign = 'center';
      ctx.fillText('命 陨', VIEW_W / 2, 330);
      ctx.fillStyle = '#e8d9b8'; ctx.font = '22px ' + FONT_TITLE;
      ctx.fillText('按 R 键 —— 再入轮回', VIEW_W / 2, 400);
    }
    if (this.state === 'clear') {
      ctx.fillStyle = 'rgba(0,0,0,' + clamp(this.stateT / 1.2, 0, 1) + ')';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = '#e8d9b8'; ctx.font = '34px ' + FONT_TITLE; ctx.textAlign = 'center';
      ctx.globalAlpha = clamp(this.stateT, 0, 1);
      ctx.fillText('穿过山门，禅院火起 ……', VIEW_W / 2, 360);
      ctx.globalAlpha = 1;
    }
    if (this.state === 'victory') {
      ctx.fillStyle = 'rgba(4,2,2,' + clamp(this.stateT * 0.5, 0, 0.75) + ')';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.fillStyle = '#e8b33a';
      ctx.font = '64px ' + FONT_TITLE; ctx.textAlign = 'center';
      ctx.fillText('妖 王 伏 诛', VIEW_W / 2, 300);
      ctx.fillStyle = '#e8d9b8'; ctx.font = '26px ' + FONT_TITLE;
      ctx.fillText('第一回 · 火照黑云 —— 完', VIEW_W / 2, 360);
      if (this.stateT > 2) {
        ctx.globalAlpha = 0.6 + Math.sin(this.time * 3) * 0.3;
        ctx.font = '20px ' + FONT_TITLE;
        ctx.fillText('按任意键 回到山门', VIEW_W / 2, 430);
        ctx.globalAlpha = 1;
      }
    }
  },

  renderTitle(ctx) {
    ctx.fillStyle = '#0b0a08';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // 墨圈（禅意笔触）
    ctx.strokeStyle = 'rgba(200,180,140,0.14)';
    ctx.lineWidth = 26;
    ctx.beginPath(); ctx.arc(VIEW_W / 2, 300, 180, -0.4, Math.PI * 1.75); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,180,140,0.08)';
    ctx.lineWidth = 40;
    ctx.beginPath(); ctx.arc(VIEW_W / 2, 300, 200, 0.6, Math.PI * 1.4); ctx.stroke();
    // 金箍棒
    ctx.save();
    ctx.translate(VIEW_W / 2, 300); ctx.rotate(-0.9);
    ctx.fillStyle = '#7a2b20'; ctx.fillRect(-150, -5, 300, 10);
    ctx.fillStyle = '#e8b33a'; ctx.fillRect(-165, -7, 18, 14); ctx.fillRect(147, -7, 18, 14);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8d9b8';
    ctx.font = '110px ' + FONT_TITLE;
    ctx.fillText('颂 · 悟 空', VIEW_W / 2, 280);
    ctx.fillStyle = '#c9a05a';
    ctx.font = '26px ' + FONT_TITLE;
    ctx.fillText('SONG WUKONG —— 二维动作 · 黑风山篇', VIEW_W / 2, 380);

    ctx.globalAlpha = 0.7 + Math.sin(this.time * 3) * 0.3;
    ctx.fillStyle = '#e8b33a';
    ctx.font = '24px ' + FONT_TITLE;
    ctx.fillText('按 任 意 键 启 程', VIEW_W / 2, 470);
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(230,215,180,0.45)';
    ctx.font = '16px ' + FONT_TITLE;
    ctx.fillText('A / D 移动 · Space 跳跃 · J 轻棍(攒棍势) · K 重棍(耗棍势) · L 翻滚 · U 定身术 · H 葫芦回血', VIEW_W / 2, 620);
  }
};

window.addEventListener('DOMContentLoaded', () => Game.init());
