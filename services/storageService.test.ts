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

    it('returns err when stored value is corrupted JSON', () => {
      store[STORAGE_KEY] = '{ invalid json {{{';
      const result = loadSong();
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('Load failed');
    });

    it('returns err when getItem throws an Error', () => {
      vi.stubGlobal('localStorage', {
        ...mockLocalStorage,
        getItem: () => { throw new Error('SecurityError'); },
      });
      const result = loadSong();
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('Load failed: SecurityError');
    });

    it('returns err when getItem throws a non-Error', () => {
      // Tests the defensive `e instanceof Error ? e.message : String(e)` false-branch:
      // JS allows `throw 'string'` and the source code handles this gracefully.
      vi.stubGlobal('localStorage', {
        ...mockLocalStorage,
        getItem: () => { throw 'access denied'; },
      });
      const result = loadSong();
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('Load failed');
    });
  });

  describe('saveSong catch path', () => {
    it('returns err when setItem throws an Error', () => {
      vi.stubGlobal('localStorage', {
        ...mockLocalStorage,
        setItem: () => { throw new Error('QuotaExceededError'); },
      });
      const result = saveSong(validSong);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('Save failed: QuotaExceededError');
    });

    it('returns err when setItem throws a non-Error', () => {
      // Tests the defensive `e instanceof Error ? e.message : String(e)` false-branch:
      // JS allows `throw 'string'` and the source code handles this gracefully.
      vi.stubGlobal('localStorage', {
        ...mockLocalStorage,
        setItem: () => { throw 'disk full'; },
      });
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

    it('returns err when JSON.parse throws a non-Error value', () => {
      // Tests the defensive `e instanceof Error ? e.message : String(e)` false-branch:
      // JS allows `throw 'string'` and the source code handles this gracefully.
      const spy = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => { throw 'not an error object'; });
      const result = importSongFromJson('{}');
      spy.mockRestore();
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('Import failed: not an error object');
    });
  });
});
