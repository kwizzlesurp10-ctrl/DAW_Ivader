import { z } from 'zod';
import type { SongData } from '../types';
import { ok, err, type Result } from '../lib/result';

/** Runtime validation for external input (e.g. Gemini API response). */

const waveformSchema = z.enum(['sine', 'square', 'sawtooth', 'triangle']);
const trackTypeSchema = z.enum(['synth', 'bass', 'drums']);

export const noteEventSchema = z.object({
  note: z.string(),
  startStep: z.number().int().min(0).max(15),
  durationSteps: z.number().int().min(1).max(16),
});

export const synthParamsSchema = z.object({
  waveform: waveformSchema,
  attack: z.number().min(0),
  decay: z.number().min(0),
  sustain: z.number().min(0).max(1),
  release: z.number().min(0),
  filterCutoff: z.number().min(0),
  filterRes: z.number().min(0),
  gain: z.number().min(0).max(2),
});

export const trackSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: trackTypeSchema,
  notes: z.array(noteEventSchema),
  params: synthParamsSchema,
  muted: z.boolean().optional(),
});

export const songDataSchema = z.object({
  title: z.string(),
  bpm: z.number().int().min(1).max(999),
  tracks: z.array(trackSchema).min(1),
});

export type SongDataParseResult = z.infer<typeof songDataSchema>;

/**
 * Parse raw API response into SongData. Pure function for testing.
 * @param raw - JSON.parse() output or unknown
 * @returns Result with SongData (muted defaulted) or Error
 */
export function parseSongResponse(raw: unknown): Result<SongData, Error> {
  const parsed = songDataSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new Error(`Invalid song data: ${parsed.error.message}`));
  }
  const data = parsed.data;
  const song: SongData = {
    title: data.title,
    bpm: data.bpm,
    tracks: data.tracks.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      notes: t.notes,
      params: t.params,
      muted: t.muted ?? false,
    })),
  };
  return ok(song);
}
