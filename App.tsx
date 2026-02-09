import React, { useState, useEffect, useCallback } from 'react';
import { Play, Square, Wand2, Activity, Zap, Cpu, Sliders, Pause, Plus, Trash2, Copy, Volume2, Music } from 'lucide-react';
import { audioEngine } from './services/audioEngine';
import { generateAudioFromText } from './services/textToAudioService';
import { createGeneratedAudioTrack } from './lib/createGeneratedAudioTrack';
import { loadSong, saveSong, exportSongToJson, importSongFromJson } from './services/storageService';
import { useUndoRedo } from './hooks/useUndoRedo';
import { isErr } from './lib/result';
import { SongData, Track, PlayState } from './types';
import { Visualizer } from './components/Visualizer';
import { Sequencer } from './components/Sequencer';
import { Knob } from './components/Knob';

function nextTrackId(): string {
  return 't' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

/** Default steps per pattern and swing for new songs. */
const DEFAULT_STEPS_PER_PATTERN = 16 as const;
const DEFAULT_SWING = 0;

// Default initial state
const INITIAL_SONG: SongData = {
  title: "INIT_SEQUENCE_01",
  bpm: 128,
  stepsPerPattern: DEFAULT_STEPS_PER_PATTERN,
  swing: DEFAULT_SWING,
  tracks: [
    {
      id: "t1",
      name: "LEAD",
      type: "synth",
      notes: [{ note: "C4", startStep: 0, durationSteps: 2 }, { note: "E4", startStep: 4, durationSteps: 2 }, { note: "G4", startStep: 8, durationSteps: 2 }, { note: "B4", startStep: 12, durationSteps: 2 }],
      params: { waveform: "sawtooth", attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2, filterCutoff: 2000, filterRes: 1, gain: 0.4 },
      muted: false,
      solo: false,
      volume: 1,
      pan: 0,
    },
    {
      id: "t2",
      name: "BASS",
      type: "bass",
      notes: [{ note: "C2", startStep: 0, durationSteps: 4 }, { note: "G2", startStep: 8, durationSteps: 4 }],
      params: { waveform: "square", attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.1, filterCutoff: 400, filterRes: 5, gain: 0.6 },
      muted: false,
      solo: false,
      volume: 1,
      pan: 0,
    },
    {
      id: "t3",
      name: "KICK",
      type: "drums",
      notes: [{ note: "kick", startStep: 0, durationSteps: 1 }, { note: "kick", startStep: 4, durationSteps: 1 }, { note: "kick", startStep: 8, durationSteps: 1 }, { note: "kick", startStep: 12, durationSteps: 1 }],
      params: { waveform: "sine", attack: 0, decay: 0.1, sustain: 0, release: 0, filterCutoff: 1000, filterRes: 0, gain: 1 },
      muted: false,
      solo: false,
      volume: 1,
      pan: 0,
    },
  ],
};

const App: React.FC = () => {
  const { state: song, setState: setSong, undo, redo, canUndo, canRedo } = useUndoRedo<SongData>(INITIAL_SONG);
  const [playState, setPlayState] = useState<PlayState>(PlayState.STOPPED);
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [selectedStep, setSelectedStep] = useState<number>(0);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string>(INITIAL_SONG.tracks[0].id);
  const [initialized, setInitialized] = useState(false);
  const [masterVolume, setMasterVolume] = useState(() => audioEngine.getMasterVolume());
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [dropTargetTrackId, setDropTargetTrackId] = useState<string | null>(null);

  useEffect(() => {
    audioEngine.setSongData(song);
  }, [song]);

  useEffect(() => {
    audioEngine.setMasterVolume(masterVolume);
  }, [masterVolume]);

  useEffect(() => {
    audioEngine.setMetronomeEnabled(metronomeOn);
  }, [metronomeOn]);

  // Handle Playback Loop Visualization
  useEffect(() => {
    audioEngine.setOnStepCallback((step) => {
      setCurrentStep(step);
    });
  }, []);

  const handleInit = async () => {
    await audioEngine.init();
    setInitialized(true);
  };

  const handlePlay = async () => {
    if (!initialized) await handleInit();
    await audioEngine.start();
    setPlayState(PlayState.PLAYING);
  };

  const handlePause = async () => {
    if (!initialized) return;
    await audioEngine.pause();
    setPlayState(PlayState.PAUSED);
  };

  const handleStop = () => {
    if (!initialized) return;
    audioEngine.stop();
    setPlayState(PlayState.STOPPED);
    setCurrentStep(-1);
  };

  const handleGenerate = async (): Promise<void> => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    handleStop();

    const result = await generateAudioFromText(prompt, 8);
    if (isErr(result)) {
      alert(`Generate audio failed: ${result.error.message}`);
      setIsGenerating(false);
      return;
    }

    const newTrack = createGeneratedAudioTrack(result.value.url, {
      id: nextTrackId(),
      name: 'Generated',
    });
    setSong(prev => ({ ...prev, tracks: [...prev.tracks, newTrack] }));
    setSelectedTrackId(newTrack.id);
    setIsGenerating(false);
  };

  const updateTrackParam = (trackId: string, param: keyof Track['params'], value: number) => {
    const trackIndex = song.tracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) return;

    const newTracks = [...song.tracks];
    newTracks[trackIndex].params = {
      ...newTracks[trackIndex].params,
      [param]: value
    };

    setSong(prev => ({ ...prev, tracks: newTracks }));
    audioEngine.updateTrackParams(trackIndex, newTracks[trackIndex].params);
  };

  const handleStepToggle = (trackId: string, step: number) => {
    const trackIndex = song.tracks.findIndex(t => t.id === trackId);
    if (trackIndex === -1) return;
    const track = song.tracks[trackIndex];
    const hasNoteAtStep = track.notes.some(
      n => step >= n.startStep && step < n.startStep + n.durationSteps
    );
    const newTracks = [...song.tracks];
    if (hasNoteAtStep) {
      newTracks[trackIndex] = {
        ...track,
        notes: track.notes.filter(
          n => !(step >= n.startStep && step < n.startStep + n.durationSteps)
        ),
      };
    } else {
      const defaultNote =
        track.type === 'drums'
          ? { note: 'kick', startStep: step, durationSteps: 1 }
          : track.type === 'bass'
            ? { note: 'C2', startStep: step, durationSteps: 4 }
            : { note: 'C4', startStep: step, durationSteps: 2 };
      newTracks[trackIndex] = {
        ...track,
        notes: [...track.notes, defaultNote].sort((a, b) => a.startStep - b.startStep),
      };
    }
    setSong(prev => ({ ...prev, tracks: newTracks }));
  };

  const setTrackMuted = (trackId: string, muted: boolean) => {
    const i = song.tracks.findIndex(t => t.id === trackId);
    if (i === -1) return;
    const newTracks = [...song.tracks];
    newTracks[i] = { ...newTracks[i], muted };
    setSong(prev => ({ ...prev, tracks: newTracks }));
  };

  const setTrackSolo = (trackId: string, solo: boolean) => {
    const i = song.tracks.findIndex(t => t.id === trackId);
    if (i === -1) return;
    const newTracks = [...song.tracks];
    newTracks[i] = { ...newTracks[i], solo };
    setSong(prev => ({ ...prev, tracks: newTracks }));
  };

  const setTrackVolume = (trackId: string, volume: number) => {
    const i = song.tracks.findIndex(t => t.id === trackId);
    if (i === -1) return;
    const newTracks = [...song.tracks];
    newTracks[i] = { ...newTracks[i], volume: Math.max(0, Math.min(2, volume)) };
    setSong(prev => ({ ...prev, tracks: newTracks }));
  };

  const setTrackPan = (trackId: string, pan: number) => {
    const i = song.tracks.findIndex(t => t.id === trackId);
    if (i === -1) return;
    const newTracks = [...song.tracks];
    newTracks[i] = { ...newTracks[i], pan: Math.max(-1, Math.min(1, pan)) };
    setSong(prev => ({ ...prev, tracks: newTracks }));
  };

  const setBpm = (bpm: number) => {
    const clamped = Math.max(1, Math.min(999, Math.round(bpm)));
    setSong(prev => ({ ...prev, bpm: clamped }));
  };

  const addTrack = () => {
    const newTrack: Track = {
      id: nextTrackId(),
      name: 'NEW',
      type: 'synth',
      notes: [],
      params: { waveform: 'sine', attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2, filterCutoff: 1000, filterRes: 1, gain: 0.5 },
      muted: false,
      solo: false,
      volume: 1,
      pan: 0,
    };
    setSong(prev => ({ ...prev, tracks: [...prev.tracks, newTrack] }));
    setSelectedTrackId(newTrack.id);
  };

  const removeTrack = (trackId: string) => {
    const i = song.tracks.findIndex(t => t.id === trackId);
    if (i === -1 || song.tracks.length <= 1) return;
    const next = song.tracks.filter(t => t.id !== trackId);
    setSong(prev => ({ ...prev, tracks: next }));
    if (selectedTrackId === trackId) {
      setSelectedTrackId(next[0].id);
    }
  };

  const duplicateTrack = (trackId: string) => {
    const track = song.tracks.find(t => t.id === trackId);
    if (!track) return;
    const newTrack: Track = { ...track, id: nextTrackId(), name: track.name + ' COPY' };
    const i = song.tracks.findIndex(t => t.id === trackId);
    const newTracks = [...song.tracks];
    newTracks.splice(i + 1, 0, newTrack);
    setSong(prev => ({ ...prev, tracks: newTracks }));
    setSelectedTrackId(newTrack.id);
  };

  const moveTrack = (trackId: string, direction: 'up' | 'down') => {
    const i = song.tracks.findIndex(t => t.id === trackId);
    if (i === -1) return;
    if (direction === 'up' && i === 0) return;
    if (direction === 'down' && i === song.tracks.length - 1) return;
    const newTracks = [...song.tracks];
    const j = direction === 'up' ? i - 1 : i + 1;
    [newTracks[i], newTracks[j]] = [newTracks[j], newTracks[i]];
    setSong(prev => ({ ...prev, tracks: newTracks }));
  };

  const handleDragStart = (e: React.DragEvent, trackId: string) => {
    setDraggedTrackId(trackId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, trackId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedTrackId && draggedTrackId !== trackId) {
      setDropTargetTrackId(trackId);
    }
  };

  const handleDragLeave = () => {
    setDropTargetTrackId(null);
  };

  const handleDrop = (e: React.DragEvent, targetTrackId: string) => {
    e.preventDefault();
    if (!draggedTrackId || draggedTrackId === targetTrackId) {
      setDraggedTrackId(null);
      setDropTargetTrackId(null);
      return;
    }

    const draggedIndex = song.tracks.findIndex(t => t.id === draggedTrackId);
    const targetIndex = song.tracks.findIndex(t => t.id === targetTrackId);
    
    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedTrackId(null);
      setDropTargetTrackId(null);
      return;
    }

    const newTracks = [...song.tracks];
    const [draggedTrack] = newTracks.splice(draggedIndex, 1);
    newTracks.splice(targetIndex, 0, draggedTrack);
    
    setSong(prev => ({ ...prev, tracks: newTracks }));
    setDraggedTrackId(null);
    setDropTargetTrackId(null);
  };

  const handleDragEnd = () => {
    setDraggedTrackId(null);
    setDropTargetTrackId(null);
  };

  const handleSave = () => {
    const result = saveSong(song);
    if (isErr(result)) alert(result.error.message);
    else alert('Saved.');
  };

  const handleLoad = () => {
    handleStop();
    const result = loadSong();
    if (isErr(result)) alert(result.error.message);
    else setSong(result.value);
  };

  const handleExport = () => {
    const blob = new Blob([exportSongToJson(song)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (song.title || 'doom-daw') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = (input.files ?? [])[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const result = importSongFromJson(text);
        if (isErr(result)) alert(result.error.message);
        else {
          handleStop();
          setSong(result.value);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (playState === PlayState.PLAYING) void handlePause();
        else void handlePlay();
      }
      if (e.code === 'KeyS') {
        e.preventDefault();
        handleStop();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [playState]);

  const handleTriggerNote = async () => {
    if (!selectedTrack) return;
    if (!initialized) await handleInit();

    // Find if there is a note defined at the selected step
    const noteAtStep = selectedTrack.notes.find(n => 
        selectedStep >= n.startStep && selectedStep < (n.startStep + n.durationSteps)
    );
    
    let noteToPlay = 'C4';
    // Defaults based on type
    if (selectedTrack.type === 'bass') noteToPlay = 'C2';
    if (selectedTrack.type === 'drums') noteToPlay = 'kick';
    
    // Override with actual note if exists
    if (noteAtStep) {
        noteToPlay = noteAtStep.note;
    }
    
    audioEngine.triggerNote(selectedTrack, noteToPlay);
  };

  const selectedTrack = song.tracks.find(t => t.id === selectedTrackId);

  if (!initialized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden z-10 p-4">
        <div className="cyber-panel p-8 md:p-12 text-center max-w-2xl w-full relative overflow-hidden group cursor-pointer" onClick={handleInit}>
          <div className="absolute top-0 left-0 w-full h-1 bg-[#39ff14] opacity-50"></div>
          <div className="absolute bottom-0 right-0 w-full h-1 bg-[#39ff14] opacity-50"></div>
          
          <h1 
            className="text-6xl md:text-8xl font-bold font-mono neon-text-green tracking-tighter mb-4 glitch" 
            data-text="DOOM DAW"
          >
            DOOM DAW
          </h1>
          <p className="text-xl md:text-2xl text-[#b026ff] neon-text-purple tracking-[0.5em] mb-12">IRKEN AUDIO LABS</p>
          
          <div className="relative inline-block">
             <div className="absolute inset-0 bg-[#39ff14] blur-xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
             <button className="relative bg-black border-2 border-[#39ff14] text-[#39ff14] px-10 py-4 uppercase tracking-widest text-lg hover:bg-[#39ff14] hover:text-black transition-all duration-200 font-bold clip-slant-left">
                [ Initialize System ]
             </button>
          </div>
          
          <div className="mt-8 text-xs text-gray-500 font-mono">
             v9.4.2 // NEURAL LINK: STANDBY // TOUCH TO START
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 relative z-10 flex flex-col max-h-screen">
      
      {/* Header / Prompt Bar */}
      <div className="max-w-[1400px] w-full mx-auto mb-6 flex flex-col md:flex-row gap-6 items-stretch shrink-0">
        <div className="cyber-panel flex-1 flex flex-col p-1">
            <div className="flex items-center justify-between px-2 py-1 bg-[#39ff14]/10 mb-1">
                <label className="text-[10px] text-[#39ff14] font-bold tracking-widest flex items-center gap-2">
                    <Cpu size={12} /> /// COMMAND_INPUT
                </label>
                <div className="flex gap-1">
                    <div className="w-2 h-2 bg-[#ff0055] rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 bg-[#39ff14] rounded-full"></div>
                </div>
            </div>
            
            <div className="flex gap-2 p-2">
                <input 
                    type="text" 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the music (e.g. 'Dark cyberpunk bassline, 128 BPM') — Generate creates an audio clip and adds it as a track"
                    className="bg-black/50 border border-gray-800 flex-1 text-lg font-mono text-[#39ff14] placeholder-gray-700 px-4 py-2 focus:border-[#39ff14] focus:outline-none transition-colors"
                    onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                />
                <button 
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="bg-[#39ff14] text-black font-bold px-6 py-2 hover:bg-[#b026ff] hover:text-white transition-all duration-200 uppercase disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 clip-slant-right shadow-[0_0_15px_rgba(57,255,20,0.4)] hover:shadow-[0_0_20px_rgba(176,38,255,0.6)]"
                >
                    {isGenerating ? <Activity className="animate-spin" /> : <Wand2 size={18} />}
                    {isGenerating ? "PROCESSING..." : "GENERATE"}
                </button>
            </div>
        </div>
        
        <div className="cyber-panel flex flex-wrap items-center gap-4 p-4 px-6 min-w-[320px] justify-between bg-black/80">
            <div className="flex items-center gap-3">
                <div className="text-center">
                    <div className="text-[10px] text-[#b026ff] tracking-widest mb-1">BPM</div>
                    <input
                        type="number"
                        min={1}
                        max={999}
                        value={song.bpm}
                        onChange={(e) => setBpm(Number(e.target.value))}
                        className="w-14 bg-black border border-[#b026ff] text-[#b026ff] text-xl font-bold font-mono text-center focus:outline-none focus:ring-1 focus:ring-[#b026ff]"
                        aria-label="Beats per minute"
                    />
                </div>
                <div className="flex flex-col items-center">
                    <div className="text-[9px] text-gray-500 mb-0.5">MASTER</div>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={masterVolume * 100}
                        onChange={(e) => setMasterVolume(Number(e.target.value) / 100)}
                        className="w-16 h-2 accent-[#39ff14]"
                        aria-label="Master volume"
                    />
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer" title="Metronome">
                    <Music size={14} className="text-gray-500" />
                    <input
                        type="checkbox"
                        checked={metronomeOn}
                        onChange={(e) => setMetronomeOn(e.target.checked)}
                        className="accent-[#b026ff]"
                    />
                    <span className="text-[9px] text-gray-500">CLICK</span>
                </label>
            </div>
            <div className="h-10 w-[1px] bg-gray-700"></div>
            <div className="flex gap-2">
                 {/* Stop Button */}
                <button 
                    onClick={handleStop}
                    className="w-12 h-12 flex items-center justify-center border-2 border-[#ff0055] text-[#ff0055] bg-black hover:bg-[#ff0055] hover:text-black transition-all duration-150 group"
                    title="STOP"
                >
                    <Square fill="currentColor" size={16} />
                </button>

                 {/* Play Button */}
                <button 
                    onClick={handlePlay}
                    className={`w-12 h-12 flex items-center justify-center border-2 transition-all duration-150 ${playState === PlayState.PLAYING ? 'border-[#39ff14] bg-[#39ff14] text-black shadow-[0_0_15px_#39ff14]' : 'border-[#39ff14] text-[#39ff14] hover:bg-[#39ff14] hover:text-black'}`}
                    title="PLAY"
                >
                    <Play fill="currentColor" size={16} className="ml-1" />
                </button>

                 {/* Pause Button */}
                <button 
                    onClick={handlePause}
                    className={`w-12 h-12 flex items-center justify-center border-2 transition-all duration-150 ${playState === PlayState.PAUSED ? 'border-[#b026ff] bg-[#b026ff] text-black shadow-[0_0_15px_#b026ff]' : 'border-[#b026ff] text-[#b026ff] hover:bg-[#b026ff] hover:text-black'}`}
                    title="PAUSE"
                >
                    <Pause fill="currentColor" size={16} />
                </button>
            </div>
            <div className="flex items-center gap-1 text-[10px]">
                <button onClick={undo} disabled={!canUndo} className="px-2 py-1 border border-gray-600 text-gray-400 hover:border-[#39ff14] hover:text-[#39ff14] disabled:opacity-40 disabled:cursor-not-allowed" title="Undo">UNDO</button>
                <button onClick={redo} disabled={!canRedo} className="px-2 py-1 border border-gray-600 text-gray-400 hover:border-[#39ff14] hover:text-[#39ff14] disabled:opacity-40 disabled:cursor-not-allowed" title="Redo">REDO</button>
                <span className="w-px h-4 bg-gray-600 mx-1" />
                <button onClick={handleSave} className="px-2 py-1 border border-gray-600 text-gray-400 hover:border-[#39ff14] hover:text-[#39ff14]" title="Save to browser">SAVE</button>
                <button onClick={handleLoad} className="px-2 py-1 border border-gray-600 text-gray-400 hover:border-[#39ff14] hover:text-[#39ff14]" title="Load from browser">LOAD</button>
                <button onClick={handleExport} className="px-2 py-1 border border-gray-600 text-gray-400 hover:border-[#39ff14] hover:text-[#39ff14]" title="Export JSON">EXPORT</button>
                <button onClick={handleImport} className="px-2 py-1 border border-gray-600 text-gray-400 hover:border-[#39ff14] hover:text-[#39ff14]" title="Import JSON">IMPORT</button>
            </div>
        </div>
      </div>

      <div className="max-w-[1400px] w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        
        {/* Left Col: Visualizer & Sequencer */}
        <div className="lg:col-span-8 flex flex-col gap-6 h-full min-h-0">
            <div className="cyber-panel p-1 shrink-0 bg-black/90">
                <Visualizer />
            </div>
            
            <div className="cyber-panel flex-1 p-4 relative overflow-y-auto flex flex-col bg-black/80 min-h-[300px]">
                <div className="flex justify-between items-center mb-4 border-b border-gray-800 pb-2">
                    <div className="text-xs text-[#39ff14] font-bold tracking-widest flex items-center gap-2 neon-text-green">
                        <Zap size={14} /> SEQUENCE_MATRIX
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[10px] text-gray-500">TRACKS: {song.tracks.length}</span>
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-500">STEPS:</span>
                            {([8, 16, 32] as const).map((n) => (
                                <button key={n} onClick={() => setSong(prev => ({ ...prev, stepsPerPattern: n }))} className={`px-2 py-0.5 text-[10px] border ${song.stepsPerPattern === n ? 'border-[#39ff14] bg-[#39ff14] text-black' : 'border-gray-600 text-gray-400 hover:border-gray-500'}`}>{n}</button>
                            ))}
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-500">SWING:</span>
                            <input type="range" min={0} max={100} value={song.swing} onChange={(e) => setSong(prev => ({ ...prev, swing: Number(e.target.value) }))} className="w-16 h-1.5 accent-[#b026ff]" aria-label="Swing amount" />
                            <span className="text-[9px] text-gray-500 w-6">{song.swing}%</span>
                        </div>
                        <button onClick={addTrack} className="flex items-center gap-1 px-2 py-1 text-[10px] border border-[#39ff14] text-[#39ff14] hover:bg-[#39ff14] hover:text-black" title="Add track"><Plus size={10} /> ADD</button>
                    </div>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {song.tracks.map((track) => {
                        const isDragging = draggedTrackId === track.id;
                        const isDropTarget = dropTargetTrackId === track.id;
                        return (
                        <div
                            key={track.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, track.id)}
                            onDragOver={(e) => handleDragOver(e, track.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, track.id)}
                            onDragEnd={handleDragEnd}
                            className={`transition-all duration-200 p-1 rounded border-l-2 relative overflow-hidden group cursor-move ${
                                isDragging ? 'opacity-50 scale-95' : ''
                            } ${
                                isDropTarget ? 'border-[#39ff14] bg-[#39ff14]/20 shadow-[0_0_15px_rgba(57,255,20,0.4)]' : ''
                            } ${
                                selectedTrackId === track.id ? 'border-[#b026ff] bg-[#b026ff]/5' : 'border-gray-800 hover:bg-white/5'
                            }`}
                        >
                            {selectedTrackId === track.id && <div className="absolute inset-0 bg-gradient-to-r from-[#b026ff]/10 to-transparent pointer-events-none" />}
                            <div className="flex items-center gap-2 w-full">
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => setTrackMuted(track.id, !track.muted)} className={`w-7 h-7 flex items-center justify-center text-[10px] font-bold border ${track.muted ? 'bg-[#ff0055]/30 border-[#ff0055] text-[#ff0055]' : 'border-gray-600 text-gray-400 hover:border-gray-500'}`} title={track.muted ? 'Unmute' : 'Mute'}>M</button>
                                    <button onClick={() => setTrackSolo(track.id, !track.solo)} className={`w-7 h-7 flex items-center justify-center text-[10px] font-bold border ${track.solo ? 'bg-[#39ff14]/30 border-[#39ff14] text-[#39ff14]' : 'border-gray-600 text-gray-400 hover:border-gray-500'}`} title={track.solo ? 'Unsolo' : 'Solo'}>S</button>
                                </div>
                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedTrackId(track.id)}>
                                    <Sequencer
                                        track={track}
                                        stepsPerPattern={song.stepsPerPattern}
                                        currentStep={currentStep}
                                        selectedStep={selectedStep}
                                        onStepSelect={(step) => setSelectedStep(step)}
                                        onStepToggle={(step) => handleStepToggle(track.id, step)}
                                    />
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                    <button onClick={() => moveTrack(track.id, 'up')} disabled={song.tracks.indexOf(track) === 0} className="w-6 h-8 flex items-center justify-center border border-gray-700 text-gray-500 hover:border-[#39ff14] hover:text-[#39ff14] disabled:opacity-30" title="Move up">↑</button>
                                    <button onClick={() => moveTrack(track.id, 'down')} disabled={song.tracks.indexOf(track) === song.tracks.length - 1} className="w-6 h-8 flex items-center justify-center border border-gray-700 text-gray-500 hover:border-[#39ff14] hover:text-[#39ff14] disabled:opacity-30" title="Move down">↓</button>
                                    <button onClick={() => duplicateTrack(track.id)} className="w-6 h-8 flex items-center justify-center border border-gray-700 text-gray-500 hover:border-[#39ff14] hover:text-[#39ff14]" title="Duplicate"><Copy size={12} /></button>
                                    <button onClick={() => removeTrack(track.id)} disabled={song.tracks.length <= 1} className="w-6 h-8 flex items-center justify-center border border-gray-700 text-gray-500 hover:border-[#ff0055] hover:text-[#ff0055] disabled:opacity-30" title="Remove"><Trash2 size={12} /></button>
                                </div>
                            </div>
                        </div>
                        );
                    })}
                </div>
            </div>
        </div>

        {/* Right Col: Synth Controls */}
        <div className="lg:col-span-4 h-full min-h-0">
            <div className="cyber-panel h-full p-4 flex flex-col relative bg-black/90 overflow-hidden">
                 <div className="absolute top-0 right-0 p-2 opacity-30 pointer-events-none">
                    <Activity size={100} className="text-[#39ff14]/10" />
                 </div>

                 <div className="mb-6 border-b border-[#b026ff]/30 pb-2 shrink-0 flex justify-between items-end">
                    <div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                            <Sliders size={12} /> PARAMETER_CONTROL
                        </div>
                        <div className="text-2xl font-bold text-[#b026ff] neon-text-purple truncate glitch" data-text={selectedTrack ? selectedTrack.name : 'NULL'}>
                            {selectedTrack ? selectedTrack.name : 'NO_SELECTION'}
                        </div>
                    </div>
                    {selectedTrack && (
                        <button 
                            onClick={handleTriggerNote}
                            className="mb-1 px-3 py-1 bg-[#b026ff]/20 border border-[#b026ff] text-[#b026ff] text-[10px] font-bold uppercase hover:bg-[#b026ff] hover:text-black transition-colors flex items-center gap-2 shadow-[0_0_10px_rgba(176,38,255,0.3)] hover:shadow-[0_0_15px_rgba(176,38,255,0.6)]"
                        >
                            <Zap size={10} /> AUDITION
                        </button>
                    )}
                 </div>

                 {selectedTrack && (
                     <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar flex-1 pb-4">
                        <div className="bg-black/40 p-4 rounded border border-gray-800 relative group hover:border-[#b026ff]/50 transition-colors">
                            <div className="absolute -top-2 left-3 bg-black px-1 text-[10px] text-[#b026ff] uppercase tracking-wider font-bold">Track Mix</div>
                            <div className="flex flex-wrap justify-between mt-2">
                                <Knob label="VOL" value={selectedTrack.volume} min={0} max={2} onChange={(v) => setTrackVolume(selectedTrack.id, v)} color="text-[#b026ff]" />
                                <Knob label="PAN" value={selectedTrack.pan} min={-1} max={1} onChange={(v) => setTrackPan(selectedTrack.id, v)} color="text-[#b026ff]" />
                            </div>
                        </div>
                        {selectedTrack.type !== 'audio' && (
                        <>
                        <div className="bg-black/40 p-4 rounded border border-gray-800 relative group hover:border-[#39ff14]/50 transition-colors">
                            <div className="absolute -top-2 left-3 bg-black px-1 text-[10px] text-[#39ff14] uppercase tracking-wider font-bold">Envelope (ADSR)</div>
                            <div className="flex flex-wrap justify-between mt-2">
                                <Knob label="ATK" value={selectedTrack.params.attack} min={0.01} max={2} onChange={(v) => updateTrackParam(selectedTrack.id, 'attack', v)} />
                                <Knob label="DEC" value={selectedTrack.params.decay} min={0.01} max={2} onChange={(v) => updateTrackParam(selectedTrack.id, 'decay', v)} />
                                <Knob label="SUS" value={selectedTrack.params.sustain} min={0} max={1} onChange={(v) => updateTrackParam(selectedTrack.id, 'sustain', v)} />
                                <Knob label="REL" value={selectedTrack.params.release} min={0.01} max={3} onChange={(v) => updateTrackParam(selectedTrack.id, 'release', v)} />
                            </div>
                        </div>

                        <div className="bg-black/40 p-4 rounded border border-gray-800 relative group hover:border-[#b026ff]/50 transition-colors">
                            <div className="absolute -top-2 left-3 bg-black px-1 text-[10px] text-[#b026ff] uppercase tracking-wider font-bold">Filter & Amp</div>
                            <div className="flex flex-wrap justify-between mt-2">
                                <Knob 
                                    label="CUTOFF" 
                                    value={selectedTrack.params.filterCutoff} 
                                    min={20} max={10000} step={10}
                                    color="text-[#b026ff]"
                                    onChange={(v) => updateTrackParam(selectedTrack.id, 'filterCutoff', v)} 
                                />
                                <Knob 
                                    label="RES" 
                                    value={selectedTrack.params.filterRes} 
                                    min={0} max={20} 
                                    color="text-[#b026ff]"
                                    onChange={(v) => updateTrackParam(selectedTrack.id, 'filterRes', v)} 
                                />
                                <Knob 
                                    label="GAIN" 
                                    value={selectedTrack.params.gain} 
                                    min={0} max={1} 
                                    color="text-[#ff0055]"
                                    onChange={(v) => updateTrackParam(selectedTrack.id, 'gain', v)} 
                                />
                            </div>
                        </div>

                        <div className="bg-black/40 p-4 rounded border border-gray-800 relative">
                             <div className="absolute -top-2 left-3 bg-black px-1 text-[10px] text-gray-400 uppercase tracking-wider font-bold">Oscillator Type</div>
                             <div className="grid grid-cols-2 gap-2 mt-2">
                                 {['sine', 'square', 'sawtooth', 'triangle'].map((type) => (
                                     <button
                                        key={type}
                                        onClick={() => {
                                            const newTracks = [...song.tracks];
                                            const tIdx = newTracks.findIndex(t => t.id === selectedTrack.id);
                                            if (tIdx === -1) return;
                                            const w = type as Track['params']['waveform'];
                                            newTracks[tIdx] = {
                                              ...newTracks[tIdx],
                                              params: { ...newTracks[tIdx].params, waveform: w }
                                            };
                                            setSong({ ...song, tracks: newTracks });
                                            audioEngine.updateTrackParams(tIdx, newTracks[tIdx].params);
                                        }}
                                        className={`
                                            py-2 text-[10px] uppercase font-bold border transition-all duration-200
                                            ${selectedTrack.params.waveform === type
                                                ? 'bg-[#39ff14] text-black border-[#39ff14] shadow-[0_0_10px_#39ff14]'
                                                : 'text-gray-400 border-gray-800 hover:border-gray-600 hover:text-white bg-black/50'
                                            }
                                        `}
                                     >
                                         {type}
                                     </button>
                                 ))}
                             </div>
                        </div>
                        </>
                        )}
                     </div>
                 )}
            </div>
        </div>
      </div>
      
      {/* Footer Decoration */}
      <div className="fixed bottom-2 right-4 text-[9px] text-gray-600 font-mono hidden md:block z-50">
        SYSTEM_STATUS: OPERATIONAL :: MEMORY: 64TB :: IRKEN_EMPIRE_V2.0
      </div>

    </div>
  );
};

export default App;