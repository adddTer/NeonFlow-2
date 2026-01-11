
import React from 'react';
import { Music, X, Check, Bug, CheckCircle } from 'lucide-react';
import { BeatmapDifficulty, LaneCount, PlayStyle } from '../../types';

interface SongConfigModalProps {
    file: File;
    onCancel: () => void;
    onConfirm: () => void;
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
    
    const handleDifficultySelect = (diff: BeatmapDifficulty) => {
        setDifficulty(diff);
        if (diff === BeatmapDifficulty.Titan) {
            setLaneCount(6);
            setPlayStyle('MULTI');
        }
    };

    const isAnyFeatureSelected = features.normal || features.holds || features.catch;

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
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     {/* Options Column */}
                     <div className="space-y-6">
                         <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                             <div className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">选定文件</div>
                             <div className="text-lg font-bold text-white break-all line-clamp-2">{file.name}</div>
                         </div>

                         <div className="space-y-4">
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">按键模式</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => setLaneCount(4)} 
                                        disabled={difficulty === BeatmapDifficulty.Titan}
                                        className={`p-3 rounded-xl text-left font-bold transition-all border 
                                            ${laneCount === 4 
                                                ? 'bg-neon-blue border-neon-blue text-black' 
                                                : difficulty === BeatmapDifficulty.Titan
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
                            
                            <div>
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">游玩风格</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => setPlayStyle('THUMB')} 
                                        disabled={difficulty === BeatmapDifficulty.Titan}
                                        className={`p-3 rounded-xl text-left font-bold transition-all border 
                                            ${playStyle === 'THUMB' 
                                                ? 'bg-white border-white text-black' 
                                                : difficulty === BeatmapDifficulty.Titan
                                                    ? 'bg-transparent border-white/5 text-gray-600 cursor-not-allowed opacity-50'
                                                    : 'bg-transparent border-white/10 text-gray-400 hover:bg-white/5'}`}
                                    >
                                        双指
                                    </button>
                                    <button onClick={() => setPlayStyle('MULTI')} className={`p-3 rounded-xl text-left font-bold transition-all border ${playStyle === 'MULTI' ? 'bg-white border-white text-black' : 'bg-transparent border-white/10 text-gray-400 hover:bg-white/5'}`}>
                                        多指
                                    </button>
                                </div>
                            </div>
                            
                             <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">谱面元素</h3>
                                <div className="space-y-2">
                                    <label className="flex items-center gap-3 cursor-pointer group hover:bg-white/5 p-2 rounded-lg transition-colors -ml-2">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${features.normal ? 'bg-neon-blue border-neon-blue' : 'border-gray-500'}`}>
                                            {features.normal && <Check className="w-3.5 h-3.5 text-black" />}
                                        </div>
                                        <input type="checkbox" className="hidden" checked={features.normal} onChange={e => setFeatures({...features, normal: e.target.checked})} />
                                        <div>
                                            <span className="text-gray-200 font-bold block text-sm">普通音符</span>
                                            <span className="text-gray-500 text-[10px]">基础的单点音符</span>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer group hover:bg-white/5 p-2 rounded-lg transition-colors -ml-2">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${features.holds ? 'bg-neon-blue border-neon-blue' : 'border-gray-500'}`}>
                                            {features.holds && <Check className="w-3.5 h-3.5 text-black" />}
                                        </div>
                                        <input type="checkbox" className="hidden" checked={features.holds} onChange={e => setFeatures({...features, holds: e.target.checked})} />
                                        <div>
                                            <span className="text-gray-200 font-bold block text-sm">长条</span>
                                            <span className="text-gray-500 text-[10px]">需持续按住的长音符</span>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer group hover:bg-white/5 p-2 rounded-lg transition-colors -ml-2">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${features.catch ? 'bg-neon-blue border-neon-blue' : 'border-gray-500'}`}>
                                            {features.catch && <Check className="w-3.5 h-3.5 text-black" />}
                                        </div>
                                        <input type="checkbox" className="hidden" checked={features.catch} onChange={e => setFeatures({...features, catch: e.target.checked})} />
                                        <div>
                                            <span className="text-gray-200 font-bold block text-sm">滑键</span>
                                            <span className="text-gray-500 text-[10px]">特殊的菱形滑音符</span>
                                        </div>
                                    </label>
                                </div>
                            </div>

                             {/* Developer Options */}
                             {isDebugMode && (
                                 <div className="p-4 rounded-xl bg-neon-purple/5 border border-neon-purple/20 space-y-3">
                                    <h3 className="text-sm font-bold text-neon-purple uppercase tracking-widest flex items-center gap-2">
                                        <Bug className="w-3 h-3"/> 开发者选项
                                    </h3>
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${skipAI ? 'bg-neon-purple border-neon-purple' : 'border-gray-500'}`}>
                                            {skipAI && <Check className="w-3.5 h-3.5 text-black" />}
                                        </div>
                                        <input type="checkbox" className="hidden" checked={skipAI} onChange={e => setSkipAI(e.target.checked)} />
                                        <span className="text-gray-300 font-bold group-hover:text-white transition-colors text-sm">跳过 AI 分析</span>
                                    </label>
                                 </div>
                             )}

                         </div>
                     </div>

                     {/* Difficulty Column */}
                     <div className="flex flex-col gap-3">
                         <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">选择难度</h3>
                         {[
                            { id: BeatmapDifficulty.Easy, label: 'Easy', desc: '轻松休闲', color: 'bg-green-500' },
                            { id: BeatmapDifficulty.Normal, label: 'Normal', desc: '标准难度', color: 'bg-blue-500' },
                            { id: BeatmapDifficulty.Hard, label: 'Hard', desc: '进阶挑战', color: 'bg-orange-500' },
                            { id: BeatmapDifficulty.Expert, label: 'Expert', desc: '硬核极限', color: 'bg-red-600' },
                            { id: BeatmapDifficulty.Titan, label: 'TITAN', desc: '6K / 混沌', color: 'bg-purple-600' },
                         ].map((mode) => (
                             <button
                                key={mode.id}
                                onClick={() => handleDifficultySelect(mode.id as BeatmapDifficulty)}
                                className={`relative overflow-hidden rounded-xl p-4 text-left transition-all border group ${difficulty === mode.id ? 'bg-white/10 border-neon-blue' : 'border-white/10 hover:bg-white/5 hover:border-white/20'}`}
                             >
                                 <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${mode.color}`}></div>
                                 <div className="flex justify-between items-center pl-4">
                                     <div>
                                         <div className={`font-black italic text-lg ${difficulty === mode.id ? 'text-white' : 'text-gray-300'}`}>{mode.label}</div>
                                         <div className="text-xs text-gray-500">{mode.desc}</div>
                                     </div>
                                     {difficulty === mode.id && <CheckCircle className="w-5 h-5 text-neon-blue" />}
                                 </div>
                             </button>
                         ))}

                         <button 
                            onClick={onConfirm}
                            disabled={!difficulty || !isAnyFeatureSelected}
                            className="mt-4 py-4 rounded-xl bg-neon-blue text-black font-black text-lg uppercase tracking-widest hover:bg-white hover:scale-[1.02] transition-all shadow-lg disabled:opacity-30 disabled:scale-100 disabled:shadow-none"
                         >
                             开始生成
                         </button>
                     </div>
                 </div>
             </div>
        </div>
    );
};
