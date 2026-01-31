// Game state
let scene, camera, renderer;
let playerCar, road, obstacles = [];
let gameActive = false;
let score = 0;
let distance = 0;
let speed = 0;
let baseSpeed = 0.1;
let maxSpeed = 1.2;
let acceleration = 0.02;
let keys = {};
let environmentObjects = [];
let lastTreeZ = 10;
let ground;

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

// Populate nature elements along the road
function createNatureElements() {
    ground = createGround();

    // Create initial trees along both sides of the road
    for (let i = 0; i < 20; i++) {
        const z = -i * 5 + 10;
        generateEnvironmentAtZ(z);
    }
}

// Generate environment objects at a specific Z position
function generateEnvironmentAtZ(z) {
    // Left side trees
    if (Math.random() > 0.3) {
        const tree = createTree(-5 - Math.random() * 3, z);
        tree.userData.isEnvironment = true;
        environmentObjects.push(tree);
        scene.add(tree);
    }

    // Right side trees
    if (Math.random() > 0.3) {
        const tree = createTree(5 + Math.random() * 3, z);
        tree.userData.isEnvironment = true;
        environmentObjects.push(tree);
        scene.add(tree);
    }

    // Bushes
    if (Math.random() > 0.5) {
        const bush = createBush(-4 - Math.random() * 2, z + Math.random() * 2);
        bush.userData.isEnvironment = true;
        environmentObjects.push(bush);
        scene.add(bush);
    }

    if (Math.random() > 0.5) {
        const bush = createBush(4 + Math.random() * 2, z + Math.random() * 2);
        bush.userData.isEnvironment = true;
        environmentObjects.push(bush);
        scene.add(bush);
    }

    // Rocks
    if (Math.random() > 0.7) {
        const rock = createRock(-4.5 - Math.random() * 2, z + Math.random() * 2);
        rock.userData.isEnvironment = true;
        environmentObjects.push(rock);
        scene.add(rock);
    }

    if (Math.random() > 0.7) {
        const rock = createRock(4.5 + Math.random() * 2, z + Math.random() * 2);
        rock.userData.isEnvironment = true;
        environmentObjects.push(rock);
        scene.add(rock);
    }

    // Buildings (less frequent, further from road)
    if (Math.random() > 0.85) {
        const building = createBuilding(-10 - Math.random() * 8, z);
        building.userData.isEnvironment = true;
        environmentObjects.push(building);
        scene.add(building);
    }

    if (Math.random() > 0.85) {
        const building = createBuilding(10 + Math.random() * 8, z);
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
    }

    // Move road with the car
    if (road) {
        road.position.z = playerCar.position.z - 300;
    }

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

// Create the road
function createRoad() {
    const roadGroup = new THREE.Group();

    // Road shoulder/dirt edge - slightly wider than road
    const shoulderGeometry = new THREE.PlaneGeometry(8, 600);
    const shoulderMaterial = new THREE.MeshStandardMaterial({
        color: 0x5a4a3a,
        roughness: 0.95
    });
    const shoulder = new THREE.Mesh(shoulderGeometry, shoulderMaterial);
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.z = -300;
    shoulder.position.y = -0.02;
    shoulder.receiveShadow = true;
    roadGroup.add(shoulder);

    // Main road - asphalt texture look
    const roadGeometry = new THREE.PlaneGeometry(6.5, 600);
    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a2a35,
        roughness: 0.85,
        metalness: 0.05
    });
    const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.z = -300;
    roadMesh.position.y = 0;
    roadMesh.receiveShadow = true;
    roadGroup.add(roadMesh);

    // Road markings - center dashed line
    for (let i = 0; i < 120; i++) {
        const lineGeometry = new THREE.BoxGeometry(0.15, 0.02, 2.5);
        const lineMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.5
        });
        const line = new THREE.Mesh(lineGeometry, lineMaterial);
        line.position.set(0, 0.01, -i * 5);
        roadGroup.add(line);
    }

    // White edge lines (continuous)
    const edgeLineGeometry = new THREE.BoxGeometry(0.1, 0.02, 600);
    const edgeLineMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5
    });

    const leftEdgeLine = new THREE.Mesh(edgeLineGeometry, edgeLineMaterial);
    leftEdgeLine.position.set(-3.0, 0.01, -300);
    roadGroup.add(leftEdgeLine);

    const rightEdgeLine = new THREE.Mesh(edgeLineGeometry, edgeLineMaterial);
    rightEdgeLine.position.set(3.0, 0.01, -300);
    roadGroup.add(rightEdgeLine);

    // Guard rails for realism
    const guardRailGeometry = new THREE.BoxGeometry(0.15, 0.4, 600);
    const guardRailMaterial = new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 0.6,
        roughness: 0.3
    });

    const leftGuardRail = new THREE.Mesh(guardRailGeometry, guardRailMaterial);
    leftGuardRail.position.set(-3.5, 0.2, -300);
    leftGuardRail.castShadow = true;
    roadGroup.add(leftGuardRail);

    const rightGuardRail = new THREE.Mesh(guardRailGeometry, guardRailMaterial);
    rightGuardRail.position.set(3.5, 0.2, -300);
    rightGuardRail.castShadow = true;
    roadGroup.add(rightGuardRail);

    road = roadGroup;
    scene.add(road);
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

    // Move player car with smooth steering
    let targetTilt = 0;
    if (keys['ArrowLeft']) {
        playerCar.position.x = Math.max(playerCar.position.x - 0.08 * (1 + speed * 0.3), -2.8);
        targetTilt = 0.08;
    }
    if (keys['ArrowRight']) {
        playerCar.position.x = Math.min(playerCar.position.x + 0.08 * (1 + speed * 0.3), 2.8);
        targetTilt = -0.08;
    }
    // Smooth car tilt when turning
    playerCar.rotation.z += (targetTilt - playerCar.rotation.z) * 0.1;

    // Auto-move car forward
    playerCar.position.z -= speed * 0.5;

    // Move camera to follow car - positioned lower and looking ahead
    camera.position.z = playerCar.position.z + 6;
    camera.position.x = playerCar.position.x * 0.4;
    camera.position.y = 2.0 + speed * 0.3; // Slight camera lift at higher speeds
    camera.lookAt(playerCar.position.x * 0.5, 0.5, playerCar.position.z - 8);

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

    // Update HUD
    document.getElementById('score').textContent = Math.floor(score);
    document.getElementById('speed').textContent = Math.floor(speed * 100);
    document.getElementById('distance').textContent = Math.floor(distance);
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

    // Reset player position
    playerCar.position.set(0, 0, 2);
    playerCar.rotation.z = 0;
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
