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

    it('returns err for too long prompt', async () => {
      const result = await generateAudioFromText('a'.repeat(GENERATE_AUDIO_PROMPT_MAX_LENGTH + 1));

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

    it('sends selected ComfyUI backend in request body', async () => {
      const url = 'http://127.0.0.1:8188/view?filename=loop.wav&type=output&subfolder=';
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({ url })),
      });

      const result = await generateAudioFromText('dark bass', 8, 'stable-audio-2.5', {
        backend: 'comfyui',
      });

      expect(isOk(result)).toBe(true);
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(options.body))).toMatchObject({
        prompt: 'dark bass',
        backend: 'comfyui',
      });
    });
  });

  describe('error handling', () => {
    it('returns err when API returns 404', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve(''),
      });

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('pnpm dev');
    });

    it('returns err when API returns 500 with error message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve(JSON.stringify({ error: 'Replicate failed' })),
      });

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toBe('Replicate failed');
    });

    it('returns err when API returns 200 but missing url', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({})),
      });

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('no audio URL');
    });

    it('returns err when API returns invalid JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('invalid json'),
      });

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('Invalid response');
    });

    it('returns err on fetch timeout', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('timed out');
    });

    it('returns err on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Failed to fetch'));

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('Network error');
    });
  });
});
