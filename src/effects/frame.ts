// Per-frame math shared by both backends — pure, no GPU and no DOM.
//
// `effect.ts` (WebGPU) and `effect-gl.ts` (WebGL2) are deliberately separate
// backends rather than one abstraction (see ENGINE.md), but the arithmetic that
// decides what the frame LOOKS like has no business being written twice: it is
// the part most often retuned, and it had already drifted once. Everything here
// is a straight lift of that arithmetic — same operations in the same order, so
// the WebGPU path stays bit-identical for `record:loop`.
//
// What stays in the backends: the state machine (play/move/dock), uniform
// delivery, pass encoding, resource lifetimes — and the dot clocks, whose
// uniform blocks differ in shape between the two APIs.

import type { EffectConfig, LiveParams } from '@/effects/config';
import { clamp01, hsb2rgb, type MovePlan, type Seg } from '@/effects/layout';

// line instances are rebuilt EVERY frame as the rays grow — fixed-size buffer
export const MAX_LINE_INST = 96;
// glow: up to GLOW_MAX stacked passes on the same instances, each wider and
// fainter than the last, so the bloom can be built up rather than one halo
export const GLOW_MAX = 3;
// seconds for the bloom's motion-energy signal to settle (low-pass time constant)
const BLOOM_ENERGY_TAU = 0.95;

// ---------- derived timeline ----------

export interface Timeline {
    /** the reveal stages' total weight, in growth units */
    texUnits: number;
    /** growth units -> progress space */
    nrm: number;
    /** the line draw occupies p in [0, growSpan] */
    growSpan: number;
    /** p at which the last shard is fully textured */
    handoffAt: number;
    /** progress-space length of the handoff fade */
    holdSpan: number;
    /** shard-layer opacity at this frame's p */
    mosaicA: number;
    /** p at which the auto-dock fires */
    moveAt: number;
}

// Everything is expressed in "growth units" (the ray growth phase = 1) and then
// normalised into progress space. Phases: grow -> shards resolve -> handoff fade
// -> full formation over the page. There is no separate line-exit phase: leaving
// IS the move — every segment (logo + extensions) rays out when the move plays.
//
// The auto-dock rides the reveal clock itself, moveDelay seconds after the last
// shard is fully textured — the same instant the handoff fade (and the page
// artwork fade behind it) begins, so the two can never drift apart.
export function deriveTimeline(params: LiveParams): Timeline {
    const p = params.progress;
    const texUnits = params.whiteDur + params.colorDur + params.texDur;
    const nrm = 1 / (1 + texUnits + params.hold);
    const handoffAt = (1 + texUnits) * nrm;
    const holdSpan = Math.max(1e-4, params.hold * nrm);
    return {
        texUnits,
        nrm,
        growSpan: nrm,
        handoffAt,
        holdSpan,
        mosaicA: 1 - clamp01((p - handoffAt) / holdSpan),
        moveAt: Math.min(1, handoffAt + params.moveDelay / Math.max(0.1, params.duration)),
    };
}

// ---------- this frame's line instances ----------

// stride 10: tail xy, head xy, alphaMul, motion, colour rgb, ext
export interface SegWriter {
    data: Float32Array<ArrayBuffer>;
    /** instances written this frame */
    inst: number;
    /** sum of their motion terms — the bloom's raw energy signal */
    motionSum: number;
    reset(): void;
    /** ta is the TAIL, tb the HEAD — order is preserved (not sorted) so the trail knows which way the line travels */
    push(
        L: { p0: [number, number]; d: [number, number] },
        ta: number,
        tb: number,
        aMul: number,
        motion: number,
        col: [number, number, number],
        ext: number
    ): void;
}

export function createSegWriter(): SegWriter {
    const data = new Float32Array(MAX_LINE_INST * 10);
    const w: SegWriter = {
        data,
        inst: 0,
        motionSum: 0,
        reset() {
            w.inst = 0;
            w.motionSum = 0;
        },
        push(L, ta, tb, aMul, motion, col, ext) {
            if (Math.abs(tb - ta) < 0.75 || w.inst >= MAX_LINE_INST || aMul <= 0.003) return;
            const o = w.inst * 10;
            data[o] = L.p0[0] + L.d[0] * ta;
            data[o + 1] = L.p0[1] + L.d[1] * ta;
            data[o + 2] = L.p0[0] + L.d[0] * tb;
            data[o + 3] = L.p0[1] + L.d[1] * tb;
            data[o + 4] = aMul;
            data[o + 5] = motion;
            data[o + 6] = col[0];
            data[o + 7] = col[1];
            data[o + 8] = col[2];
            data[o + 9] = ext;
            w.motionSum += motion;
            w.inst++;
        },
    };
    return w;
}

// mid-dock: source segments ray out along their own lines (or fade in place)
// while the target logo's edges streak in from their branch points
export function writeMoveSegments(w: SegWriter, plan: MovePlan, m: number, params: EffectConfig): void {
    const fadeM = Math.max(1e-4, params.trailFade / Math.max(0.1, params.moveDur));
    // lines aimed at the new position ray out; the rest fade where they are
    for (const s of plan.a) {
        if (s.exits) {
            const head = s.to + (s.edge - s.to) * clamp01((m - s.hStart) / s.hDur);
            const tail = s.from + (s.edge - s.from) * clamp01((m - s.tStart) / s.tDur);
            w.push(s.L, tail, head, 1, 1, s.col, s.isExt); // travelling until it leaves the screen
        } else {
            // fading in place: not moving, so no trail on it
            w.push(s.L, s.from, s.to, 1 - clamp01((m - s.fadeStart) / s.fadeDur), 0, s.col, s.isExt);
        }
    }
    // …while the target logo's edges streak in from the branch points
    for (const s of plan.b) {
        const head = s.X + (s.far - s.X) * clamp01((m - s.hStart) / s.hDur);
        const tail = s.X + (s.near - s.X) * clamp01((m - s.tStart) / s.tDur);
        const done = Math.max(s.hStart + s.hDur, s.tStart + s.tDur);
        w.push(s.L, tail, head, 1, clamp01((done + fadeM - m) / fadeM), s.col, 0);
    }
}

export interface GrowState {
    /** sequence progress */
    p: number;
    growSpan: number;
    /** post-dock: the mark alone, its palette flowing */
    bare: boolean;
    /** mark-edge colours sampled while the mark was big and centred over the cover */
    palette: [number, number, number][];
    /** frame clock, ms */
    now: number;
    /** frame-clock time the dock completed (eases the flow in) */
    dockedAt: number;
}

// the growing network: every segment's head advances on its own slice of the
// growth clock, trailing a motion term that settles to 0 once it has arrived
export function writeGrowSegments(w: SegWriter, segs: Seg[], params: EffectConfig, st: GrowState): void {
    const q = clamp01(st.p / st.growSpan);
    // settle-fade uses the UNclamped clock: q pins at 1 when the grow phase
    // ends, which would freeze the last finishers' trails on forever
    const qRaw = st.p / st.growSpan;
    const fadeQ = Math.max(1e-4, params.trailFade / Math.max(0.1, params.duration * st.growSpan));
    // Docked colour flow: the artwork's sampled palette washes through the
    // mark's segments in constant motion — the whole palette is spread across
    // the mark and slides along it, eased in over the first moments after
    // landing. FLOW_SPEED is palette entries/sec.
    const n = st.palette.length;
    const flow = st.bare && n > 1 ? clamp01((st.now - st.dockedAt) / 1200) : 0;
    const FLOW_SPEED = 1.5;
    const ft = (st.now / 1000) * FLOW_SPEED;
    const segCount = Math.max(1, segs.length);
    for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (st.bare && s.isExt) continue; // post-move: the mark alone
        const u = (q - s.startT) / s.dur;
        if (u <= 0) continue;
        const head = s.from + (s.to - s.from) * clamp01(u);
        const motion = clamp01((s.startT + s.dur + fadeQ - qRaw) / fadeQ);
        let col = s.col;
        if (flow > 0) {
            const ph = (ft + (i / segCount) * n) % n;
            const j = Math.floor(ph);
            const f = ph - j;
            const a = st.palette[j % n];
            const b = st.palette[(j + 1) % n];
            col = [
                col[0] + (a[0] + (b[0] - a[0]) * f - col[0]) * flow,
                col[1] + (a[1] + (b[1] - a[1]) * f - col[1]) * flow,
                col[2] + (a[2] + (b[2] - a[2]) * f - col[2]) * flow,
            ];
        }
        w.push(s.L, s.from, head, 1, motion, col, s.isExt);
    }
}

// ---------- line + glow uniforms ----------

export interface LineStyle {
    /** stroke width, css px */
    lw: number;
    lr: number;
    lg: number;
    lb: number;
    gr: number;
    gg: number;
    gb: number;
    /** glow base alpha */
    ga: number;
    /** glow passes actually packed into `glow` */
    glowN: number;
}

// Fills the core stroke's uniform block and the first `glowN` glow blocks, and
// hands back the scalars the rest of the frame needs (dot colours, the sdf
// field's palette, the draw gates). `core` and `glow[i]` are the packed
// float layouts of the WGSL `U` struct in shaders/line.ts, which shaders/gl.ts
// unpacks onto loose uniforms — same 18 floats either way.
export function packLineUniforms(
    core: Float32Array,
    glow: Float32Array[],
    params: LiveParams,
    W: number,
    H: number,
    curPos: number,
    moving: boolean
): LineStyle {
    const [lr, lg, lb] = hsb2rgb(params.lineH, params.lineS, params.lineB);
    // Line width is proportional to the logo's scale: `thickness` is the width
    // at the PRIMARY placement, other placements scale with their size, and
    // during a move the width glides between the two so the small logo forms
    // seamlessly thin.
    const wBase = Math.max(0.05, params.logoScale);
    const scaleOf = (posIdx: number) => (posIdx === 0 ? params.logoScale : params.logoScale2);
    let wf = scaleOf(curPos) / wBase;
    if (moving) {
        const wTo = scaleOf(1 - curPos) / wBase;
        wf += (wTo - wf) * clamp01(params.move);
    }
    const lw = Math.max(0.8, params.lineWidth * wf);
    // [viewport, thickness, soft, r,g,b, capScale, tr,tg,tb, alpha, falloff, trail, trailBias, taper, segTint, tailDim]
    const [tr, tg, tb] = hsb2rgb(params.lineH + params.trailHue, params.lineS, params.lineB * params.trailDim);
    core.set([W, H, lw, 0, lr, lg, lb, 1, tr, tg, tb, 1.0, 2, params.trail, params.trailBias, params.taper, params.lineTint, params.trailDim]);
    // glow: stacked passes, each wider and fainter, sharing the trail shading.
    // Clamped to GLOW_MAX — only that many uniform blocks exist, and glowLayers
    // is tweenable (a preset could aim it past the GUI's cap).
    const ga = 0.55 * params.glow;
    const [gr, gg, gb] = hsb2rgb(params.lineH + params.glowHue, params.lineS, params.lineB);
    const glowN = Math.max(1, Math.min(GLOW_MAX, Math.round(params.glowLayers)));
    for (let i = 0; i < glowN; i++) {
        const t = (i + 1) / glowN;
        glow[i].set([
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
    return { lw, lr, lg, lb, gr, gg, gb, ga, glowN };
}

// ---------- bloom energy ----------

// Bloom strength swells with how much of the system is moving right now. The
// raw average is a step function at mode switches (the dock claims every
// segment at once, snapping it 0 -> 1 in a frame — with bloomIdle > 1 that
// reads as the glow cutting out), so it is low-pass filtered before it reaches
// the composite.
export function stepEnergy(prev: number, w: SegWriter, dt: number): number {
    const raw = w.inst ? w.motionSum / w.inst : 0;
    return prev + (raw - prev) * (1 - Math.exp(-dt / BLOOM_ENERGY_TAU));
}
