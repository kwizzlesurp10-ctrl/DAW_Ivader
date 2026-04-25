/**
 * Integration tests for generate-audio route handler.
 * Mocks Clerk and Replicate — tests auth, request parsing, response shape, and status codes.
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockRun, mockAuth, mockGenerateAudioWithComfyUi, MockComfyUiError } = vi.hoisted(() => ({
  mockRun: vi.fn(),
  mockAuth: vi.fn(),
  mockGenerateAudioWithComfyUi: vi.fn(),
  MockComfyUiError: class MockComfyUiError extends Error {
    constructor(
      message: string,
      readonly status: number = 502
    ) {
      super(message);
      this.name = 'ComfyUiError';
    }
  },
}));

vi.mock('replicate', () => ({
  default: class MockReplicate {
    run = mockRun;
  },
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('../lib/comfyAudioProvider', () => ({
  ComfyUiError: MockComfyUiError,
  generateAudioWithComfyUi: mockGenerateAudioWithComfyUi,
}));

describe('app/api/generate-audio (communication layer)', () => {
  let POST: typeof import('../app/api/generate-audio/route').POST;
  let extractAudioUrl: typeof import('../app/api/generate-audio/route').extractAudioUrl;

  beforeEach(async () => {
    vi.resetModules();
    process.env.REPLICATE_API_TOKEN = 'test-token';
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockRun.mockReset();
    mockGenerateAudioWithComfyUi.mockReset();
    const mod = await import('../app/api/generate-audio/route');
    POST = mod.POST;
    extractAudioUrl = mod.extractAudioUrl;
  });

  afterEach(() => {
    delete process.env.REPLICATE_API_TOKEN;
  });

  async function post(body: unknown): Promise<Response> {
    return POST(
      new Request('http://localhost/api/generate-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
  }

  describe('auth', () => {
    it('returns 401 when Clerk user is missing', async () => {
      mockAuth.mockResolvedValue({ userId: null });
      const res = await post({ prompt: 'test' });

      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual(
        expect.objectContaining({ error: 'Unauthorized' })
      );
    });

    it('returns 503 when REPLICATE_API_TOKEN is missing', async () => {
      delete process.env.REPLICATE_API_TOKEN;
      const res = await post({ prompt: 'test' });

      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual(
        expect.objectContaining({ error: expect.stringContaining('REPLICATE_API_TOKEN') })
      );
    });
  });

  describe('request validation', () => {
    it('returns 400 for missing prompt', async () => {
      const res = await post({});

      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual(
        expect.objectContaining({ error: expect.stringContaining('prompt') })
      );
    });

    it('accepts prompt only and defaults duration', async () => {
      mockRun.mockResolvedValue('https://x.com/a.wav');

      const res = await post({ prompt: 'test' });

      expect(res.status).toBe(200);
      expect(mockRun).toHaveBeenCalledWith(
        'stability-ai/stable-audio-2.5',
        expect.objectContaining({
          input: expect.objectContaining({ prompt: 'test', duration: 15 }),
        })
      );
    });

    it('accepts old "large" model version for backward compatibility', async () => {
      mockRun.mockResolvedValue('https://x.com/a.wav');

      const res = await post({ prompt: 'test', model_version: 'large' });

      expect(res.status).toBe(200);
      expect(mockRun).toHaveBeenCalledWith(
        'stability-ai/stable-audio-2.5',
        expect.any(Object)
      );
    });
  });

  describe('happy path', () => {
    it('returns 200 with url when Replicate succeeds (direct string)', async () => {
      const url = 'https://replicate.delivery/xyz.wav';
      mockRun.mockResolvedValue(url);

      const res = await post({ prompt: 'dark bass' });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ url });
    });

    it('returns 200 with url when Replicate succeeds (array)', async () => {
      const url = 'https://replicate.delivery/xyz.wav';
      mockRun.mockResolvedValue([url]);

      const res = await post({ prompt: 'dark bass' });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ url });
    });

    it('returns 200 with url when Replicate succeeds (object with audio key)', async () => {
      const url = 'https://replicate.delivery/xyz.wav';
      mockRun.mockResolvedValue({ audio: url });

      const res = await post({ prompt: 'dark bass' });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ url });
    });

    it('returns 200 with url when Replicate succeeds (URL object-like)', async () => {
      const url = 'https://replicate.delivery/xyz.wav';
      mockRun.mockResolvedValue({ href: url, toString: () => url });

      const res = await post({ prompt: 'dark bass' });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ url });
    });

    it('extracts FileOutput-style url functions', () => {
      const url = 'https://replicate.delivery/xyz.wav';

      expect(extractAudioUrl({ url: () => new URL(url) })).toBe(url);
    });

    it('returns 200 with url when ComfyUI succeeds', async () => {
      const url = 'http://127.0.0.1:8188/view?filename=test.wav&type=output&subfolder=';
      mockGenerateAudioWithComfyUi.mockResolvedValue({ url, promptId: 'prompt_123' });
      delete process.env.REPLICATE_API_TOKEN;

      const res = await post({ prompt: 'dark bass', backend: 'comfyui' });

      expect(res.status).toBe(200);
      expect(mockRun).not.toHaveBeenCalled();
      expect(mockGenerateAudioWithComfyUi).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'dark bass', backend: 'comfyui' })
      );
      await expect(res.json()).resolves.toEqual({ url });
    });
  });

  describe('Replicate errors', () => {
    it('returns 502 when Replicate succeeds but no URL is returned', async () => {
      mockRun.mockResolvedValue({});

      const res = await post({ prompt: 'test' });

      expect(res.status).toBe(502);
      await expect(res.json()).resolves.toEqual(
        expect.objectContaining({ error: expect.stringContaining('no valid audio URL') })
      );
    });

    it('returns 500 on fatal error', async () => {
      mockRun.mockRejectedValue(new Error('Network error'));

      const res = await post({ prompt: 'test' });

      expect(res.status).toBe(500);
      await expect(res.json()).resolves.toEqual(
        expect.objectContaining({ error: expect.stringContaining('Network error') })
      );
    });
  });

  describe('ComfyUI errors', () => {
    it('returns ComfyUI error status and message', async () => {
      mockGenerateAudioWithComfyUi.mockRejectedValue(
        new MockComfyUiError('ComfyUI is not reachable', 503)
      );

      const res = await post({ prompt: 'test', backend: 'comfyui' });

      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual(
        expect.objectContaining({ error: expect.stringContaining('ComfyUI is not reachable') })
      );
    });
  });
});
