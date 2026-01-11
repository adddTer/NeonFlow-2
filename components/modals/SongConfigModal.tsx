
import React, { useState } from 'react';
import { Music, X, Check, Bug, CheckCircle, FilePlus, BrainCircuit, Mic2 } from 'lucide-react';
import { BeatmapDifficulty, LaneCount, PlayStyle } from '../../types';

interface SongConfigModalProps {
    file: File;
    onCancel: () => void;
    onConfirm: (options?: { empty?: boolean }) => void;
    laneCount: LaneCount;
    setLaneCount: (c: LaneCount) => void;
    playStyle: PlayStyle;
    setPlayStyle: (s: PlayStyle) => void;
    difficulty: BeatmapDifficulty | null;
    setDifficulty: (d: BeatmapDifficulty) => void;
    features: { normal: boolean; holds: boolean; catch: boolean };
    setFeatures: (f: any) => void;
    isDebugMode: boolean;
    skipAI: boolean;
    setSkipAI: (b: boolean) => void;
}

export const SongConfigModal: React.FC<SongConfigModalProps> = ({
    file, onCancel, onConfirm,
    laneCount, setLaneCount,
    playStyle, setPlayStyle,
    difficulty, setDifficulty,
    features, setFeatures,
    isDebugMode, skipAI, setSkipAI
}) => {
    
    const [mode, setMode] = useState<'AUTO' | 'MANUAL'>('AUTO');

    const handleDifficultySelect = (diff: BeatmapDifficulty) => {
        setDifficulty(diff);
        if (diff === BeatmapDifficulty.Titan) {
            setLaneCount(6);
            setPlayStyle('MULTI');
        }
    };

    const isAnyFeatureSelected = features.normal || features.holds || features.catch;

    const handleConfirm = () => {
        if (mode === 'AUTO') {
            onConfirm(); // Normal AI Gen flow
        } else {
            // Manual flow: Enforce AI analysis (skipAI = false)
            setSkipAI(false);
            onConfirm({ empty: true });
        }
    };

    // When switching to manual, we default skipAI to false (enable analysis)
    const toggleMode = (m: 'AUTO' | 'MANUAL') => {
        setMode(m);
        setSkipAI(false); 
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
             <div className="bg-[#0f172a] border border-white/20 rounded-3xl p-8 w-full max-w-4xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-y-auto custom-scrollbar">
                 <button onClick={onCancel} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10 p-2 bg-black/20 rounded-full">
                     <X className="w-6 h-6" />
                 </button>

                 <h1 className="text-2xl font-black tracking-tight mb-6 flex items-center gap-3">
                     <Music className="w-6 h-6 text-neon-blue" />
                     配置新乐谱
                 </h1>

                 {/* Top: File Info */}
                 <div className="mb-8 p-4 rounded-2xl bg-white/5 border border-white/10 flex justify-between items-center">
                     <div>
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">选定文件</div>
                        <div className="text-lg font-bold text-white break-all line-clamp-1">{file.name}</div>
                     </div>
                     <div className="text-xs font-mono text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                 </div>

                 {/* Mode Switcher */}
                 <div className="grid grid-cols-2 gap-4 mb-8">
                     <button 
                        onClick={() => toggleMode('AUTO')}
                        className={`p-6 rounded-2xl border-2 transition-all flex flex-col gap-3 text-left relative overflow-hidden group ${mode === 'AUTO' ? 'border-neon-blue bg-neon-blue/10' : 'border-white/10 bg-black/20 hover:bg-white/5'}`}
                     >
                         <div className={`p-3 rounded-xl w-fit ${mode === 'AUTO' ? 'bg-neon-blue text-black' : 'bg-white/10 text-gray-400'}`}>
                             <BrainCircuit className="w-6 h-6" />
                         </div>
                         <div>
                             <div className={`text-lg font-black uppercase tracking-wider ${mode === 'AUTO' ? 'text-white' : 'text-gray-400'}`}>AI 自动生成</div>
                             <div className="text-xs text-gray-500 font-bold mt-1">智能分析节奏，一键生成完整谱面</div>
                         </div>
                     </button>

                     <button 
                        onClick={() => toggleMode('MANUAL')}
                        className={`p-6 rounded-2xl border-2 transition-all flex flex-col gap-3 text-left relative overflow-hidden group ${mode === 'MANUAL' ? 'border-white bg-white/10' : 'border-white/10 bg-black/20 hover:bg-white/5'}`}
                     >
                         <div className={`p-3 rounded-xl w-fit ${mode === 'MANUAL' ? 'bg-white text-black' : 'bg-white/10 text-gray-400'}`}>
                             <Mic2 className="w-6 h-6" />
                         </div>
                         <div>
                             <div className={`text-lg font-black uppercase tracking-wider ${mode === 'MANUAL' ? 'text-white' : 'text-gray-400'}`}>手动创作</div>
                             <div className="text-xs text-gray-500 font-bold mt-1">创建空白谱面，支持实时录制输入</div>
                         </div>
                     </button>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     {/* Options Column */}
                     <div className="space-y-6">

                         <div className="space-y-4">
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">按键模式</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => setLaneCount(4)} 
                                        disabled={difficulty === BeatmapDifficulty.Titan && mode === 'AUTO'}
                                        className={`p-3 rounded-xl text-left font-bold transition-all border 
                                            ${laneCount === 4 
                                                ? 'bg-neon-blue border-neon-blue text-black' 
                                                : (difficulty === BeatmapDifficulty.Titan && mode === 'AUTO')
                                                    ? 'bg-transparent border-white/5 text-gray-600 cursor-not-allowed opacity-50'
                                                    : 'bg-transparent border-white/10 text-gray-400 hover:bg-white/5'}`}
                                    >
                                        4道
                                    </button>
                                    <button onClick={() => setLaneCount(6)} className={`p-3 rounded-xl text-left font-bold transition-all border ${laneCount === 6 ? 'bg-neon-blue border-neon-blue text-black' : 'bg-transparent border-white/10 text-gray-400 hover:bg-white/5'}`}>
                                        6道
                                    </button>
                                </div>
                            </div>
                            
                            {mode === 'AUTO' && (
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">生成元素</h3>
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-3 cursor-pointer group hover:bg-white/5 p-2 rounded-lg transition-colors -ml-2">
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${features.normal ? 'bg-neon-blue border-neon-blue' : 'border-gray-500'}`}>
                                                {features.normal && <Check className="w-3.5 h-3.5 text-black" />}
                                            </div>
                                            <input type="checkbox" className="hidden" checked={features.normal} onChange={e => setFeatures({...features, normal: e.target.checked})} />
                                            <span className="text-gray-200 font-bold text-sm">单点音符</span>
                                        </label>
                                        <label className="flex items-center gap-3 cursor-pointer group hover:bg-white/5 p-2 rounded-lg transition-colors -ml-2">
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${features.holds ? 'bg-neon-blue border-neon-blue' : 'border-gray-500'}`}>
                                                {features.holds && <Check className="w-3.5 h-3.5 text-black" />}
                                            </div>
                                            <input type="checkbox" className="hidden" checked={features.holds} onChange={e => setFeatures({...features, holds: e.target.checked})} />
                                            <span className="text-gray-200 font-bold text-sm">长条音符</span>
                                        </label>
                                        <label className="flex items-center gap-3 cursor-pointer group hover:bg-white/5 p-2 rounded-lg transition-colors -ml-2">
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${features.catch ? 'bg-neon-blue border-neon-blue' : 'border-gray-500'}`}>
                                                {features.catch && <Check className="w-3.5 h-3.5 text-black" />}
                                            </div>
                                            <input type="checkbox" className="hidden" checked={features.catch} onChange={e => setFeatures({...features, catch: e.target.checked})} />
                                            <span className="text-gray-200 font-bold text-sm">滑键音符</span>
                                        </label>
                                    </div>
                                </div>
                            )}
                            
                            {mode === 'MANUAL' && (
                                <div className="p-4 rounded-xl bg-neon-purple/5 border border-neon-purple/20 space-y-3">
                                    <h3 className="text-sm font-bold text-neon-purple uppercase tracking-widest flex items-center gap-2">
                                        <BrainCircuit className="w-3 h-3"/> 辅助功能
                                    </h3>
                                    {/* Enforce AI Analysis */}
                                    <div className="flex items-center gap-3 p-2 rounded-lg border border-white/5 bg-white/5 cursor-not-allowed opacity-75">
                                        <div className="w-5 h-5 rounded border flex items-center justify-center bg-neon-purple border-neon-purple">
                                            <Check className="w-3.5 h-3.5 text-black" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-gray-200 font-bold text-sm">启用 AI 辅助分析</span>
                                            <span className="text-[10px] text-gray-500">自动检测 BPM、曲名及生成视觉主题</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                         </div>
                     </div>

                     {/* Difficulty Column */}
                     <div className="flex flex-col gap-3">
                         {mode === 'AUTO' ? (
                             <>
                                 <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">选择难度</h3>
                                 {[
                                    { id: BeatmapDifficulty.Easy, label: 'Easy', desc: '轻松休闲', color: 'bg-green-500' },
                                    { id: BeatmapDifficulty.Normal, label: 'Normal', desc: '标准难度', color: 'bg-blue-500' },
                                    { id: BeatmapDifficulty.Hard, label: 'Hard', desc: '进阶挑战', color: 'bg-orange-500' },
                                    { id: BeatmapDifficulty.Expert, label: 'Expert', desc: '硬核极限', color: 'bg-red-600' },
                                    { id: BeatmapDifficulty.Titan, label: 'TITAN', desc: '6K / 混沌', color: 'bg-purple-600' },
                                 ].map((diffOption) => (
                                     <button
                                        key={diffOption.id}
                                        onClick={() => handleDifficultySelect(diffOption.id as BeatmapDifficulty)}
                                        className={`relative overflow-hidden rounded-xl p-4 text-left transition-all border group ${difficulty === diffOption.id ? 'bg-white/10 border-neon-blue' : 'border-white/10 hover:bg-white/5 hover:border-white/20'}`}
                                     >
                                         <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${diffOption.color}`}></div>
                                         <div className="flex justify-between items-center pl-4">
                                             <div>
                                                 <div className={`font-black italic text-lg ${difficulty === diffOption.id ? 'text-white' : 'text-gray-300'}`}>{diffOption.label}</div>
                                                 <div className="text-xs text-gray-500">{diffOption.desc}</div>
                                             </div>
                                             {difficulty === diffOption.id && <CheckCircle className="w-5 h-5 text-neon-blue" />}
                                         </div>
                                     </button>
                                 ))}
                            </>
                         ) : (
                             <div className="h-full flex flex-col justify-center items-center text-center p-6 border border-white/5 rounded-2xl bg-white/5">
                                 <FilePlus className="w-16 h-16 text-gray-600 mb-4" />
                                 <h3 className="text-xl font-bold text-white mb-2">手动模式</h3>
                                 <p className="text-sm text-gray-400">将创建一个空的谱面文件。<br/>您可以在编辑器中使用“录制”功能快速编排。</p>
                             </div>
                         )}

                         <div className="flex-1"></div>

                         <button 
                            onClick={handleConfirm}
                            disabled={mode === 'AUTO' && (!difficulty || !isAnyFeatureSelected)}
                            className={`mt-4 py-4 rounded-xl font-black text-lg uppercase tracking-widest hover:scale-[1.02] transition-all shadow-lg disabled:opacity-30 disabled:scale-100 disabled:shadow-none
                                ${mode === 'AUTO' ? 'bg-neon-blue text-black hover:bg-white' : 'bg-white text-black hover:bg-gray-200'}
                            `}
                         >
                             {mode === 'AUTO' ? '开始生成' : '创建空白谱面'}
                         </button>
                     </div>
                 </div>
             </div>
        </div>
    );
};
