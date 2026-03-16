# DAW Ivader — Intent Blueprint (Hypergraph Refactor)

**Purpose:** Irreducible intent nodes and dependency edges; zero direct replication via semantic boundaries. Self-validating blueprint with metrics for 4× dev acceleration.

---

## 1. Intent graph (nodes = intents, edges = dependencies)

Nodes are **intents** (what the system must do). Edges are **depends-on** or **enhances**.

```
[Result<T,E>] ──────────────────────────────────────────────────────────┐
     │                                                                   │
     ├──► [Song persistence] ◄── parseSongResponse ◄── [Zod songSchema]  │
     │         │                                                         │
     │         └──► load / save / export / import                         │
     │                                                                   │
[Zod generateAudioSchema] ──► [Generate-audio API] ◄── REPLICATE_API    │
     │              │                    │                              │
     │              └──► [textToAudioService] ──► Result<{url}, Error>   │
     │                            │                                     │
     │                            └──► [createGeneratedAudioTrack] ────┤
     │                                                                   │
[SongData / Track / NoteEvent] ◄── types.ts                              │
     │                                                                   │
     ├──► [useUndoRedo] ──► setState → history (undo/redo)                │
     │                                                                   │
     ├──► [Audio engine] ◄── Web Audio API                              │
     │         │  setSongData, start, pause, stop                        │
     │         │  scheduleNote → playOscillator | playAudioTrack         │
     │         │  metronome, master volume, analyser                     │
     │         └──► [Visualizer]                                         │
     │                                                                   │
     └──► [App] ──► [Sequencer] [Knob] [Visualizer]                     │
              │     step toggle, track muting, params                    │
              └──► Generate → textToAudioService → new track            │
```

**Symbiotic enhancements (edges that fuse features):**

| From intent           | Edge type   | To intent              | Enhancement |
|-----------------------|------------|------------------------|-------------|
| Result<T,E>           | foundation | All I/O & parse        | No thrown exceptions in core |
| Zod schemas           | validation | API + storage + import | Single source of truth for shape |
| useUndoRedo           | state      | Song edits             | All mutations go through setState |
| createGeneratedAudioTrack | pure fn | Add generated track    | No side effects; testable |
| Audio engine          | singleton  | Playback + visualizer  | One source of time and analyser |

---

## 2. Irreducible quanta (by layer)

| Quantum              | Location              | Responsibility |
|----------------------|-----------------------|----------------|
| `Result<T, E>`       | `lib/result.ts`       | Success/failure without throw |
| `parseSongResponse`  | `schemas/songSchema.ts` | Raw → SongData (Zod + defaults) |
| `parseGenerateAudioRequest` | `schemas/generateAudioSchema.ts` | Body → request (Zod) |
| `loadSong` / `saveSong` | `services/storageService.ts` | localStorage + parseSongResponse |
| `exportSongToJson` / `importSongFromJson` | same | Export/import string ↔ SongData |
| `generateAudioFromText` | `services/textToAudioService.ts` | POST /api/generate-audio → Result<{url}> |
| `createGeneratedAudioTrack` | `lib/createGeneratedAudioTrack.ts` | url + options → Track (audio) |
| Song mutations (pure) | `lib/songMutations.ts` | addTrack, removeTrack, duplicateTrack, moveTrack, setTrack*, toggleStep, setBpm, setSwing, setStepsPerPattern, etc. |
| `AudioEngine`        | `services/audioEngine.ts` | setSongData, start/pause/stop, scheduleNote, preload audio |
| `useUndoRedo`        | `hooks/useUndoRedo.ts` | history + setState + undo/redo |
| `handler`            | `api/generate-audio.ts` | Validate → Replicate → { url } \| { error } |

**No duplication rule:** Validation lives in schemas; I/O outcomes in Result; song shape in types + songSchema; generate-audio contract in generateAudioSchema.

---

## 3. Predictive causality (data flow)

1. **User edits step** → `handleStepToggle` → `setSong(prev => …)` → `useUndoRedo` pushes history → `useEffect` → `audioEngine.setSongData(song)`.
2. **User clicks Generate** → `generateAudioFromText(prompt, 8)` → Zod request → POST → API Zod parse → Replicate → response Zod → `createGeneratedAudioTrack(url, {id, name})` → `setSong(prev => ({ ...prev, tracks: [...prev.tracks, newTrack] }))`.
3. **Load/Import** → `parseSongResponse(raw)` → Result → on ok, `setSong(result.value)` (and optionally stop playback).

Every external input (API, file, localStorage) goes through Zod then Result; every song mutation goes through `setSong` so undo/redo and audio engine stay in sync.

---

## 4. Autonomic self-repair (extension points)

| Extension point        | Current behavior              | How to extend without breaking |
|------------------------|-------------------------------|---------------------------------|
| New track type         | `Track.type`: synth \| bass \| drums \| audio | Add type in `types.ts`, `trackSchema`, and engine `scheduleNote` / UI. |
| New API (e.g. another model) | New schema + serverless handler; client service calls new route. | Keep Result + Zod; no shared mutable state. |
| New persistence       | localStorage + JSON file      | New functions in `storageService` using same `parseSongResponse` / export. |
| New UI control         | New component; read from song, call `setSong` or dedicated handler. | Only mutate via `setSong` or engine API. |

**Self-validation:** Run `pnpm run test` and `pnpm run test:coverage`; blueprint assumes all tests pass and critical paths are covered.

---

## 5. Dev-acceleration metrics (4× targets)

| Metric                  | Current (baseline) | Target   | How |
|-------------------------|---------------------|----------|-----|
| Unit test count         | 196                 | Keep and grow with new quanta | One test file per quantum (lib, schema, service, hook). |
| Integration test       | API + textToAudio   | Keep     | Mock external deps only. |
| Branch/edge coverage   | Good for schemas, result, storage | High for all public APIs | Adversarial tests: null, empty, bounds, invalid types. |
| Time to add a new “intent” | —                 | &lt; 1 day | New node = new module + schema if I/O + tests; edges = import only. |
| Regression surface     | Full app            | Isolated | No business logic in App.tsx; thin handlers that delegate to services/lib. |

**Embedded validation:** `scripts/validate-blueprint.mjs` (or `npm run validate:blueprint`) can run tests + coverage and assert thresholds.

---

## 6. Adversarial / high-branch testing strategy

To approximate “10^4 probabilistic branches” with minimal tests:

- **Schemas:** Empty string, null, undefined, wrong types, out-of-range numbers, huge arrays.
- **Result:** `unwrapOr`, `unwrapOrElse`, `mapResult`, `mapError` on ok/err.
- **Storage:** Missing key, invalid JSON, valid JSON but invalid shape (parseSongResponse).
- **Generate-audio:** Missing token (503), invalid body (400), non-JSON body, timeout, non-200 response.
- **createGeneratedAudioTrack:** Empty id, empty name, very long URL (if any limit exists).

These are implemented in existing and new tests; no direct replication of logic—only inputs and expected outputs.

---

## 7. File-to-intent map

| File(s)                    | Primary intent(s) |
|----------------------------|-------------------|
| `lib/result.ts`            | Result<T,E>       |
| `types.ts`                 | SongData, Track, NoteEvent, PlayState |
| `schemas/songSchema.ts`    | Parse/validate song |
| `schemas/generateAudioSchema.ts` | Parse/validate generate-audio request/response |
| `services/storageService.ts` | Load, save, export, import song |
| `services/textToAudioService.ts` | Generate audio from text (client) |
| `services/audioEngine.ts`  | Playback, scheduling, metronome, analyser |
| `services/geminiService.ts` | Generate SongData via OpenRouter (optional) |
| `lib/createGeneratedAudioTrack.ts` | Build audio track from URL |
| `lib/songMutations.ts`     | Pure song mutation functions (add/remove/duplicate/move track, toggle step, set bpm/swing, etc.) |
| `api/generate-audio.ts`    | Serverless generate-audio (Replicate) |
| `hooks/useUndoRedo.ts`     | Undo/redo state |
| `App.tsx`                  | Orchestration only (no business logic) |
| `components/*`             | UI only; callbacks to App |

---

## 8. Changelog (blueprint version)

- **v1** — Intent graph extracted; edges documented; self-repair extension points and metrics added; adversarial strategy defined.
