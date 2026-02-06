import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Mic, Wand2, Activity, Zap, Cpu, Sliders, Pause } from 'lucide-react';
import { audioEngine } from './services/audioEngine';
import { generateSong } from './services/geminiService';
import { isErr } from './lib/result';
import { SongData, Track, PlayState } from './types';
import { Visualizer } from './components/Visualizer';
import { Sequencer } from './components/Sequencer';
import { Knob } from './components/Knob';

// Default initial state
const INITIAL_SONG: SongData = {
  title: "INIT_SEQUENCE_01",
  bpm: 128,
  tracks: [
    {
      id: "t1",
      name: "LEAD",
      type: "synth",
      notes: [{ note: "C4", startStep: 0, durationSteps: 2 }, { note: "E4", startStep: 4, durationSteps: 2 }, { note: "G4", startStep: 8, durationSteps: 2 }, { note: "B4", startStep: 12, durationSteps: 2 }],
      params: { waveform: "sawtooth", attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2, filterCutoff: 2000, filterRes: 1, gain: 0.4 },
      muted: false
    },
    {
      id: "t2",
      name: "BASS",
      type: "bass",
      notes: [{ note: "C2", startStep: 0, durationSteps: 4 }, { note: "G2", startStep: 8, durationSteps: 4 }],
      params: { waveform: "square", attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.1, filterCutoff: 400, filterRes: 5, gain: 0.6 },
      muted: false
    },
    {
      id: "t3",
      name: "KICK",
      type: "drums",
      notes: [{ note: "kick", startStep: 0, durationSteps: 1 }, { note: "kick", startStep: 4, durationSteps: 1 }, { note: "kick", startStep: 8, durationSteps: 1 }, { note: "kick", startStep: 12, durationSteps: 1 }],
      params: { waveform: "sine", attack: 0, decay: 0.1, sustain: 0, release: 0, filterCutoff: 1000, filterRes: 0, gain: 1 },
      muted: false
    }
  ]
};

const App: React.FC = () => {
  const [song, setSong] = useState<SongData>(INITIAL_SONG);
  const [playState, setPlayState] = useState<PlayState>(PlayState.STOPPED);
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [selectedStep, setSelectedStep] = useState<number>(0);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState<string>(INITIAL_SONG.tracks[0].id);
  const [initialized, setInitialized] = useState(false);

  // Sync song data with audio engine
  useEffect(() => {
    audioEngine.setSongData(song);
  }, [song]);

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

    const result = await generateSong(prompt);
    if (isErr(result)) {
      alert(`IRKEN SYSTEM ERROR: ${result.error.message}`);
      setIsGenerating(false);
      return;
    }

    const newSong = result.value;
    const completeTracks = newSong.tracks.map((t, i) => ({
      ...INITIAL_SONG.tracks[i % INITIAL_SONG.tracks.length],
      ...t,
      muted: t.muted ?? false,
      params: { ...INITIAL_SONG.tracks[i % INITIAL_SONG.tracks.length].params, ...t.params }
    }));

    setSong({ ...newSong, tracks: completeTracks });
    if (completeTracks.length > 0) setSelectedTrackId(completeTracks[0].id);
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
    
    setSong({ ...song, tracks: newTracks });
    audioEngine.updateTrackParams(trackIndex, newTracks[trackIndex].params);
  };

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
                    placeholder="ENTER AUDIO PARAMETERS (e.g., 'Dark cyberpunk bassline with aggressive leads')"
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
        
        <div className="cyber-panel flex items-center gap-4 p-4 px-6 min-w-[280px] justify-between bg-black/80">
            <div className="text-center mr-2">
                <div className="text-[10px] text-[#b026ff] tracking-widest mb-1">BPM</div>
                <div className="text-3xl font-bold text-white font-vt323 neon-text-purple">{song.bpm}</div>
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
                    <div className="text-[10px] text-gray-500">
                        TRACKS: {song.tracks.length} // STEPS: 16
                    </div>
                </div>
                
                <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {song.tracks.map((track) => (
                        <div 
                            key={track.id} 
                            onClick={() => setSelectedTrackId(track.id)}
                            className={`transition-all duration-200 cursor-pointer p-1 rounded border-l-2 relative overflow-hidden group ${selectedTrackId === track.id ? 'border-[#b026ff] bg-[#b026ff]/5' : 'border-gray-800 hover:bg-white/5'}`}
                        >
                            {selectedTrackId === track.id && <div className="absolute inset-0 bg-gradient-to-r from-[#b026ff]/10 to-transparent pointer-events-none"></div>}
                            <Sequencer 
                                track={track} 
                                currentStep={currentStep} 
                                selectedStep={selectedStep}
                                onStepSelect={(step) => setSelectedStep(step)}
                            />
                        </div>
                    ))}
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