/** Step index for the sequencer (0-based, max depends on stepsPerPattern). */
export type StepIndex = number;

export interface NoteEvent {
  note: string; // e.g., "C4", "A#3", "kick", "snare"
  startStep: number;
  durationSteps: number;
}

export type StepsPerPattern = 8 | 16 | 32;

export interface Track {
  id: string;
  name: string;
  type: 'synth' | 'bass' | 'drums' | 'audio';
  notes: NoteEvent[];
  params: SynthParams;
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  /** For type 'audio': URL of the generated or imported audio clip. Played from step 0. */
  audioUrl?: string;
  /** For type 'audio': Optional trim start time in seconds */
  audioTrimStart?: number;
  /** For type 'audio': Optional trim end time in seconds */
  audioTrimEnd?: number;
}

export interface SynthParams {
  waveform: 'sine' | 'square' | 'sawtooth' | 'triangle';
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterCutoff: number;
  filterRes: number;
  gain: number;
}

/** Swing percentage 0..100. 0 = straight, 50 = moderate swing. */
export type SwingPercent = number;

/** Number of drum rack pads (4×4). */
export const DRUM_PAD_COUNT = 16;

/** One pad slot: optional generated/imported clip. Retriggers on pattern downbeat with transport. */
export interface DrumPadSlot {
  name: string;
  audioUrl?: string;
  audioTrimStart?: number;
  audioTrimEnd?: number;
  /** When true, pad is silent in playback (still assignable). */
  muted?: boolean;
}

export function createEmptyDrumPads(): DrumPadSlot[] {
  return Array.from({ length: DRUM_PAD_COUNT }, (_, i) => ({
    name: `Pad ${i + 1}`,
  }));
}

export interface SongData {
  title: string;
  bpm: number;
  /** Steps per pattern (grid length). */
  stepsPerPattern: StepsPerPattern;
  /** Swing 0..100. */
  swing: SwingPercent;
  tracks: Track[];
  /** MPC-style pads; clips sync to pattern length / BPM (retrigger at step 0). */
  drumPads: DrumPadSlot[];
}

export enum PlayState {
  STOPPED,
  PLAYING,
  PAUSED
}
