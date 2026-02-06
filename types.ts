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
  type: 'synth' | 'bass' | 'drums';
  notes: NoteEvent[];
  params: SynthParams;
  muted: boolean;
  solo: boolean;
  /** Per-track mixer volume 0..1. Applied after synth gain. */
  volume: number;
  /** Stereo pan -1 (left) .. 0 (center) .. 1 (right). */
  pan: number;
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

export interface SongData {
  title: string;
  bpm: number;
  /** Steps per pattern (grid length). */
  stepsPerPattern: StepsPerPattern;
  /** Swing 0..100. */
  swing: SwingPercent;
  tracks: Track[];
}

export enum PlayState {
  STOPPED,
  PLAYING,
  PAUSED
}
