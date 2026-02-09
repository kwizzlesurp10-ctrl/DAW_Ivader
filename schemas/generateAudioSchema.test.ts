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

    it('accepts valid model_version large', () => {
      const result = generateAudioRequestSchema.safeParse({
        prompt: 'test',
        model_version: 'large',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.model_version).toBe('large');
    });

    it('accepts valid model_version stereo-large', () => {
      const result = generateAudioRequestSchema.safeParse({
        prompt: 'test',
        model_version: 'stereo-large',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.model_version).toBe('stereo-large');
    });

    it('accepts valid model_version melody-large', () => {
      const result = generateAudioRequestSchema.safeParse({
        prompt: 'test',
        model_version: 'melody-large',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.model_version).toBe('melody-large');
    });

    it('accepts valid model_version stereo-melody-large', () => {
      const result = generateAudioRequestSchema.safeParse({
        prompt: 'test',
        model_version: 'stereo-melody-large',
      });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.model_version).toBe('stereo-melody-large');
    });

    it('defaults to large model when model_version omitted', () => {
      const result = generateAudioRequestSchema.safeParse({ prompt: 'test' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.model_version).toBe('large');
    });

    it('rejects invalid model_version', () => {
      const result = generateAudioRequestSchema.safeParse({
        prompt: 'test',
        model_version: 'invalid-model',
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

    it('rejects whitespace-only prompt', () => {
      const result = generateAudioRequestSchema.safeParse({ prompt: '   \t\n  ' });
      expect(result.success).toBe(false);
    });

    it('rejects missing prompt', () => {
      const result = generateAudioRequestSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects null prompt', () => {
      const result = generateAudioRequestSchema.safeParse({ prompt: null });
      expect(result.success).toBe(false);
    });

    it('rejects non-string prompt', () => {
      const result = generateAudioRequestSchema.safeParse({ prompt: 123 });
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
        expect(result.data.model_version).toBe('large');
      }
    });

    it('returns ok with custom model_version', () => {
      const result = parseGenerateAudioRequest({
        prompt: 'test',
        duration: 5,
        model_version: 'stereo-large',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.model_version).toBe('stereo-large');
      }
    });

    it('returns ok with default duration when omitted', () => {
      const result = parseGenerateAudioRequest({ prompt: 'hello' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.duration).toBe(GENERATE_AUDIO_DURATION_DEFAULT);
      }
    });

    it('returns error for empty prompt with message containing Missing or empty', () => {
      const result = parseGenerateAudioRequest({ prompt: '' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('Missing or empty');
    });

    it('returns error for missing prompt', () => {
      const result = parseGenerateAudioRequest({});
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeTruthy();
    });

    it('returns error for prompt too long', () => {
      const result = parseGenerateAudioRequest({
        prompt: 'x'.repeat(GENERATE_AUDIO_PROMPT_MAX_LENGTH + 1),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('too long');
    });

    it('returns error for null input', () => {
      const result = parseGenerateAudioRequest(null);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeTruthy();
    });

    it('returns error for undefined input', () => {
      const result = parseGenerateAudioRequest(undefined);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBeTruthy();
    });
  });

  describe('generateAudioResponseSchema', () => {
    it('accepts success shape with valid https url', () => {
      const result = generateAudioResponseSchema.safeParse({
        url: 'https://example.com/audio.wav',
      });
      expect(result.success).toBe(true);
      if (result.success && 'url' in result.data) {
        expect(result.data.url).toBe('https://example.com/audio.wav');
      }
    });

    it('accepts success shape with url containing query string', () => {
      const url = 'https://cdn.example.com/audio.wav?token=abc';
      const result = generateAudioResponseSchema.safeParse({ url });
      expect(result.success).toBe(true);
      if (result.success && 'url' in result.data) {
        expect(result.data.url).toBe(url);
      }
    });

    it('accepts error shape with message', () => {
      const result = generateAudioResponseSchema.safeParse({
        error: 'Generation failed',
      });
      expect(result.success).toBe(true);
      if (result.success && 'error' in result.data) {
        expect(result.data.error).toBe('Generation failed');
      }
    });

    it('rejects invalid url format', () => {
      const result = generateAudioResponseSchema.safeParse({
        url: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty object', () => {
      const result = generateAudioResponseSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects url as null', () => {
      const result = generateAudioResponseSchema.safeParse({ url: null });
      expect(result.success).toBe(false);
    });

    it('rejects success shape with empty string url', () => {
      const result = generateAudioResponseSchema.safeParse({ url: '' });
      expect(result.success).toBe(false);
    });
  });
});
