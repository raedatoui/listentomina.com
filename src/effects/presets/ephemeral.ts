import type { Preset } from '@/effects/config';

// "The Ephemeral Trail" release announcement: dense shards flash and settle
// in the artwork's own hues but stay veiled — the cover itself only fades in
// (with the title) after the mark docks. Big centred blue mark, full trail,
// then a fast dock to the upper left. Thickness swells with the resolve,
// thins with the dock.
export const ephemeral: Preset = {
    config: {
        textureUrl: '/images/the ephemeral trail cover.jpg',
        textureFit: 'square',
        // 7s total, weighted so the mark draws fast (~2s) while the image
        // reveal keeps its slow sweep (~4.6s): the reveal stages' share of
        // the normalised timeline is what splits growth from resolve
        duration: 4,
        stagger: 2.16,
        density: 0.96,
        maxRays: 1,
        autoplay: true,
        whiteDur: 0.05,
        colorDur: 0.6,
        texDur: 1.6,
        hold: 0.18,
        whiteLevel: 0.23,
        colorSat: 1.15,
        colorBoost: 1.15,
        flashTint: 1,
        veil: 1, // the artwork never shows in the shards — it fades in with the title after the dock
        dotSize: 1,
        dotPulse: 2,
        dotStart: 0.43,
        dotStagger: 0.05,
        dotGrow: 0.04,
        logoScale2: 0.24,
        logoX2: 0.045,
        logoY2: 0.14,
        moveDur: 0.9,
        moveStagger: 0.52,
        moveDelay: 0, // dock starts the instant the handoff / artwork fade begins
        moveFade: 0.7,
        newLinesBy: 1,
        autoMove: true,
        logoScale: 0.95,
        logoX: 0.5,
        logoY: 0.5,
        texScale: 1.15,
        ripple: false,
        lineWidth: 2,
        lineH: 231,
        lineS: 0, // white base: off-artwork segments and the docked mark land white
        lineB: 100,
        lineTint: 1,
        glow: 0.76,
        glowWidth: 16,
        glowLayers: 2,
        glowFalloff: 2,
        glowHue: 2,
        bloom: 1,
        bloomRadius: 1.5,
        bloomIdle: 2.49,
        trail: 1,
        trailBias: 0.8,
        trailHue: 0,
        trailDim: 0.25,
        trailFade: 0.3,
        taper: 0.6,
    },
    tweens: [
        { on: 'play', prop: 'lineWidth', to: 8 }, // swell across the resolve sweep
        { on: 'move', prop: 'lineWidth', to: 5.5 }, // thin away over the dock
        { on: 'move', prop: 'glowWidth', to: 2 },
        { on: 'move', prop: 'bloomRadius', to: 1.5 },
        { on: 'move', prop: 'bloomIdle', to: 0.49 },
    ],
};
