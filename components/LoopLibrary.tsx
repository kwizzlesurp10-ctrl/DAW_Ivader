import React from 'react';
import { Music, Trash2 } from 'lucide-react';

export interface MusicLoop {
  id: string;
  name: string;
  url: string;
  duration: number;
  prompt: string;
  createdAt: number;
}

interface LoopLibraryProps {
  loops: MusicLoop[];
  onDeleteLoop: (id: string) => void;
  onDragStart: (loop: MusicLoop) => void;
}

export const LoopLibrary: React.FC<LoopLibraryProps> = ({ loops, onDeleteLoop, onDragStart }) => {
  const handleDragStart = (e: React.DragEvent, loop: MusicLoop) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify(loop));
    onDragStart(loop);
  };

  if (loops.length === 0) {
    return (
      <div className="cyber-panel p-4 bg-black/80 border border-gray-800">
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
    <div className="cyber-panel p-4 bg-black/80 border border-gray-800">
      <div className="text-xs text-[#b026ff] font-bold tracking-widest mb-3 flex items-center gap-2">
        <Music size={14} /> LOOP_LIBRARY
        <span className="text-gray-600 font-normal">({loops.length})</span>
      </div>
      <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
        {loops.map((loop) => (
          <div
            key={loop.id}
            draggable
            onDragStart={(e) => handleDragStart(e, loop)}
            className="group relative bg-black/50 border border-gray-700 hover:border-[#39ff14] p-3 cursor-move transition-all duration-200 hover:bg-[#39ff14]/5"
            title="Drag to add to a track"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[#39ff14] font-mono truncate">{loop.name}</div>
                <div className="text-[10px] text-gray-500 truncate mt-1">{loop.prompt}</div>
                <div className="text-[9px] text-gray-600 mt-1">
                  {loop.duration}s • {new Date(loop.createdAt).toLocaleTimeString()}
                </div>
              </div>
              <button
                onClick={() => onDeleteLoop(loop.id)}
                className="flex items-center justify-center w-6 h-6 text-gray-600 hover:text-[#ff0055] hover:bg-[#ff0055]/10 transition-colors opacity-0 group-hover:opacity-100"
                title="Delete loop"
              >
                <Trash2 size={12} />
              </button>
            </div>
            <div className="absolute left-0 top-0 w-1 h-full bg-gradient-to-b from-[#39ff14] to-[#b026ff] opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-800 text-[9px] text-gray-600 text-center">
        💡 Drag loops onto tracks in the sequencer to use them
      </div>
    </div>
  );
};
