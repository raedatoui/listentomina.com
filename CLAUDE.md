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

## Routing / deploy coupling

Clean URLs come from explicit rewrites in `firebase.json` (`/saveme` → `/saveme.html`, etc.), with a catch-all to `/index.html`. Adding a new page requires adding a matching rewrite in `firebase.json`, otherwise its clean URL silently falls through to the homepage.

## Code style

Biome-enforced: 4-space indent, single quotes, semicolons, line width 150.
