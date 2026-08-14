// Deterministic frame-by-frame export of /loop to a seamless 4K60 mp4.
// Usage: `pnpm dev` in one terminal, `pnpm record:loop` in another.
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

const URL = 'http://localhost:3000/loop';
const FPS = 60;
const CYCLE_S = 5.5; // DRAW 2.2 + PEAK 1.0 + UNDRAW 1.8 + DARK 0.5 (loop.tsx)
const FRAMES = Math.round(CYCLE_S * FPS);
const SKIP = Math.ceil((0.4 + 3 * CYCLE_S) * FPS); // timeline delay + 3 warmup cycles
const DT = 1000 / FPS;
const CAPTURE = path.join(import.meta.dirname, '..', 'capture');
const FRAMES_DIR = path.join(CAPTURE, 'frames');
const MP4 = path.join(CAPTURE, 'loop.mp4');

const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: false,
    args: ['--enable-unsafe-webgpu', '--no-first-run', '--hide-crash-restore-bubble'],
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 2 }, // engine caps dpr at 2 -> 4K backing store
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
