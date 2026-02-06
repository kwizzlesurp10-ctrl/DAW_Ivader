import Replicate from 'replicate';

/**
 * Vercel serverless: POST /api/generate-audio
 * Body: { prompt: string, duration?: number }
 * Returns: { url: string } or { error: string }
 * Uses Meta MusicGen (open-source) via Replicate. Set REPLICATE_API_TOKEN in Vercel env.
 */
export const config = { maxDuration: 120 };

function jsonResponse(obj: { error?: string; url?: string }, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
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
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token?.trim()) {
    return jsonResponse(
      { error: 'REPLICATE_API_TOKEN is not set. Add it in Vercel project settings.' },
      500
    );
  }

  let body: { prompt?: string; duration?: number };
  try {
    body = (await request.json()) as { prompt?: string; duration?: number };
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return jsonResponse({ error: 'Missing or empty prompt' }, 400);
  }

  const duration =
    typeof body.duration === 'number'
      ? Math.max(1, Math.min(30, Math.round(body.duration)))
      : 8;

  const replicate = new Replicate({ auth: token });
  const output = await replicate.run(
    'meta/musicgen:b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ede46e59e2b38',
    {
      input: {
        prompt,
        duration,
      },
    }
  );

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
