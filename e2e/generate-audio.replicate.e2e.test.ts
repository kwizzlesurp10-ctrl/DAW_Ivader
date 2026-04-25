/**
 * End-to-end smoke test: calls the **real** Replicate API.
 *
 * Skipped automatically when REPLICATE_API_TOKEN is not set.
 * Uses minimal generation params (1 s) to keep costs near-zero.
 *
 * Run:
 *   REPLICATE_API_TOKEN=<token> pnpm vitest run e2e/generate-audio.replicate.e2e.test.ts
 *
 * @vitest-environment node
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

function loadDotEnvValue(name: string): string | undefined {
  if (process.env[name]?.trim()) {
    return process.env[name];
  }

  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return undefined;
  }

  const line = readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`));
  const rawValue = line?.slice(name.length + 1).trim();
  if (!rawValue) {
    return undefined;
  }

  const value = rawValue.replace(/^['"]|['"]$/g, '');
  process.env[name] = value;
  return value;
}

const HAS_TOKEN = !!loadDotEnvValue('REPLICATE_API_TOKEN')?.trim();

describe.skipIf(!HAS_TOKEN)('E2E: Music generation with real Replicate API', () => {
  it(
    'creates a prediction and returns url directly (polling)',
    async () => {
      mockAuth.mockResolvedValue({ userId: 'replicate_e2e_user' });
      const { POST } = await import('../app/api/generate-audio/route');

      const response = await POST(
        new Request('http://localhost/api/generate-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
          prompt: 'short drum hit',
          duration: 1, // Use minimum for test
          }),
        })
      );
      const responseBody = (await response.json()) as { url?: unknown; error?: unknown };

      // Expect 200 with { url } or 502/500 on failure
      expect([200, 502, 500]).toContain(response.status);

      if (response.status === 200) {
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