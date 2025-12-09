# Doom DAW / Irken Audio Lab

## Project Overview
This project is a web-based Digital Audio Workstation (DAW) built with React and TypeScript, featuring a "Cyberpunk/Doom" aesthetic. It allows users to create music patterns using a 16-step sequencer, synthesized instruments, and AI-powered generation.

**Key Features:**
- **Sequencer:** 16-step grid for programming notes across multiple tracks (Synth, Bass, Drums).
- **Audio Engine:** Custom Web Audio API implementation supporting multiple waveforms (Sine, Square, Sawtooth, Triangle), ADSR envelopes, and Filters.
- **AI Generation:** Integration with Google Gemini to generate musical patterns and parameters based on text prompts (e.g., "Dark cyberpunk bassline").
- **Visualization:** Real-time audio visualizers.
- **UI:** Distinctive neon/dark mode interface with custom controls (Knobs).

## Tech Stack
- **Framework:** React 19
- **Build Tool:** Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS (inferred from class usage) + Custom CSS
- **Audio:** Native Web Audio API
- **AI:** Google GenAI SDK (`@google/genai`)
- **Icons:** Lucide React

## Project Structure

### Core Application
- **`App.tsx`**: The main entry point and container. Manages global state (Song Data, Playback State) and coordinates between the UI and the Audio Engine.
- **`types.ts`**: Defines core data models:
    - `SongData`: The complete project state.
    - `Track`: Individual instrument tracks.
    - `NoteEvent`: Musical notes data (pitch, start, duration).
    - `SynthParams`: Sound synthesis parameters (ADSR, Filter, Waveform).

### Services
- **`services/audioEngine.ts`**: A singleton class managing the Web Audio API context.
    - Handles precise scheduling of notes (lookahead scheduler).
    - Manages audio nodes (Oscillators, Gain, Filters).
    - Exposes methods for `start`, `stop`, `pause`, and `triggerNote`.
- **`services/geminiService.ts`**: Handles interaction with the Gemini API to transform text prompts into `SongData` structures.

### Components
- **`components/Sequencer.tsx`**: Grid interface for placing notes.
- **`components/Knob.tsx`**: Rotary control component for adjusting parameters like Cutoff, Resonance, and ADSR.
- **`components/Visualizer.tsx`**: Renders real-time audio analysis (FFT data).

## Setup & Development

### Prerequisites
- Node.js
- Google Gemini API Key

### Installation
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure Environment:
   Create a `.env.local` file and add your API key:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```

### Scripts
- **Start Dev Server:**
  ```bash
  npm run dev
  ```
- **Build for Production:**
  ```bash
  npm run build
  ```
- **Preview Production Build:**
  ```bash
  npm run preview
  ```

## Development Conventions
- **State Management:** React `useState` and `useEffect` are used for local state. The `AudioEngine` is treated as a side-effectful service synchronized via `useEffect`.
- **Styling:** extensive use of utility classes (Tailwind-like) mixed with custom "cyber" aesthetic styles.
- **Audio Scheduling:** Uses a "lookahead" scheduler pattern common in Web Audio to ensure precise timing despite the main thread's event loop.
