
import { Note, NoteLane, Onset, SongStructure, BeatmapDifficulty, LaneCount, PlayStyle, MotionDescriptors, NoteType } from '../types';

// Configuration per difficulty
// Adjusted minGap to ensure distinct difficulty tiers
const DIFFICULTY_CONFIG = {
    [BeatmapDifficulty.Easy]: {
        thresholdMultiplier: 2.2, minGap: 0.35, maxPolyphony: 1, allowedCost: 2.0, patternChance: 0.0
    },
    [BeatmapDifficulty.Normal]: {
        thresholdMultiplier: 1.5, minGap: 0.20, maxPolyphony: 2, allowedCost: 3.5, patternChance: 0.1
    },
    [BeatmapDifficulty.Hard]: {
        thresholdMultiplier: 1.1, minGap: 0.12, maxPolyphony: 2, allowedCost: 5.0, patternChance: 0.3
    },
    [BeatmapDifficulty.Expert]: {
        thresholdMultiplier: 0.9, minGap: 0.07, maxPolyphony: 3, allowedCost: 8.0, patternChance: 0.5
    },
    [BeatmapDifficulty.Titan]: {
        thresholdMultiplier: 0.75, minGap: 0.04, maxPolyphony: 4, allowedCost: 12.0, patternChance: 0.8
    }
};

export interface BeatmapFeatures {
    normal: boolean;
    holds: boolean;
    catch: boolean;
}

// --- Direction 2: Relative Anchoring (AlignOnsets) ---
// Groups nearby onsets into rhythmic structures
const alignOnsetsLocal = (onsets: Onset[], bpm: number): Onset[] => {
    if (onsets.length < 2) return onsets;
    
    const sorted = [...onsets].sort((a, b) => a.time - b.time);
    const aligned: Onset[] = [];
    const groupingThreshold = 0.02; // 20ms tolerance

    let i = 0;
    while (i < sorted.length) {
        const group = [sorted[i]];
        let j = i + 1;
        
        while (j < sorted.length) {
            const delta = sorted[j].time - sorted[j-1].time;
            
            // Break if gap is too large (probably a pause in music)
            if (delta > 1.0) break;

            // Simple pattern matching: is this interval similar to the previous one?
            if (group.length > 1) {
                const prevDelta = group[group.length-1].time - group[group.length-2].time;
                if (Math.abs(delta - prevDelta) < groupingThreshold) {
                    group.push(sorted[j]);
                    j++;
                    continue;
                }
            }
            
            // If it's the second note, we accept it tentatively to check for a 3rd
            if (group.length === 1 && delta < 0.5) {
                group.push(sorted[j]);
                j++;
                continue;
            }

            break;
        }

        // Apply alignment if we found a rhythmic group
        if (group.length >= 3) {
            let totalDelta = 0;
            for(let k=1; k<group.length; k++) totalDelta += group[k].time - group[k-1].time;
            const avgDelta = totalDelta / (group.length - 1);
            
            // Re-space
            const anchorTime = group[0].time;
            for(let k=0; k<group.length; k++) {
                group[k].time = anchorTime + (k * avgDelta);
            }
        }
        
        aligned.push(...group);
        i = j;
    }
    
    // Deduplicate very close notes
    return aligned.filter((o, idx, arr) => idx === 0 || o.time > arr[idx-1].time + 0.005);
};

// --- Direction 3: Ergonomic Physics Engine 2.0 ---
class ErgonomicPhysics {
    private laneCount: number;
    private bias: 'left_heavy' | 'right_heavy' | 'balanced' | 'alternating';
    
    // State tracking
    private lastLanes: number[] = [2]; // Lanes used in last note
    private lastTime: number = 0;
    private lastFlowDirection: number = 0; // -1 (Left), 1 (Right), 0 (Neutral)
    
    // Fatigue tracking (Simple model)
    private leftHandStrain: number = 0;
    private rightHandStrain: number = 0;

    constructor(laneCount: number) {
        this.laneCount = laneCount;
        this.bias = 'balanced';
    }

    setBias(bias: string) {
        this.bias = bias as any;
    }

    private getHand(lane: number): 'LEFT' | 'RIGHT' {
        const center = this.laneCount / 2;
        return lane < center ? 'LEFT' : 'RIGHT';
    }

    // Decay strain over time
    updateStrain(currentTime: number) {
        const dt = currentTime - this.lastTime;
        const decay = Math.max(0, dt * 5.0); // Recover 5 strain per second
        this.leftHandStrain = Math.max(0, this.leftHandStrain - decay);
        this.rightHandStrain = Math.max(0, this.rightHandStrain - decay);
    }

    getCost(targetLanes: number[], currentTime: number, isJackAllowed: boolean): number {
        this.updateStrain(currentTime);
        const timeDelta = Math.max(0.01, currentTime - this.lastTime);
        
        let cost = 0;
        
        // 1. Physical Distance & Flow
        // Calculate average position of previous chord vs new chord
        const prevAvg = this.lastLanes.reduce((a,b)=>a+b,0) / this.lastLanes.length;
        const currAvg = targetLanes.reduce((a,b)=>a+b,0) / targetLanes.length;
        const movement = currAvg - prevAvg;
        const dist = Math.abs(movement);
        
        cost += dist * 1.5;

        // Flow bonus: If we were moving Right, and keep moving Right, reduce cost
        if ((this.lastFlowDirection > 0 && movement > 0) || (this.lastFlowDirection < 0 && movement < 0)) {
            cost -= 1.0; 
        }

        // 2. Jack Penalty (Same lane hit)
        let hasJack = false;
        for (const lane of targetLanes) {
            if (this.lastLanes.includes(lane)) {
                hasJack = true;
                if (timeDelta < 0.15 && !isJackAllowed) return 9999; 
                cost += (0.3 / timeDelta) * 5; // Fast jacks are expensive
            }
        }

        // 3. Hand Strain / Bias
        let currentLeftLoad = 0;
        let currentRightLoad = 0;
        
        targetLanes.forEach(lane => {
            if (this.getHand(lane) === 'LEFT') currentLeftLoad++;
            else currentRightLoad++;
        });

        // Apply Bias
        if (this.bias === 'left_heavy' && currentRightLoad > 0) cost += currentRightLoad * 2;
        if (this.bias === 'right_heavy' && currentLeftLoad > 0) cost += currentLeftLoad * 2;
        
        // Apply Alternating Bias (Punish repeating same hand)
        if (this.bias === 'alternating') {
            const prevWasLeft = this.lastLanes.some(l => this.getHand(l) === 'LEFT');
            const prevWasRight = this.lastLanes.some(l => this.getHand(l) === 'RIGHT');
            
            // If strictly alternating, punish using same hand again
            if (prevWasLeft && !prevWasRight && currentLeftLoad > 0) cost += 5;
            if (prevWasRight && !prevWasLeft && currentRightLoad > 0) cost += 5;
        }

        // Apply Fatigue
        if (this.leftHandStrain > 3 && currentLeftLoad > 0) cost += this.leftHandStrain * 2;
        if (this.rightHandStrain > 3 && currentRightLoad > 0) cost += this.rightHandStrain * 2;

        // 4. Edge Penalty
        if (targetLanes.includes(0) || targetLanes.includes(this.laneCount-1)) cost += 0.5;

        return cost;
    }

    commit(lanes: number[], currentTime: number) {
        const prevAvg = this.lastLanes.reduce((a,b)=>a+b,0) / this.lastLanes.length;
        const currAvg = lanes.reduce((a,b)=>a+b,0) / lanes.length;
        const movement = currAvg - prevAvg;
        
        if (movement > 0.1) this.lastFlowDirection = 1;
        else if (movement < -0.1) this.lastFlowDirection = -1;
        // else maintain flow (or set 0 if holds)

        // Add strain
        lanes.forEach(lane => {
            if (this.getHand(lane) === 'LEFT') this.leftHandStrain += 1.0;
            else this.rightHandStrain += 1.0;
        });

        this.lastLanes = lanes;
        this.lastTime = currentTime;
    }

    getBestLanes(count: number, currentTime: number, maxCost: number, style: 'stream'|'jump'|'simple'): number[] {
        const allLanes = Array.from({length: this.laneCount}, (_, i) => i);
        
        // Helper: Generate combinations
        const getCombs = (arr: number[], k: number): number[][] => {
            if (k === 1) return arr.map(val => [val]);
            const res: number[][] = [];
            arr.forEach((val, idx) => {
                const sub = getCombs(arr.slice(idx + 1), k - 1);
                sub.forEach(s => res.push([val, ...s]));
            });
            return res;
        };

        let candidates = getCombs(allLanes, count);

        let bestCandidate = candidates[0];
        let minCandidateCost = 99999;

        // Shuffle candidates to avoid constant bias when costs are equal
        candidates.sort(() => Math.random() - 0.5);

        for (const chord of candidates) {
            const cost = this.getCost(chord, currentTime, style === 'simple');
            
            if (cost < minCandidateCost) {
                minCandidateCost = cost;
                bestCandidate = chord;
            }
        }
        
        this.commit(bestCandidate, currentTime);
        return bestCandidate;
    }
}

// --- Direction 4: Pattern Library ---
const PatternLibrary = {
    // Linear Stair: 0, 1, 2, 3
    getStair: (startTime: number, count: number, interval: number, startLane: number, dir: 1 | -1, laneCount: number) => {
        const notes: any[] = [];
        for(let i=0; i<count; i++) {
            let lane = startLane + (i * dir);
            if (lane >= laneCount) lane = laneCount - 2; 
            if (lane < 0) lane = 1;
            
            notes.push({ time: startTime + i*interval, lane });
        }
        return notes;
    },
    // ZigZag / Trill: 1, 2, 1, 2
    getTrill: (startTime: number, count: number, interval: number, laneA: number, laneB: number) => {
        const notes: any[] = [];
        for(let i=0; i<count; i++) {
            notes.push({ time: startTime + i*interval, lane: i % 2 === 0 ? laneA : laneB });
        }
        return notes;
    },
    // Circular / Roll (Specifically for 4K/6K)
    getRoll: (startTime: number, count: number, interval: number, laneCount: number) => {
        const notes: any[] = [];
        // 0-1-2-3-2-1...
        const cycle = laneCount === 4 ? [0,1,2,3,2,1] : [0,1,2,3,4,5,4,3,2,1];
        for(let i=0; i<count; i++) {
            notes.push({ time: startTime + i*interval, lane: cycle[i % cycle.length] });
        }
        return notes;
    }
};

// --- Main Generator ---

export const generateBeatmap = (
    rawOnsets: Onset[], 
    structure: SongStructure, 
    difficulty: BeatmapDifficulty = BeatmapDifficulty.Normal,
    laneCount: LaneCount = 4,
    playStyle: PlayStyle = 'THUMB',
    features: BeatmapFeatures = { normal: true, holds: true, catch: true }
): Note[] => {
    
    const onsets = alignOnsetsLocal(rawOnsets, structure.bpm);
    const config = DIFFICULTY_CONFIG[difficulty];
    const physics = new ErgonomicPhysics(laneCount);

    let notes: Note[] = [];
    let noteIndex = 0;
    let lastGeneratedTime = -10.0; // Ensure first note generates

    while (noteIndex < onsets.length) {
        const onset = onsets[noteIndex];
        
        // 1. Get Context
        const currentSection = structure.sections.find(
            s => onset.time >= s.startTime && onset.time < s.endTime
        ) || structure.sections[0];
        
        const desc = currentSection.descriptors || { flow: 'random', hand_bias: 'balanced', focus: 'melody' };
        
        physics.setBias(desc.hand_bias);

        // 2. Threshold Check (Energy)
        const baseThreshold = 0.05 + (1.0 - currentSection.intensity) * 0.2;
        const dynThreshold = baseThreshold * config.thresholdMultiplier;
        
        if (onset.energy < dynThreshold) {
            noteIndex++;
            continue;
        }

        // 3. Speed Limit Check (Difficulty Gap)
        // CRITICAL FIX: Ensure notes aren't too dense for low difficulties
        if (onset.time - lastGeneratedTime < config.minGap) {
            noteIndex++;
            continue;
        }

        // 4. Pattern Injection
        // We look ahead to see if we can fit a pattern
        const lookAhead = 3; 
        const canPattern = 
            features.normal &&
            Math.random() < config.patternChance &&
            noteIndex + lookAhead < onsets.length;

        if (canPattern) {
            const nextOnset = onsets[noteIndex+1];
            const interval = nextOnset.time - onset.time;
            
            // Only inject pattern if notes are dense enough to warrant a stream pattern
            // And if the interval respects the difficulty gap (roughly)
            if (interval < 0.4 && interval >= config.minGap * 0.8) {
                let generatedPattern: any[] = [];
                let notesConsumed = 0;

                if (desc.flow === 'linear') {
                    // Stair
                    const dir = Math.random() > 0.5 ? 1 : -1;
                    const startL = dir === 1 ? 0 : laneCount - 1;
                    const len = Math.min(4, onsets.length - noteIndex);
                    generatedPattern = PatternLibrary.getStair(onset.time, len, interval, startL, dir, laneCount);
                    notesConsumed = len;
                } 
                else if (desc.flow === 'zigzag' || desc.flow === 'random') {
                    // Trill
                    const len = Math.min(4, onsets.length - noteIndex);
                    const l1 = Math.floor(Math.random() * laneCount);
                    let l2 = Math.floor(Math.random() * laneCount);
                    while(l2 === l1 || Math.abs(l2-l1) > 2) l2 = Math.floor(Math.random() * laneCount);
                    generatedPattern = PatternLibrary.getTrill(onset.time, len, interval, l1, l2);
                    notesConsumed = len;
                }
                else if (desc.flow === 'circular') {
                    // Roll
                    const len = Math.min(6, onsets.length - noteIndex);
                    generatedPattern = PatternLibrary.getRoll(onset.time, len, interval, laneCount);
                    notesConsumed = len;
                }

                if (generatedPattern.length > 0) {
                    generatedPattern.forEach(p => {
                        physics.commit([p.lane], p.time); 
                        notes.push(createNote(p.time, p.lane, 0, 'NORMAL'));
                        lastGeneratedTime = p.time;
                    });
                    
                    noteIndex += notesConsumed; 
                    continue;
                }
            }
        }

        // 5. Standard Note Generation
        let simNotes = 1;
        
        // Double/Triple logic
        if (config.maxPolyphony > 1) {
            const isHeavyHit = onset.energy > 0.9 && onset.isLowFreq;
            if (isHeavyHit || (desc.focus === 'drum' && onset.energy > 0.8)) simNotes = 2;
            if (difficulty === BeatmapDifficulty.Titan && onset.energy > 0.95) simNotes = 3;
        }
        
        if (playStyle === 'THUMB' && difficulty !== BeatmapDifficulty.Titan) simNotes = Math.min(simNotes, 2);

        const lanes = physics.getBestLanes(simNotes, onset.time, config.allowedCost, currentSection.style as any);

        // 6. Note Type (Hold/Catch)
        let nextNoteTime = 9999;
        if (noteIndex + 1 < onsets.length) nextNoteTime = onsets[noteIndex+1].time;
        
        lanes.forEach(lane => {
            let type: NoteType = 'NORMAL';
            let duration = 0;

            // Hold Logic
            const canHold = features.holds && desc.focus === 'vocal' && (currentSection.style === 'hold' || currentSection.style === 'simple');
            
            if (canHold && lanes.length === 1) {
                const maxDur = nextNoteTime - onset.time - 0.1;
                const idealDur = Math.min(0.5, 60/structure.bpm);
                
                if (maxDur > 0.2) { 
                    duration = Math.min(maxDur, idealDur);
                }
            }

            // Catch Logic
            if (features.catch && duration === 0) {
                if (desc.flow === 'circular' || (onset.energy > 0.8 && lanes.length === 1)) {
                    if (Math.random() < 0.25) type = 'CATCH';
                }
            }

            notes.push(createNote(onset.time, lane, duration, type));
        });

        lastGeneratedTime = onset.time;
        noteIndex++;
    }

    return notes;
};

// Helper
const createNote = (time: number, lane: number, duration: number, type: NoteType): Note => ({
    id: `note-${time.toFixed(3)}-${lane}`,
    time,
    lane: lane as NoteLane,
    hit: false,
    visible: true,
    duration,
    isHolding: false,
    type
});

export const calculateDifficultyRating = (notes: Note[], duration: number): number => {
    if (notes.length === 0 || duration === 0) return 0;
    const sortedNotes = [...notes].sort((a, b) => a.time - b.time);
    const SECTION_LENGTH = 0.4;
    const sections: number[] = [];
    let currentSectionStrain = 0;
    let currentSectionStart = 0;
    let previousNoteTime = 0;
    let previousNoteLane = -1;

    for (let i = 0; i < sortedNotes.length; i++) {
        const note = sortedNotes[i];
        while (note.time > currentSectionStart + SECTION_LENGTH) {
            sections.push(currentSectionStrain);
            currentSectionStrain = 0; 
            currentSectionStart += SECTION_LENGTH;
        }
        const timeDelta = Math.max(note.time - previousNoteTime, 0.05);
        let strain = 1 / timeDelta;
        
        // Jack strain
        if (note.lane === previousNoteLane) strain *= 1.5;
        
        currentSectionStrain += strain;
        previousNoteTime = note.time;
        previousNoteLane = note.lane;
    }
    sections.push(currentSectionStrain);
    sections.sort((a, b) => b - a);
    let diff = 0;
    let weight = 1.0;
    const topSections = Math.min(sections.length, 30); 
    for (let i = 0; i < topSections; i++) {
        diff += sections[i] * weight;
        weight *= 0.9;
    }
    
    // RETURN RAW VALUE FOR PRECISION (Do not round)
    return Math.max(1, Math.sqrt(diff * 0.03) * 2.1);
};
