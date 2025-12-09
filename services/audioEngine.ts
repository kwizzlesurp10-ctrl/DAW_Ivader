import { SongData, Track, NoteEvent, SynthParams } from '../types';

// Frequency map for notes
const NOTE_FREQUENCIES: Record<string, number> = {
  'C2': 65.41, 'C#2': 69.30, 'D2': 73.42, 'D#2': 77.78, 'E2': 82.41, 'F2': 87.31, 'F#2': 92.50, 'G2': 98.00, 'G#2': 103.83, 'A2': 110.00, 'A#2': 116.54, 'B2': 123.47,
  'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81, 'F3': 174.61, 'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
  'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
  'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46, 'F#5': 739.99, 'G5': 783.99, 'G#5': 830.61, 'A5': 880.00, 'A#5': 932.33, 'B5': 987.77,
};

class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private isPlaying: boolean = false;
  private currentStep: number = 0;
  private nextNoteTime: number = 0;
  private timerID: number | undefined;
  private lookahead: number = 15.0; // Reduced for lower latency
  private scheduleAheadTime: number = 0.1; // 100ms
  private songData: SongData | null = null;
  private onStepCallback: ((step: number) => void) | null = null;

  constructor() { }

  public async init() {
    if (!this.ctx) {
      // Use interactive latency hint for lowest possible latency
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });
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
  }

  public setSongData(data: SongData) {
    this.songData = data;
  }

  public setOnStepCallback(cb: (step: number) => void) {
    this.onStepCallback = cb;
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public async start() {
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

  public async pause() {
    this.isPlaying = false;
    if (this.timerID) window.clearTimeout(this.timerID);
    if (this.ctx) {
      await this.ctx.suspend();
    }
  }

  public stop() {
    this.isPlaying = false;
    if (this.timerID) window.clearTimeout(this.timerID);

    // Reset sequence
    this.currentStep = 0;
    this.nextNoteTime = 0;

    if (this.onStepCallback) this.onStepCallback(-1);
  }

  public triggerNote(track: Track, noteName: string) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const time = this.ctx.currentTime + 0.01; // Play immediately

    const noteEvent: NoteEvent = {
      note: noteName,
      startStep: 0,
      durationSteps: 4 // Reasonable default duration for preview
    };

    this.playOscillator(track.params, noteEvent, time, track.type);
  }

  private nextNote() {
    if (!this.songData) return;
    const secondsPerBeat = 60.0 / this.songData.bpm;
    const secondsPer16th = secondsPerBeat / 4;
    this.nextNoteTime += secondsPer16th;
    this.currentStep = (this.currentStep + 1) % 16;
  }

  private scheduler() {
    if (!this.ctx) return;
    // Safety check: if stopped, do not schedule
    if (!this.isPlaying) return;

    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.currentStep, this.nextNoteTime);
      this.nextNote();
    }
    if (this.isPlaying) {
      this.timerID = window.setTimeout(() => this.scheduler(), this.lookahead);
    }
  }

  private scheduleNote(stepNumber: number, time: number) {
    if (!this.songData || !this.ctx || !this.masterGain) return;

    // UI Callback
    if (this.onStepCallback) {
      requestAnimationFrame(() => this.onStepCallback!(stepNumber));
    }

    this.songData.tracks.forEach(track => {
      if (track.muted) return;

      const notes = track.notes.filter(n => n.startStep === stepNumber);
      notes.forEach(noteEvent => {
        this.playOscillator(track.params, noteEvent, time, track.type);
      });
    });
  }

  private playOscillator(params: SynthParams, note: NoteEvent, time: number, type: 'synth' | 'bass' | 'drums') {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    // Determine Frequency
    let frequency = NOTE_FREQUENCIES[note.note];
    if (type === 'drums' && note.note === 'kick') frequency = 50;
    if (type === 'drums' && note.note === 'snare') frequency = 200;

    if (!frequency && type !== 'drums') return;

    osc.type = params.waveform;
    osc.frequency.setValueAtTime(frequency, time);

    // Filter Envelope
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(params.filterRes, time); // Schedule Q
    filter.frequency.setValueAtTime(params.filterCutoff, time);

    // Amp Envelope
    const duration = (60 / (this.songData?.bpm || 120)) / 4 * note.durationSteps;

    // Drum overrides for punch
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
      // ADSR for Melodic
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

    // Connect graph
    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    // CRITICAL FIX: Always start BEFORE scheduling stop to prevent "cannot call stop without start"
    osc.start(time);

    // Schedule stop
    if (type === 'drums') {
      osc.stop(time + 0.5);
    } else {
      const releaseStart = time + duration;
      osc.stop(releaseStart + params.release + 0.1);
    }
  }

  public updateTrackParams(trackIndex: number, newParams: SynthParams) {
    if (this.songData && this.songData.tracks[trackIndex]) {
      this.songData.tracks[trackIndex].params = newParams;
    }
  }
}

export const audioEngine = new AudioEngine();