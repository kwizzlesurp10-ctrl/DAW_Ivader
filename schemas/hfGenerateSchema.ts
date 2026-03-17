import { z } from 'zod';

/** Supported generation types for the HuggingFace generate endpoint. */
export const HF_GENERATE_TYPES = ['text', 'image'] as const;
export type HfGenerateType = (typeof HF_GENERATE_TYPES)[number];

/** Max prompt length. */
export const HF_GENERATE_PROMPT_MAX_LENGTH = 2000;

/**
 * Zod schema for POST /api/hf-generate request body.
 */
export const hfGenerateRequestSchema = z.object({
  type: z.enum(HF_GENERATE_TYPES, { error: 'type must be "text" or "image"' }),
  prompt: z
    .string({ error: 'Missing or empty prompt' })
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, 'Missing or empty prompt')
        .max(HF_GENERATE_PROMPT_MAX_LENGTH, 'Prompt too long')
    ),
});

export type HfGenerateRequest = z.infer<typeof hfGenerateRequestSchema>;

/**
 * Parse and validate an incoming hf-generate request body.
 */
export function parseHfGenerateRequest(
  raw: unknown
): { ok: true; data: HfGenerateRequest } | { ok: false; error: string } {
  const parsed = hfGenerateRequestSchema.safeParse(raw);
  if (parsed.success) return { ok: true, data: parsed.data };
  const e = parsed.error as { message?: string; issues?: Array<{ message?: string }> };
  const msg =
    (Array.isArray(e.issues) ? e.issues.map((i) => i.message).join('; ') : null) ||
    e.message ||
    'Invalid request';
  return { ok: false, error: msg };
}
