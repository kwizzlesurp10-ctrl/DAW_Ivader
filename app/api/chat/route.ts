import { auth } from '@clerk/nextjs/server';
import {
  convertToModelMessages,
  safeValidateUIMessages,
  streamText,
  type UIMessage,
} from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 30;

const chatRequestSchema = z.object({
  messages: z.array(z.unknown()),
});

const SYSTEM_PROMPT = `You are the authenticated user's DAW copilot.
Help with music production, prompt refinement, arrangement, sound design, and concise troubleshooting.
Keep responses practical and focused on the current cyberpunk browser DAW workflow.`;

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

  const parsedBody = chatRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Invalid chat request' }, { status: 400 });
  }

  const validatedMessages = await safeValidateUIMessages<UIMessage>({
    messages: parsedBody.data.messages,
  });
  if (!validatedMessages.success) {
    return NextResponse.json({ error: validatedMessages.error.message }, { status: 400 });
  }

  console.info('[chat] authenticated request', {
    userId,
    messages: validatedMessages.data.length,
  });

  const result = streamText({
    model: 'openai/gpt-5.5',
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(validatedMessages.data),
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      if (error instanceof Error) return error.message;
      if (typeof error === 'string') return error;
      return 'AI chat failed';
    },
  });
}
