const Replicate = require('replicate');
require('dotenv').config();

async function test() {
  const token = process.env.REPLICATE_API_TOKEN;
  console.log('Token exists:', !!token);
  if (!token) return;

  const replicate = new Replicate({ auth: token });
  try {
    console.log('Creating prediction...');
    const prediction = await replicate.predictions.create({
      version: "f42da22c5496a75f8f8303f274883446002f2329b19e4871e9803b9004576356", // Stable Audio 2.5 version
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
