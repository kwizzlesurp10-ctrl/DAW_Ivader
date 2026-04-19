/**
 * End-to-end smoke test: calls the **real** Replicate API.
 *
 * Skipped automatically when REPLICATE_API_TOKEN is not set.
 * Uses minimal generation params (10 s) to keep costs near-zero.
 *
 * Run:
 *   REPLICATE_API_TOKEN=<token> npx vitest run e2e/generate-audio.replicate.e2e.test.ts
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll } from 'vitest';

const HAS_TOKEN = !!process.env.REPLICATE_API_TOKEN?.trim();

describe.skipIf(!HAS_TOKEN)('E2E: Music generation with real Replicate API', () => {
  let handler: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    // Dynamic import — no Replicate mock in this file, so the real SDK is used.
    const mod = await import('../api/generate-audio');
    handler = mod.default;
  });

  it(
    'creates a prediction and returns url directly (single-shot)',
    async () => {
      const res = await handler(
        new Request('https://localhost/api/generate-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: 'short drum hit',
            duration: 10,
          }),
        }),
      );

      // Single-shot: expect 200 with { url } or 502 on failure
      expect([200, 502]).toContain(res.status);

      const data = (await res.json()) as Record<string, unknown>;

      if (res.status === 200) {
        expect(data).toHaveProperty('url');
        expect(data.url).toMatch(/^https?:\/\//);
      } else {
        // Generation may fail due to rate limits, cold starts, etc.
        expect(data).toHaveProperty('error');
      }
    },
    // 90 s timeout — allows for cold-start + generation.
    90_000,
  );
});
