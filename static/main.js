// Basic Three.js scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector('#bg'),
    antialias: true,
});

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
camera.position.setZ(30);

// --- UPDATED: Add more realistic lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.2); // Lower ambient light
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1); // Add a directional light
scene.add(directionalLight);


// Add controls to move the camera with the mouse
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Adds a feeling of inertia

// --- UPDATED: Add zoom constraints ---
controls.minDistance = 18; // Prevent zooming inside the sphere
controls.maxDistance = 100; // Prevent zooming too far out


// Raycaster for detecting clicks and hovers
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let eventObjects = []; // Array to hold the clickable event spheres
let hoveredObject = null;
let selectedObject = null;
let earthMesh = null; // A variable to hold the Earth mesh for rotation
let cloudsMesh = null; // A variable to hold the cloud mesh

// UI Panel Elements
const infoPanel = document.getElementById('info-panel');
const infoPanelClose = document.getElementById('info-panel-close');

// --- NEW: Function to create a starfield background ---
function createStarfield() {
    const starVertices = [];
    for (let i = 0; i < 10000; i++) {
        const x = THREE.MathUtils.randFloatSpread(2000);
        const y = THREE.MathUtils.randFloatSpread(2000);
        const z = THREE.MathUtils.randFloatSpread(2000);
        starVertices.push(x, y, z);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    const starMaterial = new THREE.PointsMaterial({ color: 0x888888 });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
}

// --- UPDATED: Function to create a realistic 3D Earth with robust loading ---
function createEarth() {
    const geometry = new THREE.SphereGeometry(15, 64, 32);
    
    // --- NEW: Loading Manager to handle all textures ---
    const manager = new THREE.LoadingManager();
    manager.onLoad = () => {
        console.log('All textures loaded successfully.');
    };
    manager.onError = (url) => {
        console.error(`There was an error loading ${url}. Displaying fallback globe.`);
        // If any texture fails, we will create a simple blue globe
        if (!earthMesh) { // prevent creating multiple fallbacks
            const fallbackMaterial = new THREE.MeshStandardMaterial({ color: 0x205A87, roughness: 0.8 });
            earthMesh = new THREE.Mesh(geometry, fallbackMaterial);
            scene.add(earthMesh);
        }
    };

    const textureLoader = new THREE.TextureLoader(manager);
    
    // --- UPDATED: Use reliable texture URLs that allow cross-origin requests ---
    const diffuseMap = textureLoader.load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/141228/earthmap1k.jpg');
    const bumpMap = textureLoader.load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/141228/earthbump1k.jpg');
    const specularMap = textureLoader.load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/141228/earthspec1k.jpg');
    const cloudTexture = textureLoader.load('https://s3-us-west-2.amazonaws.com/s.cdpn.io/141228/fair_clouds_4k.png');


    const earthMaterial = new THREE.MeshStandardMaterial({
        map: diffuseMap,
        bumpMap: bumpMap,
        bumpScale: 0.05, // Adjust for terrain height
        specularMap: specularMap, // Controls shininess (water vs. land)
        metalness: 0,
        roughness: 1,
    });

    earthMesh = new THREE.Mesh(geometry, earthMaterial);
    scene.add(earthMesh);

    // Create a separate, slightly larger sphere for the clouds
    const cloudGeometry = new THREE.SphereGeometry(15.1, 64, 32);
    const cloudMaterial = new THREE.MeshPhongMaterial({
        map: cloudTexture,
        transparent: true,
        opacity: 0.8
    });
    cloudsMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
    scene.add(cloudsMesh);
}


// Function to plot the events on the sphere
function plotEvents(events, correlations) {
    const eventColors = { 'GWOSC': 0xff0000, 'ZTF': 0x00ff00, 'HEASARC': 0xffff00 };
    const plottedEvents = {};

    events.forEach(event => {
        const material = new THREE.MeshStandardMaterial({ color: eventColors[event.source] || 0xffffff, emissive: eventColors[event.source], emissiveIntensity: 0 });
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 20), material);

        const raRad = THREE.MathUtils.degToRad(event.ra);
        const decRad = THREE.MathUtils.degToRad(event.dec);
        const radius = 15.2; // Slightly outside the cloud layer

        const x = radius * Math.cos(decRad) * Math.cos(raRad);
        const y = radius * Math.sin(decRad);
        const z = radius * Math.cos(decRad) * Math.sin(raRad);
        sphere.position.set(x, y, z);
        
        sphere.userData = event;
        scene.add(sphere);
        plottedEvents[event.id] = sphere;
        eventObjects.push(sphere);
    });

    correlations.forEach(pair => {
        const event1 = plottedEvents[pair[0]];
        const event2 = plottedEvents[pair[1]];
        if (event1 && event2) {
            const material = new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 2 });
            const points = [event1.position, event2.position];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, material);
            scene.add(line);
        }
    });
}

// Function to show the info panel with event data
function showInfoPanel(eventData) {
    document.getElementById('info-id').textContent = eventData.id;
    document.getElementById('info-source').textContent = eventData.source;
    document.getElementById('info-time').textContent = new Date(eventData.time).toUTCString();
    document.getElementById('info-ra').textContent = eventData.ra.toFixed(4);
    document.getElementById('info-dec').textContent = eventData.dec.toFixed(4);
    infoPanel.classList.add('visible');
}

// --- NEW: Function to handle mouse movement for hover effects ---
function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
}

// Function to handle mouse clicks
function onMouseClick(event) {
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(eventObjects);

    if (intersects.length > 0) {
        const clickedObject = intersects[0].object;
        showInfoPanel(clickedObject.userData);
        
        if(selectedObject) {
            selectedObject.material.emissiveIntensity = 0;
        }
        selectedObject = clickedObject;
        selectedObject.material.emissiveIntensity = 0.5;
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);

    // --- NEW: Hover logic inside the animation loop ---
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(eventObjects);

    if (intersects.length > 0) {
        if (hoveredObject !== intersects[0].object) {
            if (hoveredObject) {
                hoveredObject.scale.set(1, 1, 1);
            }
            hoveredObject = intersects[0].object;
            hoveredObject.scale.set(1.5, 1.5, 1.5);
        }
    } else {
        if (hoveredObject) {
             hoveredObject.scale.set(1, 1, 1);
        }
        hoveredObject = null;
    }

    // --- UPDATED: Rotate both Earth and clouds at different speeds (slower) ---
    if (earthMesh) {
        earthMesh.rotation.y += 0.0001; // Reduced from 0.0005
    }
    if (cloudsMesh) {
        cloudsMesh.rotation.y += 0.00015; // Reduced from 0.0007
    }
    
    // --- NEW: Make the light follow the camera ---
    directionalLight.position.copy(camera.position);

    controls.update();
    renderer.render(scene, camera);
}

// Main function to initialize the scene and fetch data
async function main() {
    createStarfield();
    createEarth();
    try {
        const response = await fetch('/api/events');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
        const data = await response.json();
        plotEvents(data.all_events, data.correlations);
    } catch (error) {
        console.error("Failed to fetch event data:", error);
    }
    animate();
}

// Add event listeners
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('click', onMouseClick);
infoPanelClose.addEventListener('click', () => {
    infoPanel.classList.remove('visible');
    if (selectedObject) {
        selectedObject.material.emissiveIntensity = 0;
        selectedObject = null;
    }
});
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start the application
main();


