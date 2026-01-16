
import React, { useEffect, useState, useRef } from 'react';
import { EditorCanvas } from '../editor/EditorCanvas';
import { useChartEditor, EditorTool, SnapDivisor } from '../../hooks/useChartEditor';
import { SavedSong, AITheme, NoteType, KeyConfig } from '../../types';
import { Play, Pause, Save, LogOut, Plus, Trash2, MousePointer, Magnet, Clock, ChevronDown, Layers, Music, Settings2, AlertTriangle, X, Circle, Mic, Sparkles, Send, Bot, Zap, AudioWaveform } from 'lucide-react';
import { saveSong, getSongById } from '../../services/storageService';
import { generatePatternWithGemini } from '../../services/geminiService';
import { useAppSettings } from '../../hooks/useAppSettings';
import { sliceAudioBufferToWavBase64 } from '../../utils/fileUtils';
import { getAudioBufferSlice, preprocessAudioData, computeOnsets } from '../../utils/audioAnalyzer';

interface EditorScreenProps {
    song: SavedSong;
    onExit: () => void;
    onSaveSuccess: () => void;
    keyConfig: KeyConfig;
}

export const EditorScreen: React.FC<EditorScreenProps> = ({ song, onExit, onSaveSuccess, keyConfig }) => {
    
    const [audioBuffer, setAudioBuffer] = React.useState<AudioBuffer | null>(null);
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const [activeTab, setActiveTab] = useState<'PROPS' | 'COPILOT'>('PROPS');
    
    // AI Copilot State
    const [aiPrompt, setAiPrompt] = useState("");
    const [aiIsLoading, setAiIsLoading] = useState(false);
    const [aiTargetBeats, setAiTargetBeats] = useState(16); // Slider controlled
    // Removed alignToDrums state - now ALWAYS enforced
    const { customApiKey, apiKeyStatus } = useAppSettings();

    // Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [recordSnap, setRecordSnap] = useState(true);
    const activeRecordingLanes = useRef<{[key: number]: number}>({});

    // Load Audio
    useEffect(() => {
        const load = async () => {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            let data = song.audioData;
            if (data.byteLength === 0) {
                 const full = await getSongById(song.id);
                 if (full) data = full.audioData;
            }
            try {
                // Ensure context is running or valid before decode
                const buf = await ctx.decodeAudioData(data.slice(0));
                setAudioBuffer(buf);
            } catch (e) {
                console.error("Failed to decode audio in Editor", e);
            }
            ctx.close();
        };
        load();
    }, [song.id]);

    const handleSave = async (newNotes: any[]) => {
        // Critical Fix: Fetch full song to ensure we have audioData. 
        const fullSong = await getSongById(song.id);
        
        if (!fullSong) {
            console.error("Critical: Could not find song to save");
            return;
        }

        const updatedSong = { 
            ...fullSong, 
            notes: newNotes,
            audioData: fullSong.audioData 
        };
        
        await saveSong(updatedSong);
        onSaveSuccess();
    };

    const editor = useChartEditor({
        initialNotes: song.notes,
        audioBuffer: audioBuffer,
        structure: song.structure,
        laneCount: song.laneCount,
        onSave: handleSave
    });

    // Helper: Get visual AI region
    const beatDuration = 60 / editor.bpm;
    const snappedStartTime = Math.round(editor.currentTime / beatDuration) * beatDuration;
    // Clamp to audio duration
    const maxDuration = (audioBuffer?.duration || 60) - snappedStartTime;
    const effectiveAiDuration = Math.min(aiTargetBeats * beatDuration, maxDuration);
    const aiEndTime = snappedStartTime + effectiveAiDuration;
    
    const isLongDurationMode = effectiveAiDuration > 25.0;

    // --- AI Copilot Handlers ---
    const handleAiGenerate = async (overridePrompt?: string) => {
        const promptToUse = overridePrompt || aiPrompt;
        if (!promptToUse.trim()) return;
        if (effectiveAiDuration <= 0) {
            alert("已到达音频末尾，无法生成。");
            return;
        }
        
        setAiIsLoading(true);
        try {
            // Determine Context
            
            // 1. Capture Audio Context (Context Window: Target Duration)
            let audioContextBase64 = undefined;
            let absoluteOnsets: { time: number, energy: number }[] = [];

            if (audioBuffer) {
                // For Sending to AI
                audioContextBase64 = await sliceAudioBufferToWavBase64(audioBuffer, snappedStartTime, effectiveAiDuration + 0.5);
                
                // For Programmatic Alignment (DSP) - ALWAYS ENABLED
                const slice = getAudioBufferSlice(audioBuffer, snappedStartTime, effectiveAiDuration);
                const { lowData, fullData } = await preprocessAudioData(slice);
                const rawOnsets = computeOnsets(lowData, fullData, slice.sampleRate);
                // Convert relative slice time to absolute song time
                absoluteOnsets = rawOnsets.map(o => ({ ...o, time: snappedStartTime + o.time }));
            }

            // 2. Capture Note Context
            // A. Preceding notes (for flow)
            const lookbackTime = 2 * beatDuration;
            const precedingNotes = editor.notes
                .filter(n => n.time >= snappedStartTime - lookbackTime && n.time < snappedStartTime)
                .map(n => ({
                    lane: n.lane,
                    timeDiff: Number(((n.time - snappedStartTime) / beatDuration).toFixed(2))
                }))
                .sort((a,b) => a.timeDiff - b.timeDiff);

            // B. Existing notes in target window (for replacement/awareness)
            const existingNotesInWindow = editor.notes
                .filter(n => n.time >= snappedStartTime && n.time < aiEndTime)
                .map(n => ({
                    lane: n.lane,
                    beatOffset: Number(((n.time - snappedStartTime) / beatDuration).toFixed(2))
                }));

            const result = await generatePatternWithGemini(
                promptToUse,
                {
                    bpm: editor.bpm,
                    laneCount: song.laneCount,
                    beatCount: Math.ceil(effectiveAiDuration / beatDuration)
                },
                {
                    audioBase64: audioContextBase64,
                    precedingNotes: precedingNotes,
                    existingNotesInWindow: existingNotesInWindow
                },
                customApiKey
            );

            // Execute Instructions sequentially
            if (result.instructions && result.instructions.length > 0) {
                
                for (const instr of result.instructions) {
                    if (instr.type === 'CLEAR') {
                        // Delete notes in range, optionally filtering by targetLanes
                        editor.deleteNotesInRange(snappedStartTime, aiEndTime, instr.lanes);
                    } 
                    else if (instr.type === 'ADD' && instr.notes) {
                        const notesToAdd: { time: number, lane: number, duration: number }[] = [];
                        
                        for (const n of instr.notes) {
                            let time = snappedStartTime + (n.beatOffset * beatDuration);
                            
                            // Programmatic Alignment Logic (Always On)
                            if (absoluteOnsets.length > 0) {
                                // Find closest onset within tolerance (150ms)
                                const snapWindow = 0.15;
                                let bestOnset = null;
                                let minDiff = snapWindow;

                                for (const onset of absoluteOnsets) {
                                    const diff = Math.abs(onset.time - time);
                                    if (diff < minDiff) {
                                        minDiff = diff;
                                        bestOnset = onset;
                                    }
                                }

                                if (bestOnset) {
                                    time = bestOnset.time;
                                }
                            }
                            
                            // Additional Safety: Clamp time to selected region
                            if (time < snappedStartTime) time = snappedStartTime;
                            if (time > aiEndTime) continue; // Skip if snapped outside

                            notesToAdd.push({
                                time,
                                lane: n.lane,
                                duration: n.duration * beatDuration
                            });
                        }
                        
                        editor.bulkAddNotes(notesToAdd);
                    }
                }
            }
        } catch (error) {
            console.error("Copilot Error:", error);
            alert("AI 生成失败，请检查 API Key 或网络连接。");
        } finally {
            setAiIsLoading(false);
        }
    };

    // --- Live Recording Logic ---
    useEffect(() => {
        const currentKeys = song.laneCount === 4 ? keyConfig.k4 : keyConfig.k6;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isRecording || !editor.isPlaying || e.repeat) return;
            const key = e.key.toLowerCase();
            const laneIndex = currentKeys.indexOf(key);
            
            if (laneIndex !== -1) {
                // Record start time using high-precision getter
                activeRecordingLanes.current[laneIndex] = editor.getExactTime();
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
             // We allow finishing a note even if recording stops mid-hold, but requires active state
             if (!isRecording && !editor.isPlaying) {
                 activeRecordingLanes.current = {}; // Clear stuck notes
                 return;
             }

             const key = e.key.toLowerCase();
             const laneIndex = currentKeys.indexOf(key);
             
             if (laneIndex !== -1) {
                 const startTime = activeRecordingLanes.current[laneIndex];
                 if (startTime !== undefined) {
                     const endTime = editor.getExactTime();
                     const rawDuration = Math.max(0, endTime - startTime);
                     
                     // Add Note via Hook (Snap logic handled inside addNote if recordSnap is true)
                     // If recordSnap is true, passing 'true' to addNote will snap Start and End.
                     // The requirement is "Long press will generate Hold, will not generate Catch".
                     
                     // CHANGE: Reduce Hold sensitivity. Treat durations < 0.5s as Tap.
                     const effectiveDuration = rawDuration < 0.5 ? 0 : rawDuration;
                     
                     editor.addNote(startTime, laneIndex, effectiveDuration, 'NORMAL', recordSnap);
                     
                     delete activeRecordingLanes.current[laneIndex];
                 }
             }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [isRecording, editor.isPlaying, keyConfig, song.laneCount, recordSnap]);


    const handleExitRequest = () => {
        if (editor.hasUnsavedChanges) {
            setShowExitConfirm(true);
        } else {
            onExit();
        }
    };

    const toggleRecording = () => {
        if (isRecording) {
            setIsRecording(false);
            if (editor.isPlaying) editor.togglePlay();
        } else {
            setIsRecording(true);
            if (!editor.isPlaying) editor.togglePlay();
        }
    };

    const TOOLS: { id: EditorTool, icon: React.ReactNode, label: string, shortcut: string }[] = [
        { id: 'SELECT', icon: <MousePointer className="w-4 h-4"/>, label: '选择', shortcut: 'S' },
        { id: 'ADD', icon: <Plus className="w-4 h-4"/>, label: '添加', shortcut: 'A' },
        { id: 'DELETE', icon: <Trash2 className="w-4 h-4"/>, label: '删除', shortcut: 'D' },
    ];

    const SNAPS: { val: SnapDivisor, label: string }[] = [
        { val: 4, label: '1/4 拍' },
        { val: 8, label: '1/8 拍' },
        { val: 16, label: '1/16 拍' },
        { val: 32, label: '1/32 拍' },
    ];

    // --- Property Panel Logic ---
    const getSingleSelectedNote = () => {
        if (editor.selectedNoteIds.size !== 1) return null;
        const id = Array.from(editor.selectedNoteIds)[0];
        return editor.notes.find(n => n.id === id);
    };

    const singleNote = getSingleSelectedNote();

    return (
        <div className="flex flex-col h-screen w-full bg-[#0a0a0a] text-white overflow-hidden">
            
            {/* Top Toolbar */}
            <div className="h-14 bg-[#111] border-b border-white/10 flex items-center justify-between px-4 shrink-0 z-50 shadow-md">
                
                {/* Left: Exit & Title */}
                <div className="flex items-center gap-4 min-w-[200px]">
                    <button 
                        onClick={handleExitRequest} 
                        className="group flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all" 
                        title="退出编辑器"
                    >
                        <LogOut className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                        <span className="text-xs font-bold">退出</span>
                    </button>
                    <div className="h-6 w-px bg-white/10"></div>
                    <div className="flex flex-col justify-center">
                        <div className="font-bold text-sm text-gray-200 max-w-[200px] truncate">{song.title}</div>
                        <div className="text-[10px] text-neon-blue font-bold tracking-wider uppercase">Chart Editor</div>
                    </div>
                </div>

                {/* Center: Tools & Playback */}
                <div className="flex items-center gap-4 bg-[#1a1a1a] px-4 py-1.5 rounded-xl border border-white/5 shadow-inner">
                    
                    {/* Tool Switcher */}
                    <div className="flex bg-black/40 rounded-lg p-1 border border-white/5">
                        {TOOLS.map(t => (
                            <button
                                key={t.id}
                                onClick={() => editor.setActiveTool(t.id)}
                                className={`relative px-3 py-1.5 rounded-md transition-all flex items-center gap-2 ${editor.activeTool === t.id ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                                title={`${t.label} (${t.shortcut})`}
                            >
                                {t.icon}
                                {editor.activeTool === t.id && <span className="text-xs font-bold">{t.label}</span>}
                            </button>
                        ))}
                    </div>
                    
                    <div className="h-5 w-px bg-white/10"></div>

                    {/* Snap Selector */}
                    <div className="flex items-center gap-2 relative group">
                        <Magnet className={`w-4 h-4 ${editor.snapDivisor >= 16 ? 'text-neon-purple' : 'text-gray-400'}`} />
                        <div className="relative">
                            <select 
                                value={editor.snapDivisor} 
                                onChange={(e) => editor.setSnapDivisor(Number(e.target.value) as SnapDivisor)}
                                className="appearance-none bg-black/40 text-xs font-bold text-white pl-3 pr-8 py-1.5 rounded-lg border border-white/10 hover:border-white/30 focus:border-neon-blue outline-none cursor-pointer transition-colors w-24"
                            >
                                {SNAPS.map(s => <option key={s.val} value={s.val}>{s.label}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500 pointer-events-none" />
                        </div>
                    </div>

                    <div className="h-5 w-px bg-white/10"></div>

                    {/* Record & Play Controls */}
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={toggleRecording}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${isRecording ? 'bg-red-500 text-white border-red-500 animate-pulse' : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'}`}
                            title="录制模式 (跟随播放按键输入)"
                        >
                            <Circle className={`w-3 h-3 ${isRecording ? 'fill-current' : ''}`} />
                            {isRecording && <span className="text-xs font-bold">REC</span>}
                        </button>

                        <button 
                            onClick={() => setRecordSnap(!recordSnap)}
                            className={`p-1.5 rounded-full border transition-all ${recordSnap ? 'bg-neon-blue/20 border-neon-blue text-neon-blue' : 'bg-gray-800 border-gray-700 text-gray-500'}`}
                            title={`录制吸附: ${recordSnap ? '开' : '关'}`}
                        >
                            <Magnet className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <button 
                        onClick={editor.togglePlay} 
                        className={`w-8 h-8 flex items-center justify-center rounded-full border transition-all hover:scale-105 active:scale-95 ${editor.isPlaying ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500' : 'bg-green-500/20 border-green-500 text-green-500'}`}
                    >
                        {editor.isPlaying ? <Pause className="w-4 h-4 fill-current"/> : <Play className="w-4 h-4 fill-current ml-0.5"/>}
                    </button>
                </div>

                {/* Right: Info & Save */}
                <div className="flex items-center gap-4 min-w-[200px] justify-end">
                     <div className="flex items-center gap-2 text-xs font-mono text-gray-400 bg-black/30 px-3 py-1.5 rounded-lg border border-white/5">
                         <Clock className="w-3 h-3"/>
                         <span className="w-12 text-right">{editor.currentTime.toFixed(3)}s</span>
                     </div>
                     <button 
                        onClick={editor.saveChanges} 
                        className={`flex items-center gap-2 px-4 py-2 text-black font-bold rounded-lg transition-all active:scale-95 text-xs uppercase tracking-wide
                            ${editor.hasUnsavedChanges ? 'bg-neon-blue hover:bg-white hover:shadow-[0_0_15px_rgba(0,243,255,0.4)]' : 'bg-gray-700 text-gray-400'}`}
                     >
                         <Save className="w-4 h-4" />
                         保存
                     </button>
                </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 relative overflow-hidden flex">
                
                {/* Left Sidebar (Properties / Copilot) */}
                <div className="w-0 md:w-96 bg-[#0f0f0f] border-r border-white/5 hidden md:flex flex-col shrink-0 relative z-20">
                    
                    {/* Sidebar Tabs */}
                    <div className="flex border-b border-white/5 bg-[#111]">
                        <button 
                            onClick={() => setActiveTab('PROPS')}
                            className={`flex-1 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === 'PROPS' ? 'text-white border-white' : 'text-gray-600 border-transparent hover:text-gray-400'}`}
                        >
                            <Settings2 className="w-3 h-3" /> 属性
                        </button>
                        <button 
                            onClick={() => setActiveTab('COPILOT')}
                            className={`flex-1 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border-b-2 transition-all ${activeTab === 'COPILOT' ? 'text-neon-purple border-neon-purple' : 'text-gray-600 border-transparent hover:text-gray-400'}`}
                        >
                            <Sparkles className="w-3 h-3" /> AI Copilot
                        </button>
                    </div>
                    
                    <div className="p-4 space-y-6 overflow-y-auto custom-scrollbar flex-1 relative">
                        
                        {/* === PROPERTIES TAB === */}
                        {activeTab === 'PROPS' && (
                            <>
                                {/* Selected Note Inspector */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">当前选中</div>
                                        {editor.selectedNoteIds.size > 0 && (
                                            <span className="text-xs bg-neon-blue/10 text-neon-blue px-2 py-0.5 rounded-full font-mono font-bold">
                                                {editor.selectedNoteIds.size}
                                            </span>
                                        )}
                                    </div>
                                    
                                    {singleNote ? (
                                        <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-3">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-[10px] text-gray-400 block mb-1">时间 (秒)</label>
                                                    <input 
                                                        type="number" step="0.01" 
                                                        value={Number(singleNote.time.toFixed(3))}
                                                        onChange={(e) => editor.updateNote(singleNote.id, { time: Number(e.target.value) })}
                                                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs font-mono text-white outline-none focus:border-neon-blue"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-gray-400 block mb-1">轨道 (0-{song.laneCount-1})</label>
                                                    <input 
                                                        type="number" min="0" max={song.laneCount-1}
                                                        value={singleNote.lane}
                                                        onChange={(e) => editor.updateNote(singleNote.id, { lane: Math.min(song.laneCount-1, Math.max(0, Number(e.target.value))) as any })}
                                                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs font-mono text-white outline-none focus:border-neon-blue"
                                                    />
                                                </div>
                                            </div>
                                            
                                            <div>
                                                <label className="text-[10px] text-gray-400 block mb-1">类型</label>
                                                <div className="flex gap-1 p-1 bg-black/40 rounded border border-white/10">
                                                    {['NORMAL', 'CATCH'].map(type => (
                                                        <button
                                                            key={type}
                                                            onClick={() => editor.updateNote(singleNote.id, { type: type as NoteType })}
                                                            className={`flex-1 py-1 text-[10px] font-bold rounded transition-colors ${singleNote.type === type ? 'bg-neon-blue text-black' : 'text-gray-400 hover:text-white'}`}
                                                        >
                                                            {type}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-[10px] text-gray-400 block mb-1">持续时长 (Hold)</label>
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="number" step="0.05" min="0"
                                                        value={Number(singleNote.duration.toFixed(3))}
                                                        onChange={(e) => editor.updateNote(singleNote.id, { duration: Math.max(0, Number(e.target.value)) })}
                                                        className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs font-mono text-white outline-none focus:border-neon-blue"
                                                    />
                                                    <button 
                                                        onClick={() => editor.updateNote(singleNote.id, { duration: 0 })}
                                                        className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] hover:bg-white/10 text-gray-400"
                                                        title="重置为单点"
                                                    >
                                                        X
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : editor.selectedNoteIds.size > 1 ? (
                                        <div className="bg-white/5 p-4 rounded-xl border border-white/5 text-center">
                                            <Layers className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                                            <div className="text-xs text-gray-300 font-bold">批量编辑</div>
                                            <p className="text-[10px] text-gray-500 mt-1">多选模式下暂不支持详细属性编辑</p>
                                        </div>
                                    ) : (
                                        <div className="h-24 border-2 border-dashed border-white/5 rounded-xl flex flex-col items-center justify-center text-gray-600 gap-2">
                                            <MousePointer className="w-5 h-5 opacity-50" />
                                            <span className="text-xs">点击音符查看属性</span>
                                        </div>
                                    )}

                                    {editor.selectedNoteIds.size > 0 && (
                                        <button 
                                            onClick={editor.deleteSelected} 
                                            className="w-full py-2 bg-red-500/10 text-red-400 text-xs font-bold rounded-lg border border-red-500/20 hover:bg-red-500 hover:text-white transition-colors flex items-center justify-center gap-2 mt-2"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                            删除选中项
                                        </button>
                                    )}
                                </div>

                                <hr className="border-white/5 my-4" />

                                {/* Recording Info */}
                                {isRecording && (
                                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl animate-pulse">
                                        <h3 className="text-red-400 font-bold text-xs uppercase mb-2 flex items-center gap-2">
                                            <Mic className="w-3 h-3" /> 录制中
                                        </h3>
                                        <p className="text-[10px] text-gray-400 leading-relaxed">
                                            按下对应轨道键 ({song.laneCount === 4 ? 'D F J K' : 'S D F J K L'}) 实时输入。<br/>
                                            <span className="text-white">长按</span>自动生成长条。<br/>
                                            当前吸附：<span className={recordSnap ? 'text-neon-blue' : 'text-gray-500'}>{recordSnap ? '开启' : '关闭'}</span>
                                        </p>
                                    </div>
                                )}

                                {/* View Settings */}
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-xs text-gray-400">
                                        <span>视图缩放</span>
                                        <span className="font-mono text-neon-blue">x{editor.zoomLevel.toFixed(1)}</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0.5" max="3.0" step="0.1" 
                                        value={editor.zoomLevel} 
                                        onChange={(e) => editor.setZoomLevel(Number(e.target.value))}
                                        className="w-full accent-neon-blue h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                                    />
                                </div>

                                {/* Song Info (Read-only) */}
                                <div className="bg-white/5 p-3 rounded-xl border border-white/5 space-y-2 mt-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-gray-400">BPM</span>
                                        <span className="text-sm font-mono font-bold text-white">{Math.round(song.structure.bpm)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs text-gray-400">轨道数</span>
                                        <span className="text-sm font-bold text-white">{song.laneCount} Key</span>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* === COPILOT TAB === */}
                        {activeTab === 'COPILOT' && (
                            <div className="space-y-6 animate-fade-in h-full flex flex-col">
                                <div className="bg-gradient-to-br from-neon-purple/20 to-transparent p-4 rounded-xl border border-neon-purple/20 relative overflow-hidden">
                                    <Bot className="w-24 h-24 text-neon-purple absolute -bottom-4 -right-4 opacity-20" />
                                    <h3 className="text-sm font-black text-white uppercase tracking-wider mb-2 relative z-10">AI 创作助手</h3>
                                    <p className="text-[10px] text-gray-300 leading-relaxed relative z-10">
                                        输入指令，即刻生成谱面。<br/>
                                        系统已强制启用<span className="text-neon-blue"> DSP 鼓点对齐</span>。
                                    </p>
                                </div>

                                <div className="space-y-4 flex-1">
                                    {/* Range Slider */}
                                    <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                                生成时长 (Beats)
                                            </label>
                                            <span className="text-xs font-mono font-black text-neon-purple">
                                                {aiTargetBeats} 拍 ({effectiveAiDuration.toFixed(1)}s)
                                            </span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="4" max="64" step="4"
                                            value={aiTargetBeats}
                                            onChange={(e) => setAiTargetBeats(Number(e.target.value))}
                                            className="w-full accent-neon-purple h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                        />
                                        
                                        {isLongDurationMode && (
                                            <div className="mt-2 text-[10px] text-yellow-400 flex items-center gap-1.5 bg-yellow-500/10 p-1.5 rounded-lg border border-yellow-500/20">
                                                <AlertTriangle className="w-3 h-3" />
                                                <span>长时段模式：建议分段生成以保证精度</span>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2 block">指令</label>
                                        <div className="relative">
                                            <textarea 
                                                value={aiPrompt}
                                                onChange={e => setAiPrompt(e.target.value)}
                                                placeholder="例：&#10;- 根据鼓点生成交互&#10;- 覆盖这段并生成人声长条&#10;- 先清空第1轨，然后加入反拍音符"
                                                className="w-full h-28 bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white placeholder:text-gray-600 focus:border-neon-purple outline-none resize-none"
                                            />
                                            <div className="absolute bottom-2 right-2">
                                                <button 
                                                    onClick={() => handleAiGenerate()}
                                                    disabled={aiIsLoading || !aiPrompt.trim()}
                                                    className="p-2 bg-neon-purple text-white rounded-lg hover:bg-white hover:text-neon-purple transition-all shadow-lg disabled:opacity-50 disabled:scale-100 active:scale-95"
                                                >
                                                    {aiIsLoading ? <Zap className="w-4 h-4 animate-pulse" /> : <Send className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2 block">快速预设</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { label: '跟随鼓点 (覆盖)', prompt: 'Overwrite with notes aligned to the heavy drum beats' },
                                                { label: '人声长条 (插入)', prompt: 'Insert hold notes following the vocal sustain' },
                                                { label: '清空此段 (删除)', prompt: 'Delete all notes in this range' },
                                                { label: '只留主旋律 (删除)', prompt: 'Delete notes on outer lanes, keep center' },
                                            ].map((p, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => { setAiPrompt(p.prompt); handleAiGenerate(p.prompt); }}
                                                    className="p-2 bg-white/5 border border-white/10 rounded-lg text-[10px] text-left text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
                                                >
                                                    {p.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                
                                {apiKeyStatus !== 'valid' && (
                                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                                        <p className="text-[10px] text-red-300 font-bold mb-1">API Key 未配置</p>
                                        <p className="text-[9px] text-red-400/80">AI 功能不可用，请前往设置配置。</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    
                    <div className="p-4 border-t border-white/5 text-[10px] text-gray-600 text-center">
                        左键创建/选择 • 右键删除 • 拖拽创建长条
                    </div>
                </div>

                {/* Canvas Area */}
                <div className={`flex-1 relative bg-[#050505] shadow-inner ${isRecording ? 'ring-2 ring-inset ring-red-500/50' : ''}`}>
                     <EditorCanvas 
                        notes={editor.notes}
                        currentTime={editor.currentTime}
                        duration={audioBuffer?.duration || 60}
                        laneCount={song.laneCount}
                        theme={song.theme || { primaryColor: '#00f3ff', secondaryColor: '#bd00ff', catchColor: '#f9f871' } as AITheme}
                        bpm={song.structure.bpm}
                        snapDivisor={editor.snapDivisor}
                        zoomLevel={editor.zoomLevel}
                        activeTool={editor.activeTool}
                        selectedNoteIds={editor.selectedNoteIds}
                        onSeek={editor.seek}
                        onAddNote={editor.addNote}
                        onNoteClick={editor.toggleSelection}
                        onNoteRightClick={editor.deleteNote}
                        getSnapTime={editor.getSnapTime}
                        activeRecordingLanes={activeRecordingLanes.current}
                        recordSnap={recordSnap}
                        // Pass visual region to canvas
                        aiRegion={activeTab === 'COPILOT' ? { start: snappedStartTime, end: aiEndTime } : undefined}
                     />
                     {isRecording && (
                         <div className="absolute top-4 right-4 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full animate-pulse shadow-lg pointer-events-none">
                             REC
                         </div>
                     )}
                </div>
            </div>

            {/* Exit Confirmation Modal */}
            {showExitConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-[#0f172a] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative">
                        <div className="flex items-center gap-3 text-red-400 font-black text-xl mb-4">
                            <AlertTriangle className="w-6 h-6" />
                            未保存的更改
                        </div>
                        <p className="text-gray-300 text-sm mb-6 leading-relaxed">
                            您的谱面修改尚未保存。确认要退出吗？<br/>
                            <span className="text-gray-500">所有未保存的进度将丢失。</span>
                        </p>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                onClick={() => setShowExitConfirm(false)}
                                className="py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold transition-colors"
                            >
                                取消
                            </button>
                            <button 
                                onClick={onExit}
                                className="py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition-colors shadow-lg"
                            >
                                确认退出
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
