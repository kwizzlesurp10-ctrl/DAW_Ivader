/**
 * HuggingFace text and image generation API handler.
 *
 * POST /api/hf-generate
 *   Body: { type: "text" | "image", prompt: string }
 *   Returns:
 *     - type "text"  → { text: string }
 *     - type "image" → { dataUrl: string }   (base64 data URL of the generated image)
 *
 * This endpoint is entirely separate from /api/generate-audio (Replicate audio).
 * It uses the HuggingFace Inference API exclusively.
 *
 * Text model:  mistralai/Mistral-7B-Instruct-v0.3 (OpenAI-compatible chat endpoint)
 * Image model: black-forest-labs/FLUX.1-schnell    (text-to-image)
 */

import { parseHfGenerateRequest } from '../schemas/hfGenerateSchema.js';

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

const HF_TEXT_MODEL = 'mistralai/Mistral-7B-Instruct-v0.3';
const HF_IMAGE_MODEL = 'black-forest-labs/FLUX.1-schnell';

const HF_BASE_URL = 'https://api-inference.huggingface.co/models';

// ---------------------------------------------------------------------------
// Loose creative system prompt for text generation
// ---------------------------------------------------------------------------

const CREATIVE_SYSTEM_PROMPT =
  'You are a free-spirited, unbound creative AI collaborating inside a cyberpunk digital audio workstation. ' +
  'Generate vivid, imaginative, experimental content based on the user\'s prompt. ' +
  'Be poetic, abstract, atmospheric, and unrestrained. ' +
  'There are no rules — only creative expression. ' +
  'Keep your response focused and evocative, around 150-300 words.';

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(request: Request): Promise<Response> {
  if (!request || typeof request !== 'object') {
    return jsonResponse({ error: 'Invalid request' }, 500);
  }
  try {
    return await handleRequest(request);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e ?? 'Unknown error');
    console.error('[hf-generate] unhandled:', message);
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

  const token = process.env.HUGGINGFACE_API_TOKEN?.trim();
  if (!token) {
    return jsonResponse(
      { error: 'HUGGINGFACE_API_TOKEN is not configured. Set it in your environment variables.' },
      503
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = parseHfGenerateRequest(rawBody);
  if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400);

  const { type, prompt } = parsed.data;

  if (type === 'text') {
    return handleTextGeneration(token, prompt);
  }
  return handleImageGeneration(token, prompt);
}

// ---------------------------------------------------------------------------
// Text generation — Mistral-7B-Instruct via OpenAI-compatible chat endpoint
// ---------------------------------------------------------------------------

async function handleTextGeneration(token: string, prompt: string): Promise<Response> {
  console.log(`[hf-generate] text: "${prompt.slice(0, 80)}..."`);

  let response: Response;
  try {
    response = await fetch(`${HF_BASE_URL}/${HF_TEXT_MODEL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: HF_TEXT_MODEL,
        messages: [
          { role: 'system', content: CREATIVE_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: 400,
        stream: false,
      }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[hf-generate] text fetch failed:', message);
    return jsonResponse({ error: `Text generation failed: ${message}` }, 502);
  }

  if (!response.ok) {
    const body = await response.text();
    console.error(`[hf-generate] text API error (${response.status}):`, body.slice(0, 200));
    return jsonResponse({ error: `Text generation failed (${response.status}): ${body.slice(0, 200)}` }, 502);
  }

  type ChatResponse = {
    choices?: Array<{ message?: { content?: string } }>;
  };

  let data: ChatResponse;
  try {
    data = (await response.json()) as ChatResponse;
  } catch {
    return jsonResponse({ error: 'Model returned invalid JSON' }, 502);
  }

  const text = data.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') {
    return jsonResponse({ error: 'Model returned no text content' }, 502);
  }

  return jsonResponse({ text: text.trim() }, 200);
}

// ---------------------------------------------------------------------------
// Image generation — FLUX.1-schnell (text-to-image, returns binary)
// ---------------------------------------------------------------------------

async function handleImageGeneration(token: string, prompt: string): Promise<Response> {
  console.log(`[hf-generate] image: "${prompt.slice(0, 80)}..."`);

  let response: Response;
  try {
    response = await fetch(`${HF_BASE_URL}/${HF_IMAGE_MODEL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: prompt }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[hf-generate] image fetch failed:', message);
    return jsonResponse({ error: `Image generation failed: ${message}` }, 502);
  }

  if (!response.ok) {
    const body = await response.text();
    console.error(`[hf-generate] image API error (${response.status}):`, body.slice(0, 200));
    return jsonResponse({ error: `Image generation failed (${response.status}): ${body.slice(0, 200)}` }, 502);
  }

  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const dataUrl = `data:${contentType};base64,${base64}`;

  return jsonResponse({ dataUrl }, 200);
}
