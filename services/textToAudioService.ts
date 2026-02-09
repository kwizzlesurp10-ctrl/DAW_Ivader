import { ok, err, type Result } from '../lib/result';
import {
  generateAudioRequestSchema,
  generateAudioResponseSchema,
  type GenerateAudioRequest,
  type GenerateAudioSuccess,
  type MusicGenModelVersion,
  GENERATE_AUDIO_DURATION_DEFAULT,
  MUSICGEN_MODEL_VERSION_DEFAULT,
} from '../schemas/generateAudioSchema';

/** Client-side result type for successful generation. */
export type GenerateAudioResult = GenerateAudioSuccess;

/** Timeout (ms) — matches API maxDuration. */
const FETCH_TIMEOUT_MS = 90_000;

/**
 * Call the app's serverless API to generate audio from text (MusicGen).
 * In production the API runs on the same origin; in dev use Vercel dev or full URL.
 *
 * @param prompt - Text description of the desired music (e.g. "Dark cyberpunk bassline").
 * @param durationSeconds - Clip length 1–30 seconds. Default 8.
 * @param modelVersion - MusicGen model to use: 'large' (default), 'stereo-large', 'melody-large', or 'stereo-melody-large'.
 * @returns Result with { url } on success, or Error on failure.
 */
export async function generateAudioFromText(
  prompt: string,
  durationSeconds: number = GENERATE_AUDIO_DURATION_DEFAULT,
  modelVersion: MusicGenModelVersion = MUSICGEN_MODEL_VERSION_DEFAULT
): Promise<Result<GenerateAudioResult, Error>> {
  const parseResult = generateAudioRequestSchema.safeParse({
    prompt: prompt.trim(),
    duration: durationSeconds,
    model_version: modelVersion,
  });
  if (!parseResult.success) {
    const e = parseResult.error as { message?: string; issues?: Array<{ message?: string }> };
    const msg =
      (Array.isArray(e.issues) ? e.issues.map((i) => i.message).join('; ') : null) ||
      e.message ||
      'Invalid prompt';
    return err(new Error(msg));
  }
  const { prompt: trimmed, duration, model_version } = parseResult.data;

  const apiBase =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.VITE_APP_URL as string | undefined) ?? '';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const body: GenerateAudioRequest = { prompt: trimmed, duration, model_version };
    const res = await fetch(`${apiBase}/api/generate-audio`, {
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
            'Generate API not found. Run the app with "vercel dev" (not npm run dev) so /api/generate-audio is available.'
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
