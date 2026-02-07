import { describe, it, expect } from 'vitest';
import { createGeneratedAudioTrack } from './createGeneratedAudioTrack';

describe('createGeneratedAudioTrack', () => {
  it('returns track with type audio and given url', () => {
    const url = 'https://example.com/audio.wav';
    const track = createGeneratedAudioTrack(url, { id: 't123' });

    expect(track.type).toBe('audio');
    expect(track.audioUrl).toBe(url);
    expect(track.id).toBe('t123');
  });

  it('uses default name "Generated" when name not provided', () => {
    const track = createGeneratedAudioTrack('https://x.com/a.wav', { id: 't1' });

    expect(track.name).toBe('Generated');
  });

  it('uses custom name when provided', () => {
    const track = createGeneratedAudioTrack('https://x.com/a.wav', {
      id: 't1',
      name: 'My Clip',
    });

    expect(track.name).toBe('My Clip');
  });

  it('preserves empty string name when explicitly provided', () => {
    const track = createGeneratedAudioTrack('https://x.com/a.wav', {
      id: 't1',
      name: '',
    });

    expect(track.name).toBe('');
  });

  it('returns track with empty notes and correct volume/pan defaults', () => {
    const track = createGeneratedAudioTrack('https://x.com/a.wav', { id: 't1' });

    expect(track.notes).toEqual([]);
    expect(track.muted).toBe(false);
    expect(track.solo).toBe(false);
    expect(track.volume).toBe(1);
    expect(track.pan).toBe(0);
  });

  it('includes params for type compatibility with synth tracks', () => {
    const track = createGeneratedAudioTrack('https://x.com/a.wav', { id: 't1' });

    expect(track.params).toBeDefined();
    expect(track.params.waveform).toBe('sine');
    expect(track.params.attack).toBe(0.01);
    expect(track.params.decay).toBe(0.1);
    expect(track.params.sustain).toBe(0.5);
    expect(track.params.release).toBe(0.2);
    expect(track.params.filterCutoff).toBe(1000);
    expect(track.params.filterRes).toBe(1);
    expect(track.params.gain).toBe(0.5);
  });

  it('handles url with query params and path', () => {
    const url = 'https://replicate.delivery/pbxt/abc123.wav?token=xyz';
    const track = createGeneratedAudioTrack(url, { id: 't1' });

    expect(track.audioUrl).toBe(url);
  });

  it('handles http url', () => {
    const url = 'http://localhost:3000/audio.wav';
    const track = createGeneratedAudioTrack(url, { id: 't1' });

    expect(track.audioUrl).toBe(url);
  });

  it('handles long id', () => {
    const longId = 't' + 'a'.repeat(100);
    const track = createGeneratedAudioTrack('https://x.com/a.wav', { id: longId });

    expect(track.id).toBe(longId);
  });

  it('is pure — same inputs produce identical output structure', () => {
    const a = createGeneratedAudioTrack('https://x.com/a.wav', {
      id: 't1',
      name: 'Test',
    });
    const b = createGeneratedAudioTrack('https://x.com/a.wav', {
      id: 't1',
      name: 'Test',
    });

    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('produces different output for different inputs', () => {
    const t1 = createGeneratedAudioTrack('https://a.com/1.wav', { id: 't1' });
    const t2 = createGeneratedAudioTrack('https://b.com/2.wav', { id: 't2', name: 'B' });

    expect(t1.audioUrl).not.toBe(t2.audioUrl);
    expect(t1.id).not.toBe(t2.id);
    expect(t1.name).not.toBe(t2.name);
  });
});
