import type { Track } from '../types';

/** Default synth params for audio tracks (used for type compatibility; audio tracks ignore these). */
const DEFAULT_AUDIO_TRACK_PARAMS = {
  waveform: 'sine' as const,
  attack: 0.01,
  decay: 0.1,
  sustain: 0.5,
  release: 0.2,
  filterCutoff: 1000,
  filterRes: 1,
  gain: 0.5,
};

export interface CreateGeneratedAudioTrackOptions {
  /** Unique track ID. Required. */
  id: string;
  /** Display name. Default: "Generated". */
  name?: string;
}

/**
 * Create a Track for a generated audio clip from the text-to-audio API.
 * Pure function — no side effects. Used when adding a new generated track to the song.
 *
 * @param audioUrl - URL of the generated audio (e.g. from Replicate).
 * @param options - id (required), name (optional, default "Generated").
 * @returns Track with type 'audio', ready to append to song.tracks.
 */
export function createGeneratedAudioTrack(
  audioUrl: string,
  options: CreateGeneratedAudioTrackOptions
): Track {
  const { id, name = 'Generated' } = options;
  return {
    id,
    name,
    type: 'audio',
    notes: [],
    params: DEFAULT_AUDIO_TRACK_PARAMS,
    muted: false,
    solo: false,
    volume: 1,
    pan: 0,
    audioUrl,
  };
}
