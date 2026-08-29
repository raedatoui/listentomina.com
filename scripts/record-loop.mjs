// Deterministic frame-by-frame export of /loop to a seamless 4K60 mp4.
// Usage: `pnpm dev` in one terminal, `pnpm record:loop` in another.
// Flags (defaults reproduce the landscape 4K capture byte for byte):
//   --mode=glass      click a shader-mode chip before the warm-up
//   --size=540x1170   CSS viewport; the backing store (= the mp4) is 2x this
//   --scale=0.7       override logoScale (the mark is sized off viewport HEIGHT,
//                     so a portrait frame wants less than the preset's 0.95)
//   --out=loop-glass  basename under capture/ (frames go to capture/frames-<name>/)
// Needs ffmpeg on PATH; opens a headful Chrome window for the capture
// (headless Chrome is still flaky about WebGPU). Output: capture/loop.mp4,
// with the lossless PNG frames left in capture/frames/ for re-encodes.
//
// How: hijacks performance.now/Date.now/rAF with a virtual clock stepped at
// exactly 1/60s per frame, so GSAP (the page's progress timeline) and the
// engine's dt-driven bloom low-pass render identically no matter how slow the
// readback is. Skips the cold-start cycles (the bloom's motion-energy filter
// starts at zero and needs a few cycles to settle into its periodic orbit),
// then grabs exactly one breath — any steady-state window of that length loops.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

// --k=v flags, no dependency: everything has a default that keeps the legacy run
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const MODE = arg('mode', ''); // '' = leave the page in its boot mode ('lines')
const [VW, VH] = arg('size', '1920x1080').split('x').map(Number);
const SCALE = Number(arg('scale', 0)); // 0 = keep the preset's logoScale
let patched = 0; // --scale rewrites this many chunk occurrences
const NAME = arg('out', 'loop');

const URL = 'http://localhost:3000/loop';
const FPS = 60;
const CYCLE_S = 5.5; // DRAW 2.2 + PEAK 1.0 + UNDRAW 1.8 + DARK 0.5 (loop.tsx)
const FRAMES = Math.round(CYCLE_S * FPS);
const SKIP = Math.ceil((0.4 + 3 * CYCLE_S) * FPS); // timeline delay + 3 warmup cycles
const DT = 1000 / FPS;
const CAPTURE = path.join(import.meta.dirname, '..', 'capture');
const FRAMES_DIR = path.join(CAPTURE, NAME === 'loop' ? 'frames' : `frames-${NAME}`);
const MP4 = path.join(CAPTURE, `${NAME}.mp4`);

const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false,
    args: ['--enable-unsafe-webgpu', '--no-first-run', '--hide-crash-restore-bubble'],
    defaultViewport: { width: VW, height: VH, deviceScaleFactor: 2 }, // engine caps dpr at 2 -> the backing store is exactly 2x
});

try {
    const page = await browser.newPage();

    // Must be installed before any page script runs: gsap and the engine both
    // read performance.now / rAF at load time.
    await page.evaluateOnNewDocument(() => {
        const epoch = Date.now();
        let vnow = 0;
        let nextId = 1;
        let queue = new Map();
        performance.now = () => vnow;
        Date.now = () => epoch + vnow; // gsap falls back to Date.now in places
        window.requestAnimationFrame = (cb) => {
            const id = nextId++;
            queue.set(id, cb);
            return id;
        };
        window.cancelAnimationFrame = (id) => queue.delete(id);
        window.__tick = (dt) => {
            vnow += dt;
            const cbs = [...queue.values()];
            queue = new Map();
            for (const cb of cbs) cb(vnow);
        };
    });

    // --scale has to land before any page script runs: logoScale is read only
    // when the engine rebuilds its layout (behind a private cellsDirty), so
    // there is no way to set it from out here at runtime. Rewriting it in the
    // served dev chunks instead means the very first layout is already built at
    // the new scale — nothing to trigger, nothing to warm up twice. The colon in
    // the pattern is what keeps logoScale2 (the dock placement) out of it.
    if (SCALE) {
        await page.setRequestInterception(true);
        page.on('request', async (req) => {
            const u = req.url();
            if (!u.startsWith(new global.URL(URL).origin) || !new global.URL(u).pathname.endsWith('.js')) return req.continue();
            try {
                const res = await fetch(u);
                const body = (await res.text()).replace(/logoScale:\s*[\d.]+/g, () => {
                    patched++;
                    return `logoScale: ${SCALE}`;
                });
                await req.respond({ status: res.status, contentType: res.headers.get('content-type') ?? 'application/javascript', body });
            } catch {
                await req.continue();
            }
        });
    }

    await page.goto(URL, { waitUntil: 'domcontentloaded' });

    // Boot: the engine's preroll frames are rAF-driven, so tick until the page
    // drops its cover (Loop.module.css `gone` class lands on the preroll div).
    const bootStart = performance.now();
    for (;;) {
        const ready = await page.evaluate(() => {
            window.__tick(1000 / 60);
            const pre = document.querySelector('div[class*="preroll"]');
            const fail = document.querySelector('div[class*="fallback"]');
            if (fail) return 'fail';
            return pre?.className.includes('gone') ?? false;
        });
        if (ready === 'fail') throw new Error('page showed the WebGPU-unavailable fallback');
        if (ready) break;
        if (performance.now() - bootStart > 30000) throw new Error('timed out waiting for the effect to boot');
        await new Promise((r) => setTimeout(r, 10));
    }
    // Chip click, not a digit key: the label is the authority on which mode is
    // which. It resets progress to 0 and rebuilds the breath, so it must land
    // before the warm-up — SKIP covers the new timeline's 0.4 s delay.
    if (MODE) {
        const hit = await page.evaluate((label) => {
            const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.endsWith(` ${label}`));
            btn?.click();
            return !!btn;
        }, MODE);
        if (!hit) throw new Error(`no shader-mode chip labelled "${MODE}"`);
        console.log('switched to %s', MODE);
    }

    if (SCALE && !patched) throw new Error('--scale matched no logoScale in the served chunks (minified build?)');
    if (SCALE) console.log('logoScale %s (%d occurrences patched)', SCALE, patched);

    console.log('booted, warming up %d frames…', SKIP);

    for (let done = 0; done < SKIP; done += 20) {
        const n = Math.min(20, SKIP - done);
        await page.evaluate(
            (n, dt) => {
                for (let i = 0; i < n; i++) window.__tick(dt);
            },
            n,
            DT
        );
    }

    console.log('capturing %d frames at %dfps…', FRAMES, FPS);
    fs.rmSync(FRAMES_DIR, { recursive: true, force: true }); // stale frames would leak into ffmpeg's sequence
    fs.mkdirSync(FRAMES_DIR, { recursive: true });
    for (let i = 0; i < FRAMES; i++) {
        // tick + readback in one task, so toDataURL sees exactly this frame
        const dataUrl = await page.evaluate((dt) => {
            window.__tick(dt);
            return document.querySelector('canvas').toDataURL('image/png');
        }, DT);
        const png = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
        fs.writeFileSync(path.join(FRAMES_DIR, `frame_${String(i).padStart(4, '0')}.png`), png);
        if (i % 30 === 0) console.log('  %d/%d', i, FRAMES);
    }
} finally {
    await browser.close();
}

console.log('encoding %s…', MP4);
execFileSync(
    'ffmpeg',
    // biome-ignore format: one arg pair per line reads worse than this
    ['-y', '-loglevel', 'error', '-stats', '-framerate', String(FPS), '-i', path.join(FRAMES_DIR, 'frame_%04d.png'),
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
        '-movflags', '+faststart', MP4],
    { stdio: 'inherit' }
);
console.log('done: %s (%d frames, %ss seamless loop)', MP4, FRAMES, CYCLE_S);
