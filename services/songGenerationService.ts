import type { SongData } from "../types";
import { parseSongResponse } from "../schemas/songSchema";
import { ok, err, type Result } from "../lib/result";

/**
 * Client for POST /api/generate-song (server-side OpenRouter proxy).
 *
 * The OpenRouter API key lives ONLY in the serverless route — it is never
 * present in the client bundle. This module replaced the old geminiService,
 * which called OpenRouter directly from the browser with a build-time key.
 */

const GENERATE_SONG_API = "/api/generate-song";
export const GENERATE_SONG_PROMPT_MAX_LENGTH = 500;

/**
 * Generate song data from a text prompt.
 * @param prompt - User description for the song
 * @returns Promise<Result<SongData, Error>> — ok(song) or err(Error)
 */
export async function generateSong(prompt: string): Promise<Result<SongData, Error>> {
  if (!prompt || prompt.trim().length === 0) {
    return err(new Error("Missing or empty prompt"));
  }
  if (prompt.length > GENERATE_SONG_PROMPT_MAX_LENGTH) {
    return err(new Error(`Prompt too long (max ${GENERATE_SONG_PROMPT_MAX_LENGTH} characters)`));
  }

  let res: Response;
  try {
    res = await fetch(GENERATE_SONG_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(new Error(`Song generation request failed: ${message}`));
  }

  const rawBody = await res.text();

  if (!res.ok) {
    if (res.status === 404) {
      return err(new Error("API route not found (404). Make sure the dev server is running with `vercel dev`."));
    }
    try {
      const body = JSON.parse(rawBody) as Record<string, unknown>;
      if (typeof body.error === "string") return err(new Error(body.error));
    } catch { /* not JSON — fall through */ }
    return err(new Error(`HTTP ${res.status}`));
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return err(new Error("Invalid response from server (could not parse JSON)"));
  }

  const content = data.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    return err(new Error("No data returned from model"));
  }

  // Strip accidental markdown fences, then validate with the song schema.
  const rawText = content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let raw: unknown;
  try {
    raw = JSON.parse(rawText) as unknown;
  } catch {
    return err(new Error("Model returned invalid JSON"));
  }

  return parseSongResponse(raw);
}
