/**
 * Integration/smoke tests for generate-audio communication layer.
 * Mocks fetch to simulate API responses — tests client request/response handling only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateAudioFromText } from './textToAudioService';
import { isOk, isErr } from '../lib/result';
import { GENERATE_AUDIO_PROMPT_MAX_LENGTH } from '../schemas/generateAudioSchema';

const mockFetch = vi.fn();

describe('textToAudioService (communication layer)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('input validation (no fetch)', () => {
    it('returns err for empty prompt and does not call fetch', async () => {
      const result = await generateAudioFromText('  ');

      expect(isErr(result)).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('happy path', () => {
    it('returns ok with url when API returns 200 and valid url', async () => {
      const url = 'https://replicate.delivery/abc.wav';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({ url })),
      });

      const result = await generateAudioFromText('dark bass');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value.url).toBe(url);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/generate-audio'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"prompt":"dark bass"'),
        })
      );
    });
  });
});