import { z } from 'zod';

/** Valid duration range for client-side generation (seconds). Min 10, Max 15, Default 12. */
export const GENERATE_AUDIO_DURATION_MIN = 10;
export const GENERATE_AUDIO_DURATION_MAX = 15;
export const GENERATE_AUDIO_DURATION_DEFAULT = 12;

/** Max prompt length to prevent abuse. */
export const GENERATE_AUDIO_PROMPT_MAX_LENGTH = 2000;

/**
 * Legacy model version values.
 * These were used with the MusicGen/HuggingFace backend.
 * The field is still accepted for backward compatibility but is
 * ignored by the current Stable Audio 2.5 Replicate backend.
 */
export const MUSICGEN_MODEL_VERSIONS = [
  'small',
  'large',
  'stereo-large',
  'melody-large',
  'stereo-melody-large',
] as const;

export type MusicgenModelVersion = (typeof MUSICGEN_MODEL_VERSIONS)[number];
export type MusicGenModelVersion = MusicgenModelVersion;

/** Default model version for the MusicGen/Stable Audio backend. */
export const MUSICGEN_MODEL_VERSION_DEFAULT: MusicgenModelVersion = 'large';

/** All supported model_version values (including legacy MusicGen). */
export const SUPPORTED_MODEL_VERSIONS = MUSICGEN_MODEL_VERSIONS;

/**
 * Zod schema for the generate-audio API request body.
 * Shared between client and server for type safety.
 */
export const generateAudioRequestSchema = z.object({
  prompt: z
    .string({ error: 'Missing or empty prompt' })
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, 'Missing or empty prompt')
        .max(GENERATE_AUDIO_PROMPT_MAX_LENGTH, 'Prompt too long')
    ),
  duration: z
    .number()
    .optional()
    .default(GENERATE_AUDIO_DURATION_DEFAULT)
    .transform((v) =>
      Math.max(
        GENERATE_AUDIO_DURATION_MIN,
        Math.min(GENERATE_AUDIO_DURATION_MAX, Math.round(v))
      )
    ),
  model_version: z
    .enum(MUSICGEN_MODEL_VERSIONS)
    .optional()
    .default(MUSICGEN_MODEL_VERSION_DEFAULT),
});

export type GenerateAudioRequest = z.infer<typeof generateAudioRequestSchema>;

/**
 * Parse and validate an incoming generate-audio request body.
 * Returns { ok: true, data } on success or { ok: false, error: string } on failure.
 */
export function parseGenerateAudioRequest(
  raw: unknown
): { ok: true; data: GenerateAudioRequest } | { ok: false; error: string } {
  const parsed = generateAudioRequestSchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }
  const e = parsed.error as { message?: string; issues?: Array<{ message?: string }> };
  const msg =
    (Array.isArray(e.issues) ? e.issues.map((i) => i.message).join('; ') : null) ||
    e.message ||
    'Invalid request';
  return { ok: false, error: msg };
}

/**
 * Zod schema for the generate-audio API response body.
 * Either { url: string } on success or { error: string } on failure.
 */
export const generateAudioResponseSchema = z.union([
  z.object({ url: z.string().url() }),
  z.object({ error: z.string() }),
]);
