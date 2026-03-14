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

/**
 * Extract a plain URL string from a Replicate run() output value.
 * Handles: plain string, array of strings, FileOutput with url() method, toString().
 */
function extractUrl(value: unknown): string | null {
  // Array — take first element
  if (Array.isArray(value)) {
    return extractUrl(value[0]);
  }
  if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('data:'))) {
    return value;
  }
  if (value && typeof value === 'object') {
    // FileOutput with url() method
    if (typeof (value as { url?: unknown }).url === 'function') {
      const r = (value as { url: () => unknown }).url();
      if (typeof r === 'string' && r.startsWith('http')) return r;
    }
    // FileOutput with toString()
    const s = String(value);
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
  try {
    return await handleRequest(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
    console.error('[generate-audio]', message);
    return jsonResponse({ error: 'Invalid request' }, 500);
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
      { error: 'No audio backend configured. Add REPLICATE_API_TOKEN in Vercel → Settings → Environment Variables, then redeploy.' },
      503
    );
  }

  // Parse request body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = parseGenerateAudioRequest(rawBody);
  if (!parsed.ok) {
    return jsonResponse({ error: parsed.error }, 400);
  }

  const { prompt, duration, model_version } = parsed.data;
  console.log(`[generate-audio] run: prompt="${prompt}" duration=${duration}s model=${model_version}`);

  const replicate = new Replicate({ auth: replicateToken });

  let output: unknown;
  try {
    output = await replicate.run(STABLE_AUDIO_MODEL, {
      input: { prompt, duration },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[generate-audio] run failed:', message);
    return jsonResponse({ error: `Generation failed: ${message}` }, 502);
  }

  const url = extractUrl(output);
  if (!url) {
    console.error('[generate-audio] no audio URL in output:', JSON.stringify(output));
    return jsonResponse({ error: 'Model returned no audio URL' }, 502);
  }

  console.log(`[generate-audio] success url=${url}`);
  return jsonResponse({ url }, 200);
}
