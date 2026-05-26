const GAME_DURATION_SECONDS = 60;
const STORAGE_KEY = "cosmoz_invoice_defender_highscores";

const registrationPanel = document.getElementById("registration-panel");
const gamePanel = document.getElementById("game-panel");
const resultPanel = document.getElementById("result-panel");
const registrationForm = document.getElementById("registration-form");
const formError = document.getElementById("form-error");
const cosmozButton = document.getElementById("toggle-cosmoz");
const cosmozGameButton = document.getElementById("toggle-cosmoz-game");
const playAgainButton = document.getElementById("play-again");
const drawWinnerButton = document.getElementById("draw-winner");
const winnerAnnouncement = document.getElementById("winner-announcement");
const hudPlayer = document.getElementById("hud-player");
const hudScore = document.getElementById("hud-score");
const hudTime = document.getElementById("hud-time");
const hudCosmoz = document.getElementById("hud-cosmoz");
const hudMoney = document.getElementById("hud-money");
const hudLives = document.getElementById("hud-lives");
const hudEfficiency = document.getElementById("hud-efficiency");
const resultSummary = document.getElementById("result-summary");
const resultStats = document.getElementById("result-stats");
const highscoreBody = document.getElementById("highscore-body");
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

const state = {
  playerProfile: null,
  cosmozMode: false,
  running: false,
  score: 0,
  money: 0,
  timeLeft: GAME_DURATION_SECONDS,
  freezeTime: 0,
  bullets: [],
  invoices: [],
  manualInvoices: [],
  bluffInvoices: [],
  hazards: [],
  keys: { left: false, right: false, thrust: false, shoot: false },
  spawnClock: 0,
  manualClock: 0,
  bluffClock: 0,
  hazardClock: 0,
  shotCooldown: 0,
  autoShotCooldown: 0,
  flameTick: 0,
  reviewedCount: 0,
  lives: 3,
  bluffShots: 0,
  lastFrame: 0,
  lastSteerDirection: 0,
  ship: { x: canvas.width / 2, y: canvas.height / 2, vx: 0, vy: 0, angle: -Math.PI / 2, radius: 18, maxSpeed: 320 },
  stars: Array.from({ length: 120 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    z: 0.3 + Math.random() * 1.5,
  })),
};

let audioContext;
let engineSoundPlaying = false;
const hazardReasons = ["Wrong order no.", "Missing supplier", "Bad invoice date", "Amount mismatch"];
const manualReasons = ["Need approver", "PO missing", "Contract check"];
const soundProfiles = [
  { name: "Classic", shootWave: "sawtooth", shootStartHz: 980, shootEndHz: 320, shootPeak: 0.12, hitPeak: 0.18 },
  { name: "Loud Expo", shootWave: "square", shootStartHz: 1180, shootEndHz: 360, shootPeak: 0.2, hitPeak: 0.28 },
  { name: "Soft Office", shootWave: "triangle", shootStartHz: 820, shootEndHz: 280, shootPeak: 0.075, hitPeak: 0.11 },
];
let soundProfileIndex = 0;
const soundProfileButton = document.getElementById("sound-profile");

function ensureAudio() {
  if (!audioContext) audioContext = new window.AudioContext();
  if (audioContext.state === "suspended") audioContext.resume();
}

function playShootSound() {
  if (!audioContext) return;
  const profile = soundProfiles[soundProfileIndex];
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  osc.type = profile.shootWave;
  osc.frequency.setValueAtTime(profile.shootStartHz, now);
  osc.frequency.exponentialRampToValueAtTime(profile.shootEndHz, now + 0.07);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1800, now);
  filter.Q.value = 2;
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(profile.shootPeak, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + 0.09);
}

function playHitSound() {
  if (!audioContext) return;
  const profile = soundProfiles[soundProfileIndex];
  const now = audioContext.currentTime;
  const oscA = audioContext.createOscillator();
  const oscB = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscA.type = "triangle";
  oscA.frequency.setValueAtTime(420, now);
  oscA.frequency.exponentialRampToValueAtTime(840, now + 0.08);
  oscB.type = "square";
  oscB.frequency.setValueAtTime(210, now);
  oscB.frequency.exponentialRampToValueAtTime(460, now + 0.08);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(profile.hitPeak, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
  oscA.connect(gain);
  oscB.connect(gain);
  gain.connect(audioContext.destination);
  oscA.start(now);
  oscB.start(now);
  oscA.stop(now + 0.14);
  oscB.stop(now + 0.14);
}

function playCrashSound() {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
  filter.type = "highpass";
  filter.frequency.setValueAtTime(100, now);
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}

function playMarioDeath() {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const notes = [328, 246, 246, 246, 164, 246, 328];
  const durations = [0.15, 0.15, 0.15, 0.3, 0.15, 0.15, 0.6];
  let time = now;
  notes.forEach((freq, i) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + durations[i]);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(time);
    osc.stop(time + durations[i]);
    time += durations[i];
  });
}

function playEngineSound() {
  if (!audioContext || engineSoundPlaying) return;
  engineSoundPlaying = true;
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(180, now);
  filter.type = "highpass";
  filter.frequency.setValueAtTime(100, now);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.04, now + 0.06);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + 0.14);
  setTimeout(() => { engineSoundPlaying = false; }, 140);
}

function setPanels(panelName) {
  registrationPanel.classList.toggle("hidden", panelName !== "registration");
  gamePanel.classList.toggle("hidden", panelName !== "game");
  resultPanel.classList.toggle("hidden", panelName !== "result");
}

function getHighscores() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveHighscores(scores) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
}

function drawHighscores() {
  const scores = getHighscores();
  highscoreBody.innerHTML = "";
  if (scores.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `<td colspan="8">No scores yet.</td>`;
    highscoreBody.appendChild(emptyRow);
    return;
  }
  scores.forEach((entry, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${index + 1}</td><td>${entry.firstName} ${entry.lastName}</td><td>${entry.email || "-"}</td><td>${entry.city}</td><td>${entry.score ?? 0}</td><td>$${entry.money ?? 0}</td><td>${entry.cosmozMode ? "COSMOZ" : "MANUAL"}</td><td>${entry.playedAt || entry.timeStamp || "-"}</td>`;
    highscoreBody.appendChild(row);
  });
}

function persistResult() {
  const scores = getHighscores();
  const now = new Date();
  const entry = {
    ...state.playerProfile,
    score: state.score,
    money: state.money,
    cosmozMode: state.cosmozMode,
    playedAt: now.toLocaleString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
  scores.push(entry);
  scores.sort((a, b) => b.money - a.money);
  saveHighscores(scores);
}

function drawWinner() {
  const scores = getHighscores();
  if (!winnerAnnouncement) {
    return;
  }
  if (scores.length === 0) {
    winnerAnnouncement.textContent = "No participants yet.";
    return;
  }

  const topThree = scores.slice(0, 3);
  const medals = ["1st", "2nd", "3rd"];
  const lines = topThree.map((entry, index) => `${medals[index]}: ${entry.firstName} ${entry.lastName} (${entry.city}) - Score ${entry.score ?? 0}, $${entry.money ?? 0}`);
  winnerAnnouncement.innerHTML = lines.join("<br>");
}

function resetGameplay() {
  state.score = 0;
  state.money = 0;
  state.timeLeft = GAME_DURATION_SECONDS;
  state.freezeTime = 0;
  state.bullets = [];
  state.invoices = [];
  state.manualInvoices = [];
  state.bluffInvoices = [];
  state.hazards = [];
  state.spawnClock = 0;
  state.manualClock = 0;
  state.bluffClock = 0;
  state.hazardClock = 0;
  state.shotCooldown = 0;
  state.autoShotCooldown = 0;
  state.flameTick = 0;
  state.reviewedCount = 0;
  state.lives = 3;
  state.bluffShots = 0;
  state.lastSteerDirection = 0;
  state.cosmozMode = false;
  state.ship.x = canvas.width / 2;
  state.ship.y = canvas.height / 2;
  state.ship.vx = 0;
  state.ship.vy = 0;
  state.ship.angle = -Math.PI / 2;
  hudScore.textContent = "0";
  hudTime.textContent = String(GAME_DURATION_SECONDS);
  hudCosmoz.textContent = "MANUAL";
  hudMoney.textContent = "0";
  hudLives.textContent = "❤️❤️❤️";
  setCosmozMode(false);
}

function randomEdgeSpawn() {
  const edge = Math.floor(Math.random() * 4);
  const pad = 24;
  if (edge === 0) return { x: Math.random() * canvas.width, y: -pad };
  if (edge === 1) return { x: canvas.width + pad, y: Math.random() * canvas.height };
  if (edge === 2) return { x: Math.random() * canvas.width, y: canvas.height + pad };
  return { x: -pad, y: Math.random() * canvas.height };
}

function spawnDrifter(collection, radius, speedMin, speedMax, extra = {}) {
  const { x, y } = randomEdgeSpawn();
  const toShipX = state.ship.x - x;
  const toShipY = state.ship.y - y;
  const len = Math.hypot(toShipX, toShipY) || 1;
  const speed = speedMin + Math.random() * (speedMax - speedMin);
  const vx = (toShipX / len) * speed + (Math.random() - 0.5) * 30;
  const vy = (toShipY / len) * speed + (Math.random() - 0.5) * 30;
  collection.push({ x, y, vx, vy, radius, ...extra });
}

function spawnInvoice() {
  spawnDrifter(state.invoices, 16, 55, 95);
}

function spawnManualInvoice() {
  spawnDrifter(state.manualInvoices, 18, 45, 80, {
    reason: manualReasons[Math.floor(Math.random() * manualReasons.length)],
  });
}

function spawnHazard() {
  spawnDrifter(state.hazards, 15, 90, 130, {
    reason: hazardReasons[Math.floor(Math.random() * hazardReasons.length)],
  });
}

function spawnBluff() {
  spawnDrifter(state.bluffInvoices, 18, 75, 120);
}

function shoot(target = null) {
  const noseX = state.ship.x + Math.cos(state.ship.angle) * (state.ship.radius + 4);
  const noseY = state.ship.y + Math.sin(state.ship.angle) * (state.ship.radius + 4);
  state.bullets.push({
    x: noseX,
    y: noseY,
    vx: Math.cos(state.ship.angle) * 520 + state.ship.vx,
    vy: Math.sin(state.ship.angle) * 520 + state.ship.vy,
    life: 1.2,
    radius: 3,
    target: target,
  });
  playShootSound();
}

function intersects(a, b) {
  const ar = a.radius || 0;
  const br = b.radius || 0;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy <= (ar + br) * (ar + br);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function laneBlocked(targetX, targetY) {
  for (const bluff of state.bluffInvoices) {
    const dx = bluff.x - targetX;
    const dy = bluff.y - targetY;
    if (Math.hypot(dx, dy) < 100) return true;
  }
  for (const manual of state.manualInvoices) {
    const dx = manual.x - targetX;
    const dy = manual.y - targetY;
    if (Math.hypot(dx, dy) < 70) return true;
  }
  return false;
}

function wrapEntity(entity) {
  if (entity.x < -30) entity.x = canvas.width + 30;
  if (entity.x > canvas.width + 30) entity.x = -30;
  if (entity.y < -30) entity.y = canvas.height + 30;
  if (entity.y > canvas.height + 30) entity.y = -30;
}

function processCosmozBackground() {
  if (!state.cosmozMode) {
    return;
  }

  if (state.manualInvoices.length > 0) {
    const handledCount = state.manualInvoices.length;
    state.manualInvoices = [];
    state.score += handledCount * 8;
    state.money += handledCount * 40;
    state.reviewedCount += handledCount;
    hudScore.textContent = String(state.score);
    hudMoney.textContent = String(state.money);
  }

  if (state.hazards.length > 0) {
    const handledCount = state.hazards.length;
    state.hazards = [];
    state.score += handledCount * 5;
    state.money += handledCount * 30;
    state.reviewedCount += handledCount;
    hudScore.textContent = String(state.score);
    hudMoney.textContent = String(state.money);
  }
}

function updateSteerAudio(newDirection) {
  if (newDirection !== 0 && newDirection !== state.lastSteerDirection) {
    ensureAudio();
    playEngineSound();
  }
  state.lastSteerDirection = newDirection;
}

function update(dt) {
  if (!state.running) return;
  if (state.freezeTime > 0) {
    state.freezeTime -= dt;
  }
  
  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    endGame();
    return;
  }
  hudTime.textContent = String(Math.ceil(state.timeLeft));
  
  state.spawnClock += dt;
  state.manualClock += dt;
  state.bluffClock += dt;
  state.hazardClock += dt;
  state.shotCooldown -= dt;
  state.autoShotCooldown -= dt;
  state.flameTick += dt;
  
  if (state.spawnClock >= (state.cosmozMode ? 1.8 : 2.8)) {
    state.spawnClock = 0;
    spawnInvoice();
    spawnInvoice();
  }
  if (state.manualClock >= 4.2) {
    state.manualClock = 0;
    spawnManualInvoice();
  }
  if (state.hazardClock >= 2.4) {
    state.hazardClock = 0;
    spawnHazard();
  }
  if (state.bluffClock >= 5.6) {
    state.bluffClock = 0;
    spawnBluff();
  }
  
  processCosmozBackground();

  if (state.cosmozMode) {
    let bestInvoice = null;
    let bestScore = Infinity;

    for (const invoice of state.invoices) {
      if (laneBlocked(invoice.x, invoice.y)) {
        continue;
      }

      const dist = Math.hypot(invoice.x - state.ship.x, invoice.y - state.ship.y);
      const score = dist;
      if (score < bestScore) {
        bestScore = score;
        bestInvoice = invoice;
      }
    }

    let steer = 0;
    let thrust = false;
    if (bestInvoice) {
      const targetAngle = Math.atan2(bestInvoice.y - state.ship.y, bestInvoice.x - state.ship.x);
      let diff = targetAngle - state.ship.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      steer = Math.abs(diff) < 0.08 ? 0 : Math.sign(diff);
      thrust = Math.abs(diff) < 0.5;

      if (state.autoShotCooldown <= 0 && Math.abs(diff) < 0.16) {
        state.autoShotCooldown = 0.045;
        shoot(bestInvoice);
      }
    } else {
      let avoidX = 0;
      let avoidY = 0;
      
      // Avoid bluffs (high priority)
      for (const bluff of state.bluffInvoices) {
        const dx = state.ship.x - bluff.x;
        const dy = state.ship.y - bluff.y;
        const d = Math.hypot(dx, dy);
        if (d < 250) {
          avoidX += dx / (d || 1) * 1.5;
          avoidY += dy / (d || 1) * 1.5;
        }
      }
      
      // Avoid warnings/hazards (medium priority)
      for (const hazard of state.hazards) {
        const dx = state.ship.x - hazard.x;
        const dy = state.ship.y - hazard.y;
        const d = Math.hypot(dx, dy);
        if (d < 200) {
          avoidX += dx / (d || 1) * 0.8;
          avoidY += dy / (d || 1) * 0.8;
        }
      }
      
      if (avoidX !== 0 || avoidY !== 0) {
        const targetAngle = Math.atan2(avoidY, avoidX);
        let diff = targetAngle - state.ship.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        steer = Math.abs(diff) < 0.08 ? 0 : Math.sign(diff);
        thrust = true;
      }
    }

    updateSteerAudio(steer);
    state.ship.angle += steer * 3.8 * dt;
    if (thrust) {
      state.ship.vx += Math.cos(state.ship.angle) * 280 * dt;
      state.ship.vy += Math.sin(state.ship.angle) * 280 * dt;
    }
  } else {
    if (state.freezeTime <= 0) {
      const direction = Number(state.keys.right) - Number(state.keys.left);
      updateSteerAudio(direction);
      state.ship.angle += direction * 3.6 * dt;

      if (state.keys.thrust) {
        state.ship.vx += Math.cos(state.ship.angle) * 250 * dt;
        state.ship.vy += Math.sin(state.ship.angle) * 250 * dt;
      }

      if (state.keys.shoot && state.shotCooldown <= 0) {
        state.shotCooldown = 0.16;
        shoot();
      }
    }
  }

  const speed = Math.hypot(state.ship.vx, state.ship.vy);
  if (speed > state.ship.maxSpeed) {
    const ratio = state.ship.maxSpeed / speed;
    state.ship.vx *= ratio;
    state.ship.vy *= ratio;
  }
  state.ship.vx *= 0.991;
  state.ship.vy *= 0.991;
  state.ship.x += state.ship.vx * dt;
  state.ship.y += state.ship.vy * dt;
  wrapEntity(state.ship);
  
  state.bullets.forEach((bullet) => {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    
    // Homing missile logic
    if (bullet.target && state.cosmozMode) {
      const dx = bullet.target.x - bullet.x;
      const dy = bullet.target.y - bullet.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const angle = Math.atan2(dy, dx);
        const speed = Math.hypot(bullet.vx, bullet.vy);
        bullet.vx = Math.cos(angle) * speed * 0.9 + bullet.vx * 0.1;
        bullet.vy = Math.sin(angle) * speed * 0.9 + bullet.vy * 0.1;
      }
    }
    
    wrapEntity(bullet);
  });
  state.bullets = state.bullets.filter((bullet) => bullet.life > 0);
  
  const movers = [state.invoices, state.manualInvoices, state.bluffInvoices, state.hazards];
  movers.forEach((list) => {
    list.forEach((obj) => {
      obj.x += obj.vx * dt;
      obj.y += obj.vy * dt;
      wrapEntity(obj);
    });
  });
  
  const remainingBullets = [];
  for (const bullet of state.bullets) {
    let consumed = false;
    for (let i = state.invoices.length - 1; i >= 0; i -= 1) {
      if (intersects(bullet, state.invoices[i])) {
        consumed = true;
        state.invoices.splice(i, 1);
        state.score += 10;
        state.money += 50;
        hudScore.textContent = String(state.score);
        hudMoney.textContent = String(state.money);
        playHitSound();
        break;
      }
    }
    if (!consumed) {
      for (let i = state.bluffInvoices.length - 1; i >= 0; i -= 1) {
        if (intersects(bullet, state.bluffInvoices[i])) {
          if (state.cosmozMode) {
            continue;
          }
          consumed = true;
          state.bluffInvoices.splice(i, 1);
          state.bluffShots += 1;
          state.money = Math.max(0, state.money - 1000);
          hudMoney.textContent = String(state.money);
          playCrashSound();
          if (state.bluffShots >= 3) { endGame(); return; }
          break;
        }
      }
    }
    if (!consumed) {
      for (let i = state.manualInvoices.length - 1; i >= 0; i -= 1) {
        if (intersects(bullet, state.manualInvoices[i])) {
          if (state.cosmozMode) {
            continue;
          }
          consumed = true;
          state.manualInvoices.splice(i, 1);
          state.freezeTime = 3;
          state.score += 20;
          state.money -= 200;
          hudScore.textContent = String(state.score);
          hudMoney.textContent = String(state.money);
          playHitSound();
          break;
        }
      }
    }
    if (!consumed) remainingBullets.push(bullet);
  }
  state.bullets = remainingBullets;
  
  for (const hazard of state.hazards) {
    if (intersects(hazard, state.ship)) {
      if (state.cosmozMode) {
        hazard.x = -100;
        hazard.y = -100;
        continue;
      }
      state.money = Math.max(0, state.money - 30);
      hudMoney.textContent = String(state.money);
      hazard.x = -100;
      hazard.y = -100;
    }
  }
  for (const invoice of state.invoices) {
    if (intersects(invoice, state.ship)) {
      if (state.cosmozMode) {
        state.score += 10;
        state.money += 50;
        state.reviewedCount += 1;
      } else {
        state.money = Math.max(0, state.money - 40);
      }
      hudScore.textContent = String(state.score);
      hudMoney.textContent = String(state.money);
      invoice.x = -100;
      invoice.y = -100;
    }
  }
  for (const invoice of state.bluffInvoices) {
    if (intersects(invoice, state.ship)) {
      if (state.cosmozMode) {
        invoice.x = -100;
        invoice.y = -100;
        continue;
      }
      state.lives -= 1;
      state.money = Math.max(0, state.money - 1000);
      hudMoney.textContent = String(state.money);
      updateLivesDisplay();
      playCrashSound();
      if (state.lives <= 0) { endGame(); return; }
      invoice.x = -100;
      invoice.y = -100;
    }
  }

  state.invoices = state.invoices.filter((item) => item.x > -90);
  state.manualInvoices = state.manualInvoices.filter((item) => item.x > -90);
  state.bluffInvoices = state.bluffInvoices.filter((item) => item.x > -90);
  state.hazards = state.hazards.filter((item) => item.x > -90);
}

function updateLivesDisplay() {
  const hearts = "❤️".repeat(Math.max(0, state.lives));
  hudLives.textContent = hearts || "Game Over";
}

function drawShip() {
  const { x, y, radius, angle } = state.ship;
  const enginePulse = 8 + Math.sin(state.flameTick * 30) * 3.2;
  const wingPulse = Math.sin(state.flameTick * 10) * 1.4;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);
  const w = radius * 2.4;
  const h = radius * 2.2;
  ctx.translate(-w / 2, -h / 2);

  ctx.fillStyle = "rgba(120, 200, 255, 0.22)";
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2 + 4, w / 2 + 6, h / 2 - 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2b46cf";
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w - 8, h * 0.5);
  ctx.lineTo(w / 2 + 8, h);
  ctx.lineTo(w / 2 - 8, h);
  ctx.lineTo(8, h * 0.5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#1f2f88";
  ctx.beginPath();
  ctx.moveTo(5, h * 0.55);
  ctx.lineTo(0, h * 0.9 + wingPulse);
  ctx.lineTo(w * 0.33, h * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w - 5, h * 0.55);
  ctx.lineTo(w, h * 0.9 - wingPulse);
  ctx.lineTo(w * 0.67, h * 0.7);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#84c4ff";
  ctx.beginPath();
  ctx.moveTo(w / 2, 5);
  ctx.lineTo(w / 2 + 11, h * 0.52);
  ctx.lineTo(w / 2, h - 5);
  ctx.lineTo(w / 2 - 11, h * 0.52);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#b8f7ff";
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.36, 7, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#d2e8ff";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#ffc93d";
  ctx.beginPath();
  ctx.moveTo(w / 2 - 5, h - 2);
  ctx.lineTo(w / 2 + 5, h - 2);
  ctx.lineTo(w / 2 + 2, h + enginePulse);
  ctx.lineTo(w / 2 - 2, h + enginePulse);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ff732d";
  ctx.fillRect(w / 2 - 2, h + 1, 4, enginePulse + 3);
  ctx.restore();
}

function drawInvoice(invoice) {
  const size = invoice.radius * 2;
  const left = invoice.x - invoice.radius;
  const top = invoice.y - invoice.radius;
  ctx.fillStyle = "#f7fbff";
  ctx.fillRect(left, top, size, size);
  ctx.strokeStyle = "#4f74b8";
  ctx.lineWidth = 2;
  ctx.strokeRect(left, top, size, size);

  ctx.fillStyle = "#dfeaff";
  ctx.beginPath();
  ctx.moveTo(left + size - 10, top);
  ctx.lineTo(left + size, top);
  ctx.lineTo(left + size, top + 10);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#2f5fb2";
  ctx.fillRect(left + 3, top + 3, size - 6, 6);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 6px Arial";
  ctx.fillText("INVOICE", left + 5, top + 8);

  ctx.fillStyle = "#7c97c8";
  ctx.fillRect(left + 4, top + 13, size - 8, 2);
  ctx.fillRect(left + 4, top + 18, size - 8, 2);
  ctx.fillRect(left + 4, top + 23, size - 8, 2);
  ctx.fillRect(left + 4, top + 28, 10, 2);
}

function drawHazard(hazard) {
  const size = hazard.radius * 2;
  const left = hazard.x - hazard.radius;
  const top = hazard.y - hazard.radius;
  ctx.fillStyle = "#ff3333";
  ctx.fillRect(left, top, size, size);
  ctx.strokeStyle = "#ffff00";
  ctx.lineWidth = 2;
  ctx.strokeRect(left, top, size, size);
  ctx.fillStyle = "#ffff00";
  ctx.font = "bold 8px Arial";
  ctx.textAlign = "center";
  ctx.fillText("!", hazard.x, hazard.y + 3);
  ctx.textAlign = "left";
}

function drawManualInvoice(invoice) {
  const size = invoice.radius * 2;
  const left = invoice.x - invoice.radius;
  const top = invoice.y - invoice.radius;
  ctx.fillStyle = "#ffff00";
  ctx.fillRect(left, top, size, size);
  ctx.strokeStyle = "#ffaa00";
  ctx.lineWidth = 2;
  ctx.strokeRect(left, top, size, size);
  ctx.fillStyle = "#000000";
  ctx.font = "bold 10px Arial";
  ctx.textAlign = "center";
  ctx.fillText("M", invoice.x, invoice.y + 3);
  ctx.textAlign = "left";
}

function drawBluffInvoice(invoice) {
  const size = invoice.radius * 2;
  const left = invoice.x - invoice.radius;
  const top = invoice.y - invoice.radius;
  ctx.fillStyle = "#3333ff";
  ctx.fillRect(left, top, size, size);
  ctx.strokeStyle = "#ff00ff";
  ctx.lineWidth = 2;
  ctx.strokeRect(left, top, size, size);
  ctx.fillStyle = "#ff00ff";
  ctx.font = "bold 10px Arial";
  ctx.textAlign = "center";
  ctx.fillText("B", invoice.x, invoice.y + 3);
  ctx.textAlign = "left";
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const spaceGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  spaceGradient.addColorStop(0, "#000033");
  spaceGradient.addColorStop(0.5, "#000055");
  spaceGradient.addColorStop(1, "#000011");
  ctx.fillStyle = spaceGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(30, 50, 840, 1);
  ctx.fillRect(30, canvas.height - 60, 840, 1);
  
  ctx.fillStyle = "#aaaaff";
  state.stars.forEach((star) => {
    const px = (star.x - state.ship.vx * 0.015 * star.z + canvas.width) % canvas.width;
    const py = (star.y - state.ship.vy * 0.015 * star.z + canvas.height) % canvas.height;
    ctx.fillRect(px, py, star.z, star.z);
  });
  
  drawShip();
  
  ctx.fillStyle = "#88ff88";
  for (const bullet of state.bullets) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  
  state.invoices.forEach(drawInvoice);
  state.manualInvoices.forEach(drawManualInvoice);
  state.bluffInvoices.forEach(drawBluffInvoice);
  state.hazards.forEach(drawHazard);
  
  if (state.freezeTime > 0) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffff00";
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.fillText("PROCESSING...", canvas.width / 2, canvas.height / 2 - 20);
    ctx.fillStyle = "#00ff00";
    ctx.font = "bold 16px Arial";
    ctx.fillText(Math.ceil(state.freezeTime) + " sec", canvas.width / 2, canvas.height / 2 + 20);
    ctx.textAlign = "left";
  }
}

function frame(now) {
  if (!state.lastFrame) state.lastFrame = now;
  const dt = Math.min((now - state.lastFrame) / 1000, 0.033);
  state.lastFrame = now;
  update(dt);
  draw();
  if (state.running) requestAnimationFrame(frame);
}

function endGame() {
  state.running = false;
  ensureAudio();
  playMarioDeath();
  persistResult();
  drawHighscores();
  let statsHtml = "<p>";
  if (state.cosmozMode) {
    statsHtml += `<strong>Cosmoz Auto-Processing:</strong> Your company will love you. You handled all invoices and manual invoices with precision thanks to Cosmoz. Final result is <strong>$${state.money}</strong>, including any negative balance from before Cosmoz was activated.`;
  } else {
    statsHtml += `<strong>Manual Mode Earnings:</strong> You earned <strong>$${state.money}</strong> from manual work. With Cosmoz, <strong>98% of this could be automated.</strong>`;
  }
  statsHtml += "</p>";
  resultStats.innerHTML = statsHtml;
  resultSummary.textContent = `${state.playerProfile.firstName} ${state.playerProfile.lastName} (${state.playerProfile.email}) from ${state.playerProfile.city} earned $${state.money}. Mode: ${state.cosmozMode ? "COSMOZ" : "MANUAL"}.`;
  setPanels("result");
}

function startGame() {
  ensureAudio();
  resetGameplay();
  state.running = true;
  state.lastFrame = 0;
  hudPlayer.textContent = `${state.playerProfile.firstName} ${state.playerProfile.lastName}`;
  setPanels("game");
  requestAnimationFrame(frame);
}

function setCosmozMode(enabled) {
  state.cosmozMode = enabled;
  cosmozButton.textContent = `Cosmoz Mode: ${enabled ? "ON" : "OFF"}`;
  if (cosmozGameButton) cosmozGameButton.textContent = `Cosmoz Mode: ${enabled ? "ON" : "OFF"}`;
  hudCosmoz.textContent = enabled ? "COSMOZ" : "MANUAL";
  if (hudEfficiency) {
    hudEfficiency.textContent = enabled ? "Excellent" : "Standby";
    hudEfficiency.classList.toggle("active", enabled);
  }
}

function updateSoundProfileLabel() {
  if (soundProfileButton) soundProfileButton.textContent = `Sound: ${soundProfiles[soundProfileIndex].name}`;
}

function cycleSoundProfile() {
  soundProfileIndex = (soundProfileIndex + 1) % soundProfiles.length;
  updateSoundProfileLabel();
}

registrationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  formError.textContent = "";
  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const email = document.getElementById("email").value.trim();
  const city = document.getElementById("city").value.trim();
  if (!firstName || !lastName || !city || !email) { formError.textContent = "Please fill in all fields."; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { formError.textContent = "Please enter a valid email address."; return; }
  state.playerProfile = { firstName, lastName, email, city };
  startGame();
});

cosmozButton.addEventListener("click", () => { setCosmozMode(!state.cosmozMode); });
cosmozGameButton.addEventListener("click", () => { setCosmozMode(!state.cosmozMode); });
soundProfileButton.addEventListener("click", cycleSoundProfile);
playAgainButton.addEventListener("click", () => { setPanels("registration"); });
if (drawWinnerButton) {
  drawWinnerButton.addEventListener("click", drawWinner);
}

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") state.keys.left = true;
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") state.keys.right = true;
  if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") state.keys.thrust = true;
  if (event.code === "Space") { state.keys.shoot = true; event.preventDefault(); }
  if (event.key.toLowerCase() === "c") setCosmozMode(!state.cosmozMode);
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") state.keys.left = false;
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") state.keys.right = false;
  if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") state.keys.thrust = false;
  if (event.code === "Space") state.keys.shoot = false;
});

drawHighscores();
setCosmozMode(false);
updateSoundProfileLabel();
setPanels("registration");
