import Replicate from 'replicate';

const MODELS: Record<string, string> = {
  'stable-audio-2.5': 'stability-ai/stable-audio-2.5',
  'stable-audio-open-1.0': 'stackadoc/stable-audio-open-1.0',
  'large': 'stability-ai/stable-audio-2.5',
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = process.env.REPLICATE_API_TOKEN;
    if (!token?.trim()) {
      return res.status(503).json({ error: 'REPLICATE_API_TOKEN is missing.' });
    }

    const body = req.body || {};
    const prompt = (body.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: 'Prompt is required.' });

    const model_version = body.model_version || 'stable-audio-2.5';
    const modelIdentifier = MODELS[model_version] || MODELS['stable-audio-2.5'];

    const replicate = new Replicate({ auth: token });

    console.log(`[API] Creating prediction for ${modelIdentifier}...`);

    // Use full model identifier string
    let prediction = await (replicate.predictions.create as any)({
      model: modelIdentifier,
      input: {
        prompt,
        duration: Math.min(Number(body.duration) || 15, 45),
        steps: Math.min(Number(body.steps) || 8, 8),
        cfg_scale: Number(body.cfg_scale) || 7
      },
    });

    console.log(`[API] Prediction created: ${prediction.id}. Status: ${prediction.status}`);

    // Poll for completion (Wait up to 50s total)
    let attempts = 0;
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && prediction.status !== 'canceled' && attempts < 25) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      prediction = await replicate.predictions.get(prediction.id);
      console.log(`[API] Polling... Status: ${prediction.status}`);
      attempts++;
    }

    if (prediction.status === 'succeeded') {
      const output = prediction.output;
      const url = typeof output === 'string' ? output : Array.isArray(output) ? output[0] : (output as any)?.url;
      
      if (url) {
        console.log('[API] Success! URL:', url);
        return res.status(200).json({ url });
      } else {
        console.error('[API] Model succeeded but returned no URL:', JSON.stringify(output));
        return res.status(502).json({ error: 'Model succeeded but returned no URL.', output });
      }
    }

    console.error('[API] Prediction failed:', prediction.status, prediction.error);
    return res.status(502).json({ 
      error: `Generation ${prediction.status}`, 
      replicate_error: prediction.error 
    });

  } catch (err: any) {
    console.error('[API] Fatal Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}