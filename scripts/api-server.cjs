const http = require('http');
const Replicate = require('replicate');
require('dotenv').config();

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/generate-audio') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        console.log('[Standalone API] Generating:', data.prompt);
        
        const token = process.env.REPLICATE_API_TOKEN;
        if (!token) {
          res.statusCode = 503;
          res.end(JSON.stringify({ error: 'Token missing' }));
          return;
        }

        const replicate = new Replicate({ auth: token });
        const output = await replicate.run(
          "stability-ai/stable-audio-2.5",
          {
            input: {
              prompt: data.prompt,
              duration: Math.min(data.duration || 15, 45),
              steps: 8,
              cfg_scale: 7
            }
          }
        );

        console.log('[Standalone API] Raw output:', JSON.stringify(output, null, 2));
        
        // Stability AI returns a string URL or an array containing the URL
        let url = null;
        if (typeof output === 'string' && output.startsWith('http')) {
          url = output;
        } else if (Array.isArray(output) && typeof output[0] === 'string' && output[0].startsWith('http')) {
          url = output[0];
        } else if (output && typeof output === 'object') {
          url = output.audio || output.url || (typeof output.toString === 'function' ? output.toString() : null);
        }
        
        if (typeof url === 'function') {
          console.log('[Standalone API] URL is a function, calling it...');
          url = url();
        }

        console.log('[Standalone API] Final URL:', url);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ url }));
      } catch (err) {
        console.error('[Standalone API] Error:', err.message);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else {
    res.statusCode = 404;
    res.end();
  }
});

const PORT = 3099;
server.listen(PORT, () => {
  console.log(`[Standalone API] Running on http://localhost:${PORT}`);
});
