// Every tunable of the effect. Presets (src/effects/presets/) are partial
// overrides of BASE; the GUI edits a live copy of the merged result.

export interface EffectConfig {
    /** where the shard texture comes from — a static, same-origin image */
    textureUrl: string;
    /** cover = fill the viewport; square = centred square on black (album art) */
    textureFit: 'cover' | 'square';

    // sequence
    duration: number;
    stagger: number;
    density: number;
    maxRays: number;
    autoplay: boolean;

    // reveal
    whiteDur: number;
    colorDur: number;
    texDur: number;
    hold: number;
    whiteLevel: number;
    colorSat: number;
    colorBoost: number;
    /** 0 = white flash, 1 = flash in the shard's own hue */
    flashTint: number;
    /** holds back the colour→texture crossfade: 1 = shards never unveil the texture */
    veil: number;

    // dots
    dotSize: number;
    dotPulse: number;
    dotStart: number;
    dotStagger: number;
    dotGrow: number;

    // move target placement
    logoScale2: number;
    logoX2: number;
    logoY2: number;

    // move behaviour
    moveDur: number;
    moveStagger: number;
    moveDelay: number;
    moveFade: number;
    newLinesBy: number;
    autoMove: boolean;

    // primary placement
    logoScale: number;
    logoX: number;
    logoY: number;

    // texture
    texScale: number;
    /** per-shard zoom settle on reveal (the "ripple"); texScale sets its depth */
    ripple: boolean;

    // lines
    lineWidth: number;
    lineH: number;
    lineS: number;
    lineB: number;
    /** 0 = uniform line colour, 1 = each segment tinted by the texture under it */
    lineTint: number;

    // glow / bloom
    glow: number;
    glowWidth: number;
    glowLayers: number;
    glowFalloff: number;
    glowHue: number;
    bloom: number;
    bloomRadius: number;
    bloomIdle: number;

    // trail
    trail: number;
    trailBias: number;
    trailHue: number;
    trailDim: number;
    trailFade: number;
    taper: number;
}

export const BASE: EffectConfig = {
    textureUrl: '/images/bg.jpg',
    textureFit: 'cover',
    duration: 6.0,
    stagger: 1.05,
    density: 0.85,
    maxRays: 3,
    autoplay: true,
    whiteDur: 0.05,
    colorDur: 0.45,
    texDur: 0.8,
    hold: 0.18,
    whiteLevel: 1.0,
    colorSat: 1.15,
    colorBoost: 1.15,
    flashTint: 0,
    veil: 0,
    dotSize: 1.0,
    dotPulse: 2.0,
    dotStart: 0.4,
    dotStagger: 0.15,
    dotGrow: 0.08,
    logoScale2: 0.1,
    logoX2: 0.16,
    logoY2: 0.34,
    moveDur: 2.5,
    moveStagger: 0.5,
    moveDelay: 0.2,
    moveFade: 0.35,
    newLinesBy: 0.6,
    autoMove: true,
    logoScale: 0.72,
    logoX: 0.5,
    logoY: 0.5,
    texScale: 1.15,
    ripple: true,
    lineWidth: 5,
    lineH: 0,
    lineS: 0,
    lineB: 100,
    lineTint: 0,
    glow: 0.55,
    glowWidth: 4,
    glowLayers: 2,
    glowFalloff: 2,
    glowHue: 0,
    bloom: 1.0,
    bloomRadius: 1.5,
    bloomIdle: 0.25,
    trail: 0.55,
    trailBias: 0.8,
    trailHue: 0,
    trailDim: 0.25,
    trailFade: 0.3,
    taper: 0.6,
};

export const SETTINGS_KEYS = Object.keys(BASE) as (keyof EffectConfig)[];

// the live object the engine renders from and the GUI edits — config plus
// the transient scrub/readout fields (never part of a preset)
export interface LiveParams extends EffectConfig {
    progress: number;
    move: number;
    dotTiming: string;
}

// numeric-only config keys — the tweenable ones
export type NumericParam = { [K in keyof EffectConfig]: EffectConfig[K] extends number ? K : never }[keyof EffectConfig];

// A declarative property tween, part of a preset. Timing defaults anchor to
// the effect's phases — on 'play' it runs across the resolve sweep (rays done
// -> last shard textured), on 'move' across the whole dock — and can be
// overridden with literal seconds. The property snaps back to its RESTING
// value on every replay: the preset value, or whatever the GUI last set it to
// (GUI edits become the new rest, so tweens follow the panel). `to` is an
// absolute target; `toScale` is a multiple of the resting value and should be
// preferred, since it keeps working when the rest is retuned.
export interface TweenSpec {
    on: 'play' | 'move';
    prop: NumericParam;
    to?: number;
    toScale?: number;
    delay?: number;
    duration?: number;
    ease?: string;
}

// a preset: config values + optional choreography over them
export interface Preset {
    config: Partial<EffectConfig>;
    tweens?: TweenSpec[];
}
