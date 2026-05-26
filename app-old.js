const GAME_DURATION_SECONDS = 60;
const STORAGE_KEY = "cosmoz_invoice_defender_highscores";

const registrationPanel = document.getElementById("registration-panel");
const gamePanel = document.getElementById("game-panel");
const resultPanel = document.getElementById("result-panel");

const registrationForm = document.getElementById("registration-form");
const formError = document.getElementById("form-error");
const cosmozButton = document.getElementById("toggle-cosmoz");
const cosmozGameButton = document.getElementById("toggle-cosmoz-game");
const musicButton = document.getElementById("toggle-music");
const playAgainButton = document.getElementById("play-again");

const hudPlayer = document.getElementById("hud-player");
const hudScore = document.getElementById("hud-score");
const hudTime = document.getElementById("hud-time");
const hudCosmoz = document.getElementById("hud-cosmoz");
const hudMoney = document.getElementById("hud-money");
const hudLives = document.getElementById("hud-lives");
const resultStats = document.getElementById("result-stats");

const resultSummary = document.getElementById("result-summary");
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
  keys: {
    left: false,
    right: false,
    shoot: false,
  },
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
  stars: Array.from({ length: 90 }, (_, index) => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: (index % 3) + 1,
    speed: 8 + Math.random() * 16,
  })),
  ship: {
    x: canvas.width / 2,
    y: canvas.height - 48,
    w: 48,
    h: 28,
    speed: 360,
  },
};

let audioContext;
let musicLoopId = null;
let musicStep = 0;
let musicEnabled = true;
let engineSoundPlaying = false;
const hazardReasons = [
  "Wrong order no.",
  "Missing supplier",
  "Bad invoice date",
  "Amount mismatch",
];
const manualReasons = ["Need approver", "PO missing", "Contract check"];

const soundProfiles = [
  {
    name: "Classic",
    shootWave: "sawtooth",
    shootStartHz: 980,
    shootEndHz: 320,
    shootPeak: 0.12,
    hitPeak: 0.18,
  },
  {
    name: "Loud Expo",
    shootWave: "square",
    shootStartHz: 1180,
    shootEndHz: 360,
    shootPeak: 0.2,
    hitPeak: 0.28,
  },
  {
    name: "Soft Office",
    shootWave: "triangle",
    shootStartHz: 820,
    shootEndHz: 280,
    shootPeak: 0.075,
    hitPeak: 0.11,
  },
];

const chiptune = [
  262, 330, 392, 330, 262, 330, 440, 392, 330, 294, 330, 392, 523, 392, 330, 0,
  392, 440, 494, 440, 392, 330, 294, 330, 392, 440, 392, 330, 294, 262, 0, 0,
];

let soundProfileIndex = 0;
const soundProfileButton = document.getElementById("sound-profile");

function ensureAudio() {
  if (!audioContext) {
    audioContext = new window.AudioContext();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function playShootSound() {
  if (!audioContext) {
    return;
  }
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
  if (!audioContext) {
    return;
  }
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

function playMusicNote(frequency) {
  if (!audioContext || frequency <= 0) {
    return;
  }
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.03, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + 0.18);
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
  if (!audioContext || engineSoundPlaying) {
    return;
  }
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

function updateMusicButtonLabel() {
  if (musicButton) {
    musicButton.textContent = `Music: ${musicEnabled ? "ON" : "OFF"}`;
  }
}

function stopMusicLoop() {
  if (musicLoopId) {
    clearInterval(musicLoopId);
    musicLoopId = null;
  }
}

function startMusicLoop() {
  if (!musicEnabled || !audioContext || musicLoopId) {
    return;
  }
  musicLoopId = setInterval(() => {
    const note = chiptune[musicStep % chiptune.length];
    musicStep += 1;
    playMusicNote(note);
  }, 170);
}

function setMusicEnabled(enabled) {
  musicEnabled = enabled;
  updateMusicButtonLabel();
  if (!musicEnabled) {
    stopMusicLoop();
    return;
  }
  ensureAudio();
  startMusicLoop();
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
  } catch {
    return [];
  }
}

function saveHighscores(scores) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
}

function drawHighscores() {
  const scores = getHighscores();
  highscoreBody.innerHTML = "";

  if (scores.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `<td colspan="7">No scores yet.</td>`;
    highscoreBody.appendChild(emptyRow);
    return;
  }

  scores.forEach((entry, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${entry.firstName} ${entry.lastName}</td>
      <td>${entry.email || "-"}</td>
      <td>${entry.city}</td>
      <td>${entry.score}</td>
      <td>${entry.cosmozMode ? "ON" : "OFF"}</td>
      <td>${entry.timeStamp}</td>
    `;
    highscoreBody.appendChild(row);
  });
}

function persistResult() {
  const scores = getHighscores();
  const now = new Date();
  const entry = {
    ...state.playerProfile,
    score: state.score,
    cosmozMode: state.cosmozMode,
    timeStamp: now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  };

  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  saveHighscores(scores.slice(0, 10));
}

function resetGameplay() {
  state.score = 0;
  state.timeLeft = GAME_DURATION_SECONDS;
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
  state.cosmozMode = false;
  state.ship.x = canvas.width / 2;
  hudScore.textContent = "0";
  hudTime.textContent = String(GAME_DURATION_SECONDS);
  hudCosmoz.textContent = "OFF";
  hudReviewed.textContent = "0";
  hudLives.textContent = "❤️❤️❤️";
  setCosmozMode(false);
}

function routeToReview(collection, index, failPenalty) {
  const success = Math.random() < 0.98;
  collection.splice(index, 1);
  if (success) {
    state.reviewedCount += 1;
    state.score += 6;
    hudReviewed.textContent = String(state.reviewedCount);
  } else {
    state.score = Math.max(0, state.score - failPenalty);
  }
  hudScore.textContent = String(state.score);
}

function spawnInvoice() {
  const size = 34;
  state.invoices.push({
    x: Math.random() * (canvas.width - size),
    y: -size,
    w: size,
    h: size,
    speed: 90 + Math.random() * 130,
  });
}

function spawnManualInvoice() {
  const size = 40;
  state.manualInvoices.push({
    x: Math.random() * (canvas.width - size),
    y: -size,
    w: size,
    h: size,
    speed: 80 + Math.random() * 70,
    reason: manualReasons[Math.floor(Math.random() * manualReasons.length)],
  });
}

function spawnBluffInvoice() {
  const size = 38;
  state.bluffInvoices.push({
    x: Math.random() * (canvas.width - size),
    y: -size,
    w: size,
    h: size,
    speed: 75 + Math.random() * 85,
  });
}

function spawnHazard() {
  const size = 30;
  state.hazards.push({
    x: Math.random() * (canvas.width - size),
    y: -size,
    w: size,
    h: size,
    speed: 110 + Math.random() * 140,
    reason: hazardReasons[Math.floor(Math.random() * hazardReasons.length)],
  });
}

function shoot() {
  state.bullets.push({
    x: state.ship.x + state.ship.w / 2 - 2,
    y: state.ship.y - 10,
    w: 4,
    h: 12,
    speed: 500,
  });
  playShootSound();
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function update(dt) {
  if (!state.running) {
    return;
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

  if (state.spawnClock >= 0.55) {
    state.spawnClock = 0;
    spawnInvoice();
  }

  if (state.hazardClock >= 1.35) {
    state.hazardClock = 0;
    spawnHazard();
  }

  if (state.manualClock >= 2.6) {
    state.manualClock = 0;
    spawnManualInvoice();
  }

  if (state.bluffClock >= 4.2) {
    state.bluffClock = 0;
    spawnBluffInvoice();
  }

  const direction = Number(state.keys.right) - Number(state.keys.left);
  if (direction !== 0) {
    if (!engineSoundPlaying) {
      ensureAudio();
      playEngineSound();
    }
  }
  state.ship.x += direction * state.ship.speed * dt;
  state.ship.x = Math.max(0, Math.min(canvas.width - state.ship.w, state.ship.x));

  if (!state.cosmozMode && state.keys.shoot && state.shotCooldown <= 0) {
    state.shotCooldown = 0.15;
    shoot();
  }

  if (state.cosmozMode) {
    autoPlay(dt);
  }

  state.bullets.forEach((bullet) => {
    bullet.y -= bullet.speed * dt;
  });
  state.bullets = state.bullets.filter((bullet) => bullet.y + bullet.h > 0);

  state.invoices.forEach((invoice) => {
    invoice.y += invoice.speed * dt;
  });
  state.manualInvoices.forEach((invoice) => {
    invoice.y += invoice.speed * dt;
  });
  state.bluffInvoices.forEach((invoice) => {
    invoice.y += invoice.speed * dt;
  });
  state.hazards.forEach((hazard) => {
    hazard.y += hazard.speed * dt;
  });

  state.invoices = state.invoices.filter((invoice) => {
    if (invoice.y > canvas.height) {
      state.score = Math.max(0, state.score - 5);
      hudScore.textContent = String(state.score);
      return false;
    }
    return true;
  });

  state.hazards = state.hazards.filter((hazard) => {
    if (hazard.y > canvas.height) {
      return false;
    }
    return true;
  });

  state.manualInvoices = state.manualInvoices.filter((invoice) => {
    if (invoice.y > canvas.height) {
      state.score = Math.max(0, state.score - 12);
      hudScore.textContent = String(state.score);
      return false;
    }
    return true;
  });

  state.bluffInvoices = state.bluffInvoices.filter((invoice) => {
    if (invoice.y > canvas.height) {
      return false;
    }
    return true;
  });

  const remainingBullets = [];
  for (const bullet of state.bullets) {
    let consumed = false;

    for (let i = state.invoices.length - 1; i >= 0; i -= 1) {
      if (intersects(bullet, state.invoices[i])) {
        consumed = true;
        state.invoices.splice(i, 1);
        state.score += 10;
        hudScore.textContent = String(state.score);
        playHitSound();
        break;
      }
    }

    if (!consumed) {
      if (!state.cosmozMode) {
        for (let i = state.manualInvoices.length - 1; i >= 0; i -= 1) {
          if (intersects(bullet, state.manualInvoices[i])) {
            consumed = true;
            state.manualInvoices.splice(i, 1);
            state.score = Math.max(0, state.score - 20);
            hudScore.textContent = String(state.score);
            break;
          }
        }
      }
    }

    if (!consumed) {
      if (!state.cosmozMode) {
        for (let i = state.hazards.length - 1; i >= 0; i -= 1) {
          if (intersects(bullet, state.hazards[i])) {
            consumed = true;
            state.hazards.splice(i, 1);
            state.score = Math.max(0, state.score - 15);
            hudScore.textContent = String(state.score);
            break;
          }
        }
      }
    }

    if (!consumed) {
      for (let i = state.bluffInvoices.length - 1; i >= 0; i -= 1) {
        if (intersects(bullet, state.bluffInvoices[i])) {
          consumed = true;
          state.bluffInvoices.splice(i, 1);
          state.lives -= 1;
          updateLivesDisplay();
          if (state.lives <= 0) {
            endGame();
            return;
          }
          break;
        }
      }
    }

    if (!consumed) {
      remainingBullets.push(bullet);
    }
  }
  state.bullets = remainingBullets;

  if (state.cosmozMode) {
    for (let i = state.hazards.length - 1; i >= 0; i -= 1) {
      if (state.hazards[i].y > 140) {
        routeToReview(state.hazards, i, 0);
      }
    }

    for (let i = state.manualInvoices.length - 1; i >= 0; i -= 1) {
      if (state.manualInvoices[i].y > 140) {
        routeToReview(state.manualInvoices, i, 0);
      }
    }
  }

  for (const hazard of state.hazards) {
    if (intersects(hazard, state.ship)) {
      state.score = Math.max(0, state.score - 20);
      hudScore.textContent = String(state.score);
      hazard.y = canvas.height + 50;
    }
  }

  for (const invoice of state.invoices) {
    if (intersects(invoice, state.ship)) {
      state.score = Math.max(0, state.score - 10);
      hudScore.textContent = String(state.score);
      invoice.y = canvas.height + 50;
    }
  }

  for (const invoice of state.manualInvoices) {
    if (intersects(invoice, state.ship)) {
      state.score = Math.max(0, state.score - 8);
      hudScore.textContent = String(state.score);
      invoice.y = canvas.height + 50;
    }
  }

  for (const invoice of state.bluffInvoices) {
    if (intersects(invoice, state.ship)) {
      state.lives -= 1;
      updateLivesDisplay();
      if (state.lives <= 0) {
        endGame();
        return;
      }
      invoice.y = canvas.height + 50;
    }
  }
}

function autoPlay() {
  let target = null;
  let minDistance = Infinity;
  for (const invoice of state.invoices) {
    const centerX = invoice.x + invoice.w / 2;
    const distance = Math.abs(centerX - (state.ship.x + state.ship.w / 2));
    if (distance < minDistance) {
      minDistance = distance;
      target = invoice;
    }
  }

  if (target) {
    const targetCenter = target.x + target.w / 2;
    const shipCenter = state.ship.x + state.ship.w / 2;
    if (targetCenter < shipCenter - 6) {
      state.ship.x -= state.ship.speed * 0.016;
    } else if (targetCenter > shipCenter + 6) {
      state.ship.x += state.ship.speed * 0.016;
    }
    state.ship.x = Math.max(0, Math.min(canvas.width - state.ship.w, state.ship.x));
  }

  if (state.autoShotCooldown <= 0) {
    state.autoShotCooldown = 0.12;
    shoot();
  }
}

function drawShip() {
  const { x, y, w, h } = state.ship;

  const flicker = 6 + Math.sin(state.flameTick * 35) * 3;
  ctx.fillStyle = "#ff7a00";
  ctx.beginPath();
  ctx.moveTo(x + w / 2 - 8, y + h);
  ctx.lineTo(x + w / 2, y + h + flicker + 10);
  ctx.lineTo(x + w / 2 + 8, y + h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffd14d";
  ctx.beginPath();
  ctx.moveTo(x + w / 2 - 4, y + h);
  ctx.lineTo(x + w / 2, y + h + flicker + 4);
  ctx.lineTo(x + w / 2 + 4, y + h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#7de1ff";
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y - 18);
  ctx.lineTo(x + w - 2, y + h - 2);
  ctx.lineTo(x + w - 12, y + h);
  ctx.lineTo(x + 12, y + h);
  ctx.lineTo(x + 2, y + h - 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#294b93";
  ctx.fillRect(x + 16, y + 1, 16, 16);
  ctx.fillStyle = "#9eeaff";
  ctx.fillRect(x + 19, y + 4, 10, 6);
}

function drawInvoice(invoice) {
  ctx.fillStyle = "#f3fbff";
  ctx.fillRect(invoice.x, invoice.y, invoice.w, invoice.h);
  ctx.strokeStyle = "#244f8f";
  ctx.strokeRect(invoice.x, invoice.y, invoice.w, invoice.h);
  ctx.fillStyle = "#2f68b8";
  ctx.fillRect(invoice.x + 6, invoice.y + 6, invoice.w - 12, 3);
  ctx.fillRect(invoice.x + 6, invoice.y + 14, invoice.w - 16, 3);
  ctx.fillRect(invoice.x + 6, invoice.y + 22, invoice.w - 10, 3);
}

function drawHazard(hazard) {
  ctx.fillStyle = "#ff5b61";
  ctx.beginPath();
  ctx.moveTo(hazard.x + hazard.w / 2, hazard.y);
  ctx.lineTo(hazard.x + hazard.w, hazard.y + hazard.h);
  ctx.lineTo(hazard.x, hazard.y + hazard.h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#fff6f7";
  ctx.font = "bold 10px Trebuchet MS";
  ctx.fillText("ERR", hazard.x + 3, hazard.y + 12);
  ctx.fillStyle = "#ffd8da";
  ctx.font = "8px Trebuchet MS";
  ctx.fillText(hazard.reason, Math.max(2, hazard.x - 18), hazard.y + hazard.h + 10);
}

function drawManualInvoice(invoice) {
  ctx.fillStyle = "#ffe9b0";
  ctx.fillRect(invoice.x, invoice.y, invoice.w, invoice.h);
  ctx.strokeStyle = "#bc6a00";
  ctx.strokeRect(invoice.x, invoice.y, invoice.w, invoice.h);
  ctx.fillStyle = "#bc6a00";
  ctx.font = "bold 9px Trebuchet MS";
  ctx.fillText("MANUAL", invoice.x + 3, invoice.y + 11);
  ctx.fillStyle = "#7a4200";
  ctx.font = "8px Trebuchet MS";
  ctx.fillText(invoice.reason, Math.max(2, invoice.x - 10), invoice.y + invoice.h + 10);
}

function drawBluffInvoice(invoice) {
  ctx.fillStyle = "#2a3d5f";
  ctx.fillRect(invoice.x, invoice.y, invoice.w, invoice.h);
  ctx.strokeStyle = "#6b7f9f";
  ctx.lineWidth = 2;
  ctx.strokeRect(invoice.x, invoice.y, invoice.w, invoice.h);
  ctx.fillStyle = "#ff9f43";
  ctx.font = "bold 10px Trebuchet MS";
  ctx.fillText("BLUFF", invoice.x + 2, invoice.y + 12);
  ctx.fillStyle = "#ffccb3";
  ctx.font = "7px Trebuchet MS";
  ctx.fillText("TRAP!", invoice.x + 3, invoice.y + 24);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const spaceGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  spaceGradient.addColorStop(0, "#050d26");
  spaceGradient.addColorStop(0.65, "#0a1f4a");
  spaceGradient.addColorStop(1, "#10264f");
  ctx.fillStyle = spaceGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#8bbcff";
  state.stars.forEach((star) => {
    star.y += star.speed * 0.016;
    if (star.y > canvas.height) {
      star.y = -4;
      star.x = Math.random() * canvas.width;
    }
    ctx.fillRect(star.x, star.y, star.r, star.r);
  });

  ctx.fillStyle = "#2b4d87";
  ctx.beginPath();
  ctx.arc(760, 110, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6f8ec2";
  ctx.beginPath();
  ctx.arc(746, 98, 14, 0, Math.PI * 2);
  ctx.fill();

  drawShip();

  ctx.fillStyle = "#88d2ff";
  for (const bullet of state.bullets) {
    ctx.fillRect(bullet.x, bullet.y, bullet.w, bullet.h);
  }

  state.invoices.forEach(drawInvoice);
  state.manualInvoices.forEach(drawManualInvoice);
  state.bluffInvoices.forEach(drawBluffInvoice);
  state.hazards.forEach(drawHazard);
}

function frame(now) {
  if (!state.lastFrame) {
    state.lastFrame = now;
  }
  const dt = Math.min((now - state.lastFrame) / 1000, 0.033);
  state.lastFrame = now;

  update(dt);
  draw();

  if (state.running) {
    requestAnimationFrame(frame);
  }
}

function endGame() {
  state.running = false;
  stopMusicLoop();
  persistResult();
  drawHighscores();
  const reviewText = state.cosmozMode
    ? ` Auto-review routed: ${state.reviewedCount} items (98% automation target).`
    : "";
  
  let statsHtml = "<p>";
  if (state.cosmozMode) {
    const timeSaved = state.reviewedCount * 2.5;
    const risksAvoided = state.reviewedCount;
    statsHtml += `<strong>Cosmoz Mode Active:</strong> Automatically processed <strong>${state.reviewedCount} invoices</strong>, saving ~<strong>${timeSaved.toFixed(0)} minutes</strong> of manual work. <strong>${risksAvoided} risks avoided.</strong>`;
  } else {
    const manualEffort = state.score / 10;
    const timeCost = manualEffort * 3.2;
    statsHtml += `<strong>Manual Mode:</strong> You handled approximately <strong>${Math.round(manualEffort)} invoices</strong>, consuming ~<strong>${timeCost.toFixed(0)} minutes</strong> of work time. With Cosmoz Mode, this could have been <strong>98% automated.</strong>`;
  }
  statsHtml += "</p>";
  resultStats.innerHTML = statsHtml;
  
  resultSummary.textContent = `${state.playerProfile.firstName} ${state.playerProfile.lastName} (${state.playerProfile.email}) from ${state.playerProfile.city} scored ${state.score} points. Cosmoz Mode: ${state.cosmozMode ? "ON" : "OFF"}.${reviewText}`;
  setPanels("result");
}

function startGame() {
  ensureAudio();
  if (musicEnabled) {
    startMusicLoop();
  }
  resetGameplay();
  state.running = true;
  state.lastFrame = 0;
  hudPlayer.textContent = `${state.playerProfile.firstName} ${state.playerProfile.lastName}`;
  setPanels("game");
  requestAnimationFrame(frame);
}

function updateLivesDisplay() {
  const hearts = "❤️".repeat(state.lives);
  hudLives.textContent = hearts || "Game Over";
}

function setCosmozMode(enabled) {
  state.cosmozMode = enabled;
  cosmozButton.textContent = `Cosmoz Mode: ${enabled ? "ON" : "OFF"}`;
  if (cosmozGameButton) {
    cosmozGameButton.textContent = `Cosmoz Mode: ${enabled ? "ON" : "OFF"}`;
  }
  hudCosmoz.textContent = enabled ? "ON" : "OFF";
}

function updateSoundProfileLabel() {
  if (soundProfileButton) {
    soundProfileButton.textContent = `Sound: ${soundProfiles[soundProfileIndex].name}`;
  }
}

function cycleSoundProfile() {
  soundProfileIndex = (soundProfileIndex + 1) % soundProfiles.length;
  updateSoundProfileLabel();
}

function processManualInvoice() {
  if (state.cosmozMode) {
    return;
  }
  const shipCenter = state.ship.x + state.ship.w / 2;
  for (let i = state.manualInvoices.length - 1; i >= 0; i -= 1) {
    const invoice = state.manualInvoices[i];
    const invoiceCenter = invoice.x + invoice.w / 2;
    const closeX = Math.abs(invoiceCenter - shipCenter) <= 30;
    const closeY = invoice.y > state.ship.y - 95 && invoice.y < state.ship.y + 20;
    if (closeX && closeY) {
      state.manualInvoices.splice(i, 1);
      state.score += 18;
      hudScore.textContent = String(state.score);
      playHitSound();
      return;
    }
  }
}

registrationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  formError.textContent = "";

  const firstName = document.getElementById("firstName").value.trim();
  const lastName = document.getElementById("lastName").value.trim();
  const email = document.getElementById("email").value.trim();
  const city = document.getElementById("city").value.trim();

  if (!firstName || !lastName || !city || !email) {
    formError.textContent = "Please fill in all registration fields.";
    return;
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    formError.textContent = "Please enter a valid email address.";
    return;
  }

  state.playerProfile = { firstName, lastName, email, city };
  startGame();
});

cosmozButton.addEventListener("click", () => {
  setCosmozMode(!state.cosmozMode);
});

cosmozGameButton.addEventListener("click", () => {
  setCosmozMode(!state.cosmozMode);
});

musicButton.addEventListener("click", () => {
  setMusicEnabled(!musicEnabled);
});

soundProfileButton.addEventListener("click", cycleSoundProfile);

playAgainButton.addEventListener("click", () => {
  setPanels("registration");
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    state.keys.left = true;
  }
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    state.keys.right = true;
  }
  if (event.code === "Space") {
    state.keys.shoot = true;
    event.preventDefault();
  }
  if (event.key.toLowerCase() === "m") {
    processManualInvoice();
  }
  if (event.key.toLowerCase() === "c") {
    setCosmozMode(!state.cosmozMode);
  }
  if (event.key.toLowerCase() === "b") {
    setMusicEnabled(!musicEnabled);
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    state.keys.left = false;
  }
  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    state.keys.right = false;
  }
  if (event.code === "Space") {
    state.keys.shoot = false;
  }
});

drawHighscores();
setCosmozMode(false);
updateMusicButtonLabel();
updateSoundProfileLabel();
setPanels("registration");
