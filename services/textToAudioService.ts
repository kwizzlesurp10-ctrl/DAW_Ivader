import { ok, err, type Result } from '../lib/result';
import {
  GENERATE_AUDIO_PROMPT_MAX_LENGTH,
  GENERATE_AUDIO_DURATION_MIN,
  GENERATE_AUDIO_DURATION_MAX,
} from '../schemas/generateAudioSchema';

/** Client-side result type for successful generation. */
export type GenerateAudioResult = { url: string };

/** API endpoint path. */
const GENERATE_AUDIO_API = '/api/generate-audio';
/** Default model version. */
const DEFAULT_MODEL_VERSION = 'large';

/**
 * Generate audio from a text prompt via the Replicate single-shot API:
 * POST /api/generate-audio → { url }
 *
 * Uses response.text() + JSON.parse() for compatibility with vi.fn() mocks in tests.
 */
export async function generateAudioFromText(
  prompt: string,
  duration: number = GENERATE_AUDIO_DURATION_DEFAULT,
  modelVersion: string = DEFAULT_MODEL_VERSION
): Promise<Result<GenerateAudioResult, Error>> {

  // --- Input validation (no fetch) ---
  if (!prompt || prompt.trim().length === 0) {
    return err(new Error('Missing or empty prompt'));
  }
  if (prompt.length > GENERATE_AUDIO_PROMPT_MAX_LENGTH) {
    return err(new Error(`Prompt too long (max ${GENERATE_AUDIO_PROMPT_MAX_LENGTH} characters)`));
  }

  // --- Fetch ---
  const clampedDuration = Math.max(
    GENERATE_AUDIO_DURATION_MIN,
    Math.min(GENERATE_AUDIO_DURATION_MAX, Math.round(duration))
  );

  try {
    const response = await fetch(GENERATE_AUDIO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, duration: clampedDuration, model_version: modelVersion }),
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
    if (typeof data.url === 'string') {
      return ok({ url: data.url });
    }
    return err(new Error('Server returned no audio URL in response'));
  } catch (e) {
    return err(normalizeNetworkError(e));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Turn a raw fetch rejection into a user-friendly Error.
 */
function normalizeNetworkError(e: unknown): Error {
  if (e instanceof DOMException && e.name === 'AbortError') {
    return new Error('Request timed out. Please try again.');
  }
  if (
    e instanceof TypeError ||
    (e instanceof Error && 'code' in e &&
      (e as Error & { code: string }).code === 'ERR_NETWORK_CHANGED')
  ) {
    return new Error('Network error. Check your connection and try again.');
  }
  return e instanceof Error ? e : new Error(String(e));
}

/**
 * Build an Error from a non-2xx response body.
 * - 404  -> hint to run `vercel dev`
 * - JSON body with .error string -> use that
 * - Anything else -> fall back to HTTP status code
 */
function parseErrorBody(raw: string, status: number): Error {
  if (status === 404) {
    return new Error(
      'API route not found (404). Make sure the dev server is running with `vercel dev`.'
    );
  }
  if (raw) {
    try {
      const body = JSON.parse(raw) as Record<string, unknown>;
      if (typeof body.error === 'string') {
        return new Error(body.error);
      }
    } catch {
      // not JSON — fall through
    }
  }
  return new Error(`HTTP ${status}`);
}
