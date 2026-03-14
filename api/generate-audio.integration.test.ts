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
    it('returns 503 when REPLICATE_API_TOKEN is missing', async () => {
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
      expect(data.error).toContain('REPLICATE_API_TOKEN');
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
      const res = await post({ prompt: '   ' });

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
          input: expect.objectContaining({ prompt: 'test', duration: 15 }),
        })
      );
    });

    it('clamps duration above 180 to 180', async () => {
      mockRun.mockResolvedValue('https://x.com/a.wav');

      await post({ prompt: 'test', duration: 200 });

      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          input: expect.objectContaining({ duration: 180 }),
        })
      );
    });

    it('clamps duration below 1 to 1', async () => {
      mockRun.mockResolvedValue('https://x.com/a.wav');

      await post({ prompt: 'test', duration: 0 });

      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          input: expect.objectContaining({ duration: 1 }),
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

    it('returns 200 when Replicate returns object with url key', async () => {
      mockRun.mockResolvedValue({ url: 'https://cdn.example.com/out.wav' });

      const res = await post({ prompt: 'test' });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toBe('https://cdn.example.com/out.wav');
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
