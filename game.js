
"use strict";

// ============================================================
// OPUS v0.3 — DISCOVERY UPDATE
// ============================================================

// ============================================================
// 1. CONFIGURATION
// ============================================================

const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

// Optional GPU fisheye post-process. The original 2D canvas remains the
// complete render target; HTML overlays are never processed.
let fisheyeGL=null, fisheyeCanvas=null, fisheyeTexture=null;
let fisheyeReady=false;
// CRT TUNING: tweak these four values (0..1) to taste.
const CRT_SETTINGS = {
    scanlineStrength: 0.3,  // 0 = invisible, 0.5 = very pronounced
    scanlineSpacing: 4.0,    // physical output pixels per dark/light cycle
    maskStrength: 0.055,     // vertical RGB phosphor mask
    vignetteStrength: 0.065 // corner shading
};
// Sphere perspective. 0 disables tilt; 0.10–0.22 is a useful range.
const SPHERE_SETTINGS = { tiltStrength: 1.5 };
const RHYTHM_VISUALS = {
    bpm: 75.0,          // beats per minute
    phaseOffset: 0.0,  // seconds: shift the visual rhythm
    pulseSharpness: 5.0,
    flowBoost: 2.0,
    glowBoost: 1.5
};
function initFisheye(){
    try {
        const output=document.createElement("canvas");
        const gl=output.getContext("webgl",{alpha:false,antialias:false,
            depth:false,stencil:false,preserveDrawingBuffer:false});
        if(!gl)return;
        const vs=`attribute vec2 p; varying vec2 uv;
            void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
        const fs=`precision mediump float;
            varying vec2 uv; uniform sampler2D tex; uniform float aspect;
            uniform vec4 crt; uniform vec2 resolution; uniform vec2 cameraOffset;
            uniform float worldTime; uniform float tiltStrength; uniform vec4 rhythmVisuals;
            void main(){
                vec2 p=uv*2.-1.;
                vec2 q=vec2(p.x*aspect,p.y);
                float r2=dot(q,q);
                // Inward sampling gives a subtle barrel/fisheye curvature.
                // Inverse perspective: the top samples farther away,
                // the bottom samples closer, while preserving radial fisheye.
                float perspective=1.+tiltStrength*(-p.y);
                vec2 sampleUV=(q*(1.+.075*r2));
                sampleUV.y/=perspective;
                sampleUV.x/=perspective;
                sampleUV=vec2(sampleUV.x/aspect,sampleUV.y)*.5+.5;
                vec3 rgb;
                if(sampleUV.x<0.||sampleUV.x>1.||sampleUV.y<0.||sampleUV.y>1.) {
                    // Extrapolate the WORLD-ANCHORED manifold into fisheye's
                    // out-of-bounds corners instead of revealing black margins.
                    vec2 world=sampleUV*resolution+cameraOffset;
                    // Camera offset uses the same world origin for manual,
                    // held-key and automatic movement.
                    vec2 grid=abs(fract(world/64.)-.5)*32.;
                    float line=1.-smoothstep(.25,0.3,min(grid.x,grid.y));
                    // Flowing, interference-driven RGB manifold
                    vec2 flow = world * 0.003;

                    flow += 0.65 * vec2(
                        sin(flow.y * 1.7 + worldTime * 0.37),
                        cos(flow.x * 1.4 - worldTime * 0.29)
                    );

                    float wave =
                        sin(flow.x * 2.1 + worldTime * 0.45) *
                        cos(flow.y * 1.8 - worldTime * 0.31);
                    // One beat every 0.8 seconds at 75 BPM.
float beatPhase = 6.2831853 *
    (worldTime + rhythmVisuals.y) *
    rhythmVisuals.x / 60.0;

// A narrow pulse peaking on each beat.
float pulse = pow(
    0.5 + 0.5 * cos(beatPhase),
    rhythmVisuals.z
);
                    vec3 tint = 0.5 + 0.5 * sin(
                        vec3(0.0, 2.094, 4.189)
                        + wave * (3.0 + pulse * rhythmVisuals.w)
                        + flow.x * 1.6
                        + flow.y * 1.2
                        + worldTime * 0.15
                    );
                    rgb = line * (
    vec3(.35, .45, .7)
    + tint * (.45 + pulse * 1.5)
);
                } else {
                    rgb=texture2D(tex,vec2(sampleUV.x,1.-sampleUV.y)).rgb;
                }
                // Physical pixel-row CRT. Adjustable intensity and spacing.
                float scan=1.-crt.x*(.5-.5*cos(6.2831853*gl_FragCoord.y/max(crt.y,1.)));
                float mask=1.-crt.z*(.5-.5*cos(gl_FragCoord.x*2.0943951));
                float vignette=1.-crt.w*smoothstep(.35,2.2,r2);
                gl_FragColor=vec4(rgb*scan*mask*vignette,1.);
            }`;
        const shader=(type,source)=>{
            const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);
            if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));
            return sh;
        };
        const program=gl.createProgram();
        gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));
        gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));
        gl.linkProgram(program);
        if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
        const attr=gl.getAttribLocation(program,"p");
        gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
        const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.uniform1i(gl.getUniformLocation(program,"tex"),0);
        output.style.cssText="position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;";
        const z=getComputedStyle(canvas).zIndex;
        if(z!=="auto")output.style.zIndex=z;
        canvas.insertAdjacentElement("afterend",output);
        canvas.style.opacity="0";
        fisheyeCanvas=output;fisheyeGL=gl;fisheyeTexture=texture;
        fisheyeReady=true;
        output.addEventListener("webglcontextlost",e=>{
            e.preventDefault();fisheyeReady=false;canvas.style.opacity="1";
            output.style.display="none";
        });
        fisheyeGL._aspectLocation=gl.getUniformLocation(program,"aspect");
        gl._crtLocation=gl.getUniformLocation(program,"crt");
        gl._resolutionLocation=gl.getUniformLocation(program,"resolution");
        gl._cameraLocation=gl.getUniformLocation(program,"cameraOffset");
        gl._timeLocation=gl.getUniformLocation(program,"worldTime");
        gl._tiltLocation=gl.getUniformLocation(program,"tiltStrength");
        gl._rhythmVisualsLocation =
            gl.getUniformLocation(program, "rhythmVisuals");
    }catch(err){
        console.warn("Fisheye disabled; normal canvas retained:",err);
        canvas.style.opacity="1";
        if(fisheyeCanvas)fisheyeCanvas.remove();
        fisheyeReady=false;
    }
}
function presentFisheye(){
    if(!fisheyeReady)return;
    const gl=fisheyeGL;
    const w=canvas.width,h=canvas.height;
    // Cap output resolution for a cheap post-process on Retina displays.
    const ratio=Math.min(1.5,window.devicePixelRatio||1);
    const pw=Math.round(window.innerWidth*ratio),ph=Math.round(window.innerHeight*ratio);
    if(fisheyeCanvas.width!==pw||fisheyeCanvas.height!==ph){
        fisheyeCanvas.width=pw;fisheyeCanvas.height=ph;
        gl.viewport(0,0,pw,ph);
    }
    gl.bindTexture(gl.TEXTURE_2D,fisheyeTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
    gl.uniform1f(gl._aspectLocation,w/h);
    gl.uniform4f(gl._crtLocation,CRT_SETTINGS.scanlineStrength,CRT_SETTINGS.scanlineSpacing,
        CRT_SETTINGS.maskStrength,CRT_SETTINGS.vignetteStrength);
    gl.uniform2f(gl._resolutionLocation,window.innerWidth,window.innerHeight);
    gl.uniform2f(gl._cameraLocation,camera.x,camera.y);
    gl.uniform1f(gl._timeLocation,getRhythmSeconds());
    gl.uniform1f(gl._tiltLocation,SPHERE_SETTINGS.tiltStrength);
    gl.uniform4f(
        gl._rhythmVisualsLocation,
        RHYTHM_VISUALS.bpm,
        RHYTHM_VISUALS.phaseOffset,
        RHYTHM_VISUALS.pulseSharpness,
        RHYTHM_VISUALS.flowBoost
    );
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
}


const statsElement = document.querySelector("#stats");
const levelElement = document.querySelector("#level");

const hpText = document.querySelector("#hp-text");
const hpFill = document.querySelector("#hp-fill");

const xpText = document.querySelector("#xp-text");
const xpFill = document.querySelector("#xp-fill");

const attackStat = document.querySelector("#attack-stat");
const chatLog = document.querySelector("#chat-log");

const popupLayer = document.querySelector("#popup-layer");
const stairsPrompt = document.querySelector("#stairs-prompt");

const MAP_WIDTH = 48;
const MAP_HEIGHT = 36;
const TILE_SIZE = 32;

// Visibility is measured in tiles.
const VISION_RADIUS = 7;

// Delay between automatic movement steps, in milliseconds.
const AUTO_EXPLORE_DELAY = 85;


const COLORS = {
    background: "#030404",

    // Bunkers 1–3: weathered concrete.
    wall: "#777b78",
    floor: "#a2a5a0",
    floorDetail: "#858984",

    exploredWall: "#282b29",
    exploredFloor: "#383c39",

    stairs: "#e8bc52",
    exploredStairs: "#80672e",

    player: "#00ff66",
    marauder: "#ff2020",
    archer: "#ff5555"
};


const DIRECTIONS = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0]
];

// ============================================================
// 2. GAME STATE
// ============================================================

let map = [];
let rooms = [];
let enemies = [];

let stairs = null;
let player = null;

let bunker = 1;
let turn = 0;
let gameOver = false;

// Fog-of-war arrays:
// explored[y][x] = player has seen this tile before
// visible[y][x]  = player can see this tile right now
let explored = [];
let visible = [];

// ============================================================
// OPUS v0.6 — CONTINUOUS VISIBILITY
// ============================================================

// Current illumination polygon, in world pixel coordinates.
let lightPolygon = [];

// Accumulated regions the player has actually illuminated.
// Unlike explored[][], this remembers partial tiles.
let visibilityHistory = new Path2D();

const LIGHT_RAY_COUNT = 64;
const LIGHT_CORNER_EPSILON = 0.0001;

const camera = {
    x: 0,
    y: 0
};

// Automatic exploration state.
let autoExploring = false;
let autoExploreTimer = null;
let autoExploreStartTurn = 0;
let exploreTickPlayed = false;


// ============================================================
// CHARACTER SELECTION AND EQUIPMENT
// ============================================================

const characterSelect = document.querySelector("#character-select");
const selectSeraphimButton = document.querySelector("#select-armada");
if (selectSeraphimButton) {
    selectSeraphimButton.querySelectorAll("strong, .character-portrait").forEach(el=>{
        if(el.textContent.trim().toLowerCase()==="armada" || el.textContent.trim()==="A")
            el.textContent=el.classList.contains("character-portrait")?"S":"SERAPHIM";
    });
}
const lockedCharacters = document.querySelector("#locked-characters");
if (lockedCharacters) lockedCharacters.style.display="none";

const weaponHUD = document.querySelector("#weapon-hud");
const weaponNameElement = document.querySelector("#weapon-name");
const ammoCurrentElement = document.querySelector("#ammo-current");
const ammoReserveElement = document.querySelector("#ammo-reserve");
const weaponStatusElement = document.querySelector("#weapon-status");

// Eight reserved slots. No characters are defined yet.
for (let i = 0; i < 0; i++) {
    const slot = document.createElement("div");

    slot.className = "character-card locked";
    slot.innerHTML = `
        <span class="character-portrait">?</span>
        <strong>LOCKED</strong>
        <span>COMING SOON</span>
    `;

    lockedCharacters.appendChild(slot);
}


// Reaper is the second playable character.
const reaperCard = document.createElement("button");

reaperCard.id = "select-reaper";
reaperCard.className = "character-card";

reaperCard.innerHTML = `
    <span class="character-portrait">R</span>
    <strong>REAPER</strong>
    <span>STARTING WEAPON</span>
    <span class="weapon-name">L137A1</span>
    <span>PRECISION: 2X DAMAGE</span>
    <span class="character-status">AVAILABLE</span>
`;

// Reaper hidden from selection.

const rubikCard = document.createElement("button");

rubikCard.id = "select-rubik";
rubikCard.className = "character-card";

rubikCard.innerHTML = `
    <span class="character-portrait">R</span>
    <strong>RUBIK</strong>
    <span>STARTING WEAPON</span>
    <span class="weapon-name">CZ P-09</span>
    <span>9mm NATO</span>
    <span class="character-status">AVAILABLE</span>
`;

// Rubik hidden from selection.

let selectedCharacter = null;
let gameStarted = false;

// This represents the player's currently equipped weapon.
// Weapon-specific behavior can be expanded later.
function createUSPS() {
    return {
        name: "HK USP",
        magazineSize: 15,
        ammo: 15,
        reserve: Infinity,
        damage: 3
    };
}

function createL137A1() {
    return {
        name: "L137A1",
        magazineSize: 15,
        ammo: 15,
        reserve: Infinity,
        damage: 3
    };
}

function createCZP09() {
    return {
        name: "CZ P-09",
        ammoType: "9mm NATO",
        magazineSize: 19,
        ammo: 19,
        reserve: Infinity,
        damage: 3
    };
}

let equippedWeapon = null;

// Cardinal facing direction.
// Seraphim initially faces north.
let facing = { x: 0, y: -1 };


// ============================================================
// ANIMATION STATE
// ============================================================

// Visual animations are independent of combat turns.
// A shot can hit instantly while its tracer is animated.

let visualEffects = [];

let animationFrame = null;
let previousFrameTime = 0;

// Smooth movement between grid positions.
const MOVE_ANIMATION_DURATION = 110;

// Bullet tracer animation duration in milliseconds.
const BULLET_ANIMATION_DURATION = 75;

// Current visual player position, in tile coordinates.
const visualPlayer = {
    x: 0,
    y: 0
};

// Movement interpolation state.
let playerMovement = null;

// Future enemy ranged attacks can use this same system.
let enemyVisualEffects = [];


// ============================================================
// OPUS v0.5 — MOUSE AIMING STATE
// ============================================================

const aimReticle = document.querySelector("#aim-reticle");

// Override the old crosshair with a single symmetrical almond-shaped eye.
if (aimReticle) {
    const style=document.createElement("style");
    style.textContent=`
      #character-select, #character-select * { cursor:pointer !important; }
      #aim-reticle { z-index:99999 !important;pointer-events:none !important;
        display:block !important;visibility:visible !important;opacity:1 !important;
        width:32px !important; height:22px !important;
        border:0 !important; border-radius:0 !important;
        background:transparent !important; box-shadow:none !important;
        transform:translate(-50%,-50%) !important; overflow:visible !important; }
      #aim-reticle::before,#aim-reticle::after {content:none !important;display:none !important;}
      #aim-reticle > *:not(.opus-eye-reticle) {display:none !important;}
      #aim-reticle .opus-eye-reticle {display:block;width:32px;height:22px;
        overflow:visible;filter:drop-shadow(0 0 2px #000);}
      #aim-reticle.focused .opus-eye-reticle {filter:drop-shadow(0 0 3px #d6a15d);}
      #aim-reticle .opus-eye-pupil {transition:r 120ms ease;transform-origin:16px 11px;}
      #aim-reticle.focused .opus-eye-pupil {r:5.0;}
      #aim-reticle .opus-eye-open {display:block;}
      #aim-reticle .opus-eye-closed {display:none;}
      #aim-reticle.firing .opus-eye-open {display:none;}
      #aim-reticle.firing .opus-eye-closed {display:block;}
    `;
    document.head.appendChild(style);
    aimReticle.innerHTML=`<svg class="opus-eye-reticle" viewBox="0 0 32 22" aria-hidden="true">
      <g class="opus-eye-open">
        <path d="M2 11 Q16 -2 30 11 Q16 24 2 11 Z" fill="rgba(0,0,0,.5)" stroke="#f5f1e7" stroke-width="1.6"/>
        <circle class="opus-eye-iris" cx="16" cy="11" r="5.5" fill="none" stroke="#d1e8f3" stroke-width="1.5"/>
        <circle class="opus-eye-pupil" cx="16" cy="11" r="1.9" fill="#0b1019" stroke="#ffffff" stroke-width=".45"/>
      </g>
      <g class="opus-eye-closed" fill="none" stroke="#f5f1e7" stroke-width="1.5" stroke-linecap="round">
        <path d="M2 10 Q16 24 30 10"/>
        <path d="M5 14 l-2 3 M8.5 17 l-1.4 3 M12 19 l-.7 3 M16 20 l0 2 M20 19 l.7 3 M23.5 17 l1.4 3 M27 14 l2 3"/>
      </g>
    </svg>`;
}

const mouse = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    inside: false
};

// Aiming direction in continuous 2D space.
let aimDirection = {
    x: 0,
    y: -1
};

// The enemy directly beneath the reticle.
let hoveredEnemy = null;

// Timer for the Reaper firing pulse.
let reticlePulseTimer = null;

function getPlayerScreenPosition() {
    return {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
    };
}

function updateAimDirection() {
    const center = getPlayerScreenPosition();

    const dx = mouse.x - center.x;
    const dy = mouse.y - center.y;

    const distance = Math.hypot(dx, dy);

    if (distance > 0.001) {
        aimDirection.x = dx / distance;
        aimDirection.y = dy / distance;
    }
}

// ============================================================
// RETICLE TARGET DETECTION
// ============================================================

function getEnemyUnderReticle() {
    if (!gameStarted || !player || !mouse.inside) {
        return null;
    }

    for (const enemy of enemies) {
        // Never target enemies hidden by fog.
        if (!canSeeEnemy(enemy)) {
            continue;
        }

        const screen = worldToScreen(enemy.x, enemy.y);

        const centerX = screen.x + TILE_SIZE / 2;
        const centerY = screen.y + TILE_SIZE / 2;

        const distance = Math.hypot(
            mouse.x - centerX,
            mouse.y - centerY
        );

        // Match the approximate rendered sprite radius.
        if (distance <= 12) {
            return enemy;
        }
    }

    return null;
}

function getNearestVisibleEnemy() {
    let nearest = null;
    let shortestDistance = Infinity;

    for (const enemy of enemies) {
        if (!canSeeEnemy(enemy)) {
            continue;
        }

        const distance = Math.hypot(
            enemy.x - player.x,
            enemy.y - player.y
        );

        if (distance < shortestDistance) {
            shortestDistance = distance;
            nearest = enemy;
        }
    }

    return nearest;
}

function getEnemyNearestReticle() {
    let nearest = null;
    let shortestDistance = Infinity;

    for (const enemy of enemies) {
        if (!canSeeEnemy(enemy)) {
            continue;
        }

        const screen = worldToScreen(enemy.x, enemy.y);

        const distance = Math.hypot(
            mouse.x - (screen.x + TILE_SIZE / 2),
            mouse.y - (screen.y + TILE_SIZE / 2)
        );

        if (distance < shortestDistance) {
            shortestDistance = distance;
            nearest = enemy;
        }
    }

    return nearest;
}

function updateReticle() {
    if (!aimReticle) return;
    if (!mouse.inside) {
        aimReticle.classList.remove("active");
        return;
    }

    aimReticle.classList.add("active");

    aimReticle.style.left = `${mouse.x}px`;
    aimReticle.style.top = `${mouse.y}px`;

    hoveredEnemy = getEnemyUnderReticle();

    const overInteractiveElement = Boolean(
        document.elementFromPoint(mouse.x, mouse.y)
            ?.closest("button")
    );

    const isFocused =
        hoveredEnemy !== null ||
        overInteractiveElement;

    aimReticle.classList.toggle(
        "focused",
        isFocused
    );

    aimReticle.classList.toggle(
        "reaper-target",
        selectedCharacter === "Reaper" &&
        hoveredEnemy !== null
    );
}

function pulseReticle() {
    if (!aimReticle) return;
    clearTimeout(reticlePulseTimer);

    aimReticle.classList.add("firing");

    reticlePulseTimer = setTimeout(() => {
        aimReticle.classList.remove("firing");
    }, 110);
}

document.addEventListener("mousemove", event => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.inside = true;

    updateAimDirection();
    updateReticle();
});

document.addEventListener("pointerdown", event => {
    if (event.button === 0) pulseReticle();
}, true);

document.addEventListener("mouseout", event => {
    if (!event.relatedTarget) {
        mouse.inside = false;
        updateReticle();
    }
});

// ============================================================
// LEFT-CLICK AIMED FIRE
// ============================================================

canvas.addEventListener("mousedown", event => {
    if (event.button !== 0) return;
    if (!gameStarted || gameOver) return;

    updateAimDirection();
    updateReticle();

    // Only snap when directly hovering a reachable enemy.
    // Otherwise fire along the actual mouse direction.
    fireWeapon(hoveredEnemy);
});

function startSeraphimRun() {
    selectedCharacter = "Seraphim";
    equippedWeapon = createUSPS();

    facing = { x: 0, y: -1 };

    // Reset visual effects and movement animations.
    visualEffects = [];
    playerMovement = null;

    gameStarted = true;

    // Hide character selection and show the weapon HUD.
    characterSelect.classList.add("hidden");
    weaponHUD.classList.remove("hidden");

    // Initialize Seraphim's run.
    restartGame();
    startCharacterMusic();

    updateWeaponHUD();

    addChatMessage("SERAPHIM ENTERS THE BUNKER.");
}

function startReaperRun() {
    selectedCharacter = "Reaper";
    equippedWeapon = createL137A1();

    facing = { x: 0, y: -1 };
    aimDirection = { x: 0, y: -1 };

    visualEffects = [];
    playerMovement = null;

    gameStarted = true;

    characterSelect.classList.add("hidden");
    weaponHUD.classList.remove("hidden");

    restartGame();
    startCharacterMusic();
    updateWeaponHUD();

    addChatMessage("REAPER ENTERS THE BUNKER.");
}
reaperCard.addEventListener("click", startReaperRun);

function startRubikRun() {
    selectedCharacter = "Rubik";
    equippedWeapon = createCZP09();

    facing = { x: 0, y: -1 };
    aimDirection = { x: 0, y: -1 };

    visualEffects = [];
    playerMovement = null;

    gameStarted = true;

    characterSelect.classList.add("hidden");
    weaponHUD.classList.remove("hidden");

    restartGame();
    startCharacterMusic();
    updateWeaponHUD();

    addChatMessage("RUBIK ENTERS THE BUNKER.");
    addChatMessage("CZ P-09 EQUIPPED — 9mm NATO.");
}
rubikCard.addEventListener("click", startRubikRun);

selectSeraphimButton.addEventListener("click", startSeraphimRun);

function updateWeaponHUD() {
    if (!equippedWeapon) return;

    weaponNameElement.textContent =
    equippedWeapon.ammoType
        ? `${equippedWeapon.name} · ${equippedWeapon.ammoType}`
        : equippedWeapon.name;
    ammoCurrentElement.textContent = equippedWeapon.ammo;

    ammoReserveElement.textContent =
        equippedWeapon.reserve === Infinity
            ? "∞"
            : equippedWeapon.reserve;

    weaponStatusElement.textContent =
        equippedWeapon.ammo === 0
            ? "RELOADING..."
            : "READY · AUTO-RELOAD";
}

// ============================================================
// OPUS — LIGHTWEIGHT SOUND EFFECTS
// Place these files inside a folder named "audio" beside game.js.
// Short OGG files are recommended; WAV works too.
// ============================================================
const SOUND_PATHS = {
    explore: "audio/clock-tick.ogg",
    fire: "resources/usp.ogg",
    hit: "resources/hit.ogg"
};
const soundPools = new Map();
function playSound(name, volume = 0.55) {
    const path = SOUND_PATHS[name];
    if (!path) return;
    let pool = soundPools.get(name);
    if (!pool) {
        pool = Array.from({ length: 3 }, () => {
            const audio = new Audio(path);
            audio.preload = "auto";
            return audio;
        });
        soundPools.set(name, pool);
    }
    const audio = pool.find(item => item.paused || item.ended) || pool[0];
    audio.pause();
    audio.currentTime = 0;
    audio.volume = volume;
    audio.play().catch(() => {}); // missing files / browser restrictions
}

// ============================================================
// OPUS — AUDIO-LOCKED RHYTHM CLOCK
// 90 BPM = 666.667 ms/beat. Creature cycle = 1500 ms.
// Held TAB = 750 ms/action (deliberately NOT a beat subdivision).
// ============================================================
const OST_BPM = 75;
const CREATURE_CYCLE_SECONDS = 1.6;
const CREATURE_FRAME_SECONDS = CREATURE_CYCLE_SECONDS / 4;
const HELD_TAB_INTERVAL_SECONDS = 0.8;
const armadaOST = new Audio("resources/tiles_ld.ogg");
armadaOST.loop = true;
armadaOST.preload = "auto";
armadaOST.volume = 0.45;
let rhythmStartTime = performance.now() / 1000;
let rhythmLastAudioTime = 0;
let rhythmLoops = 0;
let rhythmClockRunning = false;
let rhythmLastClock = 0;
let tabHeld = false;
let tabNextTick = null;
let creatureFrameRendered = -1;

function startCharacterMusic() {
    tabHeld = false;
    tabNextTick = null;
    armadaOST.pause();
    armadaOST.currentTime = 0;
    rhythmLoops = 0;
    rhythmLastAudioTime = 0;
    rhythmStartTime = performance.now() / 1000;
    rhythmClockRunning = false;
    rhythmLastClock = 0;
    resetCombo();
    if (selectedCharacter !== "Seraphim") return;
    // Selection click is a user gesture, so browser autoplay is permitted.
    armadaOST.play().then(() => {
        rhythmStartTime = performance.now() / 1000 - armadaOST.currentTime;
        rhythmClockRunning = true;
        rhythmLastAudioTime = armadaOST.currentTime;
    }).catch(() => {});
}

function getRhythmSeconds(timestamp = performance.now()) {
    if (selectedCharacter === "Seraphim" && !armadaOST.paused &&
        armadaOST.readyState >= 2 && rhythmClockRunning) {
        const current = armadaOST.currentTime;
        const duration = armadaOST.duration;
        // Extend looping audio's currentTime into a monotonic timeline.
        if (Number.isFinite(duration) && duration > 0 &&
            current < rhythmLastAudioTime - Math.min(0.25, duration / 4)) {
            rhythmLoops++;
        }
        rhythmLastAudioTime = current;
        const result = rhythmLoops * (Number.isFinite(duration) ? duration : 0) + current;
        rhythmLastClock = Math.max(rhythmLastClock, result);
        return rhythmLastClock;
    }
    // Fallback when audio is unavailable; never block gameplay.
    const fallback = Math.max(0, timestamp / 1000 - rhythmStartTime);
    rhythmLastClock = Math.max(rhythmLastClock, fallback);
    return rhythmLastClock;
}

function processHeldTab(timestamp) {
    if (!tabHeld || gameOver || !gameStarted) return;
    const now = getRhythmSeconds(timestamp);
    if (tabNextTick === null) {
        tabNextTick = (Math.floor(now / HELD_TAB_INTERVAL_SECONDS) + 1) * HELD_TAB_INTERVAL_SECONDS;
    }
    if (now + 0.008 >= tabNextTick) {
        autoAction();
        // Skip missed beats rather than bunching turns after a background tab.
        tabNextTick = (Math.floor(now / HELD_TAB_INTERVAL_SECONDS) + 1) * HELD_TAB_INTERVAL_SECONDS;
    }
}

// Deterministic, pre-rendered four-frame low-poly organism sprites.
// 2 enemy types × 6 variants × 4 frames: generated once, no per-frame paths.
const creatureSprites = new Map();
function creatureRandom(seed) {
    let n = seed | 0;
    return () => {
        n = (Math.imul(n ^ (n >>> 15), 2246822519) + 3266489917) | 0;
        return ((n >>> 0) / 4294967296);
    };
}
function buildCreatureSprites() {
    // Six stable variations per type, four cached poses per organism.
    // All geometry is generated once, never during animation frames.
    for (const type of ["SecBotA", "GoblinArcher"]) {
        for (let variant = 0; variant < 6; variant++) {
            const random = creatureRandom(719 + variant * 103 + (type === "GoblinArcher" ? 900 : 0));
            const lobes = Array.from({ length: 11 }, (_, i) => ({
                radius: 12.8 + random() * 3.2,
                phase: random() * Math.PI * 2,
                wave: 0.9 + random() * 1.4
            }));
            const tendrils = Array.from({ length: 5 }, (_, i) => ({
                angle: i * Math.PI * 2 / 5 + random() * 0.4,
                phase: random() * Math.PI * 2,
                reach: 15 + random() * 3
            }));
            const frames = [];
            for (let frame = 0; frame < 4; frame++) {
                const sprite = document.createElement("canvas");
                sprite.width = sprite.height = 48;
                const g = sprite.getContext("2d");
                const phase = frame * Math.PI / 2;
                g.translate(24, 24);
                // Subtle organic vibrations underneath the rounded silhouette.
                for (const t of tendrils) {
                    const a = t.angle;
                    const drift = Math.sin(phase + t.phase) * 2.2;
                    g.beginPath();
                    g.moveTo(Math.cos(a) * 9, Math.sin(a) * 9);
                    g.quadraticCurveTo(Math.cos(a) * 15 - Math.sin(a) * drift,
                        Math.sin(a) * 15 + Math.cos(a) * drift,
                        Math.cos(a) * t.reach - Math.sin(a) * drift,
                        Math.sin(a) * t.reach + Math.cos(a) * drift);
                    g.lineWidth = 2.2;
                    g.strokeStyle = "rgba(63,7,17,0.85)";
                    g.stroke();
                }
                const points = lobes.map((l, i) => {
                    const a = i * Math.PI * 2 / lobes.length;
                    const r = l.radius + Math.sin(phase + l.phase) * l.wave;
                    return [Math.cos(a) * r, Math.sin(a) * r];
                });
                // Midpoint quadratic splines create a dark, round membrane.
                g.beginPath();
                const last = points[points.length - 1], first = points[0];
                g.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);
                for (let i = 0; i < points.length; i++) {
                    const a = points[i], b = points[(i + 1) % points.length];
                    g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
                }
                g.closePath();
                g.fillStyle = type === "GoblinArcher" ? "#6e1724" : "#490c18";
                g.fill();
                g.lineWidth = 1.6;
                g.strokeStyle = "#1a0409";
                g.stroke();
                // Uneven inner membrane and two dim sensory points.
                g.beginPath();
                g.ellipse(-3 + Math.sin(phase) * 0.8, -4, 7.2, 5.6, -0.45, 0, Math.PI * 2);
                g.fillStyle = "rgba(150,32,47,0.33)";
                g.fill();
                g.fillStyle = "rgba(238,75,84,0.62)";
                g.beginPath(); g.arc(-4, -1, 1.25, 0, Math.PI * 2);
                g.arc(4, 1, 1.1, 0, Math.PI * 2); g.fill();
                frames.push(sprite);
            }
            creatureSprites.set(type + ":" + variant, frames);
        }
    }
}

// ============================================================
// OPUS — INPUT RHYTHM COMBO (75 BPM / 200 MS SIXTEENTH GRID)
// ============================================================
const COMBO_STEP_SECONDS = 0.2;
const COMBO_TOLERANCE_SECONDS = 0.065; // ±65 ms: forgiving but still rhythmic
const frissonSound = new Audio("resources/Frisson.ogg");
frissonSound.preload = "auto";
frissonSound.volume = 0.65;
let combo = 0;
let comboLastSlot = -1;
let comboFadeTimer = null;
const comboHUD = document.createElement("div");
comboHUD.id = "opus-combo";
comboHUD.setAttribute("aria-live", "off");
comboHUD.style.cssText = "position:fixed;left:50%;top:79%;transform:translate(-50%,-50%);z-index:15;pointer-events:none;font-family:'Press Start 2P', monospace;font-size:clamp(15px,2.4vw,26px);font-weight:900;letter-spacing:3px;text-align:center;color:white;text-shadow:0 0 9px #fff8;opacity:0;transition:opacity 150ms;white-space:nowrap";
document.body.appendChild(comboHUD);
const comboStyle = document.createElement("style");
comboStyle.textContent = `
@keyframes opusComboSoft { 0%,100%{color:#f3f3ff;text-shadow:0 0 8px #8bbaff} 50%{color:#b7ffe5;text-shadow:0 0 15px #e5baff} }
@keyframes opusComboPulse { 0%,100%{filter:brightness(1);transform:translate(-50%,-50%) scale(1)} 50%{filter:brightness(1.6);transform:translate(-50%,-50%) scale(1.12)} }
@keyframes opusComboRainbow { from{filter:hue-rotate(0deg)} to{filter:hue-rotate(360deg)} }
@keyframes opusComboFall { to{transform:translate(var(--dx),75px) rotate(var(--rot));opacity:0} }
#opus-combo.soft {animation:opusComboSoft 1.6s infinite}
#opus-combo.pulse {animation:opusComboSoft 1.6s infinite,opusComboPulse .8s infinite}
#opus-combo.rainbow {color:#ff657c;text-shadow:0 0 15px currentColor;animation:opusComboRainbow 1.6s linear infinite,opusComboPulse .8s infinite}
#opus-combo.frisson {color:#fff;text-shadow:0 0 10px #fff,0 0 24px #f4aaff,0 0 38px #9df;animation:opusComboRainbow .8s linear infinite,opusComboPulse .4s infinite}
#opus-combo .fragment {display:inline-block;animation:opusComboFall 650ms cubic-bezier(.25,.5,.5,1) forwards}
`;
document.head.appendChild(comboStyle);
function resetCombo() {
    combo = 0;
    comboLastSlot = -1;
    clearTimeout(comboFadeTimer);
    comboHUD.className = "";
    comboHUD.textContent = "";
    comboHUD.style.opacity = "0";
    frissonSound.pause();
    frissonSound.currentTime = 0;
}
function breakCombo() {
    if (combo === 0) return;
    const label = comboHUD.textContent;
    combo = 0;
    comboLastSlot = -1;
    comboHUD.className = "";
    comboHUD.textContent = "";
    for (let i = 0; i < label.length; i++) {
        const letter = document.createElement("span");
        letter.className = "fragment";
        letter.textContent = label[i] === " " ? "\u00a0" : label[i];
        letter.style.setProperty("--dx", `${(i - label.length / 2) * 9}px`);
        letter.style.setProperty("--rot", `${(i % 2 ? 1 : -1) * (25 + i * 5)}deg`);
        comboHUD.appendChild(letter);
    }
    clearTimeout(comboFadeTimer);
    comboFadeTimer = setTimeout(() => { if (combo === 0) comboHUD.style.opacity = "0"; }, 650);
}
function registerRhythmInput() {
    // The soundtrack's clock is authoritative. One award per sixteenth slot.
    const seconds = getRhythmSeconds();
    const slot = Math.round(seconds / COMBO_STEP_SECONDS);
    const error = Math.abs(seconds - slot * COMBO_STEP_SECONDS);
    if (error > COMBO_TOLERANCE_SECONDS || slot === comboLastSlot) {
        breakCombo();
        return;
    }
    comboLastSlot = slot;
    combo++;
    clearTimeout(comboFadeTimer);
    comboHUD.style.opacity = "1";
    comboHUD.textContent = `${combo} RHYTHM`;
    comboHUD.className = combo > 64 ? "frisson" : combo > 32 ? "rainbow" :
        combo > 15 ? "pulse" : combo > 7 ? "soft" : "";
    if (combo === 65) {
        frissonSound.currentTime = 0;
        frissonSound.play().catch(() => {});
    }
}

// ============================================================
// 3. UTILITIES
// ============================================================

function randomInt(max) {
    return Math.floor(Math.random() * max);
}

function inBounds(x, y) {
    return (
        x >= 0 &&
        y >= 0 &&
        x < MAP_WIDTH &&
        y < MAP_HEIGHT
    );
}

function isWalkable(x, y) {
    return inBounds(x, y) && map[y][x] === 1;
}

function getEnemyAt(x, y) {
    return enemies.find(enemy =>
        enemy.x === x && enemy.y === y
    );
}

function createGrid(defaultValue) {
    return Array.from(
        { length: MAP_HEIGHT },
        () => Array(MAP_WIDTH).fill(defaultValue)
    );
}

function tileKey(x, y) {
    return `${x},${y}`;
}

function isOnStairs() {
    return (
        player.x === stairs.x &&
        player.y === stairs.y
    );
}

// ============================================================
// 4. EVENT LOG
// ============================================================

function addChatMessage(text, type = "normal") {
    const entry = document.createElement("div");

    entry.className = `chat-entry ${type} latest`;
    entry.textContent = text;

    for (const previous of chatLog.children) {
        previous.classList.remove("latest");
    }

    chatLog.appendChild(entry);

    while (chatLog.children.length > 6) {
        chatLog.firstElementChild.remove();
    }
}

// ============================================================
// 5. FLOATING ENTITY POPUPS
// ============================================================

// Popups are positioned in screen coordinates.
// They appear above the interacted enemy.

function showEntityPopup(tileX, tileY, text, type = "normal") {
    const screen = worldToScreen(tileX, tileY);

    const popup = document.createElement("div");

    popup.className = `entity-popup ${type}`;
    popup.textContent = text;

    popup.style.left =
        `${screen.x + TILE_SIZE / 2}px`;

    popup.style.top =
        `${screen.y - 8}px`;

    popupLayer.appendChild(popup);

    // Remove the element after its animation completes.
    popup.addEventListener("animationend", () => {
        popup.remove();
    }, { once: true });
}

// ============================================================
// 6. PLAYER
// ============================================================

function createPlayer(x, y) {
    return {
        x,
        y,

        hp: 20,
        maxHp: 20,
        attack: 3,

        level: 1,
        xp: 0,
        xpRequired: 5,

        corpses: 0
    };
}

// ============================================================
// 7. ENEMY CLASSES
// ============================================================

class Enemy {
    constructor(x, y, options = {}) {
        this.x = x;
        this.y = y;

        this.name = options.name ?? "Enemy";
        this.hp = options.hp ?? 5;
        this.maxHp = this.hp;

        this.xpReward = options.xpReward ?? 1;
        this.color = options.color ?? "#ff2020";
        this.visualVariant = Math.floor(Math.random() * 6);
    }

    takeDamage(amount) {
        this.hp = Math.max(0, this.hp - amount);
        return this.hp <= 0;
    }
}

class SecBotA extends Enemy {
    constructor(x, y, currentBunker) {
        super(x, y, {
            name: "SecBot A",
            hp: 4 + currentBunker * 2,
            xpReward: 3,
            color: COLORS.marauder
        });
    }
}

class GoblinArcher extends Enemy {
    constructor(x, y, currentBunker) {
        super(x, y, {
            name: "Goblin Archer",
            hp: 3 + currentBunker,
            xpReward: 4,
            color: COLORS.archer
        });
    }
}

// ============================================================
// 8. DUNGEON GENERATION
// ============================================================

function generateDungeon() {
    stopAutoExplore(false);

    map = createGrid(0);
    explored = createGrid(false);
    visible = createGrid(false);

    lightPolygon = [];
    visibilityHistory = new Path2D();
    resetImpactDecals();

    rooms = [];
    enemies = [];

    for (
        let attempt = 0;
        attempt < 200 && rooms.length < 16;
        attempt++
    ) {
        const width = 5 + randomInt(6);
        const height = 5 + randomInt(5);

        const x = 1 + randomInt(MAP_WIDTH - width - 2);
        const y = 1 + randomInt(MAP_HEIGHT - height - 2);

        const room = {
            x,
            y,
            width,
            height,
            centerX: x + Math.floor(width / 2),
            centerY: y + Math.floor(height / 2)
        };

        const overlaps = rooms.some(existing => (
            x <= existing.x + existing.width &&
            x + width >= existing.x - 1 &&
            y <= existing.y + existing.height &&
            y + height >= existing.y - 1
        ));

        if (overlaps) {
            continue;
        }

        for (let row = y; row < y + height; row++) {
            for (let col = x; col < x + width; col++) {
                map[row][col] = 1;
            }
        }

        if (rooms.length > 0) {
            const previous = rooms[rooms.length - 1];

            carveCorridor(
                previous.centerX,
                previous.centerY,
                room.centerX,
                room.centerY
            );
        }

        rooms.push(room);
    }

    if (rooms.length < 2) {
        generateDungeon();
        return;
    }

    const start = rooms[0];

    if (player === null) {
        player = createPlayer(start.centerX, start.centerY);
    } else {
        player.x = start.centerX;
        player.y = start.centerY;

        player.hp = Math.min(
            player.maxHp,
            player.hp + 5
        );
    }

    visualEffects = [];
    playerMovement = null;

    if (player) {
        visualPlayer.x = player.x;
        visualPlayer.y = player.y;
    }

    const finalRoom = rooms[rooms.length - 1];

    stairs = {
        x: finalRoom.centerX,
        y: finalRoom.centerY
    };

    spawnEnemies();
    rebuildConcreteCache();
    updateVisibility();

    addChatMessage(`BUNKER ${bunker} — Explore the unknown.`);

    render();
}

function carveCorridor(startX, startY, endX, endY) {
    let x = startX;
    let y = startY;

    while (x !== endX) {
        map[y][x] = 1;
        x += Math.sign(endX - x);
    }

    while (y !== endY) {
        map[y][x] = 1;
        y += Math.sign(endY - y);
    }

    map[y][x] = 1;
}

// ============================================================
// 9. ENEMY SPAWNING
// ============================================================

function spawnEnemies() {
    for (let i = 1; i < rooms.length; i++) {
        const room = rooms[i];
        const enemyCount = 2 + randomInt(3);

        for (let j = 0; j < enemyCount; j++) {
            const x = room.x + randomInt(room.width);
            const y = room.y + randomInt(room.height);

            if (
                getEnemyAt(x, y) ||
                (x === stairs.x && y === stairs.y)
            ) {
                continue;
            }

            // 5:1 expected Marauder-to-Archer spawn ratio.
            const enemy = randomInt(6) === 0
                ? new GoblinArcher(x, y, bunker)
                : new SecBotA(x, y, bunker);

            enemies.push(enemy);
        }
    }
}

// ============================================================
// 10. FOG OF WAR — LINE OF SIGHT
// ============================================================


/*
 * OPUS — SHARED GRID RAYCAST
 *
 * Casts from the center of a source tile in any direction.
 * The first wall blocks the ray. At exact diagonal corners,
 * both neighboring tiles are checked to prevent seeing
 * or shooting through touching wall corners.
 *
 * Coordinates are in tile units, not pixels.
 */

function castGridRay(startX, startY, dx, dy, maxDistance = 12) {
    const length = Math.hypot(dx, dy);

    if (length < 0.000001) {
        return {
            x: startX,
            y: startY,
            blocked: false,
            tileX: Math.floor(startX),
            tileY: Math.floor(startY),
            distance: 0
        };
    }

    dx /= length;
    dy /= length;

    let tileX = Math.floor(startX);
    let tileY = Math.floor(startY);

    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);

    const deltaX = stepX === 0 ? Infinity : Math.abs(1 / dx);
    const deltaY = stepY === 0 ? Infinity : Math.abs(1 / dy);

    let sideX = stepX > 0
        ? (tileX + 1 - startX) * deltaX
        : (startX - tileX) * deltaX;

    let sideY = stepY > 0
        ? (tileY + 1 - startY) * deltaY
        : (startY - tileY) * deltaY;

    if (stepX === 0) sideX = Infinity;
    if (stepY === 0) sideY = Infinity;

    function result(distance, blocked) {
        return {
            x: startX + dx * distance,
            y: startY + dy * distance,
            blocked,
            tileX,
            tileY,
            distance
        };
    }

    while (true) {
        const nextDistance = Math.min(sideX, sideY);

        if (nextDistance > maxDistance) {
            return result(maxDistance, false);
        }

        // Exact corner crossing: block if either adjoining
        // tile is a wall, not just the diagonal destination.
        if (Math.abs(sideX - sideY) < 0.0000001) {
            const wallX = !isWalkable(tileX + stepX, tileY);
            const wallY = !isWalkable(tileX, tileY + stepY);

            if (wallX || wallY) {
                return result(nextDistance, true);
            }

            tileX += stepX;
            tileY += stepY;
            sideX += deltaX;
            sideY += deltaY;
        } else if (sideX < sideY) {
            tileX += stepX;
            sideX += deltaX;
        } else {
            tileY += stepY;
            sideY += deltaY;
        }

        if (!isWalkable(tileX, tileY)) {
            return result(nextDistance, true);
        }
    }
}


// ============================================================
// VISIBILITY POLYGON GENERATION
// ============================================================

function buildLightPolygon() {
    if (!player) return [];

    const originX = player.x + 0.5;
    const originY = player.y + 0.5;
    const radius = VISION_RADIUS;

    const angles = [];

    // Uniform angular sampling keeps the circular edge smooth.
    for (let i = 0; i < LIGHT_RAY_COUNT; i++) {
        angles.push(
            (i / LIGHT_RAY_COUNT) * Math.PI * 2
        );
    }

    // Cast additional rays around the corners of nearby walls.
    // These establish precise shadow boundaries.
    const minX = Math.max(0, Math.floor(originX - radius - 1));
    const maxX = Math.min(MAP_WIDTH, Math.ceil(originX + radius + 1));
    const minY = Math.max(0, Math.floor(originY - radius - 1));
    const maxY = Math.min(MAP_HEIGHT, Math.ceil(originY + radius + 1));

    const corners = new Set();

    for (let y = minY; y < maxY; y++) {
        for (let x = minX; x < maxX; x++) {
            if (map[y][x] !== 0) continue;

            // Only corners adjoining floor are relevant
            // to light/shadow boundaries.
            const candidates = [
                [x, y],
                [x + 1, y],
                [x, y + 1],
                [x + 1, y + 1]
            ];

            for (const [cx, cy] of candidates) {
                // Ignore corners embedded entirely within solid walls.
                // Only actual floor/wall boundaries can cast a shadow.
                const neighbors = [
                    [cx - 1, cy - 1], [cx, cy - 1],
                    [cx - 1, cy], [cx, cy]
                ];
                if (!neighbors.some(([nx, ny]) => isWalkable(nx, ny))) continue;
                const key = `${cx},${cy}`;

                if (corners.has(key)) continue;
                corners.add(key);

                const dx = cx - originX;
                const dy = cy - originY;

                if (Math.hypot(dx, dy) > radius + 0.1) {
                    continue;
                }

                const angle = Math.atan2(dy, dx);

                angles.push(
                    angle - LIGHT_CORNER_EPSILON,
                    angle,
                    angle + LIGHT_CORNER_EPSILON
                );
            }
        }
    }

    // Keep all rays in a single angular interval. This avoids
    // wrapping the polygon across the -PI / PI seam.
    for (let i = 0; i < angles.length; i++) {
        angles[i] = ((angles[i] % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    }
    angles.sort((a, b) => a - b);

    const points = [];

    for (const angle of angles) {
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);

        const hit = castGridRay(
            originX,
            originY,
            dx,
            dy,
            radius
        );

        points.push({
            angle,
            x: hit.x * TILE_SIZE,
            y: hit.y * TILE_SIZE
        });
    }

    return points;
}

function appendLightToHistory() {
    if (lightPolygon.length < 3) return;

    visibilityHistory.moveTo(
        lightPolygon[0].x,
        lightPolygon[0].y
    );

    for (let i = 1; i < lightPolygon.length; i++) {
        visibilityHistory.lineTo(
            lightPolygon[i].x,
            lightPolygon[i].y
        );
    }

    visibilityHistory.closePath();
}

function createLightPath() {
    const path = new Path2D();

    if (lightPolygon.length < 3) {
        return path;
    }

    path.moveTo(lightPolygon[0].x, lightPolygon[0].y);

    for (let i = 1; i < lightPolygon.length; i++) {
        path.lineTo(lightPolygon[i].x, lightPolygon[i].y);
    }

    path.closePath();

    return path;
}

// True only if a ray from the player's tile center
// can reach the target tile center without hitting a wall.
function hasLineOfSight(startX, startY, endX, endY) {
    if (!inBounds(endX, endY)) return false;

    if (startX === endX && startY === endY) {
        return true;
    }

    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.hypot(dx, dy);

    // Stop just before the target tile's center.
    const ray = castGridRay(
        startX + 0.5,
        startY + 0.5,
        dx,
        dy,
        Math.max(0, distance - 0.0001)
    );

    // Target walls are visible, but walls before them
    // block visibility.
    if (map[endY][endX] === 0) {
        const fullRay = castGridRay(
            startX + 0.5,
            startY + 0.5,
            dx,
            dy,
            distance
        );

        return fullRay.blocked &&
            fullRay.tileX === endX &&
            fullRay.tileY === endY;
    }

    return !ray.blocked;
}

function updateVisibility() {
    visible = createGrid(false);

    if (!player) return;

    const radiusSquared = VISION_RADIUS * VISION_RADIUS;

    for (
        let y = player.y - VISION_RADIUS;
        y <= player.y + VISION_RADIUS;
        y++
    ) {
        for (
            let x = player.x - VISION_RADIUS;
            x <= player.x + VISION_RADIUS;
            x++
        ) {
            if (!inBounds(x, y)) continue;

            const dx = x - player.x;
            const dy = y - player.y;

            if (dx * dx + dy * dy > radiusSquared) {
                continue;
            }

            if (hasLineOfSight(player.x, player.y, x, y)) {
                visible[y][x] = true;
                explored[y][x] = true;
            }
        }
    }

    // IMPORTANT: These must be INSIDE updateVisibility().
    // Recalculate the light whenever the player moves.
    lightPolygon = buildLightPolygon();

    // Preserve previously illuminated areas as dim map memory.
    appendLightToHistory();
    if (wallMaskBright.width) refreshNegativeSpaceVisibility();
}

// Enemy detection always uses CURRENT line of sight.
// Previously explored tiles do not grant targeting.
function canSeeEnemy(enemy) {
    if (!player || !enemy) return false;

    const distance = Math.hypot(
        enemy.x - player.x,
        enemy.y - player.y
    );

    return distance <= VISION_RADIUS &&
        hasLineOfSight(
            player.x,
            player.y,
            enemy.x,
            enemy.y
        );
}

// Check whether an enemy is currently visible.
function hasVisibleEnemy() {
    return enemies.some(enemy => canSeeEnemy(enemy));
}

// ============================================================
// 11. EXPERIENCE AND LEVELING
// ============================================================

function gainExperience(amount) {
    player.xp += amount;

    addChatMessage(`+${amount} XP`);

    while (player.xp >= player.xpRequired) {
        player.xp -= player.xpRequired;
        levelUp();
    }
}

function levelUp() {
    player.level++;
    player.xpRequired *= 2;

    player.maxHp += 2;
    player.hp = Math.min(player.maxHp, player.hp + 4);
    player.attack++;

    addChatMessage(
        `LEVEL UP! LEVEL ${player.level}`,
        "level-up"
    );
}

// ============================================================
// 12. PLAYER MOVEMENT AND COMBAT
// ============================================================

function movePlayer(dx, dy, automatic = false, fast = false) {
    if (gameOver) {
        return;
    }

    if (!automatic) {
        stopAutoExplore(false);
    }

    // Seraphim faces the direction of the most recent movement.
    // Automatic exploration does not change aiming direction.
    if (!automatic && (dx !== 0 || dy !== 0)) {
    facing.x = dx;
    facing.y = dy;
    }

    const targetX = player.x + dx;
    const targetY = player.y + dy;

    if (!isWalkable(targetX, targetY)) {
        return;
    }

    const enemy = getEnemyAt(targetX, targetY);

    if (enemy) {
        attackEnemy(enemy);
    } else {
        const oldX = player.x;
        const oldY = player.y;

        player.x = targetX;
        player.y = targetY;

        
        if (fast) {
            playerMovement = null;
            visualPlayer.x = player.x;
            visualPlayer.y = player.y;
        } else {
            beginPlayerMovement(
                oldX,
                oldY,
                player.x,
                player.y
            );
        }
        updateVisibility();

        if (isOnStairs()) {
            addChatMessage(
                "STAIRS FOUND — Press ENTER to descend."
            );
        }
    }

    processEnemyTurn();

    turn++;

    if (!fast) {
        render();
    }
}


function attackEnemy(enemy) {
    // Walking into an enemy performs a melee attack.
    damageEnemy(enemy, player.attack);
}

// ============================================================
// PROJECTILE SYSTEM
// ============================================================


// ============================================================
// INSTANT PROJECTILE COMBAT
// ============================================================

// The projectile's collision is calculated immediately.
// Its visual tracer is animated separately.
//
// This means firing never requires additional turns
// for the bullet to reach its target.


// ============================================================
// CONTINUOUS-DIRECTION HITSCAN
// ============================================================

// Traverses the dungeon grid along an arbitrary direction.
// Damage resolves immediately.
//
// The returned endpoint is used only for the visual tracer.

function traceShot(startX, startY, dx, dy, damage) {
    const length = Math.hypot(dx, dy);

    if (length < 0.000001) {
        return { x: startX, y: startY };
    }

    dx /= length;
    dy /= length;

    const MAX_RANGE = 12;
    const originX = startX + 0.5;
    const originY = startY + 0.5;

    // Find the first wall using the exact same raycast
    // used by the visibility system.
    const wallHit = castGridRay(
        originX,
        originY,
        dx,
        dy,
        MAX_RANGE
    );

    let nearestEnemy = null;
    let nearestHitDistance = wallHit.distance;

    // Ray versus enemy bounding boxes.
    // The closest enemy in front of the first wall wins.
    for (const enemy of enemies) {
        const minX = enemy.x + 0.16;
        const maxX = enemy.x + 0.84;
        const minY = enemy.y + 0.16;
        const maxY = enemy.y + 0.84;

        let entry = -Infinity;
        let exit = Infinity;

        if (Math.abs(dx) < 0.000001) {
            if (originX < minX || originX > maxX) {
                continue;
            }
        } else {
            const t1 = (minX - originX) / dx;
            const t2 = (maxX - originX) / dx;

            entry = Math.max(entry, Math.min(t1, t2));
            exit = Math.min(exit, Math.max(t1, t2));
        }

        if (Math.abs(dy) < 0.000001) {
            if (originY < minY || originY > maxY) {
                continue;
            }
        } else {
            const t1 = (minY - originY) / dy;
            const t2 = (maxY - originY) / dy;

            entry = Math.max(entry, Math.min(t1, t2));
            exit = Math.min(exit, Math.max(t1, t2));
        }

        const hitDistance = Math.max(0, entry);

        if (
            entry <= exit &&
            exit >= 0 &&
            hitDistance < nearestHitDistance &&
            hitDistance <= MAX_RANGE
        ) {
            nearestEnemy = enemy;
            nearestHitDistance = hitDistance;
        }
    }

    if (nearestEnemy) {
        const actualDamage =
            damage.precisionTarget === nearestEnemy
                ? damage.base * 2
                : damage.base;

        damageEnemy(nearestEnemy, actualDamage, { x: dx, y: dy });
        playSound("hit", 0.6);

        return {
            x: originX + dx * nearestHitDistance - 0.5,
            y: originY + dy * nearestHitDistance - 0.5
        };
    }

    // No enemy before the wall. End tracer at the wall.
    return {
        x: wallHit.x - 0.5,
        y: wallHit.y - 0.5
    };
}

// Create a visual-only bullet tracer.
// It never performs collision detection or damage.
function createBulletTracer(startX, startY, endX, endY) {
    const now = performance.now();

    visualEffects.push({
        type: "bullet",
        startX,
        startY,
        endX,
        endY,
        startTime: now,
        duration: BULLET_ANIMATION_DURATION
    });
}

// ============================================================
// AIMED WEAPON FIRE
// ============================================================

function fireWeapon(targetEnemy = null) {
    if (!gameStarted || gameOver) return;

    // Safety fallback for an already-empty magazine.
    if (equippedWeapon.ammo <= 0) {
        if (!autoReloadWeapon()) {
            return;
        }
    }

    stopAutoExplore(false);

    equippedWeapon.ammo--;
    playSound("fire", 0.38);

    const startX = player.x;
    const startY = player.y;

    let dx = aimDirection.x;
    let dy = aimDirection.y;

    // Snap the shot toward the selected enemy's center.
    if (targetEnemy) {
        dx = targetEnemy.x - player.x;
        dy = targetEnemy.y - player.y;
    }

    const directionLength = Math.hypot(dx, dy);

    if (directionLength > 0.0001) {
        dx /= directionLength;
        dy /= directionLength;
    }

    // Reaper's special ability:
    // Direct reticle hover doubles damage against that target.
    const reaperPrecision =
        selectedCharacter === "Reaper" &&
        targetEnemy !== null &&
        hoveredEnemy === targetEnemy;

    const damage = {
        base: equippedWeapon.damage,
        precisionTarget: reaperPrecision ? targetEnemy : null
    };

    const endpoint = traceShot(
        startX,
        startY,
        dx,
        dy,
        damage
    );

    createBulletTracer(
        startX,
        startY,
        endpoint.x,
        endpoint.y
    );

    if (selectedCharacter === "Reaper") {
        pulseReticle();

        if (reaperPrecision) {
            addChatMessage("REAPER — PRECISION SHOT!", "level-up");
        }
    }

    // Enemy movement resolves after the player's shot.
    processEnemyTurn();
    turn++;

    if (equippedWeapon.ammo === 0) {
        autoReloadWeapon();
    }

    updateWeaponHUD();
    render();
}


// ============================================================
// CONTEXT-SENSITIVE AUTO ACTION
// ============================================================

function autoAction() {
    if (!gameStarted || gameOver) return;

    const nearestEnemy = getNearestVisibleEnemy();

    // Priority 1: attack the nearest visible enemy.
    if (nearestEnemy) {
        fireWeapon(nearestEnemy);
        return;
    }

    // Priority 2: take exactly one exploration step.
    stopAutoExplore(false);

    autoExploreStep();
}

function damageEnemy(enemy, damage, direction = null) {
    const defeated = enemy.takeDamage(damage);

    // Persist a directional floor decal for every successful hit.
    const impact = direction || {
        x: enemy.x - player.x,
        y: enemy.y - player.y
    };
    stampImpactDecal(enemy.x, enemy.y, impact, defeated);
    visualEffects.push({
        type: "impact",
        x: enemy.x, y: enemy.y,
        startTime: performance.now(), duration: 145
    });

    showEntityPopup(
        enemy.x,
        enemy.y,
        `-${damage}`
    );

    addChatMessage(
        `${enemy.name} takes ${damage} damage.`
    );

    if (defeated) {
        const index = enemies.indexOf(enemy);

        if (index !== -1) {
            enemies.splice(index, 1);
        }

        player.corpses++;
        stampCorpse(enemy.x, enemy.y);

        addChatMessage(
            `${enemy.name} defeated!`,
            "kill"
        );

        gainExperience(enemy.xpReward);
    }
}

// Infinite reserve for the current prototype.

function autoReloadWeapon() {
    if (!gameStarted || gameOver || !equippedWeapon) {
        return false;
    }

    if (equippedWeapon.ammo > 0) {
        return false;
    }

    // No manual reload input is required.
    equippedWeapon.ammo = equippedWeapon.magazineSize;

    addChatMessage(
        `${equippedWeapon.name} — AUTO-RELOADING (1 TURN).`
    );

    // Reloading consumes a full game turn.
    processEnemyTurn();
    turn++;

    updateWeaponHUD();

    return true;
}


// ============================================================
// 13. PASSIVE ENEMY AI
// ============================================================

// Goblins pursue the player within six tiles.
// They do NOT attack or inflict damage.

function processEnemyTurn() {
    for (const enemy of enemies) {
        const distance =
            Math.abs(enemy.x - player.x) +
            Math.abs(enemy.y - player.y);

        if (distance <= 1 || distance > 6) {
            continue;
        }

        const directions = [
            [Math.sign(player.x - enemy.x), 0],
            [0, Math.sign(player.y - enemy.y)]
        ];

        if (randomInt(2) === 1) {
            directions.reverse();
        }

        for (const [dx, dy] of directions) {
            const nextX = enemy.x + dx;
            const nextY = enemy.y + dy;

            if (
                (dx !== 0 || dy !== 0) &&
                isWalkable(nextX, nextY) &&
                !getEnemyAt(nextX, nextY) &&
                !(nextX === player.x && nextY === player.y)
            ) {
                enemy.x = nextX;
                enemy.y = nextY;
                break;
            }
        }
    }
}

// ============================================================
// 14. AUTO-EXPLORE — PATHFINDING
// ============================================================

// Breadth-first search finds shortest paths on the grid.
//
// The algorithm only travels through previously explored,
// walkable tiles. It does not use hidden map information
// to navigate.
//
// Unknown tiles are discovered by walking toward the
// nearest reachable frontier.
//
// A frontier is an explored floor tile with at least
// one unexplored neighboring tile.

function findPath(startX, startY, goalTest) {
    const queue = [{ x: startX, y: startY }];
    const visited = new Set([tileKey(startX, startY)]);
    const parents = new Map();

    let index = 0;

    while (index < queue.length) {
        const current = queue[index++];

        if (goalTest(current.x, current.y)) {
            const path = [];
            let position = current;

            while (
                position.x !== startX ||
                position.y !== startY
            ) {
                path.unshift(position);

                position = parents.get(
                    tileKey(position.x, position.y)
                );
            }

            return path;
        }

        for (const [dx, dy] of DIRECTIONS) {
            const nextX = current.x + dx;
            const nextY = current.y + dy;
            const key = tileKey(nextX, nextY);

            if (
                !isWalkable(nextX, nextY) ||
                !explored[nextY][nextX] ||
                visited.has(key) ||
                getEnemyAt(nextX, nextY)
            ) {
                continue;
            }

            visited.add(key);

            parents.set(key, current);

            queue.push({
                x: nextX,
                y: nextY
            });
        }
    }

    return null;
}

// A frontier is a discovered floor tile adjacent to
// at least one tile the player has never seen.

function isFrontier(x, y) {
    if (!isWalkable(x, y) || !explored[y][x]) {
        return false;
    }

    return DIRECTIONS.some(([dx, dy]) => {
        const nextX = x + dx;
        const nextY = y + dy;

        return (
            inBounds(nextX, nextY) &&
            !explored[nextY][nextX]
        );
    });
}

// Find the shortest route to an exploration frontier.
// If no reachable frontier remains, head to the stairs.

function findAutoExplorePath() {
    const frontierPath = findPath(
        player.x,
        player.y,
        isFrontier
    );

    if (frontierPath !== null) {
        return frontierPath;
    }

    // All reachable frontiers have been explored.
    // Path toward the descending staircase.
    return findPath(
        player.x,
        player.y,
        (x, y) => x === stairs.x && y === stairs.y
    );
}

function stopAutoExplore(showNotification = true) {
    const wasExploring = autoExploring;

    autoExploring = false;

    if (autoExploreTimer !== null) {
        clearInterval(autoExploreTimer);
        autoExploreTimer = null;
    }

    if (wasExploring && showNotification) {
        addChatMessage("AUTO-EXPLORE STOPPED.");
    }
}

// Called repeatedly while auto-explore is active.
function autoExploreStep() {
    if (gameOver) {
        stopAutoExplore(false);
        return;
    }

    // Stop as soon as an enemy enters line of sight.
    if (hasVisibleEnemy()) {
        stopAutoExplore(false);
        addChatMessage("ENEMY SPOTTED — AUTO-EXPLORE STOPPED.");
        return;
    }

    // Once on the stairs, wait for the player to descend.
    if (isOnStairs()) {
        stopAutoExplore(false);
        addChatMessage("BUNKER EXPLORED — STAIRS REACHED.");
        return;
    }

    const path = findAutoExplorePath();

    if (path === null) {
        stopAutoExplore(false);
        addChatMessage("NO REACHABLE EXPLORATION TARGET.");
        return;
    }

    // Empty path means we're already at the frontier.
    // The visibility radius normally prevents this,
    // but guard against a stationary loop.
    if (path.length === 0) {
        stopAutoExplore(false);
        addChatMessage("NO FURTHER PATH AVAILABLE.");
        return;
    }

    const next = path[0];

    const dx = next.x - player.x;
    const dy = next.y - player.y;

    // If an enemy moved onto our planned tile,
    // stop instead of automatically attacking.
    if (getEnemyAt(next.x, next.y)) {
        stopAutoExplore(false);
        addChatMessage("PATH BLOCKED BY ENEMY.");
        return;
    }

    movePlayer(dx, dy, true, true);
    if (!exploreTickPlayed && turn - autoExploreStartTurn > 5) {
        exploreTickPlayed = true;
        playSound("explore", 0.5);
    }

    // Enemy movement can reveal new threats.
    // Re-check immediately after the turn.
    if (hasVisibleEnemy()) {
        stopAutoExplore(false);
        addChatMessage("ENEMY SPOTTED — AUTO-EXPLORE STOPPED.");
    }
}


function toggleAutoExplore() {
    if (autoExploring) {
        stopAutoExplore();
        return;
    }

    if (gameOver) return;

    if (hasVisibleEnemy()) {
        addChatMessage(
            "CANNOT AUTO-EXPLORE: ENEMY VISIBLE."
        );
        return;
    }

    autoExploring = true;
    autoExploreStartTurn = turn;
    exploreTickPlayed = false;
    playerMovement = null;

    addChatMessage("RAPID EXPLORATION ENGAGED.");
}


// ============================================================
// 15. FULL-SCREEN CANVAS
// ============================================================

function resizeCanvas() {
    const pixelRatio = window.devicePixelRatio || 1;

    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);

    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(
        pixelRatio, 0,
        0, pixelRatio,
        0, 0
    );

    ctx.imageSmoothingEnabled = false;

    render();
}

window.addEventListener("resize", resizeCanvas);

// ============================================================
// 16. PLAYER-CENTERED CAMERA
// ============================================================

function updateCamera() {
    const playerWorldX =
        visualPlayer.x * TILE_SIZE + TILE_SIZE / 2;

    const playerWorldY =
        visualPlayer.y * TILE_SIZE + TILE_SIZE / 2;

    camera.x = playerWorldX - window.innerWidth / 2;
    camera.y = playerWorldY - window.innerHeight / 2;
}


function worldToScreen(tileX, tileY) {
    return {
        x: tileX * TILE_SIZE - camera.x,
        y: tileY * TILE_SIZE - camera.y
    };
}


// ============================================================
// SMOOTH MOVEMENT INTERPOLATION
// ============================================================

function easeInOut(t) {
    return t * t * (3 - 2 * t);
}

function beginPlayerMovement(fromX, fromY, toX, toY) {
    // Start from the current visual position, so repeated
    // movement inputs don't produce snapping.
    playerMovement = {
        fromX: visualPlayer.x,
        fromY: visualPlayer.y,
        toX,
        toY,
        startTime: performance.now(),
        duration: MOVE_ANIMATION_DURATION
    };
}

function updatePlayerMovement(timestamp) {
    if (!playerMovement) return;

    const elapsed =
        timestamp - playerMovement.startTime;

    const progress = Math.min(
        1,
        elapsed / playerMovement.duration
    );

    const eased = easeInOut(progress);

    visualPlayer.x =
        playerMovement.fromX +
        (playerMovement.toX - playerMovement.fromX) * eased;

    visualPlayer.y =
        playerMovement.fromY +
        (playerMovement.toY - playerMovement.fromY) * eased;

    if (progress >= 1) {
        visualPlayer.x = playerMovement.toX;
        visualPlayer.y = playerMovement.toY;

        playerMovement = null;
    }
}


// ============================================================
// 17. FOG-OF-WAR RENDERING
// ============================================================


// ============================================================
// OPUS v0.7 — PROCEDURAL CONCRETE
// ============================================================

// Stable pseudo-random value for a given tile and seed.
function concreteNoise(x, y, seed = 0) {
    let n = Math.imul(x + 37, 374761393);
    n = (n + Math.imul(y + 71, 668265263)) | 0;
    n = (n + Math.imul(seed + 1, 1442695041)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}


function smoothConcreteNoise(worldX, worldY, scale, seed = 0) {
    const gx = worldX / scale;
    const gy = worldY / scale;

    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);

    const fx = gx - x0;
    const fy = gy - y0;

    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    const a = concreteNoise(x0, y0, seed);
    const b = concreteNoise(x0 + 1, y0, seed);
    const c = concreteNoise(x0, y0 + 1, seed);
    const d = concreteNoise(x0 + 1, y0 + 1, seed);

    const top = a + (b - a) * sx;
    const bottom = c + (d - c) * sx;

    return top + (bottom - top) * sy;
}


// Draw one tile in WORLD coordinates.
// This is shared by bright and remembered map rendering.
function drawConcreteTile(targetCtx, x, y, bright) {
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    const isFloor = map[y][x] === 1;

    const base = isFloor
        ? (bright ? 172 : 49)
        : (bright ? 82 : 25);

    // Floor tiles retain slight individual variation.
    // Walls use continuous, world-space noise.
    const variation = isFloor
        ? Math.floor(concreteNoise(x, y, 1) * 17) - 8
        : 0;

    const shade = Math.max(
        0,
        Math.min(255, base + variation)
    );

    targetCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
    targetCtx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

    if (!isFloor) {
        // Continuous concrete clouding across tile boundaries.
        // No visible per-tile seams.
        const patchSize = 4;

        for (let oy = 0; oy < TILE_SIZE; oy += patchSize) {
            for (let ox = 0; ox < TILE_SIZE; ox += patchSize) {
                const wx = px + ox;
                const wy = py + oy;

                const coarse = smoothConcreteNoise(
                    wx, wy, 110, 21
                );

                const fine = smoothConcreteNoise(
                    wx, wy, 19, 22
                );

                const value = Math.max(
                    0,
                    Math.min(
                        255,
                        Math.round(
                            shade +
                            (coarse - 0.5) * 30 +
                            (fine - 0.5) * 9
                        )
                    )
                );

                targetCtx.fillStyle =
                    `rgb(${value},${value},${value})`;

                targetCtx.fillRect(
                    wx,
                    wy,
                    patchSize,
                    patchSize
                );
            }
        }
    }   

    if (isFloor) {
        // Recessed tile joints.
        targetCtx.strokeStyle = bright
            ? "rgba(43,47,44,0.65)"
            : "rgba(0,0,0,0.35)";

        targetCtx.lineWidth = 1;
        targetCtx.strokeRect(
            px + 0.5,
            py + 0.5,
            TILE_SIZE - 1,
            TILE_SIZE - 1
        );

        // Subtle edge highlight.
        targetCtx.fillStyle = bright
            ? "rgba(235,238,231,0.12)"
            : "rgba(180,185,180,0.04)";

        targetCtx.fillRect(px + 2, py + 2, TILE_SIZE - 4, 1);
    }

    // Pitting and aggregate.
    for (let i = 0; i < 5; i++) {
        const nx = concreteNoise(x, y, i * 3 + 10);
        const ny = concreteNoise(x, y, i * 3 + 11);
        const size = 1 + Math.floor(
            concreteNoise(x, y, i * 3 + 12) * 3
        );

        targetCtx.fillStyle = bright
            ? "rgba(25,30,27,0.17)"
            : "rgba(0,0,0,0.1)";

        targetCtx.fillRect(
            px + 3 + Math.floor(nx * (TILE_SIZE - 7)),
            py + 3 + Math.floor(ny * (TILE_SIZE - 7)),
            size,
            size
        );
    }

    // Occasional weathering stains.
    if (isFloor && concreteNoise(x, y, 50) > 0.76) {
        targetCtx.fillStyle = bright
            ? "rgba(65,72,63,0.16)"
            : "rgba(12,16,13,0.12)";

        targetCtx.beginPath();
        targetCtx.ellipse(
            px + TILE_SIZE * concreteNoise(x, y, 51),
            py + TILE_SIZE * concreteNoise(x, y, 52),
            5 + 6 * concreteNoise(x, y, 53),
            3 + 4 * concreteNoise(x, y, 54),
            concreteNoise(x, y, 55) * Math.PI,
            0,
            Math.PI * 2
        );
        targetCtx.fill();
    }
}


// ============================================================
// OPUS v0.7 — LIGHTING LAYERS
// ============================================================

const lightingSurface = document.createElement("canvas");
const lightingMask = document.createElement("canvas");

const lightingCtx = lightingSurface.getContext("2d");
const maskCtx = lightingMask.getContext("2d");

function prepareLightingSurfaces() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (
        lightingSurface.width !== width ||
        lightingSurface.height !== height
    ) {
        lightingSurface.width = width;
        lightingSurface.height = height;
        lightingMask.width = width;
        lightingMask.height = height;
    }

    lightingCtx.setTransform(1, 0, 0, 1, 0, 0);
    maskCtx.setTransform(1, 0, 0, 1, 0, 0);

    lightingCtx.globalCompositeOperation = "source-over";
    maskCtx.globalCompositeOperation = "source-over";

    lightingCtx.globalAlpha = 1;
    maskCtx.globalAlpha = 1;
}

const concreteCache = {
    bright: document.createElement("canvas"),
    dim: document.createElement("canvas")
};

// OPUS — inverted architecture: white marble walkable space,
// chromatic wireframe occupying the solid NEGATIVE space.
// Both are cached per bunker; no per-frame geometry construction.
const marbleCanvas = document.createElement("canvas");
const wallWireCanvas = document.createElement("canvas");
const wallMaskBright = document.createElement("canvas");
const wallMaskDim = document.createElement("canvas");
function rebuildConcreteCache() {
    const w = MAP_WIDTH * TILE_SIZE, h = MAP_HEIGHT * TILE_SIZE;
    marbleCanvas.width = wallWireCanvas.width = wallMaskBright.width = wallMaskDim.width = w;
    marbleCanvas.height = wallWireCanvas.height = wallMaskBright.height = wallMaskDim.height = h;
    const mg = marbleCanvas.getContext("2d");
    const wg = wallWireCanvas.getContext("2d");
    const brightMask = wallMaskBright.getContext("2d");
    const dimMask = wallMaskDim.getContext("2d");
    // Procedural marble is continuous in world coordinates: no tile seams.
    // Quarter-resolution image, upscaled smoothly, keeps memory and generation low.
    const scale = 2, sw = Math.ceil(w / scale), sh = Math.ceil(h / scale);
    const marbleTex = document.createElement("canvas");
    marbleTex.width = sw; marbleTex.height = sh;
    const mt = marbleTex.getContext("2d");
    const img = mt.createImageData(sw, sh);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const wx = x * scale, wy = y * scale;
        // Multi-scale, domain-warped ivory marble with rare gold and
        // charcoal hairline veins. All coordinates are world-space.
        const warpX=24*Math.sin(wx*.006+Math.sin(wy*.009)*2.1)
                   +10*Math.cos(wy*.018-wx*.011);
        const warpY=20*Math.sin(wy*.007+Math.cos(wx*.012)*1.8)
                   +9*Math.sin(wx*.023+wy*.015);
        // Three distinct distortions: folding, turbulent curl, and micro-fractures.
        const fold=16*Math.sin((wx+wy*.46)*.010+2.5*Math.sin(wy*.006));
        const curl=11*Math.sin(wy*.034+Math.sin(wx*.012)*3.1);
        const fracture=3*Math.sin(wx*.093-wy*.117+Math.sin(wy*.038)*4.);
        const u=wx+warpX+fold+fracture,v=wy+warpY+curl;
        const broad=Math.sin(u*.016+v*.007+Math.sin(v*.006)*2.6);
        const filament=Math.sin(u*.046-v*.019+Math.sin(u*.014+v*.018)*4.2);
        const detail=Math.sin(u*.125+v*.071+Math.sin(v*.041)*2.1);
        const fine=Math.sin(u*.21+v*.15+Math.sin(u*.052-v*.028)*3.5);
        const thin=Math.pow(Math.max(0,filament),42);
        const hair=Math.pow(Math.max(0,detail),66);
        const micro=Math.pow(Math.max(0,fine),80);
        const cloud=5*broad+4*Math.sin(u*.008-v*.012)+2*Math.sin(u*.003+v*.009);
        const shade=Math.max(0,Math.min(255,Math.round(245+cloud-31*thin-16*hair-7*micro)));
        const gold=Math.pow(Math.max(0,Math.sin(u*.029+v*.014+warpX*.04)),52);
        const i=(y*sw+x)*4;
        img.data[i]=Math.min(255,shade+7+gold*5);
        img.data[i+1]=Math.min(255,shade+1-gold*4);
        img.data[i+2]=Math.max(0,shade-18-gold*10);
        img.data[i + 3] = 255;
    }
    mt.putImageData(img, 0, 0);
    mg.imageSmoothingEnabled = true;
    // Build an explicit floor-only clip, avoiding destination-in compositing.
    const floorClip = new Path2D();
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
        if (map[y][x] === 1) floorClip.rect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
    mg.save();
    mg.clip(floorClip);
    mg.drawImage(marbleTex, 0, 0, w, h);
    mg.restore();
    // Orthogonal lattice only: no diagonal lines anywhere in the void.
    wg.strokeStyle = "#ffffff";
    wg.lineWidth = 0.85;
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
        if (isWalkable(x, y)) continue;
        const px = x * TILE_SIZE, py = y * TILE_SIZE;
        wg.globalAlpha = 0.58;
        wg.strokeRect(px + .5, py + .5, TILE_SIZE, TILE_SIZE);
        wg.globalAlpha = 0.22;
        wg.beginPath();
        wg.moveTo(px + TILE_SIZE / 2, py);
        wg.lineTo(px + TILE_SIZE / 2, py + TILE_SIZE);
        wg.moveTo(px, py + TILE_SIZE / 2);
        wg.lineTo(px + TILE_SIZE, py + TILE_SIZE / 2);
        wg.stroke();
    }
    wg.globalAlpha = 1;
}

function wireframeColor(bright) {
    const t = getRhythmSeconds();
    // Slowly wandering RGB with an independent phase for each channel.
    const r = Math.round(110 + 75 * Math.sin(t * .24 + .4));
    const g = Math.round(120 + 70 * Math.sin(t * .19 + 2.3));
    const b = Math.round(135 + 75 * Math.sin(t * .21 + 4.2));
    return bright ? `rgb(${r},${g},${b})` : `rgb(${Math.round(r*.48)},${Math.round(g*.48)},${Math.round(b*.48)})`;
}
function drawConcreteLayer(bright) {
    const width = lightingSurface.width, height = lightingSurface.height;
    lightingCtx.clearRect(0, 0, width, height);
    lightingCtx.drawImage(marbleCanvas, -camera.x, -camera.y);
    if (!bright) {
        lightingCtx.globalCompositeOperation = "source-atop";
        lightingCtx.fillStyle = "rgba(0,0,0,0.73)";
        lightingCtx.fillRect(0, 0, width, height);
        lightingCtx.globalCompositeOperation = "source-over";
    }
}
function refreshNegativeSpaceVisibility() {
    const bm = wallMaskBright.getContext("2d"), dm = wallMaskDim.getContext("2d");
    bm.clearRect(0,0,wallMaskBright.width,wallMaskBright.height);
    dm.clearRect(0,0,wallMaskDim.width,wallMaskDim.height);
    bm.fillStyle = dm.fillStyle = "white";
    for (let y=0;y<MAP_HEIGHT;y++) for (let x=0;x<MAP_WIDTH;x++) {
        if (isWalkable(x,y)) continue;
        const ns=[[1,0],[-1,0],[0,1],[0,-1]];
        if (ns.some(([dx,dy]) => inBounds(x+dx,y+dy) && explored[y+dy][x+dx]))
            dm.fillRect(x*TILE_SIZE,y*TILE_SIZE,TILE_SIZE,TILE_SIZE);
        if (ns.some(([dx,dy]) => inBounds(x+dx,y+dy) && visible[y+dy][x+dx]))
            bm.fillRect(x*TILE_SIZE,y*TILE_SIZE,TILE_SIZE,TILE_SIZE);
    }
}
function drawNegativeSpaceWireframe(bright) {
    const width = lightingSurface.width, height = lightingSurface.height;
    lightingCtx.clearRect(0, 0, width, height);
    lightingCtx.drawImage(wallWireCanvas, -camera.x, -camera.y);
    lightingCtx.globalCompositeOperation = "source-in";
    lightingCtx.fillStyle = wireframeColor(bright);
    lightingCtx.fillRect(0, 0, width, height);
    lightingCtx.globalCompositeOperation = "destination-in";
    lightingCtx.drawImage(bright ? wallMaskBright : wallMaskDim, -camera.x, -camera.y);
    lightingCtx.globalCompositeOperation = "source-over";
    ctx.drawImage(lightingSurface, 0, 0);
}

function applyLightingMask() {
    lightingCtx.save();

    lightingCtx.globalCompositeOperation = "destination-in";

    lightingCtx.drawImage(lightingMask, 0, 0);

    lightingCtx.restore();
}

// Previously revealed geometry: blurred edges.
function drawExploredMask() {
    const width = lightingMask.width;
    const height = lightingMask.height;

    maskCtx.clearRect(0, 0, width, height);

    maskCtx.save();

    maskCtx.translate(-camera.x, -camera.y);

    // The blur extends the remembered region slightly,
    // removing the abrupt transition to black.
    maskCtx.filter = "blur(10px)";
    maskCtx.fillStyle = "rgba(255,255,255,0.9)";
    maskCtx.fill(visibilityHistory);

    maskCtx.restore();
}

// Currently illuminated geometry: radial falloff,
// bounded by the exact wall-raycast visibility polygon.
function drawCurrentLightMask() {
    const width = lightingMask.width;
    const height = lightingMask.height;

    maskCtx.clearRect(0, 0, width, height);

    if (!player || lightPolygon.length < 3) return;

    const originX = (player.x + 0.5) * TILE_SIZE;
    const originY = (player.y + 0.5) * TILE_SIZE;
    const radius = VISION_RADIUS * TILE_SIZE;

    maskCtx.save();
    maskCtx.translate(-camera.x, -camera.y);

    // Hard-edged wall occlusion.
    // Do not blur the polygon itself.
    maskCtx.clip(createLightPath());

    // Softness is confined to the outer range of vision.
    const gradient = maskCtx.createRadialGradient(
        originX, originY, 0,
        originX, originY, radius
    );

    gradient.addColorStop(0.00, "rgba(255,255,255,1)");
    gradient.addColorStop(0.65, "rgba(255,255,255,1)");
    gradient.addColorStop(0.80, "rgba(255,255,255,0.98)");
    gradient.addColorStop(0.90, "rgba(255,255,255,0.82)");
    gradient.addColorStop(0.96, "rgba(255,255,255,0.38)");
    gradient.addColorStop(1.00, "rgba(255,255,255,0)");

    maskCtx.fillStyle = gradient;
    maskCtx.fillRect(
        originX - radius,
        originY - radius,
        radius * 2,
        radius * 2
    );

    maskCtx.restore();
}

// ============================================================
// OPUS — AMBIENT CONCRETE BACKGROUND
// ============================================================

const ambientConcreteCanvas = document.createElement("canvas");
const ambientConcreteCtx = ambientConcreteCanvas.getContext("2d");

const AMBIENT_TEXTURE_SIZE = 256;
let ambientConcretePattern = null;


function buildAmbientConcreteTexture() {
    const size = AMBIENT_TEXTURE_SIZE;

    ambientConcreteCanvas.width = size;
    ambientConcreteCanvas.height = size;

    const image = ambientConcreteCtx.createImageData(size, size);

    // Periodic noise: opposite texture edges match.
    // All RGB channels are equal: strictly monochrome.
    function periodicNoise(x, y, period, seed) {
        const gx = x / period;
        const gy = y / period;

        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);

        const fx = gx - x0;
        const fy = gy - y0;

        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);

        const count = size / period;

        const wrap = n => ((n % count) + count) % count;

        const a = concreteNoise(wrap(x0), wrap(y0), seed);
        const b = concreteNoise(wrap(x0 + 1), wrap(y0), seed);
        const c = concreteNoise(wrap(x0), wrap(y0 + 1), seed);
        const d = concreteNoise(
            wrap(x0 + 1),
            wrap(y0 + 1),
            seed
        );

        const top = a + (b - a) * sx;
        const bottom = c + (d - c) * sx;

        return top + (bottom - top) * sy;
    }

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const coarse = periodicNoise(x, y, 64, 71);
            const medium = periodicNoise(x, y, 16, 72);
            const fine = periodicNoise(x, y, 4, 73);

            const shade = Math.max(
                5,
                Math.min(
                    43,
                    Math.round(
                        19 +
                        (coarse - 0.5) * 21 +
                        (medium - 0.5) * 12 +
                        (fine - 0.5) * 9
                    )
                )
            );

            const i = (y * size + x) * 4;

            image.data[i] = shade;
            image.data[i + 1] = shade;
            image.data[i + 2] = shade;
            image.data[i + 3] = 255;
        }
    }

    ambientConcreteCtx.putImageData(image, 0, 0);

    ambientConcretePattern = ctx.createPattern(
    ambientConcreteCanvas,
    "repeat"
);
}

// The RGB universe exists behind a moving, transparent wireframe aperture.
// Each line samples a different part of a morphing multicolour plasma field.
const plasmaCanvas = document.createElement("canvas");
plasmaCanvas.width = 192;
plasmaCanvas.height = 108;
const plasmaCtx = plasmaCanvas.getContext("2d", {willReadFrequently:true});
const plasmaPixels = plasmaCtx.createImageData(192,108);
const plasmaPatternCanvas = document.createElement("canvas");
let plasmaPatternCtx = plasmaPatternCanvas.getContext("2d");
let plasmaLastFrame = -1;

// Every motion derives from the soundtrack's 800ms beat.
// 25ms master ticks; 50/100/200/400ms are integer subdivisions.
function opusClock() {
    const ticks = Math.floor(Math.max(0, getRhythmSeconds()) * 40 + 1e-6);
    return { ticks, beat: ticks % 32, t: ticks * .025,
        q50: Math.floor(ticks/2), q100: Math.floor(ticks/4),
        q200: Math.floor(ticks/8), q400: Math.floor(ticks/16) };
}
function updatePlasma(clock, width, height) {
    // Field updates only on 100ms grid. Motion is periodic over exact beat subdivisions.
    const frame = clock.q100;
    if (frame === plasmaLastFrame && plasmaPatternCanvas.width === 768 && plasmaPatternCanvas.height === 432) return;
    plasmaLastFrame = frame;
    const d = plasmaPixels.data, w = 192, h = 108;
    const t=frame*.1;
    // Deterministic, sparse colour islands. Irregular drifting centres,
    // frequencies and hues; not a dense repeating interference field.
    const hash=n=>{const x=Math.sin(n*127.1+78.233)*43758.5453;return x-Math.floor(x);};
    const blobs=[];
    for(let k=0;k<9;k++){
        const seed=k+1;
        blobs.push({
            x:(hash(seed*7)+.10*Math.sin(t*(.12+hash(seed*11)*.2)+seed*2.1))*w,
            y:(hash(seed*13)+.10*Math.cos(t*(.14+hash(seed*17)*.22)+seed*1.3))*h,
            radius:10+hash(seed*23)*19,
            phase:seed*2.399+t*(.35+hash(seed*29)*.45),
            gain:.45+hash(seed*31)*.55
        });
    }
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        let r=70,g=78,b=105;
        for(const blob of blobs){
            const dx=x-blob.x,dy=y-blob.y;
            const q=(dx*dx+dy*dy)/(blob.radius*blob.radius);
            if(q>5)continue;
            const fall=Math.exp(-q*1.4)*blob.gain;
            r+=fall*(120+95*Math.sin(blob.phase));
            g+=fall*(105+100*Math.sin(blob.phase+2.09));
            b+=fall*(115+105*Math.sin(blob.phase+4.19));
        }
        const i=(y*w+x)*4;
        d[i]=Math.max(0,Math.min(255,r));
        d[i+1]=Math.max(0,Math.min(255,g));
        d[i+2]=Math.max(0,Math.min(255,b));
        d[i+3]=255;
    }
    plasmaCtx.putImageData(plasmaPixels,0,0);
    if (plasmaPatternCanvas.width !== 768 || plasmaPatternCanvas.height !== 432) {
        plasmaPatternCanvas.width=768; plasmaPatternCanvas.height=432;
        plasmaPatternCtx=plasmaPatternCanvas.getContext("2d");
    }
    plasmaPatternCtx.imageSmoothingEnabled=true;
    plasmaPatternCtx.drawImage(plasmaCanvas,0,0,768,432);
}

function drawAmbientConcrete() {
    const width=window.innerWidth, height=window.innerHeight;
    const clock=opusClock();
    updatePlasma(clock,width,height);
    // Almost-black manifold: the colour lives ONLY inside the filaments.
    ctx.fillStyle="#000000";
    ctx.fillRect(0,0,width,height);
    const grid=32;
    const ox=(((-camera.x)%grid)+grid)%grid;
    const oy=(((-camera.y)%grid)+grid)%grid;
    ctx.save();
    // Repeat the manifold in WORLD space, exactly as the geometry does.
    const manifold=ctx.createPattern(plasmaPatternCanvas,"repeat");
    if (manifold && manifold.setTransform && typeof DOMMatrix !== "undefined") {
        manifold.setTransform(new DOMMatrix().translate(-camera.x,-camera.y));
    }
    ctx.strokeStyle=manifold || "#ffffff";
    ctx.lineCap="round";
    const accent=Math.pow(.5+.5*Math.cos(2*Math.PI*clock.t/.2),5);
    ctx.lineWidth=0.9;
    ctx.globalAlpha=1;
    // Mostly straight, orthogonal grid. Only rare localised bulges.
    // Bulge centres shift on 400ms and 200ms subdivisions, not free-running time.
    const bulgeWorldX=640+280*Math.sin(clock.q400*.42);
    const bulgeWorldY=480+220*Math.cos(clock.q200*.18);
    const bulgeX=bulgeWorldX-camera.x;
    const bulgeY=bulgeWorldY-camera.y;
    const pulse=Math.sin(clock.q50*Math.PI/8);
    const bulgeRadius=65;
    const distortion=(x,y,vertical)=>{
        const dx=x-bulgeX,dy=y-bulgeY;
        const falloff=Math.exp(-(dx*dx+dy*dy)/(bulgeRadius*bulgeRadius));
        return falloff*(2.2+.8*pulse)*(vertical?dx:dy)/bulgeRadius;
    };
    ctx.beginPath();
    for(let x=ox;x<=width+grid;x+=grid) {
        for(let y=0;y<=height+8;y+=8) {
            const dx=distortion(x,y,true);
            if(y===0)ctx.moveTo(x+dx,y);else ctx.lineTo(x+dx,y);
        }
    }
    for(let y=oy;y<=height+grid;y+=grid) {
        for(let x=0;x<=width+8;x+=8) {
            const dy=distortion(x,y,false);
            if(x===0)ctx.moveTo(x,y+dy);else ctx.lineTo(x,y+dy);
        }
    }
    // Constant-opacity thin core. The beat modulates only a faint halo.
    if (accent > .015) {
        ctx.save();
        ctx.globalAlpha=5*accent;
        ctx.lineWidth=.5;
        ctx.stroke();
        ctx.restore();

    }
    ctx.globalAlpha=0.5;
    ctx.lineWidth=.4;
    ctx.stroke();
    ctx.restore();
}

// Render a vertical lip on the solid-to-marble transition: the floor is
// enclosed by physical material, not suspended in a geometric void.
function drawMarbleWallFaces() {
    ctx.save();
    ctx.translate(-camera.x,-camera.y);
    for(let y=0;y<MAP_HEIGHT;y++)for(let x=0;x<MAP_WIDTH;x++) {
        if(map[y][x]!==1)continue;
        const px=x*TILE_SIZE,py=y*TILE_SIZE;
        const north=!isWalkable(x,y-1),south=!isWalkable(x,y+1);
        const west=!isWalkable(x-1,y),east=!isWalkable(x+1,y);
        if(!north&&!south&&!west&&!east)continue;
        // Avoid showing walls in wholly unexplored regions.
        if(!explored[y][x]&&!visible[y][x])continue;
        const opacity=visible[y][x]?1:.5;
        ctx.globalAlpha=opacity;
        const thickness=7;
        if(north){
            ctx.fillStyle="#b09a79";ctx.fillRect(px,py,32,thickness);
            ctx.fillStyle="#f6e9c9";ctx.fillRect(px,py+thickness,32,1.5);
        }
        if(south){
            ctx.fillStyle="#a9936f";ctx.fillRect(px,py+32-thickness,32,thickness);
            ctx.fillStyle="#f6f5f1";ctx.fillRect(px,py+32-thickness,32,1.5);
        }
        if(west){
            ctx.fillStyle="#9b8667";ctx.fillRect(px,py,thickness,32);
            ctx.fillStyle="#f4e4c4";ctx.fillRect(px+thickness,py,1.5,32);
        }
        if(east){
            ctx.fillStyle="#b8a17b";ctx.fillRect(px+32-thickness,py,thickness,32);
            ctx.fillStyle="#f4f1eb";ctx.fillRect(px+32-thickness,py,1.5,32);
        }
    }
    ctx.restore();
}

function drawFloatingMarbleEdges(){
    // Extruded slab, not a raised wall. Only exposed south/east sides
    // show thickness. Drawn behind the floor so it reads as one surface.
    const depth=11;
    ctx.save();
    ctx.translate(-camera.x,-camera.y);
    for(let y=0;y<MAP_HEIGHT;y++)for(let x=0;x<MAP_WIDTH;x++){
        if(map[y][x]!==1 || (!explored[y][x]&&!visible[y][x]))continue;
        const px=x*TILE_SIZE,py=y*TILE_SIZE;
        const alpha=visible[y][x]?1:.52;
        ctx.globalAlpha=alpha;
        if(!isWalkable(x,y+1)){
            const grad=ctx.createLinearGradient(0,py+TILE_SIZE,0,py+TILE_SIZE+depth);
            grad.addColorStop(0,'#d9c9a7');
            grad.addColorStop(.35,'#998568');
            grad.addColorStop(1,'#312a27');
            ctx.fillStyle=grad;
            ctx.fillRect(px,py+TILE_SIZE,TILE_SIZE,depth);
            ctx.fillStyle='#fff0d0';
            ctx.fillRect(px,py+TILE_SIZE-1,TILE_SIZE,1);
            ctx.fillStyle='rgba(0,0,0,.25)';
            ctx.fillRect(px+2,py+TILE_SIZE+depth, TILE_SIZE,3);
        }
        if(!isWalkable(x+1,y)){
            const grad=ctx.createLinearGradient(px+TILE_SIZE,0,px+TILE_SIZE+depth,0);
            grad.addColorStop(0,'#a79576');grad.addColorStop(1,'#3b302a');
            ctx.fillStyle=grad;
            ctx.beginPath();
            ctx.moveTo(px+TILE_SIZE,py);
            ctx.lineTo(px+TILE_SIZE+depth,py+depth*.45);
            ctx.lineTo(px+TILE_SIZE+depth,py+TILE_SIZE+depth);
            ctx.lineTo(px+TILE_SIZE,py+TILE_SIZE);
            ctx.closePath();ctx.fill();
        }
    }
    ctx.restore();
}

function drawDungeon() {
    drawAmbientConcrete();
    drawFloatingMarbleEdges();
    if (!player || lightPolygon.length < 3) return;

    // Marble is drawn directly into the main canvas. This avoids the
    // lighting-surface composite bug that made the floor appear black.
    // Clip to floor tiles and explored/current light, not to wall geometry.
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    const floorPath = new Path2D();
    for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (map[y][x] === 1) {
                floorPath.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }
    ctx.clip(floorPath);
    // Previously explored marble is dimmed, but remains recognisably ivory.
    ctx.save();
    ctx.clip(visibilityHistory);
    ctx.globalAlpha = 0.55;
    ctx.drawImage(marbleCanvas, 0, 0);
    ctx.restore();
    // Current visibility is full-brightness marble.
    ctx.save();
    ctx.clip(createLightPath());
    ctx.globalAlpha = 1;
    ctx.drawImage(marbleCanvas, 0, 0);
    ctx.restore();
    ctx.restore();
    // No raised wall lips: marble meets the manifold directly.
}

// ============================================================
// OPUS — PERSISTENT LOW-POLY IMPACT DECALS
// Drawn once into world-space canvas, not regenerated each frame.
// ============================================================
const impactCanvas = document.createElement("canvas");
impactCanvas.width = MAP_WIDTH * TILE_SIZE;
impactCanvas.height = MAP_HEIGHT * TILE_SIZE;
const impactCtx = impactCanvas.getContext("2d");
let impactSeed = 1;

function resetImpactDecals() {
    impactCtx.clearRect(0, 0, impactCanvas.width, impactCanvas.height);
    impactSeed = 1;
}

function impactRandom() {
    // Cheap repeatable pseudo-random generator, no per-frame allocation.
    impactSeed = (Math.imul(impactSeed, 1664525) + 1013904223) >>> 0;
    return impactSeed / 4294967296;
}

function stampImpactDecal(tileX, tileY, direction, fatal) {
    const length = Math.hypot(direction.x, direction.y) || 1;
    const dx = direction.x / length;
    const dy = direction.y / length;
    const sideX = -dy, sideY = dx;
    const originX = (tileX + 0.5) * TILE_SIZE;
    const originY = (tileY + 0.5) * TILE_SIZE;

    // Keep decals on traversable floor; never stain a wall tile.
    impactCtx.save();
    impactCtx.beginPath();
    for (let y = Math.max(0, tileY - 2); y <= Math.min(MAP_HEIGHT - 1, tileY + 2); y++) {
        for (let x = Math.max(0, tileX - 2); x <= Math.min(MAP_WIDTH - 1, tileX + 2); x++) {
            if (map[y][x] === 1) impactCtx.rect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }
    impactCtx.clip();

    // Impact starts at target and projects forward along shot direction.
    const count = fatal ? 9 : 6;
    for (let i = 0; i < count; i++) {
        const forward = 3 + impactRandom() * (fatal ? 45 : 29);
        const lateral = (impactRandom() - 0.5) * (5 + forward * 0.44);
        const cx = originX + dx * forward + sideX * lateral;
        const cy = originY + dy * forward + sideY * lateral;
        const radius = 1.5 + impactRandom() * (fatal ? 4.5 : 3.2);
        const stretch = 1.1 + impactRandom() * 1.9;
        const sides = 4 + Math.floor(impactRandom() * 3);
        impactCtx.fillStyle = i % 3 === 0 ? "#5a1119" : (i % 3 === 1 ? "#8b1b25" : "#a52a31");
        impactCtx.beginPath();
        for (let j = 0; j < sides; j++) {
            const angle = j * Math.PI * 2 / sides;
            const radial = radius * (0.73 + impactRandom() * 0.5);
            const along = Math.cos(angle) * radial * stretch;
            const across = Math.sin(angle) * radial;
            const px = cx + dx * along + sideX * across;
            const py = cy + dy * along + sideY * across;
            if (j === 0) impactCtx.moveTo(px, py);
            else impactCtx.lineTo(px, py);
        }
        impactCtx.closePath();
        impactCtx.fill();
    }
    impactCtx.restore();
}

function stampCorpse(tileX, tileY) {
    const x = (tileX + 0.5) * TILE_SIZE;
    const y = (tileY + 0.5) * TILE_SIZE;
    impactCtx.save();
    impactCtx.fillStyle = "#2d0b10";
    impactCtx.beginPath();
    impactCtx.ellipse(x + 2, y + 3, 12, 9, 0.3, 0, Math.PI * 2);
    impactCtx.fill();
    impactCtx.fillStyle = "#50131b";
    impactCtx.beginPath();
    impactCtx.arc(x - 1, y - 1, 8, 0, Math.PI * 2);
    impactCtx.fill();
    impactCtx.restore();
}

function drawImpactDecals() {
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    // Explored memory remains visible but subdued.
    ctx.save();
    ctx.clip(visibilityHistory);
    ctx.globalAlpha = 0.42;
    ctx.drawImage(impactCanvas, 0, 0);
    ctx.restore();
    // Current illumination reveals the full colour.
    ctx.save();
    ctx.clip(createLightPath());
    ctx.drawImage(impactCanvas, 0, 0);
    ctx.restore();
    ctx.restore();
}

// ============================================================
// 18. STAIRS RENDERING
// ============================================================

function drawStairs() {
    if (!stairs || !explored[stairs.y][stairs.x]) return;
    const x=stairs.x*TILE_SIZE+TILE_SIZE/2;
    const y=stairs.y*TILE_SIZE+TILE_SIZE/2;
    const phase=opusClock().t;
    const breathe=.5+.5*Math.cos(2*Math.PI*phase/.8);
    ctx.save();
    ctx.translate(-camera.x,-camera.y);
    ctx.clip(visibilityHistory);
    ctx.globalAlpha=visible[stairs.y][stairs.x]?1:.55;
    // Golden ambient bloom, contained around the floor opening.
    const glow=ctx.createRadialGradient(x,y,2,x,y,31+4*breathe);
    glow.addColorStop(0,'rgba(255,255,240,.75)');
    glow.addColorStop(.28,'rgba(255,238,182,.4)');
    glow.addColorStop(1,'rgba(255,193,90,0)');
    ctx.fillStyle=glow;
    ctx.beginPath();ctx.arc(x,y,35,0,Math.PI*2);ctx.fill();
    // Tall almond portal silhouette, brilliant white core and gold rim.
    ctx.save();
    ctx.shadowColor='#f5d38d';ctx.shadowBlur=12+5*breathe;
    ctx.beginPath();
    ctx.moveTo(x,y-17);
    ctx.bezierCurveTo(x+13,y-11,x+13,y+9,x,y+17);
    ctx.bezierCurveTo(x-13,y+9,x-13,y-11,x,y-17);
    ctx.closePath();
    ctx.fillStyle='#fffdf1';ctx.fill();
    ctx.lineWidth=1.5;ctx.strokeStyle='#e8c77b';ctx.stroke();
    ctx.restore();
    ctx.fillStyle='#ffffff';
    ctx.fillRect(Math.round(x-2),Math.round(y-10),4,20);
    ctx.restore();
}

function updateStairsPrompt() {
    stairsPrompt.classList.toggle(
        "hidden",
        !isOnStairs()
    );
}

// ============================================================
// 19. ENEMY RENDERING
// ============================================================

function drawEnemies() {
    const frame = Math.floor(getRhythmSeconds() / CREATURE_FRAME_SECONDS) % 4;
    for (const enemy of enemies) {
        if (!canSeeEnemy(enemy)) continue;
        const screen = worldToScreen(enemy.x, enemy.y);
        const type = enemy instanceof GoblinArcher ? "GoblinArcher" : "SecBotA";
        const variant = enemy.visualVariant ?? 0;
        const frames = creatureSprites.get(type + ":" + variant);
        if (frames) {
            ctx.drawImage(frames[frame], screen.x - 8, screen.y - 8);
        }
    }
}

// ============================================================
// VISUAL EFFECT RENDERING
// ============================================================

function drawVisualEffects(timestamp) {
    // Expire first: the loop guarantees one cleanup frame afterwards.
    visualEffects = visualEffects.filter(effect =>
        timestamp - effect.startTime < effect.duration
    );
    for (const effect of visualEffects) {
        const progress = Math.min(1,
            (timestamp - effect.startTime) / effect.duration);
        if (effect.type === "bullet") {
            drawBulletTracer(effect, progress);
        } else if (effect.type === "impact") {
            const point = worldToScreen(effect.x, effect.y);
            const x = point.x + TILE_SIZE / 2;
            const y = point.y + TILE_SIZE / 2;
            const r = 4 + progress * 12;
            ctx.save();
            ctx.globalAlpha = (1 - progress) * 0.65;
            ctx.strokeStyle = "#d44747";
            ctx.lineWidth = 2 * (1 - progress) + 0.5;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }
}

function drawBulletTracer(effect, progress) {
    const start = worldToScreen(
        effect.startX,
        effect.startY
    );

    const end = worldToScreen(
        effect.endX,
        effect.endY
    );

    const startX = start.x + TILE_SIZE / 2;
    const startY = start.y + TILE_SIZE / 2;

    const endX = end.x + TILE_SIZE / 2;
    const endY = end.y + TILE_SIZE / 2;

    // Interpolate the bullet's visible position.
    const bulletX = startX + (endX - startX) * progress;
    const bulletY = startY + (endY - startY) * progress;

    // Draw a short trail behind the bullet.
    const trailProgress = Math.max(0, progress - 0.12);

    const trailX =
        startX + (endX - startX) * trailProgress;

    const trailY =
        startY + (endY - startY) * trailProgress;

    ctx.save();

    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;

    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 8;

    ctx.beginPath();
    ctx.moveTo(trailX, trailY);
    ctx.lineTo(bulletX, bulletY);
    ctx.stroke();

    // Small bright projectile head.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(
        bulletX - 2,
        bulletY - 2,
        4,
        4
    );

    ctx.restore();
}

// Pixel-art seraph: an armored central eye, three pairs of angular
// feathered wings, and a broken halo. Built once at 40px resolution.
const seraphSprite=document.createElement("canvas");
seraphSprite.width=40;seraphSprite.height=40;
const sg=seraphSprite.getContext("2d");
sg.imageSmoothingEnabled=false;
function seraphPolygon(points,fill,stroke="#10111a"){
    sg.beginPath();sg.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++)sg.lineTo(points[i][0],points[i][1]);
    sg.closePath();sg.fillStyle=fill;sg.fill();
    sg.strokeStyle=stroke;sg.lineWidth=1;sg.stroke();
}
function buildSeraphSprite(){
    sg.clearRect(0,0,40,40);
    // A fractured crown, distinctly separate from the wings.
    sg.fillStyle="#f4d074";
    [[14,4,3,2],[23,4,3,2],[10,7,3,2],[27,7,3,2],[18,2,4,2]].forEach(r=>sg.fillRect(...r));
    // Six blade-like wings: three pairs with serrated feather tips.
    const pairs=[
      {y:9, tip:0, shade:"#e2bb64"},
      {y:17,tip:1, shade:"#fff0b3"},
      {y:25,tip:2, shade:"#a9772f"}
    ];
    for(const p of pairs){
        const y=p.y, t=p.tip;
        seraphPolygon([[17,y+2],[11,y-3],[7,y-4],[5,y-8+t],[2,y-5],[4,y],[0,y+1],[5,y+4],[3,y+7],[10,y+6],[17,y+5]],p.shade);
        seraphPolygon([[23,y+2],[29,y-3],[33,y-4],[35,y-8+t],[38,y-5],[36,y],[40,y+1],[35,y+4],[37,y+7],[30,y+6],[23,y+5]],p.shade);
        sg.fillStyle="#76501d";
        sg.fillRect(7,y+1,7,1);sg.fillRect(26,y+1,7,1);
    }
    // Obsidian armor gives the silhouette weight, not flower petals.
    seraphPolygon([[16,12],[24,12],[28,17],[27,26],[23,32],[17,32],[13,26],[12,17]],"#72501e","#f6db8c");
    seraphPolygon([[14,16],[20,12],[26,16],[29,20],[26,24],[20,28],[14,24],[11,20]],"#f8d782","#48300f");
    // Single imposing eye: almond, iris, pupil, glint.
    seraphPolygon([[13,20],[17,17],[23,17],[27,20],[23,23],[17,23]],"#fff0d5","#7d301c");
    sg.fillStyle="#bc2632";
    [[15,19,3,1],[16,21,2,1],[23,18,2,1],[24,21,2,1]].forEach(r=>sg.fillRect(...r));
    sg.fillStyle="#b02e39";sg.fillRect(18,18,5,5);
    sg.fillStyle="#1b0a10";sg.fillRect(20,18,2,4);
    sg.fillStyle="#fff";sg.fillRect(19,18,1,1);
    sg.fillStyle="#f4d074";sg.fillRect(19,29,2,4);
}
buildSeraphSprite();

function drawPlayer() {
    const x=window.innerWidth/2, y=window.innerHeight/2;
    const beat=Math.floor(getRhythmSeconds()/.4);
    ctx.save();
    ctx.translate(Math.round(x),Math.round(y-(beat%2)));
    ctx.imageSmoothingEnabled=false;
    // Temporary solid gold cube; a neutral silhouette for the next character pass.
    ctx.fillStyle="#493214";
    ctx.fillRect(-14,-11,28,28);
    ctx.fillStyle="#f5d68d";
    ctx.fillRect(-13,-14,26,25);
    ctx.fillStyle="#b68b42";
    ctx.fillRect(9,-11,4,25);
    ctx.fillRect(-13,8,26,4);
    ctx.fillStyle="#fff4cf";
    ctx.fillRect(-10,-11,17,3);
    ctx.restore();
}

// ============================================================
// 20. HUD
// ============================================================

function updateHUD() {
    statsElement.textContent =
        `BUNKER ${bunker} | CORPSES ${player.corpses}`;

    levelElement.textContent =
        `LVL ${player.level}`;

    attackStat.textContent =
        `ATK ${player.attack}`;

    hpText.textContent =
        `${player.hp} / ${player.maxHp} HP`;

    hpFill.style.width =
        `${Math.max(0, player.hp / player.maxHp * 100)}%`;

    xpText.textContent =
        `${player.xp} / ${player.xpRequired} XP`;

    xpFill.style.width =
        `${player.xp / player.xpRequired * 100}%`;
}

// ============================================================
// 21. RENDER
// ============================================================

function render() {
    if (!player || !stairs) {
        return;
    }

    updateCamera();

    // Restore CSS-pixel coordinates on every render, including after resize.
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawDungeon();
    drawStairs();
    drawImpactDecals();
    drawEnemies();
    drawPlayer();

    drawVisualEffects(performance.now());
    presentFisheye();

}

// ============================================================
// OPUS — HIGH-SPEED AUTO-EXPLORE
// ============================================================

const FAST_EXPLORE_MAX_STEPS = 32;
const FAST_EXPLORE_BUDGET_MS = 5;

function processFastAutoExplore() {
    if (!autoExploring || gameOver) return;

    const started = performance.now();

    for (
        let i = 0;
        i < FAST_EXPLORE_MAX_STEPS && autoExploring;
        i++
    ) {
        // Keep the browser responsive.
        if (
            i > 0 &&
            performance.now() - started >=
                FAST_EXPLORE_BUDGET_MS
        ) {
            break;
        }

        const previousX = player.x;
        const previousY = player.y;
        const previousTurn = turn;

        autoExploreStep();

        // Prevent pathological loops.
        if (
            player.x === previousX &&
            player.y === previousY &&
            turn === previousTurn
        ) {
            break;
        }
    }
}


let lastRenderedTurn = -1;
let lastRenderedCameraX = NaN;
let lastRenderedCameraY = NaN;
let lastHUDState = "";
let hadVisualEffectsLastFrame = false;
let lastWireframeColorFrame = -1;

function animationLoop(timestamp) {
    // The loop runs before a character is selected.
    // Never access player properties until the game exists.
    if (!gameStarted || !player || !stairs) {
        animationFrame = requestAnimationFrame(animationLoop);
        return;
    }

    processHeldTab(timestamp);

    if (autoExploring) {
        processFastAutoExplore();
    }
    // Interpolate the camera for all movement modes, including TAB.
    updatePlayerMovement(timestamp);

    // Calculate camera position without drawing.
    updateCamera();

    const cameraChanged =
        camera.x !== lastRenderedCameraX ||
        camera.y !== lastRenderedCameraY;

    const turnChanged = turn !== lastRenderedTurn;

    // Tracers require animation even when nothing moves.
    const effectsActive = visualEffects.length > 0;
    const creatureFrame = Math.floor(getRhythmSeconds(timestamp) / CREATURE_FRAME_SECONDS);
    const creatureFrameChanged = creatureFrame !== creatureFrameRendered;
    creatureFrameRendered = creatureFrame;
    const visibleCreatures = enemies.some(enemy => canSeeEnemy(enemy));

    // RGB shifts at 12 Hz; avoids continuous expensive masked redraws.
    const colorFrame = Math.floor(getRhythmSeconds(timestamp) * 40);
    const wireframeColorChanged = colorFrame !== lastWireframeColorFrame;
    lastWireframeColorFrame = colorFrame;
    // Only redraw the canvas when necessary.
    if (wireframeColorChanged || turnChanged || cameraChanged || effectsActive || hadVisualEffectsLastFrame ||
        (creatureFrameChanged && visibleCreatures)) {
        render();

        lastRenderedTurn = turn;
        lastRenderedCameraX = camera.x;
        lastRenderedCameraY = camera.y;
    }
    hadVisualEffectsLastFrame = effectsActive;

    // HUD updates only when the actual displayed data changes.
    const hudState = [
        bunker,
        player.corpses,
        player.level,
        player.attack,
        player.hp,
        player.maxHp,
        player.xp,
        player.xpRequired,
        player.x,
        player.y
    ].join("|");

    if (hudState !== lastHUDState) {
        updateHUD();
        updateStairsPrompt();
        lastHUDState = hudState;
    }

    // Mouse reticle is managed separately from the canvas.
    // Its mousemove handler already updates its position.
    animationFrame = requestAnimationFrame(animationLoop);
}


// ============================================================
// 22. RESTART
// ============================================================

function restartGame() {
    

    stopAutoExplore(false);

    bunker = 1;
    turn = 0;
    gameOver = false;
    resetCombo();
    player = null;
    playerMovement = null;
    visualEffects = [];

    chatLog.innerHTML = "";
    popupLayer.innerHTML = "";

    generateDungeon();
}

// ============================================================
// 23. KEYBOARD CONTROLS
// ============================================================

const MOVEMENT_KEYS = {
    w: [0, -1],
    arrowup: [0, -1],

    s: [0, 1],
    arrowdown: [0, 1],

    a: [-1, 0],
    arrowleft: [-1, 0],

    d: [1, 0],
    arrowright: [1, 0]
};

document.addEventListener("keydown", event => {
    const key = event.key.toLowerCase();

    // Prevent browser navigation and scrolling.
    if (
        key.startsWith("arrow") ||
        key === " " ||
        key === "tab"
    ) {
        event.preventDefault();
    }

    // Ignore game controls on character selection.
    if (!gameStarted) return;

    // Prevent repeated toggles or firing from a held key.
    if (
        event.repeat &&
        ["o", "enter", "tab"].includes(key)
    ) {
        return;
    }

    if (gameOver) return;

    // Only physical key presses count; browser auto-repeat and held TAB ticks do not.
    const rhythmKey = key === "tab" || key === " " || Boolean(MOVEMENT_KEYS[key]);
    if (rhythmKey && !event.repeat && selectedCharacter === "Seraphim") {
        registerRhythmInput();
    }

    // Fire equipped weapon.
    if (key === "tab") {
        if (!tabHeld) {
            tabHeld = true;
            // Single press fires immediately; holding repeats on clock boundaries.
            autoAction();
            const now = getRhythmSeconds();
            tabNextTick = (Math.floor(now / HELD_TAB_INTERVAL_SECONDS) + 1) * HELD_TAB_INTERVAL_SECONDS;
        }
        return;
    }   

    // Toggle auto-exploration.
    if (key === "o") {
        toggleAutoExplore();
        return;
    }

    // Descend to the next bunker.
    if (key === "enter" && isOnStairs()) {
        stopAutoExplore(false);

        bunker++;
        generateDungeon();
        return;
    }

    // Wait one turn.
    if (key === " ") {
        stopAutoExplore(false);

        processEnemyTurn();

        turn++;
        render();
        return;
    }

    // Manual movement.
    if (MOVEMENT_KEYS[key]) {
        movePlayer(...MOVEMENT_KEYS[key]);
    }
});

document.addEventListener("keyup", event => {
    if (event.key.toLowerCase() === "tab") {
        tabHeld = false;
        tabNextTick = null;
    }
});
window.addEventListener("blur", () => { tabHeld = false; tabNextTick = null; });

// ============================================================
// 24. INITIALIZATION
// ============================================================

// Wait for character selection before starting gameplay.
buildCreatureSprites();
initFisheye();
resizeCanvas();
requestAnimationFrame(animationLoop);