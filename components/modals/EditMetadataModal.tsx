import React, { useState } from 'react';
import { Type, X, Check } from 'lucide-react';
import { SavedSong } from '../../types';
import { updateSongMetadata } from '../../services/storageService';

interface EditMetadataModalProps {
    song: SavedSong;
    onClose: () => void;
    onSuccess: () => void;
}

export const EditMetadataModal: React.FC<EditMetadataModalProps> = ({ song, onClose, onSuccess }) => {
    const [title, setTitle] = useState(song.title);
    const [artist, setArtist] = useState(song.artist);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateSongMetadata(song.id, title, artist);
            onSuccess();
        } catch (e) {
            console.error("Failed to update metadata", e);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-fade-in">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose}></div>
            <div className="bg-[#0a0a0c] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl relative z-10 flex flex-col p-6 overflow-hidden">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/5 rounded-lg border border-white/10"><Type className="w-5 h-5 text-white" /></div>
                        <h2 className="text-xl font-black text-white tracking-wider">编辑曲目信息</h2>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4 mb-8">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">歌曲名称</label>
                        <input 
                            type="text" 
                            value={title} 
                            onChange={e => setTitle(e.target.value)}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white font-black focus:outline-none focus:border-white/30" 
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-1">艺术家</label>
                        <input 
                            type="text" 
                            value={artist} 
                            onChange={e => setArtist(e.target.value)}
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white font-black focus:outline-none focus:border-white/30" 
                        />
                    </div>
                </div>

                <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="w-full py-4 bg-white text-black font-black uppercase tracking-widest rounded-xl hover:scale-[1.02] active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2"
                >
                    {isSaving ? <span className="animate-spin rounded-full w-5 h-5 border-2 border-black border-t-transparent"></span> : <><Check className="w-5 h-5" /> 保存修改</>}
                </button>
            </div>
        </div>
    );
};
