/**
 * LISAN HOLDINGS - Fluid Simulation (Light Mode)
 * Interactive ink/smoke cursor effect with green colors
 */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', () => {
        const canvas = document.getElementById('fluid-canvas');
        if (!canvas) {
            console.warn('Fluid canvas not found');
            return;
        }

        // Only run in light mode
        function shouldRun() {
            return document.documentElement.getAttribute('data-theme') !== 'dark';
        }

        const gl = canvas.getContext('webgl');
        if (!gl) {
            console.warn('WebGL not supported for fluid simulation');
            return;
        }

        console.log('Fluid simulation WebGL initialized');

        // Get floating point extension
        const ext = {
            halfFloatTexType: gl.getExtension('OES_texture_half_float')
                ? gl.getExtension('OES_texture_half_float').HALF_FLOAT_OES
                : gl.UNSIGNED_BYTE
        };
        gl.getExtension('OES_texture_half_float_linear');

        // Mobile detection
        const isMobile = window.innerWidth < 768;

        // Configuration - reduced resolution for mobile
        let config = {
            SIM_RESOLUTION: isMobile ? 64 : 128,
            DYE_RESOLUTION: isMobile ? 512 : 1024,
            DENSITY_DISSIPATION: 2.5,
            VELOCITY_DISSIPATION: 1.0,
            PRESSURE: 0.8,
            PRESSURE_ITERATIONS: isMobile ? 10 : 20,
            CURL: 20,
            SPLAT_RADIUS: isMobile ? 0.2 : 0.15,
            SPLAT_FORCE: 3000,
        };

        function createProgram(vertexShader, fragmentShader) {
            const program = gl.createProgram();
            gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexShader));
            gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentShader));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                console.error('Shader program error:', gl.getProgramInfoLog(program));
            }
            return program;
        }

        function compileShader(type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            }
            return shader;
        }

        const baseVertexShader = `
            precision highp float;
            attribute vec2 aPosition;
            varying vec2 vUv;
            varying vec2 vL;
            varying vec2 vR;
            varying vec2 vT;
            varying vec2 vB;
            uniform vec2 texelSize;
            void main () {
                vUv = aPosition * 0.5 + 0.5;
                vL = vUv - vec2(texelSize.x, 0.0);
                vR = vUv + vec2(texelSize.x, 0.0);
                vT = vUv + vec2(0.0, texelSize.y);
                vB = vUv - vec2(0.0, texelSize.y);
                gl_Position = vec4(aPosition, 0.0, 1.0);
            }
        `;

        const displayShaderSource = `
            precision highp float;
            precision highp sampler2D;
            varying vec2 vUv;
            uniform sampler2D uTexture;
            void main () {
                vec3 c = texture2D(uTexture, vUv).rgb;
                
                // Calculate brightness
                float brightness = max(c.r, max(c.g, c.b));
                
                // Warm yellow and soft purple for bright areas
                float tintMix = sin(vUv.x * 10.0 + vUv.y * 8.0) * 0.5 + 0.5;
                vec3 warmYellow = vec3(0.65, 0.55, 0.15);
                vec3 softPurple = vec3(0.45, 0.25, 0.55);
                vec3 tintColor = mix(warmYellow, softPurple, tintMix);
                
                // Force ALL bright areas to be tinted - no white allowed
                // Normalize the color to remove white, then apply tint
                float maxC = max(0.01, brightness);
                vec3 normalized = c / maxC;
                
                // Blend between original color and tinted version based on brightness
                // Higher brightness = more tint applied
                vec3 tinted = normalized * tintColor * brightness * 1.2;
                c = mix(c, tinted, smoothstep(0.15, 0.4, brightness));
                
                // Hard clamp to prevent any white
                c = min(c, vec3(0.7, 0.75, 0.6));
                
                float a = max(c.r, max(c.g, c.b));
                gl_FragColor = vec4(c, a * 0.85);
            }
        `;

        const splatShader = `
            precision highp float;
            precision highp sampler2D;
            varying vec2 vUv;
            uniform sampler2D uTarget;
            uniform float aspectRatio;
            uniform vec3 color;
            uniform vec2 point;
            uniform float radius;
            void main () {
                vec2 p = vUv - point.xy;
                p.x *= aspectRatio;
                vec3 splat = exp(-dot(p, p) / radius) * color;
                vec3 base = texture2D(uTarget, vUv).xyz;
                gl_FragColor = vec4(base + splat, 1.0);
            }
        `;

        const advectionShader = `
            precision highp float;
            precision highp sampler2D;
            varying vec2 vUv;
            uniform sampler2D uVelocity;
            uniform sampler2D uSource;
            uniform vec2 texelSize;
            uniform vec2 dyeTexelSize;
            uniform float dt;
            uniform float dissipation;
            vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
                vec2 st = uv / tsize - 0.5;
                vec2 iuv = floor(st);
                vec2 fuv = fract(st);
                vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
                vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
                vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
                vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
                return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
            }
            void main () {
                vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
                vec4 result = bilerp(uSource, coord, dyeTexelSize);
                float decay = 1.0 + dissipation * dt;
                gl_FragColor = result / decay;
            }
        `;

        const divergenceShader = `
            precision mediump float;
            precision mediump sampler2D;
            varying highp vec2 vUv;
            varying highp vec2 vL;
            varying highp vec2 vR;
            varying highp vec2 vT;
            varying highp vec2 vB;
            uniform sampler2D uVelocity;
            void main () {
                float L = texture2D(uVelocity, vL).x;
                float R = texture2D(uVelocity, vR).x;
                float T = texture2D(uVelocity, vT).y;
                float B = texture2D(uVelocity, vB).y;
                vec2 C = texture2D(uVelocity, vUv).xy;
                if (vL.x < 0.0) { L = -C.x; }
                if (vR.x > 1.0) { R = -C.x; }
                if (vT.y > 1.0) { T = -C.y; }
                if (vB.y < 0.0) { B = -C.y; }
                float div = 0.5 * (R - L + T - B);
                gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
            }
        `;

        const curlShader = `
            precision mediump float;
            precision mediump sampler2D;
            varying highp vec2 vUv;
            varying highp vec2 vL;
            varying highp vec2 vR;
            varying highp vec2 vT;
            varying highp vec2 vB;
            uniform sampler2D uVelocity;
            void main () {
                float L = texture2D(uVelocity, vL).y;
                float R = texture2D(uVelocity, vR).y;
                float T = texture2D(uVelocity, vT).x;
                float B = texture2D(uVelocity, vB).x;
                float vorticity = R - L - T + B;
                gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
            }
        `;

        const vorticityShader = `
            precision highp float;
            precision highp sampler2D;
            varying vec2 vUv;
            varying vec2 vL;
            varying vec2 vR;
            varying vec2 vT;
            varying vec2 vB;
            uniform sampler2D uVelocity;
            uniform sampler2D uCurl;
            uniform float curl;
            uniform float dt;
            void main () {
                float L = texture2D(uCurl, vL).x;
                float R = texture2D(uCurl, vR).x;
                float T = texture2D(uCurl, vT).x;
                float B = texture2D(uCurl, vB).x;
                float C = texture2D(uCurl, vUv).x;
                vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
                force /= length(force) + 0.0001;
                force *= curl * C;
                force.y *= -1.0;
                vec2 velocity = texture2D(uVelocity, vUv).xy;
                velocity += force * dt;
                velocity = min(max(velocity, -1000.0), 1000.0);
                gl_FragColor = vec4(velocity, 0.0, 1.0);
            }
        `;

        const pressureShader = `
            precision mediump float;
            precision mediump sampler2D;
            varying highp vec2 vUv;
            varying highp vec2 vL;
            varying highp vec2 vR;
            varying highp vec2 vT;
            varying highp vec2 vB;
            uniform sampler2D uPressure;
            uniform sampler2D uDivergence;
            void main () {
                float L = texture2D(uPressure, vL).x;
                float R = texture2D(uPressure, vR).x;
                float T = texture2D(uPressure, vT).x;
                float B = texture2D(uPressure, vB).x;
                float C = texture2D(uPressure, vUv).x;
                float divergence = texture2D(uDivergence, vUv).x;
                float pressure = (L + R + B + T - divergence) * 0.25;
                gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
            }
        `;

        const gradientSubtractShader = `
            precision mediump float;
            precision mediump sampler2D;
            varying highp vec2 vUv;
            varying highp vec2 vL;
            varying highp vec2 vR;
            varying highp vec2 vT;
            varying highp vec2 vB;
            uniform sampler2D uPressure;
            uniform sampler2D uVelocity;
            void main () {
                float L = texture2D(uPressure, vL).x;
                float R = texture2D(uPressure, vR).x;
                float T = texture2D(uPressure, vT).x;
                float B = texture2D(uPressure, vB).x;
                vec2 velocity = texture2D(uVelocity, vUv).xy;
                velocity.xy -= vec2(R - L, T - B);
                gl_FragColor = vec4(velocity, 0.0, 1.0);
            }
        `;

        const clearShader = `
            precision mediump float;
            precision mediump sampler2D;
            varying highp vec2 vUv;
            uniform sampler2D uTexture;
            uniform float value;
            void main () {
                gl_FragColor = value * texture2D(uTexture, vUv);
            }
        `;

        const splatProgram = createProgram(baseVertexShader, splatShader);
        const curlProgram = createProgram(baseVertexShader, curlShader);
        const vorticityProgram = createProgram(baseVertexShader, vorticityShader);
        const divergenceProgram = createProgram(baseVertexShader, divergenceShader);
        const clearProgram = createProgram(baseVertexShader, clearShader);
        const pressureProgram = createProgram(baseVertexShader, pressureShader);
        const gradientSubtractProgram = createProgram(baseVertexShader, gradientSubtractShader);
        const advectionProgram = createProgram(baseVertexShader, advectionShader);
        const displayProgram = createProgram(baseVertexShader, displayShaderSource);

        function getUniforms(program) {
            let uniforms = {};
            let uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
            for (let i = 0; i < uniformCount; i++) {
                let uniformName = gl.getActiveUniform(program, i).name;
                uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
            }
            return uniforms;
        }

        const programs = [splatProgram, curlProgram, vorticityProgram, divergenceProgram, clearProgram, pressureProgram, gradientSubtractProgram, advectionProgram, displayProgram];
        programs.forEach(p => p.uniforms = getUniforms(p));

        function createFBO(w, h, internalFormat, format, type, param) {
            gl.activeTexture(gl.TEXTURE0);
            let texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
            let fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            gl.viewport(0, 0, w, h);
            gl.clear(gl.COLOR_BUFFER_BIT);
            return { texture, fbo, width: w, height: h, texelSizeX: 1.0 / w, texelSizeY: 1.0 / h, attach: (id) => { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; } };
        }

        function createDoubleFBO(w, h, internalFormat, format, type, param) {
            let fbo1 = createFBO(w, h, internalFormat, format, type, param);
            let fbo2 = createFBO(w, h, internalFormat, format, type, param);
            return {
                width: w, height: h, texelSizeX: fbo1.texelSizeX, texelSizeY: fbo1.texelSizeY,
                get read() { return fbo1; }, set read(value) { fbo1 = value; },
                get write() { return fbo2; }, set write(value) { fbo2 = value; },
                swap() { let temp = fbo1; fbo1 = fbo2; fbo2 = temp; }
            };
        }

        let dye, velocity, divergence, curl, pressure;

        function initFramebuffers() {
            let simRes = getResolution(config.SIM_RESOLUTION);
            let dyeRes = getResolution(config.DYE_RESOLUTION);
            const texType = ext.halfFloatTexType;

            dye = createDoubleFBO(dyeRes.width, dyeRes.height, gl.RGBA, gl.RGBA, texType, gl.LINEAR);
            velocity = createDoubleFBO(simRes.width, simRes.height, gl.RGBA, gl.RGBA, texType, gl.LINEAR);
            divergence = createFBO(simRes.width, simRes.height, gl.RGBA, gl.RGBA, texType, gl.NEAREST);
            curl = createFBO(simRes.width, simRes.height, gl.RGBA, gl.RGBA, texType, gl.NEAREST);
            pressure = createDoubleFBO(simRes.width, simRes.height, gl.RGBA, gl.RGBA, texType, gl.NEAREST);
        }

        function getResolution(resolution) {
            let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
            if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
            let min = Math.round(resolution);
            let max = Math.round(resolution * aspectRatio);
            if (gl.drawingBufferWidth > gl.drawingBufferHeight) return { width: max, height: min };
            else return { width: min, height: max };
        }

        function blit(target) {
            if (target == null) {
                gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            } else {
                gl.viewport(0, 0, target.width, target.height);
                gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
            }
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        function update() {
            if (!shouldRun()) {
                requestAnimationFrame(update);
                return;
            }

            resizeCanvas();
            const dt = Math.min((Date.now() - lastUpdateTime) / 1000, 0.016);
            lastUpdateTime = Date.now();

            gl.disable(gl.BLEND);

            gl.useProgram(curlProgram);
            gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
            blit(curl);

            gl.useProgram(vorticityProgram);
            gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
            gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1));
            gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
            gl.uniform1f(vorticityProgram.uniforms.dt, dt);
            blit(velocity.write);
            velocity.swap();

            gl.useProgram(divergenceProgram);
            gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
            blit(divergence);

            gl.useProgram(clearProgram);
            gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0));
            gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
            blit(pressure.write);
            pressure.swap();

            gl.useProgram(pressureProgram);
            gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
            for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
                gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1));
                blit(pressure.write);
                pressure.swap();
            }

            gl.useProgram(gradientSubtractProgram);
            gl.uniform2f(gradientSubtractProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(gradientSubtractProgram.uniforms.uPressure, pressure.read.attach(0));
            gl.uniform1i(gradientSubtractProgram.uniforms.uVelocity, velocity.read.attach(1));
            blit(velocity.write);
            velocity.swap();

            gl.useProgram(advectionProgram);
            gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
            let velocityId = velocity.read.attach(0);
            gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
            gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
            gl.uniform1f(advectionProgram.uniforms.dt, dt);
            gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
            blit(velocity.write);
            velocity.swap();

            gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
            gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
            gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
            gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
            blit(dye.write);
            dye.swap();

            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.useProgram(displayProgram);
            gl.uniform1i(displayProgram.uniforms.uTexture, dye.read.attach(0));
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

            requestAnimationFrame(update);
        }

        function resizeCanvas() {
            let width = window.innerWidth;
            let height = window.innerHeight;
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
                initFramebuffers();
            }
        }

        function splat(x, y, dx, dy, color) {
            gl.useProgram(splatProgram);
            gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
            gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
            gl.uniform2f(splatProgram.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
            gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0);
            gl.uniform1f(splatProgram.uniforms.radius, config.SPLAT_RADIUS / 100.0);
            blit(velocity.write);
            velocity.swap();

            gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
            gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
            blit(dye.write);
            dye.swap();
        }

        let lastUpdateTime = Date.now();
        initFramebuffers();
        update();

        // Helper to get random green color
        function getRandomGreenColor() {
            let r = Math.random();
            if (r < 0.33) return { r: 0.1, g: 0.7, b: 0.4 };       // Emerald
            else if (r < 0.66) return { r: 0.1, g: 0.6, b: 0.6 };  // Teal
            else return { r: 0.3, g: 0.8, b: 0.2 };                // Lime
        }

        // Mouse support (desktop)
        let lastMouseX = 0, lastMouseY = 0;
        window.addEventListener('mousemove', e => {
            if (!shouldRun()) return;
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            splat(e.clientX, e.clientY, dx * 5, -dy * 5, getRandomGreenColor());
        });

        // Touch support (mobile)
        let lastTouchX = 0, lastTouchY = 0;
        window.addEventListener('touchstart', e => {
            if (!shouldRun()) return;
            const touch = e.touches[0];
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
            // Initial splash on touch
            splat(touch.clientX, touch.clientY, 0, -10, getRandomGreenColor());
        }, { passive: true });

        window.addEventListener('touchmove', e => {
            if (!shouldRun()) return;
            const touch = e.touches[0];
            const dx = touch.clientX - lastTouchX;
            const dy = touch.clientY - lastTouchY;
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
            splat(touch.clientX, touch.clientY, dx * 8, -dy * 8, getRandomGreenColor());
        }, { passive: true });

        // Initial splash
        setTimeout(() => {
            if (shouldRun()) {
                splat(window.innerWidth / 2, window.innerHeight / 2, 0, -20, { r: 0.2, g: 0.7, b: 0.5 });
            }
        }, 500);
    });
})();
