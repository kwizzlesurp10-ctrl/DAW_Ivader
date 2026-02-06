# Architecture

## Stack

- **React 19** + **Vite 6** + **TypeScript 5.8** (strict)
- **Zod** for runtime validation of external input (e.g. API, import)
- **Result&lt;T, E&gt;** pattern for explicit error handling (no thrown exceptions in core logic)
- **Web Audio API** for synthesis and scheduling

## Data flow

1. **Song state** lives in `App` via `useUndoRedo(SongData)`. All edits go through `setState`, which pushes to history.
2. **Audio engine** is a singleton (`services/audioEngine.ts`). `setSongData(song)` syncs the current song; playback uses `stepsPerPattern`, `swing`, `bpm`, and per-track `muted`/`solo`/`volume`/`pan`.
3. **Step editing**: Sequencer calls `onStepToggle(step)`; App adds or removes a `NoteEvent` for that step (default note by track type).
4. **Persistence**: `storageService` loads/saves JSON to localStorage and parses with `parseSongResponse` (Zod). Export/import use the same schema.

## Types (core)

- **SongData**: `title`, `bpm`, `stepsPerPattern` (8|16|32), `swing` (0–100), `tracks[]`
- **Track**: `id`, `name`, `type` (synth|bass|drums), `notes[]`, `params` (ADSR, filter, gain, waveform), `muted`, `solo`, `volume`, `pan`
- **NoteEvent**: `note` (e.g. "C4", "kick"), `startStep`, `durationSteps`

## Tests

- **Unit**: `lib/result`, `schemas/songSchema`, `services/storageService`, `services/geminiService` (mocked), `hooks/useUndoRedo` (jsdom)
- **Vitest** with `environment: 'jsdom'` for DOM/localStorage-dependent tests
- Run: `npm run test`

## Conventions

- No `any`; explicit return types on public APIs
- External input (API, file import) validated with Zod; parse result wrapped in `Result<SongData, Error>`
- New features that mutate song state go through `setState` from `useUndoRedo` so undo/redo stays consistent
