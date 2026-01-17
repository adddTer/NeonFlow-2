
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Upload, Trash2, Download, CheckSquare, Music, Clock, Zap, Plus, Trophy, Disc, Info, X, Calendar, Loader2, AlertTriangle, Heart, SortAsc, ChevronDown, Type, Search } from 'lucide-react';
import { SavedSong } from '../../types';
import { deleteSong, updateSongMetadata, exportSongAsZip, toggleFavorite } from '../../services/storageService';
import { calculateAccuracy, calculateRating } from '../../utils/scoring';

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

interface LibraryScreenProps {
  songs: SavedSong[];
  onImportAudioClick: (e: React.ChangeEvent<HTMLInputElement>) => void; 
  onImportMapClick: (e: React.ChangeEvent<HTMLInputElement>) => void; 
  onSelectSong: (song: SavedSong) => void;
  onEditSong: (song: SavedSong) => void; 
  onRefreshLibrary: () => void;
  isLoading: boolean;
  hasApiKey: boolean; 
  onOpenSettings: () => void;
  onOpenProfile: () => void;
}

type SortOption = 'DATE_NEW' | 'DIFFICULTY_DESC' | 'DIFFICULTY_ASC' | 'TITLE_ASC' | 'RATING_DESC';

const SORT_LABELS: Record<SortOption, { label: string, icon: React.ReactNode }> = {
    'DATE_NEW': { label: '最新添加', icon: <Calendar className="w-3.5 h-3.5" /> },
    'RATING_DESC': { label: '潜力值 (高)', icon: <Trophy className="w-3.5 h-3.5" /> },
    'DIFFICULTY_DESC': { label: '难度 (高)', icon: <Zap className="w-3.5 h-3.5" /> },
    'DIFFICULTY_ASC': { label: '难度 (低)', icon: <Zap className="w-3.5 h-3.5" /> },
    'TITLE_ASC': { label: '歌名 (A-Z)', icon: <SortAsc className="w-3.5 h-3.5" /> },
};

export const LibraryScreen: React.FC<LibraryScreenProps> = ({
  songs,
  onImportAudioClick,
  onImportMapClick,
  onSelectSong,
  onEditSong,
  onRefreshLibrary,
  isLoading,
  onOpenProfile
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', artist: '' });
  
  const [sortOption, setSortOption] = useState<SortOption>('DATE_NEW');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const mapInputRef = useRef<HTMLInputElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
              setIsSortDropdownOpen(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const processedSongs = useMemo(() => {
      let result = [...songs];
      if (filterFavorites) {
          result = result.filter(s => s.isFavorite);
      }
      if (searchQuery) {
          const q = searchQuery.toLowerCase();
          result = result.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
      }
      result.sort((a, b) => {
          switch (sortOption) {
              case 'DATE_NEW': return b.createdAt - a.createdAt;
              case 'TITLE_ASC': return a.title.localeCompare(b.title);
              case 'DIFFICULTY_DESC': return b.difficultyRating - a.difficultyRating;
              case 'DIFFICULTY_ASC': return a.difficultyRating - b.difficultyRating;
              case 'RATING_DESC': 
                  const valA = a.bestResult ? calculateRating(a.difficultyRating, a.bestResult.score) : 0;
                  const valB = b.bestResult ? calculateRating(b.difficultyRating, b.bestResult.score) : 0;
                  return valB - valA;
              default: return 0;
          }
      });
      return result;
  }, [songs, sortOption, filterFavorites, searchQuery]);

  const playerRating = useMemo(() => {
      const ratings = songs
          .map(s => {
              if (!s.bestResult) return 0;
              return calculateRating(s.difficultyRating, s.bestResult.score);
          })
          .sort((a, b) => b - a)
          .slice(0, 10);
      
      if (ratings.length === 0) return 0;
      const sum = ratings.reduce((a, b) => a + b, 0);
      return sum / Math.min(ratings.length, 10);
  }, [songs]);

  const getLevelDisplay = (rating: number) => {
      if (rating >= 20.0) {
          return { val: 'Ω', color: '#ff0044', isTitan: true, isOmega: true }; 
      }
      if (rating < 1.0) return { val: 1, color: '#00f3ff' }; 
      
      const ranges = [
          { max: 2.0, level: 2, color: '#00f3ff' },
          { max: 3.0, level: 3, color: '#00f3ff' },
          { max: 4.0, level: 4, color: '#00fa9a' },
          { max: 5.0, level: 5, color: '#00fa9a' },
          { max: 6.0, level: 6, color: '#ffd700' },
          { max: 7.0, level: 7, color: '#ffd700' },
          { max: 8.5, level: 8, color: '#ff8c00' },
          { max: 10.0, level: 9, color: '#ff4500' },
          { max: 11.5, level: 10, color: '#ff0055' }
      ];

      for (const r of ranges) {
          if (rating < r.max) return { val: r.level, color: r.color };
      }

      const val = Math.floor(rating);
      const color = val >= 14 ? '#bd00ff' : '#d946ef'; 
      return { val, color, isTitan: true };
  };

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === processedSongs.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(processedSongs.map(s => s.id)));
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    for (const id of selectedIds) await deleteSong(id);
    setSelectedIds(new Set());
    setIsSelectionMode(false);
    onRefreshLibrary();
  };

  const handleExportConfirm = async () => {
     setIsExporting(true);
     try {
         const songsToExport = songs.filter(s => selectedIds.has(s.id));
         for (const song of songsToExport) await exportSongAsZip(song, includeHistory);
         setShowExportModal(false);
         setSelectedIds(new Set());
         setIsSelectionMode(false);
     } catch (e) {
         console.error(e);
     } finally {
         setIsExporting(false);
     }
  };

  const handleToggleFavorite = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await toggleFavorite(id);
      onRefreshLibrary();
  };

  const startEdit = (song: SavedSong, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(song.id);
    setEditForm({ title: song.title, artist: song.artist });
  };

  const saveEdit = async () => {
    if (editingId) {
        await updateSongMetadata(editingId, editForm.title, editForm.artist);
        setEditingId(null);
        onRefreshLibrary();
    }
  };

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden bg-[#030304]">
      
      {/* Top Toolbar */}
      <div className="shrink-0 p-4 md:p-6 z-20 flex flex-col gap-4 bg-gradient-to-b from-[#030304] via-[#030304] to-transparent pointer-events-none">
         
         <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pointer-events-auto w-full">
             <div className="flex items-center gap-4">
                 {/* Rating Badge */}
                 <button 
                    onClick={onOpenProfile}
                    className="px-3 py-1 bg-white/5 border border-white/10 rounded-full flex items-center gap-2 hover:bg-white/20 hover:border-neon-purple/50 transition-all cursor-pointer group shadow-lg" 
                    title="查看个人概览 (Potential Rating)"
                 >
                     <Trophy className="w-3.5 h-3.5 text-neon-purple group-hover:scale-110 transition-transform" />
                     <span className="text-xs font-bold text-gray-400 group-hover:text-white transition-colors">RATING</span>
                     <span className="text-sm font-black text-neon-purple font-mono">{playerRating.toFixed(2)}</span>
                 </button>
             </div>

             <div className="flex items-center gap-2 w-full md:w-auto">
                 <div className="relative flex-1 md:w-48 group">
                     <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-white transition-colors" />
                     <input 
                        type="text" 
                        placeholder="搜索..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-9 pr-4 text-xs font-bold text-white focus:bg-white/10 focus:border-white/30 outline-none transition-all placeholder:text-gray-600"
                     />
                 </div>
                 
                 <button 
                    onClick={() => audioInputRef.current?.click()}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold uppercase tracking-wider text-xs transition-all shadow-lg bg-white text-black hover:bg-neon-blue hover:shadow-neon-blue/20 shrink-0`}
                 >
                     {isLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4" />}
                     <span className="hidden md:inline">新乐谱</span>
                     <span className="md:hidden">Add</span>
                 </button>
             </div>
         </div>

         <div className="flex flex-wrap items-center justify-between gap-3 pointer-events-auto w-full">
             <div className="flex items-center gap-2">
                 <div className="relative" ref={sortRef}>
                     <button 
                        onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                        className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded-xl text-xs font-bold text-gray-300 transition-all min-w-[140px] justify-between"
                     >
                         <div className="flex items-center gap-2">
                             {SORT_LABELS[sortOption].icon}
                             <span>{SORT_LABELS[sortOption].label}</span>
                         </div>
                         <ChevronDown className={`w-3 h-3 transition-transform ${isSortDropdownOpen ? 'rotate-180' : ''}`} />
                     </button>
                     {isSortDropdownOpen && (
                         <div className="absolute top-full left-0 mt-2 w-48 bg-[#0f172a] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in">
                             {Object.entries(SORT_LABELS).map(([key, config]) => (
                                 <button
                                     key={key}
                                     onClick={() => { setSortOption(key as SortOption); setIsSortDropdownOpen(false); }}
                                     className={`w-full flex items-center gap-3 px-4 py-3 text-xs font-bold transition-colors text-left ${sortOption === key ? 'bg-neon-blue/10 text-neon-blue' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                                 >
                                     {config.icon} {config.label}
                                     {sortOption === key && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-neon-blue"></div>}
                                 </button>
                             ))}
                         </div>
                     )}
                 </div>

                 <button 
                    onClick={() => setFilterFavorites(!filterFavorites)}
                    className={`p-2 rounded-xl border transition-all flex items-center gap-2 ${filterFavorites ? 'bg-neon-pink/20 border-neon-pink text-neon-pink' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}
                    title="仅显示收藏"
                 >
                     <Heart className={`w-4 h-4 ${filterFavorites ? 'fill-current' : ''}`} />
                     {filterFavorites && <span className="text-xs font-bold hidden md:inline">已收藏</span>}
                 </button>
             </div>

             <div className="flex items-center gap-2">
                 {isSelectionMode ? (
                     <div className="flex items-center bg-black/60 backdrop-blur-md rounded-xl p-1 border border-white/10 animate-fade-in">
                        <button onClick={selectAll} className="px-3 py-1.5 text-xs font-bold text-gray-300 hover:text-white rounded-lg hover:bg-white/10 transition">
                             {selectedIds.size === processedSongs.length ? "取消全选" : "全选"}
                        </button>
                        <div className="w-px h-3 bg-white/10 mx-1"></div>
                        <button onClick={() => setShowDeleteConfirm(true)} disabled={selectedIds.size === 0} className="px-3 py-1.5 text-xs font-bold text-red-400 hover:text-red-300 rounded-lg hover:bg-red-500/10 transition disabled:opacity-30">
                            删除 ({selectedIds.size})
                        </button>
                        <button onClick={() => setShowExportModal(true)} disabled={selectedIds.size === 0} className="px-3 py-1.5 text-xs font-bold text-neon-blue hover:text-white rounded-lg hover:bg-neon-blue/10 transition disabled:opacity-30">
                            导出
                        </button>
                        <div className="w-px h-3 bg-white/10 mx-1"></div>
                        <button onClick={() => setIsSelectionMode(false)} className="px-3 py-1.5 text-xs font-bold text-white bg-white/10 rounded-lg">完成</button>
                     </div>
                 ) : (
                     <div className="flex items-center gap-2">
                         <button onClick={() => setIsSelectionMode(true)} className="p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition border border-white/5 hover:border-white/20" title="批量管理">
                            <CheckSquare className="w-4 h-4" />
                         </button>
                         <button onClick={() => mapInputRef.current?.click()} className="p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition border border-white/5 hover:border-white/20" title="导入文件">
                            <Upload className="w-4 h-4" />
                         </button>
                     </div>
                 )}
             </div>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-6 pb-24">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {processedSongs.map(song => {
                  const levelInfo = (song as any)._displayLevel || getLevelDisplay(song.difficultyRating);
                  const secondaryColor = song.theme?.secondaryColor || '#222';
                  
                  return (
                      <div 
                         key={song.id}
                         onClick={(e) => isSelectionMode ? toggleSelection(song.id, e) : onSelectSong(song)}
                         className={`group relative aspect-[4/3] rounded-3xl overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl cursor-pointer bg-[#0a0a0a]
                            ${selectedIds.has(song.id) ? 'ring-2 ring-neon-blue/50' : ''}
                         `}
                         // Fix: Use webkit-mask-image to force clipping of transformed child
                         style={{ 
                             isolation: 'isolate', 
                             WebkitMaskImage: '-webkit-radial-gradient(white, black)'
                         }}
                      >
                         {/* Border Overlay: sits on top, does not transform, covers anti-aliased edges */}
                         <div className={`absolute inset-0 rounded-3xl border pointer-events-none z-20 transition-colors duration-300
                             ${selectedIds.has(song.id) ? 'border-neon-blue' : 'border-white/5 group-hover:border-white/20'}
                         `}></div>

                         <div className="absolute inset-0 z-0 bg-black">
                             {song.coverArt ? (
                                <>
                                    <img 
                                        src={song.coverArt} 
                                        alt="cover" 
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                        style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none"></div>
                                </>
                             ) : (
                                <div 
                                    className="w-full h-full relative overflow-hidden"
                                    style={{ background: `linear-gradient(135deg, ${secondaryColor}, #000)` }}
                                >
                                    <div className="absolute inset-0 flex items-center justify-center opacity-30">
                                         <div className="relative">
                                             <Disc className="w-24 h-24 text-white animate-spin-slow" style={{ animationDuration: '8s' }} />
                                             <Music className="w-8 h-8 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-lg" />
                                         </div>
                                    </div>
                                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80 pointer-events-none"></div>
                                </div>
                             )}
                         </div>
                         
                         <div className="absolute inset-0 z-10 pointer-events-none p-5 flex flex-col justify-between">
                             <div className="flex justify-between items-start">
                                 {/* Left: Level Badge & Buttons */}
                                 <div className="flex items-start gap-2">
                                     <div className="flex flex-col items-center">
                                         <div 
                                            className="w-12 h-12 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/10 shadow-lg bg-black/40"
                                            style={{ borderColor: levelInfo.color }}
                                         >
                                             <span className="font-black italic text-xl text-white drop-shadow-md" style={{ color: levelInfo.color }}>{levelInfo.val}</span>
                                         </div>
                                     </div>

                                     {!isSelectionMode && (
                                         <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 pointer-events-auto mt-1">
                                             <button 
                                                onClick={(e) => startEdit(song, e)}
                                                className="p-2 bg-black/40 backdrop-blur-md rounded-lg text-white hover:bg-white/20 border border-white/5"
                                                title="重命名"
                                             >
                                                 <Type className="w-4 h-4" />
                                             </button>
                                             <button 
                                                onClick={(e) => handleToggleFavorite(song.id, e)}
                                                className={`p-2 backdrop-blur-md rounded-lg border transition-all ${song.isFavorite ? 'bg-neon-pink/20 border-neon-pink text-neon-pink' : 'bg-black/40 border-white/5 text-white hover:bg-white/20'}`}
                                             >
                                                 <Heart className={`w-4 h-4 ${song.isFavorite ? 'fill-current' : ''}`} />
                                             </button>
                                         </div>
                                     )}
                                 </div>

                                 {/* Right: Best Result (Isolated) */}
                                 {!isSelectionMode && song.bestResult && (
                                     <div className="pointer-events-auto">
                                         <div className={`px-2 py-1 rounded-lg backdrop-blur-md border border-white/10 bg-black/60 flex flex-col items-center shadow-lg ${song.bestResult.rank === 'S+' || song.bestResult.rank === 'SS' || song.bestResult.rank === 'OPUS' ? 'border-neon-blue/30' : ''}`}>
                                             <span className={`text-xl font-black italic drop-shadow-md ${song.bestResult.rank === 'φ' ? 'text-cyan-200' : 'text-white'}`}>
                                                 {song.bestResult.rank}
                                             </span>
                                             <span className="text-[8px] font-bold text-gray-400">
                                                 {Math.floor(song.bestResult.score / 10000)}W
                                             </span>
                                         </div>
                                     </div>
                                 )}
                             </div>

                             <div>
                                 <h3 className="text-xl font-black text-white leading-tight drop-shadow-md line-clamp-2 mb-1">{song.title}</h3>
                                 <p className="text-xs font-bold text-gray-400 uppercase tracking-wider truncate">{song.artist}</p>
                             </div>
                         </div>
                      </div>
                  );
              })}
          </div>
      </div>

      {/* Hidden File Inputs */}
      <input type="file" ref={audioInputRef} className="hidden" accept="audio/*,.flac" onChange={onImportAudioClick} />
      <input type="file" ref={mapInputRef} className="hidden" accept=".json,.nfz" multiple onChange={onImportMapClick} />

      {/* Modals */}
      {showExportModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-[#0f172a] border border-white/20 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative">
                  <h3 className="text-xl font-black text-white mb-4 flex items-center gap-2"><Download className="w-5 h-5 text-neon-blue"/> 导出乐谱</h3>
                  <div className="mb-6">
                      <p className="text-sm text-gray-300 mb-4">即将导出 {selectedIds.size} 首乐谱。</p>
                      <label className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition">
                          <input type="checkbox" checked={includeHistory} onChange={e => setIncludeHistory(e.target.checked)} className="w-4 h-4 accent-neon-blue" />
                          <span className="text-sm font-bold text-gray-300">包含历史最佳成绩</span>
                      </label>
                  </div>
                  <div className="flex gap-3">
                      <button onClick={() => setShowExportModal(false)} className="flex-1 py-3 bg-white/10 rounded-xl font-bold hover:bg-white/20 transition-colors text-sm">取消</button>
                      <button onClick={handleExportConfirm} disabled={isExporting} className="flex-1 py-3 bg-neon-blue rounded-xl font-bold hover:bg-white hover:text-black text-black shadow-lg transition-colors text-sm flex items-center justify-center gap-2">
                          {isExporting && <Loader2 className="w-4 h-4 animate-spin"/>}
                          确认导出
                      </button>
                  </div>
              </div>
          </div>
      )}

      {showDeleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-[#0f172a] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative">
                  <h3 className="text-xl font-black text-red-400 mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5"/> 确认删除</h3>
                  <p className="text-sm text-gray-300 mb-6">
                      确定要删除选中的 {selectedIds.size} 首乐谱吗？<br/>
                      <span className="text-xs text-gray-500 mt-2 block">此操作无法撤销。</span>
                  </p>
                  <div className="flex gap-3">
                      <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 bg-white/10 rounded-xl font-bold hover:bg-white/20 transition-colors text-sm">取消</button>
                      <button onClick={confirmDelete} className="flex-1 py-3 bg-red-500 rounded-xl font-bold hover:bg-red-600 text-white shadow-lg transition-colors text-sm">删除</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
