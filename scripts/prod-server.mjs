#!/usr/bin/env node
/**
 * Production server: serves the built SPA from dist/ and handles
 * /api/generate-audio via the compiled serverless function handler.
 *
 * Usage:
 *   npm run build          # build SPA + compile API handler
 *   npm start              # start this server
 *
 * Or combined:
 *   npm run build && npm start
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST_DIR = join(__dirname, '..', 'dist');
const PORT = parseInt(process.env.PORT || '3000', 10);

// Dynamically import the compiled API handler (built by npm run build)
let generateAudioHandler;
try {
  const mod = await import(join(DIST_DIR, 'api', 'generate-audio.mjs'));
  generateAudioHandler = mod.default;
  console.log('[prod-server] API handler loaded: /api/generate-audio');
} catch (err) {
  console.warn('[prod-server] Warning: could not load API handler.', err.message);
  console.warn('[prod-server] Run "npm run build" first. API routes will return 503.');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

/** Read the request body as a string. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk.toString(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** Convert Node.js IncomingMessage → Web Request. */
async function toWebRequest(req) {
  const url = `http://${req.headers.host || `localhost:${PORT}`}${req.url}`;
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  const init = { method: req.method || 'GET', headers };
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    init.body = await readBody(req);
  }
  return new Request(url, init);
}

/** Write a Web Response back to Node.js ServerResponse. */
async function writeWebResponse(webResponse, res) {
  const headers = {};
  webResponse.headers.forEach((value, key) => { headers[key] = value; });
  res.writeHead(webResponse.status, headers);
  res.end(await webResponse.text());
}

/** Try to serve a static file from dist/. Returns true if served. */
async function serveStatic(pathname, res) {
  const safePath = pathname.replace(/\.\./g, '');
  const filePath = join(DIST_DIR, safePath === '/' ? 'index.html' : safePath);
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return false;
    const content = await readFile(filePath);
    const mime = MIME_TYPES[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // ---- API routes ----
  if (pathname.startsWith('/api/')) {
    if (pathname === '/api/generate-audio') {
      if (!generateAudioHandler) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'API handler not loaded. Run npm run build first.' }));
        return;
      }
      try {
        const webRequest = await toWebRequest(req);
        const webResponse = await generateAudioHandler(webRequest);
        await writeWebResponse(webResponse, res);
      } catch (err) {
        console.error('[prod-server] API error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
      return;
    }
    // Unknown API route
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API route not found' }));
    return;
  }

  // ---- Static files from dist/ ----
  if (await serveStatic(pathname, res)) return;

  // ---- SPA fallback: serve index.html for unmatched routes ----
  const indexPath = join(DIST_DIR, 'index.html');
  try {
    const content = await readFile(indexPath);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not found — run npm run build first');
  }
});

server.listen(PORT, () => {
  console.log(`\n  Production server running:\n`);
  console.log(`  ➜  Local:  http://localhost:${PORT}/`);
  console.log(`  ➜  API:    http://localhost:${PORT}/api/generate-audio`);
  console.log(`  ➜  SPA:    dist/\n`);
});
