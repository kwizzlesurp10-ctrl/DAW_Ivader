import Replicate from 'replicate';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const token = process.env.REPLICATE_API_TOKEN;
  console.log('Token exists:', !!token);
  if (!token) return;

  const replicate = new Replicate({ auth: token });
  try {
    console.log('Creating prediction...');
    const prediction = await (replicate.predictions.create as any)({
      model: 'stability-ai/stable-audio-2.5',
      input: {
        prompt: 'test',
        duration: 5,
        steps: 8,
        cfg_scale: 7
      },
    });
    console.log('Prediction:', prediction.id, prediction.status);
  } catch (err) {
    console.error('Error:', err);
  }
}

test();
