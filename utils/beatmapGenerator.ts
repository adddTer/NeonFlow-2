
import { Note, NoteLane, Onset, SongStructure, BeatmapDifficulty, LaneCount, PlayStyle, MotionDescriptors, NoteType } from '../types';

// Interpolation helper
const lerp = (start: number, end: number, t: number) => start * (1 - t) + end * t;

// Continuous Difficulty Configuration (Level 1 to 20)
const getDifficultyConfig = (level: number) => {
    const l = Math.max(1, Math.min(20, level));
    const t = (l - 1) / 19; 

    return {
        // Lower multiplier = more notes. Level 20 now detects almost everything (0.1).
        thresholdMultiplier: lerp(2.0, 0.1, t),
        
        // Min Gap: Level 20 allows ~0.02s gap (High BPM streams/jacks).
        // Curve is aggressive at the end for exponential difficulty.
        minGap: lerp(0.40, 0.02, Math.pow(t, 0.6)), 
        
        // Polyphony: Earlier access to chords.
        maxPolyphony: l < 4 ? 1 : l < 8 ? 2 : l < 14 ? 3 : 4,
        
        // Physics cost: Higher levels allow more strain/movement.
        allowedCost: lerp(1.5, 40.0, t),
        
        // Pattern Chance: Always try to pattern at high levels.
        patternChance: lerp(0.15, 1.0, Math.pow(t, 0.5)) 
    };
};

export interface BeatmapFeatures {
    normal: boolean;
    holds: boolean;
    catch: boolean;
}

const alignOnsetsLocal = (onsets: Onset[], bpm: number): Onset[] => {
    if (onsets.length < 2) return onsets;
    const sorted = [...onsets].sort((a, b) => a.time - b.time);
    const aligned: Onset[] = [];
    const groupingThreshold = 0.02;

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
            for(let k=0; k<group.length; k++) group[k].time = anchorTime + (k * avgDelta);
        }
        aligned.push(...group);
        i = j;
    }
    return aligned.filter((o, idx, arr) => idx === 0 || o.time > arr[idx-1].time + 0.005);
};

class ErgonomicPhysics {
    private laneCount: number;
    private bias: string;
    private lastLanes: number[] = [2];
    private lastTime: number = 0;
    private lastFlowDirection: number = 0;
    private leftHandStrain: number = 0;
    private rightHandStrain: number = 0;
    
    public heldLanes: number[] = []; // Track currently holding lanes

    constructor(laneCount: number) {
        this.laneCount = laneCount;
        this.bias = 'balanced';
    }

    setBias(bias: string) { this.bias = bias; }
    
    setHeldLanes(lanes: number[]) { this.heldLanes = lanes; }

    private getHand(lane: number): 'LEFT' | 'RIGHT' {
        return lane < this.laneCount / 2 ? 'LEFT' : 'RIGHT';
    }

    updateStrain(currentTime: number) {
        const dt = currentTime - this.lastTime;
        const decay = Math.max(0, dt * 5.0); 
        this.leftHandStrain = Math.max(0, this.leftHandStrain - decay);
        this.rightHandStrain = Math.max(0, this.rightHandStrain - decay);
    }

    getCost(targetLanes: number[], currentTime: number, isJackAllowed: boolean, allowOverlap: boolean): number {
        // Forbidden to generate on currently held lanes, unless overlap is explicitly allowed (e.g. Catch notes)
        if (!allowOverlap) {
            for (const lane of targetLanes) {
                if (this.heldLanes.includes(lane)) return 999999;
            }
        }

        this.updateStrain(currentTime);
        const timeDelta = Math.max(0.01, currentTime - this.lastTime);
        let cost = 0;
        
        const prevAvg = this.lastLanes.reduce((a,b)=>a+b,0) / this.lastLanes.length;
        const currAvg = targetLanes.reduce((a,b)=>a+b,0) / targetLanes.length;
        const movement = currAvg - prevAvg;
        cost += Math.abs(movement) * 1.5;

        // Flow Break Penalty
        if ((this.lastFlowDirection > 0 && movement > 0) || (this.lastFlowDirection < 0 && movement < 0)) {
            cost -= 1.0; 
        }

        // Jackhammer Penalty (Repeated Notes)
        for (const lane of targetLanes) {
            if (this.lastLanes.includes(lane)) {
                if (timeDelta < 0.15 && !isJackAllowed) return 9999; 
                cost += (0.3 / timeDelta) * 5; 
            }
        }

        // Hand Balance & Bias
        let lLoad = 0, rLoad = 0;
        targetLanes.forEach(lane => this.getHand(lane) === 'LEFT' ? lLoad++ : rLoad++);

        if (this.bias === 'left_heavy' && rLoad > 0) cost += rLoad * 2;
        if (this.bias === 'right_heavy' && lLoad > 0) cost += lLoad * 2;
        
        if (this.bias === 'alternating') {
            const prevL = this.lastLanes.some(l => this.getHand(l) === 'LEFT');
            const prevR = this.lastLanes.some(l => this.getHand(l) === 'RIGHT');
            if (prevL && !prevR && lLoad > 0) cost += 5;
            if (prevR && !prevL && rLoad > 0) cost += 5;
        }

        // Strain Cap
        if (this.leftHandStrain > 3 && lLoad > 0) cost += this.leftHandStrain * 2;
        if (this.rightHandStrain > 3 && rLoad > 0) cost += this.rightHandStrain * 2;

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

    getBestLanes(count: number, currentTime: number, maxCost: number, style: string, allowOverlap: boolean = false): number[] {
        // Filter out held lanes from candidates ONLY if overlap is NOT allowed
        const allLanes = Array.from({length: this.laneCount}, (_, i) => i)
            .filter(l => allowOverlap || !this.heldLanes.includes(l));
            
        if (allLanes.length < count) {
            // Fallback: If not enough lanes, return whatever is available or just empty
            if (allLanes.length > 0) return allLanes.slice(0, count);
            return []; 
        }

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
        if (candidates.length === 0) return [];

        let bestCandidate = candidates[0];
        let minCandidateCost = 99999;

        // Shuffle to add variety when costs are equal
        candidates.sort(() => Math.random() - 0.5);

        for (const chord of candidates) {
            const cost = this.getCost(chord, currentTime, style === 'simple', allowOverlap); 
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
    },
    getJack: (startTime: number, count: number, interval: number, lane: number) => {
        const notes: any[] = [];
        for(let i=0; i<count; i++) {
            notes.push({ time: startTime + i*interval, lane });
        }
        return notes;
    },
    getBurst: (startTime: number, count: number, laneCount: number) => {
        // High density random burst for "special_pattern"
        const notes: any[] = [];
        // fast 1/16 stream or chord stream
        const interval = 0.05; 
        for(let i=0; i<count; i++) {
            notes.push({ time: startTime + i*interval, lane: Math.floor(Math.random() * laneCount) });
        }
        return notes;
    }
};

export const generateBeatmap = (
    rawOnsets: Onset[], 
    structure: SongStructure, 
    difficulty: number | BeatmapDifficulty = 10,
    laneCount: LaneCount = 4,
    playStyle: PlayStyle = 'THUMB',
    features: BeatmapFeatures = { normal: true, holds: true, catch: true }
): Note[] => {
    
    let numericDiff = 10;
    if (typeof difficulty === 'number') {
        numericDiff = difficulty;
    } else {
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
    let isCatchChain = false; 

    while (noteIndex < onsets.length) {
        const onset = onsets[noteIndex];
        
        const currentSection = structure.sections.find(
            s => onset.time >= s.startTime && onset.time < s.endTime
        ) || structure.sections[0];
        
        const desc = currentSection.descriptors || { flow: 'random', hand_bias: 'balanced', focus: 'melody' };
        
        physics.setBias(desc.hand_bias);
        
        // Update held lanes context for physics engine
        const activeHolds = notes.filter(n => n.duration > 0 && n.time <= onset.time && n.time + n.duration > onset.time);
        physics.setHeldLanes(activeHolds.map(n => n.lane));

        // --- Special Pattern Handling (Burst/Fill) ---
        // AI specifically requested a rhythmic fill here
        if (desc.special_pattern === 'burst' || desc.special_pattern === 'fill') {
            const beatDur = 60 / structure.bpm;
            // Force generation regardless of threshold if it's a "burst" area
            // "Burst" = high density, "Fill" = syncopated
            
            let notesToAdd = 1;
            if (desc.special_pattern === 'burst') notesToAdd = 2; // Chord stream
            
            // Bypass minGap check for bursts
            const lanes = physics.getBestLanes(notesToAdd, onset.time, 9999, 'stream');
            
            lanes.forEach(lane => {
                notes.push(createNote(onset.time, lane, 0, 'NORMAL'));
            });
            
            lastGeneratedTime = onset.time;
            noteIndex++;
            continue;
        }

        // --- Standard Generation ---
        const baseThreshold = 0.05 + (1.0 - currentSection.intensity) * 0.2;
        const dynThreshold = baseThreshold * config.thresholdMultiplier;
        
        if (onset.energy < dynThreshold) {
            noteIndex++;
            isCatchChain = false; 
            continue;
        }

        if (onset.time - lastGeneratedTime < config.minGap) {
            noteIndex++;
            continue;
        }

        // --- Pattern Selection Logic ---
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
                let patternType: NoteType = 'NORMAL';
                const len = Math.min(4, onsets.length - noteIndex);

                const r = Math.random();
                
                // --- Difficulty-Aware Flow Interpretation ---
                // If AI said "slide", make it Catch (Slider) regardless of difficulty (AI knows best).
                // If AI said "linear" (Stairs) and difficulty is LOW, force it to CATCH to be friendly.
                // If AI said "linear" and difficulty is HIGH, force it to NORMAL (Stream) for challenge.
                
                const isExplicitSlide = desc.flow === 'slide' && features.catch;
                const isLinear = desc.flow === 'linear';
                
                if (isExplicitSlide) {
                    const dir = Math.random() > 0.5 ? 1 : -1;
                    const startL = dir === 1 ? 0 : laneCount - 1;
                    generatedPattern = PatternLibrary.getStair(onset.time, len, interval, startL, dir, laneCount);
                    patternType = 'CATCH';
                    isCatchChain = true;
                }
                else if (isLinear) {
                    // Decide based on difficulty if 'linear' becomes slider or stream
                    const treatAsSlide = numericDiff < 8 && features.catch;
                    
                    const dir = Math.random() > 0.5 ? 1 : -1;
                    const startL = dir === 1 ? 0 : laneCount - 1;
                    generatedPattern = PatternLibrary.getStair(onset.time, len, interval, startL, dir, laneCount);
                    
                    patternType = treatAsSlide ? 'CATCH' : 'NORMAL';
                    if (treatAsSlide) isCatchChain = true;
                    
                    if (generatedPattern.length > 0) notesConsumed = len;
                }
                // --- Fallback Patterns ---
                else if (desc.flow === 'circular') {
                    if (r < 0.6) {
                        generatedPattern = PatternLibrary.getRoll(onset.time, len, interval, laneCount);
                    } else {
                        const dir = 1;
                        const startL = 0;
                        generatedPattern = PatternLibrary.getStair(onset.time, len, interval, startL, dir, laneCount);
                    }
                    notesConsumed = len;
                }
                else if (desc.flow === 'zigzag' || desc.flow === 'random') {
                    if (r < 0.4) {
                        const l1 = Math.floor(Math.random() * laneCount);
                        let l2 = (l1 + 2) % laneCount; 
                        generatedPattern = PatternLibrary.getTrill(onset.time, len, interval, l1, l2);
                    } else if (r < 0.7 || numericDiff < 12) {
                        notesConsumed = 0;
                    } else {
                        const l = Math.floor(Math.random() * laneCount);
                        generatedPattern = PatternLibrary.getJack(onset.time, len, interval, l);
                    }
                    if (generatedPattern.length > 0) notesConsumed = len;
                }

                if (generatedPattern.length > 0) {
                    generatedPattern.forEach(p => {
                        physics.commit([p.lane], p.time); 
                        notes.push(createNote(p.time, p.lane, 0, patternType));
                        lastGeneratedTime = p.time;
                    });
                    noteIndex += notesConsumed; 
                    continue;
                }
            }
        }

        // --- Polyphony (Chords) ---
        let simNotes = 1;
        if (config.maxPolyphony > 1) {
            const isHeavyHit = onset.energy > 0.9 && onset.isLowFreq;
            if (isHeavyHit || (desc.focus === 'drum' && onset.energy > 0.8)) simNotes = 2;
            if (numericDiff >= 18 && onset.energy > 0.95) simNotes = 3;
        }
        
        // Determine overlap behavior for CATCH notes
        // If we are generating a Catch, we allow overlap.
        // But here we are determining SIMULTANEOUS notes.
        // We handle catch generation separately below.
        
        if (activeHolds.length > 0 && features.catch) {
             // Allow at least 1 extra note if holding, specifically for Catch
             simNotes = Math.max(simNotes, 1);
        } else {
             // Standard hold restriction
             simNotes = Math.min(simNotes, config.maxPolyphony - activeHolds.length);
        }
        
        simNotes = Math.max(1, Math.min(simNotes, config.maxPolyphony));
        if (playStyle === 'THUMB' && numericDiff < 18) simNotes = Math.min(simNotes, 2);

        // --- Decide Note Type before Physics ---
        // We need to know if we are trying to generate a Catch note to allow overlap in physics
        let isCatchGeneration = false;
        
        // Simple heuristic: If we have active holds, and catch is enabled, high chance this beat is a catch
        // especially if it's a high energy hit or specific flow
        if (features.catch && activeHolds.length > 0) {
            if (Math.random() < 0.5) isCatchGeneration = true;
        }

        // Generate Single/Chord via Physics
        // Pass 'isCatchGeneration' as 'allowOverlap' to physics engine
        const lanes = physics.getBestLanes(simNotes, onset.time, config.allowedCost, currentSection.style as any, isCatchGeneration);

        let nextNoteTime = 9999;
        if (noteIndex + 1 < onsets.length) nextNoteTime = onsets[noteIndex+1].time;
        
        const beatDur = 60 / structure.bpm;

        lanes.forEach(lane => {
            let type: NoteType = 'NORMAL';
            let duration = 0;

            // Check if this lane is currently holding
            const isLaneHolding = activeHolds.some(h => h.lane === lane);

            // --- Hold Logic ---
            // Only generate hold if no other hold active (simple logic) or if high level
            // AND the lane is not already holding (overlap hold-on-hold is bad)
            if (features.holds && lanes.length === 1 && activeHolds.length === 0 && !isLaneHolding) {
                const maxDur = nextNoteTime - onset.time - 0.1;
                
                if (maxDur > beatDur * 0.5) {
                    let holdChance = 0.15; 
                    
                    if (currentSection.style === 'hold') holdChance += 0.5;
                    if (currentSection.style === 'simple') holdChance += 0.2;
                    if (desc.focus === 'vocal' || desc.focus === 'melody') holdChance += 0.25;
                    if (numericDiff < 8) holdChance += 0.1; 

                    if (Math.random() < holdChance) {
                        duration = Math.min(maxDur, beatDur * 2.0); 
                    }
                }
            }

            // --- Catch Logic (Overlap Allowed) ---
            if (features.catch && duration === 0) {
                let catchChance = 0.05; 
                
                // If this lane is holding, force catch if we decided to generate on it
                if (isLaneHolding) {
                    catchChance = 1.0; 
                } else if (activeHolds.length > 0) {
                    catchChance += 0.4;
                }

                if (desc.flow === 'slide') catchChance = 0.9;
                if (isCatchChain) catchChance += 0.6;
                if (desc.flow === 'circular' && currentSection.style === 'stream') catchChance += 0.3;
                if (onset.energy > 0.8 && desc.focus === 'bass') catchChance += 0.2; 

                if (desc.flow === 'linear' || desc.flow === 'zigzag') catchChance = 0; 

                if (Math.random() < catchChance) {
                    type = 'CATCH';
                    isCatchChain = true;
                } else {
                    isCatchChain = false; 
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
        
        // Weighting for CATCH (Slider) notes
        if (note.type === 'CATCH') {
            // Check for smooth flow (Close in time AND adjacent lane)
            const isSmoothFlow = previousNoteLane !== -1 && 
                                 Math.abs(note.lane - previousNoteLane) <= 1 && 
                                 timeDelta < 0.25;

            if (isSmoothFlow) {
                strain *= 0.1; // Almost negligible difficulty for smooth slides
            } else {
                strain *= 0.8; // Standard catch weight
            }
        } 
        // Weighting for Holds
        else if (note.duration > 0) {
            strain *= 0.95;
        }

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
