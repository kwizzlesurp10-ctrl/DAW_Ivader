import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSong } from './geminiService';
import { isOk, isErr } from '../lib/result';

const mockGenerateContent = vi.fn();
vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        get generateContent() {
          return mockGenerateContent;
        },
      };
    },
  };
});

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

describe('geminiService', () => {
  const origEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    origEnv.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    origEnv.API_KEY = process.env.API_KEY;
    mockGenerateContent.mockReset();
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = origEnv.GEMINI_API_KEY;
    process.env.API_KEY = origEnv.API_KEY;
  });

  it('returns err when API key is missing', async () => {
    process.env.GEMINI_API_KEY = '';
    process.env.API_KEY = '';
    const result = await generateSong('dark bass');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('GEMINI_API_KEY');
    }
  });

  it('returns ok(SongData) when API returns valid JSON', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.API_KEY = '';
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify(validSongRaw),
    });

    const result = await generateSong('cyberpunk');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.title).toBe('Test Song');
      expect(result.value.bpm).toBe(128);
      expect(result.value.tracks).toHaveLength(1);
      expect(result.value.tracks[0].name).toBe('LEAD');
      expect(result.value.tracks[0].muted).toBe(false);
    }
  });

  it('returns err when API returns invalid JSON', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGenerateContent.mockResolvedValue({ text: 'not valid json {{{' });

    const result = await generateSong('test');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('invalid JSON');
    }
  });

  it('returns err when API returns JSON that fails schema', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ title: 'X', bpm: 120, tracks: [] }),
    });

    const result = await generateSong('test');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('Invalid song data');
    }
  });

  it('returns err when API returns no text', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockGenerateContent.mockResolvedValue({ text: null });

    const result = await generateSong('test');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toContain('No data returned');
    }
  });
});
