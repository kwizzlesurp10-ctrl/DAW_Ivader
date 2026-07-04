/**
 * POST /api/generate-song — server-side proxy for AI song-structure generation.
 *
 * Holds OPEN_ROUTER_API_KEY server-side so it is never exposed in the client
 * bundle (see vite.config.ts note). The client sends { prompt } and receives
 * { content } — the raw model text — which it validates with parseSongResponse.
 *
 * Mirrors the structure of api/generate-audio.ts (CORS, jsonResponse, Result-ish
 * error bodies) for consistency.
 */

const OPEN_ROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'google/gemini-2.0-flash-exp';
const PROMPT_MAX_LENGTH = 500;

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

export const config = { maxDuration: 60 };

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(obj: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export default async function handler(request: Request): Promise<Response> {
  try {
    return await handleRequest(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
    console.error('[generate-song] unhandled:', message);
    return jsonResponse({ error: `Internal error: ${message}` }, 500);
  }
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const apiKey = process.env.OPEN_ROUTER_API_KEY?.trim();
  if (!apiKey) {
    return jsonResponse(
      { error: 'AI song generation not configured. Set OPEN_ROUTER_API_KEY in your environment variables.' },
      503
    );
  }

  let rawBody: unknown;
  try { rawBody = await request.json(); }
  catch { return jsonResponse({ error: 'Invalid JSON body' }, 400); }

  const prompt =
    rawBody && typeof rawBody === 'object' && typeof (rawBody as { prompt?: unknown }).prompt === 'string'
      ? ((rawBody as { prompt: string }).prompt).trim()
      : '';

  if (!prompt) return jsonResponse({ error: 'Missing or empty prompt' }, 400);
  if (prompt.length > PROMPT_MAX_LENGTH) {
    return jsonResponse({ error: `Prompt too long (max ${PROMPT_MAX_LENGTH} characters)` }, 400);
  }

  let res: globalThis.Response;
  try {
    res = await fetch(OPEN_ROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[generate-song] upstream fetch failed:', message);
    return jsonResponse({ error: `Song generation failed: ${message}` }, 502);
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    console.error(`[generate-song] upstream HTTP ${res.status}:`, bodyText.slice(0, 500));
    return jsonResponse({ error: `Song generation failed: upstream HTTP ${res.status}` }, 502);
  }

  let data: unknown;
  try { data = await res.json(); }
  catch { return jsonResponse({ error: 'Invalid response from upstream (not JSON)' }, 502); }

  const content = extractContent(data);
  if (!content) {
    return jsonResponse({ error: 'Upstream returned no content' }, 502);
  }

  return jsonResponse({ content }, 200);
}

/** Extract choices[0].message.content from an OpenAI-style chat completion. */
function extractContent(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: unknown })?.message;
  if (!message || typeof message !== 'object') return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' && content.trim().length > 0 ? content : null;
}
