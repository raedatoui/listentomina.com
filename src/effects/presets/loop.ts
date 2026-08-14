import type { Preset } from '@/effects/config';
import { ephemeral } from '@/effects/presets/ephemeral';

// /loop: the ephemeral look reduced to an endless breath. The page drives
// `progress` itself (autoplay off keeps the engine clock idle), the reveal
// stages are zeroed so progress 0..1 IS the line draw (growSpan = 1), and
// the permanently-opaque shard layer is forced pure black. No tweens: with
// none bound, nothing can gsap.killTweensOf(params) while the page's loop runs.
export const loop: Preset = {
    config: {
        ...ephemeral.config,
        autoplay: false,
        autoMove: false,
        whiteDur: 0,
        colorDur: 0,
        texDur: 0,
        hold: 0,
        whiteLevel: 0, // flash → black
        colorBoost: 0, // solid → black
        veil: 1, // texture never unveiled: shards stay pure black
        // ephemeral timed its dots for growSpan ≈ 0.29; retimed for growSpan = 1
        // so they land as the mark completes and melt away first on the undraw
        dotStart: 0.85,
        dotStagger: 0.04,
        dotGrow: 0.05,
    },
};
