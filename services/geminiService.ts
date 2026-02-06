import { GoogleGenAI, Type, Schema } from "@google/genai";
import type { SongData } from "../types";
import { parseSongResponse } from "../schemas/songSchema";
import { ok, err, type Result } from "../lib/result";

/** Injected at build time by Vite from env.GEMINI_API_KEY (see vite.config define). */
function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY ?? process.env.API_KEY ?? "";
  return typeof key === "string" ? key : "";
}

const genaiNoteEventSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    note: { type: Type.STRING, description: "Note name e.g. C4, A#3. For drums use 'kick' or 'snare'" },
    startStep: { type: Type.INTEGER, description: "Step number 0-15" },
    durationSteps: { type: Type.INTEGER, description: "Duration in steps 1-16" },
  },
  required: ["note", "startStep", "durationSteps"],
};

const genaiSynthParamsSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    waveform: { type: Type.STRING, enum: ["sine", "square", "sawtooth", "triangle"] },
    attack: { type: Type.NUMBER },
    decay: { type: Type.NUMBER },
    sustain: { type: Type.NUMBER },
    release: { type: Type.NUMBER },
    filterCutoff: { type: Type.NUMBER },
    filterRes: { type: Type.NUMBER },
    gain: { type: Type.NUMBER },
  },
  required: ["waveform", "attack", "decay", "sustain", "release", "filterCutoff", "filterRes", "gain"],
};

const genaiTrackSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    name: { type: Type.STRING },
    type: { type: Type.STRING, enum: ["synth", "bass", "drums"] },
    notes: { type: Type.ARRAY, items: genaiNoteEventSchema },
    params: genaiSynthParamsSchema,
    muted: { type: Type.BOOLEAN },
  },
  required: ["id", "name", "type", "notes", "params"],
};

const genaiSongDataSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    bpm: { type: Type.INTEGER },
    tracks: { type: Type.ARRAY, items: genaiTrackSchema },
  },
  required: ["title", "bpm", "tracks"],
};

/**
 * Generate song data from Gemini API. Uses Result for explicit error handling.
 * @param prompt - User description for the song
 * @returns Promise<Result<SongData, Error>> — ok(song) or err(Error)
 */
export async function generateSong(prompt: string): Promise<Result<SongData, Error>> {
  const apiKey = getApiKey();
  if (!apiKey.trim()) {
    return err(new Error("Missing GEMINI_API_KEY. Set it in .env.local or environment."));
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-2.5-flash";
  const systemInstruction = `
    You are an expert music producer in a cyberpunk digital audio workstation.
    Create a 16-step loop based on the user's description.
    For 'bass', use lower octaves (C2-B3). For 'synth', use mid-high octaves (C4-C6).
    For 'drums', use notes 'kick' and 'snare'.
    Keep tracks simple but effective.
    Ensure tracks have reasonable ADSR envelopes.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: genaiSongDataSchema,
      },
    });

    const text = response.text;
    if (!text || typeof text !== "string") {
      return err(new Error("No data returned from model"));
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      return err(new Error("Model returned invalid JSON"));
    }

    return parseSongResponse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(new Error(`Gemini API error: ${message}`));
  }
}
