import Replicate from 'replicate';
import { parseGenerateAudioRequest } from '../schemas/generateAudioSchema';

/** Stability AI Stable Audio models on Replicate. */
const MODELS: Record<string, string> = {
  'stable-audio-2.5': 'stability-ai/stable-audio-2.5',
  'stable-audio-open-1.0': 'stackadoc/stable-audio-open-1.0',
};

/**
 * Vercel serverless: POST /api/generate-audio
 */
export const config = { 
  maxDuration: 120 
};

export default async function handler(req: any, res: any) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token?.trim()) {
      console.error('[generate-audio] Missing REPLICATE_API_TOKEN');
      return res.status(503).json({
        error: 'REPLICATE_API_TOKEN is not set in Vercel environment variables.',
      });
    }

    const parseResult = parseGenerateAudioRequest(req.body);
    if (!parseResult.ok) {
      return res.status(400).json({ error: parseResult.error });
    }

    const { prompt, duration, model_version, negative_prompt, steps, cfg_scale } = parseResult.data;
    const modelIdentifier = MODELS[model_version];

    if (!modelIdentifier) {
      return res.status(400).json({ error: `Invalid model version: ${model_version}` });
    }

    console.log(`[generate-audio] Starting generation with ${model_version}...`);
    
    let output: unknown;
    try {
      const replicate = new Replicate({ auth: token });
      output = await replicate.run(modelIdentifier, {
        input: { 
          prompt, 
          duration,
          negative_prompt,
          steps,
          cfg_scale
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[generate-audio] Generation failed:', message);
      return res.status(502).json({ error: `Generation failed: ${message}` });
    }

    const url = typeof output === 'string'
      ? output
      : Array.isArray(output)
        ? output[0]
        : (output as any)?.url;

    if (!url || typeof url !== 'string') {
      console.error('[generate-audio] No URL returned from Replicate', output);
      return res.status(502).json({ error: 'Model did not return an audio URL' });
    }

    console.log('[generate-audio] Success:', url);
    return res.status(200).json({ url });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[generate-audio] Fatal error:', message);
    return res.status(500).json({ error: `Server error: ${message}` });
  }
}