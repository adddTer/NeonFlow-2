
import React, { useEffect, useState, useMemo } from 'react';
import { Trophy, RefreshCcw, Home, Star, BarChart2, Hash, Zap, Target, Crosshair } from 'lucide-react';
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

  const rankYOffset = rank === 'φ' ? '-translate-y-4 md:-translate-y-8' : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 animate-fade-in font-sans">
        
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/95 backdrop-blur-3xl"></div>
        
        {/* Decorative Background Effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {/* Massive Rank Color Glow */}
            <div className={`absolute top-1/2 left-1/4 -translate-y-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full blur-[180px] opacity-20 transition-colors duration-1000 ${rank === 'F' ? 'bg-red-600' : rank === 'φ' ? 'bg-cyan-400' : 'bg-neon-purple'}`}></div>
            
            {/* Tech Pattern Grid */}
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 1) 1px, transparent 1px)', backgroundSize: '60px 60px' }}></div>
            
            {/* Glitch Noise */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
        </div>

        <div className={`relative z-10 w-full max-w-6xl h-full md:h-auto flex flex-col md:flex-row bg-[#08080a] border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.8)] transition-all duration-1000 ${animate ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-20 scale-95'}`}>
            
            {/* Left: Rank & Big Score Canvas */}
            <div className="relative w-full md:w-[45%] p-8 md:p-16 flex flex-col justify-center items-center border-b md:border-b-0 md:border-r border-white/5 overflow-hidden">
                
                {/* Dynamic Sub-Glow specific to rank */}
                <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${rank === 'φ' ? 'from-cyan-400' : rank === 'F' ? 'from-red-500' : 'from-neon-blue'} to-transparent`}></div>

                <div className="w-full text-center relative z-10 mb-auto mt-4">
                    <div className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-2 flex items-center justify-center gap-2">
                        <span className="w-8 h-px bg-white/20"></span>
                        任务完成
                        <span className="w-8 h-px bg-white/20"></span>
                    </div>
                    <h2 className="text-2xl font-black text-white px-4 truncate max-w-full drop-shadow-md">{songName}</h2>
                </div>

                <div className={`relative my-10 transition-all duration-1000 ease-out ${animate ? 'scale-100 blur-0 opacity-100' : 'scale-[2] blur-xl opacity-0'}`}>
                    <div className={`text-[150px] md:text-[220px] font-black italic leading-none text-center ${color} ${shadow} ${rankYOffset}`} style={{ textShadow: rank === 'φ' ? '0 0 40px rgba(103,232,249,0.5)' : '0 10px 30px rgba(0,0,0,0.5)' }}>
                        {rank}
                    </div>
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-6 py-2 bg-black/60 backdrop-blur-xl rounded-full border border-white/10 shadow-lg flex items-center gap-2 whitespace-nowrap">
                        <Trophy className={`w-4 h-4 ${color}`} />
                        <span className={`text-sm font-black uppercase tracking-widest ${color}`}>{label}</span>
                    </div>
                </div>

                <div className="flex flex-col items-center gap-2 mt-auto pb-4 relative z-10">
                    <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">最终得分</div>
                    <div className={`text-5xl md:text-6xl font-black text-white tracking-tighter tabular-nums drop-shadow-lg`}>
                        {Math.round(score.score).toLocaleString().padStart(7, '0')}
                    </div>
                    {score.modifiers && score.modifiers.length > 0 && (
                        <div className="flex gap-2 mt-2">
                            {score.modifiers.map(m => (
                                <span key={m} className="text-[9px] font-black bg-neon-purple/20 border border-neon-purple/30 px-2 py-1 rounded text-neon-purple uppercase tracking-widest">{m}</span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Right: Stats Grid */}
            <div className="flex-1 p-6 md:p-12 flex flex-col justify-between overflow-y-auto custom-scrollbar relative bg-black/40">
                
                {/* HUD Elements */}
                <div className="absolute top-0 right-0 p-4 opacity-20 pointer-events-none">
                    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="white" strokeWidth="1">
                        <path d="M0,0 L10,0 M40,0 L30,0 M0,40 L10,40 M40,40 L30,40 M0,0 L0,10 M40,0 L40,10 M0,40 L0,30 M40,40 L40,30" />
                    </svg>
                </div>

                <div className="space-y-8">
                    {/* Stat Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <StatBox label="完美" value={score.perfect} color="text-cyan-400" accent="border-cyan-400/30 bg-cyan-400/5" icon={<Target className="w-5 h-5"/>} delay={200} />
                        <StatBox label="良好" value={score.good} color="text-green-400" accent="border-green-400/30 bg-green-400/5" icon={<Zap className="w-5 h-5"/>} delay={300} />
                        <StatBox label="未击中" value={score.miss} color="text-red-500" accent="border-red-500/30 bg-red-500/5" icon={<XIcon />} delay={400} />
                        <StatBox label="最大连击" value={score.maxCombo} color="text-yellow-400" accent="border-yellow-400/30 bg-yellow-400/5" icon={<Star className="w-5 h-5"/>} delay={500} />
                    </div>

                    {/* Accuracy Bar */}
                    <div className="bg-[#111] rounded-2xl p-6 border border-white/5 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-r from-neon-blue/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="flex justify-between items-end mb-4 relative z-10">
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                <Crosshair className="w-4 h-4 text-neon-blue" /> 综合准度
                            </span>
                            <span className={`text-4xl font-black tabular-nums tracking-tighter ${color}`}>{accuracy.toFixed(2)}%</span>
                        </div>
                        <div className="h-3 bg-black rounded-full overflow-hidden border border-white/5">
                            <div className={`h-full ${rank === 'F' ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-neon-blue shadow-[0_0_10px_#00f3ff]'} transition-all duration-1000 ease-out`} style={{ width: `${animate ? accuracy : 0}%` }}></div>
                        </div>
                    </div>

                    {/* Hit Error Histogram */}
                    <div className="bg-[#111] rounded-2xl p-6 border border-white/5 relative overflow-hidden">
                        <div className="flex justify-between items-center mb-6">
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                <BarChart2 className="w-4 h-4 text-neon-purple" /> 击打误差
                            </span>
                            <div className="flex gap-4 text-[10px] font-mono font-bold tracking-widest text-gray-500 uppercase">
                                <span className="bg-white/5 px-2 py-1 rounded">UR: <span className="text-white">{unstableRate.toFixed(1)}</span></span>
                                <span className="bg-white/5 px-2 py-1 rounded">平均: <span className={Math.abs(meanOffset) < 5 ? 'text-green-400' : 'text-yellow-400'}>{meanOffset > 0 ? '+' : ''}{meanOffset.toFixed(1)}ms</span></span>
                            </div>
                        </div>
                        
                        <div className="h-24 flex items-end gap-px justify-center relative px-2">
                            {/* Center Line Guides */}
                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 z-10"></div>
                            <div className="absolute left-1/2 top-0 bottom-0 w-[30%] -translate-x-1/2 bg-cyan-400/5 border-x border-cyan-400/20 pointer-events-none"></div>

                            {histogram.map((count, i) => {
                                const height = (count / maxBucketVal) * 100;
                                const isCenter = i >= 18 && i <= 22; 
                                return (
                                    <div 
                                        key={i} 
                                        className={`flex-1 max-w-[6px] rounded-t-sm transition-all duration-[800ms] ${isCenter ? 'bg-cyan-400 shadow-[0_0_5px_#22d3ee]' : 'bg-gray-700'}`}
                                        style={{ 
                                            height: `${animate ? height : 0}%`,
                                            transitionDelay: `${i * 10}ms`
                                        }}
                                    ></div>
                                );
                            })}
                        </div>
                        <div className="flex justify-between text-[9px] text-gray-600 font-black tracking-widest mt-3 px-2 uppercase">
                            <span>-100毫秒</span>
                            <span className="text-cyan-400/50">完美区间</span>
                            <span>+100毫秒</span>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-white/5">
                    <button 
                        onClick={onReset}
                        className="py-5 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-black transition-all flex items-center justify-center gap-3 group border border-white/10 hover:border-white/30"
                    >
                        <Home className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        <span className="uppercase tracking-widest text-xs">主菜单</span>
                    </button>
                    <button 
                        onClick={onReplay}
                        className="py-5 rounded-2xl bg-white text-black font-black transition-all hover:bg-neon-blue hover:shadow-lg flex items-center justify-center gap-3 group border border-white"
                    >
                        <RefreshCcw className="w-5 h-5 group-hover:rotate-180 transition-transform" />
                        <span className="uppercase tracking-widest text-xs">再次游玩</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

const StatBox = ({ label, value, color, accent, icon, delay }: any) => (
    <div className={`p-5 rounded-2xl border ${accent} flex flex-col justify-between animate-fade-in relative overflow-hidden group`} style={{ animationDelay: `${delay}ms` }}>
        <div className="absolute -right-4 -top-4 opacity-10 group-hover:opacity-20 transition-opacity transform group-hover:scale-110">
            {React.cloneElement(icon, { size: 64 })}
        </div>
        <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-2 relative z-10 flex items-center gap-2">
            {icon} {label}
        </span>
        <span className={`text-3xl font-black ${color} tracking-tighter relative z-10 tabular-nums`}>
            {value.toLocaleString()}
        </span>
    </div>
);

const XIcon = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);
