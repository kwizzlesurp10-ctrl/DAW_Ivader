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

/** Default generation duration in seconds. */
const DEFAULT_DURATION = 12;

/** Default model version. */
const DEFAULT_MODEL_VERSION = 'large';

/**
 * Generate audio from a text prompt.
 * POSTs to /api/generate-audio and expects { url } in the response body.
 *
 * Mocks in tests provide response.text() — this service uses text() + JSON.parse
 * to stay compatible with both real fetch and vi.fn() mocks.
 */
export async function generateAudioFromText(
  prompt: string,
  duration: number = DEFAULT_DURATION,
  modelVersion: string = DEFAULT_MODEL_VERSION
): Promise<Result<GenerateAudioResult, Error>> {
  // --- Input validation (before any network call) ---
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
  let response: Response;
  try {
    response = await fetch(GENERATE_AUDIO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, duration: clampedDuration, model_version: modelVersion }),
    });
  } catch (e) {
    return err(normalizeNetworkError(e));
  }

  // --- Parse body as text, then try JSON ---
  let raw: string;
  try {
    raw = await response.text();
  } catch (e) {
    return err(new Error(`Failed to read response body: ${String(e)}`));
  }

  // --- Handle non-2xx ---
  if (!response.ok) {
    return err(parseErrorBody(raw, response.status));
  }

  // --- Parse success body ---
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return err(new Error(`Invalid response from server (could not parse JSON)`));
  }

  if (typeof data.url !== 'string') {
    return err(new Error('Server returned no audio URL in response'));
  }

  return ok({ url: data.url });
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
    (e instanceof Error && 'code' in e && (e as Error & { code: string }).code === 'ERR_NETWORK_CHANGED')
  ) {
    return new Error('Network error. Check your connection and try again.');
  }
  return e instanceof Error ? e : new Error(String(e));
}

/**
 * Build an Error from a non-2xx response body.
 * - 404 → hint to run `vercel dev`
 * - JSON body with .error string → use that
 * - Anything else → fall back to HTTP status
 */
function parseErrorBody(raw: string, status: number): Error {
  if (status === 404) {
    return new Error(
      'API route not found (404). Make sure the dev server is running with `vercel dev`.',
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
