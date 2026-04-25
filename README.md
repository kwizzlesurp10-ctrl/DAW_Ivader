# DOOM DAW - IRKEN Audio Lab

A modern, in-browser Digital Audio Workstation (DAW) with AI-assisted generation, step sequencer, and full project persistence.

## Project Overview

- **Purpose:** A fully functional web-based DAW that integrates AI music generation (Stable Audio 2.5) to allow users to create and arrange tracks.
- **Main Technologies:**
    - **Frontend:** Next.js App Router, React 19, TypeScript 5, Tailwind CSS.
    - **Audio:** Web Audio API for synthesis, scheduling, and playback.
    - **AI Generation:** Stable Audio 2.5 via Replicate, optional local ComfyUI audio workflows, plus AI SDK streaming chat through Vercel AI Gateway.
    - **Auth:** Clerk protects the app and AI/audio API routes.
    - **State Management:** Custom `useUndoRedo` hook for song state and history.
    - **Validation:** Zod for runtime type checking of external data and imports.
    - **Error Handling:** `Result<T, E>` pattern for robust error management without exceptions in core logic.

## Architecture & Data Flow

- **Song State:** Managed in `App.tsx` via `useUndoRedo`. Mutations are handled by pure functions in `lib/songMutations.ts`.
- **Audio Engine:** A singleton (`services/audioEngine.ts`) that syncs with the song data and handles real-time playback and synthesis.
- **Persistence:** `services/storageService.ts` handles saving/loading to `localStorage` and exporting/importing JSON files.
- **AI Integration:** `textToAudioService.ts` calls the protected Next route handler (`app/api/generate-audio/route.ts`) which routes to Replicate or local ComfyUI. `app/api/chat/route.ts` streams chat responses through the AI SDK.
- **Validation:** All external inputs (API responses, file imports) are validated against Zod schemas in `schemas/`.

## Development Workflow

### Building and Running
- **Install Dependencies:** `pnpm install`
- **Development Server:** `pnpm dev`
- **Production Build:** `pnpm build`
- **Preview Production Build:** `pnpm preview`
- **Deploy to Vercel:** `npx vercel --prod`

### Testing & Validation
- **Run All Tests:** `pnpm test` (uses Vitest).
- **Watch Mode:** `pnpm test:watch`
- **Coverage:** `pnpm test:coverage`
- **Validate Blueprint:** `pnpm validate:blueprint` (checks architecture and coverage thresholds).
- **Validate Local ComfyUI:** `pnpm test:comfyui -- "short drum loop"` after ComfyUI is running and `workflows/comfy-audio-api.json` has been replaced with an exported API workflow.

### Local ComfyUI Backend

The Generate backend toggle can use local ComfyUI at `COMFYUI_BASE_URL` while keeping Replicate available. Export your ComfyUI audio workflow in API format and replace `workflows/comfy-audio-api.json`.

If the automatic prompt injection cannot find the right text input, set `COMFYUI_PROMPT_NODE_ID` and `COMFYUI_PROMPT_INPUT_KEY` in `.env`. The smoke script checks `/system_stats`, submits `/prompt`, polls `/history/{prompt_id}`, and returns the first audio/file output as a `/view` URL.

## Development Conventions

- **Strict Typing:** No `any` allowed; explicit return types on all public functions.
- **Immutable State:** All song modifications MUST go through the pure functions in `lib/songMutations.ts` and be applied via `setSong` from the `useUndoRedo` hook.
- **Result Pattern:** Use the `Result` type for functions that can fail, especially those involving I/O or parsing.
- **Component Styling:** Use Tailwind CSS for all UI styling.
- **Iconography:** Use `lucide-react` for UI icons.