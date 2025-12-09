import '@testing-library/jest-dom';
import { vi } from 'vitest';


// Basic Web Audio API Mock
class AudioContextMock {
    createGain() { return { connect: vi.fn(), gain: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } }; }
    createOscillator() { return { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), type: 'sine', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } }; }
    createBiquadFilter() { return { connect: vi.fn(), type: 'lowpass', frequency: { setValueAtTime: vi.fn() }, Q: { value: 0, setValueAtTime: vi.fn() } }; }
    createAnalyser() { return { connect: vi.fn(), fftSize: 2048, smoothingTimeConstant: 0.8, frequencyBinCount: 1024, getByteFrequencyData: vi.fn() }; }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    destination = {};
    currentTime = 0;
    state = 'suspended';
}

window.AudioContext = AudioContextMock as any;
(window as any).webkitAudioContext = AudioContextMock as any;

