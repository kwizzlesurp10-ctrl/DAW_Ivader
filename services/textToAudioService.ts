import { ok, err, type Result } from '../lib/result';

export interface GenerateAudioResult {
  url: string;
}

/**
 * Call the app's serverless API to generate audio from text (MusicGen).
 * In production the API runs on the same origin; in dev use Vite proxy or full URL.
 */
export async function generateAudioFromText(
  prompt: string,
  durationSeconds: number = 8
): Promise<Result<GenerateAudioResult, Error>> {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return err(new Error('Prompt is required'));
  }

  const apiBase =
    typeof window !== 'undefined'
      ? window.location.origin
      : process.env.VITE_APP_URL ?? '';

  try {
    const res = await fetch(`${apiBase}/api/generate-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: trimmed, duration: durationSeconds }),
    });

    const data = (await res.json()) as { url?: string; error?: string };

    if (!res.ok) {
      return err(new Error(data.error ?? `HTTP ${res.status}`));
    }

    if (!data.url || typeof data.url !== 'string') {
      return err(new Error('Invalid response: no audio URL'));
    }

    return ok({ url: data.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(new Error(message));
  }
}
