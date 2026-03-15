/**
 * End-to-end smoke test: calls the **real** Replicate API.
 *
 * Skipped automatically when REPLICATE_API_TOKEN is not set.
 * Caps total Replicate API calls to 3 (1 create + 2 polls) to keep
 * costs near-zero.  Uses minimal generation params (1 s, 4 steps).
 *
 * Run:
 *   REPLICATE_API_TOKEN=<token> npx vitest run e2e/generate-audio.replicate.e2e.test.ts
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll } from 'vitest';

const HAS_TOKEN = !!process.env.REPLICATE_API_TOKEN?.trim();

/** Max Replicate API calls: 1 POST (create) + 2 GET (poll). */
const MAX_POLLS = 2;
/** Seconds to wait between polls so the prediction has time to finish. */
const POLL_WAIT_MS = 10_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe.skipIf(!HAS_TOKEN)('E2E: Music generation with real Replicate API', () => {
  let handler: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    // Dynamic import — no Replicate mock in this file, so the real SDK is used.
    const mod = await import('../api/generate-audio');
    handler = mod.default;
  });

  it(
    'creates a prediction and polls status (max 3 Replicate calls)',
    async () => {
      // ---- Call 1 / 3: POST → create prediction ----
      const postRes = await handler(
        new Request('https://localhost/api/generate-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: 'short drum hit',
            duration: 1,
            steps: 4,
            cfg_scale: 7,
          }),
        }),
      );

      expect(postRes.status).toBe(202);
      const postData = (await postRes.json()) as Record<string, unknown>;
      expect(postData).toHaveProperty('predictionId');

      const predictionId = postData.predictionId as string;
      expect(typeof predictionId).toBe('string');
      expect(predictionId.length).toBeGreaterThan(0);

      // ---- Calls 2-3 / 3: GET → poll prediction status ----
      let finalStatus = 'unknown';
      let audioUrl: string | undefined;

      for (let poll = 0; poll < MAX_POLLS; poll++) {
        await sleep(POLL_WAIT_MS);

        const getRes = await handler(
          new Request(
            `https://localhost/api/generate-audio?id=${encodeURIComponent(predictionId)}`,
            { method: 'GET' },
          ),
        );

        // 200 = succeeded, 202 = still running, 502 = failed/canceled
        expect([200, 202, 502]).toContain(getRes.status);

        const getData = (await getRes.json()) as Record<string, unknown>;
        finalStatus = (getData.status ?? 'unknown') as string;

        if (finalStatus === 'succeeded') {
          audioUrl = getData.url as string;
          break;
        }
        if (finalStatus === 'failed' || finalStatus === 'canceled') {
          break;
        }
        // 'starting' | 'processing' → keep polling
      }

      // We created a prediction and received a recognised Replicate status.
      expect(['starting', 'processing', 'succeeded', 'failed', 'canceled']).toContain(
        finalStatus,
      );

      // If the generation finished within budget, verify the audio URL.
      if (finalStatus === 'succeeded') {
        expect(audioUrl).toBeDefined();
        expect(audioUrl).toMatch(/^https?:\/\//);
      }
    },
    // 90 s timeout — allows for cold-start + generation + 2 poll waits.
    90_000,
  );
});
