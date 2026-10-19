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
let isDead = false;
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

for (let i = 0; i < 80; i++) {
  stars.push({
    x: Math.random() * W,
    y: Math.random() * (GROUND - 100),
    size: Math.random() * 2 + 0.5,
    twinkleSpeed: Math.random() * 3 + 1,
    twinkleOffset: Math.random() * Math.PI * 2,
    brightness: Math.random() * 0.5 + 0.5
  });
}

const cityLayers = [
  { speed: 0.05, colors: ["#2b3543", "#0b101a"], data: [], totalW: 0 },
  { speed: 0.15, colors: ["#1e2532", "#05080f"], data: [], totalW: 0 },
  { speed: 0.45, colors: ["#12161f", "#000000"], data: [], totalW: 0 }
];

cityLayers.forEach((layer, index) => {
  let x = 0;
  while (x < 2000) {
    let w = 40 + Math.random() * 80;
    let h = 80 + Math.random() * (80 + index * 60);
    let hasWindows = index > 0 && Math.random() > 0.3;
    let hasAntenna = Math.random() > 0.6;
    let windowSeed = Math.random();
    layer.data.push({ x, w, h, hasWindows, hasAntenna, windowSeed });
    x += w + (Math.random() * 5);
  }
  layer.totalW = x;
});

function spawnDust(x, y, count) {
  for (let i = 0; i < count; i++) {
    dustParticles.push({
      x: x + Math.random() * 15 - 7,
      y: y + Math.random() * 5,
      vx: -speed * 0.4 + (Math.random() - 0.5) * 40,
      vy: -Math.random() * 20 - 10,
      life: 0.3 + Math.random() * 0.4,
      maxLife: 0.3 + Math.random() * 0.4,
      size: 2 + Math.random() * 4,
      color: "rgba(120, 130, 140, "
    });
  }
}

function spawnSparks(x, y) {
  dustParticles.push({
    x: x + Math.random() * 5 - 2,
    y: y,
    vx: -speed * 0.5 + Math.random() * 100,
    vy: -Math.random() * 50 - 10,
    life: 0.15 + Math.random() * 0.2,
    maxLife: 0.15 + Math.random() * 0.2,
    size: 1.5 + Math.random() * 3,
    color: "rgba(255, 200, 50, "
  });
}

function spawnDeathParticles(x, y) {
  for (let i = 0; i < 50; i++) {
    const angle = Math.random() * Math.PI * 2;
    const force = 100 + Math.random() * 300;
    particles.push({
      x: x, y: y - 20,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force - 100,
      life: 0.5 + Math.random() * 1,
      maxLife: 0.5 + Math.random() * 1,
      size: 3 + Math.random() * 8,
      color: ["#ffffff", "#bbbbbb", "#333333", "#000000", "#111111"][Math.floor(Math.random() * 5)],
      gravity: true
    });
  }
}

function updateParticles(dt) {
  for (let i = dustParticles.length - 1; i >= 0; i--) {
    const p = dustParticles[i];
    p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0) dustParticles.splice(i, 1);
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.gravity) p.vy += 600 * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ===============================
// ИГРОК И ЛОГИКА
// ===============================

const player = {
  x: 100,
  y: GROUND - 60,
  width: 30,
  height: 60,
  velocityY: 0,
  grounded: true,
  sliding: false
};

function jump() { if (!running || isDead) return; jumpBuffer = 0.15; }
function slide() { if (!running || isDead) return; slideHeld = true; }
function stopSlide() { slideHeld = false; player.sliding = false; }

function startGame() {
  running = true; isDead = false; score = 0; speed = 250;
  obstacles = []; spawnDistance = 450; worldDistance = 0;
  jumpBuffer = 0; slideHeld = false; particles = []; dustParticles = [];
  screenShake = 0; deathFlash = 0;
  
  player.y = GROUND - player.height;
  player.velocityY = 0; player.grounded = true; player.sliding = false;
  scoreElement.textContent = "00000";
  overlay.classList.add("hidden");
}

function gameOver() {
  running = false; isDead = true; screenShake = 0.5; deathFlash = 0.4;
  spawnDeathParticles(player.x + 15, player.y + 30);
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
// ОБНОВЛЕНИЕ
// ===============================

function spawnObstacle() {
  const types = ["rock", "log", "drone", "spikes", "stump"];
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
  if (isDead) return;

  score += dt * 12;
  speed = Math.min(480, 250 + score * 0.45);
  const movement = speed * dt;
  worldDistance += movement;
  scoreElement.textContent = String(Math.floor(score)).padStart(5, "0");

  if (jumpBuffer > 0) {
    jumpBuffer -= dt;
    if (player.grounded) {
      player.velocityY = JUMP_FORCE;
      player.grounded = false; jumpBuffer = 0;
      spawnDust(player.x + 15, GROUND, 8);
    }
  }

  player.velocityY += GRAVITY * dt;
  player.y += player.velocityY * dt;

  if (player.y >= GROUND - player.height) {
    if (!player.grounded && player.velocityY > 200) spawnDust(player.x + 15, GROUND, 6);
    player.y = GROUND - player.height;
    player.velocityY = 0; player.grounded = true;
  }

  player.sliding = slideHeld && player.grounded;
  
  if (player.sliding) {
    if (Math.random() < 0.7) spawnSparks(player.x + 50, GROUND - 2);
  } else if (player.grounded && Math.random() < 0.3) {
    spawnDust(player.x + 10, GROUND, 1);
  }

  spawnDistance -= movement;
  if (spawnDistance <= 0) {
    spawnObstacle();
    spawnDistance = 350 + Math.random() * 250;
  }

  for (const o of obstacles) {
    o.x -= movement;
    const px = player.x + 5;
    const pw = player.sliding ? 45 : 20;
    const py = player.sliding ? GROUND - 20 : player.y + 5;
    const ph = player.sliding ? 18 : player.height - 10;
    const margin = 6;

    const horizontalCollision = px < o.x + o.width - margin && px + pw > o.x + margin;

    if (o.type === "drone") {
      if (horizontalCollision && !player.sliding) { gameOver(); return; }
    } else {
      const verticalCollision = py < o.y + o.height - margin && py + ph > o.y + margin;
      if (horizontalCollision && verticalCollision) { gameOver(); return; }
    }
  }

  obstacles = obstacles.filter(o => o.x + o.width > 0);
}

// ===============================
// РЕНДЕР ФОНА (УЛУЧШЕННЫЙ ГОРОД)
// ===============================

function mixColor(a, b, t) {
  const c1 = a.match(/\w\w/g).map(x => parseInt(x, 16));
  const c2 = b.match(/\w\w/g).map(x => parseInt(x, 16));
  const c = c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function getDaylight() { return (Math.cos((worldDistance / 12000) % 1 * Math.PI * 2) + 1) / 2; }

function drawBackground() {
  const cycle = (worldDistance / 12000) % 1;
  const daylight = getDaylight();

  const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND);
  skyGrad.addColorStop(0, mixColor("#080c16", "#4a6a82", daylight));
  skyGrad.addColorStop(1, mixColor("#1c2533", "#80a8b8", daylight));
  ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, GROUND);

  if (daylight < 0.7) {
    const starAlpha = Math.max(0, 1 - daylight / 0.7);
    for (const s of stars) {
      const twinkle = (Math.sin(worldDistance * 0.01 * s.twinkleSpeed + s.twinkleOffset) + 1) / 2;
      ctx.fillStyle = `rgba(255, 255, 240, ${starAlpha * s.brightness * (0.4 + twinkle * 0.6)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
    }
  }

  const orbX = 90 + cycle * 720, orbY = 95 - Math.sin(cycle * Math.PI) * 50;
  ctx.fillStyle = mixColor("#e6ebff", "#ffdd66", daylight);
  ctx.shadowColor = mixColor("#90a0ff", "#ffcc40", daylight);
  ctx.shadowBlur = 40; ctx.beginPath(); ctx.arc(orbX, orbY, 22, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;

  cityLayers.forEach((layer, idx) => {
    const offset = (worldDistance * layer.speed) % layer.totalW;
    const color = mixColor(layer.colors[1], layer.colors[0], daylight);
    
    for (let i = 0; i < 2; i++) {
      ctx.save(); ctx.translate(-offset + (i * layer.totalW), 0);
      layer.data.forEach(b => {
        // Здание с градиентом для объёма
        const bGrad = ctx.createLinearGradient(b.x, GROUND - b.h, b.x, GROUND);
        bGrad.addColorStop(0, color);
        bGrad.addColorStop(1, mixColor("#000", color, 0.5));
        ctx.fillStyle = bGrad;
        ctx.fillRect(b.x, GROUND - b.h, b.w, b.h);

        // Обводка/ребро здания
        ctx.strokeStyle = "rgba(255,255,255,0.03)"; ctx.lineWidth = 1;
        ctx.strokeRect(b.x, GROUND - b.h, b.w, b.h);

        if (b.hasAntenna) {
          ctx.fillStyle = color;
          ctx.fillRect(b.x + b.w * 0.2, GROUND - b.h - 15, 2, 15);
          if (b.windowSeed > 0.5) {
             ctx.fillStyle = daylight < 0.4 ? "#ff3333" : color; // Красный маячок ночью
             ctx.fillRect(b.x + b.w * 0.2, GROUND - b.h - 17, 2, 2);
          }
        }

        if (b.hasWindows && daylight < 0.4) {
          ctx.fillStyle = `rgba(255, 230, 120, ${1 - daylight / 0.4})`;
          for (let wy = GROUND - b.h + 10; wy < GROUND - 10; wy += 20) {
            for (let wx = b.x + 6; wx < b.x + b.w - 10; wx += 12) {
              if ((wx + wy * b.windowSeed) % 3 > 1.5) ctx.fillRect(wx, wy, 5, 8);
            }
          }
        }
      });
      ctx.restore();
    }
  });

  const groundGrad = ctx.createLinearGradient(0, GROUND, 0, H);
  groundGrad.addColorStop(0, mixColor("#15181e", "#2b3036", daylight));
  groundGrad.addColorStop(1, mixColor("#080a0c", "#121418", daylight));
  ctx.fillStyle = groundGrad; ctx.fillRect(0, GROUND, W, H - GROUND);

  ctx.strokeStyle = mixColor("#252d3a", "#455667", daylight);
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND); ctx.stroke();

  const roadTex = -(worldDistance * 1.2) % 60;
  ctx.fillStyle = mixColor("rgba(255,255,255,0.04)", "rgba(255,255,255,0.15)", daylight);
  for (let i = -1; i < W / 60 + 2; i++) ctx.fillRect(roadTex + i * 60, GROUND + 15, 30, 3);
}

// ===============================
// ПЕРСОНАЖ (ПРАВИЛЬНАЯ АНАТОМИЯ)
// ===============================

function drawPlayer() {
  if (isDead) return;

  const x = player.x;
  const y = player.y;
  ctx.save();

  // Тень под ногами
  ctx.fillStyle = `rgba(0, 0, 0, ${player.grounded ? 0.6 : 0.2})`;
  ctx.beginPath(); ctx.ellipse(x + 15, GROUND + 2, player.sliding ? 25 : 14, 3, 0, 0, Math.PI * 2); ctx.fill();

  // Легкое лунное свечение вокруг персонажа (вместо уродливого квадрата)
  ctx.shadowColor = "rgba(180, 220, 255, 0.4)";
  ctx.shadowBlur = 15;

  if (player.sliding) {
    // --- ПРАВИЛЬНЫЙ ПОДКАТ (Опирается рукой на асфальт) ---
    const cx = x + 10; 
    const cy = GROUND - 12;

    // Задняя нога (подогнута под себя)
    ctx.strokeStyle = "#080808"; ctx.lineWidth = 8; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(cx + 5, cy); ctx.lineTo(cx - 8, GROUND - 4); ctx.stroke();
    
    // Задняя рука (убрана за спину)
    ctx.strokeStyle = "#0d0d0d"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(cx + 10, cy - 8); ctx.lineTo(cx - 5, cy - 15); ctx.stroke();

    // Тело (Худи) - Наклонное горизонтально
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.roundRect(cx, cy - 14, 28, 16, 6); ctx.fill();

    // Лого NP
    ctx.save(); ctx.translate(cx + 8, cy - 6); ctx.rotate(-0.1);
    ctx.fillStyle = "#fff"; ctx.font = "bold 11px 'Courier New', monospace"; ctx.fillText("NP", 0, 0); ctx.restore();

    // Капюшон (Смотрит вперед)
    ctx.fillStyle = "#161616"; ctx.beginPath(); ctx.arc(cx + 28, cy - 6, 14, 0, Math.PI * 2); ctx.fill();
    
    // Огромная жуткая улыбка в капюшоне
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(cx + 31, cy - 5, 12, 0, Math.PI * 2); ctx.fill(); // Черный фон
    
    ctx.shadowBlur = 0; // Отключаем свечение для четкости лица
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(cx + 29, cy - 9, 2.5, 0, Math.PI * 2); ctx.fill(); // Глаз 1
    ctx.beginPath(); ctx.arc(cx + 36, cy - 8, 2.5, 0, Math.PI * 2); ctx.fill(); // Глаз 2
    
    // Зубы (Широкий оскал)
    ctx.beginPath();
    ctx.moveTo(cx + 22, cy - 2); 
    ctx.lineTo(cx + 24, cy); ctx.lineTo(cx + 26, cy - 2);
    ctx.lineTo(cx + 28, cy + 1); ctx.lineTo(cx + 30, cy - 2);
    ctx.lineTo(cx + 32, cy + 1); ctx.lineTo(cx + 34, cy - 2);
    ctx.lineTo(cx + 36, cy + 1); ctx.lineTo(cx + 38, cy - 2);
    ctx.lineTo(cx + 40, cy); ctx.lineTo(cx + 41, cy - 4);
    ctx.quadraticCurveTo(cx + 31, cy + 6, cx + 22, cy - 2); // Нижняя дуга челюсти
    ctx.fill();
    ctx.shadowBlur = 15; // Возвращаем ауру

    // Передняя нога (Вытянута далеко вперед)
    ctx.strokeStyle = "#151515"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(cx + 25, cy + 2); ctx.lineTo(cx + 45, GROUND - 5); ctx.stroke();
    ctx.fillStyle = "#050505"; ctx.beginPath(); ctx.ellipse(cx + 48, GROUND - 4, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();

    // Передняя рука (ОПИРАЕТСЯ В ЗЕМЛЮ ПЕРЕД СОБОЙ)
    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(cx + 20, cy - 6); ctx.lineTo(cx + 40, GROUND - 2); ctx.stroke();
    // Кулак (генерирует искры)
    ctx.fillStyle = "#dcdcdc"; ctx.beginPath(); ctx.arc(cx + 40, GROUND - 2, 3.5, 0, Math.PI * 2); ctx.fill();

  } else {
    // --- ПРАВИЛЬНЫЙ БЕГ ---
    const runCycle = worldDistance / 16;
    const legSwing = player.grounded ? Math.sin(runCycle) * 14 : 0;
    const armSwing = player.grounded ? Math.cos(runCycle) * 14 : 6;
    const bobY = player.grounded ? Math.abs(Math.sin(runCycle * 2)) * 3 : 0;

    const cx = x + 15;
    const shoulderY = y + 20 + bobY;
    const hipY = y + 42 + bobY;

    // Задняя рука
    ctx.strokeStyle = "#080808"; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(cx, shoulderY); ctx.lineTo(cx + armSwing, shoulderY + 10); ctx.lineTo(cx + armSwing + 6, shoulderY + 2); ctx.stroke();
    ctx.fillStyle = "#a9a9a9"; ctx.beginPath(); ctx.arc(cx + armSwing + 6, shoulderY + 2, 3, 0, Math.PI * 2); ctx.fill();

    // Задняя нога
    ctx.strokeStyle = "#080808"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(cx - legSwing, GROUND - 4); ctx.stroke();
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.ellipse(cx - legSwing + 2, GROUND - 3, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();

    // Тело (Худи - закругленный прямоугольник, расширяющийся к плечам)
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.moveTo(cx - 10, hipY); ctx.lineTo(cx + 10, hipY); // Низ
    ctx.lineTo(cx + 14, shoulderY - 4); ctx.lineTo(cx - 14, shoulderY - 4); // Плечи
    ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 14px 'Courier New', monospace"; ctx.fillText("NP", cx - 8, hipY - 6);

    // Передняя нога
    ctx.strokeStyle = "#151515"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(cx, hipY); ctx.lineTo(cx + legSwing, GROUND - 4); ctx.stroke();
    ctx.fillStyle = "#050505"; ctx.beginPath(); ctx.ellipse(cx + legSwing + 2, GROUND - 3, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();

    // Капюшон (Голова)
    ctx.fillStyle = "#161616"; ctx.beginPath(); ctx.arc(cx, shoulderY - 8, 16, 0, Math.PI * 2); ctx.fill();
    
    // Огромная жуткая улыбка
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(cx + 1, shoulderY - 7, 13, 0, Math.PI * 2); ctx.fill(); // Черный фон лица
    
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(cx - 4, shoulderY - 11, 2.5, 0, Math.PI * 2); ctx.fill(); // Глаз 1
    ctx.beginPath(); ctx.arc(cx + 5, shoulderY - 11, 2.5, 0, Math.PI * 2); ctx.fill(); // Глаз 2
    
    // Зубы
    ctx.beginPath();
    ctx.moveTo(cx - 9, shoulderY - 3); 
    ctx.lineTo(cx - 6, shoulderY + 1); ctx.lineTo(cx - 4, shoulderY - 2);
    ctx.lineTo(cx - 1, shoulderY + 2); ctx.lineTo(cx + 1, shoulderY - 2);
    ctx.lineTo(cx + 4, shoulderY + 2); ctx.lineTo(cx + 6, shoulderY - 2);
    ctx.lineTo(cx + 9, shoulderY + 1); ctx.lineTo(cx + 11, shoulderY - 4);
    ctx.quadraticCurveTo(cx, shoulderY + 6, cx - 9, shoulderY - 3); // Нижняя челюсть
    ctx.fill();
    ctx.shadowBlur = 15;

    // Передняя рука
    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(cx, shoulderY); ctx.lineTo(cx - armSwing, shoulderY + 10); ctx.lineTo(cx - armSwing + 10, shoulderY + 2); ctx.stroke();
    ctx.fillStyle = "#dcdcdc"; ctx.beginPath(); ctx.arc(cx - armSwing + 10, shoulderY + 2, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// ===============================
// ПРЕПЯТСТВИЯ
// ===============================

function drawObstacles() {
  for (const o of obstacles) {
    ctx.save();
    
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    if (o.type !== "drone") {
      ctx.beginPath(); ctx.ellipse(o.x + o.width / 2, GROUND + 2, o.width * 0.4, 4, 0, 0, Math.PI * 2); ctx.fill();
    }

    if (o.type === "rock") {
      ctx.fillStyle = "#4a4a4a"; ctx.beginPath(); ctx.moveTo(o.x, GROUND); ctx.lineTo(o.x + 10, o.y + 10); ctx.lineTo(o.x + 20, o.y); ctx.lineTo(o.x + 35, o.y + 8); ctx.lineTo(o.x + o.width, GROUND); ctx.fill();
      ctx.fillStyle = "#5a5a5a"; ctx.beginPath(); ctx.moveTo(o.x + 20, o.y); ctx.lineTo(o.x + 30, o.y + 15); ctx.lineTo(o.x + 12, GROUND); ctx.fill();
      ctx.fillStyle = "#2c3325"; ctx.beginPath(); ctx.moveTo(o.x, GROUND); ctx.lineTo(o.x + 12, GROUND - 6); ctx.lineTo(o.x + o.width, GROUND); ctx.fill();
    } else if (o.type === "log") {
      ctx.fillStyle = "#3b2b20"; const r = o.height / 2; ctx.beginPath(); ctx.moveTo(o.x + r, o.y); ctx.lineTo(o.x + o.width - r, o.y); ctx.arc(o.x + o.width - r, o.y + r, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(o.x + r, o.y + o.height); ctx.arc(o.x + r, o.y + r, r, Math.PI / 2, -Math.PI / 2); ctx.fill();
      ctx.strokeStyle = "#150d08"; ctx.lineWidth = 2; for(let i=0; i<3; i++) { ctx.beginPath(); ctx.moveTo(o.x + 15, o.y + 5 + i*7); ctx.quadraticCurveTo(o.x + o.width/2, o.y + i*7, o.x + o.width - 15, o.y + 7 + i*7); ctx.stroke(); }
      ctx.fillStyle = "#7a5c40"; ctx.beginPath(); ctx.ellipse(o.x + o.width - r, o.y + r, 4, r - 2, 0, 0, Math.PI * 2); ctx.fill();
    } else if (o.type === "drone") {
      const x = o.x, y = o.y, hover = Math.sin(worldDistance * 0.15) * 4;
      ctx.globalCompositeOperation = "lighter"; const laserGrad = ctx.createLinearGradient(x + 30, y + 15 + hover, x + 30, GROUND); laserGrad.addColorStop(0, "rgba(255, 0, 0, 0.4)"); laserGrad.addColorStop(1, "rgba(255, 0, 0, 0)"); ctx.fillStyle = laserGrad; ctx.beginPath(); ctx.moveTo(x + 30, y + 15 + hover); ctx.lineTo(x - 15, GROUND); ctx.lineTo(x + 75, GROUND); ctx.fill(); ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "#333"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 15, y + hover); ctx.lineTo(x + 15, y - 5 + hover); ctx.moveTo(x + 45, y + hover); ctx.lineTo(x + 45, y - 5 + hover); ctx.stroke();
      const spin = Math.sin(worldDistance) * 12; ctx.strokeStyle = "rgba(150, 200, 255, 0.6)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 15 - spin, y - 5 + hover); ctx.lineTo(x + 15 + spin, y - 5 + hover); ctx.moveTo(x + 45 - spin, y - 5 + hover); ctx.lineTo(x + 45 + spin, y - 5 + hover); ctx.stroke();
      ctx.fillStyle = "#161b22"; ctx.beginPath(); ctx.ellipse(x + 30, y + 10 + hover, 26, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff0033"; ctx.shadowColor = "#ff0000"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(x + 30, y + 12 + hover, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    } else if (o.type === "spikes") {
      const count = 4, w = o.width / count;
      for (let i = 0; i < count; i++) {
        const sx = o.x + i * w;
        ctx.fillStyle = "#9ba4b5"; ctx.beginPath(); ctx.moveTo(sx, GROUND); ctx.lineTo(sx + w/2, o.y); ctx.lineTo(sx + w/2, GROUND); ctx.fill();
        ctx.fillStyle = "#4a5363"; ctx.beginPath(); ctx.moveTo(sx + w/2, o.y); ctx.lineTo(sx + w, GROUND); ctx.lineTo(sx + w/2, GROUND); ctx.fill();
        ctx.fillStyle = "#8b0000"; ctx.beginPath(); ctx.moveTo(sx + w/2, o.y); ctx.lineTo(sx + w/2 - 2, o.y + 6); ctx.lineTo(sx + w/2 + 2, o.y + 8); ctx.fill();
      }
      ctx.fillStyle = "#111"; ctx.fillRect(o.x, GROUND - 4, o.width, 4);
    } else if (o.type === "stump") {
      ctx.fillStyle = "#2c1e16"; ctx.fillRect(o.x + 5, o.y + 8, o.width - 10, o.height - 8);
      ctx.beginPath(); ctx.moveTo(o.x + 5, GROUND - 10); ctx.lineTo(o.x - 5, GROUND); ctx.lineTo(o.x + 10, GROUND); ctx.fill();
      ctx.beginPath(); ctx.moveTo(o.x + o.width - 5, GROUND - 10); ctx.lineTo(o.x + o.width + 5, GROUND); ctx.lineTo(o.x + o.width - 10, GROUND); ctx.fill();
      ctx.fillStyle = "#6b4931"; ctx.beginPath(); ctx.ellipse(o.x + o.width / 2, o.y + 8, o.width / 2, 8, 0, 0, Math.PI * 2); ctx.fill();
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
    ctx.globalAlpha = p.life / p.maxLife; ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawPostEffects() {
  const vigGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.9);
  vigGrad.addColorStop(0, "rgba(0,0,0,0)"); vigGrad.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = vigGrad; ctx.fillRect(0, 0, W, H);

  if (deathFlash > 0) { ctx.fillStyle = `rgba(255, 0, 0, ${deathFlash * 1.8})`; ctx.fillRect(0, 0, W, H); }

  ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
}

// ===============================
// ОСНОВНОЙ ЦИКЛ РЕНДЕРА
// ===============================

function render() {
  ctx.save();
  if (screenShake > 0) ctx.translate((Math.random() - 0.5) * screenShake * 20, (Math.random() - 0.5) * screenShake * 20);

  drawBackground(); drawParticles(); drawPlayer(); drawObstacles();

  ctx.restore(); drawPostEffects();
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

  render(); requestAnimationFrame(loop);
}

// ===============================
// УПРАВЛЕНИЕ
// ===============================

document.addEventListener("keydown", e => {
  if (!["Space", "ArrowUp", "ArrowDown"].includes(e.code)) return;
  e.preventDefault();
  if (!running && !isDead) { startGame(); return; }
  if (e.code === "ArrowDown") slide();
  else if (!e.repeat) jump();
});

document.addEventListener("keyup", e => { if (e.code === "ArrowDown") { e.preventDefault(); stopSlide(); } });
window.addEventListener("blur", stopSlide);

jumpButton.addEventListener("pointerdown", e => { e.preventDefault(); jump(); });
slideButton.addEventListener("pointerdown", e => { e.preventDefault(); slide(); slideButton.setPointerCapture(e.pointerId); });
slideButton.addEventListener("pointerup", stopSlide); slideButton.addEventListener("pointercancel", stopSlide); slideButton.addEventListener("lostpointercapture", stopSlide);

startButton.addEventListener("click", startGame);
requestAnimationFrame(loop);
