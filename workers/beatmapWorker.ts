
import { computeOnsets, estimateBPM } from '../utils/audioAnalyzer';
import { generateBeatmap, BeatmapFeatures, calculateDifficultyRating } from '../utils/beatmapGenerator';
import { Note, Onset, SongStructure, BeatmapDifficulty, LaneCount, PlayStyle } from '../types';

// Worker Input Types
type WorkerMessage = {
    type: 'PROCESS_SONG';
    payload: {
        lowData: Float32Array;
        fullData: Float32Array;
        sampleRate: number;
        duration: number;
        difficulty: number;
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
            duration,
            difficulty, 
            laneCount, 
            playStyle, 
            features 
        } = e.data.payload;

        try {
            // 1. Run DSP Analysis (Heavy Loop)
            const onsets = computeOnsets(lowData, fullData, sampleRate);
            const bpm = estimateBPM(onsets);

            // 2. Generate standard structure
            // Dynamic Structure Generation instead of a flat 0.8 intensity block
            const sections: any[] = [];
            let currentSecStart = 0;
            let sectionLen = 10.0; // 10s chunks roughly
            
            while (currentSecStart < duration) {
                let secEnd = Math.min(currentSecStart + sectionLen, duration);
                // Calculate average energy in this block
                const onsetsInBlock = onsets.filter(o => o.time >= currentSecStart && o.time < secEnd);
                let avgEnergy = 0;
                if (onsetsInBlock.length > 0) {
                     avgEnergy = onsetsInBlock.reduce((sum, o) => sum + o.energy, 0) / onsetsInBlock.length;
                }
                
                // If it's a very dense block and high energy, intensity = 1.0 (Drop)
                // If sparse and low energy, intensity = 0.3 (Intro/Outro/Break)
                let intensity = 0.5;
                if (onsetsInBlock.length < 5 || avgEnergy < 0.2) intensity = 0.3; // Slow part
                else if (avgEnergy > 0.7 && onsetsInBlock.length > 15) intensity = 1.0; // Intense part
                else if (avgEnergy > 0.4) intensity = 0.7; // Normal part
                else intensity = 0.5;
                
                sections.push({
                    startTime: currentSecStart,
                    endTime: secEnd,
                    type: intensity > 0.8 ? 'drop' : (intensity < 0.4 ? 'intro' : 'verse'),
                    intensity,
                    style: 'stream',
                    descriptors: { flow: 'random', hand_bias: 'balanced', focus: 'melody' }
                });
                
                currentSecStart = secEnd;
            }

            const structure: SongStructure = { 
                bpm: bpm, 
                sections: sections 
            };

            // 3. Run Beatmap Generation (Logic Loop)
            const notes = generateBeatmap(
                onsets,
                structure,
                difficulty,
                laneCount,
                playStyle,
                features
            );

            // 4. Calculate Rating
            const rating = calculateDifficultyRating(notes, duration);

            // 5. Send results back
            self.postMessage({
                success: true,
                onsets,
                notes,
                bpm,
                rating,
                structure
            });

        } catch (error: any) {
            self.postMessage({
                success: false,
                error: error.message
            });
        }
    }
};
