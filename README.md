<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# DOOM DAW — IRKEN Audio Lab

A modern, in-browser DAW with AI-assisted generation, step sequencer, and full project persistence.

View in AI Studio: https://ai.studio/apps/drive/192C7PIV_QPpDtFu0SvAQfXqq0dFpmYqp

---

## Features

- **Sequencer**: 8/16/32-step grid, click steps to add/remove notes, per-track mute/solo
- **Tracks**: Add, remove, duplicate, reorder; synth/bass/drums + **audio** (generated clips); per-track volume, pan, ADSR, filter, waveform
- **Playback**: Play / Pause / Stop, BPM 1–999, swing 0–100%, optional metronome, master volume
- **Generate (text-to-audio)**: Type a description and press **Generate**. Uses **Meta MusicGen** (open-source) via **Replicate** to create an audio clip and adds it as a track; plays from the start of each loop.
- **Persistence**: Save/load in browser (localStorage), export/import JSON
- **Undo/Redo**: Full history for all song edits
- **Keyboard**: Space = play/pause, S = stop

---

## Quick start (production)

**Prerequisites:** Node.js 18+ (20+ recommended for best compatibility)

```bash
# 1. Install
npm ci

# 2. Environment (required for Generate / text-to-audio)
cp .env.example .env.local
# Edit .env.local: set REPLICATE_API_TOKEN=your_token  (recommended)
# — OR — set HUGGINGFACE_API_TOKEN=your_token  (fallback)
# (Optional: OPEN_ROUTER_API_KEY for AI song structure)

# 3. Verify
npm run test
npm run build

# 4. Run locally
npm run dev
# → http://localhost:3000
# For Generate (text-to-audio) locally, use instead: npm run dev:full  (runs vercel dev so /api/generate-audio is available)
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

Set **`REPLICATE_API_TOKEN`** (recommended) or **`HUGGINGFACE_API_TOKEN`** in Vercel project Settings → Environment Variables (required for Generate). See [DEPLOY.md](./DEPLOY.md) for full instructions and custom domain setup.

---

## Generate audio setup

The **Generate** button uses Meta MusicGen via **Replicate** (recommended) or **HuggingFace** (fallback). The backend is selected automatically based on which token is configured — **Replicate takes priority when both are set.**

### Option A: Replicate (recommended)

1. **Get a Replicate token**  
   Go to [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens), sign in, and create an API token.

2. **Local** — In `.env.local` add:
   ```bash
   REPLICATE_API_TOKEN=your_token
   ```
   Generate only works when the API route is reachable:
   - **Option A:** Run with **`npm run dev:full`** or **`vercel dev`** (Vercel CLI)
   - **Option B:** Deploy to Vercel and use the deployed URL

3. **Vercel (production)**  
   In the Vercel project: **Settings → Environment Variables** add **`REPLICATE_API_TOKEN`** with your token, then redeploy.

### Option B: HuggingFace Inference API (fallback)

Used only when `REPLICATE_API_TOKEN` is **not** set.

1. **Get a HuggingFace token**  
   Go to [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens), sign in, and create a token with Inference API access.

2. **Local**  
   In `.env.local` add:
   ```bash
   HUGGINGFACE_API_TOKEN=your_token
   ```

3. **Vercel (production)**  
   In the Vercel project: **Settings → Environment Variables** add **`HUGGINGFACE_API_TOKEN`** with your token, then redeploy.

---

## Run locally (dev)

1. **Install:** `npm install`
2. **Env:** Set `REPLICATE_API_TOKEN` (recommended) or `HUGGINGFACE_API_TOKEN` in `.env.local` for Generate.
   - Replicate: Get a token at [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens)
   - HuggingFace: Get a token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
3. **Run:** For Generate to work locally, use **`npm run dev:full`** (or `vercel dev`). Plain `npm run dev` only serves the frontend and does not expose `/api/generate-audio`. Otherwise use the deployed app.
