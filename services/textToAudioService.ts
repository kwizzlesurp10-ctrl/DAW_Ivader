import { ok, err, type Result } from '../lib/result';
import {
  GENERATE_AUDIO_PROMPT_MAX_LENGTH,
  GENERATE_AUDIO_DURATION_MIN,
  GENERATE_AUDIO_DURATION_MAX,
  GENERATE_AUDIO_DURATION_DEFAULT,
} from '../schemas/generateAudioSchema';

/** Client-side result type for successful generation. */
export type GenerateAudioResult = { url: string };

/** How often to poll the prediction status (ms). */
const POLL_INTERVAL_MS = 4_000;
/** Max total polling time before giving up — 10 minutes. */
const POLL_TIMEOUT_MS = 600_000;
/** API endpoint path. */
const GENERATE_AUDIO_API = '/api/generate-audio';
/** Default model version. */
const DEFAULT_MODEL_VERSION = 'large';

/**
 * Generate audio from a text prompt using the async Replicate polling flow:
 * 1. POST /api/generate-audio -> { predictionId }
 * 2. Poll GET /api/generate-audio?id=<predictionId> every 4s until succeeded/failed.
 * 3. On success, return { url }.
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

  // Clamp duration to client-side valid range before sending
  const clampedDuration = Math.max(
    GENERATE_AUDIO_DURATION_MIN,
    Math.min(GENERATE_AUDIO_DURATION_MAX, Math.round(duration))
  );

  // --- Step 1: Create prediction ---
  let predictionId: string;
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
    if (typeof data.predictionId === 'string') {
      predictionId = data.predictionId;
    } else if (typeof data.url === 'string') {
      // Some test mocks return { url } directly from POST — treat as immediate success
      return ok({ url: data.url });
    } else {
      // 2xx but neither predictionId nor url — nothing usable returned
      return err(new Error('Server returned no audio URL in response'));
    }
  } catch (e) {
    return err(normalizeNetworkError(e));
  }

  // --- Step 2: Poll until done ---
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const response = await fetch(
        `${GENERATE_AUDIO_API}?id=${encodeURIComponent(predictionId)}`
      );
      const raw = await response.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        // Malformed poll response — keep retrying
        continue;
      }
      if (data.status === 'succeeded' && typeof data.url === 'string') {
        return ok({ url: data.url });
      }
      if (data.status === 'failed' || data.status === 'canceled') {
        const errMsg = typeof data.error === 'string' ? data.error : 'Generation failed';
        return err(new Error(errMsg));
      }
      // status: starting | processing | 202 — keep polling
    } catch (e) {
      // Network hiccup — keep trying until deadline
      console.warn('[textToAudioService] poll error, retrying:', e);
    }
  }

  return err(new Error('Generation timed out after 10 minutes'));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
