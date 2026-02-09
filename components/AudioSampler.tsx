import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, Mic, MicOff, Scissors, Play, Square, RotateCcw } from 'lucide-react';

interface AudioSamplerProps {
  onAudioLoaded: (audioUrl: string, name: string, trimStart?: number, trimEnd?: number) => void;
}

export const AudioSampler: React.FC<AudioSamplerProps> = ({ onAudioLoaded }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [audioFileName, setAudioFileName] = useState<string>('');
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
    setAudioPreviewUrl(url);
    setAudioFileName(file.name);
    
    // Get audio duration
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      setStartTime(0);
      setEndTime(audio.duration);
    });
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

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

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioPreviewUrl(url);
        setAudioFileName('recorded_audio.webm');
        
        // Get audio duration
        const audio = new Audio(url);
        audio.addEventListener('loadedmetadata', () => {
          setDuration(audio.duration);
          setStartTime(0);
          setEndTime(audio.duration);
        });
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please check permissions.');
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
        // Clear existing interval
        if (playbackIntervalRef.current !== null) {
          clearInterval(playbackIntervalRef.current);
          playbackIntervalRef.current = null;
        }
        audioPreviewRef.current.pause();
        audioPreviewRef.current.currentTime = startTime;
        setIsPlaying(false);
      } else {
        // Clear any existing interval before starting new one
        if (playbackIntervalRef.current !== null) {
          clearInterval(playbackIntervalRef.current);
        }
        
        audioPreviewRef.current.currentTime = startTime;
        audioPreviewRef.current.play();
        setIsPlaying(true);
        
        // Stop at end time
        playbackIntervalRef.current = window.setInterval(() => {
          if (audioPreviewRef.current && audioPreviewRef.current.currentTime >= endTime) {
            audioPreviewRef.current.pause();
            audioPreviewRef.current.currentTime = startTime;
            setIsPlaying(false);
            if (playbackIntervalRef.current !== null) {
              clearInterval(playbackIntervalRef.current);
              playbackIntervalRef.current = null;
            }
          }
        }, 100);
      }
    }
  };

  const handleAddToTrack = async () => {
    if (!audioPreviewUrl) return;

    try {
      // Pass trim information if audio is trimmed
      const trimStart = startTime > 0 ? startTime : undefined;
      const trimEnd = endTime < duration ? endTime : undefined;
      onAudioLoaded(audioPreviewUrl, audioFileName || 'Sample', trimStart, trimEnd);
      
      // Reset
      handleReset();
    } catch (err) {
      console.error('Error adding audio to track:', err);
      alert('Failed to add audio to track');
    }
  };

  const handleReset = () => {
    setAudioPreviewUrl(null);
    setAudioFileName('');
    setStartTime(0);
    setEndTime(0);
    setDuration(0);
    setIsPlaying(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="cyber-panel p-4 bg-black/80">
      <div className="flex items-center gap-2 mb-4 border-b border-gray-800 pb-2">
        <Upload size={14} className="text-[#39ff14]" />
        <h3 className="text-xs text-[#39ff14] font-bold tracking-widest neon-text-green">
          AUDIO_SAMPLER
        </h3>
      </div>

      {/* Drag & Drop / Upload Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded p-6 mb-4 transition-all cursor-pointer ${
          isDragging
            ? 'border-[#39ff14] bg-[#39ff14]/10'
            : 'border-gray-700 hover:border-gray-600'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <Upload size={32} className={isDragging ? 'text-[#39ff14]' : 'text-gray-500'} />
          <p className="text-xs text-gray-400">
            Drop audio file or click to browse
          </p>
          <p className="text-[10px] text-gray-600">
            Supports: MP3, WAV, OGG, WEBM
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Recording Controls */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-xs border transition-all ${
            isRecording
              ? 'border-[#ff0055] text-[#ff0055] bg-[#ff0055]/10 animate-pulse'
              : 'border-gray-600 text-gray-400 hover:border-[#39ff14] hover:text-[#39ff14]'
          }`}
        >
          {isRecording ? (
            <>
              <MicOff size={14} />
              STOP RECORDING
            </>
          ) : (
            <>
              <Mic size={14} />
              RECORD AUDIO
            </>
          )}
        </button>
      </div>

      {/* Preview & Controls */}
      {audioPreviewUrl && (
        <div className="border border-gray-700 rounded p-4 bg-black/50">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-[#39ff14] font-mono truncate">
              {audioFileName}
            </span>
            <button
              onClick={handleReset}
              className="text-gray-500 hover:text-[#ff0055]"
              title="Clear"
            >
              <RotateCcw size={14} />
            </button>
          </div>

          <audio ref={audioPreviewRef} src={audioPreviewUrl} className="hidden" />

          {/* Trimming Controls */}
          <div className="mb-3 space-y-2">
            <div className="flex items-center gap-2">
              <Scissors size={12} className="text-gray-500" />
              <span className="text-[9px] text-gray-500">TRIM AUDIO</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <label className="text-[9px] text-gray-600 w-12">START:</label>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={startTime}
                  onChange={(e) => setStartTime(Math.min(Number(e.target.value), endTime - 0.1))}
                  className="flex-1 h-1 accent-[#b026ff]"
                />
                <span className="text-[9px] text-gray-500 w-12 text-right">
                  {startTime.toFixed(1)}s
                </span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[9px] text-gray-600 w-12">END:</label>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={endTime}
                  onChange={(e) => setEndTime(Math.max(Number(e.target.value), startTime + 0.1))}
                  className="flex-1 h-1 accent-[#b026ff]"
                />
                <span className="text-[9px] text-gray-500 w-12 text-right">
                  {endTime.toFixed(1)}s
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={handlePlayPreview}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs border border-[#39ff14] text-[#39ff14] hover:bg-[#39ff14] hover:text-black transition-all"
            >
              {isPlaying ? <Square size={12} /> : <Play size={12} />}
              {isPlaying ? 'STOP' : 'PREVIEW'}
            </button>
            <button
              onClick={handleAddToTrack}
              className="flex-1 px-3 py-2 text-xs bg-[#39ff14] text-black font-bold hover:bg-[#b026ff] hover:text-white transition-all"
            >
              ADD TO TRACK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
