import { z } from 'zod';

/** Valid duration range for Stable Audio (seconds). */
export const GENERATE_AUDIO_DURATION_MIN = 1;
export const GENERATE_AUDIO_DURATION_MAX = 45;
export const GENERATE_AUDIO_DURATION_DEFAULT = 15;

/** Max prompt length to prevent abuse. */
export const GENERATE_AUDIO_PROMPT_MAX_LENGTH = 2000;

/**
 * Available Stable Audio model versions on Replicate.
 */
export const STABLE_AUDIO_MODEL_VERSIONS = [
  'stable-audio-2.5',
  'stable-audio-open-1.0',
] as const;

export type StableAudioModelVersion = (typeof STABLE_AUDIO_MODEL_VERSIONS)[number];

export const STABLE_AUDIO_MODEL_VERSION_DEFAULT: StableAudioModelVersion = 'stable-audio-2.5';

export const AUDIO_GENERATION_BACKENDS = ['replicate', 'comfyui'] as const;

export type AudioGenerationBackend = (typeof AUDIO_GENERATION_BACKENDS)[number];

export const AUDIO_GENERATION_BACKEND_DEFAULT: AudioGenerationBackend = 'replicate';

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
  negative_prompt: z
    .string()
    .optional()
    .transform((s) => (s ?? '').trim()),
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
  steps: z
    .number()
    .optional()
    .default(8)
    .transform((v) => Math.max(4, Math.min(8, Math.round(v)))),
  cfg_scale: z
    .number()
    .optional()
    .default(7)
    .transform((v) => Math.max(1, Math.min(20, v))),
  model_version: z
    .enum(STABLE_AUDIO_MODEL_VERSIONS)
    .optional()
    .default(STABLE_AUDIO_MODEL_VERSION_DEFAULT),
  backend: z
    .enum(AUDIO_GENERATION_BACKENDS)
    .optional()
    .default(AUDIO_GENERATION_BACKEND_DEFAULT),
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
  const e = parsed.error;
  const msg =
    (Array.isArray(e.issues) ? e.issues.map((i) => i.message).filter(Boolean).join('; ') : null) ||
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

export type GenerateAudioResponse = z.infer<typeof generateAudioResponseSchema>;
export type GenerateAudioSuccess = Extract<GenerateAudioResponse, { url: string }>;