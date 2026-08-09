'use strict';
// ============ 关卡数据与场景绘制 ============
const VIEW_W = 1280, VIEW_H = 720;

function makeLevel(n) {
  if (n === 1) {
    const groundY = 620;
    return {
      id: 1, name: '第一回', sub: '黑风山 · 苍狼林', theme: 'forest',
      width: 4200, groundY,
      playerStart: { x: 100, y: 480 },
      platforms: [
        { x: 0, y: groundY, w: 4200, h: 120, type: 'solid' },
        { x: 700, y: 490, w: 180, h: 16, type: 'plat' },
        { x: 1150, y: 440, w: 170, h: 16, type: 'plat' },
        { x: 1500, y: 556, w: 240, h: 64, type: 'solid' },   // 土坡
        { x: 1930, y: 500, w: 200, h: 16, type: 'plat' },
        { x: 2600, y: 470, w: 170, h: 16, type: 'plat' },
        { x: 3120, y: 430, w: 160, h: 16, type: 'plat' },
        { x: 3450, y: 540, w: 200, h: 80, type: 'solid' },   // 石台
      ],
      spawns: [
        { type: 'wolf', x: 620, a: 500, b: 860 },
        { type: 'wolf', x: 1020, a: 930, b: 1300 },
        { type: 'archer', x: 1210, y: 370 },
        { type: 'wolf', x: 1600, a: 1510, b: 1720, y: 490 },
        { type: 'wolf', x: 2280, a: 2150, b: 2480 },
        { type: 'archer', x: 2660, y: 400 },
        { type: 'wolf', x: 2900, a: 2800, b: 3080 },
        { type: 'archer', x: 3180, y: 360 },
        { type: 'wolf', x: 3560, a: 3420, b: 3700, y: 470 },
        { type: 'wolf', x: 3820, a: 3720, b: 3980 },
      ],
      shrine: { x: 2050, y: groundY - 96, w: 76, h: 96, active: false },
      gate: { x: 4056, y: groundY - 150, w: 96, h: 150 },
      boss: false,
      // 预生成背景装饰（确定性）
      deco: {
        farHills: Array.from({ length: 12 }, (_, i) => ({ x: i * 420, h: 120 + seeded(i) * 160 })),
        pines: Array.from({ length: 46 }, (_, i) => ({ x: i * 110 + seeded(i + 50) * 70, s: 0.7 + seeded(i + 90) * 0.8 })),
        nearPines: Array.from({ length: 30 }, (_, i) => ({ x: i * 190 + seeded(i + 130) * 90, s: 1.1 + seeded(i + 170) * 0.9 })),
        grass: Array.from({ length: 140 }, (_, i) => ({ x: i * 30 + seeded(i + 300) * 22, h: 6 + seeded(i + 400) * 10 })),
      }
    };
  }
  // 第二关：Boss 战
  const groundY = 620;
  return {
    id: 2, name: '第二回', sub: '观音禅院 · 火场', theme: 'temple',
    width: 1700, groundY,
    playerStart: { x: 130, y: 480 },
    platforms: [
      { x: 0, y: groundY, w: 1700, h: 120, type: 'solid' },
      { x: 340, y: 484, w: 150, h: 16, type: 'plat' },
      { x: 1180, y: 484, w: 150, h: 16, type: 'plat' },
    ],
    spawns: [{ type: 'boss', x: 1160, y: 500 }],
    shrine: null, gate: null, boss: true,
    deco: {
      roofs: Array.from({ length: 6 }, (_, i) => ({ x: i * 330 + seeded(i + 7) * 80, w: 240 + seeded(i + 17) * 120, h: 90 + seeded(i + 27) * 60 })),
      pillars: Array.from({ length: 9 }, (_, i) => ({ x: i * 210 + seeded(i + 37) * 60, h: 90 + seeded(i + 47) * 110, broken: seeded(i + 57) > 0.5 })),
      tiles: Array.from({ length: 90 }, (_, i) => seeded(i + 67)),
    }
  };
}

// ---------- 背景（屏幕空间 + 视差） ----------
function renderBackground(ctx, level, camX, time) {
  if (level.theme === 'forest') renderForestBG(ctx, level, camX, time);
  else renderTempleBG(ctx, level, camX, time);
}

function renderForestBG(ctx, level, camX, time) {
  // 夜空
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, '#0a0c18'); sky.addColorStop(0.55, '#131a2b'); sky.addColorStop(1, '#1c2433');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // 月
  const mg = ctx.createRadialGradient(990, 140, 30, 990, 140, 160);
  mg.addColorStop(0, 'rgba(240,225,180,0.55)'); mg.addColorStop(1, 'rgba(240,225,180,0)');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(990, 140, 160, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#efe0b4';
  ctx.beginPath(); ctx.arc(990, 140, 58, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(200,185,140,0.5)';
  ctx.beginPath(); ctx.arc(975, 128, 9, 0, Math.PI * 2); ctx.arc(1008, 152, 6, 0, Math.PI * 2); ctx.fill();

  // 远山（视差 0.12）
  ctx.fillStyle = '#11162a';
  for (const h of level.deco.farHills) {
    const sx = ((h.x - camX * 0.12) % (level.width + 800) + level.width + 800) % (level.width + 800) - 400;
    if (sx < -450 || sx > VIEW_W + 50) continue;
    ctx.beginPath();
    ctx.moveTo(sx - 260, 560);
    ctx.quadraticCurveTo(sx - 60, 560 - h.h * 1.4, sx, 560 - h.h);
    ctx.quadraticCurveTo(sx + 130, 560 - h.h * 0.5, sx + 280, 560);
    ctx.closePath(); ctx.fill();
  }
  // 雾带 1
  ctx.fillStyle = 'rgba(150,170,200,0.06)';
  ctx.fillRect(0, 430 + Math.sin(time * 0.3) * 10, VIEW_W, 60);

  // 中景松林（视差 0.38）
  for (const p of level.deco.pines) {
    const sx = p.x - camX * 0.38;
    if (sx < -80 || sx > VIEW_W + 80) continue;
    drawPine(ctx, sx, 600, 70 * p.s, 130 * p.s, '#0d1220');
  }
  // 近景松林（视差 0.7）
  for (const p of level.deco.nearPines) {
    const sx = p.x - camX * 0.7;
    if (sx < -120 || sx > VIEW_W + 120) continue;
    drawPine(ctx, sx, 640, 95 * p.s, 190 * p.s, '#080c14');
  }
  // 雾带 2
  ctx.fillStyle = 'rgba(160,180,210,0.05)';
  ctx.fillRect(0, 520 + Math.cos(time * 0.4) * 8, VIEW_W, 90);
}

function drawPine(ctx, x, baseY, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x - 3, baseY - h * 0.25, 6, h * 0.25);
  for (let i = 0; i < 3; i++) {
    const ly = baseY - h * 0.2 - i * h * 0.26, lw = w * (1 - i * 0.26);
    ctx.beginPath();
    ctx.moveTo(x - lw / 2, ly);
    ctx.lineTo(x, ly - h * 0.38);
    ctx.lineTo(x + lw / 2, ly);
    ctx.closePath(); ctx.fill();
  }
}

function renderTempleBG(ctx, level, camX, time) {
  // 火烧夜空
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, '#0c0708'); sky.addColorStop(0.5, '#1e0e0c'); sky.addColorStop(0.85, '#3a1610');
  sky.addColorStop(1, '#4a1c10');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // 火光脉动
  const glow = ctx.createRadialGradient(VIEW_W / 2, 620, 60, VIEW_W / 2, 620, 700);
  const a = 0.16 + Math.sin(time * 2.3) * 0.04;
  glow.addColorStop(0, `rgba(255,120,40,${a})`); glow.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // 燃烧的殿宇剪影（视差 0.3）
  for (const r of level.deco.roofs) {
    const sx = r.x - camX * 0.3;
    if (sx < -400 || sx > VIEW_W + 200) continue;
    const baseY = 560;
    ctx.fillStyle = '#160b09';
    // 飞檐屋顶
    ctx.beginPath();
    ctx.moveTo(sx - 30, baseY - r.h);
    ctx.quadraticCurveTo(sx + r.w * 0.5, baseY - r.h - 46, sx + r.w + 30, baseY - r.h);
    ctx.lineTo(sx + r.w * 0.82, baseY - r.h + 26);
    ctx.lineTo(sx + r.w * 0.18, baseY - r.h + 26);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(sx + r.w * 0.14, baseY - r.h + 26, r.w * 0.72, r.h - 26);
    // 窗内火光
    ctx.fillStyle = `rgba(255,${140 + Math.sin(time * 3 + sx) * 40},50,0.55)`;
    for (let i = 0; i < 3; i++) ctx.fillRect(sx + r.w * 0.24 + i * r.w * 0.2, baseY - r.h * 0.55, r.w * 0.1, r.h * 0.22);
  }
  // 断壁残柱（视差 0.65）
  for (const p of level.deco.pillars) {
    const sx = p.x - camX * 0.65;
    if (sx < -60 || sx > VIEW_W + 60) continue;
    ctx.fillStyle = '#1c0f0b';
    ctx.fillRect(sx, 640 - p.h, 22, p.h);
    if (p.broken) {
      ctx.beginPath();
      ctx.moveTo(sx, 640 - p.h); ctx.lineTo(sx + 11, 640 - p.h - 18); ctx.lineTo(sx + 22, 640 - p.h);
      ctx.closePath(); ctx.fill();
    }
  }
  // 烟
  ctx.fillStyle = 'rgba(30,20,18,0.35)';
  for (let i = 0; i < 4; i++) {
    const sy = 120 + i * 60 + Math.sin(time * 0.5 + i) * 20;
    ctx.fillRect(0, sy, VIEW_W, 26);
  }
}

// ---------- 地形（世界空间） ----------
function renderPlatforms(ctx, level, time) {
  for (const p of level.platforms) {
    if (p.type === 'solid') {
      if (level.theme === 'forest') {
        ctx.fillStyle = '#242c26';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#33402f';   // 草皮
        ctx.fillRect(p.x, p.y, p.w, 10);
      } else {
        ctx.fillStyle = '#241713';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = '#3a251c';
        ctx.fillRect(p.x, p.y, p.w, 10);
        // 石板缝
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2;
        for (let x = p.x; x < p.x + p.w; x += 68) {
          ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x, p.y + 12); ctx.stroke();
        }
      }
    } else {
      // 悬浮木台/石台
      ctx.fillStyle = level.theme === 'forest' ? '#3b3226' : '#2e1e16';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = level.theme === 'forest' ? '#4d4232' : '#42301f';
      ctx.fillRect(p.x, p.y, p.w, 5);
    }
  }
  // 草丛
  if (level.theme === 'forest' && level.deco.grass) {
    ctx.strokeStyle = '#3e4d36'; ctx.lineWidth = 2;
    for (const g of level.deco.grass) {
      if (g.x > level.width) continue;
      const sway = Math.sin(time * 2 + g.x * 0.05) * 2;
      ctx.beginPath();
      ctx.moveTo(g.x, level.groundY);
      ctx.quadraticCurveTo(g.x + sway, level.groundY - g.h, g.x + sway * 2, level.groundY - g.h * 1.6);
      ctx.stroke();
    }
  }
}

// ---------- 土地庙 & 山门（世界空间） ----------
function renderShrine(ctx, s, time) {
  // 石座
  ctx.fillStyle = '#39352e';
  ctx.fillRect(s.x + 8, s.y + 40, s.w - 16, s.h - 40);
  // 庙身
  ctx.fillStyle = '#4a4238';
  ctx.fillRect(s.x + 14, s.y + 26, s.w - 28, 40);
  ctx.fillStyle = '#171310';
  ctx.fillRect(s.x + 26, s.y + 36, s.w - 52, 26);   // 神龛
  // 飞檐顶
  ctx.fillStyle = '#2c2620';
  ctx.beginPath();
  ctx.moveTo(s.x - 6, s.y + 28);
  ctx.quadraticCurveTo(s.x + s.w / 2, s.y - 14, s.x + s.w + 6, s.y + 28);
  ctx.lineTo(s.x + s.w - 8, s.y + 34);
  ctx.lineTo(s.x + 8, s.y + 34);
  ctx.closePath(); ctx.fill();
  if (s.active) {
    // 香火
    const g = ctx.createRadialGradient(s.x + s.w / 2, s.y + 48, 4, s.x + s.w / 2, s.y + 48, 40);
    g.addColorStop(0, 'rgba(255,190,90,0.7)'); g.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(s.x + s.w / 2, s.y + 48, 40, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffcf7a';
    ctx.fillRect(s.x + s.w / 2 - 2, s.y + 44 + Math.sin(time * 8) * 1.5, 4, 8);
  }
}

function renderGate(ctx, g, time) {
  // 山门：双柱 + 匾额
  ctx.fillStyle = '#6e2a1e';
  ctx.fillRect(g.x, g.y + 26, 16, g.h - 26);
  ctx.fillRect(g.x + g.w - 16, g.y + 26, 16, g.h - 26);
  ctx.fillStyle = '#241a14';
  ctx.beginPath();
  ctx.moveTo(g.x - 18, g.y + 30);
  ctx.quadraticCurveTo(g.x + g.w / 2, g.y - 20, g.x + g.w + 18, g.y + 30);
  ctx.lineTo(g.x + g.w + 8, g.y + 40);
  ctx.lineTo(g.x - 8, g.y + 40);
  ctx.closePath(); ctx.fill();
  // 匾
  ctx.fillStyle = '#151009';
  ctx.fillRect(g.x + g.w / 2 - 30, g.y + 34, 60, 22);
  ctx.strokeStyle = '#e8b33a'; ctx.lineWidth = 1.5;
  ctx.strokeRect(g.x + g.w / 2 - 30, g.y + 34, 60, 22);
  ctx.fillStyle = '#e8b33a';
  ctx.font = '14px "Noto Serif SC", serif'; ctx.textAlign = 'center';
  ctx.fillText('禅 院', g.x + g.w / 2, g.y + 50);
  // 门内微光指引
  const glow = ctx.createRadialGradient(g.x + g.w / 2, g.y + g.h - 30, 5, g.x + g.w / 2, g.y + g.h - 30, 60);
  const a = 0.25 + Math.sin(time * 3) * 0.08;
  glow.addColorStop(0, `rgba(255,220,140,${a})`); glow.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(g.x + g.w / 2, g.y + g.h - 30, 60, 0, Math.PI * 2); ctx.fill();
}
