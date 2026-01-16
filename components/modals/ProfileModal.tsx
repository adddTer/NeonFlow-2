
import React, { useMemo } from 'react';
import { X, Trophy, Music, Activity, Target, Zap, Clock, Star } from 'lucide-react';
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
                
                // Recalculate rank to ensure consistency with new tier system
                // (e.g. if DB has old 'S' but score is now 'SS')
                const { rank } = calculateGrade(song.bestResult.score);
                
                if (rank !== 'D') clearedSongs++;
                if (song.bestResult.maxCombo === song.notes.length) fullCombos++;
                
                if (rankCounts[rank] !== undefined) rankCounts[rank]++;
                else {
                    // Fallback for any legacy ranks not in our list
                    // (Though recalculation above should fix this)
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
            <div className="bg-[#0f172a] border border-white/20 rounded-3xl w-full max-w-4xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-neon-purple/20 to-transparent">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center border border-white/20 shadow-inner">
                            <Activity className="w-6 h-6 text-neon-purple" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white uppercase tracking-wider">个人概览</h2>
                            <p className="text-xs text-gray-400 font-bold tracking-widest uppercase">Player Statistics</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 bg-black/20 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-6 h-6 text-white" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8">
                    
                    {/* Top Section: Rating & Big Stats */}
                    <div className="flex flex-col md:flex-row gap-8 mb-8">
                        {/* Rating Card */}
                        <div className="flex-1 bg-gradient-to-br from-neon-purple/20 via-[#1a1a2e] to-black rounded-3xl p-6 border border-white/10 relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Trophy className="w-32 h-32 text-white" />
                            </div>
                            <div className="relative z-10">
                                <div className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">Potential Rating</div>
                                <div className="text-6xl md:text-7xl font-black text-white tracking-tighter drop-shadow-lg flex items-baseline gap-2">
                                    {stats.rating.toFixed(2)}
                                    <span className="text-lg text-gray-500 font-bold">PT</span>
                                </div>
                                <div className="mt-4 flex gap-2">
                                    <div className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold text-gray-300 border border-white/5">
                                        基于 Top 10 最佳成绩
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Summary Grid */}
                        <div className="flex-1 grid grid-cols-2 gap-3">
                            <StatCard icon={<Music />} label="收藏曲目" value={`${stats.totalSongs}`} subLabel="Songs" color="text-neon-blue" />
                            <StatCard icon={<Zap />} label="总游玩次数" value={`${stats.totalPlayCount}`} subLabel="Plays" color="text-yellow-400" />
                            <StatCard icon={<Target />} label="综合准度" value={`${stats.overallAccuracy.toFixed(2)}%`} subLabel="Avg. Acc" color="text-green-400" />
                            <StatCard icon={<Trophy />} label="总分数" value={(stats.totalScore / 1000000).toFixed(1) + 'M'} subLabel="Score" color="text-orange-400" />
                        </div>
                    </div>

                    {/* Rank Distribution */}
                    <div className="mb-8">
                        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <Star className="w-4 h-4" /> 评价分布
                        </h3>
                        <div className="bg-black/40 rounded-2xl p-6 border border-white/5 flex flex-wrap justify-around items-end gap-2 h-56 relative overflow-hidden">
                             {['φ', 'SSS', 'SS', 'S', 'A', 'B', 'C', 'D'].map(rank => {
                                 const count = stats.rankCounts[rank] || 0;
                                 const max = Math.max(...(Object.values(stats.rankCounts) as number[]), 1);
                                 // Use a logarithmic scale for visualization so small counts are visible
                                 const height = count === 0 ? 0 : Math.max((count / max) * 100, 10); 
                                 
                                 let colorClass = 'bg-gray-700';
                                 let shadowClass = '';
                                 let textClass = 'text-gray-500';

                                 if (rank === 'φ') {
                                     colorClass = 'bg-cyan-200';
                                     shadowClass = 'shadow-[0_0_20px_rgba(165,243,252,0.6)]';
                                     textClass = 'text-cyan-200';
                                 }
                                 else if (rank === 'SSS') {
                                     colorClass = 'bg-neon-pink';
                                     shadowClass = 'shadow-[0_0_15px_rgba(255,0,255,0.5)]';
                                     textClass = 'text-neon-pink';
                                 }
                                 else if (rank === 'SS') {
                                     colorClass = 'bg-yellow-400';
                                     shadowClass = 'shadow-[0_0_10px_rgba(250,204,21,0.4)]';
                                     textClass = 'text-yellow-400';
                                 }
                                 else if (rank === 'S') {
                                     colorClass = 'bg-neon-blue';
                                     textClass = 'text-neon-blue';
                                 }
                                 else if (rank === 'A') { colorClass = 'bg-green-500'; textClass = 'text-green-500'; }
                                 else if (rank === 'B') { colorClass = 'bg-gray-300'; textClass = 'text-gray-300'; }
                                 else if (rank === 'C') { colorClass = 'bg-orange-500'; textClass = 'text-orange-500'; }
                                 else if (rank === 'D') { colorClass = 'bg-red-500'; textClass = 'text-red-500'; }
                                 
                                 return (
                                     <div key={rank} className="flex-1 h-full flex flex-col items-center justify-end group min-w-[30px]">
                                         <div className="mb-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold text-white bg-black/90 px-2 py-1 rounded absolute top-2 border border-white/10 z-10 pointer-events-none">
                                             {count} 首
                                         </div>
                                         <div 
                                            className={`w-full max-w-[40px] rounded-t-lg transition-all duration-500 ${colorClass} ${shadowClass} opacity-80 group-hover:opacity-100 relative`} 
                                            style={{ height: `${height}%` }}
                                         >
                                             {count > 0 && <div className="absolute top-0 left-0 w-full h-[1px] bg-white/50"></div>}
                                         </div>
                                         <div className={`mt-3 text-xs md:text-sm font-black ${textClass}`}>{rank}</div>
                                     </div>
                                 )
                             })}
                        </div>
                    </div>

                    {/* Additional Stats */}
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                         <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                             <div className="text-[10px] text-gray-500 uppercase font-bold">Full Combos</div>
                             <div className="text-2xl font-black text-neon-yellow">{stats.fullCombos}</div>
                         </div>
                         <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                             <div className="text-[10px] text-gray-500 uppercase font-bold">Clear Rate</div>
                             <div className="text-2xl font-black text-white">{stats.totalPlayCount > 0 ? ((stats.clearedSongs / stats.totalSongs) * 100).toFixed(0) : 0}%</div>
                         </div>
                     </div>

                </div>
            </div>
        </div>
    );
};

const StatCard = ({ icon, label, value, subLabel, color }: any) => (
    <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col justify-between hover:bg-white/10 transition-colors">
        <div className={`mb-2 ${color} opacity-80`}>{React.cloneElement(icon, { size: 20 })}</div>
        <div>
            <div className="text-2xl font-black text-white tracking-tight">{value}</div>
            <div className="flex justify-between items-end">
                <div className="text-[10px] font-bold text-gray-400 uppercase">{label}</div>
            </div>
        </div>
    </div>
);
