import Replicate from 'replicate';
import { parseGenerateAudioRequest } from '../schemas/generateAudioSchema';

/** Meta MusicGen model on Replicate. */
const MUSICGEN_MODEL =
  'meta/musicgen:b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ede46e59e2b38';

/**
 * Vercel serverless: POST /api/generate-audio
 * Body: { prompt: string, duration?: number } — validated with Zod.
 * Returns: { url: string } | { error: string }
 * Uses Meta MusicGen via Replicate. Set REPLICATE_API_TOKEN in Vercel env.
 */
export const config = { maxDuration: 120 };

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

export default async function handler(request: Request): Promise<Response> {
  try {
    return await handleRequest(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token?.trim()) {
    return jsonResponse(
      {
        error:
          'REPLICATE_API_TOKEN is not set. Add it in Vercel project settings.',
      },
      500
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
  const { prompt, duration, model_version } = parseResult.data;

  let output: unknown;
  try {
    const replicate = new Replicate({ auth: token });
    output = await replicate.run(MUSICGEN_MODEL, {
      input: { prompt, duration, model_version },
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
