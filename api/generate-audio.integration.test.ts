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
    it('returns 503 when neither HUGGINGFACE_API_TOKEN nor REPLICATE_API_TOKEN is set', async () => {
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
      // Replicate v1.x wraps URLs in FileOutput objects; toString() returns the URL string
      const mockFileOutput = { toString: () => 'https://cdn.example.com/out.wav' };
      mockRun.mockResolvedValue(mockFileOutput);

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

describe('api/generate-audio — HuggingFace backend', () => {
  let generateWithHuggingFace: (
    token: string,
    prompt: string,
    duration: number,
    modelVersion: import('../schemas/generateAudioSchema').MusicGenModelVersion,
    signal?: AbortSignal
  ) => Promise<{ url: string } | { error: string }>;
  let handler: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    delete process.env.REPLICATE_API_TOKEN;
    process.env.HUGGINGFACE_API_TOKEN = 'hf-test-token';
    const mod = await import('./generate-audio');
    generateWithHuggingFace = mod.generateWithHuggingFace;
    handler = mod.default;
  });

  afterEach(() => {
    delete process.env.HUGGINGFACE_API_TOKEN;
    delete process.env.REPLICATE_API_TOKEN;
    vi.restoreAllMocks();
  });

  function mockFetchOk(audioBytes: Uint8Array, contentType = 'audio/wav') {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(audioBytes, {
          status: 200,
          headers: { 'Content-Type': contentType },
        })
      )
    );
  }

  function mockFetchError(status: number, body = 'Service unavailable') {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(body, { status }))
    );
  }

  describe('generateWithHuggingFace()', () => {
    it('returns data URL on success', async () => {
      const fakeWav = new Uint8Array([82, 73, 70, 70]); // "RIFF"
      mockFetchOk(fakeWav, 'audio/wav');

      const result = await generateWithHuggingFace('tok', 'dark bass', 8, 'large');

      expect('url' in result).toBe(true);
      if ('url' in result) {
        expect(result.url).toMatch(/^data:audio\/wav;base64,/);
      }
    });

    it('calls correct HuggingFace model URL for each variant', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(new Uint8Array([0]), { status: 200, headers: { 'Content-Type': 'audio/wav' } })
      );
      vi.stubGlobal('fetch', fetchMock);

      const variants = [
        ['small', 'facebook/musicgen-small'],
        ['large', 'facebook/musicgen-large'],
        ['stereo-large', 'facebook/musicgen-stereo-large'],
        ['melody-large', 'facebook/musicgen-melody-large'],
        ['stereo-melody-large', 'facebook/musicgen-stereo-melody-large'],
      ] as const;

      for (const [version, expectedModel] of variants) {
        fetchMock.mockClear();
        await generateWithHuggingFace('tok', 'test', 8, version);
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining(expectedModel),
          expect.any(Object)
        );
      }
    });

    it('sends Authorization header with Bearer token', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(new Uint8Array([0]), { status: 200, headers: { 'Content-Type': 'audio/wav' } })
      );
      vi.stubGlobal('fetch', fetchMock);

      await generateWithHuggingFace('hf-abc123', 'jazz', 5, 'large');

      const [, fetchOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((fetchOptions.headers as Record<string, string>)['Authorization']).toBe('Bearer hf-abc123');
    });

    it('sends max_new_tokens proportional to duration', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(new Uint8Array([0]), { status: 200, headers: { 'Content-Type': 'audio/wav' } })
      );
      vi.stubGlobal('fetch', fetchMock);

      await generateWithHuggingFace('tok', 'test', 10, 'large');

      const [, fetchOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(fetchOptions.body as string) as { parameters: { max_new_tokens: number } };
      expect(body.parameters.max_new_tokens).toBe(500); // 10s * 50 tokens/s
    });

    it('returns error with model-loading message when HuggingFace returns 503', async () => {
      mockFetchError(503, JSON.stringify({ error: 'Model is currently loading', estimated_time: 30.5 }));

      const result = await generateWithHuggingFace('tok', 'test', 8, 'large');

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('loading');
        expect(result.error).toContain('31s'); // Math.ceil(30.5)
      }
    });

    it('returns error with retry message when HuggingFace returns 503 without JSON', async () => {
      mockFetchError(503, 'Service overloaded');

      const result = await generateWithHuggingFace('tok', 'test', 8, 'large');

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('loading');
      }
    });

    it('returns error on AbortError (timeout)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })));

      const result = await generateWithHuggingFace('tok', 'test', 8, 'large');

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('timed out');
      }
    });

    it('returns error when fetch throws (network failure)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const result = await generateWithHuggingFace('tok', 'test', 8, 'large');

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('Network error');
      }
    });

    it('propagates abort from an already-aborted caller signal', async () => {
      // When the caller signal is already aborted before the call,
      // the combined signal should also be aborted and fetch should see it
      const callerController = new AbortController();
      callerController.abort('test-abort');

      const fetchMock = vi.fn().mockRejectedValue(
        Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
      );
      vi.stubGlobal('fetch', fetchMock);

      const result = await generateWithHuggingFace('tok', 'test', 8, 'large', callerController.signal);

      // The combined signal passed to fetch should already be aborted
      const [, fetchOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect((fetchOptions.signal as AbortSignal).aborted).toBe(true);

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('timed out');
      }
    });

    it('falls back to timeout signal when caller signal lacks addEventListener', async () => {
      // Simulate a non-standard/partial AbortSignal (e.g. from an older Vercel Node.js build)
      // that is truthy but does not implement addEventListener.
      const incompleteSignal = { aborted: false } as AbortSignal;

      const fakeWav = new Uint8Array([82, 73, 70, 70]);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(fakeWav, { status: 200, headers: { 'Content-Type': 'audio/wav' } })
        )
      );

      // Must not throw — should return { url } successfully using the timeout-only signal
      const result = await generateWithHuggingFace('tok', 'test', 8, 'large', incompleteSignal);

      expect('url' in result).toBe(true);
    });

    it('returns error (does not throw) when Buffer encoding fails', async () => {
      const fakeWav = new Uint8Array([82, 73, 70, 70]);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(fakeWav, { status: 200, headers: { 'Content-Type': 'audio/wav' } })
        )
      );

      vi.spyOn(Buffer, 'from').mockImplementationOnce(() => {
        throw new Error('Buffer encoding failed');
      });

      const result = await generateWithHuggingFace('tok', 'test', 8, 'large');

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('encode audio');
      }
    });
  });

  describe('handler with HuggingFace backend', () => {
    it('uses HuggingFace when HUGGINGFACE_API_TOKEN is set (no Replicate token)', async () => {
      const fakeWav = new Uint8Array([82, 73, 70, 70]);
      mockFetchOk(fakeWav, 'audio/wav');

      const res = await handler(
        new Request('https://example.com/api/generate-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'test' }),
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json() as { url: string };
      expect(data.url).toMatch(/^data:audio\/wav;base64,/);
    });

    it('prefers HuggingFace when both tokens are set', async () => {
      process.env.REPLICATE_API_TOKEN = 'rep-token';
      vi.resetModules();
      process.env.HUGGINGFACE_API_TOKEN = 'hf-test-token';
      const mod = await import('./generate-audio');
      const h = mod.default;

      const fakeWav = new Uint8Array([82, 73, 70, 70]);
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(fakeWav, { status: 200, headers: { 'Content-Type': 'audio/wav' } })
      );
      vi.stubGlobal('fetch', fetchMock);

      const res = await h(
        new Request('https://example.com/api/generate-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'test' }),
        })
      );

      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('api-inference.huggingface.co'),
        expect.any(Object)
      );
    });

    it('returns 502 when HuggingFace API returns error', async () => {
      mockFetchError(503, 'Service overloaded');

      const res = await handler(
        new Request('https://example.com/api/generate-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'test' }),
        })
      );

      expect(res.status).toBe(502);
      const data = await res.json() as { error: string };
      expect(data.error).toContain('Generation failed');
    });

    it('returns 502 (not 500) when generateWithHuggingFace throws unexpectedly', async () => {
      // Create request before stubbing AbortController so the Request constructor is unaffected
      const req = new Request('https://example.com/api/generate-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'test' }),
      });

      // Stub AbortController so that the internal `new AbortController()` in
      // generateWithHuggingFace throws — simulating an unexpected runtime error.
      vi.stubGlobal('AbortController', class {
        constructor() { throw new Error('Unexpected runtime error'); }
      });

      const res = await handler(req);

      // Must return 502 (backend error), NOT 500 (server crash)
      expect(res.status).toBe(502);
      const data = await res.json() as { error: string };
      expect(data.error).toContain('Generation failed');
    });
  });
});
