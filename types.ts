/** Step index for the sequencer (0-based, max depends on stepsPerPattern). */
export type StepIndex = number;

export interface NoteEvent {
  note: string; // e.g., "C4", "A#3", "kick", "snare"
  startStep: number;
  durationSteps: number;
  velocity?: number; // 0..1 (default 1)
}

export type StepsPerPattern = 8 | 16 | 32;

export interface AudioSample {
  id: string;
  name: string;
  url: string;
  trimStart?: number;
  trimEnd?: number;
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;
  rootNote?: string; // e.g. "C4" - the note the original sample represents
  minNote?: string; // Lower bound of the key zone
  maxNote?: string; // Upper bound of the key zone
  minVelocity?: number; // 0..1
  maxVelocity?: number; // 0..1
}

export interface Track {
  id: string;
  name: string;
  type: 'synth' | 'bass' | 'drums' | 'audio' | 'sampler';
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
  /** For type 'sampler': list of samples with zones. */
  samples?: AudioSample[];
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
