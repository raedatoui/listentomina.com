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

- `src/pages/_app.tsx` wraps every page in the site shell (Lovelo font, logo header, "jejune moon" footer) **unless** the page component has a static `standalone = true` property (e.g. `catalog.tsx`, `saveme.tsx`) — standalone pages render bare and own their full layout.
- The release catalog is hardcoded at the top of `src/components/releases.tsx`. Each entry's `trackId` is a SoundCloud track id (or playlist id when `isPlaylist: true`) used for the embedded player; `adSupported: true` disables autoplay. Cover `name` may contain `<br />` (rendered via `dangerouslySetInnerHTML`). Cover art lives in `public/images/covers/`.
- Single-release pages (`ride.tsx`, `disobey.tsx`, `wanted.tsx`) are thin wrappers: hardcoded `cover` + `links` data passed to the shared `src/components/single.tsx`.
- `catalog.tsx` (`/catalog`) is the hero-styled release catalog — the former homepage. `catalog2.tsx` is the layout that preceded it.
- Styling is plain CSS Modules in `src/styles/` (one file per page/section). No Tailwind — `components.json` is a leftover shadcn config, not wired up.
- Fonts: Lovelo via `next/font/local` from `public/fonts/` (re-declared per standalone page), Montserrat via `next/font/google`.

## /effects — the intro (The Ephemeral Trail announcement)

`src/pages/effects.tsx` is the homepage — `index.tsx` renders the same component (with its own `standalone = true`), so `/` and `/effects` are the same page except for one prop: `withKeys`, off at `/` so visitors can't restart or dock the mark by typing, on at `/effects` for tuning. It is a standalone page hosting a GPU animation announcing the "Ephemeral Trail" release: the MINA mark draws itself as lines, its extended lines shatter the viewport into shards that resolve to the cover art, the shard layer hands off invisibly to the real page, then the mark docks to the upper left and the h1 fades in. Ported from the `apps/mina-neweffects` prototype (kept untouched as reference). The page dynamic-imports an engine in a `useEffect` and boots the `ephemeral` preset.

**Three intro paths**, picked in `effects.tsx` and each reported to GA4 as its own event name (`intro_webgpu` / `intro_webgl2` / `intro_static` / `intro_lost`, via `track()`):

1. **WebGPU** (`webgpu/effect.ts`) — the full engine. Chosen by probing `navigator.gpu.requestAdapter()` **before** importing either engine module: a canvas holds exactly one context type, so a half-started WebGPU attempt would poison the WebGL2 retry.
2. **WebGL2** (`webgl2/effect.ts`) — same sequence, same geometry, same timeline; `lines` renderer only.
3. **Static** (`runFallback` in `effects.tsx`) — no engine: the artwork blooms in, flips to the player, and a static PNG of the mark is locked at the dock (`.markLock`). This is also the destination when a live engine reports `onPhase('lost')`, and the path taken outright under `prefers-reduced-motion: reduce` (with its own tween durations zeroed — same end state, no travel).

`src/pages/loop.tsx` (`/loop`) is a second consumer of the engine: the `loop` preset plus a page-owned GSAP timeline that yoyos `params.progress` 0↔1 forever — draw, bloom peak, undraw — no cover reveal, no dock, keys off. Deep engine reference (state machine, timeline math, bloom formula, choreo semantics): `src/effects/ENGINE.md`.

### Module layout (`src/effects/`)

Split by backend: the root holds everything that touches no GPU API, `webgpu/` and `webgl2/` hold one engine each plus its own shaders. Neither backend directory imports the other — the handle they both return lives in `types.ts`, so pages and shared modules never reach into an engine for a type.

**Shared** — no GPU API, no backend imports:

- `types.ts` — the `MinaEffect` handle: `play`/`move`/`clearInk`/`destroy`, the `firstFrame` promise, the live `params`, and the `onPlay`/`onMove`/`onPhase` callbacks. The API line between the two engines; changing it obliges both.
- `frame.ts` — the per-frame math both backends share, pure (no GPU, no DOM): `deriveTimeline`, the `SegWriter` + `writeMoveSegments`/`writeGrowSegments` that build this frame's line instances, `packLineUniforms` (core stroke + glow stack), `stepEnergy` (the bloom low-pass), and the `MAX_LINE_INST` / `GLOW_MAX` limits. A straight lift of arithmetic that used to be written twice — same operations in the same order, so the recorded loop is unchanged.
- `layout.ts` — pure geometry, no GPU/DOM: `buildLayout` (collinear line merge → greedy growth graph → convex cell split → union-find shard merge), `buildMovePlan`. All colours are baked here at build time via `getImageData`.
- `mark.ts` — the MINA mark itself, hardcoded from the brand SVG: vertices, triangles, derived unique `EDGES`, silhouette, the three brand dots. Every placement is a (scale, x01, y01) mapping of this one mark-space geometry.
- `texture.ts` — the `TextureSource` seam: fits a static image into a viewport-sized canvas (GPU texture + per-point colour sampler). Live-HTML rasterization was deliberately decoupled; restoring it means producing another TextureSource, nothing else changes.
- `loopModes.ts` — /loop's shader-treatment bundles: one entry per `ShaderMode`, pairing the renderer with the config overrides that flatter it, plus `applyLoopMode`. Pure data, no GPU imports, so the page can pull it in at build time.
- `config.ts` — `EffectConfig` (every tunable), `BASE`, `LiveParams` (config + transient scrubs), `TweenSpec`/`Preset` types.
- `presets/` — named `Preset` objects: `config` values + optional declarative `tweens`. Authoring loop: tune in the GUI → "copy preset" (clipboard + console) → paste as a new file → register in `presets/index.ts`. No localStorage anywhere.
- `gui.ts` — lil-gui panel with the preset dropdown; switching presets re-applies config over BASE, rebinds tweens, reloads the texture if it changed. Gated by `NEXT_PUBLIC_EFFECTS_GUI=true` (read in `effects.tsx`/`loop.tsx`, passed as `createMinaEffect`'s 3rd arg) — off by default and inlined at build time, so toggling it needs a dev-server restart or rebuild.
- `choreo.ts` — GSAP interpreter for a preset's `tweens`, bound to the engine's play/move events; default tween windows anchor to the derived timeline (the resolve sweep on play, the whole dock on move).

**WebGPU** (`webgpu/`) — the full engine:

- `webgpu/effect.ts` — the stateful WebGPU engine: `createMinaEffect(canvas, preset?)` → device, pipelines, render loop, move state machine. `destroy()` is mandatory (reactStrictMode double-mounts). Keys: R replay · M move · H hide panel — they fire even while typing in GUI fields; gated by `createMinaEffect`'s 4th arg `withKeys` (default on — `/loop` and the homepage pass false so a stray keystroke can't restart or dock the mark).
- `webgpu/shaders/*.ts` — WGSL strings (mosaic shards, line ribbons, dots, bloom post-chain, and the /loop-only sdf field / particles / swarm / ink modes).

**WebGL2 fallback** (`webgl2/`) — the `lines` renderer only:

- `webgl2/effect.ts` — the WebGL2 backend: `createMinaEffectGL(...)`, same signature, same `MinaEffect` handle. A **second backend, not a refactor** — it shares everything above the API line (layout, texture, presets, choreo, `frame.ts`) and keeps its own GL plumbing and state machine, so the WebGPU path keeps `record:loop`'s byte-identical guarantee. Scope: the `lines` renderer only (the /loop shader modes need storage buffers).
- `webgl2/shaders.ts` — GLSL ES 3.00 ports of the WGSL stages the WebGL2 backend uses. Mirrors its WGSL twin line for line; the deliberate differences (loose uniforms, arithmetic quad corners, the post chain's v-flip, mosaic mode 0 only) are listed in its header.

### Invariants that will bite

- **Two backends, one sequence**: the per-frame math that decides what the frame LOOKS like lives once, in `frame.ts` (derived timeline, the segment build, line + glow uniforms, the bloom energy filter) — retune it there and both backends follow. What is still written twice in `webgpu/effect.ts` and `webgl2/effect.ts` is the state machine (play/move/dock), the mosaic and dot uniform values, and all pass encoding: change one and you MUST change the other, or WebGPU and WebGL2 visitors see different animations on the same homepage. Same rule for `webgpu/shaders/*.ts` ↔ `webgl2/shaders.ts`. Diffing the two `frame()` bodies with comments stripped is the fastest drift check — what's left should reduce to API calls plus the WebGPU-only shader-mode blocks.
- **A dead GPU must not freeze the page**: `firstFrame` resolves early, so once the preroll lifts a halted render loop looks like a hung intro. Both backends watch for it (`device.lost`, `webglcontextlost`), stop their own rAF, settle `firstFrame` and fire `onPhase('lost')`; `effects.tsx` answers by running the static fallback. `webgl2/effect.ts`'s `destroy()` must remove its `webglcontextlost` listener *before* calling `loseContext()`, or teardown looks like a real loss.
- **The handoff trick**: the shard layer fades out onto the page behind it and must land pixel-identical. The texture draw (`texture.ts`, square fit = 0.8 × the viewport's short edge) and the page CSS (`Effects.module.css` `.bg`, `background-size: min(80vw, 80vh)`) MUST stay in sync — each carries a comment pointing at the other.
- **No-JS paints black unless the CSS says otherwise**: every visible element rests at `opacity: 0` under an opaque `.preroll`, and the only thing that lifts it is React state (`setReady`). A `<noscript>` block at the end of `effects.tsx`'s `<main>` re-states `runFallback`'s END values as CSS (mask-size 350%, veil 0, title/stores opacity 1, preroll hidden) and renders `.markLock` as a plain `<img>` — the keyframe fade needs no JS. Those values are a hand-copy, not a shared constant: retune what `runFallback` tweens to and the noscript rules drift silently. It deliberately does not flip the card (the SoundCloud embed is itself a script), and it does NOT help a visitor whose JS is enabled but whose bundle fails to load — `<noscript>` stays inert for them.
- The engine re-reads every param each frame, so tweening = mutating `effect.params` over time (that's the whole GSAP integration). But geometry params (`logoScale/X/Y`, `density`, `stagger`, `maxRays`) only apply via a rebuild — the GUI sets `cellsDirty`; direct mutation doesn't.
- Timeline math: the mark-drawing phase's wall-clock share is `duration / (1 + whiteDur + colorDur + texDur + hold)`. "Fast draw, slow reveal" is tuned by weighting the reveal stages, not by `duration` alone.
- Colours (shard flash via `flashTint`, per-segment via `lineTint`, dots) are sampled at build time through `accentColor` — hue kept, brightness lifted; hueless near-black falls back to white for dots and to the configured line colour for segments. The docked mark ends white *because it docks over the black margin*; dock it over the artwork and it colourises.
- `onPlay`/`onMove` on the engine handle are claimed by preset tweens — pages listen on `onPhase` (`'play' | 'move' | 'docked' | 'lost'`). The h1 reveal is a sticky `'docked'` listener (hiding it on replay causes spurious fade-outs; the shard layer covers it anyway).
- Choreo's `onPlay`/`onMove` handlers (and `dispose`) call `gsap.killTweensOf(params)` on the **whole** params object — any page-owned tween dies on replay. A preset with no `tweens` disposes at bind time, leaving `onPlay`/`onMove` unbound; that's what makes `/loop`'s page-owned timeline safe.
- The engine cannot run without a texture: no `TextureSource` → no layout → nothing draws and `firstFrame` only settles via its 6 s safety timer. Failed loads self-heal to a fallback texture.
- Zeroed reveal durations (`whiteDur/colorDur/texDur/hold` all 0) are tolerated: `growSpan = 1`, so progress 0↔1 is exactly the line draw — but the shard layer then never fades; force it black (`whiteLevel: 0`, `colorBoost: 0`, `veil: 1`) as the `loop` preset does.
- Uniforms take CSS px; the canvas backing store is dpr-scaled (cap 2). All blending premultiplied. `MAX_LINE_INST = 96` — overflow is silently dropped.
- TS specifics: `@webgpu/types` via `src/types/webgpu.d.ts`; `target: ES2017` exists for the layout code's Map iteration (type-check only — SWC ignores it); arrays fed to `writeBuffer` need `Float32Array<ArrayBuffer>` annotations, and null-narrowing doesn't reach hoisted functions (hence the guard style around device/context init).

## Routing / deploy coupling

Clean URLs come from explicit rewrites in `firebase.json` (`/saveme` → `/saveme.html`, etc.), with a catch-all to `/index.html`. Adding a new page requires adding a matching rewrite in `firebase.json`, otherwise its clean URL silently falls through to the homepage.

## Code style

Biome-enforced: 4-space indent, single quotes, semicolons, line width 150.
