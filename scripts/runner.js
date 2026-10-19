const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreElement = document.getElementById("score");
const bestElement = document.getElementById("best");
const overlay = document.getElementById("gameOverlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startButton = document.getElementById("startButton");

const W = canvas.width;
const H = canvas.height;
const GROUND = 290;

let running = false;
let score = 0;
let speed = 260;
let obstacles = [];
let spawnDistance = 420;
let worldDistance = 0;
let lastTime = 0;
let best = Number(localStorage.getItem("nightmarRunnerBest")) || 0;

bestElement.textContent = String(best).padStart(5, "0");

const player = {
  x: 110,
  y: GROUND - 62,
  width: 36,
  height: 62,
  velocityY: 0,
  grounded: true,
  sliding: false,
  slideTimer: 0
};

function startGame() {
  jumpBuffer = 0;
  score = 0;
  speed = 260;
  obstacles = [];
  spawnDistance = 420;
  worldDistance = 0;

  player.y = GROUND - player.height;
  player.velocityY = 0;
  player.grounded = true;
  player.sliding = false;
  player.slideTimer = 0;

  running = true;
  overlay.classList.add("hidden");
}

let jumpBuffer = 0;

function jump() {
  if (!running) return;

  jumpBuffer = 0.15;
}

function slide() {
  if (!running || !player.grounded) return;
  player.sliding = true;
  player.slideTimer = 0.65;
}

function spawnObstacle() {
  const types = ["rock", "log", "barrier"];
  const type = types[Math.floor(Math.random() * types.length)];

  let width = 40;
  let height = 35;

  if (type === "log") {
    width = 75;
    height = 25;
  }

  if (type === "barrier") {
    width = 65;
    height = 16;
  }

  obstacles.push({
    x: W + 30,
    y: type === "barrier" ? GROUND - 62 : GROUND - height,
    width,
    height,
    type
  });
}

function update(dt) {
  speed = Math.min(430, 260 + score * 0.55);
  const movement = speed * dt;

  worldDistance += movement;
  score += dt * 12;

  scoreElement.textContent = String(Math.floor(score)).padStart(5, "0");

// Буфер прыжка
if (jumpBuffer > 0) {
  jumpBuffer -= dt;

  if (player.grounded) {
    player.sliding = false;
    player.slideTimer = 0;

    player.velocityY = -620;
    player.grounded = false;

    jumpBuffer = 0;
  }
}
  

  // Физика прыжка
  player.velocityY += 1550 * dt;
  player.y += player.velocityY * dt;

  if (player.y >= GROUND - player.height) {
    player.y = GROUND - player.height;
    player.velocityY = 0;
    player.grounded = true;
  }

  // Подкат
  if (player.sliding) {
    player.slideTimer -= dt;
    if (player.slideTimer <= 0) {
      player.sliding = false;
    }
  }

  // Генерация препятствий
  spawnDistance -= movement;

  if (spawnDistance <= 0) {
    spawnObstacle();
    spawnDistance = 350 + Math.random() * 220;
  }

  for (const o of obstacles) {
    o.x -= movement;

    let px = player.x;
    let py = player.y;
    let pw = player.width;
    let ph = player.height;

    if (player.sliding) {
      py += 32;
      ph -= 32;
    }

    if (
      px + 6 < o.x + o.width &&
      px + pw - 6 > o.x &&
      py + 5 < o.y + o.height &&
      py + ph - 5 > o.y
    ) {
      gameOver();
      return;
    }
  }

  obstacles = obstacles.filter(o => o.x + o.width > 0);
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

function drawBackground() {
  // Полный цикл день/ночь
  const cycle = (worldDistance / 9000) % 1;
  const daylight = (Math.cos(cycle * Math.PI * 2) + 1) / 2;

  const r = Math.floor(12 + daylight * 125);
  const g = Math.floor(18 + daylight * 165);
  const b = Math.floor(35 + daylight * 185);

  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, W, H);

  // Солнце / луна
  const orbX = 90 + cycle * 720;
  const orbY = 100 - Math.sin(cycle * Math.PI) * 65;

  ctx.beginPath();
  ctx.arc(orbX, orbY, 25, 0, Math.PI * 2);
  ctx.fillStyle = daylight > 0.5 ? "#ffe08a" : "#e2e9ff";
  ctx.fill();

  // Горы
  ctx.fillStyle = daylight > 0.5 ? "#697f85" : "#293344";
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  ctx.lineTo(140, 180);
  ctx.lineTo(300, GROUND);
  ctx.lineTo(460, 195);
  ctx.lineTo(650, GROUND);
  ctx.lineTo(790, 200);
  ctx.lineTo(W, GROUND);
  ctx.fill();

  // Земля
  ctx.fillStyle = daylight > 0.5 ? "#465e43" : "#202b29";
  ctx.fillRect(0, GROUND, W, H - GROUND);

  ctx.strokeStyle = daylight > 0.5 ? "#253b28" : "#7e2020";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  ctx.lineTo(W, GROUND);
  ctx.stroke();
}

function drawPlayer() {
  const x = player.x;
  const y = player.y;

  ctx.save();

  if (player.sliding) {
    ctx.translate(x, GROUND - 30);
    ctx.rotate(-0.15);

    ctx.fillStyle = "#151515";
    ctx.fillRect(0, 0, 55, 25);

    ctx.fillStyle = "#222";
    ctx.fillRect(35, -15, 22, 23);

    ctx.fillStyle = "#ddd";
    ctx.font = "bold 12px monospace";
    ctx.fillText("NP", 12, 17);
  } else {
    const legSwing = player.grounded
      ? Math.sin(worldDistance / 18) * 12
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

    // Логотип
    ctx.fillStyle = "#eee";
    ctx.font = "bold 12px monospace";
    ctx.fillText("NP", x + 10, y + 38);
  }

  ctx.restore();
}

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

    if (o.type === "barrier") {
      ctx.fillStyle = "#8b0000";
      ctx.fillRect(o.x, o.y, o.width, o.height);

      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px monospace";
      ctx.fillText("DANGER", o.x + 7, o.y + 12);
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

startButton.addEventListener("click", startGame);

document.addEventListener("keydown", e => {
  if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) {
    e.preventDefault();

    if (!running) {
      startGame();
      return;
    }

    if (e.code === "ArrowDown") slide();
    else jump();
  }
});


requestAnimationFrame(loop);

const jumpButton = document.getElementById("jumpButton");
const slideButton = document.getElementById("slideButton");

jumpButton.addEventListener("pointerdown", e => {
  e.preventDefault();
  jump();
});

slideButton.addEventListener("pointerdown", e => {
  e.preventDefault();
  slide();
});
