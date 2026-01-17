
import React from 'react';
import { Disc, Music, Trophy, Play, Edit3, Clock, Zap, Star, ArrowLeft } from 'lucide-react';
import { SavedSong } from '../../types';
import { calculateAccuracy } from '../../utils/scoring';

interface SongDetailsScreenProps {
    song: SavedSong;
    onBack: () => void;
    onStart: (song: SavedSong) => void;
    onEdit?: (song: SavedSong) => void;
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const SongDetailsScreen: React.FC<SongDetailsScreenProps> = ({ song, onBack, onStart, onEdit }) => {
    const accuracy = song.bestResult 
        ? calculateAccuracy(song.bestResult.perfect, song.bestResult.good, song.notes.length)
        : 0;

    const themeColor = song.theme?.primaryColor || '#00f3ff';
    const secondaryColor = song.theme?.secondaryColor || '#bd00ff';

    return (
        <div className="w-full h-full bg-[#050505] relative overflow-hidden flex flex-col animate-fade-in">
            
            {/* Background Blur Layer */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                {song.coverArt ? (
                    <div 
                        className="absolute inset-0 bg-cover bg-center opacity-30 blur-[80px] scale-110"
                        style={{ backgroundImage: `url(${song.coverArt})` }}
                    ></div>
                ) : (
                    <div 
                        className="absolute inset-0 opacity-20 blur-[100px]"
                        style={{ background: `linear-gradient(45deg, ${secondaryColor}, ${themeColor})` }}
                    ></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-[#030304]"></div>
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
            </div>

            {/* Navigation Header */}
            <div className="relative z-50 p-6 flex items-center justify-between shrink-0">
                <button 
                    onClick={onBack} 
                    className="group flex items-center gap-3 px-4 py-2 rounded-full bg-black/20 hover:bg-white/10 text-white/70 hover:text-white transition-all backdrop-blur-md border border-white/5 active:scale-95"
                >
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-xs font-bold uppercase tracking-widest hidden md:inline">Back to Library</span>
                </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 relative z-10 flex flex-col md:flex-row items-center justify-center p-6 md:p-12 gap-8 md:gap-16 overflow-y-auto custom-scrollbar">
                
                {/* Left: Cover Art (Floating Card) */}
                <div className="w-full max-w-[320px] md:max-w-md aspect-square relative group shrink-0">
                    <div className="absolute inset-4 bg-black/50 blur-2xl rounded-full scale-90 translate-y-4 opacity-60"></div>
                    
                    <div className="relative w-full h-full rounded-[32px] overflow-hidden shadow-2xl border border-white/10 bg-[#111]">
                        {song.coverArt ? (
                            <img 
                                src={song.coverArt} 
                                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" 
                                alt="Cover"
                            />
                        ) : (
                            <div 
                                className="w-full h-full flex items-center justify-center relative overflow-hidden"
                                style={{ background: `linear-gradient(135deg, ${secondaryColor}22, #000)` }}
                            >
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Disc className="w-2/3 h-2/3 text-white/5 animate-spin-slow" />
                                </div>
                                <Music className="w-20 h-20 text-white/20 relative z-10" />
                            </div>
                        )}
                        {/* Shine effect */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                    </div>
                </div>

                {/* Right: Info Section */}
                <div className="w-full max-w-xl flex flex-col">
                    
                    {/* Header Info */}
                    <div className="mb-8 text-center md:text-left">
                        <div className="flex flex-wrap gap-2 mb-4 justify-center md:justify-start">
                            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/5 text-[10px] font-bold text-white uppercase tracking-wider backdrop-blur-md flex items-center gap-1.5">
                                <Zap className="w-3 h-3 text-yellow-400" />
                                {song.difficultyRating.toFixed(1)} Difficulty
                            </span>
                            <span className="px-3 py-1 rounded-full bg-white/10 border border-white/5 text-[10px] font-bold text-white uppercase tracking-wider backdrop-blur-md">
                                {song.laneCount} KEY
                            </span>
                        </div>
                        <h1 className="text-3xl md:text-6xl font-black text-white leading-tight mb-2 tracking-tighter drop-shadow-2xl line-clamp-2">
                            {song.title}
                        </h1>
                        <p className="text-lg md:text-2xl text-white/60 font-medium truncate">
                            {song.artist}
                        </p>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-3 md:gap-4 mb-8">
                        <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-white/5 flex flex-col justify-between hover:bg-white/5 transition-colors">
                            <Clock className="w-5 h-5 text-gray-500 mb-2" />
                            <div>
                                <div className="text-xl font-bold text-white">{formatTime(song.duration)}</div>
                                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Length</div>
                            </div>
                        </div>
                        <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-white/5 flex flex-col justify-between hover:bg-white/5 transition-colors">
                            <Zap className="w-5 h-5 text-gray-500 mb-2" />
                            <div>
                                <div className="text-xl font-bold text-white">{Math.round(song.structure.bpm)}</div>
                                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">BPM</div>
                            </div>
                        </div>
                        <div className="bg-black/30 backdrop-blur-md rounded-2xl p-4 border border-white/5 flex flex-col justify-between hover:bg-white/5 transition-colors">
                            <Music className="w-5 h-5 text-gray-500 mb-2" />
                            <div>
                                <div className="text-xl font-bold text-white">{song.notes.length}</div>
                                <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Notes</div>
                            </div>
                        </div>
                    </div>

                    {/* Best Result Card */}
                    <div className="w-full bg-gradient-to-r from-white/5 to-transparent rounded-2xl border border-white/10 p-6 flex items-center gap-6 relative overflow-hidden group hover:border-white/20 transition-all">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <Trophy className="w-32 h-32 text-white" />
                        </div>
                        
                        {song.bestResult ? (
                            <>
                                <div className="relative shrink-0">
                                    <div className="text-6xl md:text-7xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 drop-shadow-lg relative z-10">
                                        {song.bestResult.rank}
                                    </div>
                                    <div className="absolute inset-0 blur-xl opacity-50 bg-white/20"></div>
                                </div>
                                
                                <div className="w-px h-16 bg-white/10"></div>
                                
                                <div className="space-y-1 z-10">
                                    <div className="text-3xl md:text-4xl font-black text-white tracking-tighter">
                                        {song.bestResult.score.toLocaleString()}
                                    </div>
                                    <div className="flex flex-wrap gap-4 text-xs font-bold text-gray-400">
                                        <span className="flex items-center gap-1"><TargetIcon/> {accuracy}% ACC</span>
                                        <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-500"/> {song.bestResult.maxCombo}x COMBO</span>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-2 py-4">
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
                                className="hidden md:flex px-8 py-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold transition-all items-center gap-2 group hover:scale-[1.02]"
                            >
                                <Edit3 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                <span className="uppercase tracking-wider text-xs">Edit</span>
                            </button>
                        )}
                        <button 
                            onClick={() => onStart(song)} 
                            className="flex-1 py-5 rounded-2xl bg-white text-black font-black text-xl uppercase tracking-[0.2em] hover:bg-neon-blue transition-all shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:shadow-[0_0_50px_rgba(0,243,255,0.6)] hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3 group relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full group-hover:animate-shine"></div>
                            <Play className="w-6 h-6 fill-current" />
                            Start Engine
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
