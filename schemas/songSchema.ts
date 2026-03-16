import { z } from 'zod';
import type { SongData, StepsPerPattern } from '../types';
import { ok, err, type Result } from '../lib/result';

/** Runtime validation for external input (e.g. Gemini API response). */

const waveformSchema = z.enum(['sine', 'square', 'sawtooth', 'triangle']);
const trackTypeSchema = z.enum(['synth', 'bass', 'drums', 'audio', 'sampler']);
const stepsPerPatternSchema = z.union([z.literal(8), z.literal(16), z.literal(32)]);

/** Max step index for a given stepsPerPattern (stepsPerPattern - 1). */
export function maxStepIndex(steps: StepsPerPattern): number {
  return steps - 1;
}

export const noteEventSchema = z.object({
  note: z.string(),
  startStep: z.number().int().min(0).max(31),
  durationSteps: z.number().int().min(1).max(32),
  velocity: z.number().min(0).max(1).optional(),
});

export const audioSampleSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  trimStart: z.number().min(0).optional(),
  trimEnd: z.number().min(0).optional(),
  loop: z.boolean().optional(),
  loopStart: z.number().min(0).optional(),
  loopEnd: z.number().min(0).optional(),
  rootNote: z.string().optional(),
  minNote: z.string().optional(),
  maxNote: z.string().optional(),
  minVelocity: z.number().min(0).max(1).optional(),
  maxVelocity: z.number().min(0).max(1).optional(),
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
  params: synthParamsSchema.optional(),
  muted: z.boolean().optional(),
  solo: z.boolean().optional(),
  volume: z.number().min(0).max(2).optional(),
  pan: z.number().min(-1).max(1).optional(),
  audioUrl: z.string().url().optional(),
  audioTrimStart: z.number().min(0).optional(),
  audioTrimEnd: z.number().min(0).optional(),
  samples: z.array(audioSampleSchema).optional(),
});

export const songDataSchema = z.object({
  title: z.string(),
  bpm: z.number().int().min(1).max(999),
  stepsPerPattern: stepsPerPatternSchema.optional(),
  swing: z.number().min(0).max(100).optional(),
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
  const stepsPerPattern: StepsPerPattern = data.stepsPerPattern ?? 16;
  const defaultParams = {
    waveform: 'sine' as const,
    attack: 0.01,
    decay: 0.1,
    sustain: 0.5,
    release: 0.2,
    filterCutoff: 1000,
    filterRes: 1,
    gain: 0.5,
  };
  const song: SongData = {
    title: data.title,
    bpm: data.bpm,
    stepsPerPattern,
    swing: data.swing ?? 0,
    tracks: data.tracks.map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      notes: t.notes ?? [],
      params: t.params ?? defaultParams,
      muted: t.muted ?? false,
      solo: t.solo ?? false,
      volume: t.volume ?? 1,
      pan: t.pan ?? 0,
      audioUrl: t.audioUrl,
      audioTrimStart: t.audioTrimStart,
      audioTrimEnd: t.audioTrimEnd,
      samples: t.samples,
    })),
  };
  return ok(song);
}
