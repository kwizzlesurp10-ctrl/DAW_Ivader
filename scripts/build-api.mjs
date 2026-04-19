#!/usr/bin/env node
/**
 * Compile the Vercel serverless API handler(s) into dist/api/ so they
 * can be imported by the production server (scripts/prod-server.mjs).
 *
 * Uses esbuild (bundled with Vite) to bundle each handler as an ESM
 * module with npm packages kept external (resolved at runtime).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

mkdirSync('dist/api', { recursive: true });

console.log('[build-api] Compiling api/generate-audio.ts → dist/api/generate-audio.mjs');
execSync(
  'npx esbuild api/generate-audio.ts --bundle --platform=node --format=esm --outfile=dist/api/generate-audio.mjs --packages=external',
  { stdio: 'inherit' }
);
console.log('[build-api] Done.');
