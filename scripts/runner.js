// ==========================================
// NIGHTMAR RUNNER - Full Engine Script
// ==========================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// Game Dimensions & Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 450;
const GROUND = 370;

canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// Audio Context (Synthesized sound effects)
let audioCtx = null;
function playSound(freq, type, duration) {
    if (!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch(e) {}
}

// Game State
let gameState = 'start'; // 'start', 'playing', 'gameover'
let score = 0;
let highScore = localStorage.getItem('nightmar_highscore') || 0;
let gameSpeed = 6;
let frameCount = 0;

// Colors & Color Helper
function parseColor(colorStr) {
    if (!colorStr) return [0, 0, 0, 1];
    if (colorStr.startsWith('#')) {
        let hex = colorStr.slice(1);
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        return [
            parseInt(hex.slice(0, 2), 16),
            parseInt(hex.slice(2, 4), 16),
            parseInt(hex.slice(4, 6), 16),
            1
        ];
    }
    if (colorStr.startsWith('rgb')) {
        const parts = colorStr.match(/[\d.]+/g);
        return [
            parseFloat(parts[0]),
            parseFloat(parts[1]),
            parseFloat(parts[2]),
            parts[3] !== undefined ? parseFloat(parts[3]) : 1
        ];
    }
    return [0, 0, 0, 1];
}

function mixColor(c1, c2, factor) {
    const rgb1 = parseColor(c1);
    const rgb2 = parseColor(c2);
    const f = Math.max(0, Math.min(1, factor));
    const r = Math.round(rgb1[0] + (rgb2[0] - rgb1[0]) * f);
    const g = Math.round(rgb1[1] + (rgb2[1] - rgb1[1]) * f);
    const b = Math.round(rgb1[2] + (rgb2[2] - rgb1[2]) * f);
    const a = rgb1[3] + (rgb2[3] - rgb1[3]) * f;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Biomes System
const BIOMES = {
    city: {
        skyTop: '#0d1b2a', skyBottom: '#1b263b',
        ground: '#2b2d42', line: '#4895ef',
        name: 'Neon City'
    },
    desert: {
        skyTop: '#2b1e3a', skyBottom: '#6b304b',
        ground: '#d4a373', line: '#faedcd',
        name: 'Crimson Desert'
    },
    forest: {
        skyTop: '#051923', skyBottom: '#003554',
        ground: '#132a13', line: '#31572c',
        name: 'Dark Forest'
    }
};

let currentBiomeKey = 'city';
let nextBiomeKey = 'desert';
let biomeTransitionProgress = 1;
const BIOME_DURATION = 1000;
let biomeTimer = 0;

// Day / Night Cycle (0.0 to 1.0)
let dayCycle = 0;
const DAY_DURATION = 2400; // frames per full day/night

// Player Object
const player = {
    x: 100,
    y: GROUND - 60,
    width: 36,
    height: 60,
    velocityY: 0,
    gravity: 0.75,
    jumpStrength: -13.5,
    isJumping: false,
    jumpCount: 0,
    maxJumps: 2,
    isDucking: false,
    isRiding: false,
    normalHeight: 60,
    duckHeight: 32,
    animFrame: 0
};

// Arrays for Game World
let obstacles = [];
let particles = [];
let obstacleTimer = 0;
let minObstacleInterval = 90;

// Controls State
const keys = { jump: false, duck: false };

// -------------------------------------------------------------
// EVENT LISTENERS & INPUT
// -------------------------------------------------------------
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
        if (!keys.jump) handleJump();
        keys.jump = true;
        e.preventDefault();
    }
    if (e.code === 'ArrowDown') {
        handleDuck(true);
        keys.duck = true;
        e.preventDefault();
    }
});

window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') keys.jump = false;
    if (e.code === 'ArrowDown') {
        handleDuck(false);
        keys.duck = false;
    }
});

// Mobile Controls
const btnJump = document.getElementById('btn-jump');
const btnDuck = document.getElementById('btn-duck');
const btnStart = document.getElementById('start-btn');
const btnRestart = document.getElementById('restart-btn');

if (btnJump) {
    btnJump.addEventListener('touchstart', (e) => { e.preventDefault(); handleJump(); });
    btnJump.addEventListener('mousedown', (e) => { e.preventDefault(); handleJump(); });
}
if (btnDuck) {
    btnDuck.addEventListener('touchstart', (e) => { e.preventDefault(); handleDuck(true); });
    btnDuck.addEventListener('touchend', (e) => { e.preventDefault(); handleDuck(false); });
    btnDuck.addEventListener('mousedown', (e) => { e.preventDefault(); handleDuck(true); });
    btnDuck.addEventListener('mouseup', (e) => { e.preventDefault(); handleDuck(false); });
}

if (btnStart) btnStart.addEventListener('click', startGame);
if (btnRestart) btnRestart.addEventListener('click', startGame);

function handleJump() {
    if (gameState !== 'playing') return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    if (player.grounded || player.isRiding || player.jumpCount < player.maxJumps) {
        player.velocityY = player.jumpStrength;
        player.isJumping = true;
        player.grounded = false;
        player.isRiding = false;
        player.jumpCount++;
        playSound(350 + player.jumpCount * 100, 'square', 0.15);
    }
}

function handleDuck(isDucking) {
    if (gameState !== 'playing') return;
    if (isDucking && !player.isDucking) {
        player.isDucking = true;
        if (player.grounded) {
            player.y += (player.normalHeight - player.duckHeight);
        }
        player.height = player.duckHeight;
    } else if (!isDucking && player.isDucking) {
        player.isDucking = false;
        player.y -= (player.normalHeight - player.duckHeight);
        player.height = player.normalHeight;
    }
}

// -------------------------------------------------------------
// GAME LOGIC
// -------------------------------------------------------------
function startGame() {
    gameState = 'playing';
    score = 0;
    gameSpeed = 6.5;
    frameCount = 0;
    obstacles = [];
    particles = [];
    
    player.y = GROUND - player.normalHeight;
    player.velocityY = 0;
    player.isJumping = false;
    player.isDucking = false;
    player.height = player.normalHeight;
    player.jumpCount = 0;
    player.grounded = true;
    player.isRiding = false;

    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function gameOver() {
    gameState = 'gameover';
    playSound(120, 'sawtooth', 0.4);
    
    // Death Explosion Particles ONLY
    for (let i = 0; i < 35; i++) {
        particles.push({
            x: player.x + player.width / 2,
            y: player.y + player.height / 2,
            vx: (Math.random() - 0.5) * 12,
            vy: (Math.random() - 0.5) * 12,
            size: Math.random() * 6 + 2,
            color: Math.random() > 0.5 ? '#ff4d4d' : '#ffffff',
            life: 1
        });
    }

    if (score > highScore) {
        highScore = Math.floor(score);
        localStorage.setItem('nightmar_highscore', highScore);
    }

    document.getElementById('final-score').innerText = Math.floor(score);
    document.getElementById('high-score').innerText = highScore;
    document.getElementById('gameover-screen').classList.remove('hidden');
}

// -------------------------------------------------------------
// OBSTACLE SPAGHETTI & GENERATION
// -------------------------------------------------------------
function spawnObstacle() {
    const types = ['rock', 'log', 'spikes', 'stump', 'saw', 'drone', 'missile', 'cactus'];
    const type = types[Math.floor(Math.random() * types.length)];

    let obs = {
        type: type,
        x: CANVAS_WIDTH + 50,
        y: GROUND,
        width: 35,
        height: 35,
        rotation: 0,
        thorns: []
    };

    if (type === 'rock') {
        obs.width = 40; obs.height = 30; obs.y = GROUND - 30;
    } else if (type === 'log') {
        obs.width = 50; obs.height = 25; obs.y = GROUND - 25;
    } else if (type === 'spikes') {
        obs.width = 45; obs.height = 20; obs.y = GROUND - 20;
    } else if (type === 'stump') {
        obs.width = 35; obs.height = 40; obs.y = GROUND - 40;
    } else if (type === 'saw') {
        obs.width = 40; obs.height = 40; obs.y = GROUND - 40;
    } else if (type === 'drone') {
        obs.width = 45; obs.height = 30; obs.y = GROUND - 90 - Math.random() * 40;
    } else if (type === 'missile') {
        obs.width = 65; obs.height = 24; obs.y = GROUND - 75 - Math.random() * 50;
    } else if (type === 'cactus') {
        obs.width = 30; obs.height = 55; obs.y = GROUND - 55;
        // Pre-generate thorns to prevent frame flickering
        for (let i = 0; i < 6; i++) {
            obs.thorns.push({
                x: (Math.random() - 0.5) * 25,
                y: Math.random() * 45,
                length: 6 + Math.random() * 4,
                angle: (Math.random() - 0.5) * Math.PI
            });
        }
    }

    obstacles.push(obs);
}

function updatePlayer() {
    // Apply gravity
    player.velocityY += player.gravity;
    player.y += player.velocityY;

    // Reset riding state for check
    player.isRiding = false;

    // Platform & Riding Logic (Missile)
    obstacles.forEach(obs => {
        if (obs.type === 'missile') {
            const playerFeet = player.y + player.height;
            const missileTop = obs.y;
            const isOverMissile = (player.x + player.width > obs.x + 5) && (player.x < obs.x + obs.width - 5);

            // Stable snap to missile top when coming from above
            if (isOverMissile && player.velocityY >= 0 && playerFeet <= missileTop + 25 && playerFeet >= missileTop - 15) {
                player.y = missileTop - player.height;
                player.velocityY = 0;
                player.grounded = true;
                player.isRiding = true;
                player.jumpCount = 0; // Grants jump capability off the missile!
            }
        }
    });

    // Check ground collision
    if (!player.isRiding && player.y + player.height >= GROUND) {
        player.y = GROUND - player.height;
        player.velocityY = 0;
        player.grounded = true;
        player.jumpCount = 0;
    } else if (!player.isRiding) {
        player.grounded = false;
    }
}

function update() {
    if (gameState !== 'playing') return;

    frameCount++;
    score += 0.15;
    gameSpeed += 0.0008;

    // Biome Cycle Logic
    biomeTimer++;
    if (biomeTimer > BIOME_DURATION) {
        biomeTimer = 0;
        const keysList = Object.keys(BIOMES);
        currentBiomeKey = nextBiomeKey;
        let nextIdx = (keysList.indexOf(currentBiomeKey) + 1) % keysList.length;
        nextBiomeKey = keysList[nextIdx];
        biomeTransitionProgress = 0;
    }

    if (biomeTransitionProgress < 1) {
        biomeTransitionProgress += 0.002;
    }

    // Day / Night Cycle (0.0 - 1.0)
    dayCycle = (frameCount % DAY_DURATION) / DAY_DURATION;

    // Update Player
    updatePlayer();

    // Spawn Obstacles
    obstacleTimer++;
    if (obstacleTimer > minObstacleInterval) {
        spawnObstacle();
        obstacleTimer = 0;
        minObstacleInterval = Math.max(50, 100 - Math.floor(score / 50) + (Math.random() * 30 - 15));
    }

    // Update Obstacles & Collisions
    for (let i = obstacles.length - 1; i >= 0; i--) {
        let obs = obstacles[i];

        // Unique obstacle speeds
        if (obs.type === 'missile') obs.x -= (gameSpeed + 4);
        else if (obs.type === 'drone') obs.x -= (gameSpeed + 1.5);
        else obs.x -= gameSpeed;

        if (obs.type === 'saw') obs.rotation += 0.15;

        // Clean out of bounds
        if (obs.x + obs.width < -60) {
            obstacles.splice(i, 1);
            continue;
        }

        // Precise Collision Detection
        let isRidingThis = (player.isRiding && (player.x + player.width > obs.x) && (player.x < obs.x + obs.width));
        
        if (!isRidingThis) {
            const pad = 8; // Softened hitboxes
            if (player.x + pad < obs.x + obs.width &&
                player.x + player.width - pad > obs.x &&
                player.y + pad < obs.y + obs.height &&
                player.y + player.height - pad > obs.y) {
                gameOver();
            }
        }
    }

    // Update Particles (Only Death Explosion)
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.03;
        if (p.life <= 0) particles.splice(i, 1);
    }

    // Update Score Display UI
    document.getElementById('score').innerText = Math.floor(score);
}

// -------------------------------------------------------------
// RENDERERS & RENDERING ENGINE
// -------------------------------------------------------------

function getBiomeColors() {
    const b1 = BIOMES[currentBiomeKey];
    const b2 = BIOMES[nextBiomeKey];
    const p = Math.min(1, biomeTransitionProgress);

    return {
        skyTop: mixColor(b1.skyTop, b2.skyTop, p),
        skyBottom: mixColor(b1.skyBottom, b2.skyBottom, p),
        ground: mixColor(b1.ground, b2.ground, p),
        line: mixColor(b1.line, b2.line, p)
    };
}

function drawBackground() {
    const colors = getBiomeColors();

    // Sky Gradient
    let skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND);
    skyGrad.addColorStop(0, colors.skyTop);
    skyGrad.addColorStop(1, colors.skyBottom);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, CANVAS_WIDTH, GROUND);

    // Sun / Moon Cycle Calculation
    const sunAngle = dayCycle * Math.PI * 2;
    const sunX = CANVAS_WIDTH / 2 + Math.cos(sunAngle) * 320;
    const sunY = 200 + Math.sin(sunAngle) * 160;

    // Sun
    if (sunY < GROUND + 50) {
        ctx.save();
        ctx.shadowColor = '#ffea00';
        ctx.shadowBlur = 25;
        ctx.fillStyle = '#fff4cc';
        ctx.beginPath();
        ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Moon (opposite to sun)
    const moonX = CANVAS_WIDTH / 2 + Math.cos(sunAngle + Math.PI) * 320;
    const moonY = 200 + Math.sin(sunAngle + Math.PI) * 160;
    if (moonY < GROUND + 50) {
        ctx.save();
        ctx.shadowColor = '#a2d2ff';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#e0e1dd';
        ctx.beginPath();
        ctx.arc(moonX, moonY, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Parallax Environment Layer
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    if (currentBiomeKey === 'city') {
        for (let i = 0; i < 10; i++) {
            let bx = (i * 90 - (frameCount * 1.5) % 90);
            let bh = 100 + (Math.sin(i * 12) * 50);
            ctx.fillRect(bx, GROUND - bh, 70, bh);

            // Deterministic windows (no flickering)
            ctx.fillStyle = 'rgba(255, 230, 150, 0.15)';
            for (let wy = GROUND - bh + 10; wy < GROUND - 10; wy += 20) {
                if ((Math.sin(i * 99 + wy) * 10000) % 1 > 0.4) {
                    ctx.fillRect(bx + 15, wy, 12, 10);
                    ctx.fillRect(bx + 40, wy, 12, 10);
                }
            }
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        }
    } else if (currentBiomeKey === 'desert') {
        ctx.beginPath();
        for (let i = 0; i <= CANVAS_WIDTH; i += 40) {
            let dy = GROUND - 40 + Math.sin((i + frameCount * 2) * 0.01) * 20;
            if (i === 0) ctx.moveTo(i, dy);
            else ctx.lineTo(i, dy);
        }
        ctx.lineTo(CANVAS_WIDTH, GROUND);
        ctx.lineTo(0, GROUND);
        ctx.fill();
    } else if (currentBiomeKey === 'forest') {
        for (let i = 0; i < 12; i++) {
            let tx = (i * 80 - (frameCount * 1.8) % 80);
            ctx.beginPath();
            ctx.moveTo(tx, GROUND);
            ctx.lineTo(tx + 30, GROUND - 110);
            ctx.lineTo(tx + 60, GROUND);
            ctx.closePath();
            ctx.fill();
        }
    }

    // Ground Floor
    ctx.fillStyle = colors.ground;
    ctx.fillRect(0, GROUND, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND);

    // Highlight Grid Line
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.lineTo(CANVAS_WIDTH, GROUND);
    ctx.stroke();
}

// -------------------------------------------------------------
// DRAW CHARACTER & OBSTACLES
// -------------------------------------------------------------
function drawPlayer() {
    ctx.save();

    // Blueish/Soft Glow Aura so player never blends into darkness
    const centerX = player.x + player.width / 2;
    const centerY = player.y + player.height / 2;
    let aura = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, 45);
    aura.addColorStop(0, 'rgba(100, 200, 255, 0.3)');
    aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 45, 0, Math.PI * 2);
    ctx.fill();

    // Body dimensions & ducking adjustments
    const px = player.x;
    const py = player.y;
    const pw = player.width;
    const ph = player.height;

    // Outer Hood / Cloak (Dark Grey/Black)
    ctx.fillStyle = '#121418';
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, player.isDucking ? [10, 10, 5, 5] : [14, 14, 6, 6]);
    ctx.fill();

    // Distinct Rim Lighting (Arm & Leg Lines)
    ctx.strokeStyle = '#6d8096';
    ctx.lineWidth = 2.5;

    // Back Rim Highlight
    ctx.beginPath();
    ctx.moveTo(px + 2, py + 10);
    ctx.lineTo(px + 2, py + ph - 5);
    ctx.stroke();

    // Legs / Arm Silhouette
    ctx.strokeStyle = '#4a5768';
    if (!player.isDucking) {
        let legAnim = Math.sin(frameCount * 0.3) * 6;
        ctx.beginPath();
        ctx.moveTo(px + 10, py + ph - 15);
        ctx.lineTo(px + 8 - legAnim, py + ph);
        ctx.moveTo(px + pw - 10, py + ph - 15);
        ctx.lineTo(px + pw - 8 + legAnim, py + ph);
        ctx.stroke();
    }

    // Face Inner Shadow (Void Face)
    ctx.fillStyle = '#050608';
    const headY = player.isDucking ? py + 4 : py + 8;
    ctx.beginPath();
    ctx.ellipse(px + pw - 12, headY + 12, 10, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Glowing White Eyes
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px + pw - 9, headY + 9, 2.5, 0, Math.PI * 2);
    ctx.arc(px + pw - 15, headY + 9, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Glowing Zigzag Toothy Smile
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    const mouthY = headY + 17;
    ctx.moveTo(px + pw - 18, mouthY);
    ctx.lineTo(px + pw - 15, mouthY + 3);
    ctx.lineTo(px + pw - 12, mouthY);
    ctx.lineTo(px + pw - 9, mouthY + 3);
    ctx.lineTo(px + pw - 6, mouthY);
    ctx.stroke();

    // Reset shadow for logo
    ctx.shadowBlur = 0;

    // Small Serif "NP" Logo on Chest
    ctx.fillStyle = '#c5d3e8';
    ctx.font = 'bold 9px serif';
    const logoY = player.isDucking ? py + ph - 8 : py + 34;
    ctx.fillText('NP', px + 8, logoY);

    ctx.restore();
}

function drawObstacles() {
    obstacles.forEach(obs => {
        ctx.save();

        // Distinct blue glow aura so obstacles are clearly visible at night
        ctx.shadowColor = 'rgba(120, 190, 255, 0.65)';
        ctx.shadowBlur = 12;

        if (obs.type === 'rock') {
            ctx.fillStyle = '#5c677d';
            ctx.beginPath();
            ctx.moveTo(obs.x, obs.y + obs.height);
            ctx.lineTo(obs.x + 10, obs.y + 5);
            ctx.lineTo(obs.x + obs.width - 8, obs.y);
            ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
            ctx.closePath();
            ctx.fill();
        } else if (obs.type === 'log') {
            ctx.fillStyle = '#7f5539';
            ctx.beginPath();
            ctx.roundRect(obs.x, obs.y, obs.width, obs.height, 6);
            ctx.fill();
            ctx.fillStyle = '#9c6644';
            ctx.fillRect(obs.x + 5, obs.y + 4, obs.width - 10, 4);
        } else if (obs.type === 'spikes') {
            ctx.fillStyle = '#d62828';
            let count = 4;
            let sw = obs.width / count;
            for (let i = 0; i < count; i++) {
                ctx.beginPath();
                ctx.moveTo(obs.x + i * sw, obs.y + obs.height);
                ctx.lineTo(obs.x + i * sw + sw / 2, obs.y);
                ctx.lineTo(obs.x + (i + 1) * sw, obs.y + obs.height);
                ctx.fill();
            }
        } else if (obs.type === 'stump') {
            ctx.fillStyle = '#6b705c';
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            ctx.fillStyle = '#a5a58d';
            ctx.beginPath();
            ctx.ellipse(obs.x + obs.width / 2, obs.y + 4, obs.width / 2, 4, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (obs.type === 'saw') {
            ctx.translate(obs.x + obs.width / 2, obs.y + obs.height / 2);
            ctx.rotate(obs.rotation);
            ctx.fillStyle = '#adb5bd';
            ctx.beginPath();
            ctx.arc(0, 0, obs.width / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#495057';
            for (let i = 0; i < 8; i++) {
                ctx.rotate(Math.PI / 4);
                ctx.fillRect(0, -obs.width / 2 - 4, 4, 8);
            }
        } else if (obs.type === 'drone') {
            ctx.fillStyle = '#3a86ff';
            ctx.beginPath();
            ctx.roundRect(obs.x, obs.y, obs.width, obs.height - 10, 8);
            ctx.fill();
            // Propellers
            ctx.fillStyle = '#80ed99';
            ctx.fillRect(obs.x - 4, obs.y - 4, 14, 4);
            ctx.fillRect(obs.x + obs.width - 10, obs.y - 4, 14, 4);
        } else if (obs.type === 'missile') {
            // Missile body
            ctx.fillStyle = '#ff0054';
            ctx.beginPath();
            ctx.roundRect(obs.x, obs.y, obs.width - 12, obs.height, [6, 0, 0, 6]);
            ctx.fill();
            // Cone tip
            ctx.fillStyle = '#ffbd00';
            ctx.beginPath();
            ctx.moveTo(obs.x + obs.width - 12, obs.y);
            ctx.lineTo(obs.x + obs.width, obs.y + obs.height / 2);
            ctx.lineTo(obs.x + obs.width - 12, obs.y + obs.height);
            ctx.fill();
            // Thruster fire tail
            ctx.fillStyle = '#ff5400';
            ctx.beginPath();
            ctx.moveTo(obs.x, obs.y + 4);
            ctx.lineTo(obs.x - 12 - Math.random() * 6, obs.y + obs.height / 2);
            ctx.lineTo(obs.x, obs.y + obs.height - 4);
            ctx.fill();
        } else if (obs.type === 'cactus') {
            ctx.fillStyle = '#2a9d8f';
            ctx.beginPath();
            ctx.roundRect(obs.x + 8, obs.y, 14, obs.height, 6);
            ctx.fill();
            // Branches
            ctx.fillRect(obs.x, obs.y + 15, 12, 8);
            ctx.fillRect(obs.x, obs.y + 8, 8, 15);
            ctx.fillRect(obs.x + 18, obs.y + 25, 12, 8);
            ctx.fillRect(obs.x + 22, obs.y + 18, 8, 15);
            // Pre-cached thorns (No random frame flicker)
            ctx.strokeStyle = '#e9c46a';
            ctx.lineWidth = 1.5;
            obs.thorns.forEach(t => {
                ctx.beginPath();
                ctx.moveTo(obs.x + 15 + t.x, obs.y + t.y);
                ctx.lineTo(obs.x + 15 + t.x + Math.cos(t.angle) * t.length, obs.y + t.y + Math.sin(t.angle) * t.length);
                ctx.stroke();
            });
        }

        ctx.restore();
    });
}

function drawParticles() {
    particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });
}

// Main Render Loop
function draw() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    drawBackground();
    drawObstacles();
    drawPlayer();
    drawParticles();
}

// Master Loop Execution
function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// Start Game Loop Engine
requestAnimationFrame(loop);
