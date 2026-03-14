import { ok, err, type Result } from '../lib/result';

/** Client-side result type for successful generation. */
export type GenerateAudioResult = { url: string };

/** How often to poll the prediction status (ms). */
const POLL_INTERVAL_MS = 4_000;
/** Max total polling time before giving up (ms) — 10 minutes. */
const POLL_TIMEOUT_MS = 600_000;
/** API endpoint path. */
const GENERATE_AUDIO_API = '/api/generate-audio';

/**
 * Generate audio from a text prompt using the async Replicate polling flow:
 * 1. POST /api/generate-audio  → { predictionId }
 * 2. Poll GET /api/generate-audio?id=<predictionId> every 4s until succeeded/failed.
 * 3. On success, return { url }.
 *
 * This approach avoids the Vercel 300s serverless function timeout since the
 * POST returns almost immediately with the prediction ID.
 */
export async function generateAudioFromText(
  prompt: string,
  duration: number,
  modelVersion?: string
): Promise<Result<GenerateAudioResult, Error>> {
  // Step 1: Create the prediction
  let predictionId: string;
  try {
    const response = await fetch(GENERATE_AUDIO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, duration, model_version: modelVersion }),
    });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok || typeof data.predictionId !== 'string') {
      const errorMsg = typeof data.error === 'string' ? data.error : `HTTP ${response.status}`;
      return err(new Error(errorMsg));
    }
    predictionId = data.predictionId;
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }

  // Step 2: Poll until done
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const response = await fetch(`${GENERATE_AUDIO_API}?id=${encodeURIComponent(predictionId)}`);
      const data = await response.json() as Record<string, unknown>;

      if (data.status === 'succeeded' && typeof data.url === 'string') {
        return ok({ url: data.url });
      }
      if (data.status === 'failed' || data.status === 'canceled') {
        const errorMsg = typeof data.error === 'string' ? data.error : 'Generation failed';
        return err(new Error(errorMsg));
      }
      // status === 'starting' | 'processing' | 202 — keep polling
    } catch (e) {
      // Network hiccup — keep trying until deadline
      console.warn('[textToAudioService] poll error, retrying:', e);
    }
  }

  return err(new Error('Generation timed out after 10 minutes'));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
