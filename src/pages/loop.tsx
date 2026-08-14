import { Montserrat } from 'next/font/google';
import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';
import type { ShaderMode } from '@/effects/config';
import type { MinaEffect } from '@/effects/effect';
import { applyLoopMode, LOOP_MODES } from '@/effects/loopModes';
import styles from '@/styles/Loop.module.css';

const montserrat = Montserrat({ subsets: ['latin'], weight: ['300', '700'] });

// the lil-gui tuning panel, off by default — build (or run dev) with
// NEXT_PUBLIC_EFFECTS_GUI=true to get it back; inlined at build time
const SHOW_GUI = process.env.NEXT_PUBLIC_EFFECTS_GUI === 'true';

// one breath of the loop, in seconds (the preset's `duration` is inert here —
// the page owns the progress clock)
const DRAW = 2.2; // lines ray in, progress 0 -> 1
const PEAK = 1.0; // hold at full draw: motion energy decays, so bloomIdle > 1 swells the glow
const UNDRAW = 1.8; // lines retract, progress 1 -> 0
const DARK = 0.5; // black beat before the next cycle

// loose handles for the dynamically imported gsap — the same spirit as the old
// `{ kill(): void }` timeline ref, so no top-level gsap import creeps in
interface LoopTimeline {
    to(target: object, vars: object): LoopTimeline;
    kill(): void;
}
interface Gsap {
    timeline(vars: object): LoopTimeline;
    killTweensOf(target: object): void;
}

// The endless breath. `progress` is safe to own — autoplay is off, so the
// engine's clock never writes it. At the peak, progress rests at 1 while the
// width breathes once and the bloom swells on its own as the low-passed motion
// energy settles. peakLineWidth is the yoyo's absolute target (6 = the legacy value).
const buildTimeline = (gsap: Gsap, effect: MinaEffect, peakLineWidth: number) =>
    gsap
        .timeline({ repeat: -1, repeatDelay: DARK, delay: 0.4 })
        .to(effect.params, { progress: 1, duration: DRAW, ease: 'sine.inOut' })
        .to(effect.params, { lineWidth: peakLineWidth, duration: PEAK / 2, ease: 'sine.inOut', yoyo: true, repeat: 1 })
        .to(effect.params, { progress: 0, duration: UNDRAW, ease: 'sine.inOut' });

export default function Loop() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [ready, setReady] = useState(false);
    const [unsupported, setUnsupported] = useState(false);
    const [modeId, setModeId] = useState<ShaderMode>('lines');
    const [chipsIdle, setChipsIdle] = useState(false);
    const effectRef = useRef<MinaEffect | null>(null);
    const gsapRef = useRef<Gsap | null>(null);
    const tlRef = useRef<LoopTimeline | null>(null);
    const modeRef = useRef<ShaderMode>('lines');

    // kill first — a mid-flight PEAK yoyo would fight the bundle's lineWidth —
    // then restore-and-apply the bundle and rebuild the breath at its peak width
    const switchMode = (id: ShaderMode) => {
        const effect = effectRef.current;
        const gsap = gsapRef.current;
        if (!effect || !gsap || id === modeRef.current) return;
        tlRef.current?.kill();
        gsap.killTweensOf(effect.params);
        applyLoopMode(effect.params, id);
        const mode = LOOP_MODES.find((m) => m.id === id) ?? LOOP_MODES[0];
        tlRef.current = buildTimeline(gsap, effect, mode.peakLineWidth);
        modeRef.current = id;
        setModeId(id);
    };
    const switchModeRef = useRef(switchMode);
    switchModeRef.current = switchMode;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        let disposed = false;
        // dynamic imports keep the WebGPU engine (and lil-gui/gsap) out of the build-time render
        Promise.all([import('gsap'), import('@/effects/effect')])
            .then(([{ gsap }, m]) =>
                // keys off: R would hand `progress` back to the engine's clock
                // and M would dock — either permanently breaks the loop
                m.createMinaEffect(canvas, 'loop', SHOW_GUI, false).then((e) => {
                    if (disposed) {
                        e.destroy();
                        return;
                    }
                    effectRef.current = e;
                    gsapRef.current = gsap;
                    return e.firstFrame.then(() => {
                        if (disposed) return;
                        setReady(true);
                        // boot must render byte-identical to the legacy loop
                        // (record:loop compares it): no applyLoopMode here — the
                        // engine starts in 'lines' and these are the legacy tweens
                        tlRef.current = buildTimeline(gsap, e, LOOP_MODES[0].peakLineWidth);
                    });
                })
            )
            .catch((err) => {
                console.error(err);
                if (!disposed) {
                    setUnsupported(true);
                    setReady(true);
                }
            });
        // digit keys + chip idle fade live in this same effect so the
        // StrictMode double-mount cleanup stays airtight
        let idleTimer: number | undefined;
        const wake = () => {
            setChipsIdle(false);
            window.clearTimeout(idleTimer);
            idleTimer = window.setTimeout(() => setChipsIdle(true), 3000);
        };
        const onKey = (ev: KeyboardEvent) => {
            wake();
            const i = '123456789'.indexOf(ev.key);
            if (i !== -1) switchModeRef.current(LOOP_MODES[i].id);
        };
        window.addEventListener('pointermove', wake);
        window.addEventListener('keydown', onKey);
        wake();
        return () => {
            disposed = true;
            window.removeEventListener('pointermove', wake);
            window.removeEventListener('keydown', onKey);
            window.clearTimeout(idleTimer);
            tlRef.current?.kill();
            tlRef.current = null;
            effectRef.current?.destroy(); // its choreo.dispose -> killTweensOf(params) backstops the kill
            effectRef.current = null;
            gsapRef.current = null;
        };
    }, []);

    return (
        <>
            <Head>
                <title>MINA — Loop</title>
                <meta name="description" content="MINA — an endless line loop" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>
            <main className={`${montserrat.className} ${styles.page}`}>
                <canvas ref={canvasRef} className={styles.gpu} />
                <div className={`${styles.preroll} ${ready ? styles.gone : ''}`} />
                {ready && !unsupported && (
                    <div className={`${styles.modes} ${chipsIdle ? styles.modesIdle : ''}`}>
                        {LOOP_MODES.map((m, i) => (
                            <button
                                key={m.id}
                                type="button"
                                className={`${styles.chip} ${modeId === m.id ? styles.chipOn : ''}`}
                                aria-pressed={modeId === m.id}
                                onClick={() => switchMode(m.id)}
                            >
                                {`${i + 1} ${m.label}`}
                            </button>
                        ))}
                    </div>
                )}
                {unsupported && (
                    <div className={styles.fallback}>
                        <div>
                            <b>WebGPU unavailable</b>
                        </div>
                        <div>This demo needs a recent Chrome, Edge, or Safari with WebGPU enabled.</div>
                    </div>
                )}
            </main>
        </>
    );
}

Loop.standalone = true;
