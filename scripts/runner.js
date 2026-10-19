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

  player.y = GROUND - player.height;
  player.velocityY = 0;
  player.grounded = true;
  player.sliding = false;

  scoreElement.textContent = "00000";
  overlay.classList.add("hidden");
}

function gameOver() {
  running = false;

  const result = Math.floor(score);

  if (result > best) {
    best = result;
    localStorage.setItem("nightmarRunnerBest", best);
    bestElement.textContent = String(best).padStart(5, "0");
  }

  overlayTitle.textContent = "SIGNAL LOST";
  overlayText.textContent = `SCORE: ${result}`;
  startButton.textContent = "RECONNECT";

  overlay.classList.remove("hidden");
}

function spawnObstacle() {
  const types = ["rock", "log", "drone"];
  const type = types[Math.floor(Math.random() * types.length)];

  let width, height, y;

  if (type === "rock") {
    width = 42;
    height = 36;
    y = GROUND - height;
  }

  if (type === "log") {
    width = 72;
    height = 27;
    y = GROUND - height;
  }

  if (type === "drone") {
    width = 74;
    height = 22;
    y = GROUND - 55;
  }

  obstacles.push({
    x: W + 30,
    y,
    width,
    height,
    type
  });
}

function update(dt) {
  score += dt * 12;
  speed = Math.min(420, 250 + score * 0.45);

  const movement = speed * dt;
  worldDistance += movement;

  scoreElement.textContent = String(Math.floor(score)).padStart(5, "0");

  // Прыжок с буфером
  if (jumpBuffer > 0) {
    jumpBuffer -= dt;

    if (player.grounded) {
      player.velocityY = JUMP_FORCE;
      player.grounded = false;
      jumpBuffer = 0;
    }
  }

  // Физика
  player.velocityY += GRAVITY * dt;
  player.y += player.velocityY * dt;

  if (player.y >= GROUND - player.height) {
    player.y = GROUND - player.height;
    player.velocityY = 0;
    player.grounded = true;
  }

  // Подкат
  player.sliding = slideHeld && player.grounded;

  // Препятствия
  spawnDistance -= movement;

  if (spawnDistance <= 0) {
    spawnObstacle();
    spawnDistance = 390 + Math.random() * 200;
  }

  for (const o of obstacles) {
    o.x -= movement;

    // Хитбокс игрока
    const px = player.x + 6;
    const pw = player.sliding ? 48 : 24;
    const py = player.sliding ? GROUND - 24 : player.y + 5;
    const ph = player.sliding ? 20 : player.height - 10;

    // Уменьшенный хитбокс препятствий
    const margin = 5;

    if (
      px < o.x + o.width - margin &&
      px + pw > o.x + margin &&
      py < o.y + o.height - margin &&
      py + ph > o.y + margin
    ) {
      gameOver();
      return;
    }
  }

  obstacles = obstacles.filter(o => o.x + o.width > 0);
}

// ===============================
// ПЛАВНАЯ СМЕНА ДНЯ И НОЧИ
// ===============================

function mixColor(a, b, t) {
  const c1 = a.match(/\w\w/g).map(x => parseInt(x, 16));
  const c2 = b.match(/\w\w/g).map(x => parseInt(x, 16));

  const c = c1.map((v, i) =>
    Math.round(v + (c2[i] - v) * t)
  );

  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function drawBackground() {
  const cycle = (worldDistance / 12000) % 1;
  const daylight = (Math.cos(cycle * Math.PI * 2) + 1) / 2;

  // Небо
  ctx.fillStyle = mixColor("#101b35", "#8bbfe8", daylight);
  ctx.fillRect(0, 0, W, H);

  // Солнце / луна
  const orbX = 90 + cycle * 720;
  const orbY = 95 - Math.sin(cycle * Math.PI) * 50;

  ctx.fillStyle = mixColor("#e0e7ff", "#ffe29a", daylight);
  ctx.beginPath();
  ctx.arc(orbX, orbY, 24, 0, Math.PI * 2);
  ctx.fill();

  // Дальние горы
  ctx.fillStyle = mixColor("#293344", "#748f9c", daylight);
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  ctx.lineTo(140, 185);
  ctx.lineTo(300, GROUND);
  ctx.lineTo(470, 195);
  ctx.lineTo(650, GROUND);
  ctx.lineTo(800, 205);
  ctx.lineTo(W, GROUND);
  ctx.fill();

  // Земля
  ctx.fillStyle = mixColor("#202b29", "#53734d", daylight);
  ctx.fillRect(0, GROUND, W, H - GROUND);

  ctx.strokeStyle = mixColor("#8b3030", "#304e30", daylight);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  ctx.lineTo(W, GROUND);
  ctx.stroke();
}

// ===============================
// ПЕРСОНАЖ
// ===============================

function drawPlayer() {
  const x = player.x;
  const y = player.y;

  ctx.save();

  if (player.sliding) {
    // Подкат с пригнутой фигурой
    const sy = GROUND - 26;

    // Ноги
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x + 20, sy + 15);
    ctx.lineTo(x + 55, sy + 21);
    ctx.stroke();

    // Корпус
    ctx.fillStyle = "#191919";
    ctx.beginPath();
    ctx.ellipse(x + 22, sy + 11, 24, 12, -0.15, 0, Math.PI * 2);
    ctx.fill();

    // Голова в капюшоне
    ctx.fillStyle = "#252525";
    ctx.beginPath();
    ctx.arc(x + 10, sy + 5, 12, 0, Math.PI * 2);
    ctx.fill();

    // Лицо
    ctx.fillStyle = "#070707";
    ctx.fillRect(x + 2, sy + 2, 14, 8);

    // Глаз
    ctx.fillStyle = "#e02020";
    ctx.fillRect(x + 12, sy + 5, 3, 2);

    // Логотип
    ctx.fillStyle = "#eee";
    ctx.font = "bold 10px monospace";
    ctx.fillText("NP", x + 20, sy + 15);
  } else {
    const legSwing = player.grounded
      ? Math.sin(worldDistance / 16) * 11
      : 0;

    // Ноги
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 43);
    ctx.lineTo(x + 12 + legSwing, y + 62);
    ctx.moveTo(x + 25, y + 43);
    ctx.lineTo(x + 25 - legSwing, y + 62);
    ctx.stroke();

    // Руки
    ctx.strokeStyle = "#202020";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 22);
    ctx.lineTo(x - 3 - legSwing * 0.5, y + 42);
    ctx.moveTo(x + 30, y + 22);
    ctx.lineTo(x + 39 + legSwing * 0.5, y + 40);
    ctx.stroke();

    // Тело
    ctx.fillStyle = "#151515";
    ctx.fillRect(x + 3, y + 17, 31, 30);

    // Капюшон
    ctx.fillStyle = "#252525";
    ctx.beginPath();
    ctx.arc(x + 19, y + 15, 17, Math.PI, 0);
    ctx.lineTo(x + 36, y + 27);
    ctx.lineTo(x + 2, y + 27);
    ctx.fill();

    // Лицо
    ctx.fillStyle = "#050505";
    ctx.fillRect(x + 10, y + 11, 18, 15);

    // Глаза
    ctx.fillStyle = "#d00000";
    ctx.fillRect(x + 14, y + 17, 4, 3);
    ctx.fillRect(x + 23, y + 17, 4, 3);

    // NP
    ctx.fillStyle = "#eee";
    ctx.font = "bold 12px monospace";
    ctx.fillText("NP", x + 10, y + 38);
  }

  ctx.restore();
}

// ===============================
// ПРЕПЯТСТВИЯ
// ===============================

function drawObstacles() {
  for (const o of obstacles) {
    if (o.type === "rock") {
      ctx.fillStyle = "#555";
      ctx.beginPath();
      ctx.moveTo(o.x, GROUND);
      ctx.lineTo(o.x + 8, o.y + 8);
      ctx.lineTo(o.x + 28, o.y);
      ctx.lineTo(o.x + o.width, GROUND);
      ctx.fill();
    }

    if (o.type === "log") {
      ctx.fillStyle = "#69452c";
      ctx.fillRect(o.x, o.y, o.width, o.height);
      ctx.strokeStyle = "#382313";
      ctx.strokeRect(o.x, o.y, o.width, o.height);
    }

    if (o.type === "drone") {
      const x = o.x;
      const y = o.y;

      // Пропеллеры
      ctx.strokeStyle = "#444";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 10, y + 4);
      ctx.lineTo(x + 10, y - 5);
      ctx.moveTo(x + 64, y + 4);
      ctx.lineTo(x + 64, y - 5);
      ctx.stroke();

      const spin = Math.sin(worldDistance / 8) * 8;

      ctx.strokeStyle = "#b8c0c8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 10 - spin, y - 5);
      ctx.lineTo(x + 10 + spin, y - 5);
      ctx.moveTo(x + 64 - spin, y - 5);
      ctx.lineTo(x + 64 + spin, y - 5);
      ctx.stroke();

      // Корпус
      ctx.fillStyle = "#303640";
      ctx.beginPath();
      ctx.ellipse(x + 37, y + 12, 28, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#66717e";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Красный сенсор
      ctx.fillStyle = "#ff3030";
      ctx.beginPath();
      ctx.arc(x + 37, y + 13, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function render() {
  drawBackground();
  drawPlayer();
  drawObstacles();
}

function loop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000 || 0, 0.033);
  lastTime = timestamp;

  if (running) update(dt);
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
