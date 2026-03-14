import { SongData, Track, NoteEvent, SynthParams } from '../types';

/**
 * Audio engine: real Web Audio API only. No mock or simulation mode in runtime.
 * Production (including Vercel): VITE_AUDIO_MOCK and VITE_SIMULATE_AUDIO must not be set.
 */
const isProd = typeof import.meta !== 'undefined' && import.meta.env?.PROD === true;
const mockEnvSet =
  typeof import.meta !== 'undefined' &&
  (import.meta.env?.VITE_AUDIO_MOCK === 'true' || import.meta.env?.VITE_SIMULATE_AUDIO === 'true');
if (isProd && mockEnvSet) {
  throw new Error(
    'Mock/simulation audio is disabled in production. Do not set VITE_AUDIO_MOCK or VITE_SIMULATE_AUDIO in Vercel or any production environment. See DEPLOY.md.'
  );
}

// Frequency map for notes
const NOTE_FREQUENCIES: Record<string, number> = {
  'C2': 65.41, 'C#2': 69.30, 'D2': 73.42, 'D#2': 77.78, 'E2': 82.41, 'F2': 87.31, 'F#2': 92.50, 'G2': 98.00, 'G#2': 103.83, 'A2': 110.00, 'A#2': 116.54, 'B2': 123.47,
  'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81, 'F3': 174.61, 'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
  'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
  'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99, 'G#5': 830.61, 'A5': 880.00, 'A#5': 932.33, 'B5': 987.77,
};

/** Cache decoded audio by URL for playback. */
const audioBufferCache = new Map<string, AudioBuffer>();

class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private isPlaying: boolean = false;
  private currentStep: number = 0;
  private nextNoteTime: number = 0;
  private timerID: number | undefined;
  private lookahead: number = 15.0;
  private scheduleAheadTime: number = 0.1;
  private songData: SongData | null = null;
  private onStepCallback: ((step: number) => void) | null = null;
  private metronomeEnabled: boolean = false;

  constructor() {}

  public async init(): Promise<void> {
    if (!this.ctx) {
      // Use interactive latency hint for lowest possible latency
      const Ctx = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctx) throw new Error("Web Audio API not supported");
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.5;
      
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.7;
      
      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    
    // If song data was set before init, preload it now
    if (this.songData) {
      this.preloadAudioTracks(this.songData);
    }
  }

  public setSongData(data: SongData): void {
    this.songData = data;
    this.preloadAudioTracks(data);
  }

  private async preloadAudioTracks(data: SongData): Promise<void> {
    if (!this.ctx) return;
    for (const track of data.tracks) {
      if (track.type === 'audio' && track.audioUrl && !audioBufferCache.has(track.audioUrl)) {
        try {
          const res = await fetch(track.audioUrl);
          if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
          const arrayBuffer = await res.arrayBuffer();
          const buffer = await this.ctx.decodeAudioData(arrayBuffer);
          audioBufferCache.set(track.audioUrl, buffer);
          console.log(`[AudioEngine] Preloaded audio track: ${track.audioUrl}`);
        } catch (err) {
          console.error(`[AudioEngine] Failed to preload audio track: ${track.audioUrl}`, err);
          // Decode or fetch failed; playback will no-op
        }
      }
    }
  }

  public setOnStepCallback(cb: (step: number) => void): void {
    this.onStepCallback = cb;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public getMasterVolume(): number {
    return this.masterGain?.gain.value ?? 0.5;
  }

  public setMasterVolume(value: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  public setMetronomeEnabled(enabled: boolean): void {
    this.metronomeEnabled = enabled;
  }

  public getMetronomeEnabled(): boolean {
    return this.metronomeEnabled;
  }

  public async start(): Promise<void> {
    if (!this.ctx || !this.songData) return;
    
    // Ensure Context is running
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (this.isPlaying) return;

    this.isPlaying = true;
    
    // If starting from stop (not pause), sync time
    // If pausing, currentTime stops, so nextNoteTime should be valid
    // We add a tiny buffer to avoid scheduling in the past
    if (this.nextNoteTime < this.ctx.currentTime) {
        this.nextNoteTime = this.ctx.currentTime + 0.05;
    }
    
    this.scheduler();
  }

  public async pause(): Promise<void> {
    this.isPlaying = false;
    if (this.timerID) window.clearTimeout(this.timerID);
    if (this.ctx) {
      await this.ctx.suspend();
    }
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.timerID) window.clearTimeout(this.timerID);
    
    // Reset sequence
    this.currentStep = 0;
    this.nextNoteTime = 0;
    
    if (this.onStepCallback) this.onStepCallback(-1);
  }

  public triggerNote(track: Track, noteName: string): void {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const time = this.ctx.currentTime + 0.01;
    if (track.type === 'audio' && track.audioUrl) {
      this.playAudioTrack(track, time);
      return;
    }
    const noteEvent: NoteEvent = { note: noteName, startStep: 0, durationSteps: 4 };
    this.playOscillator(track, noteEvent, time);
  }

  private getStepsPerPattern(): number {
    return this.songData?.stepsPerPattern ?? 16;
  }

  private nextNote(): void {
    if (!this.songData) return;
    const steps = this.getStepsPerPattern();
    const secondsPerBeat = 60.0 / this.songData.bpm;
    const secondsPerStep = secondsPerBeat / 4;
    this.nextNoteTime += secondsPerStep;
    this.currentStep = (this.currentStep + 1) % steps;
  }

  private scheduler(): void {
    if (!this.ctx) return;
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      const secondsPerBeat = 60.0 / (this.songData?.bpm ?? 120);
      const secondsPerStep = secondsPerBeat / 4;
      const swing = (this.songData?.swing ?? 0) / 100;
      const isOddStep = this.currentStep % 2 === 1;
      const scheduleTime = this.nextNoteTime + (isOddStep ? secondsPerStep * 0.5 * swing : 0);
      this.scheduleNote(this.currentStep, scheduleTime);
      this.nextNote();
    }
    if (this.isPlaying) {
      this.timerID = window.setTimeout(() => this.scheduler(), this.lookahead);
    }
  }

  private scheduleNote(stepNumber: number, time: number): void {
    if (!this.songData || !this.ctx || !this.masterGain) return;

    if (this.onStepCallback) {
      requestAnimationFrame(() => this.onStepCallback!(stepNumber));
    }

    const anySolo = this.songData.tracks.some((t) => t.solo);
    const shouldPlay = (track: Track): boolean =>
      anySolo ? track.solo : !track.muted;

    if (this.metronomeEnabled) {
      this.playMetronomeClick(stepNumber, time);
    }

    this.songData.tracks.forEach((track) => {
      if (!shouldPlay(track)) return;
      if (track.type === 'audio' && track.audioUrl) {
        if (stepNumber === 0) this.playAudioTrack(track, time);
        return;
      }
      const notes = track.notes.filter((n) => n.startStep === stepNumber);
      notes.forEach((noteEvent) => {
        this.playOscillator(track, noteEvent, time);
      });
    });
  }

  private playAudioTrack(track: Track, time: number): void {
    if (!this.ctx || !this.masterGain || track.type !== 'audio' || !track.audioUrl) return;
    const buffer = audioBufferCache.get(track.audioUrl);
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const trackGain = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner();
    trackGain.gain.value = track.volume ?? 1;
    panner.pan.value = track.pan ?? 0;
    source.connect(trackGain);
    trackGain.connect(panner);
    panner.connect(this.masterGain);
    
    // Support trimmed audio playback
    const startOffset = track.audioTrimStart ?? 0;
    const duration = track.audioTrimEnd !== undefined 
      ? track.audioTrimEnd - startOffset 
      : buffer.duration - startOffset;
    
    source.start(time, startOffset, duration);
  }

  private playMetronomeClick(stepNumber: number, time: number): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const freq = stepNumber === 0 ? 1000 : 800;
    const dur = stepNumber === 0 ? 0.02 : 0.01;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + dur);
  }

  private playOscillator(track: Track, note: NoteEvent, time: number): void {
    if (!this.ctx || !this.masterGain) return;
    const params = track.params;
    const type = track.type;

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const trackGain = this.ctx.createGain();
    const panner = this.ctx.createStereoPanner();
    trackGain.gain.value = track.volume ?? 1;
    panner.pan.value = track.pan ?? 0;

    let frequency = NOTE_FREQUENCIES[note.note];
    if (type === 'drums' && note.note === 'kick') frequency = 50;
    if (type === 'drums' && note.note === 'snare') frequency = 200;
    if (frequency === undefined && type !== 'drums') return;

    osc.type = params.waveform;
    osc.frequency.setValueAtTime(frequency, time);

    filter.type = 'lowpass';
    filter.Q.value = params.filterRes;
    filter.frequency.setValueAtTime(params.filterCutoff, time);

    const duration = (60 / (this.songData?.bpm ?? 120)) / 4 * note.durationSteps;

    if (type === 'drums') {
      if (note.note === 'kick') {
        osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
        gainNode.gain.setValueAtTime(1.0, time);
        gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
      } else if (note.note === 'snare') {
        osc.type = 'triangle';
        gainNode.gain.setValueAtTime(0.8, time);
        gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
      }
    } else {
      const attackEnd = time + params.attack;
      const decayEnd = attackEnd + params.decay;
      const sustainVal = params.sustain * params.gain;
      gainNode.gain.setValueAtTime(0, time);
      gainNode.gain.linearRampToValueAtTime(params.gain, attackEnd);
      gainNode.gain.linearRampToValueAtTime(sustainVal, decayEnd);
      const releaseStart = time + duration;
      gainNode.gain.setValueAtTime(sustainVal, releaseStart);
      gainNode.gain.exponentialRampToValueAtTime(0.001, releaseStart + params.release);
    }

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(trackGain);
    trackGain.connect(panner);
    panner.connect(this.masterGain);

    osc.start(time);
    if (type === 'drums') {
      osc.stop(time + 0.5);
    } else {
      osc.stop(time + duration + params.release + 0.1);
    }
  }

  public updateTrackParams(trackIndex: number, newParams: SynthParams): void {
    if (this.songData && this.songData.tracks[trackIndex]) {
        this.songData.tracks[trackIndex].params = newParams;
    }
  }
}

export const audioEngine = new AudioEngine();