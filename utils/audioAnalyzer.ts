
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
const calculateMovingAverage = (data: ArrayLike<number>, windowSize: number) => {
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
 * Helper: Extract a slice of an AudioBuffer
 */
export const getAudioBufferSlice = (buffer: AudioBuffer, startTime: number, duration: number): AudioBuffer => {
    const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
    const ctx = new AudioContextClass(); // Dummy context to create buffer
    
    const sr = buffer.sampleRate;
    const startSample = Math.floor(Math.max(0, startTime) * sr);
    const endSample = Math.floor(Math.min(buffer.duration, startTime + duration) * sr);
    const length = endSample - startSample;
    
    if (length <= 0) {
        return ctx.createBuffer(buffer.numberOfChannels, 1, sr);
    }

    const newBuffer = ctx.createBuffer(buffer.numberOfChannels, length, sr);
    
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const oldData = buffer.getChannelData(channel);
        const newData = newBuffer.getChannelData(channel);
        // Optimized copy
        newData.set(oldData.subarray(startSample, endSample));
    }
    
    return newBuffer;
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
    const lowEnergies = new Float32Array(totalFrames);
    const fullEnergies = new Float32Array(totalFrames);

    for (let i = 0; i < totalFrames; i++) {
        const start = i * samplesPerFrame;
        const end = start + samplesPerFrame;
        // 优化：使用 subarray 避免内存分配
        lowEnergies[i] = calculateRMS(lowChannelData.subarray(start, end));
        fullEnergies[i] = calculateRMS(fullChannelData.subarray(start, end));
    }

    // 局部动态阈值 (0.5秒窗口，用于捕捉瞬态)
    const localWindow = Math.floor(0.5 * frameRate); 
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
            
            // Calculate pitch and timbre only at onset to save performance
            const start = i * samplesPerFrame;
            // Use a slightly larger window for pitch detection to ensure we catch low frequencies
            // max 2048 samples or to end of data
            let endForPitch = start + Math.max(samplesPerFrame, 2048);
            if (endForPitch > fullChannelData.length) endForPitch = fullChannelData.length;
            
            const frameData = fullChannelData.subarray(start, endForPitch);
            const pitch = detectPitch(frameData, sampleRate);
            const zcr = calculateZCR(frameData);

            // Compute sustained duration
            let sustainFrames = 0;
            // threshold for sustain drop (e.g. 25% of peak energy)
            const dropThreshold = Math.max(silenceThreshold, absFull * 0.25);
            for(let j = i + 1; j < Math.min(i + frameRate * 2, totalFrames); j++) {
                if (fullEnergies[j] < dropThreshold) break;
                // If there's a new onset (energy goes back up significantly), stop sustain.
                if (fullEnergies[j] > fullEnergies[j-1] * 1.5 && fullEnergies[j] > silenceThreshold) {
                    break;
                }
                sustainFrames++;
            }
            const duration = sustainFrames / frameRate;

            onsets.push({
                time,
                energy,
                isLowFreq: isLowHit && (lowRatio > fullRatio),
                pitch,
                zcr,
                duration
            });
            lastOnsetTime = time;
        }
    }

    return onsets;
};

/**
 * 3. 估算 BPM (Simple Interval Histogram)
 * 基于 Onsets 计算最可能的 BPM
 */
export const estimateBPM = (onsets: Onset[]): number => {
    if (onsets.length < 10) return 120;

    const intervals: number[] = [];
    // Only verify adjacent or near-adjacent onsets to find beat interval
    for (let i = 0; i < onsets.length - 1; i++) {
        for (let j = i + 1; j < Math.min(i + 5, onsets.length); j++) {
            const delta = onsets[j].time - onsets[i].time;
            if (delta > 0.2 && delta < 1.0) { // 60-300 BPM range roughly
                intervals.push(delta);
            }
        }
    }

    if (intervals.length === 0) return 120;

    // Bucket intervals (precision 10ms)
    const buckets: Record<number, number> = {};
    intervals.forEach(val => {
        const bucket = Math.round(val * 100) / 100; // 0.01s precision
        buckets[bucket] = (buckets[bucket] || 0) + 1;
    });

    let bestInterval = 0.5;
    let maxCount = 0;

    Object.entries(buckets).forEach(([intervalStr, count]) => {
        const interval = parseFloat(intervalStr);
        // Weight by nearby buckets to smooth
        let weightedCount = count;
        if (buckets[interval - 0.01]) weightedCount += buckets[interval - 0.01] * 0.5;
        if (buckets[interval + 0.01]) weightedCount += buckets[interval + 0.01] * 0.5;
        
        if (weightedCount > maxCount) {
            maxCount = weightedCount;
            bestInterval = interval;
        }
    });

    let estimatedBPM = 60 / bestInterval;

    // Clamp to reasonable range (80 - 180 is typical safe zone)
    while (estimatedBPM < 80) estimatedBPM *= 2;
    while (estimatedBPM > 190) estimatedBPM /= 2;

    return Math.round(estimatedBPM);
};

// Legacy Wrapper for backward compatibility if needed (Purely Main Thread)
export const analyzeAudioDSP = async (
  arrayBuffer: ArrayBuffer, 
  audioContext: AudioContext
): Promise<{ buffer: AudioBuffer; onsets: Onset[]; duration: number; estimatedBPM: number }> => {
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const { lowData, fullData } = await preprocessAudioData(audioBuffer);
  const onsets = computeOnsets(lowData, fullData, audioBuffer.sampleRate);
  const estimatedBPM = estimateBPM(onsets);
  return { buffer: audioBuffer, onsets, duration: audioBuffer.duration, estimatedBPM };
};

export interface AudioFeature {
  time: number;
  rms: number; // Volume
  zcr: number; // Timbre/Brightness
  pitch: number; // Fundamental Frequency (Hz)
}

// Simple Auto-correlation Pitch Detection (Optimized with Downsampling)
export function detectPitch(buffer: Float32Array, sampleRate: number): number {
    // 1. Calculate RMS to skip silence early
    // We can use the full buffer for accurate volume checking
    let rms = 0;
    const bufLen = buffer.length;
    for (let i = 0; i < bufLen; i++) rms += buffer[i] * buffer[i];
    rms = Math.sqrt(rms / bufLen);
    if (rms < 0.01) return 0; // Too quiet

    // 2. Downsample for performance (by a factor of DOWNSAMPLE, e.g., 4)
    // 44100Hz -> 11025Hz, greatly reduces O(N^2) autocorrelation overhead
    const DOWNSAMPLE = 4;
    const dsLength = Math.floor(bufLen / DOWNSAMPLE);
    
    // Window size for 20Hz at 11025Hz is ~551 samples. Array length of 1024 is plenty.
    const MAX_DS_LENGTH = 1024; 
    const finalLength = Math.min(dsLength, MAX_DS_LENGTH);
    
    const dsBuffer = new Float32Array(finalLength);
    for (let i = 0; i < finalLength; i++) {
        dsBuffer[i] = buffer[i * DOWNSAMPLE];
    }
    const dsSampleRate = sampleRate / DOWNSAMPLE;

    // 3. Autocorrelation on Downsampled Buffer
    // Constrain search between 20Hz (sub-bass) and 2000Hz (high notes)
    const minLag = Math.floor(dsSampleRate / 2000); 
    const maxLag = Math.min(finalLength, Math.floor(dsSampleRate / 20)); 

    const c = new Float32Array(maxLag);
    for (let lag = minLag; lag < maxLag; lag++) {
        let sum = 0;
        for (let j = 0; j < finalLength - lag; j++) {
            sum += dsBuffer[j] * dsBuffer[j + lag];
        }
        c[lag] = sum;
    }

    // 4. Find the peak
    // Skip early downward slope to avoid zero-lag peak
    let d = minLag;
    while (d < maxLag - 1 && c[d] > c[d + 1]) d++;

    let maxval = -1, maxpos = -1;
    for (let i = d; i < maxLag; i++) {
        if (c[i] > maxval) {
            maxval = c[i];
            maxpos = i;
        }
    }
    
    let T0 = maxpos;
    if (T0 <= 0) return 0;

    // 5. Parabolic interpolation for finer precision
    let x1 = c[T0 - 1] || 0, x2 = c[T0], x3 = c[T0 + 1] || 0;
    let a = (x1 + x3 - 2 * x2) / 2;
    let b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    // Compute actual pitch
    const pitch = dsSampleRate / T0;
    if (pitch < 20 || pitch > 4000) return 0; 
    
    return pitch;
}

// Zero Crossing Rate
export function calculateZCR(buffer: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < buffer.length; i++) {
        if ((buffer[i] >= 0 && buffer[i - 1] < 0) || (buffer[i] < 0 && buffer[i - 1] >= 0)) {
            crossings++;
        }
    }
    return crossings / buffer.length;
}

export const extractAudioFeaturesFromData = (channelData: Float32Array, sampleRate: number, framesPerSecond: number = 10): AudioFeature[] => {
    const samplesPerFrame = Math.floor(sampleRate / framesPerSecond);
    const totalFrames = Math.floor(channelData.length / samplesPerFrame);
    
    const features: AudioFeature[] = [];

    for (let i = 0; i < totalFrames; i++) {
        const start = i * samplesPerFrame;
        const end = start + samplesPerFrame;
        const frameData = channelData.subarray(start, end);
        
        const rms = calculateRMS(frameData);
        const zcr = calculateZCR(frameData);
        const pitch = detectPitch(frameData, sampleRate);
        
        features.push({
            time: i / framesPerSecond,
            rms,
            zcr,
            pitch
        });
    }

    return features;
};

export const extractAudioFeatures = (audioBuffer: AudioBuffer, framesPerSecond: number = 10): AudioFeature[] => {
    return extractAudioFeaturesFromData(audioBuffer.getChannelData(0), audioBuffer.sampleRate, framesPerSecond);
};
