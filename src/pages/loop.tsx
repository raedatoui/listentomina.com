import { Montserrat } from 'next/font/google';
import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';
import type { MinaEffect } from '@/effects/effect';
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

export default function Loop() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [ready, setReady] = useState(false);
    const [unsupported, setUnsupported] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        let effect: MinaEffect | null = null;
        let disposed = false;
        let tl: { kill(): void } | null = null;
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
                    effect = e;
                    return e.firstFrame.then(() => {
                        if (disposed) return;
                        setReady(true);
                        // The endless breath. `progress` is safe to own — autoplay
                        // is off, so the engine's clock never writes it. At the
                        // peak, progress rests at 1 while the width breathes once
                        // and the bloom swells on its own as the low-passed motion
                        // energy settles.
                        tl = gsap
                            .timeline({ repeat: -1, repeatDelay: DARK, delay: 0.4 })
                            .to(e.params, { progress: 1, duration: DRAW, ease: 'sine.inOut' })
                            .to(e.params, { lineWidth: 6, duration: PEAK / 2, ease: 'sine.inOut', yoyo: true, repeat: 1 })
                            .to(e.params, { progress: 0, duration: UNDRAW, ease: 'sine.inOut' });
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
        return () => {
            disposed = true;
            tl?.kill();
            effect?.destroy(); // its choreo.dispose -> killTweensOf(params) backstops the kill
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
