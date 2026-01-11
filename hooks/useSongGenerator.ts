
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
    onSuccess: () => void
) => {
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [isConfiguringSong, setIsConfiguringSong] = useState(false);
    const [loadingStage, setLoadingStage] = useState<string>(""); 
    const [loadingSubText, setLoadingSubText] = useState<string>("");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    
    // Configuration State
    const [selectedLaneCount, setSelectedLaneCount] = useState<LaneCount>(4);
    const [selectedPlayStyle, setSelectedPlayStyle] = useState<PlayStyle>('THUMB');
    const [selectedDifficulty, setSelectedDifficulty] = useState<BeatmapDifficulty | null>(null);
    const [aiOptions, setAiOptions] = useState<GenerationOptions>({ structure: true, theme: true, metadata: true });
    const [beatmapFeatures, setBeatmapFeatures] = useState({ normal: true, holds: true, catch: true });
    const [skipAI, setSkipAI] = useState(false);

    // No Worker Ref needed anymore

    const onFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setPendingFile(file);
        setSelectedDifficulty(null); 
        setIsConfiguringSong(true); 
        event.target.value = '';
    };

    const handleCreateBeatmap = async () => {
        if (!pendingFile) return;
        if (!selectedDifficulty) return;
        
        setIsConfiguringSong(false);
        const file = pendingFile;
        setPendingFile(null);
        setErrorMessage(null);

        try {
            setLoadingStage("正在解析音频");
            setLoadingSubText("分析频率与节奏特征...");
            
            // Allow UI to render the loading state before heavy lifting
            await new Promise(resolve => setTimeout(resolve, 100));

            const arrayBuffer = await file.arrayBuffer();
            const audioCtxBuffer = arrayBuffer.slice(0); 
            const saveBuffer = arrayBuffer.slice(0); 
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });
            const decodedBuffer = await audioContext.decodeAudioData(audioCtxBuffer);
            const { lowData, fullData } = await preprocessAudioData(decodedBuffer);
            const coverArt = await extractCoverArt(file);

            let structure;
            let aiTheme = DEFAULT_THEME;
            let aiMetadata: { title?: string, artist?: string, album?: string } | undefined;

            const isDebugAndNoKey = isDebugMode && apiKeyStatus !== 'valid';
            const shouldUseFallback = (isDebugMode && skipAI) || isDebugAndNoKey;

            if (shouldUseFallback) {
                setLoadingStage(isDebugAndNoKey ? "无 API Key：使用默认结构" : "调试模式：跳过 AI");
                setLoadingSubText("使用默认结构生成...");
                await new Promise(resolve => setTimeout(resolve, 500));
                structure = { bpm: 120, sections: [{ startTime: 0, endTime: decodedBuffer.duration, type: 'verse', intensity: 0.8, style: 'stream' }] };
                aiMetadata = { title: file.name.replace(/\.[^/.]+$/, "") + " [DEV]", artist: "Debug Mode" };
            } else {
                setLoadingStage("Gemini AI 构思中");
                setLoadingSubText("识别风格、结构与视觉主题...");
                
                // Allow UI to render
                await new Promise(resolve => setTimeout(resolve, 50));

                if (apiKeyStatus === 'valid') {
                    const base64String = await fileUtils_fileToBase64(file);
                    const base64Data = base64String.split(',')[1];
                    const aiResult = await analyzeStructureWithGemini(file.name, base64Data, file.type, apiKey, aiOptions);
                    structure = aiResult.structure;
                    aiTheme = aiResult.theme;
                    aiMetadata = aiResult.metadata;
                } else {
                    throw new Error("API Key Missing");
                }
            }

            setLoadingStage("谱面生成中");
            setLoadingSubText(`正在构建 ${selectedLaneCount}K 模式键位...`);
            
            // Give the browser a moment to update the Loading Screen text before freezing for calculation
            await new Promise(resolve => setTimeout(resolve, 100));

            // --- MAIN THREAD EXECUTION ---
            // Direct function calls instead of Worker postMessage
            // This ensures 100% compatibility at the cost of slight UI freeze during this block
            
            // 1. Compute Onsets
            const onsets = computeOnsets(lowData, fullData, decodedBuffer.sampleRate);
            
            // 2. Generate Map
            const finalNotes = generateBeatmap(
                onsets,
                structure,
                selectedDifficulty,
                selectedLaneCount,
                selectedPlayStyle,
                beatmapFeatures
            );
            
            if (!finalNotes || finalNotes.length === 0) throw new Error("GenerativeFailure");
            
            // Dynamic import to avoid circular dependency issues in some bundlers if logic is shared
            const { calculateDifficultyRating } = await import('../utils/beatmapGenerator');
            const rating = calculateDifficultyRating(finalNotes, decodedBuffer.duration);

            setLoadingStage("保存数据");
            setLoadingSubText("写入本地数据库...");
            await new Promise(resolve => setTimeout(resolve, 50));
            
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
                laneCount: selectedDifficulty === BeatmapDifficulty.Titan ? 6 : selectedLaneCount
            };

            await saveSong(newSong);
            onSuccess(); // Triggers library reload
            
            setLoadingStage("");
            setLoadingSubText("");
            return { success: true, songTitle: newSong.title };

        } catch (error: any) {
            console.error("Error importing song:", error);
            setLoadingStage("");
            setLoadingSubText("");
            
            if (error.message && error.message.includes("GenerativeFailure")) {
                setErrorMessage("生成失败：无法提取有效节奏。");
            } else if (error.message === "API Key Missing") {
                setErrorMessage("生成失败：缺少 API Key。");
                return { success: false, error: 'API_KEY_MISSING' };
            } else {
                setErrorMessage("导入出错，请检查文件格式。" + error.message);
            }
            return { success: false, error: 'UNKNOWN' };
        }
    };

    return {
        pendingFile, setPendingFile,
        isConfiguringSong, setIsConfiguringSong,
        loadingStage, setLoadingStage,
        loadingSubText, setLoadingSubText,
        errorMessage, setErrorMessage,
        onFileSelect,
        handleCreateBeatmap,
        // Config State
        selectedLaneCount, setSelectedLaneCount,
        selectedPlayStyle, setSelectedPlayStyle,
        selectedDifficulty, setSelectedDifficulty,
        aiOptions, setAiOptions,
        beatmapFeatures, setBeatmapFeatures,
        skipAI, setSkipAI
    };
};
