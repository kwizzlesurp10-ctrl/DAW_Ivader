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
  small: 'facebook/musicgen-small',
  large: 'facebook/musicgen-large',
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
 * Polyfill for AbortSignal.any() — available only in Node.js ≥20.3 / browsers 2023+.
 * Returns an AbortSignal that aborts as soon as any of the provided signals aborts.
 * Works on Node.js 18+ (the Vercel serverless default runtime).
 */
function anyAbortSignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

/**
 * Extract a plain URL string from a Replicate output value.
 * Replicate v1.x wraps audio URLs in FileOutput objects; older versions
 * return plain strings. Both are handled here.
 */
function extractReplicateUrl(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const str = String(value);
    if (str.startsWith('http') || str.startsWith('data:')) return str;
  }
  return null;
}

type GenerationResult = { url: string } | { error: string };

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

export async function generateWithHuggingFace(
  token: string,
  prompt: string,
  duration: number,
  modelVersion: MusicGenModelVersion,
  signal?: AbortSignal
): Promise<GenerationResult> {
  const model = HUGGINGFACE_MODEL_MAP[modelVersion];
  const maxNewTokens = duration * MUSICGEN_TOKENS_PER_SECOND;

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), HF_REQUEST_TIMEOUT_MS);

  let combinedSignal: AbortSignal;
  try {
    combinedSignal = signal ? anyAbortSignal([signal, timeoutController.signal]) : timeoutController.signal;
  } catch {
    combinedSignal = timeoutController.signal;
  }

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
    try {
      text = await res.text();
    } catch {
      // ignore
    }
    if (res.status === 503) {
      let estimated = '';
      try {
        const body = JSON.parse(text) as { estimated_time?: number };
        if (typeof body.estimated_time === 'number') estimated = ` (estimated wait: ${Math.ceil(body.estimated_time)}s)`;
      } catch {
        // ignore
      }
      return { error: `HuggingFace model is loading${estimated} — wait a moment and try again.` };
    }
    return { error: `HuggingFace API error ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}` };
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await res.arrayBuffer();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: `Failed to read HuggingFace response: ${message}` };
  }

  let base64: string;
  try {
    base64 = Buffer.from(buffer).toString('base64');
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: `Failed to encode audio response: ${message}` };
  }
  const contentType = res.headers.get('content-type') || 'audio/wav';
  return { url: `data:${contentType};base64,${base64}` };
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
  const hfToken = process.env.HUGGINGFACE_API_TOKEN?.trim();

  if (!replicateToken && !hfToken) {
    return jsonResponse(
      {
        error:
          'No audio backend configured. Set REPLICATE_API_TOKEN (recommended) or HUGGINGFACE_API_TOKEN in Vercel: Project → Settings → Environment Variables, then redeploy.',
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

  // Replicate preferred
  if (replicateToken) {
    let output: unknown;
    try {
      const replicate = new Replicate({ auth: replicateToken });
      output = await replicate.run(MUSICGEN_REPLICATE_MODEL, {
        input: { prompt, duration, model_version },
        signal: request.signal,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // fall back to HF if available
      if (hfToken) {
        const hf = await generateWithHuggingFace(hfToken, prompt, duration, model_version, request.signal);
        if ('url' in hf) return jsonResponse({ url: hf.url }, 200);
        return jsonResponse({ error: `Generation failed: ${hf.error}` }, 502);
      }
      return jsonResponse({ error: `Generation failed: ${message}` }, 502);
    }

    const rawUrl = Array.isArray(output) ? extractReplicateUrl(output[0]) : extractReplicateUrl(output);
    if (!rawUrl) {
      if (hfToken) {
        const hf = await generateWithHuggingFace(hfToken, prompt, duration, model_version, request.signal);
        if ('url' in hf) return jsonResponse({ url: hf.url }, 200);
        return jsonResponse({ error: `Generation failed: ${hf.error}` }, 502);
      }
      return jsonResponse({ error: 'Model did not return an audio URL' }, 502);
    }

    return jsonResponse({ url: rawUrl }, 200);
  }

  // HF fallback only
  const hf = await generateWithHuggingFace(hfToken!, prompt, duration, model_version, request.signal);
  if ('error' in hf) return jsonResponse({ error: `Generation failed: ${hf.error}` }, 502);
  return jsonResponse({ url: hf.url }, 200);
}