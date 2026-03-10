import Replicate from 'replicate';
import { parseGenerateAudioRequest } from '../schemas/generateAudioSchema';

const MINIMAX_REPLICATE_MODEL = 'minimax/music-01';

/**
 * POST /api/generate-audio — MiniMax Music 01 via Replicate only.
 * Body: { prompt: string, duration?: number } (duration ignored; MiniMax outputs ~60s).
 * Returns: { url: string } | { error: string }
 * Requires REPLICATE_API_TOKEN.
 */
export const config = { maxDuration: 300 };

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(
  obj: { error?: string; url?: string },
  status: number
): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function handler(request: Request): Promise<Response> {
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

export default {
  fetch: handler,
};

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
  const { prompt } = parseResult.data;

  let output: unknown;
  try {
    const replicate = new Replicate({ auth: replicateToken });
    output = await replicate.run(MINIMAX_REPLICATE_MODEL, {
      input: { lyrics: prompt },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: `Generation failed: ${message}` }, 502);
  }

  const url =
    typeof output === 'string'
      ? output
      : Array.isArray(output)
        ? output[0]
        : (output as { url?: string })?.url;
  if (!url || typeof url !== 'string') {
    return jsonResponse({ error: 'Model did not return an audio URL' }, 502);
  }
  return jsonResponse({ url }, 200);
}
