import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadSong, saveSong, exportSongToJson, importSongFromJson } from './storageService';
import { isOk, isErr } from '../lib/result';
import type { SongData } from '../types';

const STORAGE_KEY = 'doom-daw-song';
let store: Record<string, string> = {};

const mockLocalStorage = {
  getItem: (key: string): string | null => store[key] ?? null,
  setItem: (key: string, value: string): void => {
    store[key] = value;
  },
  removeItem: (key: string): void => {
    delete store[key];
  },
  clear: (): void => {
    store = {};
  },
  get length(): number {
    return Object.keys(store).length;
  },
  key: (_i: number): string | null => null,
};

const validSong: SongData = {
  title: 'Test',
  bpm: 120,
  stepsPerPattern: 16,
  swing: 0,
  tracks: [
    {
      id: 't1',
      name: 'LEAD',
      type: 'synth',
      notes: [{ note: 'C4', startStep: 0, durationSteps: 2 }],
      params: {
        waveform: 'sine',
        attack: 0.01,
        decay: 0.1,
        sustain: 0.5,
        release: 0.2,
        filterCutoff: 1000,
        filterRes: 1,
        gain: 0.5,
      },
      muted: false,
      solo: false,
      volume: 1,
      pan: 0,
    },
  ],
};

describe('storageService', () => {
  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', mockLocalStorage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('saveSong / loadSong', () => {
    it('saves and loads a valid song', () => {
      const saveResult = saveSong(validSong);
      expect(isOk(saveResult)).toBe(true);
      const loadResult = loadSong();
      expect(isOk(loadResult)).toBe(true);
      if (isOk(loadResult)) {
        expect(loadResult.value.title).toBe(validSong.title);
        expect(loadResult.value.bpm).toBe(validSong.bpm);
        expect(loadResult.value.tracks).toHaveLength(validSong.tracks.length);
      }
    });

    it('returns err when nothing saved', () => {
      const result = loadSong();
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('No saved song');
    });

    it('returns err when save throws (e.g. quota)', () => {
      const failingStorage = {
        ...mockLocalStorage,
        setItem: (): void => {
          throw new Error('QuotaExceededError');
        },
      };
      vi.stubGlobal('localStorage', failingStorage);
      const result = saveSong(validSong);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('Save failed');
    });

    it('returns err when load finds invalid JSON in storage', () => {
      store[STORAGE_KEY] = 'not valid json {{{';
      const result = loadSong();
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('Load failed');
    });

    it('returns err when save throws non-Error (e.g. string)', () => {
      const failingStorage = {
        ...mockLocalStorage,
        setItem: (): void => {
          throw 'quota';
        },
      };
      vi.stubGlobal('localStorage', failingStorage);
      const result = saveSong(validSong);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('Save failed');
    });
  });

  describe('exportSongToJson', () => {
    it('returns valid JSON string', () => {
      const json = exportSongToJson(validSong);
      expect(() => JSON.parse(json)).not.toThrow();
      const parsed = JSON.parse(json) as SongData;
      expect(parsed.title).toBe(validSong.title);
      expect(parsed.bpm).toBe(validSong.bpm);
    });
  });

  describe('importSongFromJson', () => {
    it('returns ok(SongData) for valid JSON', () => {
      const json = JSON.stringify(validSong);
      const result = importSongFromJson(json);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.title).toBe(validSong.title);
        expect(result.value.stepsPerPattern).toBe(16);
      }
    });

    it('returns err for invalid JSON', () => {
      const result = importSongFromJson('not json {{{');
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('Import failed');
    });

    it('returns err for JSON that fails schema', () => {
      const result = importSongFromJson(JSON.stringify({ title: 'X', bpm: 120, tracks: [] }));
      expect(isErr(result)).toBe(true);
    });

    it('returns err for empty string', () => {
      const result = importSongFromJson('');
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('Import failed');
    });

    it('returns err for JSON with null tracks', () => {
      const result = importSongFromJson(JSON.stringify({ title: 'X', bpm: 120, tracks: null }));
      expect(isErr(result)).toBe(true);
    });

    it('returns err for JSON with bpm out of range', () => {
      const result = importSongFromJson(
        JSON.stringify({ title: 'X', bpm: 0, stepsPerPattern: 16, swing: 0, tracks: validSong.tracks })
      );
      expect(isErr(result)).toBe(true);
    });
  });
});
