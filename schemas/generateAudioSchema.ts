import { z } from 'zod';

/** Valid duration range for MusicGen (seconds). Limited to 10–15s for faster generation and lower timeouts. */
export const GENERATE_AUDIO_DURATION_MIN = 10;
export const GENERATE_AUDIO_DURATION_MAX = 15;
export const GENERATE_AUDIO_DURATION_DEFAULT = 12;

/** Max prompt length to prevent abuse. */
export const GENERATE_AUDIO_PROMPT_MAX_LENGTH = 2000;

/**
 * Available MusicGen model versions.
 * - small: 300M parameters, faster (HuggingFace Inference API only)
 * - large: 3.3B parameters, mono output (default)
 * - stereo-large: 3.3B parameters, stereo output (premium)
 * - melody-large: 3.3B parameters, supports melody conditioning (premium)
 * - stereo-melody-large: 3.3B parameters, stereo + melody conditioning (premium)
 */
export const MUSICGEN_MODEL_VERSIONS = [
  'small',
  'large',
  'stereo-large',
  'melody-large',
  'stereo-melody-large',
] as const;

export type MusicGenModelVersion = (typeof MUSICGEN_MODEL_VERSIONS)[number];

export const MUSICGEN_MODEL_VERSION_DEFAULT: MusicGenModelVersion = 'large';

/**
 * Request body for POST /api/generate-audio.
 * Validated with Zod on both client (before send) and server.
 */
export const generateAudioRequestSchema = z.object({
  prompt: z
    .optional(z.string())
    .transform((s) => (s ?? '').trim())
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
      Math.max(GENERATE_AUDIO_DURATION_MIN, Math.min(GENERATE_AUDIO_DURATION_MAX, Math.round(v)))
    ),
  model_version: z
    .enum(MUSICGEN_MODEL_VERSIONS)
    .optional()
    .default(MUSICGEN_MODEL_VERSION_DEFAULT),
});

export type GenerateAudioRequest = z.infer<typeof generateAudioRequestSchema>;

/** Successful response shape. */
export const generateAudioSuccessSchema = z.object({
  url: z.string().url(),
});

/** Error response shape. */
export const generateAudioErrorSchema = z.object({
  error: z.string(),
});

/** Union of possible API responses. */
export const generateAudioResponseSchema = z.union([
  generateAudioSuccessSchema,
  generateAudioErrorSchema,
]);

export type GenerateAudioSuccess = z.infer<typeof generateAudioSuccessSchema>;
export type GenerateAudioError = z.infer<typeof generateAudioErrorSchema>;
export type GenerateAudioResponse = z.infer<typeof generateAudioResponseSchema>;

/**
 * Parse raw request body into validated GenerateAudioRequest.
 * Use on server.
 */
export function parseGenerateAudioRequest(raw: unknown): { ok: true; data: GenerateAudioRequest } | { ok: false; error: string } {
  const parsed = generateAudioRequestSchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }
  const err = parsed.error as { message?: string; issues?: Array<{ message?: string }> };
  const msg =
    (Array.isArray(err.issues) ? err.issues.map((i) => i.message).join('; ') : null) ||
    err.message ||
    'Invalid request';
  return { ok: false, error: msg };
}
