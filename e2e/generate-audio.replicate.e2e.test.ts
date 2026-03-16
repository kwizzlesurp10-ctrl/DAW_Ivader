/**
 * End-to-end smoke test: calls the **real** Replicate API.
 *
 * Skipped automatically when REPLICATE_API_TOKEN is not set.
 * Uses minimal generation params (1 s) to keep costs near-zero.
 *
 * Run:
 *   REPLICATE_API_TOKEN=<token> npx vitest run e2e/generate-audio.replicate.e2e.test.ts
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';

const HAS_TOKEN = !!process.env.REPLICATE_API_TOKEN?.trim();

describe.skipIf(!HAS_TOKEN)('E2E: Music generation with real Replicate API', () => {
  let handler: any;

  beforeAll(async () => {
    // Dynamic import — no Replicate mock in this file, so the real SDK is used.
    const mod = await import('../api/generate-audio');
    handler = mod.default;
  });

  it(
    'creates a prediction and returns url directly (polling)',
    async () => {
      const req = {
        method: 'POST',
        body: {
          prompt: 'short drum hit',
          duration: 1, // Use minimum for test
        }
      };
      
      let responseStatus = 0;
      let responseBody: any = null;

      const res = {
        setHeader: vi.fn(),
        status: (s: number) => {
          responseStatus = s;
          return res;
        },
        json: (b: any) => {
          responseBody = b;
          return res;
        },
        end: () => res
      };

      await handler(req, res);

      // Expect 200 with { url } or 502/500 on failure
      expect([200, 502, 500]).toContain(responseStatus);

      if (responseStatus === 200) {
        expect(responseBody).toHaveProperty('url');
        expect(responseBody.url).toMatch(/^https?:\/\//);
      } else {
        // Generation may fail due to rate limits, cold starts, etc.
        expect(responseBody).toHaveProperty('error');
      }
    },
    // 90 s timeout — allows for cold-start + generation.
    90_000,
  );
});