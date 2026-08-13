import { Montserrat } from 'next/font/google';
import localFont from 'next/font/local';
import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';
import type { MinaEffect } from '@/effects/effect';
import styles from '@/styles/Effects.module.css';

const montserrat = Montserrat({ subsets: ['latin'], weight: ['300', '600', '700', '800'] });
const lovelo = localFont({ src: '../../public/fonts/Lovelo-Black.woff' });

export default function Effects() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [ready, setReady] = useState(false);
    const [unsupported, setUnsupported] = useState(false);
    const [showTitle, setShowTitle] = useState(false);
    const [showBg, setShowBg] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        let effect: MinaEffect | null = null;
        let disposed = false;
        // dynamic import keeps the WebGPU engine (and lil-gui/gsap) out of the build-time render
        import('@/effects/effect')
            .then((m) => m.createMinaEffect(canvas, 'ephemeral'))
            .then((e) => {
                if (disposed) {
                    e.destroy();
                    return;
                }
                effect = e;
                // sticky: once shown, the artwork and title stay — during replays
                // the opaque shard layer covers them anyway, so hiding them here
                // only causes spurious fade-outs. The artwork starts fading the
                // moment the dock begins; the title waits for it to finish.
                e.onPhase = (phase) => {
                    if (disposed) return;
                    if (phase === 'move' || phase === 'docked') setShowBg(true);
                    if (phase === 'docked') setShowTitle(true);
                };
                return e.firstFrame.then(() => {
                    if (!disposed) setReady(true);
                });
            })
            .catch((err) => {
                console.error(err);
                if (!disposed) {
                    setUnsupported(true);
                    setReady(true);
                }
            });
        return () => {
            disposed = true;
            effect?.destroy();
        };
    }, []);

    return (
        <>
            <Head>
                <title>MINA — The Ephemeral Trail</title>
                <meta name="description" content="The Ephemeral Trail — a new release from MINA" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>
            <main className={`${montserrat.className} ${styles.page}`}>
                <div className={`${styles.bg} ${showBg ? styles.bgShown : ''}`} />
                <h1 className={`${lovelo.className} ${styles.title} ${showTitle ? styles.titleShown : ''}`}>The Ephemeral Trail</h1>
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

Effects.standalone = true;
