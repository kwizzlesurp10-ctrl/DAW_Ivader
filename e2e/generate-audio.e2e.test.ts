/**
 * End-to-end test: music generation full pipeline (client → mocked API → response).
 * Runs in Node with mocked fetch; no browser required.
 * For full UI E2E, run: npx playwright test (requires app server).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateAudioFromText } from '../services/textToAudioService';
import { ok } from '../lib/result';

describe('E2E: Music generation pipeline', () => {
  const MOCK_DATA_URL = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ url: MOCK_DATA_URL }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('full pipeline: client calls API, receives url, returns ok with url', async () => {
    const result = await generateAudioFromText('Dark cyberpunk bassline', 12);

    expect(result).toEqual(ok({ url: MOCK_DATA_URL }));
  });

  it('sends prompt and duration in request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: MOCK_DATA_URL }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await generateAudioFromText('Test prompt', 10);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/generate-audio');
    expect(options?.method).toBe('POST');
    const body = JSON.parse((options?.body as string) ?? '{}');
    expect(body).toMatchObject({
      prompt: 'Test prompt',
      duration: 10,
    });
  });
});
