
import React, { useState, useEffect } from 'react';
import { getAllSongs, parseSongImport, saveSong } from '../services/storageService';
import { SavedSong } from '../types';

export const useSongLibrary = () => {
    const [librarySongs, setLibrarySongs] = useState<SavedSong[]>([]);
    const [isLibraryLoading, setIsLibraryLoading] = useState(true);

    const loadLibrary = async () => {
        setIsLibraryLoading(true);
        try {
            const songs = await getAllSongs();
            setLibrarySongs(songs);
        } catch (e) {
            console.error("Failed to load library", e);
        } finally {
            setIsLibraryLoading(false);
        }
    };

    useEffect(() => { loadLibrary(); }, []);

    const handleImportMap = async (event: React.ChangeEvent<HTMLInputElement>, setStatus: (s: any) => void, setLoading: (stage: string, sub: string) => void) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        const fileList: File[] = Array.from(files);
        event.target.value = '';
        
        // Assume calling component handles status updates to 'Analyzing'
        let successCount = 0;

        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            setLoading("导入谱面", `正在解析 (${i + 1}/${fileList.length}): ${file.name}...`);
            try {
                const song = await parseSongImport(file);
                await saveSong(song);
                successCount++;
            } catch (e: any) {
                console.error(`Import failed for ${file.name}`, e);
            }
        }
        await loadLibrary();
    };

    return {
        librarySongs,
        isLibraryLoading,
        loadLibrary,
        handleImportMap
    };
};
