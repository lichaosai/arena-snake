(() => {
  "use strict";

  const COLS = 42;
  const ROWS = 28;
  const INITIAL_LENGTH = 6;
  const ENERGY_TARGET = 72;
  const TICK_MS = 105;

  const UP = { x: 0, y: -1 };
  const DOWN = { x: 0, y: 1 };
  const LEFT = { x: -1, y: 0 };
  const RIGHT = { x: 1, y: 0 };
  const DIRS = [UP, DOWN, LEFT, RIGHT];

  const difficultyConfig = {
    "休闲": { noise: 3.0, attack: 0.35, lookahead: 0.7 },
    "标准": { noise: 1.4, attack: 0.80, lookahead: 1.2 },
    "挑战": { noise: 0.55, attack: 1.30, lookahead: 1.7 }
  };

  const $ = (id) => document.getElementById(id);

  const homeScreen = $("homeScreen");
  const gameScreen = $("gameScreen");
  const canvas = $("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  let difficulty = "标准";
  let playerColor = "#38E184";
  let state = "home"; // home | countdown | running | paused | gameover
  let timer = null;
  let tickCount = 0;
  let bestLength = Number(localStorage.getItem("arenaSnakeBest") || INITIAL_LENGTH);
  let finalPlayerLength = INITIAL_LENGTH;

  let energies = [];
  let player = null;
  let aiSnakes = [];
  let snakes = [];

  let pointerStart = null;
  let swipeCommitted = false;

  function dirEq(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function opposite(d) {
    return { x: -d.x, y: -d.y };
  }

  function posKey(p) {
    return `${p.x},${p.y}`;
  }

  function samePos(a, b) {
    return a.x === b.x && a.y === b.y;
  }

  function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  function inside(p) {
    return p.x >= 0 && p.x < COLS && p.y >= 0 && p.y < ROWS;
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function choose(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function randomNoise(amount) {
    return (Math.random() * 2 - 1) * amount;
  }

  class Snake {
    constructor(name, color, isPlayer = false, style = "balanced") {
      this.name = name;
      this.color = color;
      this.isPlayer = isPlayer;
      this.style = style;
      this.body = [];
      this.direction = RIGHT;
      this.queuedDirection = RIGHT;
      this.growth = 0;
      this.alive = true;
      this.respawnTicks = 0;
      this.turnCooldown = 0;
    }

    get head() {
      return this.body.length ? this.body[0] : null;
    }

    get length() {
      return this.body.length + this.growth;
    }

    spawn(head, direction, length = INITIAL_LENGTH) {
      this.direction = { ...direction };
      this.queuedDirection = { ...direction };
      this.growth = 0;
      this.alive = true;
      this.respawnTicks = 0;
      this.turnCooldown = 0;
      this.body = [];

      for (let i = 0; i < length; i++) {
        this.body.push({
          x: head.x - direction.x * i,
          y: head.y - direction.y * i
        });
      }
    }

    setDirection(newDir) {
      const rev = opposite(this.direction);
      if (!dirEq(newDir, rev)) {
        this.queuedDirection = { ...newDir };
      }
    }
  }

  function initSnakes() {
    player = new Snake("YOU", playerColor, true);
    aiSnakes = [
      new Snake("Milo", "#55A8FF", false, "greedy"),
      new Snake("Nova", "#B889FF", false, "hunter"),
      new Snake("Byte", "#FFB95C", false, "cautious")
    ];
    snakes = [player, ...aiSnakes];

    player.spawn({ x: 10, y: Math.floor(ROWS / 2) }, RIGHT);

    const aiStarts = [
      [{ x: 31, y: 7 }, LEFT],
      [{ x: 31, y: 20 }, LEFT],
      [{ x: 22, y: 5 }, DOWN]
    ];

    aiSnakes.forEach((ai, i) => ai.spawn(aiStarts[i][0], aiStarts[i][1]));
  }

  function occupiedSet() {
    const set = new Set();
    snakes.forEach(s => {
      if (s.alive) {
        s.body.forEach(p => set.add(posKey(p)));
      }
    });
    return set;
  }

  function spawnSafe(body) {
    const occ = occupiedSet();
    const energy = new Set(energies.map(e => posKey(e)));
    return body.every(p => inside(p) && !occ.has(posKey(p)) && !energy.has(posKey(p)));
  }

  function randomSafeSpawn(length = INITIAL_LENGTH) {
    for (let tries = 0; tries < 240; tries++) {
      const d = choose(DIRS);
      const margin = length + 2;
      const head = {
        x: randInt(margin, COLS - margin - 1),
        y: randInt(margin, ROWS - margin - 1)
      };
      const body = [];
      for (let i = 0; i < length; i++) {
        body.push({ x: head.x - d.x * i, y: head.y - d.y * i });
      }
      if (spawnSafe(body)) return [head, d];
    }
    return null;
  }

  function newEnergy() {
    const occ = occupiedSet();
    const used = new Set(energies.map(e => posKey(e)));

    for (let tries = 0; tries < 120; tries++) {
      const p = { x: randInt(1, COLS - 2), y: randInt(1, ROWS - 2) };
      const key = posKey(p);
      if (occ.has(key) || used.has(key)) continue;

      const r = Math.random();
      if (r < 0.08) return { ...p, value: 3, color: "#FFD166", scale: 1.45 };
      if (r < 0.22) return { ...p, value: 2, color: "#77D7FF", scale: 1.18 };
      return { ...p, value: 1, color: "#7CF3A4", scale: .92 };
    }

    return null;
  }

  function replenishEnergy(force = false) {
    if (force) energies = [];
    while (energies.length < ENERGY_TARGET) {
      const e = newEnergy();
      if (!e) break;
      energies.push(e);
    }
  }

  function energyAt(p) {
    return energies.find(e => e.x === p.x && e.y === p.y) || null;
  }

  function dangerousForAI(pos, ai) {
    if (!inside(pos)) return true;

    for (const snake of snakes) {
      if (!snake.alive || !snake.body.length) continue;
      const cells = snake === ai ? snake.body.slice(1) : snake.body;
      if (cells.some(p => samePos(p, pos))) return true;
    }

    return false;
  }

  function localClearance(pos, ai) {
    let wall = Math.min(pos.x, COLS - 1 - pos.x, pos.y, ROWS - 1 - pos.y);
    let nearest = 8;

    for (const snake of snakes) {
      if (!snake.alive) continue;
      for (const p of snake.body) {
        if (snake === ai && ai.head && samePos(p, ai.head)) continue;
        nearest = Math.min(nearest, manhattan(pos, p));
        if (nearest <= 1) break;
      }
    }

    return Math.min(8, wall, nearest);
  }

  function futureSafeMoves(pos, direction, ai) {
    const rev = opposite(direction);
    let count = 0;
    for (const d of DIRS) {
      if (dirEq(d, rev)) continue;
      const next = { x: pos.x + d.x, y: pos.y + d.y };
      if (!dangerousForAI(next, ai)) count++;
    }
    return count;
  }

  function aiDirection(ai) {
    if (!ai.alive || !ai.head) return ai.direction;

    const cfg = difficultyConfig[difficulty];
    const rev = opposite(ai.direction);
    const candidates = DIRS.filter(d => !dirEq(d, rev));

    let target = null;
    let targetScore = -Infinity;

    for (const e of energies) {
      const dist = manhattan(ai.head, e);
      let value = e.value * 7.5 - dist;
      if (ai.style === "greedy") value += e.value * 3;
      if (value > targetScore) {
        targetScore = value;
        target = e;
      }
    }

    let intercept = null;
    if (ai.style === "hunter" && player.alive && player.head) {
      intercept = {
        x: Math.max(0, Math.min(COLS - 1, player.head.x + player.direction.x * 3)),
        y: Math.max(0, Math.min(ROWS - 1, player.head.y + player.direction.y * 3))
      };
    }

    const scored = candidates.map(direction => {
      const next = { x: ai.head.x + direction.x, y: ai.head.y + direction.y };

      if (!inside(next)) return { score: -99999, direction };
      if (dangerousForAI(next, ai)) return { score: -50000, direction };

      let score = 0;
      if (dirEq(direction, ai.direction)) score += 1.6;

      if (target) {
        const foodDist = manhattan(next, target);
        score -= foodDist * (ai.style === "greedy" ? 1.55 : 1.05);
        score += target.value * 1.6;
      }

      const clearance = localClearance(next, ai);
      score += clearance * (ai.style === "cautious" ? 3 : 1.45);
      score += futureSafeMoves(next, direction, ai) * 2.2 * cfg.lookahead;

      if (intercept) {
        score -= manhattan(next, intercept) * .45 * cfg.attack;
      }

      for (const other of snakes) {
        if (other === ai || !other.alive || !other.head) continue;
        const d = manhattan(next, other.head);
        if (d === 1) score -= 8;
        else if (d === 2) score -= 2.5;
      }

      score += randomNoise(cfg.noise);
      return { score, direction };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored.length ? scored[0].direction : ai.direction;

    const straight = { x: ai.head.x + ai.direction.x, y: ai.head.y + ai.direction.y };
    const straightSafe = !dangerousForAI(straight, ai);

    if (ai.turnCooldown > 0 && straightSafe) {
      ai.turnCooldown--;
      return ai.direction;
    }

    if (!dirEq(best, ai.direction)) {
      ai.turnCooldown = difficulty === "挑战" ? 1 : 2;
    }

    return best;
  }

  function killSnake(snake) {
    if (!snake.alive) return;

    if (!snake.isPlayer) {
      const existing = new Set(energies.map(e => posKey(e)));
      snake.body.forEach((p, i) => {
        if (existing.has(posKey(p))) return;
        if (i % 2 === 0 || Math.random() < .35) {
          energies.push({ ...p, value: 2, color: snake.color, scale: 1.2 });
          existing.add(posKey(p));
        }
      });
    }

    if (snake.isPlayer) finalPlayerLength = snake.length;

    snake.alive = false;
    snake.body = [];
    snake.growth = 0;
    snake.respawnTicks = snake.isPlayer ? 0 : randInt(13, 20);
  }

  function updateRespawns() {
    for (const ai of aiSnakes) {
      if (ai.alive) continue;
      ai.respawnTicks--;
      if (ai.respawnTicks > 0) continue;

      const spawn = randomSafeSpawn();
      if (!spawn) {
        ai.respawnTicks = 5;
        continue;
      }
      ai.spawn(spawn[0], spawn[1]);
    }
  }

  function computeRank() {
    const sorted = [...snakes].sort((a, b) => {
      const al = a.alive ? a.length : 0;
      const bl = b.alive ? b.length : 0;
      return bl - al;
    });
    return Math.max(1, sorted.findIndex(s => s === player) + 1);
  }

  function updateUI() {
    const len = player && player.alive ? player.length : finalPlayerLength;
    const rank = computeRank();

    $("lengthValue").textContent = len;
    $("rankValue").textContent = `${rank}/4`;
    $("bestValue").textContent = bestLength;
    $("homeBest").textContent = bestLength;

    const sorted = [...snakes].sort((a, b) => (b.alive ? b.length : 0) - (a.alive ? a.length : 0));
    $("leaderboardList").innerHTML = sorted.map((s, i) => `
      <div class="rank-row ${s.isPlayer ? "you" : ""}">
        <b>${i + 1}</b>
        <i class="rank-dot" style="--c:${s.color}"></i>
        <span>${s.name}</span>
        <strong>${s.alive ? s.length : "—"}</strong>
      </div>
    `).join("");
  }

  function gameTick() {
    if (state !== "running") return;

    tickCount++;
    updateRespawns();

    aiSnakes.forEach(ai => {
      if (ai.alive) ai.queuedDirection = aiDirection(ai);
    });

    const alive = snakes.filter(s => s.alive && s.body.length);
    alive.forEach(s => s.direction = { ...s.queuedDirection });

    const proposed = new Map();
    const eating = new Map();

    alive.forEach(s => {
      const next = {
        x: s.head.x + s.direction.x,
        y: s.head.y + s.direction.y
      };
      proposed.set(s, next);
      eating.set(s, energyAt(next));
    });

    const dead = new Set();

    proposed.forEach((next, s) => {
      if (!inside(next)) dead.add(s);
    });

    proposed.forEach((next, s) => {
      if (dead.has(s)) return;

      for (const other of alive) {
        if (other === s) continue;

        const otherEating = eating.get(other);
        const blocking = (otherEating || other.growth > 0)
          ? other.body
          : other.body.slice(0, -1);

        if (blocking.some(p => samePos(p, next))) {
          dead.add(s);
          break;
        }
      }
    });

    const groups = new Map();
    proposed.forEach((next, s) => {
      if (dead.has(s)) return;
      const key = posKey(next);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    });

    groups.forEach(group => {
      if (group.length > 1) group.forEach(s => dead.add(s));
    });

    dead.forEach(killSnake);

    if (!player.alive) {
      finishGame();
      render();
      return;
    }

    alive.forEach(s => {
      if (!s.alive) return;

      const next = proposed.get(s);
      const e = eating.get(s);
      s.body.unshift(next);

      if (e) {
        const idx = energies.indexOf(e);
        if (idx >= 0) energies.splice(idx, 1);
        s.growth += e.value;
      }

      if (s.growth > 0) s.growth--;
      else s.body.pop();
    });

    replenishEnergy();

    if (player.length > bestLength) {
      bestLength = player.length;
      localStorage.setItem("arenaSnakeBest", String(bestLength));
    }

    updateUI();
    render();
  }

  function resetGame() {
    stopTimer();
    tickCount = 0;
    finalPlayerLength = INITIAL_LENGTH;
    energies = [];
    initSnakes();
    replenishEnergy(true);
    updateUI();
    render();
  }

  function startTimer() {
    stopTimer();
    timer = window.setInterval(gameTick, TICK_MS);
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  async function startWithCountdown() {
    resetGame();
    showGame();
    state = "countdown";
    const overlay = $("countdown");
    const text = $("countdownText");
    overlay.classList.remove("hidden");

    for (const value of ["3", "2", "1", "GO!"]) {
      text.textContent = value;
      await new Promise(resolve => setTimeout(resolve, value === "GO!" ? 420 : 520));
    }

    overlay.classList.add("hidden");
    state = "running";
    startTimer();
  }

  function pause() {
    if (state !== "running") return;
    state = "paused";
    stopTimer();
    $("pauseOverlay").classList.remove("hidden");
    $("pauseBtn").textContent = "▶";
  }

  function resume() {
    if (state !== "paused") return;
    $("pauseOverlay").classList.add("hidden");
    state = "running";
    $("pauseBtn").textContent = "Ⅱ";
    startTimer();
  }

  function restart() {
    $("gameOverOverlay").classList.add("hidden");
    $("pauseOverlay").classList.add("hidden");
    startWithCountdown();
  }

  function finishGame() {
    stopTimer();
    state = "gameover";
    const finalRank = computeRank();

    if (finalPlayerLength > bestLength) {
      bestLength = finalPlayerLength;
      localStorage.setItem("arenaSnakeBest", String(bestLength));
    }

    $("finalLength").textContent = finalPlayerLength;
    $("finalRank").textContent = `${finalRank}/4`;
    $("finalBest").textContent = bestLength;
    $("gameOverOverlay").classList.remove("hidden");
    updateUI();
  }

  function showHome() {
    stopTimer();
    state = "home";
    gameScreen.classList.remove("active");
    homeScreen.classList.add("active");
    $("gameOverOverlay").classList.add("hidden");
    $("pauseOverlay").classList.add("hidden");
    $("leaderboardPanel").classList.remove("open");
    $("homeBest").textContent = bestLength;
    drawPreview();
  }

  function showGame() {
    homeScreen.classList.remove("active");
    gameScreen.classList.add("active");
    requestAnimationFrame(() => {
      resizeCanvas();
      render();
    });
  }

  function setPlayerDirection(dir) {
    if (!player || !player.alive) return;
    player.setDirection(dir);
  }

  function handleSwipe(dx, dy) {
    const threshold = Math.max(18, Math.min(canvas.clientWidth, canvas.clientHeight) * .035);
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return false;

    if (Math.abs(dx) > Math.abs(dy)) {
      setPlayerDirection(dx > 0 ? RIGHT : LEFT);
    } else {
      setPlayerDirection(dy > 0 ? DOWN : UP);
    }
    return true;
  }

  function setupInput() {
    window.addEventListener("keydown", (e) => {
      const key = e.key.toLowerCase();

      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d", "p", "r"].includes(key)) {
        e.preventDefault();
      }

      if (key === "arrowup" || key === "w") setPlayerDirection(UP);
      else if (key === "arrowdown" || key === "s") setPlayerDirection(DOWN);
      else if (key === "arrowleft" || key === "a") setPlayerDirection(LEFT);
      else if (key === "arrowright" || key === "d") setPlayerDirection(RIGHT);
      else if (key === " " || key === "p") state === "running" ? pause() : resume();
      else if (key === "r") restart();
    }, { passive: false });

    canvas.addEventListener("pointerdown", (e) => {
      pointerStart = { x: e.clientX, y: e.clientY };
      swipeCommitted = false;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!pointerStart || swipeCommitted || state !== "running") return;
      const dx = e.clientX - pointerStart.x;
      const dy = e.clientY - pointerStart.y;

      if (handleSwipe(dx, dy)) {
        swipeCommitted = true;
        if ("vibrate" in navigator) navigator.vibrate?.(8);
      }
    });

    const endPointer = () => {
      pointerStart = null;
      swipeCommitted = false;
    };

    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
  }

  function canvasGeometry(targetCanvas) {
    const rect = targetCanvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    const pixelW = Math.max(1, Math.round(rect.width * dpr));
    const pixelH = Math.max(1, Math.round(rect.height * dpr));

    if (targetCanvas.width !== pixelW || targetCanvas.height !== pixelH) {
      targetCanvas.width = pixelW;
      targetCanvas.height = pixelH;
    }

    const c = targetCanvas.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;

    const padding = Math.max(14, Math.min(width, height) * .035);
    const cell = Math.min((width - padding * 2) / COLS, (height - padding * 2) / ROWS);
    const boardW = cell * COLS;
    const boardH = cell * ROWS;
    const ox = (width - boardW) / 2;
    const oy = (height - boardH) / 2;

    return { c, width, height, cell, boardW, boardH, ox, oy };
  }

  function resizeCanvas() {
    canvasGeometry(canvas);
  }

  function cellCenter(p, g) {
    return {
      x: g.ox + (p.x + .5) * g.cell,
      y: g.oy + (p.y + .5) * g.cell
    };
  }

  function roundedRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
  }

  function drawBoard(c, g) {
    const bg = c.createLinearGradient(0, 0, g.width, g.height);
    bg.addColorStop(0, "#071626");
    bg.addColorStop(.55, "#07111f");
    bg.addColorStop(1, "#050d17");
    c.fillStyle = bg;
    c.fillRect(0, 0, g.width, g.height);

    const inner = c.createRadialGradient(
      g.ox + g.boardW * .45,
      g.oy + g.boardH * .45,
      5,
      g.ox + g.boardW * .45,
      g.oy + g.boardH * .45,
      Math.max(g.boardW, g.boardH) * .7
    );
    inner.addColorStop(0, "rgba(15,42,55,.35)");
    inner.addColorStop(1, "rgba(4,11,19,.78)");

    c.fillStyle = inner;
    roundedRectPath(c, g.ox, g.oy, g.boardW, g.boardH, Math.max(9, g.cell * .7));
    c.fill();

    c.save();
    c.shadowColor = "rgba(56,225,132,.22)";
    c.shadowBlur = 12;
    c.strokeStyle = "rgba(79,225,151,.58)";
    c.lineWidth = Math.max(1.2, g.cell * .09);
    roundedRectPath(c, g.ox, g.oy, g.boardW, g.boardH, Math.max(9, g.cell * .7));
    c.stroke();
    c.restore();

    c.strokeStyle = "rgba(208,255,228,.13)";
    c.lineWidth = 1;
    roundedRectPath(c, g.ox + 4, g.oy + 4, g.boardW - 8, g.boardH - 8, Math.max(7, g.cell * .55));
    c.stroke();

    const corner = Math.max(13, g.cell * 1.4);
    c.strokeStyle = "rgba(93,255,172,.82)";
    c.lineWidth = Math.max(2, g.cell * .14);
    c.lineCap = "round";

    const x1 = g.ox, x2 = g.ox + g.boardW, y1 = g.oy, y2 = g.oy + g.boardH;
    [
      [[x1, y1 + corner], [x1, y1], [x1 + corner, y1]],
      [[x2 - corner, y1], [x2, y1], [x2, y1 + corner]],
      [[x1, y2 - corner], [x1, y2], [x1 + corner, y2]],
      [[x2 - corner, y2], [x2, y2], [x2, y2 - corner]]
    ].forEach(points => {
      c.beginPath();
      c.moveTo(points[0][0], points[0][1]);
      c.lineTo(points[1][0], points[1][1]);
      c.lineTo(points[2][0], points[2][1]);
      c.stroke();
    });
  }

  function drawEnergy(c, e, g, pulse = 0) {
    const p = cellCenter(e, g);
    const base = g.cell * .24 * e.scale;
    const radius = Math.max(2.3, base * (1 + pulse * .06));

    c.save();
    c.shadowColor = e.color;
    c.shadowBlur = radius * 4.2;
    c.fillStyle = e.color;
    c.beginPath();
    c.arc(p.x, p.y, radius, 0, Math.PI * 2);
    c.fill();

    c.globalAlpha = .7;
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.arc(p.x - radius * .25, p.y - radius * .25, Math.max(1, radius * .23), 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawSmoothSnake(c, snake, g) {
    if (!snake.alive || !snake.body.length) return;

    const points = snake.body.map(p => cellCenter(p, g));
    const width = Math.max(7, g.cell * .72);

    c.save();
    c.lineCap = "round";
    c.lineJoin = "round";

    const path = new Path2D();

    if (points.length === 1) {
      path.moveTo(points[0].x, points[0].y);
      path.lineTo(points[0].x + .01, points[0].y);
    } else {
      path.moveTo(points[points.length - 1].x, points[points.length - 1].y);

      for (let i = points.length - 2; i > 0; i--) {
        const current = points[i];
        const next = points[i - 1];
        const mx = (current.x + next.x) / 2;
        const my = (current.y + next.y) / 2;
        path.quadraticCurveTo(current.x, current.y, mx, my);
      }

      path.quadraticCurveTo(
        points[0].x, points[0].y,
        points[0].x, points[0].y
      );
    }

    c.strokeStyle = "rgba(0,0,0,.28)";
    c.lineWidth = width + Math.max(3, g.cell * .17);
    c.stroke(path);

    const grad = c.createLinearGradient(points[points.length - 1].x, points[points.length - 1].y, points[0].x, points[0].y);
    grad.addColorStop(0, snake.color);
    grad.addColorStop(1, lighten(snake.color, 22));

    c.shadowColor = snake.color;
    c.shadowBlur = snake.isPlayer ? width * .42 : width * .22;
    c.strokeStyle = grad;
    c.lineWidth = width;
    c.stroke(path);
    c.shadowBlur = 0;

    const head = points[0];
    const hr = width * .59;

    c.fillStyle = lighten(snake.color, 12);
    c.beginPath();
    c.arc(head.x, head.y, hr, 0, Math.PI * 2);
    c.fill();

    const d = snake.direction;
    const px = -d.y;
    const py = d.x;
    const front = hr * .34;
    const side = hr * .36;

    const eyes = [
      { x: head.x + d.x * front + px * side, y: head.y + d.y * front + py * side },
      { x: head.x + d.x * front - px * side, y: head.y + d.y * front - py * side }
    ];

    eyes.forEach(eye => {
      c.fillStyle = "#f7ffff";
      c.beginPath();
      c.arc(eye.x, eye.y, Math.max(2.1, hr * .26), 0, Math.PI * 2);
      c.fill();

      c.fillStyle = "#07111f";
      c.beginPath();
      c.arc(
        eye.x + d.x * hr * .08,
        eye.y + d.y * hr * .08,
        Math.max(1.05, hr * .11),
        0, Math.PI * 2
      );
      c.fill();
    });

    if (!snake.isPlayer) {
      c.font = `700 ${Math.max(9, g.cell * .48)}px -apple-system, sans-serif`;
      c.textAlign = "center";
      c.textBaseline = "bottom";
      c.fillStyle = "rgba(235,248,255,.78)";
      c.fillText(snake.name, head.x, head.y - hr - Math.max(4, g.cell * .25));
    }

    c.restore();
  }

  function lighten(hex, amount) {
    const clean = hex.replace("#", "");
    const n = parseInt(clean, 16);
    const r = Math.min(255, (n >> 16) + amount);
    const g = Math.min(255, ((n >> 8) & 255) + amount);
    const b = Math.min(255, (n & 255) + amount);
    return `rgb(${r},${g},${b})`;
  }

  function render() {
    if (!gameScreen.classList.contains("active")) return;

    const g = canvasGeometry(canvas);
    drawBoard(g.c, g);

    const pulse = (Math.sin(performance.now() / 280) + 1) / 2;
    energies.forEach(e => drawEnergy(g.c, e, g, pulse));
    snakes.forEach(s => drawSmoothSnake(g.c, s, g));
  }

  function drawPreview() {
    const pc = $("previewCanvas");
    const g = canvasGeometry(pc);
    drawBoard(g.c, g);

    const previewEnergy = [];
    for (let i = 0; i < 44; i++) {
      const r = Math.random();
      previewEnergy.push({
        x: randInt(1, COLS - 2),
        y: randInt(1, ROWS - 2),
        value: r < .1 ? 3 : r < .25 ? 2 : 1,
        color: r < .1 ? "#FFD166" : r < .25 ? "#77D7FF" : "#7CF3A4",
        scale: r < .1 ? 1.4 : 1
      });
    }
    previewEnergy.forEach(e => drawEnergy(g.c, e, g, .3));

    const demo = new Snake("YOU", playerColor, true);
    demo.body = [
      { x: 22, y: 15 }, { x: 21, y: 15 }, { x: 20, y: 15 },
      { x: 19, y: 15 }, { x: 18, y: 14 }, { x: 18, y: 13 },
      { x: 17, y: 12 }, { x: 16, y: 12 }
    ];
    demo.direction = RIGHT;

    const nova = new Snake("Nova", "#B889FF", false);
    nova.body = [
      { x: 31, y: 8 }, { x: 30, y: 8 }, { x: 29, y: 8 },
      { x: 28, y: 9 }, { x: 28, y: 10 }, { x: 27, y: 11 }
    ];
    nova.direction = RIGHT;

    drawSmoothSnake(g.c, demo, g);
    drawSmoothSnake(g.c, nova, g);
  }

  function setupMenu() {
    $("difficultyGroup").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-value]");
      if (!btn) return;
      difficulty = btn.dataset.value;
      $("difficultyGroup").querySelectorAll("button").forEach(b => b.classList.toggle("selected", b === btn));
    });

    $("skinGroup").addEventListener("click", (e) => {
      const btn = e.target.closest(".skin");
      if (!btn) return;
      playerColor = btn.dataset.color;
      $("skinGroup").querySelectorAll(".skin").forEach(b => b.classList.toggle("selected", b === btn));
      drawPreview();
    });

    $("startBtn").addEventListener("click", startWithCountdown);
    $("pauseBtn").addEventListener("click", () => state === "running" ? pause() : resume());
    $("resumeBtn").addEventListener("click", resume);
    $("restartBtn").addEventListener("click", restart);
    $("againBtn").addEventListener("click", restart);
    $("homeBtn").addEventListener("click", showHome);
    $("homeBtnFromOver").addEventListener("click", showHome);

    $("leaderboardBtn").addEventListener("click", () => $("leaderboardPanel").classList.toggle("open"));
    $("closeLeaderboardBtn").addEventListener("click", () => $("leaderboardPanel").classList.remove("open"));
  }

  function setupPWA() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(err => {
          console.warn("Service worker registration failed:", err);
        });
      });
    }
  }

  window.addEventListener("resize", () => {
    resizeCanvas();
    render();
    drawPreview();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "running") pause();
  });

  setupMenu();
  setupInput();
  setupPWA();

  $("homeBest").textContent = bestLength;
  drawPreview();
})();
