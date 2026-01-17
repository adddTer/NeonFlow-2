
import React, { useState } from 'react';
import { preprocessAudioData, computeOnsets, estimateBPM } from '../utils/audioAnalyzer';
import { generateBeatmap } from '../utils/beatmapGenerator';
import { analyzeStructureWithGemini, GenerationOptions } from '../services/geminiService';
import { analyzeMetadataWithGemini, MetadataResult } from '../services/metadataService';
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
    
    const [selectedLaneCount, setSelectedLaneCount] = useState<LaneCount>(4);
    const [selectedPlayStyle, setSelectedPlayStyle] = useState<PlayStyle>('THUMB');
    const [selectedDifficulty, setSelectedDifficulty] = useState<number | null>(null);
    const [aiOptions, setAiOptions] = useState<GenerationOptions>({}); 
    const [beatmapFeatures, setBeatmapFeatures] = useState({ normal: true, holds: true, catch: true });
    const [skipAI, setSkipAI] = useState(false);
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

    const handleCreateBeatmap = async (options?: { empty?: boolean }) => {
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
            
            // --- Programmatic BPM Estimation ---
            setLoadingSubText("程序化测算 BPM...");
            const onsets = computeOnsets(lowData, fullData, decodedBuffer.sampleRate);
            const dspBpm = estimateBPM(onsets);
            
            setLoadingSubText("提取封面...");
            const coverArt = await extractCoverArt(file);
            setLoadingProgress(20);

            let structure;
            let aiTheme = DEFAULT_THEME;
            let aiMetadata: MetadataResult | undefined;

            const isDebugAndNoKey = isDebugMode && apiKeyStatus !== 'valid';
            const shouldUseFallback = (skipAI) || isDebugAndNoKey; 

            if (shouldUseFallback) {
                setLoadingStage(isEmptyMode ? "创建工程" : "基础分析");
                setLoadingSubText("应用默认结构配置...");
                setLoadingProgress(40);
                await new Promise(resolve => setTimeout(resolve, 300));
                
                structure = { bpm: dspBpm, sections: [{ startTime: 0, endTime: decodedBuffer.duration, type: 'verse', intensity: 0.8, style: 'stream' }] };
                aiMetadata = { 
                    title: file.name.replace(/\.[^/.]+$/, ""), 
                    artist: "Unknown Artist", 
                    bpm: dspBpm, 
                    theme: DEFAULT_THEME 
                };
            } else {
                
                if (apiKeyStatus === 'valid' && apiKey) {
                    const base64String = await fileUtils_fileToBase64(file);
                    const base64Data = base64String.split(',')[1];
                    
                    const structureModel = useProModel ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';

                    // --- Phase 1: Metadata, Theme, BPM (Using DSP as Hint) ---
                    setLoadingStage("智能分析 (1/2)");
                    setLoadingSubText("正在检索元数据与主题 (Google Search)...");
                    setLoadingProgress(30);
                    
                    aiMetadata = await analyzeMetadataWithGemini(
                        file.name, 
                        base64Data, 
                        file.type, 
                        dspBpm, // Pass the programmatic hint
                        apiKey
                    );
                    
                    aiTheme = aiMetadata.theme; // Theme now comes from Metadata phase

                    // --- Phase 2: Structure Analysis Only ---
                    setLoadingStage("智能分析 (2/2)");
                    setLoadingSubText(`正在规划谱面结构 (${useProModel ? 'Pro' : 'Flash'})...`);
                    setLoadingProgress(50);

                    const structResult = await analyzeStructureWithGemini(base64Data, file.type, apiKey, {
                        ...aiOptions,
                        modelOverride: structureModel
                    });
                    
                    // Combine Phase 1 BPM with Phase 2 Sections
                    structure = {
                        bpm: aiMetadata.bpm, 
                        sections: structResult.sections
                    };
                    
                    setLoadingProgress(80);
                } else {
                    throw new Error("API Key Missing");
                }
            }

            let finalNotes: Note[] = [];
            let rating = 0;

            if (!isEmptyMode) {
                setLoadingStage("谱面生成中");
                setLoadingSubText(`基于 BPM ${Math.round(structure.bpm)} 与难度 ${selectedDifficulty} 构建...`);
                setLoadingProgress(85);
                await new Promise(resolve => setTimeout(resolve, 50));

                // Recalculate onsets if needed (usually cached is fine, but cleaner to pass)
                // We reuse 'onsets' from DSP calculation earlier
                
                setLoadingSubText("优化手感与连贯性...");
                setLoadingProgress(90);
                finalNotes = generateBeatmap(
                    onsets,
                    structure as any,
                    selectedDifficulty!, 
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
            } else if (error.message === "AI_RETRY_EXHAUSTED") {
                type = 'AI_RETRY_EXHAUSTED';
                msg = "AI 无法生成有效内容 (重试次数耗尽)。\n建议升级模型或使用纯算法模式。";
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
        useProModel, setUseProModel,
        errorState, resetError
    };
};
