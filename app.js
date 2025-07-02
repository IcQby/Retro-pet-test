// ===============================
// Retro Pet test - Modular Layout
// ===============================

// --- Version Info ---
const versionid = "v5.1";

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

  // Always run idle jumping & movement first
  idleJumping();

  // If an action is active, run its movement logic
  if (actionInProgress && currentAction) {
    actionMovement();
  }

  ctx.drawImage(currentImg, petX, petY, PET_WIDTH, PET_HEIGHT);

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
  const baseSpeed = Math.max(Math.abs(vx), 4);
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
      // Ball chase logic (pig chases ball if present and no overlap pause)
      if (!isSleeping && !sleepSequenceActive && !pendingWake && showBall && ball && !overlapPauseActive) {
        const pigCenterX = petX + PET_WIDTH / 2;
        const ballX = ball.x;
        const chaseSpeed = 3;
        const deadzone = BALL_RADIUS + 10;
        if (Math.abs(ballX - pigCenterX) > deadzone) {
          if (ballX > pigCenterX) {
            direction = 1;
            vx = chaseSpeed;
            currentImg = petImgRight;
          } else {
            direction = -1;
            vx = -chaseSpeed;
            currentImg = petImgLeft;
          }
        } else {
          vx = 0;
          currentImg = direction === 1 ? petImgRight : petImgLeft;
        }
      }
      // Ball kick logic
      if (!isSleeping && !sleepSequenceActive && !pendingWake && showBall && ball) {
        if (pigHitsBallFront(ball)) {
          kickBallFromPig(ball);
        }
      }
      // Ground landing and ball chase jump logic
      let groundY = getGroundY();
      if (petY >= groundY) {
        petY = groundY;
        if (!isSleeping && !sleepSequenceActive && !sleepRequested && !pendingWake) {
          if (showBall && ball) {
            if (!overlapPauseActive && shouldReverseToChaseBall()) {
              direction = -direction;
              vx = direction * 3;
              currentImg = (direction === 1) ? petImgRight : petImgLeft;
            }
            startIdleJump();
          }
        }
      }
      break;
    case "sleep":
      // Sleep sequence handled separately via pendingSleep/startSleepSequence
      break;
    case "feed":
      // (Extend for feed animation logic if needed)
      break;
    case "clean":
      // (Extend for clean animation logic if needed)
      break;
    case "heal":
      // (Extend for heal animation logic if needed)
      break;
    default:
      // Default: do nothing extra, idleJumping already runs
      break;
  }
}

function shouldReverseToChaseBall() {
  if (!showBall || !ball) return false;
  const pigCenterX = petX + PET_WIDTH / 2;
  if ((direction === 1 && pigCenterX > ball.x) ||
    (direction === -1 && pigCenterX < ball.x)) {
    return true;
  }
  return false;
}

// ===============================
// SECTION 8: SLEEP SEQUENCE
// ===============================

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

window.feedPet = effectGuard(function () {
  pet.hunger = Math.max(0, pet.hunger - 15);
  pet.happiness = Math.min(100, pet.happiness + 5);
  updateStats();
  registerBackgroundSync('sync-feed-pet');
  setTimeout(() => {
    finishAction();
  }, 1000);
}, "feed");

window.playWithPet = effectGuard(function () {
  pet.happiness = Math.min(100, pet.happiness + 10);
  pet.hunger = Math.min(100, pet.hunger + 5);
  updateStats();
  showBallForDuration();
  setTimeout(() => {
    finishAction();
  }, 15000);
}, "play");

window.cleanPet = effectGuard(function () {
  pet.cleanliness = 100;
  pet.happiness = Math.min(100, pet.happiness + 5);
  updateStats();
  setTimeout(() => {
    finishAction();
  }, 2000);
}, "clean");

window.sleepPet = effectGuard(function () {
  pet.health = Math.min(100, pet.health + 10);
  pet.hunger = Math.min(100, pet.hunger + 10);
  updateStats();
  if (!isSleeping && !sleepSequenceActive && !sleepRequested) {
    sleepRequested = true;
    resumeDirection = direction;
    resumeImg = (direction === 1) ? petImgRight : petImgLeft;
    pendingSleep = true;
  }
  setTimeout(() => {
    finishAction();
  }, 9000);
}, "sleep");

window.healPet = effectGuard(function () {
  pet.health = 100;
  pet.happiness = Math.min(100, pet.happiness + 5);
  updateStats();
  setTimeout(() => {
    finishAction();
  }, 1000);
}, "heal");

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
    loadImages([petImgLeft, petImgRight, petImgSleep, petImgSleepR]),
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
