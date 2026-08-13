// MINA — WebGPU line effects engine (port of the wgpu/05 prototype).
// Flat 2D — no camera, no depth. The mark is drawn as its line drawing,
// every line extended to the screen edges partitions the viewport into
// convex shards; each shard starts as an opaque flat colour sampled from
// the texture, resolves to the texture's actual pixels (staggered outward
// from the mark), then the shard layer fades away — pixel-identical to the
// page background behind it — leaving the mark, which then "moves" to its
// docked placement by raying out while the small mark branches in.

import { bindPresetTweens, type PresetChoreo } from '@/effects/choreo';
import { BASE, type LiveParams } from '@/effects/config';
import { buildGui } from '@/effects/gui';
import { buildLayout, buildMovePlan, clamp01, type Dot, hsb2rgb, type MovePlan, type Placement, type Seg } from '@/effects/layout';
import { MARK } from '@/effects/mark';
import { PRESETS } from '@/effects/presets';
import { DOT_SHADER } from '@/effects/shaders/dot';
import { LINE_SHADER } from '@/effects/shaders/line';
import { MOSAIC_SHADER } from '@/effects/shaders/mosaic';
import { POST_SHADER } from '@/effects/shaders/post';
import { clampCanvas, fallbackTexture, loadTexture, type TextureSource } from '@/effects/texture';

export interface MinaEffect {
    play(): void;
    move(): void;
    /** resolves once the shard layer is actually painting (lift any pre-roll cover) */
    firstFrame: Promise<void>;
    destroy(): void;
    /** the live parameter object the render loop reads every frame — mutate/tween freely */
    params: LiveParams;
    /** fired whenever the reveal (re)starts — autoplay, R key, GUI ▶ (claimed by preset tweens) */
    onPlay?: () => void;
    /** fired whenever the dock move actually starts — auto-move, M key, GUI ⇄ (claimed by preset tweens) */
    onMove?: () => void;
    /** page-facing sequence events: 'play' (reveal restarted), 'move' (dock started), 'docked' (dock finished) */
    onPhase?: (phase: 'play' | 'move' | 'docked') => void;
}

export async function createMinaEffect(canvas: HTMLCanvasElement, presetName = 'default'): Promise<MinaEffect> {
    if (!navigator.gpu) throw new Error('WebGPU unavailable');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('WebGPU unavailable');
    const device = await adapter.requestDevice();
    device.lost.then((info) => {
        console.error('WebGPU device lost:', info);
    });
    device.addEventListener('uncapturederror', (e) => console.error('WebGPU error:', (e as GPUUncapturedErrorEvent).error?.message || e));

    const maybeCtx = canvas.getContext('webgpu');
    if (!maybeCtx) throw new Error('WebGPU unavailable');
    const ctx = maybeCtx;
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: 'premultiplied' });

    const blendOver: GPUBlendState = {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };

    // ---------- pipelines ----------
    const mosaicModule = device.createShaderModule({ code: MOSAIC_SHADER });
    const mosaicPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: mosaicModule,
            entryPoint: 'vs',
            buffers: [
                {
                    arrayStride: 10 * 4,
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x2' }, // pos px
                        { shaderLocation: 1, offset: 8, format: 'float32x2' }, // uv
                        { shaderLocation: 2, offset: 16, format: 'float32x3' }, // flat colour
                        { shaderLocation: 3, offset: 28, format: 'float32' }, // delay
                        { shaderLocation: 4, offset: 32, format: 'float32x2' }, // shard centroid uv
                    ],
                },
            ],
        },
        fragment: { module: mosaicModule, entryPoint: 'fs', targets: [{ format, blend: blendOver }] },
        primitive: { topology: 'triangle-list' },
    });
    const mosaicUBuf = device.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const mosaicU = new Float32Array(16);

    const lineModule = device.createShaderModule({ code: LINE_SHADER });
    const linePipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: lineModule,
            entryPoint: 'vs',
            buffers: [
                {
                    arrayStride: 10 * 4,
                    stepMode: 'instance',
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x2' }, // tail px
                        { shaderLocation: 1, offset: 8, format: 'float32x2' }, // head px
                        { shaderLocation: 2, offset: 16, format: 'float32' }, // alpha mul
                        { shaderLocation: 3, offset: 20, format: 'float32' }, // motion
                        { shaderLocation: 4, offset: 24, format: 'float32x3' }, // texture colour
                        { shaderLocation: 5, offset: 36, format: 'float32' }, // ext flag
                    ],
                },
            ],
        },
        fragment: { module: lineModule, entryPoint: 'fs', targets: [{ format: 'rgba16float', blend: blendOver }] },
        primitive: { topology: 'triangle-list' },
    });
    const lineUBuf = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const lineU = new Float32Array(20);
    const lineBindGroup = device.createBindGroup({
        layout: linePipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: lineUBuf } }],
    });
    // glow: up to GLOW_MAX stacked passes on the same instances, each wider and
    // fainter than the last, so the bloom can be built up rather than one halo
    const GLOW_MAX = 3;
    const glowUBufs: GPUBuffer[] = [];
    const glowUs: Float32Array<ArrayBuffer>[] = [];
    const glowBindGroups: GPUBindGroup[] = [];
    for (let i = 0; i < GLOW_MAX; i++) {
        const buf = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        glowUBufs.push(buf);
        glowUs.push(new Float32Array(20));
        glowBindGroups.push(
            device.createBindGroup({
                layout: linePipeline.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: { buffer: buf } }],
            })
        );
    }
    // line instances are rebuilt EVERY frame as the rays grow — fixed-size buffer
    const MAX_LINE_INST = 96;
    // seconds for the bloom's motion-energy signal to settle (low-pass time constant)
    const BLOOM_ENERGY_TAU = 0.95;
    const lineData = new Float32Array(MAX_LINE_INST * 10); // tail xy, head xy, alphaMul, motion, colour rgb, ext
    const lineBuf = device.createBuffer({
        size: lineData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    // ---------- dot pipeline (the three brand dots) ----------
    const dotModule = device.createShaderModule({ code: DOT_SHADER });
    const dotPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
            module: dotModule,
            entryPoint: 'vs',
            buffers: [
                {
                    arrayStride: 7 * 4,
                    stepMode: 'instance',
                    attributes: [
                        { shaderLocation: 0, offset: 0, format: 'float32x2' }, // centre px
                        { shaderLocation: 1, offset: 8, format: 'float32' }, // radius px
                        { shaderLocation: 2, offset: 12, format: 'float32' }, // start (q units)
                        { shaderLocation: 3, offset: 16, format: 'float32x3' }, // texture colour
                    ],
                },
            ],
        },
        fragment: { module: dotModule, entryPoint: 'fs', targets: [{ format: 'rgba16float', blend: blendOver }] },
        primitive: { topology: 'triangle-list' },
    });
    const dotData = new Float32Array(MARK.DOTS.length * 7);
    const dotBuf = device.createBuffer({
        size: dotData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const mkDotU = () =>
        device.createBuffer({
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    const dotUBuf = mkDotU();
    const dotGlowUBuf = mkDotU();
    const dotPulseUBuf = mkDotU();
    const dotU = new Float32Array(16);
    const dotGlowU = new Float32Array(16);
    const dotPulseU = new Float32Array(16);
    const mkDotBG = (buffer: GPUBuffer) =>
        device.createBindGroup({
            layout: dotPipeline.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: { buffer } }],
        });
    const dotBindGroup = mkDotBG(dotUBuf);
    const dotGlowBindGroup = mkDotBG(dotGlowUBuf);
    const dotPulseBindGroup = mkDotBG(dotPulseUBuf);
    // during a move the source dots shrink while the target dots grow — the
    // source set needs its own instances + reversed radius ramps
    const dotDataA = new Float32Array(MARK.DOTS.length * 7);
    const dotBufA = device.createBuffer({
        size: dotDataA.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    const dotShrinkUBuf = mkDotU();
    const dotShrinkGlowUBuf = mkDotU();
    const dotShrinkU = new Float32Array(16);
    const dotShrinkGlowU = new Float32Array(16);
    const dotShrinkBindGroup = mkDotBG(dotShrinkUBuf);
    const dotShrinkGlowBindGroup = mkDotBG(dotShrinkGlowUBuf);

    // ---------- bloom post-processing ----------
    // The luminous layer (lines + dots) renders into an offscreen float target,
    // which is downsampled + gaussian-blurred (separable, half res) and then
    // composited back ADDITIVELY — so light genuinely spills: halos sum where
    // lines cross, and the glow bleeds over the content beneath. Strength is
    // driven by how much of the system is currently in motion.
    const blendAdd: GPUBlendState = {
        // pure light: colour adds, page visibility untouched
        color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
        alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
    };
    const postModule = device.createShaderModule({ code: POST_SHADER });
    const mkPost = (entry: string, targetFormat: GPUTextureFormat, blend: GPUBlendState | null) =>
        device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: postModule, entryPoint: 'vs' },
            fragment: { module: postModule, entryPoint: entry, targets: [blend ? { format: targetFormat, blend } : { format: targetFormat }] },
            primitive: { topology: 'triangle-list' },
        });
    const blurPipeline = mkPost('fsBlur', 'rgba16float', null);
    const compScenePipeline = mkPost('fsComp', format, blendOver);
    const compBloomPipeline = mkPost('fsComp', format, blendAdd);
    const postSampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
    });
    const mkPU = () => device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const blurHU = mkPU();
    const blurVU = mkPU();
    const compSceneU = mkPU();
    const compBloomU = mkPU();
    device.queue.writeBuffer(compSceneU, 0, new Float32Array([1, 0])); // crisp layer at full strength
    let sceneView!: GPUTextureView;
    let bloomAView!: GPUTextureView;
    let bloomBView!: GPUTextureView;
    let blurHBG!: GPUBindGroup;
    let blurVBG!: GPUBindGroup;
    let compSceneBG!: GPUBindGroup;
    let compBloomBG!: GPUBindGroup;
    let postTexs: GPUTexture[] = [];
    let bloomHalfW = 1;
    let bloomHalfH = 1;
    function makePostTargets() {
        for (const t of postTexs) t.destroy();
        postTexs = [];
        const mk = (w: number, h: number) => {
            const t = device.createTexture({
                size: [Math.max(1, w), Math.max(1, h)],
                format: 'rgba16float',
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            });
            postTexs.push(t);
            return t;
        };
        const scene = mk(canvas.width, canvas.height);
        bloomHalfW = Math.max(1, canvas.width >> 1);
        bloomHalfH = Math.max(1, canvas.height >> 1);
        const bloomA = mk(bloomHalfW, bloomHalfH);
        const bloomB = mk(bloomHalfW, bloomHalfH);
        sceneView = scene.createView();
        bloomAView = bloomA.createView();
        bloomBView = bloomB.createView();
        const bg = (pipe: GPURenderPipeline, view: GPUTextureView, ubuf: GPUBuffer) =>
            device.createBindGroup({
                layout: pipe.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: postSampler },
                    { binding: 1, resource: view },
                    { binding: 2, resource: { buffer: ubuf } },
                ],
            });
        blurHBG = bg(blurPipeline, sceneView, blurHU); // full res -> half res H blur
        blurVBG = bg(blurPipeline, bloomAView, blurVU); // half res V blur
        compSceneBG = bg(compScenePipeline, sceneView, compSceneU);
        compBloomBG = bg(compBloomPipeline, bloomBView, compBloomU);
    }

    // ---------- texture (static image; see src/effects/texture.ts) ----------
    const sampler = device.createSampler({
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
    });
    let texture = device.createTexture({
        size: [2, 2],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.writeTexture({ texture }, new Uint8Array([16, 24, 28, 255, 10, 16, 20, 255, 10, 16, 20, 255, 16, 24, 28, 255]), { bytesPerRow: 8 }, [2, 2]);

    let mosaicBindGroup!: GPUBindGroup;
    const makeMosaicBG = () => {
        mosaicBindGroup = device.createBindGroup({
            layout: mosaicPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: mosaicUBuf } },
                { binding: 1, resource: sampler },
                { binding: 2, resource: texture.createView() },
            ],
        });
    };
    makeMosaicBG();

    // ---------- params ----------
    const params: LiveParams = {
        ...BASE,
        ...PRESETS[presetName]?.config,
        progress: 0, // transient scrub 0..1
        move: 0, // transient move scrub 0..1
        dotTiming: '', // derived readout (not persisted)
    };

    // the active preset's declarative tweens, rebound on preset switch
    let choreo: PresetChoreo | null = null;
    function rebindTweens(name: string) {
        choreo?.dispose();
        choreo = bindPresetTweens(api, PRESETS[name]?.tweens, { ...BASE, ...PRESETS[name]?.config });
    }

    let texSource: TextureSource | null = null;
    let loadedTexture = ''; // url + fit actually on the GPU
    let texTimer: number | null = null;
    let capturing = false;
    let cellsDirty = true;

    function uploadTexture(source: TextureSource) {
        const src = clampCanvas(source.canvas, device.limits.maxTextureDimension2D);
        if (!src.width || !src.height) {
            console.warn('texture source is empty — ignored');
            return;
        }
        texSource = source;
        texture.destroy();
        texture = device.createTexture({
            size: [src.width, src.height],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        device.queue.copyExternalImageToTexture({ source: src }, { texture }, [src.width, src.height]);
        makeMosaicBG();
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
        // re-fit the texture to the new layout (covers the initial load too)
        if (texTimer !== null) clearTimeout(texTimer);
        texTimer = window.setTimeout(() => {
            texTimer = null;
            void refreshTexture();
        }, 120);
    }
    resize();
    addEventListener('resize', resize);

    // ---------- sequence + movement state machine ----------
    // curPos tracks which placement (primary / target params) the mark occupies.
    let playing = false;
    let started = false;
    let curPos = 0;
    let mode: 'main' | 'move' = 'main';
    let moveData: MovePlan | null = null;
    let playingMove = false;
    let autoMoved = false;
    let bare = false; // post-move: logo only, no extensions
    let energySmooth = 0; // low-passed motion energy feeding the bloom composite

    let mosaicVBuf: GPUBuffer | null = null;
    let mosaicVertCount = 0;
    let layoutSegs: Seg[] = []; // growing segments, consumed per-frame by the renderer
    let layoutDots: Dot[] = []; // brand dot placements (timing lives in the render loop)

    const primaryPlacement = (): Placement => ({ s: params.logoScale, x: params.logoX, y: params.logoY });
    const targetPlacement = (): Placement => ({ s: params.logoScale2, x: params.logoX2, y: params.logoY2 });

    function rebuildLayoutNow() {
        if (!texSource) return;
        const W = canvas.clientWidth;
        const H = canvas.clientHeight;
        const res = buildLayout(W, H, curPos === 0 ? primaryPlacement() : targetPlacement(), params, texSource.sample);
        mosaicVBuf?.destroy();
        mosaicVBuf = device.createBuffer({ size: Math.max(32, res.verts.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
        device.queue.writeBuffer(mosaicVBuf, 0, res.verts);
        mosaicVertCount = res.vertCount;
        layoutSegs = res.segs;
        layoutDots = res.dots;
        cellsDirty = false;
    }

    function startMovePlan() {
        const W = canvas.clientWidth;
        const H = canvas.clientHeight;
        const tp = curPos === 0 ? targetPlacement() : primaryPlacement();
        const srcC = curPos === 0 ? { x: params.logoX, y: params.logoY } : { x: params.logoX2, y: params.logoY2 };
        // Source = every segment currently on screen. Logo edges continue past
        // their far end; extensions are ALREADY at the screen edge, so the same
        // formula degenerates to their tail following out.
        const srcSegs = layoutSegs.filter((sg) => !(bare && sg.isExt));
        const sample = texSource ? texSource.sample : () => [1, 1, 1] as [number, number, number];
        moveData = buildMovePlan(W, H, srcSegs, layoutDots, srcC, tp, params, sample);
    }

    // the full transition: form the big mark, then move it to the target
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
        // the reveal clock keeps running: the handoff fade (mosaicA, driven by
        // progress) overlaps the dock instead of being forced to complete first
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
        // progress is left alone: if the handoff fade is still running it
        // finishes on its own clock (snapping it to 1 here would pop the
        // remaining shard layer off)
        bare = true; // settled: logo alone (extensions left with the move)
        rebuildLayoutNow(); // same placement math -> visually seamless swap
        api.onPhase?.('docked');
    }

    const gui = buildGui(
        params,
        {
            play,
            doMove,
            invalidateCells: () => {
                cellsDirty = true;
            },
            // live re-place when docked at the target
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
        if (k === 'h') gui.show(gui._hidden);
    };
    addEventListener('keydown', onKey);

    // ---------- render loop ----------
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

        // wait until the tab is actually visible so the splash is seen from its start
        if (params.autoplay && !started && texSource && !document.hidden) {
            started = true;
            play();
        }
        if (playing) {
            params.progress = Math.min(1, params.progress + dt / params.duration);
            if (params.progress >= 1) playing = false;
        }

        // Derived timeline. Everything is expressed in "growth units" (the ray
        // growth phase = 1) and then normalised into progress space. Phases:
        // grow -> shards resolve -> handoff fade -> full formation over the
        // page. There is no separate line-exit phase: leaving IS the move —
        // every segment (logo + extensions) rays out when the move plays.
        const p = params.progress;
        const texUnits = params.whiteDur + params.colorDur + params.texDur;
        const nrm = 1 / (1 + texUnits + params.hold);
        const growSpan = nrm;
        const handoffAt = (1 + texUnits) * nrm; // last shard is fully textured
        const holdSpan = Math.max(1e-4, params.hold * nrm);
        const mosaicA = 1 - clamp01((p - handoffAt) / holdSpan);

        // auto-move: the dock starts on the reveal clock itself, moveDelay
        // seconds after the last shard is fully textured — the same instant
        // the handoff fade (and the page artwork fade behind it) begins, so
        // the two can never drift apart
        const moveAt = Math.min(1, handoffAt + params.moveDelay / Math.max(0.1, params.duration));
        if (mode === 'main' && params.autoMove && started && !autoMoved && p >= moveAt) {
            autoMoved = true;
            doMove();
        }

        const W = canvas.clientWidth;
        const H = canvas.clientHeight;
        // ripple off -> the per-shard zoom starts at 1, so nothing warps
        const texScale = params.ripple ? params.texScale : 1;
        mosaicU.set([
            W,
            H,
            p,
            mosaicA,
            texScale,
            growSpan,
            params.whiteDur * nrm,
            params.colorDur * nrm,
            params.texDur * nrm,
            params.whiteLevel,
            params.colorSat,
            params.colorBoost,
            params.flashTint,
            params.veil,
        ]);
        device.queue.writeBuffer(mosaicUBuf, 0, mosaicU);

        // build this frame's line segments from the growing network
        const q = clamp01(p / growSpan);
        let inst = 0;
        let motionSum = 0;
        // ta is the TAIL, tb the HEAD — order is preserved (not sorted) so the
        // trail effect knows which way the line is travelling
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
            // lines aimed at the new position ray out; the rest fade where they are
            for (const s of moveData.a) {
                if (s.exits) {
                    const head = s.to + (s.edge - s.to) * clamp01((m - s.hStart) / s.hDur);
                    const tail = s.from + (s.edge - s.from) * clamp01((m - s.tStart) / s.tDur);
                    pushSeg(s.L, tail, head, 1, 1, s.col, s.isExt); // travelling until it leaves the screen
                } else {
                    // fading in place: not moving, so no trail on it
                    pushSeg(s.L, s.from, s.to, 1 - clamp01((m - s.fadeStart) / s.fadeDur), 0, s.col, s.isExt);
                }
            }
            // …while the target logo's edges streak in from the branch points
            for (const s of moveData.b) {
                const head = s.X + (s.far - s.X) * clamp01((m - s.hStart) / s.hDur);
                const tail = s.X + (s.near - s.X) * clamp01((m - s.tStart) / s.tDur);
                const done = Math.max(s.hStart + s.hDur, s.tStart + s.tDur);
                pushSeg(s.L, tail, head, 1, clamp01((done + fadeM - m) / fadeM), s.col, 0);
            }
            if (params.move >= 1 && !playingMove) commitMove();
        } else {
            // settle-fade uses the UNclamped clock: q pins at 1 when the grow phase
            // ends, which would freeze the last finishers' trails on forever
            const qRaw = p / growSpan;
            const fadeQ = Math.max(1e-4, params.trailFade / Math.max(0.1, params.duration * growSpan));
            for (const s of layoutSegs) {
                if (bare && s.isExt) continue; // post-move: the mark alone
                const u = (q - s.startT) / s.dur;
                if (u <= 0) continue;
                const head = s.from + (s.to - s.from) * clamp01(u);
                const motion = clamp01((s.startT + s.dur + fadeQ - qRaw) / fadeQ);
                pushSeg(s.L, s.from, head, 1, motion, s.col, s.isExt);
            }
        }
        if (inst) device.queue.writeBuffer(lineBuf, 0, lineData, 0, inst * 10);

        const [lr, lg, lb] = hsb2rgb(params.lineH, params.lineS, params.lineB);
        // Line width is proportional to the logo's scale: `thickness` is the
        // width at the PRIMARY placement, other placements scale with their size,
        // and during a move the width glides between the two so the small logo
        // forms seamlessly thin.
        const wBase = Math.max(0.05, params.logoScale);
        const scaleOf = (posIdx: number) => (posIdx === 0 ? params.logoScale : params.logoScale2);
        let wf = scaleOf(curPos) / wBase;
        if (mode === 'move' && moveData) {
            const wTo = scaleOf(1 - curPos) / wBase;
            wf += (wTo - wf) * clamp01(params.move);
        }
        const lw = Math.max(0.8, params.lineWidth * wf);
        // [viewport, thickness, soft, r,g,b, capScale, tr,tg,tb, alpha, falloff, trail, trailBias, taper, segTint, tailDim]
        const [tr, tg, tb] = hsb2rgb(params.lineH + params.trailHue, params.lineS, params.lineB * params.trailDim);
        lineU.set([W, H, lw, 0, lr, lg, lb, 1, tr, tg, tb, 1.0, 2, params.trail, params.trailBias, params.taper, params.lineTint, params.trailDim]);
        device.queue.writeBuffer(lineUBuf, 0, lineU);
        // glow: stacked passes, each wider and fainter, sharing the trail shading
        const ga = 0.55 * params.glow;
        const [gr, gg, gb] = hsb2rgb(params.lineH + params.glowHue, params.lineS, params.lineB);
        const glowN = Math.max(1, Math.round(params.glowLayers));
        for (let i = 0; i < glowN; i++) {
            const t = (i + 1) / glowN;
            glowUs[i].set([
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
            device.queue.writeBuffer(glowUBufs[i], 0, glowUs[i]);
        }

        // Dot clocks. Main mode: absolute progress (middle, top, bottom).
        // Move mode: target dots grow late in the move (with pulses) while the
        // source dots shrink away early — both on the move clock m.
        // [viewport, progress, grow, r,g,b, radiusMul, rStart, rEnd, rPow, soft, aStart, aEnd]
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
            device.queue.writeBuffer(dotBuf, 0, dotData);
            moveData.dotsA.forEach((d, i) => putDot(dotDataA, i, d, 0.06 + d.order * 0.1));
            device.queue.writeBuffer(dotBufA, 0, dotDataA);
            dotU.set([W, H, m, 0.16, lr, lg, lb, params.dotSize, 0, 1, 1, 0, 1, 1, 0]);
            device.queue.writeBuffer(dotUBuf, 0, dotU);
            dotGlowU.set([W, H, m, 0.16, lr, lg, lb, params.dotSize * 2.6, 0, 1, 1, 1, ga, ga, 0]);
            device.queue.writeBuffer(dotGlowUBuf, 0, dotGlowU);
            dotPulseU.set([W, H, m, 0.16, lr, lg, lb, params.dotSize, 0, params.dotPulse, 0.5, 0.5, 1, 0, 0]);
            device.queue.writeBuffer(dotPulseUBuf, 0, dotPulseU);
            // shrinking source dots were already colourised — stay on their colour
            dotShrinkU.set([W, H, m, 0.14, lr, lg, lb, params.dotSize, 1, 0, 1, 0, 1, 1, 1]);
            device.queue.writeBuffer(dotShrinkUBuf, 0, dotShrinkU);
            dotShrinkGlowU.set([W, H, m, 0.14, lr, lg, lb, params.dotSize * 2.6, 1, 0, 1, 1, ga, ga, 1]);
            device.queue.writeBuffer(dotShrinkGlowUBuf, 0, dotShrinkGlowU);
        } else {
            layoutDots.forEach((d, i) => putDot(dotData, i, d, params.dotStart + d.order * params.dotStagger));
            if (layoutDots.length) device.queue.writeBuffer(dotBuf, 0, dotData);
            const dotGrowAbs = params.dotGrow; // absolute progress, like the dot clock
            dotU.set([W, H, p, dotGrowAbs, lr, lg, lb, params.dotSize, 0, 1, 1, 0, 1, 1, 0]);
            device.queue.writeBuffer(dotUBuf, 0, dotU);
            dotGlowU.set([W, H, p, dotGrowAbs, lr, lg, lb, params.dotSize * 2.6, 0, 1, 1, 1, ga, ga, 0]);
            device.queue.writeBuffer(dotGlowUBuf, 0, dotGlowU);
            dotPulseU.set([W, H, p, dotGrowAbs, lr, lg, lb, params.dotSize, 0, params.dotPulse, 0.5, 0.5, 1, 0, 0]);
            device.queue.writeBuffer(dotPulseUBuf, 0, dotPulseU);
        }
        // readout: when the dot sequence starts and finishes, in seconds
        const dotEnd = params.dotStart + 2 * params.dotStagger + params.dotGrow;
        const info = `${(params.dotStart * params.duration).toFixed(2)}s → ${(dotEnd * params.duration).toFixed(2)}s${dotEnd > 1 ? '  ⚠ past end' : ''}`;
        if (params.dotTiming !== info) params.dotTiming = info;

        // bloom strength swells with how much of the system is moving right now.
        // The raw average is a step function at mode switches (the dock claims
        // every segment at once, snapping it 0 -> 1 in a frame — with
        // bloomIdle > 1 that reads as the glow cutting out), so it is low-pass
        // filtered before it reaches the composite.
        const energyRaw = inst ? motionSum / inst : 0;
        energySmooth += (energyRaw - energySmooth) * (1 - Math.exp(-dt / BLOOM_ENERGY_TAU));
        const energy = energySmooth;
        const bloomOn = params.bloom > 0.01;
        if (bloomOn) {
            device.queue.writeBuffer(blurHU, 0, new Float32Array([params.bloomRadius / bloomHalfW, 0]));
            device.queue.writeBuffer(blurVU, 0, new Float32Array([0, params.bloomRadius / bloomHalfH]));
            const strength = params.bloom * (params.bloomIdle + (1 - params.bloomIdle) * energy);
            device.queue.writeBuffer(compBloomU, 0, new Float32Array([strength, 0]));
        }

        const enc = device.createCommandEncoder();
        // pass 1 — the luminous layer (lines + dots), offscreen so it can feed
        // both the bloom chain and the final composite
        const pass = enc.beginRenderPass({
            colorAttachments: [
                {
                    view: sceneView,
                    clearValue: [0, 0, 0, 0],
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
        });
        if (inst && lw > 0.05) {
            pass.setPipeline(linePipeline);
            pass.setVertexBuffer(0, lineBuf);
            if (params.glow > 0.01) {
                // soft under-strokes first, crisp core on top
                for (let i = glowN - 1; i >= 0; i--) {
                    // widest layer first
                    pass.setBindGroup(0, glowBindGroups[i]);
                    pass.draw(6, inst);
                }
            }
            pass.setBindGroup(0, lineBindGroup);
            pass.draw(6, inst);
        }
        if (params.dotSize > 0.01) {
            // the three brand dots, on top of the lines
            pass.setPipeline(dotPipeline);
            pass.setVertexBuffer(0, dotBuf); // main dots / move-target dots
            if (params.dotPulse > 0.01) {
                // expanding glow, behind the dot itself
                pass.setBindGroup(0, dotPulseBindGroup);
                pass.draw(6, MARK.DOTS.length);
            }
            if (params.glow > 0.01) {
                pass.setBindGroup(0, dotGlowBindGroup);
                pass.draw(6, MARK.DOTS.length);
            }
            pass.setBindGroup(0, dotBindGroup);
            pass.draw(6, MARK.DOTS.length);
            if (mode === 'move' && moveData) {
                // source dots shrinking away
                pass.setVertexBuffer(0, dotBufA);
                if (params.glow > 0.01) {
                    pass.setBindGroup(0, dotShrinkGlowBindGroup);
                    pass.draw(6, MARK.DOTS.length);
                }
                pass.setBindGroup(0, dotShrinkBindGroup);
                pass.draw(6, MARK.DOTS.length);
            }
        }
        pass.end();
        // passes 2+3 — downsample into the half-res chain, separable gaussian
        if (bloomOn) {
            for (const [view, bgrp] of [
                [bloomAView, blurHBG],
                [bloomBView, blurVBG],
            ] as [GPUTextureView, GPUBindGroup][]) {
                const bp = enc.beginRenderPass({
                    colorAttachments: [{ view, clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }],
                });
                bp.setPipeline(blurPipeline);
                bp.setBindGroup(0, bgrp);
                bp.draw(3);
                bp.end();
            }
        }
        // pass 4 — swapchain: shards, then the crisp layer, then bloom as light
        const final = enc.beginRenderPass({
            colorAttachments: [
                {
                    view: ctx.getCurrentTexture().createView(),
                    clearValue: [0, 0, 0, 0],
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
        });
        if (mosaicVBuf && mosaicVertCount && mosaicA > 0.001) {
            final.setPipeline(mosaicPipeline);
            final.setBindGroup(0, mosaicBindGroup);
            final.setVertexBuffer(0, mosaicVBuf);
            final.draw(mosaicVertCount);
        }
        final.setPipeline(compScenePipeline);
        final.setBindGroup(0, compSceneBG);
        final.draw(3);
        if (bloomOn) {
            final.setPipeline(compBloomPipeline);
            final.setBindGroup(0, compBloomBG);
            final.draw(3);
        }
        final.end();
        device.queue.submit([enc.finish()]);
        // the shard layer opens fully black, so lifting the cover is invisible
        if (mosaicVertCount && ++prerollFrames > 1) settleFirst();
        if (!destroyed) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    const api: MinaEffect = {
        play,
        move: doMove,
        firstFrame,
        params,
        destroy() {
            destroyed = true;
            cancelAnimationFrame(raf);
            clearTimeout(firstSafety);
            if (texTimer !== null) clearTimeout(texTimer);
            removeEventListener('resize', resize);
            removeEventListener('keydown', onKey);
            gui.destroy();
            choreo?.dispose();
            settleFirst(); // never leave a page waiting on a dead engine
            device.destroy();
        },
    };
    rebindTweens(presetName);
    return api;
}
