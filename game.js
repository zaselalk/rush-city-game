// Game state
let scene, camera, renderer;
let playerCar, road, obstacles = [];
let gameActive = false;
let score = 0;
let distance = 0;
let speed = 0;
let baseSpeed = 0;
let maxSpeed = 2.2;
let acceleration = 0.005; // Slower acceleration for more challenge
let keys = {};
let environmentObjects = [];
let lastTreeZ = 10;
let ground;

// Pedestrian system
let pedestrians = [];
let lastPedestrianZ = 0;
let pedestriansAvoided = 0;
let hitPedestrian = false;

// Road curve system
let roadSegments = [];
let roadCurveOffset = 0;
let currentRoadX = 0;
let targetRoadX = 0;
let roadCurveSpeed = 0;
const ROAD_SEGMENT_LENGTH = 10;
const ROAD_VISIBLE_SEGMENTS = 60;

// Traffic light system
let trafficLights = [];
let lastTrafficLightZ = -50;
const TRAFFIC_LIGHT_SPACING = 80; // Distance between traffic lights
let ranRedLights = 0; // Penalty counter

// Crossroad system
let crossroads = [];
let lastCrossroadZ = -100;

// Autonomous vehicles system
let autonomousVehicles = [];
let lastVehicleZ = -30;
let lastOncomingVehicleZ = -50;
const VEHICLE_SPAWN_INTERVAL = 15; // Distance between vehicle spawns
const ONCOMING_SPAWN_INTERVAL = 20; // Distance between oncoming vehicles
let vehiclesOvertaken = 0;
let nearMisses = 0; // Close calls with oncoming traffic

// Alternative road system
let alternativeRoadSegments = [];
let currentRoadChoice = 'main'; // 'main', 'left', 'right'
const ALT_ROAD_OFFSET = 12; // Distance from main road to alternative roads

// Junction turning system
let activeJunction = null;
let turningState = 'none'; // 'none', 'turning_left', 'turning_right'
let turnProgress = 0;
let turnTargetAngle = 0;
let postTurnDirection = 0; // Accumulated direction after turns
let sideRoads = []; // Side roads extending from junctions

// Audio state
let audioContext;
let masterGain;
let engineOscillator, engineGain;
let tireNoiseSource, tireNoiseGain;
let windNoiseSource, windNoiseGain;
let audioInitialized = false;

// Initialize audio system
function initAudio() {
    if (audioInitialized) return;

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Master volume control
        masterGain = audioContext.createGain();
        masterGain.gain.value = 0.5;
        masterGain.connect(audioContext.destination);

        // Engine sound setup
        engineGain = audioContext.createGain();
        engineGain.gain.value = 0;
        engineGain.connect(masterGain);

        // Create engine oscillator (sawtooth for engine-like sound)
        engineOscillator = audioContext.createOscillator();
        engineOscillator.type = 'sawtooth';
        engineOscillator.frequency.value = 80;

        // Add distortion for more realistic engine sound
        const engineDistortion = audioContext.createWaveShaper();
        engineDistortion.curve = makeDistortionCurve(50);

        // Low pass filter for engine rumble
        const engineFilter = audioContext.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 300;
        engineFilter.Q.value = 5;

        engineOscillator.connect(engineDistortion);
        engineDistortion.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineOscillator.start();

        // Tire/road noise setup (white noise filtered)
        tireNoiseGain = audioContext.createGain();
        tireNoiseGain.gain.value = 0;
        tireNoiseGain.connect(masterGain);

        const tireFilter = audioContext.createBiquadFilter();
        tireFilter.type = 'bandpass';
        tireFilter.frequency.value = 800;
        tireFilter.Q.value = 0.5;

        tireNoiseSource = createNoiseSource();
        tireNoiseSource.connect(tireFilter);
        tireFilter.connect(tireNoiseGain);

        // Wind noise setup (higher frequency noise)
        windNoiseGain = audioContext.createGain();
        windNoiseGain.gain.value = 0;
        windNoiseGain.connect(masterGain);

        const windFilter = audioContext.createBiquadFilter();
        windFilter.type = 'highpass';
        windFilter.frequency.value = 2000;
        windFilter.Q.value = 0.3;

        windNoiseSource = createNoiseSource();
        windNoiseSource.connect(windFilter);
        windFilter.connect(windNoiseGain);

        audioInitialized = true;
        console.log('Audio initialized successfully');
    } catch (e) {
        console.warn('Audio initialization failed:', e);
    }
}

// Create white noise source
function createNoiseSource() {
    const bufferSize = audioContext.sampleRate * 2;
    const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
    }

    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    noiseSource.start();

    return noiseSource;
}

// Create distortion curve for engine sound
function makeDistortionCurve(amount) {
    const samples = 44100;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;

    for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1;
        curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
    }

    return curve;
}

// Update audio based on game state
function updateAudio() {
    if (!audioInitialized || !audioContext) return;

    // Resume audio context if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    if (!gameActive) {
        // Fade out all sounds when game is not active
        engineGain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.1);
        tireNoiseGain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.1);
        windNoiseGain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.1);
        return;
    }

    const normalizedSpeed = speed / maxSpeed;

    // Engine pitch increases with speed (80Hz idle to 400Hz at max speed)
    const enginePitch = 80 + normalizedSpeed * 320;
    engineOscillator.frequency.linearRampToValueAtTime(enginePitch, audioContext.currentTime + 0.05);

    // Engine volume based on throttle and speed
    let engineVolume = 0.15 + normalizedSpeed * 0.25;
    if (keys['ArrowUp']) {
        engineVolume += 0.15; // Louder when accelerating
    }
    if (keys['ArrowDown']) {
        engineVolume *= 0.6; // Quieter when braking
    }
    engineGain.gain.linearRampToValueAtTime(engineVolume, audioContext.currentTime + 0.05);

    // Tire noise increases with speed
    const tireVolume = normalizedSpeed * 0.12;
    tireNoiseGain.gain.linearRampToValueAtTime(tireVolume, audioContext.currentTime + 0.05);

    // Extra tire squeal when turning at speed
    if ((keys['ArrowLeft'] || keys['ArrowRight']) && speed > 0.3) {
        tireNoiseGain.gain.linearRampToValueAtTime(tireVolume + 0.08, audioContext.currentTime + 0.02);
    }

    // Wind noise increases exponentially with speed
    const windVolume = Math.pow(normalizedSpeed, 2) * 0.15;
    windNoiseGain.gain.linearRampToValueAtTime(windVolume, audioContext.currentTime + 0.05);
}

// Play acceleration burst sound
function playAccelerationSound() {
    if (!audioInitialized || !audioContext) return;

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = 150;
    osc.frequency.linearRampToValueAtTime(250, audioContext.currentTime + 0.2);

    gain.gain.value = 0.1;
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start();
    osc.stop(audioContext.currentTime + 0.3);
}

// Play brake sound
function playBrakeSound() {
    if (!audioInitialized || !audioContext) return;

    const bufferSize = audioContext.sampleRate * 0.3;
    const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const source = audioContext.createBufferSource();
    source.buffer = noiseBuffer;

    const filter = audioContext.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1500;

    const gain = audioContext.createGain();
    gain.gain.value = 0.08;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    source.start();
}

// Play start engine sound
function playStartEngineSound() {
    if (!audioInitialized || !audioContext) return;

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = 40;
    osc.frequency.linearRampToValueAtTime(80, audioContext.currentTime + 0.5);
    osc.frequency.linearRampToValueAtTime(60, audioContext.currentTime + 0.7);
    osc.frequency.linearRampToValueAtTime(80, audioContext.currentTime + 1.0);

    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.1);
    gain.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.5);
    gain.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + 1.0);

    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start();
    osc.stop(audioContext.currentTime + 1.2);
}

// Initialize Three.js scene
function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue
    scene.fog = new THREE.Fog(0x87ceeb, 30, 120);

    // Camera with lower FOV and better positioning to avoid seeing below ground
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
    camera.position.set(0, 2.5, 8);
    camera.lookAt(0, 0.5, 0);

    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('gameCanvas'),
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x87ceeb);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Ambient lighting for soft base illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Hemisphere light for natural sky/ground coloring
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x3a5f0b, 0.4);
    scene.add(hemiLight);

    // Main directional sunlight with shadows
    const directionalLight = new THREE.DirectionalLight(0xfff4e5, 1.2);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 100;
    directionalLight.shadow.camera.left = -30;
    directionalLight.shadow.camera.right = 30;
    directionalLight.shadow.camera.top = 30;
    directionalLight.shadow.camera.bottom = -30;
    scene.add(directionalLight);

    createRoad();
    createPlayerCar();
    createStars();
    createNatureElements();
}

// Create starfield background
function createStars() {
    const starsGeometry = new THREE.BufferGeometry();
    const starsMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.1,
        transparent: true,
        opacity: 0.8
    });

    const starsVertices = [];
    for (let i = 0; i < 1000; i++) {
        const x = (Math.random() - 0.5) * 100;
        const y = Math.random() * 50 + 5;
        const z = (Math.random() - 0.5) * 100;
        starsVertices.push(x, y, z);
    }

    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);
}

// Create pine/conifer tree
function createPineTree(x, z) {
    const treeGroup = new THREE.Group();
    const scale = 0.8 + Math.random() * 0.6;

    // Tree trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.15 * scale, 0.25 * scale, 2 * scale, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x5a3a1a,
        roughness: 0.95
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 1 * scale;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    treeGroup.add(trunk);

    // Pine foliage (multiple cone layers)
    const foliageGeometry = new THREE.ConeGeometry(1 * scale, 2.2 * scale, 8);
    const foliageColors = [0x2d5016, 0x3a6b1f, 0x1a4a0f];
    const foliageColor = foliageColors[Math.floor(Math.random() * foliageColors.length)];
    const foliageMaterial = new THREE.MeshStandardMaterial({
        color: foliageColor,
        roughness: 0.9
    });

    const foliage1 = new THREE.Mesh(foliageGeometry, foliageMaterial);
    foliage1.position.y = 2.5 * scale;
    foliage1.castShadow = true;
    foliage1.receiveShadow = true;
    treeGroup.add(foliage1);

    const foliage2 = new THREE.Mesh(foliageGeometry, foliageMaterial);
    foliage2.position.y = 3.4 * scale;
    foliage2.scale.set(0.75, 0.85, 0.75);
    foliage2.castShadow = true;
    treeGroup.add(foliage2);

    const foliage3 = new THREE.Mesh(foliageGeometry, foliageMaterial);
    foliage3.position.y = 4.1 * scale;
    foliage3.scale.set(0.5, 0.7, 0.5);
    foliage3.castShadow = true;
    treeGroup.add(foliage3);

    treeGroup.position.set(x, 0, z);
    return treeGroup;
}

// Create oak/deciduous tree with round canopy
function createOakTree(x, z) {
    const treeGroup = new THREE.Group();
    const scale = 0.9 + Math.random() * 0.5;

    // Thick trunk
    const trunkGeometry = new THREE.CylinderGeometry(0.2 * scale, 0.35 * scale, 2.5 * scale, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a3520,
        roughness: 0.95
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 1.25 * scale;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    treeGroup.add(trunk);

    // Round foliage clusters
    const foliageColors = [0x4a7c23, 0x3d6b1c, 0x5a8f2a];
    const foliageColor = foliageColors[Math.floor(Math.random() * foliageColors.length)];
    const foliageMaterial = new THREE.MeshStandardMaterial({
        color: foliageColor,
        roughness: 0.85
    });

    // Main canopy - multiple spheres for natural look
    const canopyPositions = [
        [0, 3.5 * scale, 0, 1.4 * scale],
        [-0.5 * scale, 3.2 * scale, 0.3 * scale, 1.0 * scale],
        [0.5 * scale, 3.3 * scale, -0.2 * scale, 1.1 * scale],
        [0, 3.8 * scale, -0.4 * scale, 0.9 * scale],
        [-0.3 * scale, 3.0 * scale, -0.5 * scale, 0.8 * scale],
    ];

    canopyPositions.forEach(pos => {
        const foliageGeometry = new THREE.SphereGeometry(pos[3], 8, 8);
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.set(pos[0], pos[1], pos[2]);
        foliage.castShadow = true;
        foliage.receiveShadow = true;
        treeGroup.add(foliage);
    });

    treeGroup.position.set(x, 0, z);
    return treeGroup;
}

// Create birch tree with white bark
function createBirchTree(x, z) {
    const treeGroup = new THREE.Group();
    const scale = 0.8 + Math.random() * 0.4;

    // White/silver trunk with black marks
    const trunkGeometry = new THREE.CylinderGeometry(0.1 * scale, 0.15 * scale, 3.5 * scale, 8);
    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0xe8e0d5,
        roughness: 0.7
    });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 1.75 * scale;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    treeGroup.add(trunk);

    // Black bark marks
    for (let i = 0; i < 5; i++) {
        const markGeometry = new THREE.BoxGeometry(0.12 * scale, 0.05 * scale, 0.08 * scale);
        const markMaterial = new THREE.MeshStandardMaterial({
            color: 0x2a2a2a,
            roughness: 0.9
        });
        const mark = new THREE.Mesh(markGeometry, markMaterial);
        mark.position.set(
            0.08 * scale * (Math.random() > 0.5 ? 1 : -1),
            (0.8 + i * 0.5) * scale,
            0.08 * scale * (Math.random() > 0.5 ? 1 : -1)
        );
        mark.rotation.y = Math.random() * Math.PI;
        treeGroup.add(mark);
    }

    // Light green/yellow foliage (smaller leaves)
    const foliageColors = [0x7cb342, 0x9ccc65, 0x8bc34a];
    const foliageColor = foliageColors[Math.floor(Math.random() * foliageColors.length)];
    const foliageMaterial = new THREE.MeshStandardMaterial({
        color: foliageColor,
        roughness: 0.85
    });

    // Sparse, airy canopy
    for (let i = 0; i < 4; i++) {
        const foliageGeometry = new THREE.SphereGeometry(0.6 * scale, 6, 6);
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.set(
            (Math.random() - 0.5) * 0.8 * scale,
            (3.5 + Math.random() * 0.8) * scale,
            (Math.random() - 0.5) * 0.8 * scale
        );
        foliage.scale.set(1, 0.8, 1);
        foliage.castShadow = true;
        treeGroup.add(foliage);
    }

    treeGroup.position.set(x, 0, z);
    return treeGroup;
}

// Create palm tree
function createPalmTree(x, z) {
    const treeGroup = new THREE.Group();
    const scale = 0.9 + Math.random() * 0.3;

    // Curved trunk segments
    const trunkMaterial = new THREE.MeshStandardMaterial({
        color: 0x8b7355,
        roughness: 0.9
    });

    // Build trunk with multiple segments for slight curve
    for (let i = 0; i < 6; i++) {
        const segmentGeometry = new THREE.CylinderGeometry(
            (0.18 - i * 0.015) * scale,
            (0.2 - i * 0.015) * scale,
            0.6 * scale,
            8
        );
        const segment = new THREE.Mesh(segmentGeometry, trunkMaterial);
        segment.position.y = (0.3 + i * 0.55) * scale;
        segment.position.x = Math.sin(i * 0.15) * 0.1 * scale;
        segment.castShadow = true;
        treeGroup.add(segment);
    }

    // Palm fronds
    const frondMaterial = new THREE.MeshStandardMaterial({
        color: 0x2e7d32,
        roughness: 0.8,
        side: THREE.DoubleSide
    });

    const numFronds = 7;
    for (let i = 0; i < numFronds; i++) {
        const angle = (i / numFronds) * Math.PI * 2;
        const frondGroup = new THREE.Group();

        // Frond stem
        const stemGeometry = new THREE.CylinderGeometry(0.02 * scale, 0.03 * scale, 1.8 * scale, 4);
        const stem = new THREE.Mesh(stemGeometry, frondMaterial);
        stem.position.y = 0.9 * scale;
        stem.rotation.z = -0.6;
        frondGroup.add(stem);

        // Frond leaves (elongated shape)
        const leafGeometry = new THREE.BoxGeometry(0.15 * scale, 0.02 * scale, 1.5 * scale);
        const leaf = new THREE.Mesh(leafGeometry, frondMaterial);
        leaf.position.y = 1.5 * scale;
        leaf.position.z = 0.3 * scale;
        leaf.rotation.x = 0.3;
        frondGroup.add(leaf);

        frondGroup.position.y = 3.3 * scale;
        frondGroup.rotation.y = angle;
        frondGroup.rotation.x = 0.2;
        treeGroup.add(frondGroup);
    }

    treeGroup.position.set(x, 0, z);
    return treeGroup;
}

// Create random tree type
function createTree(x, z) {
    const treeType = Math.random();
    if (treeType < 0.35) {
        return createPineTree(x, z);
    } else if (treeType < 0.6) {
        return createOakTree(x, z);
    } else if (treeType < 0.85) {
        return createBirchTree(x, z);
    } else {
        return createPalmTree(x, z);
    }
}

// Create bushes
function createBush(x, z) {
    const bushGroup = new THREE.Group();

    const bushGeometry = new THREE.SphereGeometry(0.5, 8, 8);
    const bushMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a6b1f,
        roughness: 0.9
    });

    // Create cluster of spheres for bush effect
    for (let i = 0; i < 3; i++) {
        const bush = new THREE.Mesh(bushGeometry, bushMaterial);
        bush.position.set(
            (Math.random() - 0.5) * 0.5,
            Math.random() * 0.3,
            (Math.random() - 0.5) * 0.5
        );
        bush.scale.set(
            0.8 + Math.random() * 0.4,
            0.6 + Math.random() * 0.4,
            0.8 + Math.random() * 0.4
        );
        bushGroup.add(bush);
    }

    bushGroup.position.set(x, 0, z);
    return bushGroup;
}

// Create rocks
function createRock(x, z) {
    const rockGeometry = new THREE.DodecahedronGeometry(0.4, 0);
    const rockMaterial = new THREE.MeshStandardMaterial({
        color: 0x666666,
        roughness: 0.95,
        metalness: 0.1
    });

    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    rock.position.set(x, 0.2, z);
    rock.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
    );
    rock.scale.set(
        0.8 + Math.random() * 0.6,
        0.5 + Math.random() * 0.5,
        0.8 + Math.random() * 0.6
    );

    return rock;
}

// Create traffic light
function createTrafficLight(x, z, side) {
    const lightGroup = new THREE.Group();

    // Pole
    const poleMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        metalness: 0.7,
        roughness: 0.3
    });
    const poleGeometry = new THREE.CylinderGeometry(0.08, 0.1, 4, 8);
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.y = 2;
    pole.castShadow = true;
    lightGroup.add(pole);

    // Horizontal arm extending over road
    const armGeometry = new THREE.CylinderGeometry(0.05, 0.05, 3.5, 8);
    const arm = new THREE.Mesh(armGeometry, poleMaterial);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(side * -1.75, 3.8, 0);
    arm.castShadow = true;
    lightGroup.add(arm);

    // Traffic light housing
    const housingMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 0.3,
        roughness: 0.7
    });
    const housingGeometry = new THREE.BoxGeometry(0.4, 1.0, 0.3);
    const housing = new THREE.Mesh(housingGeometry, housingMaterial);
    housing.position.set(side * -2.5, 3.5, 0);
    housing.castShadow = true;
    lightGroup.add(housing);

    // Light bulbs (red, yellow, green)
    const lightRadius = 0.1;
    const lightPositions = [
        { y: 3.8, color: 0x330000, emissive: 0xff0000, name: 'red' },
        { y: 3.5, color: 0x332200, emissive: 0xffaa00, name: 'yellow' },
        { y: 3.2, color: 0x003300, emissive: 0x00ff00, name: 'green' }
    ];

    lightPositions.forEach(light => {
        const bulbGeometry = new THREE.SphereGeometry(lightRadius, 12, 12);
        const bulbMaterial = new THREE.MeshStandardMaterial({
            color: light.color,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.3,
            metalness: 0.1
        });
        const bulb = new THREE.Mesh(bulbGeometry, bulbMaterial);
        bulb.position.set(side * -2.5, light.y, 0.16);
        bulb.userData.lightType = light.name;
        bulb.userData.emissiveColor = light.emissive;
        lightGroup.add(bulb);
    });

    // Visor/hood for each light
    const visorGeometry = new THREE.BoxGeometry(0.25, 0.08, 0.15);
    const visorMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    [3.8, 3.5, 3.2].forEach(y => {
        const visor = new THREE.Mesh(visorGeometry, visorMaterial);
        visor.position.set(side * -2.5, y + 0.12, 0.2);
        lightGroup.add(visor);
    });

    lightGroup.position.set(x, 0, z);
    lightGroup.userData.isTrafficLight = true;
    lightGroup.userData.state = 'green'; // Initial state
    lightGroup.userData.timer = Math.random() * 5; // Randomize initial timing
    lightGroup.userData.worldZ = z;
    lightGroup.userData.passed = false;

    return lightGroup;
}

// Update traffic light state
function updateTrafficLightState(trafficLight, deltaTime) {
    trafficLight.userData.timer += deltaTime;

    // Traffic light cycle: green (5s) -> yellow (2s) -> red (5s) -> green
    const cycleTime = trafficLight.userData.timer % 12;
    let newState;

    if (cycleTime < 5) {
        newState = 'green';
    } else if (cycleTime < 7) {
        newState = 'yellow';
    } else {
        newState = 'red';
    }

    if (newState !== trafficLight.userData.state) {
        trafficLight.userData.state = newState;

        // Update light visuals
        trafficLight.children.forEach(child => {
            if (child.userData.lightType) {
                const isActive = child.userData.lightType === newState;
                child.material.emissive.setHex(isActive ? child.userData.emissiveColor : 0x000000);
                child.material.emissiveIntensity = isActive ? 1.5 : 0;
            }
        });
    }
}

// Create crossroad
function createCrossroad(z) {
    const crossroadGroup = new THREE.Group();
    const curveX = getRoadCurveAt(z);

    // Intersecting road surface
    const crossRoadGeometry = new THREE.PlaneGeometry(25, 7);
    const crossRoadMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a35,
        roughness: 0.85,
        metalness: 0.05
    });
    const crossRoad = new THREE.Mesh(crossRoadGeometry, crossRoadMaterial);
    crossRoad.rotation.x = -Math.PI / 2;
    crossRoad.position.set(curveX, 0.01, z);
    crossRoad.receiveShadow = true;
    crossroadGroup.add(crossRoad);

    // Crosswalk stripes (zebra crossing)
    const stripeMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5
    });

    // Crosswalk on main road (perpendicular stripes)
    for (let i = -3; i <= 3; i++) {
        const stripeGeometry = new THREE.BoxGeometry(0.4, 0.02, 2.5);
        const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
        stripe.position.set(curveX + i * 0.8, 0.02, z + 4.5);
        crossroadGroup.add(stripe);

        const stripe2 = new THREE.Mesh(stripeGeometry, stripeMaterial);
        stripe2.position.set(curveX + i * 0.8, 0.02, z - 4.5);
        crossroadGroup.add(stripe2);
    }

    // Crosswalk on cross street
    for (let i = -3; i <= 3; i++) {
        const stripeGeometry = new THREE.BoxGeometry(2.5, 0.02, 0.4);
        const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
        stripe.position.set(curveX + 4.5, 0.02, z + i * 0.8);
        crossroadGroup.add(stripe);

        const stripe2 = new THREE.Mesh(stripeGeometry, stripeMaterial);
        stripe2.position.set(curveX - 4.5, 0.02, z + i * 0.8);
        crossroadGroup.add(stripe2);
    }

    // Stop lines
    const stopLineGeometry = new THREE.BoxGeometry(7, 0.02, 0.3);
    const stopLine1 = new THREE.Mesh(stopLineGeometry, stripeMaterial);
    stopLine1.position.set(curveX, 0.02, z + 3.2);
    crossroadGroup.add(stopLine1);

    const stopLine2 = new THREE.Mesh(stopLineGeometry, stripeMaterial);
    stopLine2.position.set(curveX, 0.02, z - 3.2);
    crossroadGroup.add(stopLine2);

    // Center intersection markings (yellow box)
    const centerLineGeometry = new THREE.BoxGeometry(0.1, 0.02, 7);
    const yellowLineMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5 });

    // Cross street edge lines
    const crossEdgeGeometry = new THREE.BoxGeometry(0.1, 0.02, 7);
    const leftCrossEdge = new THREE.Mesh(crossEdgeGeometry, stripeMaterial);
    leftCrossEdge.rotation.y = Math.PI / 2;
    leftCrossEdge.position.set(curveX - 10, 0.02, z);
    crossroadGroup.add(leftCrossEdge);

    const rightCrossEdge = new THREE.Mesh(crossEdgeGeometry, stripeMaterial);
    rightCrossEdge.rotation.y = Math.PI / 2;
    rightCrossEdge.position.set(curveX + 10, 0.02, z);
    crossroadGroup.add(rightCrossEdge);

    // Add traffic lights at corners
    const trafficLight1 = createTrafficLight(curveX + 4, z + 4, 1);
    trafficLight1.rotation.y = 0;
    crossroadGroup.add(trafficLight1);
    trafficLights.push(trafficLight1);

    const trafficLight2 = createTrafficLight(curveX - 4, z - 4, -1);
    trafficLight2.rotation.y = Math.PI;
    crossroadGroup.add(trafficLight2);
    trafficLights.push(trafficLight2);

    // Side street traffic lights
    const trafficLight3 = createTrafficLight(curveX + 4, z - 4, 1);
    trafficLight3.rotation.y = -Math.PI / 2;
    trafficLight3.userData.timer = 6; // Offset timing for cross traffic
    crossroadGroup.add(trafficLight3);

    const trafficLight4 = createTrafficLight(curveX - 4, z + 4, -1);
    trafficLight4.rotation.y = Math.PI / 2;
    trafficLight4.userData.timer = 6; // Offset timing for cross traffic
    crossroadGroup.add(trafficLight4);

    // Street signs
    const signPostMaterial = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.6, roughness: 0.3 });

    // Corner curbs
    const curbMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });
    const curbGeometry = new THREE.BoxGeometry(1.5, 0.15, 1.5);

    [[-4.5, -4.5], [-4.5, 4.5], [4.5, -4.5], [4.5, 4.5]].forEach(pos => {
        const curb = new THREE.Mesh(curbGeometry, curbMaterial);
        curb.position.set(curveX + pos[0], 0.08, z + pos[1]);
        crossroadGroup.add(curb);
    });

    crossroadGroup.userData.isCrossroad = true;
    crossroadGroup.userData.worldZ = z;
    crossroadGroup.userData.curveX = curveX;
    crossroadGroup.userData.canTurnLeft = true;
    crossroadGroup.userData.canTurnRight = true;

    // Add side roads extending from the junction
    createSideRoads(crossroadGroup, curveX, z);

    return crossroadGroup;
}

// Create side roads extending from junction
function createSideRoads(crossroadGroup, curveX, z) {
    const sideRoadLength = 50;
    const sideRoadWidth = 6;

    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a35,
        roughness: 0.85,
        metalness: 0.05
    });

    const shoulderMaterial = new THREE.MeshStandardMaterial({
        color: 0x5a4a3a,
        roughness: 0.95
    });

    const lineMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5
    });

    // Left side road
    const leftRoadGroup = new THREE.Group();

    // Left road shoulder
    const leftShoulder = new THREE.Mesh(
        new THREE.PlaneGeometry(sideRoadLength, sideRoadWidth + 2),
        shoulderMaterial
    );
    leftShoulder.rotation.x = -Math.PI / 2;
    leftShoulder.rotation.z = Math.PI / 2;
    leftShoulder.position.set(-sideRoadLength / 2 - 8, -0.02, 0);
    leftRoadGroup.add(leftShoulder);

    // Left road surface
    const leftRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(sideRoadLength, sideRoadWidth),
        roadMaterial
    );
    leftRoad.rotation.x = -Math.PI / 2;
    leftRoad.rotation.z = Math.PI / 2;
    leftRoad.position.set(-sideRoadLength / 2 - 8, 0, 0);
    leftRoad.receiveShadow = true;
    leftRoadGroup.add(leftRoad);

    // Left road center line
    for (let i = 0; i < 10; i++) {
        const dashLine = new THREE.Mesh(
            new THREE.BoxGeometry(3, 0.02, 0.15),
            lineMaterial
        );
        dashLine.position.set(-12 - i * 5, 0.01, 0);
        leftRoadGroup.add(dashLine);
    }

    // Left road edge lines
    const leftEdge1 = new THREE.Mesh(
        new THREE.BoxGeometry(sideRoadLength, 0.02, 0.1),
        lineMaterial
    );
    leftEdge1.position.set(-sideRoadLength / 2 - 8, 0.01, -2.8);
    leftRoadGroup.add(leftEdge1);

    const leftEdge2 = new THREE.Mesh(
        new THREE.BoxGeometry(sideRoadLength, 0.02, 0.1),
        lineMaterial
    );
    leftEdge2.position.set(-sideRoadLength / 2 - 8, 0.01, 2.8);
    leftRoadGroup.add(leftEdge2);

    leftRoadGroup.position.set(curveX, 0, z);
    crossroadGroup.add(leftRoadGroup);

    // Right side road
    const rightRoadGroup = new THREE.Group();

    // Right road shoulder
    const rightShoulder = new THREE.Mesh(
        new THREE.PlaneGeometry(sideRoadLength, sideRoadWidth + 2),
        shoulderMaterial
    );
    rightShoulder.rotation.x = -Math.PI / 2;
    rightShoulder.rotation.z = Math.PI / 2;
    rightShoulder.position.set(sideRoadLength / 2 + 8, -0.02, 0);
    rightRoadGroup.add(rightShoulder);

    // Right road surface
    const rightRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(sideRoadLength, sideRoadWidth),
        roadMaterial
    );
    rightRoad.rotation.x = -Math.PI / 2;
    rightRoad.rotation.z = Math.PI / 2;
    rightRoad.position.set(sideRoadLength / 2 + 8, 0, 0);
    rightRoad.receiveShadow = true;
    rightRoadGroup.add(rightRoad);

    // Right road center line
    for (let i = 0; i < 10; i++) {
        const dashLine = new THREE.Mesh(
            new THREE.BoxGeometry(3, 0.02, 0.15),
            lineMaterial
        );
        dashLine.position.set(12 + i * 5, 0.01, 0);
        rightRoadGroup.add(dashLine);
    }

    // Right road edge lines
    const rightEdge1 = new THREE.Mesh(
        new THREE.BoxGeometry(sideRoadLength, 0.02, 0.1),
        lineMaterial
    );
    rightEdge1.position.set(sideRoadLength / 2 + 8, 0.01, -2.8);
    rightRoadGroup.add(rightEdge1);

    const rightEdge2 = new THREE.Mesh(
        new THREE.BoxGeometry(sideRoadLength, 0.02, 0.1),
        lineMaterial
    );
    rightEdge2.position.set(sideRoadLength / 2 + 8, 0.01, 2.8);
    rightRoadGroup.add(rightEdge2);

    rightRoadGroup.position.set(curveX, 0, z);
    crossroadGroup.add(rightRoadGroup);
}

// Spawn crossroad with traffic lights
function spawnCrossroad(z) {
    const crossroad = createCrossroad(z);
    crossroads.push(crossroad);
    scene.add(crossroad);
}

// Check if player ran a red light
function checkTrafficLightViolation() {
    if (!playerCar || !gameActive) return;

    trafficLights.forEach(light => {
        if (light.userData.passed) return;

        const lightZ = light.userData.worldZ || light.position.z;
        const carZ = playerCar.position.z;

        // Check if car just passed the traffic light
        if (carZ < lightZ - 2 && carZ > lightZ - 5) {
            // Only check traffic lights facing the player (main road)
            const facingPlayer = Math.abs(light.rotation.y) < 0.1 || Math.abs(light.rotation.y - Math.PI) < 0.1;

            if (facingPlayer && light.userData.state === 'red' && speed > 0.3) {
                // Ran a red light!
                light.userData.passed = true;
                ranRedLights++;
                score = Math.max(0, score - 50);
                flashScreen('rgba(255, 100, 0, 0.3)');
                playRedLightSound();
            } else if (facingPlayer) {
                light.userData.passed = true;
            }
        }
    });
}

// Play red light violation sound
function playRedLightSound() {
    if (!audioInitialized || !audioContext) return;

    // Warning horn sound
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'square';
    osc.frequency.value = 400;
    osc.frequency.linearRampToValueAtTime(300, audioContext.currentTime + 0.3);

    gain.gain.value = 0.2;
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start();
    osc.stop(audioContext.currentTime + 0.5);
}

// Update traffic lights
function updateTrafficLights(deltaTime) {
    trafficLights.forEach(light => {
        updateTrafficLightState(light, deltaTime);
    });

    // Spawn new crossroads ahead
    if (playerCar && playerCar.position.z < lastCrossroadZ - TRAFFIC_LIGHT_SPACING) {
        lastCrossroadZ -= TRAFFIC_LIGHT_SPACING;
        spawnCrossroad(lastCrossroadZ - 50);
    }

    // Remove crossroads that are too far behind
    crossroads = crossroads.filter(crossroad => {
        if (crossroad.userData.worldZ > playerCar.position.z + 40) {
            // Remove associated traffic lights
            crossroad.children.forEach(child => {
                if (child.userData.isTrafficLight) {
                    const index = trafficLights.indexOf(child);
                    if (index > -1) trafficLights.splice(index, 1);
                }
            });
            scene.remove(crossroad);
            return false;
        }
        return true;
    });

    // Check for traffic light violations
    checkTrafficLightViolation();
}

// Create a simple house
function createHouse(x, z) {
    const houseGroup = new THREE.Group();
    const scale = 0.8 + Math.random() * 0.4;

    // Wall colors
    const wallColors = [0xe8dcc8, 0xd4c4a8, 0xc9b896, 0xbfae86, 0xf5ebe0];
    const wallColor = wallColors[Math.floor(Math.random() * wallColors.length)];
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: wallColor,
        roughness: 0.9
    });

    // Main building
    const width = (1.5 + Math.random() * 1) * scale;
    const height = (1.5 + Math.random() * 0.8) * scale;
    const depth = (1.5 + Math.random() * 1) * scale;

    const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
    const building = new THREE.Mesh(buildingGeometry, wallMaterial);
    building.position.y = height / 2;
    building.castShadow = true;
    building.receiveShadow = true;
    houseGroup.add(building);

    // Roof
    const roofColors = [0x8b4513, 0xa0522d, 0x6b3a0f, 0x654321, 0xcc4444];
    const roofColor = roofColors[Math.floor(Math.random() * roofColors.length)];
    const roofMaterial = new THREE.MeshStandardMaterial({
        color: roofColor,
        roughness: 0.8
    });

    const roofGeometry = new THREE.ConeGeometry(width * 0.85, height * 0.6, 4);
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = height + height * 0.25;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    houseGroup.add(roof);

    // Door
    const doorMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a3728,
        roughness: 0.8
    });
    const doorGeometry = new THREE.BoxGeometry(width * 0.25, height * 0.45, 0.05);
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.set(0, height * 0.22, depth / 2 + 0.02);
    houseGroup.add(door);

    // Windows
    const windowMaterial = new THREE.MeshStandardMaterial({
        color: 0x87ceeb,
        metalness: 0.5,
        roughness: 0.1
    });
    const windowGeometry = new THREE.BoxGeometry(width * 0.2, height * 0.2, 0.05);

    const window1 = new THREE.Mesh(windowGeometry, windowMaterial);
    window1.position.set(-width * 0.25, height * 0.55, depth / 2 + 0.02);
    houseGroup.add(window1);

    const window2 = new THREE.Mesh(windowGeometry, windowMaterial);
    window2.position.set(width * 0.25, height * 0.55, depth / 2 + 0.02);
    houseGroup.add(window2);

    houseGroup.position.set(x, 0, z);
    houseGroup.rotation.y = Math.random() * Math.PI * 2;
    return houseGroup;
}

// Create a tall office/apartment building
function createTallBuilding(x, z) {
    const buildingGroup = new THREE.Group();
    const scale = 0.8 + Math.random() * 0.4;

    // Building dimensions
    const width = (1.5 + Math.random() * 1.5) * scale;
    const height = (4 + Math.random() * 4) * scale;
    const depth = (1.5 + Math.random() * 1.5) * scale;

    // Building colors - modern concrete/glass look
    const buildingColors = [0x808080, 0x696969, 0x778899, 0x5a5a5a, 0x6b7b8a];
    const buildingColor = buildingColors[Math.floor(Math.random() * buildingColors.length)];
    const buildingMaterial = new THREE.MeshStandardMaterial({
        color: buildingColor,
        roughness: 0.7,
        metalness: 0.2
    });

    // Main structure
    const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
    const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
    building.position.y = height / 2;
    building.castShadow = true;
    building.receiveShadow = true;
    buildingGroup.add(building);

    // Windows grid
    const windowMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a90a4,
        metalness: 0.8,
        roughness: 0.1,
        emissive: 0x1a3040,
        emissiveIntensity: 0.2
    });

    const floors = Math.floor(height / (0.8 * scale));
    const windowsPerFloor = Math.floor(width / (0.5 * scale));

    for (let floor = 0; floor < floors; floor++) {
        for (let w = 0; w < windowsPerFloor; w++) {
            const windowGeometry = new THREE.BoxGeometry(0.3 * scale, 0.4 * scale, 0.05);
            const windowMesh = new THREE.Mesh(windowGeometry, windowMaterial);
            windowMesh.position.set(
                -width / 2 + 0.3 * scale + w * (0.5 * scale),
                0.5 * scale + floor * (0.8 * scale),
                depth / 2 + 0.02
            );
            buildingGroup.add(windowMesh);
        }
    }

    // Rooftop details
    const rooftopGeometry = new THREE.BoxGeometry(width * 0.3, 0.5 * scale, depth * 0.3);
    const rooftopMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a4a4a,
        roughness: 0.9
    });
    const rooftop = new THREE.Mesh(rooftopGeometry, rooftopMaterial);
    rooftop.position.y = height + 0.25 * scale;
    rooftop.castShadow = true;
    buildingGroup.add(rooftop);

    buildingGroup.position.set(x, 0, z);
    buildingGroup.rotation.y = Math.random() * Math.PI * 0.5;
    return buildingGroup;
}

// Create a barn/farm building
function createBarn(x, z) {
    const barnGroup = new THREE.Group();
    const scale = 0.9 + Math.random() * 0.3;

    // Barn body
    const barnMaterial = new THREE.MeshStandardMaterial({
        color: 0x8b2500,
        roughness: 0.9
    });

    const width = 2.5 * scale;
    const height = 2 * scale;
    const depth = 3 * scale;

    const bodyGeometry = new THREE.BoxGeometry(width, height, depth);
    const body = new THREE.Mesh(bodyGeometry, barnMaterial);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    barnGroup.add(body);

    // Barn roof (gambrel style - simplified)
    const roofMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a4a4a,
        roughness: 0.8
    });

    const roofGeometry = new THREE.BoxGeometry(width * 1.1, 0.15 * scale, depth * 1.05);
    const roofLower1 = new THREE.Mesh(roofGeometry, roofMaterial);
    roofLower1.position.set(-width * 0.35, height + 0.3 * scale, 0);
    roofLower1.rotation.z = 0.5;
    roofLower1.castShadow = true;
    barnGroup.add(roofLower1);

    const roofLower2 = new THREE.Mesh(roofGeometry, roofMaterial);
    roofLower2.position.set(width * 0.35, height + 0.3 * scale, 0);
    roofLower2.rotation.z = -0.5;
    roofLower2.castShadow = true;
    barnGroup.add(roofLower2);

    const roofTopGeometry = new THREE.BoxGeometry(width * 0.6, 0.15 * scale, depth * 1.05);
    const roofTop = new THREE.Mesh(roofTopGeometry, roofMaterial);
    roofTop.position.y = height + 0.7 * scale;
    roofTop.castShadow = true;
    barnGroup.add(roofTop);

    // Barn doors
    const doorMaterial = new THREE.MeshStandardMaterial({
        color: 0x5a1a00,
        roughness: 0.9
    });

    const doorGeometry = new THREE.BoxGeometry(width * 0.6, height * 0.7, 0.1);
    const doors = new THREE.Mesh(doorGeometry, doorMaterial);
    doors.position.set(0, height * 0.35, depth / 2 + 0.05);
    barnGroup.add(doors);

    // White trim
    const trimMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.8
    });

    const trimGeometry = new THREE.BoxGeometry(width * 0.05, height, 0.05);
    const trim1 = new THREE.Mesh(trimGeometry, trimMaterial);
    trim1.position.set(-width / 2 + 0.05, height / 2, depth / 2 + 0.03);
    barnGroup.add(trim1);

    const trim2 = new THREE.Mesh(trimGeometry, trimMaterial);
    trim2.position.set(width / 2 - 0.05, height / 2, depth / 2 + 0.03);
    barnGroup.add(trim2);

    barnGroup.position.set(x, 0, z);
    barnGroup.rotation.y = Math.random() * Math.PI * 2;
    return barnGroup;
}

// Create a small shop/store
function createShop(x, z) {
    const shopGroup = new THREE.Group();
    const scale = 0.8 + Math.random() * 0.3;

    // Shop colors
    const shopColors = [0xffd700, 0xff6b6b, 0x4ecdc4, 0x95e1d3, 0xf38181];
    const shopColor = shopColors[Math.floor(Math.random() * shopColors.length)];

    const width = 2 * scale;
    const height = 1.8 * scale;
    const depth = 2 * scale;

    // Main building
    const buildingMaterial = new THREE.MeshStandardMaterial({
        color: shopColor,
        roughness: 0.8
    });

    const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
    const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
    building.position.y = height / 2;
    building.castShadow = true;
    building.receiveShadow = true;
    shopGroup.add(building);

    // Flat roof with overhang
    const roofMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a3a3a,
        roughness: 0.9
    });

    const roofGeometry = new THREE.BoxGeometry(width * 1.15, 0.1 * scale, depth * 1.1);
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = height + 0.05 * scale;
    roof.castShadow = true;
    shopGroup.add(roof);

    // Awning
    const awningMaterial = new THREE.MeshStandardMaterial({
        color: 0xcc3333,
        roughness: 0.7,
        side: THREE.DoubleSide
    });

    const awningGeometry = new THREE.BoxGeometry(width * 0.9, 0.05 * scale, 0.6 * scale);
    const awning = new THREE.Mesh(awningGeometry, awningMaterial);
    awning.position.set(0, height * 0.75, depth / 2 + 0.3 * scale);
    awning.rotation.x = -0.2;
    shopGroup.add(awning);

    // Large front window
    const windowMaterial = new THREE.MeshStandardMaterial({
        color: 0x87ceeb,
        metalness: 0.6,
        roughness: 0.1,
        transparent: true,
        opacity: 0.7
    });

    const windowGeometry = new THREE.BoxGeometry(width * 0.7, height * 0.4, 0.05);
    const frontWindow = new THREE.Mesh(windowGeometry, windowMaterial);
    frontWindow.position.set(0, height * 0.45, depth / 2 + 0.03);
    shopGroup.add(frontWindow);

    // Door
    const doorMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a3728,
        roughness: 0.8
    });

    const doorGeometry = new THREE.BoxGeometry(width * 0.25, height * 0.5, 0.05);
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.set(width * 0.3, height * 0.25, depth / 2 + 0.03);
    shopGroup.add(door);

    shopGroup.position.set(x, 0, z);
    shopGroup.rotation.y = Math.random() * Math.PI * 2;
    return shopGroup;
}

// Create random building type
function createBuilding(x, z) {
    const buildingType = Math.random();
    if (buildingType < 0.35) {
        return createHouse(x, z);
    } else if (buildingType < 0.55) {
        return createTallBuilding(x, z);
    } else if (buildingType < 0.75) {
        return createBarn(x, z);
    } else {
        return createShop(x, z);
    }
}

// Create grass ground - much larger to prevent seeing edges
function createGround() {
    const groundGeometry = new THREE.PlaneGeometry(300, 800);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x2d5016,
        roughness: 0.95,
        metalness: 0.0
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -300;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    ground.userData.isGround = true;
    scene.add(ground);

    // Add subtle grass variation patches
    for (let i = 0; i < 50; i++) {
        const patchGeometry = new THREE.CircleGeometry(2 + Math.random() * 4, 16);
        const patchMaterial = new THREE.MeshStandardMaterial({
            color: Math.random() > 0.5 ? 0x3a6b1f : 0x1a4a0f,
            roughness: 0.95
        });
        const patch = new THREE.Mesh(patchGeometry, patchMaterial);
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(
            (Math.random() - 0.5) * 100,
            -0.04,
            (Math.random() - 0.5) * 300 - 150
        );
        patch.receiveShadow = true;
        scene.add(patch);
    }

    return ground;
}

// Create a pedestrian - walking human figure
function createPedestrian(x, z, direction) {
    const pedestrianGroup = new THREE.Group();
    const scale = 0.85 + Math.random() * 0.3;

    // Clothing colors
    const shirtColors = [0x3498db, 0xe74c3c, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xe91e63, 0x00bcd4];
    const pantsColors = [0x2c3e50, 0x34495e, 0x1a252f, 0x4a4a4a, 0x2d3436];
    const skinTones = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524];

    const shirtColor = shirtColors[Math.floor(Math.random() * shirtColors.length)];
    const pantsColor = pantsColors[Math.floor(Math.random() * pantsColors.length)];
    const skinTone = skinTones[Math.floor(Math.random() * skinTones.length)];

    const shirtMaterial = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 });
    const pantsMaterial = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.7 });
    const skinMaterial = new THREE.MeshStandardMaterial({ color: skinTone, roughness: 0.6 });
    const hairMaterial = new THREE.MeshStandardMaterial({ color: 0x2c1810, roughness: 0.9 });

    // Head
    const headGeometry = new THREE.SphereGeometry(0.12 * scale, 8, 8);
    const head = new THREE.Mesh(headGeometry, skinMaterial);
    head.position.y = 1.55 * scale;
    head.castShadow = true;
    pedestrianGroup.add(head);

    // Hair
    const hairGeometry = new THREE.SphereGeometry(0.13 * scale, 8, 8);
    const hair = new THREE.Mesh(hairGeometry, hairMaterial);
    hair.position.y = 1.6 * scale;
    hair.scale.set(1, 0.6, 1);
    pedestrianGroup.add(hair);

    // Torso/shirt
    const torsoGeometry = new THREE.BoxGeometry(0.28 * scale, 0.4 * scale, 0.15 * scale);
    const torso = new THREE.Mesh(torsoGeometry, shirtMaterial);
    torso.position.y = 1.2 * scale;
    torso.castShadow = true;
    pedestrianGroup.add(torso);

    // Arms
    const armGeometry = new THREE.BoxGeometry(0.08 * scale, 0.35 * scale, 0.08 * scale);

    const leftArm = new THREE.Mesh(armGeometry, shirtMaterial);
    leftArm.position.set(-0.18 * scale, 1.15 * scale, 0);
    leftArm.userData.isArm = true;
    leftArm.userData.side = 'left';
    pedestrianGroup.add(leftArm);

    const rightArm = new THREE.Mesh(armGeometry, shirtMaterial);
    rightArm.position.set(0.18 * scale, 1.15 * scale, 0);
    rightArm.userData.isArm = true;
    rightArm.userData.side = 'right';
    pedestrianGroup.add(rightArm);

    // Hands
    const handGeometry = new THREE.SphereGeometry(0.04 * scale, 6, 6);

    const leftHand = new THREE.Mesh(handGeometry, skinMaterial);
    leftHand.position.set(-0.18 * scale, 0.95 * scale, 0);
    leftHand.userData.isHand = true;
    leftHand.userData.side = 'left';
    pedestrianGroup.add(leftHand);

    const rightHand = new THREE.Mesh(handGeometry, skinMaterial);
    rightHand.position.set(0.18 * scale, 0.95 * scale, 0);
    rightHand.userData.isHand = true;
    rightHand.userData.side = 'right';
    pedestrianGroup.add(rightHand);

    // Legs/pants
    const legGeometry = new THREE.BoxGeometry(0.1 * scale, 0.45 * scale, 0.1 * scale);

    const leftLeg = new THREE.Mesh(legGeometry, pantsMaterial);
    leftLeg.position.set(-0.08 * scale, 0.72 * scale, 0);
    leftLeg.userData.isLeg = true;
    leftLeg.userData.side = 'left';
    leftLeg.castShadow = true;
    pedestrianGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeometry, pantsMaterial);
    rightLeg.position.set(0.08 * scale, 0.72 * scale, 0);
    rightLeg.userData.isLeg = true;
    rightLeg.userData.side = 'right';
    rightLeg.castShadow = true;
    pedestrianGroup.add(rightLeg);

    // Feet/shoes
    const shoeGeometry = new THREE.BoxGeometry(0.1 * scale, 0.06 * scale, 0.16 * scale);
    const shoeMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });

    const leftShoe = new THREE.Mesh(shoeGeometry, shoeMaterial);
    leftShoe.position.set(-0.08 * scale, 0.48 * scale, 0.02 * scale);
    leftShoe.userData.isShoe = true;
    leftShoe.userData.side = 'left';
    pedestrianGroup.add(leftShoe);

    const rightShoe = new THREE.Mesh(shoeGeometry, shoeMaterial);
    rightShoe.position.set(0.08 * scale, 0.48 * scale, 0.02 * scale);
    rightShoe.userData.isShoe = true;
    rightShoe.userData.side = 'right';
    pedestrianGroup.add(rightShoe);

    // Set position and movement properties
    pedestrianGroup.position.set(x, 0, z);
    pedestrianGroup.userData.isPedestrian = true;
    pedestrianGroup.userData.walkSpeed = 0.02 + Math.random() * 0.02;
    pedestrianGroup.userData.walkPhase = Math.random() * Math.PI * 2;
    pedestrianGroup.userData.direction = direction; // 1 = walking forward, -1 = walking backward
    pedestrianGroup.userData.crossingRoad = false;
    pedestrianGroup.userData.startX = x;
    pedestrianGroup.userData.scale = scale;

    // Randomly decide if pedestrian might cross the road
    if (Math.random() > 0.7) {
        pedestrianGroup.userData.crossingRoad = true;
        pedestrianGroup.userData.crossDirection = x > 0 ? -1 : 1;
    }

    // Face the walking direction
    pedestrianGroup.rotation.y = direction > 0 ? 0 : Math.PI;

    return pedestrianGroup;
}

// Animate pedestrian walking
function animatePedestrian(pedestrian, deltaTime) {
    const walkSpeed = pedestrian.userData.walkSpeed;
    const phase = pedestrian.userData.walkPhase;
    const scale = pedestrian.userData.scale || 1;

    // Update walk phase
    pedestrian.userData.walkPhase += walkSpeed * 8;

    // Animate limbs
    pedestrian.children.forEach(child => {
        if (child.userData.isLeg) {
            const swing = Math.sin(phase) * 0.4;
            if (child.userData.side === 'left') {
                child.rotation.x = swing;
                child.position.z = Math.sin(phase) * 0.05 * scale;
            } else {
                child.rotation.x = -swing;
                child.position.z = -Math.sin(phase) * 0.05 * scale;
            }
        }
        if (child.userData.isArm || child.userData.isHand) {
            const swing = Math.sin(phase) * 0.3;
            if (child.userData.side === 'left') {
                child.rotation.x = -swing;
            } else {
                child.rotation.x = swing;
            }
        }
        if (child.userData.isShoe) {
            if (child.userData.side === 'left') {
                child.position.z = 0.02 * scale + Math.sin(phase) * 0.05 * scale;
            } else {
                child.position.z = 0.02 * scale - Math.sin(phase) * 0.05 * scale;
            }
        }
    });

    // Move pedestrian
    const direction = pedestrian.userData.direction;
    pedestrian.position.z -= walkSpeed * direction * 0.5;

    // Handle road crossing
    if (pedestrian.userData.crossingRoad) {
        const crossDir = pedestrian.userData.crossDirection;
        pedestrian.position.x += crossDir * walkSpeed * 0.3;

        // Rotate to face crossing direction
        const targetRotation = crossDir > 0 ? -Math.PI / 2 : Math.PI / 2;
        pedestrian.rotation.y += (targetRotation - pedestrian.rotation.y) * 0.05;
    }
}

// Spawn pedestrians along the road
function spawnPedestrian(z) {
    const curveX = getRoadCurveAt(z);
    const side = Math.random() > 0.5 ? 1 : -1;
    const offsetFromRoad = 3.5 + Math.random() * 1.5; // On the sidewalk area
    const x = curveX + side * offsetFromRoad;
    const direction = Math.random() > 0.5 ? 1 : -1;

    const pedestrian = createPedestrian(x, z, direction);
    pedestrian.castShadow = true;
    pedestrians.push(pedestrian);
    scene.add(pedestrian);
}

// Check collision with pedestrian
function checkPedestrianCollision() {
    if (!playerCar || !gameActive) return;

    const carBox = new THREE.Box3().setFromObject(playerCar);

    pedestrians.forEach(pedestrian => {
        if (pedestrian.userData.hit) return;

        const pedestrianBox = new THREE.Box3().setFromObject(pedestrian);

        if (carBox.intersectsBox(pedestrianBox)) {
            // Collision with pedestrian!
            pedestrian.userData.hit = true;
            hitPedestrian = true;

            // Play collision sound
            playPedestrianHitSound();

            // Pedestrian reaction - fall down
            pedestrian.rotation.x = -Math.PI / 2;
            pedestrian.position.y = 0.3;

            // Slow down the car
            speed = Math.max(speed * 0.5, 0);

            // Penalty
            score = Math.max(0, score - 100);

            // Flash screen red
            flashScreen('rgba(255, 0, 0, 0.4)');
        }
    });
}

// Play pedestrian hit sound
function playPedestrianHitSound() {
    if (!audioInitialized || !audioContext) return;

    // Impact thud
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.value = 80;
    osc.frequency.linearRampToValueAtTime(40, audioContext.currentTime + 0.2);

    gain.gain.value = 0.4;
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);

    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start();
    osc.stop(audioContext.currentTime + 0.3);
}

// ========== AUTONOMOUS VEHICLES ==========

// Create a sedan/car
function createAutoCar(x, z, lane) {
    const carGroup = new THREE.Group();

    // Random car colors
    const carColors = [0x3498db, 0xe74c3c, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0x34495e, 0xc0392b];
    const bodyColor = carColors[Math.floor(Math.random() * carColors.length)];

    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        metalness: 0.7,
        roughness: 0.3
    });

    const darkMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 0.3,
        roughness: 0.5
    });

    // Lower body
    const lowerBody = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.3, 2.2),
        bodyMaterial
    );
    lowerBody.position.y = 0.25;
    lowerBody.castShadow = true;
    carGroup.add(lowerBody);

    // Upper body/cabin
    const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.35, 1.2),
        bodyMaterial
    );
    cabin.position.set(0, 0.55, -0.2);
    cabin.castShadow = true;
    carGroup.add(cabin);

    // Windows
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a2030,
        metalness: 0.9,
        roughness: 0.1,
        transparent: true,
        opacity: 0.7
    });

    const windshield = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.3, 0.05),
        glassMaterial
    );
    windshield.position.set(0, 0.55, 0.35);
    windshield.rotation.x = -0.3;
    carGroup.add(windshield);

    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.15, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });

    [[-0.55, 0.2, 0.65], [0.55, 0.2, 0.65], [-0.55, 0.2, -0.7], [0.55, 0.2, -0.7]].forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(...pos);
        wheel.userData.isWheel = true;
        carGroup.add(wheel);
    });

    // Headlights
    const lightMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffee,
        emissive: 0xffffaa,
        emissiveIntensity: 0.5
    });

    [[-0.4, 0.3, 1.1], [0.4, 0.3, 1.1]].forEach(pos => {
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.05), lightMaterial);
        light.position.set(...pos);
        carGroup.add(light);
    });

    // Tail lights
    const tailMaterial = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.5
    });

    [[-0.45, 0.3, -1.1], [0.45, 0.3, -1.1]].forEach(pos => {
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.05), tailMaterial);
        light.position.set(...pos);
        carGroup.add(light);
    });

    setupVehicle(carGroup, x, z, lane, 'car', 0.6 + Math.random() * 0.3);
    return carGroup;
}

// Create a motorcycle/bike
function createMotorcycle(x, z, lane) {
    const bikeGroup = new THREE.Group();

    const frameMaterial = new THREE.MeshStandardMaterial({
        color: 0x2c3e50,
        metalness: 0.8,
        roughness: 0.2
    });

    const chromeMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 0.95,
        roughness: 0.1
    });

    // Main frame
    const frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.3, 1.2),
        frameMaterial
    );
    frame.position.y = 0.5;
    frame.rotation.x = 0.1;
    bikeGroup.add(frame);

    // Fuel tank
    const tankColors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x1a1a1a];
    const tankMaterial = new THREE.MeshStandardMaterial({
        color: tankColors[Math.floor(Math.random() * tankColors.length)],
        metalness: 0.7,
        roughness: 0.3
    });

    const tank = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.2, 0.4),
        tankMaterial
    );
    tank.position.set(0, 0.65, 0.1);
    bikeGroup.add(tank);

    // Seat
    const seat = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.1, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 })
    );
    seat.position.set(0, 0.6, -0.3);
    bikeGroup.add(seat);

    // Wheels
    const wheelGeometry = new THREE.TorusGeometry(0.28, 0.08, 8, 24);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });

    const frontWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    frontWheel.rotation.y = Math.PI / 2;
    frontWheel.position.set(0, 0.28, 0.6);
    frontWheel.userData.isWheel = true;
    bikeGroup.add(frontWheel);

    const rearWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    rearWheel.rotation.y = Math.PI / 2;
    rearWheel.position.set(0, 0.28, -0.5);
    rearWheel.userData.isWheel = true;
    bikeGroup.add(rearWheel);

    // Handlebars
    const handlebar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8),
        chromeMaterial
    );
    handlebar.rotation.z = Math.PI / 2;
    handlebar.position.set(0, 0.8, 0.5);
    bikeGroup.add(handlebar);

    // Headlight
    const headlight = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffaa, emissiveIntensity: 0.8 })
    );
    headlight.position.set(0, 0.7, 0.7);
    bikeGroup.add(headlight);

    // Rider
    const riderGroup = createSimpleRider();
    riderGroup.position.set(0, 0.7, -0.15);
    bikeGroup.add(riderGroup);

    setupVehicle(bikeGroup, x, z, lane, 'motorcycle', 0.8 + Math.random() * 0.4);
    return bikeGroup;
}

// Create simple rider figure for motorcycle
function createSimpleRider() {
    const riderGroup = new THREE.Group();

    const helmetMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3 });
    const jacketMaterial = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.7 });

    // Helmet
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), helmetMaterial);
    helmet.position.y = 0.55;
    helmet.scale.set(1, 1.1, 1.2);
    riderGroup.add(helmet);

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.15), jacketMaterial);
    torso.position.y = 0.25;
    torso.rotation.x = 0.3;
    riderGroup.add(torso);

    return riderGroup;
}

// Create a bus
function createBus(x, z, lane) {
    const busGroup = new THREE.Group();

    const busColors = [0x2980b9, 0xc0392b, 0x27ae60, 0xf39c12, 0x8e44ad];
    const busColor = busColors[Math.floor(Math.random() * busColors.length)];

    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: busColor,
        metalness: 0.3,
        roughness: 0.6
    });

    // Main body
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(2.0, 1.8, 5.5),
        bodyMaterial
    );
    body.position.y = 1.1;
    body.castShadow = true;
    busGroup.add(body);

    // Windows strip
    const windowMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a3a4a,
        metalness: 0.8,
        roughness: 0.1,
        transparent: true,
        opacity: 0.7
    });

    // Side windows
    [-1.01, 1.01].forEach(xPos => {
        const windows = new THREE.Mesh(
            new THREE.BoxGeometry(0.02, 0.8, 4.5),
            windowMaterial
        );
        windows.position.set(xPos, 1.4, -0.2);
        busGroup.add(windows);
    });

    // Front windshield
    const windshield = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 1.0, 0.05),
        windowMaterial
    );
    windshield.position.set(0, 1.3, 2.73);
    busGroup.add(windshield);

    // Wheels (6 wheels - front 2, rear 4)
    const wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });

    [[-0.85, 0.35, 2.0], [0.85, 0.35, 2.0],
    [-0.85, 0.35, -1.5], [0.85, 0.35, -1.5],
    [-0.85, 0.35, -2.2], [0.85, 0.35, -2.2]].forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(...pos);
        wheel.userData.isWheel = true;
        busGroup.add(wheel);
    });

    // Headlights
    const lightMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffee,
        emissive: 0xffffaa,
        emissiveIntensity: 0.5
    });

    [[-0.7, 0.6, 2.76], [0.7, 0.6, 2.76]].forEach(pos => {
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.05), lightMaterial);
        light.position.set(...pos);
        busGroup.add(light);
    });

    // Destination sign
    const signMaterial = new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        emissive: 0xffaa00,
        emissiveIntensity: 0.3
    });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.05), signMaterial);
    sign.position.set(0, 1.85, 2.73);
    busGroup.add(sign);

    setupVehicle(busGroup, x, z, lane, 'bus', 0.4 + Math.random() * 0.2);
    return busGroup;
}

// Create a tractor
function createTractor(x, z, lane) {
    const tractorGroup = new THREE.Group();

    const tractorColors = [0x27ae60, 0xe74c3c, 0xf39c12, 0x3498db];
    const tractorColor = tractorColors[Math.floor(Math.random() * tractorColors.length)];

    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: tractorColor,
        metalness: 0.4,
        roughness: 0.6
    });

    // Engine hood
    const hood = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.6, 1.2),
        bodyMaterial
    );
    hood.position.set(0, 0.8, 0.8);
    hood.castShadow = true;
    tractorGroup.add(hood);

    // Cabin
    const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 1.0, 1.0),
        bodyMaterial
    );
    cabin.position.set(0, 1.2, -0.2);
    cabin.castShadow = true;
    tractorGroup.add(cabin);

    // Cabin windows
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0x87ceeb,
        metalness: 0.6,
        roughness: 0.1,
        transparent: true,
        opacity: 0.6
    });

    // Front window
    const frontWindow = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.6, 0.05),
        glassMaterial
    );
    frontWindow.position.set(0, 1.35, 0.28);
    tractorGroup.add(frontWindow);

    // Roof
    const roof = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.08, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 })
    );
    roof.position.set(0, 1.75, -0.2);
    tractorGroup.add(roof);

    // Large rear wheels
    const rearWheelGeometry = new THREE.CylinderGeometry(0.55, 0.55, 0.35, 24);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });

    const leftRear = new THREE.Mesh(rearWheelGeometry, wheelMaterial);
    leftRear.rotation.z = Math.PI / 2;
    leftRear.position.set(-0.65, 0.55, -0.5);
    leftRear.userData.isWheel = true;
    tractorGroup.add(leftRear);

    const rightRear = new THREE.Mesh(rearWheelGeometry, wheelMaterial);
    rightRear.rotation.z = Math.PI / 2;
    rightRear.position.set(0.65, 0.55, -0.5);
    rightRear.userData.isWheel = true;
    tractorGroup.add(rightRear);

    // Smaller front wheels
    const frontWheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);

    const leftFront = new THREE.Mesh(frontWheelGeometry, wheelMaterial);
    leftFront.rotation.z = Math.PI / 2;
    leftFront.position.set(-0.45, 0.3, 1.0);
    leftFront.userData.isWheel = true;
    tractorGroup.add(leftFront);

    const rightFront = new THREE.Mesh(frontWheelGeometry, wheelMaterial);
    rightFront.rotation.z = Math.PI / 2;
    rightFront.position.set(0.45, 0.3, 1.0);
    rightFront.userData.isWheel = true;
    tractorGroup.add(rightFront);

    // Exhaust pipe
    const exhaust = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, 0.6, 8),
        new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.3 })
    );
    exhaust.position.set(0.35, 1.4, 0.6);
    tractorGroup.add(exhaust);

    setupVehicle(tractorGroup, x, z, lane, 'tractor', 0.25 + Math.random() * 0.15);
    return tractorGroup;
}

// Create a truck
function createTruck(x, z, lane) {
    const truckGroup = new THREE.Group();

    const cabColors = [0x2980b9, 0xc0392b, 0xf39c12, 0x1a1a1a, 0x2c3e50];
    const cabColor = cabColors[Math.floor(Math.random() * cabColors.length)];

    const cabMaterial = new THREE.MeshStandardMaterial({
        color: cabColor,
        metalness: 0.5,
        roughness: 0.5
    });

    // Cab
    const cab = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 1.4, 1.5),
        cabMaterial
    );
    cab.position.set(0, 1.0, 1.5);
    cab.castShadow = true;
    truckGroup.add(cab);

    // Trailer/cargo
    const trailerMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 0.3,
        roughness: 0.7
    });

    const trailer = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 1.6, 4.0),
        trailerMaterial
    );
    trailer.position.set(0, 1.1, -1.0);
    trailer.castShadow = true;
    truckGroup.add(trailer);

    // Windshield
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a3a4a,
        metalness: 0.8,
        roughness: 0.1,
        transparent: true,
        opacity: 0.7
    });

    const windshield = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.8, 0.05),
        glassMaterial
    );
    windshield.position.set(0, 1.2, 2.23);
    truckGroup.add(windshield);

    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });

    [[-0.8, 0.35, 1.8], [0.8, 0.35, 1.8],
    [-0.8, 0.35, -1.5], [0.8, 0.35, -1.5],
    [-0.8, 0.35, -2.5], [0.8, 0.35, -2.5]].forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(...pos);
        wheel.userData.isWheel = true;
        truckGroup.add(wheel);
    });

    // Headlights
    const lightMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffee,
        emissive: 0xffffaa,
        emissiveIntensity: 0.5
    });

    [[-0.65, 0.6, 2.26], [0.65, 0.6, 2.26]].forEach(pos => {
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.05), lightMaterial);
        light.position.set(...pos);
        truckGroup.add(light);
    });

    setupVehicle(truckGroup, x, z, lane, 'truck', 0.45 + Math.random() * 0.2);
    return truckGroup;
}

// Create a van
function createVan(x, z, lane) {
    const vanGroup = new THREE.Group();

    const vanColors = [0xffffff, 0x3498db, 0xf39c12, 0x95a5a6, 0x2ecc71];
    const vanColor = vanColors[Math.floor(Math.random() * vanColors.length)];

    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: vanColor,
        metalness: 0.4,
        roughness: 0.5
    });

    // Main body
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.4, 3.2),
        bodyMaterial
    );
    body.position.y = 0.9;
    body.castShadow = true;
    vanGroup.add(body);

    // Windshield
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a3a4a,
        metalness: 0.8,
        roughness: 0.1,
        transparent: true,
        opacity: 0.7
    });

    const windshield = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.7, 0.05),
        glassMaterial
    );
    windshield.position.set(0, 1.1, 1.58);
    windshield.rotation.x = -0.15;
    vanGroup.add(windshield);

    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.2, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });

    [[-0.7, 0.28, 1.0], [0.7, 0.28, 1.0], [-0.7, 0.28, -1.0], [0.7, 0.28, -1.0]].forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(...pos);
        wheel.userData.isWheel = true;
        vanGroup.add(wheel);
    });

    // Headlights
    const lightMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffee,
        emissive: 0xffffaa,
        emissiveIntensity: 0.5
    });

    [[-0.55, 0.55, 1.61], [0.55, 0.55, 1.61]].forEach(pos => {
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.05), lightMaterial);
        light.position.set(...pos);
        vanGroup.add(light);
    });

    setupVehicle(vanGroup, x, z, lane, 'van', 0.5 + Math.random() * 0.25);
    return vanGroup;
}

// Create a sports car
function createSportsCar(x, z, lane) {
    const carGroup = new THREE.Group();

    const sportsColors = [0xff0000, 0xffff00, 0xff6600, 0x00ff00, 0x0066ff];
    const bodyColor = sportsColors[Math.floor(Math.random() * sportsColors.length)];

    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: bodyColor,
        metalness: 0.85,
        roughness: 0.15
    });

    // Low sleek body
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.25, 2.8),
        bodyMaterial
    );
    body.position.y = 0.22;
    body.castShadow = true;
    carGroup.add(body);

    // Sloped front
    const front = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.15, 0.8),
        bodyMaterial
    );
    front.position.set(0, 0.28, 1.1);
    front.rotation.x = -0.2;
    carGroup.add(front);

    // Cockpit
    const cockpit = new THREE.Mesh(
        new THREE.BoxGeometry(1.1, 0.25, 0.9),
        bodyMaterial
    );
    cockpit.position.set(0, 0.42, -0.3);
    carGroup.add(cockpit);

    // Windshield
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a2030,
        metalness: 0.9,
        roughness: 0.05,
        transparent: true,
        opacity: 0.7
    });

    const windshield = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.25, 0.05),
        glassMaterial
    );
    windshield.position.set(0, 0.45, 0.12);
    windshield.rotation.x = -0.6;
    carGroup.add(windshield);

    // Wheels - low profile
    const wheelGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.18, 20);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });

    [[-0.65, 0.2, 0.85], [0.65, 0.2, 0.85], [-0.65, 0.2, -0.9], [0.65, 0.2, -0.9]].forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(...pos);
        wheel.userData.isWheel = true;
        carGroup.add(wheel);
    });

    // Rear spoiler
    const spoiler = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.05, 0.15),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 })
    );
    spoiler.position.set(0, 0.5, -1.3);
    carGroup.add(spoiler);

    const spoilerStands = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.15, 0.05),
        new THREE.MeshStandardMaterial({ color: 0x1a1a1a })
    );
    [[-0.5, 0.42, -1.3], [0.5, 0.42, -1.3]].forEach(pos => {
        const stand = spoilerStands.clone();
        stand.position.set(...pos);
        carGroup.add(stand);
    });

    setupVehicle(carGroup, x, z, lane, 'sportscar', 0.9 + Math.random() * 0.4);
    return carGroup;
}

// Setup common vehicle properties
function setupVehicle(vehicle, x, z, lane, type, baseVehicleSpeed, isOncoming = false) {
    vehicle.position.set(x, 0, z);
    vehicle.rotation.y = isOncoming ? 0 : Math.PI; // Face opposite direction if oncoming
    vehicle.userData.isVehicle = true;
    vehicle.userData.vehicleType = type;
    vehicle.userData.lane = lane;
    vehicle.userData.speed = baseVehicleSpeed;
    vehicle.userData.passed = false;
    vehicle.userData.hit = false;
    vehicle.userData.isOncoming = isOncoming;
    vehicle.userData.nearMissTriggered = false;
    vehicle.castShadow = true;
}

// Spawn a random vehicle (same direction - player's lanes)
function spawnVehicle(z) {
    const curveX = getRoadCurveAt(z);
    // Player's side lanes (right side of road): 1.5 to 5.5
    const lane = Math.random() > 0.5 ? 2.0 : 5.0; // Inner or outer lane on right side
    const x = curveX + lane;

    const vehicleTypes = [
        { create: createAutoCar, weight: 30 },
        { create: createMotorcycle, weight: 15 },
        { create: createBus, weight: 10 },
        { create: createTractor, weight: 8 },
        { create: createTruck, weight: 15 },
        { create: createVan, weight: 12 },
        { create: createSportsCar, weight: 10 }
    ];

    // Weighted random selection
    const totalWeight = vehicleTypes.reduce((sum, v) => sum + v.weight, 0);
    let random = Math.random() * totalWeight;
    let selected = vehicleTypes[0];

    for (const vType of vehicleTypes) {
        random -= vType.weight;
        if (random <= 0) {
            selected = vType;
            break;
        }
    }

    const vehicle = selected.create(x, z, lane);
    autonomousVehicles.push(vehicle);
    scene.add(vehicle);
}

// Spawn oncoming traffic (opposite direction - left lanes)
function spawnOncomingVehicle(z) {
    const curveX = getRoadCurveAt(z);
    // Oncoming lanes (left side of road): -5.5 to -1.5
    const lane = Math.random() > 0.5 ? -2.0 : -5.0; // Inner or outer lane on left side
    const x = curveX + lane;

    // Oncoming vehicles - mostly cars and trucks, no tractors
    const vehicleTypes = [
        { create: createAutoCar, weight: 35 },
        { create: createMotorcycle, weight: 15 },
        { create: createBus, weight: 12 },
        { create: createTruck, weight: 18 },
        { create: createVan, weight: 12 },
        { create: createSportsCar, weight: 8 }
    ];

    const totalWeight = vehicleTypes.reduce((sum, v) => sum + v.weight, 0);
    let random = Math.random() * totalWeight;
    let selected = vehicleTypes[0];

    for (const vType of vehicleTypes) {
        random -= vType.weight;
        if (random <= 0) {
            selected = vType;
            break;
        }
    }

    // Create vehicle with oncoming flag
    const vehicle = selected.create(x, z, lane);
    // Override to make it oncoming
    vehicle.rotation.y = 0; // Face towards player
    vehicle.userData.isOncoming = true;
    vehicle.userData.nearMissTriggered = false;
    // Oncoming vehicles are faster relative to player
    vehicle.userData.speed = vehicle.userData.speed * 1.5 + 0.3;

    autonomousVehicles.push(vehicle);
    scene.add(vehicle);
}

// Update autonomous vehicles
function updateAutonomousVehicles() {
    if (!playerCar) return;

    // Spawn new vehicles ahead (same direction)
    if (playerCar.position.z < lastVehicleZ - VEHICLE_SPAWN_INTERVAL) {
        if (Math.random() > 0.3) { // 70% chance to spawn
            spawnVehicle(lastVehicleZ - 60 - Math.random() * 30);
        }
        lastVehicleZ -= VEHICLE_SPAWN_INTERVAL;
    }

    // Spawn oncoming traffic
    if (playerCar.position.z < lastOncomingVehicleZ - ONCOMING_SPAWN_INTERVAL) {
        if (Math.random() > 0.25) { // 75% chance to spawn oncoming
            spawnOncomingVehicle(lastOncomingVehicleZ - 80 - Math.random() * 40);
        }
        lastOncomingVehicleZ -= ONCOMING_SPAWN_INTERVAL;
    }

    // Update each vehicle
    autonomousVehicles.forEach(vehicle => {
        if (vehicle.userData.hit) return;

        const vehicleSpeed = vehicle.userData.speed * 0.5;

        if (vehicle.userData.isOncoming) {
            // Oncoming traffic moves towards player
            vehicle.position.z += vehicleSpeed;

            // Animate wheels in opposite direction
            vehicle.children.forEach(child => {
                if (child.userData.isWheel) {
                    child.rotation.x += vehicleSpeed * 0.3;
                }
            });

            // Rotate to follow road (opposite direction)
            const roadDir = getRoadDirectionAt(vehicle.position.z);
            vehicle.rotation.y = roadDir; // Facing player

            // Check for near miss (close call)
            if (!vehicle.userData.nearMissTriggered) {
                const xDist = Math.abs(vehicle.position.x - playerCar.position.x);
                const zDist = Math.abs(vehicle.position.z - playerCar.position.z);
                if (zDist < 5 && xDist < 2.5 && xDist > 1.5) {
                    vehicle.userData.nearMissTriggered = true;
                    nearMisses++;
                    score += 25; // Bonus for near miss
                    playNearMissSound();
                }
            }
        } else {
            // Same direction traffic moves away from player (slower)
            vehicle.position.z -= vehicleSpeed;

            // Animate wheels
            vehicle.children.forEach(child => {
                if (child.userData.isWheel) {
                    child.rotation.x -= vehicleSpeed * 0.3;
                }
            });

            // Rotate to follow road
            const roadDir = getRoadDirectionAt(vehicle.position.z);
            vehicle.rotation.y = Math.PI + roadDir;

            // Check if player passed this vehicle
            if (!vehicle.userData.passed && playerCar.position.z < vehicle.position.z - 3) {
                vehicle.userData.passed = true;
                vehiclesOvertaken++;
                score += 10; // Bonus for overtaking
            }
        }

        // Keep vehicle on the curved road
        const curveX = getRoadCurveAt(vehicle.position.z);
        const targetX = curveX + vehicle.userData.lane;
        vehicle.position.x += (targetX - vehicle.position.x) * 0.1;
    });

    // Remove vehicles that are too far behind or ahead
    autonomousVehicles = autonomousVehicles.filter(vehicle => {
        const tooFarBehind = vehicle.position.z > playerCar.position.z + 50;
        const tooFarAhead = vehicle.position.z < playerCar.position.z - 150;
        if (tooFarBehind || tooFarAhead) {
            scene.remove(vehicle);
            return false;
        }
        return true;
    });

    // Check collisions with vehicles
    checkVehicleCollision();
}

// Play near miss sound
function playNearMissSound() {
    if (!audioInitialized || !audioContext) return;

    // Whoosh sound for near miss
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.value = 800;
    osc.frequency.linearRampToValueAtTime(200, audioContext.currentTime + 0.3);

    gain.gain.value = 0.15;
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start();
    osc.stop(audioContext.currentTime + 0.4);
}

// Check collision with other vehicles
function checkVehicleCollision() {
    if (!playerCar || !gameActive) return;

    const carBox = new THREE.Box3().setFromObject(playerCar);
    // Shrink hitbox slightly for more forgiving collisions
    carBox.min.x += 0.2;
    carBox.max.x -= 0.2;
    carBox.min.z += 0.3;
    carBox.max.z -= 0.3;

    autonomousVehicles.forEach(vehicle => {
        if (vehicle.userData.hit) return;

        const vehicleBox = new THREE.Box3().setFromObject(vehicle);

        if (carBox.intersectsBox(vehicleBox)) {
            // Collision!
            vehicle.userData.hit = true;

            // Oncoming collision is more severe
            const isOncoming = vehicle.userData.isOncoming;

            // Play crash sound
            playVehicleCrashSound();

            // Slow down - more severe for oncoming collision
            if (isOncoming) {
                speed = 0; // Full stop for head-on collision
                score = Math.max(0, score - 150); // Double penalty
                flashScreen('rgba(255, 0, 0, 0.7)');
            } else {
                speed = Math.max(speed * 0.3, 0);
                score = Math.max(0, score - 75);
                flashScreen('rgba(255, 50, 0, 0.5)');
            }
        }
    });
}

// Play vehicle crash sound
function playVehicleCrashSound() {
    if (!audioInitialized || !audioContext) return;

    // Metallic crash
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = 150;
    osc.frequency.linearRampToValueAtTime(50, audioContext.currentTime + 0.3);

    gain.gain.value = 0.4;
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4);

    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start();
    osc.stop(audioContext.currentTime + 0.4);

    // Add noise burst
    const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.3, audioContext.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i++) {
        noiseData[i] = (Math.random() * 2 - 1) * (1 - i / noiseData.length);
    }

    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const noiseGain = audioContext.createGain();
    noiseGain.gain.value = 0.25;

    noiseSource.connect(noiseGain);
    noiseGain.connect(masterGain);
    noiseSource.start();
}

// Flash screen effect
function flashScreen(color) {
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: ${color};
        pointer-events: none;
        z-index: 1000;
        animation: flashFade 0.3s ease-out forwards;
    `;
    document.body.appendChild(flash);

    setTimeout(() => flash.remove(), 300);
}

// Update pedestrians
function updatePedestrians() {
    if (!playerCar) return;

    // Spawn new pedestrians ahead
    if (playerCar.position.z < lastPedestrianZ - 8) {
        if (Math.random() > 0.4) { // 60% chance to spawn
            spawnPedestrian(lastPedestrianZ - 80 - Math.random() * 20);
        }
        lastPedestrianZ -= 8;
    }

    // Update and animate pedestrians
    pedestrians.forEach(pedestrian => {
        if (!pedestrian.userData.hit) {
            animatePedestrian(pedestrian, 1 / 60);
        }
    });

    // Remove pedestrians that are too far behind
    pedestrians = pedestrians.filter(pedestrian => {
        if (pedestrian.position.z > playerCar.position.z + 30) {
            if (!pedestrian.userData.hit) {
                pedestriansAvoided++;
            }
            scene.remove(pedestrian);
            return false;
        }
        return true;
    });

    // Check collisions
    checkPedestrianCollision();
}

// Populate nature elements along the road
function createNatureElements() {
    ground = createGround();

    // Create initial trees along both sides of the road
    for (let i = 0; i < 20; i++) {
        const z = -i * 5 + 10;
        generateEnvironmentAtZ(z);
    }

    // Create initial pedestrians
    for (let i = 0; i < 8; i++) {
        spawnPedestrian(-i * 12 - 20);
    }

    // Create initial crossroads with traffic lights
    spawnCrossroad(-50);
    spawnCrossroad(-130);

    // Create initial autonomous vehicles (same direction)
    for (let i = 0; i < 5; i++) {
        spawnVehicle(-40 - i * 25);
    }

    // Create initial oncoming vehicles
    for (let i = 0; i < 3; i++) {
        spawnOncomingVehicle(-60 - i * 35);
    }
}

// Generate environment objects at a specific Z position
function generateEnvironmentAtZ(z) {
    // Get road curve offset at this Z position
    const curveX = getRoadCurveAt(z);

    // Road is now wider (guard rails at ±6.8), so place objects beyond that
    const roadEdgeOffset = 8; // Minimum distance from road center

    // Left side trees (relative to curved road)
    if (Math.random() > 0.3) {
        const tree = createTree(curveX - roadEdgeOffset - Math.random() * 4, z);
        tree.userData.isEnvironment = true;
        environmentObjects.push(tree);
        scene.add(tree);
    }

    // Right side trees (relative to curved road)
    if (Math.random() > 0.3) {
        const tree = createTree(curveX + roadEdgeOffset + Math.random() * 4, z);
        tree.userData.isEnvironment = true;
        environmentObjects.push(tree);
        scene.add(tree);
    }

    // Bushes
    if (Math.random() > 0.5) {
        const bush = createBush(curveX - roadEdgeOffset - 0.5 - Math.random() * 2, z + Math.random() * 2);
        bush.userData.isEnvironment = true;
        environmentObjects.push(bush);
        scene.add(bush);
    }

    if (Math.random() > 0.5) {
        const bush = createBush(curveX + roadEdgeOffset + 0.5 + Math.random() * 2, z + Math.random() * 2);
        bush.userData.isEnvironment = true;
        environmentObjects.push(bush);
        scene.add(bush);
    }

    // Rocks
    if (Math.random() > 0.7) {
        const rock = createRock(curveX - roadEdgeOffset - 1 - Math.random() * 2, z + Math.random() * 2);
        rock.userData.isEnvironment = true;
        environmentObjects.push(rock);
        scene.add(rock);
    }

    if (Math.random() > 0.7) {
        const rock = createRock(curveX + roadEdgeOffset + 1 + Math.random() * 2, z + Math.random() * 2);
        rock.userData.isEnvironment = true;
        environmentObjects.push(rock);
        scene.add(rock);
    }

    // Buildings (less frequent, further from road)
    if (Math.random() > 0.85) {
        const building = createBuilding(curveX - roadEdgeOffset - 6 - Math.random() * 8, z);
        building.userData.isEnvironment = true;
        environmentObjects.push(building);
        scene.add(building);
    }

    if (Math.random() > 0.85) {
        const building = createBuilding(curveX + roadEdgeOffset + 6 + Math.random() * 8, z);
        building.userData.isEnvironment = true;
        environmentObjects.push(building);
        scene.add(building);
    }
}

// Update environment dynamically
function updateEnvironment() {
    // Move ground with the car - larger offset for bigger ground
    if (ground) {
        ground.position.z = playerCar.position.z - 300;
        // Also move ground X to follow road curve center
        const avgCurve = getRoadCurveAt(playerCar.position.z - 100);
        ground.position.x = avgCurve;
    }

    // Update road curves
    updateRoadCurves();

    // Generate new environment ahead of the car
    if (playerCar.position.z < lastTreeZ - 5) {
        generateEnvironmentAtZ(lastTreeZ - 100);
        lastTreeZ -= 5;
    }

    // Remove environment objects that are too far behind
    environmentObjects = environmentObjects.filter(obj => {
        if (obj.position.z > playerCar.position.z + 20) {
            scene.remove(obj);
            return false;
        }
        return true;
    });
}

// Create the curved road
function createRoad() {
    road = new THREE.Group();

    // Initialize road segments at fixed world positions
    for (let i = 0; i < ROAD_VISIBLE_SEGMENTS; i++) {
        const segmentZ = -i * ROAD_SEGMENT_LENGTH + 50; // Start ahead of player
        const segment = createRoadSegment(i, segmentZ);
        roadSegments.push(segment);
        road.add(segment.group);
    }

    scene.add(road);
}

// Create a single road segment at a specific Z position
function createRoadSegment(index, worldZ) {
    const segmentGroup = new THREE.Group();

    // Road shoulder/dirt edge - wider for dual carriageway
    const shoulderGeometry = new THREE.PlaneGeometry(16, ROAD_SEGMENT_LENGTH + 0.5);
    const shoulderMaterial = new THREE.MeshStandardMaterial({
        color: 0x5a4a3a,
        roughness: 0.95
    });
    const shoulder = new THREE.Mesh(shoulderGeometry, shoulderMaterial);
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.y = -0.02;
    shoulder.receiveShadow = true;
    segmentGroup.add(shoulder);

    // Main road asphalt - player's side (right lanes)
    const roadGeometry = new THREE.PlaneGeometry(6, ROAD_SEGMENT_LENGTH + 0.5);
    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a35,
        roughness: 0.85,
        metalness: 0.05
    });
    const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.set(3.5, 0, 0);
    roadMesh.receiveShadow = true;
    segmentGroup.add(roadMesh);

    // Oncoming lane asphalt (left lanes)
    const oncomingRoad = new THREE.Mesh(roadGeometry, roadMaterial);
    oncomingRoad.rotation.x = -Math.PI / 2;
    oncomingRoad.position.set(-3.5, 0, 0);
    oncomingRoad.receiveShadow = true;
    segmentGroup.add(oncomingRoad);

    // Center median/divider
    const medianGeometry = new THREE.BoxGeometry(0.8, 0.15, ROAD_SEGMENT_LENGTH + 0.5);
    const medianMaterial = new THREE.MeshStandardMaterial({
        color: 0x4a4a4a,
        roughness: 0.9
    });
    const median = new THREE.Mesh(medianGeometry, medianMaterial);
    median.position.set(0, 0.08, 0);
    median.castShadow = true;
    segmentGroup.add(median);

    // Yellow center lines on median
    const yellowLineMaterial = new THREE.MeshStandardMaterial({
        color: 0xffcc00,
        roughness: 0.5
    });
    const yellowLineGeometry = new THREE.BoxGeometry(0.1, 0.02, ROAD_SEGMENT_LENGTH);

    const leftYellow = new THREE.Mesh(yellowLineGeometry, yellowLineMaterial);
    leftYellow.position.set(-0.45, 0.16, 0);
    segmentGroup.add(leftYellow);

    const rightYellow = new THREE.Mesh(yellowLineGeometry, yellowLineMaterial);
    rightYellow.position.set(0.45, 0.16, 0);
    segmentGroup.add(rightYellow);

    const lineMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5
    });

    // Lane divider on player's side (dashed)
    const lineGeometry = new THREE.BoxGeometry(0.12, 0.02, 3);
    const laneDivider = new THREE.Mesh(lineGeometry, lineMaterial);
    laneDivider.position.set(3.5, 0.01, 0);
    segmentGroup.add(laneDivider);

    // Lane divider on oncoming side (dashed)
    const oncomingDivider = new THREE.Mesh(lineGeometry, lineMaterial);
    oncomingDivider.position.set(-3.5, 0.01, 0);
    segmentGroup.add(oncomingDivider);

    // Edge lines
    const edgeGeometry = new THREE.BoxGeometry(0.1, 0.02, ROAD_SEGMENT_LENGTH);

    // Right edge (player's far right)
    const rightEdge = new THREE.Mesh(edgeGeometry, lineMaterial);
    rightEdge.position.set(6.3, 0.01, 0);
    segmentGroup.add(rightEdge);

    // Left edge (oncoming far left)
    const leftEdge = new THREE.Mesh(edgeGeometry, lineMaterial);
    leftEdge.position.set(-6.3, 0.01, 0);
    segmentGroup.add(leftEdge);

    // Guard rails
    const guardRailGeometry = new THREE.BoxGeometry(0.15, 0.4, ROAD_SEGMENT_LENGTH);
    const guardRailMaterial = new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 0.6,
        roughness: 0.3
    });

    const rightGuardRail = new THREE.Mesh(guardRailGeometry, guardRailMaterial);
    rightGuardRail.position.set(6.8, 0.2, 0);
    rightGuardRail.castShadow = true;
    segmentGroup.add(rightGuardRail);

    const leftGuardRail = new THREE.Mesh(guardRailGeometry, guardRailMaterial);
    leftGuardRail.position.set(-6.8, 0.2, 0);
    leftGuardRail.castShadow = true;
    segmentGroup.add(leftGuardRail);

    // Set segment position with curve applied
    segmentGroup.position.z = worldZ;
    const curveX = getRoadCurveAt(worldZ);
    segmentGroup.position.x = curveX;

    // Rotate segment to follow curve direction
    const direction = getRoadDirectionAt(worldZ);
    segmentGroup.rotation.y = direction;

    return {
        group: segmentGroup,
        worldZ: worldZ,
        curveX: curveX,
        index: index
    };
}

// Generate curve offset for a position
function getRoadCurveAt(z) {
    // Use multiple sine waves for natural-looking curves
    // Lower frequency = longer, more gradual curves
    const curve1 = Math.sin(z * 0.004) * 18;  // Long sweeping curves
    const curve2 = Math.sin(z * 0.0015 + 1.5) * 12; // Very long gentle curves
    const curve3 = Math.sin(z * 0.008) * 6;   // Medium curves for variety
    return curve1 + curve2 + curve3;
}

// Get road direction (tangent) at a position
function getRoadDirectionAt(z) {
    const delta = 0.1;
    const x1 = getRoadCurveAt(z - delta);
    const x2 = getRoadCurveAt(z + delta);
    return Math.atan2(x2 - x1, delta * 2);
}

// Update road segment positions - only recycle segments that are behind the player
function updateRoadCurves() {
    if (!playerCar) return;

    const playerZ = playerCar.position.z;
    const recycleDistance = 30; // Distance behind player to recycle
    const totalRoadLength = ROAD_VISIBLE_SEGMENTS * ROAD_SEGMENT_LENGTH;

    roadSegments.forEach((segment) => {
        // Check if segment is too far behind the player
        if (segment.worldZ > playerZ + recycleDistance) {
            // Move this segment to the front of the road
            segment.worldZ -= totalRoadLength;

            // Update position with curve
            segment.group.position.z = segment.worldZ;
            const curveX = getRoadCurveAt(segment.worldZ);
            segment.group.position.x = curveX;

            // Rotate segment to follow curve direction
            const direction = getRoadDirectionAt(segment.worldZ);
            segment.group.rotation.y = direction;

            segment.curveX = curveX;
        }
    });
}

// Create player car - Modern BMW-style sedan
function createPlayerCar() {
    const carGroup = new THREE.Group();

    // Main body color - white metallic like BMW
    const bodyMaterial = new THREE.MeshStandardMaterial({
        color: 0xf5f5f5,
        metalness: 0.8,
        roughness: 0.2
    });

    // Dark accents for lower body and trim
    const darkTrimMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 0.3,
        roughness: 0.4
    });

    // Lower body - wide and sleek
    const lowerBodyGeometry = new THREE.BoxGeometry(1.5, 0.35, 2.6);
    const lowerBody = new THREE.Mesh(lowerBodyGeometry, bodyMaterial);
    lowerBody.position.y = 0.28;
    lowerBody.castShadow = true;
    lowerBody.receiveShadow = true;
    carGroup.add(lowerBody);

    // Side skirts (dark trim)
    const sideSkirtGeometry = new THREE.BoxGeometry(1.55, 0.08, 2.4);
    const sideSkirt = new THREE.Mesh(sideSkirtGeometry, darkTrimMaterial);
    sideSkirt.position.y = 0.12;
    carGroup.add(sideSkirt);

    // Hood - sloping down towards front
    const hoodGeometry = new THREE.BoxGeometry(1.4, 0.08, 0.9);
    const hood = new THREE.Mesh(hoodGeometry, bodyMaterial);
    hood.position.set(0, 0.48, 0.75);
    hood.rotation.x = -0.12;
    hood.castShadow = true;
    carGroup.add(hood);

    // Front bumper/fascia
    const frontBumperGeometry = new THREE.BoxGeometry(1.5, 0.25, 0.15);
    const frontBumper = new THREE.Mesh(frontBumperGeometry, darkTrimMaterial);
    frontBumper.position.set(0, 0.22, 1.3);
    carGroup.add(frontBumper);

    // BMW Kidney grille - left
    const grilleGeometry = new THREE.BoxGeometry(0.28, 0.18, 0.08);
    const grilleMaterial = new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        metalness: 0.8,
        roughness: 0.2
    });
    const leftGrille = new THREE.Mesh(grilleGeometry, grilleMaterial);
    leftGrille.position.set(-0.18, 0.38, 1.25);
    carGroup.add(leftGrille);

    // BMW Kidney grille - right
    const rightGrille = new THREE.Mesh(grilleGeometry, grilleMaterial);
    rightGrille.position.set(0.18, 0.38, 1.25);
    carGroup.add(rightGrille);

    // Grille chrome surround
    const grilleSurroundMaterial = new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 0.95,
        roughness: 0.1
    });

    // Windshield - raked back
    const windshieldGeometry = new THREE.BoxGeometry(1.25, 0.5, 0.08);
    const glassMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a2030,
        metalness: 0.9,
        roughness: 0.05,
        transparent: true,
        opacity: 0.7
    });
    const windshield = new THREE.Mesh(windshieldGeometry, glassMaterial);
    windshield.position.set(0, 0.7, 0.25);
    windshield.rotation.x = -0.45;
    carGroup.add(windshield);

    // Roof - sleek coupe-like roofline
    const roofGeometry = new THREE.BoxGeometry(1.2, 0.1, 1.1);
    const roof = new THREE.Mesh(roofGeometry, bodyMaterial);
    roof.position.set(0, 0.82, -0.35);
    roof.castShadow = true;
    carGroup.add(roof);

    // Rear window - sloping
    const rearWindowGeometry = new THREE.BoxGeometry(1.15, 0.4, 0.08);
    const rearWindow = new THREE.Mesh(rearWindowGeometry, glassMaterial);
    rearWindow.position.set(0, 0.68, -0.85);
    rearWindow.rotation.x = 0.5;
    carGroup.add(rearWindow);

    // Side windows - left
    const sideWindowGeometry = new THREE.BoxGeometry(0.04, 0.28, 0.9);
    const leftWindow = new THREE.Mesh(sideWindowGeometry, glassMaterial);
    leftWindow.position.set(-0.62, 0.68, -0.2);
    carGroup.add(leftWindow);

    // Side windows - right  
    const rightWindow = new THREE.Mesh(sideWindowGeometry, glassMaterial);
    rightWindow.position.set(0.62, 0.68, -0.2);
    carGroup.add(rightWindow);

    // Trunk/rear
    const trunkGeometry = new THREE.BoxGeometry(1.4, 0.3, 0.5);
    const trunk = new THREE.Mesh(trunkGeometry, bodyMaterial);
    trunk.position.set(0, 0.42, -1.05);
    trunk.castShadow = true;
    carGroup.add(trunk);

    // Rear bumper
    const rearBumperGeometry = new THREE.BoxGeometry(1.5, 0.2, 0.1);
    const rearBumper = new THREE.Mesh(rearBumperGeometry, darkTrimMaterial);
    rearBumper.position.set(0, 0.2, -1.3);
    carGroup.add(rearBumper);

    // Sporty black alloy wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.26, 0.26, 0.2, 24);
    const wheelMaterial = new THREE.MeshStandardMaterial({
        color: 0x0a0a0a,
        metalness: 0.4,
        roughness: 0.6
    });

    // Alloy rim with spokes effect
    const rimGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.21, 12);
    const rimMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        metalness: 0.95,
        roughness: 0.1
    });

    // Center cap
    const capGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.22, 16);
    const capMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 0.9,
        roughness: 0.2
    });

    const wheelPositions = [
        [-0.72, 0.26, 0.8],
        [0.72, 0.26, 0.8],
        [-0.72, 0.26, -0.85],
        [0.72, 0.26, -0.85]
    ];

    wheelPositions.forEach(pos => {
        // Tire
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(...pos);
        wheel.castShadow = true;
        wheel.userData.isWheel = true;
        carGroup.add(wheel);

        // Rim
        const rim = new THREE.Mesh(rimGeometry, rimMaterial);
        rim.rotation.z = Math.PI / 2;
        rim.position.set(pos[0] * 1.01, pos[1], pos[2]);
        rim.userData.isWheel = true;
        carGroup.add(rim);

        // Center cap
        const cap = new THREE.Mesh(capGeometry, capMaterial);
        cap.rotation.z = Math.PI / 2;
        cap.position.set(pos[0] * 1.02, pos[1], pos[2]);
        cap.userData.isWheel = true;
        carGroup.add(cap);
    });

    // LED Headlights - angular BMW style
    const headlightGeometry = new THREE.BoxGeometry(0.32, 0.1, 0.06);
    const headlightMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffee,
        emissiveIntensity: 1.0
    });

    const leftHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
    leftHeadlight.position.set(-0.52, 0.38, 1.28);
    carGroup.add(leftHeadlight);

    const rightHeadlight = new THREE.Mesh(headlightGeometry, headlightMaterial);
    rightHeadlight.position.set(0.52, 0.38, 1.28);
    carGroup.add(rightHeadlight);

    // DRL accent lights
    const drlGeometry = new THREE.BoxGeometry(0.25, 0.03, 0.04);
    const drlMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.8
    });

    const leftDRL = new THREE.Mesh(drlGeometry, drlMaterial);
    leftDRL.position.set(-0.52, 0.32, 1.29);
    carGroup.add(leftDRL);

    const rightDRL = new THREE.Mesh(drlGeometry, drlMaterial);
    rightDRL.position.set(0.52, 0.32, 1.29);
    carGroup.add(rightDRL);

    // Tail lights - L-shaped BMW style
    const tailLightGeometry = new THREE.BoxGeometry(0.25, 0.08, 0.04);
    const tailLightMaterial = new THREE.MeshStandardMaterial({
        color: 0xff1a1a,
        emissive: 0xff0000,
        emissiveIntensity: 0.7
    });

    const leftTail = new THREE.Mesh(tailLightGeometry, tailLightMaterial);
    leftTail.position.set(-0.55, 0.45, -1.28);
    carGroup.add(leftTail);

    const rightTail = new THREE.Mesh(tailLightGeometry, tailLightMaterial);
    rightTail.position.set(0.55, 0.45, -1.28);
    carGroup.add(rightTail);

    // Tail light vertical elements
    const tailVertGeometry = new THREE.BoxGeometry(0.04, 0.15, 0.04);
    const leftTailVert = new THREE.Mesh(tailVertGeometry, tailLightMaterial);
    leftTailVert.position.set(-0.68, 0.42, -1.25);
    carGroup.add(leftTailVert);

    const rightTailVert = new THREE.Mesh(tailVertGeometry, tailLightMaterial);
    rightTailVert.position.set(0.68, 0.42, -1.25);
    carGroup.add(rightTailVert);

    // Exhaust tips
    const exhaustGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12);
    const exhaustMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        metalness: 0.9,
        roughness: 0.2
    });

    const leftExhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
    leftExhaust.rotation.x = Math.PI / 2;
    leftExhaust.position.set(-0.45, 0.12, -1.35);
    carGroup.add(leftExhaust);

    const rightExhaust = new THREE.Mesh(exhaustGeometry, exhaustMaterial);
    rightExhaust.rotation.x = Math.PI / 2;
    rightExhaust.position.set(0.45, 0.12, -1.35);
    carGroup.add(rightExhaust);

    // Side mirrors
    const mirrorGeometry = new THREE.BoxGeometry(0.08, 0.06, 0.12);
    const mirrorMaterial = new THREE.MeshStandardMaterial({
        color: 0xf5f5f5,
        metalness: 0.8,
        roughness: 0.2
    });

    const leftMirror = new THREE.Mesh(mirrorGeometry, mirrorMaterial);
    leftMirror.position.set(-0.78, 0.6, 0.4);
    carGroup.add(leftMirror);

    const rightMirror = new THREE.Mesh(mirrorGeometry, mirrorMaterial);
    rightMirror.position.set(0.78, 0.6, 0.4);
    carGroup.add(rightMirror);

    // Contact shadow under the car for visual grounding
    const shadowGeometry = new THREE.PlaneGeometry(2.0, 3.2);
    const shadowMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.4,
        depthWrite: false
    });
    const contactShadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(0, 0.01, -0.1);
    carGroup.add(contactShadow);

    // Position car so wheels touch the ground
    carGroup.position.set(0, 0, 2);
    // Rotate car to face forward (front visible to camera)
    carGroup.rotation.y = Math.PI;
    playerCar = carGroup;
    scene.add(playerCar);
}

// Check if player is at a junction and can turn
function updateJunctionTurning() {
    if (!playerCar || turningState !== 'none') return;

    const carZ = playerCar.position.z;
    const carX = playerCar.position.x;

    // Check each crossroad
    for (const crossroad of crossroads) {
        const junctionZ = crossroad.userData.worldZ;
        const junctionX = crossroad.userData.curveX;

        // Check if car is within junction area
        const zDist = Math.abs(carZ - junctionZ);
        const xDist = Math.abs(carX - junctionX);

        if (zDist < 5 && xDist < 8) {
            activeJunction = crossroad;

            // Check if player wants to turn (holding left/right + slow speed)
            if (speed < 0.8 && speed > 0.1) {
                // Turn left
                if (keys['ArrowLeft'] && carX > junctionX - 2 && !playerCar.userData.onSideRoad) {
                    startTurn('left', junctionX, junctionZ);
                    return;
                }
                // Turn right
                if (keys['ArrowRight'] && carX < junctionX + 6 && !playerCar.userData.onSideRoad) {
                    startTurn('right', junctionX, junctionZ);
                    return;
                }
            }
            return;
        }
    }

    activeJunction = null;
}

// Start a turn at junction
function startTurn(direction, junctionX, junctionZ) {
    turningState = direction === 'left' ? 'turning_left' : 'turning_right';
    turnProgress = 0;

    // Store turn start position
    playerCar.userData.turnStartX = playerCar.position.x;
    playerCar.userData.turnStartZ = playerCar.position.z;
    playerCar.userData.turnJunctionX = junctionX;
    playerCar.userData.turnJunctionZ = junctionZ;
    playerCar.userData.turnDirection = direction === 'left' ? -1 : 1;

    // Play turn indicator sound
    playTurnSound();
}

// Handle the turning animation
function handleTurning() {
    if (turningState === 'none') return;

    const turnSpeed = 0.02;
    turnProgress += turnSpeed;

    const direction = playerCar.userData.turnDirection;
    const junctionX = playerCar.userData.turnJunctionX;
    const junctionZ = playerCar.userData.turnJunctionZ;

    // Smooth turn using arc
    const turnRadius = 8;
    const angle = turnProgress * (Math.PI / 2); // 90 degree turn

    if (turnProgress < 1) {
        // During turn - arc movement
        if (direction === -1) {
            // Left turn
            playerCar.position.x = junctionX - turnRadius * Math.sin(angle);
            playerCar.position.z = junctionZ - turnRadius * (1 - Math.cos(angle));
        } else {
            // Right turn
            playerCar.position.x = junctionX + 4 + turnRadius * Math.sin(angle);
            playerCar.position.z = junctionZ - turnRadius * (1 - Math.cos(angle));
        }

        // Rotate car during turn
        const targetRotation = Math.PI + direction * angle;
        playerCar.rotation.y += (targetRotation - playerCar.rotation.y) * 0.15;

        // Apply slight body roll during turn
        playerCar.rotation.z = -direction * 0.05 * Math.sin(angle * 2);

        // Animate wheels
        playerCar.children.forEach((child) => {
            if (child.userData.isWheel) {
                child.rotation.x -= 0.1;
            }
        });

        // Move camera to follow
        camera.position.x += (playerCar.position.x - camera.position.x) * 0.1;
        camera.position.z = playerCar.position.z + 6;
        camera.lookAt(playerCar.position.x, 0.5, playerCar.position.z - 5);

        // Continue updating other game elements
        updateAudio();
        distance += 0.3;
        score += 0.2;

        // Update HUD
        const displaySpeed = Math.floor(speed * 50);
        document.getElementById('speed').textContent = displaySpeed;
        document.getElementById('distance').textContent = Math.floor(distance);

        renderer.render(scene, camera);
    } else {
        // Turn complete
        completeTurn();
    }
}

// Complete the turn and set up for side road travel
function completeTurn() {
    const direction = playerCar.userData.turnDirection;
    const junctionX = playerCar.userData.turnJunctionX;
    const junctionZ = playerCar.userData.turnJunctionZ;

    // Set car on the side road
    playerCar.userData.onSideRoad = true;
    playerCar.userData.sideRoadDirection = direction;
    playerCar.userData.sideRoadOriginZ = junctionZ;
    playerCar.userData.sideRoadOriginX = junctionX;

    // Position car on side road
    if (direction === -1) {
        playerCar.position.x = junctionX - 12;
        playerCar.rotation.y = Math.PI / 2; // Facing left
    } else {
        playerCar.position.x = junctionX + 12;
        playerCar.rotation.y = -Math.PI / 2; // Facing right
    }
    playerCar.position.z = junctionZ;

    // Reset lane offset for side road
    playerCar.userData.laneOffset = 0;

    // Reset turning state
    turningState = 'none';
    turnProgress = 0;
    activeJunction = null;

    // Award points for successful turn
    score += 50;
    playTurnCompleteSound();
}

// Play turn indicator sound
function playTurnSound() {
    if (!audioInitialized || !audioContext) return;

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.value = 600;

    gain.gain.value = 0.1;
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start();
    osc.stop(audioContext.currentTime + 0.2);
}

// Play turn complete sound
function playTurnCompleteSound() {
    if (!audioInitialized || !audioContext) return;

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'sine';
    osc.frequency.value = 800;
    osc.frequency.linearRampToValueAtTime(1000, audioContext.currentTime + 0.15);

    gain.gain.value = 0.12;
    gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start();
    osc.stop(audioContext.currentTime + 0.2);
}

// Return to main road from side road
function returnToMainRoad() {
    const sideDir = playerCar.userData.sideRoadDirection;
    const originZ = playerCar.userData.sideRoadOriginZ;

    // Teleport to a new position on the main road ahead
    // Position car on the main road, further ahead than where they left
    const newZ = originZ - 100; // Ahead on the road
    const roadCurve = getRoadCurveAt(newZ);

    playerCar.position.x = roadCurve + 3.5;
    playerCar.position.z = newZ;
    playerCar.rotation.y = Math.PI;

    // Reset side road state
    playerCar.userData.onSideRoad = false;
    playerCar.userData.sideRoadDirection = 0;
    playerCar.userData.laneOffset = 3.5;
    playerCar.userData.velocityX = 0;

    // Reset camera
    camera.position.x = roadCurve + 1.75;
    camera.position.z = newZ + 6;

    // Award bonus for exploring side road
    score += 100;
    playTurnCompleteSound();
}

// Update game state
function updateGame() {
    if (!gameActive) return;

    // Update audio
    updateAudio();

    // Update speed
    if (keys['ArrowUp']) {
        speed = Math.min(speed + acceleration, maxSpeed);
    } else {
        speed = Math.max(speed - acceleration * 0.5, baseSpeed);
    }

    if (keys['ArrowDown']) {
        speed = Math.max(speed - acceleration * 2, 0);
    }

    // Get road curve at car's position
    const roadCurveAtCar = getRoadCurveAt(playerCar.position.z);
    const roadDirection = getRoadDirectionAt(playerCar.position.z);

    // Check for junction turning
    updateJunctionTurning();

    // Initialize car userData if needed
    if (playerCar.userData.laneOffset === undefined) {
        playerCar.userData.laneOffset = 3.5; // Start on right side of road
        playerCar.userData.steerAngle = 0;
        playerCar.userData.velocityX = 0;
        playerCar.userData.bodyTilt = 0;
        playerCar.userData.suspensionOffset = 0;
        playerCar.userData.onSideRoad = false;
        playerCar.userData.sideRoadDirection = 0; // -1 for left, 1 for right
    }

    // If currently turning at junction, handle special turning movement
    if (turningState !== 'none') {
        handleTurning();
        return; // Skip normal movement during turn
    }

    // Steering input with momentum
    const maxSteerAngle = 0.035;
    const steerResponse = 0.12; // How fast steering responds
    const steerReturn = 0.08; // How fast steering returns to center
    let targetSteer = 0;

    if (keys['ArrowLeft']) {
        targetSteer = -maxSteerAngle * (1 + speed * 0.5);
    }
    if (keys['ArrowRight']) {
        targetSteer = maxSteerAngle * (1 + speed * 0.5);
    }

    // Smooth steering angle transition
    if (targetSteer !== 0) {
        playerCar.userData.steerAngle += (targetSteer - playerCar.userData.steerAngle) * steerResponse;
    } else {
        playerCar.userData.steerAngle *= (1 - steerReturn);
    }

    // Apply steering to velocity with momentum
    const lateralAcceleration = playerCar.userData.steerAngle * speed * 2;
    playerCar.userData.velocityX += lateralAcceleration;

    // Apply friction/drag to lateral velocity
    playerCar.userData.velocityX *= 0.92;

    // Update lane offset with velocity
    playerCar.userData.laneOffset += playerCar.userData.velocityX;

    // Clamp lane offset to road bounds (wider road now)
    // Right side (player lanes): 0.5 to 6.0
    // Left side (oncoming - dangerous!): -6.0 to -0.5
    const maxLaneOffset = 6.0;
    const minLaneOffset = 0.5; // Keep player slightly right of center median

    if (playerCar.userData.laneOffset > maxLaneOffset) {
        playerCar.userData.laneOffset = maxLaneOffset;
        playerCar.userData.velocityX *= -0.3; // Bounce back slightly
    } else if (playerCar.userData.laneOffset < -maxLaneOffset) {
        // Allow going into oncoming lane (dangerous!)
        playerCar.userData.laneOffset = -maxLaneOffset;
        playerCar.userData.velocityX *= -0.3;
    }

    // Calculate body roll (tilt) based on lateral acceleration
    const targetTilt = -playerCar.userData.velocityX * 1.5;
    playerCar.userData.bodyTilt += (targetTilt - playerCar.userData.bodyTilt) * 0.15;
    playerCar.rotation.z = playerCar.userData.bodyTilt;

    // Suspension effect (slight up/down based on speed changes and turning)
    const suspensionTarget = Math.abs(playerCar.userData.velocityX) * 0.02 + (speed > 0.8 ? 0.01 : 0);
    playerCar.userData.suspensionOffset += (suspensionTarget - playerCar.userData.suspensionOffset) * 0.1;

    // Check if on side road - different movement handling
    if (playerCar.userData.onSideRoad) {
        // Side road movement - car moves perpendicular to main road
        const sideDir = playerCar.userData.sideRoadDirection;

        // Move along side road (X axis)
        playerCar.position.x += sideDir * speed * 0.5;

        // Lane offset on side road becomes Z position adjustment
        playerCar.position.z = playerCar.userData.sideRoadOriginZ + playerCar.userData.laneOffset * sideDir * -0.5;

        // Clamp to side road bounds
        const sideRoadLength = 50;
        const originX = playerCar.userData.sideRoadOriginX;

        // Check if car has reached end of side road
        if (sideDir === -1 && playerCar.position.x < originX - sideRoadLength) {
            // End of left side road - turn back to main road or loop
            returnToMainRoad();
        } else if (sideDir === 1 && playerCar.position.x > originX + sideRoadLength) {
            // End of right side road
            returnToMainRoad();
        }

        // Rotate car to face side road direction
        const targetRot = sideDir === -1 ? Math.PI / 2 : -Math.PI / 2;
        const steerVisualOffset = playerCar.userData.steerAngle * 0.8;
        playerCar.rotation.y += (targetRot + steerVisualOffset - playerCar.rotation.y) * 0.12;

        // Subtle suspension bounce
        playerCar.position.y = playerCar.userData.suspensionOffset;

        // Camera follows on side road
        camera.position.z += (playerCar.position.z + 3 * sideDir - camera.position.z) * 0.1;
        camera.position.x += (playerCar.position.x + sideDir * -8 - camera.position.x) * 0.1;
        camera.position.y += (2.5 - camera.position.y) * 0.1;
        camera.lookAt(playerCar.position.x, 0.5, playerCar.position.z);
    } else {
        // Normal main road movement
        // Auto-move car forward
        playerCar.position.z -= speed * 0.5;

        // Update car X position to follow road curve + lane offset
        playerCar.position.x = roadCurveAtCar + playerCar.userData.laneOffset;

        // Subtle suspension bounce
        playerCar.position.y = playerCar.userData.suspensionOffset;

        // Rotate car to follow road direction plus steering input
        const steerVisualOffset = playerCar.userData.steerAngle * 0.8; // Car points slightly into turns
        const targetRotation = Math.PI + roadDirection + steerVisualOffset;
        playerCar.rotation.y += (targetRotation - playerCar.rotation.y) * 0.12;

        // Smooth camera follow with slight delay
        const cameraZ = playerCar.position.z + 6;
        const cameraCurve = getRoadCurveAt(cameraZ);

        // Camera smoothly follows car position
        const targetCamX = cameraCurve + playerCar.userData.laneOffset * 0.5;
        camera.position.x += (targetCamX - camera.position.x) * 0.08;
        camera.position.z += (cameraZ - camera.position.z) * 0.15;
        camera.position.y += (2.0 + speed * 0.3 - camera.position.y) * 0.1;

        // Look ahead along the curve with smooth transition
        const lookAheadZ = playerCar.position.z - 10;
        const lookAheadCurve = getRoadCurveAt(lookAheadZ);
        const lookAtX = lookAheadCurve + playerCar.userData.laneOffset * 0.4;
        camera.lookAt(lookAtX, 0.5, lookAheadZ);
    }

    // Rotate wheels
    playerCar.children.forEach((child) => {
        if (child.userData.isWheel) {
            child.rotation.x -= speed * 0.25;
        }
    });

    // Update score and distance
    distance += speed;
    score += speed * 0.5;

    // Update environment dynamically
    updateEnvironment();

    // Update pedestrians
    updatePedestrians();

    // Update traffic lights and crossroads
    updateTrafficLights(1 / 60);

    // Update autonomous vehicles
    updateAutonomousVehicles();

    // Update HUD
    const displaySpeed = Math.floor(speed * 100);
    document.getElementById('speed').textContent = displaySpeed;
    document.getElementById('distance').textContent = Math.floor(distance);
    document.getElementById('pedestriansAvoided').textContent = pedestriansAvoided;
    document.getElementById('redLightsRan').textContent = ranRedLights;
    document.getElementById('vehiclesOvertaken').textContent = vehiclesOvertaken;
    document.getElementById('nearMisses').textContent = nearMisses;

    // Update speedometer needle and arc
    updateSpeedometer(displaySpeed);
}

// Update speedometer visual
function updateSpeedometer(speedValue) {
    const maxSpeed = 220; // Max speed on dial
    const normalizedSpeed = Math.min(speedValue / maxSpeed, 1);

    // Calculate needle rotation (from -90 degrees to 90 degrees)
    const needleAngle = -90 + (normalizedSpeed * 180);
    const needle = document.getElementById('speedNeedle');
    if (needle) {
        needle.style.transform = `rotate(${needleAngle}deg)`;
    }

    // Calculate arc path
    const speedArc = document.getElementById('speedArc');
    if (speedArc) {
        // Arc goes from left (20,100) to right (180,100) with center at (100,100)
        const angle = normalizedSpeed * Math.PI; // 0 to PI radians
        const endX = 100 - Math.cos(angle) * 80;
        const endY = 100 - Math.sin(angle) * 80;

        // Determine if we need large arc flag
        const largeArcFlag = normalizedSpeed > 0.5 ? 1 : 0;

        if (normalizedSpeed > 0.01) {
            speedArc.setAttribute('d', `M 20 100 A 80 80 0 ${largeArcFlag} 1 ${endX} ${endY}`);
        } else {
            speedArc.setAttribute('d', 'M 20 100 A 80 80 0 0 1 20 100');
        }

        // Change color based on speed
        if (normalizedSpeed > 0.8) {
            speedArc.style.stroke = '#ff3333';
            speedArc.style.filter = 'drop-shadow(0 0 12px #ff3333)';
        } else if (normalizedSpeed > 0.6) {
            speedArc.style.stroke = '#ffaa00';
            speedArc.style.filter = 'drop-shadow(0 0 10px #ffaa00)';
        } else {
            speedArc.style.stroke = '#00ffff';
            speedArc.style.filter = 'drop-shadow(0 0 8px #00ffff)';
        }
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    if (gameActive) {
        updateGame();
    }

    renderer.render(scene, camera);
}

// Start game
function startGame() {
    document.getElementById('startScreen').style.display = 'none';
    document.getElementById('hud').style.display = 'flex';
    gameActive = true;
    score = 0;
    distance = 0;
    speed = baseSpeed;

    // Initialize and play audio
    initAudio();
    playStartEngineSound();

    // Reset player position and physics
    const startCurve = getRoadCurveAt(2);
    playerCar.position.set(startCurve + 3.5, 0, 2); // Start on right side
    playerCar.rotation.set(0, Math.PI, 0);

    // Reset car physics userData
    playerCar.userData.laneOffset = 3.5; // Start on right side of road
    playerCar.userData.steerAngle = 0;
    playerCar.userData.velocityX = 0;
    playerCar.userData.bodyTilt = 0;
    playerCar.userData.suspensionOffset = 0;

    // Reset environment tracking
    lastTreeZ = 10;

    // Clear and reset pedestrians
    pedestrians.forEach(p => scene.remove(p));
    pedestrians = [];
    lastPedestrianZ = 0;
    pedestriansAvoided = 0;
    hitPedestrian = false;

    // Spawn initial pedestrians
    for (let i = 0; i < 8; i++) {
        spawnPedestrian(-i * 12 - 20);
    }

    // Clear and reset traffic lights and crossroads
    trafficLights.forEach(light => {
        if (light.parent) light.parent.remove(light);
    });
    trafficLights = [];
    crossroads.forEach(cr => scene.remove(cr));
    crossroads = [];
    lastCrossroadZ = -50;
    lastTrafficLightZ = -50;
    ranRedLights = 0;

    // Spawn initial crossroads
    spawnCrossroad(-50);
    spawnCrossroad(-130);

    // Clear and reset autonomous vehicles
    autonomousVehicles.forEach(v => scene.remove(v));
    autonomousVehicles = [];
    lastVehicleZ = -30;
    lastOncomingVehicleZ = -50;
    vehiclesOvertaken = 0;
    nearMisses = 0;

    // Spawn initial vehicles (same direction)
    for (let i = 0; i < 5; i++) {
        spawnVehicle(-40 - i * 25);
    }

    // Spawn initial oncoming vehicles
    for (let i = 0; i < 3; i++) {
        spawnOncomingVehicle(-60 - i * 35);
    }
}

// Restart game
function restartGame() {
    startGame();
}

// Track previous key states for sound triggers
let prevKeys = {};

// Keyboard controls
window.addEventListener('keydown', (e) => {
    // Play sounds on key press (not hold)
    if (!keys[e.key] && gameActive) {
        if (e.key === 'ArrowUp') {
            playAccelerationSound();
        }
        if (e.key === 'ArrowDown' && speed > 0.2) {
            playBrakeSound();
        }
    }
    keys[e.key] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initialize and start
initScene();
animate();
