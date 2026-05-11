
import React, { useState, useEffect } from 'react';
import { Music, X, Check, BrainCircuit, Mic2, AlertTriangle, Layers, Zap, SlidersHorizontal, ChevronRight, Type } from 'lucide-react';
import * as mm from 'music-metadata';
import { BeatmapDifficulty, LaneCount, PlayStyle, PlayMode } from '../../types';

interface SongConfigModalProps {
    file: File;
    onCancel: () => void;
    onConfirm: (options?: { empty?: boolean, metadata?: { title: string, artist: string } }) => void;
    playMode: PlayMode;
    setPlayMode: (m: PlayMode) => void;
    laneCount: LaneCount;
    setLaneCount: (c: LaneCount) => void;
    playStyle: PlayStyle;
    setPlayStyle: (s: PlayStyle) => void;
    difficulty: number | null; 
    setDifficulty: (d: number) => void;
    features: { normal: boolean; holds: boolean; catch: boolean };
    setFeatures: (f: any) => void;
    isDebugMode: boolean;
    skipAI: boolean;
    setSkipAI: (b: boolean) => void;
    aiOptions: any;
    setAiOptions: (o: any) => void;
    
    // Pro Model props
    useProModel?: boolean;
    setUseProModel?: (b: boolean) => void;

    // Error Handling props
    errorState?: { hasError: boolean, type: string, message: string | null };
    resetError?: () => void;
}

export const SongConfigModal: React.FC<SongConfigModalProps> = ({
    file, onCancel, onConfirm,
    playMode, setPlayMode,
    laneCount, setLaneCount,
    difficulty, setDifficulty,
    features, setFeatures,
    isDebugMode, skipAI, setSkipAI,
    aiOptions, setAiOptions,
    errorState, resetError,
    useProModel, setUseProModel
}) => {
    
    const [mode, setMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
    
    // Metadata states
    const [title, setTitle] = useState(file.name.replace(/\.[^/.]+$/, ""));
    const [artist, setArtist] = useState("Unknown Artist");
    
    // Read Metadata from file
    useEffect(() => {
        const parseMetadata = async () => {
            try {
                const metadata = await mm.parseBlob(file);
                if (metadata.common.title) {
                    setTitle(metadata.common.title);
                }
                const foundArtist = metadata.common.artist || metadata.common.albumartist || metadata.common.encodersettings;
                if (foundArtist && !foundArtist.includes("Lavf")) { // Sometimes lavf is put in artist
                    setArtist(foundArtist);
                } else if (metadata.common.artist) {
                    setArtist(metadata.common.artist); 
                }
            } catch (err) {
                console.warn('Failed to parse metadata', err);
            }
        };
        parseMetadata();
    }, [file]);

    // Init difficulty if null
    useEffect(() => {
        if (difficulty === null) setDifficulty(10);
    }, []);

    // Update AI options when difficulty changes
    useEffect(() => {
        setAiOptions({ ...aiOptions, difficultyLevel: difficulty || 10 });
    }, [difficulty]);

    const handleConfirm = () => {
        if (mode === 'AUTO') {
            onConfirm({ metadata: { title, artist } }); 
        } else {
            setSkipAI(true);
            onConfirm({ empty: true, metadata: { title, artist } });
        }
    };

    const toggleMode = (m: 'AUTO' | 'MANUAL') => {
        setMode(m);
        if (m === 'MANUAL') setSkipAI(true);
        else setSkipAI(false);
    };

    // --- Error View ---
    if (errorState?.hasError) {
        const isRetryError = errorState.type === 'AI_RETRY_EXHAUSTED';
        
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-8 animate-fade-in font-sans">
                <div className="absolute inset-0 bg-black/90 backdrop-blur-3xl" onClick={() => {}}></div>
                <div className="bg-[#0a0a0c] border border-red-500/30 rounded-3xl p-8 w-full max-w-lg shadow-[0_0_80px_rgba(239,68,68,0.3)] relative flex flex-col items-center text-center z-10">
                    <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center mb-6 animate-pulse border border-red-500/20">
                        <AlertTriangle className="w-12 h-12 text-red-500 drop-shadow-[0_0_10px_#ef4444]" />
                    </div>
                    <h2 className="text-3xl font-black text-red-400 mb-2 tracking-widest uppercase">发生错误</h2>
                    <p className="text-gray-400 text-sm mb-8 leading-relaxed whitespace-pre-line tracking-wide">
                        {errorState.message || "未知错误。请检查系统日志。"}
                    </p>
                    
                    <div className="w-full space-y-4">
                        {isRetryError && setUseProModel && (
                            <button 
                                onClick={() => { 
                                    resetError && resetError(); 
                                    setUseProModel(true); 
                                    handleConfirm(); 
                                }}
                                className="w-full py-4 bg-gradient-to-r from-neon-purple to-indigo-600 text-white font-black rounded-2xl hover:shadow-[0_0_30px_rgba(139,92,246,0.6)] transition-all flex items-center justify-center gap-3 group border border-white/20 uppercase tracking-widest text-sm"
                            >
                                <Zap className="w-5 h-5 fill-current group-hover:scale-125 transition-transform text-yellow-300"/>
                                切换大模型兜底并重试
                            </button>
                        )}

                        <button 
                            onClick={() => { resetError && resetError(); handleConfirm(); }}
                            className="w-full py-4 bg-white/10 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-white hover:text-black transition-all border border-white/20 text-sm"
                        >
                            {isRetryError ? "直接重试" : "重试操作"}
                        </button>
                        
                        <button 
                            onClick={onCancel}
                            className="w-full py-3 text-gray-500 font-bold hover:text-red-400 transition-colors text-xs tracking-widest uppercase mt-4"
                        >
                            取消操作
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // --- Main Config View ---
    const diffColor = (val: number) => {
        if (val <= 5) return 'text-green-400';
        if (val <= 10) return 'text-blue-400';
        if (val <= 15) return 'text-orange-400';
        return 'text-red-500';
    };

    const getDiffLabel = (val: number) => {
        if (val <= 5) return "NOVICE";
        if (val <= 10) return "ADVANCED";
        if (val <= 15) return "EXPERT";
        return "MASTER";
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-8 animate-fade-in font-sans">
             <div className="absolute inset-0 bg-black/80 backdrop-blur-3xl" onClick={onCancel}></div>
             
             <div className="bg-[#0a0a0c] border border-white/10 rounded-3xl w-full max-w-5xl shadow-[0_0_100px_rgba(0,0,0,1)] relative flex flex-col max-h-[95vh] overflow-hidden z-10">
                 
                 {/* Decorative background glow */}
                 <div className="absolute top-0 right-0 w-96 h-96 bg-neon-blue/10 blur-[120px] rounded-full pointer-events-none"></div>

                 {/* Header */}
                 <div className="p-6 md:p-8 border-b border-white/5 flex justify-between items-start relative z-10">
                     <div className="flex items-center gap-5">
                         <div className="p-4 bg-white/5 border border-white/10 rounded-2xl shadow-inner relative overflow-hidden group">
                             <div className="absolute inset-0 bg-neon-blue/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                             <Music className="w-8 h-8 text-white relative z-10" />
                         </div>
                         <div>
                             <h1 className="text-2xl font-black text-white tracking-widest uppercase mb-1">项目配置</h1>
                             <div className="flex items-center gap-2 text-xs font-mono text-gray-500 bg-white/5 px-2 py-1 rounded border border-white/5 max-w-[250px] md:max-w-md">
                                 <span className="w-1.5 h-1.5 rounded-full bg-neon-blue animate-pulse"></span>
                                 <span className="truncate">{file.name}</span>
                             </div>
                         </div>
                     </div>
                     <button onClick={onCancel} className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all text-gray-400 hover:text-white group">
                         <X className="w-6 h-6 group-hover:rotate-90 transition-transform" />
                     </button>
                 </div>

                 <div className="flex flex-col md:flex-row flex-1 overflow-y-auto md:overflow-hidden relative z-10 custom-scrollbar">
                     
                     {/* Left: Mode Selection */}
                     <div className="w-full md:w-[280px] lg:w-[320px] p-6 md:p-8 bg-black/40 border-b md:border-b-0 md:border-r border-white/5 flex flex-col gap-4 shrink-0 md:overflow-y-auto custom-scrollbar">
                         <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                             <span>模式选择</span>
                             <div className="h-[1px] flex-1 bg-white/10"></div>
                         </div>
                         
                         <button 
                            onClick={() => toggleMode('AUTO')}
                            className={`p-5 rounded-2xl border transition-all text-left group relative overflow-hidden ${mode === 'AUTO' ? 'border-neon-blue/50 bg-neon-blue/10 shadow-lg bg-gradient-to-br from-neon-blue/5 to-transparent' : 'border-white/5 bg-white/5 hover:border-white/20'}`}
                         >
                             <div className="flex justify-between items-start mb-3">
                                 <BrainCircuit className={`w-7 h-7 ${mode === 'AUTO' ? 'text-neon-blue drop-shadow-md' : 'text-gray-500'}`} />
                             </div>
                             <div className={`font-black text-xl tracking-wider uppercase ${mode === 'AUTO' ? 'text-white' : 'text-gray-400'}`}>智能布林</div>
                             <div className="text-[11px] text-gray-500 mt-2 font-bold tracking-wide uppercase leading-relaxed">
                                 基于 AI 的数据驱动谱面生成。
                             </div>
                         </button>

                         <button 
                            onClick={() => toggleMode('MANUAL')}
                            className={`p-5 rounded-2xl border transition-all text-left group relative overflow-hidden ${mode === 'MANUAL' ? 'border-white/50 bg-white/10 shadow-lg bg-gradient-to-br from-white/5 to-transparent' : 'border-white/5 bg-white/5 hover:border-white/20'}`}
                         >
                             <div className="flex justify-between items-start mb-3">
                                 <Mic2 className={`w-7 h-7 ${mode === 'MANUAL' ? 'text-white drop-shadow-md' : 'text-gray-500'}`} />
                             </div>
                             <div className={`font-black text-xl tracking-wider uppercase ${mode === 'MANUAL' ? 'text-white' : 'text-gray-400'}`}>空白画板</div>
                             <div className="text-[11px] text-gray-500 mt-2 font-bold tracking-wide uppercase leading-relaxed">
                                 手动创建与录制谱面。
                             </div>
                         </button>

                         <div className="mt-4 md:mt-8">
                             <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                 <span>游戏模式</span>
                                 <div className="h-[1px] flex-1 bg-white/10"></div>
                             </div>
                             <div className="flex gap-3">
                                 <button
                                     onClick={() => setPlayMode('FALLING')}
                                     className={`flex-1 py-4 rounded-xl font-black text-lg transition-all border ${playMode === 'FALLING' ? 'bg-cyan-500 text-white border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.3)]' : 'bg-black text-gray-500 border-white/10 hover:border-white/30 hover:text-white'}`}
                                 >
                                     下落式
                                 </button>
                                 <button
                                     onClick={() => setPlayMode('ORBIT')}
                                     className={`flex-1 py-4 rounded-xl font-black text-lg transition-all border ${playMode === 'ORBIT' ? 'bg-blue-500 text-white border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'bg-black text-gray-500 border-white/10 hover:border-white/30 hover:text-white'}`}
                                 >
                                     旋转点击
                                 </button>
                             </div>
                         </div>

                         {playMode === 'FALLING' && (
                             <div className="mt-4 md:mt-8">
                                 <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                     <span>按键数量</span>
                                     <div className="h-[1px] flex-1 bg-white/10"></div>
                                 </div>
                                 <div className="flex gap-3">
                                     {[4, 6].map(k => (
                                         <button
                                             key={k}
                                             onClick={() => setLaneCount(k as LaneCount)}
                                             className={`flex-1 py-4 rounded-xl font-black text-lg transition-all border ${laneCount === k ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'bg-black text-gray-500 border-white/10 hover:border-white/30 hover:text-white'}`}
                                         >
                                             {k}K
                                         </button>
                                     ))}
                                 </div>
                             </div>
                         )}
                     </div>

                     {/* Right: Detailed Config */}
                     <div className="flex-1 flex flex-col relative w-full pt-6 md:pt-8 px-6 md:px-12 bg-transparent text-left shrink-0 md:overflow-y-auto custom-scrollbar pb-32">
                         
                         {/* Metadata Edit */}
                         <div className="space-y-4 mb-8 md:mb-12 md:pr-4">
                             <div className="flex justify-between items-end border-b border-white/5 pb-2 mb-4">
                                 <div className="flex items-center gap-3">
                                     <div className="p-2 bg-white/5 rounded-lg"><Type className="w-4 h-4 text-white"/></div>
                                     <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">曲目信息</h3>
                                 </div>
                             </div>
                             
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                 <div className="space-y-2">
                                     <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2">歌曲名称</label>
                                     <input 
                                         type="text" 
                                         value={title} 
                                         onChange={e => setTitle(e.target.value)}
                                         className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white font-black text-sm focus:outline-none focus:border-white/30 truncate" 
                                     />
                                 </div>
                                 <div className="space-y-2">
                                     <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2">艺术家</label>
                                     <input 
                                         type="text" 
                                         value={artist} 
                                         onChange={e => setArtist(e.target.value)}
                                         className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white font-black text-sm focus:outline-none focus:border-white/30 truncate" 
                                     />
                                 </div>
                             </div>
                         </div>

                         {mode === 'AUTO' ? (
                             <div className="space-y-8 md:space-y-12 animate-slide-up flex-1 md:pr-4">
                                 
                                 {/* Difficulty Slider */}
                                 <div className="space-y-6">
                                     <div className="flex justify-between items-end border-b border-white/5 pb-2">
                                         <div className="flex items-center gap-3">
                                             <div className="p-2 bg-white/5 rounded-lg"><Layers className="w-4 h-4 text-white"/></div>
                                             <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">目标难度</h3>
                                         </div>
                                         <div className={`text-4xl font-black italic tracking-tighter ${diffColor(difficulty || 10)} drop-shadow-md`}>
                                             {getDiffLabel(difficulty || 10)}
                                         </div>
                                     </div>
                                     
                                     <div className="relative pt-4 pb-2">
                                         <div className="absolute inset-0 bg-black/40 rounded-2xl border border-white/5 pointer-events-none"></div>
                                         <div className="relative h-4 mx-4 rounded-full bg-black border border-white/10 flex items-center">
                                             <div 
                                                className={`absolute left-0 h-full rounded-full transition-all duration-300 ${difficulty! <= 10 ? 'bg-gradient-to-r from-neon-blue to-green-400' : 'bg-gradient-to-r from-yellow-400 to-red-500'} shadow-[0_0_15px_currentColor] opacity-80`}
                                                style={{ width: `${(difficulty! / 20) * 100}%` }}
                                             ></div>
                                             <div 
                                                className="absolute w-6 h-6 bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.8)] -ml-3 pointer-events-none flex items-center justify-center transition-all duration-300"
                                                style={{ left: `${(difficulty! / 20) * 100}%` }}
                                             >
                                                <div className="w-2 h-2 rounded-full bg-black"></div>
                                             </div>
                                         </div>
                                         <input 
                                             type="range" min="1" max="20" step="1"
                                             value={difficulty || 10}
                                             onChange={(e) => setDifficulty(Number(e.target.value))}
                                             className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                                         />
                                     </div>
                                     <div className="flex justify-between text-[9px] text-gray-500 font-black uppercase tracking-widest px-4">
                                         <span>入门</span>
                                         <span>进阶</span>
                                         <span>专家</span>
                                         <span>大师</span>
                                     </div>
                                 </div>

                                 {/* Features */}
                                 {playMode === 'FALLING' && (
                                     <div className="space-y-6 pb-8">
                                         <div className="flex items-center gap-3 border-b border-white/5 pb-2">
                                             <div className="p-2 bg-white/5 rounded-lg"><Zap className="w-4 h-4 text-white"/></div>
                                             <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">音符元素</h3>
                                         </div>
                                         <div className="flex flex-wrap gap-3">
                                             {[{k:'normal', l:'单键', required: true}, {k:'holds', l:'长按'}, {k:'catch', l:'滑键'}].map(feat => (
                                                 <button
                                                     key={feat.k}
                                                     disabled={feat.required}
                                                     onClick={() => setFeatures({...features, [feat.k]: !features[feat.k as keyof typeof features]})}
                                                     className={`px-5 py-3 rounded-xl text-xs font-black tracking-widest uppercase border transition-all flex items-center gap-3 ${features[feat.k as keyof typeof features] || feat.required ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.4)]' : 'bg-black/50 text-gray-500 border-white/10 hover:border-white/30 hover:text-white'} ${feat.required ? 'opacity-80 cursor-not-allowed' : ''}`}
                                                 >
                                                     <div className={`w-3 h-3 rounded flex items-center justify-center border ${features[feat.k as keyof typeof features] || feat.required ? 'bg-black border-black' : 'border-gray-600'}`}>
                                                         {(features[feat.k as keyof typeof features] || feat.required) && <Check className="w-2 h-2 text-white"/>}
                                                     </div>
                                                     {feat.l}
                                                 </button>
                                             ))}
                                         </div>
                                     </div>
                                 )}
                             </div>
                         ) : (
                             <div className="flex-1 flex flex-col justify-center items-center text-center opacity-40 mb-20">
                                 <div className="w-32 h-32 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center mb-6 relative group">
                                     <div className="absolute inset-4 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors"></div>
                                     <Mic2 className="w-12 h-12 text-white relative z-10" />
                                 </div>
                                 <h3 className="text-2xl font-black text-white tracking-widest uppercase mb-2">空白画板</h3>
                                 <p className="text-xs font-bold text-gray-500 tracking-wider uppercase max-w-sm">
                                     引擎将初始化一个不带AI生成的曲目。使用编辑器手动作曲。
                                 </p>
                             </div>
                         )}
                     </div>
                 </div>
                 
                 {/* Fixed Confirm Action */}
                 <div className="absolute bottom-0 left-0 right-0 pointer-events-none z-20 flex">
                     <div className="hidden md:block w-[280px] lg:w-[320px] shrink-0"></div>
                     <div className="flex-1 p-6 md:p-8 bg-gradient-to-t from-[#0a0a0c] via-[#0a0a0c]/90 via-60% to-transparent pointer-events-auto">
                         <button 
                            onClick={handleConfirm}
                            className={`w-full py-5 rounded-2xl font-black text-lg uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-4 relative overflow-hidden group border
                                ${mode === 'AUTO' ? 'bg-white text-black border-white hover:shadow-[0_0_40px_rgba(255,255,255,0.3)]' : 'bg-[#111] text-white border-white/20 hover:border-white/50 hover:bg-[#1a1a1a]'}
                            `}
                         >
                             <div className="absolute inset-0 w-1/4 bg-gradient-to-r from-transparent via-white to-transparent opacity-0 group-hover:opacity-20 -skew-x-12 -translate-x-full group-hover:translate-x-[400%] transition-all duration-1000 ease-in-out"></div>
                             
                             <span className="relative z-10">{mode === 'AUTO' ? '生成 AI 谱面' : '创建空白项目'}</span>
                             <ChevronRight className="w-6 h-6 relative z-10 group-hover:translate-x-1 transition-transform" />
                         </button>
                     </div>
                 </div>

              </div>
         </div>
     );
 };
