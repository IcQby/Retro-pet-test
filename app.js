// ===============================
// Retro Pet test - Modular Layout
// ===============================

// --- Version Info ---
const versionid = "v8.10";

// ===============================
// SECTION 1: ASSET MANAGEMENT
// ===============================
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

const cakeImgs = [
  new Image(), new Image(), new Image(), new Image()
];
cakeImgs[0].src = 'icon/cake1.png';
cakeImgs[1].src = 'icon/cake2.png';
cakeImgs[2].src = 'icon/cake3.png';
cakeImgs[3].src = 'icon/cake4.png';

const ballImages = [
  'icon/ball1.png', 'icon/ball2.png', 'icon/ball3.png'
];
const BALL_DISPLAY_SIZE = 50;
const BALL_RADIUS = BALL_DISPLAY_SIZE / 2;
let ballImgObjects = [];

function loadImages(images) {
  return Promise.all(
    images.map(
      img => new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      })
    )
  );
}
function loadBallImages() {
  return Promise.all(
    ballImages.map(
      (src, i) => new Promise((resolve, reject) => {
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
const pet = { happiness: 50, hunger: 50, sleepiness: 50, cleanliness: 50, health: 50 };
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
let currentAction = null;
let wasInOverlap = false;
let inOverlap = false;
let overlapPauseActive = false;
let overlapLastEndDistance = Infinity;

// --- Cake Feed Sequence State ---
let cakeFeedActive = false;
let cakeFeedState = null;

// --- Cleaning Sequence State ---
const st = {
  phase: "idle",        // track current animation phase ("idle", "cleaning", "cakeFall", etc.)
  pigJumpsRemaining: 0,
  pigJumping: false,
  cakeY: 0,
  cakeGroundY: 0,
  shadowVisible: false,
  jumpDistancePerJump: 0,
  eatStartTime: 0,
  eatStep: 0,
  cakeImgIdx: 0,
  cakeFadeAlpha: 1,
  fadeStart: 0,
  eatTimers: [],
  // Add cleaning-specific flags if needed:
  cleaningTimer: null,
  bubbles: [], // if you want to track bubble positions
};

// ===============================
// SECTION 4: MASTER UPDATE/DRAW ROUTINE
// ===============================
function masterUpdateDrawRoutine() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground(); // This already checks backgroundMode

  // Everything else...
  updateBall(); 
  drawBall(); 
  updateBallOverlapPause();

  if (cakeFeedActive) {
    updateCakeFeed();
    drawCakeFeed();
  } else if (st.phase === "cleaning") {
    updateCleaning();
    drawCleaning();
  } else {
    idleJumping();
    if (actionInProgress && currentAction) actionMovement();
    ctx.drawImage(currentImg, petX, petY, PET_WIDTH, PET_HEIGHT);
  }

  requestAnimationFrame(masterUpdateDrawRoutine);
}


// ===============================
// SECTION old 12: RENDERING background
// ===============================
let backgroundMode = 'normal'; // 'normal' | 'sleep' | 'transitioning'
let transitionStartTime = null;
const sleepDuration = 10000; // 10 seconds
const transitionDuration = 2500; // 2.5 seconds


// HELPER function for transitioning background colour
function lerpColor(color1, color2, t) {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);

  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);

  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

// Drawing the background itself
function drawBackground() {
  let topColor, bottomColor;

  const now = Date.now();

  if (backgroundMode === 'normal') {
    topColor = '#ADD8E6';     // sky blue
    bottomColor = '#90EE90';  // grass green

  } else if (backgroundMode === 'sleep') {
    topColor = '#001a33';     // dark blue sky
    bottomColor = '#003300';  // dark green grass

  } else if (backgroundMode === 'transitioning') {
    const elapsed = now - transitionStartTime;
    const t = Math.min(elapsed / transitionDuration, 1); // 0 to 1

    topColor = lerpColor('#001a33', '#ADD8E6', t);
    bottomColor = lerpColor('#003300', '#90EE90', t);

    if (t >= 1) {
      backgroundMode = 'normal';
    }
  }

  const groundY = getGroundY();
  ctx.fillStyle = bottomColor;
  ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
  ctx.fillStyle = topColor;
  ctx.fillRect(0, 0, canvas.width, groundY);
}


function lerpColor(color1, color2, t) {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);

  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);

  return `rgb(${r}, ${g}, ${b})`;
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}



// ===============================
// SECTION 5: IDLE JUMPING (includes idle movement)
// ===============================
function idleJumping() {
  if (!isSleeping && !sleepSequenceActive && !pendingWake && !cakeFeedActive) {
    vy += gravity; petX += vx; petY += vy;
  }
  if (!isSleeping && !sleepSequenceActive && !pendingWake && !cakeFeedActive) {
    if (petX <= 0) { petX = 0; direction = 1; vx = Math.abs(vx); currentImg = petImgRight; }
    else if (petX + PET_WIDTH >= canvas.width) { petX = canvas.width - PET_WIDTH; direction = -1; vx = -Math.abs(vx); currentImg = petImgLeft; }
  }
  let groundY = getGroundY();
  if (petY >= groundY && !cakeFeedActive) {
    petY = groundY;
    if (pendingSleep) {
      vx = 0; vy = 0; pendingSleep = false; startSleepSequence();
    } else if (!isSleeping && !sleepSequenceActive && !sleepRequested && !pendingWake && !actionInProgress) {
      startIdleJump();
    }
  }
}
function startIdleJump() {
  const speed = 6, angle = Math.PI * 65 / 180;
  vx = direction * speed * Math.cos(angle);
  vy = -speed * Math.sin(angle);
}
function getGroundY() { return canvas.height - PET_HEIGHT; }

// ===============================
// SECTION 6: PLAY SEQUENCE
// ===============================
let ball = null;
const ballGravity = 0.5, ballAirFriction = 0.99, ballBounce = 0.7;
let showBall = false, ballAlpha = 1, showBallTimeout = null, fadeBallTimeout = null;
function showBallForDuration() {
  clearTimeout(showBallTimeout); clearTimeout(fadeBallTimeout);
  showBall = true; ballAlpha = 1;
  const imgIndex = Math.floor(Math.random() * ballImgObjects.length);
  const img = ballImgObjects[imgIndex];
  const margin = BALL_RADIUS + 5;
  const minX = margin, maxX = canvas.width - margin, minY = margin, maxY = Math.floor(canvas.height / 2) - margin;
  const randX = minX + Math.random() * (maxX - minX);
  const randY = minY + Math.random() * (maxY - minY);
  const randVx = (Math.random() - 0.5) * 5;
  const randVy = (Math.random() - 0.2) * 3;
  ball = { x: randX, y: randY, vx: randVx, vy: randVy, radius: BALL_RADIUS, img: img, angle: 0 };
  showBallTimeout = setTimeout(() => {
    let fadeStart = Date.now();
    function fadeStep() {
      let elapsed = Date.now() - fadeStart;
      ballAlpha = Math.max(0, 1 - (elapsed / 5000));
      if (ballAlpha > 0) fadeBallTimeout = setTimeout(fadeStep, 16);
      else { showBall = false; ballAlpha = 1; }
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
  if (ball.x - BALL_RADIUS < 0) { ball.x = BALL_RADIUS; ball.vx *= -ballBounce; }
  if (ball.x + BALL_RADIUS > canvas.width) { ball.x = canvas.width - BALL_RADIUS; ball.vx *= -ballBounce; }
}
function drawBall() {
  if (!showBall || !ball) return;
  ctx.save();
  ctx.globalAlpha = ballAlpha;
  if (ball.img) {
    ctx.save(); ctx.translate(ball.x, ball.y); ctx.rotate(ball.angle || 0);
    ctx.drawImage(ball.img, -BALL_RADIUS, -BALL_RADIUS, BALL_DISPLAY_SIZE, BALL_DISPLAY_SIZE);
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
  const by = ball.y, pigTop = petY, pigBottom = petY + PET_HEIGHT;
  if (by + r < pigTop || by - r > pigBottom) return false; // no vertical overlap
  const closestX = Math.max(pigLeft, Math.min(bx, pigRight));
  const dx = bx - closestX;
  if (dx * dx < r * r) {
    if (direction === 1) return bx > pigRight - r * 0.5 && bx < pigRight + r;
    else return bx < pigLeft + r * 0.5 && bx > pigLeft - r;
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
    if (inOverlap && !wasInOverlap) { overlapPauseActive = true; overlapLastEndDistance = Infinity; }
    if (inOverlap) { overlapLastEndDistance = Infinity; }
    if (!inOverlap && wasInOverlap) { if (ball) overlapLastEndDistance = Math.abs(pigCenterX - ballCenterX); }
    if (overlapPauseActive && !inOverlap && ball) {
      overlapLastEndDistance = Math.abs(pigCenterX - ballCenterX);
      if (overlapLastEndDistance >= PET_WIDTH * 0.5) { overlapPauseActive = false; }
    }
    if (!showBall) { overlapPauseActive = false; overlapLastEndDistance = Infinity; }
  } else {
    overlapPauseActive = false; overlapLastEndDistance = Infinity;
  }
  wasInOverlap = inOverlap;
}

// ===============================
// SECTION 7: ACTION MOVEMENT HANDLER
// ===============================
function actionMovement() {
  if (currentAction === "play") {
    if (!isSleeping && !sleepSequenceActive && !pendingWake && showBall && ball && !overlapPauseActive) {
      const pigCenterX = petX + PET_WIDTH / 2;
      const ballX = ball.x;
      const chaseSpeed = 3;
      const deadzone = BALL_RADIUS + 10;
      if (Math.abs(ballX - pigCenterX) > deadzone) {
        if (ballX > pigCenterX) { direction = 1; vx = chaseSpeed; currentImg = petImgRight; }
        else { direction = -1; vx = -chaseSpeed; currentImg = petImgLeft; }
      } else { vx = 0; currentImg = direction === 1 ? petImgRight : petImgLeft; }
    }
    if (!isSleeping && !sleepSequenceActive && !pendingWake && showBall && ball) {
      if (pigHitsBallFront(ball)) { kickBallFromPig(ball); }
    }
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
  }
}
function shouldReverseToChaseBall() {
  if (!showBall || !ball) return false;
  const pigCenterX = petX + PET_WIDTH / 2;
  if ((direction === 1 && pigCenterX > ball.x) || (direction === -1 && pigCenterX < ball.x)) return true;
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

  // Step 1-4: Bouncing animation before sleeping
  setTimeout(() => {
    currentImg = imgB;
    setTimeout(() => {
      currentImg = imgA;
      setTimeout(() => {
        currentImg = imgB;

        setTimeout(() => {
          // Pig falls asleep
          currentImg = sleepImg;
          isSleeping = true;
          sleepSequenceActive = false;

          backgroundMode = 'sleep'; // Instantly darken background
          showZzzAbovePig(petX, petY);

          // Start background transition back to normal after 7.5 seconds
          setTimeout(() => {
          backgroundMode = 'transitioning';
          transitionStartTime = Date.now();
          }, sleepDuration - transitionDuration); // 7500ms

          // Wake up after 10 seconds
          setTimeout(() => {
            currentImg = imgA;
            isSleeping = false;
            pendingWake = true;
            vx = 0;
            vy = 0;

            hideZzz();

            wakeTimeoutId = setTimeout(() => {
              pendingWake = false;
              sleepSequenceStep = 0;
              sleepSequenceActive = false;
              direction = resumeDirection;
              currentImg = (direction === 1) ? petImgRight : petImgLeft;
              startIdleJump();
            }, 2000);
          }, sleepDuration);
        }, 500);
      }, 500);
    }, 500);
  }, 1000);
}


// Show Zzz's above pig's head, offset right if sleeping facing right
function showZzzAbovePig(x, y) {
  const canvas = document.getElementById("pet-canvas");
  const zzzContainer = document.getElementById("zzz-container");
  const rect = canvas.getBoundingClientRect();

  const offsetX = (currentImg === petImgSleepR) ? (x + PET_WIDTH) : x;
  const offsetY = y - 40; // height above pig

  zzzContainer.style.left = `${rect.left + offsetX}px`;
  zzzContainer.style.top = `${rect.top + offsetY}px`;
  zzzContainer.classList.remove("hidden");
}

function hideZzz() {
  const zzzContainer = document.getElementById("zzz-container");
  zzzContainer.classList.add("hidden");
}


// ===============================
// SECTION 9: DISABLE BUTTONS DURING ACTIONS
// ===============================
function setButtonsDisabled(disabled) {
  document.querySelectorAll('button').forEach(btn => { btn.disabled = disabled; });
}
function effectGuard(fn, actionName) {
  return function (...args) {
    if (actionInProgress || cakeFeedActive) return;
    actionInProgress = true; currentAction = actionName;
    setButtonsDisabled(true); fn.apply(this, args);
  };
}
function finishAction() {
  actionInProgress = false; currentAction = null;
  setButtonsDisabled(false);
}

// ===============================
// SECTION 10: PET ACTIONS (Button triggers)
// ===============================

// --- CAKE FEED SEQUENCE ---
function getCakeHeight(img, width) {
  if (!img || !img.complete || !img.naturalWidth) return 75;
  return img.naturalHeight * (width / img.naturalWidth);
}

function startCakeFeedSequence() {
  let cakeW = 100;
  let cakeH = getCakeHeight(cakeImgs[0], cakeW);
  let cakeX = (canvas.width - cakeW) / 2;
  let cakeY = 20;
  let cakeDesiredBottom = canvas.height - 25;
  let cakeGroundY = cakeDesiredBottom - cakeH;

  cakeFeedActive = true;
  cakeFeedState = {
    phase: "cakeInAir", // cakeInAir, cakeFall, pigJump, PigStopAtCake, preEatPause, eating, done
    cakeX, cakeY, cakeW, cakeH, cakeGroundY, cakeDesiredBottom,
    cakeImgIdx: 0,
    cakeFadeAlpha: 1,
    pigStartDirection: direction,
    eatTimers: [],
    eatStep: 0,
    eatStartTime: null,
    fadeStart: null,
    shadowVisible: true,
    pigJumpsRemaining: 2,
    pigJumping: false,
    pigReadyToEat: false
  };
}

function updateCakeFeed() {
  if (!cakeFeedActive) return;
  let st = cakeFeedState;

  // 1. Cake floats near top. Pig jumps as normal, until pig hits wall & lands.
  if (st.phase === "cakeInAir") {
    vy += gravity; petX += vx; petY += vy;
    // Boundaries and wall detection
    let hitWall = false;
    if (petX <= 0) { petX = 0; direction = 1; vx = 0; hitWall = true; currentImg = petImgRight; }
    else if (petX + PET_WIDTH >= canvas.width) { petX = canvas.width - PET_WIDTH; direction = -1; vx = 0; hitWall = true; currentImg = petImgLeft; }
    // On ground, after wall
    let onGround = petY >= getGroundY();
    if (onGround) {
      petY = getGroundY();
      if (hitWall) { vx = 0; vy = 0; st.phase = "cakeFall"; }
      else if (!hitWall && !isSleeping && !sleepSequenceActive && !sleepRequested && !pendingWake) startIdleJump();
    }
  }
  // 2. Cake falls until bottom is 50px above bottom of canvas. Draw shadow while falling.
  else if (st.phase === "cakeFall") {
    st.shadowVisible = true;
    if (st.cakeY < st.cakeGroundY) {
      st.cakeY += 14;
      if (st.cakeY > st.cakeGroundY) st.cakeY = st.cakeGroundY;
    } else {
      st.cakeY = st.cakeGroundY;
      st.shadowVisible = false;
      
     // 3. Before starting pigJump phase calculate distance to cake.  
      direction = petX + PET_WIDTH / 2 < st.cakeX + st.cakeW / 2 ? 1 : -1;
       let pigFront = direction === 1 ? petX + PET_WIDTH : petX;
      let cakeSide = direction === 1 ? st.cakeX : st.cakeX + st.cakeW;
      let totalDistance = Math.abs(cakeSide - pigFront);
       st.jumpDistancePerJump = totalDistance / 2;
      st.pigJumpsRemaining = 2;
      
      st.phase = "pigJump";
   }
  }      
//4. make 2 jumps towards cake
else if (st.phase === "pigJump") {
  if (!st.pigJumping && st.pigJumpsRemaining > 0) {
    let angle = Math.PI * 65 / 180; // same fixed angle
    let distance = st.jumpDistancePerJump;

    // Use basic projectile motion to compute needed speed for desired distance
    // horizontal speed = distance / time
    // time = 2 * vy / gravity (symmetric parabolic arc)
    let g = gravity;
    let vyFixed = -6; // or keep using the angle-based method
    let time = -2 * vyFixed / g;
    let vxNeeded = distance / time;

    direction = petX + PET_WIDTH / 2 < st.cakeX + st.cakeW / 2 ? 1 : -1;
    currentImg = direction === 1 ? petImgRight : petImgLeft;

    vx = direction * vxNeeded;
    vy = vyFixed;

    st.pigJumping = true;
  }

  // Apply motion
  vy += gravity;
  petX += vx;
  petY += vy;

  // Clamp to ground
  if (petY >= getGroundY()) {
    petY = getGroundY();
    vy = 0;
    st.pigJumping = false;
    st.pigJumpsRemaining--;

    if (st.pigJumpsRemaining === 0) {
      vx = 0;
      st.phase = "preEatPause"; // start preEatPause because pig is at the cake now
      st.eatStartTime = performance.now(); //setting eatstarttime to now (is a timestamp that will be used to add a second before it starts eating)
    }
  }
}


  // 5. Pause for 1s before eating
  else if (st.phase === "preEatPause") {
    if (performance.now() - st.eatStartTime >= 1000) {
      st.phase = "eating";
      st.eatStep = 0;
      st.cakeImgIdx = 0;
      doEatingSequence(st);
    }
  }
  else if (st.phase === "done") {
    let elapsed = performance.now() - st.fadeStart;
    st.cakeFadeAlpha = Math.max(0, 1 - elapsed / 2000);
    if (elapsed >= 2000) {
      cakeFeedActive = false;
      finishAction();
      direction = -st.pigStartDirection;
      currentImg = direction === 1 ? petImgRight : petImgLeft;
      startIdleJump();
      st.eatTimers.forEach(t => clearTimeout(t));
      cakeFeedState = null;
    }
  }
}
function doEatingSequence(st) {
  function setPigIdle() { currentImg = direction === 1 ? petImgRight : petImgLeft; }
  function setPigEat() { currentImg = direction === 1 ? pigRightEatImg : pigLeftEatImg; }
  setPigEat(); st.cakeImgIdx = 0;
  st.eatTimers.push(setTimeout(() => {
    setPigIdle(); st.cakeImgIdx = 1;
    st.eatTimers.push(setTimeout(() => {
      setPigEat(); st.cakeImgIdx = 1;
      st.eatTimers.push(setTimeout(() => {
        setPigIdle(); st.cakeImgIdx = 2;
        st.eatTimers.push(setTimeout(() => {
          setPigEat(); st.cakeImgIdx = 2;
          st.eatTimers.push(setTimeout(() => {
            setPigIdle(); st.cakeImgIdx = 3;
            st.eatTimers.push(setTimeout(() => {
              st.phase = "done"; st.fadeStart = performance.now();
            }, 1000));
          }, 500));
        }, 1000));
      }, 500));
    }, 1000));
  }, 500));
}
function drawCakeFeed() {
  if (!cakeFeedActive) return;
  let st = cakeFeedState;
  ctx.save();
  ctx.globalAlpha = st.cakeFadeAlpha;
  let imgIdx = st.cakeImgIdx || 0;
  let cakeH = getCakeHeight(cakeImgs[imgIdx], st.cakeW);
  let cakeY = (st.phase === "cakeInAir" || st.phase === "cakeFall") ? st.cakeY : st.cakeGroundY;
  // Draw shadow ellipse behind cake only while cake is dropping
  if ((st.phase === "cakeInAir" || st.phase === "cakeFall") && st.shadowVisible) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    // Center ellipse under cake, bottom at canvas.height-50
    let ellipseX = st.cakeX + st.cakeW / 2;
    let ellipseY = st.cakeDesiredBottom - 10;
    ctx.ellipse(ellipseX, ellipseY, 50, 10, 0, 0, 2 * Math.PI);
    ctx.fillStyle = "black";
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = st.cakeFadeAlpha;
  ctx.drawImage(cakeImgs[imgIdx], st.cakeX, cakeY, st.cakeW, cakeH);
  ctx.globalAlpha = 1;
  let pigImg = currentImg;
  ctx.drawImage(pigImg, petX, petY, PET_WIDTH, PET_HEIGHT);
  ctx.restore();
}

//===============
//CLEANING SEQUENCE
//===============

function updateCleaning() {
  // Small horizontal wiggle to simulate sliding
  let wiggle = Math.sin(performance.now() / 100) * 1.5;
  petX += wiggle;

  // Initialize bubbles array if missing
  if (!st.bubbles) st.bubbles = [];

  // Update bubbles: float up and fade out slowly
  for (let b of st.bubbles) {
    b.y -= 0.5;
    b.alpha -= 0.007;  // slower fade for longer visible bubbles
  }
  // Remove fully faded bubbles
  st.bubbles = st.bubbles.filter(b => b.alpha > 0);

  // Add bubbles to keep around 15 bubbles for continuous effect
  while (st.bubbles.length < 15) {
    st.bubbles.push(createBubble());
  }

  // End cleaning after 2 seconds
  if (performance.now() - st.cleanStartTime > 5000) {
    st.phase = "doneCleaning";  // Or whatever phase you want next
    finishAction();
  }
}

function drawCleaning() {
  // Draw pig
  ctx.drawImage(currentImg, petX, petY, PET_WIDTH, PET_HEIGHT);
  
  // Draw bubbles on top
  if (st.bubbles) {
    for (let b of st.bubbles) {
      drawBubble(ctx, b.x, b.y, b.radius, b.alpha);
    }
  }
}

function drawBubble(ctx, x, y, r, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;

  // Fill bubble with light blue and some transparency
  ctx.fillStyle = "rgba(173, 216, 250, 0.4)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // Darker outline
  ctx.strokeStyle = "rgba(0, 0, 230, 0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function createBubble() {
  return {
    x: petX + PET_WIDTH / 2 + (Math.random() - 0.5) * 80,
    y: petY + PET_HEIGHT * 2 / 3 - Math.random() * 30,
    radius: 4 + Math.random() * 3,
    alpha: 0.6 + Math.random() * 0.4
  };
}

// ===================================
// -- BUTTONS --
// ===================================

  // Render function for stat bars with color coding
  function renderStatBar(statValue, barElement) {
const totalStripes = 20;
const stripesToFill = Math.round(statValue / 5);

    let colorClass;
    if (statValue < 30) {
      colorClass = 'red';
    } else if (statValue < 50) {
      colorClass = 'orange';
    } else {
      colorClass = 'green';
    }

    barElement.innerHTML = '';

    for (let i = 0; i < totalStripes; i++) {
      const stripe = document.createElement('div');
      stripe.classList.add('stripe');

      if (i < stripesToFill) {
        stripe.classList.add('filled', colorClass);
      }

      barElement.appendChild(stripe);
    }
  }

  // Update all bars UI
  function updateAllBars() {
    renderStatBar(pet.hunger, document.getElementById('hunger-bar'));
    renderStatBar(pet.happiness, document.getElementById('happiness-bar'));
    renderStatBar(pet.cleanliness, document.getElementById('cleanliness-bar'));
    renderStatBar(pet.sleepiness, document.getElementById('sleepiness-bar'));
    renderStatBar(pet.health, document.getElementById('health-bar'));
  }

  // Buttons effect implementations (matching your balance from before)
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }



window.feedPet = effectGuard(function () {
  pet.hunger = clamp(pet.hunger + 20, 0, 100);
  pet.happiness = clamp(pet.happiness + 10, 0, 100);
  pet.cleanliness = clamp(pet.cleanliness - 5, 0, 100);
  updateAllBars();
  registerBackgroundSync('sync-feed-pet');
  startCakeFeedSequence();
}, "feed");

window.playWithPet = effectGuard(function () {
    pet.happiness = clamp(pet.happiness + 15, 0, 100);
    pet.cleanliness = clamp(pet.cleanliness - 20, 0, 100);
    pet.hunger = clamp(pet.hunger - 10, 0, 100);
    pet.sleepiness = clamp(pet.sleepiness - 10, 0, 100);
    pet.health = clamp(pet.health + 5, 0, 100);
  updateAllBars();
  showBallForDuration();
  setTimeout(() => finishAction(), 15000);
}, "play");

window.cleanPet = effectGuard(function () {
    pet.cleanliness = clamp(pet.cleanliness + 25, 0, 100);
    pet.happiness = clamp(pet.happiness + 5, 0, 100);
  updateAllBars();

  // Start cleaning animation
  st.phase = "cleaning";
  st.cleanStartTime = performance.now();
  st.bubbles = createBubbles();
}, "clean");

function createBubbles() {
  const bubbles = [];
  for (let i = 0; i < 10; i++) {
    bubbles.push({
      x: petX + Math.random() * PET_WIDTH,
      y: petY + Math.random() * (PET_HEIGHT / 2),
      radius: 4 + Math.random() * 6,
      alpha: 1
    });
  }
  return bubbles;
}

window.sleepPet = effectGuard(function () {
    pet.sleepiness = clamp(pet.sleepiness + 25, 0, 100);
    pet.health = clamp(pet.health + 10, 0, 100);
    pet.hunger = clamp(pet.hunger - 10, 0, 100);
  updateAllBars();
  if (!isSleeping && !sleepSequenceActive && !sleepRequested) {
    sleepRequested = true;
    resumeDirection = direction;
    resumeImg = (direction === 1) ? petImgRight : petImgLeft;
    pendingSleep = true;
  }
  setTimeout(() => finishAction(), 14500);
}, "sleep");

window.healPet = effectGuard(function () {
    pet.health = 100;
    pet.happiness = clamp(pet.happiness + 5, 0, 100);
  updateAllBars();
  setTimeout(() => finishAction(), 100);
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
// SECTION 13: SERVICE WORKER & BACKGROUND SYNC
// ===============================
function registerBackgroundSync(tag) {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then(registration => {
      registration.sync.register(tag).catch(() => {});
    });
  }
}
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
  updateAllBars();
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
