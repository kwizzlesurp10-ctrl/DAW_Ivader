import Replicate from 'replicate';
import { z } from 'zod';

// Stable Audio 2.5 actual schema constraints (from replicate.com/stability-ai/stable-audio-2.5/api/schema)
const GENERATE_AUDIO_DURATION_MIN = 1;
const GENERATE_AUDIO_DURATION_MAX = 190;
const GENERATE_AUDIO_DURATION_DEFAULT = 30;
const GENERATE_AUDIO_PROMPT_MAX_LENGTH = 2000;

const generateAudioRequestSchema = z.object({
  prompt: z.optional(z.string()).transform((s) => (s ?? '').trim()).pipe(
    z.string().min(1, 'Missing or empty prompt').max(GENERATE_AUDIO_PROMPT_MAX_LENGTH, 'Prompt too long')
  ),
  duration: z.number().optional().default(GENERATE_AUDIO_DURATION_DEFAULT).transform((v) =>
    Math.max(GENERATE_AUDIO_DURATION_MIN, Math.min(GENERATE_AUDIO_DURATION_MAX, Math.round(v)))
  ),
  steps: z.number().int().min(4).max(8).optional().default(8),
  cfg_scale: z.number().min(1).max(25).optional().default(7),
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
 * Handles: plain string, FileOutput object with url() method, FileOutput.toString().
 */
function extractUrl(value: unknown): string | null {
  if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('data:'))) return value;
  if (value && typeof value === 'object') {
    if (typeof (value as { url?: unknown }).url === 'function') {
      const r = (value as { url: () => unknown }).url();
      if (typeof r === 'string' && r.startsWith('http')) return r;
    }
    const s = String(value);
    if (s.startsWith('http') || s.startsWith('data:')) return s;
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
    return jsonResponse({ error: 'REPLICATE_API_TOKEN not set. Add it in Vercel → Settings → Environment Variables, then redeploy.' }, 503);
  }

  const replicate = new Replicate({ auth: replicateToken });

  // -----------------------------------------------------------------------
  // GET /api/generate-audio?id=<predictionId>  —  poll prediction status
  // -----------------------------------------------------------------------
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return jsonResponse({ error: 'Missing ?id= parameter' }, 400);

    const pred = await replicate.predictions.get(id);
    console.log(`[generate-audio] poll id=${id} status=${pred.status}`);

    if (pred.status === 'succeeded') {
      // output is a single URI string for this model
      const rawUrl = extractUrl(pred.output);
      if (!rawUrl) {
        console.error('[generate-audio] succeeded but no URL in output:', JSON.stringify(pred.output));
        return jsonResponse({ error: 'Model returned no audio URL' }, 502);
      }
      return jsonResponse({ status: 'succeeded', url: rawUrl }, 200);
    }
    if (pred.status === 'failed' || pred.status === 'canceled') {
      return jsonResponse({ status: pred.status, error: String(pred.error ?? 'Generation failed') }, 502);
    }
    // starting | processing — still running
    return jsonResponse({ status: pred.status }, 202);
  }

  // -----------------------------------------------------------------------
  // POST /api/generate-audio  —  create prediction, return ID immediately
  // -----------------------------------------------------------------------
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let rawBody: unknown;
  try { rawBody = await request.json(); }
  catch { return jsonResponse({ error: 'Invalid JSON body' }, 400); }

  const parsed = parseGenerateAudioRequest(rawBody);
  if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400);

  const { prompt, duration, steps, cfg_scale } = parsed.data;
  console.log(`[generate-audio] creating prediction: prompt="${prompt}" duration=${duration}s steps=${steps}`);

  let pred: { id: string };
  try {
    pred = await replicate.predictions.create({
      model: STABLE_AUDIO_REPLICATE_MODEL,
      input: { prompt, duration, steps, cfg_scale },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[generate-audio] create failed:', message);
    return jsonResponse({ error: `Failed to start generation: ${message}` }, 502);
  }

  console.log(`[generate-audio] prediction created id=${pred.id}`);
  return jsonResponse({ predictionId: pred.id }, 202);
}
