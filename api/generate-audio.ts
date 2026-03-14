import Replicate from 'replicate';
import { z } from 'zod';

// Inlined from schemas/generateAudioSchema.ts
const GENERATE_AUDIO_DURATION_MIN = 10;
const GENERATE_AUDIO_DURATION_MAX = 15;
const GENERATE_AUDIO_DURATION_DEFAULT = 12;
const GENERATE_AUDIO_PROMPT_MAX_LENGTH = 2000;
const MUSICGEN_MODEL_VERSIONS = ['small', 'large', 'stereo-large', 'melody-large', 'stereo-melody-large'] as const;
type MusicGenModelVersion = (typeof MUSICGEN_MODEL_VERSIONS)[number];
const MUSICGEN_MODEL_VERSION_DEFAULT: MusicGenModelVersion = 'large';
const generateAudioRequestSchema = z.object({
  prompt: z.optional(z.string()).transform((s) => (s ?? '').trim()).pipe(z.string().min(1, 'Missing or empty prompt').max(GENERATE_AUDIO_PROMPT_MAX_LENGTH, 'Prompt too long')),
  duration: z.number().optional().default(GENERATE_AUDIO_DURATION_DEFAULT).transform((v) => Math.max(GENERATE_AUDIO_DURATION_MIN, Math.min(GENERATE_AUDIO_DURATION_MAX, Math.round(v)))),
  model_version: z.enum(MUSICGEN_MODEL_VERSIONS).optional().default(MUSICGEN_MODEL_VERSION_DEFAULT),
});
type GenerateAudioRequest = z.infer<typeof generateAudioRequestSchema>;
function parseGenerateAudioRequest(raw: unknown): { ok: true; data: GenerateAudioRequest } | { ok: false; error: string } {
  const parsed = generateAudioRequestSchema.safeParse(raw);
  if (parsed.success) { return { ok: true, data: parsed.data }; }
  const err = parsed.error as { message?: string; issues?: Array<{ message?: string }> };
  const msg = (Array.isArray(err.issues) ? err.issues.map((i) => i.message).join('; ') : null) || err.message || 'Invalid request';
  return { ok: false, error: msg };
}

/** Stability AI Stable Audio 2.5 model on Replicate. */
const STABLE_AUDIO_REPLICATE_MODEL = 'stability-ai/stable-audio-2.5';

/**
 * Extract a plain URL string from a Replicate output value.
 */
function extractReplicateUrl(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    if (typeof (value as { url?: unknown }).url === 'function') {
      const result = (value as { url: () => unknown }).url();
      if (typeof result === 'string' && (result.startsWith('http') || result.startsWith('data:'))) {
        return result;
      }
    }
    const str = String(value);
    if (str.startsWith('http') || str.startsWith('data:')) return str;
  }
  return null;
}

export const config = { maxDuration: 30 };

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(obj: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (request == null || typeof request !== 'object' || typeof (request as Request).method !== 'string') {
    return jsonResponse({ error: 'Invalid request' }, 500);
  }
  try {
    return await handleRequest(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[generate-audio]', message);
    return jsonResponse({ error: `Server error: ${message}` }, 500);
  }
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const replicateToken = process.env.REPLICATE_API_TOKEN?.trim();
  if (!replicateToken) {
    return jsonResponse(
      { error: 'No audio backend configured. Set REPLICATE_API_TOKEN in Vercel: Project → Settings → Environment Variables, then redeploy.' },
      503
    );
  }

  const replicate = new Replicate({ auth: replicateToken });

  // GET /api/generate-audio?id=<predictionId> — poll prediction status
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const predictionId = url.searchParams.get('id');
    if (!predictionId) {
      return jsonResponse({ error: 'Missing prediction id' }, 400);
    }
    const prediction = await replicate.predictions.get(predictionId);
    if (prediction.status === 'succeeded') {
      const output = prediction.output;
      const rawUrl = Array.isArray(output) ? extractReplicateUrl(output[0]) : extractReplicateUrl(output);
      if (!rawUrl) {
        return jsonResponse({ error: 'Model did not return an audio URL' }, 502);
      }
      return jsonResponse({ status: 'succeeded', url: rawUrl }, 200);
    }
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      return jsonResponse({ status: prediction.status, error: prediction.error ?? 'Generation failed' }, 502);
    }
    // Still processing: starting | processing
    return jsonResponse({ status: prediction.status }, 202);
  }

  // POST /api/generate-audio — create prediction and return ID immediately
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const parseResult = parseGenerateAudioRequest(rawBody);
  if (!parseResult.ok) {
    return jsonResponse({ error: parseResult.error }, 400);
  }

  const { prompt, duration } = parseResult.data;

  // Create prediction asynchronously — returns immediately with prediction ID
  let prediction: { id: string };
  try {
    prediction = await replicate.predictions.create({
      model: STABLE_AUDIO_REPLICATE_MODEL,
      input: { prompt, duration },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: `Failed to create prediction: ${message}` }, 502);
  }

  return jsonResponse({ predictionId: prediction.id }, 202);
}
