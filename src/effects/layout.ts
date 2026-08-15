// Pure geometry for the effect — no GPU, no DOM. The mark's line drawing is
// extended to the screen edges; the extended lines partition the viewport
// into convex cells ("shards"). Cells are computed by incrementally splitting
// the screen rectangle with each (deduped, collinear-merged) logo line —
// every cell in an arrangement of lines cut from a convex region stays
// convex, so splitting and fan-triangulation are trivial and robust.

import type { EffectConfig } from '@/effects/config';
import { CXm, CYm, EDGES, H2, MARK, SILHOUETTE } from '@/effects/mark';

export const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
export const hash = (n: number) => {
    const x = Math.sin(n) * 43758.5453;
    return x - Math.floor(x);
};
export function hsb2rgb(h: number, s: number, v: number): [number, number, number] {
    const s1 = s / 100;
    const v1 = v / 100;
    const k = (n: number) => (n + h / 60) % 6;
    const f = (n: number) => v1 - v1 * s1 * Math.max(0, Math.min(k(n), 4 - k(n), 1));
    return [f(5), f(3), f(1)];
}

export interface Placement {
    s: number;
    x: number;
    y: number;
}

// an infinite line: unit direction d, unit normal n, offset c (n·p = c),
// p0 the point on the line closest to the origin
export interface LineGeom {
    d: [number, number];
    n: [number, number];
    c: number;
    p0: [number, number];
}

// a layout line additionally knows its logo span, screen clip and drawn extent
export interface Line extends LineGeom {
    sMin: number;
    sMax: number;
    t0: number;
    t1: number;
    drawnA: number;
    drawnB: number;
    segsOnLine: Seg[];
}

// a growing segment: params along L, from (tail) -> to (head)
export interface Seg {
    L: Line;
    from: number;
    to: number;
    startT: number;
    dur: number;
    isExt: 0 | 1;
    col: [number, number, number]; // texture colour at the segment's midpoint
}

export interface Dot {
    x: number;
    y: number;
    r: number;
    order: number;
    col: [number, number, number]; // texture colour under the dot's centre
}

export interface LayoutResult {
    verts: Float32Array<ArrayBuffer>; // 10 floats per vertex: pos, uv, colour, closeT, centroid uv
    vertCount: number;
    segs: Seg[];
    dots: Dot[];
}

export type SampleFn = (x: number, y: number) => [number, number, number];

// a source segment during a move: rays out along its own line (or fades in place)
export interface MoveSegOut {
    L: LineGeom;
    from: number;
    to: number;
    edge: number;
    exits: boolean;
    isExt: 0 | 1;
    hStart: number;
    hDur: number;
    tStart: number;
    tDur: number;
    fadeStart: number;
    fadeDur: number;
    col: [number, number, number];
}

// a target edge during a move: streaks in from its branch point X
export interface MoveSegIn {
    L: LineGeom;
    X: number;
    near: number;
    far: number;
    hStart: number;
    hDur: number;
    tStart: number;
    tDur: number;
    col: [number, number, number];
}

export interface MovePlan {
    a: MoveSegOut[];
    b: MoveSegIn[];
    dotsA: Dot[];
    dotsB: Dot[];
}

// texture colour under a point, lifted to a luminous tone: dark art pixels
// keep their hue but are boosted so nothing colourises into invisibility
// against the black page; truly hueless near-black (the margin around the
// artwork, pure black art) falls back to `fallback` — the configured line
// colour
const accentColor = (sample: SampleFn, x: number, y: number, fallback: [number, number, number]): [number, number, number] => {
    const c = sample(x, y);
    const m = Math.max(c[0], c[1], c[2]);
    if (m < 0.05) return fallback; // no hue to speak of
    const boost = Math.max(1, 0.75 / m);
    return [Math.min(1, c[0] * boost), Math.min(1, c[1] * boost), Math.min(1, c[2] * boost)];
};

const placeVerts = (W: number, H: number, pos: Placement) => {
    const k = (pos.s * H) / H2;
    const ox = pos.x * W;
    const oy = pos.y * H;
    return {
        k,
        ox,
        oy,
        P: MARK.V.map(([x, y]) => [ox + (x - CXm) * k, oy + (y - CYm) * k] as [number, number]),
    };
};

// canonicalised infinite line through two points (shared by layout + move geometry)
const lineKey = (dx: number, dy: number, c: number) => `${Math.round(Math.atan2(dy, dx) * 2000)}_${Math.round(c * 2)}`;

// ---------- the main layout: growth graph + shard arrangement ----------
// Every unique logo line hosts rays that grow outward with their own random
// delay + duration. A shard stays black until every ray bounding it has grown
// past it ("closed"), then flashes in.
export function buildLayout(W: number, H: number, pos: Placement, cfg: EffectConfig, sample: SampleFn): LayoutResult {
    const { k, ox, oy, P } = placeVerts(W, H, pos);
    const lineCol = hsb2rgb(cfg.lineH, cfg.lineS, cfg.lineB); // segment fallback off the artwork
    const segColor = (L: LineGeom, a: number, b: number) => {
        const mid = (a + b) / 2;
        return accentColor(sample, L.p0[0] + L.d[0] * mid, L.p0[1] + L.d[1] * mid, lineCol);
    };

    // unique infinite lines through the edges (collinear edges merge into one
    // line whose "logo span" is the union of its segments)
    const lines = new Map<string, Line>();
    interface EdgeRec {
        a: number;
        b: number;
        L: Line;
        ta: number;
        tb: number;
        len: number;
        delay: number;
        dur: number;
    }
    const edgeRecs: EdgeRec[] = []; // each mark edge, mapped onto its merged line
    const stag = cfg.stagger; // 0 = maximum overlap
    for (const [a, b] of EDGES) {
        let dx = P[b][0] - P[a][0];
        let dy = P[b][1] - P[a][1];
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        if (dx < -1e-9 || (Math.abs(dx) < 1e-9 && dy < 0)) {
            dx = -dx;
            dy = -dy;
        } // canonical dir
        const nx = -dy;
        const ny = dx;
        const c = nx * P[a][0] + ny * P[a][1];
        const key = lineKey(dx, dy, c);
        let L = lines.get(key);
        if (!L) {
            L = {
                d: [dx, dy],
                n: [nx, ny],
                c,
                p0: [nx * c, ny * c],
                sMin: Number.POSITIVE_INFINITY,
                sMax: Number.NEGATIVE_INFINITY,
                t0: 0,
                t1: 0,
                drawnA: 0,
                drawnB: 0,
                segsOnLine: [],
            };
            lines.set(key, L);
        }
        const ta = dx * P[a][0] + dy * P[a][1];
        const tb = dx * P[b][0] + dy * P[b][1];
        L.sMin = Math.min(L.sMin, ta, tb);
        L.sMax = Math.max(L.sMax, ta, tb);
        const i = edgeRecs.length;
        edgeRecs.push({
            a,
            b,
            L,
            ta,
            tb,
            len: Math.abs(tb - ta),
            delay: (0.03 + 0.12 * hash(i * 7.77 + 0.7)) * stag,
            dur: (Math.abs(tb - ta) / H) * (0.9 + 0.6 * hash(i * 3.13 + 2.2)),
        });
    }
    const uniq = [...lines.values()];

    // clip each line to the screen rect
    for (const L of uniq) {
        let t0 = Number.NEGATIVE_INFINITY;
        let t1 = Number.POSITIVE_INFINITY;
        for (const [p, d, lo, hi] of [
            [L.p0[0], L.d[0], 0, W],
            [L.p0[1], L.d[1], 0, H],
        ]) {
            if (Math.abs(d) < 1e-9) {
                if (p < lo || p > hi) {
                    t0 = 1;
                    t1 = 0;
                    break;
                }
                continue;
            }
            const ta = (lo - p) / d;
            const tb = (hi - p) / d;
            t0 = Math.max(t0, Math.min(ta, tb));
            t1 = Math.min(t1, Math.max(ta, tb));
        }
        L.t0 = t0;
        L.t1 = t1;
    }

    // silhouette polygon: extensions may only exist where they LEAVE the mark
    // (never crossing its interior)
    const SIL = SILHOUETTE.map((i) => P[i]);
    const inSil = (x: number, y: number) => {
        let inside = false;
        for (let i = 0, j = SIL.length - 1; i < SIL.length; j = i++) {
            const [xi, yi] = SIL[i];
            const [xj, yj] = SIL[j];
            if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    };

    // Growth graph: the mark forms first as a branching network — each edge
    // springs from whichever of its endpoints the already-drawn structure
    // reaches sooner (seeded at the centre vertex), so every new segment
    // radiates from an existing intersection. Extensions then ray outward
    // from silhouette vertices once the network arrives there; only a
    // `density` fraction of the allowed ones exist (larger outer shards).
    // At most `maxRays` rays may LEAVE any one vertex, so crowded vertices
    // (the centre has 7 incident edges) no longer starburst — the edges that
    // don't fit grow inward from their far endpoint instead.
    const SEED = 10;
    const MAXOUT = Math.round(cfg.maxRays);
    const MAXEXT = 2; // extensions have only one possible direction (outward),
    // so they carry their own small budget per vertex

    // Greedy frontier growth: repeatedly start the edge that can begin
    // earliest from an already-reached vertex that still has ray budget.
    const vT = new Array<number>(MARK.V.length).fill(Number.POSITIVE_INFINITY);
    vT[SEED] = 0;
    const outCount = new Array<number>(MARK.V.length).fill(0);
    const extCount = new Array<number>(MARK.V.length).fill(0);
    const segs: Seg[] = [];
    const pending = edgeRecs.slice();
    while (pending.length) {
        let bi = -1;
        let bOrigin = -1;
        let bStart = Number.POSITIVE_INFINITY;
        const scan = (respectBudget: boolean) => {
            pending.forEach((e, i) => {
                for (const o of [e.a, e.b]) {
                    if (!Number.isFinite(vT[o])) continue;
                    if (respectBudget && outCount[o] >= MAXOUT) continue;
                    const st = vT[o] + e.delay;
                    if (st < bStart) {
                        bStart = st;
                        bi = i;
                        bOrigin = o;
                    }
                }
            });
        };
        scan(true);
        if (bi < 0) scan(false); // budget would strand an edge — let it over-spend
        if (bi < 0) break; // unreachable remainder (can't happen: graph is connected)
        const e = pending.splice(bi, 1)[0];
        const fromA = bOrigin === e.a;
        const other = fromA ? e.b : e.a;
        outCount[bOrigin]++;
        segs.push({
            L: e.L,
            from: fromA ? e.ta : e.tb,
            to: fromA ? e.tb : e.ta,
            startT: bStart,
            dur: e.dur,
            isExt: 0,
            col: segColor(e.L, e.ta, e.tb),
        });
        vT[other] = Math.min(vT[other], bStart + e.dur);
    }
    uniq.forEach((L, li) => {
        L.drawnA = L.sMin;
        L.drawnB = L.sMax; // drawn interval on this line
        for (const [side, anchor, tEnd] of [
            [1, L.sMax, L.t1],
            [-1, L.sMin, L.t0],
        ]) {
            if ((tEnd - anchor) * side < 8) continue; // no room to the screen edge
            const px = L.p0[0] + L.d[0] * (anchor + side * 3);
            const py = L.p0[1] + L.d[1] * (anchor + side * 3);
            if (inSil(px, py)) continue; // would cross the mark's interior
            const hkey = li * 13.7 + side * 5.5;
            if (hash(hkey + 8.8) > cfg.density) continue; // thinned on purpose
            let av = 0;
            let best = Number.POSITIVE_INFINITY; // mark vertex anchoring this span end
            MARK.V.forEach((_, vi) => {
                const t = L.d[0] * P[vi][0] + L.d[1] * P[vi][1];
                const d2 = Math.abs(t - anchor) + Math.abs(L.n[0] * P[vi][0] + L.n[1] * P[vi][1] - L.c);
                if (d2 < best) {
                    best = d2;
                    av = vi;
                }
            });
            if (extCount[av] >= MAXEXT) continue; // vertex already sprouts enough
            extCount[av]++;
            const startT = (Number.isFinite(vT[av]) ? vT[av] : 0) + (0.02 + 0.2 * hash(hkey + 1.9)) * stag;
            const dur = (Math.abs(tEnd - anchor) / H) * (0.8 + 0.7 * hash(hkey + 4.4));
            segs.push({ L, from: anchor, to: tEnd, startT, dur, isExt: 1, col: segColor(L, anchor, tEnd) });
            if (side > 0) L.drawnB = tEnd;
            else L.drawnA = tEnd;
        }
    });
    // normalise all times so the last completion lands at q = 1
    let tMax = 1e-6;
    for (const s of segs) tMax = Math.max(tMax, s.startT + s.dur);
    for (const s of segs) {
        s.startT /= tMax;
        s.dur /= tMax;
        s.L.segsOnLine.push(s);
    }
    // the three brand dots — positions + their fixed brand colours;
    // their timing rides the render loop
    const dots: Dot[] = MARK.DOTS.map((d) => {
        const x = ox + (d.x - CXm) * k;
        const y = oy + (d.y - CYm) * k;
        return { x, y, r: MARK.R * k, order: d.order, col: d.col };
    });

    // earliest arrival (q units) of any drawn segment at param x on line L
    const arrivalAt = (L: Line, x: number) => {
        let best = Number.POSITIVE_INFINITY;
        for (const s of L.segsOnLine) {
            const lo = Math.min(s.from, s.to) - 0.5;
            const hi = Math.max(s.from, s.to) + 0.5;
            if (x < lo || x > hi) continue;
            const span = Math.abs(s.to - s.from) || 1e-6;
            best = Math.min(best, s.startT + s.dur * clamp01(Math.abs(x - s.from) / span));
        }
        return best === Number.POSITIVE_INFINITY ? 1 : best;
    };

    // split the screen rect into convex cells with each line
    const EPS = 0.01;
    const area = (p: number[][]) => {
        let s = 0;
        for (let i = 0; i < p.length; i++) {
            const j = (i + 1) % p.length;
            s += p[i][0] * p[j][1] - p[j][0] * p[i][1];
        }
        return Math.abs(s) / 2;
    };
    let cells: number[][][] = [
        [
            [0, 0],
            [W, 0],
            [W, H],
            [0, H],
        ],
    ];
    for (const L of uniq) {
        const next: number[][][] = [];
        for (const poly of cells) {
            const sides = poly.map((v) => L.n[0] * v[0] + L.n[1] * v[1] - L.c);
            if (sides.every((s) => s > -EPS) || sides.every((s) => s < EPS)) {
                next.push(poly);
                continue;
            }
            const A: number[][] = [];
            const B: number[][] = [];
            for (let i = 0; i < poly.length; i++) {
                const j = (i + 1) % poly.length;
                const si = sides[i];
                const sj = sides[j];
                if (si >= -EPS) A.push(poly[i]);
                if (si <= EPS) B.push(poly[i]);
                if ((si > EPS && sj < -EPS) || (si < -EPS && sj > EPS)) {
                    const t = si / (si - sj);
                    const X = [poly[i][0] + (poly[j][0] - poly[i][0]) * t, poly[i][1] + (poly[j][1] - poly[i][1]) * t];
                    A.push(X);
                    B.push(X);
                }
            }
            if (A.length >= 3 && area(A) > 1) next.push(A);
            if (B.length >= 3 && area(B) > 1) next.push(B);
        }
        cells = next;
    }

    // ---- merge cells whose shared boundary carries no drawn segment ----
    // Cells were split by INFINITE lines; wherever a line's drawn interval
    // (logo span + kept extensions) doesn't cover a boundary, the two cells
    // are really one shard. This keeps the mark's interior as its 13 true
    // triangles (no foreign lines cross it) and yields the large asymmetric
    // outer shards.
    interface Span {
        li: number;
        a: number;
        b: number;
    }
    const spanKey = (sp: Span) => `${sp.li}:${Math.round(sp.a * 2)}:${Math.round(sp.b * 2)}`;
    const cellInfo = cells.map((poly) => {
        const cx = poly.reduce((s, v) => s + v[0], 0) / poly.length;
        const cy = poly.reduce((s, v) => s + v[1], 0) / poly.length;
        const spans: Span[] = [];
        uniq.forEach((L, li) => {
            const on: number[] = [];
            for (const v of poly) if (Math.abs(L.n[0] * v[0] + L.n[1] * v[1] - L.c) < 0.05) on.push(L.d[0] * v[0] + L.d[1] * v[1]);
            if (on.length >= 2) spans.push({ li, a: Math.min(...on), b: Math.max(...on) });
        });
        return { poly, cx, cy, area: area(poly), spans };
    });
    const parent = cellInfo.map((_, i) => i);
    const find = (i: number): number => {
        if (parent[i] === i) return i;
        const root = find(parent[i]);
        parent[i] = root; // path compression
        return root;
    };
    const byBoundary = new Map<string, number[]>(); // shared boundary -> the cells flanking it
    cellInfo.forEach((ci, i) => {
        for (const sp of ci.spans) {
            const key = spanKey(sp);
            const arr = byBoundary.get(key);
            if (arr) arr.push(i);
            else byBoundary.set(key, [i]);
        }
    });
    for (const [key, arr] of byBoundary) {
        if (arr.length !== 2) continue;
        const li = Number(key.split(':')[0]);
        const L = uniq[li];
        const sp = cellInfo[arr[0]].spans.find((s) => spanKey(s) === key);
        if (!sp) continue;
        const covered = Math.max(0, Math.min(sp.b, L.drawnB) - Math.max(sp.a, L.drawnA));
        if (covered < 0.6 * (sp.b - sp.a)) parent[find(arr[0])] = find(arr[1]);
    }
    const internalSpans = new Set<string>(); // boundaries inside a merged shard
    for (const [key, arr] of byBoundary) {
        if (arr.length === 2 && find(arr[0]) === find(arr[1])) {
            internalSpans.add(`${arr[0]}|${key}`);
            internalSpans.add(`${arr[1]}|${key}`);
        }
    }

    // one shard = one merged group: area-weighted centre, colour, close time
    const groups = new Map<number, { cells: number[]; area: number; cx: number; cy: number }>();
    cellInfo.forEach((ci, i) => {
        const r = find(i);
        let g = groups.get(r);
        if (!g) {
            g = { cells: [], area: 0, cx: 0, cy: 0 };
            groups.set(r, g);
        }
        g.cells.push(i);
        g.area += ci.area;
        g.cx += ci.cx * ci.area;
        g.cy += ci.cy * ci.area;
    });
    const verts: number[] = [];
    let gi = 0;
    for (const g of groups.values()) {
        const cx = g.cx / (g.area || 1);
        const cy = g.cy / (g.area || 1);
        // area-weighted colour: sample the centroid of every fan triangle of
        // every sub-cell, so shards straddling image detail (or the art's
        // edge) resolve from a genuinely representative flat colour
        let cr = 0;
        let cg = 0;
        let cb = 0;
        let wSum = 0;
        for (const i of g.cells) {
            const poly = cellInfo[i].poly;
            for (let j = 1; j < poly.length - 1; j++) {
                const tri = [poly[0], poly[j], poly[j + 1]];
                const w = area(tri);
                const s = sample((tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3);
                cr += s[0] * w;
                cg += s[1] * w;
                cb += s[2] * w;
                wSum += w;
            }
        }
        const col = wSum > 0 ? [cr / wSum, cg / wSum, cb / wSum] : sample(cx, cy);
        // shard closes when its last still-real (drawn) boundary is fully grown
        let closeQ = 0;
        for (const i of g.cells) {
            for (const sp of cellInfo[i].spans) {
                if (internalSpans.has(`${i}|${spanKey(sp)}`)) continue;
                const L = uniq[sp.li];
                const ia = Math.max(sp.a, L.drawnA);
                const ib = Math.min(sp.b, L.drawnB);
                if (ib - ia < 1) continue;
                closeQ = Math.max(closeQ, arrivalAt(L, ia), arrivalAt(L, ib));
            }
        }
        // raw 0..1 fraction of the growth phase; the shader scales it by growSpan
        const closeT = clamp01(closeQ) + 0.01 * hash(gi * 7.13); // tiny jitter
        const cu = cx / W;
        const cv = cy / H; // shard centroid = scale anchor
        for (const i of g.cells) {
            const poly = cellInfo[i].poly;
            for (let j = 1; j < poly.length - 1; j++) {
                // convex fan per sub-cell
                for (const v of [poly[0], poly[j], poly[j + 1]]) verts.push(v[0], v[1], v[0] / W, v[1] / H, col[0], col[1], col[2], closeT, cu, cv);
            }
        }
        gi++;
    }

    return { verts: new Float32Array(verts), vertCount: verts.length / 10, segs, dots };
}

// ---------- movement geometry ----------
// lines + per-edge params for an arbitrary placement (no cells/extensions)
export function logoGeometry(W: number, H: number, pos: Placement, _sample: SampleFn) {
    const { k, ox, oy, P } = placeVerts(W, H, pos);
    const lines = new Map<string, LineGeom>();
    const edges: { L: LineGeom; ta: number; tb: number }[] = [];
    for (const [a, b] of EDGES) {
        let dx = P[b][0] - P[a][0];
        let dy = P[b][1] - P[a][1];
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        if (dx < -1e-9 || (Math.abs(dx) < 1e-9 && dy < 0)) {
            dx = -dx;
            dy = -dy;
        }
        const nx = -dy;
        const ny = dx;
        const c = nx * P[a][0] + ny * P[a][1];
        const key = lineKey(dx, dy, c);
        let L = lines.get(key);
        if (!L) {
            L = { d: [dx, dy], n: [nx, ny], c, p0: [nx * c, ny * c] };
            lines.set(key, L);
        }
        edges.push({ L, ta: dx * P[a][0] + dy * P[a][1], tb: dx * P[b][0] + dy * P[b][1] });
    }
    const dots: Dot[] = MARK.DOTS.map((d) => {
        const x = ox + (d.x - CXm) * k;
        const y = oy + (d.y - CYm) * k;
        return { x, y, r: MARK.R * k, order: d.order, col: d.col };
    });
    return { edges, dots };
}

// param along LB where LB crosses the SEGMENT [a0,a1] on LA (null if missed)
function crossParam(LB: LineGeom, LA: LineGeom, a0: number, a1: number): number | null {
    const dn = LA.n[0] * LB.d[0] + LA.n[1] * LB.d[1];
    if (Math.abs(dn) < 1e-6) return null; // parallel
    const t = (LA.c - (LA.n[0] * LB.p0[0] + LA.n[1] * LB.p0[1])) / dn;
    const px = LB.p0[0] + LB.d[0] * t;
    const py = LB.p0[1] + LB.d[1] * t;
    const sA = LA.d[0] * px + LA.d[1] * py;
    if (sA < Math.min(a0, a1) - 2 || sA > Math.max(a0, a1) + 2) return null;
    return t;
}

// The logo "moves" without any line ever moving: the target logo's edges
// arrive as rays branching off the source logo's segments (seeded at line
// intersections), while the source segments ray OUT along their own lines,
// continuing in the direction they originally grew.
export function buildMovePlan(
    W: number,
    H: number,
    srcSegs: Seg[],
    srcDots: Dot[],
    srcCenter: { x: number; y: number },
    target: Placement,
    cfg: EffectConfig,
    sample: SampleFn
): MovePlan {
    const g = logoGeometry(W, H, target, sample);
    const pxT = (d: number) => Math.abs(d) / (H * 2); // px distance -> raw time
    const a: MoveSegOut[] = [];
    const b: MoveSegIn[] = [];
    // source segments ray OUT: the head continues past the far end along the
    // segment's own line (the direction it originally grew), the tail follows.
    // Only lines whose ray points TOWARD the new position leave; the rest
    // stay put and fade, so the move reads as a directional sweep.
    let mvx = (target.x - srcCenter.x) * W;
    let mvy = (target.y - srcCenter.y) * H;
    const mvLen = Math.hypot(mvx, mvy);
    const hasDir = mvLen > 1; // pure scale change: everything leaves
    if (hasDir) {
        mvx /= mvLen;
        mvy /= mvLen;
    }
    srcSegs.forEach((sg, i) => {
        const dir = Math.sign(sg.to - sg.from) || 1;
        const edge = dir > 0 ? sg.L.t1 : sg.L.t0;
        const start = hash(i * 3.37 + 9.11) * cfg.moveStagger * 0.5;
        const exits = !hasDir || sg.L.d[0] * dir * mvx + sg.L.d[1] * dir * mvy > 0;
        const hDur = Math.max(1e-4, pxT(edge - sg.to));
        a.push({
            L: sg.L,
            from: sg.from,
            to: sg.to,
            edge,
            exits,
            isExt: sg.isExt,
            hStart: start,
            hDur,
            tStart: start + 0.25 * hDur,
            tDur: Math.max(1e-4, pxT(edge - sg.from)),
            fadeStart: start,
            fadeDur: Math.max(0.05, cfg.moveFade),
            col: sg.col, // keeps the colour it grew with
        });
    });
    // target edges arrive as rays seeded at the nearest intersection of their
    // line with the source logo's segments — branching off the old mark
    g.edges.forEach((e, i) => {
        let X: number | null = null;
        let best = Number.POSITIVE_INFINITY;
        for (const sg of srcSegs) {
            if (sg.isExt) continue; // branch off the mark itself
            const t = crossParam(e.L, sg.L, sg.from, sg.to);
            if (t == null) continue;
            const lo = Math.min(e.ta, e.tb);
            const hi = Math.max(e.ta, e.tb);
            const dInt = t < lo ? lo - t : t > hi ? t - hi : 0;
            if (dInt < best) {
                best = dInt;
                X = t;
            }
        }
        if (X == null) X = e.ta; // no crossing (shouldn't happen) — grow in place
        const near = Math.abs(e.ta - X) <= Math.abs(e.tb - X) ? e.ta : e.tb;
        const far = near === e.ta ? e.tb : e.ta;
        const start = 0.18 + hash(i * 7.73 + 3.31) * cfg.moveStagger;
        const hDur = Math.max(1e-4, pxT(far - X));
        const mid = (e.ta + e.tb) / 2;
        b.push({
            L: e.L,
            X,
            near,
            far,
            hStart: start,
            hDur,
            tStart: start + 0.3 * hDur,
            tDur: Math.max(1e-4, pxT(near - X)),
            col: accentColor(sample, e.L.p0[0] + e.L.d[0] * mid, e.L.p0[1] + e.L.d[1] * mid, hsb2rgb(cfg.lineH, cfg.lineS, cfg.lineB)),
        });
    });
    // No new small line may appear once the big logo is gone. Landing exactly
    // ON the vanish moment isn't enough — a ray that has just started is still
    // sub-pixel, so it reads as appearing afterwards. Every incoming ray must
    // therefore have STARTED by `newLinesBy` of the way through the exit,
    // leaving it visibly growing while the old mark is still leaving.
    let srcEnd = 0;
    for (const sg of a) srcEnd = Math.max(srcEnd, sg.exits ? Math.max(sg.hStart + sg.hDur, sg.tStart + sg.tDur) : sg.fadeStart + sg.fadeDur);
    const deadline = srcEnd * clamp01(cfg.newLinesBy);
    let lastIn = 0;
    for (const sg of b) lastIn = Math.max(lastIn, sg.hStart);
    if (deadline > 1e-6 && lastIn > deadline) {
        const k = deadline / lastIn; // proportional: keeps the incoming stagger
        for (const sg of b) {
            sg.hStart *= k;
            sg.tStart = sg.hStart + 0.3 * sg.hDur;
        }
    }

    // normalise the whole move to 0..1
    let T = 1e-6;
    for (const sg of a) T = Math.max(T, sg.hStart + sg.hDur, sg.tStart + sg.tDur, sg.fadeStart + sg.fadeDur);
    for (const sg of b) T = Math.max(T, sg.hStart + sg.hDur, sg.tStart + sg.tDur);
    for (const sg of a) {
        sg.hStart /= T;
        sg.hDur /= T;
        sg.tStart /= T;
        sg.tDur /= T;
        sg.fadeStart /= T;
        sg.fadeDur /= T;
    }
    for (const sg of b) {
        sg.hStart /= T;
        sg.hDur /= T;
        sg.tStart /= T;
        sg.tDur /= T;
    }
    return { a, b, dotsA: srcDots.slice(), dotsB: g.dots };
}
