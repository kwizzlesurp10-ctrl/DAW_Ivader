# Test MiniMax Music 01 via DAW_Ivader

## Prerequisites

- **Node.js 18+** (required by the project)
- **Replicate API token** from [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens)

## 1. Run automated tests (no API token needed)

From the project root:

```bash
npm run test:generate-audio
```

This runs:

- `api/generate-audio.integration.test.ts` — handler, auth (503 when no token), request validation, Replicate mock (lyrics → minimax/music-01)
- `schemas/generateAudioSchema.test.ts` — request/response schema
- `services/textToAudioService.integration.test.ts` — client request shape
- `e2e/generate-audio.e2e.test.ts` — client → mocked API pipeline

## 2. Run the app and test in the UI

1. **Set your token** (project root):

   ```bash
   cp .env.example .env.local
   # Edit .env.local and set:
   REPLICATE_API_TOKEN=r8_your_actual_token
   ```

2. **Start the dev server** (serves both frontend and `/api/generate-audio`):

   ```bash
   npm run dev:full
   ```

   If `vercel` is not installed: `npm i -g vercel` or `pnpm add -g vercel`, then run `npm run dev:full` again.

3. **Open the app** (URL printed by `vercel dev`, e.g. http://localhost:3000).

4. **Use Generate:**
   - Enter a prompt (e.g. "upbeat electronic beat" or short lyrics).
   - Click **GENERATE**.
   - Wait for the run (~30–60 s for MiniMax Music 01); an audio track should appear.

## 3. Test the API with curl

With the app running via `npm run dev:full` and `REPLICATE_API_TOKEN` in `.env.local`:

```bash
curl -X POST http://localhost:3000/api/generate-audio \
  -H "Content-Type: application/json" \
  -d '{"prompt":"chill lo-fi beat"}' \
  -w "\nHTTP: %{http_code}\n"
```

- **503** — token missing or not loaded; check `.env.local` and that you started with `vercel dev`.
- **200** — response body is `{"url":"https://..."}`; open the URL to download the generated audio.
- **502** — Replicate/MiniMax error; check the response `error` field.

## 4. Optional: test without token (expect 503)

```bash
# Unset token for this shell, then:
REPLICATE_API_TOKEN= npm run dev:full
# In another terminal:
curl -s -X POST http://localhost:3000/api/generate-audio \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test"}' | jq .
# Expected: {"error":"No audio backend configured. Set REPLICATE_API_TOKEN..."}
```
