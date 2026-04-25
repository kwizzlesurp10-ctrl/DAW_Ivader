import { describe, it, expect } from 'vitest';
import {
  parseGenerateAudioRequest,
  generateAudioRequestSchema,
  generateAudioResponseSchema,
  GENERATE_AUDIO_DURATION_MIN,
  GENERATE_AUDIO_DURATION_MAX,
  GENERATE_AUDIO_DURATION_DEFAULT,
  GENERATE_AUDIO_PROMPT_MAX_LENGTH,
} from './generateAudioSchema';

describe('generateAudioSchema', () => {
  describe('generateAudioRequestSchema', () => {
    it('accepts valid prompt and duration', () => {
      const result = generateAudioRequestSchema.safeParse({
        prompt: 'dark bass',
        duration: 8,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.prompt).toBe('dark bass');
        expect(result.data.duration).toBe(8);
      }
    });

    it('trims prompt and defaults duration when omitted', () => {
      const result = generateAudioRequestSchema.safeParse({ prompt: '  test  ' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.prompt).toBe('test');
        expect(result.data.duration).toBe(GENERATE_AUDIO_DURATION_DEFAULT);
      }
    });

    it('clamps duration above max to GENERATE_AUDIO_DURATION_MAX', () => {
      const result = generateAudioRequestSchema.safeParse({
        prompt: 'x',
        duration: 100,
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.duration).toBe(GENERATE_AUDIO_DURATION_MAX);
    });

    it('clamps duration below min to GENERATE_AUDIO_DURATION_MIN', () => {
      const result = generateAudioRequestSchema.safeParse({
        prompt: 'x',
        duration: 0,
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.duration).toBe(GENERATE_AUDIO_DURATION_MIN);
    });

    it('rounds fractional duration and clamps to valid range', () => {
      const over = generateAudioRequestSchema.safeParse({
        prompt: 'x',
        duration: 25.7,
      });
      expect(over.success).toBe(true);
      if (over.success) expect(over.data.duration).toBe(26);

      const under = generateAudioRequestSchema.safeParse({
        prompt: 'x',
        duration: 0.4,
      });
      expect(under.success).toBe(true);
      if (under.success) expect(under.data.duration).toBe(GENERATE_AUDIO_DURATION_MIN);
    });

    it('accepts prompt at max length boundary', () => {
      const maxPrompt = 'x'.repeat(GENERATE_AUDIO_PROMPT_MAX_LENGTH);
      const result = generateAudioRequestSchema.safeParse({ prompt: maxPrompt });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.prompt).toHaveLength(GENERATE_AUDIO_PROMPT_MAX_LENGTH);
    });

    it('accepts valid model_version stable-audio-2.5', () => {
      const result = generateAudioRequestSchema.safeParse({
        prompt: 'test',
        model_version: 'stable-audio-2.5',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.model_version).toBe('stable-audio-2.5');
    });

    it('accepts valid model_version stable-audio-open-1.0', () => {
      const result = generateAudioRequestSchema.safeParse({
        prompt: 'test',
        model_version: 'stable-audio-open-1.0',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.model_version).toBe('stable-audio-open-1.0');
    });

    it('defaults to stable-audio-2.5 model when model_version omitted', () => {
      const result = generateAudioRequestSchema.safeParse({ prompt: 'test' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.model_version).toBe('stable-audio-2.5');
    });

    it('defaults to replicate backend when backend omitted', () => {
      const result = generateAudioRequestSchema.safeParse({ prompt: 'test' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.backend).toBe('replicate');
    });

    it('accepts comfyui backend', () => {
      const result = generateAudioRequestSchema.safeParse({
        prompt: 'test',
        backend: 'comfyui',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.backend).toBe('comfyui');
    });

    it('clamps steps to model limit of 8', () => {
      const result = generateAudioRequestSchema.safeParse({
        prompt: 'x',
        steps: 50,
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.steps).toBe(8);
    });

    it('rejects invalid model_version', () => {
      const result = generateAudioRequestSchema.safeParse({
        prompt: 'test',
        model_version: 'invalid-model',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid backend', () => {
      const result = generateAudioRequestSchema.safeParse({
        prompt: 'test',
        backend: 'invalid-backend',
      });
      expect(result.success).toBe(false);
    });

    it('rejects prompt over max length', () => {
      const tooLong = 'x'.repeat(GENERATE_AUDIO_PROMPT_MAX_LENGTH + 1);
      const result = generateAudioRequestSchema.safeParse({ prompt: tooLong });
      expect(result.success).toBe(false);
    });

    it('rejects empty prompt', () => {
      const result = generateAudioRequestSchema.safeParse({ prompt: '' });
      expect(result.success).toBe(false);
    });

    it('rejects missing prompt', () => {
      const result = generateAudioRequestSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('parseGenerateAudioRequest', () => {
    it('returns ok with data for valid input', () => {
      const result = parseGenerateAudioRequest({ prompt: 'test', duration: 5 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.prompt).toBe('test');
        expect(result.data.duration).toBe(5);
        expect(result.data.model_version).toBe('stable-audio-2.5');
      }
    });
  });

  describe('generateAudioResponseSchema', () => {
    it('accepts success shape with valid https url', () => {
      const result = generateAudioResponseSchema.safeParse({
        url: 'https://example.com/audio.wav',
      });
      expect(result.success).toBe(true);
    });

    it('accepts error shape with message', () => {
      const result = generateAudioResponseSchema.safeParse({
        error: 'Generation failed',
      });
      expect(result.success).toBe(true);
    });
  });
});