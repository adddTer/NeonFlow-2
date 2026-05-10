
import React, { useMemo } from 'react';
import { X, Trophy, Music, Activity, Target, Zap, Star, ShieldAlert, Sparkles, Crosshair } from 'lucide-react';
import { SavedSong } from '../../types';
import { calculateRating, calculateGrade } from '../../utils/scoring';

interface ProfileModalProps {
    songs: SavedSong[];
    onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ songs, onClose }) => {
    
    const stats = useMemo(() => {
        let totalScore = 0;
        let totalNotesHit = 0;
        let totalNotesPossible = 0;
        let totalPlayCount = 0;
        let clearedSongs = 0;
        let fullCombos = 0;
        
        // Initialize with new Rank keys
        const rankCounts: Record<string, number> = { 
            'φ': 0, 
            'SSS': 0, 
            'SS': 0, 
            'S': 0, 
            'A': 0, 
            'B': 0, 
            'C': 0, 
            'D': 0 
        };

        const ratings = songs
            .map(s => {
                if (!s.bestResult) return 0;
                return calculateRating(s.difficultyRating, s.bestResult.score);
            })
            .sort((a, b) => b - a);
        
        const top10 = ratings.slice(0, 10);
        const rating = top10.length > 0 ? top10.reduce((a, b) => a + b, 0) / Math.min(top10.length, 10) : 0;

        songs.forEach(song => {
            totalPlayCount += (song.playCount || 0);
            if (song.bestResult) {
                totalScore += song.bestResult.score;
                totalNotesHit += (song.bestResult.perfect + song.bestResult.good);
                totalNotesPossible += song.notes.length;
                
                const { rank } = calculateGrade(song.bestResult.score);
                
                if (rank !== 'D') clearedSongs++;
                if (song.bestResult.maxCombo === song.notes.length) fullCombos++;
                
                if (rankCounts[rank] !== undefined) rankCounts[rank]++;
                else {
                    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
                }
            }
        });

        const overallAccuracy = totalNotesPossible > 0 ? (totalNotesHit / totalNotesPossible) * 100 : 0;

        return {
            rating,
            totalScore,
            totalPlayCount,
            clearedSongs,
            fullCombos,
            overallAccuracy,
            rankCounts,
            totalSongs: songs.length
        };
    }, [songs]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-8 animate-fade-in font-sans">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-3xl" onClick={onClose}></div>
            
            <div className="bg-[#0a0a0c] border border-white/10 rounded-3xl w-full max-w-5xl shadow-2xl relative overflow-hidden flex flex-col max-h-[95vh] z-10 scale-100 animate-slide-up">
                
                {/* Decorative Tech Accents */}
                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-neon-purple to-transparent opacity-50"></div>
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-neon-purple/20 blur-[100px] rounded-full pointer-events-none"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-neon-blue/20 blur-[100px] rounded-full pointer-events-none"></div>

                {/* Header */}
                <div className="p-6 md:p-8 flex justify-between items-start relative z-10">
                    <div className="flex gap-4 items-center">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1a1a2e] to-black border border-white/10 shadow-inner flex items-center justify-center relative overflow-hidden group">
                            <div className="absolute inset-0 bg-neon-purple/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <Activity className="w-8 h-8 text-white relative z-10 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                        </div>
                        <div>
                            <h2 className="text-3xl font-black text-white italic tracking-tighter mix-blend-plus-lighter">玩家档案</h2>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e] animate-pulse"></span>
                                <p className="text-xs text-gray-400 font-bold tracking-widest uppercase">系统连接正常</p>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 hover:rotate-90 rounded-2xl transition-all border border-white/5 hover:border-white/20 relative group">
                        <X className="w-6 h-6 text-gray-400 group-hover:text-white" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 pt-0 relative z-10">
                    
                    {/* Bento Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
                        
                        {/* Rating Card - Large */}
                        <div className="md:col-span-8 bg-black/40 rounded-3xl p-8 border border-white/10 relative overflow-hidden group hover:border-neon-purple/30 transition-colors backdrop-blur-md">
                            <div className="absolute right-0 bottom-0 opacity-5 group-hover:opacity-10 transition-opacity translate-x-1/4 translate-y-1/4">
                                <Trophy className="w-64 h-64 text-white" />
                            </div>
                            
                            <div className="relative z-10 flex flex-col h-full justify-between">
                                <div className="flex justify-between items-start">
                                    <div className="px-4 py-1.5 bg-neon-purple/10 border border-neon-purple/30 rounded-full flex items-center gap-2 w-fit mb-6">
                                        <Sparkles className="w-3 h-3 text-neon-purple" />
                                        <span className="text-[10px] font-black text-neon-purple uppercase tracking-widest">综合潜力值</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-gray-500 font-bold uppercase tracking-widest">基于 Top 10 最佳</div>
                                    </div>
                                </div>

                                <div>
                                    <div className="text-7xl md:text-8xl font-black text-white tracking-tighter drop-shadow-lg flex items-baseline gap-3">
                                        {stats.rating.toFixed(2)}
                                        <span className="text-2xl text-neon-purple font-black italic">PT</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Top Stats Column */}
                        <div className="md:col-span-4 grid grid-rows-2 gap-4 relative">
                            <StatCard 
                                icon={<Crosshair />} 
                                label="综合准度" 
                                value={`${stats.overallAccuracy.toFixed(2)}%`} 
                                subText="ACCURACY" 
                                accent="from-neon-blue/20" 
                                color="text-neon-blue"
                            />
                            <StatCard 
                                icon={<Activity />} 
                                label="游玩次数" 
                                value={`${stats.totalPlayCount}`} 
                                subText="TOTAL PLAYS" 
                                accent="from-neon-pink/20" 
                                color="text-neon-pink"
                            />
                        </div>

                        {/* Rank Distribution - Wide */}
                        <div className="md:col-span-12 bg-black/40 rounded-3xl p-6 md:p-8 border border-white/10 relative overflow-hidden backdrop-blur-md">
                            <div className="flex items-center gap-3 mb-8">
                                <Star className="w-5 h-5 text-yellow-400" />
                                <h3 className="text-sm font-black text-white uppercase tracking-widest">评价分布</h3>
                            </div>
                            
                            <div className="flex justify-between items-end gap-2 h-40">
                                 {['φ', 'SSS', 'SS', 'S', 'A', 'B', 'C', 'D'].map(rank => {
                                     const count = stats.rankCounts[rank] || 0;
                                     const max = Math.max(...(Object.values(stats.rankCounts) as number[]), 1);
                                     const height = count === 0 ? 0 : Math.max((count / max) * 100, 10); 
                                     
                                     let colorClass = 'bg-gray-800 border-gray-700';
                                     let shadowClass = '';
                                     let textClass = 'text-gray-500';

                                     if (rank === 'φ') {
                                         colorClass = 'bg-cyan-300 border-cyan-200';
                                         shadowClass = 'shadow-[0_0_20px_rgba(103,232,249,0.5)]';
                                         textClass = 'text-cyan-300 drop-shadow-[0_0_5px_#67e8f9]';
                                     }
                                     else if (rank === 'SSS') {
                                         colorClass = 'bg-[#f472b6] border-pink-400';
                                         shadowClass = 'shadow-[0_0_15px_rgba(244,114,182,0.4)]';
                                         textClass = 'text-[#f472b6]';
                                     }
                                     else if (rank === 'SS') {
                                         colorClass = 'bg-yellow-400 border-yellow-300';
                                         shadowClass = 'shadow-[0_0_10px_rgba(250,204,21,0.3)]';
                                         textClass = 'text-yellow-400';
                                     }
                                     else if (rank === 'S') { colorClass = 'bg-blue-500 border-blue-400'; textClass = 'text-blue-500'; }
                                     else if (rank === 'A') { colorClass = 'bg-green-500 border-green-400'; textClass = 'text-green-500'; }
                                     else if (rank === 'B') { colorClass = 'bg-gray-400 border-gray-300'; textClass = 'text-gray-400'; }
                                     else if (rank === 'C') { colorClass = 'bg-orange-500 border-orange-400'; textClass = 'text-orange-500'; }
                                     else if (rank === 'D') { colorClass = 'bg-red-500 border-red-400'; textClass = 'text-red-500'; }
                                     
                                     return (
                                         <div key={rank} className="flex-1 h-full flex flex-col items-center justify-end group min-w-[30px] relative">
                                             <div className="mb-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-black text-white tracking-widest absolute -top-8 z-10 pointer-events-none">
                                                 {count}
                                             </div>
                                             <div 
                                                className={`w-full max-w-[48px] rounded-t-sm transition-all duration-700 ease-out border-t-2 ${colorClass} ${shadowClass} opacity-90 group-hover:opacity-100`} 
                                                style={{ height: `${height}%` }}
                                             >
                                             </div>
                                             <div className={`mt-4 text-sm md:text-xl font-black italic ${textClass}`}>{rank}</div>
                                         </div>
                                     )
                                 })}
                            </div>
                        </div>

                        {/* Bottom Row - Smaller Stats */}
                        <div className="md:col-span-12 grid grid-cols-2 md:grid-cols-4 gap-4">
                            <MiniStat label="全连" value={stats.fullCombos} />
                            <MiniStat label="通关率" value={`${stats.totalPlayCount > 0 ? ((stats.clearedSongs / stats.totalSongs) * 100).toFixed(0) : 0}%`} />
                            <MiniStat label="总分数" value={(stats.totalScore / 1000000).toFixed(1) + 'M'} />
                            <MiniStat label="收藏曲目" value={stats.totalSongs} />
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

const StatCard = ({ icon, label, value, subText, accent, color }: any) => (
    <div className={`bg-black/40 rounded-3xl p-6 border border-white/10 relative overflow-hidden group hover:border-white/30 transition-all bg-gradient-to-br ${accent} to-transparent backdrop-blur-md`}>
        <div className={`mb-4 ${color} opacity-80 group-hover:scale-110 transition-transform origin-left`}>
            {React.cloneElement(icon, { size: 28 })}
        </div>
        <div>
            <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">{subText}</div>
            <div className="text-3xl font-black text-white tracking-tight">{value}</div>
            <div className="text-xs font-bold text-gray-400 mt-1">{label}</div>
        </div>
    </div>
);

const MiniStat = ({ label, value }: { label: string, value: string | number }) => (
    <div className="bg-black/40 p-5 rounded-2xl border border-white/10 hover:bg-white/5 transition-colors">
        <div className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-2">{label}</div>
        <div className="text-2xl font-black text-white">{value}</div>
    </div>
);

