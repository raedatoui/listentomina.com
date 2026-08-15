import { Montserrat } from 'next/font/google';
import localFont from 'next/font/local';
import Head from 'next/head';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { MinaEffect } from '@/effects/effect';
import { artSide } from '@/effects/texture';
import styles from '@/styles/Effects.module.css';

const montserrat = Montserrat({ subsets: ['latin'], weight: ['300', '600', '700', '800'] });
const lovelo = localFont({ src: '../../public/fonts/Lovelo-Black.woff' });

// auto_play stays OFF in the URL: the widget mounts (and buffers) from page
// load, and playback is triggered through the Widget API exactly when the
// flip starts — a URL auto_play would fire on iframe load instead, and a
// blocked attempt would leave the player dead.
const SC_SRC =
    'https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/playlists/soundcloud%3Aplaylists%3A2199235493%3Fsecret_token%3Ds-Gub7SsORtyC&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=true&visual=true';

// the lil-gui tuning panel, off by default — build (or run dev) with
// NEXT_PUBLIC_EFFECTS_GUI=true to get it back; inlined at build time
const SHOW_GUI = process.env.NEXT_PUBLIC_EFFECTS_GUI === 'true';

// the five store links from the homepage's Listen section, same icons, plus
// Instagram from the Follow section
const STORES = [
    {
        href: 'https://open.spotify.com/artist/4rm1J2o7smuSY3jxoqMLPI?si=2T6cae2aSNyqCVCrbZrQXw',
        src: '/images/spotify-sm.png',
        alt: 'spotify',
        width: 40,
        height: 40,
    },
    { href: 'https://music.apple.com/us/artist/mina/1711234446', src: '/images/apple.png', alt: 'apple', width: 40, height: 40 },
    { href: 'https://soundcloud.com/listentomina', src: '/images/soundcloud.png', alt: 'soundcloud', width: 60, height: 40 },
    { href: 'https://www.youtube.com/@ListentoMina', src: '/images/youtube.png', alt: 'youtube', width: 57, height: 40 },
    { href: 'https://www.deezer.com/us/artist/253963612?host=0&deferredFl=1', src: '/images/deezer.jpg', alt: 'deezer', width: 40, height: 40 },
    { href: 'https://www.instagram.com/listentomina', src: '/images/insta.png', alt: 'instagram', width: 40, height: 40 },
];

interface SCWidget {
    play(): void;
    pause(): void;
    bind(event: string, cb: () => void): void;
}
interface SCApi {
    Widget: ((el: HTMLIFrameElement) => SCWidget) & { Events: { READY: string } };
}

// load SoundCloud's widget API (once) and hand back a ready widget for the iframe
function loadWidget(iframe: HTMLIFrameElement): Promise<SCWidget> {
    return new Promise((resolve, reject) => {
        const make = () => {
            const sc = (window as unknown as { SC?: SCApi }).SC;
            if (!sc) {
                reject(new Error('SoundCloud widget API missing'));
                return;
            }
            const widget = sc.Widget(iframe);
            widget.bind(sc.Widget.Events.READY, () => resolve(widget));
        };
        if ((window as unknown as { SC?: SCApi }).SC) {
            make();
            return;
        }
        const s = document.createElement('script');
        s.src = 'https://w.soundcloud.com/player/api.js';
        s.onload = make;
        s.onerror = () => reject(new Error('SoundCloud widget API failed to load'));
        document.head.appendChild(s);
    });
}

// Which intro a visitor actually got, as its own GA4 event name so it shows up
// in Reports → Engagement → Events with no custom-dimension setup. 'intro_lost'
// is its own event rather than another 'intro_static' so a GPU dying mid-run
// stays distinguishable from a browser that never had one. gtag is loaded
// `afterInteractive` in _document.tsx and the engine can win that race, so
// retry briefly (bounded at ~5s) rather than dropping the sample.
type IntroEvent = 'intro_webgpu' | 'intro_webgl2' | 'intro_static' | 'intro_lost';

function track(event: IntroEvent) {
    let tries = 0;
    const send = () => {
        const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
        if (gtag) {
            gtag('event', event);
            return;
        }
        if (++tries < 20) setTimeout(send, 250);
    };
    send();
}

// `withKeys` arms the engine's R / M / H shortcuts — on at /effects (tuning),
// off at the homepage, which renders this same component (see index.tsx)
export default function Effects({ withKeys = true }: { withKeys?: boolean }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const bgRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const veilRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<HTMLIFrameElement>(null);
    const [ready, setReady] = useState(false);
    const [fallback, setFallback] = useState(false);
    const [showTitle, setShowTitle] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        let effect: MinaEffect | null = null;
        let disposed = false;
        let tl: { kill(): void } | null = null;
        let widget: SCWidget | null = null;
        let unplaceDock: (() => void) | null = null;
        // the player buffers behind the scenes while the intro runs
        if (playerRef.current) {
            loadWidget(playerRef.current).then(
                (w) => {
                    if (!disposed) widget = w;
                },
                (err) => console.warn(err) // flip still happens; the player shows its own ▶
            );
        }
        // No GPU backend started — or one died mid-run: no mark drawing, no
        // shards. The artwork blooms straight in and flips to the player, and
        // the mark is a static PNG locked where the engine would have docked it
        // (.markLock in the CSS). `reduced` collapses the travel to nothing for
        // prefers-reduced-motion: identical end state, no motion to get there.
        const runFallback = (gsap: typeof import('gsap').gsap, event: IntroEvent = 'intro_static', reduced = false) => {
            if (disposed) return;
            track(event);
            setFallback(true);
            setReady(true); // lift the preroll — the page is still black underneath
            setShowTitle(true);
            const bg = bgRef.current;
            const card = cardRef.current;
            const veil = veilRef.current;
            if (!bg || !card || !veil) return;
            tl?.kill(); // a finale may already be running if the GPU died mid-sequence
            // same shape as finale(), just slower and from a cold start: the
            // artwork blooms centre-out as the white veil burns off, then the
            // cover flips over into the player
            const k = reduced ? 0 : 1;
            tl = gsap
                .timeline()
                .to(bg, { opacity: 1, duration: 1.2 * k, ease: 'power1.out' }, 0)
                .to(bg, { maskSize: '350% 350%', webkitMaskSize: '350% 350%', duration: 1.8 * k, ease: 'power1.inOut' }, 0)
                .to(veil, { opacity: 0, duration: 1.8 * k, ease: 'power1.out' }, 0)
                .add(() => widget?.play(), reduced ? 0 : '+=0.5')
                .to(card, { rotationY: 180, duration: 0.8 * k, ease: 'power2.inOut' }, '<');
        };

        // Reduced motion: never start an engine at all. The intro is a
        // full-viewport shard storm ending in a 3D card flip — none of which
        // this visitor asked for — so take the static path with its own travel
        // zeroed. They still get the artwork, title, links and player.
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            void import('gsap').then(({ gsap }) => runFallback(gsap, 'intro_static', true));
            return () => {
                disposed = true;
                tl?.kill();
                widget?.pause();
            };
        }

        // Engine backends, best first: WebGPU, else a WebGL2 port of the same
        // sequence. The adapter probe runs BEFORE either module is imported, so
        // only one backend is ever downloaded and — more importantly — the
        // canvas stays untouched until the choice is made: a canvas can hold
        // exactly one context type, so a half-started WebGPU attempt would
        // poison the WebGL2 retry. If both fail, the catch runs the static path.
        type Engine = { event: 'intro_webgpu' | 'intro_webgl2'; create: (c: HTMLCanvasElement) => Promise<MinaEffect> };
        const pickEngine = async (): Promise<Engine> => {
            let gpuOK = false;
            if (navigator.gpu) {
                try {
                    gpuOK = !!(await navigator.gpu.requestAdapter());
                } catch (err) {
                    console.warn('WebGPU adapter probe failed:', err);
                }
            }
            if (gpuOK) {
                const m = await import('@/effects/effect');
                return { event: 'intro_webgpu', create: (c) => m.createMinaEffect(c, 'ephemeral', SHOW_GUI, withKeys) };
            }
            const m = await import('@/effects/effect-gl');
            return { event: 'intro_webgl2', create: (c) => m.createMinaEffectGL(c, 'ephemeral', SHOW_GUI, withKeys) };
        };
        // dynamic imports keep the engine (and lil-gui/gsap) out of the build-time render
        Promise.all([import('gsap'), pickEngine()])
            .then(([{ gsap }, engine]) =>
                engine.create(canvas).then((e) => {
                    if (disposed) {
                        e.destroy();
                        return;
                    }
                    track(engine.event); // the chosen backend really did start
                    effect = e;
                    // Portrait: the preset's upper-left dock clips at the edge and
                    // fights the artwork column — recentre the docked mark in the
                    // black band above the artwork square (min(80vw, 80vh),
                    // centred), horizontally centred and shrunk to fit the band.
                    // Landscape keeps the preset's corner. Re-applied on resize;
                    // the engine's own resize rebuild picks the new target up.
                    const presetDock = { s: e.params.logoScale2, x: e.params.logoX2, y: e.params.logoY2 };
                    const placeDock = () => {
                        const W = window.innerWidth;
                        const H = window.innerHeight;
                        if (H > W) {
                            // artwork's top edge as a viewport-height fraction (same square as texture.ts / --art-side)
                            const artTop = (H - artSide(W, H)) / (2 * H);
                            e.params.logoX2 = 0.5;
                            e.params.logoY2 = artTop / 2;
                            e.params.logoScale2 = Math.min(presetDock.s, artTop * 0.75);
                        } else {
                            e.params.logoScale2 = presetDock.s;
                            e.params.logoX2 = presetDock.x;
                            e.params.logoY2 = presetDock.y;
                        }
                    };
                    placeDock();
                    window.addEventListener('resize', placeDock);
                    unplaceDock = () => window.removeEventListener('resize', placeDock);
                    const bg = bgRef.current;
                    const card = cardRef.current;
                    const veil = veilRef.current;
                    // resting/hidden state — also the replay reset. It runs under
                    // the opaque shard layer (the mosaic is fully solid at
                    // progress 0), so the snap back is never seen; the music
                    // stops for the re-run.
                    const rest = () => {
                        tl?.kill();
                        tl = null;
                        widget?.pause();
                        if (!bg || !card || !veil) return;
                        gsap.set(bg, { opacity: 0, maskSize: '0% 0%', webkitMaskSize: '0% 0%' });
                        gsap.set(veil, { opacity: 1 });
                        gsap.set(card, { rotationY: 0 });
                    };
                    // the finale, all one timeline: centre-out bloom of the
                    // artwork (mask + opacity) while the white veil burns off,
                    // a short beat, then the cover flips over into the
                    // SoundCloud player, which starts as the flip begins
                    const finale = () => {
                        if (tl || !bg || !card || !veil) return;
                        tl = gsap
                            .timeline()
                            .to(bg, { opacity: 1, duration: 0.5, ease: 'power1.out' }, 0)
                            .to(bg, { maskSize: '350% 350%', webkitMaskSize: '350% 350%', duration: 1.3, ease: 'power1.inOut' }, 0)
                            .to(veil, { opacity: 0, duration: 1.3, ease: 'power1.out' }, 0)
                            .add(() => widget?.play(), '+=0.25')
                            .to(card, { rotationY: 180, duration: 0.8, ease: 'power2.inOut' }, '<');
                    };
                    e.onPhase = (phase) => {
                        if (disposed) return;
                        if (phase === 'lost') {
                            // the GPU went away and the engine halted itself —
                            // the canvas is blank now, so finish without it
                            runFallback(gsap, 'intro_lost');
                            return;
                        }
                        if (phase === 'play') rest(); // re-arm on every replay
                        // 'docked' is the fallback for the GUI's move scrub, which never fires 'move'
                        if (phase === 'move' || phase === 'docked') finale();
                        if (phase === 'docked') setShowTitle(true); // sticky — shards cover it on replays
                    };
                    return e.firstFrame.then(() => {
                        if (!disposed) setReady(true);
                    });
                })
            )
            .catch((err) => {
                console.warn(err);
                // gsap resolves from the module cache here (it always loads)
                import('gsap').then(({ gsap }) => runFallback(gsap));
            });
        return () => {
            disposed = true;
            tl?.kill();
            widget?.pause();
            unplaceDock?.();
            effect?.destroy();
        };
    }, [withKeys]);

    return (
        <>
            <Head>
                <title>MINA — The Ephemeral Trail</title>
                <meta name="description" content="The Ephemeral Trail — a new release from MINA" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <meta property="og:title" content="MINA — The Ephemeral Trail" />
                <meta property="og:description" content="The Ephemeral Trail — a new release from MINA" />
                <meta property="og:url" content="https://listentomina.com/" />
                <meta property="og:type" content="website" />
                <meta property="og:image" content="https://listentomina.com/favicon.jpg" />
                <meta property="og:image:type" content="image/jpeg" />
                <meta property="og:image:width" content="720" />
                <meta property="og:image:height" content="720" />
                <meta property="og:image:alt" content="MINA — The Ephemeral Trail" />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:image" content="https://listentomina.com/favicon.jpg" />
            </Head>
            <main className={`${montserrat.className} ${styles.page}`}>
                <div ref={bgRef} className={styles.bg}>
                    <div ref={cardRef} className={styles.card}>
                        <div className={`${styles.cardFace} ${styles.cardFront}`}>
                            <div ref={veilRef} className={styles.bgVeil} />
                        </div>
                        <div className={`${styles.cardFace} ${styles.cardBack}`}>
                            <iframe
                                ref={playerRef}
                                title="The Ephemeral Trail on SoundCloud"
                                className={styles.scPlayer}
                                scrolling="no"
                                allow="autoplay; encrypted-media"
                                src={SC_SRC}
                            />
                            <div className={styles.scCredit}>
                                <a href="https://soundcloud.com/listentomina" title="Mina" target="_blank" rel="noreferrer">
                                    Mina
                                </a>
                                {' · '}
                                <a
                                    href="https://soundcloud.com/listentomina/sets/the-ephemeral-trail/s-Gub7SsORtyC"
                                    title="The Ephemeral Trail"
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    The Ephemeral Trail
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
                <h1 className={`${lovelo.className} ${styles.title} ${showTitle ? styles.titleShown : ''}`}>The Ephemeral Trail</h1>
                <div className={`${styles.stores} ${showTitle ? styles.storesShown : ''}`}>
                    {STORES.map((l) => (
                        <a key={l.alt} href={l.href} target="_blank" rel="noreferrer">
                            <Image className={styles.storeIcon} src={l.src} alt={l.alt} width={l.width} height={l.height} />
                        </a>
                    ))}
                </div>
                <canvas ref={canvasRef} className={styles.gpu} />
                <div className={`${styles.preroll} ${ready ? styles.gone : ''}`} />
                {fallback && <Image className={styles.markLock} src="/images/Mina Symbol_White.png" alt="MINA" width={578} height={1104} priority />}
            </main>
        </>
    );
}

Effects.standalone = true;
