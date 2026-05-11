
import React, { useState } from 'react';
import { preprocessAudioData } from '../utils/audioAnalyzer';
import { saveSong } from '../services/storageService';
import { extractCoverArt } from '../utils/audioMetadata';
import { fileToBase64 } from '../utils/fileUtils'; 
import { BeatmapDifficulty, LaneCount, PlayStyle, PlayMode, SavedSong, AITheme, DEFAULT_THEME, Note, SongStructure } from '../types';

export const useSongGenerator = (
    apiKey: string, 
    isDebugMode: boolean, 
    apiKeyStatus: string,
    onSuccess: () => void,
    onError?: (errorType: string, message?: string) => void
) => {
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [isConfiguringSong, setIsConfiguringSong] = useState(false);
    const [loadingStage, setLoadingStage] = useState<string>(""); 
    const [loadingSubText, setLoadingSubText] = useState<string>("");
    const [loadingProgress, setLoadingProgress] = useState<number>(0); 
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    
    const [selectedLaneCount, setSelectedLaneCount] = useState<LaneCount>(4);
    const [selectedPlayStyle, setSelectedPlayStyle] = useState<PlayStyle>('THUMB');
    const [selectedPlayMode, setSelectedPlayMode] = useState<PlayMode>('FALLING');
    const [selectedDifficulty, setSelectedDifficulty] = useState<number | null>(null);
    const [aiOptions, setAiOptions] = useState<any>({}); 
    const [beatmapFeatures, setBeatmapFeatures] = useState({ normal: true, holds: true, catch: true });
    const [skipAI, setSkipAI] = useState(true);
    const [useProModel, setUseProModel] = useState(false);
    
    const [errorState, setErrorState] = useState<{ hasError: boolean, type: string, message: string | null }>({ hasError: false, type: '', message: null });

    const onFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setPendingFile(file);
        setSelectedDifficulty(10); 
        setUseProModel(false);
        setIsConfiguringSong(true); 
        event.target.value = '';
    };
    
    const resetError = () => setErrorState({ hasError: false, type: '', message: null });

    const handleCreateBeatmap = async (options?: { empty?: boolean, metadata?: { title: string, artist: string } }) => {
        if (!pendingFile) return;
        const isEmptyMode = options?.empty === true;
        if (!isEmptyMode && selectedDifficulty === null) return;
        
        setIsConfiguringSong(false); 
        
        const file = pendingFile;
        setErrorMessage(null);
        setLoadingProgress(0);

        try {
            setLoadingStage("正在读取音频");
            setLoadingSubText("解析文件数据...");
            setLoadingProgress(5);
            
            await new Promise(resolve => setTimeout(resolve, 50));

            const arrayBuffer = await file.arrayBuffer();
            const audioCtxBuffer = arrayBuffer.slice(0); 
            const saveBuffer = arrayBuffer.slice(0); 
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });
            
            setLoadingSubText("解码音频流...");
            setLoadingProgress(10);
            const decodedBuffer = await audioContext.decodeAudioData(audioCtxBuffer);
            
            setLoadingStage("音频特征提取");
            setLoadingSubText("分离低频与动态范围分析...");
            setLoadingProgress(15);
            const { lowData, fullData } = await preprocessAudioData(decodedBuffer);
            
            setLoadingSubText("提取封面...");
            const coverArt = await extractCoverArt(file);
            setLoadingProgress(20);

            const aiMetadata = { 
                title: options?.metadata?.title || file.name.replace(/\.[^/.]+$/, ""), 
                artist: options?.metadata?.artist || "Unknown Artist",  
                theme: DEFAULT_THEME 
            };

            let finalNotes: Note[] = [];
            let rating = 0;
            let structure: SongStructure = { bpm: 120, sections: [] };

            if (!isEmptyMode) {
                setLoadingStage("谱面生成中");
                setLoadingSubText(`分配独立线程加速计算...`);
                setLoadingProgress(40);
                
                const worker = new Worker(new URL('../workers/beatmapWorker.ts', import.meta.url), { type: 'module' });
                
                await new Promise<void>((resolve, reject) => {
                    worker.onmessage = (e) => {
                        if (e.data.success) {
                            finalNotes = e.data.notes;
                            rating = e.data.rating;
                            structure = e.data.structure;
                            resolve();
                        } else {
                            reject(new Error(e.data.error || "GenerativeFailure"));
                        }
                        worker.terminate();
                    };
                    
                    worker.postMessage({
                        type: 'PROCESS_SONG',
                        payload: {
                            lowData,
                            fullData,
                            sampleRate: decodedBuffer.sampleRate,
                            duration: decodedBuffer.duration,
                            difficulty: selectedDifficulty,
                            laneCount: selectedPlayMode === 'ORBIT' ? 1 : selectedLaneCount,
                            playStyle: selectedPlayStyle,
                            features: selectedPlayMode === 'ORBIT' ? { normal: true, holds: false, catch: false } : beatmapFeatures
                        }
                    });
                });

                if (!finalNotes || finalNotes.length === 0) throw new Error("GenerativeFailure");
            } else {
                 setLoadingStage("初始化编辑器");
                 setLoadingSubText("准备空白轨道...");
                 setLoadingProgress(90);
                 await new Promise(resolve => setTimeout(resolve, 100));
            }

            setLoadingStage("保存数据");
            setLoadingSubText("写入本地数据库...");
            setLoadingProgress(95);
            
            const newSong: SavedSong = {
                id: crypto.randomUUID(),
                title: aiMetadata?.title || file.name.replace(/\.[^/.]+$/, ""),
                artist: aiMetadata?.artist || "未知艺术家",
                album: undefined,
                coverArt: coverArt,
                createdAt: Date.now(),
                duration: decodedBuffer.duration,
                audioData: saveBuffer,
                notes: finalNotes,
                structure: structure as any,
                theme: aiMetadata.theme,
                difficultyRating: rating,
                playMode: selectedPlayMode,
                laneCount: selectedLaneCount
            };

            await saveSong(newSong);
            setLoadingProgress(100);
            
            await new Promise(resolve => setTimeout(resolve, 200));
            setPendingFile(null); 
            onSuccess(); 
            
            setLoadingStage("");
            setLoadingSubText("");
            setLoadingProgress(0);
            return { success: true, songTitle: newSong.title };

        } catch (error: any) {
            console.error("Error importing song:", error);
            setLoadingStage("");
            setLoadingSubText("");
            setLoadingProgress(0);
            setIsConfiguringSong(true);
            
            let type = 'UNKNOWN';
            let msg = error.message;

            if (error.message && error.message.includes("GenerativeFailure")) {
                type = 'GEN_FAIL';
                msg = "无法从音频中提取有效节奏，文件可能过于安静或格式不支持。";
            } else if (error.message === "API Key Missing" || error.message.includes("403") || error.message.includes("401")) {
                type = 'API_KEY_MISSING';
                msg = "Gemini API 调用失败。可能是 Key 无效、额度不足或网络问题。";
                if (onError) onError('API_KEY_MISSING');
            }

            setErrorState({ hasError: true, type, message: msg });
            return { success: false, error: type };
        }
    };

    return {
        pendingFile, setPendingFile,
        isConfiguringSong, setIsConfiguringSong,
        loadingStage, setLoadingStage,
        loadingSubText, setLoadingSubText,
        loadingProgress, setLoadingProgress,
        errorMessage, setErrorMessage,
        onFileSelect,
        handleCreateBeatmap,
        selectedLaneCount, setSelectedLaneCount,
        selectedPlayStyle, setSelectedPlayStyle,
        selectedPlayMode, setSelectedPlayMode,
        selectedDifficulty, setSelectedDifficulty,
        aiOptions, setAiOptions,
        beatmapFeatures, setBeatmapFeatures,
        skipAI, setSkipAI,
        useProModel, setUseProModel,
        errorState, resetError
    };
};
