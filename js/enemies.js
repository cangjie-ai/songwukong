'use strict';
// ============ 敌人 ============
class Enemy {
  constructor(x, y, w, h, hp) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.hp = hp; this.maxHp = hp;
    this.vx = 0; this.vy = 0; this.onGround = false; this.facing = -1;
    this.state = 'idle'; this.t = 0;
    this.frozen = 0; this.hitFlash = 0; this.deadTimer = 0; this.lastHitId = -1;
    this.isBoss = false;
  }
  get alive() { return this.hp > 0; }
  get cx() { return this.x + this.w / 2; }

  // 被玩家攻击命中
  hurt(hb, dir, game, player) {
    if (!this.alive || this.lastHitId === hb.id) return false;
    this.lastHitId = hb.id;
    this.hp -= hb.dmg;
    this.hitFlash = 0.12;
    game.hitPause = hb.heavy ? 0.09 : 0.045;
    game.shake(hb.heavy ? 9 : 3);
    SFX[hb.heavy ? 'heavy' : 'hit']();
    player.gainFocus(hb.heavy ? 0 : 34);
    game.dmgNums.push(new DmgNum(this.cx, this.y, hb.dmg, hb.heavy ? '#ffb347' : '#ffd873', hb.heavy));
    for (let i = 0; i < (hb.heavy ? 16 : 8); i++)
      game.particles.push(new Particle(this.cx, this.y + this.h / 2, rand(-200, 200), rand(-260, 20), 0.45, 4, i % 3 ? '#ffd873' : '#6e1712', 600));
    if (this.hp <= 0) {
      this.hp = 0; this.state = 'dead'; this.deadTimer = 0;
      this.vx = dir * 200; this.vy = -300;
      SFX.die();
      return true;
    }
    if (!this.isBoss) {                       // 小怪受击僵直 + 击退
      this.state = 'stagger'; this.t = 0.22;
      this.vx = dir * (hb.kb || 150); this.vy = -80;
    } else if (hb.heavy && hb.dmg >= 55) {    // Boss 只吃蓄力重棍的削韧
      this.state = 'stagger'; this.t = 0.5; this.vx = dir * 120;
    }
    return true;
  }

  baseTimers(dt) {
    this.frozen = Math.max(0, this.frozen - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
  }

  renderFrozenTint(ctx) {
    if (this.frozen > 0) {
      ctx.fillStyle = 'rgba(140,190,255,0.35)';
      ctx.fillRect(this.x - 4, this.y - 4, this.w + 8, this.h + 8);
      ctx.strokeStyle = 'rgba(190,220,255,0.8)'; ctx.lineWidth = 2;
      ctx.strokeRect(this.x - 4, this.y - 4, this.w + 8, this.h + 8);
    }
  }
}

// ---------- 狼卒（近战） ----------
class WolfMinion extends Enemy {
  constructor(x, y, patrolA, patrolB) {
    super(x, y, 44, 56, 45);
    this.patrolA = patrolA; this.patrolB = patrolB;
    this.state = 'patrol'; this.aggro = false; this.runPhase = 0;
  }
  update(dt, game) {
    this.baseTimers(dt);
    const p = game.player;
    if (this.state === 'dead') { this.deadTimer += dt; this.vx *= 0.9; this.vy += 2000 * dt; physicsStep(this, game.level, dt); return; }
    if (this.frozen > 0) { this.vx = 0; this.vy += 2000 * dt; physicsStep(this, game.level, dt); return; }

    const pcx = p.x + p.w / 2, d = pcx - this.cx, ad = Math.abs(d);
    if (!this.aggro && ad < 320 && !p.dead) this.aggro = true;

    switch (this.state) {
      case 'patrol':
        this.runPhase += dt * 6;
        this.vx = this.facing * 60;
        if (this.x < this.patrolA) this.facing = 1;
        if (this.x + this.w > this.patrolB) this.facing = -1;
        if (this.aggro) this.state = 'chase';
        break;
      case 'chase':
        if (p.dead) { this.state = 'patrol'; this.aggro = false; break; }
        this.runPhase += dt * 10;
        this.facing = d > 0 ? 1 : -1;
        this.vx = this.facing * 175;
        if (ad < 62) { this.state = 'windup'; this.t = 0.45; this.vx = 0; }
        break;
      case 'windup':
        this.t -= dt; this.vx = 0;
        if (this.t <= 0) { this.state = 'strike'; this.t = 0.15; }
        break;
      case 'strike': {
        this.t -= dt;
        const hb = { x: this.facing > 0 ? this.x + this.w : this.x - 54, y: this.y + 8, w: 54, h: 44 };
        if (aabb(hb, p)) p.takeDamage(12, this.facing, game);
        if (this.t <= 0) { this.state = 'recover'; this.t = 0.55; }
        break;
      }
      case 'recover':
        this.t -= dt; this.vx = 0;
        if (this.t <= 0) this.state = 'chase';
        break;
      case 'stagger':
        this.t -= dt; this.vx *= 0.9;
        if (this.t <= 0) this.state = 'chase';
        break;
    }
    this.vy += 2000 * dt;
    physicsStep(this, game.level, dt);
  }

  render(ctx, time) {
    if (this.state === 'dead' && this.deadTimer > 0.9) return;
    ctx.save();
    if (this.state === 'dead') ctx.globalAlpha = clamp(1 - (this.deadTimer - 0.3) / 0.6, 0, 1);
    const cx = this.cx, bottom = this.y + this.h;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(cx, bottom + 2, 20, 5, 0, 0, Math.PI * 2); ctx.fill();

    ctx.translate(cx, bottom); ctx.scale(this.facing, 1);
    if (this.state === 'dead') ctx.rotate(Math.PI / 2 * Math.min(1, this.deadTimer * 3));
    const flash = this.hitFlash > 0;
    const legSwing = (this.state === 'chase' || this.state === 'patrol') ? Math.sin(this.runPhase) * 7 : 0;

    // 腿
    ctx.strokeStyle = flash ? '#fff' : '#3b3430'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-6, -22); ctx.lineTo(-6 - legSwing, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7, -22); ctx.lineTo(7 + legSwing, 0); ctx.stroke();
    // 躯干（灰狼毛 + 破甲）
    ctx.fillStyle = flash ? '#fff' : '#57504a';
    ctx.beginPath(); ctx.roundRect(-14, -44, 28, 26, 7); ctx.fill();
    ctx.fillStyle = flash ? '#fff' : '#6e3b28';
    ctx.fillRect(-14, -34, 28, 7);
    // 狼头
    ctx.fillStyle = flash ? '#fff' : '#57504a';
    ctx.beginPath(); ctx.arc(2, -50, 10, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(8, -52); ctx.lineTo(20, -49); ctx.lineTo(8, -45); ctx.closePath(); ctx.fill(); // 狼吻
    ctx.beginPath(); ctx.moveTo(-4, -58); ctx.lineTo(0, -68); ctx.lineTo(4, -58); ctx.closePath(); ctx.fill(); // 耳
    // 红眼
    ctx.fillStyle = this.state === 'windup' ? '#ff5030' : '#c03828';
    ctx.fillRect(6, -53, 4, 3);
    // 弯刀
    const wind = this.state === 'windup', strike = this.state === 'strike';
    ctx.save();
    ctx.translate(10, -30);
    ctx.rotate(strike ? 0.9 : wind ? -2.0 - Math.sin(time * 25) * 0.06 : -0.7);
    ctx.strokeStyle = wind ? '#ffdca8' : '#b8b0a4'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(22, -8, 34, -2); ctx.stroke();
    ctx.restore();
    if (strike) {
      ctx.fillStyle = 'rgba(255,230,180,0.35)';
      ctx.beginPath(); ctx.moveTo(10, -30); ctx.arc(10, -30, 52, -0.9, 0.7); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    this.renderFrozenTint(ctx);
  }
}

// ---------- 狼弓手（远程） ----------
class WolfArcher extends Enemy {
  constructor(x, y) {
    super(x, y, 40, 56, 30);
    this.shootTimer = rand(1.0, 2.0); this.runPhase = 0;
  }
  update(dt, game) {
    this.baseTimers(dt);
    const p = game.player;
    if (this.state === 'dead') { this.deadTimer += dt; this.vx *= 0.9; this.vy += 2000 * dt; physicsStep(this, game.level, dt); return; }
    if (this.frozen > 0) { this.vx = 0; this.vy += 2000 * dt; physicsStep(this, game.level, dt); return; }

    const pcx = p.x + p.w / 2, d = pcx - this.cx, ad = Math.abs(d);
    this.facing = d > 0 ? 1 : -1;

    switch (this.state) {
      case 'stagger':
        this.t -= dt; this.vx *= 0.9;
        if (this.t <= 0) this.state = 'idle';
        break;
      case 'windup':
        this.t -= dt; this.vx = 0;
        if (this.t <= 0) {
          // 放箭：朝玩家胸口，带一点重力预判
          const tx = p.x + p.w / 2, ty = p.y + p.h * 0.4;
          const dd = Math.max(60, dist(this.cx, this.y + 14, tx, ty));
          const sp = 480;
          game.arrows.push({
            x: this.cx, y: this.y + 14,
            vx: (tx - this.cx) / dd * sp,
            vy: (ty - (this.y + 14)) / dd * sp - dd * 0.25,
            life: 3
          });
          SFX.shot();
          this.state = 'recover'; this.t = 0.4;
        }
        break;
      case 'recover':
        this.t -= dt;
        if (this.t <= 0) this.state = 'idle';
        break;
      default: { // idle：拉开距离 + 定时射击
        if (p.dead || ad > 700) { this.vx = 0; break; }
        if (ad < 240) { this.vx = -this.facing * 115; this.runPhase += dt * 9; }
        else this.vx = 0;
        this.shootTimer -= dt;
        if (this.shootTimer <= 0 && ad < 650) {
          this.state = 'windup'; this.t = 0.55; this.shootTimer = rand(2.0, 2.8);
        }
      }
    }
    this.vy += 2000 * dt;
    physicsStep(this, game.level, dt);
  }

  render(ctx, time) {
    if (this.state === 'dead' && this.deadTimer > 0.9) return;
    ctx.save();
    if (this.state === 'dead') ctx.globalAlpha = clamp(1 - (this.deadTimer - 0.3) / 0.6, 0, 1);
    const cx = this.cx, bottom = this.y + this.h;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(cx, bottom + 2, 18, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(cx, bottom); ctx.scale(this.facing, 1);
    if (this.state === 'dead') ctx.rotate(Math.PI / 2 * Math.min(1, this.deadTimer * 3));
    const flash = this.hitFlash > 0;
    const legSwing = Math.abs(this.vx) > 10 ? Math.sin(this.runPhase) * 6 : 0;

    ctx.strokeStyle = flash ? '#fff' : '#37322e'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-5, -22); ctx.lineTo(-5 - legSwing, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, -22); ctx.lineTo(6 + legSwing, 0); ctx.stroke();
    ctx.fillStyle = flash ? '#fff' : '#4d4a44';
    ctx.beginPath(); ctx.roundRect(-12, -44, 24, 24, 6); ctx.fill();
    ctx.fillStyle = flash ? '#fff' : '#3f5a3c';   // 绿披
    ctx.fillRect(-12, -44, 24, 8);
    ctx.fillStyle = flash ? '#fff' : '#4d4a44';
    ctx.beginPath(); ctx.arc(1, -50, 9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(7, -52); ctx.lineTo(17, -49); ctx.lineTo(7, -45); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4, -57); ctx.lineTo(0, -66); ctx.lineTo(4, -57); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c03828'; ctx.fillRect(5, -52, 4, 3);
    // 弓
    const draw = this.state === 'windup' ? clamp(1 - this.t / 0.55, 0, 1) : 0;
    ctx.strokeStyle = '#8a6b42'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(14, -32, 16, -1.2, 1.2); ctx.stroke();
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(14 + Math.cos(-1.2) * 16, -32 + Math.sin(-1.2) * 16);
    ctx.lineTo(14 - draw * 10, -32);
    ctx.lineTo(14 + Math.cos(1.2) * 16, -32 + Math.sin(1.2) * 16);
    ctx.stroke();
    if (draw > 0) { ctx.strokeStyle = '#c9b18a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(14 - draw * 10, -32); ctx.lineTo(30, -32); ctx.stroke(); }
    ctx.restore();
    this.renderFrozenTint(ctx);
  }
}

// ---------- 火焰地板（Boss 二阶段） ----------
class FirePatch {
  constructor(x, groundY) { this.x = x - 32; this.y = groundY - 26; this.w = 64; this.h = 26; this.life = 4; }
  update(dt, game) {
    this.life -= dt;
    const p = game.player;
    if (this.life > 0 && aabb(this, p)) p.takeDamage(8, p.x + p.w / 2 > this.x + this.w / 2 ? 1 : -1, game);
    if (Math.random() < 0.3) game.particles.push(new Particle(this.x + rand(0, this.w), this.y + this.h, rand(-15, 15), rand(-90, -40), 0.5, 3, Math.random() < 0.5 ? '#ff9040' : '#ffd050'));
    return this.life > 0;
  }
  render(ctx, time) {
    const a = clamp(this.life / 1.2, 0, 1);
    ctx.globalAlpha = 0.85 * a;
    for (let i = 0; i < 5; i++) {
      const fx = this.x + 6 + i * 13, fh = 14 + Math.sin(time * 13 + i * 2.1) * 7;
      const g = ctx.createLinearGradient(0, this.y + this.h, 0, this.y + this.h - fh - 8);
      g.addColorStop(0, '#ff6a20'); g.addColorStop(0.6, '#ffb040'); g.addColorStop(1, 'rgba(255,220,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(fx - 6, this.y + this.h);
      ctx.quadraticCurveTo(fx, this.y + this.h - fh * 2, fx + 6, this.y + this.h);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- Boss：苍狼精 · 广智 ----------
class BossGuangzhi extends Enemy {
  constructor(x, y) {
    super(x, y, 56, 92, 600);
    this.isBoss = true; this.name = '苍狼精 · 广智';
    this.phase = 1; this.state = 'idle'; this.t = 1.2;
    this.comboHit = 0; this.dashCD = 2; this.smashCD = 5;
    this.runPhase = 0; this.bladeAng = -0.6; this.bladeTrail = 0;
    this.activated = false;
  }
  spd() { return this.phase === 2 ? 0.78 : 1; }   // 二阶段动作更快

  update(dt, game) {
    this.baseTimers(dt);
    this.dashCD = Math.max(0, this.dashCD - dt);
    this.smashCD = Math.max(0, this.smashCD - dt);
    this.bladeTrail = Math.max(0, this.bladeTrail - dt * 3);
    const p = game.player;

    if (this.state === 'dead') { this.deadTimer += dt; this.vx *= 0.92; this.vy += 2200 * dt; physicsStep(this, game.level, dt); return; }

    // 二阶段觉醒
    if (this.phase === 1 && this.hp <= this.maxHp / 2 && this.state !== 'roar') {
      this.phase = 2; this.state = 'roar'; this.t = 1.1; this.vx = 0;
      game.shake(14); SFX.roar();
      for (let i = 0; i < 40; i++) game.particles.push(new Particle(this.cx, this.y + this.h / 2, rand(-300, 300), rand(-400, -50), rand(0.5, 1), 5, i % 2 ? '#ff8030' : '#ffd050', 300));
    }

    if (this.frozen > 0) { this.vx = 0; this.vy += 2200 * dt; physicsStep(this, game.level, dt); return; }

    const pcx = p.x + p.w / 2, d = pcx - this.cx, ad = Math.abs(d);
    const groundY = game.level.groundY;

    switch (this.state) {
      case 'roar':
        this.t -= dt;
        if (this.t <= 0) { this.state = 'idle'; this.t = 0.4; }
        break;
      case 'stagger':
        this.t -= dt; this.vx *= 0.9;
        if (this.t <= 0) { this.state = 'idle'; this.t = 0.3; }
        break;
      case 'idle':
        this.t -= dt;
        this.facing = d > 0 ? 1 : -1;
        this.vx = this.facing * 40;    // 缓步逼近
        this.runPhase += dt * 4;
        if (this.t <= 0 && !p.dead) this.decide(ad);
        break;
      case 'approach':
        this.t -= dt;
        this.facing = d > 0 ? 1 : -1;
        this.vx = this.facing * (this.phase === 2 ? 220 : 170);
        this.runPhase += dt * 10;
        if (ad < 95) { this.state = 'combo'; this.comboHit = 0; this.t = 0.34 * this.spd(); this.sub = 'windup'; this.vx = 0; }
        else if (this.t <= 0) { this.state = 'idle'; this.t = 0.3; }
        break;
      case 'combo':
        this.updateCombo(dt, game, d);
        break;
      case 'dash': {
        this.t -= dt;
        this.vx = this.facing * 640;
        this.bladeTrail = 1;
        const hb = { x: this.facing > 0 ? this.x + this.w - 10 : this.x - 60, y: this.y + 20, w: 70, h: 60 };
        if (aabb(hb, p)) p.takeDamage(16, this.facing, game);
        if (this.phase === 2) {
          this.patchTick = (this.patchTick || 0) - dt;
          if (this.patchTick <= 0) { game.patches.push(new FirePatch(this.cx, groundY)); this.patchTick = 0.13; }
        }
        if (this.t <= 0) { this.vx = 0; this.state = 'idle'; this.t = this.idleTime(); }
        break;
      }
      case 'smash':
        this.updateSmash(dt, game, groundY);
        break;
    }

    this.vy += 2200 * dt;
    physicsStep(this, game.level, dt);
  }

  idleTime() { return this.phase === 2 ? rand(0.4, 0.7) : rand(0.7, 1.1); }

  decide(ad) {
    if (ad > 260 && this.dashCD <= 0) {
      this.state = 'dash'; this.t = 0.5; this.dashCD = this.phase === 2 ? 2.6 : 4;
      SFX.swing();
    } else if (this.smashCD <= 0 && ad < 520 && Math.random() < 0.55) {
      this.state = 'smash'; this.sub = 'windup'; this.t = 0.4 * this.spd();
      this.smashCD = this.phase === 2 ? 4.5 : 6.5; this.vx = 0;
    } else {
      this.state = 'approach'; this.t = 2.2;
    }
  }

  updateCombo(dt, game, d) {
    const p = game.player;
    this.t -= dt;
    if (this.sub === 'windup') {
      this.vx = this.facing * 65;   // 挥砍时小步进逼
      if (this.t <= 0) { this.sub = 'strike'; this.t = 0.14; SFX.swing(); this.bladeTrail = 1; }
    } else if (this.sub === 'strike') {
      const dmg = this.comboHit === 2 ? 18 : 14;
      const hb = { x: this.facing > 0 ? this.x + this.w - 6 : this.x - 88, y: this.y + 10, w: 94, h: 74 };
      if (aabb(hb, p)) p.takeDamage(dmg, this.facing, game);
      this.vx = this.facing * 140;
      if (this.t <= 0) {
        this.comboHit++;
        if (this.comboHit < 3) { this.sub = 'windup'; this.t = (this.comboHit === 2 ? 0.42 : 0.3) * this.spd(); }
        else { this.state = 'idle'; this.t = this.idleTime(); this.vx = 0; }
      }
    }
  }

  updateSmash(dt, game, groundY) {
    const p = game.player;
    this.t -= dt;
    if (this.sub === 'windup') {
      this.vx = 0;
      if (this.t <= 0) {
        this.sub = 'air';
        const dx = (p.x + p.w / 2) - this.cx;
        this.vy = -880; this.vx = clamp(dx / 0.72, -520, 520);
        this.airMin = 0.25;   // 至少滞空一段时间再判定落地
      }
    } else if (this.sub === 'air') {
      this.airMin -= dt;
      if (this.onGround && this.airMin <= 0) {
        this.sub = 'land'; this.t = 0.5; this.vx = 0;
        game.shake(12); SFX.heavy();
        const hb = { x: this.cx - 110, y: this.y + this.h - 60, w: 220, h: 70 };
        if (aabb(hb, p) && p.onGround) p.takeDamage(20, p.x + p.w / 2 > this.cx ? 1 : -1, game);
        for (let i = 0; i < 22; i++) game.particles.push(new Particle(this.cx + rand(-90, 90), this.y + this.h, rand(-120, 120), rand(-260, -60), 0.55, 5, '#7d7468', 800));
        if (this.phase === 2) for (let i = -1; i <= 1; i++) game.patches.push(new FirePatch(this.cx + i * 75, groundY));
      }
    } else if (this.sub === 'land') {
      if (this.t <= 0) { this.state = 'idle'; this.t = this.idleTime(); }
    }
  }

  render(ctx, time) {
    if (this.state === 'dead' && this.deadTimer > 2.4) return;
    ctx.save();
    if (this.state === 'dead') ctx.globalAlpha = clamp(1 - (this.deadTimer - 1.2) / 1.2, 0, 1);
    const cx = this.cx, bottom = this.y + this.h;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx, bottom + 2, 30, 7, 0, 0, Math.PI * 2); ctx.fill();

    ctx.translate(cx, bottom); ctx.scale(this.facing, 1);
    if (this.state === 'dead') ctx.rotate(Math.PI / 2 * Math.min(1, this.deadTimer * 2));
    const flash = this.hitFlash > 0;
    const wind = (this.state === 'combo' && this.sub === 'windup') || (this.state === 'smash' && this.sub === 'windup');
    const legSwing = Math.abs(this.vx) > 60 ? Math.sin(this.runPhase) * 9 : 0;

    // 二阶段体表火光
    if (this.phase === 2 && this.state !== 'dead') {
      const g = ctx.createRadialGradient(0, -46, 10, 0, -46, 80);
      g.addColorStop(0, 'rgba(255,120,40,0.28)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, -46, 80, 0, Math.PI * 2); ctx.fill();
    }

    // 腿
    ctx.strokeStyle = flash ? '#fff' : '#2c2c34'; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(-9, -36); ctx.lineTo(-9 - legSwing, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(11, -36); ctx.lineTo(11 + legSwing, 0); ctx.stroke();
    // 僧袍躯干（青灰）
    ctx.fillStyle = flash ? '#fff' : '#3d4450';
    ctx.beginPath(); ctx.roundRect(-22, -72, 44, 40, 10); ctx.fill();
    ctx.fillStyle = flash ? '#fff' : '#8a2f22';  // 袈裟红带
    ctx.beginPath(); ctx.moveTo(-22, -70); ctx.lineTo(2, -34); ctx.lineTo(14, -34); ctx.lineTo(-8, -70); ctx.closePath(); ctx.fill();
    // 狼头 + 头巾
    ctx.fillStyle = flash ? '#fff' : '#4e565e';
    ctx.beginPath(); ctx.arc(3, -84, 15, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(12, -88); ctx.lineTo(32, -83); ctx.lineTo(12, -76); ctx.closePath(); ctx.fill();  // 狼吻
    ctx.beginPath(); ctx.moveTo(-6, -95); ctx.lineTo(-1, -110); ctx.lineTo(5, -95); ctx.closePath(); ctx.fill(); // 耳
    ctx.strokeStyle = flash ? '#fff' : '#8a2f22'; ctx.lineWidth = 5;  // 头巾
    ctx.beginPath(); ctx.arc(0, -88, 14, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.fillStyle = this.phase === 2 ? '#ff7028' : '#d84830';
    ctx.fillRect(9, -87, 5, 4);                  // 眼
    // 长刀
    let ang = -0.6;
    if (wind) ang = -2.3 - Math.sin(time * 22) * 0.05;
    else if (this.state === 'combo' && this.sub === 'strike') ang = 0.9;
    else if (this.state === 'dash') ang = 0.2;
    else if (this.state === 'smash' && this.sub !== 'windup') ang = 1.6;
    else if (this.state === 'roar') ang = -1.8;
    ctx.save();
    ctx.translate(16, -52); ctx.rotate(ang);
    if (this.bladeTrail > 0 || this.phase === 2) {
      const g2 = ctx.createLinearGradient(0, 0, 92, 0);
      g2.addColorStop(0, 'rgba(255,140,50,0)');
      g2.addColorStop(1, this.phase === 2 ? 'rgba(255,120,30,0.8)' : 'rgba(255,220,150,0.5)');
      ctx.strokeStyle = g2; ctx.lineWidth = 12;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(88, -6); ctx.stroke();
    }
    ctx.strokeStyle = flash ? '#fff' : '#c8c2b6'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(50, -4, 86, -12); ctx.stroke();
    ctx.strokeStyle = '#5a4632'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-14, 2); ctx.lineTo(0, 0); ctx.stroke();
    ctx.restore();

    ctx.restore();
    this.renderFrozenTint(ctx);
  }
}
