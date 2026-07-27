# listentomina.com

Promo site for [Mina](https://soundcloud.com/listentomina), a Brooklyn-based dream-pop artist — releases, streaming links, embedded SoundCloud players, and press-style pages for individual singles.

Built with Next.js 16 (Pages Router) as a fully static export — no server runtime — and hosted on Firebase Hosting (site `listentomina`).

## Stack

- Next.js 16 / React 19, `output: 'export'` → static HTML in `out/`
- TypeScript, plain CSS Modules (no Tailwind)
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
```

No environment variables are required.

## Site structure

| Route | Source | Purpose |
| --- | --- | --- |
| `/` | `src/pages/index.tsx` | Homepage — hero-styled, standalone layout |
| `/index2` | `src/pages/index2.tsx` | Previous homepage layout, kept as a variant |
| `/saveme` | `src/pages/saveme.tsx` | Standalone press page for "Never Gonna Survive (Save Me)" |
| `/ride`, `/disobey`, `/wanted` | `src/pages/*.tsx` | Single-release pages built on the shared `Single` component |
| `/covers` | `src/pages/covers.tsx` | Covers page |

Two layout modes: `src/pages/_app.tsx` wraps pages in the site shell (logo header + footer) unless the page component sets `standalone = true`, in which case the page owns its entire layout.

## Editing content

- **Add a release to the homepage grid:** edit the `releases` array at the top of `src/components/releases.tsx`. Each entry has cover info (image file in `public/images/covers/`), streaming links, and a SoundCloud `trackId` for the embedded player. Set `isPlaylist: true` for EP/playlist embeds and `adSupported: true` to disable autoplay.
- **Add a single-release page:** copy one of `ride.tsx` / `disobey.tsx` / `wanted.tsx`, swap the `cover` and `links` data, and add a rewrite for it in `firebase.json` (see below).

## Routing and deployment

Clean URLs are handled by explicit rewrites in `firebase.json` (`/saveme` → `/saveme.html`, etc.), with a catch-all to `/index.html`. **Every new page needs a matching rewrite** — without one, its clean URL silently serves the homepage.

Deploy:

```bash
pnpm build && firebase deploy
```
