import { z } from 'zod';

export const GENERATE_AUDIO_DURATION_MIN = 10;
export const GENERATE_AUDIO_DURATION_MAX = 15;
export const GENERATE_AUDIO_DURATION_DEFAULT = 12;

/** MiniMax Music 01 lyrics field limit (Replicate). Validation here avoids silent truncation. */
export const GENERATE_AUDIO_PROMPT_MAX_LENGTH = 400;

/**
 * Request body for POST /api/generate-audio (MiniMax Music 01).
 * Only prompt is sent to the model; duration is optional for client UI compatibility.
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

export const generateAudioSuccessSchema = z.object({
  url: z.string().url(),
});

export const generateAudioErrorSchema = z.object({
  error: z.string(),
});

export const generateAudioResponseSchema = z.union([
  generateAudioSuccessSchema,
  generateAudioErrorSchema,
]);

export type GenerateAudioSuccess = z.infer<typeof generateAudioSuccessSchema>;
export type GenerateAudioError = z.infer<typeof generateAudioErrorSchema>;
export type GenerateAudioResponse = z.infer<typeof generateAudioResponseSchema>;

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
