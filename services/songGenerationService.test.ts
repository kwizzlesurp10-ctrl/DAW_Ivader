import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSong, GENERATE_SONG_PROMPT_MAX_LENGTH } from './songGenerationService';
import { isOk, isErr } from '../lib/result';

const mockFetch = vi.fn();

const validSongRaw = {
  title: 'Test Song',
  bpm: 128,
  tracks: [
    {
      id: 't1',
      name: 'LEAD',
      type: 'synth' as const,
      notes: [{ note: 'C4', startStep: 0, durationSteps: 2 }],
      params: {
        waveform: 'sawtooth' as const,
        attack: 0.01,
        decay: 0.1,
        sustain: 0.5,
        release: 0.2,
        filterCutoff: 2000,
        filterRes: 1,
        gain: 0.4,
      },
      muted: false,
    },
  ],
};

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('songGenerationService', () => {
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('returns err on empty prompt without fetching', async () => {
    const result = await generateSong('   ');
    expect(isErr(result)).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns err on over-long prompt without fetching', async () => {
    const result = await generateSong('x'.repeat(GENERATE_SONG_PROMPT_MAX_LENGTH + 1));
    expect(isErr(result)).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('POSTs prompt to /api/generate-song', async () => {
    mockFetch.mockResolvedValue(jsonOk({ content: JSON.stringify(validSongRaw) }));
    await generateSong('dark bass');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/generate-song',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toEqual({ prompt: 'dark bass' });
  });

  it('never sends an Authorization header from the client', async () => {
    mockFetch.mockResolvedValue(jsonOk({ content: JSON.stringify(validSongRaw) }));
    await generateSong('cyberpunk');
    const headers = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('authorization');
  });

  it('returns ok(SongData) when server returns valid content', async () => {
    mockFetch.mockResolvedValue(jsonOk({ content: JSON.stringify(validSongRaw) }));
    const result = await generateSong('cyberpunk');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.title).toBe('Test Song');
      expect(result.value.bpm).toBe(128);
      expect(result.value.tracks).toHaveLength(1);
    }
  });

  it('strips markdown fences before parsing', async () => {
    const fenced = '```json\n' + JSON.stringify(validSongRaw) + '\n```';
    mockFetch.mockResolvedValue(jsonOk({ content: fenced }));
    const result = await generateSong('test');
    expect(isOk(result)).toBe(true);
  });

  it('surfaces server error bodies', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'AI song generation not configured. Set OPEN_ROUTER_API_KEY in your environment variables.' }), { status: 503 })
    );
    const result = await generateSong('test');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('OPEN_ROUTER_API_KEY');
    }
  });

  it('gives a vercel dev hint on 404', async () => {
    mockFetch.mockResolvedValue(new Response('Not found', { status: 404 }));
    const result = await generateSong('test');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('vercel dev');
    }
  });

  it('returns err when model content is invalid JSON', async () => {
    mockFetch.mockResolvedValue(jsonOk({ content: 'not json at all' }));
    const result = await generateSong('test');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('invalid JSON');
    }
  });

  it('returns err when song fails schema validation', async () => {
    mockFetch.mockResolvedValue(jsonOk({ content: JSON.stringify({ title: 'x', bpm: 'fast', tracks: [] }) }));
    const result = await generateSong('test');
    expect(isErr(result)).toBe(true);
  });

  it('returns err on network failure', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await generateSong('test');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('request failed');
    }
  });
});
