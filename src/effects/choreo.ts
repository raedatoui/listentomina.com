// Interprets a preset's TweenSpec list: binds GSAP tweens of the live params
// to the effect's play/move events. The engine re-reads every param each
// frame, so a tween is just a timed mutation.
//
// Each tweened prop has a RESTING value — initially the preset's, replaced by
// whatever the GUI last set (via setRest). Replays reset to it and `toScale`
// targets multiply it, so the whole choreography follows the panel instead of
// fighting it.

import gsap from 'gsap';
import type { EffectConfig, LiveParams, NumericParam, TweenSpec } from '@/effects/config';
import { deriveTimeline } from '@/effects/frame';

// structural slice of MinaEffect (avoids importing the engine module)
interface TweenTarget {
    params: LiveParams;
    onPlay?: () => void;
    onMove?: () => void;
}

export interface PresetChoreo {
    dispose(): void;
    /** a GUI edit — if the prop is tweened, the value becomes its new resting value */
    setRest(prop: keyof EffectConfig, value: number): void;
}

export function bindPresetTweens(effect: TweenTarget, tweens: TweenSpec[] | undefined, base: EffectConfig): PresetChoreo {
    const p = effect.params;
    const dispose = () => {
        effect.onPlay = undefined;
        effect.onMove = undefined;
        gsap.killTweensOf(p);
    };
    if (!tweens?.length) {
        dispose();
        return { dispose, setRest: () => {} };
    }
    const rest = new Map<NumericParam, number>();
    for (const t of tweens) if (!rest.has(t.prop)) rest.set(t.prop, base[t.prop]);
    const restOf = (prop: NumericParam) => rest.get(prop) ?? base[prop]; // every tweened prop is seeded above
    const target = (t: TweenSpec) => {
        const r = restOf(t.prop);
        return t.toScale != null ? r * t.toScale : (t.to ?? r);
    };
    const plays = tweens.filter((t) => t.on === 'play');
    const moves = tweens.filter((t) => t.on === 'move');

    effect.onPlay = () => {
        gsap.killTweensOf(p);
        for (const t of tweens) p[t.prop] = restOf(t.prop); // replays start from the resting values
        // the engine's derived timeline (frame.ts): rays are done at growSpan,
        // the last shard is fully textured at handoffAt — the default play
        // window is that resolution sweep, in seconds of the progress clock
        const { growSpan, handoffAt } = deriveTimeline(p);
        const growEnd = growSpan * p.duration;
        const handoff = handoffAt * p.duration;
        for (const t of plays) {
            gsap.to(p, {
                [t.prop]: target(t),
                delay: t.delay ?? growEnd,
                duration: t.duration ?? Math.max(0.1, handoff - growEnd),
                ease: t.ease ?? 'sine.inOut',
            });
        }
    };
    effect.onMove = () => {
        gsap.killTweensOf(p);
        for (const t of moves) {
            gsap.to(p, {
                [t.prop]: target(t),
                delay: t.delay ?? 0,
                duration: t.duration ?? p.moveDur,
                ease: t.ease ?? 'power1.inOut',
            });
        }
    };
    return {
        dispose,
        setRest(prop, value) {
            if (!rest.has(prop as NumericParam)) return;
            rest.set(prop as NumericParam, value);
            gsap.killTweensOf(p, prop as string); // the user's hand beats an in-flight tween
        },
    };
}
