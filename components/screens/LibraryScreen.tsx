
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Upload, Play, Trash2, Edit2, Download, CheckSquare, Square, Music, Clock, Zap, Plus, FileJson, Trophy, Layers, Lock, Disc, Info, X, Calendar, Activity, Loader2, AlertTriangle, PlayCircle, MoreHorizontal, Heart, ArrowUpDown, Search, SortAsc, ChevronDown, Filter, Edit3, Type } from 'lucide-react';
import { SavedSong } from '../../types';
import { deleteSong, updateSongMetadata, exportSongAsZip, toggleFavorite } from '../../services/storageService';
import { calculateAccuracy, calculateRating } from '../../utils/scoring';
import { SongDetailsModal } from '../library/SongDetailsModal';

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
  hasApiKey,
  onOpenSettings,
  onOpenProfile
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', artist: '' });
  
  // Sort & Filter
  const [sortOption, setSortOption] = useState<SortOption>('DATE_NEW');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Details Modal State
  const [showDetailsId, setShowDetailsId] = useState<string | null>(null);
  
  // Export Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [includeHistory, setIncludeHistory] = useState(true);

  // Delete Confirm Modal State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const audioInputRef = useRef<HTMLInputElement>(null);
  const mapInputRef = useRef<HTMLInputElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

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

  // --- Derived State ---
  
  const processedSongs = useMemo(() => {
      let result = [...songs];
      
      // Filter
      if (filterFavorites) {
          result = result.filter(s => s.isFavorite);
      }
      if (searchQuery) {
          const q = searchQuery.toLowerCase();
          result = result.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
      }

      // Sort
      result.sort((a, b) => {
          switch (sortOption) {
              case 'DATE_NEW': return b.createdAt - a.createdAt;
              case 'TITLE_ASC': return a.title.localeCompare(b.title);
              case 'DIFFICULTY_DESC': return b.difficultyRating - a.difficultyRating;
              case 'DIFFICULTY_ASC': return a.difficultyRating - b.difficultyRating;
              case 'RATING_DESC': 
                  const accA = a.bestResult ? (a.bestResult.perfect + a.bestResult.good) / (a.notes.length || 1) : 0;
                  const valA = calculateRating(a.difficultyRating, accA);
                  
                  const accB = b.bestResult ? (b.bestResult.perfect + b.bestResult.good) / (b.notes.length || 1) : 0;
                  const valB = calculateRating(b.difficultyRating, accB);
                  return valB - valA;
              default: return 0;
          }
      });
      return result;
  }, [songs, sortOption, filterFavorites, searchQuery]);

  const playerRating = useMemo(() => {
      // Calculate Player Potential (Average of Top 10 Best Rated Plays)
      const ratings = songs
          .map(s => {
              if (!s.bestResult) return 0;
              const acc = (s.bestResult.perfect + s.bestResult.good) / (s.notes.length || 1);
              return calculateRating(s.difficultyRating, acc);
          })
          .sort((a, b) => b - a)
          .slice(0, 10);
      
      if (ratings.length === 0) return 0;
      const sum = ratings.reduce((a, b) => a + b, 0);
      return sum / Math.min(ratings.length, 10); // Average of what we have (up to 10)
  }, [songs]);

  const getLevelDisplay = (rating: number) => {
      // Omega Level (20+)
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

      // Titan Levels (11-19)
      const val = Math.floor(rating);
      const color = val >= 14 ? '#bd00ff' : '#d946ef'; 
      return { val, color, isTitan: true };
  };

  const toggleSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (selectedIds.size === processedSongs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(processedSongs.map(s => s.id)));
    }
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    for (const id of selectedIds) {
        await deleteSong(id);
    }
    setSelectedIds(new Set());
    setIsSelectionMode(false);
    onRefreshLibrary();
  };

  const openExportModal = () => {
      setShowExportModal(true);
  };

  const handleExportConfirm = async () => {
     setIsExporting(true);
     try {
         const songsToExport = songs.filter(s => selectedIds.has(s.id));
         for (const song of songsToExport) {
             await exportSongAsZip(song, includeHistory);
         }
         setShowExportModal(false);
         setSelectedIds(new Set());
         setIsSelectionMode(false);
     } catch (e) {
         console.error(e);
         console.error("Export failed");
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

  const handleCreateClick = () => {
      audioInputRef.current?.click();
  };
  
  const detailSong = songs.find(s => s.id === showDetailsId);

  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden bg-[#030304]">
      
      {/* Top Toolbar */}
      <div className="shrink-0 p-4 md:p-6 z-20 flex flex-col gap-4 bg-gradient-to-b from-[#030304] via-[#030304] to-transparent pointer-events-none">
         
         {/* Row 1: Title & Player Stats */}
         <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pointer-events-auto w-full">
             <div className="flex items-center gap-4">
                 <div className="flex items-center gap-3">
                    <Music className="w-5 h-5 text-neon-blue" />
                    <h2 className="text-xl font-black text-white tracking-widest uppercase">曲库</h2>
                 </div>
                 
                 {/* Player Rating Badge */}
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
                 {/* Search Bar */}
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
                 
                 {/* Create Button */}
                 <button 
                    onClick={handleCreateClick}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold uppercase tracking-wider text-xs transition-all shadow-lg bg-white text-black hover:bg-neon-blue hover:shadow-neon-blue/20 shrink-0`}
                 >
                     {isLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4" />}
                     <span className="hidden md:inline">新乐谱</span>
                     <span className="md:hidden">Add</span>
                 </button>
             </div>
         </div>

         {/* Row 2: Controls & Filters */}
         <div className="flex flex-wrap items-center justify-between gap-3 pointer-events-auto w-full">
             
             {/* Filter & Sort Group */}
             <div className="flex items-center gap-2">
                 
                 {/* Custom Sort Dropdown */}
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
                                     onClick={() => {
                                         setSortOption(key as SortOption);
                                         setIsSortDropdownOpen(false);
                                     }}
                                     className={`w-full flex items-center gap-3 px-4 py-3 text-xs font-bold transition-colors text-left
                                         ${sortOption === key ? 'bg-neon-blue/10 text-neon-blue' : 'text-gray-400 hover:bg-white/5 hover:text-white'}
                                     `}
                                 >
                                     {config.icon}
                                     {config.label}
                                     {sortOption === key && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-neon-blue"></div>}
                                 </button>
                             ))}
                         </div>
                     )}
                 </div>

                 {/* Favorites Filter */}
                 <button 
                    onClick={() => setFilterFavorites(!filterFavorites)}
                    className={`p-2 rounded-xl border transition-all flex items-center gap-2 ${filterFavorites ? 'bg-neon-pink/20 border-neon-pink text-neon-pink' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white hover:bg-white/10'}`}
                    title="仅显示收藏"
                 >
                     <Heart className={`w-4 h-4 ${filterFavorites ? 'fill-current' : ''}`} />
                     {filterFavorites && <span className="text-xs font-bold hidden md:inline">已收藏</span>}
                 </button>
             </div>

             {/* Selection Tools */}
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
                        <button onClick={openExportModal} disabled={selectedIds.size === 0} className="px-3 py-1.5 text-xs font-bold text-neon-blue hover:text-white rounded-lg hover:bg-neon-blue/10 transition disabled:opacity-30">
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

      {/* Main Grid Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-6 pb-24">
          {processedSongs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-60">
                  <Disc className="w-16 h-16 mb-4 animate-spin-slow" />
                  <p className="text-lg font-bold">没有找到曲目</p>
                  <p className="text-sm">{searchQuery || filterFavorites ? "尝试清除搜索或筛选条件" : "导入或创建新的乐谱以开始游戏"}</p>
              </div>
          ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                  {processedSongs.map(song => {
                      const levelInfo = (song as any)._displayLevel || getLevelDisplay(song.difficultyRating);
                      const secondaryColor = song.theme?.secondaryColor || '#222';
                      
                      return (
                          <div 
                             key={song.id}
                             onClick={(e) => isSelectionMode ? toggleSelection(song.id, e) : onSelectSong(song)}
                             className={`group relative aspect-[4/3] rounded-3xl overflow-hidden border transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl cursor-pointer bg-[#0a0a0a] transform-gpu
                                ${selectedIds.has(song.id) ? 'border-neon-blue ring-2 ring-neon-blue/50' : 'border-white/5 hover:border-white/20'}
                             `}
                             style={{ isolation: 'isolate' }}
                          >
                             {/* Cover Art Container */}
                             <div className="absolute inset-0 z-0 bg-black">
                                 {song.coverArt ? (
                                    <>
                                        <img 
                                            src={song.coverArt} 
                                            alt="cover" 
                                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" 
                                        />
                                        {/* Gradient Overlay - strictly positioned over image */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none"></div>
                                    </>
                                 ) : (
                                    // Fallback
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
                             
                             {/* Content Layer (Higher Z-Index) */}
                             <div className="absolute inset-0 z-10 pointer-events-none p-5 flex flex-col justify-between">
                                 {/* Top Section */}
                                 <div className="flex justify-between items-start">
                                     {/* Level Badge */}
                                     <div className="flex flex-col items-center">
                                         <div 
                                            className="w-12 h-12 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/10 shadow-lg bg-black/40"
                                            style={{ borderColor: levelInfo.color }}
                                         >
                                             <span className="font-black italic text-xl text-white drop-shadow-md" style={{ color: levelInfo.color }}>{levelInfo.val}</span>
                                         </div>
                                     </div>

                                     {/* Top Right Controls (Pointer events enabled for buttons) */}
                                     {!isSelectionMode && (
                                         <div className="flex gap-2 pointer-events-auto">
                                             {/* Favorite Button (Always visible if favorited, else on hover) */}
                                             <button 
                                                onClick={(e) => handleToggleFavorite(song.id, e)}
                                                className={`p-2 backdrop-blur-md rounded-lg border transition-all ${song.isFavorite ? 'bg-neon-pink/20 border-neon-pink text-neon-pink' : 'bg-black/40 border-white/5 text-white hover:bg-white/20 opacity-0 group-hover:opacity-100'}`}
                                             >
                                                 <Heart className={`w-4 h-4 ${song.isFavorite ? 'fill-current' : ''}`} />
                                             </button>

                                             <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                                 <button 
                                                    onClick={(e) => { e.stopPropagation(); setShowDetailsId(song.id); }}
                                                    className="p-2 bg-black/40 backdrop-blur-md rounded-lg text-white hover:bg-white/20 border border-white/5"
                                                    title="详情"
                                                 >
                                                     <Info className="w-4 h-4" />
                                                 </button>
                                                 {/* Removed Edit Button Here as requested */}
                                                 <button 
                                                    onClick={(e) => startEdit(song, e)}
                                                    className="p-2 bg-black/40 backdrop-blur-md rounded-lg text-white hover:bg-white/20 border border-white/5"
                                                    title="重命名"
                                                 >
                                                     <Type className="w-4 h-4" />
                                                 </button>
                                             </div>
                                         </div>
                                     )}
                                     
                                     {/* Selection Checkbox */}
                                     {isSelectionMode && (
                                         <div className="pointer-events-auto">
                                             <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${selectedIds.has(song.id) ? 'bg-neon-blue border-neon-blue text-black' : 'border-white/30 bg-black/40'}`}>
                                                 {selectedIds.has(song.id) && <CheckSquare className="w-4 h-4" />}
                                             </div>
                                         </div>
                                     )}
                                 </div>

                                 {/* Middle Rank (Centered) */}
                                 {song.bestResult && (
                                     <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none w-full text-center">
                                         <div className={`text-6xl font-black italic drop-shadow-[0_0_30px_rgba(0,0,0,0.8)] opacity-30 group-hover:opacity-100 transition-all duration-500 scale-75 group-hover:scale-100 ${song.bestResult.rank === 'S' || song.bestResult.rank === 'OPUS' || song.bestResult.rank === 'DIVINE' ? 'text-neon-blue' : 'text-white'}`}>
                                             {song.bestResult.rank}
                                         </div>
                                     </div>
                                 )}

                                 {/* Bottom Info */}
                                 <div className="pointer-events-auto">
                                     {editingId === song.id ? (
                                          <div className="flex flex-col gap-2 bg-black/80 p-2 rounded-xl backdrop-blur-md" onClick={e => e.stopPropagation()}>
                                              <input 
                                                className="bg-transparent border-b border-white/20 text-white font-bold text-lg outline-none"
                                                value={editForm.title}
                                                onChange={e => setEditForm({...editForm, title: e.target.value})}
                                                autoFocus
                                              />
                                              <div className="flex gap-2">
                                                  <input 
                                                    className="flex-1 bg-transparent border-b border-white/20 text-gray-400 text-xs outline-none"
                                                    value={editForm.artist}
                                                    onChange={e => setEditForm({...editForm, artist: e.target.value})}
                                                  />
                                                  <button onClick={saveEdit} className="text-xs bg-neon-blue text-black px-2 rounded font-bold">SAVE</button>
                                              </div>
                                          </div>
                                     ) : (
                                         <>
                                            <h3 className="text-xl font-black text-white leading-tight truncate drop-shadow-md mb-1">{song.title}</h3>
                                            <p className="text-xs text-white/70 font-bold uppercase tracking-wider mb-3 truncate">{song.artist}</p>
                                            
                                            <div className="flex items-center gap-3 text-[10px] font-bold text-white/50 uppercase tracking-widest">
                                                <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {formatTime(song.duration)}</span>
                                                <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                                                <span>{Math.round(song.structure.bpm)} BPM</span>
                                                <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                                                <span className={`${song.laneCount === 6 ? 'text-purple-400' : 'text-neon-blue'}`}>{song.laneCount}K</span>
                                            </div>
                                         </>
                                     )}
                                 </div>
                             </div>
                          </div>
                      );
                  })}
              </div>
          )}
      </div>

      {/* Hidden Inputs */}
      <input ref={audioInputRef} type="file" accept="audio/*" onChange={onImportAudioClick} className="hidden" />
      <input ref={mapInputRef} type="file" multiple accept=".json,.zip,.nfz,application/json,application/zip,application/octet-stream" onChange={onImportMapClick} className="hidden" />

      {/* --- Details Modal --- */}
      {detailSong && (
          <SongDetailsModal 
            song={detailSong} 
            onClose={() => setShowDetailsId(null)} 
            onStart={(s) => { onSelectSong(s); setShowDetailsId(null); }} 
            onEdit={(s) => { onEditSong(s); setShowDetailsId(null); }} // Pass Handler
          />
      )}

      {/* --- Export Modal --- */}
      {showExportModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-[#0f172a] border border-white/20 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative">
                  <button onClick={() => !isExporting && setShowExportModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white disabled:opacity-50">
                      <X className="w-5 h-5" />
                  </button>
                  <h2 className="text-xl font-bold text-white mb-4">导出选项</h2>
                  <p className="text-gray-400 text-sm mb-6">即将导出 {selectedIds.size} 首曲目。</p>
                  
                  <label className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/10 cursor-pointer hover:bg-white/10 transition-colors mb-6">
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${includeHistory ? 'bg-neon-blue border-neon-blue text-black' : 'border-gray-500'}`}>
                          {includeHistory && <CheckSquare className="w-3.5 h-3.5" />}
                      </div>
                      <input type="checkbox" className="hidden" checked={includeHistory} onChange={e => setIncludeHistory(e.target.checked)} />
                      <div className="flex flex-col">
                          <span className="font-bold text-sm">包含历史成绩</span>
                          <span className="text-xs text-gray-500">导出的文件中将保留您的最高分记录</span>
                      </div>
                  </label>

                  <button 
                    onClick={handleExportConfirm} 
                    disabled={isExporting}
                    className="w-full py-3 bg-neon-blue text-black font-bold rounded-xl hover:bg-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                      {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      {isExporting ? '正在打包...' : '开始导出'}
                  </button>
              </div>
          </div>
      )}

      {/* --- Delete Confirmation Modal --- */}
      {showDeleteConfirm && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-[#0f172a] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative">
                  <div className="flex items-center gap-3 text-red-400 font-black text-xl mb-4">
                      <AlertTriangle className="w-6 h-6" />
                      确认删除
                  </div>
                  <p className="text-gray-300 text-sm mb-6 leading-relaxed">
                      您确定要删除选中的 <span className="text-white font-bold">{selectedIds.size}</span> 首曲目吗？<br/>
                      此操作<span className="text-red-400 font-bold">无法撤销</span>。
                  </p>
                  
                  <div className="grid grid-cols-2 gap-3">
                      <button 
                        onClick={() => setShowDeleteConfirm(false)}
                        className="py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold transition-colors"
                      >
                          取消
                      </button>
                      <button 
                        onClick={confirmDelete}
                        className="py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition-colors shadow-lg"
                      >
                          删除
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
