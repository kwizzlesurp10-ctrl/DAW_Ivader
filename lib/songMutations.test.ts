import { describe, it, expect } from 'vitest';
import {
  addTrack,
  removeTrack,
  duplicateTrack,
  moveTrack,
  setTrackMuted,
  setTrackSolo,
  setTrackVolume,
  setTrackPan,
  updateTrackParam,
  setTrackWaveform,
  toggleStep,
  setBpm,
  setStepsPerPattern,
  setSwing,
  setTitle,
  appendTrack,
  createEmptySynthTrack,
  defaultSynthParams,
  assignDrumPadClip,
  clearDrumPad,
  toggleDrumPadMuted,
} from './songMutations';
import type { SongData, Track } from '../types';
import { createEmptyDrumPads } from '../types';

const defaultParams = () => ({
  waveform: 'sine' as const,
  attack: 0.01,
  decay: 0.1,
  sustain: 0.5,
  release: 0.2,
  filterCutoff: 1000,
  filterRes: 1,
  gain: 0.5,
});

function makeSong(tracks: Track[]): SongData {
  return {
    title: 'Test',
    bpm: 120,
    stepsPerPattern: 16,
    swing: 0,
    tracks,
    drumPads: createEmptyDrumPads(),
  };
}

function makeTrack(overrides: Partial<Track> & { id: string; name: string }): Track {
  return {
    type: 'synth',
    notes: [],
    params: defaultParams(),
    muted: false,
    solo: false,
    volume: 1,
    pan: 0,
    ...overrides,
  };
}

describe('songMutations', () => {
  describe('addTrack', () => {
    it('appends track to empty list', () => {
      const song = makeSong([]);
      const t = makeTrack({ id: 't1', name: 'A' });
      const next = addTrack({ ...song, tracks: [t] }, makeTrack({ id: 't2', name: 'B' }));
      expect(next.tracks).toHaveLength(2);
      expect(next.tracks[1].id).toBe('t2');
    });

    it('does not mutate original', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      const t2 = makeTrack({ id: 't2', name: 'B' });
      addTrack(song, t2);
      expect(song.tracks).toHaveLength(1);
    });
  });

  describe('removeTrack', () => {
    it('returns null when only one track', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      expect(removeTrack(song, 't1')).toBeNull();
    });

    it('removes track when two tracks', () => {
      const song = makeSong([
        makeTrack({ id: 't1', name: 'A' }),
        makeTrack({ id: 't2', name: 'B' }),
      ]);
      const next = removeTrack(song, 't1');
      expect(next).not.toBeNull();
      expect(next!.tracks).toHaveLength(1);
      expect(next!.tracks[0].id).toBe('t2');
    });

    it('returns null when track id not found', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      expect(removeTrack(song, 't99')).toBeNull();
    });
  });

  describe('duplicateTrack', () => {
    it('inserts copy after original with new id and name suffix', () => {
      const song = makeSong([
        makeTrack({ id: 't1', name: 'Lead' }),
        makeTrack({ id: 't2', name: 'Bass' }),
      ]);
      const next = duplicateTrack(song, 't1', 't1-copy', ' COPY');
      expect(next).not.toBeNull();
      expect(next!.tracks).toHaveLength(3);
      expect(next!.tracks[1].id).toBe('t1-copy');
      expect(next!.tracks[1].name).toBe('Lead COPY');
    });

    it('returns null when track not found', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      expect(duplicateTrack(song, 't99', 't2')).toBeNull();
    });
  });

  describe('moveTrack', () => {
    it('moves track up', () => {
      const song = makeSong([
        makeTrack({ id: 't1', name: 'A' }),
        makeTrack({ id: 't2', name: 'B' }),
      ]);
      const next = moveTrack(song, 't2', 'up');
      expect(next).not.toBeNull();
      expect(next!.tracks[0].id).toBe('t2');
      expect(next!.tracks[1].id).toBe('t1');
    });

    it('moves track down', () => {
      const song = makeSong([
        makeTrack({ id: 't1', name: 'A' }),
        makeTrack({ id: 't2', name: 'B' }),
      ]);
      const next = moveTrack(song, 't1', 'down');
      expect(next).not.toBeNull();
      expect(next!.tracks[0].id).toBe('t2');
      expect(next!.tracks[1].id).toBe('t1');
    });

    it('returns null when moving first up', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      expect(moveTrack(song, 't1', 'up')).toBeNull();
    });

    it('returns null when moving last down', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      expect(moveTrack(song, 't1', 'down')).toBeNull();
    });

    it('returns null when track not found', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      expect(moveTrack(song, 't99', 'up')).toBeNull();
    });
  });

  describe('setTrackMuted / setTrackSolo', () => {
    it('sets muted', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A', muted: false })]);
      const next = setTrackMuted(song, 't1', true);
      expect(next).not.toBeNull();
      expect(next!.tracks[0].muted).toBe(true);
    });

    it('sets solo', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A', solo: false })]);
      const next = setTrackSolo(song, 't1', true);
      expect(next).not.toBeNull();
      expect(next!.tracks[0].solo).toBe(true);
    });

    it('returns null when track not found', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      expect(setTrackMuted(song, 't99', true)).toBeNull();
      expect(setTrackSolo(song, 't99', true)).toBeNull();
    });
  });

  describe('setTrackVolume / setTrackPan', () => {
    it('clamps volume to 0–2', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A', volume: 1 })]);
      const next = setTrackVolume(song, 't1', 5);
      expect(next!.tracks[0].volume).toBe(2);
      const next2 = setTrackVolume(song, 't1', -1);
      expect(next2!.tracks[0].volume).toBe(0);
    });

    it('clamps pan to -1–1', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A', pan: 0 })]);
      const next = setTrackPan(song, 't1', 2);
      expect(next!.tracks[0].pan).toBe(1);
    });

    it('returns null when track not found', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      expect(setTrackVolume(song, 't99', 0.5)).toBeNull();
      expect(setTrackPan(song, 't99', 0)).toBeNull();
    });
  });

  describe('updateTrackParam', () => {
    it('updates single param', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      const next = updateTrackParam(song, 't1', 'filterCutoff', 2000);
      expect(next).not.toBeNull();
      expect(next!.tracks[0].params.filterCutoff).toBe(2000);
    });

    it('returns null when track not found', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      expect(updateTrackParam(song, 't99', 'gain', 0.5)).toBeNull();
    });
  });

  describe('setTrackWaveform', () => {
    it('updates waveform', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      const next = setTrackWaveform(song, 't1', 'sawtooth');
      expect(next!.tracks[0].params.waveform).toBe('sawtooth');
    });
  });

  describe('toggleStep', () => {
    it('adds note when step empty (synth)', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A', notes: [] })]);
      const next = toggleStep(song, 't1', 4);
      expect(next).not.toBeNull();
      expect(next!.tracks[0].notes).toHaveLength(1);
      expect(next!.tracks[0].notes[0].startStep).toBe(4);
      expect(next!.tracks[0].notes[0].note).toBe('C4');
    });

    it('removes note when step has note', () => {
      const song = makeSong([
        makeTrack({
          id: 't1',
          name: 'A',
          notes: [{ note: 'C4', startStep: 4, durationSteps: 2 }],
        }),
      ]);
      const next = toggleStep(song, 't1', 4);
      expect(next!.tracks[0].notes).toHaveLength(0);
    });

    it('adds kick for drums', () => {
      const song = makeSong([
        makeTrack({ id: 't1', name: 'K', type: 'drums', notes: [] }),
      ]);
      const next = toggleStep(song, 't1', 0);
      expect(next!.tracks[0].notes[0].note).toBe('kick');
    });

    it('returns null when track not found', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      expect(toggleStep(song, 't99', 0)).toBeNull();
    });
  });

  describe('setBpm', () => {
    it('clamps to 1–999 and rounds', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      expect(setBpm(song, 0).bpm).toBe(1);
      expect(setBpm(song, 1000).bpm).toBe(999);
      expect(setBpm(song, 128.7).bpm).toBe(129);
    });
  });

  describe('setStepsPerPattern / setSwing / setTitle', () => {
    it('setStepsPerPattern updates', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      expect(setStepsPerPattern(song, 32).stepsPerPattern).toBe(32);
    });

    it('setSwing clamps 0–100', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      expect(setSwing(song, -1).swing).toBe(0);
      expect(setSwing(song, 150).swing).toBe(100);
    });

    it('setTitle updates', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      expect(setTitle(song, 'New Title').title).toBe('New Title');
    });
  });

  describe('appendTrack', () => {
    it('same as addTrack', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      const t2 = makeTrack({ id: 't2', name: 'B' });
      expect(appendTrack(song, t2).tracks).toHaveLength(2);
    });
  });

  describe('createEmptySynthTrack', () => {
    it('returns track with default params and given id/name', () => {
      const t = createEmptySynthTrack('x', 'New');
      expect(t.id).toBe('x');
      expect(t.name).toBe('New');
      expect(t.type).toBe('synth');
      expect(t.notes).toEqual([]);
      expect(t.params.waveform).toBe('sine');
    });
  });

  describe('assignDrumPadClip / clearDrumPad / toggleDrumPadMuted', () => {
    it('assigns clip to pad', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      const next = assignDrumPadClip(song, 0, {
        name: 'Kick loop',
        url: 'https://example.com/a.wav',
      });
      expect(next).not.toBeNull();
      expect(next!.drumPads[0].audioUrl).toBe('https://example.com/a.wav');
      expect(next!.drumPads[0].name).toBe('Kick loop');
    });

    it('clears pad', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      const withClip = assignDrumPadClip(song, 2, { name: 'X', url: 'https://example.com/x.wav' });
      const cleared = clearDrumPad(withClip!, 2);
      expect(cleared!.drumPads[2].audioUrl).toBeUndefined();
      expect(cleared!.drumPads[2].name).toBe('Pad 3');
    });

    it('toggles mute', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      const withClip = assignDrumPadClip(song, 0, { name: 'X', url: 'https://example.com/x.wav' });
      const muted = toggleDrumPadMuted(withClip!, 0);
      expect(muted!.drumPads[0].muted).toBe(true);
    });

    it('returns null for invalid index', () => {
      const song = makeSong([makeTrack({ id: 't1', name: 'A' })]);
      expect(assignDrumPadClip(song, 99, { name: 'x', url: 'https://a.com/a.wav' })).toBeNull();
    });
  });

  describe('defaultSynthParams', () => {
    it('returns new object each time', () => {
      const a = defaultSynthParams();
      const b = defaultSynthParams();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });
});
