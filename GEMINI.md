# DOOM DAW — IRKEN Audio Lab

A modern, in-browser Digital Audio Workstation (DAW) with AI-assisted generation, step sequencer, and full project persistence.

## Project Overview

- **Purpose:** A fully functional web-based DAW that integrates AI music generation (Stable Audio 2.5) to allow users to create and arrange tracks.
- **Main Technologies:**
    - **Frontend:** React 19, Vite 6, TypeScript 5.8, Tailwind CSS.
    - **Audio:** Web Audio API for synthesis, scheduling, and playback.
    - **AI Generation:** Stable Audio 2.5 via Replicate (serverless API).
    - **State Management:** Custom `useUndoRedo` hook for song state and history.
    - **Validation:** Zod for runtime type checking of external data and imports.
    - **Error Handling:** `Result<T, E>` pattern for robust error management without exceptions in core logic.

## Architecture & Data Flow

- **Song State:** Managed in `App.tsx` via `useUndoRedo`. Mutations are handled by pure functions in `lib/songMutations.ts`.
- **Audio Engine:** A singleton (`services/audioEngine.ts`) that syncs with the song data and handles real-time playback and synthesis.
- **Persistence:** `services/storageService.ts` handles saving/loading to `localStorage` and exporting/importing JSON files.
- **AI Integration:** `textToAudioService.ts` calls a Vercel serverless function (`api/generate-audio.ts`) which interacts with Replicate.
- **Validation:** All external inputs (API responses, file imports) are validated against Zod schemas in `schemas/`.

## Key Files & Directories

- `App.tsx`: The main orchestration component.
- `services/audioEngine.ts`: Core Web Audio API implementation.
- `lib/songMutations.ts`: Pure functions for all song state modifications.
- `schemas/`: Zod schemas for song data and API requests/responses.
- `api/generate-audio.ts`: Serverless API endpoint for music generation (using Replicate).
- `docs/ARCHITECTURE.md`: Detailed architectural documentation.
- `docs/INTENT_BLUEPRINT.md`: The system's "intent graph" and dependency map.

## Development Workflow

### Building and Running
- **Install Dependencies:** `npm install` or `pnpm install`
- **Development Server:** `npm run dev` (use `vercel dev` if you need to test the `/api` routes locally).
- **Production Build:** `npm run build`
- **Preview Production Build:** `npm run preview`
- **Deploy to Vercel:** `npx vercel --prod`

### Testing & Validation
- **Run All Tests:** `npm run test` (uses Vitest).
- **Watch Mode:** `npm run test:watch`
- **Coverage:** `npm run test:coverage`
- **Validate Blueprint:** `npm run validate:blueprint` (checks architecture and coverage thresholds).

## Development Conventions

- **Strict Typing:** No `any` allowed; explicit return types on all public functions.
- **Immutable State:** All song modifications MUST go through the pure functions in `lib/songMutations.ts` and be applied via `setSong` from the `useUndoRedo` hook.
- **Result Pattern:** Use the `Result` type for functions that can fail, especially those involving I/O or parsing.
- **Component Styling:** Use Tailwind CSS for all UI styling.
- **Iconography:** Use `lucide-react` for UI icons.

## Environment Variables
- `REPLICATE_API_TOKEN`: Required for the music generation feature.
- `GEMINI_API_KEY`: Optional, used for experimental features (see `geminiService.ts`).
