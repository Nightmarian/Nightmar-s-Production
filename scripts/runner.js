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
let clouds = [];
let screenShake = 0;
let deathFlash = 0;
let trailPositions = [];

// Генерация звёзд
for (let i = 0; i < 80; i++) {
  stars.push({
    x: Math.random() * W,
    y: Math.random() * (GROUND - 40),
    size: Math.random() * 2.5 + 0.5,
    twinkleSpeed: Math.random() * 3 + 1,
    twinkleOffset: Math.random() * Math.PI * 2,
    brightness: Math.random() * 0.5 + 0.5
  });
}

// Генерация облаков
for (let i = 0; i < 6; i++) {
  clouds.push({
    x: Math.random() * W,
    y: 30 + Math.random() * 100,
    width: 60 + Math.random() * 80,
    height: 20 + Math.random() * 15,
    speed: 8 + Math.random() * 15,
    opacity: 0.3 + Math.random() * 0.4
  });
}

function spawnDust(x, y, count) {
  for (let i = 0; i < count; i++) {
    dustParticles.push({
      x: x + Math.random() * 10 - 5,
      y: y + Math.random() * 5,
      vx: -speed * 0.3 + (Math.random() - 0.5) * 40,
      vy: -Math.random() * 30 - 10,
      life: 0.3 + Math.random() * 0.4,
      maxLife: 0.3 + Math.random() * 0.4,
      size: 2 + Math.random() * 3
    });
  }
}

function spawnDeathParticles(x, y) {
  for (let i = 0; i < 30; i++) {
    const angle = Math.random() * Math.PI * 2;
    const force = 50 + Math.random() * 200;
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force - 100,
      life: 0.5 + Math.random() * 0.8,
      maxLife: 0.5 + Math.random() * 0.8,
      size: 3 + Math.random() * 5,
      color: ["#ff3030", "#ff6020", "#ffaa00", "#d00000", "#151515"][Math.floor(Math.random() * 5)],
      gravity: true
    });
  }
}

function spawnJumpParticles(x, y) {
  for (let i = 0; i < 8; i++) {
    dustParticles.push({
      x: x + Math.random() * 20,
      y: y,
      vx: (Math.random() - 0.5) * 60,
      vy: -Math.random() * 20 - 5,
      life: 0.25 + Math.random() * 0.2,
      maxLife: 0.25 + Math.random() * 0.2,
      size: 3 + Math.random() * 4
    });
  }
}

function spawnSlideParticles(x, y) {
  dustParticles.push({
    x: x + 40 + Math.random() * 10,
    y: y + Math.random() * 5,
    vx: 20 + Math.random() * 30,
    vy: -Math.random() * 25 - 5,
    life: 0.2 + Math.random() * 0.2,
    maxLife: 0.2 + Math.random() * 0.2,
    size: 2 + Math.random() * 3
  });
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

// ===============================
// УПРАВЛЕНИЕ
// ===============================

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

  setTimeout(() => {
    overlay.classList.remove("hidden");
  }, 600);
}

// ===============================
// ГЕНЕРАЦИЯ ПРЕПЯТСТВИЙ
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

// ===============================
// ОБНОВЛЕНИЕ ИГРЫ
// ===============================

function update(dt) {
  score += dt * 12;
  speed = Math.min(420, 250 + score * 0.45);

  const movement = speed * dt;
  worldDistance += movement;

  scoreElement.textContent = String(Math.floor(score)).padStart(5, "0");

  // Буфер прыжка
  if (jumpBuffer > 0) {
    jumpBuffer -= dt;
    if (player.grounded) {
      player.velocityY = JUMP_FORCE;
      player.grounded = false;
      jumpBuffer = 0;
      spawnJumpParticles(player.x, GROUND);
    }
  }

  // Физика
  player.velocityY += GRAVITY * dt;
  player.y += player.velocityY * dt;

  if (player.y >= GROUND - player.height) {
    if (!player.grounded && player.velocityY > 200) {
      spawnDust(player.x + 18, GROUND, 6);
    }
    player.y = GROUND - player.height;
    player.velocityY = 0;
    player.grounded = true;
  }

  // Подкат
  const wasSliding = player.sliding;
  player.sliding = slideHeld && player.grounded;
  if (player.sliding) {
    spawnSlideParticles(player.x, GROUND - 5);
  }

  // Бег — пыль
  if (player.grounded && !player.sliding && Math.random() < 0.3) {
    spawnDust(player.x + 10, GROUND, 1);
  }

  // След за игроком
  trailPositions.unshift({ x: player.x, y: player.y, sliding: player.sliding, time: 0.15 });
  if (trailPositions.length > 6) trailPositions.pop();
  for (let i = trailPositions.length - 1; i >= 0; i--) {
    trailPositions[i].time -= dt;
    if (trailPositions[i].time <= 0) trailPositions.splice(i, 1);
  }

  // Облака
  for (const c of clouds) {
    c.x -= c.speed * dt;
    if (c.x + c.width < 0) {
      c.x = W + 20;
      c.y = 30 + Math.random() * 100;
    }
  }

  // Создание препятствий
  spawnDistance -= movement;
  if (spawnDistance <= 0) {
    spawnObstacle();
    spawnDistance = 390 + Math.random() * 200;
  }

  // Столкновения
  for (const o of obstacles) {
    o.x -= movement;

    const px = player.x + 6;
    const pw = player.sliding ? 48 : 24;
    const py = player.sliding ? GROUND - 24 : player.y + 5;
    const ph = player.sliding ? 20 : player.height - 10;
    const margin = 5;

    const horizontalCollision = px < o.x + o.width - margin && px + pw > o.x + margin;

    if (o.type === "drone") {
      if (horizontalCollision && !player.sliding) {
        gameOver();
        return;
      }
    } else {
      const verticalCollision = py < o.y + o.height - margin && py + ph > o.y + margin;
      if (horizontalCollision && verticalCollision) {
        gameOver();
        return;
      }
    }
  }

  obstacles = obstacles.filter(o => o.x + o.width > 0);

  // Обновление эффектов
  if (screenShake > 0) screenShake -= dt;
  if (deathFlash > 0) deathFlash -= dt;

  updateParticles(dt);
}

// ===============================
// ЦВЕТА И СМЕНА СУТОК
// ===============================

function mixColor(a, b, t) {
  const c1 = a.match(/\w\w/g).map(x => parseInt(x, 16));
  const c2 = b.match(/\w\w/g).map(x => parseInt(x, 16));
  const c = c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function mixColorAlpha(a, b, t, alpha) {
  const c1 = a.match(/\w\w/g).map(x => parseInt(x, 16));
  const c2 = b.match(/\w\w/g).map(x => parseInt(x, 16));
  const c = c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

function getDaylight() {
  const cycle = (worldDistance / 12000) % 1;
  return (Math.cos(cycle * Math.PI * 2) + 1) / 2;
}

// ===============================
// РЕНДЕР ФОНА
// ===============================

function drawBackground() {
  const cycle = (worldDistance / 12000) % 1;
  const daylight = getDaylight();

  // Градиент неба
  const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND);
  skyGrad.addColorStop(0, mixColor("#060d1f", "#4a90c2", daylight));
  skyGrad.addColorStop(0.5, mixColor("#101b35", "#8bbfe8", daylight));
  skyGrad.addColorStop(1, mixColor("#1a2540", "#c8dde8", daylight));
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, GROUND);

  // Звёзды (только ночью)
  if (daylight < 0.7) {
    const starAlpha = Math.max(0, 1 - daylight / 0.7);
    for (const s of stars) {
      const twinkle = (Math.sin(worldDistance * 0.01 * s.twinkleSpeed + s.twinkleOffset) + 1) / 2;
      const alpha = starAlpha * s.brightness * (0.4 + twinkle * 0.6);
      ctx.fillStyle = `rgba(255, 255, 240, ${alpha})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * (0.7 + twinkle * 0.3), 0, Math.PI * 2);
      ctx.fill();

      // Свечение ярких звёзд
      if (s.size > 1.8) {
        ctx.fillStyle = `rgba(200, 220, 255, ${alpha * 0.15})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Облака
  for (const c of clouds) {
    const alpha = c.opacity * (0.15 + daylight * 0.6);
    ctx.fillStyle = mixColorAlpha("#354060", "#ffffff", daylight, alpha);

    ctx.beginPath();
    ctx.ellipse(c.x + c.width * 0.5, c.y, c.width * 0.5, c.height * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x + c.width * 0.25, c.y + 3, c.width * 0.35, c.height * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.x + c.width * 0.7, c.y + 2, c.width * 0.3, c.height * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Солнце / луна с свечением
  const orbX = 90 + cycle * 720;
  const orbY = 95 - Math.sin(cycle * Math.PI) * 50;

  // Свечение
  const glowRadius = 60;
  const glowGrad = ctx.createRadialGradient(orbX, orbY, 10, orbX, orbY, glowRadius);
  glowGrad.addColorStop(0, mixColorAlpha("#c0c8ff", "#ffee80", daylight, 0.35));
  glowGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(orbX, orbY, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  // Диск
  const orbGrad = ctx.createRadialGradient(orbX - 5, orbY - 5, 2, orbX, orbY, 24);
  orbGrad.addColorStop(0, mixColor("#f0f4ff", "#fff8c0", daylight));
  orbGrad.addColorStop(1, mixColor("#c0c8e8", "#ffcc40", daylight));
  ctx.fillStyle = orbGrad;
  ctx.beginPath();
  ctx.arc(orbX, orbY, 24, 0, Math.PI * 2);
  ctx.fill();

  // Кратеры на луне (ночью)
  if (daylight < 0.4) {
    const craterAlpha = (1 - daylight / 0.4) * 0.2;
    ctx.fillStyle = `rgba(100, 110, 140, ${craterAlpha})`;
    ctx.beginPath(); ctx.arc(orbX - 6, orbY - 4, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(orbX + 8, orbY + 3, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(orbX + 2, orbY + 9, 4, 0, Math.PI * 2); ctx.fill();
  }

  // Далёкие горы (параллакс слой 1)
  ctx.fillStyle = mixColorAlpha("#1a2230", "#6a8898", daylight, 0.5);
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  const farOffset = -(worldDistance * 0.02) % W;
  for (let i = -1; i <= 2; i++) {
    const base = farOffset + i * 400;
    ctx.lineTo(base + 50, 200);
    ctx.lineTo(base + 120, 220);
    ctx.lineTo(base + 200, 180);
    ctx.lineTo(base + 280, 215);
    ctx.lineTo(base + 400, GROUND);
  }
  ctx.lineTo(W, GROUND);
  ctx.fill();

  // Ближние горы (параллакс слой 2)
  ctx.fillStyle = mixColor("#293344", "#748f9c", daylight);
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  const nearOffset = -(worldDistance * 0.05) % 650;
  for (let i = -1; i <= 2; i++) {
    const base = nearOffset + i * 650;
    ctx.lineTo(base + 140, 185);
    ctx.lineTo(base + 300, GROUND - 20);
    ctx.lineTo(base + 470, 195);
    ctx.lineTo(base + 650, GROUND);
  }
  ctx.lineTo(W, GROUND);
  ctx.fill();

  // Земля с градиентом
  const groundGrad = ctx.createLinearGradient(0, GROUND, 0, H);
  groundGrad.addColorStop(0, mixColor("#253028", "#5a7a50", daylight));
  groundGrad.addColorStop(1, mixColor("#151a18", "#3a5235", daylight));
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, GROUND, W, H - GROUND);

  // Текстура земли — штрихи
  const texOffset = -(worldDistance * 0.8) % 40;
  ctx.strokeStyle = mixColorAlpha("#1a201c", "#4a6a40", daylight, 0.3);
  ctx.lineWidth = 1;
  for (let i = -1; i < W / 40 + 2; i++) {
    const tx = texOffset + i * 40;
    ctx.beginPath();
    ctx.moveTo(tx, GROUND + 5);
    ctx.lineTo(tx + 15, GROUND + 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx + 20, GROUND + 15);
    ctx.lineTo(tx + 30, GROUND + 15);
    ctx.stroke();
  }

  // Линия горизонта
  ctx.strokeStyle = mixColor("#8b3030", "#304e30", daylight);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  ctx.lineTo(W, GROUND);
  ctx.stroke();

  // Нижняя подсветка горизонта
  const horizonGrad = ctx.createLinearGradient(0, GROUND - 8, 0, GROUND + 8);
  horizonGrad.addColorStop(0, "rgba(0,0,0,0)");
  horizonGrad.addColorStop(0.5, mixColorAlpha("#ff6030", "#80c060", daylight, 0.1));
  horizonGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = horizonGrad;
  ctx.fillRect(0, GROUND - 8, W, 16);
}

// ===============================
// ПЕРСОНАЖ
// ===============================

function drawPlayerTrail() {
  for (let i = 0; i < trailPositions.length; i++) {
    const t = trailPositions[i];
    const alpha = (t.time / 0.15) * 0.08;
    if (alpha <= 0) continue;

    ctx.fillStyle = `rgba(200, 50, 50, ${alpha})`;
    if (t.sliding) {
      ctx.fillRect(t.x + 5, GROUND - 22, 45, 18);
    } else {
      ctx.fillRect(t.x + 5, t.y + 10, 28, 45);
    }
  }
}

function drawPlayer() {
  if (!running && deathFlash > 0) return; // Скрыть при смерти с флешом

  const x = player.x;
  const y = player.y;

  ctx.save();

  // Тень
  const shadowScale = player.grounded ? 1 : 0.6;
  const shadowAlpha = player.grounded ? 0.3 : 0.15;
  ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
  ctx.beginPath();
  ctx.ellipse(x + 18, GROUND + 2, 18 * shadowScale, 4 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  // След
  drawPlayerTrail();

  if (player.sliding) {
    const sy = GROUND - 26;

    // Тело при скольжении
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + 20, sy + 15);
    ctx.lineTo(x + 55, sy + 21);
    ctx.stroke();

    // Корпус
    const bodyGrad = ctx.createLinearGradient(x, sy, x + 48, sy + 24);
    bodyGrad.addColorStop(0, "#252525");
    bodyGrad.addColorStop(1, "#151515");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(x + 22, sy + 11, 24, 12, -0.15, 0, Math.PI * 2);
    ctx.fill();

    // Голова
    ctx.fillStyle = "#282828";
    ctx.beginPath();
    ctx.arc(x + 10, sy + 5, 12, 0, Math.PI * 2);
    ctx.fill();

    // Визор
    ctx.fillStyle = "#070707";
    ctx.fillRect(x + 2, sy + 2, 14, 8);
    ctx.fillStyle = "#e02020";
    ctx.fillRect(x + 12, sy + 5, 3, 2);

    // Блик визора
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    ctx.fillRect(x + 3, sy + 3, 6, 3);

    // Лейбл
    ctx.fillStyle = "#eee";
    ctx.font = "bold 10px monospace";
    ctx.fillText("NP", x + 20, sy + 15);

    ctx.lineCap = "butt";
  } else {
    const legSwing = player.grounded
      ? Math.sin(worldDistance / 16) * 11
      : 0;

    const bobY = player.grounded ? Math.sin(worldDistance / 8) * 1.5 : 0;

    // Ноги
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 43 + bobY);
    ctx.lineTo(x + 12 + legSwing, y + 62);
    ctx.moveTo(x + 25, y + 43 + bobY);
    ctx.lineTo(x + 25 - legSwing, y + 62);
    ctx.stroke();

    // Ботинки
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.ellipse(x + 12 + legSwing, y + 63, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + 25 - legSwing, y + 63, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Руки
    ctx.strokeStyle = "#202020";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 22 + bobY);
    ctx.lineTo(x - 3 - legSwing * 0.5, y + 42);
    ctx.moveTo(x + 30, y + 22 + bobY);
    ctx.lineTo(x + 39 + legSwing * 0.5, y + 40);
    ctx.stroke();
    ctx.lineCap = "butt";

    // Тело
    const bodyGrad = ctx.createLinearGradient(x + 3, y + 17, x + 34, y + 47);
    bodyGrad.addColorStop(0, "#1d1d1d");
    bodyGrad.addColorStop(1, "#111111");
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(x + 3, y + 17 + bobY, 31, 30);

    // Детали на теле
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 18, y + 17 + bobY);
    ctx.lineTo(x + 18, y + 47 + bobY);
    ctx.stroke();

    // Голова (шлем)
    const headGrad = ctx.createRadialGradient(x + 16, y + 12, 3, x + 19, y + 15, 17);
    headGrad.addColorStop(0, "#333");
    headGrad.addColorStop(1, "#1a1a1a");
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.arc(x + 19, y + 15 + bobY, 17, Math.PI, 0);
    ctx.lineTo(x + 36, y + 27 + bobY);
    ctx.lineTo(x + 2, y + 27 + bobY);
    ctx.fill();

    // Полоска на шлеме
    ctx.strokeStyle = "#d00000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 19, y + 15 + bobY, 17, Math.PI + 0.3, -0.3);
    ctx.stroke();

    // Визор
    ctx.fillStyle = "#050505";
    ctx.fillRect(x + 10, y + 11 + bobY, 18, 15);

    // Блик визора
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.fillRect(x + 11, y + 12 + bobY, 8, 6);

    // Глаза
    const eyeGlow = 0.6 + Math.sin(worldDistance * 0.1) * 0.4;
    ctx.shadowColor = "#ff0000";
    ctx.shadowBlur = 6 * eyeGlow;
    ctx.fillStyle = `rgba(220, 0, 0, ${0.7 + eyeGlow * 0.3})`;
    ctx.fillRect(x + 14, y + 17 + bobY, 4, 3);
    ctx.fillRect(x + 23, y + 17 + bobY, 4, 3);
    ctx.shadowBlur = 0;

    // Лейбл
    ctx.fillStyle = "#eee";
    ctx.font = "bold 12px monospace";
    ctx.fillText("NP", x + 10, y + 38 + bobY);
  }

  ctx.restore();
}

// ===============================
// ПРЕПЯТСТВИЯ
// ===============================

function drawObstacles() {
  const daylight = getDaylight();

  for (const o of obstacles) {
    ctx.save();

    // Тень препятствия
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    if (o.type !== "drone") {
      ctx.beginPath();
      ctx.ellipse(o.x + o.width / 2, GROUND + 2, o.width * 0.4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Камень
    if (o.type === "rock") {
      const rockGrad = ctx.createLinearGradient(o.x, o.y, o.x + o.width, GROUND);
      rockGrad.addColorStop(0, "#777");
      rockGrad.addColorStop(0.5, "#555");
      rockGrad.addColorStop(1, "#3a3a3a");
      ctx.fillStyle = rockGrad;
      ctx.beginPath();
      ctx.moveTo(o.x, GROUND);
      ctx.lineTo(o.x + 5, o.y + 15);
      ctx.lineTo(o.x + 8, o.y + 8);
      ctx.lineTo(o.x + 20, o.y);
      ctx.lineTo(o.x + 28, o.y + 3);
      ctx.lineTo(o.x + 38, o.y + 10);
      ctx.lineTo(o.x + o.width, GROUND);
      ctx.fill();

      // Детализация
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(o.x + 15, o.y + 8);
      ctx.lineTo(o.x + 20, o.y + 20);
      ctx.moveTo(o.x + 30, o.y + 10);
      ctx.lineTo(o.x + 25, o.y + 25);
      ctx.stroke();
    }

    // Бревно
    if (o.type === "log") {
      const logGrad = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.height);
      logGrad.addColorStop(0, "#7d5636");
      logGrad.addColorStop(0.5, "#69452c");
      logGrad.addColorStop(1, "#4a2f1a");
      ctx.fillStyle = logGrad;

      // Закруглённое бревно
      const r = o.height / 2;
      ctx.beginPath();
      ctx.moveTo(o.x + r, o.y);
      ctx.lineTo(o.x + o.width - r, o.y);
      ctx.arc(o.x + o.width - r, o.y + r, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(o.x + r, o.y + o.height);
      ctx.arc(o.x + r, o.y + r, r, Math.PI / 2, -Math.PI / 2);
      ctx.fill();

      // Текстура колец
      ctx.strokeStyle = "#382313";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(o.x + o.width - r, o.y + r, 5, r - 3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(o.x + o.width - r, o.y + r, 2, r - 6, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "#4a2f1a";
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(o.x + i * 18, o.y + 3);
        ctx.lineTo(o.x + i * 18, o.y + o.height - 3);
        ctx.stroke();
      }
    }

    // Дрон
    if (o.type === "drone") {
      const x = o.x;
      const y = o.y;
      const hover = Math.sin(worldDistance * 0.15) * 3;

      // Тень на земле
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.beginPath();
      ctx.ellipse(x + 37, GROUND + 2, 20, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Стойки
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 10, y + 4 + hover);
      ctx.lineTo(x + 10, y - 5 + hover);
      ctx.moveTo(x + 64, y + 4 + hover);
      ctx.lineTo(x + 64, y - 5 + hover);
      ctx.stroke();

      // Пропеллеры (размытие)
      const spin = Math.sin(worldDistance / 3) * 14;
      ctx.strokeStyle = `rgba(200, 210, 220, 0.5)`;
      ctx.lineWidth = 2;

      // Диски пропеллеров
      ctx.fillStyle = "rgba(180, 200, 215, 0.15)";
      ctx.beginPath();
      ctx.ellipse(x + 10, y - 5 + hover, 14, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + 64, y - 5 + hover, 14, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(x + 10 - spin, y - 5 + hover);
      ctx.lineTo(x + 10 + spin, y - 5 + hover);
      ctx.moveTo(x + 64 - spin, y - 5 + hover);
      ctx.lineTo(x + 64 + spin, y - 5 + hover);
      ctx.stroke();

      // Корпус
      const droneGrad = ctx.createRadialGradient(x + 37, y + 10 + hover, 5, x + 37, y + 12 + hover, 28);
      droneGrad.addColorStop(0, "#404a55");
      droneGrad.addColorStop(1, "#252b33");
      ctx.fillStyle = droneGrad;
      ctx.beginPath();
      ctx.ellipse(x + 37, y + 12 + hover, 28, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#66717e";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Глаз
      const eyePulse = (Math.sin(worldDistance * 0.2) + 1) / 2;
      ctx.shadowColor = "#ff0000";
      ctx.shadowBlur = 10 + eyePulse * 6;
      ctx.fillStyle = `rgba(255, ${Math.floor(30 + eyePulse * 20)}, ${Math.floor(30 + eyePulse * 20)}, 1)`;
      ctx.beginPath();
      ctx.arc(x + 37, y + 13 + hover, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Блик на глазу
      ctx.fillStyle = "rgba(255, 200, 200, 0.4)";
      ctx.beginPath();
      ctx.arc(x + 35, y + 11 + hover, 2, 0, Math.PI * 2);
      ctx.fill();

      // Антенна
      ctx.strokeStyle = "#888";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 37, y + hover);
      ctx.lineTo(x + 40, y - 10 + hover);
      ctx.stroke();

      // Мигающий огонёк
      if (Math.sin(worldDistance * 0.3) > 0.5) {
        ctx.fillStyle = "#00ff00";
        ctx.beginPath();
        ctx.arc(x + 40, y - 10 + hover, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Кактус
    if (o.type === "cactus") {
      const x = o.x;
      const y = o.y;

      // Более детальный кактус
      const cactusGrad = ctx.createLinearGradient(x, y, x + 32, GROUND);
      cactusGrad.addColorStop(0, "#35883f");
      cactusGrad.addColorStop(1, "#1e5528");
      ctx.strokeStyle = cactusGrad;
      ctx.lineWidth = 11;
      ctx.lineCap = "round";

      ctx.beginPath();
      ctx.moveTo(x + 16, GROUND);
      ctx.lineTo(x + 16, y + 5);
      ctx.stroke();

      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(x + 16, y + 30);
      ctx.lineTo(x + 5, y + 30);
      ctx.lineTo(x + 5, y + 17);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x + 16, y + 40);
      ctx.lineTo(x + 28, y + 40);
      ctx.lineTo(x + 28, y + 25);
      ctx.stroke();

      // Светлые полосы
      ctx.strokeStyle = "rgba(100, 200, 100, 0.2)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 14, GROUND - 5);
      ctx.lineTo(x + 14, y + 8);
      ctx.moveTo(x + 18, GROUND - 5);
      ctx.lineTo(x + 18, y + 8);
      ctx.stroke();

      // Шипы
      ctx.strokeStyle = "#90cc80";
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const sy = y + 8 + i * 10;
        ctx.beginPath();
        ctx.moveTo(x + 10, sy);
        ctx.lineTo(x + 6, sy - 3);
        ctx.moveTo(x + 22, sy);
        ctx.lineTo(x + 26, sy - 3);
        ctx.stroke();
      }

      ctx.lineCap = "butt";
    }

    // Шипы
    if (o.type === "spikes") {
      const count = 5;
      const spikeWidth = o.width / count;

      for (let i = 0; i < count; i++) {
        const sx = o.x + i * spikeWidth;

        // Градиент для каждого шипа
        const spikeGrad = ctx.createLinearGradient(sx + spikeWidth / 2, o.y, sx + spikeWidth / 2, GROUND);
        spikeGrad.addColorStop(0, "#b0b0b0");
        spikeGrad.addColorStop(0.3, "#888");
        spikeGrad.addColorStop(1, "#555");

        ctx.fillStyle = spikeGrad;
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.moveTo(sx + 1, GROUND);
        ctx.lineTo(sx + spikeWidth / 2, o.y);
        ctx.lineTo(sx + spikeWidth - 1, GROUND);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Блик
        ctx.strokeStyle = "rgba(255,255,255,0.2)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx + spikeWidth / 2 - 2, o.y + 5);
        ctx.lineTo(sx + 3, GROUND - 2);
        ctx.stroke();
      }

      // Основание
      ctx.fillStyle = "#444";
      ctx.fillRect(o.x, GROUND - 4, o.width, 4);
    }

    // Пень
    if (o.type === "stump") {
      const x = o.x;
      const y = o.y;

      // Кора
      const barkGrad = ctx.createLinearGradient(x + 5, y + 8, x + o.width - 5, y + o.height);
      barkGrad.addColorStop(0, "#6d4030");
      barkGrad.addColorStop(0.5, "#5c3824");
      barkGrad.addColorStop(1, "#4a2a18");
      ctx.fillStyle = barkGrad;
      ctx.fillRect(x + 5, y + 8, o.width - 10, o.height - 8);

      // Текстура коры
      ctx.strokeStyle = "#362014";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 12, y + 14);
      ctx.lineTo(x + 12, GROUND);
      ctx.moveTo(x + 22, y + 12);
      ctx.lineTo(x + 22, GROUND);
      ctx.moveTo(x + 30, y + 12);
      ctx.lineTo(x + 30, GROUND);
      ctx.stroke();

      // Горизонтальные трещины
      ctx.strokeStyle = "#4a2a18";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 7, y + 20);
      ctx.lineTo(x + o.width - 7, y + 22);
      ctx.moveTo(x + 7, y + 32);
      ctx.lineTo(x + o.width - 7, y + 30);
      ctx.stroke();

      // Верхушка
      const topGrad = ctx.createRadialGradient(x + o.width / 2, y + 8, 3, x + o.width / 2, y + 8, o.width / 2);
      topGrad.addColorStop(0, "#c4956a");
      topGrad.addColorStop(0.6, "#a4774c");
      topGrad.addColorStop(1, "#8a6038");
      ctx.fillStyle = topGrad;
      ctx.beginPath();
      ctx.ellipse(x + o.width / 2, y + 8, o.width / 2, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Кольца на спиле
      ctx.strokeStyle = "#6d472b";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x + o.width / 2, y + 8, o.width / 2, 9, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x + o.width / 2, y + 8, o.width / 3, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x + o.width / 2, y + 8, o.width / 6, 3, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Точка центра
      ctx.fillStyle = "#5a3820";
      ctx.beginPath();
      ctx.arc(x + o.width / 2, y + 8, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

// ===============================
// ЧАСТИЦЫ (РЕНДЕР)
// ===============================

function drawParticles() {
  const daylight = getDaylight();

  // Пыль
  for (const p of dustParticles) {
    const alpha = (p.life / p.maxLife) * 0.5;
    ctx.fillStyle = mixColorAlpha("#6b5540", "#8a7a60", daylight, alpha);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
    ctx.fill();
  }

  // Взрывные частицы
  for (const p of particles) {
    const alpha = (p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

// ===============================
// ПОСТ-ОБРАБОТКА
// ===============================

function drawPostEffects() {
  // Виньетка
  const vigGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
  vigGrad.addColorStop(0, "rgba(0,0,0,0)");
  vigGrad.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, W, H);

  // Вспышка при смерти
  if (deathFlash > 0) {
    ctx.fillStyle = `rgba(255, 50, 30, ${deathFlash * 1.5})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Скан-лайны (лёгкие)
  ctx.fillStyle = "rgba(0, 0, 0, 0.03)";
  for (let y = 0; y < H; y += 4) {
    ctx.fillRect(0, y, W, 1);
  }
}

// ===============================
// РЕНДЕР
// ===============================

function render() {
  ctx.save();

  // Тряска экрана
  if (screenShake > 0) {
    const shakeX = (Math.random() - 0.5) * screenShake * 20;
    const shakeY = (Math.random() - 0.5) * screenShake * 20;
    ctx.translate(shakeX, shakeY);
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

  if (running) {
    update(dt);
  } else {
    // Обновление эффектов даже когда не бежим
    if (screenShake > 0) screenShake -= dt;
    if (deathFlash > 0) deathFlash -= dt;
    updateParticles(dt);
  }

  render();
  requestAnimationFrame(loop);
}

// ===============================
// КЛАВИАТУРА
// ===============================

document.addEventListener("keydown", e => {
  if (!["Space", "ArrowUp", "ArrowDown"].includes(e.code)) return;
  e.preventDefault();

  if (!running) {
    startGame();
    return;
  }

  if (e.code === "ArrowDown") {
    slide();
  } else if (!e.repeat) {
    jump();
  }
});

document.addEventListener("keyup", e => {
  if (e.code === "ArrowDown") {
    e.preventDefault();
    stopSlide();
  }
});

window.addEventListener("blur", stopSlide);

// ===============================
// МОБИЛЬНОЕ УПРАВЛЕНИЕ
// ===============================

jumpButton.addEventListener("pointerdown", e => {
  e.preventDefault();
  jump();
});

slideButton.addEventListener("pointerdown", e => {
  e.preventDefault();
  slide();
  slideButton.setPointerCapture(e.pointerId);
});

slideButton.addEventListener("pointerup", stopSlide);
slideButton.addEventListener("pointercancel", stopSlide);
slideButton.addEventListener("lostpointercapture", stopSlide);

// ===============================
// ЗАПУСК
// ===============================

startButton.addEventListener("click", startGame);
requestAnimationFrame(loop);
