/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAuth, mockSafeValidateUIMessages, mockConvertToModelMessages, mockStreamText } =
  vi.hoisted(() => ({
    mockAuth: vi.fn(),
    mockSafeValidateUIMessages: vi.fn(),
    mockConvertToModelMessages: vi.fn(),
    mockStreamText: vi.fn(),
  }));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('ai', () => ({
  safeValidateUIMessages: mockSafeValidateUIMessages,
  convertToModelMessages: mockConvertToModelMessages,
  streamText: mockStreamText,
}));

describe('app/api/chat', () => {
  let POST: typeof import('./route').POST;

  beforeEach(async () => {
    vi.resetModules();
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockSafeValidateUIMessages.mockReturnValue({ success: true, data: [] });
    mockConvertToModelMessages.mockResolvedValue([]);
    mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: () => new Response('streamed', { status: 200 }),
    });

    const mod = await import('./route');
    POST = mod.POST;
  });

  function post(body: unknown): Promise<Response> {
    return POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
  }

  it('returns 401 when Clerk user is missing', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const response = await post({ messages: [] });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 for invalid request bodies', async () => {
    const response = await post({ message: 'missing messages array' });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid chat request' });
  });

  it('streams for authenticated valid UI messages', async () => {
    const messages = [
      {
        id: 'message_1',
        role: 'user',
        parts: [{ type: 'text', text: 'Help with a bassline' }],
      },
    ];
    mockSafeValidateUIMessages.mockReturnValue({ success: true, data: messages });
    mockConvertToModelMessages.mockResolvedValue([{ role: 'user', content: 'Help with a bassline' }]);

    const response = await post({ messages });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('streamed');
    expect(mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-5.5',
        messages: [{ role: 'user', content: 'Help with a bassline' }],
      })
    );
  });
});
