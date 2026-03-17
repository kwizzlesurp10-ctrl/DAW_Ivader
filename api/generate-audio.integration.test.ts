/**
 * Integration tests for generate-audio API communication layer.
 * Mocks Replicate and fetch — tests request parsing, response shape, status codes, CORS.
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
    delete process.env.HUGGINGFACE_API_TOKEN;
    const mod = await import('./generate-audio');
    handler = mod.default;
    mockRun.mockReset();
  });

  afterEach(() => {
    delete process.env.REPLICATE_API_TOKEN;
    delete process.env.HUGGINGFACE_API_TOKEN;
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
    it('returns 503 when neither REPLICATE_API_TOKEN nor HUGGINGFACE_API_TOKEN is set', async () => {
      delete process.env.REPLICATE_API_TOKEN;
      delete process.env.HUGGINGFACE_API_TOKEN;
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
          input: expect.objectContaining({ prompt: 'test', duration: 12 }),
        })
      );
    });

    it('clamps duration above max to max', async () => {
      mockRun.mockResolvedValue('https://x.com/a.wav');
      await post({ prompt: 'test', duration: 100 });
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          input: expect.objectContaining({ duration: 15 }),
        })
      );
    });

    it('clamps duration below min to min', async () => {
      mockRun.mockResolvedValue('https://x.com/a.wav');
      await post({ prompt: 'test', duration: 0 });
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          input: expect.objectContaining({ duration: 10 }),
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
      const mockFileOutput = { url: () => new URL('https://replicate.delivery/out.mp3') };
      mockRun.mockResolvedValue(mockFileOutput);
      const res = await post({ prompt: 'test' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toBe('https://replicate.delivery/out.mp3');
    });

    it('returns 200 when FileOutput url() returns a URL object', async () => {
      const mockFileOutput = { url: () => new URL('https://replicate.delivery/out.mp3') };
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

    it('sends cfg_scale and steps to Replicate', async () => {
      mockRun.mockResolvedValue('https://replicate.delivery/out.mp3');
      await post({ prompt: 'chill beats' });
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          input: expect.objectContaining({
            cfg_scale: 7,
            steps: 8,
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

    it('returns 500 with descriptive error when handleRequest throws unexpectedly', async () => {
      // Create a request where accessing .method throws after the null check passes.
      const fakeRequest = Object.create(Request.prototype);
      Object.defineProperty(fakeRequest, 'method', {
        get() { throw new Error('simulated crash'); },
      });
      const res = await handler(fakeRequest);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain('Internal error:');
      expect(data.error).toContain('simulated crash');
    });
  });

  describe('HuggingFace fallback (when REPLICATE_API_TOKEN is absent)', () => {
    let hfHandler: (req: Request) => Promise<Response>;

    beforeEach(async () => {
      vi.resetModules();
      delete process.env.REPLICATE_API_TOKEN;
      process.env.HUGGINGFACE_API_TOKEN = 'hf-test-token';
      const mod = await import('./generate-audio');
      hfHandler = mod.default;
    });

    afterEach(() => {
      delete process.env.HUGGINGFACE_API_TOKEN;
    });

    async function hfPost(body: unknown): Promise<Response> {
      return hfHandler(
        new Request('https://example.com/api/generate-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      );
    }

    it('returns 200 with data URL when HuggingFace returns audio', async () => {
      const fakeAudio = new Uint8Array([0x52, 0x49, 0x46, 0x46]); // mock audio bytes
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(fakeAudio.buffer, {
          status: 200,
          headers: { 'Content-Type': 'audio/flac' },
        })
      ));
      const res = await hfPost({ prompt: 'chill beats' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(typeof data.url).toBe('string');
      expect(data.url).toMatch(/^data:audio\/flac;base64,/);
    });

    it('sends Authorization header and prompt to HuggingFace', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]).buffer, {
          status: 200,
          headers: { 'Content-Type': 'audio/wav' },
        })
      );
      vi.stubGlobal('fetch', mockFetch);
      await hfPost({ prompt: 'dark bass', duration: 10 });
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('api-inference.huggingface.co');
      expect(url).toContain('musicgen-large');
      expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer hf-test-token');
      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(body.inputs).toBe('dark bass');
      expect((body.parameters as Record<string, unknown>).duration).toBe(10);
    });

    it('returns 200 with data URL when HuggingFace returns audio/wav', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(new Uint8Array([0, 1, 2]).buffer, {
          status: 200,
          headers: { 'Content-Type': 'audio/wav' },
        })
      ));
      const res = await hfPost({ prompt: 'test' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toMatch(/^data:audio\/wav;base64,/);
    });

    it('returns 502 when HuggingFace returns an error status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('Model is loading', { status: 503 })
      ));
      const res = await hfPost({ prompt: 'test' });
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toContain('Generation failed');
      expect(data.error).toContain('503');
    });

    it('returns 502 when fetch to HuggingFace throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network failure')));
      const res = await hfPost({ prompt: 'test' });
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toContain('Generation failed');
    });

    it('uses Replicate (not HuggingFace) when both tokens are present', async () => {
      // Restore Replicate token so both are set
      vi.resetModules();
      process.env.REPLICATE_API_TOKEN = 'test-token';
      process.env.HUGGINGFACE_API_TOKEN = 'hf-test-token';
      const mod = await import('./generate-audio');
      const bothHandler = mod.default;
      mockRun.mockResolvedValue('https://replicate.delivery/out.mp3');
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);
      const res = await bothHandler(
        new Request('https://example.com/api/generate-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'test' }),
        })
      );
      expect(res.status).toBe(200);
      expect(mockRun).toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      delete process.env.REPLICATE_API_TOKEN;
    });
  });
});
