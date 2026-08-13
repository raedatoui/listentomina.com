# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Static promo site for Mina (listentomina.com), a Brooklyn-based dream-pop artist. Next.js 16 **Pages Router** with `output: 'export'` — the whole site is statically exported to `out/`. There is no server runtime: no API routes, no image optimization (`images.unoptimized`).

## Commands

pnpm, Node >= 22.

`public/` (fonts, cover art, images, favicons) is required but gitignored — its contents come from a zip on Google Drive, unzipped and staged as `public/` before dev or build. Don't treat the missing directory as broken or recreate assets.

- `pnpm dev` — dev server at localhost:3000
- `pnpm build` — static export to `out/`
- `pnpm lint` — Biome lint
- `pnpm check` — Biome lint + format with auto-fix (`pnpm format` for formatting only)
- Deploy: `pnpm build && firebase deploy` (Firebase Hosting site `listentomina`, serves `out/`).

No test suite.

## Architecture

- `src/pages/_app.tsx` wraps every page in the site shell (Lovelo font, logo header, "jejune moon" footer) **unless** the page component has a static `standalone = true` property (e.g. `index.tsx`, `saveme.tsx`) — standalone pages render bare and own their full layout.
- The release catalog is hardcoded at the top of `src/components/releases.tsx`. Each entry's `trackId` is a SoundCloud track id (or playlist id when `isPlaylist: true`) used for the embedded player; `adSupported: true` disables autoplay. Cover `name` may contain `<br />` (rendered via `dangerouslySetInnerHTML`). Cover art lives in `public/images/covers/`.
- Single-release pages (`ride.tsx`, `disobey.tsx`, `wanted.tsx`) are thin wrappers: hardcoded `cover` + `links` data passed to the shared `src/components/single.tsx`.
- `index2.tsx` is the previous homepage layout, kept alongside the hero-styled `index.tsx`.
- Styling is plain CSS Modules in `src/styles/` (one file per page/section). No Tailwind — `components.json` is a leftover shadcn config, not wired up.
- Fonts: Lovelo via `next/font/local` from `public/fonts/` (re-declared per standalone page), Montserrat via `next/font/google`.

## /effects — WebGPU intro (The Ephemeral Trail announcement)

`src/pages/effects.tsx` is a standalone page hosting a WebGPU animation announcing the "Ephemeral Trail" release: the MINA mark draws itself as lines, its extended lines shatter the viewport into shards that resolve to the cover art, the shard layer hands off invisibly to the real page, then the mark docks to the upper left and the h1 fades in. Ported from the `apps/mina-neweffects` prototype (kept untouched as reference). The page dynamic-imports the engine in a `useEffect` and boots the `ephemeral` preset.

### Module layout (`src/effects/`)

- `effect.ts` — the stateful engine: `createMinaEffect(canvas, preset?)` → device, pipelines, render loop, move state machine. `destroy()` is mandatory (reactStrictMode double-mounts). Keys: R replay · M move · H hide panel — they fire even while typing in GUI fields.
- `layout.ts` — pure geometry, no GPU/DOM: `buildLayout` (collinear line merge → greedy growth graph → convex cell split → union-find shard merge), `buildMovePlan`. All colours are baked here at build time via `getImageData`.
- `texture.ts` — the `TextureSource` seam: fits a static image into a viewport-sized canvas (GPU texture + per-point colour sampler). Live-HTML rasterization was deliberately decoupled; restoring it means producing another TextureSource, nothing else changes.
- `shaders/*.ts` — WGSL strings (mosaic shards, line ribbons, dots, bloom post-chain).
- `config.ts` — `EffectConfig` (every tunable), `BASE`, `LiveParams` (config + transient scrubs), `TweenSpec`/`Preset` types.
- `presets/` — named `Preset` objects: `config` values + optional declarative `tweens`. Authoring loop: tune in the GUI → "copy preset" (clipboard + console) → paste as a new file → register in `presets/index.ts`. No localStorage anywhere.
- `gui.ts` — lil-gui panel with the preset dropdown; switching presets re-applies config over BASE, rebinds tweens, reloads the texture if it changed.
- `choreo.ts` — GSAP interpreter for a preset's `tweens`, bound to the engine's play/move events; default tween windows anchor to the derived timeline (the resolve sweep on play, the whole dock on move).

### Invariants that will bite

- **The handoff trick**: the shard layer fades out onto the page behind it and must land pixel-identical. The texture draw (`texture.ts`, square fit = 0.8 × the viewport's short edge) and the page CSS (`Effects.module.css` `.bg`, `background-size: min(80vw, 80vh)`) MUST stay in sync — each carries a comment pointing at the other.
- The engine re-reads every param each frame, so tweening = mutating `effect.params` over time (that's the whole GSAP integration). But geometry params (`logoScale/X/Y`, `density`, `stagger`, `maxRays`) only apply via a rebuild — the GUI sets `cellsDirty`; direct mutation doesn't.
- Timeline math: the mark-drawing phase's wall-clock share is `duration / (1 + whiteDur + colorDur + texDur + hold)`. "Fast draw, slow reveal" is tuned by weighting the reveal stages, not by `duration` alone.
- Colours (shard flash via `flashTint`, per-segment via `lineTint`, dots) are sampled at build time through `accentColor` — hue kept, brightness lifted; hueless near-black falls back to white for dots and to the configured line colour for segments. The docked mark ends white *because it docks over the black margin*; dock it over the artwork and it colourises.
- `onPlay`/`onMove` on the engine handle are claimed by preset tweens — pages listen on `onPhase` (`'play' | 'move' | 'docked'`). The h1 reveal is a sticky `'docked'` listener (hiding it on replay causes spurious fade-outs; the shard layer covers it anyway).
- Uniforms take CSS px; the canvas backing store is dpr-scaled (cap 2). All blending premultiplied. `MAX_LINE_INST = 96` — overflow is silently dropped.
- TS specifics: `@webgpu/types` via `src/types/webgpu.d.ts`; `target: ES2017` exists for the layout code's Map iteration (type-check only — SWC ignores it); arrays fed to `writeBuffer` need `Float32Array<ArrayBuffer>` annotations, and null-narrowing doesn't reach hoisted functions (hence the guard style around device/context init).

## Routing / deploy coupling

Clean URLs come from explicit rewrites in `firebase.json` (`/saveme` → `/saveme.html`, etc.), with a catch-all to `/index.html`. Adding a new page requires adding a matching rewrite in `firebase.json`, otherwise its clean URL silently falls through to the homepage.

## Code style

Biome-enforced: 4-space indent, single quotes, semicolons, line width 150.
