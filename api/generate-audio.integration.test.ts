/**
 * Integration tests for generate-audio API communication layer.
 * Mocks Replicate — tests request parsing, response shape, status codes, CORS.
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockRun = vi.fn();
const mockPredictionsCreate = vi.fn();
const mockPredictionsGet = vi.fn();

vi.mock('replicate', () => ({
  default: class MockReplicate {
    run = mockRun;
    predictions = {
      create: mockPredictionsCreate,
      get: mockPredictionsGet
    };
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
    mockPredictionsCreate.mockReset();
    mockPredictionsGet.mockReset();
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
      mockPredictionsCreate.mockResolvedValue({ id: 'p1', status: 'succeeded', output: 'https://x.com/a.wav' });

      const res = await post({ prompt: 'test' });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockPredictionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ prompt: 'test', duration: 15 }),
        })
      );
    });

    it('accepts old "large" model version for backward compatibility', async () => {
      mockPredictionsCreate.mockResolvedValue({ id: 'p1', status: 'succeeded', output: 'https://x.com/a.wav' });

      const res = await post({ prompt: 'test', model_version: 'large' });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockPredictionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'stability-ai/stable-audio-2.5'
        })
      );
    });
  });

  describe('happy path', () => {
    it('returns 200 with url when Replicate succeeds (direct string)', async () => {
      const url = 'https://replicate.delivery/xyz.wav';
      mockPredictionsCreate.mockResolvedValue({ id: 'p1', status: 'succeeded', output: url });

      const res = await post({ prompt: 'dark bass' });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ url });
    });

    it('returns 200 with url when Replicate succeeds (array)', async () => {
      const url = 'https://replicate.delivery/xyz.wav';
      mockPredictionsCreate.mockResolvedValue({ id: 'p1', status: 'succeeded', output: [url] });

      const res = await post({ prompt: 'dark bass' });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ url });
    });

    it('returns 200 with url when Replicate succeeds (object with audio key)', async () => {
      const url = 'https://replicate.delivery/xyz.wav';
      mockPredictionsCreate.mockResolvedValue({ id: 'p1', status: 'succeeded', output: { audio: url } });

      const res = await post({ prompt: 'dark bass' });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ url });
    });

    it('polls until success', async () => {
      const url = 'https://replicate.delivery/xyz.wav';
      mockPredictionsCreate.mockResolvedValue({ id: 'p1', status: 'starting' });
      mockPredictionsGet.mockResolvedValueOnce({ id: 'p1', status: 'processing' })
                         .mockResolvedValueOnce({ id: 'p1', status: 'succeeded', output: url });

      const res = await post({ prompt: 'dark bass' });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ url });
      expect(mockPredictionsGet).toHaveBeenCalledTimes(2);
    });
  });

  describe('Replicate errors', () => {
    it('returns 502 when Replicate fails', async () => {
      mockPredictionsCreate.mockResolvedValue({ id: 'p1', status: 'starting' });
      mockPredictionsGet.mockResolvedValue({ id: 'p1', status: 'failed', error: 'Model crash' });

      const res = await post({ prompt: 'test' });

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('failed') }));
    });

    it('returns 502 when Replicate succeeds but no URL is returned', async () => {
      mockPredictionsCreate.mockResolvedValue({ id: 'p1', status: 'succeeded', output: {} });

      const res = await post({ prompt: 'test' });

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('no URL') }));
    });

    it('returns 500 on fatal error', async () => {
      mockPredictionsCreate.mockRejectedValue(new Error('Network error'));

      const res = await post({ prompt: 'test' });

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Network error') }));
    });
  });
});
