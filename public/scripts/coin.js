// A credit, turning slowly. Flat NEAR mint faces with ink linework over them,
// so it sits in the same drawing language as the wireframe globe.

(function () {
    const container = document.getElementById('coin-container');
    if (!container || !window.THREE) return;

    const MINT = '#00d4aa';
    const MINT_EDGE = 0x00b894;
    const INK = 0x000000;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.z = 6;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const RADIUS = 1.75;
    const THICKNESS = 0.26;

    function makeFaceTexture() {
        const size = 512;
        const surface = document.createElement('canvas');
        surface.width = size;
        surface.height = size;

        const context = surface.getContext('2d');
        context.fillStyle = MINT;
        context.fillRect(0, 0, size, size);

        context.fillStyle = '#000000';
        context.font = 'bold 300px "Helvetica Neue", Helvetica, Arial, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('$', size / 2, size / 2 + 10);

        return new THREE.CanvasTexture(surface);
    }

    const faceTexture = makeFaceTexture();
    faceTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const faceMaterial = new THREE.MeshBasicMaterial({ map: faceTexture });
    const rimMaterial = new THREE.MeshBasicMaterial({ color: MINT_EDGE });

    const blank = new THREE.CylinderGeometry(RADIUS, RADIUS, THICKNESS, 64);

    // stand it up so the faces point at the camera, then turn it about its own axis
    const coinGroup = new THREE.Group();

    const body = new THREE.Mesh(blank, rimMaterial);
    body.rotation.x = Math.PI / 2;
    coinGroup.add(body);

    // The glyph goes on its own circles rather than the cylinder caps: cap UVs are
    // laid out in the cylinder's own plane, which lands the character mirrored.
    const faceGeometry = new THREE.CircleGeometry(RADIUS * 0.995, 64);
    const offset = THICKNESS / 2 + 0.002;

    const front = new THREE.Mesh(faceGeometry, faceMaterial);
    front.position.z = offset;
    coinGroup.add(front);

    const back = new THREE.Mesh(faceGeometry, faceMaterial);
    back.position.z = -offset;
    back.rotation.y = Math.PI;
    coinGroup.add(back);

    // ink outline, the same hairline vocabulary as the rest of the page
    const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(blank, 20),
        new THREE.LineBasicMaterial({ color: INK })
    );
    outline.rotation.x = Math.PI / 2;
    coinGroup.add(outline);

    coinGroup.rotation.x = 0.22;
    scene.add(coinGroup);

    function resize() {
        const rect = container.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        camera.aspect = rect.width / rect.height;

        // pull back far enough that the coin fits however the panel is shaped
        const verticalFov = (camera.fov * Math.PI) / 180;
        const fitHeight = RADIUS / Math.tan(verticalFov / 2);
        camera.position.z = Math.max(fitHeight, fitHeight / camera.aspect) * 1.5;

        camera.updateProjectionMatrix();

        // updateStyle false: the canvas is sized by CSS, so letting three write
        // inline width/height would feed the container's own height back into it
        renderer.setSize(rect.width, rect.height, false);
    }

    const clock = new THREE.Clock();
    let frameId = null;
    let running = false;

    function loop() {
        frameId = requestAnimationFrame(loop);
        const delta = clock.getDelta();

        coinGroup.rotation.y += delta * 0.7;

        // held at a tilt so the edge-on moment of each turn still shows the rim
        coinGroup.rotation.x = 0.42 + Math.sin(clock.elapsedTime * 0.6) * 0.07;

        renderer.render(scene, camera);
    }

    function start() {
        if (running) return;
        running = true;
        clock.getDelta();
        frameId = requestAnimationFrame(loop);
    }

    function stop() {
        if (!running) return;
        running = false;
        cancelAnimationFrame(frameId);
    }

    new ResizeObserver(resize).observe(container);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        resize();
        renderer.render(scene, camera);
    } else {
        new IntersectionObserver(entries => {
            entries.forEach(entry => (entry.isIntersecting ? start() : stop()));
        }, { threshold: 0.05 }).observe(container);
        resize();
    }
})();
