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
      if (isErr(result)) expect(result.error.message).toContain('Missing or empty');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns err for prompt exceeding max length and does not call fetch', async () => {
      const longPrompt = 'x'.repeat(GENERATE_AUDIO_PROMPT_MAX_LENGTH + 1);
      const result = await generateAudioFromText(longPrompt);

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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'dark bass', duration: 8 }),
        })
      );
    });

    it('passes default duration 8 when not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({ url: 'https://x.com/a.wav' })),
      });

      await generateAudioFromText('test');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ prompt: 'test', duration: 8 }),
        })
      );
    });

    it('passes custom duration when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({ url: 'https://x.com/a.wav' })),
      });

      await generateAudioFromText('test', 15);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ prompt: 'test', duration: 15 }),
        })
      );
    });
  });

  describe('error responses', () => {
    it('returns err for 404 with vercel dev message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: () => Promise.resolve(''),
      });

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('vercel dev');
    });

    it('returns err for 500 with error body message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve(JSON.stringify({ error: 'REPLICATE_API_TOKEN is not set' })),
      });

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('REPLICATE_API_TOKEN');
    });

    it('returns err for 502 with error body message', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: () => Promise.resolve(JSON.stringify({ error: 'Generation failed: timeout' })),
      });

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('timeout');
    });

    it('returns err for 400 with error body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve(JSON.stringify({ error: 'Missing or empty prompt' })),
      });

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('Missing or empty');
    });

    it('returns HTTP status when non-404 error has no error body', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: () => Promise.resolve(''),
      });

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('503');
    });
  });

  describe('malformed responses', () => {
    it('returns err for empty response body when not ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: () => Promise.resolve(''),
      });

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('502');
    });

    it('returns err for invalid JSON response when not ok', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Error',
        text: () => Promise.resolve('not valid json {{{'),
      });

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('500');
    });

    it('returns err when 200 but body missing url', async () => {
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

    it('returns err when 200 but body has error key instead of url', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve(JSON.stringify({ error: 'weird' })),
      });

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('no audio URL');
    });
  });

  describe('network failures', () => {
    it('returns err for Failed to fetch with user-friendly message', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('Network error');
    });

    it('returns err for ERR_NETWORK_CHANGED with user-friendly message', async () => {
      const err = new Error('Something');
      (err as Error & { code: string }).code = 'ERR_NETWORK_CHANGED';
      mockFetch.mockRejectedValue(err);

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('Network error');
    });

    it('returns err for AbortError with timeout message', async () => {
      const err = new DOMException('aborted', 'AbortError');
      mockFetch.mockRejectedValue(err);

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('timed out');
    });

    it('returns err with original message for other errors', async () => {
      mockFetch.mockRejectedValue(new Error('Custom error'));

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toBe('Custom error');
    });
  });

  describe('validation errors (no fetch)', () => {
    it('returns err for prompt too long with schema message', async () => {
      const longPrompt = 'x'.repeat(2001);
      const result = await generateAudioFromText(longPrompt);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('too long');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('JSON parse failure when res.ok', () => {
    it('returns err when 200 but body is invalid JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.resolve('not valid json {{'),
      });

      const result = await generateAudioFromText('test');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('Invalid response');
    });
  });
});
