
import React, { useEffect, useState, useMemo } from 'react';
import { Trophy, RefreshCcw, Home, Star, BarChart2, Hash, Zap, Target } from 'lucide-react';
import { GameStatus, ScoreState, GameModifier } from '../../types';
import { calculateGrade, calculateAccuracy } from '../../utils/scoring';

interface ResultScreenProps {
  status: GameStatus;
  score: ScoreState;
  notesCount: number;
  songName: string;
  onReset: () => void;
  onReplay: () => void;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({ 
  status, 
  score, 
  notesCount,
  songName, 
  onReset, 
  onReplay 
}) => {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (status === GameStatus.Finished) {
      setTimeout(() => setAnimate(true), 100);
    } else {
      setAnimate(false);
    }
  }, [status]);

  const { histogram, meanOffset, unstableRate } = useMemo(() => {
    const history = score.hitHistory || [];
    if (history.length === 0) return { histogram: Array(41).fill(0), meanOffset: 0, unstableRate: 0 };

    // More granular buckets: -100ms to +100ms in 5ms steps (41 buckets)
    const buckets = new Array(41).fill(0);
    let sum = 0;
    
    history.forEach(val => {
        sum += val;
        const ms = val * 1000;
        let idx = Math.floor((ms + 102.5) / 5);
        if (idx < 0) idx = 0;
        if (idx > 40) idx = 40;
        buckets[idx]++;
    });

    const mean = (sum / history.length) * 1000; 
    const variance = history.reduce((acc, val) => acc + Math.pow((val * 1000) - mean, 2), 0) / history.length;
    const stdDev = Math.sqrt(variance);
    const ur = stdDev * 10;

    return { histogram: buckets, meanOffset: mean, unstableRate: ur };
  }, [score.hitHistory]);

  if (status !== GameStatus.Finished) return null;

  const { rank, color, label, shadow } = calculateGrade(score.score);
  const accuracy = calculateAccuracy(score.perfect, score.good, notesCount);
  const maxBucketVal = Math.max(...histogram, 1);

  // Fix vertical alignment for Phi symbol which tends to render low
  const rankYOffset = rank === 'φ' ? '-translate-y-6 md:-translate-y-8' : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050505]/95 backdrop-blur-xl animate-fade-in overflow-hidden">
        
        {/* Decorative Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className={`absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full blur-[150px] opacity-20 ${rank === 'F' ? 'bg-red-900' : 'bg-blue-900'}`}></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-purple-900/20 rounded-full blur-[150px]"></div>
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
        </div>

        <div className={`relative z-10 w-full max-w-5xl h-full md:h-auto flex flex-col md:flex-row bg-[#0f172a]/50 border border-white/10 md:rounded-[32px] overflow-hidden shadow-2xl transition-all duration-700 ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
            
            {/* Left: Rank & Big Score */}
            <div className="relative w-full md:w-[40%] bg-gradient-to-b from-white/5 to-transparent p-8 md:p-12 flex flex-col justify-center items-center border-b md:border-b-0 md:border-r border-white/5">
                
                <h2 className="text-xl font-bold text-gray-400 mb-2 truncate max-w-full text-center">{songName}</h2>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-8">Results</div>

                <div className={`relative mb-8 transition-transform duration-500 ${animate ? 'scale-100' : 'scale-50'}`}>
                    <div className={`text-[120px] md:text-[160px] font-black italic leading-none ${color} ${shadow} ${rankYOffset}`} style={{ textShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                        {rank}
                    </div>
                    <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-md px-4 py-1 rounded-full border border-white/10 whitespace-nowrap">
                        <span className={`text-sm font-bold uppercase tracking-widest ${color}`}>{label}</span>
                    </div>
                </div>

                <div className="flex flex-col items-center gap-1">
                    <div className="text-4xl md:text-5xl font-black text-white tracking-tighter tabular-nums">
                        {Math.round(score.score).toLocaleString()}
                    </div>
                    <div className="flex gap-2">
                        {score.modifiers?.map(m => (
                            <span key={m} className="text-[10px] font-bold bg-white/10 px-2 py-0.5 rounded text-gray-300">{m}</span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right: Stats Grid */}
            <div className="flex-1 p-6 md:p-10 flex flex-col justify-between overflow-y-auto">
                
                <div className="grid grid-cols-2 gap-4 mb-8">
                    <StatBox label="Perfect" value={score.perfect} total={notesCount} color="text-neon-blue" icon={<Target className="w-4 h-4"/>} delay={100} />
                    <StatBox label="Good" value={score.good} total={notesCount} color="text-green-400" icon={<Zap className="w-4 h-4"/>} delay={200} />
                    <StatBox label="Miss" value={score.miss} total={notesCount} color="text-red-400" icon={<XIcon />} delay={300} />
                    <StatBox label="Max Combo" value={score.maxCombo} color="text-yellow-400" icon={<Star className="w-4 h-4"/>} delay={400} />
                </div>

                <div className="space-y-6">
                    {/* Accuracy Bar */}
                    <div className="bg-black/30 rounded-2xl p-4 border border-white/5">
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                <Hash className="w-3 h-3" /> Accuracy
                            </span>
                            <span className={`text-2xl font-black ${color}`}>{accuracy}%</span>
                        </div>
                        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                            <div className={`h-full ${rank === 'F' ? 'bg-red-500' : 'bg-white'} transition-all duration-1000 ease-out`} style={{ width: `${accuracy}%` }}></div>
                        </div>
                    </div>

                    {/* Hit Error Histogram */}
                    <div className="bg-black/30 rounded-2xl p-4 border border-white/5 relative">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                <BarChart2 className="w-3 h-3" /> Error Distribution
                            </span>
                            <div className="flex gap-3 text-[10px] font-mono text-gray-500">
                                <span>UR: <span className="text-white">{unstableRate.toFixed(1)}</span></span>
                                <span>Mean: <span className={Math.abs(meanOffset) < 5 ? 'text-green-400' : 'text-yellow-400'}>{meanOffset > 0 ? '+' : ''}{meanOffset.toFixed(1)}ms</span></span>
                            </div>
                        </div>
                        
                        <div className="h-16 flex items-end gap-[1px] justify-center relative">
                            {/* Center Line */}
                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 z-10"></div>
                            <div className="absolute left-1/2 top-0 bottom-0 w-[40%] -translate-x-1/2 bg-neon-blue/5 border-x border-neon-blue/10 pointer-events-none"></div>

                            {histogram.map((count, i) => {
                                const height = (count / maxBucketVal) * 100;
                                const isCenter = i >= 18 && i <= 22; // Approx Perfect window center
                                return (
                                    <div 
                                        key={i} 
                                        className={`w-1.5 rounded-t-sm transition-all duration-500 ${isCenter ? 'bg-neon-blue' : 'bg-gray-600'}`}
                                        style={{ height: `${animate ? height : 0}%` }}
                                    ></div>
                                );
                            })}
                        </div>
                        <div className="flex justify-between text-[8px] text-gray-600 font-mono mt-1 px-4">
                            <span>-100ms</span>
                            <span>0ms</span>
                            <span>+100ms</span>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-4 mt-8">
                    <button 
                        onClick={onReset}
                        className="py-4 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold transition-all flex items-center justify-center gap-2 group"
                    >
                        <Home className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                        <span className="uppercase tracking-widest text-xs">Back to Library</span>
                    </button>
                    <button 
                        onClick={onReplay}
                        className="py-4 rounded-xl bg-white text-black font-black transition-all hover:bg-neon-blue hover:shadow-[0_0_20px_rgba(0,243,255,0.4)] flex items-center justify-center gap-2 group"
                    >
                        <RefreshCcw className="w-4 h-4 group-hover:rotate-180 transition-transform" />
                        <span className="uppercase tracking-widest text-xs">Replay</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

const StatBox = ({ label, value, total, color, icon, delay }: any) => (
    <div className={`bg-white/5 p-3 rounded-xl border border-white/5 flex items-center justify-between animate-fade-in`} style={{ animationDelay: `${delay}ms` }}>
        <div className="flex flex-col">
            <span className="text-[10px] text-gray-500 font-bold uppercase mb-1">{label}</span>
            <span className={`text-xl font-black ${color} tracking-tight`}>{value.toLocaleString()}</span>
        </div>
        <div className={`p-2 rounded-lg bg-black/20 ${color}`}>
            {icon}
        </div>
    </div>
);

const XIcon = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);
