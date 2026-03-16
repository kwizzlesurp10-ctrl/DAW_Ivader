import { ok, err, type Result } from '../lib/result';
import { HF_GENERATE_PROMPT_MAX_LENGTH, type HfGenerateType } from '../schemas/hfGenerateSchema';

/** API endpoint path. */
const HF_GENERATE_API = '/api/hf-generate';

/** Client-side result for text generation. */
export type HfTextResult = { text: string };
/** Client-side result for image generation. */
export type HfImageResult = { dataUrl: string };

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate creative text via the HuggingFace endpoint (Mistral-7B-Instruct).
 * POST /api/hf-generate { type: "text", prompt }  →  { text }
 */
export async function generateCreativeText(
  prompt: string
): Promise<Result<HfTextResult, Error>> {
  return callHfGenerate('text', prompt) as Promise<Result<HfTextResult, Error>>;
}

/**
 * Generate an image via the HuggingFace endpoint (FLUX.1-schnell).
 * POST /api/hf-generate { type: "image", prompt }  →  { dataUrl }
 */
export async function generateCreativeImage(
  prompt: string
): Promise<Result<HfImageResult, Error>> {
  return callHfGenerate('image', prompt) as Promise<Result<HfImageResult, Error>>;
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function callHfGenerate(
  type: HfGenerateType,
  prompt: string
): Promise<Result<HfTextResult | HfImageResult, Error>> {
  if (!prompt || prompt.trim().length === 0) {
    return err(new Error('Missing or empty prompt'));
  }
  if (prompt.length > HF_GENERATE_PROMPT_MAX_LENGTH) {
    return err(new Error(`Prompt too long (max ${HF_GENERATE_PROMPT_MAX_LENGTH} characters)`));
  }

  try {
    const response = await fetch(HF_GENERATE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, prompt }),
    });

    const raw = await response.text();
    if (!response.ok) {
      return err(parseErrorBody(raw, response.status));
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return err(new Error('Invalid response from server (could not parse JSON)'));
    }

    if (type === 'text') {
      if (typeof data.text === 'string') return ok({ text: data.text });
      return err(new Error('Server returned no text in response'));
    }

    if (typeof data.dataUrl === 'string') return ok({ dataUrl: data.dataUrl });
    return err(new Error('Server returned no image in response'));
  } catch (e) {
    return err(normalizeNetworkError(e));
  }
}

function normalizeNetworkError(e: unknown): Error {
  if (e instanceof DOMException && e.name === 'AbortError') {
    return new Error('Request timed out. Please try again.');
  }
  if (
    e instanceof TypeError ||
    (e instanceof Error && 'code' in e && (e as Error & { code: string }).code === 'ERR_NETWORK_CHANGED')
  ) {
    return new Error('Network error. Check your connection and try again.');
  }
  return e instanceof Error ? e : new Error(String(e));
}

function parseErrorBody(raw: string, status: number): Error {
  if (status === 404) {
    return new Error('API route not found (404). Make sure the dev server is running with `vercel dev`.');
  }
  if (raw) {
    try {
      const body = JSON.parse(raw) as Record<string, unknown>;
      if (typeof body.error === 'string') return new Error(body.error);
    } catch {
      // not JSON — fall through
    }
  }
  return new Error(`HTTP ${status}`);
}
