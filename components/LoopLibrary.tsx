import React, { useState, useRef, useEffect } from 'react';
import { Music, Trash2, Play, Square } from 'lucide-react';

export interface MusicLoop {
  id: string;
  name: string;
  url: string;
  duration: number;
  prompt: string;
  createdAt: number;
  trimStart?: number;
  trimEnd?: number;
}

interface LoopLibraryProps {
  loops: MusicLoop[];
  onDeleteLoop: (id: string) => void;
  onDragStart: (loop: MusicLoop) => void;
  onDragEnd?: () => void;
}

const FRESH_MS = 8_000; // highlight loops added within 8 seconds

export const LoopLibrary: React.FC<LoopLibraryProps> = ({ loops, onDeleteLoop, onDragStart, onDragEnd }) => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const [, forceUpdate] = useState(0);

  // Re-render every second so the NEW badge fades correctly
  useEffect(() => {
    const interval = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleDragStart = (e: React.DragEvent, loop: MusicLoop) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify(loop));
    onDragStart(loop);
  };

  const togglePlay = (loop: MusicLoop) => {
    const audio = audioRefs.current[loop.id];
    if (!audio) return;
    if (playingId === loop.id) {
      audio.pause();
      audio.currentTime = 0;
      setPlayingId(null);
    } else {
      // Stop any currently playing loop
      if (playingId && audioRefs.current[playingId]) {
        audioRefs.current[playingId]!.pause();
        audioRefs.current[playingId]!.currentTime = 0;
      }
      audio.play().catch(() => {});
      setPlayingId(loop.id);
    }
  };

  const handleAudioEnded = (loopId: string) => {
    if (playingId === loopId) setPlayingId(null);
  };

  if (loops.length === 0) {
    return (
      <div className="cyber-panel p-4 bg-black/80 border border-gray-800 w-full min-w-0 max-w-full">
        <div className="text-xs text-[#b026ff] font-bold tracking-widest mb-3 flex items-center gap-2">
          <Music size={14} /> LOOP_LIBRARY
        </div>
        <div className="text-center py-8 text-gray-600 text-sm">
          <p>No loops generated yet.</p>
          <p className="text-xs mt-2">Use the Generate button to create music loops.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cyber-panel p-4 bg-black/80 border border-gray-800 w-full min-w-0 max-w-full">
      <div className="text-xs text-[#b026ff] font-bold tracking-widest mb-3 flex items-center gap-2">
        <Music size={14} /> LOOP_LIBRARY
        <span className="text-gray-600 font-normal">({loops.length})</span>
      </div>

      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
        {loops.map((loop) => {
          const isPlaying = playingId === loop.id;
          const isFresh = Date.now() - loop.createdAt < FRESH_MS;
          return (
            <div
              key={loop.id}
              draggable
              onDragStart={(e) => handleDragStart(e, loop)}
              onDragEnd={() => onDragEnd?.()}
              className={`group relative bg-black/50 border p-3 cursor-move transition-all duration-200 ${
                isFresh
                  ? 'border-[#39ff14] shadow-[0_0_12px_rgba(57,255,20,0.4)] bg-[#39ff14]/5'
                  : 'border-gray-700 hover:border-[#b026ff] hover:bg-[#b026ff]/5'
              }`}
              title="Drag to add to a track"
            >
              {/* Hidden audio element for preview */}
              <audio
                ref={(el) => { audioRefs.current[loop.id] = el; }}
                src={loop.url}
                onEnded={() => handleAudioEnded(loop.id)}
                preload="none"
              />

              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Play/Stop preview button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePlay(loop); }}
                    className={`shrink-0 w-7 h-7 flex items-center justify-center border transition-all ${
                      isPlaying
                        ? 'border-[#ff0055] text-[#ff0055] bg-[#ff0055]/10 shadow-[0_0_8px_#ff0055]'
                        : 'border-[#39ff14] text-[#39ff14] hover:bg-[#39ff14]/10'
                    }`}
                    title={isPlaying ? 'Stop preview' : 'Preview loop'}
                  >
                    {isPlaying ? <Square size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#39ff14] truncate">{loop.name}</span>
                      {isFresh && (
                        <span className="text-[9px] font-bold text-black bg-[#39ff14] px-1 shrink-0">NEW</span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-500 truncate mt-0.5">{loop.prompt}</p>
                    <p className="text-[9px] text-gray-700 mt-0.5">
                      {loop.duration}s &bull; {new Date(loop.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteLoop(loop.id); }}
                  className="shrink-0 flex items-center justify-center w-6 h-6 text-gray-600 hover:text-[#ff0055] hover:bg-[#ff0055]/10 transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete loop"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-700 mt-3">
        ▶ Preview &bull; Drag loops onto tracks in the sequencer to use them
      </p>
    </div>
  );
};
