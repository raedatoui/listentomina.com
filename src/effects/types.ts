// The API line between the two backends. `webgpu/effect.ts` and
// `webgl2/effect.ts` are separate engines that share everything above this
// handle — layout, texture, frame math, presets, choreo — and nothing below
// it. Pages hold a `MinaEffect` without knowing which one built it.

import type { LiveParams } from '@/effects/config';

export interface MinaEffect {
    play(): void;
    move(): void;
    /** reset the ink mode's reaction-diffusion state (it re-clears on the next ink frame) */
    clearInk(): void;
    /** resolves once the shard layer is actually painting (lift any pre-roll cover) */
    firstFrame: Promise<void>;
    destroy(): void;
    /** the live parameter object the render loop reads every frame — mutate/tween freely */
    params: LiveParams;
    /** fired whenever the reveal (re)starts — autoplay, R key, GUI ▶ (claimed by preset tweens) */
    onPlay?: () => void;
    /** fired whenever the dock move actually starts — auto-move, M key, GUI ⇄ (claimed by preset tweens) */
    onMove?: () => void;
    /**
     * page-facing sequence events: 'play' (reveal restarted), 'move' (dock started),
     * 'docked' (dock finished), 'lost' (the GPU went away — the engine has halted
     * itself and the page must finish the sequence without it)
     */
    onPhase?: (phase: 'play' | 'move' | 'docked' | 'lost') => void;
}
