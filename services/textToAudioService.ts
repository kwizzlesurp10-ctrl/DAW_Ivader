import { ok, err, type Result } from '../lib/result';
import {
  generateAudioRequestSchema,
  generateAudioResponseSchema,
  type GenerateAudioRequest,
  type GenerateAudioSuccess,
  GENERATE_AUDIO_DURATION_DEFAULT,
} from '../schemas/generateAudioSchema';

export type GenerateAudioResult = GenerateAudioSuccess;

const FETCH_TIMEOUT_MS = 300_000;

/**
 * Call POST /api/generate-audio (MiniMax Music 01 via Replicate).
 * @param prompt - Text description or lyrics (e.g. "Dark cyberpunk bassline").
 * @param durationSeconds - Optional; sent for client compatibility (MiniMax outputs ~60s).
 */
export async function generateAudioFromText(
  prompt: string,
  durationSeconds: number = GENERATE_AUDIO_DURATION_DEFAULT
): Promise<Result<GenerateAudioResult, Error>> {
  const parseResult = generateAudioRequestSchema.safeParse({
    prompt: prompt.trim(),
    duration: durationSeconds,
  });
  if (!parseResult.success) {
    const e = parseResult.error as { message?: string; issues?: Array<{ message?: string }> };
    const msg =
      (Array.isArray(e.issues) ? e.issues.map((i) => i.message).join('; ') : null) ||
      e.message ||
      'Invalid prompt';
    return err(new Error(msg));
  }
  const { prompt: trimmed, duration } = parseResult.data;

  const apiBase =
    typeof window !== 'undefined'
      ? window.location.origin
      : (process.env.VITE_APP_URL as string | undefined) ?? '';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const body: GenerateAudioRequest = { prompt: trimmed, duration };
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
            'Generate API not found. Run with "npm run dev:full" or "vercel dev" so /api/generate-audio is available (plain "npm run dev" does not serve the API).'
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
