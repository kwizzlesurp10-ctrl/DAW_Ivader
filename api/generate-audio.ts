import Replicate from 'replicate';
import {
  parseGenerateAudioRequest,
  GENERATE_AUDIO_DURATION_MIN,
  GENERATE_AUDIO_DURATION_MAX,
  GENERATE_AUDIO_DURATION_DEFAULT,
  GENERATE_AUDIO_PROMPT_MAX_LENGTH,
} from '../schemas/generateAudioSchema';

/** Stability AI Stable Audio 2.5 model on Replicate. */
const STABLE_AUDIO_MODEL = 'stability-ai/stable-audio-2.5';
/** Backward-compatible alias for older references in this file. */
const STABLE_AUDIO_REPLICATE_MODEL = STABLE_AUDIO_MODEL;

/**
 * Extract a plain URL string from a Replicate output value.
 * Handles: plain string, array of strings, FileOutput object with url() method
 * (which returns a URL object), FileOutput.toString().
 */
function extractUrl(value: unknown): string | null {
  if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('data:'))) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const u = extractUrl(item);
      if (u) return u;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    // FileOutput with url() method — returns a URL object (not a string)
    if (typeof (value as { url?: unknown }).url === 'function') {
      const r = (value as { url: () => unknown }).url();
      if (typeof r === 'string' && r.startsWith('http')) return r;
      // Handle URL object returned by FileOutput.url()
      if (r && typeof r === 'object' && 'href' in r && typeof (r as { href: unknown }).href === 'string') {
        return (r as { href: string }).href;
      }
    }
    // FileOutput with toString()
export const config = { maxDuration: 30 };
    if (s.startsWith('http') || s.startsWith('data:')) return s;
  }
  return null;
}

export const config = { maxDuration: 300 };

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(obj: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default async function handler(request: Request): Promise<Response> {
  if (!request || typeof request !== 'object') {
    return jsonResponse({ error: 'Invalid request' }, 500);
  }
  try {
    return await handleRequest(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
    console.error('[generate-audio] unhandled:', message);
    return jsonResponse({ error: `Internal error: ${message}` }, 500);
  }
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Only POST is supported — single-shot generation
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const replicateToken = process.env.REPLICATE_API_TOKEN?.trim();

  if (!replicateToken) {
    return jsonResponse(
      { error: 'No audio backend configured. Set REPLICATE_API_TOKEN in your environment variables.' },
      503
    );
  }

  let rawBody: unknown;
  try { rawBody = await request.json(); }
  catch { return jsonResponse({ error: 'Invalid JSON body' }, 400); }

  const parsed = parseGenerateAudioRequest(rawBody);
  if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400);

  const { prompt, duration } = parsed.data;

  // Generate audio via Replicate (Stable Audio 2.5).
  console.log(`[generate-audio] replicate: prompt="${prompt}" duration=${duration}s`);
  const replicate = new Replicate({ auth: replicateToken, useFileOutput: false });

  // Single-shot: replicate.run() waits for the prediction to complete and returns output directly.
  let output: unknown;
  try {
    output = await replicate.run(STABLE_AUDIO_MODEL, {
      input: {
        prompt,
        duration,
        cfg_scale: 7,
        steps: 8,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[generate-audio] generation failed:', message);
    return jsonResponse({ error: `Generation failed: ${message}` }, 502);
  }

  const url = extractUrl(output);
  if (!url) {
    console.error('[generate-audio] no audio URL in output:', JSON.stringify(output));
    return jsonResponse({ error: 'Model returned no audio URL' }, 502);
  }

  return jsonResponse({ url }, 200);
}
