/**
 * LISAN HOLDINGS - WebGL Visual Engine
 * Unified engine supporting both light and dark mode aesthetics
 * - Dark mode: Liquid text "LISAN" with interactive distortion + iridescent shapes
 * - Light mode: Elegant floating shapes with studio lighting
 */

(function () {
    'use strict';

    const canvas = document.querySelector('#gl-canvas');
    if (!canvas) return;

    // Initialize renderer
    const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 12;

    // State
    let currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const mouse = new THREE.Vector2(0.5, 0.5);
    const targetMouse = new THREE.Vector2(0.5, 0.5);

    // ==========================================
    // MATERIALS
    // ==========================================

    // Dark mode: Iridescent glass material
    const iridescent = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.6,
        thickness: 0.5,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        iridescence: 1.0,
        iridescenceIOR: 1.3
    });

    // Light mode: Pink/Purple/Magenta gradient materials (matching fluid sim)
    const pinkMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xcc1a66,  // Deep pink/magenta
        metalness: 0.3,
        roughness: 0.2,
        clearcoat: 0.8,
        clearcoatRoughness: 0.15,
        envMapIntensity: 0.6
    });

    const purpleMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x8b1acc,  // Purple
        metalness: 0.35,
        roughness: 0.15,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
        envMapIntensity: 0.7
    });

    const blueMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x3319cc,  // Deep blue
        metalness: 0.4,
        roughness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        envMapIntensity: 0.8
    });

    const magentaMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x991a66,  // Dark magenta
        metalness: 0.25,
        roughness: 0.25,
        clearcoat: 0.7,
        clearcoatRoughness: 0.2,
        envMapIntensity: 0.5
    });

    // Store light mode materials for each shape
    const lightMaterials = {
        torus: pinkMaterial,
        ico: purpleMaterial,
        sphere: blueMaterial,
        torusKnot: magentaMaterial
    };

    // ==========================================
    // SHAPES - Positioned at edges to not overlap with center text
    // ==========================================

    const shapesGroup = new THREE.Group();
    scene.add(shapesGroup);

    // Shape 1: Torus (far left edge)
    const torusGeo = new THREE.TorusGeometry(1.6, 0.5, 32, 64);
    const torus = new THREE.Mesh(torusGeo, pinkMaterial);
    torus.position.set(-8, 0.5, -5);
    shapesGroup.add(torus);

    // Shape 2: Icosahedron (far right, lower)
    const icoGeo = new THREE.IcosahedronGeometry(2.0, 0);
    const ico = new THREE.Mesh(icoGeo, purpleMaterial);
    ico.position.set(8, -2.5, -6);
    shapesGroup.add(ico);

    // Shape 3: Sphere (top right corner)
    const sphereGeo = new THREE.SphereGeometry(0.9, 32, 32);
    const sphere = new THREE.Mesh(sphereGeo, blueMaterial);
    sphere.position.set(6, 4, -7);
    shapesGroup.add(sphere);

    // Shape 4: Torus Knot (bottom left)
    const torusKnotGeo = new THREE.TorusKnotGeometry(0.8, 0.25, 100, 16);
    const torusKnot = new THREE.Mesh(torusKnotGeo, magentaMaterial);
    torusKnot.position.set(-6, -4, -4);
    shapesGroup.add(torusKnot);

    // ==========================================
    // LIGHTING
    // ==========================================

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
    keyLight.position.set(5, 8, 7);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
    fillLight.position.set(-5, 3, 5);
    scene.add(fillLight);

    // Accent lights for dark mode
    const cyanLight = new THREE.PointLight(0x22d3ee, 0, 100);
    cyanLight.position.set(5, 5, 5);
    scene.add(cyanLight);

    const cyanLight2 = new THREE.PointLight(0x22d3ee, 0, 100);
    cyanLight2.position.set(-5, -3, 3);
    scene.add(cyanLight2);

    // ==========================================
    // ENVIRONMENT MAP (for reflections)
    // ==========================================

    function generateEnvMap() {
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();

        const envScene = new THREE.Scene();
        envScene.background = new THREE.Color(currentTheme === 'dark' ? 0x011418 : 0xf5f5f5);

        // Light panels for reflections
        const panelGeo = new THREE.PlaneGeometry(10, 10);
        const panelMat = new THREE.MeshBasicMaterial({
            color: currentTheme === 'dark' ? 0x22d3ee : 0xffffff,
            side: THREE.DoubleSide
        });

        const ceiling = new THREE.Mesh(panelGeo, panelMat);
        ceiling.position.y = 5;
        ceiling.rotation.x = Math.PI / 2;
        envScene.add(ceiling);

        const side = new THREE.Mesh(panelGeo, panelMat);
        side.position.x = 8;
        side.rotation.y = -Math.PI / 2;
        envScene.add(side);

        const envMap = pmremGenerator.fromScene(envScene, 0.04).texture;
        pmremGenerator.dispose();

        return envMap;
    }

    // Apply initial env map
    let envMap = generateEnvMap();
    pinkMaterial.envMap = envMap;
    purpleMaterial.envMap = envMap;
    blueMaterial.envMap = envMap;
    magentaMaterial.envMap = envMap;
    iridescent.envMap = envMap;

    // ==========================================
    // LIQUID TEXT (Dark Mode Only)
    // ==========================================

    let textPlane = null;
    let liquidMaterial = null;

    function createLiquidText() {
        // Create canvas texture for text
        const textCanvas = document.createElement('canvas');
        const ctx = textCanvas.getContext('2d');
        textCanvas.width = 2048;
        textCanvas.height = 1024;

        ctx.clearRect(0, 0, textCanvas.width, textCanvas.height);
        ctx.font = '900 350px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('LISAN', textCanvas.width / 2, textCanvas.height / 2);

        const textTexture = new THREE.CanvasTexture(textCanvas);

        // Custom shader for liquid distortion
        liquidMaterial = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: textTexture },
                uMouse: { value: new THREE.Vector2(0.5, 0.5) },
                uTime: { value: 0 }
            },
            transparent: true,
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D uTexture;
                uniform vec2 uMouse;
                uniform float uTime;
                varying vec2 vUv;

                void main() {
                    vec2 uv = vUv;
                    
                    // Mouse interaction
                    float dist = distance(uv, uMouse);
                    float decay = smoothstep(0.4, 0.0, dist);
                    
                    // Liquid wave
                    vec2 distortion = vec2(
                        sin(uv.y * 10.0 + uTime) * 0.005, 
                        cos(uv.x * 10.0 + uTime) * 0.005
                    );
                    
                    vec2 finalUv = uv + distortion * 0.5 + (vec2(0.5) - uMouse) * decay * 0.1;
                    
                    vec4 color = texture2D(uTexture, finalUv);
                    
                    // Chromatic aberration on edges
                    float red = texture2D(uTexture, finalUv + vec2(0.005 * decay, 0.0)).r;
                    float blue = texture2D(uTexture, finalUv - vec2(0.005 * decay, 0.0)).b;
                    
                    gl_FragColor = vec4(red, color.g, blue, color.a);
                }
            `
        });

        textPlane = new THREE.Mesh(
            new THREE.PlaneGeometry(10, 5, 32, 32),
            liquidMaterial
        );
        textPlane.position.y = 0.5;
        textPlane.visible = false; // Start hidden
        scene.add(textPlane);
    }

    createLiquidText();

    // ==========================================
    // THEME SWITCHING
    // ==========================================

    function updateThemeVisuals(theme) {
        currentTheme = theme;

        // Update materials - each shape gets its own color in light mode
        if (theme === 'dark') {
            torus.material = iridescent;
            ico.material = iridescent;
            sphere.material = iridescent;
            torusKnot.material = iridescent;
        } else {
            torus.material = lightMaterials.torus;
            ico.material = lightMaterials.ico;
            sphere.material = lightMaterials.sphere;
            torusKnot.material = lightMaterials.torusKnot;
        }

        // Update lighting
        if (theme === 'dark') {
            ambientLight.intensity = 0.3;
            keyLight.intensity = 1.0;
            cyanLight.intensity = 1.5;
            cyanLight2.intensity = 0.8;
            scene.fog = new THREE.FogExp2(0x011418, 0.002);
        } else {
            ambientLight.intensity = 0.6;
            keyLight.intensity = 1.8;
            cyanLight.intensity = 0;
            cyanLight2.intensity = 0;
            scene.fog = null;
        }

        // Update liquid text visibility
        if (textPlane) {
            textPlane.visible = (theme === 'dark');
        }

        // Regenerate environment map
        envMap = generateEnvMap();
        pinkMaterial.envMap = envMap;
        purpleMaterial.envMap = envMap;
        blueMaterial.envMap = envMap;
        magentaMaterial.envMap = envMap;
        iridescent.envMap = envMap;
    }

    // Listen for theme changes
    window.addEventListener('themechange', (e) => {
        updateThemeVisuals(e.detail.theme);
    });

    // Apply initial theme
    updateThemeVisuals(currentTheme);

    // ==========================================
    // INTERACTION
    // ==========================================

    window.addEventListener('mousemove', (e) => {
        // For liquid shader (0-1 range)
        targetMouse.x = e.clientX / window.innerWidth;
        targetMouse.y = 1.0 - (e.clientY / window.innerHeight);

        // For parallax (-1 to 1 range)
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    // ==========================================
    // ANIMATION LOOP
    // ==========================================

    const clock = new THREE.Clock();
    const basePositions = {
        torus: { x: -8, y: 0.5 },
        ico: { x: 8, y: -2.5 },
        sphere: { x: 6, y: 4 },
        torusKnot: { x: -6, y: -4 }
    };

    function animate() {
        const time = clock.getElapsedTime();

        // Screen bounds (based on camera FOV and position)
        const boundX = 9;  // Horizontal limit
        const boundY = 5;  // Vertical limit

        // Helper to clamp position within bounds
        function clampPos(pos, bound) {
            return Math.max(-bound, Math.min(bound, pos));
        }

        // Animate shapes - free flowing movement
        torus.rotation.x = time * 0.15;
        torus.rotation.y = time * 0.2;
        let torusY = basePositions.torus.y + Math.sin(time * 0.3) * 1.5;
        let torusX = basePositions.torus.x + Math.sin(time * 0.2) * 1.0;
        torus.position.y = clampPos(torusY, boundY);
        torus.position.x = clampPos(torusX, boundX);

        ico.rotation.z = time * 0.12;
        ico.rotation.x = time * 0.08;
        let icoY = basePositions.ico.y + Math.cos(time * 0.25) * 1.2;
        let icoX = basePositions.ico.x + Math.cos(time * 0.15) * 0.8;
        ico.position.y = clampPos(icoY, boundY);
        ico.position.x = clampPos(icoX, boundX);

        sphere.rotation.y = time * 0.1;
        let sphereY = basePositions.sphere.y + Math.sin(time * 0.35) * 1.0;
        let sphereX = basePositions.sphere.x + Math.cos(time * 0.2) * 0.8;
        sphere.position.y = clampPos(sphereY, boundY);
        sphere.position.x = clampPos(sphereX, boundX);

        torusKnot.rotation.y = time * 0.18;
        torusKnot.rotation.x = time * 0.1;
        let knotY = basePositions.torusKnot.y + Math.sin(time * 0.28) * 1.0;
        let knotX = basePositions.torusKnot.x + Math.sin(time * 0.18) * 0.8;
        torusKnot.position.y = clampPos(knotY, boundY);
        torusKnot.position.x = clampPos(knotX, boundX);

        // No group rotation - prevents scaling issues

        // Update liquid text shader
        if (liquidMaterial && textPlane.visible) {
            liquidMaterial.uniforms.uMouse.value.lerp(targetMouse, 0.05);
            liquidMaterial.uniforms.uTime.value = time;
        }

        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    }

    animate();

    // ==========================================
    // RESPONSIVE
    // ==========================================

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

})();
