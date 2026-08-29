# listentomina.com

Promo site for [Mina](https://soundcloud.com/listentomina), a Brooklyn-based dream-pop artist — releases, streaming links, embedded SoundCloud players, and press-style pages for individual singles.

The homepage is a GPU animation announcing *The Ephemeral Trail*: the MINA mark draws itself as lines, those lines shatter the viewport into shards that resolve to the cover art, and the mark docks to the corner as the page arrives.

Built with Next.js 16 (Pages Router) as a fully static export — no server runtime — and hosted on Firebase Hosting (site `listentomina`).

## Stack

- Next.js 16 / React 19, `output: 'export'` → static HTML in `out/`
- TypeScript, plain CSS Modules (no Tailwind)
- WebGPU with a WebGL2 backend and a no-engine static fallback for the intro; GSAP for its choreography
- Biome for linting and formatting
- pnpm, Node >= 22

## Getting started

The `public/` directory (fonts, cover art, images, favicons) is required but **not checked into git** (see `.gitignore`). The assets live as a zip on Google Drive — download it, unzip, and stage the contents as `public/` in this directory before running the dev server or building; the site won't render without it.

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Other scripts:

```bash
pnpm build      # static export to out/
pnpm lint       # Biome lint
pnpm format     # Biome format, write in place
pnpm check      # Biome lint + format with auto-fix

pnpm record:loop  # capture /loop to capture/loop.mp4 (needs `pnpm dev` running + ffmpeg)
```

See [Recording the loop](#recording-the-loop) for the flags that pick a shader mode, frame size, and
mark scale.

One optional environment variable: `NEXT_PUBLIC_EFFECTS_GUI=true` shows the lil-gui tuning panel on
`/`, `/effects`, and `/loop`. It is off by default and inlined at build time, so flipping it needs a
restart (`NEXT_PUBLIC_EFFECTS_GUI=true pnpm dev`) or a rebuild. Nothing else reads the environment —
`.env.example` is the full list; copy it to `.env` (gitignored) if you want it on locally.

## Site structure

| Route | Source | Purpose |
| --- | --- | --- |
| `/` | `src/pages/index.tsx` | Homepage — *The Ephemeral Trail* intro, keyboard shortcuts off |
| `/effects` | `src/pages/effects.tsx` | The same intro with the keyboard shortcuts live (R replay, M move, H hide panel) |
| `/loop` | `src/pages/loop.tsx` | The mark drawing and undrawing forever — source for `pnpm record:loop` |
| `/catalog` | `src/pages/catalog.tsx` | Hero-styled release catalog — the former homepage |
| `/catalog2` | `src/pages/catalog2.tsx` | The layout that preceded the catalog, kept as a variant |
| `/saveme` | `src/pages/saveme.tsx` | Standalone press page for "Never Gonna Survive (Save Me)" |
| `/ride`, `/disobey`, `/wanted` | `src/pages/*.tsx` | Single-release pages built on the shared `Single` component |
| `/covers` | `src/pages/covers.tsx` | Covers page |

Two layout modes: `src/pages/_app.tsx` wraps pages in the site shell (logo header + footer) unless the page component sets `standalone = true`, in which case the page owns its entire layout.

## The intro

`src/effects/` holds the animation engine behind `/` and `/loop`. It picks one of three paths per visitor — WebGPU (`webgpu/effect.ts`), WebGL2 (`webgl2/effect.ts`), or a no-engine static fallback — and each reports itself to GA4 as its own event. Geometry, presets, and the per-frame math are shared by both backends; the state machine and pass encoding are written twice and must be changed together. `src/effects/ENGINE.md` is the deep reference.

## Recording the loop

`scripts/record-loop.mjs` exports `/loop` to a seamless mp4. It drives the page from a virtual clock
(hijacked `performance.now` / `rAF`, stepped at exactly 1/60 s), so the result is deterministic no
matter how slow the frame readback is: it skips three warm-up cycles to let the bloom's motion-energy
filter settle, then grabs exactly one 5.5 s breath, which loops end to end. Needs `pnpm dev` running
in another terminal and ffmpeg on PATH, and it opens a headful Chrome window — headless Chrome is
still flaky about WebGPU. Lossless PNGs are left in `capture/frames-<name>/` for re-encodes.

With no flags it produces the 4K60 landscape capture at `capture/loop.mp4`:

```bash
pnpm record:loop
```

Flags go through `pnpm run` (the bare `pnpm record:loop` shorthand rejects unknown flags), or call
`node scripts/record-loop.mjs` directly:

| Flag | Default | What it does |
| --- | --- | --- |
| `--mode=<id>` | the page's boot mode (`lines`) | Clicks the shader-mode chip with that label before the warm-up |
| `--size=WxH` | `1920x1080` | CSS viewport; the engine caps dpr at 2, so the mp4 is exactly 2× this |
| `--scale=<n>` | the preset's `logoScale` (0.95) | Mark size, as a fraction of viewport **height** |
| `--out=<name>` | `loop` | `capture/<name>.mp4`, frames in `capture/frames-<name>/` |

The shader modes are the nine bundles in `src/effects/loopModes.ts` — `lines`, `liquid`, `ripples`,
`neon`, `shatter`, `glass`, `particles`, `swarm`, `ink` — the same ones the chips (and digits 1–9)
switch between on the page. Each pairs a renderer with the config overrides that flatter it.

`--scale` matters for anything not 16:9: the mark is sized off viewport height, so the preset's 0.95
runs edge to edge in a portrait frame. A vertical (iPhone / Reels / Stories) capture of the glass
mode, 1080×1920:

```bash
pnpm run record:loop --mode=glass --size=540x960 --scale=0.7 --out=loop-glass-9x16
```

`logoScale` is read only when the engine rebuilds its layout, behind a private `cellsDirty` — there
is no way to set it from outside at runtime, so `--scale` rewrites the value in the JS chunks the dev
server serves, before any page script runs. That means it only works against `pnpm dev` (unminified
chunks); the script throws rather than silently recording at the preset value if the patch misses.

## Editing content

- **Add a release to the catalog grid:** edit the `releases` array at the top of `src/components/releases.tsx`. Each entry has cover info (image file in `public/images/covers/`), streaming links, and a SoundCloud `trackId` for the embedded player. Set `isPlaylist: true` for EP/playlist embeds and `adSupported: true` to disable autoplay.
- **Add a single-release page:** copy one of `ride.tsx` / `disobey.tsx` / `wanted.tsx`, swap the `cover` and `links` data, and add a rewrite for it in `firebase.json` (see below).

## Routing and deployment

Clean URLs are handled by explicit rewrites in `firebase.json` (`/saveme` → `/saveme.html`, etc.), with a catch-all to `/index.html`. **Every new page needs a matching rewrite** — without one, its clean URL silently serves the homepage.

Deploy:

```bash
pnpm build && firebase deploy
```
