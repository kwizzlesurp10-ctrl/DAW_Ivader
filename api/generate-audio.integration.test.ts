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
  let handler: any;

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

  function createMockRes() {
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      end: vi.fn().mockReturnThis(),
    };
    return res;
  }

  async function post(body: unknown) {
    const req = {
      method: 'POST',
      body,
    };
    const res = createMockRes();
    await handler(req, res);
    return res;
  }

  describe('method and CORS', () => {
    it('returns 204 for OPTIONS preflight', async () => {
      const req = { method: 'OPTIONS' };
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
    });

    it('returns 405 for GET', async () => {
      const req = { method: 'GET' };
      const res = createMockRes();
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    });

    it('includes CORS headers in success response', async () => {
      mockRun.mockResolvedValue('https://x.com/a.wav');

      const res = await post({ prompt: 'test' });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
    });
  });

  describe('auth', () => {
    it('returns 503 when REPLICATE_API_TOKEN is missing', async () => {
      delete process.env.REPLICATE_API_TOKEN;
      const res = await post({ prompt: 'test' });

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('REPLICATE_API_TOKEN') }));
    });
  });

  describe('request validation', () => {
    it('returns 400 for missing prompt', async () => {
      const res = await post({});

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('prompt') }));
    });

    it('accepts prompt only and defaults duration', async () => {
      mockRun.mockResolvedValue('https://x.com/a.wav');

      const res = await post({ prompt: 'test' });

      expect(res.status).toHaveBeenCalledWith(200);
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
  });

  describe('happy path', () => {
    it('returns 200 with url when Replicate returns string', async () => {
      const url = 'https://replicate.delivery/xyz.wav';
      mockRun.mockResolvedValue(url);

      const res = await post({ prompt: 'dark bass' });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ url });
    });

    it('returns 200 with url when Replicate returns array', async () => {
      mockRun.mockResolvedValue(['https://replicate.delivery/abc.wav']);

      const res = await post({ prompt: 'test', duration: 5 });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ url: 'https://replicate.delivery/abc.wav' });
    });
  });

  describe('Replicate errors', () => {
    it('returns 502 when Replicate returns no URL', async () => {
      mockRun.mockResolvedValue({});

      const res = await post({ prompt: 'test' });

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('audio URL') }));
    });

    it('returns 502 when Replicate throws', async () => {
      mockRun.mockRejectedValue(new Error('API rate limit'));

      const res = await post({ prompt: 'test' });

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Generation failed') }));
    });
  });
});