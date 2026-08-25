// MINA mark data, hardcoded from the brand SVG (same source as the wgpu
// prototype series). All placements are (scale, x01, y01) mappings of this
// one mark-space geometry.

export interface MarkDot {
    x: number;
    y: number;
    order: number;
    col: [number, number, number];
}

export const MARK = {
    V: [
        [53.0, 116.2],
        [223.5, 116.2],
        [53.0, 212.0],
        [223.5, 212.0],
        [53.0, 310.5],
        [138.77, 310.5],
        [223.5, 310.5],
        [138.77, 68.9],
        [138.77, 359.0],
        [138.77, 459.0],
        [138.77, 263.0],
    ] as ReadonlyArray<readonly [number, number]>,
    TRIS: [
        [0, 1, 7],
        [0, 1, 10],
        [0, 2, 10],
        [1, 3, 10],
        [2, 3, 10],
        [2, 4, 10],
        [3, 6, 10],
        [4, 5, 10],
        [5, 6, 10],
        [4, 5, 8],
        [5, 6, 8],
        [4, 5, 9],
        [5, 6, 9],
    ] as ReadonlyArray<readonly [number, number, number]>,
    // the three dots of the brand SVG (exact positions/radius from the mark).
    // `order` is their arrival sequence as the lines exit: middle, top, bottom.
    // `col` is the fixed colour each dot grows into: yellow, blue, white
    // reading top to bottom.
    DOTS: [
        { x: 138.5, y: 48.31, order: 1, col: [1, 0.8, 0.2] }, // above the apex — second, yellow
        { x: 138.5, y: 164.92, order: 0, col: [0.35, 0.45, 1] }, // inside the upper box — first, blue
        { x: 138.5, y: 479.73, order: 2, col: [1, 1, 1] }, // below the bottom tip — last, white
    ] as readonly MarkDot[],
    R: 7.38,
};

// unique undirected edges of the triangulation
export const EDGES = (() => {
    const seen = new Map<string, [number, number]>();
    for (const tri of MARK.TRIS) {
        for (const [a, b] of [
            [tri[0], tri[1]],
            [tri[1], tri[2]],
            [tri[2], tri[0]],
        ]) {
            const k = `${Math.min(a, b)}-${Math.max(a, b)}`;
            if (!seen.has(k)) seen.set(k, [a, b]);
        }
    }
    return [...seen.values()];
})();

// Extension-ray priority tiers, from the art-direction diagram: 1 = red
// (the long diagonals through the centre crossing and the kite edges),
// 2 = yellow (the roof, the centre vertical, the inner V), 3 = green (the
// three horizontals and the side verticals). Keyed "min-max" vertex pair.
export const EDGE_TIER: Readonly<Record<string, 1 | 2 | 3>> = {
    // red — diagonals + kite
    '0-10': 1,
    '1-10': 1,
    '2-10': 1,
    '3-10': 1,
    '4-10': 1,
    '6-10': 1,
    '4-9': 1,
    '6-9': 1,
    // yellow — roof, centre vertical, inner V
    '0-7': 2,
    '1-7': 2,
    '5-10': 2,
    '5-8': 2,
    '5-9': 2,
    '4-8': 2,
    '6-8': 2,
    // green — horizontals + side verticals
    '0-1': 3,
    '2-3': 3,
    '4-5': 3,
    '5-6': 3,
    '0-2': 3,
    '2-4': 3,
    '1-3': 3,
    '3-6': 3,
};

export const edgeTier = (a: number, b: number): 1 | 2 | 3 => EDGE_TIER[`${Math.min(a, b)}-${Math.max(a, b)}`] ?? 3;

// mark-space bounds and centre — placements scale the mark by height (H2)
export const BXm = { minX: 53, maxX: 223.5, minY: 40.9, maxY: 487.1 };
export const CXm = (BXm.minX + BXm.maxX) / 2;
export const CYm = (BXm.minY + BXm.maxY) / 2;
export const H2 = BXm.maxY - BXm.minY;

// the mark's outer silhouette, as ordered vertex indices
export const SILHOUETTE = [7, 1, 3, 6, 9, 4, 2, 0] as const;
