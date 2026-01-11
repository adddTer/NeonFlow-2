
import { computeOnsets } from '../utils/audioAnalyzer';
import { generateBeatmap, BeatmapFeatures } from '../utils/beatmapGenerator';
import { Note, Onset, SongStructure, BeatmapDifficulty, LaneCount, PlayStyle } from '../types';

// Worker Input Types
type WorkerMessage = {
    type: 'PROCESS_SONG';
    payload: {
        lowData: Float32Array;
        fullData: Float32Array;
        sampleRate: number;
        structure: SongStructure;
        difficulty: BeatmapDifficulty;
        laneCount: LaneCount;
        playStyle: PlayStyle;
        features: BeatmapFeatures;
    };
};

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    if (e.data.type === 'PROCESS_SONG') {
        const { 
            lowData, 
            fullData, 
            sampleRate, 
            structure, 
            difficulty, 
            laneCount, 
            playStyle, 
            features 
        } = e.data.payload;

        try {
            // 1. Run DSP Analysis (Heavy Loop)
            const onsets = computeOnsets(lowData, fullData, sampleRate);

            // 2. Run Beatmap Generation (Logic Loop)
            const notes = generateBeatmap(
                onsets,
                structure,
                difficulty,
                laneCount,
                playStyle,
                features
            );

            // 3. Send results back
            self.postMessage({
                success: true,
                onsets,
                notes
            });

        } catch (error: any) {
            self.postMessage({
                success: false,
                error: error.message
            });
        }
    }
};
