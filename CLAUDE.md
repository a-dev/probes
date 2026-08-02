## Project Overview

Self-contained web-dev "probes" — each explores one concept (overscroll, validation timing) with a
live demo and an article. Static Astro site deployed to GitHub Pages. Package manager is **Bun**;
Node `>=22.12.0`.

## Commands

- `bun run dev` — dev server (`--host`, on LAN)
- `bun run build` / `bun run preview` — build to `dist/` / serve it
- `GITHUB_PAGES=true bun run build` — build with the `/probes` base path (what CI deploys)
- `bun run lint` / `bun run lint:fix` — oxlint + stylelint
- `bun run format` / `bun run format:check` — oxfmt (not Prettier)
- `bun run typecheck` — `oxlint --type-aware`

## Architecture

**One probe = one route folder** under `src/pages/<name>/`, owning everything it needs:

- `index.astro` — full `<html>` page (probes are standalone, no shared layout)
- `<name>.css` — page styles, imported into the `.astro` file
- `_article.md` — the explainer (`_` prefix keeps it out of routing)
- `_components/` — React island(s) + logic, only if interactive
- `_lib/` — framework-free logic for probes that do not need a React island

`src/pages/index.astro` is an intentionally empty landing page; the probe list lives in `README.md`.

**React islands:** `output: "static"`. Pages are SSR'd HTML; interactivity is opt-in per component.
`validation` mounts one island (`<LoginDemo client:load />`); `overscroll` uses no React, just an
inline `<script>` + URL params. Keep island boundaries minimal.

**Base path (GitHub Pages):** `astro.config.mjs` sets `base` to `/probes` only when
`GITHUB_PAGES === "true"`. Every asset URL must route through `import.meta.env.BASE_URL`; each
`index.astro` repeats `const baseUrl = ${import.meta.env.BASE_URL.replace(/\/$/, "")}/`.

**Other:** `@/*` → `src/*`; TS extends `astro/tsconfigs/strict`. CI deploys `dist/` to Pages on
push to `main`.

## Conventions

- **Probe logic is heavily commented** — each `_components/*` file opens by stating its role in the
  whole ("Owns the third timeline: the death of a server error"). Preserve this narration; it's the
  teaching purpose.
- **Zod schema = single source of truth** (`login-schema.ts`), read by every form.
- **Mock backends, not real ones** (`mock-auth.ts`) so a probe can exercise server-error timing
  without a server.
