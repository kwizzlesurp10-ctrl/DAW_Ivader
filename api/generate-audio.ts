import Replicate from 'replicate';

/**
 * Vercel serverless: POST /api/generate-audio
 * Body: { prompt: string, duration?: number }
 * Returns: { url: string } or { error: string }
 * Uses Meta MusicGen (open-source) via Replicate. Set REPLICATE_API_TOKEN in Vercel env.
 */
export const config = { maxDuration: 120 };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token?.trim()) {
    return new Response(
      JSON.stringify({ error: 'REPLICATE_API_TOKEN is not set. Add it in Vercel project settings.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: { prompt?: string; duration?: number };
  try {
    body = (await request.json()) as { prompt?: string; duration?: number };
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Missing or empty prompt' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const duration = typeof body.duration === 'number'
    ? Math.max(1, Math.min(30, Math.round(body.duration)))
    : 8;

  try {
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

    const url = typeof output === 'string' ? output : Array.isArray(output) ? output[0] : (output as { url?: string })?.url;
    if (!url || typeof url !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Model did not return an audio URL' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: `Generation failed: ${message}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
