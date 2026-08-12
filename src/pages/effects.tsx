import { Montserrat } from 'next/font/google';
import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';
import type { MinaEffect } from '@/effects/effect';
import styles from '@/styles/Effects.module.css';

const montserrat = Montserrat({ subsets: ['latin'], weight: ['300', '600', '700', '800'] });

export default function Effects() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [ready, setReady] = useState(false);
    const [unsupported, setUnsupported] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        let effect: MinaEffect | null = null;
        let disposed = false;
        // dynamic import keeps the WebGPU engine (and lil-gui) out of the build-time render
        import('@/effects/effect')
            .then((m) => m.createMinaEffect(canvas))
            .then((e) => {
                if (disposed) {
                    e.destroy();
                    return;
                }
                effect = e;
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
                <title>MINA — WebGPU line effects</title>
                <meta name="description" content="MINA × Interval — WebGPU line effects" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>
            <main className={`${montserrat.className} ${styles.page}`}>
                <div className={styles.bg} />
                <canvas ref={canvasRef} className={styles.gpu} />
                <div className={`${styles.preroll} ${ready ? styles.gone : ''}`} />
                <div className={styles.brand}>
                    <b>MINA</b> × Interval — wgpu/05 · line effects
                </div>
                <div className={styles.hint}>
                    press <b>R</b> to replay · <b>M</b> to move · <b>H</b> hides panel
                </div>
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
