import React, { useState } from 'react';
import { LayoutGrid, X, Volume2, VolumeX } from 'lucide-react';
import type { DrumPadSlot } from '../types';
import { DRUM_PAD_COUNT } from '../types';
import type { MusicLoop } from './LoopLibrary';

export interface DrumPadGridProps {
  drumPads: DrumPadSlot[];
  stepsPerPattern: number;
  bpm: number;
  currentStep: number;
  isPlaying: boolean;
  onAssignLoop: (index: number, loop: MusicLoop) => void;
  onClearPad: (index: number) => void;
  onToggleMute: (index: number) => void;
  onTriggerPad: (index: number) => void;
}

export const DrumPadGrid: React.FC<DrumPadGridProps> = ({
  drumPads,
  stepsPerPattern,
  bpm,
  currentStep,
  isPlaying,
  onAssignLoop,
  onClearPad,
  onToggleMute,
  onTriggerPad,
}) => {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragOver = (e: React.DragEvent, index: number): void => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverIndex(index);
  };

  const handleDragLeave = (): void => setDragOverIndex(null);

  const handleDrop = (e: React.DragEvent, index: number): void => {
    e.preventDefault();
    setDragOverIndex(null);
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const loop = JSON.parse(raw) as MusicLoop;
      if (loop.url && loop.name) {
        onAssignLoop(index, loop);
      }
    } catch {
      // not a library loop
    }
  };

  const beatsPerPattern = stepsPerPattern / 4;
  const patternSeconds = (beatsPerPattern * 60) / Math.max(1, bpm);

  const slots = drumPads.slice(0, DRUM_PAD_COUNT);

  return (
    <div className="cyber-panel p-4 bg-black/80 border border-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-xs text-[#39ff14] font-bold tracking-widest flex items-center gap-2 mb-1">
            <LayoutGrid size={14} aria-hidden /> DRUM_PAD_RACK
          </div>
          <p className="text-[11px] text-gray-500 max-w-xl leading-relaxed">
            Drag loops from the library onto pads. On play, clips retrigger together on each pattern downbeat—locked to{' '}
            <span className="text-gray-400">{bpm} BPM</span> (about {patternSeconds.toFixed(2)}s per {stepsPerPattern}-step pattern).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {slots.map((pad, index) => {
          const filled = Boolean(pad.audioUrl);
          const isDownbeatFlash = isPlaying && currentStep === 0;
          const isHot = dragOverIndex === index;
          return (
            <div
              key={index}
              role="button"
              tabIndex={0}
              onClick={() => {
                if (filled) onTriggerPad(index);
              }}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && filled) {
                  e.preventDefault();
                  onTriggerPad(index);
                }
              }}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              className={`
                relative min-h-[72px] rounded border flex flex-col justify-between p-2 text-left transition-all duration-150
                ${isHot ? 'border-[#39ff14] bg-[#39ff14]/15 shadow-[0_0_16px_rgba(57,255,20,0.35)] scale-[1.02]' : 'border-gray-700 hover:border-gray-500'}
                ${filled ? 'bg-black/60 cursor-pointer' : 'bg-black/40 cursor-default'}
                ${pad.muted ? 'opacity-50' : ''}
                ${filled && isDownbeatFlash ? 'ring-1 ring-[#b026ff]/60' : ''}
              `}
              aria-label={`Drum pad ${index + 1}${filled ? `, ${pad.name}` : ', empty. Drop a loop here.'}`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-[9px] font-mono text-gray-600 shrink-0">{index + 1}</span>
                <div className="flex gap-0.5 shrink-0">
                  {filled ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleMute(index);
                        }}
                        className="p-0.5 rounded border border-gray-700 text-gray-500 hover:text-[#39ff14] hover:border-[#39ff14]"
                        title={pad.muted ? 'Unmute pad' : 'Mute pad'}
                        aria-label={pad.muted ? 'Unmute pad' : 'Mute pad'}
                      >
                        {pad.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClearPad(index);
                        }}
                        className="p-0.5 rounded border border-gray-700 text-gray-500 hover:text-[#ff0055] hover:border-[#ff0055]"
                        title="Clear pad"
                        aria-label="Clear pad"
                      >
                        <X size={12} />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="min-w-0 flex-1 flex flex-col justify-end">
                <span
                  className={`text-[10px] font-bold truncate leading-tight ${filled ? 'text-[#b026ff]' : 'text-gray-600'}`}
                >
                  {filled ? pad.name : 'Drop loop'}
                </span>
                {filled ? (
                  <span className="text-[9px] text-gray-600 truncate mt-0.5">Tap to preview</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
