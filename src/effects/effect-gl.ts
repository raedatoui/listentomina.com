// MINA — WebGL2 fallback backend. Same sequence, same geometry, same timeline
// as the WebGPU engine (src/effects/effect.ts); only the GPU API differs.
//
// Everything above the API line is shared verbatim: layout.ts builds the shard
// mesh and the growing segment network, texture.ts fits the artwork and samples
// its colours, presets/ and choreo.ts drive the params. What lives here is the
// GL plumbing plus a copy of the per-frame math from effect.ts's render loop.
//
// Scope: the `lines` renderer only. The /loop shader modes (sdf field,
// particles, swarm, ink) need storage buffers, which WebGL2 does not have, and
// nothing outside /loop uses them.
//
// This is a SECOND BACKEND, not a refactor of the first — the WebGPU path is
// untouched, and `record:loop`'s byte-identical guarantee with it. The cost is
// that the frame math below is duplicated: change the timeline, the glow
// stacking or the dot clocks in effect.ts and you must change them here too.

import { bindPresetTweens, type PresetChoreo } from '@/effects/choreo';
import { BASE, type LiveParams } from '@/effects/config';
import type { MinaEffect } from '@/effects/effect';
import { buildGui } from '@/effects/gui';
import { buildLayout, buildMovePlan, clamp01, type Dot, hsb2rgb, type MovePlan, type Placement, type Seg } from '@/effects/layout';
import { MARK } from '@/effects/mark';
import { PRESETS } from '@/effects/presets';
import {
    GL_DOT_FS,
    GL_DOT_VS,
    GL_LINE_FS,
    GL_LINE_VS,
    GL_MOSAIC_FS,
    GL_MOSAIC_VS,
    GL_POST_BLUR_FS,
    GL_POST_COMP_FS,
    GL_POST_VS,
} from '@/effects/shaders/gl';
import { clampCanvas, fallbackTexture, loadTexture, type TextureSource } from '@/effects/texture';

const MAX_LINE_INST = 96;
const BLOOM_ENERGY_TAU = 0.95;
const GLOW_MAX = 3;

export async function createMinaEffectGL(canvas: HTMLCanvasElement, presetName = 'default', withGui = true, withKeys = true): Promise<MinaEffect> {
    // rebound after the guard, not used through the nullable binding: narrowing
    // a captured const doesn't reach the closures below (same reason effect.ts
    // does maybeCtx -> ctx for the WebGPU context)
    const maybeGl = canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true, // matches the WebGPU path's alphaMode
        antialias: false, // the lines carry their own AA; the scene target is offscreen anyway
        depth: false,
        stencil: false,
    });
    if (!maybeGl) throw new Error('WebGL2 unavailable');
    const gl = maybeGl;

    const must = <T>(v: T | null, what: string): T => {
        if (!v) throw new Error(`WebGL2: could not create ${what}`);
        return v;
    };

    // ---------- program helpers ----------
    const compile = (type: number, src: string) => {
        const s = must(gl.createShader(type), 'shader');
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`WebGL2 shader: ${gl.getShaderInfoLog(s)}`);
        return s;
    };
    const link = (vsSrc: string, fsSrc: string) => {
        const p = must(gl.createProgram(), 'program');
        const vs = compile(gl.VERTEX_SHADER, vsSrc);
        const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
        gl.attachShader(p, vs);
        gl.attachShader(p, fs);
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`WebGL2 program: ${gl.getProgramInfoLog(p)}`);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        return p;
    };
    type Uni = Record<string, WebGLUniformLocation | null>;
    const uniforms = (p: WebGLProgram, names: string[]): Uni => {
        const out: Uni = {};
        for (const n of names) out[n] = gl.getUniformLocation(p, n);
        return out;
    };

    const mosaicProg = link(GL_MOSAIC_VS, GL_MOSAIC_FS);
    const lineProg = link(GL_LINE_VS, GL_LINE_FS);
    const dotProg = link(GL_DOT_VS, GL_DOT_FS);
    const blurProg = link(GL_POST_VS, GL_POST_BLUR_FS);
    const compProg = link(GL_POST_VS, GL_POST_COMP_FS);

    const mosaicU = uniforms(mosaicProg, [
        'uViewport',
        'uResolve',
        'uAlpha',
        'uTexScale',
        'uGrowSpan',
        'uWhiteDur',
        'uColorDur',
        'uTexDur',
        'uWhiteLevel',
        'uColorSat',
        'uColorBoost',
        'uFlashTint',
        'uVeil',
        'uTex',
    ]);
    const lineU = uniforms(lineProg, [
        'uViewport',
        'uThickness',
        'uSoft',
        'uColor',
        'uCapScale',
        'uColorTail',
        'uAlpha',
        'uFalloff',
        'uTrail',
        'uTrailBias',
        'uTaper',
        'uSegTint',
        'uTailDim',
    ]);
    const dotU = uniforms(dotProg, [
        'uViewport',
        'uProgress',
        'uDotGrow',
        'uColor',
        'uRadiusMul',
        'uRStart',
        'uREnd',
        'uRPow',
        'uSoft',
        'uAStart',
        'uAEnd',
        'uColFrom',
    ]);
    const blurU = uniforms(blurProg, ['uTex', 'uStep']);
    const compU = uniforms(compProg, ['uTex', 'uStrength']);

    // every sampler reads texture unit 0 — one texture is bound per draw
    for (const [p, u] of [
        [mosaicProg, mosaicU],
        [blurProg, blurU],
        [compProg, compU],
    ] as [WebGLProgram, Uni][]) {
        gl.useProgram(p);
        gl.uniform1i(u.uTex, 0);
    }

    // The packed-array layouts below mirror the WGSL uniform structs 1:1, so the
    // frame math can stay identical to effect.ts's; these unpack them onto loose
    // uniforms. Index comments name the struct field.
    const setLineU = (a: Float32Array) => {
        gl.uniform2f(lineU.uViewport, a[0], a[1]);
        gl.uniform1f(lineU.uThickness, a[2]);
        gl.uniform1f(lineU.uSoft, a[3]);
        gl.uniform3f(lineU.uColor, a[4], a[5], a[6]);
        gl.uniform1f(lineU.uCapScale, a[7]);
        gl.uniform3f(lineU.uColorTail, a[8], a[9], a[10]);
        gl.uniform1f(lineU.uAlpha, a[11]);
        gl.uniform1f(lineU.uFalloff, a[12]);
        gl.uniform1f(lineU.uTrail, a[13]);
        gl.uniform1f(lineU.uTrailBias, a[14]);
        gl.uniform1f(lineU.uTaper, a[15]);
        gl.uniform1f(lineU.uSegTint, a[16]);
        gl.uniform1f(lineU.uTailDim, a[17]);
    };
    const setDotU = (a: Float32Array) => {
        gl.uniform2f(dotU.uViewport, a[0], a[1]);
        gl.uniform1f(dotU.uProgress, a[2]);
        gl.uniform1f(dotU.uDotGrow, a[3]);
        gl.uniform3f(dotU.uColor, a[4], a[5], a[6]);
        gl.uniform1f(dotU.uRadiusMul, a[7]);
        gl.uniform1f(dotU.uRStart, a[8]);
        gl.uniform1f(dotU.uREnd, a[9]);
        gl.uniform1f(dotU.uRPow, a[10]);
        gl.uniform1f(dotU.uSoft, a[11]);
        gl.uniform1f(dotU.uAStart, a[12]);
        gl.uniform1f(dotU.uAEnd, a[13]);
        gl.uniform1f(dotU.uColFrom, a[14]);
    };

    // ---------- blend states (premultiplied, as in the WebGPU path) ----------
    const blendOver = () => gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // pure light: colour adds, page visibility untouched
    const blendAdd = () => gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);

    // ---------- geometry buffers ----------
    const attrib = (loc: number, size: number, stride: number, offset: number, divisor: number) => {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset);
        gl.vertexAttribDivisor(loc, divisor);
    };

    const lineData = new Float32Array(MAX_LINE_INST * 10); // tail xy, head xy, alphaMul, motion, colour rgb, ext
    const lineBuf = must(gl.createBuffer(), 'buffer');
    const lineVAO = must(gl.createVertexArray(), 'VAO');
    gl.bindVertexArray(lineVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, lineData.byteLength, gl.DYNAMIC_DRAW);
    attrib(0, 2, 40, 0, 1); // tail px
    attrib(1, 2, 40, 8, 1); // head px
    attrib(2, 1, 40, 16, 1); // alpha mul
    attrib(3, 1, 40, 20, 1); // motion
    attrib(4, 3, 40, 24, 1); // texture colour
    attrib(5, 1, 40, 36, 1); // ext flag

    const dotData = new Float32Array(MARK.DOTS.length * 7);
    const dotDataA = new Float32Array(MARK.DOTS.length * 7);
    const mkDotVAO = (bytes: number) => {
        const buf = must(gl.createBuffer(), 'buffer');
        const vao = must(gl.createVertexArray(), 'VAO');
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.DYNAMIC_DRAW);
        attrib(0, 2, 28, 0, 1); // centre px
        attrib(1, 1, 28, 8, 1); // radius px
        attrib(2, 1, 28, 12, 1); // start (q units)
        attrib(3, 3, 28, 16, 1); // texture colour
        return { buf, vao };
    };
    const dotMain = mkDotVAO(dotData.byteLength);
    const dotSrc = mkDotVAO(dotDataA.byteLength);

    // the shard mesh is rebuilt whenever the layout changes, so its buffer is
    // reallocated rather than updated in place
    const mosaicBuf = must(gl.createBuffer(), 'buffer');
    const mosaicVAO = must(gl.createVertexArray(), 'VAO');
    gl.bindVertexArray(mosaicVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, mosaicBuf);
    attrib(0, 2, 40, 0, 0); // pos px
    attrib(1, 2, 40, 8, 0); // uv
    attrib(2, 3, 40, 16, 0); // flat colour
    attrib(3, 1, 40, 28, 0); // delay
    attrib(4, 2, 40, 32, 0); // shard centroid uv
    let mosaicVertCount = 0;

    // fullscreen-triangle draws pull nothing — but a VAO must still be bound
    const emptyVAO = must(gl.createVertexArray(), 'VAO');
    gl.bindVertexArray(null);

    // ---------- render targets ----------
    // RGBA16F keeps the bloom's HDR headroom. Some of the older GPUs this
    // backend exists for cannot render to float at all; there the chain runs in
    // RGBA8 and the bloom simply clips instead of blooming past white.
    const floatOK = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    const HDR_FORMAT = floatOK ? gl.RGBA16F : gl.RGBA8;
    const HDR_TYPE = floatOK ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    interface Target {
        tex: WebGLTexture;
        fbo: WebGLFramebuffer;
        w: number;
        h: number;
    }
    const mkTarget = (w: number, h: number): Target => {
        const tex = must(gl.createTexture(), 'texture');
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, HDR_FORMAT, w, h, 0, gl.RGBA, HDR_TYPE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const fbo = must(gl.createFramebuffer(), 'framebuffer');
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { tex, fbo, w, h };
    };
    let scene: Target | null = null;
    let bloomA: Target | null = null;
    let bloomB: Target | null = null;
    const dropTarget = (t: Target | null) => {
        if (!t) return;
        gl.deleteTexture(t.tex);
        gl.deleteFramebuffer(t.fbo);
    };
    function makePostTargets() {
        dropTarget(scene);
        dropTarget(bloomA);
        dropTarget(bloomB);
        scene = mkTarget(canvas.width, canvas.height);
        const hw = Math.max(1, canvas.width >> 1);
        const hh = Math.max(1, canvas.height >> 1);
        bloomA = mkTarget(hw, hh);
        bloomB = mkTarget(hw, hh);
    }

    // ---------- artwork texture ----------
    // No UNPACK_FLIP_Y: texImage2D puts the source's top row at v=0, exactly as
    // WebGPU's copyExternalImageToTexture does, so layout.ts's top-left-origin
    // uvs (uv = px / viewport) sample identically under both APIs. The flip
    // convention that DOES differ is the post chain's — see shaders/gl.ts.
    const maxTexDim = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const artTex = must(gl.createTexture(), 'texture');
    gl.bindTexture(gl.TEXTURE_2D, artTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([16, 24, 28, 255, 10, 16, 20, 255, 10, 16, 20, 255, 16, 24, 28, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // ---------- params ----------
    const params: LiveParams = {
        ...BASE,
        ...PRESETS[presetName]?.config,
        progress: 0, // transient scrub 0..1
        move: 0, // transient move scrub 0..1
        dotTiming: '', // derived readout (not persisted)
        shaderMode: 'lines', // the only renderer this backend has
    };

    let choreo: PresetChoreo | null = null;
    function rebindTweens(name: string) {
        choreo?.dispose();
        choreo = bindPresetTweens(api, PRESETS[name]?.tweens, { ...BASE, ...PRESETS[name]?.config });
    }

    let texSource: TextureSource | null = null;
    let loadedTexture = '';
    let texTimer: number | null = null;
    let capturing = false;
    let cellsDirty = true;

    function uploadTexture(source: TextureSource) {
        const src = clampCanvas(source.canvas, maxTexDim);
        if (!src.width || !src.height) {
            console.warn('texture source is empty — ignored');
            return;
        }
        texSource = source;
        gl.bindTexture(gl.TEXTURE_2D, artTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        cellsDirty = true; // re-sample shard colours from the fresh source
    }
    async function refreshTexture() {
        if (capturing) return;
        capturing = true;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        try {
            uploadTexture(await loadTexture(params.textureUrl, w, h, params.textureFit));
        } catch (e) {
            console.warn('texture load failed, using fallback:', e);
            uploadTexture(fallbackTexture(w, h));
        } finally {
            loadedTexture = `${params.textureUrl}|${params.textureFit}`;
            capturing = false;
        }
    }

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    function resize() {
        const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
        const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
        if (canvas.width === w && canvas.height === h) return;
        canvas.width = w;
        canvas.height = h;
        makePostTargets();
        cellsDirty = true; // arrangement depends on the screen rect
        if (texTimer !== null) clearTimeout(texTimer);
        texTimer = window.setTimeout(() => {
            texTimer = null;
            void refreshTexture();
        }, 120);
    }
    resize();
    addEventListener('resize', resize);

    // ---------- sequence + movement state machine ----------
    let playing = false;
    let started = false;
    let curPos = 0;
    let mode: 'main' | 'move' = 'main';
    let moveData: MovePlan | null = null;
    let playingMove = false;
    let autoMoved = false;
    let bare = false; // post-move: logo only, no extensions
    let energySmooth = 0; // low-passed motion energy feeding the bloom composite

    let layoutSegs: Seg[] = [];
    let layoutDots: Dot[] = [];
    let markPalette: [number, number, number][] = [];
    let dockedAt = 0;

    const primaryPlacement = (): Placement => ({ s: params.logoScale, x: params.logoX, y: params.logoY });
    const targetPlacement = (): Placement => ({ s: params.logoScale2, x: params.logoX2, y: params.logoY2 });

    function rebuildLayoutNow() {
        if (!texSource) return;
        const W = canvas.clientWidth;
        const H = canvas.clientHeight;
        const res = buildLayout(W, H, curPos === 0 ? primaryPlacement() : targetPlacement(), params, texSource.sample);
        gl.bindBuffer(gl.ARRAY_BUFFER, mosaicBuf);
        gl.bufferData(gl.ARRAY_BUFFER, res.verts, gl.STATIC_DRAW);
        mosaicVertCount = res.vertCount;
        layoutSegs = res.segs;
        layoutDots = res.dots;
        // keep the palette from the PRIMARY placement: the docked rebuild
        // samples over black (all-white fallback), which is no palette at all
        if (curPos === 0) markPalette = res.segs.filter((s) => !s.isExt).map((s) => s.col);
        cellsDirty = false;
    }

    function startMovePlan() {
        const W = canvas.clientWidth;
        const H = canvas.clientHeight;
        const tp = curPos === 0 ? targetPlacement() : primaryPlacement();
        const srcC = curPos === 0 ? { x: params.logoX, y: params.logoY } : { x: params.logoX2, y: params.logoY2 };
        const srcSegs = layoutSegs.filter((sg) => !(bare && sg.isExt));
        const sample = texSource ? texSource.sample : () => [1, 1, 1] as [number, number, number];
        moveData = buildMovePlan(W, H, srcSegs, layoutDots, srcC, tp, params, sample);
    }

    function play() {
        mode = 'main';
        moveData = null;
        playingMove = false;
        params.move = 0;
        if (curPos !== 0) {
            curPos = 0;
            cellsDirty = true; // always start large
        }
        params.progress = 0;
        playing = true;
        autoMoved = false;
        bare = false;
        api.onPlay?.();
        api.onPhase?.('play');
    }
    function doMove() {
        if (mode === 'move') return;
        startMovePlan();
        params.move = 0;
        mode = 'move';
        playingMove = true;
        api.onMove?.();
        api.onPhase?.('move');
    }
    function commitMove() {
        curPos = 1 - curPos;
        mode = 'main';
        moveData = null;
        playingMove = false;
        params.move = 0;
        bare = true; // settled: logo alone (extensions left with the move)
        dockedAt = performance.now();
        rebuildLayoutNow(); // same placement math -> visually seamless swap
        api.onPhase?.('docked');
    }

    const gui = !withGui
        ? null
        : buildGui(
              params,
              {
                  play,
                  doMove,
                  invalidateCells: () => {
                      cellsDirty = true;
                  },
                  invalidateTarget: () => {
                      if (curPos === 1) cellsDirty = true;
                  },
                  stopPlaying: () => {
                      playing = false;
                  },
                  scrubMove: () => {
                      playingMove = false;
                      if (mode !== 'move') {
                          params.progress = 1;
                          playing = false;
                          startMovePlan();
                          mode = 'move';
                      }
                      if (params.move >= 1) commitMove();
                  },
                  onPresetApplied: (preset) => {
                      cellsDirty = true;
                      if (`${params.textureUrl}|${params.textureFit}` !== loadedTexture) void refreshTexture();
                      rebindTweens(preset);
                  },
                  paramEdited: (prop, value) => choreo?.setRest(prop, value),
              },
              presetName
          );

    const onKey = (e: KeyboardEvent) => {
        const k = e.key.toLowerCase();
        if (k === 'r') play();
        if (k === 'm') doMove();
        if (k === 'h' && gui) gui.show(gui._hidden);
    };
    if (withKeys) addEventListener('keydown', onKey);

    // ---------- render loop ----------
    const lineUData = new Float32Array(18);
    const glowUData: Float32Array[] = [];
    for (let i = 0; i < GLOW_MAX; i++) glowUData.push(new Float32Array(18));
    const dotUData = new Float32Array(15);
    const dotGlowUData = new Float32Array(15);
    const dotPulseUData = new Float32Array(15);
    const dotShrinkUData = new Float32Array(15);
    const dotShrinkGlowUData = new Float32Array(15);

    let last = performance.now();
    let raf = 0;
    let destroyed = false;
    let prerollFrames = 0;
    let firstDone = false;
    let resolveFirst!: () => void;
    const firstFrame = new Promise<void>((resolve) => {
        resolveFirst = resolve;
    });
    const settleFirst = () => {
        if (!firstDone) {
            firstDone = true;
            resolveFirst();
        }
    };
    const firstSafety = window.setTimeout(settleFirst, 6000); // a failure can't leave the cover on

    function frame(now: number) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        resize();
        if (cellsDirty && texSource && mode === 'main') rebuildLayoutNow();

        if (params.autoplay && !started && texSource && !document.hidden) {
            started = true;
            play();
        }
        if (playing) {
            params.progress = Math.min(1, params.progress + dt / params.duration);
            if (params.progress >= 1) playing = false;
        }

        // Derived timeline — identical to effect.ts: everything is expressed in
        // "growth units" (the ray growth phase = 1), then normalised into
        // progress space. grow -> shards resolve -> handoff fade -> formation.
        const p = params.progress;
        const texUnits = params.whiteDur + params.colorDur + params.texDur;
        const nrm = 1 / (1 + texUnits + params.hold);
        const growSpan = nrm;
        const handoffAt = (1 + texUnits) * nrm;
        const holdSpan = Math.max(1e-4, params.hold * nrm);
        const mosaicA = 1 - clamp01((p - handoffAt) / holdSpan);

        const moveAt = Math.min(1, handoffAt + params.moveDelay / Math.max(0.1, params.duration));
        if (mode === 'main' && params.autoMove && started && !autoMoved && p >= moveAt) {
            autoMoved = true;
            doMove();
        }

        const W = canvas.clientWidth;
        const H = canvas.clientHeight;
        const texScale = params.ripple ? params.texScale : 1;

        // build this frame's line segments from the growing network
        const q = clamp01(p / growSpan);
        let inst = 0;
        let motionSum = 0;
        const pushSeg = (
            L: { p0: [number, number]; d: [number, number] },
            ta: number,
            tb: number,
            aMul: number,
            motion: number,
            col: [number, number, number],
            ext: number
        ) => {
            if (Math.abs(tb - ta) < 0.75 || inst >= MAX_LINE_INST || aMul <= 0.003) return;
            const o = inst * 10;
            lineData[o] = L.p0[0] + L.d[0] * ta;
            lineData[o + 1] = L.p0[1] + L.d[1] * ta;
            lineData[o + 2] = L.p0[0] + L.d[0] * tb;
            lineData[o + 3] = L.p0[1] + L.d[1] * tb;
            lineData[o + 4] = aMul;
            lineData[o + 5] = motion;
            lineData[o + 6] = col[0];
            lineData[o + 7] = col[1];
            lineData[o + 8] = col[2];
            lineData[o + 9] = ext;
            motionSum += motion;
            inst++;
        };
        if (mode === 'move' && moveData) {
            if (playingMove) {
                params.move = Math.min(1, params.move + dt / params.moveDur);
                if (params.move >= 1) playingMove = false;
            }
            const m = params.move;
            const fadeM = Math.max(1e-4, params.trailFade / Math.max(0.1, params.moveDur));
            for (const s of moveData.a) {
                if (s.exits) {
                    const head = s.to + (s.edge - s.to) * clamp01((m - s.hStart) / s.hDur);
                    const tail = s.from + (s.edge - s.from) * clamp01((m - s.tStart) / s.tDur);
                    pushSeg(s.L, tail, head, 1, 1, s.col, s.isExt);
                } else {
                    pushSeg(s.L, s.from, s.to, 1 - clamp01((m - s.fadeStart) / s.fadeDur), 0, s.col, s.isExt);
                }
            }
            for (const s of moveData.b) {
                const head = s.X + (s.far - s.X) * clamp01((m - s.hStart) / s.hDur);
                const tail = s.X + (s.near - s.X) * clamp01((m - s.tStart) / s.tDur);
                const done = Math.max(s.hStart + s.hDur, s.tStart + s.tDur);
                pushSeg(s.L, tail, head, 1, clamp01((done + fadeM - m) / fadeM), s.col, 0);
            }
            if (params.move >= 1 && !playingMove) commitMove();
        } else {
            const qRaw = p / growSpan;
            const fadeQ = Math.max(1e-4, params.trailFade / Math.max(0.1, params.duration * growSpan));
            const n = markPalette.length;
            const flow = bare && n > 1 ? clamp01((now - dockedAt) / 1200) : 0;
            const FLOW_SPEED = 1.5;
            const ft = (now / 1000) * FLOW_SPEED;
            const segCount = Math.max(1, layoutSegs.length);
            for (let i = 0; i < layoutSegs.length; i++) {
                const s = layoutSegs[i];
                if (bare && s.isExt) continue;
                const u = (q - s.startT) / s.dur;
                if (u <= 0) continue;
                const head = s.from + (s.to - s.from) * clamp01(u);
                const motion = clamp01((s.startT + s.dur + fadeQ - qRaw) / fadeQ);
                let col = s.col;
                if (flow > 0) {
                    const ph = (ft + (i / segCount) * n) % n;
                    const j = Math.floor(ph);
                    const f = ph - j;
                    const a = markPalette[j % n];
                    const b = markPalette[(j + 1) % n];
                    col = [
                        col[0] + (a[0] + (b[0] - a[0]) * f - col[0]) * flow,
                        col[1] + (a[1] + (b[1] - a[1]) * f - col[1]) * flow,
                        col[2] + (a[2] + (b[2] - a[2]) * f - col[2]) * flow,
                    ];
                }
                pushSeg(s.L, s.from, head, 1, motion, col, s.isExt);
            }
        }
        if (inst) {
            gl.bindBuffer(gl.ARRAY_BUFFER, lineBuf);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineData, 0, inst * 10);
        }

        const [lr, lg, lb] = hsb2rgb(params.lineH, params.lineS, params.lineB);
        const wBase = Math.max(0.05, params.logoScale);
        const scaleOf = (posIdx: number) => (posIdx === 0 ? params.logoScale : params.logoScale2);
        let wf = scaleOf(curPos) / wBase;
        if (mode === 'move' && moveData) {
            const wTo = scaleOf(1 - curPos) / wBase;
            wf += (wTo - wf) * clamp01(params.move);
        }
        const lw = Math.max(0.8, params.lineWidth * wf);
        const [tr, tg, tb] = hsb2rgb(params.lineH + params.trailHue, params.lineS, params.lineB * params.trailDim);
        lineUData.set([W, H, lw, 0, lr, lg, lb, 1, tr, tg, tb, 1.0, 2, params.trail, params.trailBias, params.taper, params.lineTint, params.trailDim]);
        // glow: stacked passes, each wider and fainter, sharing the trail shading
        const ga = 0.55 * params.glow;
        const [gr, gg, gb] = hsb2rgb(params.lineH + params.glowHue, params.lineS, params.lineB);
        const glowN = Math.max(1, Math.min(GLOW_MAX, Math.round(params.glowLayers)));
        for (let i = 0; i < glowN; i++) {
            const t = (i + 1) / glowN;
            glowUData[i].set([
                W,
                H,
                lw * (1 + params.glowWidth * t) + 4 * t,
                1,
                gr,
                gg,
                gb,
                0.15,
                gr,
                gg,
                gb,
                (ga * 0.55 ** i) / Math.sqrt(glowN),
                params.glowFalloff,
                params.trail * 0.75,
                params.trailBias,
                params.taper,
                params.lineTint,
                1, // glow tail keeps the segment colour; its alpha ramp does the fading
            ]);
        }

        // Dot clocks. Main mode: absolute progress. Move mode: target dots grow
        // late in the move (with pulses) while the source dots shrink away.
        const putDot = (buf: Float32Array, i: number, d: Dot, startP: number) => {
            const o = i * 7;
            buf[o] = d.x;
            buf[o + 1] = d.y;
            buf[o + 2] = d.r;
            buf[o + 3] = startP;
            buf[o + 4] = d.col[0];
            buf[o + 5] = d.col[1];
            buf[o + 6] = d.col[2];
        };
        if (mode === 'move' && moveData) {
            const m = params.move;
            moveData.dotsB.forEach((d, i) => putDot(dotData, i, d, 0.55 + d.order * 0.12));
            gl.bindBuffer(gl.ARRAY_BUFFER, dotMain.buf);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, dotData);
            moveData.dotsA.forEach((d, i) => putDot(dotDataA, i, d, 0.06 + d.order * 0.1));
            gl.bindBuffer(gl.ARRAY_BUFFER, dotSrc.buf);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, dotDataA);
            dotUData.set([W, H, m, 0.16, lr, lg, lb, params.dotSize, 0, 1, 1, 0, 1, 1, 0]);
            dotGlowUData.set([W, H, m, 0.16, lr, lg, lb, params.dotSize * 2.6, 0, 1, 1, 1, ga, ga, 0]);
            dotPulseUData.set([W, H, m, 0.16, lr, lg, lb, params.dotSize, 0, params.dotPulse, 0.5, 0.5, 1, 0, 0]);
            // shrinking source dots were already colourised — stay on their colour
            dotShrinkUData.set([W, H, m, 0.14, lr, lg, lb, params.dotSize, 1, 0, 1, 0, 1, 1, 1]);
            dotShrinkGlowUData.set([W, H, m, 0.14, lr, lg, lb, params.dotSize * 2.6, 1, 0, 1, 1, ga, ga, 1]);
        } else {
            layoutDots.forEach((d, i) => putDot(dotData, i, d, params.dotStart + d.order * params.dotStagger));
            if (layoutDots.length) {
                gl.bindBuffer(gl.ARRAY_BUFFER, dotMain.buf);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, dotData);
            }
            const dotGrowAbs = params.dotGrow;
            dotUData.set([W, H, p, dotGrowAbs, lr, lg, lb, params.dotSize, 0, 1, 1, 0, 1, 1, 0]);
            dotGlowUData.set([W, H, p, dotGrowAbs, lr, lg, lb, params.dotSize * 2.6, 0, 1, 1, 1, ga, ga, 0]);
            dotPulseUData.set([W, H, p, dotGrowAbs, lr, lg, lb, params.dotSize, 0, params.dotPulse, 0.5, 0.5, 1, 0, 0]);
        }
        if (gui) {
            const dotEnd = params.dotStart + 2 * params.dotStagger + params.dotGrow;
            const info = `${(params.dotStart * params.duration).toFixed(2)}s → ${(dotEnd * params.duration).toFixed(2)}s${dotEnd > 1 ? '  ⚠ past end' : ''}`;
            if (params.dotTiming !== info) params.dotTiming = info;
        }

        // bloom strength swells with how much of the system is moving right now,
        // low-pass filtered so mode switches don't step it
        const energyRaw = inst ? motionSum / inst : 0;
        energySmooth += (energyRaw - energySmooth) * (1 - Math.exp(-dt / BLOOM_ENERGY_TAU));
        const energy = energySmooth;
        // The targets exist from the constructor's resize(); this only covers the
        // window between a teardown and its rebuild — and must never drop the rAF.
        if (!scene || !bloomA || !bloomB) {
            if (!destroyed) raf = requestAnimationFrame(frame);
            return;
        }
        const sceneT = scene;
        const blurA = bloomA;
        const blurB = bloomB;
        const bloomOn = params.bloom > 0.01;

        // ---- pass 1: the luminous layer (lines + dots), offscreen ----
        gl.bindFramebuffer(gl.FRAMEBUFFER, sceneT.fbo);
        gl.viewport(0, 0, sceneT.w, sceneT.h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        blendOver();

        if (inst && lw > 0.05) {
            gl.useProgram(lineProg);
            gl.bindVertexArray(lineVAO);
            if (params.glow > 0.01) {
                // soft under-strokes first (widest layer first), crisp core on top
                for (let i = glowN - 1; i >= 0; i--) {
                    setLineU(glowUData[i]);
                    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, inst);
                }
            }
            setLineU(lineUData);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, inst);
        }
        if (params.dotSize > 0.01) {
            gl.useProgram(dotProg);
            gl.bindVertexArray(dotMain.vao); // main dots / move-target dots
            if (params.dotPulse > 0.01) {
                setDotU(dotPulseUData); // expanding glow, behind the dot itself
                gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, MARK.DOTS.length);
            }
            if (params.glow > 0.01) {
                setDotU(dotGlowUData);
                gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, MARK.DOTS.length);
            }
            setDotU(dotUData);
            gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, MARK.DOTS.length);
            if (mode === 'move' && moveData) {
                gl.bindVertexArray(dotSrc.vao); // source dots shrinking away
                if (params.glow > 0.01) {
                    setDotU(dotShrinkGlowUData);
                    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, MARK.DOTS.length);
                }
                setDotU(dotShrinkUData);
                gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, MARK.DOTS.length);
            }
        }

        // ---- passes 2+3: downsample into the half-res chain, separable gaussian ----
        if (bloomOn) {
            gl.disable(gl.BLEND);
            gl.useProgram(blurProg);
            gl.bindVertexArray(emptyVAO);
            for (const [dst, srcTex, sx, sy] of [
                [blurA, sceneT.tex, params.bloomRadius / blurA.w, 0],
                [blurB, blurA.tex, 0, params.bloomRadius / blurA.h],
            ] as [Target, WebGLTexture, number, number][]) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
                gl.viewport(0, 0, dst.w, dst.h);
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, srcTex);
                gl.uniform2f(blurU.uStep, sx, sy);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            }
            gl.enable(gl.BLEND);
        }

        // ---- pass 4: the canvas — shards, then the crisp layer, then bloom as light ----
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        blendOver();

        if (mosaicVertCount && mosaicA > 0.001) {
            gl.useProgram(mosaicProg);
            gl.bindVertexArray(mosaicVAO);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, artTex);
            gl.uniform2f(mosaicU.uViewport, W, H);
            gl.uniform1f(mosaicU.uResolve, p);
            gl.uniform1f(mosaicU.uAlpha, mosaicA);
            gl.uniform1f(mosaicU.uTexScale, texScale);
            gl.uniform1f(mosaicU.uGrowSpan, growSpan);
            gl.uniform1f(mosaicU.uWhiteDur, params.whiteDur * nrm);
            gl.uniform1f(mosaicU.uColorDur, params.colorDur * nrm);
            gl.uniform1f(mosaicU.uTexDur, params.texDur * nrm);
            gl.uniform1f(mosaicU.uWhiteLevel, params.whiteLevel);
            gl.uniform1f(mosaicU.uColorSat, params.colorSat);
            gl.uniform1f(mosaicU.uColorBoost, params.colorBoost);
            gl.uniform1f(mosaicU.uFlashTint, params.flashTint);
            gl.uniform1f(mosaicU.uVeil, params.veil);
            gl.drawArrays(gl.TRIANGLES, 0, mosaicVertCount);
        }

        gl.useProgram(compProg);
        gl.bindVertexArray(emptyVAO);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
        gl.uniform1f(compU.uStrength, 1); // crisp layer at full strength
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (bloomOn) {
            blendAdd();
            gl.bindTexture(gl.TEXTURE_2D, blurB.tex);
            gl.uniform1f(compU.uStrength, params.bloom * (params.bloomIdle + (1 - params.bloomIdle) * energy));
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        gl.bindVertexArray(null);

        // the shard layer opens fully black, so lifting the cover is invisible
        if (mosaicVertCount && ++prerollFrames > 1) settleFirst();
        if (!destroyed) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    const api: MinaEffect = {
        play,
        move: doMove,
        clearInk() {
            // the ink renderer is a /loop shader mode; this backend has no sim
        },
        firstFrame,
        params,
        destroy() {
            destroyed = true;
            cancelAnimationFrame(raf);
            clearTimeout(firstSafety);
            if (texTimer !== null) clearTimeout(texTimer);
            removeEventListener('resize', resize);
            removeEventListener('keydown', onKey);
            gui?.destroy();
            choreo?.dispose();
            settleFirst(); // never leave a page waiting on a dead engine
            dropTarget(scene);
            dropTarget(bloomA);
            dropTarget(bloomB);
            gl.deleteTexture(artTex);
            gl.deleteBuffer(lineBuf);
            gl.deleteBuffer(dotMain.buf);
            gl.deleteBuffer(dotSrc.buf);
            gl.deleteBuffer(mosaicBuf);
            gl.deleteVertexArray(lineVAO);
            gl.deleteVertexArray(dotMain.vao);
            gl.deleteVertexArray(dotSrc.vao);
            gl.deleteVertexArray(mosaicVAO);
            gl.deleteVertexArray(emptyVAO);
            for (const prog of [mosaicProg, lineProg, dotProg, blurProg, compProg]) gl.deleteProgram(prog);
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        },
    };
    rebindTweens(presetName);
    return api;
}
