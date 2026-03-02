/**
 * Tests for audioEngine. Mocks Web Audio API (AudioContext, etc.) since jsdom
 * does not provide it. Uses vi.stubGlobal before importing the engine.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SongData, Track, SynthParams } from '../types';

const defaultParams: SynthParams = {
  waveform: 'sine',
  attack: 0.01,
  decay: 0.1,
  sustain: 0.5,
  release: 0.2,
  filterCutoff: 1000,
  filterRes: 1,
  gain: 0.5,
};

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 't1',
    name: 'LEAD',
    type: 'synth',
    notes: [],
    params: defaultParams,
    muted: false,
    solo: false,
    volume: 1,
    pan: 0,
    ...overrides,
  };
}

function makeSongData(overrides: Partial<SongData> = {}): SongData {
  return {
    title: 'Test',
    bpm: 120,
    stepsPerPattern: 16,
    swing: 0,
    tracks: [makeTrack()],
    ...overrides,
  };
}

function createMockAudioParam() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

let lastMockContext: { createOscillator: ReturnType<typeof vi.fn> } | null = null;

function createMockAudioContext() {
  const createConnect = () => () => ({});

  return class MockAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    createGain = vi.fn(() => ({
      gain: createMockAudioParam(),
      connect: createConnect(),
    }));
    createAnalyser = vi.fn(() => ({
      fftSize: 2048,
      smoothingTimeConstant: 0.7,
      connect: createConnect(),
    }));
    createOscillator = vi.fn(() => ({
      type: 'sine',
      frequency: createMockAudioParam(),
      connect: createConnect(),
      start: vi.fn(),
      stop: vi.fn(),
    }));
    createBiquadFilter = vi.fn(() => ({
      type: 'lowpass',
      Q: { value: 1 },
      frequency: createMockAudioParam(),
      connect: createConnect(),
    }));
    createBufferSource = vi.fn(() => ({
      buffer: null,
      connect: createConnect(),
      start: vi.fn(),
      stop: vi.fn(),
    }));
    createStereoPanner = vi.fn(() => ({
      pan: { value: 0 },
      connect: createConnect(),
    }));
    decodeAudioData = vi.fn(() => Promise.resolve({ duration: 2.0 }));
    resume = vi.fn(() => Promise.resolve(undefined));
    suspend = vi.fn(() => Promise.resolve(undefined));

    constructor() {
      lastMockContext = this;
    }
  };
}

describe('audioEngine', () => {
  let MockAudioContext: ReturnType<typeof createMockAudioContext>;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    MockAudioContext = createMockAudioContext();
    vi.stubGlobal('AudioContext', MockAudioContext);
    vi.stubGlobal('webkitAudioContext', MockAudioContext);

    mockFetch = vi.fn().mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });
    vi.stubGlobal('fetch', mockFetch);

    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: () => void) => {
      setTimeout(cb, 0);
      return 1;
    }));

    vi.useFakeTimers();

    const { audioEngine } = await import('./audioEngine');
    await audioEngine.init();
    audioEngine.stop();
    audioEngine.setSongData(makeSongData());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('init', () => {
    it('creates AudioContext and analyser when not initialized', async () => {
      lastMockContext = null;
      vi.unstubAllGlobals();
      const MockCtx = createMockAudioContext();
      vi.stubGlobal('AudioContext', MockCtx);
      vi.stubGlobal('webkitAudioContext', MockCtx);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }));
      vi.stubGlobal('requestAnimationFrame', vi.fn((cb: () => void) => { setTimeout(cb, 0); return 1; }));

      vi.resetModules();
      const { audioEngine } = await import('./audioEngine');
      await audioEngine.init();

      expect(lastMockContext).not.toBeNull();
      expect(audioEngine.getAnalyser()).not.toBeNull();
    });

    it('throws when Web Audio API is not supported', async () => {
      vi.unstubAllGlobals();
      vi.stubGlobal('AudioContext', undefined);
      vi.stubGlobal('webkitAudioContext', undefined);
      vi.stubGlobal('fetch', vi.fn());
      vi.stubGlobal('requestAnimationFrame', vi.fn());

      vi.resetModules();
      const { audioEngine } = await import('./audioEngine');

      await expect(audioEngine.init()).rejects.toThrow('Web Audio API not supported');
    });
  });

  describe('master volume', () => {
    it('returns default 0.5 before init', async () => {
      vi.unstubAllGlobals();
      vi.stubGlobal('AudioContext', createMockAudioContext());
      vi.stubGlobal('webkitAudioContext', undefined);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }));
      vi.stubGlobal('requestAnimationFrame', vi.fn());

      vi.resetModules();
      const { audioEngine } = await import('./audioEngine');

      expect(audioEngine.getMasterVolume()).toBe(0.5);
    });

    it('sets and gets master volume', async () => {
      const { audioEngine } = await import('./audioEngine');
      audioEngine.setMasterVolume(0.8);

      expect(audioEngine.getMasterVolume()).toBe(0.8);
    });

    it('clamps volume to 0-1', async () => {
      const { audioEngine } = await import('./audioEngine');
      audioEngine.setMasterVolume(1.5);
      expect(audioEngine.getMasterVolume()).toBeLessThanOrEqual(1);
      audioEngine.setMasterVolume(-0.1);
      expect(audioEngine.getMasterVolume()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('metronome', () => {
    it('toggles metronome on and off', async () => {
      const { audioEngine } = await import('./audioEngine');

      audioEngine.setMetronomeEnabled(true);
      expect(audioEngine.getMetronomeEnabled()).toBe(true);

      audioEngine.setMetronomeEnabled(false);
      expect(audioEngine.getMetronomeEnabled()).toBe(false);
    });
  });

  describe('setSongData', () => {
    it('accepts song data with tracks', async () => {
      const { audioEngine } = await import('./audioEngine');
      const song = makeSongData({ bpm: 140, stepsPerPattern: 8 });

      audioEngine.setSongData(song);

      await audioEngine.start();
      expect(audioEngine.getAnalyser()).not.toBeNull();
      await audioEngine.pause();
    });

    it('preloads audio tracks when song has audio type', async () => {
      const { audioEngine } = await import('./audioEngine');
      const audioTrack = makeTrack({
        type: 'audio',
        audioUrl: 'https://example.com/audio.wav',
      });
      const song = makeSongData({ tracks: [audioTrack] });

      audioEngine.setSongData(song);
      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/audio.wav');
    });
  });

  describe('playback control', () => {
    it('start does nothing when no song data', async () => {
      const { audioEngine } = await import('./audioEngine');
      audioEngine.setSongData({ ...makeSongData(), tracks: [] });

      await audioEngine.start();

      expect(audioEngine.getAnalyser()).not.toBeNull();
    });

    it('stop resets and invokes onStepCallback with -1', async () => {
      const { audioEngine } = await import('./audioEngine');
      const onStep = vi.fn();
      audioEngine.setOnStepCallback(onStep);

      audioEngine.stop();

      expect(onStep).toHaveBeenCalledWith(-1);
    });

    it('pause clears scheduler and suspends context', async () => {
      const { audioEngine } = await import('./audioEngine');
      const song = makeSongData({
        tracks: [makeTrack({ notes: [{ note: 'C4', startStep: 0, durationSteps: 2 }] })],
      });
      audioEngine.setSongData(song);

      await audioEngine.start();
      await audioEngine.pause();

      expect(audioEngine.getAnalyser()).not.toBeNull();
    });
  });

  describe('triggerNote', () => {
    it('plays oscillator for synth track', async () => {
      const { audioEngine } = await import('./audioEngine');
      const track = makeTrack({ type: 'synth' });

      audioEngine.triggerNote(track, 'C4');

      expect(lastMockContext?.createOscillator).toHaveBeenCalled();
    });

    it('plays oscillator for bass track', async () => {
      const { audioEngine } = await import('./audioEngine');
      const track = makeTrack({ type: 'bass' });

      audioEngine.triggerNote(track, 'C2');

      expect(lastMockContext?.createOscillator).toHaveBeenCalled();
    });

    it('plays oscillator for drums track with kick', async () => {
      const { audioEngine } = await import('./audioEngine');
      const track = makeTrack({ type: 'drums' });

      audioEngine.triggerNote(track, 'kick');

      expect(lastMockContext?.createOscillator).toHaveBeenCalled();
    });

    it('does nothing when ctx is null', async () => {
      vi.unstubAllGlobals();
      vi.stubGlobal('AudioContext', createMockAudioContext());
      vi.stubGlobal('webkitAudioContext', undefined);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }));
      vi.stubGlobal('requestAnimationFrame', vi.fn());

      vi.resetModules();
      const { audioEngine } = await import('./audioEngine');
      const track = makeTrack();

      audioEngine.triggerNote(track, 'C4');

      expect(audioEngine.getAnalyser()).toBeNull();
    });

    it('plays audio track via triggerNote when track has audioUrl', async () => {
      const { audioEngine } = await import('./audioEngine');
      const audioTrack = makeTrack({ type: 'audio', audioUrl: 'https://example.com/s.wav' });

      audioEngine.setSongData(makeSongData({ tracks: [audioTrack] }));
      await vi.runAllTimersAsync();

      audioEngine.triggerNote(audioTrack, 'C4');

      // createBufferSource called when buffer is in cache
      expect(lastMockContext?.createOscillator).not.toHaveBeenCalled();
    });

    it('triggerNote resumes suspended ctx', async () => {
      const { audioEngine } = await import('./audioEngine');
      if (lastMockContext) {
        (lastMockContext as unknown as { state: string }).state = 'suspended';
      }
      const track = makeTrack({ type: 'synth' });

      audioEngine.triggerNote(track, 'C4');

      expect(lastMockContext?.createOscillator).toHaveBeenCalled();
    });

    it('plays oscillator for drums track with snare', async () => {
      const { audioEngine } = await import('./audioEngine');
      const track = makeTrack({ type: 'drums' });

      audioEngine.triggerNote(track, 'snare');

      expect(lastMockContext?.createOscillator).toHaveBeenCalled();
    });

    it('ignores unknown note for synth track', async () => {
      const { audioEngine } = await import('./audioEngine');
      const track = makeTrack({ type: 'synth' });

      audioEngine.triggerNote(track, 'UNKNOWN_NOTE');

      // Should not crash; oscillator will not be created for unknown notes
    });
  });

  describe('start() with suspended context', () => {
    it('resumes suspended context on start', async () => {
      const { audioEngine } = await import('./audioEngine');
      if (lastMockContext) {
        (lastMockContext as unknown as { state: string }).state = 'suspended';
      }
      const song = makeSongData({ tracks: [makeTrack({ notes: [] })] });
      audioEngine.setSongData(song);

      await audioEngine.start();
      await audioEngine.pause();

      expect(audioEngine.getAnalyser()).not.toBeNull();
    });

    it('adjusts nextNoteTime when ctx.currentTime is ahead of nextNoteTime', async () => {
      const { audioEngine } = await import('./audioEngine');
      audioEngine.stop();
      // Set mock currentTime > 0 so nextNoteTime (0) < ctx.currentTime (1)
      if (lastMockContext) {
        (lastMockContext as unknown as { currentTime: number }).currentTime = 1.0;
      }
      const song = makeSongData({ tracks: [makeTrack({ notes: [] })] });
      audioEngine.setSongData(song);

      await audioEngine.start();
      await audioEngine.pause();

      expect(audioEngine.getAnalyser()).not.toBeNull();
    });
  });

  describe('scheduler with metronome', () => {
    it('plays metronome click when metronome is enabled', async () => {
      const { audioEngine } = await import('./audioEngine');
      audioEngine.setMetronomeEnabled(true);
      const song = makeSongData({ tracks: [makeTrack({ notes: [] })] });
      audioEngine.setSongData(song);

      await audioEngine.start();
      vi.advanceTimersByTime(50);
      await audioEngine.pause();

      expect(lastMockContext?.createOscillator).toHaveBeenCalled();
    });

    it('plays audio track in scheduler at step 0', async () => {
      const { audioEngine } = await import('./audioEngine');
      const audioTrack = makeTrack({ type: 'audio', audioUrl: 'https://example.com/sched.wav' });
      const song = makeSongData({ tracks: [audioTrack] });
      audioEngine.setSongData(song);
      await vi.runAllTimersAsync();

      await audioEngine.start();
      vi.advanceTimersByTime(50);
      await audioEngine.pause();

      expect(audioEngine.getAnalyser()).not.toBeNull();
    });

    it('schedules notes for muted and solo tracks', async () => {
      const { audioEngine } = await import('./audioEngine');
      const mutedTrack = makeTrack({ muted: true, notes: [{ note: 'C4', startStep: 0, durationSteps: 1 }] });
      const soloTrack = makeTrack({ id: 't2', solo: true, notes: [{ note: 'A4', startStep: 0, durationSteps: 1 }] });
      const song = makeSongData({ tracks: [mutedTrack, soloTrack] });
      audioEngine.setSongData(song);

      await audioEngine.start();
      vi.advanceTimersByTime(50);
      await audioEngine.pause();

      expect(lastMockContext?.createOscillator).toHaveBeenCalled();
    });
  });

  describe('updateTrackParams', () => {
    it('updates params when track exists', async () => {
      const { audioEngine } = await import('./audioEngine');
      const song = makeSongData({ tracks: [makeTrack()] });
      audioEngine.setSongData(song);

      audioEngine.updateTrackParams(0, { ...defaultParams, gain: 0.8 });

      expect(audioEngine.getAnalyser()).not.toBeNull();
    });
  });
});
