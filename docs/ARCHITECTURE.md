# Architecture

**Intent blueprint:** For intent graph, extension points, and dev-acceleration metrics see [docs/INTENT_BLUEPRINT.md](INTENT_BLUEPRINT.md). Validate with `pnpm run validate:blueprint` (or `validate:blueprint:coverage`).

## Stack

- **Next.js App Router** + **React 19** + **TypeScript 5** (strict)
- **Clerk** for app and API authentication
- **AI SDK** with Vercel AI Gateway for streaming chat
- **Replicate or local ComfyUI** for text-to-audio generation
- **Zod** for runtime validation of external input (e.g. API, import)
- **Result&lt;T, E&gt;** pattern for explicit error handling (no thrown exceptions in core logic)
- **Web Audio API** for synthesis and scheduling

## Data flow

1. **Song state** lives in `App` via `useUndoRedo(SongData)`. All edits go through `setState`, which pushes to history. **Song mutations** are pure functions in `lib/songMutations.ts` (addTrack, removeTrack, toggleStep, setBpm, etc.); App delegates to them so business logic is testable and isolated.
2. **Audio engine** is a singleton (`services/audioEngine.ts`). `setSongData(song)` syncs the current song; playback uses `stepsPerPattern`, `swing`, `bpm`, and per-track `muted`/`solo`/`volume`/`pan`.
3. **Step editing**: Sequencer calls `onStepToggle(step)`; App adds or removes a `NoteEvent` for that step (default note by track type).
4. **Persistence**: `storageService` loads/saves JSON to localStorage and parses with `parseSongResponse` (Zod). Export/import use the same schema.
5. **Music generation**: Authenticated user types prompt → Generate → `textToAudioService.generateAudioFromText()` → POST `/api/generate-audio` → Clerk auth → backend selector → Replicate Stable Audio 2.5 or local ComfyUI → `createGeneratedAudioTrack()` → new audio track appended.
6. **AI chat**: Authenticated user sends a chat message → `AiChatPanel` → POST `/api/chat` → Clerk auth → AI SDK `streamText()` through Vercel AI Gateway → streamed UI message response.

## Music generation (text-to-audio)

End-to-end flow:

1. **Frontend** (`App.tsx`): User enters prompt, clicks Generate. Calls `generateAudioFromText(prompt, 15)`.
2. **Client service** (`services/textToAudioService.ts`): Validates input with Zod (`generateAudioRequestSchema`), POSTs to `/api/generate-audio`, validates response with `generateAudioResponseSchema`. Returns `Result<{ url }, Error>`.
3. **API** (`app/api/generate-audio/route.ts`): Next route handler. Requires Clerk auth, validates body with `parseGenerateAudioRequest`, then routes to Replicate Stable Audio 2.5 or `lib/comfyAudioProvider.ts`. Returns `{ url }` or `{ error }`. 90s timeout client-side; 300s `maxDuration` on Vercel.
4. **Track creation** (`lib/createGeneratedAudioTrack.ts`): Pure function. Builds `Track` with `type: 'audio'` and `audioUrl` for the DAW.
5. **Audio engine**: Preloads and plays audio tracks from `audioUrl` at step 0 each loop.

**Schemas** (`schemas/generateAudioSchema.ts`): Shared request/response validation. Duration 1-45s, default 15. Prompt max 2000 chars.

**ComfyUI** (`lib/comfyAudioProvider.ts`): Loads `COMFYUI_AUDIO_WORKFLOW_PATH`, injects the prompt into either configured node env vars or the first matching text/prompt input, submits `/prompt`, polls `/history/{prompt_id}`, and returns the first audio/file output through `/view`.

## Types (core)

- **SongData**: `title`, `bpm`, `stepsPerPattern` (8|16|32), `swing` (0–100), `tracks[]`
- **Track**: `id`, `name`, `type` (synth|bass|drums|**audio**), `notes[]`, `params`, `muted`, `solo`, `volume`, `pan`, `audioUrl?` (for type `audio`)
- **NoteEvent**: `note` (e.g. "C4", "kick"), `startStep`, `durationSteps`

## Tests

- **Unit**: `lib/result`, `lib/createGeneratedAudioTrack`, `lib/songMutations`, `schemas/songSchema`, `schemas/generateAudioSchema`, `services/storageService`, `services/geminiService` (mocked), `hooks/useUndoRedo` (jsdom)
- **Integration**: `app/api/generate-audio` (mocked Clerk + Replicate/ComfyUI), `app/api/chat` (mocked Clerk + AI SDK), `services/textToAudioService` (mocked fetch)
- **Vitest** with `environment: 'jsdom'` for DOM/localStorage-dependent tests
- Run: `pnpm test`

## Conventions

- No `any`; explicit return types on public APIs
- External input (API, file import) validated with Zod; parse result wrapped in `Result<SongData, Error>`
- New features that mutate song state go through `setState` from `useUndoRedo` so undo/redo stays consistent
