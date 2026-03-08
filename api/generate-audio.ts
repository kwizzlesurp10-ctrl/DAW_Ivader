import Replicate from 'replicate';
import { parseGenerateAudioRequest, type MusicGenModelVersion } from '../schemas/generateAudioSchema';

/** Meta MusicGen model on Replicate. */
const MUSICGEN_REPLICATE_MODEL =
  'meta/musicgen:b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ede46e59e2b38';

/**
 * HuggingFace Inference API model IDs for each MusicGen variant.
 * See: https://huggingface.co/facebook
 */
const HUGGINGFACE_MODEL_MAP: Record<MusicGenModelVersion, string> = {
  'small': 'facebook/musicgen-small',
  'large': 'facebook/musicgen-large',
  'stereo-large': 'facebook/musicgen-stereo-large',
  'melody-large': 'facebook/musicgen-melody-large',
  'stereo-melody-large': 'facebook/musicgen-stereo-melody-large',
};

/** MusicGen generates ~50 audio tokens per second of output. */
const MUSICGEN_TOKENS_PER_SECOND = 50;

/**
 * Timeout for the HuggingFace API request.
 * Must be less than maxDuration (300s) so we can return a proper error
 * rather than letting Vercel kill the function (FUNCTION_INVOCATION_FAILED).
 */
const HF_REQUEST_TIMEOUT_MS = 250_000;

/**
 * Extract a plain URL string from a Replicate output value.
 * Replicate v1.x wraps audio URLs in FileOutput objects; older versions
 * return plain strings. Both are handled here.
 */
function extractReplicateUrl(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
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
 * Backend selection (first match wins):
 *   1. HUGGINGFACE_API_TOKEN — Meta MusicGen via HuggingFace Inference API (returns data URL)
 *   2. REPLICATE_API_TOKEN   — Meta MusicGen via Replicate
 *
 * Set at least one token in Vercel: Project → Settings → Environment Variables.
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

/**
 * Generate audio using the HuggingFace Inference API.
 * Returns { url } with a base64 data URL on success, or { error } on failure.
 *
 * @param signal - Optional AbortSignal; a HF_REQUEST_TIMEOUT_MS deadline is
 *   always added so the Vercel function never hangs past maxDuration.
 */
export async function generateWithHuggingFace(
  token: string,
  prompt: string,
  duration: number,
  modelVersion: MusicGenModelVersion,
  signal?: AbortSignal
): Promise<{ url: string } | { error: string }> {
  const model = HUGGINGFACE_MODEL_MAP[modelVersion];
  const maxNewTokens = duration * MUSICGEN_TOKENS_PER_SECOND;

  // Apply a hard timeout so the function always returns before Vercel kills it
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), HF_REQUEST_TIMEOUT_MS);
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal;

  let res: Response;
  try {
    res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Wait-For-Model': 'true',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: { max_new_tokens: maxNewTokens },
      }),
      signal: combinedSignal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    const name = (e as Error)?.name;
    const message = e instanceof Error ? e.message : String(e);
    if (name === 'AbortError') {
      return { error: 'HuggingFace request timed out. The model may be loading — try again in a minute.' };
    }
    return { error: `HuggingFace request failed: ${message}` };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    let text = '';
    try { text = await res.text(); } catch { /* ignore */ }
    // 503 = model is loading; give the user a helpful retry message
    if (res.status === 503) {
      let estimated = '';
      try {
        const body = JSON.parse(text) as { estimated_time?: number };
        if (typeof body.estimated_time === 'number') {
          estimated = ` (estimated wait: ${Math.ceil(body.estimated_time)}s)`;
        }
      } catch { /* ignore */ }
      return { error: `HuggingFace model is loading${estimated} — wait a moment and try again.` };
    }
    return {
      error: `HuggingFace API error ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
    };
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await res.arrayBuffer();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: `Failed to read HuggingFace response: ${message}` };
  }

  const base64 = Buffer.from(buffer).toString('base64');
  const contentType = res.headers.get('content-type') || 'audio/wav';
  const url = `data:${contentType};base64,${base64}`;

  return { url };
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

  const hfToken = process.env.HUGGINGFACE_API_TOKEN?.trim();
  const replicateToken = process.env.REPLICATE_API_TOKEN?.trim();

  if (!hfToken && !replicateToken) {
    return jsonResponse(
      {
        error:
          'No audio backend configured. Set HUGGINGFACE_API_TOKEN (recommended) or REPLICATE_API_TOKEN in Vercel: Project → Settings → Environment Variables, then redeploy.',
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
  const { prompt, duration, model_version } = parseResult.data;

  // HuggingFace backend (preferred when token is available)
  if (hfToken) {
    const result = await generateWithHuggingFace(hfToken, prompt, duration, model_version, request.signal);
    if ('error' in result) {
      return jsonResponse({ error: `Generation failed: ${result.error}` }, 502);
    }
    return jsonResponse({ url: result.url }, 200);
  }

  // Replicate backend (fallback)
  let output: unknown;
  try {
    const replicate = new Replicate({ auth: replicateToken! });
    output = await replicate.run(MUSICGEN_REPLICATE_MODEL, {
      input: { prompt, duration, model_version },
      signal: request.signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: `Generation failed: ${message}` }, 502);
  }

  // Replicate v1.x wraps audio URLs in FileOutput objects (toString() = URL).
  // Earlier versions return plain strings. Handle both.
  const rawUrl = Array.isArray(output)
    ? extractReplicateUrl(output[0])
    : extractReplicateUrl(output);

  if (!rawUrl) {
    return jsonResponse({ error: 'Model did not return an audio URL' }, 502);
  }

  return jsonResponse({ url: rawUrl }, 200);
}
