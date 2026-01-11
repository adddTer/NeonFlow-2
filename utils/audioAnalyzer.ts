
import { Onset } from '../types';

// 计算均方根 (RMS) 能量 - Pure Math
const calculateRMS = (data: Float32Array) => {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length);
};

// 移动平均滤波器 - Pure Math
const calculateMovingAverage = (data: number[], windowSize: number) => {
  const averages = new Float32Array(data.length);
  const halfWindow = Math.floor(windowSize / 2);
  
  for (let i = 0; i < data.length; i++) {
    let start = Math.max(0, i - halfWindow);
    let end = Math.min(data.length, i + halfWindow);
    let sum = 0;
    for(let j=start; j<end; j++) {
        sum += data[j];
    }
    averages[i] = sum / (end - start);
  }
  return averages;
};

/**
 * 1. 预处理音频 (Main Thread)
 * 使用 OfflineAudioContext 快速提取低频通道数据。
 * 这部分必须在主线程运行，因为它依赖 DOM Audio API。
 */
export const preprocessAudioData = async (
    audioBuffer: AudioBuffer
): Promise<{ lowData: Float32Array; fullData: Float32Array }> => {
    const offlineContext = new OfflineAudioContext(
        1,
        audioBuffer.length,
        audioBuffer.sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;

    const lowFilter = offlineContext.createBiquadFilter();
    lowFilter.type = "lowpass";
    lowFilter.frequency.value = 150;

    source.connect(lowFilter);
    lowFilter.connect(offlineContext.destination);
    
    source.start(0);
    const renderedLow = await offlineContext.startRendering();
    
    return {
        lowData: renderedLow.getChannelData(0),
        fullData: audioBuffer.getChannelData(0)
    };
};

/**
 * 2. 计算节奏点 (Worker Thread Compatible)
 * 纯数学计算，无 DOM 依赖，适合移入 Worker。
 */
export const computeOnsets = (
    lowChannelData: Float32Array,
    fullChannelData: Float32Array,
    sampleRate: number
): Onset[] => {
    const onsets: Onset[] = [];
    
    // 60 FPS 采样精度 (约 16ms)
    const frameRate = 60;
    const samplesPerFrame = Math.floor(sampleRate / frameRate);
    const totalFrames = Math.floor(lowChannelData.length / samplesPerFrame);

    // 能量谱计算
    const lowEnergies: number[] = [];
    const fullEnergies: number[] = [];

    for (let i = 0; i < totalFrames; i++) {
        const start = i * samplesPerFrame;
        const end = start + samplesPerFrame;
        // 简单的切片可能会导致大量的 GC，但在 Worker 中通常可以接受
        // 优化：直接在循环中计算 RMS 避免 slice，但这需要重写 calculateRMS 支持 offset
        lowEnergies.push(calculateRMS(lowChannelData.slice(start, end)));
        fullEnergies.push(calculateRMS(fullChannelData.slice(start, end)));
    }

    // 局部动态阈值 (0.5秒窗口，用于捕捉瞬态)
    const localWindow = 0.5 * frameRate; 
    const lowThresholds = calculateMovingAverage(lowEnergies, localWindow);
    const fullThresholds = calculateMovingAverage(fullEnergies, localWindow);

    let lastOnsetTime = -1;
    // 降低物理间隔限制 (50ms)
    const minGap = 0.05; 

    for (let i = 0; i < totalFrames; i++) {
        const time = i / frameRate;
        
        if (time - lastOnsetTime < minGap) continue;

        // 判定逻辑
        const lowRatio = lowEnergies[i] / (lowThresholds[i] + 0.00001);
        const fullRatio = fullEnergies[i] / (fullThresholds[i] + 0.00001);
        const absLow = lowEnergies[i];
        const absFull = fullEnergies[i];

        const silenceThreshold = 0.01;
        
        const isLowHit = lowRatio > 1.05 && absLow > silenceThreshold;
        const isFullHit = fullRatio > 1.1 && absFull > silenceThreshold;

        if (isLowHit || isFullHit) {
            const energy = Math.min(1, Math.max(absLow, absFull) * 5);
            
            onsets.push({
                time,
                energy,
                isLowFreq: isLowHit && (lowRatio > fullRatio)
            });
            lastOnsetTime = time;
        }
    }

    return onsets;
};

// Legacy Wrapper for backward compatibility if needed (Purely Main Thread)
export const analyzeAudioDSP = async (
  arrayBuffer: ArrayBuffer, 
  audioContext: AudioContext
): Promise<{ buffer: AudioBuffer; onsets: Onset[]; duration: number }> => {
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const { lowData, fullData } = await preprocessAudioData(audioBuffer);
  const onsets = computeOnsets(lowData, fullData, audioBuffer.sampleRate);
  return { buffer: audioBuffer, onsets, duration: audioBuffer.duration };
};
