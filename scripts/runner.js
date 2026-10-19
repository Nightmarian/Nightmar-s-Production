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
// ЧАСТИЦЫ И ЭФФЕКТЫ
// ===============================

let particles = [];
let stars = [];
let screenShake = 0;
let deathFlash = 0;

for (let i = 0; i < 80; i++) {
  stars.push({
    x: Math.random() * W,
    y: Math.random() * (GROUND - 50),
    size: Math.random() * 2 + 0.5,
    twinkleSpeed: Math.random() * 3 + 1,
    twinkleOffset: Math.random() * Math.PI * 2
  });
}

function spawnDeathParticles(x, y) {
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const force = 100 + Math.random() * 250;
    particles.push({
      x: x, y: y - 20,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force - 100,
      life: 0.5 + Math.random() * 0.8,
      maxLife: 0.5 + Math.random() * 0.8,
      size: 3 + Math.random() * 6,
      color: ["#ffffff", "#bbbbbb", "#555555", "#111111"][Math.floor(Math.random() * 4)],
      gravity: true
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.gravity) p.vy += 600 * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ===============================
// БИОМЫ И ДЕНЬ/НОЧЬ (РАНДОМНЫЕ ЛОКАЦИИ)
// ===============================

let currentBiome = "city";
let nextBiome = "desert";
let biomeDist = 0;
const BIOME_LENGTH = 12000;
const FADE_LENGTH = 4500; // Увеличенная длина для очень плавного перехода

const biomesData = {
  city: [ { speed: 0.05, data: [] }, { speed: 0.15, data: [] }, { speed: 0.45, data: [] } ],
  desert: [ { speed: 0.05, data: [] }, { speed: 0.15, data: [] }, { speed: 0.45, data: [] } ],
  forest: [ { speed: 0.05, data: [] }, { speed: 0.15, data: [] }, { speed: 0.45, data: [] } ]
};

biomesData.city.forEach((layer, index) => {
  let x = 0;
  while (x < 2500) {
    let w = 40 + Math.random() * 80;
    let h = 80 + Math.random() * (80 + index * 60);
    layer.data.push({ x, w, h, hasWindows: index > 0 && Math.random() > 0.3 });
    x += w + (Math.random() * 5);
  }
  layer.totalW = x;
});

biomesData.desert.forEach((layer, index) => {
  let x = 0;
  while (x < 2500) {
    let w = 150 + Math.random() * 200;
    let h = 40 + Math.random() * (50 + index * 40);
    layer.data.push({ x, w, h, isPyramid: Math.random() > 0.85 });
    x += w * 0.6; 
  }
  layer.totalW = x;
});

biomesData.forest.forEach((layer, index) => {
  let x = 0;
  while (x < 2500) {
    let w = 30 + Math.random() * 40 + index * 20;
    let h = 100 + Math.random() * (100 + index * 80);
    layer.data.push({ x, w, h });
    x += w * 0.8 + Math.random() * 30;
  }
  layer.totalW = x;
});

// Цвета для дня и ночи
const colorPalettes = {
  city: {
    night: { sky1: "#080c16", sky2: "#1c2533", g1: "#15181e", g2: "#080a0c", b1: "#0b101a", b2: "#2b3543" },
    day:   { sky1: "#6b8c9e", sky2: "#a0c0d1", g1: "#3c4a59", g2: "#25303b", b1: "#43576b", b2: "#8195a8" }
  },
  desert: {
    night: { sky1: "#160a05", sky2: "#33181c", g1: "#1e130d", g2: "#0a0503", b1: "#1a0b08", b2: "#3d1e15" },
    day:   { sky1: "#c48362", sky2: "#e8b894", g1: "#ab6b48", g2: "#7a462b", b1: "#b36b44", b2: "#e09c70" }
  },
  forest: {
    night: { sky1: "#050f0a", sky2: "#12261b", g1: "#0f1711", g2: "#050a06", b1: "#08140c", b2: "#183020" },
    day:   { sky1: "#5a8c72", sky2: "#91ba99", g1: "#3c5e4a", g2: "#22382a", b1: "#335e40", b2: "#6a9972" }
  }
};

function getRGB(c) {
  let hex = c.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map(x => x + x).join("");
  return hex.match(/.{2}/g).map(x => parseInt(x, 16));
}

function mixColor(a, b, t) {
  const c1 = getRGB(a), c2 = getRGB(b);
  return `rgb(${c1.map((v, i) => Math.round(v + (c2[i] - v) * t)).join(",")})`;
}

function mixPalette(p1, p2, t) {
  return {
    sky1: mixColor(p1.sky1, p2.sky1, t), sky2: mixColor(p1.sky2, p2.sky2, t),
    g1: mixColor(p1.g1, p2.g1, t), g2: mixColor(p1.g2, p2.g2, t),
    b1: mixColor(p1.b1, p2.b1, t), b2: mixColor(p1.b2, p2.b2, t)
  };
}

// ===============================
// ИГРОК И ЛОГИКА
// ===============================

const player = {
  x: 100, y: GROUND - 60, width: 30, height: 60,
  velocityY: 0, grounded: true, sliding: false
};

function jump() { if (!running || isDead) return; jumpBuffer = 0.15; }
function slide() { if (!running || isDead) return; slideHeld = true; }
function stopSlide() { slideHeld = false; player.sliding = false; }

function startGame() {
  running = true; isDead = false; score = 0; speed = 250;
  obstacles = []; spawnDistance = 450; worldDistance = 0;
  jumpBuffer = 0; slideHeld = false; particles = []; 
  screenShake = 0; deathFlash = 0;
  
  // Сброс биомов при новой игре
  biomeDist = 0;
  currentBiome = "city";
  nextBiome = "desert";

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
    best = result; localStorage.setItem("nightmarRunnerBest", best);
    bestElement.textContent = String(best).padStart(5, "0");
  }
  overlayTitle.textContent = "SYSTEM FAILURE";
  overlayText.textContent = `SCORE: ${result}`;
  startButton.textContent = "REBOOT";
  setTimeout(() => overlay.classList.remove("hidden"), 800);
}

// ===============================
// ОБНОВЛЕНИЕ И РАНДОМИЗАЦИЯ
// ===============================

function spawnObstacle() {
  const types = ["rock", "log", "drone", "spikes", "stump", "saw", "missile", "cactus"];
  const type = types[Math.floor(Math.random() * types.length)];
  let width, height, y;
  
  let extras = {}; 

  switch (type) {
    case "rock": width = 45; height = 35; y = GROUND - height; break;
    case "log": width = 75; height = 25; y = GROUND - height; break;
    case "spikes": width = 80; height = 28; y = GROUND - height; break;
    case "stump": width = 45; height = 40; y = GROUND - height; break;
    case "saw": width = 36; height = 36; y = GROUND - 20; break; 
    case "drone": width = 60; height = 30; y = GROUND - 65; break; 
    case "missile": width = 60; height = 22; y = GROUND - 55; break; 
    case "cactus": 
      width = 40; height = 65; y = GROUND - 65; 
      extras.thorns = [];
      for(let i=0; i<8; i++) {
        extras.thorns.push({ dx: 14 + Math.random()*10, dy: 10 + Math.random()*40 });
      }
      break; 
  }
  obstacles.push({ x: W + 30, y, width, height, type, ...extras });
}

function update(dt) {
  if (isDead) return;

  score += dt * 12;
  speed = Math.min(550, 250 + score * 0.4);
  const movement = speed * dt;
  worldDistance += movement;
  
  // Логика перехода и рандомизации Биомов
  biomeDist += movement;
  if (biomeDist >= BIOME_LENGTH) {
    biomeDist -= BIOME_LENGTH;
    currentBiome = nextBiome;
    const availableBiomes = ["city", "desert", "forest"].filter(b => b !== currentBiome);
    nextBiome = availableBiomes[Math.floor(Math.random() * availableBiomes.length)];
  }

  scoreElement.textContent = String(Math.floor(score)).padStart(5, "0");

  if (jumpBuffer > 0) {
    jumpBuffer -= dt;
    if (player.grounded) {
      player.velocityY = JUMP_FORCE;
      player.grounded = false; jumpBuffer = 0;
    }
  }

  player.velocityY += GRAVITY * dt;
  player.y += player.velocityY * dt;

  if (player.y >= GROUND - player.height) {
    player.y = GROUND - player.height;
    player.velocityY = 0; player.grounded = true;
  }

  player.sliding = slideHeld && player.grounded;

  spawnDistance -= movement;
  if (spawnDistance <= 0) {
    spawnObstacle();
    spawnDistance = 350 + Math.random() * 250;
  }

  for (const o of obstacles) {
    if (o.type === "missile") o.x -= (movement * 1.3);
    else o.x -= movement;

    const px = player.x + 8; 
    const pw = player.sliding ? 40 : 16;
    const py = player.sliding ? GROUND - 22 : player.y + 5;
    const ph = player.sliding ? 20 : player.height - 10;
    const margin = 5;

    const horizontalCollision = px < o.x + o.width - margin && px + pw > o.x + margin;
    const verticalCollision = py < o.y + o.height - margin && py + ph > o.y + margin;

    const needsSlide = (o.type === "drone" || o.type === "missile");
    
    if (needsSlide) {
      if (horizontalCollision && !player.sliding) { gameOver(); return; }
    } else {
      if (horizontalCollision && verticalCollision) { gameOver(); return; }
    }
  }

  obstacles = obstacles.filter(o => o.x + o.width > -50);
}

// ===============================
// РЕНДЕР ФОНА И ДНЯ/НОЧИ
// ===============================

function drawBiomeLayer(biomeType, layerIdx, offset, color, alpha, daylight) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  
  const layer = biomesData[biomeType][layerIdx];
  const totalW = layer.totalW;
  
  for (let i = 0; i < 2; i++) {
    ctx.save(); 
    ctx.translate(-offset + (i * totalW), 0);
    
    layer.data.forEach(b => {
      if (biomeType === "city") {
        ctx.fillRect(b.x, GROUND - b.h, b.w, b.h);
        // Окна светятся только ночью (daylight близко к 0)
        if (b.hasWindows && alpha > 0.1 && daylight < 0.4) {
          ctx.fillStyle = `rgba(255, 230, 120, ${alpha * (1 - daylight * 2)})`;
          for (let wy = GROUND - b.h + 10; wy < GROUND - 10; wy += 20) {
            for (let wx = b.x + 6; wx < b.x + b.w - 10; wx += 12) {
              const windowSeed = Math.abs(Math.sin(wx * 12.98 + wy * 78.23 + b.x)) * 43758.54;
              if (windowSeed % 1 > 0.5) ctx.fillRect(wx, wy, 5, 8);
            }
          }
          ctx.fillStyle = color; 
        }
      } 
      else if (biomeType === "desert") {
        ctx.beginPath();
        if (b.isPyramid) {
          ctx.moveTo(b.x, GROUND); ctx.lineTo(b.x + b.w/2, GROUND - b.h); ctx.lineTo(b.x + b.w, GROUND);
        } else {
          ctx.moveTo(b.x, GROUND);
          ctx.quadraticCurveTo(b.x + b.w/2, GROUND - b.h * 1.5, b.x + b.w, GROUND);
        }
        ctx.fill();
      }
      else if (biomeType === "forest") {
        ctx.beginPath();
        ctx.moveTo(b.x, GROUND);
        ctx.lineTo(b.x + b.w/2, GROUND - b.h);
        ctx.lineTo(b.x + b.w, GROUND);
        ctx.fill();
        ctx.fillRect(b.x + b.w/2 - 2, GROUND - b.h, 4, b.h);
      }
    });
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawBackground() {
  // Вычисляем время суток
  const dayCycle = (worldDistance / 25000) % 1;
  const daylight = (Math.cos(dayCycle * Math.PI * 2 + Math.PI) + 1) / 2; 

  // Расчет перехода биома с мягким ease-in-out сглаживанием
  let rawBlend = Math.max(0, (biomeDist - (BIOME_LENGTH - FADE_LENGTH)) / FADE_LENGTH);
  let blend = rawBlend * rawBlend * (3 - 2 * rawBlend); // Smoothstep

  // Получаем цвета палитры, смешанные по времени суток
  const c1 = mixPalette(colorPalettes[currentBiome].night, colorPalettes[currentBiome].day, daylight);
  const c2 = mixPalette(colorPalettes[nextBiome].night, colorPalettes[nextBiome].day, daylight);

  // Смешиваем текущий и следующий биом
  const finalColors = mixPalette(c1, c2, blend);

  const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND);
  skyGrad.addColorStop(0, finalColors.sky1);
  skyGrad.addColorStop(1, finalColors.sky2);
  ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, GROUND);

  // Луна и Солнце
  const celestialAngle = dayCycle * Math.PI * 2 - Math.PI / 2;
  const sunX = W/2 + Math.cos(celestialAngle) * (W * 0.4);
  const sunY = GROUND + 50 + Math.sin(celestialAngle) * (H * 0.7);
  if (sunY < GROUND + 50) {
    ctx.fillStyle = "#ffeedd"; ctx.shadowColor = "#ffcc00"; ctx.shadowBlur = 40 + Math.sin(worldDistance * 0.05) * 10;
    ctx.beginPath(); ctx.arc(sunX, sunY, 25, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
  }
  
  const moonAngle = celestialAngle + Math.PI;
  const moonX = W/2 + Math.cos(moonAngle) * (W * 0.4);
  const moonY = GROUND + 50 + Math.sin(moonAngle) * (H * 0.7);
  if (moonY < GROUND + 50) {
    ctx.fillStyle = "#ddeeff"; ctx.shadowColor = "#88aaff"; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.arc(moonX, moonY, 18, 0, Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
  }

  // Звезды (постепенно исчезают днем)
  if (daylight < 0.6) {
    for (const s of stars) {
      const twinkle = (Math.sin(worldDistance * 0.01 * s.twinkleSpeed + s.twinkleOffset) + 1) / 2;
      ctx.fillStyle = `rgba(255, 255, 240, ${(0.3 + twinkle * 0.5) * (1 - daylight/0.6)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
    }
  }

  const types = ["city", "desert", "forest"];
  for (let idx = 0; idx < 3; idx++) {
    const speed = biomesData.city[idx].speed;
    const offset = (worldDistance * speed) % biomesData.city[idx].totalW;
    
    const layerColor1 = mixColor(c1.b2, c1.b1, idx / 2);
    const layerColor2 = mixColor(c2.b2, c2.b1, idx / 2);

    if (blend < 1) drawBiomeLayer(currentBiome, idx, offset, layerColor1, 1 - blend, daylight);
    if (blend > 0) drawBiomeLayer(nextBiome, idx, offset, layerColor2, blend, daylight);
  }

  const groundGrad = ctx.createLinearGradient(0, GROUND, 0, H);
  groundGrad.addColorStop(0, finalColors.g1);
  groundGrad.addColorStop(1, finalColors.g2);
  ctx.fillStyle = groundGrad; ctx.fillRect(0, GROUND, W, H - GROUND);

  ctx.strokeStyle = mixColor("#252d3a", "#455667", 0.5);
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND); ctx.stroke();
}

// ===============================
// ПЕРСОНАЖ 
// ===============================

function drawCreepyFace(ctx, fx, fy) {
  ctx.fillStyle = "#000";
  ctx.beginPath(); ctx.arc(fx, fy, 11, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(255, 255, 255, 0.9)"; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.arc(fx - 4, fy - 3, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(fx + 4, fy - 3, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(fx - 10, fy + 2); 
  ctx.lineTo(fx - 7, fy + 5); ctx.lineTo(fx - 4, fy + 3);
  ctx.lineTo(fx - 1, fy + 6); ctx.lineTo(fx + 2, fy + 3);
  ctx.lineTo(fx + 5, fy + 6); ctx.lineTo(fx + 8, fy + 3);
  ctx.lineTo(fx + 10, fy + 2); 
  ctx.lineTo(fx + 7, fy + 8); ctx.lineTo(fx + 4, fy + 5);
  ctx.lineTo(fx + 1, fy + 9); ctx.lineTo(fx - 2, fy + 5);
  ctx.lineTo(fx - 5, y = fy + 8); ctx.lineTo(fx - 8, fy + 5);
  ctx.closePath(); ctx.fill();
}

// ИСПРАВЛЕНИЕ: Руки и Ноги теперь имеют разные оттенки контура
function drawLimb(x1, y1, x2, y2, x3, y3, isArm = false) {
  // Руки светлее (#7a8a9e), Ноги темнее (#556475)
  ctx.strokeStyle = isArm ? "#7a8a9e" : "#556475"; 
  ctx.lineWidth = 6; 
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); if(x3) ctx.lineTo(x3, y3); ctx.stroke();
  
  // Внутренняя заливка (тонкая, чтобы оставить красивый ободок)
  ctx.strokeStyle = "#15181c"; ctx.lineWidth = 3.5; 
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); if(x3) ctx.lineTo(x3, y3); ctx.stroke();
}

function drawPlayer() {
  if (isDead) return;

  const x = player.x;
  const y = player.y;
  ctx.save();

  const cx = x + 15;
  const cyAura = player.sliding ? GROUND - 15 : y + 30;
  
  const glow = ctx.createRadialGradient(cx, cyAura, 10, cx, cyAura, 50);
  glow.addColorStop(0, "rgba(220, 235, 255, 0.25)"); 
  glow.addColorStop(1, "rgba(220, 235, 255, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cyAura, 50, 0, Math.PI * 2); ctx.fill();

  const distFromGround = Math.max(0, GROUND - (y + player.height));
  const shadowAlpha = Math.max(0, 0.6 - distFromGround * 0.004);
  if (shadowAlpha > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
    ctx.beginPath(); ctx.ellipse(cx, GROUND + 2, player.sliding ? 28 : 16, 3, 0, 0, Math.PI * 2); ctx.fill();
  }

  const colorBody = "#262b33";
  const colorShoe = "#050505";
  ctx.lineCap = "round"; ctx.lineJoin = "round";

  if (player.sliding) {
    const cy = GROUND - 15;

    drawLimb(cx - 5, cy + 5, cx - 15, GROUND - 5, null, null, false); // Нога
    ctx.fillStyle = colorShoe; ctx.beginPath(); ctx.ellipse(cx - 15, GROUND - 3, 7, 3, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = colorBody; ctx.strokeStyle = "#556475"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(cx, cy, 18, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.fillStyle = "#eee"; ctx.font = "bold 10px 'Times New Roman', serif";
    ctx.save(); ctx.translate(cx, cy + 3); ctx.rotate(-0.2); ctx.fillText("NP", -7, 1); ctx.restore();

    drawLimb(cx + 5, cy + 5, cx + 25, GROUND - 3, null, null, false); // Нога
    ctx.fillStyle = colorShoe; ctx.beginPath(); ctx.ellipse(cx + 28, GROUND - 3, 8, 3.5, -0.2, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = colorBody; ctx.beginPath(); ctx.arc(cx + 20, cy - 8, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    drawCreepyFace(ctx, cx + 22, cy - 6);

  } else if (!player.grounded) {
    const cy = y + 30;

    drawLimb(cx - 2, cy + 10, cx - 12, cy + 15, cx - 8, cy + 25, false); // Нога
    ctx.fillStyle = colorShoe; ctx.beginPath(); ctx.ellipse(cx - 6, cy + 26, 7, 3.5, 0.4, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = colorBody; ctx.strokeStyle = "#556475"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(cx - 12, y + 15, 24, 28, 8); ctx.fill(); ctx.stroke();

    ctx.fillStyle = "#eee"; ctx.font = "bold 12px 'Times New Roman', serif";
    ctx.fillText("NP", cx - 8, cy + 10);

    drawLimb(cx + 2, cy + 10, cx + 12, cy + 5, cx + 8, cy + 20, false); // Нога
    ctx.fillStyle = colorShoe; ctx.beginPath(); ctx.ellipse(cx + 10, cy + 22, 7, 3.5, -0.2, 0, Math.PI * 2); ctx.fill();

    drawLimb(cx, cy - 5, cx - 15, cy - 10, null, null, true); // Рука (Светлее)
    drawLimb(cx, cy - 5, cx + 15, cy + 5, null, null, true); // Рука (Светлее)

    ctx.fillStyle = colorBody; ctx.beginPath(); ctx.arc(cx + 5, y + 12, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    drawCreepyFace(ctx, cx + 7, y + 14);

  } else {
    const phase = worldDistance / 20;
    const bobY = Math.abs(Math.sin(phase * 2)) * 3;
    const cy = y + 25 + bobY;
    const legSwing = Math.sin(phase) * 16;
    const armSwing = Math.cos(phase) * 12;

    drawLimb(cx, cy + 15, cx - legSwing, GROUND - 4, null, null, false); // Нога
    ctx.fillStyle = colorShoe; ctx.beginPath(); ctx.ellipse(cx - legSwing + 4, GROUND - 2, 8, 3.5, 0, 0, Math.PI * 2); ctx.fill();

    drawLimb(cx, cy - 5, cx + armSwing, cy + 10, null, null, true); // Рука (Светлее)

    ctx.fillStyle = colorBody; ctx.strokeStyle = "#556475"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(cx - 12, cy - 12, 24, 30, 8); ctx.fill(); ctx.stroke();

    ctx.fillStyle = "#eee"; ctx.font = "bold 12px 'Times New Roman', serif";
    ctx.fillText("NP", cx - 8, cy + 8);

    drawLimb(cx, cy + 15, cx + legSwing, GROUND - 4, null, null, false); // Нога
    ctx.fillStyle = colorShoe; ctx.beginPath(); ctx.ellipse(cx + legSwing + 4, GROUND - 2, 8, 3.5, 0, 0, Math.PI * 2); ctx.fill();

    drawLimb(cx, cy - 5, cx - armSwing, cy + 12, null, null, true); // Рука (Светлее)

    ctx.fillStyle = colorBody; ctx.beginPath(); ctx.arc(cx + 2, cy - 15, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    drawCreepyFace(ctx, cx + 4, cy - 13);
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
    if (o.type !== "drone" && o.type !== "missile") {
      ctx.beginPath(); ctx.ellipse(o.x + o.width / 2, GROUND + 2, o.width * 0.4, 4, 0, 0, Math.PI * 2); ctx.fill();
    }

    if (o.type === "rock") {
      ctx.fillStyle = "#4a4a4a"; ctx.beginPath(); ctx.moveTo(o.x, GROUND); ctx.lineTo(o.x + 10, o.y + 10); ctx.lineTo(o.x + 20, o.y); ctx.lineTo(o.x + 35, o.y + 8); ctx.lineTo(o.x + o.width, GROUND); ctx.fill();
      ctx.fillStyle = "#5a5a5a"; ctx.beginPath(); ctx.moveTo(o.x + 20, o.y); ctx.lineTo(o.x + 30, o.y + 15); ctx.lineTo(o.x + 12, GROUND); ctx.fill();
      ctx.fillStyle = "#2c3325"; ctx.beginPath(); ctx.moveTo(o.x, GROUND); ctx.lineTo(o.x + 12, GROUND - 6); ctx.lineTo(o.x + o.width, GROUND); ctx.fill();
    } 
    else if (o.type === "log") {
      ctx.fillStyle = "#3b2b20"; const r = o.height / 2; ctx.beginPath(); ctx.moveTo(o.x + r, o.y); ctx.lineTo(o.x + o.width - r, o.y); ctx.arc(o.x + o.width - r, o.y + r, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(o.x + r, o.y + o.height); ctx.arc(o.x + r, o.y + r, r, Math.PI / 2, -Math.PI / 2); ctx.fill();
      ctx.strokeStyle = "#150d08"; ctx.lineWidth = 2; for(let i=0; i<3; i++) { ctx.beginPath(); ctx.moveTo(o.x + 15, o.y + 5 + i*7); ctx.quadraticCurveTo(o.x + o.width/2, o.y + i*7, o.x + o.width - 15, o.y + 7 + i*7); ctx.stroke(); }
      ctx.fillStyle = "#7a5c40"; ctx.beginPath(); ctx.ellipse(o.x + o.width - r, o.y + r, 4, r - 2, 0, 0, Math.PI * 2); ctx.fill();
    } 
    else if (o.type === "spikes") {
      const count = 4, w = o.width / count;
      for (let i = 0; i < count; i++) {
        const sx = o.x + i * w;
        ctx.fillStyle = "#9ba4b5"; ctx.beginPath(); ctx.moveTo(sx, GROUND); ctx.lineTo(sx + w/2, o.y); ctx.lineTo(sx + w/2, GROUND); ctx.fill();
        ctx.fillStyle = "#4a5363"; ctx.beginPath(); ctx.moveTo(sx + w/2, o.y); ctx.lineTo(sx + w, GROUND); ctx.lineTo(sx + w/2, GROUND); ctx.fill();
        ctx.fillStyle = "#8b0000"; ctx.beginPath(); ctx.moveTo(sx + w/2, o.y); ctx.lineTo(sx + w/2 - 2, o.y + 6); ctx.lineTo(sx + w/2 + 2, o.y + 8); ctx.fill();
      }
      ctx.fillStyle = "#111"; ctx.fillRect(o.x, GROUND - 4, o.width, 4);
    } 
    else if (o.type === "stump") {
      ctx.fillStyle = "#2c1e16"; ctx.fillRect(o.x + 5, o.y + 8, o.width - 10, o.height - 8);
      ctx.beginPath(); ctx.moveTo(o.x + 5, GROUND - 10); ctx.lineTo(o.x - 5, GROUND); ctx.lineTo(o.x + 10, GROUND); ctx.fill();
      ctx.beginPath(); ctx.moveTo(o.x + o.width - 5, GROUND - 10); ctx.lineTo(o.x + o.width + 5, GROUND); ctx.lineTo(o.x + o.width - 10, GROUND); ctx.fill();
      ctx.fillStyle = "#6b4931"; ctx.beginPath(); ctx.ellipse(o.x + o.width / 2, o.y + 8, o.width / 2, 8, 0, 0, Math.PI * 2); ctx.fill();
    }
    else if (o.type === "drone") {
      const x = o.x, y = o.y, hover = Math.sin(worldDistance * 0.15) * 4;
      ctx.globalCompositeOperation = "lighter"; const laserGrad = ctx.createLinearGradient(x + 30, y + 15 + hover, x + 30, GROUND); laserGrad.addColorStop(0, "rgba(255, 0, 0, 0.3)"); laserGrad.addColorStop(1, "rgba(255, 0, 0, 0)"); ctx.fillStyle = laserGrad; ctx.beginPath(); ctx.moveTo(x + 30, y + 15 + hover); ctx.lineTo(x - 15, GROUND); ctx.lineTo(x + 75, GROUND); ctx.fill(); ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "#333"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 15, y + hover); ctx.lineTo(x + 15, y - 5 + hover); ctx.moveTo(x + 45, y + hover); ctx.lineTo(x + 45, y - 5 + hover); ctx.stroke();
      const spin = Math.sin(worldDistance) * 12; ctx.strokeStyle = "rgba(150, 200, 255, 0.6)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 15 - spin, y - 5 + hover); ctx.lineTo(x + 15 + spin, y - 5 + hover); ctx.moveTo(x + 45 - spin, y - 5 + hover); ctx.lineTo(x + 45 + spin, y - 5 + hover); ctx.stroke();
      ctx.fillStyle = "#161b22"; ctx.beginPath(); ctx.ellipse(x + 30, y + 10 + hover, 26, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff0033"; ctx.shadowColor = "#ff0000"; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(x + 30, y + 12 + hover, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
    else if (o.type === "saw") {
      const cx = o.x + o.width / 2;
      const cy = o.y + o.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate(worldDistance * 0.05); 
      ctx.fillStyle = "#8a94a5"; ctx.beginPath(); ctx.arc(0, 0, o.width/2 - 4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#aab2c0";
      for(let i=0; i<8; i++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(10, -5); ctx.lineTo(o.width/2 + 2, 0); ctx.lineTo(10, 5); ctx.fill(); }
      ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI*2); ctx.fill();
    }
    else if (o.type === "missile") {
      const x = o.x, y = o.y;
      const firePhase = (Math.sin(worldDistance * 0.5 + o.x) + 1) * 7.5;
      
      ctx.fillStyle = "#ff6600"; ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.lineTo(x - 20 - firePhase, y + o.height/2); ctx.lineTo(x, y + o.height - 5); ctx.fill();
      ctx.fillStyle = "#ffcc00"; ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x - 10 - firePhase/2, y + o.height/2); ctx.lineTo(x, y + o.height - 8); ctx.fill();
      ctx.fillStyle = "#444"; ctx.beginPath(); ctx.roundRect(x, y, o.width - 15, o.height, 10); ctx.fill();
      ctx.fillStyle = "#cc0000"; ctx.beginPath(); ctx.moveTo(x + o.width - 15, y); ctx.lineTo(x + o.width, y + o.height/2); ctx.lineTo(x + o.width - 15, y + o.height); ctx.fill();
      ctx.fillStyle = "#222"; ctx.fillRect(x + 10, y + 4, o.width - 30, 4);
    }
    else if (o.type === "cactus") {
      const x = o.x, y = o.y;
      ctx.fillStyle = "#1e3b22"; 
      ctx.strokeStyle = "#0f1e11";
      ctx.lineWidth = 2;
      
      ctx.beginPath(); ctx.roundRect(x + 12, y, 16, o.height, 8); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(x, y + 20, 16, 12, 6); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(x, y + 10, 12, 16, 6); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(x + 24, y + 30, 16, 12, 6); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(x + 28, y + 15, 12, 20, 6); ctx.fill(); ctx.stroke();
      
      ctx.fillStyle = "#a3b89e";
      for(let t of o.thorns) {
        ctx.fillRect(x + t.dx, y + t.dy, 2, 2);
      }
    }
    
    ctx.restore();
  }
}

// ===============================
// ПОСТ-ОБРАБОТКА
// ===============================

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife); 
    ctx.fillStyle = p.color;
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

  drawBackground(); 
  drawPlayer(); 
  drawObstacles();
  drawParticles(); 

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
  if (!running && !isDead) { startGame(); return; }
  if (e.code === "ArrowDown") slide();
  else if (!e.repeat) jump();
});

document.addEventListener("keyup", e => { if (e.code === "ArrowDown") { e.preventDefault(); stopSlide(); } });
window.addEventListener("blur", stopSlide);

jumpButton.addEventListener("pointerdown", e => { e.preventDefault(); jump(); });
slideButton.addEventListener("pointerdown", e => { e.preventDefault(); slide(); slideButton.setPointerCapture(e.pointerId); });
slideButton.addEventListener("pointerup", stopSlide); 
slideButton.addEventListener("pointercancel", stopSlide); 
slideButton.addEventListener("lostpointercapture", stopSlide);

startButton.addEventListener("click", startGame);
requestAnimationFrame(loop);
