// ============================================================================
// Syndicate Sky 3884 - Game Logic
// A sci-fi/cyberpunk vertical shooter inspired by 1942
// ============================================================================

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Arne16 Color Palette (strict — only these 16 colours)
  // ---------------------------------------------------------------------------
  const C = {
    black:    '#000000',
    gray:     '#9D9D9D',
    white:    '#FFFFFF',
    red:      '#BE2633',
    pink:     '#E06F8B',
    brown:    '#493C2B',
    ochre:    '#A46422',
    orange:   '#EB8931',
    yellow:   '#F7E26B',
    teal:     '#2F484E',
    green:    '#44891A',
    lime:     '#A3CE27',
    navy:     '#1B2632',
    blue:     '#005784',
    sky:      '#31A2F2',
    cyan:     '#B2DCEF',
  };

  // ---------------------------------------------------------------------------
  // Canvas constants – dynamic logical resolution normalized around BASE_SIZE
  // ---------------------------------------------------------------------------
  const BASE_SIZE = 800;
  const MIN_LOGICAL_SHORT_SIDE = 480;
  let CW = BASE_SIZE;
  let CH = BASE_SIZE;
  let dpr = 1;
  let initialized = false;

  // ---------------------------------------------------------------------------
  // DOM refs (assigned once after DOMContentLoaded)
  // ---------------------------------------------------------------------------
  let canvas, ctx;
  let scoreEl, livesEl, waveEl, powerEl, hudInnerEl, touchHintEl;
  let startScreen, gameOverScreen;

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  let state = 'start'; // 'start' | 'playing' | 'gameover'
  let score = 0;
  let lives = 3;
  let wave = 1;
  let waveTimer = 0;
  let enemiesPerWave = 6;
  let enemiesSpawned = 0;
  let enemiesDefeated = 0;
  let waveDelay = 0;
  let screenShake = 0;
  let comboCount = 0;
  let comboTimer = 0;
  let bossActive = false;

  // ---------------------------------------------------------------------------
  // Player
  // ---------------------------------------------------------------------------
  const player = {
    x: CW / 2,
    y: CH - 100,
    w: 48,
    h: 48,
    speed: 5,
    boosting: false,
    fireRate: 10,
    fireTimer: 0,
    invincible: 0,
    powerLevel: 1,
    shieldEnergy: 0,
  };

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  const STICK_MAX_RADIUS = 50;
  const STICK_KNOB_RADIUS = 20;
  const STICK_DEADZONE = 4;
  const FIRE_BTN_RADIUS = 38;

  const keys = {};
  let touchFiring = false;

  const leftTouch = {
    active: false,
    id: null,
    originX: 0,
    originY: 0,
    currentX: 0,
    currentY: 0,
    knobX: 0,
    knobY: 0,
    dx: 0,
    dy: 0,
    alpha: 0,
  };

  const rightTouch = {
    active: false,
    touchIds: new Set(),
    x: 0,
    y: 0,
    alpha: 0,
    pulse: 0,
    tapQueued: false,
  };

  // ---------------------------------------------------------------------------
  // Game arrays
  // ---------------------------------------------------------------------------
  let stars = [];
  let gridLines = [];
  let bullets = [];
  let enemies = [];
  let enemyBullets = [];
  let particles = [];
  let powerups = [];
  let explosions = [];
  let bossBullets = [];

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------
  function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    scoreEl = document.getElementById('score');
    livesEl = document.getElementById('lives');
    waveEl = document.getElementById('wave');
    powerEl = document.getElementById('power');
    hudInnerEl = document.getElementById('hud-inner');
    touchHintEl = document.querySelector('.touch-controls-hint');
    startScreen = document.getElementById('startScreen');
    gameOverScreen = document.getElementById('gameOver');

    scaleCanvas();
    player.x = CW / 2;
    player.y = Math.max(player.h / 2 + 10, CH - 100);

    rebuildStarfield();
    rebuildGridLines();
    initialized = true;

    setupInput();
    setupTouch();

    window.addEventListener('resize', scaleCanvas);
    window.addEventListener('orientationchange', () => {
      scaleCanvas();
      setTimeout(scaleCanvas, 120);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scaleCanvas);
    }

    requestAnimationFrame(gameLoop);
  }

  // ---------------------------------------------------------------------------
  // Starfield & grid helpers
  // ---------------------------------------------------------------------------
  function getTargetStarCount() {
    return Math.max(80, Math.round(150 * (CW * CH) / (BASE_SIZE * BASE_SIZE)));
  }

  function rebuildStarfield() {
    const targetCount = getTargetStarCount();
    stars = [];
    for (let i = 0; i < targetCount; i++) {
      stars.push({
        x: Math.random() * CW,
        y: Math.random() * CH,
        speed: 0.3 + Math.random() * 2.5,
        size: Math.random() < 0.2 ? 3 : (Math.random() < 0.5 ? 2 : 1),
        brightness: Math.random(),
      });
    }
  }

  function rebuildGridLines() {
    gridLines = [];
    for (let y = 0; y < CH; y += 50) {
      gridLines.push({ y: y, speed: 0.8 });
    }
  }

  function remapEntities(oldCW, oldCH, newCW, newCH) {
    const ratioX = newCW / oldCW;
    const ratioY = newCH / oldCH;

    player.x = Math.max(player.w / 2 + 10, Math.min(newCW - player.w / 2 - 10, player.x * ratioX));
    player.y = Math.max(player.h / 2 + 10, Math.min(newCH - player.h / 2 - 10, player.y * ratioY));

    const scalePoint = (obj) => {
      obj.x *= ratioX;
      obj.y *= ratioY;
    };

    bullets.forEach(scalePoint);
    enemyBullets.forEach(scalePoint);
    bossBullets.forEach(scalePoint);
    powerups.forEach(scalePoint);
    particles.forEach(scalePoint);
    explosions.forEach(scalePoint);

    enemies.forEach((e) => {
      scalePoint(e);
      e.x = Math.max(e.w / 2 + 12, Math.min(newCW - e.w / 2 - 12, e.x));
      if (e.type === 'boss') {
        e.targetY = Math.min(100, newCH * 0.2);
        if (!e.entering) {
          e.y = Math.max(60, Math.min(Math.min(180, newCH * 0.35), e.y));
        }
      }
    });

    const targetStars = getTargetStarCount();
    stars.forEach((s) => {
      s.x = (s.x * ratioX) % newCW;
      s.y = (s.y * ratioY) % newCH;
    });
    while (stars.length < targetStars) {
      stars.push({
        x: Math.random() * newCW,
        y: Math.random() * newCH,
        speed: 0.3 + Math.random() * 2.5,
        size: Math.random() < 0.2 ? 3 : (Math.random() < 0.5 ? 2 : 1),
        brightness: Math.random(),
      });
    }
    if (stars.length > targetStars) {
      stars.length = targetStars;
    }

    if (leftTouch.alpha > 0 || leftTouch.active) {
      leftTouch.originX *= ratioX;
      leftTouch.originY *= ratioY;
      leftTouch.currentX *= ratioX;
      leftTouch.currentY *= ratioY;
      leftTouch.knobX *= ratioX;
      leftTouch.knobY *= ratioY;
    }
    if (rightTouch.alpha > 0 || rightTouch.active) {
      rightTouch.x *= ratioX;
      rightTouch.y *= ratioY;
    }

    rebuildGridLines();
  }

  // ---------------------------------------------------------------------------
  // Canvas scaling — dynamic resolution & aspect ratio to fit viewport
  // ---------------------------------------------------------------------------
  function scaleCanvas() {
    const vpW = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const vpH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const margin = Math.min(vpW, vpH) < 600 ? 4 : 12;
    const displayW = Math.max(200, Math.floor(vpW - margin));
    const displayH = Math.max(200, Math.floor(vpH - margin));
    const aspect = displayW / displayH;

    let newCW, newCH;
    if (aspect >= 1) {
      newCH = Math.max(MIN_LOGICAL_SHORT_SIDE, Math.round(BASE_SIZE / Math.sqrt(aspect)));
      newCW = Math.round(newCH * aspect);
    } else {
      newCW = Math.max(MIN_LOGICAL_SHORT_SIDE, Math.round(BASE_SIZE * Math.sqrt(aspect)));
      newCH = Math.round(newCW / aspect);
    }

    const oldCW = CW;
    const oldCH = CH;
    CW = newCW;
    CH = newCH;

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(CW * dpr);
    canvas.height = Math.round(CH * dpr);
    canvas.style.width = displayW + 'px';
    canvas.style.height = displayH + 'px';

    if (initialized && (oldCW !== newCW || oldCH !== newCH)) {
      remapEntities(oldCW, oldCH, newCW, newCH);
    }
  }

  // ---------------------------------------------------------------------------
  // Input handlers
  // ---------------------------------------------------------------------------
  function setupInput() {
    window.addEventListener('keydown', (e) => {
      keys[e.code] = true;

      if ((e.code === 'Space' || e.code === 'Enter') && state === 'start') {
        startGame();
      }
      if (e.code === 'Space' || e.code === 'KeyZ') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { keys[e.code] = false; });

    document.getElementById('restartBtn').addEventListener('click', () => {
      restartGame();
    });

    document.getElementById('startBtn').addEventListener('click', () => {
      startGame();
    });
  }

  function getCanvasCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? CW / rect.width : 1;
    const scaleY = rect.height > 0 ? CH / rect.height : 1;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function resetTouchState() {
    leftTouch.active = false;
    leftTouch.id = null;
    leftTouch.dx = 0;
    leftTouch.dy = 0;
    leftTouch.alpha = 0;
    leftTouch.knobX = leftTouch.originX;
    leftTouch.knobY = leftTouch.originY;

    rightTouch.active = false;
    rightTouch.touchIds.clear();
    rightTouch.alpha = 0;
    rightTouch.pulse = 0;
    rightTouch.tapQueued = false;
    touchFiring = false;
  }

  function startLeftStick(id, x, y) {
    leftTouch.active = true;
    leftTouch.id = id;
    leftTouch.originX = x;
    leftTouch.originY = y;
    leftTouch.currentX = x;
    leftTouch.currentY = y;
    leftTouch.knobX = x;
    leftTouch.knobY = y;
    leftTouch.dx = 0;
    leftTouch.dy = 0;
    leftTouch.alpha = 1;
  }

  function updateLeftStick(x, y) {
    leftTouch.currentX = x;
    leftTouch.currentY = y;

    let rawDx = x - leftTouch.originX;
    let rawDy = y - leftTouch.originY;
    let dist = Math.hypot(rawDx, rawDy);

    // Floating stick origin follows long drags so reversing direction responds immediately
    if (dist > STICK_MAX_RADIUS) {
      const excess = dist - STICK_MAX_RADIUS;
      leftTouch.originX += (rawDx / dist) * excess;
      leftTouch.originY += (rawDy / dist) * excess;
      leftTouch.originX = Math.max(20, Math.min(CW / 2 - 10, leftTouch.originX));
      leftTouch.originY = Math.max(20, Math.min(CH - 20, leftTouch.originY));
      rawDx = x - leftTouch.originX;
      rawDy = y - leftTouch.originY;
      dist = Math.hypot(rawDx, rawDy);
    }

    if (dist > STICK_MAX_RADIUS && dist > 0) {
      leftTouch.knobX = leftTouch.originX + (rawDx / dist) * STICK_MAX_RADIUS;
      leftTouch.knobY = leftTouch.originY + (rawDy / dist) * STICK_MAX_RADIUS;
    } else {
      leftTouch.knobX = x;
      leftTouch.knobY = y;
    }

    if (dist > STICK_DEADZONE && dist > 0) {
      const mag = Math.min(1, (dist - STICK_DEADZONE) / (STICK_MAX_RADIUS - STICK_DEADZONE));
      leftTouch.dx = (rawDx / dist) * mag;
      leftTouch.dy = (rawDy / dist) * mag;
    } else {
      leftTouch.dx = 0;
      leftTouch.dy = 0;
    }
  }

  function endLeftStick() {
    leftTouch.active = false;
    leftTouch.id = null;
    leftTouch.dx = 0;
    leftTouch.dy = 0;
    leftTouch.knobX = leftTouch.originX;
    leftTouch.knobY = leftTouch.originY;
  }

  function startRightFire(id, x, y) {
    rightTouch.touchIds.add(id);
    rightTouch.active = true;
    rightTouch.x = x;
    rightTouch.y = y;
    rightTouch.alpha = 1;
    rightTouch.pulse = 0;
    rightTouch.tapQueued = true;
    touchFiring = true;
  }

  function endRightFire(id) {
    rightTouch.touchIds.delete(id);
    if (rightTouch.touchIds.size === 0) {
      rightTouch.active = false;
      touchFiring = false;
    }
  }

  function setupTouch() {
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    let mouseDownZone = null;

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || state !== 'playing') return;
      const pos = getCanvasCoords(e.clientX, e.clientY);
      if (pos.x < CW / 2) {
        if (!leftTouch.active) {
          mouseDownZone = 'left';
          startLeftStick('mouse', pos.x, pos.y);
        }
      } else {
        mouseDownZone = 'right';
        startRightFire('mouse', pos.x, pos.y);
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!mouseDownZone || state !== 'playing') return;
      const pos = getCanvasCoords(e.clientX, e.clientY);
      if (mouseDownZone === 'left' && leftTouch.active && leftTouch.id === 'mouse') {
        updateLeftStick(pos.x, pos.y);
      } else if (mouseDownZone === 'right' && rightTouch.touchIds.has('mouse')) {
        rightTouch.x = Math.max(CW / 2 + 10, pos.x);
        rightTouch.y = pos.y;
      }
    });

    const endMouseControl = () => {
      if (!mouseDownZone) return;
      if (mouseDownZone === 'left' && leftTouch.active && leftTouch.id === 'mouse') {
        endLeftStick();
      } else if (mouseDownZone === 'right' && rightTouch.touchIds.has('mouse')) {
        endRightFire('mouse');
      }
      mouseDownZone = null;
    };

    canvas.addEventListener('mouseup', endMouseControl);
    canvas.addEventListener('mouseleave', endMouseControl);
    window.addEventListener('mouseup', endMouseControl);
    window.addEventListener('blur', () => {
      mouseDownZone = null;
      resetTouchState();
    });

    // Also handle click for the start screen on mobile
    startScreen.addEventListener('touchstart', (e) => {
      e.preventDefault();
      startGame();
    }, { passive: false });

    gameOverScreen.addEventListener('touchstart', (e) => {
      if (e.target.id === 'restartBtn' || e.target.closest('#restartBtn')) return;
      e.preventDefault();
    }, { passive: false });
  }

  function handleTouchStart(e) {
    e.preventDefault();
    if (state === 'start') { startGame(); return; }
    if (state === 'gameover') return;

    const list = e.changedTouches || e.touches;
    if (!list) return;

    for (let i = 0; i < list.length; i++) {
      const touch = list[i];
      const pos = getCanvasCoords(touch.clientX, touch.clientY);
      const id = touch.identifier !== undefined ? touch.identifier : 0;

      if (pos.x < CW / 2) {
        if (!leftTouch.active) {
          startLeftStick(id, pos.x, pos.y);
        }
      } else {
        startRightFire(id, pos.x, pos.y);
      }
    }
  }

  function handleTouchMove(e) {
    e.preventDefault();
    if (state !== 'playing') return;

    const list = e.changedTouches || e.touches;
    if (!list) return;

    for (let i = 0; i < list.length; i++) {
      const touch = list[i];
      const pos = getCanvasCoords(touch.clientX, touch.clientY);
      const id = touch.identifier !== undefined ? touch.identifier : 0;

      if (leftTouch.active && (leftTouch.id === id || touch.identifier === undefined)) {
        updateLeftStick(pos.x, pos.y);
      } else if (rightTouch.touchIds.has(id)) {
        rightTouch.x = Math.max(CW / 2 + 10, pos.x);
        rightTouch.y = pos.y;
      }
    }
  }

  function handleTouchEnd(e) {
    e.preventDefault();

    const list = e.changedTouches;
    if (list && list.length > 0) {
      for (let i = 0; i < list.length; i++) {
        const touch = list[i];
        const id = touch.identifier !== undefined ? touch.identifier : 0;
        if (leftTouch.active && leftTouch.id === id) {
          endLeftStick();
        }
        if (rightTouch.touchIds.has(id)) {
          endRightFire(id);
        }
      }
    }

    if (e.touches) {
      const activeIds = new Set();
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        activeIds.add(t.identifier !== undefined ? t.identifier : 0);
      }
      if (leftTouch.active && !activeIds.has(leftTouch.id)) {
        endLeftStick();
      }
      for (const id of Array.from(rightTouch.touchIds)) {
        if (!activeIds.has(id)) {
          endRightFire(id);
        }
      }
    } else if (!list || list.length === 0) {
      endLeftStick();
      for (const id of Array.from(rightTouch.touchIds)) {
        endRightFire(id);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Game state management
  // ---------------------------------------------------------------------------
  function startGame() {
    resetTouchState();
    state = 'playing';
    startScreen.classList.add('hidden');
    if (touchHintEl) touchHintEl.classList.remove('hidden');
  }

  function restartGame() {
    resetTouchState();
    score = 0;
    lives = 3;
    wave = 1;
    waveTimer = 0;
    waveDelay = 0;
    enemiesPerWave = 6;
    enemiesSpawned = 0;
    enemiesDefeated = 0;
    comboCount = 0;
    comboTimer = 0;
    bossActive = false;
    player.x = CW / 2;
    player.y = Math.max(player.h / 2 + 10, CH - 100);
    player.invincible = 60;
    player.powerLevel = 1;
    player.fireTimer = 0;
    player.shieldEnergy = 0;
    bullets = [];
    enemies = [];
    enemyBullets = [];
    particles = [];
    powerups = [];
    explosions = [];
    bossBullets = [];
    gameOverScreen.classList.add('hidden');
    if (touchHintEl) touchHintEl.classList.remove('hidden');
    state = 'playing';
  }

  // ---------------------------------------------------------------------------
  // Enemy spawning
  // ---------------------------------------------------------------------------
  function spawnEnemy() {
    const types = ['basic'];
    if (wave >= 2) types.push('fast');
    if (wave >= 3) types.push('tank');
    if (wave >= 4) types.push('shooter');
    if (wave >= 5) types.push('zigzag');

    const type = types[Math.floor(Math.random() * types.length)];
    const margin = 50;

    const base = {
      x: margin + Math.random() * (CW - margin * 2),
      y: -40,
      w: 36,
      h: 36,
      type: type,
      hp: 1,
      speed: 1.5,
      score: 100,
      moveTimer: Math.random() * Math.PI * 2,
      movePhase: Math.random() * Math.PI * 2,
      fireTimer: Math.floor(Math.random() * 60),
      fireRate: 120,
      flashTimer: 0,
    };

    switch (type) {
      case 'fast':
        Object.assign(base, {
          speed: 2.8, w: 28, h: 28, hp: 1, score: 150,
          movePattern: 'sine',
        });
        break;
      case 'tank':
        Object.assign(base, {
          speed: 0.7, w: 48, h: 48,
          hp: 3 + Math.floor(wave / 3), score: 300,
          movePattern: 'straight',
        });
        break;
      case 'shooter':
        Object.assign(base, {
          speed: 1.0, w: 40, h: 40, hp: 2, score: 250,
          movePattern: 'sine',
          fireRate: Math.max(50, 110 - wave * 4),
        });
        break;
      case 'zigzag':
        Object.assign(base, {
          speed: 1.4, w: 32, h: 32, hp: 2, score: 200,
          movePattern: 'zigzag',
        });
        break;
    }

    enemies.push(base);
  }

  function spawnBoss() {
    bossActive = true;
    const boss = {
      x: CW / 2,
      y: -80,
      w: 120,
      h: 80,
      type: 'boss',
      hp: 20 + wave * 5,
      maxHp: 20 + wave * 5,
      speed: 0.5,
      score: 2000 + wave * 500,
      moveTimer: 0,
      movePattern: 'boss',
      phase: 0,
      phaseTimer: 0,
      fireTimer: 0,
      fireRate: 30,
      flashTimer: 0,
      entering: true,
      targetY: Math.min(100, CH * 0.2),
    };
    enemies.push(boss);
  }

  // ---------------------------------------------------------------------------
  // Particles & effects
  // ---------------------------------------------------------------------------
  function spawnParticles(x, y, color, count, spread, life) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * spread,
        vy: (Math.random() - 0.5) * spread,
        life: (life || 25) + Math.random() * (life || 25),
        maxLife: (life || 50),
        color: color,
        size: 1.5 + Math.random() * 4,
      });
    }
  }

  function spawnExplosion(x, y, big) {
    const colors = [C.yellow, C.orange, C.red, C.white];
    const count = big ? 40 : 15;
    const spread = big ? 10 : 6;
    colors.forEach(c => spawnParticles(x, y, c, count / colors.length, spread));
    explosions.push({
      x, y,
      radius: big ? 60 : 25,
      maxRadius: big ? 60 : 25,
      progress: 0,
      color: C.orange,
    });
  }

  // ---------------------------------------------------------------------------
  // Collision detection
  // ---------------------------------------------------------------------------
  function collides(a, b) {
    const aw = a.w / 2, ah = a.h / 2;
    const bw = b.w / 2, bh = b.h / 2;
    return a.x - aw < b.x + bw &&
      a.x + aw > b.x - bw &&
      a.y - ah < b.y + bh &&
      a.y + ah > b.y - bh;
  }

  // ---------------------------------------------------------------------------
  // Player hit
  // ---------------------------------------------------------------------------
  function playerHit() {
    if (player.invincible > 0) return;
    if (player.shieldEnergy > 0) {
      player.shieldEnergy = 0;
      player.invincible = 30;
      spawnParticles(player.x, player.y, C.cyan, 20, 8);
      return;
    }
    lives--;
    screenShake = 15;
    spawnExplosion(player.x, player.y, false);
    player.invincible = 90;
    player.powerLevel = Math.max(1, player.powerLevel - 1);

    if (lives <= 0) {
      state = 'gameover';
      resetTouchState();
      gameOverScreen.classList.remove('hidden');
      if (touchHintEl) touchHintEl.classList.add('hidden');
      document.getElementById('finalScore').textContent = 'SCORE: ' + score.toLocaleString();
      document.getElementById('finalWave').textContent = 'WAVES SURVIVED: ' + wave;
      document.getElementById('highScoreText').textContent =
        'HIGH SCORE: ' + (localStorage.getItem('ss3884_hs') || '0');
    }
  }

  // ---------------------------------------------------------------------------
  // UPDATE
  // ---------------------------------------------------------------------------
  function update() {
    if (state === 'start') {
      // ---- Starfield ----
      const starSpeedMult = 1;
      stars.forEach(s => {
        s.y += s.speed * starSpeedMult;
        if (s.y > CH) {
          s.y = 0;
          s.x = Math.random() * CW;
        }
      });

      // ---- Grid lines ----
      gridLines.forEach(g => {
        g.y += g.speed * starSpeedMult;
        if (g.y > CH) g.y -= CH;
      });
      return;
    }

    if (state !== 'playing') return;

    // ---- Player movement ----
    const keyboardInput = keys['ArrowLeft'] || keys['KeyA'] ||
      keys['ArrowRight'] || keys['KeyD'] ||
      keys['ArrowUp'] || keys['KeyW'] ||
      keys['ArrowDown'] || keys['KeyS'];

    player.boosting = keys['ShiftLeft'] || keys['ShiftRight'];
    let spd = player.speed * (player.boosting ? 1.8 : 1);

    if (keyboardInput) {
      if (keys['ArrowLeft'] || keys['KeyA']) player.x -= spd;
      if (keys['ArrowRight'] || keys['KeyD']) player.x += spd;
      if (keys['ArrowUp'] || keys['KeyW']) player.y -= spd;
      if (keys['ArrowDown'] || keys['KeyS']) player.y += spd;
    }

    // Touch movement — virtual analog stick on left side
    if (leftTouch.active) {
      const rawDx = leftTouch.currentX - leftTouch.originX;
      const rawDy = leftTouch.currentY - leftTouch.originY;
      const dist = Math.hypot(rawDx, rawDy);
      if (dist > STICK_DEADZONE) {
        const normMag = Math.min(1, (dist - STICK_DEADZONE) / (STICK_MAX_RADIUS - STICK_DEADZONE));
        const moveSpeed = spd * 1.25 * normMag;
        player.x += (rawDx / dist) * moveSpeed;
        player.y += (rawDy / dist) * moveSpeed;
      }
    }

    // Touch control indicator fade & pulse animations
    if (leftTouch.active) {
      leftTouch.alpha = 1;
    } else if (leftTouch.alpha > 0) {
      leftTouch.alpha = Math.max(0, leftTouch.alpha - 0.08);
    }

    if (rightTouch.active) {
      rightTouch.alpha = 1;
      rightTouch.pulse = Math.min(1, rightTouch.pulse + 0.07);
      if (rightTouch.pulse >= 1) rightTouch.pulse = 0;
    } else {
      if (rightTouch.pulse < 1) {
        rightTouch.pulse = Math.min(1, rightTouch.pulse + 0.08);
      }
      if (rightTouch.alpha > 0) {
        rightTouch.alpha = Math.max(0, rightTouch.alpha - 0.07);
      }
    }

    // Clamp player to bounds
    player.x = Math.max(player.w / 2 + 10, Math.min(CW - player.w / 2 - 10, player.x));
    player.y = Math.max(player.h / 2 + 10, Math.min(CH - player.h / 2 - 10, player.y));

    if (player.invincible > 0) player.invincible--;

    // Combo timer decay
    if (comboTimer > 0) {
      comboTimer--;
      if (comboTimer <= 0) comboCount = 0;
    }

    // ---- Firing ----
    const firing = keys['Space'] || keys['KeyZ'] || touchFiring || rightTouch.active || rightTouch.tapQueued;
    if (firing) {
      if (rightTouch.tapQueued && player.fireTimer > 0) {
        // Allow distinct taps to fire promptly while respecting a brief minimum cadence
        player.fireTimer = Math.min(player.fireTimer, 1);
      }
      player.fireTimer--;
      if (player.fireTimer <= 0) {
        player.fireTimer = player.fireRate;
        rightTouch.tapQueued = false;
        const bSpeed = -12;

        // Center shot
        bullets.push({ x: player.x, y: player.y - player.h / 2, w: 5, h: 16, vx: 0, vy: bSpeed, color: C.cyan });

        if (player.powerLevel >= 2) {
          bullets.push({ x: player.x - 14, y: player.y - player.h / 2 + 6, w: 4, h: 12, vx: -0.3, vy: bSpeed, color: C.sky });
          bullets.push({ x: player.x + 14, y: player.y - player.h / 2 + 6, w: 4, h: 12, vx: 0.3, vy: bSpeed, color: C.sky });
        }
        if (player.powerLevel >= 3) {
          bullets.push({ x: player.x - 22, y: player.y - 8, w: 4, h: 12, vx: -1.2, vy: bSpeed * 0.95, color: C.sky });
          bullets.push({ x: player.x + 22, y: player.y - 8, w: 4, h: 12, vx: 1.2, vy: bSpeed * 0.95, color: C.sky });
        }
        if (player.powerLevel >= 4) {
          bullets.push({ x: player.x - 30, y: player.y, w: 3, h: 10, vx: -2, vy: bSpeed * 0.85, color: C.lime });
          bullets.push({ x: player.x + 30, y: player.y, w: 3, h: 10, vx: 2, vy: bSpeed * 0.85, color: C.lime });
        }
      }
    } else {
      player.fireTimer = 0;
    }

    // ---- Update player bullets ----
    bullets = bullets.filter(b => {
      b.y += b.vy;
      b.x += b.vx || 0;
      return b.y > -20 && b.y < CH + 20 && b.x > -20 && b.x < CW + 20;
    });

    // ---- Update enemy bullets ----
    enemyBullets = enemyBullets.filter(b => {
      b.x += b.vx || 0;
      b.y += b.vy || 4;
      return b.y > -20 && b.y < CH + 20 && b.x > -20 && b.x < CW + 20;
    });

    // ---- Update boss bullets ----
    bossBullets = bossBullets.filter(b => {
      b.x += b.vx || 0;
      b.y += b.vy || 0;
      b.life = (b.life || 300) - 1;
      if (b.angle !== undefined) {
        b.vx = Math.cos(b.angle) * b.speed;
        b.vy = Math.sin(b.angle) * b.speed;
        b.x += b.vx;
        b.y += b.vy;
      }
      return b.life > 0 && b.y > -20 && b.y < CH + 20;
    });

    // ---- Wave management ----
    if (!bossActive && enemiesSpawned < enemiesPerWave && waveDelay <= 0) {
      waveTimer++;
      const spawnInterval = Math.max(18, 45 - wave * 2);
      if (waveTimer % spawnInterval === 0) {
        spawnEnemy();
        enemiesSpawned++;
      }
    }

    if (!bossActive && enemiesSpawned >= enemiesPerWave && enemies.length === 0) {
      waveDelay++;
      if (waveDelay > 70) {
        // Boss every 5 waves
        if (wave % 5 === 0) {
          spawnBoss();
          enemiesPerWave = 6 + wave * 3;
        } else {
          wave++;
          enemiesPerWave = 6 + wave * 3;
        }
        waveDelay = 0;
        enemiesSpawned = 0;
        enemiesDefeated = 0;
      }
    }

    // ---- Update enemies ----
    enemies = enemies.filter(e => {
      // Flash timer
      if (e.flashTimer > 0) e.flashTimer--;

      if (e.type === 'boss') {
        updateBoss(e);
        return e.hp > 0;
      }

      e.y += e.speed;
      e.moveTimer += 0.03;

      if (e.movePattern === 'sine') {
        e.x += Math.sin(e.moveTimer * 2 + e.movePhase) * 1.5;
      } else if (e.movePattern === 'zigzag') {
        e.x += Math.sin(e.moveTimer * 3 + e.movePhase) * 3;
      }
      e.x = Math.max(e.w / 2 + 12, Math.min(CW - e.w / 2 - 12, e.x));

      // Enemy shooting
      if (e.type === 'shooter') {
        e.fireTimer++;
        if (e.fireTimer >= e.fireRate && e.y > 40 && e.y < CH - 120) {
          e.fireTimer = 0;
          const dx = player.x - e.x;
          const dy = player.y - e.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const speed = 3.5 + wave * 0.15;
          enemyBullets.push({
            x: e.x, y: e.y + e.h / 2,
            w: 5, h: 10,
            vx: (dx / dist) * speed,
            vy: (dy / dist) * speed,
          });
        }
      }

      // Collision with player
      if (player.invincible <= 0 && collides(player, e)) {
        playerHit();
        e.hp -= 2;
        if (e.hp <= 0) {
          spawnExplosion(e.x, e.y, false);
          score += e.score;
          dropPowerup(e);
          return false;
        }
      }

      // Off screen
      if (e.y > CH + 60) return false;
      return true;
    });

    // ---- Bullet-enemy collisions ----
    bullets = bullets.filter(b => {
      let hit = false;
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (collides(b, e)) {
          hit = true;
          e.hp--;
          e.flashTimer = 4;
          spawnParticles(b.x, b.y, C.cyan, 4, 3, 10);
          if (e.hp <= 0) {
            const big = e.type === 'boss';
            spawnExplosion(e.x, e.y, big);
            comboCount++;
            comboTimer = 90;
            const comboMult = Math.min(comboCount, 10);
            score += e.score * comboMult;
            screenShake = big ? 20 : 5;
            dropPowerup(e);
            if (e.type === 'boss') {
              bossActive = false;
              // Extra powerup drop for boss
              powerups.push({
                x: e.x, y: e.y,
                type: 'power', w: 20, h: 20,
                vy: 1.5, pulseTimer: 0,
              });
              powerups.push({
                x: e.x - 30, y: e.y + 10,
                type: 'life', w: 20, h: 20,
                vy: 1.5, pulseTimer: Math.PI,
              });
            }
            enemies.splice(i, 1);
            enemiesDefeated++;
          }
          break;
        }
      }
      return !hit;
    });

    // ---- Enemy bullet-player collisions ----
    enemyBullets = enemyBullets.filter(b => {
      if (collides(b, player)) {
        playerHit();
        return false;
      }
      return true;
    });

    bossBullets = bossBullets.filter(b => {
      if (collides(b, player)) {
        playerHit();
        return false;
      }
      return true;
    });

    // ---- Powerups ----
    powerups = powerups.filter(p => {
      p.y += p.vy;
      p.pulseTimer += 0.08;
      if (collides(player, p)) {
        if (p.type === 'power') {
          player.powerLevel = Math.min(4, player.powerLevel + 1);
          spawnParticles(p.x, p.y, C.lime, 15, 5);
        } else if (p.type === 'life') {
          lives = Math.min(5, lives + 1);
          spawnParticles(p.x, p.y, C.yellow, 15, 5);
        } else if (p.type === 'shield') {
          player.shieldEnergy = 1;
          spawnParticles(p.x, p.y, C.cyan, 15, 5);
        }
        return false;
      }
      return p.y < CH + 20;
    });

    // ---- Particles ----
    particles = particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.life--;
      return p.life > 0;
    });

    // ---- Explosions ----
    explosions = explosions.filter(e => {
      e.progress += 0.05;
      return e.progress < 1;
    });

    // ---- Starfield ----
    const starSpeedMult = player.boosting ? 2.5 : 1;
    stars.forEach(s => {
      s.y += s.speed * starSpeedMult;
      if (s.y > CH) {
        s.y = 0;
        s.x = Math.random() * CW;
      }
    });

    // ---- Grid lines ----
    gridLines.forEach(g => {
      g.y += g.speed * starSpeedMult;
      if (g.y > CH) g.y -= CH;
    });

    // ---- Screen shake decay ----
    if (screenShake > 0) screenShake *= 0.85;
    if (screenShake < 0.5) screenShake = 0;

    // ---- Update UI ----
    updateUI();
  }

  // ---------------------------------------------------------------------------
  // Boss update
  // ---------------------------------------------------------------------------
  function updateBoss(b) {
    b.moveTimer += 0.02;

    if (b.entering) {
      b.y += 1.5;
      if (b.y >= b.targetY) {
        b.entering = false;
      }
      return;
    }

    // Movement pattern
    b.phaseTimer++;
    b.x += Math.sin(b.moveTimer) * 2;
    b.x = Math.max(b.w / 2 + 12, Math.min(CW - b.w / 2 - 12, b.x));
    b.y += Math.sin(b.moveTimer * 0.5) * 0.5;
    b.y = Math.max(60, Math.min(Math.min(180, CH * 0.35), b.y));

    // Firing patterns
    b.fireTimer++;
    const fireRate = Math.max(15, b.fireRate - wave);

    if (b.fireTimer >= fireRate) {
      b.fireTimer = 0;
      b.phase = (b.phase + 1) % 3;

      if (b.phase === 0) {
        // Spread shot
        for (let a = -3; a <= 3; a++) {
          const angle = Math.PI / 2 + (a * 0.2);
          bossBullets.push({
            x: b.x, y: b.y + b.h / 2,
            w: 8, h: 8,
            vx: Math.cos(angle) * 3,
            vy: Math.sin(angle) * 3,
            life: 200,
            color: C.pink,
          });
        }
      } else if (b.phase === 1) {
        // Aimed shot
        const dx = player.x - b.x;
        const dy = player.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        bossBullets.push({
          x: b.x - 20, y: b.y + b.h / 2,
          w: 10, h: 10,
          vx: (dx / dist) * 4,
          vy: (dy / dist) * 4,
          life: 200,
          color: C.red,
        });
        bossBullets.push({
          x: b.x + 20, y: b.y + b.h / 2,
          w: 10, h: 10,
          vx: (dx / dist) * 4,
          vy: (dy / dist) * 4,
          life: 200,
          color: C.red,
        });
      } else {
        // Ring burst
        for (let a = 0; a < 12; a++) {
          const angle = (a / 12) * Math.PI * 2 + b.moveTimer;
          bossBullets.push({
            x: b.x, y: b.y,
            w: 6, h: 6,
            vx: Math.cos(angle) * 2.5,
            vy: Math.sin(angle) * 2.5,
            life: 150,
            color: C.orange,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Powerup dropping
  // ---------------------------------------------------------------------------
  function dropPowerup(e) {
    if (Math.random() < 0.12) {
      const r = Math.random();
      const type = r < 0.5 ? 'power' : (r < 0.8 ? 'shield' : 'life');
      powerups.push({
        x: e.x, y: e.y,
        type: type,
        w: 20, h: 20,
        vy: 1.5,
        pulseTimer: 0,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // UI update
  // ---------------------------------------------------------------------------
  function updateUI() {
    if (scoreEl) scoreEl.textContent = 'SCORE: ' + score.toLocaleString();
    if (livesEl) livesEl.textContent = 'LIVES: ' + '♥'.repeat(Math.max(0, lives));
    if (waveEl) {
      waveEl.textContent = bossActive ? '⚠ BOSS ⚠' : 'WAVE: ' + wave;
      waveEl.style.color = bossActive ? C.red : C.cyan;
    }
    if (powerEl) {
      const pips = [];
      for (let i = 0; i < 4; i++) pips.push(i < player.powerLevel ? '◆' : '◇');
      powerEl.textContent = 'POWER: ' + pips.join('');
    }
  }

  // ---------------------------------------------------------------------------
  // DRAW helpers
  // ---------------------------------------------------------------------------
  function drawNeonRect(x, y, w, h, color, glow) {
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
    }
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.shadowBlur = 0;
  }

  function drawNeonLine(x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ---------------------------------------------------------------------------
  // Draw player spacecraft
  // ---------------------------------------------------------------------------
  function drawPlayer() {
    if (player.invincible > 0 && Math.floor(player.invincible / 3) % 2 === 0) return;

    const px = player.x, py = player.y;
    const s = 1.2; // scale

    ctx.save();
    ctx.translate(px, py);

    // Engine glow
    const flameLen = (12 + Math.random() * 10) * s;
    const flameW = 6 * s;
    ctx.fillStyle = C.yellow;
    ctx.beginPath();
    ctx.moveTo(-flameW, 16 * s);
    ctx.lineTo(flameW, 16 * s);
    ctx.lineTo(0, 16 * s + flameLen);
    ctx.fill();

    ctx.fillStyle = C.orange;
    ctx.beginPath();
    ctx.moveTo(-flameW * 0.6, 16 * s);
    ctx.lineTo(flameW * 0.6, 16 * s);
    ctx.lineTo(0, 16 * s + flameLen * 0.7);
    ctx.fill();

    ctx.fillStyle = C.white;
    ctx.beginPath();
    ctx.moveTo(-2 * s, 16 * s);
    ctx.lineTo(2 * s, 16 * s);
    ctx.lineTo(0, 16 * s + flameLen * 0.4);
    ctx.fill();

    // Main fuselage
    ctx.fillStyle = C.navy;
    ctx.beginPath();
    ctx.moveTo(0, -24 * s);
    ctx.lineTo(6 * s, -16 * s);
    ctx.lineTo(6 * s, 16 * s);
    ctx.lineTo(-6 * s, 16 * s);
    ctx.lineTo(-6 * s, -16 * s);
    ctx.closePath();
    ctx.fill();

    // Nose
    ctx.fillStyle = C.cyan;
    ctx.beginPath();
    ctx.moveTo(0, -28 * s);
    ctx.lineTo(4 * s, -20 * s);
    ctx.lineTo(-4 * s, -20 * s);
    ctx.closePath();
    ctx.fill();

    // Nose tip
    ctx.fillStyle = C.white;
    ctx.fillRect(-1.5 * s, -30 * s, 3 * s, 4 * s);

    // Wing left
    ctx.fillStyle = C.blue;
    ctx.beginPath();
    ctx.moveTo(-6 * s, -2 * s);
    ctx.lineTo(-26 * s, 8 * s);
    ctx.lineTo(-26 * s, 16 * s);
    ctx.lineTo(-8 * s, 12 * s);
    ctx.lineTo(-6 * s, 8 * s);
    ctx.closePath();
    ctx.fill();

    // Wing right
    ctx.beginPath();
    ctx.moveTo(6 * s, -2 * s);
    ctx.lineTo(26 * s, 8 * s);
    ctx.lineTo(26 * s, 16 * s);
    ctx.lineTo(8 * s, 12 * s);
    ctx.lineTo(6 * s, 8 * s);
    ctx.closePath();
    ctx.fill();

    // Wing accents
    ctx.fillStyle = C.sky;
    ctx.fillRect(-24 * s, 10 * s, 16 * s, 2 * s);
    ctx.fillRect(8 * s, 10 * s, 16 * s, 2 * s);

    // Wing tips (red markers)
    ctx.fillStyle = C.red;
    ctx.fillRect(-28 * s, 13 * s, 4 * s, 6 * s);
    ctx.fillRect(24 * s, 13 * s, 4 * s, 6 * s);

    // Cockpit
    ctx.fillStyle = C.sky;
    ctx.beginPath();
    ctx.moveTo(0, -18 * s);
    ctx.lineTo(4 * s, -10 * s);
    ctx.lineTo(4 * s, -2 * s);
    ctx.lineTo(-4 * s, -2 * s);
    ctx.lineTo(-4 * s, -10 * s);
    ctx.closePath();
    ctx.fill();

    // Cockpit highlight
    ctx.fillStyle = C.white;
    ctx.fillRect(-1 * s, -12 * s, 2 * s, 4 * s);

    // Side engine pods
    ctx.fillStyle = C.navy;
    ctx.fillRect(-20 * s, 6 * s, 6 * s, 10 * s);
    ctx.fillRect(14 * s, 6 * s, 6 * s, 10 * s);

    // Engine glow on pods
    ctx.fillStyle = C.orange;
    ctx.fillRect(-19 * s, 14 * s, 4 * s, 3 * s);
    ctx.fillRect(15 * s, 14 * s, 4 * s, 3 * s);

    // Shield effect
    if (player.shieldEnergy > 0) {
      const alpha = 0.3 + Math.sin(Date.now() / 150) * 0.15;
      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 2;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(0, 0, 32 * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Draw enemy ships
  // ---------------------------------------------------------------------------
  function drawEnemy(e) {
    const ex = e.x, ey = e.y;
    const flash = e.flashTimer > 0;

    ctx.save();
    ctx.translate(ex, ey);

    if (e.type === 'basic') {
      drawEnemyBasic(e, flash);
    } else if (e.type === 'fast') {
      drawEnemyFast(e, flash);
    } else if (e.type === 'tank') {
      drawEnemyTank(e, flash);
    } else if (e.type === 'shooter') {
      drawEnemyShooter(e, flash);
    } else if (e.type === 'zigzag') {
      drawEnemyZigzag(e, flash);
    } else if (e.type === 'boss') {
      drawBoss(e);
    }

    ctx.restore();
  }

  function drawEnemyBasic(e, flash) {
    const col = flash ? C.white : C.red;
    const col2 = flash ? C.yellow : C.navy;
    // Body
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(14, -8);
    ctx.lineTo(10, -16);
    ctx.lineTo(-10, -16);
    ctx.lineTo(-14, -8);
    ctx.closePath();
    ctx.fill();
    // Wings
    ctx.fillStyle = col2;
    ctx.fillRect(-18, -2, 8, 12);
    ctx.fillRect(10, -2, 8, 12);
    // Eye
    ctx.fillStyle = C.yellow;
    ctx.fillRect(-3, -6, 6, 4);
    // Engine
    ctx.fillStyle = C.orange;
    ctx.fillRect(-4, -18, 3, 4);
    ctx.fillRect(1, -18, 3, 4);
  }

  function drawEnemyFast(e, flash) {
    const col = flash ? C.white : C.orange;
    // Sleek body
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(12, 0);
    ctx.lineTo(8, -14);
    ctx.lineTo(-8, -14);
    ctx.lineTo(-12, 0);
    ctx.closePath();
    ctx.fill();
    // Accent
    ctx.fillStyle = C.yellow;
    ctx.fillRect(-2, -10, 4, 8);
    // Wing markers
    ctx.fillStyle = C.red;
    ctx.fillRect(-14, -4, 3, 6);
    ctx.fillRect(11, -4, 3, 6);
  }

  function drawEnemyTank(e, flash) {
    const col = flash ? C.white : C.brown;
    const col2 = flash ? C.yellow : C.teal;
    // Heavy body
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, 20);
    ctx.lineTo(22, 6);
    ctx.lineTo(18, -14);
    ctx.lineTo(6, -20);
    ctx.lineTo(-6, -20);
    ctx.lineTo(-18, -14);
    ctx.lineTo(-22, 6);
    ctx.closePath();
    ctx.fill();
    // Armor plates
    ctx.fillStyle = col2;
    ctx.fillRect(-16, -2, 12, 10);
    ctx.fillRect(4, -2, 12, 10);
    // Core
    ctx.fillStyle = C.red;
    ctx.fillRect(-4, -10, 8, 6);
    ctx.fillStyle = C.yellow;
    ctx.fillRect(-2, -8, 4, 2);
    // HP bar
    if (e.hp > 1) {
      const hpRatio = e.hp / (e.maxHp || e.hp);
      ctx.fillStyle = C.green;
      ctx.fillRect(-20, -24, 40 * hpRatio, 3);
    }
  }

  function drawEnemyShooter(e, flash) {
    const col = flash ? C.white : C.pink;
    // Body
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, 18);
    ctx.lineTo(16, 4);
    ctx.lineTo(14, -14);
    ctx.lineTo(-14, -14);
    ctx.lineTo(-16, 4);
    ctx.closePath();
    ctx.fill();
    // Cannons
    ctx.fillStyle = C.teal;
    ctx.fillRect(-22, 2, 6, 14);
    ctx.fillRect(16, 2, 6, 14);
    // Cannon tips
    ctx.fillStyle = C.red;
    ctx.fillRect(-23, 12, 4, 5);
    ctx.fillRect(19, 12, 4, 5);
    // Eye
    ctx.fillStyle = C.yellow;
    ctx.beginPath();
    ctx.arc(0, -4, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.black;
    ctx.beginPath();
    ctx.arc(0, -3, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEnemyZigzag(e, flash) {
    const col = flash ? C.white : C.ochre;
    // Diamond body
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(16, 0);
    ctx.lineTo(0, -16);
    ctx.lineTo(-16, 0);
    ctx.closePath();
    ctx.fill();
    // Inner
    ctx.fillStyle = C.yellow;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(8, 0);
    ctx.lineTo(0, -8);
    ctx.lineTo(-8, 0);
    ctx.closePath();
    ctx.fill();
    // Center dot
    ctx.fillStyle = C.red;
    ctx.fillRect(-2, -2, 4, 4);
  }

  function drawBoss(b) {
    const s = 1;
    const col = b.flashTimer > 0 ? C.white : C.red;
    const col2 = b.flashTimer > 0 ? C.yellow : C.navy;

    // Main hull
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, -b.h / 2);
    ctx.lineTo(b.w / 2, -b.h / 4);
    ctx.lineTo(b.w / 2, b.h / 4);
    ctx.lineTo(b.w / 3, b.h / 2);
    ctx.lineTo(-b.w / 3, b.h / 2);
    ctx.lineTo(-b.w / 2, b.h / 4);
    ctx.lineTo(-b.w / 2, -b.h / 4);
    ctx.closePath();
    ctx.fill();

    // Inner hull
    ctx.fillStyle = col2;
    ctx.beginPath();
    ctx.moveTo(0, -b.h / 3);
    ctx.lineTo(b.w / 3, 0);
    ctx.lineTo(b.w / 4, b.h / 3);
    ctx.lineTo(-b.w / 4, b.h / 3);
    ctx.lineTo(-b.w / 3, 0);
    ctx.closePath();
    ctx.fill();

    // Core
    ctx.fillStyle = C.yellow;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.white;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fill();

    // Wing guns
    ctx.fillStyle = C.teal;
    ctx.fillRect(-b.w / 2 - 8, -b.h / 4, 12, 10);
    ctx.fillRect(b.w / 2 - 4, -b.h / 4, 12, 10);
    ctx.fillRect(-b.w / 2 - 8, b.h / 4 - 2, 12, 10);
    ctx.fillRect(b.w / 2 - 4, b.h / 4 - 2, 12, 10);

    // HP bar
    const hpRatio = b.hp / b.maxHp;
    const barW = 100;
    ctx.fillStyle = C.black;
    ctx.fillRect(-barW / 2, -b.h / 2 - 16, barW, 6);
    ctx.fillStyle = hpRatio > 0.5 ? C.green : (hpRatio > 0.25 ? C.orange : C.red);
    ctx.fillRect(-barW / 2, -b.h / 2 - 16, barW * hpRatio, 6);
    ctx.strokeStyle = C.gray;
    ctx.lineWidth = 1;
    ctx.strokeRect(-barW / 2, -b.h / 2 - 16, barW, 6);
  }

  // ---------------------------------------------------------------------------
  // Draw bullets
  // ---------------------------------------------------------------------------
  function drawBullet(b) {
    ctx.save();
    ctx.fillStyle = b.color || C.cyan;
    ctx.shadowColor = b.color || C.cyan;
    ctx.shadowBlur = 8;

    // Elongated bullet with glow
    ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);

    // Bright core
    ctx.fillStyle = C.white;
    ctx.shadowBlur = 4;
    ctx.fillRect(b.x - b.w / 4, b.y - b.h / 3, b.w / 2, b.h * 0.66);

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawBossBullet(b) {
    ctx.save();
    const color = b.color || C.pink;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.arc(b.x, b.y, (b.w / 2), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = C.white;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(b.x, b.y, (b.w / 4), 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Draw powerup
  // ---------------------------------------------------------------------------
  function drawPowerup(p) {
    const pulse = 0.8 + Math.sin(p.pulseTimer) * 0.2;
    const size = 10 * pulse;

    ctx.save();
    ctx.translate(p.x, p.y);

    let color, label;
    if (p.type === 'power') { color = C.lime; label = 'P'; }
    else if (p.type === 'life') { color = C.yellow; label = '♥'; }
    else { color = C.cyan; label = 'S'; }

    // Outer glow
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();

    // Inner diamond
    ctx.shadowBlur = 0;
    ctx.fillStyle = C.white;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(6, 0);
    ctx.lineTo(0, 6);
    ctx.lineTo(-6, 0);
    ctx.closePath();
    ctx.fill();

    // Label
    ctx.fillStyle = C.black;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Draw semi-visible touch controls (left analog stick & right fire button)
  // ---------------------------------------------------------------------------
  function drawTouchControls() {
    if (leftTouch.alpha <= 0.01 && rightTouch.alpha <= 0.01) return;

    ctx.save();

    // Subtle split-screen zone divider
    ctx.strokeStyle = C.sky;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.08 * Math.max(leftTouch.alpha, rightTouch.alpha);
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(CW / 2, 16);
    ctx.lineTo(CW / 2, CH - 16);
    ctx.stroke();
    ctx.setLineDash([]);

    // Left virtual analog stick
    if (leftTouch.alpha > 0.01) {
      const ox = leftTouch.originX;
      const oy = leftTouch.originY;
      const kx = leftTouch.knobX;
      const ky = leftTouch.knobY;
      const a = leftTouch.alpha;

      // Outer base ring
      ctx.fillStyle = C.navy;
      ctx.globalAlpha = 0.22 * a;
      ctx.beginPath();
      ctx.arc(ox, oy, STICK_MAX_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = C.sky;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.38 * a;
      ctx.beginPath();
      ctx.arc(ox, oy, STICK_MAX_RADIUS, 0, Math.PI * 2);
      ctx.stroke();

      // Inner guide ring
      ctx.strokeStyle = C.blue;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.22 * a;
      ctx.beginPath();
      ctx.arc(ox, oy, STICK_MAX_RADIUS * 0.55, 0, Math.PI * 2);
      ctx.stroke();

      // Cardinal direction ticks
      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.3 * a;
      const tickIn = STICK_MAX_RADIUS * 0.78;
      const tickOut = STICK_MAX_RADIUS * 0.96;
      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(ox + Math.cos(ang) * tickIn, oy + Math.sin(ang) * tickIn);
        ctx.lineTo(ox + Math.cos(ang) * tickOut, oy + Math.sin(ang) * tickOut);
        ctx.stroke();
      }

      // Center anchor dot
      ctx.fillStyle = C.sky;
      ctx.globalAlpha = 0.35 * a;
      ctx.beginPath();
      ctx.arc(ox, oy, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Vector shaft from origin to thumb knob
      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.35 * a;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(kx, ky);
      ctx.stroke();

      // Draggable thumb knob
      ctx.fillStyle = C.sky;
      ctx.globalAlpha = 0.32 * a;
      ctx.beginPath();
      ctx.arc(kx, ky, STICK_KNOB_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = C.cyan;
      ctx.globalAlpha = 0.45 * a;
      ctx.beginPath();
      ctx.arc(kx, ky, STICK_KNOB_RADIUS * 0.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.58 * a;
      ctx.beginPath();
      ctx.arc(kx, ky, STICK_KNOB_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Right fire button indicator
    if (rightTouch.alpha > 0.01) {
      const fx = rightTouch.x;
      const fy = rightTouch.y;
      const a = rightTouch.alpha;

      // Expanding ripple pulse ring
      const pulseRadius = FIRE_BTN_RADIUS * (0.85 + rightTouch.pulse * 0.55);
      ctx.strokeStyle = C.orange;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.35 * (1 - rightTouch.pulse) * a;
      ctx.beginPath();
      ctx.arc(fx, fy, pulseRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Outer button housing ring
      ctx.fillStyle = C.navy;
      ctx.globalAlpha = 0.24 * a;
      ctx.beginPath();
      ctx.arc(fx, fy, FIRE_BTN_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = C.pink;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.45 * a;
      ctx.beginPath();
      ctx.arc(fx, fy, FIRE_BTN_RADIUS, 0, Math.PI * 2);
      ctx.stroke();

      // Inner tactile pad
      const padRadius = rightTouch.active ? 22 : 24;
      ctx.fillStyle = C.red;
      ctx.globalAlpha = 0.32 * a;
      ctx.beginPath();
      ctx.arc(fx, fy, padRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = C.yellow;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5 * a;
      ctx.beginPath();
      ctx.arc(fx, fy, padRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Inner core
      ctx.fillStyle = C.orange;
      ctx.globalAlpha = 0.4 * a;
      ctx.beginPath();
      ctx.arc(fx, fy, 11, 0, Math.PI * 2);
      ctx.fill();

      // 4 targeting crosshair ticks around inner core
      ctx.strokeStyle = C.yellow;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.55 * a;
      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI) / 2;
        ctx.beginPath();
        ctx.moveTo(fx + Math.cos(ang) * 14, fy + Math.sin(ang) * 14);
        ctx.lineTo(fx + Math.cos(ang) * 20, fy + Math.sin(ang) * 20);
        ctx.stroke();
      }

      // Subtle center reticle dot
      ctx.fillStyle = C.white;
      ctx.globalAlpha = 0.55 * a;
      ctx.beginPath();
      ctx.arc(fx, fy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Main draw
  // ---------------------------------------------------------------------------
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();

    // Screen shake
    if (screenShake > 0) {
      ctx.translate(
        (Math.random() - 0.5) * screenShake * 2,
        (Math.random() - 0.5) * screenShake * 2
      );
    }

    // Background
    ctx.fillStyle = C.black;
    ctx.fillRect(0, 0, CW, CH);

    // Cyberpunk grid
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = C.blue;
    ctx.lineWidth = 1;
    gridLines.forEach(g => {
      ctx.beginPath();
      ctx.moveTo(0, g.y);
      ctx.lineTo(CW, g.y);
      ctx.stroke();
    });
    for (let x = 0; x < CW; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CH);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Starfield
    stars.forEach(s => {
      const alpha = 0.3 + s.brightness * 0.7;
      ctx.globalAlpha = alpha;
      if (s.speed > 1.8) {
        ctx.fillStyle = C.white;
      } else if (s.speed > 1.0) {
        ctx.fillStyle = C.cyan;
      } else {
        ctx.fillStyle = C.gray;
      }
      ctx.fillRect(s.x, s.y, s.size, s.size);
    });
    ctx.globalAlpha = 1;

    // Side borders (cyberpunk accent lines)
    ctx.strokeStyle = C.sky;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.4;
    ctx.strokeRect(8, 8, CW - 16, CH - 16);
    ctx.globalAlpha = 1;

    if (state === 'playing' || state === 'gameover') {
      // Powerups
      powerups.forEach(p => drawPowerup(p));

      // Player bullets
      bullets.forEach(b => drawBullet(b));

      // Enemy bullets
      enemyBullets.forEach(b => drawBullet({ ...b, color: C.red }));

      // Boss bullets
      bossBullets.forEach(b => drawBossBullet(b));

      // Enemies
      enemies.forEach(e => drawEnemy(e));

      // Player
      if (state === 'playing') drawPlayer();

      // Explosions
      explosions.forEach(e => {
        const progress = e.progress;
        const radius = e.maxRadius * progress;
        const alpha = 1 - progress;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = e.color;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(e.x, e.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      });

      // Particles
      particles.forEach(p => {
        const alpha = p.life / p.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        const s = p.size * alpha;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      });
      ctx.globalAlpha = 1;

      // Wave transition text
      if (waveDelay > 0 && waveDelay < 70) {
        ctx.globalAlpha = Math.min(1, waveDelay / 15, (70 - waveDelay) / 15);
        ctx.fillStyle = C.yellow;
        ctx.shadowColor = C.yellow;
        ctx.shadowBlur = 10;
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('WAVE ' + wave + ' CLEAR', CW / 2, CH / 2 - 25);

        if (!bossActive) {
          ctx.fillStyle = C.cyan;
          ctx.shadowColor = C.cyan;
          ctx.font = '20px monospace';
          ctx.fillText('WAVE ' + (wave + 1) + ' INCOMING', CW / 2, CH / 2 + 10);
        }
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      // Combo display
      if (comboCount > 1) {
        let comboY = 55;
        if (hudInnerEl && canvas) {
          const hudRect = hudInnerEl.getBoundingClientRect();
          const canvasRect = canvas.getBoundingClientRect();
          if (canvasRect.height > 0) {
            const hudBottomLogical = ((hudRect.bottom - canvasRect.top) / canvasRect.height) * CH;
            comboY = Math.max(55, Math.round(hudBottomLogical + 24));
          }
        }
        ctx.fillStyle = C.yellow;
        ctx.shadowColor = C.yellow;
        ctx.shadowBlur = 8;
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('COMBO x' + Math.min(comboCount, 10), CW - 30, comboY);
        ctx.shadowBlur = 0;
      }

      // Mobile touch controls overlay
      if (state === 'playing') drawTouchControls();
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Game loop
  // ---------------------------------------------------------------------------
  function gameLoop() {
    update();
    draw();

    // Save high score
    if (state === 'gameover') {
      const currentHS = parseInt(localStorage.getItem('ss3884_hs') || '0');
      if (score > currentHS) {
        localStorage.setItem('ss3884_hs', score.toString());
      }
    }

    requestAnimationFrame(gameLoop);
  }

  // ---------------------------------------------------------------------------
  // Start on DOM ready
  // ---------------------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
