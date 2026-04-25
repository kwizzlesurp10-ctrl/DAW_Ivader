'use client';

import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Activity, Bot, Send, Square } from 'lucide-react';

function getMessageText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

export function AiChatPanel() {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  const isBusy = status === 'submitted' || status === 'streaming';

  return (
    <section className="cyber-panel w-full min-w-0 shrink-0 p-3 bg-black/90 border-[#39ff14]/40">
      <div className="mb-3 flex items-center justify-between border-b border-[#39ff14]/20 pb-2">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#39ff14]">
          <Bot size={14} />
          AI_CHAT
        </div>
        {isBusy && <Activity size={14} className="animate-spin text-[#b026ff]" />}
      </div>

      <div className="custom-scrollbar mb-3 max-h-40 space-y-2 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-gray-500">
            Ask for arrangement ideas, prompt refinements, or mix notes before generating audio.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`border p-2 text-[11px] leading-relaxed ${
                message.role === 'user'
                  ? 'border-[#b026ff]/40 bg-[#b026ff]/10 text-[#d7b2ff]'
                  : 'border-[#39ff14]/30 bg-[#39ff14]/5 text-[#39ff14]'
              }`}
            >
              <div className="mb-1 text-[8px] uppercase tracking-widest text-gray-500">
                {message.role === 'user' ? 'You' : 'Assistant'}
              </div>
              <div className="whitespace-pre-wrap">{getMessageText(message.parts)}</div>
            </div>
          ))
        )}
      </div>

      {error && <p className="mb-2 text-[10px] text-[#ff0055]">{error.message}</p>}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = input.trim();
          if (!trimmed || isBusy) return;
          void sendMessage({ text: trimmed });
          setInput('');
        }}
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={isBusy}
          placeholder="Ask the producer daemon..."
          className="min-w-0 flex-1 border border-gray-800 bg-black/60 px-3 py-2 text-[11px] text-[#39ff14] placeholder-gray-700 outline-none focus:border-[#39ff14]"
        />
        {isBusy ? (
          <button
            type="button"
            onClick={() => stop()}
            className="border border-[#ff0055] px-3 text-[#ff0055] hover:bg-[#ff0055] hover:text-black"
            aria-label="Stop AI response"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="border border-[#39ff14] px-3 text-[#39ff14] hover:bg-[#39ff14] hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send chat message"
          >
            <Send size={14} />
          </button>
        )}
      </form>
    </section>
  );
}
