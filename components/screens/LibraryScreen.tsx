
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Upload, Trash2, Download, CheckSquare, Music, Clock, Zap, Plus, Trophy, Disc, Info, X, Calendar, Loader2, AlertTriangle, Heart, SortAsc, ChevronDown, Type, Search, User, Play, ArrowRight, FileJson, Edit } from 'lucide-react';
import { SavedSong } from '../../types';
import { deleteSong, updateSongMetadata, exportSongAsZip, toggleFavorite } from '../../services/storageService';
import { calculateAccuracy, calculateRating } from '../../utils/scoring';
import { EditMetadataModal } from '../modals/EditMetadataModal';

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
    'DATE_NEW': { label: '最新添加', icon: <Calendar className="w-3 h-3" /> },
    'RATING_DESC': { label: '最高评价', icon: <Trophy className="w-3 h-3" /> },
    'DIFFICULTY_DESC': { label: '难度 (Hard)', icon: <Zap className="w-3 h-3" /> },
    'DIFFICULTY_ASC': { label: '难度 (Easy)', icon: <Zap className="w-3 h-3" /> },
    'TITLE_ASC': { label: 'A-Z', icon: <SortAsc className="w-3 h-3" /> },
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
  const [focusedSongId, setFocusedSongId] = useState<string | null>(null); // Visual Focus
  
  const [sortOption, setSortOption] = useState<SortOption>('DATE_NEW');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingMetadataSong, setEditingMetadataSong] = useState<SavedSong | null>(null);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const mapInputRef = useRef<HTMLInputElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
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

  // Set initial focus
  useEffect(() => {
      if (processedSongs.length > 0 && !focusedSongId) {
          setFocusedSongId(processedSongs[0].id);
      }
  }, [processedSongs]);

  // Keyboard Navigation
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (!focusedSongId || processedSongs.length === 0) return;
          const idx = processedSongs.findIndex(s => s.id === focusedSongId);
          if (idx === -1) return;

          if (e.key === 'ArrowDown') {
              e.preventDefault();
              const next = processedSongs[(idx + 1) % processedSongs.length];
              setFocusedSongId(next.id);
              document.getElementById(`song-item-${next.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              const prev = processedSongs[(idx - 1 + processedSongs.length) % processedSongs.length];
              setFocusedSongId(prev.id);
              document.getElementById(`song-item-${prev.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } else if (e.key === 'Enter') {
              const song = processedSongs[idx];
              onSelectSong(song);
          }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedSongId, processedSongs, onSelectSong]);

  const focusedSong = useMemo(() => 
      processedSongs.find(s => s.id === focusedSongId) || processedSongs[0], 
  [processedSongs, focusedSongId]);

  const getLevelDisplay = (rating: number) => {
      if (rating >= 20.0) return { val: 'Ω', color: '#ff0044', bg: 'bg-red-500' }; 
      if (rating < 1.0) return { val: 1, color: '#2dd4bf', bg: 'bg-teal-400' }; 
      
      const ranges = [
          { max: 4.0, bg: 'bg-teal-400', color: '#2dd4bf' },
          { max: 7.0, bg: 'bg-green-500', color: '#00fa9a' },
          { max: 10.0, bg: 'bg-yellow-500', color: '#ffd700' },
          { max: 14.0, bg: 'bg-orange-500', color: '#ff8c00' },
          { max: 18.0, bg: 'bg-red-500', color: '#ff0055' }
      ];

      for (const r of ranges) {
          if (rating < r.max) return { val: Math.floor(rating), color: r.color, bg: r.bg };
      }
      return { val: Math.floor(rating), color: '#818cf8', bg: 'bg-indigo-400' };
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

  const handleToggleFavorite = async (e: React.MouseEvent) => {
     e.stopPropagation();
     if (focusedSong) {
         await toggleFavorite(focusedSong.id);
         onRefreshLibrary();
     }
  };

  return (
    <div className="absolute inset-0 flex flex-col md:flex-row overflow-hidden bg-black select-none pt-20 md:pt-0">
      
      {/* 1. Dynamic Background Layer (Immersive) */}
      <div className="absolute inset-0 z-0">
          {/* Animated Cover Background */}
          {focusedSong && (
              <div 
                key={focusedSong.id} // Trigger animation on change
                className="absolute inset-0 bg-cover bg-center opacity-30 blur-[80px] scale-110 animate-fade-in transition-all duration-1000"
                style={{ backgroundImage: `url(${focusedSong.coverArt})` }} 
              />
          )}
          {/* Gradient Overlays for Readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/90 to-black/60"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/50"></div>
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
      </div>

      {/* 2. Left Stage: Focused Song Details */}
      <div className="relative z-10 w-full md:w-[45%] lg:w-[50%] shrink-0 flex flex-col justify-center items-center p-4 md:p-8 lg:p-12 pb-8 md:pb-12 border-t md:border-t-0 border-white/10 pointer-events-auto bg-black/90 md:bg-transparent backdrop-blur-2xl md:backdrop-blur-none order-2 md:order-1 mt-auto md:mt-10">
          {focusedSong ? (
             <div className="flex flex-col items-center gap-3 md:gap-8 animate-slide-up w-full max-w-xl text-center">
                 
                 {/* Visual Disc */}
                 <div className="hidden md:block w-40 h-40 lg:w-72 lg:h-72 rounded-full border border-white/20 shadow-[0_0_80px_rgba(0,0,0,0.6)] relative overflow-hidden group">
                     {/* Spinning Art */}
                     <div className="absolute inset-0 animate-[spin_12s_linear_infinite]" style={{ animationPlayState: 'running' }}>
                         <img src={focusedSong.coverArt} className="w-full h-full object-cover opacity-90" alt="Disc" />
                     </div>
                     {/* Center Hole */}
                     <div className="absolute inset-0 m-auto w-12 h-12 lg:w-16 lg:h-16 bg-[#0a0a0a] rounded-full border-4 border-black/80 flex items-center justify-center shadow-inner">
                         <div className="w-2 h-2 lg:w-3 lg:h-3 bg-neon-blue rounded-full shadow-[0_0_15px_#2dd4bf]"></div>
                     </div>
                     {/* Gloss */}
                     <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent pointer-events-none mix-blend-overlay"></div>
                 </div>

                 {/* Typography & Badges */}
                 <div className="flex flex-col items-center w-full">
                     <div className="hidden md:flex items-center justify-center gap-2 md:gap-3 opacity-90 mb-4 md:mb-6">
                         <div className="px-3 py-1 md:px-4 md:py-1.5 rounded-full border border-white/20 bg-white/10 text-[10px] font-black text-white uppercase tracking-[0.2em] backdrop-blur-md shadow-lg">
                             {focusedSong.playMode === 'ORBIT' ? 'ORBIT' : `${focusedSong.laneCount} KEY`}
                         </div>
                         <div className="px-3 py-1 md:px-4 md:py-1.5 rounded-full border border-white/20 bg-white/10 text-[10px] font-black text-white uppercase tracking-[0.2em] backdrop-blur-md flex items-center gap-1.5 md:gap-2 shadow-lg">
                             <Zap className="w-3 h-3 text-yellow-400" />
                             LV.{Math.floor(focusedSong.difficultyRating)}
                         </div>
                     </div>

                     <h1 className="text-xl md:text-4xl lg:text-5xl font-black text-white italic tracking-tight leading-tight drop-shadow-2xl line-clamp-1 md:line-clamp-2 px-2" style={{ textShadow: `0 0 40px ${(focusedSong.theme?.primaryColor === '#00f3ff' ? '#2dd4bf' : focusedSong.theme?.primaryColor) || '#2dd4bf'}66` }}>
                         {focusedSong.title}
                     </h1>
                     <p className="hidden md:flex text-lg md:text-xl font-bold text-gray-400 tracking-tight items-center justify-center gap-2 line-clamp-1 px-4 mt-2">
                         {focusedSong.artist}
                     </p>
                 </div>

                 {/* Best Score Mini-Display */}
                 {focusedSong.bestResult && (
                     <div className="hidden md:flex items-center gap-4 bg-black/40 px-5 py-3 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl">
                         <div className="text-4xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 drop-shadow-lg">
                             {focusedSong.bestResult.rank}
                         </div>
                         <div className="h-8 w-px bg-white/10"></div>
                         <div className="text-left">
                             <div className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-0.5">历史最佳</div>
                             <div className="text-xl font-mono font-black text-white">{focusedSong.bestResult.score.toLocaleString()}</div>
                         </div>
                     </div>
                 )}

                 {/* Actions */}
                 <div className="flex gap-2 md:gap-4 mt-1 md:mt-6 pointer-events-auto w-full md:w-auto px-2 md:px-0 justify-center">
                     <button 
                        onClick={() => onSelectSong(focusedSong)}
                        className="flex-1 md:flex-none group relative px-6 md:px-10 py-3 md:py-4 bg-white text-black font-black text-sm md:text-lg uppercase tracking-[0.15em] rounded-2xl overflow-hidden hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:shadow-[0_0_60px_rgba(0,243,255,0.4)] flex items-center justify-center gap-2 md:gap-3"
                     >
                         <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/80 to-transparent -translate-x-full group-hover:animate-shine"></div>
                         <Play className="w-5 h-5 md:w-6 md:h-6 fill-current" />
                         <span>开始游戏</span>
                     </button>
                     
                     <button 
                        onClick={() => setEditingMetadataSong(focusedSong)}
                        className="px-4 md:px-6 py-3 md:py-4 bg-black/40 hover:bg-white/10 border border-white/10 text-white font-bold text-xs md:text-sm uppercase tracking-wider rounded-2xl backdrop-blur-md transition-all flex items-center justify-center gap-2 hover:border-white/30"
                        title="编辑信息"
                     >
                         <Edit className="w-4 h-4 md:w-5 md:h-5" />
                         <span className="hidden lg:inline">编辑信息</span>
                     </button>
                     
                     <button 
                        onClick={() => onEditSong(focusedSong)}
                        className="px-4 md:px-6 py-3 md:py-4 bg-black/40 hover:bg-white/10 border border-white/10 text-white font-bold text-xs md:text-sm uppercase tracking-wider rounded-2xl backdrop-blur-md transition-all flex items-center justify-center gap-2 hover:border-white/30"
                        title="编辑谱面"
                     >
                         <Type className="w-4 h-4 md:w-5 md:h-5" />
                         <span className="hidden lg:inline">编辑谱面</span>
                     </button>

                     <button 
                        onClick={handleToggleFavorite}
                        className={`w-12 h-12 md:w-14 items-center justify-center bg-black/40 border border-white/10 rounded-2xl backdrop-blur-md transition-all hover:bg-white/10 hover:border-white/30 active:scale-95 flex ${focusedSong.isFavorite ? 'text-neon-pink' : 'text-gray-400'}`}
                        title={focusedSong.isFavorite ? "取消收藏" : "添加收藏"}
                     >
                         <Heart className={`w-5 h-5 md:w-6 md:h-6 ${focusedSong.isFavorite ? 'fill-current drop-shadow-[0_0_10px_rgba(255,0,128,0.5)]' : ''}`} />
                     </button>
                 </div>
             </div>
          ) : (
             <div className="text-gray-500 font-bold tracking-widest uppercase md:text-xl">请选择一首歌曲开始</div>
          )}
      </div>

      {/* 3. Right Stream: Scrollable Song List */}
      <div className="relative z-10 flex-1 overflow-hidden flex flex-col backdrop-blur-2xl bg-black/60 md:bg-black/70 border-l border-white/10 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] pt-2 md:pt-20 order-1 md:order-2">
          
          {/* Toolbar (Sticky) */}
          <div className="shrink-0 h-24 flex items-center px-6 md:px-8 gap-4 border-b border-white/10 bg-black/40 shadow-sm relative z-20">
              <div className="flex-1 bg-black/50 border border-white/10 rounded-2xl flex items-center px-4 h-12 group focus-within:border-neon-blue/50 focus-within:bg-black/80 transition-all shadow-inner">
                  <Search className="w-5 h-5 text-gray-500 group-focus-within:text-neon-blue transition-colors" />
                  <input 
                    type="text" 
                    placeholder="搜索图库..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent w-full h-full text-sm font-bold text-white outline-none ml-3 placeholder:text-gray-600"
                  />
              </div>
              
              <button 
                onClick={onOpenProfile}
                className="h-12 w-12 flex items-center justify-center bg-black/50 border border-white/10 rounded-2xl text-gray-400 hover:text-white hover:border-white/30 transition-all"
                title="玩家资料 / 统计数据"
              >
                  <User className="w-5 h-5" />
              </button>

              <button 
                onClick={() => setFilterFavorites(!filterFavorites)}
                className={`h-12 w-12 flex items-center justify-center rounded-2xl border transition-all ${filterFavorites ? 'bg-neon-pink/10 text-neon-pink border-neon-pink/30 shadow-[0_0_15px_rgba(255,0,128,0.2)]' : 'bg-black/50 border-white/10 text-gray-400 hover:text-white hover:border-white/30'}`}
                title="只显示收藏"
              >
                  <Heart className={`w-5 h-5 ${filterFavorites ? 'fill-current' : ''}`} />
              </button>

              <button 
                onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                className="h-12 w-12 flex items-center justify-center bg-black/50 border border-white/10 rounded-2xl text-gray-400 hover:text-white hover:border-white/30 transition-all relative"
                title="排序"
              >
                  {SORT_LABELS[sortOption].icon}
                  {isSortDropdownOpen && (
                      <div className="absolute top-[calc(100%+8px)] right-0 w-40 bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 py-2 backdrop-blur-xl">
                          {Object.entries(SORT_LABELS).map(([key, config]) => (
                              <div key={key} onClick={() => { setSortOption(key as SortOption); setIsSortDropdownOpen(false); }} className="px-5 py-3 hover:bg-white/10 text-xs font-bold text-left cursor-pointer text-gray-400 hover:text-white transition-colors">{config.label}</div>
                          ))}
                      </div>
                  )}
              </button>

              <button 
                onClick={() => setIsSelectionMode(!isSelectionMode)}
                className={`h-12 w-12 flex items-center justify-center rounded-2xl border transition-all ${isSelectionMode ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'bg-black/50 border-white/10 text-gray-400 hover:text-white hover:border-white/30'}`}
                title="批量管理"
              >
                  <CheckSquare className="w-5 h-5" />
              </button>

              <div className="h-8 w-px bg-white/10 mx-2"></div>

              <div className="flex flex-col md:flex-row gap-2">
                  <button 
                    onClick={() => mapInputRef.current?.click()}
                    className="h-12 px-4 bg-black/50 border border-white/10 text-gray-300 rounded-2xl text-xs font-bold hover:bg-white/10 hover:text-white hover:border-white/30 transition-all flex items-center justify-center gap-2"
                    title="导入谱面文件 (.nfz)"
                  >
                      <FileJson className="w-4 h-4" />
                      <span className="hidden xl:inline tracking-wider">导入谱面</span>
                  </button>

                  <button 
                    onClick={() => audioInputRef.current?.click()}
                    className="h-12 px-5 bg-neon-blue/10 border border-neon-blue/30 text-neon-blue rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-neon-blue hover:text-black hover:shadow-[0_0_30px_rgba(0,243,255,0.4)] transition-all flex items-center justify-center gap-2"
                    title="导入音频并生成"
                  >
                      <Plus className="w-5 h-5" />
                      <span className="hidden xl:inline">制作新谱</span>
                      <span className="xl:hidden">新谱</span>
                  </button>
              </div>
          </div>

          {/* Action Bar (Selection Mode) */}
          {isSelectionMode && (
              <div className="h-14 bg-[#111] border-b border-white/5 flex items-center px-8 gap-4 animate-slide-down relative z-10 shadow-lg">
                  <span className="text-sm font-bold text-gray-400 mr-auto tracking-wide">已选择 {selectedIds.size} 项</span>
                  <button onClick={selectAll} className="text-sm font-bold text-white hover:text-neon-blue transition-colors px-3">全选</button>
                  <button onClick={() => setShowDeleteConfirm(true)} disabled={selectedIds.size === 0} className="px-5 py-2 bg-red-500/20 text-red-500 rounded-xl text-sm font-black tracking-widest hover:bg-red-500 hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed">删除</button>
                  <button onClick={() => setShowExportModal(true)} disabled={selectedIds.size === 0} className="px-5 py-2 bg-neon-blue/20 text-neon-blue rounded-xl text-sm font-black tracking-widest hover:bg-neon-blue hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed">导出</button>
              </div>
          )}

          {/* The List */}
          <div ref={listRef} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3 pb-32 relative z-0">
              {processedSongs.map((song, i) => {
                  const isFocused = focusedSongId === song.id;
                  const levelInfo = getLevelDisplay(song.difficultyRating);
                  const isSelected = selectedIds.has(song.id);

                  return (
                      <div 
                          key={song.id}
                          id={`song-item-${song.id}`}
                          onClick={(e) => {
                              if (isSelectionMode) toggleSelection(song.id, e);
                              else setFocusedSongId(song.id);
                          }}
                          onDoubleClick={() => !isSelectionMode && onSelectSong(song)}
                          className={`group relative h-24 w-full flex items-center transition-all duration-300 cursor-pointer overflow-hidden rounded-2xl border
                              ${isFocused ? 'bg-white/10 translate-x-2 border-white/40 shadow-[0_10px_30px_rgba(0,0,0,0.5)]' : 'bg-black/60 border-white/5 hover:bg-white/5 hover:border-white/20 hover:-translate-y-0.5 shadow-md shadow-black/20'}
                              ${isSelected ? 'ring-2 ring-neon-blue bg-neon-blue/10 border-transparent shadow-[0_0_20px_rgba(0,243,255,0.2)]' : ''}
                          `}
                      >
                          {/* Thumb */}
                          <div className="w-24 h-full relative shrink-0 overflow-hidden">
                              {song.coverArt ? (
                                  <img src={song.coverArt} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" alt="thumb" />
                              ) : (
                                  <div className="w-full h-full bg-gradient-to-br from-[#111] to-black group-hover:from-gray-800 transition-colors"></div>
                              )}
                              {/* Overlay Gradient */}
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/20 to-black/80"></div>
                          </div>

                          {/* Info */}
                          <div className="flex-1 px-5 flex flex-col justify-center min-w-0 z-10">
                              <div className="flex items-center gap-3 mb-1">
                                  <h3 className={`text-lg font-black truncate tracking-wide ${isFocused ? 'text-white drop-shadow-md' : 'text-gray-200 group-hover:text-white transition-colors'}`}>{song.title}</h3>
                                  {song.isFavorite && <Heart className="w-4 h-4 text-neon-pink fill-current drop-shadow-[0_0_8px_rgba(255,0,128,0.6)]" />}
                              </div>
                              <p className="text-sm font-bold text-gray-500 uppercase truncate group-hover:text-gray-400 transition-colors tracking-wider">{song.artist}</p>
                          </div>

                          {/* Stats Right */}
                          <div className="px-6 flex items-center gap-6 shrink-0 z-10">
                              {/* Rank */}
                              {song.bestResult && (
                                  <div className={`text-2xl font-black italic transition-colors w-8 text-center ${isFocused ? 'text-white drop-shadow-lg' : 'text-gray-600 group-hover:text-gray-400'}`}>
                                      {song.bestResult.rank}
                                  </div>
                              )}
                              
                              {/* Diff Badge */}
                              <div className={`w-12 h-12 flex items-center justify-center text-base font-black italic text-black shadow-[0_5px_15px_rgba(0,0,0,0.5)] ${levelInfo.bg}`} style={{ clipPath: 'polygon(15% 0%, 100% 0, 85% 100%, 0% 100%)' }}>
                                  {levelInfo.val}
                              </div>
                          </div>

                          {/* Focus Glow Overlay */}
                          {isFocused && (
                              <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent pointer-events-none"></div>
                          )}
                          {/* Hover Glow line bottom */}
                          <div className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-transparent via-white/20 to-transparent w-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      </div>
                  )
              })}
              
              {/* Empty State */}
              {processedSongs.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-80 text-gray-500 gap-6 border-2 border-dashed border-white/10 rounded-3xl m-6 bg-black/40">
                      <Music className="w-16 h-16 opacity-30 text-gray-400" />
                      <div className="text-center">
                          <p className="text-lg font-black text-gray-400 tracking-widest uppercase mb-2">库中并无曲目</p>
                          <p className="text-sm font-bold text-gray-600 mb-6 tracking-wide">添加音频文件由 AI 生成谱面</p>
                          <button onClick={() => audioInputRef.current?.click()} className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-black tracking-widest uppercase transition-colors shadow-lg">开始制作谱面</button>
                      </div>
                  </div>
              )}
          </div>
      </div>

      {/* Hidden Inputs */}
      <input type="file" ref={audioInputRef} className="hidden" accept="audio/*,.flac" onChange={onImportAudioClick} />
      <input type="file" ref={mapInputRef} className="hidden" accept=".json,.nfz,application/json,application/zip,application/octet-stream" multiple onChange={onImportMapClick} />

      {/* Modals (Export/Delete) */}
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

      {editingMetadataSong && (
          <EditMetadataModal 
              song={editingMetadataSong} 
              onClose={() => setEditingMetadataSong(null)} 
              onSuccess={() => {
                  setEditingMetadataSong(null);
                  onRefreshLibrary();
              }} 
          />
      )}
    </div>
  );
};
