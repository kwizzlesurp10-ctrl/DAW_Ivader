import { GoogleGenAI, Type, Schema } from "@google/genai";
import { SongData, Track, NoteEvent } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const noteEventSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    note: { type: Type.STRING, description: "Note name e.g. C4, A#3. For drums use 'kick' or 'snare'" },
    startStep: { type: Type.INTEGER, description: "Step number 0-15" },
    durationSteps: { type: Type.INTEGER, description: "Duration in steps 1-16" },
  },
  required: ["note", "startStep", "durationSteps"],
};

const synthParamsSchema: Schema = {
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

const trackSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    name: { type: Type.STRING },
    type: { type: Type.STRING, enum: ["synth", "bass", "drums"] },
    notes: { type: Type.ARRAY, items: noteEventSchema },
    params: synthParamsSchema,
    muted: { type: Type.BOOLEAN },
  },
  required: ["id", "name", "type", "notes", "params"],
};

const songDataSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    bpm: { type: Type.INTEGER },
    tracks: { type: Type.ARRAY, items: trackSchema },
  },
  required: ["title", "bpm", "tracks"],
};

export const generateSong = async (prompt: string): Promise<SongData> => {
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
        responseSchema: songDataSchema,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No data returned");
    return JSON.parse(text) as SongData;
  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
};
