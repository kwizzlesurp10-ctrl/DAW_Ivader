import { ok, err, type Result } from '../lib/result';
import {
  generateAudioRequestSchema,
  generateAudioResponseSchema,
  type GenerateAudioRequest,
  type GenerateAudioSuccess,
  type AudioGenerationBackend,
  type StableAudioModelVersion,
  AUDIO_GENERATION_BACKEND_DEFAULT,
  GENERATE_AUDIO_DURATION_DEFAULT,
  STABLE_AUDIO_MODEL_VERSION_DEFAULT,
} from '../schemas/generateAudioSchema';

/** Client-side result type for successful generation. */
export type GenerateAudioResult = GenerateAudioSuccess;

/** Timeout (ms) — matches API maxDuration. */
const FETCH_TIMEOUT_MS = 90_000;

/**
 * Call the app's serverless API to generate audio from text (Stable Audio).
 * The Next.js app serves the UI and API routes from the same origin.
 *
 * @param prompt - Text description of the desired music.
 * @param durationSeconds - Clip length in seconds. Default 15.
 * @param modelVersion - Stable Audio model to use: 'stable-audio-2.5' (default).
 * @param options - Optional parameters: backend, negative_prompt, steps, cfg_scale.
 * @returns Result with { url } on success, or Error on failure.
 */
export async function generateAudioFromText(
  prompt: string,
  durationSeconds: number = GENERATE_AUDIO_DURATION_DEFAULT,
  modelVersion: StableAudioModelVersion = STABLE_AUDIO_MODEL_VERSION_DEFAULT,
  options: {
    backend?: AudioGenerationBackend;
    negative_prompt?: string;
    steps?: number;
    cfg_scale?: number;
  } = {}
): Promise<Result<GenerateAudioResult, Error>> {
  const parseResult = generateAudioRequestSchema.safeParse({
    prompt: prompt.trim(),
    duration: durationSeconds,
    model_version: modelVersion,
    backend: options.backend ?? AUDIO_GENERATION_BACKEND_DEFAULT,
    ...options,
  });
  if (!parseResult.success) {
    const e = parseResult.error as { message?: string; issues?: Array<{ message?: string }> };
    const msg =
      (Array.isArray(e.issues) ? e.issues.map((i) => i.message).join('; ') : null) ||
      e.message ||
      'Invalid prompt';
    return err(new Error(msg));
  }
  const { prompt: trimmed, duration, model_version, backend, negative_prompt, steps, cfg_scale } =
    parseResult.data;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const body: GenerateAudioRequest = { 
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      return err(
        new Error(
          res.ok
            ? 'Invalid response from server'
            : `Generate failed: ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ''}`
        )
      );
    }

    if (!res.ok) {
      if (res.status === 404) {
        return err(
          new Error(
            'Generate API not found. Run the app with "pnpm dev" so /api/generate-audio is available.'
          )
        );
      }
      const parsed = generateAudioResponseSchema.safeParse(data);
      const msg =
        parsed.success && 'error' in parsed.data
          ? parsed.data.error
          : `HTTP ${res.status}`;
      return err(new Error(msg));
    }

    const parsed = generateAudioResponseSchema.safeParse(data);
    const url =
      parsed.success &&
      'url' in parsed.data &&
      typeof parsed.data.url === 'string'
        ? parsed.data.url
        : null;
    if (!url) {
      return err(new Error('Invalid response: no audio URL'));
    }

    return ok({ url });
  } catch (e) {
    clearTimeout(timeoutId);
    const message = e instanceof Error ? e.message : String(e);
    if (
      message === 'Failed to fetch' ||
      (e as Error & { code?: string })?.code === 'ERR_NETWORK_CHANGED'
    ) {
      return err(
        new Error('Network error. Check your connection and try again.')
      );
    }
    if ((e as Error & { name?: string })?.name === 'AbortError') {
      return err(new Error('Request timed out. Try again.'));
    }
    return err(new Error(message));
  }
}