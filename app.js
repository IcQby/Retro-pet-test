// ===============================
// Retro Pet test - Modular Layout
// ===============================

// --- Version Info ---
const versionid = "v6";

// ===============================
// SECTION 1: ASSET MANAGEMENT
// ===============================

// --- Pet Images ---
const petImgLeft = new Image();
const petImgRight = new Image();
const petImgSleep = new Image();
const petImgSleepR = new Image();
petImgLeft.src = 'icon/pig-left.png';
petImgRight.src = 'icon/pig-right.png';
petImgSleep.src = 'icon/pig-sleep.png';
petImgSleepR.src = 'icon/pig-sleepR.png';

const pigLeftEatImg = new Image();
const pigRightEatImg = new Image();
pigLeftEatImg.src = 'icon/pig-left-eat.png';
pigRightEatImg.src = 'icon/pig-right-eat.png';

// --- Cake Images ---
const cakeImgs = [
  new Image(), // cake1
  new Image(), // cake2
  new Image(), // cake3
  new Image(), // cake4
];
cakeImgs[0].src = 'icon/cake1.png';
cakeImgs[1].src = 'icon/cake2.png';
cakeImgs[2].src = 'icon/cake3.png';
cakeImgs[3].src = 'icon/cake4.png';

// --- Ball Images ---
const ballImages = [
  'icon/ball1.png',
  'icon/ball2.png',
  'icon/ball3.png'
];
const BALL_DISPLAY_SIZE = 50;
const BALL_RADIUS = BALL_DISPLAY_SIZE / 2;
let ballImgObjects = []; // Preloaded Image objects

function loadImages(images) {
  return Promise.all(
    images.map(
      img =>
        new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        })
    )
  );
}

function loadBallImages() {
  return Promise.all(
    ballImages.map(
      (src, i) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.src = src;
          img.onload = () => {
            ballImgObjects[i] = img;
            resolve();
          };
          img.onerror = reject;
        })
    )
  );
}

// ===============================
// SECTION 2: GLOBAL CONSTANTS & CANVAS
// ===============================
const canvas = document.getElementById('pet-canvas');
const ctx = canvas.getContext('2d');
const PET_WIDTH = 102, PET_HEIGHT = 102;

// ===============================
// SECTION 3: STATE OBJECTS
// ===============================

const pet = {
  happiness: 50,
  hunger: 50,
  cleanliness: 50,
  health: 50,
};

let petX, petY;
let vx = 0, vy = 0, gravity = 0.4;
let direction = -1;
let isSleeping = false;
let sleepSequenceActive = false;
let sleepRequested = false;
let sleepSequenceStep = 0;
let currentImg;
let resumeDirection;
let resumeImg;
let pendingSleep = false;
let pendingWake = false;
let wakeTimeoutId = null;

let actionInProgress = false;
let currentAction = null; // "play", "sleep", "feed", "clean", "heal", or null

let wasInOverlap = false;
let inOverlap = false;
let overlapPauseActive = false;
let overlapLastEndDistance = Infinity;

// --- Cake Feed Sequence State ---
let cakeFeedActive = false;
let cakeFeedState = null;

// ===============================
// SECTION 4: MASTER UPDATE/DRAW ROUTINE
// ===============================

function masterUpdateDrawRoutine() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();

  // Play Sequence: Ball Animation & Logic (Section 6)
  updateBall();
  drawBall();
  updateBallOverlapPause();

  // Cake Feed Animation overrides normal idle/actions if active
  if (cakeFeedActive) {
    updateCakeFeed();
    drawCakeFeed();
  } else {
    // Always run idle jumping & movement first
    idleJumping();

    // If an action is active, run its movement logic
    if (actionInProgress && currentAction) {
      actionMovement();
    }

    ctx.drawImage(currentImg, petX, petY, PET_WIDTH, PET_HEIGHT);
  }

  requestAnimationFrame(masterUpdateDrawRoutine);
}

// ===============================
// SECTION 5: IDLE JUMPING (includes idle movement)
// ===============================

function idleJumping() {
  // Only idle movement: walking, edge bounce, jumping
  // No ball chase or kick logic

  // Gravity and movement
  if (!isSleeping && !sleepSequenceActive && !pendingWake) {
    vy += gravity;
    petX += vx;
    petY += vy;
  }

  // Boundaries
  if (!isSleeping && !sleepSequenceActive && !pendingWake) {
    if (petX <= 0) {
      petX = 0;
      direction = 1;
      vx = Math.abs(vx);
      currentImg = petImgRight;
    } else if (petX + PET_WIDTH >= canvas.width) {
      petX = canvas.width - PET_WIDTH;
      direction = -1;
      vx = -Math.abs(vx);
      currentImg = petImgLeft;
    }
  }

  // Ground landing and jump logic
  let groundY = getGroundY();
  if (petY >= groundY) {
    petY = groundY;

    if (pendingSleep) {
      vx = 0;
      vy = 0;
      pendingSleep = false;
      startSleepSequence();
    } else if (!isSleeping && !sleepSequenceActive && !sleepRequested && !pendingWake && !actionInProgress) {
      startIdleJump();
    }
  }
}

// For "play" and ball, override idle movement with chase logic
function startIdleJump() {
  const speed = 6, angle = Math.PI * 65 / 180;
  vx = direction * speed * Math.cos(angle);
  vy = -speed * Math.sin(angle);
}

function getGroundY() {
  return canvas.height - PET_HEIGHT;
}

// ===============================
// SECTION 6: PLAY SEQUENCE
// ===============================

// -- All ball logic, chase, pig/ball interaction, etc --
let ball = null; // {x, y, vx, vy, radius, img, angle}
const ballGravity = 0.5;
const ballAirFriction = 0.99;
const ballBounce = 0.7;
let showBall = false;
let ballAlpha = 1;
let showBallTimeout = null;
let fadeBallTimeout = null;

function showBallForDuration() {
  clearTimeout(showBallTimeout);
  clearTimeout(fadeBallTimeout);
  showBall = true;
  ballAlpha = 1;

  const imgIndex = Math.floor(Math.random() * ballImgObjects.length);
  const img = ballImgObjects[imgIndex];

  const margin = BALL_RADIUS + 5;
  const minX = margin;
  const maxX = canvas.width - margin;
  const minY = margin;
  const maxY = Math.floor(canvas.height / 2) - margin;
  const randX = minX + Math.random() * (maxX - minX);
  const randY = minY + Math.random() * (maxY - minY);
  const randVx = (Math.random() - 0.5) * 5;
  const randVy = (Math.random() - 0.2) * 3;

  ball = {
    x: randX,
    y: randY,
    vx: randVx,
    vy: randVy,
    radius: BALL_RADIUS,
    img: img,
    angle: 0
  };

  // Fade after 10s over 5s
  showBallTimeout = setTimeout(() => {
    let fadeStart = Date.now();
    function fadeStep() {
      let elapsed = Date.now() - fadeStart;
      ballAlpha = Math.max(0, 1 - (elapsed / 5000));
      if (ballAlpha > 0) {
        fadeBallTimeout = setTimeout(fadeStep, 16);
      } else {
        showBall = false;
        ballAlpha = 1;
      }
    }
    fadeStep();
  }, 10000);
}

function updateBall() {
  if (!showBall || !ball) return;
  ball.vy += ballGravity;
  ball.vx *= ballAirFriction;
  ball.vy *= ballAirFriction;
  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.angle += ball.vx / BALL_RADIUS;

  const pigGroundY = getGroundY();
  const ballRestY = pigGroundY + PET_HEIGHT - BALL_RADIUS;
  if (ball.y + BALL_RADIUS > ballRestY) {
    ball.y = ballRestY - BALL_RADIUS;
    ball.vy *= -ballBounce;
    if (Math.abs(ball.vy) < 1) ball.vy = 0;
  }
  if (ball.x - BALL_RADIUS < 0) {
    ball.x = BALL_RADIUS;
    ball.vx *= -ballBounce;
  }
  if (ball.x + BALL_RADIUS > canvas.width) {
    ball.x = canvas.width - BALL_RADIUS;
    ball.vx *= -ballBounce;
  }
}

function drawBall() {
  if (!showBall || !ball) return;
  ctx.save();
  ctx.globalAlpha = ballAlpha;
  if (ball.img) {
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.rotate(ball.angle || 0);
    ctx.drawImage(
      ball.img,
      -BALL_RADIUS,
      -BALL_RADIUS,
      BALL_DISPLAY_SIZE,
      BALL_DISPLAY_SIZE
    );
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function checkPigBallOverlap() {
  if (!showBall || !ball) return false;
  const pigLeft = petX, pigRight = petX + PET_WIDTH;
  const pigTop = petY, pigBottom = petY + PET_HEIGHT;
  const bx = ball.x, by = ball.y, r = ball.radius;
  const closestX = Math.max(pigLeft, Math.min(bx, pigRight));
  const closestY = Math.max(pigTop, Math.min(by, pigBottom));
  const dx = bx - closestX, dy = by - closestY;
  const distSq = dx * dx + dy * dy;
  return distSq < r * r;
}

function pigHitsBallFront(ball) {
  const pigLeft = petX, pigRight = petX + PET_WIDTH;
  const bx = ball.x, r = ball.radius;
  const closestX = Math.max(pigLeft, Math.min(bx, pigRight));
  const dx = bx - closestX;
  if (dx * dx < r * r) {
    if (direction === 1) {
      return bx > pigRight - r * 0.5 && bx < pigRight + r;
    } else {
      return bx < pigLeft + r * 0.5 && bx > pigLeft - r;
    }
  }
  return false;
}

function kickBallFromPig(ball) {
  const baseSpeed = Math.max(Math.abs(vx), 2);
  const speed = (3 + Math.random() * 1.5) * baseSpeed;
  const dir = direction;
  if (Math.random() < 2 / 3) {
    const angle = (Math.PI / 4) + Math.random() * (Math.PI / 12);
    ball.vx = dir * speed * Math.cos(angle);
    ball.vy = -speed * Math.sin(angle);
  } else {
    const angle = Math.random() * (Math.PI / 4);
    ball.vx = dir * speed * Math.cos(angle);
    ball.vy = -speed * Math.sin(angle);
  }
}

function updateBallOverlapPause() {
  inOverlap = checkPigBallOverlap();
  let pigCenterX = petX + PET_WIDTH / 2;
  let ballCenterX = ball ? ball.x : null;

  if (showBall && ball) {
    if (inOverlap && !wasInOverlap) {
      overlapPauseActive = true;
      overlapLastEndDistance = Infinity;
    }
    if (inOverlap) {
      overlapLastEndDistance = Infinity;
    }
    if (!inOverlap && wasInOverlap) {
      if (ball) overlapLastEndDistance = Math.abs(pigCenterX - ballCenterX);
    }
    if (overlapPauseActive && !inOverlap && ball) {
      overlapLastEndDistance = Math.abs(pigCenterX - ballCenterX);
      if (overlapLastEndDistance >= PET_WIDTH * 0.5) {
        overlapPauseActive = false;
      }
    }
    if (!showBall) {
      overlapPauseActive = false;
      overlapLastEndDistance = Infinity;
    }
  } else {
    overlapPauseActive = false;
    overlapLastEndDistance = Infinity;
  }
  wasInOverlap = inOverlap;
}

// ===============================
// SECTION 7: ACTION MOVEMENT HANDLER
// ===============================

function actionMovement() {
  switch (currentAction) {
    case "play":
      // ... (unchanged, see previous code)
      // Ball chase and kick logic
      break;
    case "feed":
      // Logic is handled in cakeFeedActive branch
      break;
    default:
      // Default: do nothing extra, idleJumping already runs
      break;
  }
}

// ===============================
// SECTION 8: SLEEP SEQUENCE
// ===============================
// (unchanged, see previous code)
function startSleepSequence() {
  sleepSequenceStep = 1;
  sleepSequenceActive = true;
  sleepRequested = false;

  let imgA = resumeImg;
  let imgB = (resumeImg === petImgRight) ? petImgLeft : petImgRight;
  let sleepImg = (resumeImg === petImgRight) ? petImgSleepR : petImgSleep;

  currentImg = imgA;

  setTimeout(() => {
    currentImg = imgB;
    setTimeout(() => {
      currentImg = imgA;
      setTimeout(() => {
        currentImg = imgB;
        setTimeout(() => {
          currentImg = sleepImg;
          isSleeping = true;
          sleepSequenceActive = false;
          setTimeout(() => {
            currentImg = imgA;
            isSleeping = false;
            pendingWake = true;
            vx = 0; vy = 0;
            wakeTimeoutId = setTimeout(() => {
              pendingWake = false;
              sleepSequenceStep = 0;
              sleepSequenceActive = false;
              direction = resumeDirection;
              currentImg = (direction === 1) ? petImgRight : petImgLeft;
              startIdleJump();
            }, 2000);
          }, 5000);
        }, 500);
      }, 500);
    }, 500);
  }, 1000);
}

// ===============================
// SECTION 9: DISABLE BUTTONS DURING ACTIONS
// ===============================

function setButtonsDisabled(disabled) {
  document.querySelectorAll('button').forEach(btn => {
    btn.disabled = disabled;
  });
}

function effectGuard(fn, actionName) {
  // Only one action at a time
  return function (...args) {
    if (actionInProgress) return;
    actionInProgress = true;
    currentAction = actionName;
    setButtonsDisabled(true);
    fn.apply(this, args);
  };
}

function finishAction() {
  actionInProgress = false;
  currentAction = null;
  setButtonsDisabled(false);
}

// ===============================
// SECTION 10: PET ACTIONS (Button triggers)
// ===============================

function updateStats() {
  document.getElementById('happiness').textContent = pet.happiness;
  document.getElementById('hunger').textContent = pet.hunger;
  document.getElementById('cleanliness').textContent = pet.cleanliness;
  document.getElementById('health').textContent = pet.health;
}

// --- CAKE FEED SEQUENCE ---
function startCakeFeedSequence() {
  // State variables for feed animation
  cakeFeedActive = true;
  let pigWasFacing = direction;
  let pigIdleImg = pigWasFacing === 1 ? petImgRight : petImgLeft;
  let pigEatImg = pigWasFacing === 1 ? pigRightEatImg : pigLeftEatImg;
  let cakeX = (canvas.width - 80) / 2;
  let cakeY = 0;
  let cakeW = 80, cakeH = 80;
  let cakeImgIdx = 0;
  let cakeFalling = true;
  let cakeFadeAlpha = 1;
  let cakeGroundY = getGroundY();
  let pigStoppedByCake = false;
  let sequenceStep = 0;
  let lastTimestamp = null;
  let timers = [];

  // Save pig's jump state
  let pigJumping = false;
  let pigVX = vx, pigVY = vy;

  // Temporarily override draw and update
  cakeFeedState = {
    pigWasFacing, pigIdleImg, pigEatImg, cakeX, cakeY, cakeW, cakeH, cakeImgIdx, cakeFalling, cakeFadeAlpha, sequenceStep, pigStoppedByCake, pigJumping, pigVX, pigVY, timers, cakeGroundY
  };

  // Pig keeps jumping until bumping into cake
  vx = direction * 6 * Math.cos(Math.PI * 65 / 180);
  vy = -6 * Math.sin(Math.PI * 65 / 180);

  // Start the cake falling and step logic
  // All timing and state handled in updateCakeFeed/drawCakeFeed
}

// Called in main loop
function updateCakeFeed() {
  if (!cakeFeedActive) return;
  let st = cakeFeedState;
  // Cake falls
  if (st.cakeFalling) {
    st.cakeY += 7;
    // Pig moves towards cake unless at cake
    if (!st.pigStoppedByCake) {
      // Pig jump physics
      vy += gravity;
      petX += vx;
      petY += vy;

      // Pig bounds
      if (petX < 0) { petX = 0; vx = Math.abs(vx); direction = 1; }
      if (petX + PET_WIDTH > canvas.width) { petX = canvas.width - PET_WIDTH; vx = -Math.abs(vx); direction = -1; }

      // Pig ground
      if (petY >= getGroundY()) {
        petY = getGroundY();
        vy = -6 * Math.sin(Math.PI * 65 / 180);
        vx = direction * 6 * Math.cos(Math.PI * 65 / 180);
      }

      // Check for pig bump into cake
      let pigFront = direction === 1 ? petX + PET_WIDTH : petX;
      let cakeLeft = st.cakeX;
      let cakeRight = st.cakeX + st.cakeW;
      if (direction === 1 && pigFront >= cakeLeft && pigFront <= cakeRight) {
        petX = cakeLeft - PET_WIDTH;
        vx = 0;
        st.pigStoppedByCake = true;
      }
      if (direction === -1 && pigFront <= cakeRight && pigFront >= cakeLeft) {
        petX = cakeRight;
        vx = 0;
        st.pigStoppedByCake = true;
      }
    } else {
      // If pig is stopped by cake, but in air: continue y only
      if (petY < getGroundY()) {
        vy += gravity;
        petY += vy;
        if (petY >= getGroundY()) {
          petY = getGroundY();
          vy = 0;
        }
      }
    }
    // Cake hits ground
    if (st.cakeY >= st.cakeGroundY) {
      st.cakeY = st.cakeGroundY;
      st.cakeFalling = false;
      st.sequenceStep = 1;
      st.timers.push(setTimeout(() => {
        st.sequenceStep = 2;
        st.timers.push(setTimeout(() => {
          st.sequenceStep = 3;
          st.timers.push(setTimeout(() => {
            st.sequenceStep = 4;
            st.timers.push(setTimeout(() => {
              st.sequenceStep = 5;
              st.fadeStart = Date.now();
            }, 1000));
          }, 1500));
        }, 1500));
      }, 500));
    }
  } else {
    // Sequence: 1-eat/cake2, 2-eat/cake3, 3-eat/cake4, 4-fade, 5-done
    if (st.sequenceStep === 5) {
      // Fade out
      let elapsed = Date.now() - st.fadeStart;
      st.cakeFadeAlpha = Math.max(0, 1 - elapsed / 2000);
      if (elapsed >= 2000) {
        // Sequence done: clear, unlock, resume pig
        cakeFeedActive = false;
        finishAction();
        direction = st.pigWasFacing;
        currentImg = direction === 1 ? petImgRight : petImgLeft;
        startIdleJump();
        // Cleanup timers
        st.timers.forEach(t => clearTimeout(t));
        cakeFeedState = null;
      }
    }
  }
}

function drawCakeFeed() {
  if (!cakeFeedActive) return;
  let st = cakeFeedState;
  // Draw cake
  ctx.save();
  ctx.globalAlpha = st.cakeFadeAlpha;
  let imgIdx = 0;
  if (st.sequenceStep === 0 || st.sequenceStep === 1) imgIdx = 0;
  if (st.sequenceStep === 2) imgIdx = 1;
  if (st.sequenceStep === 3) imgIdx = 2;
  if (st.sequenceStep === 4 || st.sequenceStep === 5) imgIdx = 3;
  ctx.drawImage(cakeImgs[imgIdx], st.cakeX, st.cakeY, st.cakeW, st.cakeH);
  ctx.globalAlpha = 1;
  // Draw pig
  let pigImg = st.pigIdleImg;
  if ((st.sequenceStep === 1 && st.cakeFalling === false) ||
      (st.sequenceStep === 2 && Date.now() % 1500 < 500) ||
      (st.sequenceStep === 3 && Date.now() % 1500 < 500)) {
    pigImg = st.pigEatImg;
  }
  ctx.drawImage(pigImg, petX, petY, PET_WIDTH, PET_HEIGHT);
  ctx.restore();
}

// ========== ORIGINAL FEED BUTTON =============
// window.feedPet = effectGuard(function () {
//   pet.hunger = Math.max(0, pet.hunger - 15);
//   pet.happiness = Math.min(100, pet.happiness + 5);
//   updateStats();
//   registerBackgroundSync('sync-feed-pet');
//   setTimeout(() => {
//     finishAction();
//   }, 1000);
// }, "feed");

// ========== REPLACED WITH CAKE FEED BUTTON ============
window.feedPet = effectGuard(function () {
  pet.hunger = Math.max(0, pet.hunger - 15);
  pet.happiness = Math.min(100, pet.happiness + 5);
  updateStats();
  registerBackgroundSync('sync-feed-pet');
  startCakeFeedSequence();
}, "feed");

// ===============================
// SECTION 11: UI & RESPONSIVE HELPERS
// ===============================

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = 300;
  if (typeof petX !== 'undefined' && typeof petY !== 'undefined') {
    petX = Math.min(Math.max(petX, 0), canvas.width - PET_WIDTH - 10);
    petY = canvas.height - PET_HEIGHT;
  }
}
window.addEventListener('resize', resizeCanvas);

// ===============================
// SECTION 12: RENDERING
// ===============================

function drawBackground() {
  ctx.fillStyle = '#90EE90';
  ctx.fillRect(0, getGroundY(), canvas.width, canvas.height - getGroundY());
  ctx.fillStyle = '#ADD8E6';
  ctx.fillRect(0, 0, canvas.width, getGroundY());
}

// ===============================
// SECTION 13: SERVICE WORKER & BACKGROUND SYNC
// ===============================

function registerBackgroundSync(tag) {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then(registration => {
      registration.sync.register(tag).catch(() => {});
    });
  }
}

// Service Worker hot update logic
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').then(registration => {
    if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            if (navigator.serviceWorker.controller && !window.__reloading__) {
              window.__reloading__ = true;
              window.location.reload();
            }
          }
        });
      }
    });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!window.__reloading__) {
      window.__reloading__ = true;
      window.location.reload();
    }
  });
}

// ===============================
// SECTION 14: STARTUP
// ===============================

window.addEventListener('DOMContentLoaded', () => {
  if (window.__pet_loaded__) return;
  window.__pet_loaded__ = true;
  const versionSpan = document.getElementById('versionid');
  if (versionSpan) versionSpan.textContent = versionid;
  resizeCanvas();
  updateStats();
  Promise.all([
    loadImages([petImgLeft, petImgRight, petImgSleep, petImgSleepR, pigLeftEatImg, pigRightEatImg, ...cakeImgs]),
    loadBallImages()
  ])
    .then(() => {
      petX = canvas.width - PET_WIDTH - 10;
      petY = canvas.height - PET_HEIGHT;
      currentImg = petImgLeft;
      resumeDirection = direction;
      resumeImg = currentImg;
      masterUpdateDrawRoutine();
    })
    .catch((err) => {
      console.error("One or more images failed to load.", err);
    });
});
