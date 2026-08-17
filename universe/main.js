import * as THREE from
    "https://cdn.jsdelivr.net/npm/three@0.160/build/three.module.js";

import { PointerLockControls } from
    "https://cdn.jsdelivr.net/npm/three@0.160/examples/jsm/controls/PointerLockControls.js";


// SCENE

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);


// CAMERA

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);


// RENDERER

const renderer = new THREE.WebGLRenderer();
renderer.setSize(
    window.innerWidth,
    window.innerHeight
);

document.body.appendChild(renderer.domElement);


// LIGHT
// note: whiteWire/handMaterial below are MeshBasicMaterial, which ignores
// scene lighting entirely — this light only matters if you later swap
// any mesh to a lit material (Lambert/Standard/etc).

const light = new THREE.DirectionalLight(
    0xffffff,
    2
);

light.position.set(5, 10, 5);
scene.add(light);


// WIREFRAME MATERIAL

const whiteWire = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true
});


// FLOOR GRID

const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100, 50, 50),
    whiteWire
);

floor.rotation.x = -Math.PI / 2;

scene.add(floor);


// FLOATING OBJECTS

for (let i = 0; i < 20; i++) {

    let shape = new THREE.Mesh(
        new THREE.IcosahedronGeometry(
            Math.random() * 2 + 0.5
        ),
        whiteWire
    );

    shape.position.set(
        (Math.random() - 0.5) * 40,
        Math.random() * 10,
        (Math.random() - 0.5) * 40
    );

    scene.add(shape);
}


// FIRST PERSON

const controls = new PointerLockControls(
    camera,
    document.body
);

scene.add(
    controls.getObject()
);

camera.position.y = 2;


// ENTER OVERLAY

const overlay = document.createElement('div');
overlay.textContent = 'click to enter';
Object.assign(overlay.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    fontFamily: 'monospace',
    fontSize: '16px',
    letterSpacing: '2px',
    background: 'rgba(0,0,0,0.4)',
    cursor: 'pointer',
    zIndex: '10',
    userSelect: 'none'
});
document.body.appendChild(overlay);

document.body.onclick = () => {
    controls.lock();
};

controls.addEventListener('lock', () => {
    overlay.style.display = 'none';
});

controls.addEventListener('unlock', () => {
    overlay.style.display = 'flex';
});


// HANDS

const handMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    wireframe: true
});


const leftHand = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.5, 0.15),
    handMaterial
);

const rightHand = leftHand.clone();


leftHand.position.set(
    -0.4,
    -0.5,
    -1
);

rightHand.position.set(
    0.4,
    -0.5,
    -1
);


camera.add(leftHand);
camera.add(rightHand);


// STARFIELD

const STAR_COUNT = 2500;
const starPositions = new Float32Array(STAR_COUNT * 3);

for (let i = 0; i < STAR_COUNT; i++) {
    // scatter stars across a big sphere shell surrounding the scene
    const radius = 150 + Math.random() * 350;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);

    starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    starPositions[i * 3 + 2] = radius * Math.cos(phi);
}

const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(starPositions, 3)
);

const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.6,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85
});

const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);


// MOVEMENT

const MOVE_SPEED = 8; // units per second

const move = {
    forward: false,
    backward: false,
    left: false,
    right: false
};

const velocity = new THREE.Vector3();

document.addEventListener('keydown', (e) => {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': move.forward = true; break;
        case 'KeyS': case 'ArrowDown': move.backward = true; break;
        case 'KeyA': case 'ArrowLeft': move.left = true; break;
        case 'KeyD': case 'ArrowRight': move.right = true; break;
    }
});

document.addEventListener('keyup', (e) => {
    switch (e.code) {
        case 'KeyW': case 'ArrowUp': move.forward = false; break;
        case 'KeyS': case 'ArrowDown': move.backward = false; break;
        case 'KeyA': case 'ArrowLeft': move.left = false; break;
        case 'KeyD': case 'ArrowRight': move.right = false; break;
    }
});


// WINDOW RESIZE

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});


// ANIMATION

const clock = new THREE.Clock();

function animate() {

    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (controls.isLocked) {

        velocity.x = (Number(move.right) - Number(move.left)) * MOVE_SPEED * delta;
        velocity.z = (Number(move.backward) - Number(move.forward)) * MOVE_SPEED * delta;

        controls.moveRight(velocity.x);
        controls.moveForward(-velocity.z);
    }

    scene.children.forEach(obj => {

        if (obj.geometry &&
            obj !== floor) {

            obj.rotation.y += 0.003;

        }

    });


    renderer.render(
        scene,
        camera
    );
}


animate();  