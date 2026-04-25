import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ComfyUiError,
  extractComfyAudioUrl,
  generateAudioWithComfyUi,
  getComfyUiConfig,
  prepareComfyWorkflow,
  type ComfyUiConfig,
} from './comfyAudioProvider';
import type { GenerateAudioRequest } from '../schemas/generateAudioSchema';

const baseRequest: GenerateAudioRequest = {
  prompt: 'dark bass',
  negative_prompt: '',
  duration: 15,
  steps: 8,
  cfg_scale: 7,
  model_version: 'stable-audio-2.5',
  backend: 'comfyui',
};

const tempDirs: string[] = [];

async function writeWorkflow(workflow: unknown): Promise<string> {
  await mkdir(join(process.cwd(), 'workflows'), { recursive: true });
  const dir = await mkdtemp(join(process.cwd(), 'workflows', '.test-'));
  tempDirs.push(dir);
  const path = join(dir, 'workflow.json');
  await writeFile(path, JSON.stringify(workflow), 'utf8');
  return relative(process.cwd(), path);
}

function createConfig(workflowPath: string): ComfyUiConfig {
  return {
    ...getComfyUiConfig({}),
    baseUrl: 'http://127.0.0.1:8188',
    workflowPath,
    pollAttempts: 1,
    pollIntervalMs: 1,
  };
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('comfyAudioProvider', () => {
  it('injects prompt into configured node input', () => {
    const workflow = {
      '1': {
        inputs: {
          text: '',
        },
      },
    };

    const prepared = prepareComfyWorkflow(workflow, baseRequest, {
      ...createConfig('unused.json'),
      promptNodeId: '1',
      promptInputKey: 'text',
    });

    expect(prepared).toMatchObject({
      '1': {
        inputs: {
          text: 'dark bass',
        },
      },
    });
    expect(workflow['1'].inputs.text).toBe('');
  });

  it('extracts a ComfyUI /view URL from history output files', () => {
    const url = extractComfyAudioUrl(
      {
        prompt_123: {
          outputs: {
            '9': {
              audio: [{ filename: 'test.wav', subfolder: 'audio', type: 'output' }],
            },
          },
        },
      },
      'prompt_123',
      'http://127.0.0.1:8188'
    );

    expect(url).toBe(
      'http://127.0.0.1:8188/view?filename=test.wav&subfolder=audio&type=output'
    );
  });

  it('submits workflow and returns generated audio URL', async () => {
    const workflowPath = await writeWorkflow({
      '1': {
        inputs: {
          text: '',
        },
      },
    });
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ prompt_id: 'prompt_123' }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            prompt_123: {
              outputs: {
                '9': {
                  files: [{ filename: 'loop.wav', subfolder: '', type: 'output' }],
                },
              },
            },
          }),
          { status: 200 }
        )
      );

    const result = await generateAudioWithComfyUi(baseRequest, {
      config: createConfig(workflowPath),
      fetchFn,
    });

    expect(result).toEqual({
      promptId: 'prompt_123',
      url: 'http://127.0.0.1:8188/view?filename=loop.wav&subfolder=&type=output',
    });
  });

  it('fails when ComfyUI prompt response omits prompt_id', async () => {
    const workflowPath = await writeWorkflow({
      '1': {
        inputs: {
          text: '',
        },
      },
    });
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

    await expect(
      generateAudioWithComfyUi(baseRequest, {
        config: createConfig(workflowPath),
        fetchFn,
      })
    ).rejects.toThrow(ComfyUiError);
  });
});
