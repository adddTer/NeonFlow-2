
import React from 'react';
import { X, Disc, Music, Trophy, Play, Edit3, Clock, Zap, Star } from 'lucide-react';
import { SavedSong } from '../../types';
import { calculateAccuracy } from '../../utils/scoring';

interface SongDetailsModalProps {
    song: SavedSong;
    onClose: () => void;
    onStart: (song: SavedSong) => void;
    onEdit?: (song: SavedSong) => void;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const SongDetailsModal: React.FC<SongDetailsModalProps> = ({ song, onClose, onStart, onEdit }) => {
    const accuracy = song.bestResult 
        ? calculateAccuracy(song.bestResult.perfect, song.bestResult.good, song.notes.length)
        : 0;

    const themeColor = song.theme?.primaryColor || '#2dd4bf';
    const secondaryColor = song.theme?.secondaryColor || '#818cf8';

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 animate-fade-in">
            <div className="relative w-full max-w-5xl h-[85vh] md:h-auto md:aspect-[16/9] bg-[#050505] rounded-[32px] overflow-hidden shadow-2xl flex flex-col md:flex-row border border-white/10">
                
                {/* Background Blur Layer */}
                <div className="absolute inset-0 z-0">
                    {song.coverArt ? (
                        <div 
                            className="absolute inset-0 bg-cover bg-center opacity-30 blur-[100px] scale-125"
                            style={{ backgroundImage: `url(${song.coverArt})` }}
                        ></div>
                    ) : (
                        <div 
                            className="absolute inset-0 opacity-20 blur-[100px]"
                            style={{ background: `linear-gradient(45deg, ${secondaryColor}, ${themeColor})` }}
                        ></div>
                    )}
                    <div className="absolute inset-0 bg-black/40"></div>
                </div>

                {/* Close Button */}
                <button 
                    onClick={onClose} 
                    className="absolute top-6 right-6 z-50 p-2 rounded-full bg-black/20 hover:bg-white/10 text-white/70 hover:text-white transition-all backdrop-blur-md border border-white/5"
                >
                    <X className="w-6 h-6" />
                </button>

                {/* Left: Cover Art Section */}
                <div className="relative z-10 w-full md:w-[45%] h-64 md:h-full flex items-center justify-center p-8 bg-gradient-to-b from-transparent to-black/60 md:bg-none">
                    <div className="relative aspect-square w-full max-w-[320px] md:max-w-none md:h-[80%] rounded-2xl md:rounded-[32px] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 group">
                        {song.coverArt ? (
                            <img 
                                src={song.coverArt} 
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                                alt="Cover"
                            />
                        ) : (
                            <div 
                                className="w-full h-full flex items-center justify-center relative overflow-hidden bg-[#111]"
                                style={{ background: `linear-gradient(135deg, ${secondaryColor}22, #000)` }}
                            >
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Disc className="w-1/2 h-1/2 text-white/5 animate-spin-slow" />
                                </div>
                                <Music className="w-16 h-16 text-white/20 relative z-10" />
                            </div>
                        )}
                        {/* Shine effect */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                    </div>
                </div>

                {/* Right: Info Section */}
                <div className="relative z-10 flex-1 flex flex-col p-6 md:p-12 md:pl-0">
                    
                    {/* Header Info */}
                    <div className="mb-8">
                        <div className="flex flex-wrap gap-2 mb-4">
                            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/5 text-[10px] font-bold text-white uppercase tracking-wider backdrop-blur-md flex items-center gap-1.5">
                                <Zap className="w-3 h-3 text-yellow-400" />
                                {song.difficultyRating.toFixed(1)} 难度
                            </span>
                            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/5 text-[10px] font-bold text-white uppercase tracking-wider backdrop-blur-md">
                                {song.laneCount} 键
                            </span>
                        </div>
                        <h1 className="text-3xl md:text-5xl font-black text-white leading-tight mb-2 tracking-tight line-clamp-2 drop-shadow-lg">
                            {song.title}
                        </h1>
                        <p className="text-lg md:text-2xl text-white/60 font-medium truncate">
                            {song.artist}
                        </p>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-3 md:gap-4 mb-8">
                        <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-white/5 flex flex-col justify-between">
                            <Clock className="w-5 h-5 text-gray-500 mb-2" />
                            <div>
                                <div className="text-xl font-bold text-white">{formatTime(song.duration)}</div>
                                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">时长</div>
                            </div>
                        </div>
                        <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-white/5 flex flex-col justify-between">
                            <Zap className="w-5 h-5 text-gray-500 mb-2" />
                            <div>
                                <div className="text-xl font-bold text-white">{Math.round(song.structure.bpm)}</div>
                                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">BPM</div>
                            </div>
                        </div>
                        <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-white/5 flex flex-col justify-between">
                            <Music className="w-5 h-5 text-gray-500 mb-2" />
                            <div>
                                <div className="text-xl font-bold text-white">{song.notes.length}</div>
                                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">音符数</div>
                            </div>
                        </div>
                    </div>

                    {/* Best Result Card */}
                    <div className="flex-1 min-h-[120px] bg-gradient-to-r from-white/5 to-transparent rounded-2xl border border-white/10 p-6 flex items-center gap-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Trophy className="w-24 h-24 text-white" />
                        </div>
                        
                        {song.bestResult ? (
                            <>
                                <div className="relative">
                                    <div className="text-5xl md:text-6xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 drop-shadow-lg relative z-10">
                                        {song.bestResult.rank}
                                    </div>
                                    <div className="absolute inset-0 blur-xl opacity-50 bg-white/20"></div>
                                </div>
                                
                                <div className="w-px h-12 bg-white/10"></div>
                                
                                <div className="space-y-1">
                                    <div className="text-2xl md:text-3xl font-black text-white tracking-tighter">
                                        {song.bestResult.score.toLocaleString()}
                                    </div>
                                    <div className="flex gap-4 text-xs font-bold text-gray-400">
                                        <span className="flex items-center gap-1"><TargetIcon/> {accuracy}%</span>
                                        <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-500"/> {song.bestResult.maxCombo}x</span>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-2">
                                <Trophy className="w-8 h-8 opacity-20" />
                                <span className="text-xs font-bold uppercase tracking-widest">暂无游玩记录</span>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="mt-8 flex gap-4">
                        {onEdit && (
                            <button 
                                onClick={() => onEdit(song)} 
                                className="hidden md:flex px-6 py-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold transition-all items-center gap-2 group"
                            >
                                <Edit3 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                <span className="uppercase tracking-wider text-xs">编辑谱面</span>
                            </button>
                        )}
                        <button 
                            onClick={() => onStart(song)} 
                            className="flex-1 py-4 md:py-5 rounded-2xl bg-white text-black font-black text-lg uppercase tracking-widest hover:bg-neon-blue transition-all shadow-xl hover:shadow-cyan-400/50 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3 group relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full group-hover:animate-shine"></div>
                            <Play className="w-6 h-6 fill-current" />
                            开始游戏
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
};

const TargetIcon = () => (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
    </svg>
);
