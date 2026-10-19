const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreElement = document.getElementById("score");
const bestElement = document.getElementById("best");

const overlay = document.getElementById("gameOverlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startButton = document.getElementById("startButton");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const GROUND = 290;
const GRAVITY = 0.85;
const JUMP = -16;

let running = false;
let score = 0;
let speed = 6;
let obstacles = [];
let spawnTimer = 0;
let frame = 0;

let best = Number(localStorage.getItem("nightmarRunnerBest")) || 0;

bestElement.textContent = String(best).padStart(5, "0");

const player = {
  x: 100,
  y: GROUND - 60,
  width: 42,
  height: 60,
  velocityY: 0,
  grounded: true
};

function resetGame() {
  score = 0;
  speed = 6;
  obstacles = [];
  spawnTimer = 80;
  frame = 0;

  player.y = GROUND - player.height;
  player.velocityY = 0;
  player.grounded = true;

  scoreElement.textContent = "00000";
}

function startGame() {
  resetGame();
  running = true;
  overlay.classList.add("hidden");
}

function jump() {
  if (!running) return;

  if (player.grounded) {
    player.velocityY = JUMP;
    player.grounded = false;
  }
}

function spawnObstacle() {
  const height = 30 + Math.random() * 45;

  obstacles.push({
    x: WIDTH,
    y: GROUND - height,
    width: 25 + Math.random() * 20,
    height
  });
}

function update() {
  frame++;

  score += 0.1;
  speed = 6 + score / 150;

  scoreElement.textContent = String(Math.floor(score)).padStart(5, "0");

  player.velocityY += GRAVITY;
  player.y += player.velocityY;

  if (player.y >= GROUND - player.height) {
    player.y = GROUND - player.height;
    player.velocityY = 0;
    player.grounded = true;
  }

  spawnTimer--;

  if (spawnTimer <= 0) {
    spawnObstacle();
    spawnTimer = 60 + Math.random() * 70;
  }

  for (const obstacle of obstacles) {
    obstacle.x -= speed;

    const padding = 7;

    if (
      player.x + padding < obstacle.x + obstacle.width &&
      player.x + player.width - padding > obstacle.x &&
      player.y + padding < obstacle.y + obstacle.height &&
      player.y + player.height - padding > obstacle.y
    ) {
      gameOver();
      return;
    }
  }

  obstacles = obstacles.filter(o => o.x + o.width > 0);
}

function gameOver() {
  running = false;

  const finalScore = Math.floor(score);

  if (finalScore > best) {
    best = finalScore;
    localStorage.setItem("nightmarRunnerBest", best);
    bestElement.textContent = String(best).padStart(5, "0");
  }

  overlayTitle.textContent = "SIGNAL LOST";
  overlayText.textContent = `РЕЗУЛЬТАТ: ${finalScore}`;
  startButton.textContent = "RECONNECT";

  overlay.classList.remove("hidden");
}

function drawBackground() {
  ctx.fillStyle = "#0c0c0c";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // VHS-линии
  ctx.fillStyle = "rgba(255,255,255,0.025)";

  for (let y = 0; y < HEIGHT; y += 5) {
    ctx.fillRect(0, y, WIDTH, 1);
  }

  // Земля
  ctx.strokeStyle = "#800000";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  ctx.lineTo(WIDTH, GROUND);
  ctx.stroke();

  // Движение поверхности
  ctx.fillStyle = "#333";

  for (let x = -(frame * speed) % 40; x < WIDTH; x += 40) {
    ctx.fillRect(x, GROUND + 12, 20, 2);
  }
}

function drawPlayer() {
  // Персонаж в худи
  ctx.fillStyle = "#181818";
  ctx.fillRect(player.x, player.y + 15, player.width, 45);

  // Капюшон
  ctx.fillStyle = "#252525";
  ctx.fillRect(player.x + 4, player.y, 34, 30);

  // Лицо в тени
  ctx.fillStyle = "#050505";
  ctx.fillRect(player.x + 10, player.y + 9, 22, 17);

  // Красные глаза
  ctx.fillStyle = "#b30000";
  ctx.fillRect(player.x + 14, player.y + 16, 5, 3);
  ctx.fillRect(player.x + 25, player.y + 16, 5, 3);

  // NP на худи
  ctx.fillStyle = "#ddd";
  ctx.font = "bold 14px monospace";
  ctx.fillText("NP", player.x + 12, player.y + 47);
}

function drawObstacles() {
  for (const obstacle of obstacles) {
    ctx.fillStyle = "#700000";
    ctx.fillRect(
      obstacle.x,
      obstacle.y,
      obstacle.width,
      obstacle.height
    );

    ctx.strokeStyle = "#ff3030";
    ctx.strokeRect(
      obstacle.x,
      obstacle.y,
      obstacle.width,
      obstacle.height
    );
  }
}

function render() {
  drawBackground();
  drawPlayer();
  drawObstacles();
}

function loop() {
  if (running) {
    update();
  }

  render();
  requestAnimationFrame(loop);
}

startButton.addEventListener("click", startGame);

document.addEventListener("keydown", event => {
  if (event.code === "Space" || event.code === "ArrowUp") {
    event.preventDefault();

    if (running) {
      jump();
    } else {
      startGame();
    }
  }
});

canvas.addEventListener("pointerdown", () => {
  if (running) jump();
});

loop();
