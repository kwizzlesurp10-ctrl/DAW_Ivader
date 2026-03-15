import React from 'react';
import { Track, StepsPerPattern } from '../types';

interface SequencerProps {
  track: Track;
  stepsPerPattern: StepsPerPattern;
  currentStep: number;
  selectedStep: number;
  cancelStep?: number;
  onStepSelect: (step: number) => void;
  onStepToggle?: (step: number) => void;
}

export const Sequencer: React.FC<SequencerProps> = ({
  track,
  stepsPerPattern,
  currentStep,
  selectedStep,
  cancelStep,
  onStepSelect,
  onStepToggle,
}) => {
  const steps = Array.from({ length: stepsPerPattern }, (_, i) => i);
  const isAudioTrack = track.type === 'audio';

  const isStepActive = (stepIndex: number) => {
    return track.notes.some(n =>
      stepIndex >= n.startStep && stepIndex < (n.startStep + n.durationSteps)
    );
  };

  const getNoteName = (stepIndex: number) => {
    const note = track.notes.find(n => n.startStep === stepIndex);
    return note ? note.note : '';
  };

  const getTrackColor = () => {
    switch (track.type) {
      case 'bass': return 'text-[#b026ff] border-[#b026ff] shadow-[#b026ff]';
      case 'drums': return 'text-[#ff0055] border-[#ff0055] shadow-[#ff0055]';
      case 'audio': return 'text-[#ffaa00] border-[#ffaa00] shadow-[#ffaa00]';
      default: return 'text-[#39ff14] border-[#39ff14] shadow-[#39ff14]';
    }
  };

  const getTrackBg = () => {
    switch (track.type) {
      case 'bass': return 'bg-[#b026ff]';
      case 'drums': return 'bg-[#ff0055]';
      case 'audio': return 'bg-[#ffaa00]';
      default: return 'bg-[#39ff14]';
    }
  };

  if (isAudioTrack) {
    return (
      <div className="flex gap-2 items-center w-full overflow-x-auto py-1">
        <div className={`w-16 text-xs font-bold shrink-0 uppercase tracking-widest ${getTrackColor().split(' ')[0]} neon-text opacity-90`}>
          {track.name}
        </div>
        <div className={`flex-1 h-12 rounded border border-gray-900 flex items-center justify-center ${getTrackBg()} bg-opacity-30 border-opacity-50`}>
          <span className="text-[10px] font-bold text-white/90 uppercase tracking-wider">Generated clip — plays from start</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 items-center w-full overflow-x-auto py-1">
      <div className={`w-16 text-xs font-bold shrink-0 uppercase tracking-widest ${getTrackColor().split(' ')[0]} neon-text opacity-90`}>
        {track.name}
      </div>
      <div className="flex gap-[2px] flex-1 h-12 bg-black/50 p-1 rounded border border-gray-900 shadow-inner">
        {steps.map((step) => {
           const active = isStepActive(step);
           const isCurrent = currentStep === step;
           const isSelected = selectedStep === step;
           const isCancelMark = currentStep === -1 && cancelStep !== undefined && cancelStep === step;
           
           // Step Visual Logic
           let baseClasses = "flex-1 min-w-[12px] h-full rounded-[1px] transition-all duration-75 relative group border-t border-b";
           
           if (active) {
             baseClasses += ` ${getTrackBg()} border-transparent shadow-[0_0_8px_currentColor] opacity-90 z-10`;
           } else {
             baseClasses += " bg-[#111] border-transparent hover:bg-[#222]";
           }
           
           // Selected State
           if (isSelected) {
               baseClasses += " ring-1 ring-white ring-inset ring-opacity-80 z-20";
           }

           // Playhead Overlay
           const playheadClass = isCurrent ? "after:absolute after:inset-0 after:bg-white after:opacity-50 after:z-30 after:shadow-[0_0_10px_white]" : "";

           // Cancel Mark Overlay (shows resume point when stopped)
           const cancelMarkClass = isCancelMark ? "after:absolute after:inset-0 after:bg-[#b026ff] after:opacity-30 after:z-30 after:border after:border-[#b026ff] after:border-opacity-80" : "";

           return (
             <div
                key={step}
                className={`${baseClasses} ${playheadClass} ${cancelMarkClass}`}
                onClick={() => {
                  onStepSelect(step);
                  if (onStepToggle) onStepToggle(step);
                }}
             >
                {/* Glass reflection effect */}
                {!active && <div className="absolute top-0 left-0 right-0 h-[40%] bg-white/5 pointer-events-none"></div>}
                
                {/* Note Label Tooltip */}
                {active && (
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-white text-[9px] px-2 py-1 border border-white hidden group-hover:block z-50 whitespace-nowrap shadow-lg">
                        {getNoteName(step)}
                    </div>
                )}
             </div>
           );
        })}
      </div>
    </div>
  );
};