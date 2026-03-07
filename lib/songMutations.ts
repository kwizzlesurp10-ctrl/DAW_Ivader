/**
 * Pure song mutation functions. All return new SongData (or null when mutation is invalid).
 * No side effects; intended for use with useUndoRedo setState so undo/redo stays consistent.
 */

import type { SongData, Track, NoteEvent, SynthParams, StepsPerPattern } from '../types';

const DEFAULT_SYNTH_PARAMS: SynthParams = {
  waveform: 'sine',
  attack: 0.01,
  decay: 0.1,
  sustain: 0.5,
  release: 0.2,
  filterCutoff: 1000,
  filterRes: 1,
  gain: 0.5,
};

function findTrackIndex(song: SongData, trackId: string): number {
  return song.tracks.findIndex((t) => t.id === trackId);
}

/**
 * Add a new track to the song. Caller provides the full track (with unique id).
 */
export function addTrack(song: SongData, newTrack: Track): SongData {
  return { ...song, tracks: [...song.tracks, newTrack] };
}

/**
 * Remove a track by id. Returns null if song would have zero tracks or track not found.
 */
export function removeTrack(song: SongData, trackId: string): SongData | null {
  if (song.tracks.length <= 1) return null;
  const i = findTrackIndex(song, trackId);
  if (i === -1) return null;
  return { ...song, tracks: song.tracks.filter((t) => t.id !== trackId) };
}

/**
 * Duplicate a track; insert copy after the original. newId must be unique.
 */
export function duplicateTrack(
  song: SongData,
  trackId: string,
  newId: string,
  nameSuffix: string = ' COPY'
): SongData | null {
  const track = song.tracks.find((t) => t.id === trackId);
  if (!track) return null;
  const i = findTrackIndex(song, trackId);
  const newTrack: Track = { ...track, id: newId, name: track.name + nameSuffix };
  const newTracks = [...song.tracks];
  newTracks.splice(i + 1, 0, newTrack);
  return { ...song, tracks: newTracks };
}

/**
 * Move a track up or down by one position. Returns null if already at boundary or not found.
 */
export function moveTrack(
  song: SongData,
  trackId: string,
  direction: 'up' | 'down'
): SongData | null {
  const i = findTrackIndex(song, trackId);
  if (i === -1) return null;
  if (direction === 'up' && i === 0) return null;
  if (direction === 'down' && i === song.tracks.length - 1) return null;
  const j = direction === 'up' ? i - 1 : i + 1;
  const newTracks = [...song.tracks];
  [newTracks[i], newTracks[j]] = [newTracks[j], newTracks[i]];
  return { ...song, tracks: newTracks };
}

/**
 * Set a track's muted flag.
 */
export function setTrackMuted(song: SongData, trackId: string, muted: boolean): SongData | null {
  const i = findTrackIndex(song, trackId);
  if (i === -1) return null;
  const newTracks = [...song.tracks];
  newTracks[i] = { ...newTracks[i], muted };
  return { ...song, tracks: newTracks };
}

/**
 * Set a track's solo flag.
 */
export function setTrackSolo(song: SongData, trackId: string, solo: boolean): SongData | null {
  const i = findTrackIndex(song, trackId);
  if (i === -1) return null;
  const newTracks = [...song.tracks];
  newTracks[i] = { ...newTracks[i], solo };
  return { ...song, tracks: newTracks };
}

/**
 * Set a track's volume (clamped 0–2).
 */
export function setTrackVolume(song: SongData, trackId: string, volume: number): SongData | null {
  const i = findTrackIndex(song, trackId);
  if (i === -1) return null;
  const newTracks = [...song.tracks];
  newTracks[i] = { ...newTracks[i], volume: Math.max(0, Math.min(2, volume)) };
  return { ...song, tracks: newTracks };
}

/**
 * Set a track's pan (clamped -1–1).
 */
export function setTrackPan(song: SongData, trackId: string, pan: number): SongData | null {
  const i = findTrackIndex(song, trackId);
  if (i === -1) return null;
  const newTracks = [...song.tracks];
  newTracks[i] = { ...newTracks[i], pan: Math.max(-1, Math.min(1, pan)) };
  return { ...song, tracks: newTracks };
}

/**
 * Update a single synth param on a track.
 */
export function updateTrackParam(
  song: SongData,
  trackId: string,
  param: keyof SynthParams,
  value: number
): SongData | null {
  const i = findTrackIndex(song, trackId);
  if (i === -1) return null;
  const newTracks = [...song.tracks];
  newTracks[i] = {
    ...newTracks[i],
    params: { ...newTracks[i].params, [param]: value },
  };
  return { ...song, tracks: newTracks };
}

/**
 * Set a track's waveform (oscillator type).
 */
export function setTrackWaveform(
  song: SongData,
  trackId: string,
  waveform: SynthParams['waveform']
): SongData | null {
  const i = findTrackIndex(song, trackId);
  if (i === -1) return null;
  const newTracks = [...song.tracks];
  newTracks[i] = {
    ...newTracks[i],
    params: { ...newTracks[i].params, waveform },
  };
  return { ...song, tracks: newTracks };
}

/**
 * Toggle a step on a track: add default note if empty, remove note if present.
 */
export function toggleStep(song: SongData, trackId: string, step: number): SongData | null {
  const i = findTrackIndex(song, trackId);
  if (i === -1) return null;
  const track = song.tracks[i];
  const hasNoteAtStep = track.notes.some(
    (n) => step >= n.startStep && step < n.startStep + n.durationSteps
  );
  const newTracks = [...song.tracks];
  if (hasNoteAtStep) {
    newTracks[i] = {
      ...track,
      notes: track.notes.filter(
        (n) => !(step >= n.startStep && step < n.startStep + n.durationSteps)
      ),
    };
  } else {
    const defaultNote: NoteEvent =
      track.type === 'drums'
        ? { note: 'kick', startStep: step, durationSteps: 1 }
        : track.type === 'bass'
          ? { note: 'C2', startStep: step, durationSteps: 4 }
          : { note: 'C4', startStep: step, durationSteps: 2 };
    newTracks[i] = {
      ...track,
      notes: [...track.notes, defaultNote].sort((a, b) => a.startStep - b.startStep),
    };
  }
  return { ...song, tracks: newTracks };
}

/**
 * Set BPM (clamped 1–999, rounded).
 */
export function setBpm(song: SongData, bpm: number): SongData {
  const clamped = Math.max(1, Math.min(999, Math.round(bpm)));
  return { ...song, bpm: clamped };
}

/**
 * Set steps per pattern (8, 16, or 32).
 */
export function setStepsPerPattern(song: SongData, steps: StepsPerPattern): SongData {
  return { ...song, stepsPerPattern: steps };
}

/**
 * Set swing (0–100).
 */
export function setSwing(song: SongData, swing: number): SongData {
  const clamped = Math.max(0, Math.min(100, Math.round(swing)));
  return { ...song, swing: clamped };
}

/**
 * Set song title.
 */
export function setTitle(song: SongData, title: string): SongData {
  return { ...song, title };
}

/**
 * Replace entire song (e.g. after load/import). Exposed for consistency.
 */
export function replaceSong(_song: SongData, next: SongData): SongData {
  return next;
}

/**
 * Append a track (e.g. after generate or audio sampler load). Same as addTrack; alias for clarity.
 */
export function appendTrack(song: SongData, newTrack: Track): SongData {
  return addTrack(song, newTrack);
}

/** Default params for a new synth track when adding from UI. */
export function defaultSynthParams(): SynthParams {
  return { ...DEFAULT_SYNTH_PARAMS };
}

/**
 * Build a new empty synth track. Caller must provide unique id and name.
 */
export function createEmptySynthTrack(id: string, name: string): Track {
  return {
    id,
    name,
    type: 'synth',
    notes: [],
    params: { ...DEFAULT_SYNTH_PARAMS },
    muted: false,
    solo: false,
    volume: 1,
    pan: 0,
  };
}
