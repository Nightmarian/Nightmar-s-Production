const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreElement = document.getElementById("score");
const bestElement = document.getElementById("best");
const overlay = document.getElementById("gameOverlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startButton = document.getElementById("startButton");

const jumpButton = document.getElementById("jumpButton");
const slideButton = document.getElementById("slideButton");

const W = canvas.width;
const H = canvas.height;
const GROUND = 290;

const GRAVITY = 1550;
const JUMP_FORCE = -620;

let running = false;
let isDead = false; // Флаг смерти, чтобы скрывать игрока
let score = 0;
let speed = 250;
let obstacles = [];
let spawnDistance = 450;
let worldDistance = 0;
let lastTime = 0;

let jumpBuffer = 0;
let slideHeld = false;

let best = Number(localStorage.getItem("nightmarRunnerBest")) || 0;
bestElement.textContent = String(best).padStart(5, "0");

// ===============================
// СИСТЕМЫ ЧАСТИЦ
// ===============================

let particles = [];
let dustParticles = [];
let stars = [];
let screenShake = 0;
let deathFlash = 0;
let trailPositions = [];

for (let i = 0; i < 80; i++) {
  stars.push({
    x: Math.random() * W,
    y: Math.random() * (GROUND - 80),
    size: Math.random() * 2 + 0.5,
    twinkleSpeed: Math.random() * 3 + 1,
    twinkleOffset: Math.random() * Math.PI * 2,
    brightness: Math.random() * 0.5 + 0.5
  });
}

const cityLayers = [
  { speed: 0.05, colors: ["#506070", "#0c111c"], data: [], totalW: 0 },
  { speed: 0.15, colors: ["#3a4a5a", "#070b14"], data: [], totalW: 0 },
  { speed: 0.45, colors: ["#202c38", "#020408"], data: [], totalW: 0 }
];

cityLayers.forEach((layer, index) => {
  let x = 0;
  while (x < 2000) {
    let w = 30 + Math.random() * 70;
    let h = 80 + Math.random() * (80 + index * 50);
    let hasWindows = index === 2 && Math.random() > 0.3;
    let hasAntenna = Math.random() > 0.6;
    let windowSeed = Math.random();
    layer.data.push({ x, w, h, hasWindows, hasAntenna, windowSeed });
    x += w + (Math.random() * 10);
  }
  layer.totalW = x;
});

function spawnDust(x, y, count) {
  for (let i = 0; i < count; i++) {
    dustParticles.push({
      x: x + Math.random() * 10 - 5,
      y: y + Math.random() * 5,
      vx: -speed * 0.3 + (Math.random() - 0.5) * 40,
      vy: -Math.random() * 30 - 10,
      life: 0.3 + Math.random() * 0.4,
      maxLife: 0.3 + Math.random() * 0.4,
      size: 2 + Math.random() * 3,
      color: "rgba(100, 110, 120, "
    });
  }
}

function spawnSparks(x, y) {
  dustParticles.push({
    x: x + Math.random() * 5,
    y: y,
    vx: -speed * 0.5 + Math.random() * 80,
    vy: -Math.random() * 40 - 10,
    life: 0.15 + Math.random() * 0.15,
    maxLife: 0.15 + Math.random() * 0.15,
    size: 1.5 + Math.random() * 2.5,
    color: "rgba(255, 180, 50, "
  });
}

function spawnDeathParticles(x, y) {
  for (let i = 0; i < 60; i++) {
    const angle = Math.random() * Math.PI * 2;
    const force = 50 + Math.random() * 350;
    particles.push({
      x: x, y: y - 20,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force - 100,
      life: 0.6 + Math.random() * 1,
      maxLife: 0.6 + Math.random() * 1,
      size: 2 + Math.random() * 7,
      color: ["#ffffff", "#bbbbbb", "#555555", "#000000", "#111111", "#ff0000"][Math.floor(Math.random() * 6)],
      gravity: true
    });
  }
}

function updateParticles(dt) {
  for (let i = dustParticles.length - 1; i >= 0; i--) {
    const p = dustParticles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) dustParticles.splice(i, 1);
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.gravity) p.vy += 600 * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ===============================
// ИГРОК И ЛОГИКА
// ===============================

const player = {
  x: 110,
  y: GROUND - 62,
  width: 36,
  height: 62,
  velocityY: 0,
  grounded: true,
  sliding: false
};

function jump() {
  if (!running || isDead) return;
  jumpBuffer = 0.15;
}

function slide() {
  if (!running || isDead) return;
  slideHeld = true;
}

function stopSlide() {
  slideHeld = false;
  player.sliding = false;
}

function startGame() {
  running = true;
  isDead = false;
  score = 0;
  speed = 250;
  obstacles = [];
  spawnDistance = 450;
  worldDistance = 0;
  jumpBuffer = 0;
  slideHeld = false;
  particles = [];
  dustParticles = [];
  screenShake = 0;
  deathFlash = 0;
  trailPositions = [];

  player.y = GROUND - player.height;
  player.velocityY = 0;
  player.grounded = true;
  player.sliding = false;

  scoreElement.textContent = "00000";
  overlay.classList.add("hidden");
}

function gameOver() {
  running = false;
  isDead = true; // Скрываем игрока
  screenShake = 0.5;
  deathFlash = 0.4;
  spawnDeathParticles(player.x + 18, player.y + 30);

  const result = Math.floor(score);
  if (result > best) {
    best = result;
    localStorage.setItem("nightmarRunnerBest", best);
    bestElement.textContent = String(best).padStart(5, "0");
  }

  overlayTitle.textContent = "SYSTEM FAILURE";
  overlayText.textContent = `SCORE: ${result}`;
  startButton.textContent = "REBOOT";

  setTimeout(() => overlay.classList.remove("hidden"), 800);
}

// ===============================
// ОБНОВЛЕНИЕ ИГРЫ
// ===============================

function spawnObstacle() {
  const types = ["rock", "log", "drone", "spikes", "stump"]; // Убрал кактус для атмосферы города
  const type = types[Math.floor(Math.random() * types.length)];
  let width, height, y;

  switch (type) {
    case "rock": width = 45; height = 35; y = GROUND - height; break;
    case "log": width = 75; height = 25; y = GROUND - height; break;
    case "drone": width = 60; height = 30; y = GROUND - 65; break;
    case "spikes": width = 80; height = 28; y = GROUND - height; break;
    case "stump": width = 45; height = 40; y = GROUND - height; break;
  }
  obstacles.push({ x: W + 30, y, width, height, type });
}

function update(dt) {
  if (isDead) return; // Если мертв, физика игрока не обновляется

  score += dt * 12;
  speed = Math.min(480, 250 + score * 0.45);
  const movement = speed * dt;
  worldDistance += movement;
  scoreElement.textContent = String(Math.floor(score)).padStart(5, "0");

  if (jumpBuffer > 0) {
    jumpBuffer -= dt;
    if (player.grounded) {
      player.velocityY = JUMP_FORCE;
      player.grounded = false;
      jumpBuffer = 0;
      spawnDust(player.x + 18, GROUND, 8);
    }
  }

  player.velocityY += GRAVITY * dt;
  player.y += player.velocityY * dt;

  if (player.y >= GROUND - player.height) {
    if (!player.grounded && player.velocityY > 200) spawnDust(player.x + 18, GROUND, 6);
    player.y = GROUND - player.height;
    player.velocityY = 0;
    player.grounded = true;
  }

  player.sliding = slideHeld && player.grounded;
  
  if (player.sliding) {
    if (Math.random() < 0.7) spawnSparks(player.x + 40, GROUND - 2);
  } else if (player.grounded && Math.random() < 0.3) {
    spawnDust(player.x + 10, GROUND, 1);
  }

  trailPositions.unshift({ x: player.x, y: player.y, sliding: player.sliding, time: 0.1 });
  if (trailPositions.length > 5) trailPositions.pop();
  for (let i = trailPositions.length - 1; i >= 0; i--) {
    trailPositions[i].time -= dt;
    if (trailPositions[i].time <= 0) trailPositions.splice(i, 1);
  }

  spawnDistance -= movement;
  if (spawnDistance <= 0) {
    spawnObstacle();
    spawnDistance = 350 + Math.random() * 250;
  }

  for (const o of obstacles) {
    o.x -= movement;
    const px = player.x + 6;
    const pw = player.sliding ? 45 : 24;
    const py = player.sliding ? GROUND - 22 : player.y + 5;
    const ph = player.sliding ? 18 : player.height - 10;
    const margin = 6;

    const horizontalCollision = px < o.x + o.width - margin && px + pw > o.x + margin;

    if (o.type === "drone") {
      // Под дроном можно ТОЛЬКО проскользить
      if (horizontalCollision && !player.sliding) { gameOver(); return; }
    } else {
      const verticalCollision = py < o.y + o.height - margin && py + ph > o.y + margin;
      if (horizontalCollision && verticalCollision) { gameOver(); return; }
    }
  }

  obstacles = obstacles.filter(o => o.x + o.width > 0);
}

// ===============================
// РЕНДЕР ФОНА
// ===============================

function mixColor(a, b, t) {
  const c1 = a.match(/\w\w/g).map(x => parseInt(x, 16));
  const c2 = b.match(/\w\w/g).map(x => parseInt(x, 16));
  const c = c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function getDaylight() {
  const cycle = (worldDistance / 12000) % 1;
  return (Math.cos(cycle * Math.PI * 2) + 1) / 2;
}

function drawBackground() {
  const cycle = (worldDistance / 12000) % 1;
  const daylight = getDaylight();

  const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND);
  skyGrad.addColorStop(0, mixColor("#050811", "#4a6a82", daylight));
  skyGrad.addColorStop(1, mixColor("#141b26", "#80a8b8", daylight));
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, GROUND);

  if (daylight < 0.7) {
    const starAlpha = Math.max(0, 1 - daylight / 0.7);
    for (const s of stars) {
      const twinkle = (Math.sin(worldDistance * 0.01 * s.twinkleSpeed + s.twinkleOffset) + 1) / 2;
      ctx.fillStyle = `rgba(255, 255, 240, ${starAlpha * s.brightness * (0.4 + twinkle * 0.6)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.size * (0.7 + twinkle * 0.3), 0, Math.PI * 2); ctx.fill();
    }
  }

  const orbX = 90 + cycle * 720;
  const orbY = 95 - Math.sin(cycle * Math.PI) * 50;
  ctx.fillStyle = mixColor("#e6ebff", "#ffdd66", daylight);
  ctx.shadowColor = mixColor("#90a0ff", "#ffcc40", daylight);
  ctx.shadowBlur = 40;
  ctx.beginPath(); ctx.arc(orbX, orbY, 22, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  cityLayers.forEach(layer => {
    const offset = (worldDistance * layer.speed) % layer.totalW;
    ctx.fillStyle = mixColor(layer.colors[1], layer.colors[0], daylight);

    for (let i = 0; i < 2; i++) {
      ctx.save();
      ctx.translate(-offset + (i * layer.totalW), 0);
      layer.data.forEach(b => {
        ctx.fillRect(b.x, GROUND - b.h, b.w, b.h);
        if (b.hasAntenna) {
          ctx.fillRect(b.x + b.w * 0.2, GROUND - b.h - 15, 2, 15);
          if (b.windowSeed > 0.5) ctx.fillRect(b.x + b.w * 0.8, GROUND - b.h - 8, 1, 8);
        }
        if (b.hasWindows && daylight < 0.4) {
          ctx.fillStyle = `rgba(255, 240, 150, ${1 - daylight / 0.4})`;
          for (let wy = GROUND - b.h + 15; wy < GROUND - 15; wy += 18) {
            for (let wx = b.x + 8; wx < b.x + b.w - 12; wx += 14) {
              if ((wx + wy * b.windowSeed) % 3 > 1.2) ctx.fillRect(wx, wy, 6, 8);
            }
          }
          ctx.fillStyle = mixColor(layer.colors[1], layer.colors[0], daylight);
        }
      });
      ctx.restore();
    }
  });

  const groundGrad = ctx.createLinearGradient(0, GROUND, 0, H);
  groundGrad.addColorStop(0, mixColor("#12151a", "#2b3036", daylight));
  groundGrad.addColorStop(1, mixColor("#06080a", "#121418", daylight));
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, GROUND, W, H - GROUND);

  ctx.strokeStyle = mixColor("#202835", "#455667", daylight);
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND); ctx.stroke();

  const roadTex = -(worldDistance * 1.2) % 60;
  ctx.fillStyle = mixColor("rgba(255,255,255,0.03)", "rgba(255,255,255,0.1)", daylight);
  for (let i = -1; i < W / 60 + 2; i++) ctx.fillRect(roadTex + i * 60, GROUND + 15, 30, 4);
}

// ===============================
// ПЕРСОНАЖ (ОРГАНИЧЕСКИЙ РЕНДЕР)
// ===============================

function drawPlayerTrail() {
  for (let i = 0; i < trailPositions.length; i++) {
    const t = trailPositions[i];
    const alpha = (t.time / 0.1) * 0.15;
    if (alpha <= 0) continue;
    ctx.fillStyle = `rgba(100, 150, 255, ${alpha})`;
    if (t.sliding) ctx.fillRect(t.x, GROUND - 25, 50, 25);
    else ctx.fillRect(t.x, t.y, 36, 62);
  }
}

function drawPlayer() {
  if (isDead) return; // УБРАН БАГ: скрываем модельку полностью после смерти

  const x = player.x;
  const y = player.y;
  ctx.save();

  // Тень
  ctx.fillStyle = `rgba(0, 0, 0, ${player.grounded ? 0.6 : 0.2})`;
  ctx.beginPath(); ctx.ellipse(x + 18, GROUND + 2, player.sliding ? 28 : 16, 4, 0, 0, Math.PI * 2); ctx.fill();

  drawPlayerTrail();

  // Неоновое свечение (аура)
  ctx.shadowColor = "rgba(150, 200, 255, 0.6)";
  ctx.shadowBlur = 15;

  if (player.sliding) {
    // --- ПРАВИЛЬНЫЙ ПОДКАТ ---
    // Тело рисуется горизонтально, рука опирается о пол
    
    // Задняя нога (подогнута под себя)
    ctx.strokeStyle = "#080808"; ctx.lineWidth = 8; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x + 15, GROUND - 12); ctx.lineTo(x, GROUND - 5); ctx.stroke();

    // Задняя рука (отведена назад для баланса)
    ctx.strokeStyle = "#0d0d0d"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x + 12, GROUND - 20); ctx.lineTo(x - 5, GROUND - 25); ctx.stroke();

    // Органичное тело (Худи) - изогнуто в подкате
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.moveTo(x + 8, GROUND - 5); // низ спины
    ctx.quadraticCurveTo(x + 15, GROUND - 25, x + 35, GROUND - 22); // дуга спины к шее
    ctx.lineTo(x + 30, GROUND - 8); // грудь
    ctx.quadraticCurveTo(x + 20, GROUND - 2, x + 8, GROUND - 5); // живот
    ctx.fill();

    // Складки на худи
    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 15, GROUND - 10); ctx.quadraticCurveTo(x + 20, GROUND - 18, x + 28, GROUND - 15); ctx.stroke();

    // Лого NP (под углом)
    ctx.save();
    ctx.translate(x + 22, GROUND - 12); ctx.rotate(0.3);
    ctx.fillStyle = "#fff"; ctx.font = "bold 11px 'Courier New', monospace"; ctx.fillText("NP", -8, 4);
    ctx.restore();

    // Капюшон и голова смотрят ВПЕРЕД
    ctx.fillStyle = "#161616";
    ctx.beginPath(); ctx.arc(x + 38, GROUND - 18, 12, 0, Math.PI * 2); ctx.fill(); // Капюшон
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(x + 40, GROUND - 17, 9, 0, Math.PI * 2); ctx.fill(); // Тьма внутри

    // Жуткое лицо в подкате
    ctx.shadowBlur = 0; // Отключаем общее свечение для четкости лица
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(x + 38, GROUND - 20, 2, 0, Math.PI * 2); // Глаз 1
    ctx.arc(x + 44, GROUND - 19, 2, 0, Math.PI * 2); // Глаз 2
    ctx.fill();
    
    // Оскал
    ctx.beginPath();
    ctx.moveTo(x + 35, GROUND - 14); ctx.lineTo(x + 37, GROUND - 12); ctx.lineTo(x + 39, GROUND - 14);
    ctx.lineTo(x + 41, GROUND - 12); ctx.lineTo(x + 43, GROUND - 14); ctx.lineTo(x + 45, GROUND - 12);
    ctx.lineTo(x + 47, GROUND - 14); ctx.quadraticCurveTo(x + 41, GROUND - 8, x + 35, GROUND - 14);
    ctx.fill();

    ctx.shadowBlur = 15; // Возвращаем ауру

    // Передняя нога (вытянута вперед для удара/скольжения)
    ctx.strokeStyle = "#151515"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(x + 25, GROUND - 10); ctx.lineTo(x + 48, GROUND - 5); ctx.stroke();
    ctx.fillStyle = "#050505"; // Ботинок
    ctx.beginPath(); ctx.ellipse(x + 50, GROUND - 4, 6, 3, -0.2, 0, Math.PI * 2); ctx.fill();

    // Передняя рука (ОПИРАЕТСЯ НА ЗЕМЛЮ, ИСКРЫ) - Растет ПРЯМО ОТ ПЛЕЧА
    const shoulderX = x + 28;
    const shoulderY = GROUND - 18;
    const handX = x + 38;
    const handY = GROUND - 2;

    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(shoulderX, shoulderY); ctx.lineTo(handX, handY); ctx.stroke();
    ctx.fillStyle = "#dcdcdc"; // Бледная рука
    ctx.beginPath(); ctx.arc(handX, handY, 3, 0, Math.PI * 2); ctx.fill();

  } else {
    // --- ОРГАНИЧНЫЙ БЕГ ---
    const runCycle = worldDistance / 16;
    const legSwing = player.grounded ? Math.sin(runCycle) * 14 : 0;
    const armSwing = player.grounded ? Math.cos(runCycle) * 12 : 6;
    const bobY = player.grounded ? Math.abs(Math.sin(runCycle * 2)) * 3 : 0;

    const shoulderX = x + 18;
    const shoulderY = y + 22 + bobY;
    const hipX = x + 18;
    const hipY = y + 43 + bobY;

    // Задняя рука (Сгибается в локте)
    ctx.strokeStyle = "#080808"; ctx.lineWidth = 6; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(shoulderX, shoulderY); 
    ctx.lineTo(shoulderX + armSwing, shoulderY + 12); // Локоть
    ctx.lineTo(shoulderX + armSwing + 8, shoulderY + 4); // Кулак вверх
    ctx.stroke();
    ctx.fillStyle = "#a9a9a9"; ctx.beginPath(); ctx.arc(shoulderX + armSwing + 8, shoulderY + 4, 3, 0, Math.PI * 2); ctx.fill();

    // Задняя нога
    ctx.strokeStyle = "#080808"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(hipX - legSwing, y + 62); ctx.stroke();
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(hipX - legSwing + 2, y + 63, 6, 3, 0, 0, Math.PI * 2); ctx.fill();

    // Органичное тело (Худи из кривых)
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 16 + bobY); // Шея
    ctx.quadraticCurveTo(x + 4, y + 30 + bobY, x + 8, y + 46 + bobY); // Спина
    ctx.lineTo(x + 26, y + 46 + bobY); // Низ
    ctx.quadraticCurveTo(x + 32, y + 30 + bobY, x + 24, y + 16 + bobY); // Грудь
    ctx.fill();

    // Складки
    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 12, y + 25 + bobY); ctx.quadraticCurveTo(x + 20, y + 30 + bobY, x + 25, y + 28 + bobY); ctx.stroke();

    ctx.fillStyle = "#fff"; ctx.font = "bold 13px 'Courier New', monospace"; ctx.fillText("NP", x + 10, y + 36 + bobY);

    // Передняя нога
    ctx.strokeStyle = "#151515"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(hipX + legSwing, y + 62); ctx.stroke();
    ctx.fillStyle = "#050505"; ctx.beginPath(); ctx.ellipse(hipX + legSwing + 2, y + 63, 6, 3, 0, 0, Math.PI * 2); ctx.fill();

    // Капюшон
    ctx.fillStyle = "#161616"; ctx.beginPath(); ctx.arc(x + 18, y + 14 + bobY, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(x + 19, y + 15 + bobY, 11, 0, Math.PI * 2); ctx.fill();

    // Лицо
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(x + 15, y + 12 + bobY, 2.5, 0, Math.PI * 2); ctx.arc(x + 23, y + 12 + bobY, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 11, y + 18 + bobY); ctx.lineTo(x + 13, y + 22 + bobY); ctx.lineTo(x + 15, y + 19 + bobY);
    ctx.lineTo(x + 17, y + 23 + bobY); ctx.lineTo(x + 19, y + 19 + bobY); ctx.lineTo(x + 21, y + 23 + bobY);
    ctx.lineTo(x + 23, y + 19 + bobY); ctx.lineTo(x + 25, y + 22 + bobY); ctx.lineTo(x + 27, y + 18 + bobY);
    ctx.quadraticCurveTo(x + 19, y + 28 + bobY, x + 11, y + 18 + bobY); ctx.fill();
    ctx.shadowBlur = 15;

    // Передняя рука
    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(shoulderX, shoulderY); 
    ctx.lineTo(shoulderX - armSwing, shoulderY + 12); // Локоть
    ctx.lineTo(shoulderX - armSwing + 10, shoulderY + 4); // Кулак
    ctx.stroke();
    ctx.fillStyle = "#dcdcdc"; ctx.beginPath(); ctx.arc(shoulderX - armSwing + 10, shoulderY + 4, 3.5, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
}

// ===============================
// ПРЕПЯТСТВИЯ (ДЕТАЛИЗИРОВАННЫЕ)
// ===============================

function drawObstacles() {
  for (const o of obstacles) {
    ctx.save();
    
    // Тень
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    if (o.type !== "drone") {
      ctx.beginPath(); ctx.ellipse(o.x + o.width / 2, GROUND + 2, o.width * 0.4, 4, 0, 0, Math.PI * 2); ctx.fill();
    }

    if (o.type === "rock") {
      // Полигональный камень
      ctx.fillStyle = "#4a4a4a";
      ctx.beginPath();
      ctx.moveTo(o.x, GROUND); 
      ctx.lineTo(o.x + 8, o.y + 15); ctx.lineTo(o.x + 15, o.y + 5); 
      ctx.lineTo(o.x + 25, o.y); ctx.lineTo(o.x + 35, o.y + 8); 
      ctx.lineTo(o.x + o.width, GROUND);
      ctx.fill();

      // Освещенная грань
      ctx.fillStyle = "#666";
      ctx.beginPath();
      ctx.moveTo(o.x + 15, o.y + 5); ctx.lineTo(o.x + 25, o.y); ctx.lineTo(o.x + 28, o.y + 15); ctx.lineTo(o.x + 12, GROUND); ctx.fill();

      // Мох/грязь внизу
      ctx.fillStyle = "#2a3325";
      ctx.beginPath(); ctx.moveTo(o.x, GROUND); ctx.lineTo(o.x + 10, GROUND - 8); ctx.lineTo(o.x + o.width, GROUND); ctx.fill();

    } else if (o.type === "log") {
      // Бревно с текстурой коры
      ctx.fillStyle = "#3b2b20";
      const r = o.height / 2;
      ctx.beginPath();
      ctx.moveTo(o.x + r, o.y); ctx.lineTo(o.x + o.width - r, o.y);
      ctx.arc(o.x + o.width - r, o.y + r, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(o.x + r, o.y + o.height); ctx.arc(o.x + r, o.y + r, r, Math.PI / 2, -Math.PI / 2);
      ctx.fill();

      // Извилистая кора
      ctx.strokeStyle = "#1a120c"; ctx.lineWidth = 1.5;
      for(let i=0; i<3; i++) {
        ctx.beginPath(); ctx.moveTo(o.x + 15, o.y + 6 + i*6); 
        ctx.quadraticCurveTo(o.x + o.width/2, o.y + 2 + i*6, o.x + o.width - 15, o.y + 8 + i*6); ctx.stroke();
      }

      // Спил (светлый круг)
      ctx.fillStyle = "#7a5c40"; ctx.beginPath(); ctx.ellipse(o.x + o.width - r, o.y + r, 4, r - 2, 0, 0, Math.PI * 2); ctx.fill();

    } else if (o.type === "drone") {
      // Sci-fi дрон
      const x = o.x, y = o.y, hover = Math.sin(worldDistance * 0.15) * 4;
      
      // Сканирующий лазер (красный конус)
      ctx.globalCompositeOperation = "lighter";
      const laserGrad = ctx.createLinearGradient(x + 30, y + 15 + hover, x + 30, GROUND);
      laserGrad.addColorStop(0, "rgba(255, 0, 0, 0.4)");
      laserGrad.addColorStop(1, "rgba(255, 0, 0, 0)");
      ctx.fillStyle = laserGrad;
      ctx.beginPath(); ctx.moveTo(x + 30, y + 15 + hover); ctx.lineTo(x - 20, GROUND); ctx.lineTo(x + 80, GROUND); ctx.fill();
      ctx.globalCompositeOperation = "source-over";

      // Шасси
      ctx.strokeStyle = "#333"; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(x + 10, y + hover); ctx.lineTo(x + 10, y - 5 + hover);
      ctx.moveTo(x + 50, y + hover); ctx.lineTo(x + 50, y - 5 + hover); ctx.stroke();

      // Роторы (размытие)
      const spin = Math.sin(worldDistance) * 12;
      ctx.strokeStyle = "rgba(150, 200, 255, 0.5)"; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(x + 10 - spin, y - 5 + hover); ctx.lineTo(x + 10 + spin, y - 5 + hover);
      ctx.moveTo(x + 50 - spin, y - 5 + hover); ctx.lineTo(x + 50 + spin, y - 5 + hover); ctx.stroke();

      // Корпус
      ctx.fillStyle = "#1a202c"; ctx.beginPath(); ctx.ellipse(x + 30, y + 10 + hover, 24, 10, 0, 0, Math.PI * 2); ctx.fill();
      
      // Неоновый "глаз" дрона
      ctx.fillStyle = "#ff0033"; ctx.shadowColor = "#ff0000"; ctx.shadowBlur = 15;
      ctx.beginPath(); ctx.arc(x + 30, y + 12 + hover, 4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;

    } else if (o.type === "spikes") {
      // 3D Металлические шипы
      const count = 4, w = o.width / count;
      for (let i = 0; i < count; i++) {
        const sx = o.x + i * w;
        // Левая светлая грань
        ctx.fillStyle = "#9ba4b5"; ctx.beginPath(); ctx.moveTo(sx, GROUND); ctx.lineTo(sx + w/2, o.y); ctx.lineTo(sx + w/2, GROUND); ctx.fill();
        // Правая темная грань
        ctx.fillStyle = "#4a5363"; ctx.beginPath(); ctx.moveTo(sx + w/2, o.y); ctx.lineTo(sx + w, GROUND); ctx.lineTo(sx + w/2, GROUND); ctx.fill();
        // Кровь/Ржавчина на кончике
        ctx.fillStyle = "#8b0000"; ctx.beginPath(); ctx.moveTo(sx + w/2, o.y); ctx.lineTo(sx + w/2 - 2, o.y + 6); ctx.lineTo(sx + w/2 + 2, o.y + 8); ctx.fill();
      }
      ctx.fillStyle = "#111"; ctx.fillRect(o.x, GROUND - 4, o.width, 4); // База

    } else if (o.type === "stump") {
      // Пень с корнями
      ctx.fillStyle = "#2c1e16"; ctx.fillRect(o.x + 5, o.y + 8, o.width - 10, o.height - 8);
      // Корни
      ctx.beginPath(); ctx.moveTo(o.x + 5, GROUND - 10); ctx.lineTo(o.x - 5, GROUND); ctx.lineTo(o.x + 10, GROUND); ctx.fill();
      ctx.beginPath(); ctx.moveTo(o.x + o.width - 5, GROUND - 10); ctx.lineTo(o.x + o.width + 5, GROUND); ctx.lineTo(o.x + o.width - 10, GROUND); ctx.fill();
      // Спил
      ctx.fillStyle = "#6b4931"; ctx.beginPath(); ctx.ellipse(o.x + o.width / 2, o.y + 8, o.width / 2, 8, 0, 0, Math.PI * 2); ctx.fill();
      // Трещина
      ctx.strokeStyle = "#1a0f08"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(o.x + o.width/2, o.y + 8); ctx.lineTo(o.x + o.width/2 + 10, o.y + 12); ctx.stroke();
    }
    ctx.restore();
  }
}

// ===============================
// ЧАСТИЦЫ И ПОСТ-ОБРАБОТКА
// ===============================

function drawParticles() {
  for (const p of dustParticles) {
    ctx.fillStyle = p.color + (p.life / p.maxLife) * 0.8 + ")";
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2); ctx.fill();
  }
  for (const p of particles) {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    // Осколки вращаются (случайный квадрат)
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawPostEffects() {
  const vigGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.85);
  vigGrad.addColorStop(0, "rgba(0,0,0,0)");
  vigGrad.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = vigGrad; ctx.fillRect(0, 0, W, H);

  if (deathFlash > 0) {
    ctx.fillStyle = `rgba(255, 0, 0, ${deathFlash * 1.5})`; ctx.fillRect(0, 0, W, H);
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
}

// ===============================
// ОСНОВНОЙ ЦИКЛ РЕНДЕРА
// ===============================

function render() {
  ctx.save();
  if (screenShake > 0) {
    ctx.translate((Math.random() - 0.5) * screenShake * 20, (Math.random() - 0.5) * screenShake * 20);
  }

  drawBackground();
  drawParticles();
  drawPlayer();
  drawObstacles();

  ctx.restore();
  drawPostEffects();
}

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000 || 0, 0.033);
  lastTime = timestamp;

  if (running) update(dt);
  else {
    if (screenShake > 0) screenShake -= dt;
    if (deathFlash > 0) deathFlash -= dt;
    updateParticles(dt);
  }

  render();
  requestAnimationFrame(loop);
}

// ===============================
// УПРАВЛЕНИЕ
// ===============================

document.addEventListener("keydown", e => {
  if (!["Space", "ArrowUp", "ArrowDown"].includes(e.code)) return;
  e.preventDefault();
  if (!running && !isDead) { startGame(); return; } // Можно запустить, только если анимация смерти закончилась или игра не начата
  if (e.code === "ArrowDown") slide();
  else if (!e.repeat) jump();
});

document.addEventListener("keyup", e => {
  if (e.code === "ArrowDown") { e.preventDefault(); stopSlide(); }
});
window.addEventListener("blur", stopSlide);

jumpButton.addEventListener("pointerdown", e => { e.preventDefault(); jump(); });
slideButton.addEventListener("pointerdown", e => { e.preventDefault(); slide(); slideButton.setPointerCapture(e.pointerId); });
slideButton.addEventListener("pointerup", stopSlide);
slideButton.addEventListener("pointercancel", stopSlide);
slideButton.addEventListener("lostpointercapture", stopSlide);

startButton.addEventListener("click", startGame);
requestAnimationFrame(loop);
