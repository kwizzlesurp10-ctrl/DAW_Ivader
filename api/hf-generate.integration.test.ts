/**
 * Integration tests for /api/hf-generate — HuggingFace text and image generation.
 * Mocks fetch — tests request parsing, response shape, status codes, CORS.
 * This endpoint is entirely separate from /api/generate-audio (Replicate audio).
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('api/hf-generate (HuggingFace text + image generation)', () => {
  let handler: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    process.env.HUGGINGFACE_API_TOKEN = 'hf-test-token';
    const mod = await import('./hf-generate');
    handler = mod.default;
  });

  afterEach(() => {
    delete process.env.HUGGINGFACE_API_TOKEN;
    vi.restoreAllMocks();
  });

  async function post(body: unknown): Promise<Response> {
    return handler(
      new Request('https://example.com/api/hf-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
  }

  // ---------------------------------------------------------------------------
  // Method & CORS
  // ---------------------------------------------------------------------------

  describe('method and CORS', () => {
    it('returns 204 for OPTIONS preflight', async () => {
      const res = await handler(
        new Request('https://example.com/api/hf-generate', { method: 'OPTIONS' })
      );
      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeDefined();
    });

    it('returns 405 for GET', async () => {
      const res = await handler(
        new Request('https://example.com/api/hf-generate', { method: 'GET' })
      );
      expect(res.status).toBe(405);
      const data = await res.json();
      expect(data).toHaveProperty('error');
    });

    it('includes CORS headers in text success response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'Creative text here' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      ));
      const res = await post({ type: 'text', prompt: 'dark bass' });
      expect(res.status).toBe(200);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  describe('auth', () => {
    it('returns 503 when HUGGINGFACE_API_TOKEN is not set', async () => {
      delete process.env.HUGGINGFACE_API_TOKEN;
      vi.resetModules();
      const mod = await import('./hf-generate');
      const h = mod.default;
      const res = await h(
        new Request('https://example.com/api/hf-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'text', prompt: 'test' }),
        })
      );
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toContain('HUGGINGFACE_API_TOKEN');
    });
  });

  // ---------------------------------------------------------------------------
  // Request validation
  // ---------------------------------------------------------------------------

  describe('request validation', () => {
    it('returns 400 for invalid JSON body', async () => {
      const res = await handler(
        new Request('https://example.com/api/hf-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'not json',
        })
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Invalid JSON');
    });

    it('returns 400 when type is missing', async () => {
      const res = await post({ prompt: 'test' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when type is invalid', async () => {
      const res = await post({ type: 'audio', prompt: 'test' });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('"text" or "image"');
    });

    it('returns 400 for missing prompt', async () => {
      const res = await post({ type: 'text' });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Missing or empty');
    });

    it('returns 400 for empty prompt', async () => {
      const res = await post({ type: 'image', prompt: '   ' });
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // Text generation
  // ---------------------------------------------------------------------------

  describe('text generation', () => {
    it('returns 200 with text when HF chat endpoint responds', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'Vivid cyberpunk vision...' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      ));
      const res = await post({ type: 'text', prompt: 'dark industrial soundscape' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('text', 'Vivid cyberpunk vision...');
      expect(data).not.toHaveProperty('dataUrl');
    });

    it('sends Authorization header, system prompt, and user prompt to HF', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'output' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      vi.stubGlobal('fetch', mockFetch);
      await post({ type: 'text', prompt: 'cyberpunk melody' });
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('Mistral-7B-Instruct');
      expect(url).toContain('/v1/chat/completions');
      const headers = options.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer hf-test-token');
      const body = JSON.parse(options.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
      expect(body.messages[1].content).toBe('cyberpunk melody');
    });

    it('returns 502 when HF text API returns non-200', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('Model is loading', { status: 503 })
      ));
      const res = await post({ type: 'text', prompt: 'test' });
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toContain('Text generation failed');
    });

    it('returns 502 when HF text API returns no choices', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      ));
      const res = await post({ type: 'text', prompt: 'test' });
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toContain('no text content');
    });

    it('returns 502 when fetch to HF text endpoint throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
      const res = await post({ type: 'text', prompt: 'test' });
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toContain('Text generation failed');
    });
  });

  // ---------------------------------------------------------------------------
  // Image generation
  // ---------------------------------------------------------------------------

  describe('image generation', () => {
    it('returns 200 with dataUrl when HF image endpoint responds', async () => {
      const fakeBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // mock bytes
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(fakeBytes.buffer, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        })
      ));
      const res = await post({ type: 'image', prompt: 'neon cityscape' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(typeof data.dataUrl).toBe('string');
      expect(data.dataUrl).toMatch(/^data:image\/png;base64,/);
      expect(data).not.toHaveProperty('text');
    });

    it('sends Authorization header and prompt to HF image model', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]).buffer, {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        })
      );
      vi.stubGlobal('fetch', mockFetch);
      await post({ type: 'image', prompt: 'alien synthesizer' });
      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('FLUX.1-schnell');
      const headers = options.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer hf-test-token');
      const body = JSON.parse(options.body as string) as { inputs: string };
      expect(body.inputs).toBe('alien synthesizer');
    });

    it('returns 200 with jpeg dataUrl', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(new Uint8Array([0xff, 0xd8, 0xff]).buffer, {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        })
      ));
      const res = await post({ type: 'image', prompt: 'test' });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('returns 502 when HF image API returns non-200', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('Quota exceeded', { status: 429 })
      ));
      const res = await post({ type: 'image', prompt: 'test' });
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toContain('Image generation failed');
    });

    it('returns 502 when fetch to HF image endpoint throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
      const res = await post({ type: 'image', prompt: 'test' });
      expect(res.status).toBe(502);
    });
  });

  // ---------------------------------------------------------------------------
  // Outer catch
  // ---------------------------------------------------------------------------

  describe('handler outer catch', () => {
    it('returns 500 with Invalid request when request is null', async () => {
      const res = await handler(null as unknown as Request);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe('Invalid request');
    });

    it('returns 500 when handleRequest throws unexpectedly', async () => {
      const fakeRequest = Object.create(Request.prototype);
      Object.defineProperty(fakeRequest, 'method', {
        get() { throw new Error('crash'); },
      });
      const res = await handler(fakeRequest);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain('Internal error:');
    });
  });
});
