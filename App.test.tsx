/**
 * End-to-end tests for the MusicGen "Generate Music" feature.
 *
 * Covers the full flow:
 *   User clicks "Initialize System" → types a prompt → clicks GENERATE
 *   → generateAudioFromText is called → the returned audio URL is used to
 *   create a new audio track → the track appears in the DAW sequencer.
 *
 * Mocks:
 *  - audioEngine  (Web Audio API is unavailable in jsdom)
 *  - textToAudioService (no real network calls in tests)
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ok, err } from './lib/result';

// ── Mock audio engine (Web Audio API not available in jsdom) ──────────────────
vi.mock('./services/audioEngine', () => ({
  audioEngine: {
    getMasterVolume: vi.fn(() => 0.5),
    getMetronomeEnabled: vi.fn(() => false),
    getAnalyser: vi.fn(() => null),
    setSongData: vi.fn(),
    setMasterVolume: vi.fn(),
    setMetronomeEnabled: vi.fn(),
    setOnStepCallback: vi.fn(),
    init: vi.fn(() => Promise.resolve()),
    start: vi.fn(() => Promise.resolve()),
    pause: vi.fn(() => Promise.resolve()),
    stop: vi.fn(),
    updateTrackParams: vi.fn(),
    triggerNote: vi.fn(),
  },
}));

// ── Mock text-to-audio service (no real Replicate API calls) ──────────────────
vi.mock('./services/textToAudioService', () => ({
  generateAudioFromText: vi.fn(),
}));

// ── Lazy imports (after vi.mock declarations) ─────────────────────────────────
import App from './App';
import { generateAudioFromText } from './services/textToAudioService';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Render App and click through the "Initialize System" screen. */
async function renderInitialized(): Promise<void> {
  render(<App />);
  const initButton = screen.getByRole('button', { name: /initialize system/i });
  await act(async () => {
    fireEvent.click(initButton);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MusicGen feature – end-to-end', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Generate Music button flow', () => {
    it('clicking GENERATE calls generateAudioFromText with the typed prompt and default duration', async () => {
      const audioUrl = 'https://replicate.delivery/pbxt/test-audio.wav';
      vi.mocked(generateAudioFromText).mockResolvedValue(ok({ url: audioUrl }));

      await renderInitialized();

      const input = screen.getByPlaceholderText(/describe the music/i);
      fireEvent.change(input, { target: { value: 'dark cyberpunk bassline' } });

      const generateBtn = screen.getByRole('button', { name: /^generate$/i });
      await act(async () => {
        fireEvent.click(generateBtn);
      });

      expect(generateAudioFromText).toHaveBeenCalledWith('dark cyberpunk bassline', 8, 'stereo-melody-large');
    });

    it('generated audio URL is used in the new DAW track (track appears in sequencer)', async () => {
      const audioUrl = 'https://replicate.delivery/pbxt/test-audio.wav';
      vi.mocked(generateAudioFromText).mockResolvedValue(ok({ url: audioUrl }));

      await renderInitialized();

      const input = screen.getByPlaceholderText(/describe the music/i);
      fireEvent.change(input, { target: { value: 'ambient pads' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));
      });

      // Sequencer renders "Generated clip — plays from start" for audio tracks
      await waitFor(() => {
        expect(screen.getByText('Generated clip — plays from start')).toBeTruthy();
      });
    });

    it('new audio track is added to the song (track count increases)', async () => {
      const audioUrl = 'https://replicate.delivery/pbxt/test-audio.wav';
      vi.mocked(generateAudioFromText).mockResolvedValue(ok({ url: audioUrl }));

      await renderInitialized();

      // Count initial tracks via Mute buttons — each track has title="Mute" when unmuted
      const initialMuteButtons = screen.getAllByTitle('Mute');
      const initialCount = initialMuteButtons.length;

      const input = screen.getByPlaceholderText(/describe the music/i);
      fireEvent.change(input, { target: { value: 'pulsing synth arp' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));
      });

      await waitFor(() => {
        const updatedMuteButtons = screen.getAllByTitle('Mute');
        expect(updatedMuteButtons.length).toBe(initialCount + 1);
      });
    });

    it('pressing Enter in the prompt field also triggers generation', async () => {
      const audioUrl = 'https://replicate.delivery/pbxt/test-audio.wav';
      vi.mocked(generateAudioFromText).mockResolvedValue(ok({ url: audioUrl }));

      await renderInitialized();

      const input = screen.getByPlaceholderText(/describe the music/i);
      fireEvent.change(input, { target: { value: 'synthwave lead' } });
      await act(async () => {
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
      });

      expect(generateAudioFromText).toHaveBeenCalledWith('synthwave lead', 8, 'stereo-melody-large');
    });

    it('does not call generateAudioFromText when prompt is empty', async () => {
      vi.mocked(generateAudioFromText).mockResolvedValue(ok({ url: 'https://x.com/a.wav' }));

      await renderInitialized();

      // Prompt input starts empty — click GENERATE without typing anything
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));
      });

      expect(generateAudioFromText).not.toHaveBeenCalled();
    });

    it('shows an alert and does not add a track when generation fails', async () => {
      vi.mocked(generateAudioFromText).mockResolvedValue(
        err(new Error('REPLICATE_API_TOKEN is not set'))
      );
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);

      await renderInitialized();

      const initialClips = screen.queryAllByText('Generated clip — plays from start');

      const input = screen.getByPlaceholderText(/describe the music/i);
      fireEvent.change(input, { target: { value: 'glitchy drums' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));
      });

      expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('REPLICATE_API_TOKEN'));
      expect(screen.queryAllByText('Generated clip — plays from start')).toHaveLength(initialClips.length);

      alertSpy.mockRestore();
    });
  });

  describe('audioEngine integration during generation', () => {
    it('stops playback before calling generateAudioFromText', async () => {
      const { audioEngine } = await import('./services/audioEngine');
      const audioUrl = 'https://replicate.delivery/pbxt/test-audio.wav';
      let stopCalledBeforeGenerate = false;

      vi.mocked(generateAudioFromText).mockImplementation(async () => {
        stopCalledBeforeGenerate = vi.mocked(audioEngine.stop).mock.calls.length > 0;
        return ok({ url: audioUrl });
      });

      await renderInitialized();

      const input = screen.getByPlaceholderText(/describe the music/i);
      fireEvent.change(input, { target: { value: 'bass drop' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));
      });

      expect(stopCalledBeforeGenerate).toBe(true);
    });

    it('passes the generated audio URL to the audio engine via setSongData', async () => {
      const { audioEngine } = await import('./services/audioEngine');
      const audioUrl = 'https://replicate.delivery/pbxt/test-audio.wav';
      vi.mocked(generateAudioFromText).mockResolvedValue(ok({ url: audioUrl }));

      await renderInitialized();

      const input = screen.getByPlaceholderText(/describe the music/i);
      fireEvent.change(input, { target: { value: 'neon pulse' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));
      });

      await waitFor(() => {
        const calls = vi.mocked(audioEngine.setSongData).mock.calls;
        const lastCall = calls[calls.length - 1][0];
        const audioTrack = lastCall.tracks.find(
          (t: { type: string; audioUrl?: string }) => t.type === 'audio' && t.audioUrl === audioUrl
        );
        expect(audioTrack).toBeDefined();
      });
    });
  });
});
