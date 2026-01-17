
import React, { useState } from 'react';
import { preprocessAudioData, computeOnsets } from '../utils/audioAnalyzer';
import { generateBeatmap } from '../utils/beatmapGenerator';
import { analyzeStructureWithGemini, GenerationOptions } from '../services/geminiService';
import { saveSong } from '../services/storageService';
import { extractCoverArt } from '../utils/audioMetadata';
import { fileToBase64 } from '../utils/fileUtils'; 
import { BeatmapDifficulty, LaneCount, PlayStyle, SavedSong, AITheme, DEFAULT_THEME, Note } from '../types';

const fileUtils_fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
};

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
    
    // Updated to accept number (1-20) or null
    const [selectedLaneCount, setSelectedLaneCount] = useState<LaneCount>(4);
    const [selectedPlayStyle, setSelectedPlayStyle] = useState<PlayStyle>('THUMB');
    const [selectedDifficulty, setSelectedDifficulty] = useState<number | null>(null);
    const [aiOptions, setAiOptions] = useState<GenerationOptions>({ structure: true, theme: true, metadata: true });
    const [beatmapFeatures, setBeatmapFeatures] = useState({ normal: true, holds: true, catch: true });
    const [skipAI, setSkipAI] = useState(false);
    
    // New Error State for Modal
    const [errorState, setErrorState] = useState<{ hasError: boolean, type: string, message: string | null }>({ hasError: false, type: '', message: null });

    const onFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setPendingFile(file);
        setSelectedDifficulty(10); // Default to 10
        setIsConfiguringSong(true); 
        event.target.value = '';
    };
    
    const resetError = () => setErrorState({ hasError: false, type: '', message: null });

    const handleCreateBeatmap = async (options?: { empty?: boolean }) => {
        if (!pendingFile) return;
        const isEmptyMode = options?.empty === true;
        if (!isEmptyMode && selectedDifficulty === null) return;
        
        setIsConfiguringSong(false); 
        
        const file = pendingFile;
        // Do NOT nullify pendingFile yet in case we need to retry
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
            
            setLoadingSubText("提取元数据与封面...");
            const coverArt = await extractCoverArt(file);
            setLoadingProgress(20);

            let structure;
            let aiTheme = DEFAULT_THEME;
            let aiMetadata: { title?: string, artist?: string, album?: string } | undefined;

            const isDebugAndNoKey = isDebugMode && apiKeyStatus !== 'valid';
            const shouldUseFallback = (skipAI) || isDebugAndNoKey; 

            if (shouldUseFallback) {
                setLoadingStage(isEmptyMode ? "创建工程" : "基础分析");
                setLoadingSubText("应用默认结构配置...");
                setLoadingProgress(40);
                await new Promise(resolve => setTimeout(resolve, 300));
                
                structure = { bpm: 120, sections: [{ startTime: 0, endTime: decodedBuffer.duration, type: 'verse', intensity: 0.8, style: 'stream' }] };
                aiMetadata = { title: file.name.replace(/\.[^/.]+$/, ""), artist: "Unknown Artist" };
            } else {
                setLoadingStage("云端智能分析");
                setLoadingSubText("识别音乐结构、BPM与情感色彩...");
                // AI Start: 20%. AI End: 80%. Allocating majority of bar to the slow part.
                setLoadingProgress(25);
                
                if (apiKeyStatus === 'valid' && apiKey) {
                    const base64String = await fileUtils_fileToBase64(file);
                    const base64Data = base64String.split(',')[1];
                    // Async call, progress jumps after completion
                    const aiResult = await analyzeStructureWithGemini(file.name, base64Data, file.type, apiKey, aiOptions);
                    structure = aiResult.structure;
                    aiTheme = aiResult.theme;
                    aiMetadata = aiResult.metadata;
                    setLoadingProgress(80);
                } else {
                    throw new Error("API Key Missing");
                }
            }

            let finalNotes: Note[] = [];
            let rating = 0;

            if (!isEmptyMode) {
                setLoadingStage("谱面生成中");
                setLoadingSubText(`基于难度 ${selectedDifficulty} 构建 ${selectedLaneCount}K 键位...`);
                setLoadingProgress(85);
                await new Promise(resolve => setTimeout(resolve, 50));

                const onsets = computeOnsets(lowData, fullData, decodedBuffer.sampleRate);
                
                setLoadingSubText("优化手感与连贯性...");
                setLoadingProgress(90);
                finalNotes = generateBeatmap(
                    onsets,
                    structure,
                    selectedDifficulty!, // Now passing number directly
                    selectedLaneCount,
                    selectedPlayStyle,
                    beatmapFeatures
                );
                
                if (!finalNotes || finalNotes.length === 0) throw new Error("GenerativeFailure");
                
                const { calculateDifficultyRating } = await import('../utils/beatmapGenerator');
                rating = calculateDifficultyRating(finalNotes, decodedBuffer.duration);
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
                album: aiMetadata?.album,
                coverArt: coverArt,
                createdAt: Date.now(),
                duration: decodedBuffer.duration,
                audioData: saveBuffer,
                notes: finalNotes,
                structure: structure as any,
                theme: aiTheme,
                difficultyRating: rating,
                laneCount: selectedLaneCount
            };

            await saveSong(newSong);
            setLoadingProgress(100);
            
            // Short delay to show 100%
            await new Promise(resolve => setTimeout(resolve, 200));
            setPendingFile(null); // Clear file only on success
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
            
            // Re-open config modal with error state
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
            } else if (error.message.includes("503") || error.message.includes("Overloaded")) {
                type = 'API_OVERLOAD';
                msg = "AI 服务繁忙，请稍后重试或使用纯算法模式。";
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
        selectedDifficulty, setSelectedDifficulty,
        aiOptions, setAiOptions,
        beatmapFeatures, setBeatmapFeatures,
        skipAI, setSkipAI,
        errorState, resetError // New exports
    };
};
