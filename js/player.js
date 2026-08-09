'use strict';
// ============ 天命人（玩家） ============
const P_G = 2300;          // 重力
const P_MOVE = 300;        // 移动速度
const P_JUMP = -850;       // 起跳速度

// 轻棍三连：前摇 / 判定 / 后摇（秒）
const LIGHT_COMBO = [
  { windup: 0.08, active: 0.10, recover: 0.18, dmg: 10, rw: 80, rh: 58, lunge: 220, kb: 120 },
  { windup: 0.07, active: 0.10, recover: 0.18, dmg: 11, rw: 84, rh: 58, lunge: 240, kb: 140 },
  { windup: 0.12, active: 0.12, recover: 0.30, dmg: 16, rw: 98, rh: 62, lunge: 300, kb: 300 },
];
const HEAVY = { windup: 0.32, active: 0.16, recover: 0.50, rw: 132, rh: 84, lunge: 200 };

class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.w = 38; this.h = 62;
    this.vx = 0; this.vy = 0; this.onGround = false; this.facing = 1;
    this.hp = 100; this.maxHp = 100;
    this.focusCharge = 0; this.focusPoints = 0;   // 棍势
    this.gourds = 3; this.maxGourds = 3;          // 葫芦
    this.state = 'normal'; this.t = 0;
    this.attackIdx = 0; this.queued = false; this.heavyDmg = 0; this.heavyRange = 0;
    this.attackId = 0; this.hitSomething = false;
    this.invuln = 0; this.dodgeCD = 0; this.spellCD = 0; this.dodgeDir = 1;
    this.coyote = 0; this.jumpBuf = 0; this.runPhase = 0;
    this.deadTimer = 0;
  }

  get dead() { return this.state === 'dead'; }
  get attacking() { return this.state === 'attack' || this.state === 'heavy'; }

  update(dt, game) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.dodgeCD = Math.max(0, this.dodgeCD - dt);
    this.spellCD = Math.max(0, this.spellCD - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (Input.wasPressed('Space', 'KeyW', 'ArrowUp')) this.jumpBuf = 0.12;

    switch (this.state) {
      case 'dead':
        this.deadTimer += dt; this.vx *= 0.9; this.vy += P_G * dt;
        break;
      case 'hurt':
        this.t -= dt; this.vx *= 0.92; this.vy += P_G * dt;
        if (this.t <= 0) this.state = 'normal';
        break;
      case 'dodge':
        this.t += dt; this.vx = this.dodgeDir * 560; this.vy += P_G * 0.4 * dt;
        if (this.t >= 0.28) { this.state = 'normal'; this.dodgeCD = 0.45; }
        break;
      case 'drink':
        this.t += dt; this.vx *= 0.8; this.vy += P_G * dt;
        if (this.t >= 0.55 && !this.healed) {
          this.healed = true;
          this.hp = Math.min(this.maxHp, this.hp + 50);
          SFX.heal();
          for (let i = 0; i < 14; i++) game.particles.push(new Particle(this.x + this.w / 2, this.y + rand(0, this.h), rand(-40, 40), rand(-120, -30), 0.6, 4, '#8fd18a'));
        }
        if (this.t >= 0.8) this.state = 'normal';
        break;
      case 'cast':
        this.t += dt; this.vx *= 0.8; this.vy += P_G * dt;
        if (this.t >= 0.35) this.state = 'normal';
        break;
      case 'attack': this.updateAttack(dt, LIGHT_COMBO[this.attackIdx], game); break;
      case 'heavy': this.updateAttack(dt, HEAVY, game); break;
      default: this.updateNormal(dt, game);
    }

    physicsStep(this, game.level, dt);
    if (this.onGround) this.coyote = 0.1;

    // 掉出世界的兜底（正常关卡地面连续，不应触发）
    if (this.y > 1000) { this.x = game.respawnX(); this.y = 300; this.vy = 0; }
  }

  updateNormal(dt, game) {
    const L = Input.isDown('KeyA', 'ArrowLeft'), R = Input.isDown('KeyD', 'ArrowRight');
    let mx = (R ? 1 : 0) - (L ? 1 : 0);
    this.vx = mx * P_MOVE;
    if (mx !== 0) { this.facing = mx; this.runPhase += dt * 12; }
    this.vy += P_G * dt;

    if (this.jumpBuf > 0 && (this.onGround || this.coyote > 0)) {
      this.vy = P_JUMP; this.jumpBuf = 0; this.coyote = 0;
      SFX.swing();
    }

    if (Input.wasPressed('KeyJ')) this.startLight(game);
    else if (Input.wasPressed('KeyK')) this.startHeavy(game);
    else if (Input.wasPressed('KeyL', 'ShiftLeft', 'ShiftRight')) this.startDodge(mx);
    else if (Input.wasPressed('KeyH') && this.gourds > 0 && this.onGround) {
      this.gourds--; this.state = 'drink'; this.t = 0; this.healed = false; this.vx = 0;
    }
    else if (Input.wasPressed('KeyU') && this.spellCD <= 0) {
      this.state = 'cast'; this.t = 0; this.spellCD = 12;
      game.castFreeze(this.x + this.w / 2, this.y + this.h / 2);
    }
  }

  startLight(game, chain = false) {
    this.attackIdx = chain ? (this.attackIdx + 1) % 3 : 0;
    this.state = 'attack'; this.t = 0; this.queued = false;
    this.attackId++; this.hitSomething = false;
    this.vx = this.facing * LIGHT_COMBO[this.attackIdx].lunge;
    SFX.swing();
  }

  startHeavy(game) {
    this.state = 'heavy'; this.t = 0; this.queued = false;
    this.attackId++; this.hitSomething = false;
    this.heavyDmg = 25 + 30 * this.focusPoints;
    this.heavyRange = HEAVY.rw + 14 * this.focusPoints;
    this.heavyPts = this.focusPoints;
    this.focusPoints = 0;
    this.vx = this.facing * HEAVY.lunge;
    SFX.swing();
  }

  startDodge(mx) {
    if (this.dodgeCD > 0) return;
    this.state = 'dodge'; this.t = 0;
    this.dodgeDir = mx !== 0 ? mx : this.facing;
    this.facing = this.dodgeDir;
    SFX.swing();
  }

  updateAttack(dt, data, game) {
    this.t += dt;
    this.vx *= 0.86;               // 突进衰减
    this.vy += P_G * dt;
    const total = data.windup + data.active + data.recover;
    if (Input.wasPressed('KeyJ') && this.t > data.windup) this.queued = true;
    if (this.t >= total) {
      if (this.state === 'attack' && this.queued && this.attackIdx < 2 && this.onGround) this.startLight(game, true);
      else { this.state = 'normal'; if (this.queued) this.startLight(game); }
    }
  }

  // 当前攻击判定框（仅 active 阶段返回）
  getAttackHitbox() {
    let data = null, dmg = 0, kb = 0, heavy = false, rw = 0;
    if (this.state === 'attack') { data = LIGHT_COMBO[this.attackIdx]; dmg = data.dmg; kb = data.kb; rw = data.rw; }
    else if (this.state === 'heavy') { data = HEAVY; dmg = this.heavyDmg; kb = 380; heavy = true; rw = this.heavyRange; }
    if (!data) return null;
    if (this.t < data.windup || this.t > data.windup + data.active) return null;
    return {
      x: this.facing > 0 ? this.x + this.w - 8 : this.x + 8 - rw,
      y: this.y + this.h / 2 - data.rh / 2 - 6,
      w: rw, h: data.rh,
      dmg, kb, heavy, id: this.attackId
    };
  }

  gainFocus(n) {
    if (this.focusPoints >= 3) return;
    this.focusCharge += n;
    while (this.focusCharge >= 100 && this.focusPoints < 3) {
      this.focusCharge -= 100; this.focusPoints++;
    }
    if (this.focusPoints >= 3) this.focusCharge = 0;
  }

  takeDamage(dmg, fromDir, game) {
    if (this.invuln > 0 || this.state === 'dodge' || this.dead) return false;
    this.hp -= dmg;
    game.shake(6); game.hitPause = 0.04;
    SFX.hurt();
    for (let i = 0; i < 10; i++) game.particles.push(new Particle(this.x + this.w / 2, this.y + this.h / 2, rand(-160, 160), rand(-200, 40), 0.5, 4, '#a5342a', 500));
    game.dmgNums.push(new DmgNum(this.x + this.w / 2, this.y, '-' + dmg, '#e0604f'));
    if (this.hp <= 0) {
      this.hp = 0; this.state = 'dead'; this.deadTimer = 0; this.vy = -350; this.vx = -fromDir * 100;
      SFX.die();
    } else {
      this.state = 'hurt'; this.t = 0.32; this.vx = fromDir * 240; this.vy = -180; this.invuln = 0.9;
    }
    return true;
  }

  // ---------- 绘制 ----------
  render(ctx, time) {
    const cx = this.x + this.w / 2, bottom = this.y + this.h;
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx, bottom + 2, 22, 5, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(cx, bottom);
    ctx.scale(this.facing, 1);
    if (this.invuln > 0 && this.state !== 'dodge' && !this.dead && Math.floor(time * 20) % 2 === 0) ctx.globalAlpha = 0.45;

    if (this.state === 'dodge') { this.renderRoll(ctx); ctx.restore(); return; }
    if (this.dead) ctx.rotate(-Math.PI / 2 * Math.min(1, this.deadTimer * 3));

    const moving = Math.abs(this.vx) > 30 && this.onGround;
    const legSwing = moving ? Math.sin(this.runPhase) * 8 : 0;
    const bob = moving ? Math.abs(Math.sin(this.runPhase)) * 2 : 0;

    // 尾巴
    ctx.strokeStyle = '#4a3626'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, -26);
    ctx.quadraticCurveTo(-30, -30 + Math.sin(time * 4) * 4, -26, -52 + Math.sin(time * 3) * 3);
    ctx.stroke();

    // 腿
    ctx.strokeStyle = '#2e2218'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-5, -24); ctx.lineTo(-5 - legSwing, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, -24); ctx.lineTo(6 + legSwing, 0); ctx.stroke();

    // 躯干（毛皮 + 红披巾）
    ctx.fillStyle = '#4a3626';
    ctx.beginPath(); ctx.roundRect(-12, -46 - bob, 24, 26, 8); ctx.fill();
    ctx.fillStyle = '#a5342a';
    ctx.beginPath();
    ctx.moveTo(-11, -44 - bob);
    ctx.quadraticCurveTo(-26 - Math.abs(this.vx) * 0.04, -34 + Math.sin(time * 6) * 3, -20, -18);
    ctx.lineTo(-10, -30 - bob);
    ctx.closePath(); ctx.fill();

    // 头
    const hy = -54 - bob;
    ctx.fillStyle = '#4a3626';
    ctx.beginPath(); ctx.arc(0, hy, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#caa27a';
    ctx.beginPath(); ctx.arc(2, hy + 1, 8, 0, Math.PI * 2); ctx.fill();
    // 金箍
    ctx.strokeStyle = '#e8b33a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, hy - 2, 10, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    // 眼
    ctx.fillStyle = '#1a120b';
    ctx.fillRect(4, hy - 2, 3, 3);

    // 如意金箍棒
    this.renderStaff(ctx, time, bob);

    // 喝葫芦
    if (this.state === 'drink') {
      ctx.fillStyle = '#8a3b2a';
      ctx.beginPath(); ctx.arc(12, hy - 4, 5, 0, Math.PI * 2); ctx.arc(12, hy - 11, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  renderRoll(ctx) {
    const rot = (this.t / 0.28) * Math.PI * 2;
    ctx.rotate(rot);
    ctx.fillStyle = '#4a3626';
    ctx.beginPath(); ctx.arc(0, -26, 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a5342a';
    ctx.beginPath(); ctx.arc(-6, -30, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e8b33a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, -26, 12, rot, rot + 1.2); ctx.stroke();
  }

  renderStaff(ctx, time, bob) {
    let ang = -0.45, trail = 0;
    if (this.state === 'attack') {
      const d = LIGHT_COMBO[this.attackIdx];
      const p = clamp(this.t / (d.windup + d.active), 0, 1);
      const from = this.attackIdx === 1 ? 1.1 : -2.3;
      const to = this.attackIdx === 1 ? -1.6 : 0.9;
      ang = lerp(from, to, p * p * (3 - 2 * p));
      if (this.t > d.windup && this.t < d.windup + d.active + 0.06) trail = 1;
    } else if (this.state === 'heavy') {
      const p = clamp(this.t / (HEAVY.windup + HEAVY.active), 0, 1);
      ang = lerp(-2.9, 0.8, p * p * p);
      if (this.t > HEAVY.windup && this.t < HEAVY.windup + HEAVY.active + 0.08) trail = 2;
    } else if (Math.abs(this.vx) > 30 && this.onGround) {
      ang = -0.45 + Math.sin(this.runPhase) * 0.08;
    } else if (this.state === 'cast') {
      ang = -1.5 + Math.sin(time * 30) * 0.1;
    }

    const hx = 8, hyy = -34 - bob;   // 手的位置
    // 挥棍轨迹
    if (trail) {
      const r = trail === 2 ? 95 : 70;
      const g = ctx.createRadialGradient(hx, hyy, 10, hx, hyy, r);
      g.addColorStop(0, trail === 2 ? 'rgba(255,150,60,0.55)' : 'rgba(255,220,130,0.45)');
      g.addColorStop(1, 'rgba(255,200,100,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(hx, hyy);
      ctx.arc(hx, hyy, r, ang - 1.5, ang + 0.25);
      ctx.closePath(); ctx.fill();
    }
    ctx.save();
    ctx.translate(hx, hyy); ctx.rotate(ang);
    ctx.fillStyle = '#7a2b20';           // 棒身（红檀色）
    ctx.fillRect(-42, -2.5, 108, 5);
    ctx.fillStyle = '#e8b33a';           // 两端金箍
    ctx.fillRect(-48, -3.5, 10, 7);
    ctx.fillRect(60, -3.5, 10, 7);
    ctx.restore();
  }
}
