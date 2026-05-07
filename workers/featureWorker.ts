import { extractAudioFeaturesFromData, AudioFeature, computeOnsets } from '../utils/audioAnalyzer';
import { Onset } from '../types';

export type FeatureWorkerMessage = 
    | { type: 'EXTRACT_FEATURES'; payload: { channelData: Float32Array; sampleRate: number; fps: number; } }
    | { type: 'COMPUTE_ONSETS'; payload: { lowData: Float32Array; fullData: Float32Array; sampleRate: number; } };

self.onmessage = (e: MessageEvent<FeatureWorkerMessage>) => {
    if (e.data.type === 'EXTRACT_FEATURES') {
        try {
            const features = extractAudioFeaturesFromData(e.data.payload.channelData, e.data.payload.sampleRate, e.data.payload.fps);
            self.postMessage({ type: 'FEATURES_RESULT', success: true, features });
        } catch (error: any) {
            self.postMessage({ type: 'FEATURES_RESULT', success: false, error: error.message });
        }
    } else if (e.data.type === 'COMPUTE_ONSETS') {
        try {
            const onsets = computeOnsets(e.data.payload.lowData, e.data.payload.fullData, e.data.payload.sampleRate);
            self.postMessage({ type: 'ONSETS_RESULT', success: true, onsets });
        } catch (error: any) {
            self.postMessage({ type: 'ONSETS_RESULT', success: false, error: error.message });
        }
    }
};
