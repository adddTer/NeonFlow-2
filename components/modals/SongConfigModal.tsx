
import React, { useState, useEffect } from 'react';
import { Music, X, Check, Bug, BrainCircuit, Mic2, AlertTriangle, RefreshCw, Layers } from 'lucide-react';
import { BeatmapDifficulty, LaneCount, PlayStyle } from '../../types';

interface SongConfigModalProps {
    file: File;
    onCancel: () => void;
    onConfirm: (options?: { empty?: boolean }) => void;
    laneCount: LaneCount;
    setLaneCount: (c: LaneCount) => void;
    playStyle: PlayStyle;
    setPlayStyle: (s: PlayStyle) => void;
    difficulty: number | null; // Changed from BeatmapDifficulty to number (1-20)
    setDifficulty: (d: number) => void;
    features: { normal: boolean; holds: boolean; catch: boolean };
    setFeatures: (f: any) => void;
    isDebugMode: boolean;
    skipAI: boolean;
    setSkipAI: (b: boolean) => void;
    aiOptions: any;
    setAiOptions: (o: any) => void;
    
    // Error Handling props
    errorState?: { hasError: boolean, type: string, message: string | null };
    resetError?: () => void;
}

const STYLE_PRESETS = [
    { id: 'Balanced', label: '综合均衡', desc: '节奏与旋律并重', color: 'bg-blue-500' },
    { id: 'Stream', label: '体力流', desc: '高密度连点', color: 'bg-red-500' },
    { id: 'Tech', label: '技巧流', desc: '复杂切分与交互', color: 'bg-purple-500' },
    { id: 'Flow', label: '流畅感', desc: '顺滑的键位移动', color: 'bg-green-500' },
];

export const SongConfigModal: React.FC<SongConfigModalProps> = ({
    file, onCancel, onConfirm,
    laneCount, setLaneCount,
    difficulty, setDifficulty,
    features, setFeatures,
    isDebugMode, skipAI, setSkipAI,
    aiOptions, setAiOptions,
    errorState, resetError
}) => {
    
    const [mode, setMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
    const [style, setStyle] = useState<string>('Balanced');
    
    // Init difficulty if null
    useEffect(() => {
        if (difficulty === null) setDifficulty(10);
    }, []);

    // Update AI options when style changes
    useEffect(() => {
        setAiOptions({ ...aiOptions, stylePreference: style, difficultyLevel: difficulty || 10 });
    }, [style, difficulty]);

    const handleConfirm = () => {
        if (mode === 'AUTO') {
            onConfirm(); 
        } else {
            setSkipAI(true);
            onConfirm({ empty: true });
        }
    };

    const toggleMode = (m: 'AUTO' | 'MANUAL') => {
        setMode(m);
        if (m === 'MANUAL') setSkipAI(true);
        else setSkipAI(false);
    };

    // --- Error View ---
    if (errorState?.hasError) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in font-sans">
                <div className="bg-[#0f172a] border border-red-500/30 rounded-3xl p-8 w-full max-w-md shadow-2xl relative flex flex-col items-center text-center">
                    <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 animate-pulse">
                        <AlertTriangle className="w-10 h-10 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-black text-white mb-2">生成中断</h2>
                    <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                        {errorState.message || "未知错误发生。"}
                    </p>
                    
                    <div className="w-full space-y-3">
                        <button 
                            onClick={() => { resetError && resetError(); handleConfirm(); }}
                            className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors"
                        >
                            重试
                        </button>
                        {isDebugMode && (
                            <button 
                                onClick={() => { resetError && resetError(); setSkipAI(true); handleConfirm(); }}
                                className="w-full py-3 bg-white/5 text-white font-bold rounded-xl hover:bg-white/10 transition-colors border border-white/10"
                            >
                                尝试纯算法模式 (DSP Only)
                            </button>
                        )}
                        <button 
                            onClick={onCancel}
                            className="w-full py-3 text-gray-500 font-bold hover:text-white transition-colors text-sm"
                        >
                            取消
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
        if (val <= 5) return "入门";
        if (val <= 10) return "进阶";
        if (val <= 15) return "专家";
        return "大师";
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in font-sans">
             <div className="bg-[#0f172a] border border-white/20 rounded-3xl w-full max-w-5xl shadow-2xl relative flex flex-col max-h-[95vh] overflow-hidden">
                 
                 {/* Header */}
                 <div className="p-6 border-b border-white/10 flex justify-between items-center bg-[#0a0a0a]">
                     <div className="flex items-center gap-4">
                         <div className="p-3 bg-neon-blue/10 rounded-xl">
                             <Music className="w-6 h-6 text-neon-blue" />
                         </div>
                         <div>
                             <h1 className="text-xl font-black text-white tracking-tight uppercase">配置工程</h1>
                             <div className="text-xs text-gray-500 font-mono mt-0.5 max-w-[200px] truncate">{file.name}</div>
                         </div>
                     </div>
                     <button onClick={onCancel} className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full">
                         <X className="w-6 h-6" />
                     </button>
                 </div>

                 <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                     
                     {/* Left: Mode Selection */}
                     <div className="w-full md:w-1/3 p-6 bg-[#111] border-r border-white/5 flex flex-col gap-4 overflow-y-auto">
                         <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">生成模式</h3>
                         
                         <button 
                            onClick={() => toggleMode('AUTO')}
                            className={`p-5 rounded-2xl border-2 transition-all text-left group relative overflow-hidden ${mode === 'AUTO' ? 'border-neon-blue bg-neon-blue/5' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}
                         >
                             <div className="flex justify-between items-start mb-2">
                                 <BrainCircuit className={`w-6 h-6 ${mode === 'AUTO' ? 'text-neon-blue' : 'text-gray-500'}`} />
                                 {mode === 'AUTO' && <div className="w-2 h-2 bg-neon-blue rounded-full shadow-[0_0_10px_#00f3ff]"></div>}
                             </div>
                             <div className={`font-black text-lg ${mode === 'AUTO' ? 'text-white' : 'text-gray-400'}`}>AI 智能生成</div>
                             <div className="text-xs text-gray-500 mt-1 leading-relaxed">
                                 Gemini 分析音乐情感与结构，生成完整的谱面。
                             </div>
                         </button>

                         <button 
                            onClick={() => toggleMode('MANUAL')}
                            className={`p-5 rounded-2xl border-2 transition-all text-left group relative overflow-hidden ${mode === 'MANUAL' ? 'border-white bg-white/5' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}
                         >
                             <div className="flex justify-between items-start mb-2">
                                 <Mic2 className={`w-6 h-6 ${mode === 'MANUAL' ? 'text-white' : 'text-gray-500'}`} />
                                 {mode === 'MANUAL' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                             </div>
                             <div className={`font-black text-lg ${mode === 'MANUAL' ? 'text-white' : 'text-gray-400'}`}>空白工程</div>
                             <div className="text-xs text-gray-500 mt-1 leading-relaxed">
                                 创建空白谱面，使用编辑器自行创作或录制。
                             </div>
                         </button>

                         {/* Common Options */}
                         <div className="mt-auto space-y-4 pt-6 border-t border-white/5">
                             <div className="space-y-2">
                                 <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">轨道数量</label>
                                 <div className="flex gap-2">
                                     {[4, 6].map(k => (
                                         <button
                                             key={k}
                                             onClick={() => setLaneCount(k as LaneCount)}
                                             className={`flex-1 py-3 rounded-xl font-black text-sm transition-all border ${laneCount === k ? 'bg-white text-black border-white' : 'bg-black text-gray-500 border-white/10 hover:border-white/30'}`}
                                         >
                                             {k}K
                                         </button>
                                     ))}
                                 </div>
                             </div>
                         </div>
                     </div>

                     {/* Right: Detailed Config */}
                     <div className="flex-1 p-6 md:p-8 bg-[#0f172a] overflow-y-auto custom-scrollbar relative">
                         {mode === 'AUTO' ? (
                             <div className="space-y-10 animate-fade-in pb-20">
                                 
                                 {/* Difficulty Slider */}
                                 <div className="space-y-4">
                                     <div className="flex justify-between items-end">
                                         <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                             <Layers className="w-4 h-4 text-gray-400"/> 难度等级
                                         </h3>
                                         <div className={`text-3xl font-black tracking-tighter font-sans ${diffColor(difficulty || 10)}`}>
                                             {getDiffLabel(difficulty || 10)}
                                         </div>
                                     </div>
                                     
                                     <div className="relative h-12 flex items-center group">
                                         <div className="absolute inset-0 bg-white/5 rounded-xl border border-white/5 group-hover:border-white/10 transition-colors"></div>
                                         <div 
                                            className="absolute left-2 right-2 h-2 rounded-full overflow-hidden bg-gray-800"
                                         >
                                             <div 
                                                className={`h-full transition-all duration-300 ${difficulty! <= 10 ? 'bg-gradient-to-r from-green-400 to-blue-500' : 'bg-gradient-to-r from-blue-500 via-orange-500 to-red-600'}`}
                                                style={{ width: `${(difficulty! / 20) * 100}%` }}
                                             ></div>
                                         </div>
                                         <input 
                                             type="range" min="1" max="20" step="1"
                                             value={difficulty || 10}
                                             onChange={(e) => setDifficulty(Number(e.target.value))}
                                             className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
                                         />
                                     </div>
                                     <div className="flex justify-between text-[10px] text-gray-500 font-bold uppercase tracking-widest px-1">
                                         <span>入门</span>
                                         <span>进阶</span>
                                         <span>专家</span>
                                         <span>大师</span>
                                     </div>
                                 </div>

                                 {/* Style Presets */}
                                 <div className="space-y-4">
                                     <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                         <BrainCircuit className="w-4 h-4 text-gray-400"/> 风格倾向
                                     </h3>
                                     <div className="grid grid-cols-2 gap-3">
                                         {STYLE_PRESETS.map(p => (
                                             <button
                                                 key={p.id}
                                                 onClick={() => setStyle(p.id)}
                                                 className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden ${style === p.id ? 'border-white/40 bg-white/5' : 'border-white/5 bg-black/20 hover:bg-white/5'}`}
                                             >
                                                 {style === p.id && <div className={`absolute left-0 top-0 bottom-0 w-1 ${p.color}`}></div>}
                                                 <div className={`font-bold text-sm ${style === p.id ? 'text-white' : 'text-gray-400'}`}>{p.label}</div>
                                                 <div className="text-[10px] text-gray-600">{p.desc}</div>
                                             </button>
                                         ))}
                                     </div>
                                 </div>

                                 {/* Features */}
                                 <div className="space-y-4">
                                     <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                         <RefreshCw className="w-4 h-4 text-gray-400"/> 生成元素
                                     </h3>
                                     <div className="flex flex-wrap gap-2">
                                         {[{k:'normal', l:'单点'}, {k:'holds', l:'长条'}, {k:'catch', l:'滑键'}].map(feat => (
                                             <button
                                                 key={feat.k}
                                                 onClick={() => setFeatures({...features, [feat.k]: !features[feat.k as keyof typeof features]})}
                                                 className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all flex items-center gap-2 ${features[feat.k as keyof typeof features] ? 'bg-white text-black border-white' : 'bg-black text-gray-500 border-white/10'}`}
                                             >
                                                 {features[feat.k as keyof typeof features] && <Check className="w-3 h-3"/>}
                                                 {feat.l}
                                             </button>
                                         ))}
                                     </div>
                                 </div>

                                 {/* Debug / Skip AI */}
                                 {isDebugMode && (
                                     <div className={`p-4 rounded-xl border transition-colors cursor-pointer mt-8 ${skipAI ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-white/5 border-white/10'}`} onClick={() => setSkipAI(!skipAI)}>
                                         <div className="flex items-center gap-3">
                                             <Bug className={`w-4 h-4 ${skipAI ? 'text-yellow-500' : 'text-gray-500'}`} />
                                             <span className={`text-xs font-bold ${skipAI ? 'text-yellow-500' : 'text-gray-400'}`}>跳过 AI (使用纯 DSP 算法)</span>
                                         </div>
                                     </div>
                                 )}

                             </div>
                         ) : (
                             <div className="h-full flex flex-col justify-center items-center text-center opacity-50">
                                 <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
                                     <Mic2 className="w-8 h-8 text-white" />
                                 </div>
                                 <p className="text-sm text-gray-400">手动模式下无需额外配置。</p>
                             </div>
                         )}

                         {/* Confirm Button (Floating) */}
                         <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0f172a] to-transparent">
                             <button 
                                onClick={handleConfirm}
                                className={`w-full py-4 rounded-xl font-black text-lg uppercase tracking-widest hover:scale-[1.02] transition-all shadow-xl active:scale-95 flex items-center justify-center gap-3
                                    ${mode === 'AUTO' ? 'bg-neon-blue text-black hover:bg-white' : 'bg-white text-black'}
                                `}
                             >
                                 {mode === 'AUTO' ? '开始生成' : '创建工程'}
                             </button>
                         </div>
                     </div>
                 </div>
             </div>
        </div>
    );
};
