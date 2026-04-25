import { auth } from '@clerk/nextjs/server';
import Replicate from 'replicate';
import { NextResponse } from 'next/server';
import {
  ComfyUiError,
  generateAudioWithComfyUi,
} from '../../../lib/comfyAudioProvider';
import {
  parseGenerateAudioRequest,
  type StableAudioModelVersion,
} from '../../../schemas/generateAudioSchema';

export const runtime = 'nodejs';
export const maxDuration = 300;

const modelMap = {
  'stable-audio-2.5': 'stability-ai/stable-audio-2.5',
  'stable-audio-open-1.0': 'stability-ai/stable-audio-open-1.0',
} as const satisfies Record<StableAudioModelVersion, `${string}/${string}`>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getHttpUrl(value: unknown): string | null {
  if (typeof value === 'string' && value.startsWith('http')) {
    return value;
  }

  if (value instanceof URL) {
    return value.href;
  }

  if (typeof value === 'function') {
    const evaluated = (value as () => unknown)();
    return getHttpUrl(evaluated);
  }

  if (isRecord(value) && typeof value.href === 'string' && value.href.startsWith('http')) {
    return value.href;
  }

  return null;
}

export function extractAudioUrl(output: unknown): string | null {
  const directUrl = getHttpUrl(output);
  if (directUrl) return directUrl;

  if (Array.isArray(output)) {
    for (const item of output) {
      const itemUrl = extractAudioUrl(item);
      if (itemUrl) return itemUrl;
    }
    return null;
  }

  if (!isRecord(output)) {
    return null;
  }

  for (const key of ['audio', 'url', 'href']) {
    const nestedUrl = getHttpUrl(output[key]);
    if (nestedUrl) return nestedUrl;
  }

  if (typeof output.toString === 'function') {
    const stringValue = output.toString();
    if (stringValue.startsWith('http')) return stringValue;
  }

  return null;
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const body =
    isRecord(rawBody) && rawBody.model_version === 'large'
      ? { ...rawBody, model_version: 'stable-audio-2.5' }
      : rawBody;

  const validation = parseGenerateAudioRequest(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { prompt, duration, model_version, negative_prompt, steps, cfg_scale, backend } =
    validation.data;

  try {
    console.info('[generate-audio] authenticated request', {
      userId,
      backend,
      modelVersion: model_version,
      duration,
    });

    if (backend === 'comfyui') {
      const result = await generateAudioWithComfyUi(validation.data);
      return NextResponse.json({ url: result.url });
    }

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return NextResponse.json(
        {
          error:
            'REPLICATE_API_TOKEN is missing on the server. Configure it in environment variables.',
        },
        { status: 503 }
      );
    }

    const replicate = new Replicate({ auth: token });
    const modelId = modelMap[model_version];
    const output: unknown = await replicate.run(modelId, {
      input: {
        prompt,
        negative_prompt,
        duration,
        steps,
        cfg_scale,
      },
    });

    const audioUrl = extractAudioUrl(output);
    if (!audioUrl) {
      return NextResponse.json(
        { error: 'Replicate succeeded but returned no valid audio URL' },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: audioUrl });
  } catch (error) {
    if (error instanceof ComfyUiError) {
      console.error('[generate-audio] ComfyUI error:', error);
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('[generate-audio] Fatal error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
