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

// --- Cake Image ---
const cakeImg = new Image();
cakeImg.src = 'icon/cake1.png';

// --- Canvas and Rendering ---
const canvas = document.getElementById('pet-canvas');
const ctx = canvas.getContext('2d');
const PET_WIDTH = 102, PET_HEIGHT = 102;

// --- Pet Animation State ---
let petX, petY;
let vx = 0, vy = 0, gravity = 0.4;
let direction = -1; // -1=left, 1=right
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

// --- Stats Logic ---
let pet = {
  happiness: 50,
  hunger: 50,
  cleanliness: 50,
  health: 50,
};

// --- Ball State (only one at a time) ---
let ball = null; // will be {x, y, vx, vy, radius, img, angle}
let ballImgObjects = []; // preloaded images

const ballGravity = 0.5;
const ballAirFriction = 0.99;
const ballBounce = 0.7;

// --- Ball Visibility Logic ---
let showBall = false;
let ballAlpha = 1;
let showBallTimeout = null;
let fadeBallTimeout = null;

// --- Action Lock ---
let actionInProgress = false; // Used to lock/unlock buttons during effect

// --- Overlap Pause v8 State ---
let wasInOverlap = false;
let inOverlap = false;
let overlapPauseActive = false;
let overlapLastEndDistance = Infinity;

// --- Shared Ground Logic ---
function getGroundY() {
  return canvas.height - PET_HEIGHT;
}

// --- Cake Sequence State ---
let cake = null; // {x, y, vy, onGround, visible}
let cakeSequenceActive = false;
let cakeTimer = null;
let postCakePauseTimer = null;
let ellipseAlpha = 1;

// --- Cake helpers ---
function getCakeStartX() {
  return (canvas.width - 50) / 2;
}
function getCakeStartY() {
  return 0;
}
function getCakeGroundY() {
  return getGroundY() + PET_HEIGHT - 50; // cake sits on grass, same as ball
}

// --- Draw black ellipse under cake ---
function drawCakeEllipse(x, y, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(x + 25, y + 50, 30, 10, 0, 0, 2 * Math.PI); // 60x20 ellipse
  ctx.fillStyle = 'black';
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

// --- Draw cake if present ---
function drawCake() {
  if (!cake || !cake.visible) return;
  drawCakeEllipse(cake.x, cake.y, ellipseAlpha);
  ctx.drawImage(cakeImg, cake.x, cake.y, 50, 50);
}

// --- Update cake falling ---
function updateCake() {
  if (!cake || !cake.visible) return;
  if (!cake.onGround) {
    cake.vy += ballGravity; // use same gravity as ball
    cake.y += cake.vy;
    if (cake.y >= getCakeGroundY()) {
      cake.y = getCakeGroundY();
      cake.vy = 0;
      cake.onGround = true;
      // Cake landed, start timer for 5s
      cakeTimer = setTimeout(() => {
        // Start fade out
        let fadeStart = Date.now();
        function fadeStep() {
          let elapsed = Date.now() - fadeStart;
          ellipseAlpha = Math.max(0, 1 - (elapsed / 250));
          if (ellipseAlpha > 0) {
            setTimeout(fadeStep, 16);
          } else {
            cake.visible = false;
            ellipseAlpha = 1;
            // Pig pause for 1s, then resume
            postCakePauseTimer = setTimeout(() => {
              cakeSequenceActive = false;
              actionInProgress = false;
              setButtonsDisabled(false);
              startJump();
            }, 1000);
          }
        }
        fadeStep();
      }, 5000);
    }
  }
}

// --- Helper: Pig should stop right next to cake (not overlap) ---
function pigShouldStopForCake() {
  if (!cake || !cake.visible || !cake.onGround) return false;
  const cakeLeft = cake.x;
  const cakeRight = cake.x + 50;
  const pigCenter = petX + PET_WIDTH / 2;
  if (direction === 1 && petX + PET_WIDTH >= cakeLeft - 2 && petX < cakeLeft - 2) {
    return true;
  }
  if (direction === -1 && petX <= cakeRight + 2 && petX + PET_WIDTH > cakeRight + 2) {
    return true;
  }
  if (petX + PET_WIDTH === cakeLeft || petX === cakeRight) return true;
  return false;
}

// --- Helper: Is pig overlapping cake? ---
function pigOverlapsCake() {
  if (!cake || !cake.visible) return false;
  const cakeLeft = cake.x;
  const cakeRight = cake.x + 50;
  const pigLeft = petX;
  const pigRight = petX + PET_WIDTH;
  return !(pigRight < cakeLeft || pigLeft > cakeRight);
}

// --- Override updatePigChase for cake logic ---
function updatePigForCake() {
  if (!cakeSequenceActive || !cake || !cake.visible) return false;
  if (!cake.onGround) return;

  // If pig overlaps cake and is in air, gently lower pig to groundY at normal speed
  if (pigOverlapsCake() && petY < getGroundY()) {
    vy += gravity;
    petY += vy;
    if (petY > getGroundY()) petY = getGroundY();
    vx = 0;
    return;
  }

  // If pig is NOT next to cake, walk/jump toward closest side
  const cakeLeft = cake.x;
  const cakeRight = cake.x + 50;
  const pigRight = petX + PET_WIDTH;
  const pigLeft = petX;

  // Stop if pig is exactly next to cake (left or right)
  if (
    (Math.abs(pigRight - cakeLeft) < 3 && direction === 1) ||
    (Math.abs(pigLeft - cakeRight) < 3 && direction === -1)
  ) {
    vx = 0;
    currentImg = direction === 1 ? petImgRight : petImgLeft;
    return;
  }

  // Move toward nearest edge
  if (petX + PET_WIDTH / 2 < cake.x + 25) {
    direction = 1;
    vx = 2; // slower speed for precise stop
    currentImg = petImgRight;
  } else {
    direction = -1;
    vx = -2;
    currentImg = petImgLeft;
  }
}

// --- UI Helpers ---
function setButtonsDisabled(disabled) {
  document.querySelectorAll('button').forEach(btn => {
    btn.disabled = disabled;
  });
}

function updateStats() {
  document.getElementById('happiness').textContent = pet.happiness;
  document.getElementById('hunger').textContent = pet.hunger;
  document.getElementById('cleanliness').textContent = pet.cleanliness;
  document.getElementById('health').textContent = pet.health;
}

// --- Responsive Canvas ---
function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = 300;
  if (typeof petX !== 'undefined' && typeof petY !== 'undefined') {
    petX = Math.min(Math.max(petX, 0), canvas.width - PET_WIDTH - 10);
    petY = canvas.height - PET_HEIGHT;
  }
}
window.addEventListener('resize', resizeCanvas);

// --- Image Preload Helper ---
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

// --- Ball Image Preload (array of Image objects) ---
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

// --- Pet Care Functions (exposed to window) ---
function effectGuard(fn) {
  // Helper to wrap all pet actions so only one runs at a time
  return function(...args) {
    if (actionInProgress) return;
    fn.apply(this, args);
  };
}

window.feedPet = effectGuard(function() {
  if (cakeSequenceActive) return; // Prevent re-entry
  cakeSequenceActive = true;
  actionInProgress = true;
  setButtonsDisabled(true);

  pet.hunger = Math.max(0, pet.hunger - 15);
  pet.happiness = Math.min(100, pet.happiness + 5);
  updateStats();
  registerBackgroundSync('sync-feed-pet');

  // Setup cake state
  if (cakeTimer) clearTimeout(cakeTimer);
  if (postCakePauseTimer) clearTimeout(postCakePauseTimer);
  ellipseAlpha = 1;
  cake = {
    x: getCakeStartX(),
    y: getCakeStartY(),
    vy: 0,
    onGround: false,
    visible: true,
  };
});
window.playWithPet = effectGuard(function() {
  lockActionsForDuration(15000); // 10s visible + 5s fade for ball
  pet.happiness = Math.min(100, pet.happiness + 10);
  pet.hunger = Math.min(100, pet.hunger + 5);
  updateStats();
  showBallForDuration();
});
window.cleanPet = effectGuard(function() {
  lockActionsForDuration(2000); // Lock for 2s
  pet.cleanliness = 100;
  pet.happiness = Math.min(100, pet.happiness + 5);
  updateStats();
});
window.sleepPet = effectGuard(function() {
  lockActionsForDuration(9000); // Approx 9s for sleep sequence
  pet.health = Math.min(100, pet.health + 10);
  pet.hunger = Math.min(100, pet.hunger + 10);
  updateStats();
  if (!isSleeping && !sleepSequenceActive && !sleepRequested) {
    sleepRequested = true;
    resumeDirection = direction;
    resumeImg = (direction === 1) ? petImgRight : petImgLeft;
    pendingSleep = true;
  }
});
window.healPet = effectGuard(function() {
  lockActionsForDuration(1000); // Lock for 1s
  pet.health = 100;
  pet.happiness = Math.min(100, pet.happiness + 5);
  updateStats();
});

// --- Action Lock Helper ---
function lockActionsForDuration(ms) {
  if (actionInProgress) return;
  actionInProgress = true;
  setButtonsDisabled(true);
  setTimeout(() => {
    actionInProgress = false;
    setButtonsDisabled(false);
  }, ms);
}

// --- Ball Show/Hide Logic (for a single random ball, top half only) ---
function showBallForDuration() {
  clearTimeout(showBallTimeout);
  clearTimeout(fadeBallTimeout);
  showBall = true;
  ballAlpha = 1;

  // Pick a random image and a random position (top half only), random velocity
  const imgIndex = Math.floor(Math.random() * ballImgObjects.length);
  const img = ballImgObjects[imgIndex];

  // x: not too close to edge
  const margin = BALL_RADIUS + 5;
  const minX = margin;
  const maxX = canvas.width - margin;

  // y: only in top half
  const minY = margin;
  const maxY = Math.floor(canvas.height / 2) - margin;
  const randX = minX + Math.random() * (maxX - minX);
  const randY = minY + Math.random() * (maxY - minY);

  // Random initial velocity
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

  // After 10s, start fading over 5s
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

// --- Sleep Sequence Logic ---
function runSleepSequence() {
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
              startJump();
            }, 2000);
          }, 5000);
        }, 500);
      }, 500);
    }, 500);
  }, 1000);
}

function startJump() {
  const speed = 6, angle = Math.PI * 65 / 180;
  vx = direction * speed * Math.cos(angle);
  vy = -speed * Math.sin(angle);
}

// --- Kick a ball with an arc when the pig hits its front! ---
function kickBallFromPig(ball) {
  const baseSpeed = Math.max(Math.abs(vx), 4);
  const speed = (3 + Math.random() * 1.5) * baseSpeed;
  const dir = direction;
  if (Math.random() < 2/3) {
    const angle = (Math.PI / 4) + Math.random() * (Math.PI / 12);
    ball.vx = dir * speed * Math.cos(angle);
    ball.vy = -speed * Math.sin(angle);
  } else {
    const angle = Math.random() * (Math.PI / 4);
    ball.vx = dir * speed * Math.cos(angle);
    ball.vy = -speed * Math.sin(angle);
  }
}

// --- Overlap detection for v8 (returns true if overlap, but does NOT affect movement) ---
function checkPigBallOverlap() {
  if (!showBall || !ball) return false;

  // Pig rectangle:
  const pigLeft = petX;
  const pigRight = petX + PET_WIDTH;
  const pigTop = petY;
  const pigBottom = petY + PET_HEIGHT;
  // Ball center and radius:
  const bx = ball.x, by = ball.y, r = ball.radius;

  // Find closest point on the pig rect to the ball center
  const closestX = Math.max(pigLeft, Math.min(bx, pigRight));
  const closestY = Math.max(pigTop, Math.min(by, pigBottom));
  const dx = bx - closestX;
  const dy = by - closestY;
  const distSq = dx * dx + dy * dy;
  return distSq < r * r;
}

// --- Ball-to-pig front collision detection ---
function pigHitsBallFront(ball) {
  const pigLeft = petX;
  const pigRight = petX + PET_WIDTH;
  const pigTop = petY;
  const pigBottom = petY + PET_HEIGHT;
  const bx = ball.x, by = ball.y, r = ball.radius;
  const closestX = Math.max(pigLeft, Math.min(bx, pigRight));
  const closestY = Math.max(pigTop, Math.min(by, pigBottom));
  const dx = bx - closestX;
  const dy = by - closestY;
  if (dx * dx + dy * dy < r * r) {
    if (direction === 1) {
      return bx > pigRight - r * 0.5 && bx < pigRight + r;
    } else {
      return bx < pigLeft + r * 0.5 && bx > pigLeft - r;
    }
  }
  return false;
}

// --- Animation/Background ---
function drawBackground() {
  ctx.fillStyle = '#90EE90';
  ctx.fillRect(0, getGroundY(), canvas.width, canvas.height - getGroundY());
  ctx.fillStyle = '#ADD8E6';
  ctx.fillRect(0, 0, canvas.width, getGroundY());
}

// --- Ball Physics Update (only one) ---
function updateBall() {
  if (!showBall || !ball) return;

  // Gravity
  ball.vy += ballGravity;
  // Air friction
  ball.vx *= ballAirFriction;
  ball.vy *= ballAirFriction;
  // Move
  ball.x += ball.vx;
  ball.y += ball.vy;

  // Ball rotation proportional to horizontal speed
  ball.angle += ball.vx / BALL_RADIUS;

  // Shared ground: balls rest on the grass line where the pig walks
  const pigGroundY = getGroundY();
  const ballRestY = pigGroundY + PET_HEIGHT - BALL_RADIUS;
  if (ball.y + BALL_RADIUS > ballRestY) {
    ball.y = ballRestY - BALL_RADIUS;
    ball.vy *= -ballBounce;
    if (Math.abs(ball.vy) < 1) ball.vy = 0; // settle
  }

  // Bounce off walls
  if (ball.x - BALL_RADIUS < 0) {
    ball.x = BALL_RADIUS;
    ball.vx *= -ballBounce;
  }
  if (ball.x + BALL_RADIUS > canvas.width) {
    ball.x = canvas.width - BALL_RADIUS;
    ball.vx *= -ballBounce;
  }
}

// --- Ball Drawing (only one) ---
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

// --- Helper: should pig reverse after landing? ---
function shouldReverseToChaseBall() {
  if (!showBall || !ball) return false;
  const pigCenterX = petX + PET_WIDTH / 2;
  if ((direction === 1 && pigCenterX > ball.x) ||
      (direction === -1 && pigCenterX < ball.x)) {
    return true;
  }
  return false;
}

// --- Pig Chasing Ball Logic for v8 ---
function updatePigChase() {
  if (isSleeping || sleepSequenceActive || pendingWake || !showBall || !ball) return;
  if (overlapPauseActive) {
    // Don't chase the ball, just continue current jump arc in current direction
    return;
  }
  // Normal chase
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
    vx = 0; // reached ball
    if (direction === 1) currentImg = petImgRight;
    else currentImg = petImgLeft;
  }
}

// --- Main Animation Loop ---
function animate() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();

  // Ball and cake physics/drawing
  if (!cakeSequenceActive) {
    updateBall();
    drawBall();
  }
  updateCake();
  drawCake();

  // --- Cake logic overrides pig movement, else normal ---
  if (cakeSequenceActive && cake && cake.visible) {
    updatePigForCake();
  } else {
    updatePigChase();
  }

  // Pig movement (jump arc always continues)
  if (!isSleeping && !sleepSequenceActive && !pendingWake) {
    // If cake sequence, pig movement already handled
    if (!cakeSequenceActive) {
      vy += gravity;
      petX += vx;
      petY += vy;
    }
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

  // Cake collision (if pig is airborne and overlaps cake, lower to ground)
  if (cakeSequenceActive && cake && cake.visible && pigOverlapsCake() && petY < getGroundY()) {
    vy = Math.min(vy + gravity, 8); // clamp descent speed
    petY += vy;
    if (petY > getGroundY()) petY = getGroundY();
    vx = 0;
  }

  // Overlap detection for this frame (ball)
  inOverlap = checkPigBallOverlap();
  let pigCenterX = petX + PET_WIDTH / 2;
  let ballCenterX = ball ? ball.x : null;

  // Overlap pause logic v8 (ball)
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
        overlapPauseActive = false; // Resume chase
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

  // Ball kicking
  if (!isSleeping && !sleepSequenceActive && !pendingWake && showBall && ball) {
    if (pigHitsBallFront(ball)) {
      kickBallFromPig(ball);
    }
  }

  // Ground landing and jump/reversal/chase logic
  let groundY = getGroundY();
  if (petY >= groundY) {
    petY = groundY;

    // For cake sequence: stop next to cake
    if (cakeSequenceActive && cake && cake.visible && cake.onGround) {
      if (pigShouldStopForCake()) {
        vx = 0;
        // Remain still next to cake until it disappears
      } else if (!pigOverlapsCake()) {
        // If not next to cake, move toward it
        if (petX + PET_WIDTH / 2 < cake.x + 25) {
          direction = 1;
          vx = 2;
          currentImg = petImgRight;
        } else {
          direction = -1;
          vx = -2;
          currentImg = petImgLeft;
        }
        startJump();
      }
    } else if (!isSleeping && !sleepSequenceActive && !sleepRequested && !pendingWake) {
      if (!cakeSequenceActive) {
        if (showBall && ball) {
          // Normal chase: possibly reverse direction if needed
          if (!overlapPauseActive && shouldReverseToChaseBall()) {
            direction = -direction;
            vx = direction * 3;
            currentImg = (direction === 1) ? petImgRight : petImgLeft;
          }
          startJump();
        } else {
          // No ball: continue jumping in last direction
          startJump();
        }
      }
    }
  }

  ctx.drawImage(currentImg, petX, petY, PET_WIDTH, PET_HEIGHT);

  // --- Version text (bottom right, outside canvas) ---
  if (!document.getElementById('version-number')) {
    const stats = document.getElementById('stats');
    const statsStyle = window.getComputedStyle(stats);
    const versionDiv = document.createElement('div');
    versionDiv.id = 'version-number';
    versionDiv.textContent = 'v8';
    versionDiv.style.position = 'fixed';
    versionDiv.style.right = '40px';
    versionDiv.style.bottom = '20px';
    versionDiv.style.fontSize = statsStyle.fontSize;
    versionDiv.style.color = statsStyle.color;
    versionDiv.style.fontFamily = statsStyle.fontFamily;
    versionDiv.style.zIndex = '20';
    versionDiv.style.pointerEvents = 'none';
    versionDiv.style.userSelect = 'none';
    document.body.appendChild(versionDiv);
  }

  requestAnimationFrame(animate);
}

// --- Background Sync helper ---
function registerBackgroundSync(tag) {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then(registration => {
      registration.sync.register(tag).catch(() => {});
    });
  }
}

// --- Service Worker hot update logic ---
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

// --- Startup: Only launch once ---
window.addEventListener('DOMContentLoaded', () => {
  if (window.__pet_loaded__) return;
  window.__pet_loaded__ = true;
  resizeCanvas();
  updateStats();
  Promise.all([
    loadImages([petImgLeft, petImgRight, petImgSleep, petImgSleepR, cakeImg]),
    loadBallImages()
  ])
    .then(() => {
      petX = canvas.width - PET_WIDTH - 10;
      petY = canvas.height - PET_HEIGHT;
      currentImg = petImgLeft;
      resumeDirection = direction;
      resumeImg = currentImg;
      animate();
    })
    .catch((err) => {
      console.error("One or more images failed to load.", err);
    });
});
