import React, { useState } from 'react';
import { Sparkles, Image, FileText, Activity } from 'lucide-react';
import { generateCreativeText, generateCreativeImage } from '../services/hfGenerateService';
import { isErr } from '../lib/result';

type GenerateMode = 'text' | 'image';

/**
 * HFGenerator — HuggingFace creative text and image generation panel.
 *
 * Entirely separate from the Replicate audio pipeline.
 * Uses /api/hf-generate with loose creative system instructions.
 */
export const HFGenerator: React.FC = () => {
  const [mode, setMode] = useState<GenerateMode>('text');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [textResult, setTextResult] = useState<string | null>(null);
  const [imageResult, setImageResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    setTextResult(null);
    setImageResult(null);

    if (mode === 'text') {
      const result = await generateCreativeText(prompt.trim());
      if (isErr(result)) {
        setError(result.error.message);
      } else {
        setTextResult(result.value.text);
      }
    } else {
      const result = await generateCreativeImage(prompt.trim());
      if (isErr(result)) {
        setError(result.error.message);
      } else {
        setImageResult(result.value.dataUrl);
      }
    }

    setIsGenerating(false);
  };

  return (
    <div className="cyber-panel p-4 flex flex-col gap-3 bg-black/90">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#ff0055]/30 pb-2">
        <div className="text-[10px] text-[#ff0055] font-bold tracking-widest flex items-center gap-2">
          <Sparkles size={12} /> /// HF_CREATIVE_ENGINE
        </div>
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-[#ff0055] rounded-full animate-pulse" />
          <div className="w-2 h-2 bg-[#b026ff] rounded-full" />
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1">
        <button
          onClick={() => { setMode('text'); setError(null); setImageResult(null); }}
          className={`flex items-center gap-1 px-3 py-1 text-[10px] font-bold uppercase border transition-all ${
            mode === 'text'
              ? 'border-[#ff0055] bg-[#ff0055]/20 text-[#ff0055]'
              : 'border-gray-700 text-gray-500 hover:border-[#ff0055] hover:text-[#ff0055]'
          }`}
        >
          <FileText size={10} /> TEXT
        </button>
        <button
          onClick={() => { setMode('image'); setError(null); setTextResult(null); }}
          className={`flex items-center gap-1 px-3 py-1 text-[10px] font-bold uppercase border transition-all ${
            mode === 'image'
              ? 'border-[#b026ff] bg-[#b026ff]/20 text-[#b026ff]'
              : 'border-gray-700 text-gray-500 hover:border-[#b026ff] hover:text-[#b026ff]'
          }`}
        >
          <Image size={10} /> IMAGE
        </button>
      </div>

      {/* Prompt input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleGenerate()}
          placeholder={
            mode === 'text'
              ? 'Describe a concept, mood, or scene…'
              : 'Describe the image to create…'
          }
          disabled={isGenerating}
          className="bg-black/50 border border-gray-800 flex-1 text-sm font-mono text-[#ff0055] placeholder-gray-700 px-3 py-1.5 focus:border-[#ff0055] focus:outline-none transition-colors disabled:opacity-50"
          data-testid="hf-prompt-input"
        />
        <button
          onClick={() => void handleGenerate()}
          disabled={isGenerating || !prompt.trim()}
          className={`flex items-center gap-1.5 px-4 py-1.5 font-bold text-[10px] uppercase transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
            mode === 'text'
              ? 'bg-[#ff0055] text-black hover:bg-[#b026ff] hover:text-white shadow-[0_0_12px_rgba(255,0,85,0.4)]'
              : 'bg-[#b026ff] text-white hover:bg-[#ff0055] hover:text-black shadow-[0_0_12px_rgba(176,38,255,0.4)]'
          }`}
          data-testid="hf-generate-button"
        >
          {isGenerating ? <Activity size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {isGenerating ? 'GENERATING...' : 'CREATE'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-[10px] text-[#ff0055] border border-[#ff0055]/40 bg-[#ff0055]/10 px-3 py-2 font-mono">
          ⚠ {error}
        </div>
      )}

      {/* Text result */}
      {textResult && (
        <div
          className="text-xs text-gray-300 font-mono bg-black/60 border border-[#ff0055]/30 p-3 max-h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap leading-relaxed"
          data-testid="hf-text-result"
        >
          {textResult}
        </div>
      )}

      {/* Image result */}
      {imageResult && (
        <div className="relative border border-[#b026ff]/40">
          <img
            src={imageResult}
            alt="HuggingFace generated artwork"
            className="w-full object-contain max-h-64"
            data-testid="hf-image-result"
          />
          <div className="absolute top-1 right-1 text-[8px] text-[#b026ff] bg-black/80 px-1 py-0.5">
            FLUX.1
          </div>
        </div>
      )}

      {/* Hint when empty */}
      {!textResult && !imageResult && !error && !isGenerating && (
        <div className="text-[9px] text-gray-600 font-mono text-center py-2">
          {mode === 'text'
            ? '// CREATIVE TEXT ENGINE — MISTRAL-7B — UNRESTRAINED'
            : '// IMAGE SYNTHESIS ENGINE — FLUX.1-SCHNELL'}
        </div>
      )}
    </div>
  );
};
