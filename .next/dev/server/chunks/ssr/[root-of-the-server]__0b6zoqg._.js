module.exports = [
"[project]/Documents/DAW_Ivader/services/audioEngine.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "audioEngine",
    ()=>audioEngine
]);
/**
 * Audio engine: real Web Audio API only. No mock or simulation mode in runtime.
 * Production (including Vercel): NEXT_PUBLIC_AUDIO_MOCK and NEXT_PUBLIC_SIMULATE_AUDIO must not be set.
 */ const isProd = ("TURBOPACK compile-time value", "development") === 'production';
const mockEnvSet = process.env.NEXT_PUBLIC_AUDIO_MOCK === 'true' || process.env.NEXT_PUBLIC_SIMULATE_AUDIO === 'true';
if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
;
// Frequency map for notes
const NOTE_FREQUENCIES = {
    'C2': 65.41,
    'C#2': 69.30,
    'D2': 73.42,
    'D#2': 77.78,
    'E2': 82.41,
    'F2': 87.31,
    'F#2': 92.50,
    'G2': 98.00,
    'G#2': 103.83,
    'A2': 110.00,
    'A#2': 116.54,
    'B2': 123.47,
    'C3': 130.81,
    'C#3': 138.59,
    'D3': 146.83,
    'D#3': 155.56,
    'E3': 164.81,
    'F3': 174.61,
    'F#3': 185.00,
    'G3': 196.00,
    'G#3': 207.65,
    'A3': 220.00,
    'A#3': 233.08,
    'B3': 246.94,
    'C4': 261.63,
    'C#4': 277.18,
    'D4': 293.66,
    'D#4': 311.13,
    'E4': 329.63,
    'F4': 349.23,
    'F#4': 369.99,
    'G4': 392.00,
    'G#4': 415.30,
    'A4': 440.00,
    'A#4': 466.16,
    'B4': 493.88,
    'C5': 523.25,
    'C#5': 554.37,
    'D5': 587.33,
    'D#5': 622.25,
    'E5': 659.25,
    'F5': 698.46,
    'F#5': 739.99,
    'G5': 783.99,
    'G#5': 830.61,
    'A5': 880.00,
    'A#5': 932.33,
    'B5': 987.77
};
/** Cache decoded audio by URL for playback. */ const audioBufferCache = new Map();
class AudioEngine {
    ctx = null;
    analyser = null;
    masterGain = null;
    isPlaying = false;
    isStopped = true;
    currentStep = 0;
    cancelStep = 0;
    nextNoteTime = 0;
    timerID;
    lookahead = 15.0;
    scheduleAheadTime = 0.1;
    songData = null;
    onStepCallback = null;
    metronomeEnabled = false;
    constructor(){}
    async init() {
        if (!this.ctx) {
            // Use interactive latency hint for lowest possible latency
            const Ctx = window.AudioContext ?? window.webkitAudioContext;
            if (!Ctx) throw new Error("Web Audio API not supported");
            this.ctx = new Ctx({
                latencyHint: 'interactive'
            });
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
    setSongData(data) {
        this.songData = data;
        this.preloadAudioTracks(data);
    }
    async preloadAudioTracks(data) {
        if (!this.ctx) return;
        for (const track of data.tracks){
            if (track.type === 'audio' && track.audioUrl && !audioBufferCache.has(track.audioUrl)) {
                await this.loadAndCacheAudio(track.audioUrl);
            } else if (track.type === 'sampler' && track.samples) {
                for (const sample of track.samples){
                    if (!audioBufferCache.has(sample.url)) {
                        await this.loadAndCacheAudio(sample.url);
                    }
                }
            }
        }
    }
    async loadAndCacheAudio(url) {
        if (!this.ctx) return;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
            const arrayBuffer = await res.arrayBuffer();
            const buffer = await this.ctx.decodeAudioData(arrayBuffer);
            audioBufferCache.set(url, buffer);
            console.log(`[AudioEngine] Preloaded audio: ${url}`);
        } catch (err) {
            console.error(`[AudioEngine] Failed to preload audio: ${url}`, err);
        }
    }
    noteToMidi(note) {
        const names = [
            'C',
            'C#',
            'D',
            'D#',
            'E',
            'F',
            'F#',
            'G',
            'G#',
            'A',
            'A#',
            'B'
        ];
        const match = note.match(/^([A-G]#?)(\d+)$/);
        if (!match) {
            // Handle non-note names (like 'kick', 'snare')
            if (note === 'kick') return 36;
            if (note === 'snare') return 38;
            return 60;
        }
        const name = match[1];
        const octave = parseInt(match[2], 10);
        return (octave + 1) * 12 + names.indexOf(name);
    }
    getPlaybackRate(targetNote, rootNote) {
        const targetMidi = this.noteToMidi(targetNote);
        const rootMidi = this.noteToMidi(rootNote);
        return Math.pow(2, (targetMidi - rootMidi) / 12);
    }
    setOnStepCallback(cb) {
        this.onStepCallback = cb;
    }
    getAnalyser() {
        return this.analyser;
    }
    getMasterVolume() {
        return this.masterGain?.gain.value ?? 0.5;
    }
    setMasterVolume(value) {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, value));
        }
    }
    setMetronomeEnabled(enabled) {
        this.metronomeEnabled = enabled;
    }
    getMetronomeEnabled() {
        return this.metronomeEnabled;
    }
    async start() {
        if (!this.ctx || !this.songData) return;
        // Ensure Context is running
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
        if (this.isPlaying) return;
        // When resuming from a stopped state, start from the cancel mark
        if (this.isStopped) {
            this.currentStep = this.cancelStep;
        }
        this.isStopped = false;
        this.isPlaying = true;
        // Sync time to avoid scheduling in the past
        if (this.nextNoteTime < this.ctx.currentTime) {
            this.nextNoteTime = this.ctx.currentTime + 0.05;
        }
        this.scheduler();
    }
    async pause() {
        this.isPlaying = false;
        if (this.timerID) window.clearTimeout(this.timerID);
        if (this.ctx) {
            await this.ctx.suspend();
        }
    }
    stop() {
        if (this.isStopped) {
            // Double-stop: already stopped, reset to beginning
            this.resetToStart();
            return;
        }
        // First stop: save the current position as the cancel mark
        this.cancelStep = this.currentStep;
        this.isPlaying = false;
        this.isStopped = true;
        if (this.timerID) window.clearTimeout(this.timerID);
        this.nextNoteTime = 0;
        // Keep the playhead visible at the cancel mark
        if (this.onStepCallback) this.onStepCallback(this.cancelStep);
    }
    /** Returns the step position saved by the last Stop. */ getCancelStep() {
        return this.cancelStep;
    }
    /** Clears the cancel mark and resets the playhead to the beginning. */ resetToStart() {
        this.cancelStep = 0;
        this.currentStep = 0;
        this.nextNoteTime = 0;
        if (this.onStepCallback) this.onStepCallback(-1);
    }
    triggerNote(track, noteName) {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const time = this.ctx.currentTime + 0.01;
        if (track.type === 'audio' && track.audioUrl) {
            this.playAudioTrack(track, time);
            return;
        }
        const noteEvent = {
            note: noteName,
            startStep: 0,
            durationSteps: 4
        };
        this.playOscillator(track, noteEvent, time);
    }
    getStepsPerPattern() {
        return this.songData?.stepsPerPattern ?? 16;
    }
    nextNote() {
        if (!this.songData) return;
        const steps = this.getStepsPerPattern();
        const secondsPerBeat = 60.0 / this.songData.bpm;
        const secondsPerStep = secondsPerBeat / 4;
        this.nextNoteTime += secondsPerStep;
        this.currentStep = (this.currentStep + 1) % steps;
    }
    scheduler() {
        if (!this.ctx) return;
        while(this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime){
            const secondsPerBeat = 60.0 / (this.songData?.bpm ?? 120);
            const secondsPerStep = secondsPerBeat / 4;
            const swing = (this.songData?.swing ?? 0) / 100;
            const isOddStep = this.currentStep % 2 === 1;
            const scheduleTime = this.nextNoteTime + (isOddStep ? secondsPerStep * 0.5 * swing : 0);
            this.scheduleNote(this.currentStep, scheduleTime);
            this.nextNote();
        }
        if (this.isPlaying) {
            this.timerID = window.setTimeout(()=>this.scheduler(), this.lookahead);
        }
    }
    scheduleNote(stepNumber, time) {
        if (!this.songData || !this.ctx || !this.masterGain) return;
        if (this.onStepCallback) {
            requestAnimationFrame(()=>this.onStepCallback(stepNumber));
        }
        const anySolo = this.songData.tracks.some((t)=>t.solo);
        const shouldPlay = (track)=>anySolo ? track.solo : !track.muted;
        if (this.metronomeEnabled) {
            this.playMetronomeClick(stepNumber, time);
        }
        this.songData.tracks.forEach((track)=>{
            if (!shouldPlay(track)) return;
            if (track.type === 'audio' && track.audioUrl) {
                if (stepNumber === 0) this.playAudioTrack(track, time);
                return;
            }
            const notes = track.notes.filter((n)=>n.startStep === stepNumber);
            notes.forEach((noteEvent)=>{
                if (track.type === 'sampler') {
                    this.playSamplerTrack(track, noteEvent, time);
                } else {
                    this.playOscillator(track, noteEvent, time);
                }
            });
        });
    }
    playSamplerTrack(track, note, time) {
        if (!this.ctx || !this.masterGain || !track.samples) return;
        // Find matching sample based on key/velocity zones
        const midi = this.noteToMidi(note.note);
        const velocity = note.velocity ?? 1;
        const sample = track.samples.find((s)=>{
            const minMidi = s.minNote ? this.noteToMidi(s.minNote) : 0;
            const maxMidi = s.maxNote ? this.noteToMidi(s.maxNote) : 127;
            const minVel = s.minVelocity ?? 0;
            const maxVel = s.maxVelocity ?? 1;
            return midi >= minMidi && midi <= maxMidi && velocity >= minVel && velocity <= maxVel;
        });
        if (!sample) return;
        const buffer = audioBufferCache.get(sample.url);
        if (!buffer) return;
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        // Looping
        if (sample.loop) {
            source.loop = true;
            source.loopStart = sample.loopStart ?? 0;
            source.loopEnd = sample.loopEnd ?? buffer.duration;
        }
        // Pitch shifting
        if (sample.rootNote) {
            source.playbackRate.value = this.getPlaybackRate(note.note, sample.rootNote);
        }
        // ADSR & Filter
        const params = track.params;
        const gainNode = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        const trackGain = this.ctx.createGain();
        const panner = this.ctx.createStereoPanner();
        trackGain.gain.value = (track.volume ?? 1) * velocity;
        panner.pan.value = track.pan ?? 0;
        filter.type = 'lowpass';
        filter.Q.value = params.filterRes;
        filter.frequency.setValueAtTime(params.filterCutoff, time);
        const duration = 60 / (this.songData?.bpm ?? 120) / 4 * note.durationSteps;
        const attackEnd = time + params.attack;
        const decayEnd = attackEnd + params.decay;
        const sustainVal = params.sustain * params.gain;
        gainNode.gain.setValueAtTime(0, time);
        gainNode.gain.linearRampToValueAtTime(params.gain, attackEnd);
        gainNode.gain.linearRampToValueAtTime(sustainVal, decayEnd);
        const releaseStart = time + duration;
        gainNode.gain.setValueAtTime(sustainVal, releaseStart);
        gainNode.gain.exponentialRampToValueAtTime(0.001, releaseStart + params.release);
        source.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(trackGain);
        trackGain.connect(panner);
        panner.connect(this.masterGain);
        source.start(time, sample.trimStart ?? 0);
        source.stop(releaseStart + params.release + 0.1);
    }
    playAudioTrack(track, time) {
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
        const duration = track.audioTrimEnd !== undefined ? track.audioTrimEnd - startOffset : buffer.duration - startOffset;
        source.start(time, startOffset, duration);
    }
    playMetronomeClick(stepNumber, time) {
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
    playOscillator(track, note, time) {
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
        const duration = 60 / (this.songData?.bpm ?? 120) / 4 * note.durationSteps;
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
    updateTrackParams(trackIndex, newParams) {
        if (this.songData && this.songData.tracks[trackIndex]) {
            this.songData.tracks[trackIndex].params = newParams;
        }
    }
}
const audioEngine = new AudioEngine();
}),
"[project]/Documents/DAW_Ivader/lib/result.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Result<T, E> — explicit success/failure without exceptions.
 * Use for operations that can fail (e.g. API, parsing).
 */ __turbopack_context__.s([
    "err",
    ()=>err,
    "isErr",
    ()=>isErr,
    "isOk",
    ()=>isOk,
    "mapError",
    ()=>mapError,
    "mapResult",
    ()=>mapResult,
    "ok",
    ()=>ok,
    "unwrapOr",
    ()=>unwrapOr,
    "unwrapOrElse",
    ()=>unwrapOrElse
]);
function ok(value) {
    return {
        ok: true,
        value
    };
}
function err(error) {
    return {
        ok: false,
        error
    };
}
function isOk(r) {
    return r.ok === true;
}
function isErr(r) {
    return r.ok === false;
}
function unwrapOr(r, defaultValue) {
    return r.ok ? r.value : defaultValue;
}
function unwrapOrElse(r, fn) {
    return r.ok ? r.value : fn(r.error);
}
function mapResult(r, fn) {
    return r.ok ? ok(fn(r.value)) : r;
}
function mapError(r, fn) {
    return r.ok ? r : err(fn(r.error));
}
}),
"[project]/Documents/DAW_Ivader/schemas/generateAudioSchema.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AUDIO_GENERATION_BACKENDS",
    ()=>AUDIO_GENERATION_BACKENDS,
    "AUDIO_GENERATION_BACKEND_DEFAULT",
    ()=>AUDIO_GENERATION_BACKEND_DEFAULT,
    "GENERATE_AUDIO_DURATION_DEFAULT",
    ()=>GENERATE_AUDIO_DURATION_DEFAULT,
    "GENERATE_AUDIO_DURATION_MAX",
    ()=>GENERATE_AUDIO_DURATION_MAX,
    "GENERATE_AUDIO_DURATION_MIN",
    ()=>GENERATE_AUDIO_DURATION_MIN,
    "GENERATE_AUDIO_PROMPT_MAX_LENGTH",
    ()=>GENERATE_AUDIO_PROMPT_MAX_LENGTH,
    "STABLE_AUDIO_MODEL_VERSIONS",
    ()=>STABLE_AUDIO_MODEL_VERSIONS,
    "STABLE_AUDIO_MODEL_VERSION_DEFAULT",
    ()=>STABLE_AUDIO_MODEL_VERSION_DEFAULT,
    "generateAudioRequestSchema",
    ()=>generateAudioRequestSchema,
    "generateAudioResponseSchema",
    ()=>generateAudioResponseSchema,
    "parseGenerateAudioRequest",
    ()=>parseGenerateAudioRequest
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/zod@4.3.6/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z>");
;
const GENERATE_AUDIO_DURATION_MIN = 1;
const GENERATE_AUDIO_DURATION_MAX = 45;
const GENERATE_AUDIO_DURATION_DEFAULT = 15;
const GENERATE_AUDIO_PROMPT_MAX_LENGTH = 2000;
const STABLE_AUDIO_MODEL_VERSIONS = [
    'stable-audio-2.5',
    'stable-audio-open-1.0'
];
const STABLE_AUDIO_MODEL_VERSION_DEFAULT = 'stable-audio-2.5';
const AUDIO_GENERATION_BACKENDS = [
    'replicate',
    'comfyui'
];
const AUDIO_GENERATION_BACKEND_DEFAULT = 'replicate';
const generateAudioRequestSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    prompt: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string({
        error: 'Missing or empty prompt'
    }).transform((s)=>s.trim()).pipe(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1, 'Missing or empty prompt').max(GENERATE_AUDIO_PROMPT_MAX_LENGTH, 'Prompt too long')),
    negative_prompt: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().optional().transform((s)=>(s ?? '').trim()),
    duration: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().optional().default(GENERATE_AUDIO_DURATION_DEFAULT).transform((v)=>Math.max(GENERATE_AUDIO_DURATION_MIN, Math.min(GENERATE_AUDIO_DURATION_MAX, Math.round(v)))),
    steps: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().optional().default(8).transform((v)=>Math.max(4, Math.min(8, Math.round(v)))),
    cfg_scale: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().optional().default(7).transform((v)=>Math.max(1, Math.min(20, v))),
    model_version: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum(STABLE_AUDIO_MODEL_VERSIONS).optional().default(STABLE_AUDIO_MODEL_VERSION_DEFAULT),
    backend: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum(AUDIO_GENERATION_BACKENDS).optional().default(AUDIO_GENERATION_BACKEND_DEFAULT)
});
function parseGenerateAudioRequest(raw) {
    const parsed = generateAudioRequestSchema.safeParse(raw);
    if (parsed.success) {
        return {
            ok: true,
            data: parsed.data
        };
    }
    const e = parsed.error;
    const msg = (Array.isArray(e.issues) ? e.issues.map((i)=>i.message).filter(Boolean).join('; ') : null) || e.message || 'Invalid request';
    return {
        ok: false,
        error: msg
    };
}
const generateAudioResponseSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].union([
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
        url: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().url()
    }),
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
        error: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string()
    })
]);
}),
"[project]/Documents/DAW_Ivader/services/textToAudioService.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "generateAudioFromText",
    ()=>generateAudioFromText
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/lib/result.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$schemas$2f$generateAudioSchema$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/schemas/generateAudioSchema.ts [app-ssr] (ecmascript)");
;
;
/** Timeout (ms) — matches API maxDuration. */ const FETCH_TIMEOUT_MS = 90_000;
async function generateAudioFromText(prompt, durationSeconds = __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$schemas$2f$generateAudioSchema$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["GENERATE_AUDIO_DURATION_DEFAULT"], modelVersion = __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$schemas$2f$generateAudioSchema$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["STABLE_AUDIO_MODEL_VERSION_DEFAULT"], options = {}) {
    const parseResult = __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$schemas$2f$generateAudioSchema$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["generateAudioRequestSchema"].safeParse({
        prompt: prompt.trim(),
        duration: durationSeconds,
        model_version: modelVersion,
        backend: options.backend ?? __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$schemas$2f$generateAudioSchema$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AUDIO_GENERATION_BACKEND_DEFAULT"],
        ...options
    });
    if (!parseResult.success) {
        const e = parseResult.error;
        const msg = (Array.isArray(e.issues) ? e.issues.map((i)=>i.message).join('; ') : null) || e.message || 'Invalid prompt';
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["err"])(new Error(msg));
    }
    const { prompt: trimmed, duration, model_version, backend, negative_prompt, steps, cfg_scale } = parseResult.data;
    const controller = new AbortController();
    const timeoutId = setTimeout(()=>controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const body = {
            prompt: trimmed,
            duration,
            model_version,
            backend,
            negative_prompt,
            steps,
            cfg_scale
        };
        const res = await fetch('/api/generate-audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const text = await res.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch  {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["err"])(new Error(res.ok ? 'Invalid response from server' : `Generate failed: ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`));
        }
        if (!res.ok) {
            if (res.status === 404) {
                return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["err"])(new Error('Generate API not found. Run the app with "pnpm dev" so /api/generate-audio is available.'));
            }
            const parsed = __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$schemas$2f$generateAudioSchema$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["generateAudioResponseSchema"].safeParse(data);
            const msg = parsed.success && 'error' in parsed.data ? parsed.data.error : `HTTP ${res.status}`;
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["err"])(new Error(msg));
        }
        const parsed = __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$schemas$2f$generateAudioSchema$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["generateAudioResponseSchema"].safeParse(data);
        const url = parsed.success && 'url' in parsed.data && typeof parsed.data.url === 'string' ? parsed.data.url : null;
        if (!url) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["err"])(new Error('Invalid response: no audio URL'));
        }
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ok"])({
            url
        });
    } catch (e) {
        clearTimeout(timeoutId);
        const message = e instanceof Error ? e.message : String(e);
        if (message === 'Failed to fetch' || e?.code === 'ERR_NETWORK_CHANGED') {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["err"])(new Error('Network error. Check your connection and try again.'));
        }
        if (e?.name === 'AbortError') {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["err"])(new Error('Request timed out. Try again.'));
        }
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["err"])(new Error(message));
    }
}
}),
"[project]/Documents/DAW_Ivader/lib/createGeneratedAudioTrack.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createGeneratedAudioTrack",
    ()=>createGeneratedAudioTrack
]);
/** Default synth params for audio tracks (used for type compatibility; audio tracks ignore these). */ const DEFAULT_AUDIO_TRACK_PARAMS = {
    waveform: 'sine',
    attack: 0.01,
    decay: 0.1,
    sustain: 0.5,
    release: 0.2,
    filterCutoff: 1000,
    filterRes: 1,
    gain: 0.5
};
function createGeneratedAudioTrack(audioUrl, options) {
    const { id, name = 'Generated' } = options;
    return {
        id,
        name,
        type: 'audio',
        notes: [],
        params: DEFAULT_AUDIO_TRACK_PARAMS,
        muted: false,
        solo: false,
        volume: 1,
        pan: 0,
        audioUrl
    };
}
}),
"[project]/Documents/DAW_Ivader/schemas/songSchema.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "audioSampleSchema",
    ()=>audioSampleSchema,
    "maxStepIndex",
    ()=>maxStepIndex,
    "noteEventSchema",
    ()=>noteEventSchema,
    "parseSongResponse",
    ()=>parseSongResponse,
    "songDataSchema",
    ()=>songDataSchema,
    "synthParamsSchema",
    ()=>synthParamsSchema,
    "trackSchema",
    ()=>trackSchema
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/zod@4.3.6/node_modules/zod/v4/classic/external.js [app-ssr] (ecmascript) <export * as z>");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/lib/result.ts [app-ssr] (ecmascript)");
;
;
/** Runtime validation for external input (e.g. Gemini API response). */ const waveformSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
    'sine',
    'square',
    'sawtooth',
    'triangle'
]);
const trackTypeSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
    'synth',
    'bass',
    'drums',
    'audio',
    'sampler'
]);
const stepsPerPatternSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].union([
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal(8),
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal(16),
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal(32)
]);
function maxStepIndex(steps) {
    return steps - 1;
}
const noteEventSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    note: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
    startStep: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().int().min(0).max(31),
    durationSteps: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().int().min(1).max(32),
    velocity: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0).max(1).optional()
});
const audioSampleSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
    name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
    url: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().url(),
    trimStart: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0).optional(),
    trimEnd: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0).optional(),
    loop: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].boolean().optional(),
    loopStart: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0).optional(),
    loopEnd: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0).optional(),
    rootNote: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().optional(),
    minNote: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().optional(),
    maxNote: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().optional(),
    minVelocity: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0).max(1).optional(),
    maxVelocity: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0).max(1).optional()
});
const synthParamsSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    waveform: waveformSchema,
    attack: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0),
    decay: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0),
    sustain: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0).max(1),
    release: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0),
    filterCutoff: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0),
    filterRes: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0),
    gain: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0).max(2)
});
const trackSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
    name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
    type: trackTypeSchema,
    notes: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(noteEventSchema),
    params: synthParamsSchema.optional(),
    muted: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].boolean().optional(),
    solo: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].boolean().optional(),
    volume: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0).max(2).optional(),
    pan: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(-1).max(1).optional(),
    audioUrl: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().url().optional(),
    audioTrimStart: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0).optional(),
    audioTrimEnd: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0).optional(),
    samples: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(audioSampleSchema).optional()
});
const songDataSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    title: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(),
    bpm: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().int().min(1).max(999),
    stepsPerPattern: stepsPerPatternSchema.optional(),
    swing: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0).max(100).optional(),
    tracks: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$4$2e$3$2e$6$2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(trackSchema).min(1)
});
function parseSongResponse(raw) {
    const parsed = songDataSchema.safeParse(raw);
    if (!parsed.success) {
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["err"])(new Error(`Invalid song data: ${parsed.error.message}`));
    }
    const data = parsed.data;
    const stepsPerPattern = data.stepsPerPattern ?? 16;
    const defaultParams = {
        waveform: 'sine',
        attack: 0.01,
        decay: 0.1,
        sustain: 0.5,
        release: 0.2,
        filterCutoff: 1000,
        filterRes: 1,
        gain: 0.5
    };
    const song = {
        title: data.title,
        bpm: data.bpm,
        stepsPerPattern,
        swing: data.swing ?? 0,
        tracks: data.tracks.map((t)=>({
                id: t.id,
                name: t.name,
                type: t.type,
                notes: t.notes ?? [],
                params: t.params ?? defaultParams,
                muted: t.muted ?? false,
                solo: t.solo ?? false,
                volume: t.volume ?? 1,
                pan: t.pan ?? 0,
                audioUrl: t.audioUrl,
                audioTrimStart: t.audioTrimStart,
                audioTrimEnd: t.audioTrimEnd,
                samples: t.samples
            }))
    };
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ok"])(song);
}
}),
"[project]/Documents/DAW_Ivader/services/storageService.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "exportSongToJson",
    ()=>exportSongToJson,
    "importSongFromJson",
    ()=>importSongFromJson,
    "loadSong",
    ()=>loadSong,
    "saveSong",
    ()=>saveSong
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$schemas$2f$songSchema$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/schemas/songSchema.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/lib/result.ts [app-ssr] (ecmascript)");
;
;
const STORAGE_KEY = 'doom-daw-song';
function loadSong() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) {
            return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["err"])(new Error('No saved song'));
        }
        const parsed = JSON.parse(raw);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$schemas$2f$songSchema$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseSongResponse"])(parsed);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["err"])(new Error(`Load failed: ${message}`));
    }
}
function saveSong(song) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(song));
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ok"])(undefined);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["err"])(new Error(`Save failed: ${message}`));
    }
}
function exportSongToJson(song) {
    return JSON.stringify(song, null, 2);
}
function importSongFromJson(json) {
    try {
        const parsed = JSON.parse(json);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$schemas$2f$songSchema$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["parseSongResponse"])(parsed);
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["err"])(new Error(`Import failed: ${message}`));
    }
}
}),
"[project]/Documents/DAW_Ivader/hooks/useUndoRedo.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "useUndoRedo",
    ()=>useUndoRedo
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
;
const DEFAULT_MAX_HISTORY = 50;
function useUndoRedo(initial, maxHistory = DEFAULT_MAX_HISTORY) {
    const [{ history, index }, setHistoryAndIndex] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        history: [
            initial
        ],
        index: 0
    });
    const current = history[index];
    const canUndo = index > 0;
    const canRedo = index < history.length - 1;
    const setState = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((value)=>{
        const next = typeof value === 'function' ? value(current) : value;
        setHistoryAndIndex((prev)=>{
            const trimmed = prev.history.slice(0, prev.index + 1);
            const nextHistory = [
                ...trimmed,
                next
            ].slice(-maxHistory);
            return {
                history: nextHistory,
                index: nextHistory.length - 1
            };
        });
    }, [
        maxHistory,
        current
    ]);
    const undo = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        setHistoryAndIndex((prev)=>prev.index > 0 ? {
                ...prev,
                index: prev.index - 1
            } : prev);
    }, []);
    const redo = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        setHistoryAndIndex((prev)=>prev.index < prev.history.length - 1 ? {
                ...prev,
                index: prev.index + 1
            } : prev);
    }, []);
    const clearHistory = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        setHistoryAndIndex({
            history: [
                current
            ],
            index: 0
        });
    }, [
        current
    ]);
    return {
        state: current,
        setState,
        undo,
        redo,
        canUndo,
        canRedo,
        clearHistory
    };
}
}),
"[project]/Documents/DAW_Ivader/lib/songMutations.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * Pure song mutation functions. All return new SongData (or null when mutation is invalid).
 * No side effects; intended for use with useUndoRedo setState so undo/redo stays consistent.
 */ __turbopack_context__.s([
    "addTrack",
    ()=>addTrack,
    "appendTrack",
    ()=>appendTrack,
    "createEmptySamplerTrack",
    ()=>createEmptySamplerTrack,
    "createEmptySynthTrack",
    ()=>createEmptySynthTrack,
    "defaultSynthParams",
    ()=>defaultSynthParams,
    "duplicateTrack",
    ()=>duplicateTrack,
    "moveTrack",
    ()=>moveTrack,
    "removeTrack",
    ()=>removeTrack,
    "replaceSong",
    ()=>replaceSong,
    "setBpm",
    ()=>setBpm,
    "setStepsPerPattern",
    ()=>setStepsPerPattern,
    "setSwing",
    ()=>setSwing,
    "setTitle",
    ()=>setTitle,
    "setTrackMuted",
    ()=>setTrackMuted,
    "setTrackPan",
    ()=>setTrackPan,
    "setTrackSolo",
    ()=>setTrackSolo,
    "setTrackVolume",
    ()=>setTrackVolume,
    "setTrackWaveform",
    ()=>setTrackWaveform,
    "toggleStep",
    ()=>toggleStep,
    "updateTrackParam",
    ()=>updateTrackParam
]);
const DEFAULT_SYNTH_PARAMS = {
    waveform: 'sine',
    attack: 0.01,
    decay: 0.1,
    sustain: 0.5,
    release: 0.2,
    filterCutoff: 1000,
    filterRes: 1,
    gain: 0.5
};
function findTrackIndex(song, trackId) {
    return song.tracks.findIndex((t)=>t.id === trackId);
}
function addTrack(song, newTrack) {
    return {
        ...song,
        tracks: [
            ...song.tracks,
            newTrack
        ]
    };
}
function removeTrack(song, trackId) {
    if (song.tracks.length <= 1) return null;
    const i = findTrackIndex(song, trackId);
    if (i === -1) return null;
    return {
        ...song,
        tracks: song.tracks.filter((t)=>t.id !== trackId)
    };
}
function duplicateTrack(song, trackId, newId, nameSuffix = ' COPY') {
    const track = song.tracks.find((t)=>t.id === trackId);
    if (!track) return null;
    const i = findTrackIndex(song, trackId);
    const newTrack = {
        ...track,
        id: newId,
        name: track.name + nameSuffix
    };
    const newTracks = [
        ...song.tracks
    ];
    newTracks.splice(i + 1, 0, newTrack);
    return {
        ...song,
        tracks: newTracks
    };
}
function moveTrack(song, trackId, direction) {
    const i = findTrackIndex(song, trackId);
    if (i === -1) return null;
    if (direction === 'up' && i === 0) return null;
    if (direction === 'down' && i === song.tracks.length - 1) return null;
    const j = direction === 'up' ? i - 1 : i + 1;
    const newTracks = [
        ...song.tracks
    ];
    [newTracks[i], newTracks[j]] = [
        newTracks[j],
        newTracks[i]
    ];
    return {
        ...song,
        tracks: newTracks
    };
}
function setTrackMuted(song, trackId, muted) {
    const i = findTrackIndex(song, trackId);
    if (i === -1) return null;
    const newTracks = [
        ...song.tracks
    ];
    newTracks[i] = {
        ...newTracks[i],
        muted
    };
    return {
        ...song,
        tracks: newTracks
    };
}
function setTrackSolo(song, trackId, solo) {
    const i = findTrackIndex(song, trackId);
    if (i === -1) return null;
    const newTracks = [
        ...song.tracks
    ];
    newTracks[i] = {
        ...newTracks[i],
        solo
    };
    return {
        ...song,
        tracks: newTracks
    };
}
function setTrackVolume(song, trackId, volume) {
    const i = findTrackIndex(song, trackId);
    if (i === -1) return null;
    const newTracks = [
        ...song.tracks
    ];
    newTracks[i] = {
        ...newTracks[i],
        volume: Math.max(0, Math.min(2, volume))
    };
    return {
        ...song,
        tracks: newTracks
    };
}
function setTrackPan(song, trackId, pan) {
    const i = findTrackIndex(song, trackId);
    if (i === -1) return null;
    const newTracks = [
        ...song.tracks
    ];
    newTracks[i] = {
        ...newTracks[i],
        pan: Math.max(-1, Math.min(1, pan))
    };
    return {
        ...song,
        tracks: newTracks
    };
}
function updateTrackParam(song, trackId, param, value) {
    const i = findTrackIndex(song, trackId);
    if (i === -1) return null;
    const newTracks = [
        ...song.tracks
    ];
    newTracks[i] = {
        ...newTracks[i],
        params: {
            ...newTracks[i].params,
            [param]: value
        }
    };
    return {
        ...song,
        tracks: newTracks
    };
}
function setTrackWaveform(song, trackId, waveform) {
    const i = findTrackIndex(song, trackId);
    if (i === -1) return null;
    const newTracks = [
        ...song.tracks
    ];
    newTracks[i] = {
        ...newTracks[i],
        params: {
            ...newTracks[i].params,
            waveform
        }
    };
    return {
        ...song,
        tracks: newTracks
    };
}
function toggleStep(song, trackId, step) {
    const i = findTrackIndex(song, trackId);
    if (i === -1) return null;
    const track = song.tracks[i];
    const hasNoteAtStep = track.notes.some((n)=>step >= n.startStep && step < n.startStep + n.durationSteps);
    const newTracks = [
        ...song.tracks
    ];
    if (hasNoteAtStep) {
        newTracks[i] = {
            ...track,
            notes: track.notes.filter((n)=>!(step >= n.startStep && step < n.startStep + n.durationSteps))
        };
    } else {
        const defaultNote = track.type === 'drums' ? {
            note: 'kick',
            startStep: step,
            durationSteps: 1
        } : track.type === 'bass' ? {
            note: 'C2',
            startStep: step,
            durationSteps: 4
        } : {
            note: 'C4',
            startStep: step,
            durationSteps: 2
        };
        newTracks[i] = {
            ...track,
            notes: [
                ...track.notes,
                defaultNote
            ].sort((a, b)=>a.startStep - b.startStep)
        };
    }
    return {
        ...song,
        tracks: newTracks
    };
}
function setBpm(song, bpm) {
    const clamped = Math.max(1, Math.min(999, Math.round(bpm)));
    return {
        ...song,
        bpm: clamped
    };
}
function setStepsPerPattern(song, steps) {
    return {
        ...song,
        stepsPerPattern: steps
    };
}
function setSwing(song, swing) {
    const clamped = Math.max(0, Math.min(100, Math.round(swing)));
    return {
        ...song,
        swing: clamped
    };
}
function setTitle(song, title) {
    return {
        ...song,
        title
    };
}
function replaceSong(_song, next) {
    return next;
}
function appendTrack(song, newTrack) {
    return addTrack(song, newTrack);
}
function defaultSynthParams() {
    return {
        ...DEFAULT_SYNTH_PARAMS
    };
}
function createEmptySynthTrack(id, name) {
    return {
        id,
        name,
        type: 'synth',
        notes: [],
        params: {
            ...DEFAULT_SYNTH_PARAMS
        },
        muted: false,
        solo: false,
        volume: 1,
        pan: 0
    };
}
function createEmptySamplerTrack(id, name) {
    return {
        id,
        name,
        type: 'sampler',
        notes: [],
        params: {
            ...DEFAULT_SYNTH_PARAMS
        },
        muted: false,
        solo: false,
        volume: 1,
        pan: 0,
        samples: []
    };
}
}),
"[project]/Documents/DAW_Ivader/types.ts [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/** Step index for the sequencer (0-based, max depends on stepsPerPattern). */ __turbopack_context__.s([
    "PlayState",
    ()=>PlayState
]);
var PlayState = /*#__PURE__*/ function(PlayState) {
    PlayState[PlayState["STOPPED"] = 0] = "STOPPED";
    PlayState[PlayState["PLAYING"] = 1] = "PLAYING";
    PlayState[PlayState["PAUSED"] = 2] = "PAUSED";
    return PlayState;
}({});
}),
"[project]/Documents/DAW_Ivader/components/Visualizer.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Visualizer",
    ()=>Visualizer
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/services/audioEngine.ts [app-ssr] (ecmascript)");
;
;
;
const Visualizer = ()=>{
    const canvasRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const containerRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        let animationId;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const analyser = __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["audioEngine"].getAnalyser();
        const render = ()=>{
            // Clear with fade effect for trails
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (!analyser) {
                // Static line when idle
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, canvas.height / 2);
                ctx.lineTo(canvas.width, canvas.height / 2);
                ctx.stroke();
                animationId = requestAnimationFrame(render);
                return;
            }
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteFrequencyData(dataArray);
            const barWidth = canvas.width / bufferLength * 2.5;
            let barHeight;
            let x = 0;
            for(let i = 0; i < bufferLength; i++){
                barHeight = dataArray[i] / 255 * canvas.height;
                // Dynamic Gradient
                const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
                gradient.addColorStop(0, '#ff0055');
                gradient.addColorStop(0.5, '#b026ff');
                gradient.addColorStop(1, '#39ff14');
                ctx.fillStyle = gradient;
                // Random glitch horizontal offset
                const glitch = Math.random() > 0.99 ? (Math.random() - 0.5) * 20 : 0;
                ctx.fillRect(x + glitch, canvas.height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
            animationId = requestAnimationFrame(render);
        };
        render();
        const resizeObserver = new ResizeObserver(()=>{
            const el = containerRef.current;
            const canvas = canvasRef.current;
            if (!el || !canvas) return;
            const rect = el.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const w = Math.floor(Math.max(1, rect.width) * dpr);
            const h = Math.floor(Math.max(1, rect.height) * dpr);
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
        });
        if (containerRef.current) resizeObserver.observe(containerRef.current);
        return ()=>{
            resizeObserver.disconnect();
            cancelAnimationFrame(animationId);
        };
    }, []);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        ref: containerRef,
        className: "w-full h-24 min-h-[5.5rem] sm:h-32 sm:min-h-0 relative overflow-hidden bg-black/50",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute top-1 left-2 text-[9px] text-[#39ff14] z-10 font-bold bg-black/80 px-1 border border-[#39ff14]/30",
                children: "VISUAL_FEED_v9.2"
            }, void 0, false, {
                fileName: "[project]/Documents/DAW_Ivader/components/Visualizer.tsx",
                lineNumber: 89,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "absolute inset-0 z-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PHBhdGggZD0iTTEwIDBMMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSg1NywgMjU1LCAyMCwgMC4xKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9zdmc+')] pointer-events-none opacity-50"
            }, void 0, false, {
                fileName: "[project]/Documents/DAW_Ivader/components/Visualizer.tsx",
                lineNumber: 91,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("canvas", {
                ref: canvasRef,
                width: 800,
                height: 128,
                className: "w-full h-full block"
            }, void 0, false, {
                fileName: "[project]/Documents/DAW_Ivader/components/Visualizer.tsx",
                lineNumber: 93,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/Documents/DAW_Ivader/components/Visualizer.tsx",
        lineNumber: 88,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
}),
"[project]/Documents/DAW_Ivader/components/Sequencer.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Sequencer",
    ()=>Sequencer
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
;
const Sequencer = ({ track, stepsPerPattern, currentStep, selectedStep, cancelStep, onStepSelect, onStepToggle })=>{
    const steps = Array.from({
        length: stepsPerPattern
    }, (_, i)=>i);
    const isAudioTrack = track.type === 'audio';
    const isStepActive = (stepIndex)=>{
        return track.notes.some((n)=>stepIndex >= n.startStep && stepIndex < n.startStep + n.durationSteps);
    };
    const getNoteName = (stepIndex)=>{
        const note = track.notes.find((n)=>n.startStep === stepIndex);
        return note ? note.note : '';
    };
    const getTrackColor = ()=>{
        switch(track.type){
            case 'bass':
                return 'text-[#b026ff] border-[#b026ff] shadow-[#b026ff]';
            case 'drums':
                return 'text-[#ff0055] border-[#ff0055] shadow-[#ff0055]';
            case 'audio':
                return 'text-[#ffaa00] border-[#ffaa00] shadow-[#ffaa00]';
            case 'sampler':
                return 'text-[#00e5ff] border-[#00e5ff] shadow-[#00e5ff]';
            default:
                return 'text-[#39ff14] border-[#39ff14] shadow-[#39ff14]';
        }
    };
    const getTrackBg = ()=>{
        switch(track.type){
            case 'bass':
                return 'bg-[#b026ff]';
            case 'drums':
                return 'bg-[#ff0055]';
            case 'audio':
                return 'bg-[#ffaa00]';
            case 'sampler':
                return 'bg-[#00e5ff]';
            default:
                return 'bg-[#39ff14]';
        }
    };
    if (isAudioTrack) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex gap-2 items-center w-full overflow-x-auto py-1",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `w-16 text-xs font-bold shrink-0 uppercase tracking-widest ${getTrackColor().split(' ')[0]} neon-text opacity-90`,
                    children: track.name
                }, void 0, false, {
                    fileName: "[project]/Documents/DAW_Ivader/components/Sequencer.tsx",
                    lineNumber: 60,
                    columnNumber: 9
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: `flex-1 min-w-0 h-12 rounded border border-gray-900 flex items-center justify-center px-1 sm:px-2 ${getTrackBg()} bg-opacity-30 border-opacity-50`,
                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-[8px] sm:text-[10px] font-bold text-white/90 uppercase tracking-wider text-center leading-tight line-clamp-2",
                        children: "Clip · plays from start"
                    }, void 0, false, {
                        fileName: "[project]/Documents/DAW_Ivader/components/Sequencer.tsx",
                        lineNumber: 64,
                        columnNumber: 11
                    }, ("TURBOPACK compile-time value", void 0))
                }, void 0, false, {
                    fileName: "[project]/Documents/DAW_Ivader/components/Sequencer.tsx",
                    lineNumber: 63,
                    columnNumber: 9
                }, ("TURBOPACK compile-time value", void 0))
            ]
        }, void 0, true, {
            fileName: "[project]/Documents/DAW_Ivader/components/Sequencer.tsx",
            lineNumber: 59,
            columnNumber: 7
        }, ("TURBOPACK compile-time value", void 0));
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex gap-2 items-center w-full overflow-x-auto py-1",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `w-16 text-xs font-bold shrink-0 uppercase tracking-widest ${getTrackColor().split(' ')[0]} neon-text opacity-90`,
                children: track.name
            }, void 0, false, {
                fileName: "[project]/Documents/DAW_Ivader/components/Sequencer.tsx",
                lineNumber: 72,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex gap-[2px] flex-1 h-12 bg-black/50 p-1 rounded border border-gray-900 shadow-inner",
                children: steps.map((step)=>{
                    const active = isStepActive(step);
                    const isCurrent = currentStep === step;
                    const isSelected = selectedStep === step;
                    const isCancelMark = currentStep === -1 && cancelStep !== undefined && cancelStep === step;
                    // Step Visual Logic
                    let baseClasses = "flex-1 min-w-[12px] h-full rounded-[1px] transition-all duration-75 relative group border-t border-b";
                    if (active) {
                        baseClasses += ` ${getTrackBg()} border-transparent shadow-[0_0_8px_currentColor] opacity-90 z-10`;
                    } else {
                        baseClasses += " bg-[#111] border-transparent hover:bg-[#222]";
                    }
                    // Selected State
                    if (isSelected) {
                        baseClasses += " ring-1 ring-white ring-inset ring-opacity-80 z-20";
                    }
                    // Playhead Overlay
                    const playheadClass = isCurrent ? "after:absolute after:inset-0 after:bg-white after:opacity-50 after:z-30 after:shadow-[0_0_10px_white]" : "";
                    // Cancel Mark Overlay (shows resume point when stopped)
                    const cancelMarkClass = isCancelMark ? "after:absolute after:inset-0 after:bg-[#b026ff] after:opacity-30 after:z-30 after:border after:border-[#b026ff] after:border-opacity-80" : "";
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `${baseClasses} ${playheadClass} ${cancelMarkClass}`,
                        onClick: ()=>{
                            onStepSelect(step);
                            if (onStepToggle) onStepToggle(step);
                        },
                        children: [
                            !active && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "absolute top-0 left-0 right-0 h-[40%] bg-white/5 pointer-events-none"
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/components/Sequencer.tsx",
                                lineNumber: 112,
                                columnNumber: 29
                            }, ("TURBOPACK compile-time value", void 0)),
                            active && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-[9px] px-2 py-1 border border-white hidden group-hover:block z-50 whitespace-nowrap shadow-lg",
                                children: getNoteName(step)
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/components/Sequencer.tsx",
                                lineNumber: 116,
                                columnNumber: 21
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, step, true, {
                        fileName: "[project]/Documents/DAW_Ivader/components/Sequencer.tsx",
                        lineNumber: 103,
                        columnNumber: 14
                    }, ("TURBOPACK compile-time value", void 0));
                })
            }, void 0, false, {
                fileName: "[project]/Documents/DAW_Ivader/components/Sequencer.tsx",
                lineNumber: 75,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/Documents/DAW_Ivader/components/Sequencer.tsx",
        lineNumber: 71,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
}),
"[project]/Documents/DAW_Ivader/components/Knob.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Knob",
    ()=>Knob
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
;
;
const Knob = ({ label, value, min, max, step = 0.01, onChange, color = "text-[#39ff14]" })=>{
    const [isDragging, setIsDragging] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [startY, setStartY] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [startValue, setStartValue] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    // Extract hex color from class prop for SVG usage
    const getHexColor = ()=>{
        if (color.includes("#39ff14")) return "#39ff14";
        if (color.includes("#b026ff")) return "#b026ff";
        if (color.includes("#ff0055")) return "#ff0055";
        return "#39ff14";
    };
    const hexColor = getHexColor();
    const handleMouseDown = (e)=>{
        setIsDragging(true);
        setStartY(e.clientY);
        setStartValue(value);
    };
    const handleMouseMove = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])((e)=>{
        if (!isDragging) return;
        const deltaY = startY - e.clientY;
        const range = max - min;
        const deltaVal = deltaY / 100 * range;
        let newValue = startValue + deltaVal;
        if (newValue < min) newValue = min;
        if (newValue > max) newValue = max;
        newValue = Math.round(newValue / step) * step;
        onChange(newValue);
    }, [
        isDragging,
        startY,
        startValue,
        min,
        max,
        step,
        onChange
    ]);
    const handleMouseUp = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useCallback"])(()=>{
        setIsDragging(false);
    }, []);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return ()=>{
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [
        isDragging,
        handleMouseMove,
        handleMouseUp
    ]);
    const range = max - min;
    const percentage = range === 0 ? 0 : (value - min) / range;
    const rotation = -135 + percentage * 270;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col items-center justify-center m-1 select-none group",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "knob-container cursor-ns-resize relative w-[50px] h-[50px]",
                onMouseDown: handleMouseDown,
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("svg", {
                        width: "50",
                        height: "50",
                        viewBox: "0 0 100 100",
                        className: "absolute top-0 left-0 pointer-events-none drop-shadow-[0_0_2px_rgba(0,0,0,1)]",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                cx: "50",
                                cy: "50",
                                r: "42",
                                stroke: "#1a1a20",
                                strokeWidth: "8",
                                fill: "transparent",
                                strokeDasharray: "251.2",
                                strokeDashoffset: "62.8",
                                transform: "rotate(135 50 50)"
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/components/Knob.tsx",
                                lineNumber: 80,
                                columnNumber: 11
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("circle", {
                                cx: "50",
                                cy: "50",
                                r: "42",
                                stroke: hexColor,
                                strokeWidth: "8",
                                fill: "transparent",
                                strokeDasharray: "251.2",
                                strokeDashoffset: 251.2 - percentage * (251.2 * 0.75),
                                transform: "rotate(135 50 50)",
                                className: "transition-all duration-75",
                                style: {
                                    filter: `drop-shadow(0 0 4px ${hexColor})`
                                }
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/components/Knob.tsx",
                                lineNumber: 83,
                                columnNumber: 11
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Documents/DAW_Ivader/components/Knob.tsx",
                        lineNumber: 78,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "absolute inset-[15%] rounded-full border border-gray-700 bg-gradient-to-br from-gray-800 to-black shadow-lg flex items-center justify-center transition-transform duration-75 group-hover:border-gray-500",
                        style: {
                            transform: `rotate(${rotation}deg)`
                        },
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: `w-1 h-3 absolute top-1 ${color.replace('text-', 'bg-')} rounded-full shadow-[0_0_5px_currentColor]`
                        }, void 0, false, {
                            fileName: "[project]/Documents/DAW_Ivader/components/Knob.tsx",
                            lineNumber: 102,
                            columnNumber: 11
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/Documents/DAW_Ivader/components/Knob.tsx",
                        lineNumber: 97,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/Documents/DAW_Ivader/components/Knob.tsx",
                lineNumber: 74,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: `text-[10px] mt-1 font-mono font-bold ${color} opacity-80 group-hover:opacity-100 transition-opacity`,
                children: label
            }, void 0, false, {
                fileName: "[project]/Documents/DAW_Ivader/components/Knob.tsx",
                lineNumber: 106,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-[9px] text-gray-600 bg-black/50 px-1 rounded",
                children: value.toFixed(2)
            }, void 0, false, {
                fileName: "[project]/Documents/DAW_Ivader/components/Knob.tsx",
                lineNumber: 107,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/Documents/DAW_Ivader/components/Knob.tsx",
        lineNumber: 73,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
}),
"[project]/Documents/DAW_Ivader/components/AudioSampler.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AudioSampler",
    ()=>AudioSampler
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$upload$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Upload$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/upload.js [app-ssr] (ecmascript) <export default as Upload>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$mic$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Mic$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/mic.js [app-ssr] (ecmascript) <export default as Mic>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$mic$2d$off$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MicOff$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/mic-off.js [app-ssr] (ecmascript) <export default as MicOff>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$scissors$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Scissors$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/scissors.js [app-ssr] (ecmascript) <export default as Scissors>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$play$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Play$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/play.js [app-ssr] (ecmascript) <export default as Play>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/square.js [app-ssr] (ecmascript) <export default as Square>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/rotate-ccw.js [app-ssr] (ecmascript) <export default as RotateCcw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/plus.js [app-ssr] (ecmascript) <export default as Plus>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/trash-2.js [app-ssr] (ecmascript) <export default as Trash2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings2$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/settings-2.js [app-ssr] (ecmascript) <export default as Settings2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$repeat$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Repeat$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/repeat.js [app-ssr] (ecmascript) <export default as Repeat>");
;
;
;
const AudioSampler = ({ onAudioLoaded, onSamplerLoaded, preloadedAudio, onLoopDropped })=>{
    const [isDragging, setIsDragging] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [isRecording, setIsRecording] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    // Current active sample being edited
    const [currentUrl, setCurrentUrl] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [currentName, setCurrentName] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('');
    const [startTime, setStartTime] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [endTime, setEndTime] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [duration, setDuration] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [isPlaying, setIsPlaying] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    // Sampler state
    const [isSamplerMode, setIsSamplerMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [samples, setSamples] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])([]);
    const [editingSampleId, setEditingSampleId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    // Mapping state for current sample
    const [rootNote, setRootNote] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('C4');
    const [minNote, setMinNote] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('C0');
    const [maxNote, setMaxNote] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('B8');
    const [minVelocity, setMinVelocity] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [maxVelocity, setMaxVelocity] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(1);
    const [isLooping, setIsLooping] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [loopStart, setLoopStart] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [loopEnd, setLoopEnd] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const fileInputRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const mediaRecorderRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const audioPreviewRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const playbackIntervalRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    // Cleanup interval on unmount
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        return ()=>{
            if (playbackIntervalRef.current !== null) {
                clearInterval(playbackIntervalRef.current);
            }
        };
    }, []);
    // Auto-load generated audio when preloadedAudio changes
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        if (!preloadedAudio) return;
        loadAudio(preloadedAudio.url, preloadedAudio.name);
    }, [
        preloadedAudio
    ]);
    const loadAudio = (url, name, trimStart = 0, trimEnd)=>{
        setCurrentUrl(url);
        setCurrentName(name);
        const audio = new Audio(url);
        const onMetadata = ()=>{
            const dur = audio.duration;
            setDuration(dur);
            setStartTime(trimStart);
            setEndTime(trimEnd ?? dur);
            setLoopStart(trimStart);
            setLoopEnd(trimEnd ?? dur);
        };
        audio.addEventListener('loadedmetadata', onMetadata);
    };
    const handleDragOver = (e)=>{
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('application/json')) {
            e.dataTransfer.dropEffect = 'copy';
        }
        setIsDragging(true);
    };
    const handleDragLeave = (e)=>{
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };
    const processAudioFile = async (file)=>{
        if (!file.type.startsWith('audio/')) {
            alert('Please upload a valid audio file');
            return;
        }
        const url = URL.createObjectURL(file);
        loadAudio(url, file.name);
    };
    const handleDrop = async (e)=>{
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.types.includes('application/json')) {
            try {
                const data = e.dataTransfer.getData('application/json');
                const loop = JSON.parse(data);
                if (loop && typeof loop.url === 'string' && typeof loop.name === 'string') {
                    loadAudio(loop.url, loop.name, loop.trimStart, loop.trimEnd);
                    onLoopDropped?.();
                    return;
                }
            } catch  {}
        }
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            await processAudioFile(files[0]);
        }
    };
    const handleFileSelect = async (e)=>{
        const files = e.target.files;
        if (files && files.length > 0) {
            await processAudioFile(files[0]);
        }
    };
    const startRecording = async ()=>{
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true
            });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            const chunks = [];
            mediaRecorder.ondataavailable = (e)=>{
                if (e.data.size > 0) chunks.push(e.data);
            };
            mediaRecorder.onstop = ()=>{
                const blob = new Blob(chunks, {
                    type: 'audio/webm'
                });
                const url = URL.createObjectURL(blob);
                loadAudio(url, 'recorded_audio.webm');
                stream.getTracks().forEach((track)=>track.stop());
            };
            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('Could not access microphone.');
        }
    };
    const stopRecording = ()=>{
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };
    const handlePlayPreview = ()=>{
        if (audioPreviewRef.current) {
            if (isPlaying) {
                if (playbackIntervalRef.current !== null) clearInterval(playbackIntervalRef.current);
                audioPreviewRef.current.pause();
                audioPreviewRef.current.currentTime = startTime;
                setIsPlaying(false);
            } else {
                if (playbackIntervalRef.current !== null) clearInterval(playbackIntervalRef.current);
                audioPreviewRef.current.currentTime = startTime;
                audioPreviewRef.current.play();
                setIsPlaying(true);
                playbackIntervalRef.current = window.setInterval(()=>{
                    if (audioPreviewRef.current && audioPreviewRef.current.currentTime >= endTime) {
                        if (isLooping) {
                            audioPreviewRef.current.currentTime = loopStart;
                        } else {
                            audioPreviewRef.current.pause();
                            audioPreviewRef.current.currentTime = startTime;
                            setIsPlaying(false);
                            clearInterval(playbackIntervalRef.current);
                        }
                    }
                }, 50);
            }
        }
    };
    const handleAddSample = ()=>{
        if (!currentUrl) return;
        const newSample = {
            id: Math.random().toString(36).slice(2, 9),
            name: currentName,
            url: currentUrl,
            trimStart: startTime,
            trimEnd: endTime,
            rootNote,
            minNote,
            maxNote,
            minVelocity,
            maxVelocity,
            loop: isLooping,
            loopStart,
            loopEnd
        };
        setSamples((prev)=>[
                ...prev,
                newSample
            ]);
        setIsSamplerMode(true);
        // Reset current for next
        handleResetCurrent();
    };
    const handleUpdateSample = ()=>{
        if (!editingSampleId || !currentUrl) return;
        setSamples((prev)=>prev.map((s)=>s.id === editingSampleId ? {
                    ...s,
                    name: currentName,
                    url: currentUrl,
                    trimStart: startTime,
                    trimEnd: endTime,
                    rootNote,
                    minNote,
                    maxNote,
                    minVelocity,
                    maxVelocity,
                    loop: isLooping,
                    loopStart,
                    loopEnd
                } : s));
        setEditingSampleId(null);
        handleResetCurrent();
    };
    const handleEditSample = (sample)=>{
        setEditingSampleId(sample.id);
        setCurrentUrl(sample.url);
        setCurrentName(sample.name);
        setStartTime(sample.trimStart ?? 0);
        setEndTime(sample.trimEnd ?? 0);
        setRootNote(sample.rootNote ?? 'C4');
        setMinNote(sample.minNote ?? 'C0');
        setMaxNote(sample.maxNote ?? 'B8');
        setMinVelocity(sample.minVelocity ?? 0);
        setMaxVelocity(sample.maxVelocity ?? 1);
        setIsLooping(sample.loop ?? false);
        setLoopStart(sample.loopStart ?? 0);
        setLoopEnd(sample.loopEnd ?? 0);
        const audio = new Audio(sample.url);
        audio.addEventListener('loadedmetadata', ()=>{
            const d = audio.duration;
            setDuration(d);
            const end = sample.trimEnd != null ? Math.min(sample.trimEnd, d) : d;
            setEndTime(end);
            const start = sample.trimStart != null ? Math.min(sample.trimStart, end) : 0;
            setStartTime(start);
        });
    };
    const handleRemoveSample = (id)=>{
        setSamples((prev)=>prev.filter((s)=>s.id !== id));
    };
    const handleAddToTrack = ()=>{
        if (isSamplerMode && samples.length > 0) {
            onSamplerLoaded?.(samples, 'MultiSampler');
            setSamples([]);
            setIsSamplerMode(false);
        } else if (currentUrl) {
            onAudioLoaded(currentUrl, currentName, startTime, endTime);
            handleResetCurrent();
        }
    };
    const handleResetCurrent = ()=>{
        setCurrentUrl(null);
        setCurrentName('');
        setStartTime(0);
        setEndTime(0);
        setDuration(0);
        setIsPlaying(false);
        setEditingSampleId(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "cyber-panel p-4 bg-black/80 max-h-[80vh] overflow-y-auto custom-scrollbar",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center justify-between mb-4 border-b border-gray-800 pb-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$upload$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Upload$3e$__["Upload"], {
                                size: 14,
                                className: "text-[#39ff14]"
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                lineNumber: 292,
                                columnNumber: 11
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                className: "text-xs text-[#39ff14] font-bold tracking-widest neon-text-green",
                                children: "ADVANCED_SAMPLER"
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                lineNumber: 293,
                                columnNumber: 11
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                        lineNumber: 291,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex gap-2",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                            onClick: ()=>setIsSamplerMode(!isSamplerMode),
                            className: `text-[9px] px-2 py-0.5 border ${isSamplerMode ? 'bg-[#b026ff] border-[#b026ff] text-white' : 'border-gray-700 text-gray-500'}`,
                            children: "SAMPLER_MODE"
                        }, void 0, false, {
                            fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                            lineNumber: 298,
                            columnNumber: 11
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                        lineNumber: 297,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                lineNumber: 290,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            isSamplerMode && samples.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mb-4 space-y-1",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                        className: "text-[9px] text-gray-500 uppercase tracking-widest",
                        children: [
                            "LOADED_SAMPLES (",
                            samples.length,
                            ")"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                        lineNumber: 310,
                        columnNumber: 11
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "max-h-32 overflow-y-auto space-y-1 border border-gray-800 p-1 bg-black/40",
                        children: samples.map((s)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center justify-between p-1 bg-white/5 rounded text-[10px]",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "truncate flex-1 text-gray-300",
                                        children: [
                                            s.name,
                                            " (",
                                            s.minNote,
                                            "-",
                                            s.maxNote,
                                            ")"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                        lineNumber: 314,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex gap-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>handleEditSample(s),
                                                className: "p-1 hover:text-[#39ff14]",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$settings$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Settings2$3e$__["Settings2"], {
                                                    size: 10
                                                }, void 0, false, {
                                                    fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                    lineNumber: 316,
                                                    columnNumber: 100
                                                }, ("TURBOPACK compile-time value", void 0))
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                lineNumber: 316,
                                                columnNumber: 19
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: ()=>handleRemoveSample(s.id),
                                                className: "p-1 hover:text-[#ff0055]",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__["Trash2"], {
                                                    size: 10
                                                }, void 0, false, {
                                                    fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                    lineNumber: 317,
                                                    columnNumber: 105
                                                }, ("TURBOPACK compile-time value", void 0))
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                lineNumber: 317,
                                                columnNumber: 19
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                        lineNumber: 315,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, s.id, true, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                lineNumber: 313,
                                columnNumber: 15
                            }, ("TURBOPACK compile-time value", void 0)))
                    }, void 0, false, {
                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                        lineNumber: 311,
                        columnNumber: 11
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                lineNumber: 309,
                columnNumber: 9
            }, ("TURBOPACK compile-time value", void 0)),
            !currentUrl && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                onDragOver: handleDragOver,
                onDragLeave: handleDragLeave,
                onDrop: handleDrop,
                className: `border-2 border-dashed rounded p-6 mb-4 transition-all cursor-pointer ${isDragging ? 'border-[#39ff14] bg-[#39ff14]/10' : 'border-gray-700 hover:border-gray-600'}`,
                onClick: ()=>fileInputRef.current?.click(),
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex flex-col items-center justify-center gap-2 text-center",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$upload$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Upload$3e$__["Upload"], {
                                size: 24,
                                className: isDragging ? 'text-[#39ff14]' : 'text-gray-500'
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                lineNumber: 337,
                                columnNumber: 13
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                className: "text-[10px] text-gray-400",
                                children: "Drop audio or click to browse"
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                lineNumber: 338,
                                columnNumber: 13
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                        lineNumber: 336,
                        columnNumber: 11
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                        ref: fileInputRef,
                        type: "file",
                        accept: "audio/*",
                        onChange: handleFileSelect,
                        className: "hidden"
                    }, void 0, false, {
                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                        lineNumber: 340,
                        columnNumber: 11
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                lineNumber: 327,
                columnNumber: 9
            }, ("TURBOPACK compile-time value", void 0)),
            !currentUrl && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                onClick: isRecording ? stopRecording : startRecording,
                className: `w-full flex items-center justify-center gap-2 px-4 py-2 text-xs border mb-4 transition-all ${isRecording ? 'border-[#ff0055] text-[#ff0055] bg-[#ff0055]/10 animate-pulse' : 'border-gray-600 text-gray-400 hover:border-[#39ff14]'}`,
                children: isRecording ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$mic$2d$off$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MicOff$3e$__["MicOff"], {
                            size: 14
                        }, void 0, false, {
                            fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                            lineNumber: 352,
                            columnNumber: 28
                        }, ("TURBOPACK compile-time value", void 0)),
                        " STOP"
                    ]
                }, void 0, true) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$mic$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Mic$3e$__["Mic"], {
                            size: 14
                        }, void 0, false, {
                            fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                            lineNumber: 352,
                            columnNumber: 60
                        }, ("TURBOPACK compile-time value", void 0)),
                        " RECORD"
                    ]
                }, void 0, true)
            }, void 0, false, {
                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                lineNumber: 346,
                columnNumber: 9
            }, ("TURBOPACK compile-time value", void 0)),
            currentUrl && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "border border-gray-700 rounded p-3 bg-black/50 space-y-3",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center justify-between border-b border-gray-800 pb-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-[10px] text-[#39ff14] font-mono truncate max-w-[150px]",
                                children: currentName
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                lineNumber: 360,
                                columnNumber: 13
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: handleResetCurrent,
                                className: "text-gray-500 hover:text-[#ff0055]",
                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__["RotateCcw"], {
                                    size: 12
                                }, void 0, false, {
                                    fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                    lineNumber: 361,
                                    columnNumber: 97
                                }, ("TURBOPACK compile-time value", void 0))
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                lineNumber: 361,
                                columnNumber: 13
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                        lineNumber: 359,
                        columnNumber: 11
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("audio", {
                        ref: audioPreviewRef,
                        src: currentUrl,
                        className: "hidden"
                    }, void 0, false, {
                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                        lineNumber: 364,
                        columnNumber: 11
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-2 gap-4",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "space-y-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "text-[9px] text-gray-500 flex items-center gap-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$scissors$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Scissors$3e$__["Scissors"], {
                                                size: 10
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                lineNumber: 369,
                                                columnNumber: 83
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            " TRIM"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                        lineNumber: 369,
                                        columnNumber: 15
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "space-y-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "range",
                                                min: 0,
                                                max: duration,
                                                step: 0.01,
                                                value: startTime,
                                                onChange: (e)=>setStartTime(Number(e.target.value)),
                                                className: "w-full h-1 accent-[#39ff14]"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                lineNumber: 371,
                                                columnNumber: 17
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "range",
                                                min: 0,
                                                max: duration,
                                                step: 0.01,
                                                value: endTime,
                                                onChange: (e)=>setEndTime(Number(e.target.value)),
                                                className: "w-full h-1 accent-[#39ff14]"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                lineNumber: 372,
                                                columnNumber: 17
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex justify-between text-[8px] text-gray-600 font-mono",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        children: [
                                                            startTime.toFixed(2),
                                                            "s"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                        lineNumber: 374,
                                                        columnNumber: 19
                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                        children: [
                                                            endTime.toFixed(2),
                                                            "s"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                        lineNumber: 375,
                                                        columnNumber: 19
                                                    }, ("TURBOPACK compile-time value", void 0))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                lineNumber: 373,
                                                columnNumber: 17
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                        lineNumber: 370,
                                        columnNumber: 15
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                lineNumber: 368,
                                columnNumber: 13
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "space-y-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "text-[9px] text-gray-500 flex items-center gap-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$repeat$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Repeat$3e$__["Repeat"], {
                                                size: 10,
                                                className: isLooping ? 'text-[#b026ff]' : ''
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                lineNumber: 381,
                                                columnNumber: 17
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            " LOOP",
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "checkbox",
                                                checked: isLooping,
                                                onChange: (e)=>setIsLooping(e.target.checked),
                                                className: "ml-auto accent-[#b026ff]"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                lineNumber: 382,
                                                columnNumber: 17
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                        lineNumber: 380,
                                        columnNumber: 15
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    isLooping && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "space-y-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "range",
                                                min: startTime,
                                                max: endTime,
                                                step: 0.01,
                                                value: loopStart,
                                                onChange: (e)=>setLoopStart(Number(e.target.value)),
                                                className: "w-full h-1 accent-[#b026ff]"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                lineNumber: 386,
                                                columnNumber: 19
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "range",
                                                min: startTime,
                                                max: endTime,
                                                step: 0.01,
                                                value: loopEnd,
                                                onChange: (e)=>setLoopEnd(Number(e.target.value)),
                                                className: "w-full h-1 accent-[#b026ff]"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                lineNumber: 387,
                                                columnNumber: 19
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                        lineNumber: 385,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                lineNumber: 379,
                                columnNumber: 13
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                        lineNumber: 367,
                        columnNumber: 11
                    }, ("TURBOPACK compile-time value", void 0)),
                    (isSamplerMode || editingSampleId) && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "grid grid-cols-2 gap-2 border-t border-gray-800 pt-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "space-y-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "text-[8px] text-gray-500",
                                        children: "ROOT_NOTE"
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                        lineNumber: 397,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "text",
                                        value: rootNote,
                                        onChange: (e)=>setRootNote(e.target.value),
                                        className: "w-full bg-black border border-gray-700 text-[10px] text-white px-1"
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                        lineNumber: 398,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                lineNumber: 396,
                                columnNumber: 15
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "space-y-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "text-[8px] text-gray-500",
                                        children: "KEY_RANGE"
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                        lineNumber: 401,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex gap-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "text",
                                                value: minNote,
                                                onChange: (e)=>setMinNote(e.target.value),
                                                className: "w-1/2 bg-black border border-gray-700 text-[10px] text-white px-1"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                lineNumber: 403,
                                                columnNumber: 19
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "text",
                                                value: maxNote,
                                                onChange: (e)=>setMaxNote(e.target.value),
                                                className: "w-1/2 bg-black border border-gray-700 text-[10px] text-white px-1"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                lineNumber: 404,
                                                columnNumber: 19
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                        lineNumber: 402,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                lineNumber: 400,
                                columnNumber: 15
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "space-y-1 col-span-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "text-[8px] text-gray-500",
                                        children: [
                                            "VELOCITY_ZONE (",
                                            minVelocity.toFixed(2),
                                            "-",
                                            maxVelocity.toFixed(2),
                                            ")"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                        lineNumber: 408,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex gap-2",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "range",
                                                min: 0,
                                                max: 1,
                                                step: 0.01,
                                                value: minVelocity,
                                                onChange: (e)=>setMinVelocity(Number(e.target.value)),
                                                className: "flex-1 h-1 accent-gray-500"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                lineNumber: 410,
                                                columnNumber: 19
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "range",
                                                min: 0,
                                                max: 1,
                                                step: 0.01,
                                                value: maxVelocity,
                                                onChange: (e)=>setMaxVelocity(Number(e.target.value)),
                                                className: "flex-1 h-1 accent-gray-500"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                                lineNumber: 411,
                                                columnNumber: 19
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                        lineNumber: 409,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                lineNumber: 407,
                                columnNumber: 15
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                        lineNumber: 395,
                        columnNumber: 13
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex gap-2 pt-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: handlePlayPreview,
                                className: "flex-1 flex items-center justify-center gap-1 py-1.5 border border-[#39ff14] text-[#39ff14] text-[10px] hover:bg-[#39ff14]/10",
                                children: [
                                    isPlaying ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__["Square"], {
                                        size: 10
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                        lineNumber: 419,
                                        columnNumber: 28
                                    }, ("TURBOPACK compile-time value", void 0)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$play$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Play$3e$__["Play"], {
                                        size: 10
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                        lineNumber: 419,
                                        columnNumber: 50
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    " ",
                                    isPlaying ? 'STOP' : 'PREVIEW'
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                lineNumber: 418,
                                columnNumber: 13
                            }, ("TURBOPACK compile-time value", void 0)),
                            editingSampleId ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: handleUpdateSample,
                                className: "flex-1 bg-[#39ff14] text-black font-bold text-[10px] py-1.5",
                                children: "UPDATE_SAMPLE"
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                lineNumber: 422,
                                columnNumber: 15
                            }, ("TURBOPACK compile-time value", void 0)) : isSamplerMode ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: handleAddSample,
                                className: "flex-1 bg-[#b026ff] text-white font-bold text-[10px] py-1.5 flex items-center justify-center gap-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                                        size: 10
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                        lineNumber: 424,
                                        columnNumber: 160
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    " ADD_SAMPLE"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                lineNumber: 424,
                                columnNumber: 15
                            }, ("TURBOPACK compile-time value", void 0)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: handleAddToTrack,
                                className: "flex-1 bg-[#39ff14] text-black font-bold text-[10px] py-1.5",
                                children: "ADD_TO_TRACK"
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                                lineNumber: 426,
                                columnNumber: 15
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                        lineNumber: 417,
                        columnNumber: 11
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                lineNumber: 358,
                columnNumber: 9
            }, ("TURBOPACK compile-time value", void 0)),
            isSamplerMode && samples.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mt-4 pt-4 border-t border-[#b026ff]/30",
                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                    onClick: handleAddToTrack,
                    className: "w-full py-2 bg-[#b026ff] text-white font-bold text-xs shadow-[0_0_15px_rgba(176,38,255,0.4)] hover:shadow-[0_0_20px_rgba(176,38,255,0.6)] transition-all",
                    children: [
                        "CREATE MULTI-SAMPLER TRACK (",
                        samples.length,
                        " SAMPLES)"
                    ]
                }, void 0, true, {
                    fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                    lineNumber: 435,
                    columnNumber: 11
                }, ("TURBOPACK compile-time value", void 0))
            }, void 0, false, {
                fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
                lineNumber: 434,
                columnNumber: 9
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/Documents/DAW_Ivader/components/AudioSampler.tsx",
        lineNumber: 289,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
}),
"[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LoopLibrary",
    ()=>LoopLibrary
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$music$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Music$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/music.js [app-ssr] (ecmascript) <export default as Music>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/trash-2.js [app-ssr] (ecmascript) <export default as Trash2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$play$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Play$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/play.js [app-ssr] (ecmascript) <export default as Play>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/square.js [app-ssr] (ecmascript) <export default as Square>");
;
;
;
const FRESH_MS = 8_000; // highlight loops added within 8 seconds
const LoopLibrary = ({ loops, onDeleteLoop, onDragStart, onDragEnd })=>{
    const [playingId, setPlayingId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const audioRefs = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])({});
    const [, forceUpdate] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    // Re-render every second so the NEW badge fades correctly
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const interval = setInterval(()=>forceUpdate((n)=>n + 1), 1000);
        return ()=>clearInterval(interval);
    }, []);
    const handleDragStart = (e, loop)=>{
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/json', JSON.stringify(loop));
        onDragStart(loop);
    };
    const togglePlay = (loop)=>{
        const audio = audioRefs.current[loop.id];
        if (!audio) return;
        if (playingId === loop.id) {
            audio.pause();
            audio.currentTime = 0;
            setPlayingId(null);
        } else {
            // Stop any currently playing loop
            if (playingId && audioRefs.current[playingId]) {
                audioRefs.current[playingId].pause();
                audioRefs.current[playingId].currentTime = 0;
            }
            audio.play().catch(()=>{});
            setPlayingId(loop.id);
        }
    };
    const handleAudioEnded = (loopId)=>{
        if (playingId === loopId) setPlayingId(null);
    };
    if (loops.length === 0) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "cyber-panel p-4 bg-black/80 border border-gray-800 w-full min-w-0 max-w-full",
            children: [
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "text-xs text-[#b026ff] font-bold tracking-widest mb-3 flex items-center gap-2",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$music$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Music$3e$__["Music"], {
                            size: 14
                        }, void 0, false, {
                            fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                            lineNumber: 67,
                            columnNumber: 11
                        }, ("TURBOPACK compile-time value", void 0)),
                        " LOOP_LIBRARY"
                    ]
                }, void 0, true, {
                    fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                    lineNumber: 66,
                    columnNumber: 9
                }, ("TURBOPACK compile-time value", void 0)),
                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "text-center py-8 text-gray-600 text-sm",
                    children: [
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            children: "No loops generated yet."
                        }, void 0, false, {
                            fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                            lineNumber: 70,
                            columnNumber: 11
                        }, ("TURBOPACK compile-time value", void 0)),
                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                            className: "text-xs mt-2",
                            children: "Use the Generate button to create music loops."
                        }, void 0, false, {
                            fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                            lineNumber: 71,
                            columnNumber: 11
                        }, ("TURBOPACK compile-time value", void 0))
                    ]
                }, void 0, true, {
                    fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                    lineNumber: 69,
                    columnNumber: 9
                }, ("TURBOPACK compile-time value", void 0))
            ]
        }, void 0, true, {
            fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
            lineNumber: 65,
            columnNumber: 7
        }, ("TURBOPACK compile-time value", void 0));
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "cyber-panel p-4 bg-black/80 border border-gray-800 w-full min-w-0 max-w-full",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "text-xs text-[#b026ff] font-bold tracking-widest mb-3 flex items-center gap-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$music$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Music$3e$__["Music"], {
                        size: 14
                    }, void 0, false, {
                        fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                        lineNumber: 80,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0)),
                    " LOOP_LIBRARY",
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-gray-600 font-normal",
                        children: [
                            "(",
                            loops.length,
                            ")"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                        lineNumber: 81,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                lineNumber: 79,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-col gap-2 max-h-64 overflow-y-auto pr-1",
                children: loops.map((loop)=>{
                    const isPlaying = playingId === loop.id;
                    const isFresh = Date.now() - loop.createdAt < FRESH_MS;
                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        draggable: true,
                        onDragStart: (e)=>handleDragStart(e, loop),
                        onDragEnd: ()=>onDragEnd?.(),
                        className: `group relative bg-black/50 border p-3 cursor-move transition-all duration-200 ${isFresh ? 'border-[#39ff14] shadow-[0_0_12px_rgba(57,255,20,0.4)] bg-[#39ff14]/5' : 'border-gray-700 hover:border-[#b026ff] hover:bg-[#b026ff]/5'}`,
                        title: "Drag to add to a track",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("audio", {
                                ref: (el)=>{
                                    audioRefs.current[loop.id] = el;
                                },
                                src: loop.url,
                                onEnded: ()=>handleAudioEnded(loop.id),
                                preload: "none"
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                                lineNumber: 102,
                                columnNumber: 15
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-start justify-between gap-2",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center gap-2 min-w-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                onClick: (e)=>{
                                                    e.stopPropagation();
                                                    togglePlay(loop);
                                                },
                                                className: `shrink-0 w-7 h-7 flex items-center justify-center border transition-all ${isPlaying ? 'border-[#ff0055] text-[#ff0055] bg-[#ff0055]/10 shadow-[0_0_8px_#ff0055]' : 'border-[#39ff14] text-[#39ff14] hover:bg-[#39ff14]/10'}`,
                                                title: isPlaying ? 'Stop preview' : 'Preview loop',
                                                children: isPlaying ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__["Square"], {
                                                    size: 10,
                                                    fill: "currentColor"
                                                }, void 0, false, {
                                                    fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                                                    lineNumber: 121,
                                                    columnNumber: 34
                                                }, ("TURBOPACK compile-time value", void 0)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$play$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Play$3e$__["Play"], {
                                                    size: 10,
                                                    fill: "currentColor"
                                                }, void 0, false, {
                                                    fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                                                    lineNumber: 121,
                                                    columnNumber: 77
                                                }, ("TURBOPACK compile-time value", void 0))
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                                                lineNumber: 112,
                                                columnNumber: 19
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "min-w-0",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex items-center gap-1.5",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "text-xs font-bold text-[#39ff14] truncate",
                                                                children: loop.name
                                                            }, void 0, false, {
                                                                fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                                                                lineNumber: 126,
                                                                columnNumber: 23
                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                            isFresh && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "text-[9px] font-bold text-black bg-[#39ff14] px-1 shrink-0",
                                                                children: "NEW"
                                                            }, void 0, false, {
                                                                fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                                                                lineNumber: 128,
                                                                columnNumber: 25
                                                            }, ("TURBOPACK compile-time value", void 0))
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                                                        lineNumber: 125,
                                                        columnNumber: 21
                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: "text-[10px] text-gray-500 truncate mt-0.5",
                                                        children: loop.prompt
                                                    }, void 0, false, {
                                                        fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                                                        lineNumber: 131,
                                                        columnNumber: 21
                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                                                        className: "text-[9px] text-gray-700 mt-0.5",
                                                        children: [
                                                            loop.duration,
                                                            "s • ",
                                                            new Date(loop.createdAt).toLocaleTimeString()
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                                                        lineNumber: 132,
                                                        columnNumber: 21
                                                    }, ("TURBOPACK compile-time value", void 0))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                                                lineNumber: 124,
                                                columnNumber: 19
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                                        lineNumber: 110,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: (e)=>{
                                            e.stopPropagation();
                                            onDeleteLoop(loop.id);
                                        },
                                        className: "shrink-0 flex items-center justify-center w-6 h-6 text-gray-600 hover:text-[#ff0055] hover:bg-[#ff0055]/10 transition-colors opacity-0 group-hover:opacity-100",
                                        title: "Delete loop",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__["Trash2"], {
                                            size: 12
                                        }, void 0, false, {
                                            fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                                            lineNumber: 143,
                                            columnNumber: 19
                                        }, ("TURBOPACK compile-time value", void 0))
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                                        lineNumber: 138,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                                lineNumber: 109,
                                columnNumber: 15
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, loop.id, true, {
                        fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                        lineNumber: 89,
                        columnNumber: 13
                    }, ("TURBOPACK compile-time value", void 0));
                })
            }, void 0, false, {
                fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                lineNumber: 84,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "text-[10px] text-gray-700 mt-3",
                children: "▶ Preview • Drag loops onto tracks in the sequencer to use them"
            }, void 0, false, {
                fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
                lineNumber: 151,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx",
        lineNumber: 78,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
}),
"[externals]/path [external] (path, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("path", () => require("path"));

module.exports = mod;
}),
"[externals]/fs [external] (fs, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("fs", () => require("fs"));

module.exports = mod;
}),
"[externals]/os [external] (os, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("os", () => require("os"));

module.exports = mod;
}),
"[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "AiChatPanel",
    ()=>AiChatPanel
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f40$ai$2d$sdk$2f$react$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/node_modules/@ai-sdk/react/dist/index.mjs [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/node_modules/ai/dist/index.mjs [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$activity$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Activity$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/activity.js [app-ssr] (ecmascript) <export default as Activity>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/bot.js [app-ssr] (ecmascript) <export default as Bot>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$send$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Send$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/send.js [app-ssr] (ecmascript) <export default as Send>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/square.js [app-ssr] (ecmascript) <export default as Square>");
'use client';
;
;
;
;
;
function getMessageText(parts) {
    return parts.filter((part)=>part.type === 'text' && typeof part.text === 'string').map((part)=>part.text).join('');
}
function AiChatPanel() {
    const [input, setInput] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('');
    const { messages, sendMessage, status, stop, error } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f40$ai$2d$sdk$2f$react$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useChat"])({
        transport: new __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$ai$2f$dist$2f$index$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["DefaultChatTransport"]({
            api: '/api/chat'
        })
    });
    const isBusy = status === 'submitted' || status === 'streaming';
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
        className: "cyber-panel w-full min-w-0 shrink-0 p-3 bg-black/90 border-[#39ff14]/40",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "mb-3 flex items-center justify-between border-b border-[#39ff14]/20 pb-2",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#39ff14]",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$bot$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Bot$3e$__["Bot"], {
                                size: 14
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx",
                                lineNumber: 29,
                                columnNumber: 11
                            }, this),
                            "AI_CHAT"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx",
                        lineNumber: 28,
                        columnNumber: 9
                    }, this),
                    isBusy && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$activity$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Activity$3e$__["Activity"], {
                        size: 14,
                        className: "animate-spin text-[#b026ff]"
                    }, void 0, false, {
                        fileName: "[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx",
                        lineNumber: 32,
                        columnNumber: 20
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx",
                lineNumber: 27,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "custom-scrollbar mb-3 max-h-40 space-y-2 overflow-y-auto pr-1",
                children: messages.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                    className: "text-[11px] leading-relaxed text-gray-500",
                    children: "Ask for arrangement ideas, prompt refinements, or mix notes before generating audio."
                }, void 0, false, {
                    fileName: "[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx",
                    lineNumber: 37,
                    columnNumber: 11
                }, this) : messages.map((message)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: `border p-2 text-[11px] leading-relaxed ${message.role === 'user' ? 'border-[#b026ff]/40 bg-[#b026ff]/10 text-[#d7b2ff]' : 'border-[#39ff14]/30 bg-[#39ff14]/5 text-[#39ff14]'}`,
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "mb-1 text-[8px] uppercase tracking-widest text-gray-500",
                                children: message.role === 'user' ? 'You' : 'Assistant'
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx",
                                lineNumber: 50,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "whitespace-pre-wrap",
                                children: getMessageText(message.parts)
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx",
                                lineNumber: 53,
                                columnNumber: 15
                            }, this)
                        ]
                    }, message.id, true, {
                        fileName: "[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx",
                        lineNumber: 42,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx",
                lineNumber: 35,
                columnNumber: 7
            }, this),
            error && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                className: "mb-2 text-[10px] text-[#ff0055]",
                children: error.message
            }, void 0, false, {
                fileName: "[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx",
                lineNumber: 59,
                columnNumber: 17
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("form", {
                className: "flex gap-2",
                onSubmit: (event)=>{
                    event.preventDefault();
                    const trimmed = input.trim();
                    if (!trimmed || isBusy) return;
                    void sendMessage({
                        text: trimmed
                    });
                    setInput('');
                },
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                        value: input,
                        onChange: (event)=>setInput(event.target.value),
                        disabled: isBusy,
                        placeholder: "Ask the producer daemon...",
                        className: "min-w-0 flex-1 border border-gray-800 bg-black/60 px-3 py-2 text-[11px] text-[#39ff14] placeholder-gray-700 outline-none focus:border-[#39ff14]"
                    }, void 0, false, {
                        fileName: "[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx",
                        lineNumber: 71,
                        columnNumber: 9
                    }, this),
                    isBusy ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "button",
                        onClick: ()=>stop(),
                        className: "border border-[#ff0055] px-3 text-[#ff0055] hover:bg-[#ff0055] hover:text-black",
                        "aria-label": "Stop AI response",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__["Square"], {
                            size: 14
                        }, void 0, false, {
                            fileName: "[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx",
                            lineNumber: 85,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx",
                        lineNumber: 79,
                        columnNumber: 11
                    }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                        type: "submit",
                        disabled: !input.trim(),
                        className: "border border-[#39ff14] px-3 text-[#39ff14] hover:bg-[#39ff14] hover:text-black disabled:cursor-not-allowed disabled:opacity-40",
                        "aria-label": "Send chat message",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$send$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Send$3e$__["Send"], {
                            size: 14
                        }, void 0, false, {
                            fileName: "[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx",
                            lineNumber: 94,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx",
                        lineNumber: 88,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx",
                lineNumber: 61,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx",
        lineNumber: 26,
        columnNumber: 5
    }, this);
}
}),
"[project]/Documents/DAW_Ivader/App.tsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f40$clerk$2f$react$2f$dist$2f$chunk$2d$JI6JEZDU$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/node_modules/@clerk/react/dist/chunk-JI6JEZDU.mjs [app-ssr] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$play$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Play$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/play.js [app-ssr] (ecmascript) <export default as Play>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/square.js [app-ssr] (ecmascript) <export default as Square>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$wand$2d$sparkles$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Wand2$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/wand-sparkles.js [app-ssr] (ecmascript) <export default as Wand2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$activity$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Activity$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/activity.js [app-ssr] (ecmascript) <export default as Activity>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$zap$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Zap$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/zap.js [app-ssr] (ecmascript) <export default as Zap>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$cpu$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Cpu$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/cpu.js [app-ssr] (ecmascript) <export default as Cpu>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sliders$2d$vertical$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sliders$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/sliders-vertical.js [app-ssr] (ecmascript) <export default as Sliders>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pause$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Pause$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/pause.js [app-ssr] (ecmascript) <export default as Pause>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/plus.js [app-ssr] (ecmascript) <export default as Plus>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/trash-2.js [app-ssr] (ecmascript) <export default as Trash2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$copy$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Copy$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/copy.js [app-ssr] (ecmascript) <export default as Copy>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$music$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Music$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/lucide-react@0.577.0_react@19.2.4/node_modules/lucide-react/dist/esm/icons/music.js [app-ssr] (ecmascript) <export default as Music>");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/services/audioEngine.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$textToAudioService$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/services/textToAudioService.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$createGeneratedAudioTrack$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/lib/createGeneratedAudioTrack.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$storageService$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/services/storageService.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$hooks$2f$useUndoRedo$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/hooks/useUndoRedo.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/lib/result.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/lib/songMutations.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/types.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$schemas$2f$generateAudioSchema$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/schemas/generateAudioSchema.ts [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$Visualizer$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/components/Visualizer.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$Sequencer$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/components/Sequencer.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$Knob$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/components/Knob.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$AudioSampler$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/components/AudioSampler.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$LoopLibrary$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/components/LoopLibrary.tsx [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$AiChatPanel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/Documents/DAW_Ivader/components/AiChatPanel.tsx [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
;
function nextTrackId() {
    return 't' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}
function nextLoopId() {
    return 'loop_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}
/** Default steps per pattern and swing for new songs. */ const DEFAULT_STEPS_PER_PATTERN = 16;
const DEFAULT_SWING = 0;
// Default initial state - tracks start with no notes so nothing plays automatically on startup
const INITIAL_SONG = {
    title: "INIT_SEQUENCE_01",
    bpm: 128,
    stepsPerPattern: DEFAULT_STEPS_PER_PATTERN,
    swing: DEFAULT_SWING,
    tracks: [
        {
            id: "t1",
            name: "LEAD",
            type: "synth",
            notes: [],
            params: {
                waveform: "sawtooth",
                attack: 0.01,
                decay: 0.1,
                sustain: 0.5,
                release: 0.2,
                filterCutoff: 2000,
                filterRes: 1,
                gain: 0.4
            },
            muted: false,
            solo: false,
            volume: 1,
            pan: 0
        },
        {
            id: "t2",
            name: "BASS",
            type: "bass",
            notes: [],
            params: {
                waveform: "square",
                attack: 0.01,
                decay: 0.2,
                sustain: 0.8,
                release: 0.1,
                filterCutoff: 400,
                filterRes: 5,
                gain: 0.6
            },
            muted: false,
            solo: false,
            volume: 1,
            pan: 0
        },
        {
            id: "t3",
            name: "KICK",
            type: "drums",
            notes: [],
            params: {
                waveform: "sine",
                attack: 0,
                decay: 0.1,
                sustain: 0,
                release: 0,
                filterCutoff: 1000,
                filterRes: 0,
                gain: 1
            },
            muted: false,
            solo: false,
            volume: 1,
            pan: 0
        }
    ]
};
const App = ()=>{
    const { state: song, setState: setSong, undo, redo, canUndo, canRedo } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$hooks$2f$useUndoRedo$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useUndoRedo"])(INITIAL_SONG);
    const [playState, setPlayState] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PlayState"].STOPPED);
    const [currentStep, setCurrentStep] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(-1);
    const [cancelStep, setCancelStep] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [selectedStep, setSelectedStep] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [prompt, setPrompt] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('');
    const [generationBackend, setGenerationBackend] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$schemas$2f$generateAudioSchema$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AUDIO_GENERATION_BACKEND_DEFAULT"]);
    const [modelVersion, setModelVersion] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$schemas$2f$generateAudioSchema$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["STABLE_AUDIO_MODEL_VERSION_DEFAULT"]);
    const [generationDuration, setGenerationDuration] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(15);
    const [generationSteps, setGenerationSteps] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(8);
    const [generationCfgScale, setGenerationCfgScale] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(7);
    const [isGenerating, setIsGenerating] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [selectedTrackId, setSelectedTrackId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(INITIAL_SONG.tracks[0].id);
    const [initialized, setInitialized] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [masterVolume, setMasterVolume] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["audioEngine"].getMasterVolume());
    const [metronomeOn, setMetronomeOn] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [draggedTrackId, setDraggedTrackId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [dropTargetTrackId, setDropTargetTrackId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [loops, setLoops] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(()=>{
        try {
            const saved = localStorage.getItem('daw_music_loops');
            return saved ? JSON.parse(saved) : [];
        } catch  {
            return [];
        }
    });
    const [draggedLoop, setDraggedLoop] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    const [samplerPreload, setSamplerPreload] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["audioEngine"].setSongData(song);
    }, [
        song
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["audioEngine"].setMasterVolume(masterVolume);
    }, [
        masterVolume
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["audioEngine"].setMetronomeEnabled(metronomeOn);
    }, [
        metronomeOn
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        try {
            localStorage.setItem('daw_music_loops', JSON.stringify(loops));
        } catch (e) {
            console.error('Failed to save loops to localStorage:', e);
        }
    }, [
        loops
    ]);
    // Handle Playback Loop Visualization
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["audioEngine"].setOnStepCallback((step)=>{
            setCurrentStep(step);
        });
    }, []);
    const handleInit = async ()=>{
        await __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["audioEngine"].init();
        setInitialized(true);
    };
    const handlePlay = async ()=>{
        if (!initialized) await handleInit();
        await __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["audioEngine"].start();
        setPlayState(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PlayState"].PLAYING);
    };
    const handlePause = async ()=>{
        if (!initialized) return;
        await __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["audioEngine"].pause();
        setPlayState(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PlayState"].PAUSED);
    };
    const handleStop = ()=>{
        if (!initialized) return;
        __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["audioEngine"].stop();
        setPlayState(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PlayState"].STOPPED);
        // Update cancel mark to the position saved by the engine (or 0 after double-stop)
        setCancelStep(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["audioEngine"].getCancelStep());
    // currentStep is updated via onStepCallback; no manual override needed
    };
    const handleGenerate = async ()=>{
        if (!prompt.trim()) return;
        setIsGenerating(true);
        handleStop();
        __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["audioEngine"].resetToStart();
        setCancelStep(0);
        // Use the selected Stable Audio model and parameters for generation
        const result = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$textToAudioService$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["generateAudioFromText"])(prompt, generationDuration, modelVersion, {
            backend: generationBackend,
            steps: generationSteps,
            cfg_scale: generationCfgScale
        });
        if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isErr"])(result)) {
            alert(`Generate audio failed: ${result.error.message}`);
            setIsGenerating(false);
            return;
        }
        const newLoop = {
            id: nextLoopId(),
            name: `Loop ${loops.length + 1}`,
            url: result.value.url,
            duration: generationDuration,
            prompt: prompt.trim(),
            createdAt: Date.now()
        };
        setLoops((prev)=>[
                ...prev,
                newLoop
            ]);
        setSamplerPreload({
            url: result.value.url,
            name: newLoop.name
        });
        setPrompt('');
        setIsGenerating(false);
    };
    const handleAudioSamplerLoaded = (audioUrl, name, trimStart, trimEnd)=>{
        // Create a new loop from the sampled audio and add it to the library
        const newLoop = {
            id: nextLoopId(),
            name: name || 'Sample',
            url: audioUrl,
            duration: trimEnd !== undefined && trimStart !== undefined ? trimEnd - trimStart : 8,
            prompt: 'Uploaded/recorded audio sample',
            createdAt: Date.now(),
            trimStart,
            trimEnd
        };
        setLoops((prev)=>[
                ...prev,
                newLoop
            ]);
    };
    const handleSamplerLoaded = (samples, name)=>{
        const newTrack = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createEmptySamplerTrack"])(nextTrackId(), name);
        newTrack.samples = samples;
        setSong((prev)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["addTrack"])(prev, newTrack));
        setSelectedTrackId(newTrack.id);
    };
    const handleDeleteLoop = (loopId)=>{
        setLoops((prev)=>prev.filter((l)=>l.id !== loopId));
    };
    const handleLoopDragStart = (loop)=>{
        setDraggedLoop(loop);
    };
    const handleLoopDrop = (e, trackId)=>{
        e.preventDefault();
        e.stopPropagation();
        try {
            const data = e.dataTransfer.getData('application/json');
            const loop = JSON.parse(data);
            // Create a new audio track from the dropped loop
            const newTrack = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$createGeneratedAudioTrack$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createGeneratedAudioTrack"])(loop.url, {
                id: nextTrackId(),
                name: loop.name
            });
            // Add trim information if provided in the loop
            if (loop.trimStart !== undefined) {
                newTrack.audioTrimStart = loop.trimStart;
            }
            if (loop.trimEnd !== undefined) {
                newTrack.audioTrimEnd = loop.trimEnd;
            }
            // Replace the target track with the new audio track
            const trackIndex = song.tracks.findIndex((t)=>t.id === trackId);
            if (trackIndex === -1) {
                console.error('Track not found for drop operation:', trackId);
                return;
            }
            const newTracks = [
                ...song.tracks
            ];
            newTracks[trackIndex] = newTrack;
            setSong((prev)=>({
                    ...prev,
                    tracks: newTracks
                }));
            setSelectedTrackId(newTrack.id);
        } catch (err) {
            console.error('Failed to handle loop drop:', err);
        }
        setDraggedLoop(null);
        setDropTargetTrackId(null);
    };
    const handleLoopDragOver = (e)=>{
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };
    const updateTrackParam = (trackId, param, value)=>{
        const next = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["updateTrackParam"])(song, trackId, param, value);
        if (!next) return;
        setSong(()=>next);
        const trackIndex = song.tracks.findIndex((t)=>t.id === trackId);
        if (trackIndex !== -1) __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["audioEngine"].updateTrackParams(trackIndex, next.tracks[trackIndex].params);
    };
    const handleStepToggle = (trackId, step)=>{
        const next = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["toggleStep"])(song, trackId, step);
        if (next) setSong(()=>next);
    };
    const setTrackMuted = (trackId, muted)=>{
        const next = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["setTrackMuted"])(song, trackId, muted);
        if (next) setSong(()=>next);
    };
    const setTrackSolo = (trackId, solo)=>{
        const next = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["setTrackSolo"])(song, trackId, solo);
        if (next) setSong(()=>next);
    };
    const setTrackVolume = (trackId, volume)=>{
        const next = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["setTrackVolume"])(song, trackId, volume);
        if (next) setSong(()=>next);
    };
    const setTrackPan = (trackId, pan)=>{
        const next = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["setTrackPan"])(song, trackId, pan);
        if (next) setSong(()=>next);
    };
    const setBpm = (bpm)=>{
        setSong((prev)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["setBpm"])(prev, bpm));
    };
    const addTrack = ()=>{
        const newTrack = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["createEmptySynthTrack"])(nextTrackId(), 'NEW');
        setSong((prev)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["addTrack"])(prev, newTrack));
        setSelectedTrackId(newTrack.id);
    };
    const removeTrack = (trackId)=>{
        const next = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["removeTrack"])(song, trackId);
        if (!next) return;
        setSong(()=>next);
        if (selectedTrackId === trackId) setSelectedTrackId(next.tracks[0].id);
    };
    const duplicateTrack = (trackId)=>{
        const newId = nextTrackId();
        const next = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["duplicateTrack"])(song, trackId, newId, ' COPY');
        if (!next) return;
        setSong(()=>next);
        setSelectedTrackId(newId);
    };
    const moveTrack = (trackId, direction)=>{
        const next = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["moveTrack"])(song, trackId, direction);
        if (next) setSong(()=>next);
    };
    const handleDragStart = (e, trackId)=>{
        setDraggedTrackId(trackId);
        e.dataTransfer.effectAllowed = 'move';
    };
    const handleDragOver = (e, trackId)=>{
        e.preventDefault();
        if (draggedLoop) {
            e.dataTransfer.dropEffect = 'copy';
            setDropTargetTrackId(trackId);
        } else if (draggedTrackId && draggedTrackId !== trackId) {
            e.dataTransfer.dropEffect = 'move';
            setDropTargetTrackId(trackId);
        } else {
            setDropTargetTrackId(null);
        }
    };
    const handleDragLeave = ()=>{
        setDropTargetTrackId(null);
    };
    const handleDrop = (e, targetTrackId)=>{
        e.preventDefault();
        // Check if this is a loop drop by trying to get loop data
        try {
            const loopData = e.dataTransfer.getData('application/json');
            if (loopData) {
                const loop = JSON.parse(loopData);
                // If it has loop properties, treat it as a loop drop
                if (loop.url && loop.name) {
                    handleLoopDrop(e, targetTrackId);
                    return;
                }
            }
        } catch  {
        // Not a loop drop, continue with track reordering
        }
        // Handle track reordering
        if (!draggedTrackId || draggedTrackId === targetTrackId) {
            setDraggedTrackId(null);
            setDropTargetTrackId(null);
            return;
        }
        const draggedIndex = song.tracks.findIndex((t)=>t.id === draggedTrackId);
        const targetIndex = song.tracks.findIndex((t)=>t.id === targetTrackId);
        if (draggedIndex === -1 || targetIndex === -1) {
            setDraggedTrackId(null);
            setDropTargetTrackId(null);
            return;
        }
        const newTracks = [
            ...song.tracks
        ];
        const [draggedTrack] = newTracks.splice(draggedIndex, 1);
        newTracks.splice(targetIndex, 0, draggedTrack);
        setSong((prev)=>({
                ...prev,
                tracks: newTracks
            }));
        setDraggedTrackId(null);
        setDropTargetTrackId(null);
    };
    const handleDragEnd = ()=>{
        setDraggedTrackId(null);
        setDropTargetTrackId(null);
        setDraggedLoop(null);
    };
    const handleSave = ()=>{
        const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$storageService$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["saveSong"])(song);
        if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isErr"])(result)) alert(result.error.message);
        else alert('Saved.');
    };
    const handleLoad = ()=>{
        handleStop();
        __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["audioEngine"].resetToStart();
        setCancelStep(0);
        const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$storageService$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["loadSong"])();
        if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isErr"])(result)) alert(result.error.message);
        else setSong(result.value);
    };
    const handleExport = ()=>{
        const blob = new Blob([
            (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$storageService$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["exportSongToJson"])(song)
        ], {
            type: 'application/json'
        });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (song.title || 'doom-daw') + '.json';
        a.click();
        URL.revokeObjectURL(a.href);
    };
    const handleImport = ()=>{
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = ()=>{
            const file = (input.files ?? [])[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = ()=>{
                const text = reader.result;
                const result = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$storageService$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["importSongFromJson"])(text);
                if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$result$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["isErr"])(result)) alert(result.error.message);
                else {
                    handleStop();
                    __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["audioEngine"].resetToStart();
                    setCancelStep(0);
                    setSong(result.value);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        const onKeyDown = (e)=>{
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.code === 'Space') {
                e.preventDefault();
                if (playState === __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PlayState"].PLAYING) void handlePause();
                else void handlePlay();
            }
            if (e.code === 'KeyS') {
                e.preventDefault();
                handleStop();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return ()=>window.removeEventListener('keydown', onKeyDown);
    }, [
        playState
    ]);
    const handleTriggerNote = async ()=>{
        if (!selectedTrack) return;
        if (!initialized) await handleInit();
        // Find if there is a note defined at the selected step
        const noteAtStep = selectedTrack.notes.find((n)=>selectedStep >= n.startStep && selectedStep < n.startStep + n.durationSteps);
        let noteToPlay = 'C4';
        // Defaults based on type
        if (selectedTrack.type === 'bass') noteToPlay = 'C2';
        if (selectedTrack.type === 'drums') noteToPlay = 'kick';
        // Override with actual note if exists
        if (noteAtStep) {
            noteToPlay = noteAtStep.note;
        }
        __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["audioEngine"].triggerNote(selectedTrack, noteToPlay);
    };
    const selectedTrack = song.tracks.find((t)=>t.id === selectedTrackId);
    if (!initialized) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "min-h-[100dvh] box-border flex flex-col items-center justify-center relative overflow-hidden z-10 p-4 sm:p-6 pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))]",
            children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "cyber-panel p-6 sm:p-8 md:p-12 text-center max-w-2xl w-full min-w-0 relative overflow-hidden group cursor-pointer",
                onClick: handleInit,
                "data-testid": "splash-panel",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "absolute top-0 left-0 w-full h-1 bg-[#39ff14] opacity-50"
                    }, void 0, false, {
                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                        lineNumber: 522,
                        columnNumber: 11
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "absolute bottom-0 right-0 w-full h-1 bg-[#39ff14] opacity-50"
                    }, void 0, false, {
                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                        lineNumber: 523,
                        columnNumber: 11
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h1", {
                        className: "text-4xl sm:text-6xl md:text-8xl font-bold font-mono neon-text-green tracking-tighter mb-3 sm:mb-4 glitch break-words",
                        "data-text": "DOOM DAW",
                        children: "DOOM DAW"
                    }, void 0, false, {
                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                        lineNumber: 525,
                        columnNumber: 11
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("p", {
                        className: "text-base sm:text-xl md:text-2xl text-[#b026ff] neon-text-purple tracking-[0.2em] sm:tracking-[0.5em] mb-8 sm:mb-12",
                        children: "IRKEN AUDIO LABS"
                    }, void 0, false, {
                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                        lineNumber: 531,
                        columnNumber: 11
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "relative inline-block",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "absolute inset-0 bg-[#39ff14] blur-xl opacity-20 group-hover:opacity-40 transition-opacity"
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                lineNumber: 534,
                                columnNumber: 14
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                type: "button",
                                className: "relative bg-black border-2 border-[#39ff14] text-[#39ff14] w-full max-w-sm px-6 sm:px-10 py-3 sm:py-4 uppercase tracking-widest text-base sm:text-lg hover:bg-[#39ff14] hover:text-black transition-all duration-200 font-bold clip-slant-left touch-manipulation",
                                "data-testid": "init-button",
                                children: "[ Initialize System ]"
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                lineNumber: 535,
                                columnNumber: 14
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                        lineNumber: 533,
                        columnNumber: 11
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-8 text-xs text-gray-500 font-mono",
                        children: "v9.4.2 // NEURAL LINK: STANDBY // TOUCH TO START"
                    }, void 0, false, {
                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                        lineNumber: 540,
                        columnNumber: 11
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                lineNumber: 521,
                columnNumber: 9
            }, ("TURBOPACK compile-time value", void 0))
        }, void 0, false, {
            fileName: "[project]/Documents/DAW_Ivader/App.tsx",
            lineNumber: 520,
            columnNumber: 7
        }, ("TURBOPACK compile-time value", void 0));
    }
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "min-h-[100dvh] max-h-[100dvh] box-border p-2 sm:p-4 lg:p-6 pl-[max(0.5rem,env(safe-area-inset-left,0px))] pr-[max(0.5rem,env(safe-area-inset-right,0px))] pt-[max(0.5rem,env(safe-area-inset-top,0px))] pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] relative z-10 flex flex-col overflow-hidden w-full min-w-0",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "max-w-[1400px] w-full min-w-0 mx-auto mb-3 sm:mb-4 lg:mb-6 flex flex-col xl:flex-row gap-3 sm:gap-4 lg:gap-6 items-stretch shrink-0",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "cyber-panel flex-1 min-w-0 flex flex-col p-1",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center justify-between px-2 py-1 bg-[#39ff14]/10 mb-1",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "text-[10px] text-[#39ff14] font-bold tracking-widest flex items-center gap-2",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$cpu$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Cpu$3e$__["Cpu"], {
                                                size: 12
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 556,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            " /// COMMAND_INPUT"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 555,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex gap-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "w-2 h-2 bg-[#ff0055] rounded-full animate-pulse"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 559,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "w-2 h-2 bg-[#39ff14] rounded-full"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 560,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 558,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                lineNumber: 554,
                                columnNumber: 13
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex flex-wrap lg:flex-nowrap gap-2 p-2 items-end w-full min-w-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-col gap-1 shrink-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                className: "text-[9px] text-gray-500 uppercase tracking-widest ml-1",
                                                children: "BACKEND"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 566,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex gap-1",
                                                children: __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$schemas$2f$generateAudioSchema$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AUDIO_GENERATION_BACKENDS"].map((backend)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>setGenerationBackend(backend),
                                                        className: `px-2 py-1 text-[9px] font-bold border transition-all ${generationBackend === backend ? 'bg-[#39ff14] border-[#39ff14] text-black shadow-[0_0_10px_rgba(57,255,20,0.5)]' : 'border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-400 bg-black/30'}`,
                                                        type: "button",
                                                        children: backend.toUpperCase()
                                                    }, backend, false, {
                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                        lineNumber: 569,
                                                        columnNumber: 29
                                                    }, ("TURBOPACK compile-time value", void 0)))
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 567,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 565,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "hidden lg:block w-px h-8 bg-gray-800 mx-1 mb-1"
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 585,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-col gap-1 shrink-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                className: "text-[9px] text-gray-500 uppercase tracking-widest ml-1",
                                                children: "AI_MODE"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 588,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex gap-1",
                                                children: __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$schemas$2f$generateAudioSchema$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["STABLE_AUDIO_MODEL_VERSIONS"].map((v)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: ()=>setModelVersion(v),
                                                        disabled: generationBackend === 'comfyui',
                                                        className: `px-2 py-1 text-[9px] font-bold border transition-all ${modelVersion === v && generationBackend === 'replicate' ? 'bg-[#b026ff] border-[#b026ff] text-white shadow-[0_0_10px_rgba(176,38,255,0.5)]' : 'border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-400 bg-black/30 disabled:cursor-not-allowed disabled:opacity-40'}`,
                                                        type: "button",
                                                        children: v.replace('stable-audio-', '').toUpperCase()
                                                    }, v, false, {
                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                        lineNumber: 591,
                                                        columnNumber: 29
                                                    }, ("TURBOPACK compile-time value", void 0)))
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 589,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 587,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "hidden lg:block w-px h-8 bg-gray-800 mx-1 mb-1"
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 608,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-wrap gap-2 shrink-0",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex flex-col gap-1",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                        className: "text-[9px] text-gray-500 uppercase tracking-widest ml-1",
                                                        children: "LENGTH"
                                                    }, void 0, false, {
                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                        lineNumber: 612,
                                                        columnNumber: 25
                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex items-center gap-2 bg-black/30 border border-gray-800 px-2 py-1 h-[26px]",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                type: "range",
                                                                min: 1,
                                                                max: 45,
                                                                value: generationDuration,
                                                                onChange: (e)=>setGenerationDuration(Number(e.target.value)),
                                                                className: "w-16 h-1 accent-[#39ff14]",
                                                                "aria-label": "Generation length in seconds"
                                                            }, void 0, false, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 614,
                                                                columnNumber: 29
                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "text-[10px] font-mono text-[#39ff14] w-6",
                                                                children: [
                                                                    generationDuration,
                                                                    "s"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 623,
                                                                columnNumber: 29
                                                            }, ("TURBOPACK compile-time value", void 0))
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                        lineNumber: 613,
                                                        columnNumber: 25
                                                    }, ("TURBOPACK compile-time value", void 0))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 611,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex flex-col gap-1",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                        className: "text-[9px] text-gray-500 uppercase tracking-widest ml-1",
                                                        children: "STEPS"
                                                    }, void 0, false, {
                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                        lineNumber: 628,
                                                        columnNumber: 25
                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex items-center gap-2 bg-black/30 border border-gray-800 px-2 py-1 h-[26px]",
                                                        title: "Model limit: 8 steps max",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                type: "range",
                                                                min: 4,
                                                                max: 8,
                                                                value: generationSteps,
                                                                onChange: (e)=>setGenerationSteps(Number(e.target.value)),
                                                                className: "w-16 h-1 accent-[#b026ff]",
                                                                "aria-label": "Generation steps"
                                                            }, void 0, false, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 630,
                                                                columnNumber: 29
                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "text-[10px] font-mono text-[#b026ff] w-4",
                                                                children: generationSteps
                                                            }, void 0, false, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 639,
                                                                columnNumber: 29
                                                            }, ("TURBOPACK compile-time value", void 0))
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                        lineNumber: 629,
                                                        columnNumber: 25
                                                    }, ("TURBOPACK compile-time value", void 0))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 627,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex flex-col gap-1",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                        className: "text-[9px] text-gray-500 uppercase tracking-widest ml-1",
                                                        children: "CREATIVITY"
                                                    }, void 0, false, {
                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                        lineNumber: 644,
                                                        columnNumber: 25
                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex items-center gap-2 bg-black/30 border border-gray-800 px-2 py-1 h-[26px]",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                type: "range",
                                                                min: 1,
                                                                max: 20,
                                                                step: 0.5,
                                                                value: generationCfgScale,
                                                                onChange: (e)=>setGenerationCfgScale(Number(e.target.value)),
                                                                className: "w-16 h-1 accent-[#ff0055]",
                                                                "aria-label": "Generation creativity"
                                                            }, void 0, false, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 646,
                                                                columnNumber: 29
                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "text-[10px] font-mono text-[#ff0055] w-4",
                                                                children: generationCfgScale
                                                            }, void 0, false, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 656,
                                                                columnNumber: 29
                                                            }, ("TURBOPACK compile-time value", void 0))
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                        lineNumber: 645,
                                                        columnNumber: 25
                                                    }, ("TURBOPACK compile-time value", void 0))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 643,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 610,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "hidden lg:block w-px h-8 bg-gray-800 mx-1 mb-1"
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 661,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex-1 min-w-0 w-full sm:min-w-[12rem] flex flex-col gap-1 basis-full sm:basis-auto",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                                className: "text-[9px] text-gray-500 uppercase tracking-widest ml-1",
                                                children: "PROMPT_SEQUENCE"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 664,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "text",
                                                value: prompt,
                                                onChange: (e)=>setPrompt(e.target.value),
                                                placeholder: "Enter description (e.g. 'Epic cinematic orchestral...') ...",
                                                "data-testid": "generate-prompt-input",
                                                className: "bg-black/50 border border-gray-800 w-full min-w-0 text-base md:text-lg font-mono text-[#39ff14] placeholder-gray-700 px-3 sm:px-4 py-2 focus:border-[#39ff14] focus:outline-none transition-colors",
                                                onKeyDown: (e)=>e.key === 'Enter' && handleGenerate()
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 665,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 663,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: handleGenerate,
                                        disabled: isGenerating,
                                        className: "bg-[#39ff14] text-black font-bold w-full sm:w-auto min-h-[44px] px-6 py-2 h-auto sm:h-[46px] justify-center hover:bg-[#b026ff] hover:text-white transition-all duration-200 uppercase disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 clip-slant-right shadow-[0_0_15px_rgba(57,255,20,0.4)] hover:shadow-[0_0_20px_rgba(176,38,255,0.6)] shrink-0 touch-manipulation basis-full sm:basis-auto",
                                        children: [
                                            isGenerating ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$activity$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Activity$3e$__["Activity"], {
                                                className: "animate-spin"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 681,
                                                columnNumber: 37
                                            }, ("TURBOPACK compile-time value", void 0)) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$wand$2d$sparkles$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Wand2$3e$__["Wand2"], {
                                                size: 18
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 681,
                                                columnNumber: 77
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            isGenerating ? "PROCESSING..." : "GENERATE"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 676,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                lineNumber: 564,
                                columnNumber: 13
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                        lineNumber: 553,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "cyber-panel flex flex-col gap-3 p-3 sm:p-4 sm:px-6 w-full min-w-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center xl:justify-between bg-black/80 xl:shrink-0",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center justify-center sm:justify-start gap-2 w-full min-w-0 sm:w-auto",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-[9px] text-gray-500 uppercase tracking-widest",
                                        children: "PILOT"
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 689,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f40$clerk$2f$react$2f$dist$2f$chunk$2d$JI6JEZDU$2e$mjs__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$locals$3e$__["UserButton"], {}, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 690,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                lineNumber: 688,
                                columnNumber: 13
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "hidden h-10 w-px bg-gray-700 sm:block",
                                "aria-hidden": true
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                lineNumber: 692,
                                columnNumber: 13
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex flex-wrap items-center justify-center gap-3 w-full min-w-0 sm:w-auto",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-center",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "text-[10px] text-[#b026ff] tracking-widest mb-1",
                                                children: "BPM"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 695,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "number",
                                                min: 1,
                                                max: 999,
                                                value: song.bpm,
                                                onChange: (e)=>setBpm(Number(e.target.value)),
                                                className: "w-14 bg-black border border-[#b026ff] text-[#b026ff] text-xl font-bold font-mono text-center focus:outline-none focus:ring-1 focus:ring-[#b026ff]",
                                                "aria-label": "Beats per minute"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 696,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 694,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex flex-col items-center",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "text-[9px] text-gray-500 mb-0.5",
                                                children: "MASTER"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 707,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "range",
                                                min: 0,
                                                max: 100,
                                                value: masterVolume * 100,
                                                onChange: (e)=>setMasterVolume(Number(e.target.value) / 100),
                                                className: "w-16 h-2 accent-[#39ff14]",
                                                "aria-label": "Master volume"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 708,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 706,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "flex items-center gap-1.5 cursor-pointer",
                                        title: "Metronome",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$music$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Music$3e$__["Music"], {
                                                size: 14,
                                                className: "text-gray-500"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 719,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                type: "checkbox",
                                                checked: metronomeOn,
                                                onChange: (e)=>setMetronomeOn(e.target.checked),
                                                className: "accent-[#b026ff]"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 720,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-[9px] text-gray-500",
                                                children: "CLICK"
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 726,
                                                columnNumber: 21
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 718,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                lineNumber: 693,
                                columnNumber: 13
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "hidden h-10 w-px bg-gray-700 sm:block",
                                "aria-hidden": true
                            }, void 0, false, {
                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                lineNumber: 729,
                                columnNumber: 13
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex gap-2 justify-center w-full min-w-0 sm:w-auto",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: handleStop,
                                        className: "w-12 h-12 min-w-[48px] min-h-[48px] flex items-center justify-center border-2 border-[#ff0055] text-[#ff0055] bg-black hover:bg-[#ff0055] hover:text-black transition-all duration-150 group touch-manipulation",
                                        title: "STOP",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$square$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Square$3e$__["Square"], {
                                            fill: "currentColor",
                                            size: 16
                                        }, void 0, false, {
                                            fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                            lineNumber: 737,
                                            columnNumber: 21
                                        }, ("TURBOPACK compile-time value", void 0))
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 732,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: handlePlay,
                                        className: `w-12 h-12 min-w-[48px] min-h-[48px] flex items-center justify-center border-2 transition-all duration-150 touch-manipulation ${playState === __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PlayState"].PLAYING ? 'border-[#39ff14] bg-[#39ff14] text-black shadow-[0_0_15px_#39ff14]' : 'border-[#39ff14] text-[#39ff14] hover:bg-[#39ff14] hover:text-black'}`,
                                        title: "PLAY",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$play$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Play$3e$__["Play"], {
                                            fill: "currentColor",
                                            size: 16,
                                            className: "ml-1"
                                        }, void 0, false, {
                                            fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                            lineNumber: 746,
                                            columnNumber: 21
                                        }, ("TURBOPACK compile-time value", void 0))
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 741,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: handlePause,
                                        className: `w-12 h-12 min-w-[48px] min-h-[48px] flex items-center justify-center border-2 transition-all duration-150 touch-manipulation ${playState === __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$types$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PlayState"].PAUSED ? 'border-[#b026ff] bg-[#b026ff] text-black shadow-[0_0_15px_#b026ff]' : 'border-[#b026ff] text-[#b026ff] hover:bg-[#b026ff] hover:text-black'}`,
                                        title: "PAUSE",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pause$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Pause$3e$__["Pause"], {
                                            fill: "currentColor",
                                            size: 16
                                        }, void 0, false, {
                                            fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                            lineNumber: 755,
                                            columnNumber: 21
                                        }, ("TURBOPACK compile-time value", void 0))
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 750,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                lineNumber: 730,
                                columnNumber: 13
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex items-center justify-center gap-1 text-[9px] sm:text-[10px] flex-wrap w-full min-w-0 sm:w-auto py-1 border-t border-gray-800/60 sm:border-t-0 sm:py-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: undo,
                                        disabled: !canUndo,
                                        className: "px-2 py-1.5 sm:py-1 border border-gray-600 text-gray-400 hover:border-[#39ff14] hover:text-[#39ff14] disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation min-h-[40px] sm:min-h-0",
                                        title: "Undo",
                                        children: "UNDO"
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 759,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: redo,
                                        disabled: !canRedo,
                                        className: "px-2 py-1.5 sm:py-1 border border-gray-600 text-gray-400 hover:border-[#39ff14] hover:text-[#39ff14] disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation min-h-[40px] sm:min-h-0",
                                        title: "Redo",
                                        children: "REDO"
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 760,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "w-px h-4 bg-gray-600 mx-1 self-center",
                                        "aria-hidden": true
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 761,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: handleSave,
                                        className: "px-2 py-1.5 sm:py-1 border border-gray-600 text-gray-400 hover:border-[#39ff14] hover:text-[#39ff14] touch-manipulation min-h-[40px] sm:min-h-0",
                                        title: "Save to browser",
                                        children: "SAVE"
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 762,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: handleLoad,
                                        className: "px-2 py-1.5 sm:py-1 border border-gray-600 text-gray-400 hover:border-[#39ff14] hover:text-[#39ff14] touch-manipulation min-h-[40px] sm:min-h-0",
                                        title: "Load from browser",
                                        children: "LOAD"
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 763,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: handleExport,
                                        className: "px-2 py-1.5 sm:py-1 border border-gray-600 text-gray-400 hover:border-[#39ff14] hover:text-[#39ff14] touch-manipulation min-h-[40px] sm:min-h-0",
                                        title: "Export JSON",
                                        children: "EXPORT"
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 764,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        onClick: handleImport,
                                        className: "px-2 py-1.5 sm:py-1 border border-gray-600 text-gray-400 hover:border-[#39ff14] hover:text-[#39ff14] touch-manipulation min-h-[40px] sm:min-h-0",
                                        title: "Import JSON",
                                        children: "IMPORT"
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 765,
                                        columnNumber: 17
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                lineNumber: 758,
                                columnNumber: 13
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                        lineNumber: 687,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                lineNumber: 552,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "max-w-[1400px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "lg:col-span-7 xl:col-span-8 flex flex-col gap-4 lg:gap-6 min-h-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "cyber-panel p-1 shrink-0 bg-black/90",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$Visualizer$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Visualizer"], {}, void 0, false, {
                                            fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                            lineNumber: 776,
                                            columnNumber: 17
                                        }, ("TURBOPACK compile-time value", void 0))
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 775,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "cyber-panel flex-1 p-3 lg:p-4 relative overflow-y-auto flex flex-col bg-black/80 min-h-[240px] sm:min-h-[350px]",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 border-b border-gray-800 pb-2 shrink-0",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "text-xs text-[#39ff14] font-bold tracking-widest flex items-center gap-2 neon-text-green",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$zap$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Zap$3e$__["Zap"], {
                                                                size: 14
                                                            }, void 0, false, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 782,
                                                                columnNumber: 25
                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                            " SEQUENCE_MATRIX"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                        lineNumber: 781,
                                                        columnNumber: 21
                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "flex items-center gap-3 flex-wrap",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                className: "text-[10px] text-gray-500 whitespace-nowrap",
                                                                children: [
                                                                    "TRACKS: ",
                                                                    song.tracks.length
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 785,
                                                                columnNumber: 25
                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "flex items-center gap-1",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "text-[10px] text-gray-500",
                                                                        children: "STEPS:"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                        lineNumber: 787,
                                                                        columnNumber: 29
                                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                                    [
                                                                        8,
                                                                        16,
                                                                        32
                                                                    ].map((n)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                            onClick: ()=>setSong((prev)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["setStepsPerPattern"])(prev, n)),
                                                                            className: `px-2 py-0.5 text-[10px] border ${song.stepsPerPattern === n ? 'border-[#39ff14] bg-[#39ff14] text-black' : 'border-gray-600 text-gray-400 hover:border-gray-500'}`,
                                                                            children: n
                                                                        }, n, false, {
                                                                            fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                            lineNumber: 789,
                                                                            columnNumber: 33
                                                                        }, ("TURBOPACK compile-time value", void 0)))
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 786,
                                                                columnNumber: 25
                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "flex items-center gap-1",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "text-[10px] text-gray-500",
                                                                        children: "SWING:"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                        lineNumber: 793,
                                                                        columnNumber: 29
                                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                                                        type: "range",
                                                                        min: 0,
                                                                        max: 100,
                                                                        value: song.swing,
                                                                        onChange: (e)=>setSong((prev)=>(0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["setSwing"])(prev, Number(e.target.value))),
                                                                        className: "w-16 h-1.5 accent-[#b026ff]",
                                                                        "aria-label": "Swing amount"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                        lineNumber: 794,
                                                                        columnNumber: 29
                                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                                        className: "text-[9px] text-gray-500 w-6",
                                                                        children: [
                                                                            song.swing,
                                                                            "%"
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                        lineNumber: 795,
                                                                        columnNumber: 29
                                                                    }, ("TURBOPACK compile-time value", void 0))
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 792,
                                                                columnNumber: 25
                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                onClick: addTrack,
                                                                className: "flex items-center gap-1 px-2 py-1 text-[10px] border border-[#39ff14] text-[#39ff14] hover:bg-[#39ff14] hover:text-black",
                                                                title: "Add track",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$plus$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Plus$3e$__["Plus"], {
                                                                        size: 10
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                        lineNumber: 797,
                                                                        columnNumber: 203
                                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                                    " ADD"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 797,
                                                                columnNumber: 25
                                                            }, ("TURBOPACK compile-time value", void 0))
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                        lineNumber: 784,
                                                        columnNumber: 21
                                                    }, ("TURBOPACK compile-time value", void 0))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 780,
                                                columnNumber: 17
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0",
                                                children: song.tracks.map((track)=>{
                                                    const isDragging = draggedTrackId === track.id;
                                                    const isDropTarget = dropTargetTrackId === track.id;
                                                    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        draggable: true,
                                                        onDragStart: (e)=>handleDragStart(e, track.id),
                                                        onDragOver: (e)=>handleDragOver(e, track.id),
                                                        onDragLeave: handleDragLeave,
                                                        onDrop: (e)=>handleDrop(e, track.id),
                                                        onDragEnd: handleDragEnd,
                                                        className: `transition-all duration-200 p-1 rounded border-l-2 relative overflow-hidden group cursor-move ${isDragging ? 'opacity-50 scale-95' : ''} ${isDropTarget ? 'border-[#39ff14] bg-[#39ff14]/20 shadow-[0_0_15px_rgba(57,255,20,0.4)]' : ''} ${selectedTrackId === track.id ? 'border-[#b026ff] bg-[#b026ff]/5' : 'border-gray-800 hover:bg-white/5'}`,
                                                        children: [
                                                            selectedTrackId === track.id && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "absolute inset-0 bg-gradient-to-r from-[#b026ff]/10 to-transparent pointer-events-none"
                                                            }, void 0, false, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 822,
                                                                columnNumber: 62
                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "flex items-center gap-2 w-full",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "flex items-center gap-1 shrink-0",
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                onClick: ()=>setTrackMuted(track.id, !track.muted),
                                                                                className: `w-7 h-7 flex items-center justify-center text-[10px] font-bold border ${track.muted ? 'bg-[#ff0055]/30 border-[#ff0055] text-[#ff0055]' : 'border-gray-600 text-gray-400 hover:border-gray-500'}`,
                                                                                title: track.muted ? 'Unmute' : 'Mute',
                                                                                children: "M"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                                lineNumber: 825,
                                                                                columnNumber: 37
                                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                onClick: ()=>setTrackSolo(track.id, !track.solo),
                                                                                className: `w-7 h-7 flex items-center justify-center text-[10px] font-bold border ${track.solo ? 'bg-[#39ff14]/30 border-[#39ff14] text-[#39ff14]' : 'border-gray-600 text-gray-400 hover:border-gray-500'}`,
                                                                                title: track.solo ? 'Unsolo' : 'Solo',
                                                                                children: "S"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                                lineNumber: 826,
                                                                                columnNumber: 37
                                                                            }, ("TURBOPACK compile-time value", void 0))
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                        lineNumber: 824,
                                                                        columnNumber: 33
                                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "flex-1 min-w-0 cursor-pointer",
                                                                        onClick: ()=>setSelectedTrackId(track.id),
                                                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$Sequencer$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Sequencer"], {
                                                                            track: track,
                                                                            stepsPerPattern: song.stepsPerPattern,
                                                                            currentStep: currentStep,
                                                                            selectedStep: selectedStep,
                                                                            cancelStep: cancelStep,
                                                                            onStepSelect: (step)=>setSelectedStep(step),
                                                                            onStepToggle: (step)=>handleStepToggle(track.id, step)
                                                                        }, void 0, false, {
                                                                            fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                            lineNumber: 829,
                                                                            columnNumber: 37
                                                                        }, ("TURBOPACK compile-time value", void 0))
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                        lineNumber: 828,
                                                                        columnNumber: 33
                                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "flex items-center gap-0.5 shrink-0",
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                onClick: ()=>moveTrack(track.id, 'up'),
                                                                                disabled: song.tracks.indexOf(track) === 0,
                                                                                className: "w-6 h-8 flex items-center justify-center border border-gray-700 text-gray-500 hover:border-[#39ff14] hover:text-[#39ff14] disabled:opacity-30",
                                                                                title: "Move up",
                                                                                children: "↑"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                                lineNumber: 840,
                                                                                columnNumber: 37
                                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                onClick: ()=>moveTrack(track.id, 'down'),
                                                                                disabled: song.tracks.indexOf(track) === song.tracks.length - 1,
                                                                                className: "w-6 h-8 flex items-center justify-center border border-gray-700 text-gray-500 hover:border-[#39ff14] hover:text-[#39ff14] disabled:opacity-30",
                                                                                title: "Move down",
                                                                                children: "↓"
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                                lineNumber: 841,
                                                                                columnNumber: 37
                                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                onClick: ()=>duplicateTrack(track.id),
                                                                                className: "w-6 h-8 flex items-center justify-center border border-gray-700 text-gray-500 hover:border-[#39ff14] hover:text-[#39ff14]",
                                                                                title: "Duplicate",
                                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$copy$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Copy$3e$__["Copy"], {
                                                                                    size: 12
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                                    lineNumber: 842,
                                                                                    columnNumber: 238
                                                                                }, ("TURBOPACK compile-time value", void 0))
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                                lineNumber: 842,
                                                                                columnNumber: 37
                                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                onClick: ()=>removeTrack(track.id),
                                                                                disabled: song.tracks.length <= 1,
                                                                                className: "w-6 h-8 flex items-center justify-center border border-gray-700 text-gray-500 hover:border-[#ff0055] hover:text-[#ff0055] disabled:opacity-30",
                                                                                title: "Remove",
                                                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__["Trash2"], {
                                                                                    size: 12
                                                                                }, void 0, false, {
                                                                                    fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                                    lineNumber: 843,
                                                                                    columnNumber: 287
                                                                                }, ("TURBOPACK compile-time value", void 0))
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                                lineNumber: 843,
                                                                                columnNumber: 37
                                                                            }, ("TURBOPACK compile-time value", void 0))
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                        lineNumber: 839,
                                                                        columnNumber: 33
                                                                    }, ("TURBOPACK compile-time value", void 0))
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 823,
                                                                columnNumber: 29
                                                            }, ("TURBOPACK compile-time value", void 0))
                                                        ]
                                                    }, track.id, true, {
                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                        lineNumber: 806,
                                                        columnNumber: 25
                                                    }, ("TURBOPACK compile-time value", void 0));
                                                })
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 801,
                                                columnNumber: 17
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 779,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                lineNumber: 774,
                                columnNumber: 9
                            }, ("TURBOPACK compile-time value", void 0)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "lg:col-span-5 xl:col-span-4 min-h-0 flex flex-col gap-4 lg:gap-6",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "shrink-0",
                                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$AudioSampler$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AudioSampler"], {
                                            onAudioLoaded: handleAudioSamplerLoaded,
                                            onSamplerLoaded: handleSamplerLoaded,
                                            preloadedAudio: samplerPreload,
                                            onLoopDropped: ()=>setDraggedLoop(null)
                                        }, void 0, false, {
                                            fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                            lineNumber: 857,
                                            columnNumber: 17
                                        }, ("TURBOPACK compile-time value", void 0))
                                    }, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 856,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$AiChatPanel$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AiChatPanel"], {}, void 0, false, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 864,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0)),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "cyber-panel flex-1 p-3 lg:p-4 flex flex-col relative bg-black/90 overflow-hidden min-h-[min(50dvh,24rem)] sm:min-h-[400px]",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "absolute top-0 right-0 p-2 opacity-30 pointer-events-none",
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$activity$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Activity$3e$__["Activity"], {
                                                    size: 100,
                                                    className: "text-[#39ff14]/10"
                                                }, void 0, false, {
                                                    fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                    lineNumber: 869,
                                                    columnNumber: 21
                                                }, ("TURBOPACK compile-time value", void 0))
                                            }, void 0, false, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 868,
                                                columnNumber: 18
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "mb-6 border-b border-[#b026ff]/30 pb-2 shrink-0 flex justify-between items-end",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "text-[10px] text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$sliders$2d$vertical$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Sliders$3e$__["Sliders"], {
                                                                        size: 12
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                        lineNumber: 875,
                                                                        columnNumber: 29
                                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                                    " PARAMETER_CONTROL"
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 874,
                                                                columnNumber: 25
                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "text-2xl font-bold text-[#b026ff] neon-text-purple truncate glitch",
                                                                "data-text": selectedTrack ? selectedTrack.name : 'NULL',
                                                                children: selectedTrack ? selectedTrack.name : 'NO_SELECTION'
                                                            }, void 0, false, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 877,
                                                                columnNumber: 25
                                                            }, ("TURBOPACK compile-time value", void 0))
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                        lineNumber: 873,
                                                        columnNumber: 21
                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                    selectedTrack && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                        onClick: handleTriggerNote,
                                                        className: "mb-1 px-3 py-1 bg-[#b026ff]/20 border border-[#b026ff] text-[#b026ff] text-[10px] font-bold uppercase hover:bg-[#b026ff] hover:text-black transition-colors flex items-center gap-2 shadow-[0_0_10px_rgba(176,38,255,0.3)] hover:shadow-[0_0_15px_rgba(176,38,255,0.6)]",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$lucide$2d$react$40$0$2e$577$2e$0_react$40$19$2e$2$2e$4$2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$zap$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Zap$3e$__["Zap"], {
                                                                size: 10
                                                            }, void 0, false, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 886,
                                                                columnNumber: 29
                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                            " AUDITION"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                        lineNumber: 882,
                                                        columnNumber: 25
                                                    }, ("TURBOPACK compile-time value", void 0))
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 872,
                                                columnNumber: 18
                                            }, ("TURBOPACK compile-time value", void 0)),
                                            selectedTrack && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "space-y-6 overflow-y-auto pr-2 custom-scrollbar flex-1 pb-4",
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                        className: "bg-black/40 p-4 rounded border border-gray-800 relative group hover:border-[#b026ff]/50 transition-colors",
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "absolute -top-2 left-3 bg-black px-1 text-[10px] text-[#b026ff] uppercase tracking-wider font-bold",
                                                                children: "Track Mix"
                                                            }, void 0, false, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 894,
                                                                columnNumber: 29
                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "flex flex-wrap justify-between mt-2",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$Knob$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Knob"], {
                                                                        label: "VOL",
                                                                        value: selectedTrack.volume,
                                                                        min: 0,
                                                                        max: 2,
                                                                        onChange: (v)=>setTrackVolume(selectedTrack.id, v),
                                                                        color: "text-[#b026ff]"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                        lineNumber: 896,
                                                                        columnNumber: 33
                                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$Knob$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Knob"], {
                                                                        label: "PAN",
                                                                        value: selectedTrack.pan,
                                                                        min: -1,
                                                                        max: 1,
                                                                        onChange: (v)=>setTrackPan(selectedTrack.id, v),
                                                                        color: "text-[#b026ff]"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                        lineNumber: 897,
                                                                        columnNumber: 33
                                                                    }, ("TURBOPACK compile-time value", void 0))
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 895,
                                                                columnNumber: 29
                                                            }, ("TURBOPACK compile-time value", void 0))
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                        lineNumber: 893,
                                                        columnNumber: 25
                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                    selectedTrack.type !== 'audio' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Fragment"], {
                                                        children: [
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "bg-black/40 p-4 rounded border border-gray-800 relative group hover:border-[#39ff14]/50 transition-colors",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "absolute -top-2 left-3 bg-black px-1 text-[10px] text-[#39ff14] uppercase tracking-wider font-bold",
                                                                        children: "Envelope (ADSR)"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                        lineNumber: 903,
                                                                        columnNumber: 29
                                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "flex flex-wrap justify-between mt-2",
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$Knob$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Knob"], {
                                                                                label: "ATK",
                                                                                value: selectedTrack.params.attack,
                                                                                min: 0.01,
                                                                                max: 2,
                                                                                onChange: (v)=>updateTrackParam(selectedTrack.id, 'attack', v)
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                                lineNumber: 905,
                                                                                columnNumber: 33
                                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$Knob$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Knob"], {
                                                                                label: "DEC",
                                                                                value: selectedTrack.params.decay,
                                                                                min: 0.01,
                                                                                max: 2,
                                                                                onChange: (v)=>updateTrackParam(selectedTrack.id, 'decay', v)
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                                lineNumber: 906,
                                                                                columnNumber: 33
                                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$Knob$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Knob"], {
                                                                                label: "SUS",
                                                                                value: selectedTrack.params.sustain,
                                                                                min: 0,
                                                                                max: 1,
                                                                                onChange: (v)=>updateTrackParam(selectedTrack.id, 'sustain', v)
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                                lineNumber: 907,
                                                                                columnNumber: 33
                                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$Knob$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Knob"], {
                                                                                label: "REL",
                                                                                value: selectedTrack.params.release,
                                                                                min: 0.01,
                                                                                max: 3,
                                                                                onChange: (v)=>updateTrackParam(selectedTrack.id, 'release', v)
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                                lineNumber: 908,
                                                                                columnNumber: 33
                                                                            }, ("TURBOPACK compile-time value", void 0))
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                        lineNumber: 904,
                                                                        columnNumber: 29
                                                                    }, ("TURBOPACK compile-time value", void 0))
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 902,
                                                                columnNumber: 25
                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "bg-black/40 p-4 rounded border border-gray-800 relative group hover:border-[#b026ff]/50 transition-colors",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "absolute -top-2 left-3 bg-black px-1 text-[10px] text-[#b026ff] uppercase tracking-wider font-bold",
                                                                        children: "Filter & Amp"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                        lineNumber: 913,
                                                                        columnNumber: 29
                                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "flex flex-wrap justify-between mt-2",
                                                                        children: [
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$Knob$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Knob"], {
                                                                                label: "CUTOFF",
                                                                                value: selectedTrack.params.filterCutoff,
                                                                                min: 20,
                                                                                max: 10000,
                                                                                step: 10,
                                                                                color: "text-[#b026ff]",
                                                                                onChange: (v)=>updateTrackParam(selectedTrack.id, 'filterCutoff', v)
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                                lineNumber: 915,
                                                                                columnNumber: 33
                                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$Knob$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Knob"], {
                                                                                label: "RES",
                                                                                value: selectedTrack.params.filterRes,
                                                                                min: 0,
                                                                                max: 20,
                                                                                color: "text-[#b026ff]",
                                                                                onChange: (v)=>updateTrackParam(selectedTrack.id, 'filterRes', v)
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                                lineNumber: 922,
                                                                                columnNumber: 33
                                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$Knob$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Knob"], {
                                                                                label: "GAIN",
                                                                                value: selectedTrack.params.gain,
                                                                                min: 0,
                                                                                max: 1,
                                                                                color: "text-[#ff0055]",
                                                                                onChange: (v)=>updateTrackParam(selectedTrack.id, 'gain', v)
                                                                            }, void 0, false, {
                                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                                lineNumber: 929,
                                                                                columnNumber: 33
                                                                            }, ("TURBOPACK compile-time value", void 0))
                                                                        ]
                                                                    }, void 0, true, {
                                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                        lineNumber: 914,
                                                                        columnNumber: 29
                                                                    }, ("TURBOPACK compile-time value", void 0))
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 912,
                                                                columnNumber: 25
                                                            }, ("TURBOPACK compile-time value", void 0)),
                                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                className: "bg-black/40 p-4 rounded border border-gray-800 relative",
                                                                children: [
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "absolute -top-2 left-3 bg-black px-1 text-[10px] text-gray-400 uppercase tracking-wider font-bold",
                                                                        children: "Oscillator Type"
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                        lineNumber: 940,
                                                                        columnNumber: 30
                                                                    }, ("TURBOPACK compile-time value", void 0)),
                                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                        className: "grid grid-cols-2 gap-2 mt-2",
                                                                        children: [
                                                                            'sine',
                                                                            'square',
                                                                            'sawtooth',
                                                                            'triangle'
                                                                        ].map((type)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                                                onClick: ()=>{
                                                                                    const next = (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$lib$2f$songMutations$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["setTrackWaveform"])(song, selectedTrack.id, type);
                                                                                    if (!next) return;
                                                                                    setSong(()=>next);
                                                                                    const tIdx = next.tracks.findIndex((t)=>t.id === selectedTrack.id);
                                                                                    if (tIdx !== -1) __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$services$2f$audioEngine$2e$ts__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["audioEngine"].updateTrackParams(tIdx, next.tracks[tIdx].params);
                                                                                },
                                                                                className: `
                                            py-2 text-[10px] uppercase font-bold border transition-all duration-200
                                            ${selectedTrack.params.waveform === type ? 'bg-[#39ff14] text-black border-[#39ff14] shadow-[0_0_10px_#39ff14]' : 'text-gray-400 border-gray-800 hover:border-gray-600 hover:text-white bg-black/50'}
                                        `,
                                                                                children: type
                                                                            }, type, false, {
                                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                                lineNumber: 943,
                                                                                columnNumber: 38
                                                                            }, ("TURBOPACK compile-time value", void 0)))
                                                                    }, void 0, false, {
                                                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                        lineNumber: 941,
                                                                        columnNumber: 30
                                                                    }, ("TURBOPACK compile-time value", void 0))
                                                                ]
                                                            }, void 0, true, {
                                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                                lineNumber: 939,
                                                                columnNumber: 25
                                                            }, ("TURBOPACK compile-time value", void 0))
                                                        ]
                                                    }, void 0, true)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                                lineNumber: 892,
                                                columnNumber: 22
                                            }, ("TURBOPACK compile-time value", void 0))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                        lineNumber: 867,
                                        columnNumber: 13
                                    }, ("TURBOPACK compile-time value", void 0))
                                ]
                            }, void 0, true, {
                                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                                lineNumber: 854,
                                columnNumber: 9
                            }, ("TURBOPACK compile-time value", void 0))
                        ]
                    }, void 0, true, {
                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                        lineNumber: 771,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0)),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "max-w-[1400px] w-full mx-auto mt-4 lg:mt-6 px-2 md:px-0 shrink-0",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$components$2f$LoopLibrary$2e$tsx__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["LoopLibrary"], {
                            loops: loops,
                            onDeleteLoop: handleDeleteLoop,
                            onDragStart: handleLoopDragStart,
                            onDragEnd: ()=>setDraggedLoop(null)
                        }, void 0, false, {
                            fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                            lineNumber: 975,
                            columnNumber: 11
                        }, ("TURBOPACK compile-time value", void 0))
                    }, void 0, false, {
                        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                        lineNumber: 974,
                        columnNumber: 9
                    }, ("TURBOPACK compile-time value", void 0))
                ]
            }, void 0, true, {
                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                lineNumber: 770,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0)),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$DAW_Ivader$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "fixed right-4 text-[9px] text-gray-600 font-mono hidden md:block z-50 bottom-[max(0.5rem,env(safe-area-inset-bottom,0px))]",
                children: "SYSTEM_STATUS: OPERATIONAL :: MEMORY: 64TB :: IRKEN_EMPIRE_V2.0"
            }, void 0, false, {
                fileName: "[project]/Documents/DAW_Ivader/App.tsx",
                lineNumber: 985,
                columnNumber: 7
            }, ("TURBOPACK compile-time value", void 0))
        ]
    }, void 0, true, {
        fileName: "[project]/Documents/DAW_Ivader/App.tsx",
        lineNumber: 549,
        columnNumber: 5
    }, ("TURBOPACK compile-time value", void 0));
};
const __TURBOPACK__default__export__ = App;
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0b6zoqg._.js.map