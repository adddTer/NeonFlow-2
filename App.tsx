
import React, { useState, useEffect } from 'react';
import { Music, Settings, ArrowLeft, Play, Clock, Pause, LogOut, Bug, AlertTriangle, Zap, Gauge, Eye, EyeOff, FastForward, Rewind, Crosshair, Skull, Flashlight, Bot } from 'lucide-react';
import { getSongById, saveSong } from './services/storageService';
import { calculateGrade } from './utils/scoring';
import GameCanvas from './components/GameCanvas';
import { LibraryScreen } from './components/screens/LibraryScreen';
import { ResultScreen } from './components/screens/ResultScreen';
import { AudioCalibration } from './components/screens/AudioCalibration';
import { EditorScreen } from './components/screens/EditorScreen';
import { LoadingScreen } from './components/ui/LoadingScreen';
import { MetadataDebugger } from './components/debug/MetadataDebugger';
import { Note, GameStatus, ScoreState, AITheme, DEFAULT_THEME, SavedSong, GameResult, SongStructure, GameModifier } from './types';
import { SettingsModal } from './components/modals/SettingsModal';
import { SongConfigModal } from './components/modals/SongConfigModal';
import { ProfileModal } from './components/modals/ProfileModal';

// Hooks
import { useAppSettings } from './hooks/useAppSettings';
import { useSongLibrary } from './hooks/useSongLibrary';
import { useSongGenerator } from './hooks/useSongGenerator';

function App() {
  // --- Game Session State ---
  const [status, setStatus] = useState<GameStatus>(GameStatus.Library);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [structure, setStructure] = useState<SongStructure | undefined>(undefined);
  const [theme, setTheme] = useState<AITheme>(DEFAULT_THEME); 
  const [score, setScore] = useState<ScoreState>({ score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, hitHistory: [], modifiers: [] });
  const [songName, setSongName] = useState<string>("");
  const [currentSongId, setCurrentSongId] = useState<string | null>(null); 
  const [editingSong, setEditingSong] = useState<SavedSong | null>(null);

  const [countdown, setCountdown] = useState(3);
  const [isSongLoading, setIsSongLoading] = useState(false);
  const [activeModifiers, setActiveModifiers] = useState<Set<GameModifier>>(new Set());

  // --- UI Toggles ---
  const [showSettings, setShowSettings] = useState(false);
  const [showCalibration, setShowCalibration] = useState(false);
  const [showMetadataDebug, setShowMetadataDebug] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [rebindingKey, setRebindingKey] = useState<{mode: 4|6, index: number} | null>(null);
  const [titleClickCount, setTitleClickCount] = useState(0);

  // --- Custom Hooks ---
  const { 
    scrollSpeed, setScrollSpeed, keyConfig, setKeyConfig, audioOffset, setAudioOffset,
    isDebugMode, toggleDebugMode, customApiKey, setCustomApiKey, apiKeyStatus, 
    validationError, handleSaveSettings, hasEnvKey
  } = useAppSettings();

  const {
    librarySongs, isLibraryLoading, loadLibrary, handleImportMap
  } = useSongLibrary();

  const {
    pendingFile, setPendingFile, isConfiguringSong, setIsConfiguringSong,
    loadingStage, setLoadingStage, loadingSubText, setLoadingSubText,
    errorMessage, setErrorMessage, onFileSelect, handleCreateBeatmap,
    selectedLaneCount, setSelectedLaneCount, selectedPlayStyle, setSelectedPlayStyle,
    selectedDifficulty, setSelectedDifficulty, aiOptions, setAiOptions,
    beatmapFeatures, setBeatmapFeatures, skipAI, setSkipAI
  } = useSongGenerator(
      customApiKey || process.env.API_KEY || "", 
      isDebugMode, 
      apiKeyStatus, 
      loadLibrary // Reload library on success
  );

  // --- Logic Wrappers ---

  const executeCreateBeatmap = async (options?: { empty?: boolean }) => {
      setStatus(GameStatus.Analyzing); // Show loading screen immediately
      const result = await handleCreateBeatmap(options);
      if (result?.success) {
          setStatus(GameStatus.Library);
          setSongName(result.songTitle || "");
      } else {
          setStatus(GameStatus.Library);
          if (result?.error === 'API_KEY_MISSING') setShowSettings(true);
      }
  };

  const executeImportMap = async (e: React.ChangeEvent<HTMLInputElement>) => {
      setStatus(GameStatus.Analyzing);
      await handleImportMap(e, setStatus, (stage, sub) => {
          setLoadingStage(stage);
          setLoadingSubText(sub);
      });
      setStatus(GameStatus.Library);
      setLoadingStage("");
      setLoadingSubText("");
  };

  // --- Effects ---

  // Key Rebinding Logic
  useEffect(() => {
    if (!rebindingKey) return;
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
        e.preventDefault();
        const newKey = e.key.toLowerCase();
        const reservedKeys = ['escape', 'enter', ' ', 'tab', 'shift', 'control', 'alt', 'meta', 'backspace', 'delete'];
        if (reservedKeys.includes(newKey) || newKey.length > 1) {
             alert(`无法绑定系统保留键或特殊功能键 (${e.key})`);
             return;
        }
        const currentArr = rebindingKey.mode === 4 ? keyConfig.k4 : keyConfig.k6;
        if (currentArr.includes(newKey) && currentArr[rebindingKey.index] !== newKey) {
            alert(`按键 "${newKey.toUpperCase()}" 已被当前模式占用`);
            return;
        }
        const newConfig = { ...keyConfig };
        if (rebindingKey.mode === 4) newConfig.k4[rebindingKey.index] = newKey;
        else newConfig.k6[rebindingKey.index] = newKey;
        setKeyConfig(newConfig);
        localStorage.setItem('neonflow_key_bindings', JSON.stringify(newConfig));
        setRebindingKey(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rebindingKey, keyConfig]);

  // Visibility Auto-Pause
  useEffect(() => {
    const handleVisibilityChange = () => {
        if (document.hidden && status === GameStatus.Playing && !activeModifiers.has(GameModifier.Auto)) {
            setStatus(GameStatus.Paused);
        }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [status, activeModifiers]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space' && status === GameStatus.Ready && !showSettings && !isConfiguringSong && !showMetadataDebug && !rebindingKey) {
            e.preventDefault();
            startCountdown();
        }
        if (e.code === 'Escape' && status === GameStatus.Playing) {
            e.preventDefault();
            pauseGame();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, showSettings, isConfiguringSong, showMetadataDebug, rebindingKey]);

  // Countdown Logic
  useEffect(() => {
    if (status === GameStatus.Countdown) {
        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
            return () => clearTimeout(timer);
        } else {
            setStatus(GameStatus.Playing);
        }
    }
  }, [status, countdown]);

  // --- Handlers ---

  const handleTitleClick = () => setTitleClickCount(prev => prev + 1);
  const handleVersionClick = () => {
      if (titleClickCount === 7) toggleDebugMode();
      setTitleClickCount(0);
  };

  const toggleModifier = (mod: GameModifier) => {
      const newMods = new Set(activeModifiers);
      if (newMods.has(mod)) {
          newMods.delete(mod);
      } else {
          // Mutually Exclusive Logic
          if (mod === GameModifier.DoubleTime) newMods.delete(GameModifier.HalfTime);
          if (mod === GameModifier.HalfTime) newMods.delete(GameModifier.DoubleTime);
          if (mod === GameModifier.SuddenDeath) newMods.delete(GameModifier.Auto);
          if (mod === GameModifier.Auto) newMods.delete(GameModifier.SuddenDeath);
          
          newMods.add(mod);
      }
      setActiveModifiers(newMods);
  };

  const handleSelectSong = async (song: SavedSong) => {
      setIsSongLoading(true);
      setCurrentSongId(song.id);
      setActiveModifiers(new Set()); // Reset mods on song change
      try {
          let fullSong = song;
          if (song.audioData.byteLength === 0) {
              const fetched = await getSongById(song.id);
              if (!fetched) throw new Error("Song not found in DB");
              fullSong = fetched;
          }
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });
          const decodedBuffer = await audioContext.decodeAudioData(fullSong.audioData.slice(0));
          setAudioBuffer(decodedBuffer);
          setNotes(fullSong.notes);
          setStructure(fullSong.structure);
          setTheme(fullSong.theme);
          setSongName(fullSong.title);
          setStatus(GameStatus.Ready);
      } catch (e) {
          console.error("Failed to load song audio", e);
          setErrorMessage("加载歌曲音频失败");
      } finally {
          setIsSongLoading(false);
      }
  };

  const handleEditSong = (song: SavedSong) => {
      setEditingSong(song);
      setStatus(GameStatus.Editing);
  };

  const handleEditorExit = () => {
      setStatus(GameStatus.Library);
      setEditingSong(null);
  };

  const handleEditorSave = async () => {
      await loadLibrary();
  };

  const startCountdown = () => { setStatus(GameStatus.Countdown); setCountdown(3); };
  const pauseGame = () => { if (status === GameStatus.Playing) setStatus(GameStatus.Paused); };
  const resumeGame = () => { if (status === GameStatus.Paused) { setStatus(GameStatus.Countdown); setCountdown(3); } };
  const confirmQuit = () => { setShowQuitConfirm(false); setStatus(GameStatus.Library); setScore({ score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, hitHistory: [], modifiers: [] }); };

  const handleGameEnd = async (finalScore?: ScoreState) => {
    setStatus(GameStatus.Finished);
    const resultScore = finalScore || score;
    
    if (currentSongId) {
        const fullSong = await getSongById(currentSongId);
        if (fullSong) {
            // Always increment play count (even if Auto mod, just as a usage stat)
            const updatedSong = { ...fullSong, playCount: (fullSong.playCount || 0) + 1 };
            
            // Don't save Score if Auto mod is on
            if (!activeModifiers.has(GameModifier.Auto)) {
                 const { rank } = calculateGrade(resultScore.perfect, resultScore.good, resultScore.miss, notes.length);
                 const newResult: GameResult = {
                    score: Math.floor(resultScore.score),
                    maxCombo: resultScore.maxCombo,
                    perfect: resultScore.perfect,
                    good: resultScore.good,
                    miss: resultScore.miss,
                    rank: rank,
                    timestamp: Date.now(),
                    hitHistory: resultScore.hitHistory,
                    modifiers: Array.from(activeModifiers)
                 };
                 
                 if (!updatedSong.bestResult || newResult.score > updatedSong.bestResult.score) {
                    updatedSong.bestResult = newResult;
                 }
            }
            
            await saveSong(updatedSong);
            await loadLibrary(); 
        }
    }
  };

  const backToLibrary = () => {
    setStatus(GameStatus.Library);
    setScore({ score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, hitHistory: [], modifiers: [] });
    setNotes([]);
    setStructure(undefined);
    setAudioBuffer(null);
    setCurrentSongId(null);
    setLoadingStage("");
    setLoadingSubText("");
    setErrorMessage(null);
  };

  const isGameActive = status === GameStatus.Playing || status === GameStatus.Countdown || status === GameStatus.Paused;

  // Optimized Mod List
  const MODS_LIST = [
      { id: GameModifier.DoubleTime, label: 'DT', name: 'Double Time', icon: <FastForward className="w-5 h-5"/>, color: 'text-red-400', desc: '1.5倍速 (分数+20%)' },
      { id: GameModifier.HalfTime, label: 'HT', name: 'Half Time', icon: <Rewind className="w-5 h-5"/>, color: 'text-blue-400', desc: '0.75倍速 (分数-50%)' },
      { id: GameModifier.HardRock, label: 'HR', name: 'Hard Rock', icon: <Crosshair className="w-5 h-5"/>, color: 'text-orange-400', desc: '严苛判定 (分数+10%)' },
      { id: GameModifier.SuddenDeath, label: 'SD', name: 'Sudden Death', icon: <Skull className="w-5 h-5"/>, color: 'text-gray-400', desc: '失误即死 (无加成)' },
      { id: GameModifier.Hidden, label: 'HD', name: 'Hidden', icon: <EyeOff className="w-5 h-5"/>, color: 'text-purple-400', desc: '隐形音符 (分数+6%)' },
      { id: GameModifier.Flashlight, label: 'FL', name: 'Flashlight', icon: <Flashlight className="w-5 h-5"/>, color: 'text-yellow-400', desc: '受限视野 (分数+12%)' },
      { id: GameModifier.Auto, label: 'Auto', name: 'Auto Play', icon: <Bot className="w-5 h-5"/>, color: 'text-green-400', desc: '全连演示 (不计分)' },
  ];

  return (
    <div className="h-[100dvh] w-full flex flex-col transition-colors duration-1000 font-sans text-white select-none relative overflow-hidden" style={{ background: status === GameStatus.Library ? '#030304' : `radial-gradient(circle at center, ${theme.secondaryColor}22 0%, #030304 100%)` }}>
      
      {/* Modals & Overlays */}
      {showCalibration && <AudioCalibration initialOffset={audioOffset} onClose={(newOffset) => { setAudioOffset(newOffset); localStorage.setItem('neonflow_audio_offset', String(newOffset)); setShowCalibration(false); setShowSettings(true); }} />}
      {showMetadataDebug && <MetadataDebugger onClose={() => { setShowMetadataDebug(false); setShowSettings(true); }} />}
      {showProfile && <ProfileModal songs={librarySongs} onClose={() => setShowProfile(false)} />}
      
      {isConfiguringSong && pendingFile && (
        <SongConfigModal 
            file={pendingFile}
            onCancel={() => { setPendingFile(null); setIsConfiguringSong(false); }}
            onConfirm={executeCreateBeatmap}
            laneCount={selectedLaneCount} setLaneCount={setSelectedLaneCount}
            playStyle={selectedPlayStyle} setPlayStyle={setSelectedPlayStyle}
            difficulty={selectedDifficulty} setDifficulty={setSelectedDifficulty}
            features={beatmapFeatures} setFeatures={setBeatmapFeatures}
            isDebugMode={isDebugMode} skipAI={skipAI} setSkipAI={setSkipAI}
        />
      )}
      
      {showSettings && (
        <SettingsModal 
            onClose={() => setShowSettings(false)}
            scrollSpeed={scrollSpeed} setScrollSpeed={setScrollSpeed}
            keyConfig={keyConfig} setKeyConfig={setKeyConfig}
            audioOffset={audioOffset} openCalibration={() => { setShowSettings(false); setShowCalibration(true); }}
            isDebugMode={isDebugMode} openMetadataDebugger={() => { setShowSettings(false); setShowMetadataDebug(true); }}
            apiKeyStatus={apiKeyStatus} customApiKey={customApiKey} setCustomApiKey={setCustomApiKey}
            handleSaveSettings={() => handleSaveSettings(() => setShowSettings(false))} validationError={validationError}
            rebindingKey={rebindingKey} setRebindingKey={setRebindingKey} hasEnvKey={hasEnvKey}
        />
      )}

      {isSongLoading && <LoadingScreen text="加载乐谱" subText="引擎预热中..." />}
      {status === GameStatus.Analyzing && <LoadingScreen text={loadingStage || "请稍候"} subText={loadingSubText} />}
      
      {/* Header */}
      {!isGameActive && status !== GameStatus.Editing && (
          <header className="p-4 md:p-6 border-b border-white/5 bg-[#030304]/80 backdrop-blur-xl flex justify-between items-center z-40 sticky top-0 shrink-0">
            <div className="flex items-center gap-3 group" onClick={backToLibrary}>
              <div className="relative cursor-pointer">
                  <div className="absolute inset-0 bg-neon-blue blur-lg opacity-20 group-hover:opacity-40 transition-opacity"></div>
                  <Music className="w-7 h-7 md:w-8 md:h-8 relative z-10 transition-colors" style={{ color: status === GameStatus.Library ? '#00f3ff' : theme.primaryColor }} />
              </div>
              <div onClick={handleTitleClick} className="cursor-default">
                  <h1 className="text-xl md:text-2xl font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 group-hover:to-white transition-all select-none">NEON<span style={{ color: status === GameStatus.Library ? '#00f3ff' : theme.primaryColor }}>FLOW 2</span></h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
                 <button onClick={() => setShowSettings(true)} disabled={status === GameStatus.Analyzing} className={`p-2.5 md:p-3 rounded-xl transition-all flex items-center gap-2 border ${status === GameStatus.Analyzing ? 'opacity-50 cursor-not-allowed border-transparent bg-transparent text-gray-600' : apiKeyStatus !== 'valid' ? 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20' : 'text-gray-400 border-white/5 hover:text-white hover:bg-white/5'}`} title="设置">
                   {apiKeyStatus !== 'valid' && status !== GameStatus.Analyzing && <span className="text-xs font-bold hidden md:inline">配置 API</span>}
                   <Settings className="w-5 h-5" />
                 </button>
            </div>
          </header>
      )}

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col items-center justify-center overflow-hidden w-full">
        {/* Ambient Background */}
        {status !== GameStatus.Library && status !== GameStatus.Playing && status !== GameStatus.Paused && status !== GameStatus.Editing && (
            <div className="absolute inset-0 pointer-events-none transition-colors duration-1000">
                <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] opacity-10 rounded-full blur-[150px]" style={{ backgroundColor: theme.primaryColor }} />
                <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] opacity-10 rounded-full blur-[150px]" style={{ backgroundColor: theme.secondaryColor }} />
            </div>
        )}

        {status === GameStatus.Library && (
            <LibraryScreen 
                songs={librarySongs} isLoading={isLibraryLoading} hasApiKey={apiKeyStatus === 'valid' || isDebugMode}
                onImportAudioClick={onFileSelect} onImportMapClick={executeImportMap} onSelectSong={handleSelectSong}
                onEditSong={handleEditSong}
                onRefreshLibrary={loadLibrary} onOpenSettings={() => setShowSettings(true)}
                onOpenProfile={() => setShowProfile(true)}
            />
        )}

        {status === GameStatus.Editing && editingSong && (
            <EditorScreen 
                song={editingSong} 
                onExit={handleEditorExit} 
                onSaveSuccess={handleEditorSave}
                keyConfig={keyConfig}
            />
        )}

        {status === GameStatus.Ready && (
          <div className="fixed inset-0 z-50 bg-[#0a0a0a] flex flex-col">
             <div className="absolute inset-0 overflow-hidden pointer-events-none">
                 <div className="absolute inset-0 opacity-20 blur-[120px]" style={{ background: `radial-gradient(circle at top center, ${theme.primaryColor}, transparent 60%)` }}></div>
                 <div className="absolute inset-0 bg-black/60"></div>
                 <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
             </div>
             
             {/* Header */}
             <div className="relative z-50 flex justify-between items-center p-6 w-full shrink-0">
                <button onClick={backToLibrary} className="group flex items-center justify-center w-12 h-12 rounded-full bg-white/5 border border-white/5 backdrop-blur-md hover:bg-white/10 active:scale-95 transition-all"><ArrowLeft className="w-6 h-6 text-white group-hover:-translate-x-1 transition-transform" /></button>
                <div className="px-3 py-1 rounded-full bg-white/5 border border-white/5 backdrop-blur-md text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">任务简报</div>
                <div className="w-12"></div>
             </div>

             <div className="flex-1 overflow-y-auto custom-scrollbar relative z-10 w-full flex flex-col items-center">
                 <div className="w-full max-w-4xl p-6 flex flex-col gap-8 items-center">
                     
                     {/* Disk & Title */}
                     <div className="flex flex-col items-center gap-6">
                         <div className="relative group shrink-0">
                             <div className="absolute inset-0 bg-gradient-to-br from-black via-transparent to-black opacity-60 z-10 rounded-full"></div>
                             <div className="w-40 h-40 md:w-56 md:h-56 rounded-full border-4 border-white/5 shadow-[0_0_60px_rgba(0,0,0,0.6)] relative overflow-hidden flex items-center justify-center bg-black">
                                  <div className="absolute inset-0 animate-spin-slow" style={{ background: `conic-gradient(from 0deg, ${theme.primaryColor}, ${theme.secondaryColor}, ${theme.primaryColor})`, opacity: 0.4, animationDuration: '8s' }}></div>
                                  <Music className="w-16 h-16 text-white/40 relative z-20" />
                                  <div className="absolute inset-4 rounded-full border border-white/10"></div>
                             </div>
                         </div>
                         <div className="text-center space-y-2 max-w-2xl">
                            <h1 className="text-2xl md:text-4xl font-black text-white leading-tight tracking-tight break-words line-clamp-2" style={{ textShadow: `0 0 30px ${theme.primaryColor}33` }}>{songName}</h1>
                            <div className="flex flex-wrap items-center justify-center gap-3 text-xs md:text-sm font-bold text-gray-500 uppercase tracking-widest">
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {Math.floor((audioBuffer?.duration || 0) / 60)}:{(Math.floor((audioBuffer?.duration || 0) % 60)).toString().padStart(2,'0')}</span>
                                <span className="w-1 h-1 rounded-full bg-gray-700"></span>
                                <span>{notes.length} NOTES</span>
                            </div>
                         </div>
                     </div>

                     {/* Info Grid */}
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full">
                         <div className="bg-white/5 p-3 rounded-xl border border-white/5 backdrop-blur-md flex flex-col items-center justify-center">
                             <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">密度</div>
                             <div className="text-lg font-black text-white">{(notes.length / (audioBuffer?.duration || 60)).toFixed(1)} NPS</div>
                         </div>
                         <div className="bg-white/5 p-3 rounded-xl border border-white/5 backdrop-blur-md flex flex-col items-center justify-center">
                             <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">按键</div>
                             <div className="text-lg font-black text-white">{theme.primaryColor === '#bd00ff' ? '6K' : '4K'}</div>
                         </div>
                         <div className="bg-white/5 p-3 rounded-xl border border-white/5 backdrop-blur-md flex flex-col items-center justify-center">
                             <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">BPM</div>
                             <div className="text-lg font-black text-white">{Math.round(structure?.bpm || 0)}</div>
                         </div>
                         <div className="bg-white/5 p-3 rounded-xl border border-white/5 backdrop-blur-md flex flex-col items-center justify-center">
                             <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Mods</div>
                             <div className="text-lg font-black text-neon-blue">{activeModifiers.size}</div>
                         </div>
                     </div>

                     {/* Mod Selectors */}
                     <div className="w-full bg-black/40 rounded-3xl border border-white/10 p-6">
                         <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                             <Zap className="w-4 h-4" /> 游戏修改器
                         </div>
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                             {MODS_LIST.map(mod => {
                                 const isActive = activeModifiers.has(mod.id);
                                 return (
                                     <button
                                        key={mod.id}
                                        onClick={() => toggleModifier(mod.id)}
                                        className={`relative group overflow-hidden rounded-xl p-3 border transition-all duration-300 flex flex-col gap-2 text-left
                                            ${isActive 
                                                ? 'bg-white border-white shadow-[0_0_20px_rgba(255,255,255,0.3)] scale-[1.02]' 
                                                : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'
                                            }`}
                                     >
                                         <div className="flex justify-between items-start w-full">
                                             <div className={`p-2 rounded-lg transition-colors ${isActive ? 'bg-black text-white' : 'bg-white/5 ' + mod.color}`}>
                                                 {mod.icon}
                                             </div>
                                             <span className={`text-xl font-black italic opacity-20 ${isActive ? 'text-black' : 'text-white'}`}>{mod.label}</span>
                                         </div>
                                         <div>
                                             <div className={`font-bold text-sm ${isActive ? 'text-black' : 'text-gray-200'}`}>{mod.name}</div>
                                             <div className={`text-[10px] font-bold ${isActive ? 'text-black/60' : 'text-gray-500'}`}>{mod.desc}</div>
                                         </div>
                                     </button>
                                 )
                             })}
                         </div>
                     </div>

                     <div className="h-20 md:h-0"></div>
                 </div>
             </div>

             {/* Footer Action */}
             <div className="absolute bottom-0 left-0 right-0 p-6 z-50 md:relative md:bg-transparent md:p-8 md:pt-0 flex justify-center bg-gradient-to-t from-black via-black/90 to-transparent">
                <button onClick={startCountdown} className="group relative w-full max-w-md py-5 rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.5)] transition-all hover:scale-[1.02] active:scale-95">
                    <div className="absolute inset-0 bg-white group-hover:bg-neon-blue transition-colors duration-500"></div>
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-30 mix-blend-overlay"></div>
                    <div className="relative z-10 flex items-center justify-center gap-3 text-black"><Play className="fill-current w-6 h-6" /><span className="text-xl font-black uppercase tracking-[0.2em]">启动引擎</span></div>
                </button>
             </div>
          </div>
        )}

        {status === GameStatus.Paused && (
            <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex items-center justify-center animate-fade-in">
                 <div className="relative bg-[#0f172a]/80 border border-white/10 rounded-3xl p-8 w-full max-w-sm shadow-[0_0_50px_rgba(0,0,0,0.5)] text-center overflow-hidden">
                     <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-neon-blue to-transparent opacity-50"></div>
                     <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-neon-purple to-transparent opacity-50"></div>
                     <div className="mb-8 relative z-10">
                         <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/10 shadow-lg shadow-black/20"><Pause className="w-8 h-8 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" /></div>
                         <h2 className="text-3xl font-black text-white uppercase tracking-[0.2em] mb-1">PAUSED</h2>
                         <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">System Halted</p>
                     </div>
                     <div className="space-y-4 relative z-10">
                         <button onClick={resumeGame} className="w-full py-4 bg-neon-blue text-black font-black text-lg rounded-xl hover:bg-white hover:shadow-[0_0_20px_rgba(0,243,255,0.4)] transition-all uppercase tracking-widest flex items-center justify-center gap-2 group">
                             <Play className="w-5 h-5 fill-current group-hover:scale-110 transition-transform" />继续游戏
                         </button>
                         <button onClick={() => setShowQuitConfirm(true)} className="w-full py-4 bg-white/5 text-white font-bold text-lg rounded-xl hover:bg-white/10 hover:border-white/20 transition-all uppercase tracking-widest border border-white/5 flex items-center justify-center gap-2 group">
                             <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />退出
                         </button>
                     </div>
                 </div>
                 {showQuitConfirm && (
                    <div className="absolute inset-0 z-[110] bg-black/80 flex items-center justify-center animate-fade-in p-4 backdrop-blur-sm">
                        <div className="bg-[#0f172a] border border-red-500/30 rounded-2xl p-6 w-full max-w-xs shadow-2xl relative">
                            <h3 className="text-xl font-black text-red-400 mb-2 flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> 确认退出</h3>
                            <p className="text-gray-400 text-sm mb-6">当前进度将丢失，确定要返回主菜单吗？</p>
                            <div className="flex gap-3">
                                <button onClick={() => setShowQuitConfirm(false)} className="flex-1 py-3 bg-white/10 rounded-xl font-bold hover:bg-white/20 transition-colors">取消</button>
                                <button onClick={confirmQuit} className="flex-1 py-3 bg-red-500 rounded-xl font-bold hover:bg-red-600 text-white shadow-lg transition-colors">确认退出</button>
                            </div>
                        </div>
                    </div>
                 )}
            </div>
        )}
        
        {status === GameStatus.Countdown && (
            <div className="z-50 absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-[10rem] md:text-[15rem] font-black italic text-white animate-pulse-fast tracking-tighter drop-shadow-[0_0_50px_rgba(0,0,0,0.8)]" style={{ textShadow: `0 0 80px ${theme.primaryColor}`}}>{countdown > 0 ? countdown : 'GO!'}</div>
            </div>
        )}

        {(status === GameStatus.Playing || status === GameStatus.Countdown || status === GameStatus.Paused) && (
            <div className="absolute inset-0 z-0 w-full h-full">
                 <GameCanvas 
                    status={status} 
                    audioBuffer={audioBuffer} 
                    notes={notes} 
                    structure={structure} 
                    theme={theme} 
                    audioOffset={audioOffset} 
                    scrollSpeed={scrollSpeed} 
                    keyBindings={selectedLaneCount === 4 ? keyConfig.k4 : keyConfig.k6} 
                    modifiers={Array.from(activeModifiers)}
                    isPaused={status === GameStatus.Paused} 
                    onScoreUpdate={setScore} 
                    onGameEnd={handleGameEnd} 
                 />
            </div>
        )}

        <ResultScreen status={status} score={score} notesCount={notes.length} songName={songName} onReset={backToLibrary} onReplay={() => startCountdown()} />
      </main>

      {!isGameActive && status !== GameStatus.Editing && (
          <footer className="p-4 md:p-6 text-center text-[8px] md:text-[10px] text-gray-700 uppercase tracking-[0.2em] bg-[#030304] shrink-0 border-t border-white/5 select-none" onClick={handleVersionClick}>
             <p className="flex items-center justify-center gap-2">NeonFlow v2.0 • AI Rhythm Engine {isDebugMode && <span className="text-red-500 font-bold flex items-center gap-1"><Bug className="w-3 h-3"/> DEV MODE</span>}</p>
          </footer>
      )}
    </div>
  );
}

export default App;
