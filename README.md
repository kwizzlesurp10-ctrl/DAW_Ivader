<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# DOOM DAW — IRKEN Audio Lab

A modern, in-browser DAW with AI-assisted generation, step sequencer, and full project persistence.

View in AI Studio: https://ai.studio/apps/drive/192C7PIV_QPpDtFu0SvAQfXqq0dFpmYqp

---

## Features

- **Sequencer**: 8/16/32-step grid, click steps to add/remove notes, per-track mute/solo
- **Tracks**: Add, remove, duplicate, reorder; per-track volume, pan, ADSR, filter, waveform
- **Playback**: Play / Pause / Stop, BPM 1–999, swing 0–100%, optional metronome, master volume
- **AI Generate**: Describe a style (e.g. "dark cyberpunk bassline"); Gemini returns a full song structure
- **Persistence**: Save/load in browser (localStorage), export/import JSON
- **Undo/Redo**: Full history for all song edits
- **Keyboard**: Space = play/pause, S = stop

---

## Quick start (production)

**Prerequisites:** Node.js 18+

```bash
# 1. Install
npm ci

# 2. Environment (required for AI Generate)
cp .env.example .env.local
# Edit .env.local: set GEMINI_API_KEY=your_key

# 3. Verify
npm run test
npm run build

# 4. Run locally
npm run dev
# → http://localhost:3000
```

**Production build & serve**

```bash
npm run build
npm run preview
# → http://localhost:4173 (serves dist/)
```

**Deploy to Vercel** (recommended)

```bash
npx vercel login
npx vercel --prod
```

Set `GEMINI_API_KEY` in Vercel project Settings → Environment Variables. See [DEPLOY.md](./DEPLOY.md) for full instructions and custom domain setup.

---

## Run locally (dev)

1. **Install:** `npm install`
2. **Env:** Set `GEMINI_API_KEY` in `.env.local` (or `.env`) for the Generate feature.
3. **Run:** `npm run dev` → http://localhost:3000
