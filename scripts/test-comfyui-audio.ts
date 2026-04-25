import { existsSync, readFileSync } from 'node:fs';
import { generateAudioWithComfyUi, getComfyUiConfig } from '../lib/comfyAudioProvider';
import type { GenerateAudioRequest } from '../schemas/generateAudioSchema';

function loadDotEnv(): void {
  if (!existsSync('.env')) return;

  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key]) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

async function assertComfyUiReachable(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/system_stats`);
  if (!response.ok) {
    throw new Error(`ComfyUI /system_stats failed with HTTP ${response.status}`);
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const config = getComfyUiConfig();

  console.info(`[comfyui] checking ${config.baseUrl}`);
  await assertComfyUiReachable(config.baseUrl);

  const request: GenerateAudioRequest = {
    prompt: process.argv.slice(2).join(' ').trim() || 'short dark cyberpunk drum loop',
    negative_prompt: '',
    duration: 4,
    steps: 8,
    cfg_scale: 7,
    model_version: 'stable-audio-2.5',
    backend: 'comfyui',
  };

  console.info(`[comfyui] submitting workflow ${config.workflowPath}`);
  const result = await generateAudioWithComfyUi(request, { config });
  console.info(`[comfyui] prompt_id=${result.promptId}`);
  console.info(`[comfyui] audio_url=${result.url}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[comfyui] ${message}`);
  process.exit(1);
});
