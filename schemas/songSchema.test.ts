import { describe, it, expect } from 'vitest';
import {
  noteEventSchema,
  synthParamsSchema,
  trackSchema,
  songDataSchema,
  drumPadSlotSchema,
  parseSongResponse,
} from './songSchema';
import { DRUM_PAD_COUNT } from '../types';
import { isOk, isErr } from '../lib/result';

describe('songSchema', () => {
  const validNote = { note: 'C4', startStep: 0, durationSteps: 2 };
  const validParams = {
    waveform: 'sine' as const,
    attack: 0.01,
    decay: 0.1,
    sustain: 0.5,
    release: 0.2,
    filterCutoff: 1000,
    filterRes: 1,
    gain: 0.5,
  };
  const validTrack = {
    id: 't1',
    name: 'LEAD',
    type: 'synth' as const,
    notes: [validNote],
    params: validParams,
    muted: false,
  };
  const validSong = {
    title: 'Test',
    bpm: 120,
    tracks: [validTrack],
  };

  describe('noteEventSchema', () => {
    it('accepts valid note event', () => {
      expect(noteEventSchema.parse(validNote)).toEqual(validNote);
    });
    it('accepts startStep up to 31 (32-step patterns)', () => {
      expect(noteEventSchema.parse({ ...validNote, startStep: 31 })).toMatchObject({ startStep: 31 });
    });
    it('rejects startStep > 31', () => {
      expect(() => noteEventSchema.parse({ ...validNote, startStep: 32 })).toThrow();
    });
    it('rejects startStep < 0', () => {
      expect(() => noteEventSchema.parse({ ...validNote, startStep: -1 })).toThrow();
    });
    it('rejects missing required fields', () => {
      expect(() => noteEventSchema.parse({ note: 'C4' })).toThrow();
    });
  });

  describe('synthParamsSchema', () => {
    it('accepts valid params', () => {
      expect(synthParamsSchema.parse(validParams)).toEqual(validParams);
    });
    it('rejects invalid waveform', () => {
      expect(() =>
        synthParamsSchema.parse({ ...validParams, waveform: 'noise' })
      ).toThrow();
    });
  });

  describe('trackSchema', () => {
    it('accepts valid track', () => {
      expect(trackSchema.parse(validTrack)).toMatchObject(validTrack);
    });
    it('defaults muted to undefined when omitted', () => {
      const { muted, ...rest } = validTrack;
      const parsed = trackSchema.parse(rest);
      expect(parsed.muted).toBeUndefined();
    });
    it('rejects invalid type', () => {
      expect(() =>
        trackSchema.parse({ ...validTrack, type: 'guitar' })
      ).toThrow();
    });
  });

  describe('songDataSchema', () => {
    it('accepts valid song', () => {
      expect(songDataSchema.parse(validSong)).toMatchObject(validSong);
    });
    it('rejects empty tracks', () => {
      expect(() => songDataSchema.parse({ title: 'X', bpm: 120, tracks: [] })).toThrow();
    });
    it('rejects bpm out of range', () => {
      expect(() =>
        songDataSchema.parse({ ...validSong, bpm: 0 })
      ).toThrow();
      expect(() =>
        songDataSchema.parse({ ...validSong, bpm: 1000 })
      ).toThrow();
    });
    it('rejects malformed JSON shape', () => {
      expect(() => songDataSchema.parse({})).toThrow();
      expect(() => songDataSchema.parse({ title: 123, bpm: 120, tracks: [] })).toThrow();
    });
    it('accepts song with optional drumPads array', () => {
      const raw = {
        ...validSong,
        drumPads: [{ name: 'A', audioUrl: 'https://example.com/x.wav' }],
      };
      expect(songDataSchema.parse(raw)).toMatchObject({ drumPads: [{ name: 'A' }] });
    });
  });

  describe('drumPadSlotSchema', () => {
    it('accepts minimal pad', () => {
      expect(drumPadSlotSchema.parse({ name: 'Pad 1' })).toEqual({ name: 'Pad 1' });
    });
    it('accepts trim fields', () => {
      expect(
        drumPadSlotSchema.parse({
          name: 'X',
          audioUrl: 'https://example.com/a.wav',
          audioTrimStart: 0.5,
          audioTrimEnd: 4,
          muted: true,
        })
      ).toMatchObject({ muted: true });
    });
  });

  describe('parseSongResponse', () => {
    it('returns ok(SongData) for valid raw', () => {
      const result = parseSongResponse(validSong);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.title).toBe('Test');
        expect(result.value.bpm).toBe(120);
        expect(result.value.stepsPerPattern).toBe(16);
        expect(result.value.swing).toBe(0);
        expect(result.value.tracks).toHaveLength(1);
        expect(result.value.tracks[0].muted).toBe(false);
        expect(result.value.tracks[0].solo).toBe(false);
        expect(result.value.tracks[0].volume).toBe(1);
        expect(result.value.tracks[0].pan).toBe(0);
        expect(result.value.drumPads).toHaveLength(DRUM_PAD_COUNT);
      }
    });
    it('defaults muted to false when omitted', () => {
      const { muted, ...trackWithoutMuted } = validTrack;
      const raw = { title: 'X', bpm: 100, tracks: [trackWithoutMuted] };
      const result = parseSongResponse(raw);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) expect(result.value.tracks[0].muted).toBe(false);
    });
    it('returns err for invalid shape', () => {
      const result = parseSongResponse({});
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error.message).toContain('Invalid song data');
    });
    it('returns err for empty tracks', () => {
      const result = parseSongResponse({ title: 'X', bpm: 120, tracks: [] });
      expect(isErr(result)).toBe(true);
    });
    it('preserves audioTrimStart and audioTrimEnd on audio tracks', () => {
      const raw = {
        title: 'Trim',
        bpm: 120,
        tracks: [
          {
            ...validTrack,
            type: 'audio',
            audioUrl: 'https://example.com/clip.wav',
            audioTrimStart: 1.5,
            audioTrimEnd: 10,
          },
        ],
      };
      const result = parseSongResponse(raw);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.tracks[0].audioTrimStart).toBe(1.5);
        expect(result.value.tracks[0].audioTrimEnd).toBe(10);
      }
    });
  });
});
