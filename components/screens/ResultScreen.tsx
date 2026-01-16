
import React, { useEffect, useState, useMemo } from 'react';
import { Trophy, RefreshCcw, Home, Share2, Star, Zap, BarChart2, Eye, Skull, Flashlight, FastForward, Rewind, Crosshair, Bot } from 'lucide-react';
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

const ModIcon = ({ mod }: { mod: GameModifier }) => {
    switch (mod) {
        case GameModifier.DoubleTime: return <div title="Double Time" className="flex"><FastForward className="w-4 h-4 text-red-400" /></div>;
        case GameModifier.HalfTime: return <div title="Half Time" className="flex"><Rewind className="w-4 h-4 text-blue-400" /></div>;
        case GameModifier.HardRock: return <div title="Hard Rock" className="flex"><Crosshair className="w-4 h-4 text-orange-400" /></div>;
        case GameModifier.SuddenDeath: return <div title="Sudden Death" className="flex"><Skull className="w-4 h-4 text-gray-200" /></div>;
        case GameModifier.Hidden: return <div title="Hidden" className="flex"><Eye className="w-4 h-4 text-purple-400" /></div>;
        case GameModifier.Flashlight: return <div title="Flashlight" className="flex"><Flashlight className="w-4 h-4 text-yellow-400" /></div>;
        case GameModifier.Auto: return <div title="Auto" className="flex"><Bot className="w-4 h-4 text-green-400" /></div>;
        default: return null;
    }
};

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

  // Calculate Histogram Data & Stats
  const { histogram, meanOffset, unstableRate } = useMemo(() => {
    const history = score.hitHistory || [];
    if (history.length === 0) return { histogram: Array(21).fill(0), meanOffset: 0, unstableRate: 0 };

    // Buckets from -100ms to +100ms in 10ms steps (21 buckets)
    // Index 10 is 0ms (perfect center)
    const buckets = new Array(21).fill(0);
    let sum = 0;
    
    history.forEach(val => {
        sum += val;
        // Convert seconds to ms
        const ms = val * 1000;
        // Offset range -100 to 100.
        // Clamp to edge buckets if outside range
        let idx = Math.floor((ms + 105) / 10);
        if (idx < 0) idx = 0;
        if (idx > 20) idx = 20;
        buckets[idx]++;
    });

    const mean = (sum / history.length) * 1000; // in ms
    
    // Standard Deviation (Unstable Rate = StdDev * 10)
    const variance = history.reduce((acc, val) => acc + Math.pow((val * 1000) - mean, 2), 0) / history.length;
    const stdDev = Math.sqrt(variance);
    const ur = stdDev * 10;

    return { histogram: buckets, meanOffset: mean, unstableRate: ur };
  }, [score.hitHistory]);

  if (status !== GameStatus.Finished) return null;

  // Use the new calculateGrade which only needs score (0-1000000)
  const { rank, color, label, shadow } = calculateGrade(score.score);
  const accuracy = calculateAccuracy(score.perfect, score.good, notesCount);
  const maxBucketVal = Math.max(...histogram, 1);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#050505]/95 backdrop-blur-xl animate-fade-in custom-scrollbar flex flex-col items-center justify-center">
      
      {/* Dynamic Background Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className={`fixed top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full opacity-10 blur-[150px] transition-colors duration-1000 ${rank === 'D' ? 'bg-red-900' : 'bg-neon-blue'}`}></div>
          <div className={`fixed bottom-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full opacity-10 blur-[150px] transition-colors duration-1000 ${rank === 'D' ? 'bg-orange-900' : 'bg-neon-purple'}`}></div>
      </div>

      <div className="w-full max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-center p-6 md:p-12 gap-8 md:gap-16 relative z-10 h-full md:h-auto">
        
        {/* Left: Grade & Title */}
        <div className={`flex flex-col items-center md:items-start transition-all duration-700 transform ${animate ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'}`}>
            <div className="text-gray-400 text-xs font-bold tracking-[0.4em] uppercase mb-2 flex items-center gap-2 border border-white/10 px-3 py-1 rounded-full bg-white/5">
                <Trophy className="w-3 h-3" /> Result
            </div>
            <h1 className="text-2xl md:text-4xl font-black text-white mb-8 leading-tight text-center md:text-left max-w-md line-clamp-2">
                {songName}
            </h1>
            
            <div className="relative group scale-90 md:scale-100">
                 {/* Rank Shadow Glow */}
                 <div className={`absolute inset-0 blur-3xl opacity-30 ${color.includes('red') ? 'bg-red-500' : 'bg-neon-blue'}`}></div>
                 
                 <div className={`text-[10rem] md:text-[14rem] font-black italic leading-none select-none drop-shadow-2xl ${color} ${shadow || ''}`} style={{ textShadow: '0 0 40px currentColor' }}>
                     {rank}
                 </div>
                 {/* Fixed: Changed mt-[-20px] to mt-4 to avoid overlap */}
                 <div className="absolute top-full left-0 w-full text-center text-xl md:text-2xl font-black tracking-[0.5em] text-white opacity-80 uppercase mt-4">
                     {label}
                 </div>
            </div>
        </div>

        {/* Right: Stats & Actions */}
        <div className={`flex-1 w-full max-w-lg flex flex-col gap-6 transition-all duration-700 delay-200 transform ${animate ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'}`}>
            
            {/* Main Stats Card */}
            <div className="bg-[#0f172a] border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden group">
                <div className="grid grid-cols-2 gap-8 mb-6 relative z-10 border-b border-white/5 pb-6">
                    <div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 font-bold">Total Score</div>
                        {/* FIX: Use Math.round for display */}
                        <div className="text-3xl md:text-4xl font-mono font-black text-white tracking-tighter">
                            {Math.round(score.score).toLocaleString()}
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1 font-bold">Accuracy</div>
                        <div className="text-3xl md:text-4xl font-mono font-black text-neon-blue tracking-tighter">
                            {accuracy}%
                        </div>
                    </div>
                </div>

                {/* Modifiers List */}
                {score.modifiers && score.modifiers.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-6 justify-center md:justify-start">
                        {score.modifiers.map(mod => (
                            <div key={mod} className="bg-white/10 px-2 py-1 rounded flex items-center gap-1.5 border border-white/5">
                                <ModIcon mod={mod} />
                                <span className="text-[10px] font-bold text-gray-300">{mod}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Detailed Hit Counts */}
                <div className="grid grid-cols-3 gap-2 mb-6">
                    <div className="bg-black/40 rounded-xl p-3 border border-white/5 text-center">
                        <div className="text-neon-purple font-bold text-[10px] uppercase tracking-wider mb-1">Perfect</div>
                        <div className="text-xl font-mono font-bold text-white">{score.perfect}</div>
                    </div>
                    <div className="bg-black/40 rounded-xl p-3 border border-white/5 text-center">
                        <div className="text-neon-blue font-bold text-[10px] uppercase tracking-wider mb-1">Good</div>
                        <div className="text-xl font-mono font-bold text-white">{score.good}</div>
                    </div>
                    <div className="bg-black/40 rounded-xl p-3 border border-white/5 text-center">
                        <div className="text-gray-500 font-bold text-[10px] uppercase tracking-wider mb-1">Miss</div>
                        <div className="text-xl font-mono font-bold text-gray-400">{score.miss}</div>
                    </div>
                </div>

                {/* Advanced Stats: Histogram */}
                <div className="bg-[#1a1a24] rounded-xl p-4 border border-white/10 mb-4 shadow-inner">
                    <div className="flex justify-between items-end mb-3">
                        <div className="text-[10px] text-gray-300 uppercase tracking-widest font-bold flex items-center gap-2">
                             <BarChart2 className="w-3 h-3 text-neon-blue"/> Hit Error
                        </div>
                        <div className="text-xs font-mono text-gray-400">
                             {meanOffset > 0 ? '+' : ''}{meanOffset.toFixed(1)}ms / UR {unstableRate.toFixed(1)}
                        </div>
                    </div>
                    
                    <div className="h-32 flex items-end justify-between gap-[2px] relative py-2 border-b border-white/10 bg-black/20 rounded-lg px-2">
                         {/* Perfect Window Background Highlight (Indices 5 to 15 approx +/- 50ms) */}
                         <div className="absolute left-[24%] right-[24%] top-0 bottom-0 bg-neon-purple/5 border-x border-neon-purple/20 pointer-events-none rounded-sm"></div>
                         
                         {/* Center Line */}
                         <div className="absolute left-1/2 top-0 bottom-0 w-[2px] bg-white/30 -translate-x-1/2 z-0"></div>
                         
                         {histogram.map((count, i) => {
                             // Use logarithmic scaling to make smaller bars more visible
                             // height = log(count + 1) / log(max + 1)
                             let heightPct = 0;
                             if (maxBucketVal > 0 && count > 0) {
                                 heightPct = (Math.log(count + 1) / Math.log(maxBucketVal + 1)) * 100;
                                 heightPct = Math.max(heightPct, 5); // Minimum 5% height for visibility
                             }
                             
                             let barColor = 'bg-gray-600';
                             // +/- 50ms (Perfect)
                             if (i >= 5 && i <= 15) barColor = 'bg-neon-purple/80 hover:bg-neon-purple';
                             // Center (0ms)
                             if (i === 10) barColor = 'bg-white hover:bg-white shadow-[0_0_10px_white]';
                             // Good range
                             if (i < 5 || i > 15) barColor = 'bg-neon-blue/60 hover:bg-neon-blue';
                             
                             return (
                                 <div key={i} className="flex-1 h-full flex items-end relative z-10 group/bar mx-[1px]" title={`${count} hits`}>
                                     <div 
                                        className={`w-full rounded-t-sm transition-all duration-500 ${barColor}`} 
                                        style={{ height: `${heightPct}%` }}
                                     ></div>
                                 </div>
                             )
                         })}
                    </div>
                    <div className="flex justify-between text-[8px] text-gray-500 font-mono mt-1 px-1 font-bold">
                        <span>-100ms</span>
                        <span className="text-neon-purple">PERFECT</span>
                        <span>+100ms</span>
                    </div>
                </div>

                <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Max Combo</span>
                        <span className="text-xl font-bold text-neon-yellow">{score.maxCombo}</span>
                    </div>
                    {score.maxCombo === notesCount && (
                         <div className="px-3 py-1 bg-neon-yellow text-black font-black text-[10px] rounded uppercase tracking-wider shadow-lg shadow-neon-yellow/20">
                             Full Combo
                         </div>
                    )}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-4 pb-8 md:pb-0">
                <button 
                    onClick={onReplay}
                    className="py-4 md:py-5 rounded-2xl bg-white text-black font-bold text-base md:text-lg hover:bg-neon-blue hover:scale-[1.02] transition-all flex items-center justify-center gap-2 shadow-xl"
                >
                    <RefreshCcw className="w-5 h-5" />
                    再来一次
                </button>
                <button 
                    onClick={onReset}
                    className="py-4 md:py-5 rounded-2xl bg-white/5 text-white font-bold text-base md:text-lg border border-white/10 hover:bg-white/10 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                >
                    <Home className="w-5 h-5" />
                    返回曲库
                </button>
            </div>
        </div>

      </div>
    </div>
  );
};
