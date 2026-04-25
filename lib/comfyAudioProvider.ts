import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { z } from 'zod';
import type { GenerateAudioRequest } from '../schemas/generateAudioSchema';

const DEFAULT_COMFYUI_BASE_URL = 'http://127.0.0.1:8188';
const DEFAULT_WORKFLOW_PATH = 'workflows/comfy-audio-api.json';
const DEFAULT_PROMPT_INPUT_KEY = 'text';
const PROMPT_INPUT_CANDIDATES = ['text', 'prompt', 'positive', 'description'] as const;

const promptResponseSchema = z.object({
  prompt_id: z.string().min(1),
});

const fileOutputSchema = z.object({
  filename: z.string().min(1),
  subfolder: z.string().optional().default(''),
  type: z.string().optional().default('output'),
});

export class ComfyUiError extends Error {
  constructor(
    message: string,
    readonly status: number = 502
  ) {
    super(message);
    this.name = 'ComfyUiError';
  }
}

type JsonObject = Record<string, unknown>;

export type ComfyUiConfig = {
  baseUrl: string;
  workflowPath: string;
  promptNodeId?: string;
  promptInputKey: string;
  negativePromptNodeId?: string;
  negativePromptInputKey: string;
  pollIntervalMs: number;
  pollAttempts: number;
};

export type ComfyUiGenerationResult = {
  url: string;
  promptId: string;
};

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

export function getComfyUiConfig(env: NodeJS.ProcessEnv = process.env): ComfyUiConfig {
  return {
    baseUrl: (env.COMFYUI_BASE_URL?.trim() || DEFAULT_COMFYUI_BASE_URL).replace(/\/+$/, ''),
    workflowPath: env.COMFYUI_AUDIO_WORKFLOW_PATH?.trim() || DEFAULT_WORKFLOW_PATH,
    promptNodeId: env.COMFYUI_PROMPT_NODE_ID?.trim() || undefined,
    promptInputKey: env.COMFYUI_PROMPT_INPUT_KEY?.trim() || DEFAULT_PROMPT_INPUT_KEY,
    negativePromptNodeId: env.COMFYUI_NEGATIVE_PROMPT_NODE_ID?.trim() || undefined,
    negativePromptInputKey:
      env.COMFYUI_NEGATIVE_PROMPT_INPUT_KEY?.trim() || DEFAULT_PROMPT_INPUT_KEY,
    pollIntervalMs: asPositiveInteger(env.COMFYUI_POLL_INTERVAL_MS, 1000),
    pollAttempts: asPositiveInteger(env.COMFYUI_POLL_ATTEMPTS, 90),
  };
}

export async function loadComfyWorkflow(workflowPath: string): Promise<JsonObject> {
  const scopedWorkflowPath = normalize(workflowPath)
    .replace(/^workflows[\\/]/, '')
    .replace(/^(\.\.[\\/])+/, '');
  const absolutePath = join(process.cwd(), 'workflows', scopedWorkflowPath);
  let raw: string;
  try {
    raw = await readFile(absolutePath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ComfyUiError(
      `ComfyUI workflow file not found at ${workflowPath}: ${message}`,
      503
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ComfyUiError(`ComfyUI workflow file is not valid JSON: ${workflowPath}`, 503);
  }

  if (!isRecord(parsed)) {
    throw new ComfyUiError('ComfyUI workflow must be a JSON object', 503);
  }

  const nodeIds = Object.keys(parsed).filter((key) => isRecord(parsed[key]));
  if (nodeIds.length === 0) {
    throw new ComfyUiError(
      'ComfyUI workflow has no API nodes. Export the workflow in API format and replace workflows/comfy-audio-api.json.',
      503
    );
  }

  return parsed;
}

function cloneWorkflow(workflow: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(workflow)) as JsonObject;
}

function setNodeInput(
  workflow: JsonObject,
  nodeId: string,
  inputKey: string,
  value: string
): boolean {
  const node = workflow[nodeId];
  if (!isRecord(node)) return false;
  const inputs = node.inputs;
  if (!isRecord(inputs)) return false;
  inputs[inputKey] = value;
  return true;
}

function setFirstMatchingPromptInput(workflow: JsonObject, value: string): boolean {
  for (const node of Object.values(workflow)) {
    if (!isRecord(node) || !isRecord(node.inputs)) continue;
    for (const key of PROMPT_INPUT_CANDIDATES) {
      if (typeof node.inputs[key] === 'string') {
        node.inputs[key] = value;
        return true;
      }
    }
  }
  return false;
}

export function prepareComfyWorkflow(
  workflow: JsonObject,
  request: GenerateAudioRequest,
  config: ComfyUiConfig
): JsonObject {
  const cloned = cloneWorkflow(workflow);
  const promptInjected = config.promptNodeId
    ? setNodeInput(cloned, config.promptNodeId, config.promptInputKey, request.prompt)
    : setFirstMatchingPromptInput(cloned, request.prompt);

  if (!promptInjected) {
    throw new ComfyUiError(
      'ComfyUI workflow prompt input was not found. Set COMFYUI_PROMPT_NODE_ID and COMFYUI_PROMPT_INPUT_KEY for your exported workflow.',
      503
    );
  }

  if (request.negative_prompt && config.negativePromptNodeId) {
    setNodeInput(
      cloned,
      config.negativePromptNodeId,
      config.negativePromptInputKey,
      request.negative_prompt
    );
  }

  return cloned;
}

async function postPrompt(
  workflow: JsonObject,
  config: ComfyUiConfig,
  fetchFn: typeof fetch
): Promise<string> {
  let response: Response;
  try {
    response = await fetchFn(`${config.baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: workflow,
        client_id: `daw_ivader_${crypto.randomUUID()}`,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ComfyUiError(`ComfyUI is not reachable at ${config.baseUrl}: ${message}`, 503);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new ComfyUiError(
      `ComfyUI rejected the workflow (${response.status}): ${text.slice(0, 500)}`,
      502
    );
  }

  const parsed = promptResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ComfyUiError('ComfyUI /prompt response did not include prompt_id', 502);
  }

  return parsed.data.prompt_id;
}

async function getHistory(
  promptId: string,
  config: ComfyUiConfig,
  fetchFn: typeof fetch
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(`${config.baseUrl}/history/${encodeURIComponent(promptId)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ComfyUiError(`ComfyUI history request failed: ${message}`, 503);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new ComfyUiError(
      `ComfyUI history request failed (${response.status}): ${text.slice(0, 500)}`,
      502
    );
  }

  return response.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function buildViewUrl(baseUrl: string, file: z.infer<typeof fileOutputSchema>): string {
  const params = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder,
    type: file.type,
  });
  return `${baseUrl}/view?${params.toString()}`;
}

function getHistoryEntry(history: unknown, promptId: string): JsonObject | null {
  if (!isRecord(history)) return null;
  const keyed = history[promptId];
  if (isRecord(keyed)) return keyed;
  return isRecord(history.outputs) ? history : null;
}

export function extractComfyAudioUrl(
  history: unknown,
  promptId: string,
  baseUrl: string
): string | null {
  const entry = getHistoryEntry(history, promptId);
  if (!entry || !isRecord(entry.outputs)) return null;

  for (const output of Object.values(entry.outputs)) {
    if (!isRecord(output)) continue;

    for (const value of Object.values(output)) {
      if (typeof value === 'string' && value.startsWith('http')) {
        return value;
      }

      if (!Array.isArray(value)) continue;
      for (const item of value) {
        if (typeof item === 'string' && item.startsWith('http')) {
          return item;
        }
        const parsedFile = fileOutputSchema.safeParse(item);
        if (parsedFile.success) {
          return buildViewUrl(baseUrl, parsedFile.data);
        }
      }
    }
  }

  return null;
}

export async function generateAudioWithComfyUi(
  request: GenerateAudioRequest,
  options: {
    config?: ComfyUiConfig;
    fetchFn?: typeof fetch;
  } = {}
): Promise<ComfyUiGenerationResult> {
  const config = options.config ?? getComfyUiConfig();
  const fetchFn = options.fetchFn ?? fetch;
  const workflow = await loadComfyWorkflow(config.workflowPath);
  const preparedWorkflow = prepareComfyWorkflow(workflow, request, config);
  const promptId = await postPrompt(preparedWorkflow, config, fetchFn);

  for (let attempt = 0; attempt < config.pollAttempts; attempt += 1) {
    const history = await getHistory(promptId, config, fetchFn);
    const url = extractComfyAudioUrl(history, promptId, config.baseUrl);
    if (url) {
      return { url, promptId };
    }
    await sleep(config.pollIntervalMs);
  }

  throw new ComfyUiError(
    `ComfyUI did not produce an audio output for prompt ${promptId} before polling timed out`,
    504
  );
}
