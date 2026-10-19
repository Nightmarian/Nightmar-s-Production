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
// СИСТЕМЫ ЧАСТИЦ И ЭФФЕКТОВ
// ===============================

let particles = [];
let dustParticles = [];
let stars = [];
let screenShake = 0;
let deathFlash = 0;
let trailPositions = [];

// Генерация звёзд
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

// ===============================
// ГЕНЕРАЦИЯ ГОРОДА
// ===============================

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

// Искры для руки при подкате
function spawnSparks(x, y) {
  dustParticles.push({
    x: x + Math.random() * 5,
    y: y,
    vx: -speed * 0.5 + Math.random() * 50,
    vy: -Math.random() * 40 - 10,
    life: 0.15 + Math.random() * 0.15,
    maxLife: 0.15 + Math.random() * 0.15,
    size: 1.5 + Math.random() * 2,
    color: "rgba(255, 200, 100, " // Желтые искры
  });
}

function spawnDeathParticles(x, y) {
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const force = 50 + Math.random() * 250;
    particles.push({
      x: x, y: y,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force - 100,
      life: 0.6 + Math.random() * 0.8,
      maxLife: 0.6 + Math.random() * 0.8,
      size: 3 + Math.random() * 6,
      color: ["#ffffff", "#aaaaaa", "#333333", "#000000", "#111111"][Math.floor(Math.random() * 5)],
      gravity: true
    });
  }
}

function spawnJumpParticles(x, y) {
  for (let i = 0; i < 8; i++) {
    spawnDust(x + Math.random() * 20, y, 1);
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
// ИГРОК
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
  if (!running) return;
  jumpBuffer = 0.15;
}

function slide() {
  if (!running) return;
  slideHeld = true;
}

function stopSlide() {
  slideHeld = false;
  player.sliding = false;
}

// ===============================
// ИГРОВОЙ ПРОЦЕСС
// ===============================

function startGame() {
  running = true;
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
  screenShake = 0.4;
  deathFlash = 0.3;
  spawnDeathParticles(player.x + 18, player.y + 30);

  const result = Math.floor(score);
  if (result > best) {
    best = result;
    localStorage.setItem("nightmarRunnerBest", best);
    bestElement.textContent = String(best).padStart(5, "0");
  }

  overlayTitle.textContent = "SIGNAL LOST";
  overlayText.textContent = `SCORE: ${result}`;
  startButton.textContent = "RECONNECT";

  setTimeout(() => overlay.classList.remove("hidden"), 600);
}

// ===============================
// ОБНОВЛЕНИЕ ИГРЫ
// ===============================

function spawnObstacle() {
  const types = ["rock", "log", "drone", "cactus", "spikes", "stump"];
  const type = types[Math.floor(Math.random() * types.length)];
  let width, height, y;

  switch (type) {
    case "rock": width = 42; height = 36; y = GROUND - height; break;
    case "log": width = 72; height = 27; y = GROUND - height; break;
    case "drone": width = 74; height = 38; y = GROUND - 60; break;
    case "cactus": width = 32; height = 55; y = GROUND - height; break;
    case "spikes": width = 85; height = 25; y = GROUND - height; break;
    case "stump": width = 45; height = 42; y = GROUND - height; break;
  }
  obstacles.push({ x: W + 30, y, width, height, type });
}

function update(dt) {
  score += dt * 12;
  speed = Math.min(450, 250 + score * 0.45);
  const movement = speed * dt;
  worldDistance += movement;
  scoreElement.textContent = String(Math.floor(score)).padStart(5, "0");

  if (jumpBuffer > 0) {
    jumpBuffer -= dt;
    if (player.grounded) {
      player.velocityY = JUMP_FORCE;
      player.grounded = false;
      jumpBuffer = 0;
      spawnJumpParticles(player.x, GROUND);
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
    // Искры от руки при скольжении
    if (Math.random() < 0.6) spawnSparks(player.x + 35, GROUND - 2);
  } else if (player.grounded && Math.random() < 0.3) {
    spawnDust(player.x + 10, GROUND, 1);
  }

  // Мрачный след за персонажем
  trailPositions.unshift({ x: player.x, y: player.y, sliding: player.sliding, time: 0.1 });
  if (trailPositions.length > 5) trailPositions.pop();
  for (let i = trailPositions.length - 1; i >= 0; i--) {
    trailPositions[i].time -= dt;
    if (trailPositions[i].time <= 0) trailPositions.splice(i, 1);
  }

  spawnDistance -= movement;
  if (spawnDistance <= 0) {
    spawnObstacle();
    spawnDistance = 390 + Math.random() * 200;
  }

  for (const o of obstacles) {
    o.x -= movement;
    const px = player.x + 6;
    const pw = player.sliding ? 48 : 24;
    const py = player.sliding ? GROUND - 24 : player.y + 5;
    const ph = player.sliding ? 20 : player.height - 10;
    const margin = 5;

    const horizontalCollision = px < o.x + o.width - margin && px + pw > o.x + margin;

    if (o.type === "drone") {
      if (horizontalCollision && !player.sliding) { gameOver(); return; }
    } else {
      const verticalCollision = py < o.y + o.height - margin && py + ph > o.y + margin;
      if (horizontalCollision && verticalCollision) { gameOver(); return; }
    }
  }

  obstacles = obstacles.filter(o => o.x + o.width > 0);
  if (screenShake > 0) screenShake -= dt;
  if (deathFlash > 0) deathFlash -= dt;

  updateParticles(dt);
}

// ===============================
// РЕНДЕР ФОНА (ГОРОД)
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
  skyGrad.addColorStop(0, mixColor("#0a0f1c", "#5a7a92", daylight));
  skyGrad.addColorStop(1, mixColor("#1c2536", "#a0b8c8", daylight));
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, GROUND);

  if (daylight < 0.7) {
    const starAlpha = Math.max(0, 1 - daylight / 0.7);
    for (const s of stars) {
      const twinkle = (Math.sin(worldDistance * 0.01 * s.twinkleSpeed + s.twinkleOffset) + 1) / 2;
      ctx.fillStyle = `rgba(255, 255, 240, ${starAlpha * s.brightness * (0.4 + twinkle * 0.6)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * (0.7 + twinkle * 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const orbX = 90 + cycle * 720;
  const orbY = 95 - Math.sin(cycle * Math.PI) * 50;
  const orbGrad = ctx.createRadialGradient(orbX - 5, orbY - 5, 2, orbX, orbY, 24);
  orbGrad.addColorStop(0, mixColor("#f0f4ff", "#fff8c0", daylight));
  orbGrad.addColorStop(1, mixColor("#c0c8e8", "#ffcc40", daylight));
  ctx.shadowColor = mixColor("#a0b0ff", "#ffcc40", daylight);
  ctx.shadowBlur = 30;
  ctx.fillStyle = orbGrad;
  ctx.beginPath();
  ctx.arc(orbX, orbY, 24, 0, Math.PI * 2);
  ctx.fill();
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
          ctx.fillStyle = `rgba(255, 230, 120, ${1 - daylight / 0.4})`;
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
  groundGrad.addColorStop(0, mixColor("#1a1e24", "#30353c", daylight));
  groundGrad.addColorStop(1, mixColor("#0a0c10", "#181b20", daylight));
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, GROUND, W, H - GROUND);

  ctx.strokeStyle = mixColor("#303a45", "#556677", daylight);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  ctx.lineTo(W, GROUND);
  ctx.stroke();

  const roadTex = -(worldDistance * 1.2) % 60;
  ctx.fillStyle = mixColor("rgba(255,255,255,0.05)", "rgba(255,255,255,0.15)", daylight);
  for (let i = -1; i < W / 60 + 2; i++) ctx.fillRect(roadTex + i * 60, GROUND + 15, 30, 4);
}

// ===============================
// ПЕРСОНАЖ (CREEPY HOODIE + GLOW)
// ===============================

function drawPlayerTrail() {
  for (let i = 0; i < trailPositions.length; i++) {
    const t = trailPositions[i];
    const alpha = (t.time / 0.1) * 0.12;
    if (alpha <= 0) continue;
    ctx.fillStyle = `rgba(180, 220, 255, ${alpha})`;
    if (t.sliding) ctx.fillRect(t.x, GROUND - 25, 50, 25);
    else ctx.fillRect(t.x, t.y, 35, 60);
  }
}

function drawPlayer() {
  if (!running && deathFlash > 0) return;

  const x = player.x;
  const y = player.y;

  ctx.save();

  // Тень
  const shadowScale = player.grounded ? 1 : 0.6;
  ctx.fillStyle = `rgba(0, 0, 0, ${player.grounded ? 0.5 : 0.2})`;
  ctx.beginPath();
  ctx.ellipse(x + 18, GROUND + 2, 22 * shadowScale, 4 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  drawPlayerTrail();

  // --- СВЕЧЕНИЕ (АУРА) ДЛЯ КОНТРАСТА ---
  ctx.shadowColor = "rgba(180, 220, 255, 0.7)"; // Ледяное неоновое свечение
  ctx.shadowBlur = 18;

  if (player.sliding) {
    // ДИНАМИЧНЫЙ ПОДКАТ (Откинувшись назад)
    const sx = x + 15;
    const sy = GROUND - 12;

    // Задняя рука (опирается о землю или откинута назад)
    ctx.strokeStyle = "#080808";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sx - 2, sy - 15);
    ctx.lineTo(sx - 15, sy - 5);
    ctx.stroke();

    // Задняя нога (согнута под собой)
    ctx.strokeStyle = "#0d0d0d";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(sx + 5, sy);
    ctx.lineTo(sx - 8, sy + 10);
    ctx.stroke();

    // Тело (Худи, наклонено назад)
    ctx.translate(sx, sy);
    ctx.rotate(Math.PI / 4.5); // Наклон назад
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.roundRect(-10, -25, 24, 30, 6);
    ctx.fill();

    // Лого на груди
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px 'Courier New', monospace";
    ctx.fillText("NP", -5, -5);

    // Капюшон
    ctx.beginPath();
    ctx.arc(2, -26, 14, 0, Math.PI * 2);
    ctx.fill();

    // Лицо во мраке
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(5, -28, 11, 0, Math.PI * 2);
    ctx.fill();

    // Глаза
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(2, -31, 2.5, 0, Math.PI * 2);
    ctx.arc(9, -29, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0; // Отключаем свечение для зубов, чтобы были четкими

    // Зубы
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(-1, -22); ctx.lineTo(1, -19); ctx.lineTo(3, -23);
    ctx.lineTo(5, -20);  ctx.lineTo(7, -24); ctx.lineTo(9, -21);
    ctx.lineTo(11, -25);
    ctx.quadraticCurveTo(5, -16, -1, -22);
    ctx.fill();

    // Возвращаем трансформацию
    ctx.rotate(-Math.PI / 4.5);
    ctx.translate(-sx, -sy);

    // Снова включаем внешнее свечение для передних конечностей
    ctx.shadowColor = "rgba(180, 220, 255, 0.7)";
    ctx.shadowBlur = 18;

    // Передняя нога (вытянута вперед)
    ctx.strokeStyle = "#151515"; // Чуть светлее штанина
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(sx + 5, sy);
    ctx.lineTo(sx + 30, sy + 8); // Вытянута вдоль земли
    ctx.stroke();
    
    // Ботинок
    ctx.fillStyle = "#050505";
    ctx.beginPath();
    ctx.ellipse(sx + 33, sy + 8, 6, 3.5, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Передняя рука (касается земли)
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 15);
    ctx.lineTo(sx + 20, sy + 8);
    ctx.stroke();

    // Кулак (касается асфальта, генерирует искры)
    ctx.fillStyle = "#dcdcdc"; // Бледная кожа
    ctx.beginPath();
    ctx.arc(sx + 20, sy + 9, 3.5, 0, Math.PI * 2);
    ctx.fill();

  } else {
    // БЕГ (ДИНАМИЧНЫЙ)
    const runCycle = worldDistance / 16;
    const legSwing = player.grounded ? Math.sin(runCycle) * 14 : 0;
    const armSwing = player.grounded ? Math.cos(runCycle) * 12 : 5; // Руки двигаются в противовес
    const bobY = player.grounded ? Math.abs(Math.sin(runCycle * 2)) * 3 : 0;

    // Задняя рука (тёмная)
    ctx.strokeStyle = "#0a0a0a";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 22 + bobY); // Плечо
    ctx.lineTo(x + 18 + armSwing, y + 34 + bobY); // Локоть
    ctx.lineTo(x + 18 + armSwing + 8, y + 26 + bobY); // Предплечье
    ctx.stroke();

    // Задняя кисть
    ctx.fillStyle = "#a9a9a9";
    ctx.beginPath();
    ctx.arc(x + 18 + armSwing + 8, y + 26 + bobY, 3, 0, Math.PI * 2);
    ctx.fill();

    // Задняя нога (тёмная)
    ctx.strokeStyle = "#080808";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 43 + bobY);
    ctx.lineTo(x + 18 - legSwing, y + 62);
    ctx.stroke();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(x + 19 - legSwing, y + 63, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Тело (Худи)
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 18 + bobY, 28, 28, 6);
    ctx.fill();

    // Лого "NP"
    ctx.fillStyle = "#fff";
    ctx.font = "bold 15px 'Courier New', monospace";
    ctx.fillText("NP", x + 9, y + 38 + bobY);

    // Передняя нога (светлее)
    ctx.strokeStyle = "#151515";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 43 + bobY);
    ctx.lineTo(x + 18 + legSwing, y + 62);
    ctx.stroke();
    ctx.fillStyle = "#050505";
    ctx.beginPath();
    ctx.ellipse(x + 19 + legSwing, y + 63, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Капюшон
    ctx.fillStyle = "#161616";
    ctx.beginPath();
    ctx.arc(x + 18, y + 14 + bobY, 15, 0, Math.PI * 2);
    ctx.fill();

    // Лицо
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(x + 18, y + 16 + bobY, 12, 0, Math.PI * 2);
    ctx.fill();

    // Светящиеся глаза
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x + 14, y + 13 + bobY, 3, 0, Math.PI * 2);
    ctx.arc(x + 24, y + 13 + bobY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Зубы
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(x + 10, y + 19 + bobY);
    ctx.lineTo(x + 12, y + 24 + bobY); ctx.lineTo(x + 14, y + 20 + bobY);
    ctx.lineTo(x + 17, y + 25 + bobY); ctx.lineTo(x + 19, y + 20 + bobY);
    ctx.lineTo(x + 22, y + 25 + bobY); ctx.lineTo(x + 24, y + 20 + bobY);
    ctx.lineTo(x + 26, y + 24 + bobY); ctx.lineTo(x + 27, y + 19 + bobY);
    ctx.quadraticCurveTo(x + 18, y + 30 + bobY, x + 10, y + 19 + bobY);
    ctx.fill();

    // Возвращаем ауру для передней руки
    ctx.shadowColor = "rgba(180, 220, 255, 0.7)";
    ctx.shadowBlur = 18;

    // Передняя рука (светлее, согнута)
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 22 + bobY); // Плечо
    ctx.lineTo(x + 18 - armSwing, y + 34 + bobY); // Локоть
    ctx.lineTo(x + 18 - armSwing + 10, y + 24 + bobY); // Предплечье
    ctx.stroke();
    ctx.lineCap = "butt";

    // Передняя кисть (кулак)
    ctx.fillStyle = "#dcdcdc"; // Бледная кожа
    ctx.beginPath();
    ctx.arc(x + 18 - armSwing + 10, y + 24 + bobY, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ===============================
// ПРЕПЯТСТВИЯ
// ===============================

function drawObstacles() {
  for (const o of obstacles) {
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    if (o.type !== "drone") {
      ctx.beginPath();
      ctx.ellipse(o.x + o.width / 2, GROUND + 2, o.width * 0.4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (o.type === "rock") {
      const rockGrad = ctx.createLinearGradient(o.x, o.y, o.x + o.width, GROUND);
      rockGrad.addColorStop(0, "#777"); rockGrad.addColorStop(1, "#3a3a3a");
      ctx.fillStyle = rockGrad;
      ctx.beginPath();
      ctx.moveTo(o.x, GROUND); ctx.lineTo(o.x + 5, o.y + 15); ctx.lineTo(o.x + 8, o.y + 8);
      ctx.lineTo(o.x + 20, o.y); ctx.lineTo(o.x + 28, o.y + 3); ctx.lineTo(o.x + 38, o.y + 10);
      ctx.lineTo(o.x + o.width, GROUND); ctx.fill();
    } else if (o.type === "log") {
      const logGrad = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.height);
      logGrad.addColorStop(0, "#5a4536"); logGrad.addColorStop(1, "#2a1f1a");
      ctx.fillStyle = logGrad;
      const r = o.height / 2;
      ctx.beginPath();
      ctx.moveTo(o.x + r, o.y); ctx.lineTo(o.x + o.width - r, o.y);
      ctx.arc(o.x + o.width - r, o.y + r, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(o.x + r, o.y + o.height); ctx.arc(o.x + r, o.y + r, r, Math.PI / 2, -Math.PI / 2);
      ctx.fill();
      ctx.strokeStyle = "#1a0f0a"; ctx.beginPath(); ctx.ellipse(o.x + o.width - r, o.y + r, 5, r - 3, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (o.type === "drone") {
      const x = o.x, y = o.y, hover = Math.sin(worldDistance * 0.15) * 3;
      ctx.fillStyle = "rgba(0, 0, 0, 0.2)"; ctx.beginPath(); ctx.ellipse(x + 37, GROUND + 2, 20, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#444"; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(x + 10, y + 4 + hover); ctx.lineTo(x + 10, y - 5 + hover);
      ctx.moveTo(x + 64, y + 4 + hover); ctx.lineTo(x + 64, y - 5 + hover); ctx.stroke();
      const spin = Math.sin(worldDistance / 3) * 14;
      ctx.strokeStyle = `rgba(180, 200, 220, 0.4)`; ctx.beginPath();
      ctx.moveTo(x + 10 - spin, y - 5 + hover); ctx.lineTo(x + 10 + spin, y - 5 + hover);
      ctx.moveTo(x + 64 - spin, y - 5 + hover); ctx.lineTo(x + 64 + spin, y - 5 + hover); ctx.stroke();
      ctx.fillStyle = "#252b33"; ctx.beginPath(); ctx.ellipse(x + 37, y + 12 + hover, 28, 12, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#555"; ctx.stroke();
      ctx.fillStyle = "#ff2222"; ctx.shadowColor = "#ff0000"; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(x + 37, y + 13 + hover, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    } else if (o.type === "cactus") {
      ctx.strokeStyle = "#2e5528"; ctx.lineWidth = 11; ctx.lineCap = "round"; ctx.beginPath();
      ctx.moveTo(o.x + 16, GROUND); ctx.lineTo(o.x + 16, o.y + 5); ctx.stroke(); ctx.lineWidth = 9; ctx.beginPath();
      ctx.moveTo(o.x + 16, o.y + 30); ctx.lineTo(o.x + 5, o.y + 30); ctx.lineTo(o.x + 5, o.y + 17); ctx.stroke(); ctx.beginPath();
      ctx.moveTo(o.x + 16, o.y + 40); ctx.lineTo(o.x + 28, o.y + 40); ctx.lineTo(o.x + 28, o.y + 25); ctx.stroke(); ctx.lineCap = "butt";
    } else if (o.type === "spikes") {
      const count = 5, spikeWidth = o.width / count;
      for (let i = 0; i < count; i++) {
        const sx = o.x + i * spikeWidth, spikeGrad = ctx.createLinearGradient(sx, o.y, sx, GROUND);
        spikeGrad.addColorStop(0, "#999"); spikeGrad.addColorStop(1, "#333");
        ctx.fillStyle = spikeGrad; ctx.beginPath(); ctx.moveTo(sx + 1, GROUND);
        ctx.lineTo(sx + spikeWidth / 2, o.y); ctx.lineTo(sx + spikeWidth - 1, GROUND); ctx.fill();
      }
      ctx.fillStyle = "#222"; ctx.fillRect(o.x, GROUND - 4, o.width, 4);
    } else if (o.type === "stump") {
      ctx.fillStyle = "#4a2a18"; ctx.fillRect(o.x + 5, o.y + 8, o.width - 10, o.height - 8);
      ctx.fillStyle = "#8a6038"; ctx.beginPath(); ctx.ellipse(o.x + o.width / 2, o.y + 8, o.width / 2, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#362014"; ctx.stroke();
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
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
    ctx.fill();
  }
  for (const p of particles) {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawPostEffects() {
  const vigGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.4, W / 2, H / 2, W * 0.8);
  vigGrad.addColorStop(0, "rgba(0,0,0,0)");
  vigGrad.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, W, H);

  if (deathFlash > 0) {
    ctx.fillStyle = `rgba(200, 0, 0, ${deathFlash * 1.5})`;
    ctx.fillRect(0, 0, W, H);
  }

  ctx.fillStyle = "rgba(0, 0, 0, 0.04)";
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
// КЛАВИАТУРА И ТАЧ
// ===============================

document.addEventListener("keydown", e => {
  if (!["Space", "ArrowUp", "ArrowDown"].includes(e.code)) return;
  e.preventDefault();
  if (!running) { startGame(); return; }
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
