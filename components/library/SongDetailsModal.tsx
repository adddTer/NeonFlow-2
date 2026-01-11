
import React from 'react';
import { X, Disc, Music, Trophy, Play, Edit3 } from 'lucide-react';
import { SavedSong } from '../../types';

interface SongDetailsModalProps {
    song: SavedSong;
    onClose: () => void;
    onStart: (song: SavedSong) => void;
    onEdit?: (song: SavedSong) => void; // New prop
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const SongDetailsModal: React.FC<SongDetailsModalProps> = ({ song, onClose, onStart, onEdit }) => {
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
              <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]">
                   {/* Gradient Header / Cover Art */}
                   <div className="absolute top-0 left-0 right-0 h-48 z-0 overflow-hidden bg-[#0a0a0a]">
                       {song.coverArt ? (
                           <>
                             <img src={song.coverArt} className="w-full h-full object-cover opacity-80 blur-sm scale-110" />
                             <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0f172a]"></div>
                           </>
                       ) : (
                           <div 
                                className="w-full h-full relative overflow-hidden"
                                style={{ background: `linear-gradient(135deg, ${song.theme?.secondaryColor || '#333'}, #0f172a)` }}
                           >
                                <div className="absolute inset-0 flex items-center justify-center opacity-30">
                                     <div className="relative">
                                         <Disc className="w-32 h-32 text-white animate-spin-slow" style={{ animationDuration: '8s' }} />
                                         <Music className="w-10 h-10 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-lg" />
                                     </div>
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0f172a]"></div>
                           </div>
                       )}
                   </div>
                   
                   <button 
                        onClick={onClose} 
                        className="absolute top-4 right-4 text-white/70 hover:text-white z-50 bg-black/30 p-2 rounded-full backdrop-blur-md hover:bg-black/50 transition-colors"
                   >
                      <X className="w-5 h-5" />
                   </button>

                   <div className="p-8 pb-4 relative z-10 pt-16">
                       <h2 className="text-3xl md:text-5xl font-black text-white mb-2 leading-tight tracking-tight shadow-sm drop-shadow-lg">{song.title}</h2>
                       <p className="text-lg md:text-xl text-white/80 font-medium mb-6">{song.artist} {song.album ? `— ${song.album}` : ''}</p>
                       
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                           <div className="bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/5">
                               <div className="text-[10px] text-gray-400 uppercase tracking-widest">时长</div>
                               <div className="text-white font-bold">{formatTime(song.duration)}</div>
                           </div>
                           <div className="bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/5">
                               <div className="text-[10px] text-gray-400 uppercase tracking-widest">BPM</div>
                               <div className="text-white font-bold">{Math.round(song.structure.bpm)}</div>
                           </div>
                           <div className="bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/5">
                               <div className="text-[10px] text-gray-400 uppercase tracking-widest">音符数</div>
                               <div className="text-white font-bold">{song.notes.length}</div>
                           </div>
                           <div className="bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/5">
                               <div className="text-[10px] text-gray-400 uppercase tracking-widest">模式</div>
                               <div className="text-white font-bold">{song.laneCount}K</div>
                           </div>
                       </div>
                   </div>

                   <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar relative z-10 bg-[#0f172a]">
                       <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                           <Trophy className="w-4 h-4 text-yellow-500" /> 最佳战绩
                       </h3>
                       
                       {song.bestResult ? (
                           <div className="bg-white/5 rounded-2xl border border-white/10 p-6 flex flex-col md:flex-row items-center gap-6">
                               <div className="flex-1 text-center md:text-left">
                                   <div className="text-5xl font-black italic text-transparent bg-clip-text bg-gradient-to-br from-neon-blue to-white drop-shadow-lg">
                                       {song.bestResult.rank}
                                   </div>
                                   <div className="text-2xl font-bold text-white mt-1">{song.bestResult.score.toLocaleString()}</div>
                               </div>
                               
                               <div className="w-px h-16 bg-white/10 hidden md:block"></div>

                               <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                                   <div className="flex justify-between">
                                       <span className="text-gray-500">Perf</span>
                                       <span className="font-mono text-neon-purple font-bold">{song.bestResult.perfect}</span>
                                   </div>
                                   <div className="flex justify-between">
                                       <span className="text-gray-500">Good</span>
                                       <span className="font-mono text-neon-blue font-bold">{song.bestResult.good}</span>
                                   </div>
                                   <div className="flex justify-between">
                                       <span className="text-gray-500">Miss</span>
                                       <span className="font-mono text-gray-400 font-bold">{song.bestResult.miss}</span>
                                   </div>
                                   <div className="flex justify-between">
                                       <span className="text-gray-500">Combo</span>
                                       <span className="font-mono text-neon-yellow font-bold">{song.bestResult.maxCombo}</span>
                                   </div>
                               </div>
                           </div>
                       ) : (
                           <div className="h-24 flex items-center justify-center text-gray-600 bg-white/5 rounded-2xl border border-dashed border-white/5">
                               暂无记录
                           </div>
                       )}
                   </div>
                   
                   <div className="p-6 border-t border-white/5 bg-[#0f172a] z-20 flex gap-4">
                       {onEdit && (
                           <button 
                                onClick={() => onEdit(song)} 
                                className="flex-1 py-4 rounded-xl bg-white/5 text-white font-bold uppercase tracking-widest hover:bg-white/10 transition-all border border-white/10 flex items-center justify-center gap-2"
                           >
                               <Edit3 className="w-4 h-4" />
                               编辑谱面
                           </button>
                       )}
                       <button 
                            onClick={() => onStart(song)} 
                            className="flex-[2] group relative py-4 rounded-xl overflow-hidden shadow-lg hover:shadow-neon-blue/20 transition-all"
                       >
                           <div className="absolute inset-0 bg-white group-hover:bg-neon-blue transition-colors"></div>
                           <div className="relative z-10 flex items-center justify-center gap-2 text-black font-black uppercase tracking-widest">
                               <Play className="w-5 h-5 fill-current" />
                               开始游戏
                           </div>
                       </button>
                   </div>
              </div>
          </div>
    );
};
