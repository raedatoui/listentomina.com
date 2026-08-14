// /loop's shader-treatment bundles: one entry per ShaderMode, pairing the
// renderer with the config overrides that flatter it. Pure data + one applier —
// no GPU imports, so the page can pull this in at build time.

import { BASE, type EffectConfig, type LiveParams, type ShaderMode } from '@/effects/config';
import { loop } from '@/effects/presets/loop';

// keys a bundle may not touch: geometry params rebuild-gated by the engine's
// private cellsDirty, the texture reload path, and the clock the page owns
type LoopOverrides = Partial<
    Omit<
        EffectConfig,
        'logoScale' | 'logoX' | 'logoY' | 'density' | 'stagger' | 'maxRays' | 'textureUrl' | 'textureFit' | 'autoplay' | 'autoMove' | 'duration'
    >
>;

export interface LoopMode {
    id: ShaderMode;
    label: string;
    /** absolute lineWidth target of the timeline's PEAK yoyo (6 = the legacy value) */
    peakLineWidth: number;
    overrides: LoopOverrides;
}

// every bundle implicitly keeps hold: 0 from the loop base — never set it here
export const LOOP_MODES: LoopMode[] = [
    { id: 'lines', label: 'lines', peakLineWidth: 6, overrides: {} },
    { id: 'liquid', label: 'liquid', peakLineWidth: 8, overrides: { glow: 0.3, bloom: 1.2, bloomIdle: 1.6, lineWidth: 4 } },
    { id: 'ripples', label: 'ripples', peakLineWidth: 6, overrides: { bloom: 0.8, glow: 0.5 } },
    { id: 'neon', label: 'neon', peakLineWidth: 6, overrides: { lineH: 195, lineS: 80, bloom: 1.4, bloomRadius: 2.2 } },
    {
        id: 'shatter',
        label: 'shatter',
        peakLineWidth: 5,
        overrides: {
            whiteDur: 0.04,
            colorDur: 0.25,
            texDur: 0.6,
            whiteLevel: 0.25,
            colorSat: 1.1,
            colorBoost: 1.1,
            flashTint: 1,
            veil: 0,
            lineWidth: 3,
            dotStart: 0.5,
        },
    },
    {
        id: 'glass',
        label: 'glass',
        peakLineWidth: 6,
        overrides: {
            whiteDur: 0.05,
            colorDur: 0.4,
            texDur: 0.9,
            whiteLevel: 0.3,
            colorBoost: 1.15,
            flashTint: 1,
            veil: 0,
            lineWidth: 4,
            glow: 0.9,
            dotStart: 0.55,
        },
    },
    { id: 'particles', label: 'particles', peakLineWidth: 6, overrides: { bloom: 1.3, bloomIdle: 1.8, dotPulse: 2.5 } },
    { id: 'swarm', label: 'swarm', peakLineWidth: 6, overrides: { bloom: 1.2, bloomIdle: 1.5, dotPulse: 2 } },
    { id: 'ink', label: 'ink', peakLineWidth: 6, overrides: { glow: 0, bloom: 0.6, dotSize: 0.6 } },
];

// restores the full base loop config first (so switching AWAY from a mode
// undoes its overrides), then applies the bundle. progress resets so the new
// breath starts from black. Geometry keys are rewritten with identical values
// — harmless, the engine's cellsDirty is untouched.
export function applyLoopMode(params: LiveParams, id: ShaderMode): void {
    const mode = LOOP_MODES.find((m) => m.id === id) ?? LOOP_MODES[0];
    Object.assign(params, BASE, loop.config, mode.overrides);
    params.shaderMode = mode.id;
    params.progress = 0;
}
