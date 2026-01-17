
import { Note, NoteLane, Onset, SongStructure, BeatmapDifficulty, LaneCount, PlayStyle, MotionDescriptors, NoteType } from '../types';

// Interpolation helper
const lerp = (start: number, end: number, t: number) => start * (1 - t) + end * t;

// Continuous Difficulty Configuration (Level 1 to 20)
const getDifficultyConfig = (level: number) => {
    // Clamp level 1-20
    const l = Math.max(1, Math.min(20, level));
    const t = (l - 1) / 19; // Normalized 0.0 to 1.0

    return {
        // Energy threshold: High level = capture more subtle sounds (lower threshold)
        // Level 1: 2.0x threshold (Very strict) -> Level 20: 0.15x threshold (Extremely sensitive)
        // We dropped the floor significantly to allow high difficulty charts to have enough notes.
        thresholdMultiplier: lerp(2.0, 0.15, t),
        
        // Minimum time gap between notes (Speed limit)
        // Level 1: 400ms (Very slow) -> Level 20: 20ms (Extremely fast streams, 50 NPS cap)
        // Using power 0.7 to make the curve drop faster in the mid-range (Lv10)
        minGap: lerp(0.40, 0.02, Math.pow(t, 0.7)), 
        
        // Polyphony (Simultaneous notes) chance & count
        // More aggressive polyphony for higher levels
        maxPolyphony: l < 5 ? 1 : l < 10 ? 2 : l < 16 ? 3 : 4,
        
        // Allowed ergonomic cost (Higher level = harder patterns allowed)
        allowedCost: lerp(1.5, 30.0, t),
        
        // Probability of generating special patterns (Streams, Trills)
        patternChance: lerp(0.1, 1.0, t)
    };
};

export interface BeatmapFeatures {
    normal: boolean;
    holds: boolean;
    catch: boolean;
}

// --- Relative Anchoring (AlignOnsets) ---
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
            if (delta > 1.0) break;

            if (group.length > 1) {
                const prevDelta = group[group.length-1].time - group[group.length-2].time;
                if (Math.abs(delta - prevDelta) < groupingThreshold) {
                    group.push(sorted[j]);
                    j++;
                    continue;
                }
            }
            if (group.length === 1 && delta < 0.5) {
                group.push(sorted[j]);
                j++;
                continue;
            }
            break;
        }

        if (group.length >= 3) {
            let totalDelta = 0;
            for(let k=1; k<group.length; k++) totalDelta += group[k].time - group[k-1].time;
            const avgDelta = totalDelta / (group.length - 1);
            const anchorTime = group[0].time;
            for(let k=0; k<group.length; k++) {
                group[k].time = anchorTime + (k * avgDelta);
            }
        }
        
        aligned.push(...group);
        i = j;
    }
    return aligned.filter((o, idx, arr) => idx === 0 || o.time > arr[idx-1].time + 0.005);
};

// --- Ergonomic Physics Engine 2.0 ---
class ErgonomicPhysics {
    private laneCount: number;
    private bias: 'left_heavy' | 'right_heavy' | 'balanced' | 'alternating';
    private lastLanes: number[] = [2];
    private lastTime: number = 0;
    private lastFlowDirection: number = 0;
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

    updateStrain(currentTime: number) {
        const dt = currentTime - this.lastTime;
        const decay = Math.max(0, dt * 5.0); 
        this.leftHandStrain = Math.max(0, this.leftHandStrain - decay);
        this.rightHandStrain = Math.max(0, this.rightHandStrain - decay);
    }

    getCost(targetLanes: number[], currentTime: number, isJackAllowed: boolean): number {
        this.updateStrain(currentTime);
        const timeDelta = Math.max(0.01, currentTime - this.lastTime);
        let cost = 0;
        
        const prevAvg = this.lastLanes.reduce((a,b)=>a+b,0) / this.lastLanes.length;
        const currAvg = targetLanes.reduce((a,b)=>a+b,0) / targetLanes.length;
        const movement = currAvg - prevAvg;
        const dist = Math.abs(movement);
        
        cost += dist * 1.5;

        if ((this.lastFlowDirection > 0 && movement > 0) || (this.lastFlowDirection < 0 && movement < 0)) {
            cost -= 1.0; 
        }

        let hasJack = false;
        for (const lane of targetLanes) {
            if (this.lastLanes.includes(lane)) {
                hasJack = true;
                if (timeDelta < 0.15 && !isJackAllowed) return 9999; 
                cost += (0.3 / timeDelta) * 5; 
            }
        }

        let currentLeftLoad = 0;
        let currentRightLoad = 0;
        targetLanes.forEach(lane => {
            if (this.getHand(lane) === 'LEFT') currentLeftLoad++;
            else currentRightLoad++;
        });

        if (this.bias === 'left_heavy' && currentRightLoad > 0) cost += currentRightLoad * 2;
        if (this.bias === 'right_heavy' && currentLeftLoad > 0) cost += currentLeftLoad * 2;
        
        if (this.bias === 'alternating') {
            const prevWasLeft = this.lastLanes.some(l => this.getHand(l) === 'LEFT');
            const prevWasRight = this.lastLanes.some(l => this.getHand(l) === 'RIGHT');
            if (prevWasLeft && !prevWasRight && currentLeftLoad > 0) cost += 5;
            if (prevWasRight && !prevWasLeft && currentRightLoad > 0) cost += 5;
        }

        if (this.leftHandStrain > 3 && currentLeftLoad > 0) cost += this.leftHandStrain * 2;
        if (this.rightHandStrain > 3 && currentRightLoad > 0) cost += this.rightHandStrain * 2;

        if (targetLanes.includes(0) || targetLanes.includes(this.laneCount-1)) cost += 0.5;

        return cost;
    }

    commit(lanes: number[], currentTime: number) {
        const prevAvg = this.lastLanes.reduce((a,b)=>a+b,0) / this.lastLanes.length;
        const currAvg = lanes.reduce((a,b)=>a+b,0) / lanes.length;
        const movement = currAvg - prevAvg;
        
        if (movement > 0.1) this.lastFlowDirection = 1;
        else if (movement < -0.1) this.lastFlowDirection = -1;

        lanes.forEach(lane => {
            if (this.getHand(lane) === 'LEFT') this.leftHandStrain += 1.0;
            else this.rightHandStrain += 1.0;
        });

        this.lastLanes = lanes;
        this.lastTime = currentTime;
    }

    getBestLanes(count: number, currentTime: number, maxCost: number, style: 'stream'|'jump'|'simple'): number[] {
        const allLanes = Array.from({length: this.laneCount}, (_, i) => i);
        
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

// --- Pattern Library ---
const PatternLibrary = {
    getStair: (startTime: number, count: number, interval: number, startLane: number, dir: 1 | -1, laneCount: number) => {
        const notes: any[] = [];
        for(let i=0; i<count; i++) {
            let lane = startLane + (i * dir);
            // Wrap or bounce logic roughly
            while (lane >= laneCount || lane < 0) {
                if (lane >= laneCount) lane = lane - 2; 
                if (lane < 0) lane = 1;
            }
            notes.push({ time: startTime + i*interval, lane });
        }
        return notes;
    },
    getTrill: (startTime: number, count: number, interval: number, laneA: number, laneB: number) => {
        const notes: any[] = [];
        for(let i=0; i<count; i++) {
            notes.push({ time: startTime + i*interval, lane: i % 2 === 0 ? laneA : laneB });
        }
        return notes;
    },
    getRoll: (startTime: number, count: number, interval: number, laneCount: number) => {
        const notes: any[] = [];
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
    // Now accepts a number (1-20) OR enum for backward compatibility
    difficulty: number | BeatmapDifficulty = 10,
    laneCount: LaneCount = 4,
    playStyle: PlayStyle = 'THUMB',
    features: BeatmapFeatures = { normal: true, holds: true, catch: true }
): Note[] => {
    
    // Normalize difficulty to 1-20 number
    let numericDiff = 10;
    if (typeof difficulty === 'number') {
        numericDiff = difficulty;
    } else {
        // Mapping legacy enums just in case
        switch(difficulty) {
            case BeatmapDifficulty.Easy: numericDiff = 3; break;
            case BeatmapDifficulty.Normal: numericDiff = 8; break;
            case BeatmapDifficulty.Hard: numericDiff = 12; break;
            case BeatmapDifficulty.Expert: numericDiff = 16; break;
            case BeatmapDifficulty.Titan: numericDiff = 20; break;
        }
    }

    const onsets = alignOnsetsLocal(rawOnsets, structure.bpm);
    const config = getDifficultyConfig(numericDiff);
    const physics = new ErgonomicPhysics(laneCount);

    let notes: Note[] = [];
    let noteIndex = 0;
    let lastGeneratedTime = -10.0; 

    while (noteIndex < onsets.length) {
        const onset = onsets[noteIndex];
        
        const currentSection = structure.sections.find(
            s => onset.time >= s.startTime && onset.time < s.endTime
        ) || structure.sections[0];
        
        const desc = currentSection.descriptors || { flow: 'random', hand_bias: 'balanced', focus: 'melody' };
        
        physics.setBias(desc.hand_bias);

        const baseThreshold = 0.05 + (1.0 - currentSection.intensity) * 0.2;
        const dynThreshold = baseThreshold * config.thresholdMultiplier;
        
        if (onset.energy < dynThreshold) {
            noteIndex++;
            continue;
        }

        if (onset.time - lastGeneratedTime < config.minGap) {
            noteIndex++;
            continue;
        }

        // Pattern Injection
        const lookAhead = 3; 
        const canPattern = 
            features.normal &&
            Math.random() < config.patternChance &&
            noteIndex + lookAhead < onsets.length;

        if (canPattern) {
            const nextOnset = onsets[noteIndex+1];
            const interval = nextOnset.time - onset.time;
            
            if (interval < 0.4 && interval >= config.minGap * 0.8) {
                let generatedPattern: any[] = [];
                let notesConsumed = 0;

                if (desc.flow === 'linear') {
                    const dir = Math.random() > 0.5 ? 1 : -1;
                    const startL = dir === 1 ? 0 : laneCount - 1;
                    const len = Math.min(4, onsets.length - noteIndex);
                    generatedPattern = PatternLibrary.getStair(onset.time, len, interval, startL, dir, laneCount);
                    notesConsumed = len;
                } 
                else if (desc.flow === 'zigzag' || desc.flow === 'random') {
                    const len = Math.min(4, onsets.length - noteIndex);
                    const l1 = Math.floor(Math.random() * laneCount);
                    let l2 = Math.floor(Math.random() * laneCount);
                    while(l2 === l1 || Math.abs(l2-l1) > 2) l2 = Math.floor(Math.random() * laneCount);
                    generatedPattern = PatternLibrary.getTrill(onset.time, len, interval, l1, l2);
                    notesConsumed = len;
                }
                else if (desc.flow === 'circular') {
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

        // Polyphony
        let simNotes = 1;
        if (config.maxPolyphony > 1) {
            const isHeavyHit = onset.energy > 0.9 && onset.isLowFreq;
            if (isHeavyHit || (desc.focus === 'drum' && onset.energy > 0.8)) simNotes = 2;
            if (numericDiff >= 18 && onset.energy > 0.95) simNotes = 3;
        }
        
        simNotes = Math.min(simNotes, config.maxPolyphony);
        // Thumb mode limitation
        if (playStyle === 'THUMB' && numericDiff < 18) simNotes = Math.min(simNotes, 2);

        const lanes = physics.getBestLanes(simNotes, onset.time, config.allowedCost, currentSection.style as any);

        let nextNoteTime = 9999;
        if (noteIndex + 1 < onsets.length) nextNoteTime = onsets[noteIndex+1].time;
        
        lanes.forEach(lane => {
            let type: NoteType = 'NORMAL';
            let duration = 0;

            const canHold = features.holds && desc.focus === 'vocal' && (currentSection.style === 'hold' || currentSection.style === 'simple');
            
            if (canHold && lanes.length === 1) {
                const maxDur = nextNoteTime - onset.time - 0.1;
                const idealDur = Math.min(0.5, 60/structure.bpm);
                
                if (maxDur > 0.2) { 
                    duration = Math.min(maxDur, idealDur);
                }
            }

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
    return Math.max(1, Math.sqrt(diff * 0.03) * 2.1);
};
