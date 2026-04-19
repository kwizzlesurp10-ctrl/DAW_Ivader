import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Mic, MicOff, Scissors, Play, Square, RotateCcw, Plus, Trash2, Settings2, Repeat } from 'lucide-react';
import { AudioSample } from '../types';

interface DroppedLoop {
  url: string;
  name: string;
  duration: number;
  trimStart?: number;
  trimEnd?: number;
}

interface AudioSamplerProps {
  onAudioLoaded: (audioUrl: string, name: string, trimStart?: number, trimEnd?: number) => void;
  onSamplerLoaded?: (samples: AudioSample[], name: string) => void;
  preloadedAudio?: { url: string; name: string } | null;
  onLoopDropped?: () => void;
}

export const AudioSampler: React.FC<AudioSamplerProps> = ({ onAudioLoaded, onSamplerLoaded, preloadedAudio, onLoopDropped }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // Current active sample being edited
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [currentName, setCurrentName] = useState<string>('');
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Sampler state
  const [isSamplerMode, setIsSamplerMode] = useState(false);
  const [samples, setSamples] = useState<AudioSample[]>([]);
  const [editingSampleId, setEditingSampleId] = useState<string | null>(null);

  // Mapping state for current sample
  const [rootNote, setRootNote] = useState('C4');
  const [minNote, setMinNote] = useState('C0');
  const [maxNote, setMaxNote] = useState('B8');
  const [minVelocity, setMinVelocity] = useState(0);
  const [maxVelocity, setMaxVelocity] = useState(1);
  const [isLooping, setIsLooping] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const playbackIntervalRef = useRef<number | null>(null);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (playbackIntervalRef.current !== null) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, []);

  // Auto-load generated audio when preloadedAudio changes
  useEffect(() => {
    if (!preloadedAudio) return;
    loadAudio(preloadedAudio.url, preloadedAudio.name);
  }, [preloadedAudio]);

  const loadAudio = (url: string, name: string, trimStart = 0, trimEnd?: number) => {
    setCurrentUrl(url);
    setCurrentName(name);
    const audio = new Audio(url);
    const onMetadata = () => {
      const dur = audio.duration;
      setDuration(dur);
      setStartTime(trimStart);
      setEndTime(trimEnd ?? dur);
      setLoopStart(trimStart);
      setLoopEnd(trimEnd ?? dur);
    };
    audio.addEventListener('loadedmetadata', onMetadata);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('application/json')) {
      e.dataTransfer.dropEffect = 'copy';
    }
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const processAudioFile = async (file: File) => {
    if (!file.type.startsWith('audio/')) {
      alert('Please upload a valid audio file');
      return;
    }
    const url = URL.createObjectURL(file);
    loadAudio(url, file.name);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.types.includes('application/json')) {
      try {
        const data = e.dataTransfer.getData('application/json');
        const loop = JSON.parse(data) as DroppedLoop;
        if (loop && typeof loop.url === 'string' && typeof loop.name === 'string') {
          loadAudio(loop.url, loop.name, loop.trimStart, loop.trimEnd);
          onLoopDropped?.();
          return;
        }
      } catch { /* ignore */ }
    }

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await processAudioFile(files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processAudioFile(files[0]);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        loadAudio(url, 'recorded_audio.webm');
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handlePlayPreview = () => {
    if (audioPreviewRef.current) {
      if (isPlaying) {
        if (playbackIntervalRef.current !== null) clearInterval(playbackIntervalRef.current);
        audioPreviewRef.current.pause();
        audioPreviewRef.current.currentTime = startTime;
        setIsPlaying(false);
      } else {
        if (playbackIntervalRef.current !== null) clearInterval(playbackIntervalRef.current);
        audioPreviewRef.current.currentTime = startTime;
        audioPreviewRef.current.play();
        setIsPlaying(true);
        playbackIntervalRef.current = window.setInterval(() => {
          if (audioPreviewRef.current && audioPreviewRef.current.currentTime >= endTime) {
            if (isLooping) {
              audioPreviewRef.current.currentTime = loopStart;
            } else {
              audioPreviewRef.current.pause();
              audioPreviewRef.current.currentTime = startTime;
              setIsPlaying(false);
              clearInterval(playbackIntervalRef.current!);
            }
          }
        }, 50);
      }
    }
  };

  const handleAddSample = () => {
    if (!currentUrl) return;
    const newSample: AudioSample = {
      id: Math.random().toString(36).slice(2, 9),
      name: currentName,
      url: currentUrl,
      trimStart: startTime,
      trimEnd: endTime,
      rootNote,
      minNote,
      maxNote,
      minVelocity,
      maxVelocity,
      loop: isLooping,
      loopStart,
      loopEnd,
    };
    setSamples(prev => [...prev, newSample]);
    setIsSamplerMode(true);
    // Reset current for next
    handleResetCurrent();
  };

  const handleUpdateSample = () => {
    if (!editingSampleId || !currentUrl) return;
    setSamples(prev => prev.map(s => s.id === editingSampleId ? {
      ...s,
      name: currentName,
      url: currentUrl,
      trimStart: startTime,
      trimEnd: endTime,
      rootNote,
      minNote,
      maxNote,
      minVelocity,
      maxVelocity,
      loop: isLooping,
      loopStart,
      loopEnd,
    } : s));
    setEditingSampleId(null);
    handleResetCurrent();
  };

  const handleEditSample = (sample: AudioSample) => {
    setEditingSampleId(sample.id);
    setCurrentUrl(sample.url);
    setCurrentName(sample.name);
    setStartTime(sample.trimStart ?? 0);
    setEndTime(sample.trimEnd ?? 0);
    setRootNote(sample.rootNote ?? 'C4');
    setMinNote(sample.minNote ?? 'C0');
    setMaxNote(sample.maxNote ?? 'B8');
    setMinVelocity(sample.minVelocity ?? 0);
    setMaxVelocity(sample.maxVelocity ?? 1);
    setIsLooping(sample.loop ?? false);
    setLoopStart(sample.loopStart ?? 0);
    setLoopEnd(sample.loopEnd ?? 0);

    const audio = new Audio(sample.url);
    audio.addEventListener('loadedmetadata', () => {
      const d = audio.duration;
      setDuration(d);
      const end = sample.trimEnd != null ? Math.min(sample.trimEnd, d) : d;
      setEndTime(end);
      const start = sample.trimStart != null ? Math.min(sample.trimStart, end) : 0;
      setStartTime(start);
    });
  };

  const handleRemoveSample = (id: string) => {
    setSamples(prev => prev.filter(s => s.id !== id));
  };

  const handleAddToTrack = () => {
    if (isSamplerMode && samples.length > 0) {
      onSamplerLoaded?.(samples, 'MultiSampler');
      setSamples([]);
      setIsSamplerMode(false);
    } else if (currentUrl) {
      onAudioLoaded(currentUrl, currentName, startTime, endTime);
      handleResetCurrent();
    }
  };

  const handleResetCurrent = () => {
    setCurrentUrl(null);
    setCurrentName('');
    setStartTime(0);
    setEndTime(0);
    setDuration(0);
    setIsPlaying(false);
    setEditingSampleId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="cyber-panel p-4 bg-black/80 max-h-[80vh] overflow-y-auto custom-scrollbar">
      <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-2">
        <div className="flex items-center gap-2">
          <Upload size={14} className="text-[#39ff14]" />
          <h3 className="text-xs text-[#39ff14] font-bold tracking-widest neon-text-green">
            ADVANCED_SAMPLER
          </h3>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsSamplerMode(!isSamplerMode)}
            className={`text-[9px] px-2 py-0.5 border ${isSamplerMode ? 'bg-[#b026ff] border-[#b026ff] text-white' : 'border-gray-700 text-gray-500'}`}
          >
            SAMPLER_MODE
          </button>
        </div>
      </div>

      {/* Sampler Sample List */}
      {isSamplerMode && samples.length > 0 && (
        <div className="mb-4 space-y-1">
          <label className="text-[9px] text-gray-500 uppercase tracking-widest">LOADED_SAMPLES ({samples.length})</label>
          <div className="max-h-32 overflow-y-auto space-y-1 border border-gray-800 p-1 bg-black/40">
            {samples.map(s => (
              <div key={s.id} className="flex items-center justify-between p-1 bg-white/5 rounded text-[10px]">
                <span className="truncate flex-1 text-gray-300">{s.name} ({s.minNote}-{s.maxNote})</span>
                <div className="flex gap-1">
                  <button onClick={() => handleEditSample(s)} className="p-1 hover:text-[#39ff14]"><Settings2 size={10}/></button>
                  <button onClick={() => handleRemoveSample(s.id)} className="p-1 hover:text-[#ff0055]"><Trash2 size={10}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drag & Drop / Upload Area */}
      {!currentUrl && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded p-6 mb-4 transition-all cursor-pointer ${
            isDragging ? 'border-[#39ff14] bg-[#39ff14]/10' : 'border-gray-700 hover:border-gray-600'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <Upload size={24} className={isDragging ? 'text-[#39ff14]' : 'text-gray-500'} />
            <p className="text-[10px] text-gray-400">Drop audio or click to browse</p>
          </div>
          <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileSelect} className="hidden" />
        </div>
      )}

      {/* Recording Controls */}
      {!currentUrl && (
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-xs border mb-4 transition-all ${
            isRecording ? 'border-[#ff0055] text-[#ff0055] bg-[#ff0055]/10 animate-pulse' : 'border-gray-600 text-gray-400 hover:border-[#39ff14]'
          }`}
        >
          {isRecording ? <><MicOff size={14}/> STOP</> : <><Mic size={14}/> RECORD</>}
        </button>
      )}

      {/* Current Sample Editor */}
      {currentUrl && (
        <div className="border border-gray-700 rounded p-3 bg-black/50 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <span className="text-[10px] text-[#39ff14] font-mono truncate max-w-[150px]">{currentName}</span>
            <button onClick={handleResetCurrent} className="text-gray-500 hover:text-[#ff0055]"><RotateCcw size={12}/></button>
          </div>

          <audio ref={audioPreviewRef} src={currentUrl} className="hidden" />

          {/* Trimming & Looping */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[9px] text-gray-500 flex items-center gap-1"><Scissors size={10}/> TRIM</label>
              <div className="space-y-1">
                <input type="range" min={0} max={duration} step={0.01} value={startTime} onChange={(e) => setStartTime(Number(e.target.value))} className="w-full h-1 accent-[#39ff14]" />
                <input type="range" min={0} max={duration} step={0.01} value={endTime} onChange={(e) => setEndTime(Number(e.target.value))} className="w-full h-1 accent-[#39ff14]" />
                <div className="flex justify-between text-[8px] text-gray-600 font-mono">
                  <span>{startTime.toFixed(2)}s</span>
                  <span>{endTime.toFixed(2)}s</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[9px] text-gray-500 flex items-center gap-1">
                <Repeat size={10} className={isLooping ? 'text-[#b026ff]' : ''}/> LOOP
                <input type="checkbox" checked={isLooping} onChange={(e) => setIsLooping(e.target.checked)} className="ml-auto accent-[#b026ff]" />
              </label>
              {isLooping && (
                <div className="space-y-1">
                  <input type="range" min={startTime} max={endTime} step={0.01} value={loopStart} onChange={(e) => setLoopStart(Number(e.target.value))} className="w-full h-1 accent-[#b026ff]" />
                  <input type="range" min={startTime} max={endTime} step={0.01} value={loopEnd} onChange={(e) => setLoopEnd(Number(e.target.value))} className="w-full h-1 accent-[#b026ff]" />
                </div>
              )}
            </div>
          </div>

          {/* Mapping Controls (Only in Sampler Mode or if adding as sample) */}
          {(isSamplerMode || editingSampleId) && (
            <div className="grid grid-cols-2 gap-2 border-t border-gray-800 pt-2">
              <div className="space-y-1">
                <label className="text-[8px] text-gray-500">ROOT_NOTE</label>
                <input type="text" value={rootNote} onChange={(e) => setRootNote(e.target.value)} className="w-full bg-black border border-gray-700 text-[10px] text-white px-1" />
              </div>
              <div className="space-y-1">
                <label className="text-[8px] text-gray-500">KEY_RANGE</label>
                <div className="flex gap-1">
                  <input type="text" value={minNote} onChange={(e) => setMinNote(e.target.value)} className="w-1/2 bg-black border border-gray-700 text-[10px] text-white px-1" />
                  <input type="text" value={maxNote} onChange={(e) => setMaxNote(e.target.value)} className="w-1/2 bg-black border border-gray-700 text-[10px] text-white px-1" />
                </div>
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-[8px] text-gray-500">VELOCITY_ZONE ({minVelocity.toFixed(2)}-{maxVelocity.toFixed(2)})</label>
                <div className="flex gap-2">
                  <input type="range" min={0} max={1} step={0.01} value={minVelocity} onChange={(e) => setMinVelocity(Number(e.target.value))} className="flex-1 h-1 accent-gray-500" />
                  <input type="range" min={0} max={1} step={0.01} value={maxVelocity} onChange={(e) => setMaxVelocity(Number(e.target.value))} className="flex-1 h-1 accent-gray-500" />
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={handlePlayPreview} className="flex-1 flex items-center justify-center gap-1 py-1.5 border border-[#39ff14] text-[#39ff14] text-[10px] hover:bg-[#39ff14]/10">
              {isPlaying ? <Square size={10}/> : <Play size={10}/>} {isPlaying ? 'STOP' : 'PREVIEW'}
            </button>
            {editingSampleId ? (
              <button onClick={handleUpdateSample} className="flex-1 bg-[#39ff14] text-black font-bold text-[10px] py-1.5">UPDATE_SAMPLE</button>
            ) : isSamplerMode ? (
              <button onClick={handleAddSample} className="flex-1 bg-[#b026ff] text-white font-bold text-[10px] py-1.5 flex items-center justify-center gap-1"><Plus size={10}/> ADD_SAMPLE</button>
            ) : (
              <button onClick={handleAddToTrack} className="flex-1 bg-[#39ff14] text-black font-bold text-[10px] py-1.5">ADD_TO_TRACK</button>
            )}
          </div>
        </div>
      )}

      {/* Finalize Buttons for Sampler Mode */}
      {isSamplerMode && samples.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[#b026ff]/30">
          <button 
            onClick={handleAddToTrack}
            className="w-full py-2 bg-[#b026ff] text-white font-bold text-xs shadow-[0_0_15px_rgba(176,38,255,0.4)] hover:shadow-[0_0_20px_rgba(176,38,255,0.6)] transition-all"
          >
            CREATE MULTI-SAMPLER TRACK ({samples.length} SAMPLES)
          </button>
        </div>
      )}
    </div>
  );
};
