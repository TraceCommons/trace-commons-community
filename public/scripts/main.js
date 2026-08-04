const container = document.getElementById('canvas-container');

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.z = 250;

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const INK_COLOR = 0x000000;
const ACCENT_COLOR = 0x00d4aa;
const SIGNAL_COLOR = 0x00b894;
const GLOBE_RADIUS = 90;
const AUTO_SPIN = 0.005;
const MAX_TILT = 1.1;
const MAX_ADDED_NODES = 40;

const globeGroup = new THREE.Group();
scene.add(globeGroup);

const geometry = new THREE.IcosahedronGeometry(GLOBE_RADIUS, 2);

const edgesGeometry = new THREE.EdgesGeometry(geometry);

// Split the mesh edges into two sets and draw a minority in mint. They travel
// with the surface as it turns, so the accent reads as depth rather than an
// overlay pinned to the screen.
const edgePositions = edgesGeometry.getAttribute('position');
const inkVertices = [];
const accentVertices = [];

for (let i = 0; i < edgePositions.count; i += 2) {
    const target = (i / 2) % 7 === 0 ? accentVertices : inkVertices;

    target.push(
        edgePositions.getX(i), edgePositions.getY(i), edgePositions.getZ(i),
        edgePositions.getX(i + 1), edgePositions.getY(i + 1), edgePositions.getZ(i + 1)
    );
}

// everything drawn in ink is collected so the palette can flip with the page
const inkMaterials = [];

function buildEdges(vertices, color) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const material = new THREE.LineBasicMaterial({ color: color });
    if (color === INK_COLOR) inkMaterials.push(material);
    return new THREE.LineSegments(geo, material);
}

globeGroup.add(buildEdges(inkVertices, INK_COLOR));
globeGroup.add(buildEdges(accentVertices, ACCENT_COLOR));

// invisible solid sphere, used only as a raycast surface for taps
const pickSphere = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS, 32, 24),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
);
globeGroup.add(pickSphere);

const hubs = {
    'NewYork': { lat: 40.7128, lon: -74.0060 },
    'London': { lat: 51.5074, lon: -0.1278 },
    'Dubai': { lat: 25.2048, lon: 55.2708 },
    'Singapore': { lat: 1.3521, lon: 103.8198 }
};

function getPositionFromLatLon(lat, lon, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = (radius * Math.sin(phi) * Math.sin(theta));
    const y = (radius * Math.cos(phi));

    return new THREE.Vector3(x, y, z);
}

const markerGeometry = new THREE.BoxGeometry(4, 4, 4);
const markerMaterial = new THREE.MeshBasicMaterial({ color: INK_COLOR, wireframe: true });
inkMaterials.push(markerMaterial);
const signalMarkerMaterial = new THREE.MeshBasicMaterial({ color: SIGNAL_COLOR });

// every point a signal can travel between, seeded with the fixed hubs
const nodes = [];
const hubVectors = {};

for (const [name, coords] of Object.entries(hubs)) {
    const pos = getPositionFromLatLon(coords.lat, coords.lon, GLOBE_RADIUS);
    hubVectors[name] = pos;
    nodes.push(pos);

    const marker = new THREE.Mesh(markerGeometry, markerMaterial);
    marker.position.copy(pos);
    marker.lookAt(new THREE.Vector3(0, 0, 0));
    globeGroup.add(marker);
}

const arcs = [];

const connections = [
    ['NewYork', 'London'],
    ['London', 'Dubai'],
    ['Dubai', 'Singapore'],
    ['Singapore', 'London'],
    ['NewYork', 'Singapore']
];

function createArc(startVec, endVec, color) {
    const mid = startVec.clone().lerp(endVec, 0.5);
    const dist = startVec.distanceTo(endVec);

    mid.normalize();

    const arcHeight = GLOBE_RADIUS + (dist * 0.4);
    mid.multiplyScalar(arcHeight);

    const curve = new THREE.QuadraticBezierCurve3(startVec, mid, endVec);

    const points = curve.getPoints(20);
    const pathGeometry = new THREE.BufferGeometry().setFromPoints(points);

    const pathMaterial = new THREE.LineDashedMaterial({
        color: color,
        dashSize: 3,
        gapSize: 2
    });

    if (color === INK_COLOR) inkMaterials.push(pathMaterial);

    const arcLine = new THREE.Line(pathGeometry, pathMaterial);
    arcLine.computeLineDistances();
    arcLine.geometry.setDrawRange(0, 0);

    globeGroup.add(arcLine);

    return {
        line: arcLine,
        length: points.length,
        progress: Math.random() * 2
    };
}

connections.forEach(conn => {
    arcs.push(createArc(hubVectors[conn[0]], hubVectors[conn[1]], INK_COLOR));
});

globeGroup.rotation.x = 0.2;
globeGroup.rotation.y = -0.5;

/* ---------- taps drop a new node that starts shooting signals ---------- */

const addedNodes = [];

function nearestNodes(point, count) {
    return nodes
        .map(node => ({ node, distance: node.distanceTo(point) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, count)
        .map(entry => entry.node);
}

function disposeArc(arc) {
    globeGroup.remove(arc.line);
    arc.line.geometry.dispose();
    arc.line.material.dispose();

    const index = arcs.indexOf(arc);
    if (index > -1) arcs.splice(index, 1);
}

function retireOldestNode() {
    const oldest = addedNodes.shift();
    if (!oldest) return;

    globeGroup.remove(oldest.marker);
    oldest.arcs.forEach(disposeArc);

    const index = nodes.indexOf(oldest.position);
    if (index > -1) nodes.splice(index, 1);
}

function addSignalNode(position) {
    const marker = new THREE.Mesh(markerGeometry, signalMarkerMaterial);
    marker.position.copy(position);
    marker.lookAt(new THREE.Vector3(0, 0, 0));
    marker.scale.setScalar(1.4);
    globeGroup.add(marker);

    const targets = nearestNodes(position, 2);
    const newArcs = targets.map(target => {
        const arc = createArc(position, target, SIGNAL_COLOR);
        arc.progress = 0;
        arcs.push(arc);
        return arc;
    });

    nodes.push(position);
    addedNodes.push({ position, marker, arcs: newArcs });

    if (addedNodes.length > MAX_ADDED_NODES) retireOldestNode();
}

/* ---------- drag to rotate, release to resume ---------- */

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let dragging = false;
let pointerMoved = 0;
let pointerDownAt = 0;
let lastX = 0;
let lastY = 0;
let spinVelocity = 0;
let tiltVelocity = 0;

const canvas = renderer.domElement;

function pointerToNDC(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

canvas.addEventListener('pointerdown', event => {
    dragging = true;
    pointerMoved = 0;
    pointerDownAt = performance.now();
    lastX = event.clientX;
    lastY = event.clientY;
    spinVelocity = 0;
    tiltVelocity = 0;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('is-grabbing');
});

canvas.addEventListener('pointermove', event => {
    if (!dragging) return;

    const deltaX = event.clientX - lastX;
    const deltaY = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    pointerMoved += Math.abs(deltaX) + Math.abs(deltaY);

    spinVelocity = deltaX * 0.005;
    tiltVelocity = deltaY * 0.005;

    globeGroup.rotation.y += spinVelocity;
    globeGroup.rotation.x = Math.max(-MAX_TILT, Math.min(MAX_TILT, globeGroup.rotation.x + tiltVelocity));
});

function endDrag(event) {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove('is-grabbing');
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);

    const wasTap = pointerMoved < 6 && performance.now() - pointerDownAt < 300;
    if (!wasTap) return;

    pointerToNDC(event);
    raycaster.setFromCamera(pointer, camera);

    const hit = raycaster.intersectObject(pickSphere)[0];
    if (!hit) return;

    const local = globeGroup.worldToLocal(hit.point.clone()).normalize().multiplyScalar(GLOBE_RADIUS);
    addSignalNode(local);
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ---------- render loop ---------- */

const clock = new THREE.Clock();
let elapsed = 0;

function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    elapsed += delta;

    if (!dragging) {
        // carry the throw, then settle back into the idle spin from wherever it was left
        globeGroup.rotation.y += AUTO_SPIN + spinVelocity;
        globeGroup.rotation.x = Math.max(-MAX_TILT, Math.min(MAX_TILT, globeGroup.rotation.x + tiltVelocity));

        spinVelocity *= 0.94;
        tiltVelocity *= 0.94;

        if (Math.abs(spinVelocity) < 0.00001) spinVelocity = 0;
        if (Math.abs(tiltVelocity) < 0.00001) tiltVelocity = 0;
    }

    arcs.forEach(arc => {
        arc.progress += delta * 1.5;

        if (arc.progress > 2) {
            arc.progress = 0;
        }

        const segmentLength = 5;
        const totalPoints = arc.length;

        let startPoint = Math.floor(arc.progress * totalPoints) - segmentLength;
        let endPoint = Math.floor(arc.progress * totalPoints);

        startPoint = Math.max(0, startPoint);
        endPoint = Math.min(totalPoints, endPoint);

        if (startPoint > totalPoints) {
            arc.line.geometry.setDrawRange(0, 0);
        } else {
            arc.line.geometry.setDrawRange(startPoint, endPoint - startPoint);
        }
    });

    renderer.render(scene, camera);
}

animate();

// pull the camera back far enough that the globe fits on both axes, so a tall
// narrow frame on a phone crops it no more than a wide one on a desktop
function fitCamera() {
    const verticalFov = (camera.fov * Math.PI) / 180;
    const fitHeight = GLOBE_RADIUS / Math.tan(verticalFov / 2);
    const fitWidth = fitHeight / camera.aspect;

    camera.position.z = Math.max(fitHeight, fitWidth) * 1.15;
}

// the manifesto section turns the page black, so the globe's ink has to follow
window.TCGlobe = {
    setInverted(on) {
        // The takeover flips ink to white, not to crawl yellow. WebGL cannot
        // read the CSS custom properties, so this tracks --ink-color by hand.
        const colour = on ? 0xffffff : INK_COLOR;
        inkMaterials.forEach(material => material.color.setHex(colour));
    }
};

function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;

    camera.aspect = width / height;
    fitCamera();
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

resize();

new ResizeObserver(resize).observe(container);
window.addEventListener('resize', resize);
