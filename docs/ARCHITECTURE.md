# Architecture

**Intent blueprint:** For intent graph, extension points, and dev-acceleration metrics see [docs/INTENT_BLUEPRINT.md](INTENT_BLUEPRINT.md). Validate with `pnpm run validate:blueprint` (or `validate:blueprint:coverage`).

## Stack

- **React 19** + **Vite 6** + **TypeScript 5.8** (strict)
- **Zod** for runtime validation of external input (e.g. API, import)
- **Result&lt;T, E&gt;** pattern for explicit error handling (no thrown exceptions in core logic)
- **Web Audio API** for synthesis and scheduling

## Data flow

1. **Song state** lives in `App` via `useUndoRedo(SongData)`. All edits go through `setState`, which pushes to history. **Song mutations** are pure functions in `lib/songMutations.ts` (addTrack, removeTrack, toggleStep, setBpm, etc.); App delegates to them so business logic is testable and isolated.
2. **Audio engine** is a singleton (`services/audioEngine.ts`). `setSongData(song)` syncs the current song; playback uses `stepsPerPattern`, `swing`, `bpm`, and per-track `muted`/`solo`/`volume`/`pan`.
3. **Step editing**: Sequencer calls `onStepToggle(step)`; App adds or removes a `NoteEvent` for that step (default note by track type).
4. **Persistence**: `storageService` loads/saves JSON to localStorage and parses with `parseSongResponse` (Zod). Export/import use the same schema.
5. **Music generation**: User types prompt → Generate → `textToAudioService.generateAudioFromText()` → POST `/api/generate-audio` → HuggingFace or Replicate MusicGen → `createGeneratedAudioTrack()` → new audio track appended.

## Music generation (text-to-audio)

End-to-end flow:

1. **Frontend** (`App.tsx`): User enters prompt, clicks Generate. Calls `generateAudioFromText(prompt, duration, modelVersion)`.
2. **Client service** (`services/textToAudioService.ts`): Validates input with Zod (`generateAudioRequestSchema`), POSTs to `/api/generate-audio`, validates response with `generateAudioResponseSchema`. Returns `Result<{ url }, Error>`. Client-side fetch timeout: 300s.
3. **API** (`api/generate-audio.ts`): Vercel serverless (`maxDuration: 300s`). Validates body with `parseGenerateAudioRequest`, calls **HuggingFace Inference API** (preferred, returns base64 data URL) or **Replicate** (fallback, returns remote URL). Each backend has a 250s hard timeout (fires before Vercel's 300s limit, preventing `FUNCTION_INVOCATION_FAILED`). Returns `{ url }` or `{ error }`.
4. **Track creation** (`lib/createGeneratedAudioTrack.ts`): Pure function. Builds `Track` with `type: 'audio'` and `audioUrl` for the DAW.
5. **Audio engine**: Preloads and plays audio tracks from `audioUrl` at step 0 each loop.

**Backend selection** (first match wins):
- `HUGGINGFACE_API_TOKEN` set → Meta MusicGen via HuggingFace Inference API (returns base64 data URL)
- `REPLICATE_API_TOKEN` set → Meta MusicGen via Replicate (returns remote URL)

**Vercel plan requirement**: Audio generation requires a Vercel Pro plan (or higher) because MusicGen inference takes 30–300 seconds (cold start). Hobby plan functions are limited to 10s by default and cannot complete MusicGen requests.

**Schemas** (`schemas/generateAudioSchema.ts`): Shared request/response validation. Duration 10–15s (clamped), default 12s. Prompt max 2000 chars.

## Types (core)

- **SongData**: `title`, `bpm`, `stepsPerPattern` (8|16|32), `swing` (0–100), `tracks[]`
- **Track**: `id`, `name`, `type` (synth|bass|drums|**audio**), `notes[]`, `params`, `muted`, `solo`, `volume`, `pan`, `audioUrl?` (for type `audio`)
- **NoteEvent**: `note` (e.g. "C4", "kick"), `startStep`, `durationSteps`

## Tests

- **Unit**: `lib/result`, `lib/createGeneratedAudioTrack`, `lib/songMutations`, `schemas/songSchema`, `schemas/generateAudioSchema`, `services/storageService`, `services/geminiService` (mocked), `hooks/useUndoRedo` (jsdom)
- **Integration**: `api/generate-audio` (mocked Replicate), `services/textToAudioService` (mocked fetch)
- **Vitest** with `environment: 'jsdom'` for DOM/localStorage-dependent tests
- Run: `npm run test`

## Conventions

- No `any`; explicit return types on public APIs
- External input (API, file import) validated with Zod; parse result wrapped in `Result<SongData, Error>`
- New features that mutate song state go through `setState` from `useUndoRedo` so undo/redo stays consistent
