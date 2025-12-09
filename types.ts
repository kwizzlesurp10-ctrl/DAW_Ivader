export interface NoteEvent {
  note: string; // e.g., "C4", "A#3"
  startStep: number; // 0-15 (for a 16 step sequencer)
  durationSteps: number;
}

export interface Track {
  id: string;
  name: string;
  type: 'synth' | 'bass' | 'drums';
  notes: NoteEvent[];
  params: SynthParams;
  muted: boolean;
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

export interface SongData {
  title: string;
  bpm: number;
  tracks: Track[];
}

export enum PlayState {
  STOPPED,
  PLAYING,
  PAUSED
}
