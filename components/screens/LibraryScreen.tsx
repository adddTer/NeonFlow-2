
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Upload, Trash2, Download, CheckSquare, Music, Clock, Zap, Plus, Trophy, Disc, Info, X, Calendar, Loader2, AlertTriangle, Heart, SortAsc, ChevronDown, Type, Search, User, Play, ArrowRight, FileJson } from 'lucide-react';
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
      if (rating < 1.0) return { val: 1, color: '#00f3ff', bg: 'bg-cyan-500' }; 
      
      const ranges = [
          { max: 4.0, bg: 'bg-cyan-500', color: '#00f3ff' },
          { max: 7.0, bg: 'bg-green-500', color: '#00fa9a' },
          { max: 10.0, bg: 'bg-yellow-500', color: '#ffd700' },
          { max: 14.0, bg: 'bg-orange-500', color: '#ff8c00' },
          { max: 18.0, bg: 'bg-red-500', color: '#ff0055' }
      ];

      for (const r of ranges) {
          if (rating < r.max) return { val: Math.floor(rating), color: r.color, bg: r.bg };
      }
      return { val: Math.floor(rating), color: '#bd00ff', bg: 'bg-purple-600' };
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
      <div className="relative z-10 w-full md:w-[45%] flex flex-col justify-end p-6 md:p-12 pb-32 md:pb-24 pointer-events-none md:pointer-events-auto mt-4 md:mt-20">
          {focusedSong ? (
             <div className="flex flex-col gap-6 md:gap-8 animate-slide-up">
                 {/* Top Meta */}
                 <div className="flex items-center gap-4 opacity-70">
                     <div className="px-3 py-1 rounded-full border border-white/20 bg-white/5 text-xs font-bold text-white uppercase tracking-widest backdrop-blur-md">
                         {focusedSong.laneCount} KEY
                     </div>
                     <div className="px-3 py-1 rounded-full border border-white/20 bg-white/5 text-xs font-bold text-white uppercase tracking-widest backdrop-blur-md flex items-center gap-2">
                         <Zap className="w-3 h-3 text-yellow-400" />
                         LV.{Math.floor(focusedSong.difficultyRating)}
                     </div>
                 </div>

                 {/* Visual Disc */}
                 <div className="hidden md:block w-48 h-48 lg:w-64 lg:h-64 rounded-full border-4 border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.5)] relative overflow-hidden group">
                     {/* Spinning Art */}
                     <div className="absolute inset-0 animate-[spin_12s_linear_infinite]" style={{ animationPlayState: 'running' }}>
                         <img src={focusedSong.coverArt} className="w-full h-full object-cover opacity-80" alt="Disc" />
                     </div>
                     {/* Center Hole */}
                     <div className="absolute inset-0 m-auto w-16 h-16 bg-[#111] rounded-full border border-white/10 flex items-center justify-center">
                         <div className="w-2 h-2 bg-neon-blue rounded-full shadow-[0_0_10px_#00f3ff]"></div>
                     </div>
                     {/* Gloss */}
                     <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none"></div>
                 </div>

                 {/* Typography */}
                 <div>
                     <h1 className="text-4xl md:text-5xl lg:text-7xl font-black text-white italic tracking-tighter leading-none mb-2 drop-shadow-2xl line-clamp-2" style={{ textShadow: `0 0 40px ${focusedSong.theme?.primaryColor || '#00f3ff'}66` }}>
                         {focusedSong.title}
                     </h1>
                     <p className="text-xl md:text-2xl font-bold text-white/60 tracking-tight flex items-center gap-3">
                         {focusedSong.artist}
                     </p>
                 </div>

                 {/* Best Score Mini-Display */}
                 {focusedSong.bestResult && (
                     <div className="flex items-center gap-4 bg-white/5 w-fit px-4 py-3 rounded-xl border border-white/10 backdrop-blur-md">
                         <div className="text-4xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400">
                             {focusedSong.bestResult.rank}
                         </div>
                         <div className="h-8 w-px bg-white/10"></div>
                         <div>
                             <div className="text-xs font-bold text-gray-400 uppercase">历史最佳</div>
                             <div className="text-lg font-mono font-black text-white">{focusedSong.bestResult.score.toLocaleString()}</div>
                         </div>
                     </div>
                 )}

                 {/* Actions */}
                 <div className="flex gap-4 mt-4 pointer-events-auto">
                     <button 
                        onClick={() => onSelectSong(focusedSong)}
                        className="group relative px-8 py-4 bg-white text-black font-black text-lg uppercase tracking-widest rounded-xl overflow-hidden hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:shadow-[0_0_50px_rgba(0,243,255,0.5)] flex items-center gap-3"
                     >
                         <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/80 to-transparent -translate-x-full group-hover:animate-shine"></div>
                         <Play className="w-5 h-5 fill-current" />
                         <span>开始游戏</span>
                     </button>
                     
                     <button 
                        onClick={() => onEditSong(focusedSong)}
                        className="px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-sm uppercase tracking-wider rounded-xl transition-all flex items-center gap-2"
                     >
                         <Type className="w-4 h-4" />
                         编辑
                     </button>
                 </div>
             </div>
          ) : (
             <div className="text-gray-500 font-bold text-xl">请选择一首歌曲开始</div>
          )}
      </div>

      {/* 3. Right Stream: Scrollable Song List */}
      <div className="relative z-10 flex-1 h-full overflow-hidden flex flex-col backdrop-blur-sm md:backdrop-blur-none bg-black/40 md:bg-transparent pt-4 md:pt-20">
          
          {/* Toolbar (Sticky) */}
          <div className="shrink-0 h-20 flex items-center px-6 gap-3 border-b border-white/5 bg-black/40 backdrop-blur-md">
              <div className="flex-1 bg-white/5 border border-white/10 rounded-xl flex items-center px-3 h-10 group focus-within:border-neon-blue/50 focus-within:bg-black/60 transition-all">
                  <Search className="w-4 h-4 text-gray-500 group-focus-within:text-neon-blue" />
                  <input 
                    type="text" 
                    placeholder="搜索歌曲..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent w-full h-full text-xs font-bold text-white outline-none ml-2 placeholder:text-gray-600"
                  />
              </div>
              
              <button 
                onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                className="h-10 w-10 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-white transition-all relative"
                title="排序"
              >
                  {SORT_LABELS[sortOption].icon}
                  {isSortDropdownOpen && (
                      <div className="absolute top-full right-0 mt-2 w-32 bg-[#111] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                          {Object.entries(SORT_LABELS).map(([key, config]) => (
                              <div key={key} onClick={() => { setSortOption(key as SortOption); setIsSortDropdownOpen(false); }} className="px-4 py-2 hover:bg-white/10 text-xs font-bold text-left cursor-pointer text-gray-300 hover:text-white">{config.label}</div>
                          ))}
                      </div>
                  )}
              </button>

              <button 
                onClick={() => setIsSelectionMode(!isSelectionMode)}
                className={`h-10 w-10 flex items-center justify-center rounded-xl border transition-all ${isSelectionMode ? 'bg-white text-black' : 'bg-white/5 border-white/10 text-gray-400'}`}
                title="批量管理"
              >
                  <CheckSquare className="w-4 h-4" />
              </button>

              <div className="h-6 w-px bg-white/10 mx-1"></div>

              <button 
                onClick={() => mapInputRef.current?.click()}
                className="h-10 px-3 bg-white/5 border border-white/10 text-gray-300 rounded-xl text-xs font-bold hover:bg-white/10 hover:text-white transition-all flex items-center gap-2"
                title="导入谱面文件 (.nfz)"
              >
                  <FileJson className="w-4 h-4" />
                  <span className="hidden md:inline">导入谱面</span>
              </button>

              <button 
                onClick={() => audioInputRef.current?.click()}
                className="h-10 px-4 bg-neon-blue/10 border border-neon-blue/30 text-neon-blue rounded-xl text-xs font-black uppercase tracking-wider hover:bg-neon-blue hover:text-black transition-all flex items-center gap-2"
                title="导入音频并生成"
              >
                  <Plus className="w-4 h-4" />
                  <span className="hidden md:inline">制作新谱</span>
                  <span className="md:hidden">新谱</span>
              </button>
          </div>

          {/* Action Bar (Selection Mode) */}
          {isSelectionMode && (
              <div className="h-12 bg-white/5 border-b border-white/5 flex items-center px-6 gap-3 animate-slide-down">
                  <span className="text-xs font-bold text-gray-400 mr-auto">已选择 {selectedIds.size} 项</span>
                  <button onClick={selectAll} className="text-xs font-bold text-white hover:underline">全选</button>
                  <button onClick={() => setShowDeleteConfirm(true)} disabled={selectedIds.size === 0} className="px-3 py-1 bg-red-500/20 text-red-400 rounded text-xs font-bold hover:bg-red-500 hover:text-white transition-colors">删除</button>
                  <button onClick={() => setShowExportModal(true)} disabled={selectedIds.size === 0} className="px-3 py-1 bg-neon-blue/20 text-neon-blue rounded text-xs font-bold hover:bg-neon-blue hover:text-black transition-colors">导出</button>
              </div>
          )}

          {/* The List */}
          <div ref={listRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2 pb-32">
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
                          className={`group relative h-20 w-full flex items-center transition-all duration-200 cursor-pointer overflow-hidden rounded-xl border
                              ${isFocused ? 'bg-white/10 translate-x-2 border-neon-blue/50 shadow-[0_0_20px_rgba(0,243,255,0.1)]' : 'bg-black/40 border-white/5 hover:bg-white/5 hover:border-white/10 hover:translate-x-1'}
                              ${isSelected ? 'ring-2 ring-neon-blue bg-neon-blue/10' : ''}
                          `}
                      >
                          {/* Thumb */}
                          <div className="w-20 h-full relative shrink-0">
                              {song.coverArt ? (
                                  <img src={song.coverArt} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" alt="thumb" />
                              ) : (
                                  <div className="w-full h-full bg-gradient-to-br from-gray-800 to-black"></div>
                              )}
                              {/* Overlay Gradient */}
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/50"></div>
                          </div>

                          {/* Info */}
                          <div className="flex-1 px-4 flex flex-col justify-center min-w-0">
                              <div className="flex items-center gap-2">
                                  <h3 className={`text-base font-black truncate leading-tight ${isFocused ? 'text-white' : 'text-gray-300'}`}>{song.title}</h3>
                                  {song.isFavorite && <Heart className="w-3 h-3 text-neon-pink fill-current" />}
                              </div>
                              <p className="text-xs font-bold text-gray-500 uppercase truncate">{song.artist}</p>
                          </div>

                          {/* Stats Right */}
                          <div className="px-6 flex items-center gap-4 shrink-0">
                              {/* Rank */}
                              {song.bestResult && (
                                  <div className="text-lg font-black italic text-gray-600 group-hover:text-white transition-colors">
                                      {song.bestResult.rank}
                                  </div>
                              )}
                              
                              {/* Diff Badge */}
                              <div className={`w-10 h-10 flex items-center justify-center text-sm font-black italic text-black shadow-lg ${levelInfo.bg}`} style={{ clipPath: 'polygon(20% 0%, 100% 0, 80% 100%, 0% 100%)' }}>
                                  {levelInfo.val}
                              </div>
                          </div>

                          {/* Focus Glow */}
                          {isFocused && (
                              <div className="absolute inset-0 bg-gradient-to-r from-neon-blue/5 to-transparent pointer-events-none"></div>
                          )}
                      </div>
                  )
              })}
              
              {/* Empty State */}
              {processedSongs.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-4 border border-dashed border-white/10 rounded-2xl m-4 bg-white/5">
                      <Music className="w-12 h-12 opacity-20" />
                      <p className="text-sm font-bold">暂无歌曲</p>
                      <button onClick={() => audioInputRef.current?.click()} className="text-neon-blue text-xs font-bold hover:underline">导入音频开始制作</button>
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
    </div>
  );
};
