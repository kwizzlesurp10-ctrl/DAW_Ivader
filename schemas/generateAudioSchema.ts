import { z } from 'zod';

/** Valid duration range for MusicGen (seconds). */
export const GENERATE_AUDIO_DURATION_MIN = 1;
export const GENERATE_AUDIO_DURATION_MAX = 30;
export const GENERATE_AUDIO_DURATION_DEFAULT = 8;

/** Max prompt length to prevent abuse. */
export const GENERATE_AUDIO_PROMPT_MAX_LENGTH = 2000;

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
