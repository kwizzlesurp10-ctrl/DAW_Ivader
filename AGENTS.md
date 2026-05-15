# AGENTS.md

## Cursor Cloud specific instructions

### Overview

DOOM DAW (Irken Audio Lab) — an in-browser Digital Audio Workstation (React 19 + Vite 6 + TypeScript 5.9 + Tailwind 3). Single-product repo, not a monorepo.

### Prerequisites

- **Node.js 20** (`.nvmrc`), minimum 18. Activate via `source ~/.nvm/nvm.sh && nvm use 20`.
- **pnpm 9.15.9** (`packageManager` field). Activate via `corepack enable && corepack prepare pnpm@9.15.9 --activate`.

### Key commands

| Task | Command | Notes |
|------|---------|-------|
| Install deps | `pnpm install` | |
| Dev server | `pnpm dev` | Frontend at `http://localhost:3000`, binds `0.0.0.0` |
| Tests | `pnpm test` | Vitest — 217 unit/integration tests |
| Type check | `npx tsc --noEmit` | Strict mode |
| Build (frontend) | `pnpm build:raw` | Vite production build |
| Full build | `pnpm build` | Vite build + `scripts/build-api.mjs` (uses direct `esbuild` devDependency) |
| E2E (browser) | `pnpm test:e2e:browser` | Requires `npx playwright install chromium` first |

### Gotchas

- **No ESLint config exists** in this repo. There is no lint script. Type checking (`npx tsc --noEmit`) is the closest lint-equivalent.
- **`esbuild`** is a direct devDependency so `pnpm build` can run `scripts/build-api.mjs` without relying on Vite’s nested copy. Use `pnpm build:raw` for frontend-only output when you do not need `dist/api/*.mjs`.
- **AI features are optional.** The core DAW (sequencer, synth, playback, save/load) works without any API keys. `REPLICATE_API_TOKEN` enables text-to-audio generation; `OPEN_ROUTER_API_KEY` enables AI song structure.
- **`pnpm dev` serves frontend only.** The `/api/generate-audio` serverless route requires `pnpm dev:full` (uses Vercel CLI) or a Vercel deployment.
- **Web Audio API** requires a browser with audio context support. The dev server binds to `0.0.0.0:3000` by default.
