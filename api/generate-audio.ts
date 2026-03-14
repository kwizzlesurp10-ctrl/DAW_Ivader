import Replicate from 'replicate';
import { parseGenerateAudioRequest } from '../schemas/generateAudioSchema';

/** Stability AI Stable Audio 2.5 model on Replicate. */
const STABLE_AUDIO_REPLICATE_MODEL = 'stability-ai/stable-audio-2.5';

/**
 * Extract a plain URL string from a Replicate output value.
 * Replicate v1.x wraps audio URLs in FileOutput objects. Three forms are handled:
 * 1. Plain string URL
 * 2. FileOutput with a `url()` method (as documented in Replicate JS SDK)
 * 3. FileOutput whose `toString()` returns the URL
 */
function extractReplicateUrl(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    // Replicate FileOutput: url() method returns the URL string
    if (typeof (value as { url?: unknown }).url === 'function') {
      const result = (value as { url: () => unknown }).url();
      if (typeof result === 'string' && (result.startsWith('http') || result.startsWith('data:'))) {
        return result;
      }
    }
    // FileOutput.toString() returns the URL string directly
    const str = String(value);
    if (str.startsWith('http') || str.startsWith('data:')) return str;
  }
  return null;
}

/**
 * Vercel serverless: POST /api/generate-audio
 * Body: { prompt: string, duration?: number, model_version?: string } — validated with Zod.
 * Returns: { url: string } | { error: string }
 *
 * Uses Stability AI Stable Audio 2.5 via Replicate.
 * Set REPLICATE_API_TOKEN in Vercel: Project → Settings → Environment Variables.
 */
export const config = { maxDuration: 300 };

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(obj: { error?: string; url?: string }, status: number): Response {
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
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const replicateToken = process.env.REPLICATE_API_TOKEN?.trim();

  if (!replicateToken) {
    return jsonResponse(
      {
        error:
          'No audio backend configured. Set REPLICATE_API_TOKEN in Vercel: Project → Settings → Environment Variables, then redeploy.',
      },
      503
    );
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

  // Replicate backend — Stability AI Stable Audio 2.5
  // Note: model_version is a MusicGen-specific field and is not used by Stable Audio 2.5.
  let output: unknown;
  try {
    const replicate = new Replicate({ auth: replicateToken });
    output = await replicate.run(STABLE_AUDIO_REPLICATE_MODEL, {
      input: { prompt, duration },
      signal: request.signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: `Generation failed: ${message}` }, 502);
  }

  // Replicate may return a plain string, an array of URLs, or a FileOutput object.
  const rawUrl = Array.isArray(output)
    ? extractReplicateUrl(output[0])
    : extractReplicateUrl(output);

  if (!rawUrl) {
    return jsonResponse({ error: 'Model did not return an audio URL' }, 502);
  }

  return jsonResponse({ url: rawUrl }, 200);
}
