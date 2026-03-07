import type { SongData } from "../types";
import { parseSongResponse } from "../schemas/songSchema";
import { ok, err, type Result } from "../lib/result";

const OPEN_ROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.0-flash-exp";

/** Injected at build time by Vite from env.OPEN_ROUTER_API_KEY (see vite.config define). */
function getApiKey(): string {
  const key = process.env.OPEN_ROUTER_API_KEY ?? process.env.API_KEY ?? "";
  return typeof key === "string" ? key : "";
}

const SYSTEM_INSTRUCTION = `You are an expert music producer in a cyberpunk digital audio workstation.
Create a 16-step loop based on the user's description.
Respond with a single JSON object only (no markdown, no code fence), with this exact shape:
{
  "title": "string",
  "bpm": number (1-999),
  "tracks": [
    {
      "id": "string (e.g. t1)",
      "name": "string",
      "type": "synth" | "bass" | "drums",
      "notes": [{ "note": "C4 or kick/snare for drums", "startStep": 0-15, "durationSteps": 1-16 }],
      "params": {
        "waveform": "sine" | "square" | "sawtooth" | "triangle",
        "attack": number, "decay": number, "sustain": number, "release": number,
        "filterCutoff": number, "filterRes": number, "gain": number
      },
      "muted": false
    }
  ]
}
For 'bass', use lower octaves (C2-B3). For 'synth', use mid-high (C4-C6). For 'drums', use 'kick' and 'snare'.
Keep tracks simple but effective. Ensure reasonable ADSR values.`;

/**
 * Generate song data via OpenRouter (e.g. Gemini). Uses Result for explicit error handling.
 * @param prompt - User description for the song
 * @returns Promise<Result<SongData, Error>> — ok(song) or err(Error)
 */
export async function generateSong(prompt: string): Promise<Result<SongData, Error>> {
  const apiKey = getApiKey();
  if (!apiKey.trim()) {
    return err(new Error("Missing OPEN_ROUTER_API_KEY. Set it in .env.local or environment."));
  }

  try {
    const res = await fetch(OPEN_ROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return err(new Error(`OpenRouter API error (${res.status}): ${text.slice(0, 200)}`));
    }

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content;
    if (!text || typeof text !== "string") {
      return err(new Error("No data returned from model"));
    }

    const rawText = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    let raw: unknown;
    try {
      raw = JSON.parse(rawText) as unknown;
    } catch {
      return err(new Error("Model returned invalid JSON"));
    }

    return parseSongResponse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(new Error(`OpenRouter API error: ${message}`));
  }
}
