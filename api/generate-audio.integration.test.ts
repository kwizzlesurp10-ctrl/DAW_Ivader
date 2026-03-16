/**
 * Integration tests for generate-audio API communication layer.
 * Mocks Replicate — tests request parsing, response shape, status codes, CORS.
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockRun = vi.fn();
vi.mock('replicate', () => ({
  default: class MockReplicate {
    run = mockRun;
  },
}));

describe('api/generate-audio (communication layer)', () => {
  let handler: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    process.env.REPLICATE_API_TOKEN = 'test-token';
    const mod = await import('./generate-audio');
    handler = mod.default;
    mockRun.mockReset();
  });

  afterEach(() => {
    delete process.env.REPLICATE_API_TOKEN;
    vi.restoreAllMocks();
  });

  async function post(body: unknown): Promise<Response> {
    return handler(
      new Request('https://example.com/api/generate-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
  }

  describe('method and CORS', () => {
    it('returns 204 for OPTIONS preflight', async () => {
      const res = await handler(
        new Request('https://example.com/api/generate-audio', { method: 'OPTIONS' })
      );
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeDefined();
    });

    it('returns 405 for GET', async () => {
      const res = await handler(
        new Request('https://example.com/api/generate-audio', { method: 'GET' })
      );
      expect(res.status).toBe(405);
      expect(res.headers.get('Content-Type')).toContain('application/json');
      const data = await res.json();
      expect(data).toHaveProperty('error');
    });

    it('returns 405 for PUT', async () => {
      const res = await handler(
        new Request('https://example.com/api/generate-audio', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'test' }),
        })
      );
      expect(res.status).toBe(405);
    });

    it('includes CORS headers in success response', async () => {
      mockRun.mockResolvedValue('https://x.com/a.wav');
      const res = await post({ prompt: 'test' });
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('auth', () => {
    it('returns 503 when REPLICATE_API_TOKEN is not set', async () => {
      delete process.env.REPLICATE_API_TOKEN;
      vi.resetModules();
      const mod = await import('./generate-audio');
      const h = mod.default;
      const res = await h(
        new Request('https://example.com/api/generate-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'test' }),
        })
      );
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toContain('No audio backend configured');
    });
  });

  describe('request validation', () => {
    it('returns 400 for invalid JSON body', async () => {
      const res = await handler(
        new Request('https://example.com/api/generate-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'not json',
        })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Invalid JSON');
    });

    it('returns 400 for missing prompt', async () => {
      const res = await post({});
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Missing or empty');
    });

    it('returns 400 for empty prompt', async () => {
      const res = await post({ prompt: ' ' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-string prompt', async () => {
      const res = await post({ prompt: 123 });
      expect(res.status).toBe(400);
    });

    it('accepts prompt only and defaults duration', async () => {
      mockRun.mockResolvedValue('https://x.com/a.wav');
      const res = await post({ prompt: 'test' });
      expect(res.status).toBe(200);
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          input: expect.objectContaining({ prompt: 'test', seconds_total: 12 }),
        })
      );
    });

    it('clamps duration above max to max', async () => {
      mockRun.mockResolvedValue('https://x.com/a.wav');
      await post({ prompt: 'test', duration: 100 });
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          input: expect.objectContaining({ seconds_total: 15 }),
        })
      );
    });

    it('clamps duration below min to min', async () => {
      mockRun.mockResolvedValue('https://x.com/a.wav');
      await post({ prompt: 'test', duration: 0 });
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          input: expect.objectContaining({ seconds_total: 10 }),
        })
      );
    });
  });

  describe('happy path', () => {
    it('returns 200 with url when Replicate returns string', async () => {
      const url = 'https://replicate.delivery/xyz.wav';
      mockRun.mockResolvedValue(url);
      const res = await post({ prompt: 'dark bass' });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('application/json');
      const data = await res.json();
      expect(data).toEqual({ url });
    });

    it('returns 200 with url when Replicate returns array', async () => {
      mockRun.mockResolvedValue(['https://replicate.delivery/abc.wav']);
      const res = await post({ prompt: 'test', duration: 5 });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toBe('https://replicate.delivery/abc.wav');
    });

    it('returns 200 when Replicate returns FileOutput (toString returns URL)', async () => {
      const mockFileOutput = { toString: () => 'https://cdn.example.com/out.wav' };
      mockRun.mockResolvedValue(mockFileOutput);
      const res = await post({ prompt: 'test' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toBe('https://cdn.example.com/out.wav');
    });

    it('returns 200 when Replicate returns FileOutput with url() method', async () => {
      const mockFileOutput = { url: () => 'https://replicate.delivery/out.mp3' };
      mockRun.mockResolvedValue(mockFileOutput);
      const res = await post({ prompt: 'test' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toBe('https://replicate.delivery/out.mp3');
    });

    it('calls stability-ai/stable-audio-2.5 model', async () => {
      mockRun.mockResolvedValue('https://replicate.delivery/out.mp3');
      await post({ prompt: 'chill beats' });
      expect(mockRun).toHaveBeenCalledWith(
        'stability-ai/stable-audio-2.5',
        expect.any(Object)
      );
    });

    it('sends seconds_start, cfg_scale, and steps to Replicate', async () => {
      mockRun.mockResolvedValue('https://replicate.delivery/out.mp3');
      await post({ prompt: 'chill beats' });
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          input: expect.objectContaining({
            seconds_start: 0,
            cfg_scale: 7,
            steps: 100,
          }),
        })
      );
    });
  });

  describe('Replicate errors', () => {
    it('returns 502 when Replicate returns no URL', async () => {
      mockRun.mockResolvedValue({});
      const res = await post({ prompt: 'test' });
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toContain('audio URL');
    });

    it('returns 502 when Replicate returns null', async () => {
      mockRun.mockResolvedValue(null);
      const res = await post({ prompt: 'test' });
      expect(res.status).toBe(502);
    });

    it('returns 502 when Replicate returns object with empty url', async () => {
      mockRun.mockResolvedValue({ url: '' });
      const res = await post({ prompt: 'test' });
      expect(res.status).toBe(502);
    });

    it('returns 502 when Replicate throws', async () => {
      mockRun.mockRejectedValue(new Error('API rate limit'));
      const res = await post({ prompt: 'test' });
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toContain('Generation failed');
    });
  });

  describe('handler outer catch', () => {
    it('returns 500 with Invalid request when request is null', async () => {
      const res = await handler(null as unknown as Request);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe('Invalid request');
    });
  });
});
