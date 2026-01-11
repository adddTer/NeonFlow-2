
import JSZip from 'jszip';
import { SavedSong, BeatmapDifficulty, LaneCount, AITheme, NoteLane } from '../types';
import { saveSong, parseSongImport } from './storageService';
import { preprocessAudioData, computeOnsets } from '../utils/audioAnalyzer';
import { generateBeatmap, calculateDifficultyRating } from '../utils/beatmapGenerator';

interface DemoConfig {
    albumName: string;
    useAlbumCover: boolean;
    songs: {
        filename: string;
        title: string;
        artist: string;
        difficulty: BeatmapDifficulty;
        laneCount: LaneCount;
        bpm?: number;
    }[];
}

// Fallback config only used for raw audio files found in the zip
const FALLBACK_CONFIG: DemoConfig = {
    albumName: "万象回响",
    useAlbumCover: true,
    songs: [
        { filename: "placeholder_1", title: "Track 01", artist: "Unknown", difficulty: "EASY" as BeatmapDifficulty, laneCount: 4, bpm: 100 },
        { filename: "placeholder_2", title: "Track 02", artist: "Unknown", difficulty: "NORMAL" as BeatmapDifficulty, laneCount: 4, bpm: 120 },
        { filename: "placeholder_3", title: "Track 03", artist: "Unknown", difficulty: "NORMAL" as BeatmapDifficulty, laneCount: 4, bpm: 128 },
        { filename: "placeholder_4", title: "Track 04", artist: "Unknown", difficulty: "HARD" as BeatmapDifficulty, laneCount: 4, bpm: 140 },
        { filename: "placeholder_5", title: "Track 05", artist: "Unknown", difficulty: "HARD" as BeatmapDifficulty, laneCount: 4, bpm: 150 },
        { filename: "placeholder_6", title: "Track 06", artist: "Unknown", difficulty: "EXPERT" as BeatmapDifficulty, laneCount: 4, bpm: 170 },
        { filename: "placeholder_7", title: "Track 07", artist: "Unknown", difficulty: "EXPERT" as BeatmapDifficulty, laneCount: 4, bpm: 180 },
        { filename: "placeholder_8", title: "Track 08", artist: "Unknown", difficulty: "TITAN" as BeatmapDifficulty, laneCount: 4, bpm: 200 },
        { filename: "placeholder_9", title: "Track 09", artist: "Unknown", difficulty: "NORMAL" as BeatmapDifficulty, laneCount: 6, bpm: 110 },
        { filename: "placeholder_10", title: "Track 10", artist: "Unknown", difficulty: "HARD" as BeatmapDifficulty, laneCount: 6, bpm: 130 },
        { filename: "placeholder_11", title: "Track 11", artist: "Unknown", difficulty: "HARD" as BeatmapDifficulty, laneCount: 6, bpm: 145 },
        { filename: "placeholder_12", title: "Track 12", artist: "Unknown", difficulty: "EXPERT" as BeatmapDifficulty, laneCount: 6, bpm: 160 },
        { filename: "placeholder_13", title: "Track 13", artist: "Unknown", difficulty: "TITAN" as BeatmapDifficulty, laneCount: 6, bpm: 195 },
        { filename: "placeholder_14", title: "Track 14", artist: "Unknown", difficulty: "TITAN" as BeatmapDifficulty, laneCount: 4, bpm: 220 },
        { filename: "placeholder_15", title: "Track 15", artist: "Unknown", difficulty: "TITAN" as BeatmapDifficulty, laneCount: 6, bpm: 240 },
    ]
};

export const installDemoAlbum = async (
    onProgress: (stage: string, subText: string) => void
): Promise<void> => {
    try {
        onProgress("连接服务器", "获取演示资源包...");
        
        // 1. Fetch Assets (Zip is mandatory)
        const zipRes = await fetch('./demo/album.zip');
        if (!zipRes.ok) throw new Error("无法下载 album.zip，请检查 public/demo 文件夹");
        const zipBlob = await zipRes.blob();
        
        // 2. Fetch Optional Cover (for raw audio generation fallback)
        let globalCoverBase64: string | undefined = undefined;
        try {
            const coverRes = await fetch('./demo/cover.jpg');
            if (coverRes.ok) {
                const coverBlob = await coverRes.blob();
                globalCoverBase64 = await blobToBase64(coverBlob);
            }
        } catch (e) { /* Ignore */ }

        // 3. Unzip
        onProgress("解压数据", "正在扫描文件内容...");
        const zip = await JSZip.loadAsync(zipBlob);
        
        const allFiles = Object.keys(zip.files).filter(path => !path.startsWith('__macosx') && !path.includes('/.'));
        
        // Strategy:
        // 1. Find .nfz / .json files (Pre-made maps). Import them directly.
        // 2. Find .mp3 / .ogg / .wav files (Raw audio). Generate maps for them.
        
        const mapFiles = allFiles.filter(p => p.toLowerCase().endsWith('.nfz') || p.toLowerCase().endsWith('.json'));
        const audioFiles = allFiles.filter(p => {
            const l = p.toLowerCase();
            return l.endsWith('.mp3') || l.endsWith('.ogg') || l.endsWith('.wav') || l.endsWith('.flac') || l.endsWith('.m4a');
        });

        console.log(`Found ${mapFiles.length} maps and ${audioFiles.length} raw audio files.`);

        let successCount = 0;
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });

        // --- PHASE 1: IMPORT PRE-MADE MAPS ---
        for (let i = 0; i < mapFiles.length; i++) {
            const fileName = mapFiles[i];
            onProgress(`导入谱面 (${i + 1}/${mapFiles.length})`, `正在解包: ${fileName}`);
            
            try {
                const fileEntry = zip.file(fileName);
                if (fileEntry) {
                    const blob = await fileEntry.async('blob');
                    // Create a File object to reuse parseSongImport logic
                    const file = new File([blob], fileName);
                    const song = await parseSongImport(file);
                    
                    // Optional: Inject global cover if the map doesn't have one
                    if (!song.coverArt && globalCoverBase64) {
                        song.coverArt = globalCoverBase64;
                    }
                    
                    await saveSong(song);
                    successCount++;
                }
            } catch (e) {
                console.error(`Failed to import map ${fileName}`, e);
            }
        }

        // --- PHASE 2: GENERATE FROM RAW AUDIO (Fallback) ---
        // Only process audio files that don't seem to be part of an extracted map structure (though zip is flat usually)
        // We simply process all found audio files as "New Songs"
        if (audioFiles.length > 0) {
            // Sort to match fallback config slots deterministically
            audioFiles.sort((a, b) => a.localeCompare(b));

            for (let i = 0; i < audioFiles.length; i++) {
                const fileName = audioFiles[i];
                // If we have more audio files than config slots, just reuse the last slot's difficulty settings or default
                const configSlot = i < FALLBACK_CONFIG.songs.length ? FALLBACK_CONFIG.songs[i] : FALLBACK_CONFIG.songs[FALLBACK_CONFIG.songs.length - 1];
                
                onProgress(`生成谱面 (${i + 1}/${audioFiles.length})`, `正在分析音频: ${fileName}`);

                try {
                    const fileEntry = zip.file(fileName);
                    if (!fileEntry) continue;

                    const arrayBuffer = await fileEntry.async("arraybuffer");
                    // Clone buffer for saving
                    const saveBuffer = arrayBuffer.slice(0);
                    
                    // Decode
                    const decodeBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
                    
                    // DSP Analysis
                    const { lowData, fullData } = await preprocessAudioData(decodeBuffer);
                    const onsets = computeOnsets(lowData, fullData, decodeBuffer.sampleRate);
                    
                    // Use config bpm if provided, else default 120
                    const structure = {
                        bpm: configSlot.bpm || 120, 
                        sections: [{ startTime: 0, endTime: decodeBuffer.duration, type: 'verse', intensity: 0.8, style: 'stream' }]
                    };

                    const notes = generateBeatmap(
                        onsets,
                        structure as any,
                        configSlot.difficulty,
                        configSlot.laneCount,
                        'THUMB', 
                        { normal: true, holds: true, catch: true }
                    );

                    const rating = calculateDifficultyRating(notes, decodeBuffer.duration);

                    // Generate Theme
                    const hue = (i * 137.5) % 360; // Golden angle for distribution
                    const theme: AITheme = {
                        primaryColor: `hsl(${hue}, 100%, 50%)`,
                        secondaryColor: `hsl(${(hue + 180) % 360}, 80%, 60%)`,
                        catchColor: '#ffffff',
                        perfectColor: `hsl(${hue}, 100%, 60%)`,
                        goodColor: `hsl(${(hue + 40) % 360}, 100%, 60%)`,
                        moodDescription: 'Demo Track'
                    };

                    // Use filename as title if raw audio
                    const cleanTitle = fileName.replace(/\.[^/.]+$/, "");

                    const newSong: SavedSong = {
                        id: crypto.randomUUID(),
                        title: cleanTitle,
                        artist: "Unknown Artist",
                        album: FALLBACK_CONFIG.albumName,
                        coverArt: globalCoverBase64,
                        createdAt: Date.now() + i,
                        duration: decodeBuffer.duration,
                        audioData: saveBuffer,
                        notes: notes,
                        structure: structure as any,
                        theme: theme,
                        difficultyRating: rating,
                        laneCount: configSlot.laneCount
                    };

                    await saveSong(newSong);
                    successCount++;

                } catch (e) {
                    console.error(`Failed to generate from audio ${fileName}`, e);
                }
            }
        }
        
        audioContext.close();
        
        if (successCount === 0) {
            throw new Error("没有在压缩包中找到有效的 .nfz 谱面文件或音频文件。");
        }
        
    } catch (e: any) {
        console.error("Demo install failed", e);
        throw e;
    }
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};
