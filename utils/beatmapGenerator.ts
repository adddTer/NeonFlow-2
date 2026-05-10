
import { Note, NoteLane, Onset, SongStructure, BeatmapDifficulty, LaneCount, PlayStyle, MotionDescriptors, NoteType } from '../types';

// Interpolation helper
const lerp = (start: number, end: number, t: number) => start * (1 - t) + end * t;

// Continuous Difficulty Configuration (Level 1 to 20)
const getDifficultyConfig = (level: number) => {
    const l = Math.max(1, Math.min(20, level));
    const t = (l - 1) / 19; 

    return {
        // Threshold Multiplier:
        // Adjusted: Level 1 was 3.5 (Too empty), now 2.2 (Main beat focused).
        // Level 20: 0.01 (All details).
        thresholdMultiplier: lerp(2.2, 0.01, t),
        
        // Min Gap: 
        // Adjusted: Level 1 was 0.8s, now 0.6s (Allowing slow 1/4 beats).
        minGap: lerp(0.6, 0.04, Math.pow(t, 0.7)), 
        
        // Polyphony: Earlier access to chords.
        maxPolyphony: l < 4 ? 1 : l < 8 ? 2 : l < 14 ? 3 : 4,
        
        // Physics cost: Higher levels allow more strain/movement.
        allowedCost: lerp(1.5, 50.0, t),
        
        // Pattern Chance: Always try to pattern at high levels.
        patternChance: lerp(0.05, 1.0, Math.pow(t, 0.5)) 
    };
};

export interface BeatmapFeatures {
    normal: boolean;
    holds: boolean;
    catch: boolean;
}

const quantizeOnsets = (onsets: Onset[], bpm: number): Onset[] => {
    if (onsets.length < 2) return onsets;
    const beatDur = 60 / bpm;
    
    // Snap resolution: 1/24th of a beat covers 1/2, 1/3, 1/4, 1/6, 1/8 notes.
    const tickDur = beatDur / 24;
    
    // Find strong anchor points throughout the song to create a rolling phase map
    // Instead of a single global offset, we use robust local offsets to prevent tempo drift
    const strongHits = onsets.filter(o => o.isLowFreq && o.energy > 0.7).sort((a,b) => a.time - b.time);
    const quantizedMap = new Map<number, Onset>();
    
    for (const onset of onsets) {
        // Find nearest strong hit to act as an anchor
        let nearestAnchorTime = onset.time;
        if (strongHits.length > 0) {
            let closest = strongHits[0];
            let minDiff = Math.abs(onset.time - closest.time);
            for (let i = 1; i < strongHits.length; i++) {
                const diff = Math.abs(onset.time - strongHits[i].time);
                if (diff < minDiff) { minDiff = diff; closest = strongHits[i]; }
            }
            // Only use as anchor if it aligns somewhat with the beat grid
            nearestAnchorTime = closest.time;
        }

        const offset = nearestAnchorTime % tickDur; 
        const rel = onset.time - offset;
        const ticks = Math.round(rel / tickDur);
        let snappedTime = offset + ticks * tickDur;
        
        // If the note is very close to a snap point, snap it. Otherwise, keep its original time (organic groove)
        if (Math.abs(snappedTime - onset.time) > 0.05) {
             snappedTime = onset.time;
        }
        
        // Clean floating point errors
        snappedTime = Math.round(snappedTime * 1000) / 1000;
        
        // Prevent negative times
        if (snappedTime < 0) snappedTime = onset.time;

        if (quantizedMap.has(snappedTime)) {
             const existing = quantizedMap.get(snappedTime)!;
             // Merge simultaneously snapped onsets
             existing.energy = Math.max(existing.energy, onset.energy);
             if (onset.isLowFreq) existing.isLowFreq = true;
             existing.pitch = (onset.energy > existing.energy) ? onset.pitch : existing.pitch;
        } else {
             quantizedMap.set(snappedTime, { ...onset, time: snappedTime });
        }
    }
    
    return Array.from(quantizedMap.values()).sort((a,b) => a.time - b.time);
};

class ErgonomicPhysics {
    private laneCount: number;
    private bias: string;
    private lastLanes: number[] = [2];
    private lastTime: number = 0;
    private leftHandStrain: number = 0;
    private rightHandStrain: number = 0;
    private momentum: number = 0; // Traces movement flow
    
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

    getCost(targetLanes: number[], currentTime: number, style: string, flow: string, allowOverlap: boolean, preferredLane?: number): number {
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
        
        // --- FLUID MOMENTUM COST ---
        // Reward continuing movement in the same direction, penalize sudden stops/reversals 
        // unless it's a jump style or the boundary is reached
        const expectedMovement = this.momentum;
        let flowPenalty = 0;
        
        if (style === 'stream' || flow === 'linear') {
            // Reward smooth continuous motion
            if (movement * expectedMovement > 0) flowPenalty -= 1.5; // same direction
            if (movement === 0) flowPenalty += 1.0; 
        } else if (style === 'jump' || flow === 'random') {
            // Reward breaks in momentum
            if (Math.abs(movement) < 1.5) flowPenalty += 2.0;
            if (movement * expectedMovement < 0) flowPenalty -= 1.0; // zigzag/bounce
        }
        
        cost += flowPenalty;

        // --- DISTANCE PENALTY ---
        let distanceMultiplier = style === 'jump' ? 0.2 : (style === 'stream' ? 2.5 : 1.0);
        cost += Math.abs(movement) * distanceMultiplier;

        // Jackhammer Penalty (Repeated Notes)
        const isJackAllowed = style === 'jump' || flow === 'random' || timeDelta > 0.25;
        for (const lane of targetLanes) {
            if (this.lastLanes.includes(lane)) {
                if (timeDelta < 0.15 && !isJackAllowed) return 9999; 
                cost += (0.2 / timeDelta) * 3; 
            }
        }

        // Pitch Preferred Lane Synergy (Soft Guidance)
        if (preferredLane !== undefined && targetLanes.length === 1) {
            const lane = targetLanes[0];
            const dist = Math.abs(lane - preferredLane);
            cost += dist * 0.8; // Reduced weight to let flow dominate
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
        
        // Exponential moving average for momentum
        this.momentum = this.momentum * 0.4 + movement * 0.6;

        lanes.forEach(lane => {
            if (this.getHand(lane) === 'LEFT') this.leftHandStrain += 1.0;
            else this.rightHandStrain += 1.0;
        });

        this.lastLanes = lanes;
        this.lastTime = currentTime;
    }

    getBestLanes(count: number, currentTime: number, maxCost: number, style: string, flow: string, allowOverlap: boolean = false, preferredLane?: number): number[] {
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
            let cost = this.getCost(chord, currentTime, style, flow, allowOverlap, preferredLane); 
            
            // HUMAN FEEL: symmetric chords feel extremely satisfying in 4-lane
            if (this.laneCount === 4 && chord.length === 2) {
                const isSymmetric = (chord.includes(0) && chord.includes(3)) || (chord.includes(1) && chord.includes(2));
                if (isSymmetric) {
                    cost -= 2.0; // Big reward for symmetry
                }
            }

            if (cost < minCandidateCost) {
                minCandidateCost = cost;
                bestCandidate = chord;
            }
        }
        
        this.commit(bestCandidate, currentTime);
        return bestCandidate;
    }
}

// ... PatternLibrary remains unchanged ...
const PatternLibrary = {
    getSlideStream: (startTime: number, duration: number, startLane: number, laneCount: number) => {
        const notes: any[] = [];
        const interval = 0.05; // Dense 50ms interval for satisfying swoosh
        const count = Math.max(3, Math.floor(duration / interval));
        const endLane = startLane < laneCount / 2 ? laneCount - 1 : 0;
        
        for(let i = 0; i < count; i++) {
            const progress = i / (count - 1);
            // Smooth easing for the slide
            const easeProgress = progress * progress * (3 - 2 * progress); 
            const floatLane = startLane + (endLane - startLane) * easeProgress;
            notes.push({ time: startTime + i * interval, lane: Math.round(floatLane) });
        }
        return notes;
    },
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

    const onsets = quantizeOnsets(rawOnsets, structure.bpm);
    const config = getDifficultyConfig(numericDiff);
    const physics = new ErgonomicPhysics(laneCount);

    // 1. Calculate pitch distribution to assign tracks dynamically but evenly
    // We filter out 0 pitches, then sort them to find CDF (percentiles)
    const pitches = onsets.map(o => o.pitch || 0).filter(p => p > 0).sort((a,b) => a - b);
    
    const getPitchLaneTarget = (pitch: number | undefined): number | undefined => {
        if (!pitch || pitch <= 0 || pitches.length === 0) return undefined; // No valid pitch
        
        // Find percentile using binary search or simple findIndex (since array is relatively small)
        // For perf, simple binary search for closest
        let l = 0, r = pitches.length - 1;
        while (l < r) {
            const mid = Math.floor((l + r) / 2);
            if (pitches[mid] < pitch) l = mid + 1;
            else r = mid;
        }
        
        const percentile = l / pitches.length;
        
        // Map percentile [0, 1] to lane [0, laneCount - 1]
        // E.g. Low pitches on the left, high pitches on the right
        return Math.floor(percentile * laneCount * 0.99); // 0.99 ensures it doesn't hit laneCount
    };

    let notes: Note[] = [];
    let noteIndex = 0;
    let lastGeneratedTime = -10.0; 
    let isCatchChain = false; 
    let catchDirection = 1;
    
    // Rhythm & Structure Analysis Constants
    const beatDur = 60 / structure.bpm;
    const measureDur = beatDur * 4;
    // Try to align to an anchor to detect downbeats
    const anchor = onsets.length > 0 ? (onsets.find(o => o.isLowFreq && o.energy > 0.8)?.time || onsets[0].time) : 0;

    while (noteIndex < onsets.length) {
        const onset = onsets[noteIndex];
        
        const currentSection = structure.sections.find(
            s => onset.time >= s.startTime && onset.time < s.endTime
        ) || structure.sections[0];
        
        const desc = currentSection.descriptors || { flow: 'random', hand_bias: 'balanced', focus: 'melody' };
        const style = currentSection.style || 'stream';

        physics.setBias(desc.hand_bias);
        
        // Update held lanes context for physics engine
        const activeHolds = notes.filter(n => n.duration > 0 && n.time <= onset.time && n.time + n.duration > onset.time);
        physics.setHeldLanes(activeHolds.map(n => n.lane));

        // --- Special Pattern Handling (Burst/Fill) ---
        // AI specifically requested a rhythmic fill here
        if (desc.special_pattern === 'burst' || desc.special_pattern === 'fill') {
            // Force generation regardless of threshold if it's a "burst" area
            
            let notesToAdd = 1;
            if (desc.special_pattern === 'burst') notesToAdd = 2; // Chord stream
            
            // Bypass minGap check for bursts
            const preferredLane = getPitchLaneTarget(onset.pitch);
            const lanes = physics.getBestLanes(notesToAdd, onset.time, 9999, 'stream', 'random', false, preferredLane);
            
            lanes.forEach(lane => {
                notes.push(createNote(onset.time, lane, 0, 'NORMAL', onset));
            });
            
            lastGeneratedTime = onset.time;
            noteIndex++;
            continue;
        }

        // --- Standard Generation & Energy Filtering ---
        const baseThreshold = 0.05 + (1.0 - currentSection.intensity) * 0.2;
        const dynThreshold = baseThreshold * config.thresholdMultiplier;
        
        let isGhostNote = false;
        
        // NEW: Sibilant sounds (high ZCR like hi-hats/shakers) feel energetic even if RMS is low.
        const isSibilant = onset.zcr !== undefined && onset.zcr > 0.35;
        const effectiveEnergy = isSibilant ? onset.energy * 2.0 : onset.energy;

        if (effectiveEnergy < dynThreshold) {
            // Instead of fully skipping, let's treat faint notes as "ghost notes". 
            // We only keep them if they are part of a slide or close to the previous note.
            const timeSinceLast = onset.time - lastGeneratedTime;
            const ghostWindow = isSibilant ? 0.5 : 0.3; // Allow shakers to form longer distinct chains

            if (features.catch && timeSinceLast > 0 && timeSinceLast < ghostWindow) {
                isGhostNote = true; // Demote to CATCH note to maintain flow without adding strain
            } else {
                noteIndex++;
                isCatchChain = false; 
                continue;
            }
        }

        if (onset.time - lastGeneratedTime < config.minGap && !isGhostNote && !isSibilant) {
            noteIndex++;
            continue;
        }

        // --- Pattern Selection Logic ---
        const lookAhead = 3; 
        const canPattern = 
            features.normal &&
            Math.random() < config.patternChance &&
            noteIndex + lookAhead < onsets.length;

        // Skip pattern library if flow is 'random', we want unique generation via physics
        if (canPattern && desc.flow !== 'random') {
            const nextOnset = onsets[noteIndex+1];
            const interval = nextOnset.time - onset.time;
            
            // Generate dense Catch streams for long slides or smooth pitch changes
            const isExplicitSlide = desc.flow === 'slide' && features.catch;
            const isSwooping = isExplicitSlide && ((onset.duration && onset.duration > 0.25) || interval > 0.35);

            if (isSwooping) {
                const slideDuration = onset.duration && onset.duration > 0.25 ? Math.min(onset.duration, 1.5) : Math.min(interval, 1.0);
                const startL = getPitchLaneTarget(onset.pitch) ?? Math.floor(Math.random() * laneCount);
                const slidePattern = PatternLibrary.getSlideStream(onset.time, slideDuration, startL, laneCount);
                
                // Consume all onsets that fall into this slide's timeframe to prevent clumps
                let notesConsumed = 0;
                for(let k = 1; k < onsets.length - noteIndex; k++) {
                    if (onsets[noteIndex + k].time < onset.time + slideDuration - 0.05) {
                        notesConsumed++;
                    } else {
                        break;
                    }
                }

                slidePattern.forEach(p => {
                    physics.commit([p.lane], p.time); 
                    notes.push(createNote(p.time, p.lane, 0, 'CATCH', onset));
                    lastGeneratedTime = p.time;
                });
                
                noteIndex += notesConsumed;
                isCatchChain = true;
                continue;
            }

            if (interval < 0.4 && interval >= config.minGap * 0.8) {
                let generatedPattern: any[] = [];
                let notesConsumed = 0;
                let patternType: NoteType = 'NORMAL';
                const len = Math.min(4, onsets.length - noteIndex);

                // const r = Math.random(); // unused
                
                const isExplicitSlide = desc.flow === 'slide' && features.catch;
                const isLinear = desc.flow === 'linear';
                
                if (isExplicitSlide) {
                    const dir = Math.random() > 0.5 ? 1 : -1;
                    // Start from the pitch lane, or default to edge
                    const startL = getPitchLaneTarget(onset.pitch) ?? (dir === 1 ? 0 : laneCount - 1);
                    generatedPattern = PatternLibrary.getStair(onset.time, len, interval, startL, dir, laneCount);
                    patternType = 'CATCH';
                    isCatchChain = true;
                }
                else if (isLinear) {
                    // Decide based on difficulty if 'linear' becomes slider or stream
                    const treatAsSlide = numericDiff < 8 && features.catch;
                    
                    const dir = Math.random() > 0.5 ? 1 : -1;
                    const startL = getPitchLaneTarget(onset.pitch) ?? (dir === 1 ? 0 : laneCount - 1);
                    generatedPattern = PatternLibrary.getStair(onset.time, len, interval, startL, dir, laneCount);
                    
                    patternType = treatAsSlide ? 'CATCH' : 'NORMAL';
                    if (treatAsSlide) isCatchChain = true;
                    
                    if (generatedPattern.length > 0) notesConsumed = len;
                }
                // --- Fallback Patterns ---
                else if (desc.flow === 'circular') {
                    if (Math.random() < 0.6) {
                        generatedPattern = PatternLibrary.getRoll(onset.time, len, interval, laneCount);
                    } else {
                        const dir = 1;
                        const startL = getPitchLaneTarget(onset.pitch) ?? 0;
                        generatedPattern = PatternLibrary.getStair(onset.time, len, interval, startL, dir, laneCount);
                    }
                    notesConsumed = len;
                }
                else if (desc.flow === 'zigzag') {
                     const l1 = getPitchLaneTarget(onset.pitch) ?? Math.floor(Math.random() * laneCount);
                     let l2 = (l1 + 2) % laneCount; 
                     generatedPattern = PatternLibrary.getTrill(onset.time, len, interval, l1, l2);
                     notesConsumed = len;
                }

                if (generatedPattern.length > 0) {
                    generatedPattern.forEach(p => {
                        physics.commit([p.lane], p.time); 
                        notes.push(createNote(p.time, p.lane, 0, patternType, onset));
                        lastGeneratedTime = p.time;
                    });
                    noteIndex += notesConsumed; 
                    continue;
                }
            }
        }

        // --- Rhythm & Structure Analysis ---
        const offsetFromAnchor = Math.abs(onset.time - anchor);
        const isDownbeat = (offsetFromAnchor % measureDur < 0.05 || offsetFromAnchor % measureDur > measureDur - 0.05);

        // --- Polyphony (Chords) ---
        let simNotes = 1;
        if (config.maxPolyphony > 1 && !isGhostNote) {
            const isHeavyHit = onset.energy > 0.9 && onset.isLowFreq;
            const isCrashCymbal = onset.energy > 0.8 && onset.zcr !== undefined && onset.zcr > 0.25; // Loud & Noisy
            
            if (isHeavyHit || (desc.focus === 'drum' && onset.energy > 0.8) || isCrashCymbal) simNotes = 2;
            if (numericDiff >= 18 && (onset.energy > 0.95 || (isCrashCymbal && isHeavyHit))) simNotes = 3;
            
            // HUMAN FEEL: Emphasize downbeats (Start of a measure in 4/4)
            if (isDownbeat && onset.energy > 0.6) {
                simNotes = Math.max(simNotes, 2); // Downbeat chord
            }
        }
        
        if (activeHolds.length > 0 && features.catch) {
             simNotes = Math.max(simNotes, 1);
        } else {
             // Reduce max polyphony if many holds are active
             simNotes = Math.min(simNotes, config.maxPolyphony - activeHolds.length);
        }
        
        simNotes = Math.max(1, Math.min(simNotes, config.maxPolyphony));
        if (playStyle === 'THUMB' && numericDiff < 18) simNotes = Math.min(simNotes, 2);

        // --- Decide Note Type before Physics ---
        let isCatchGeneration = false;
        
        if (features.catch && activeHolds.length > 0) {
            if (Math.random() < 0.5) isCatchGeneration = true;
        }
        
        if (isGhostNote) {
            isCatchGeneration = true;
        }

        // Generate Single/Chord via Physics
        // Pass style and flow to physics for smarter random/jump handling
        // If it's a catch chain/ghost note, try to use the last lane to create a slide.
        let preferredLane = getPitchLaneTarget(onset.pitch);
        if (isCatchChain || isGhostNote) {
            if (notes.length > 0) {
                let nextLane = notes[notes.length - 1].lane + catchDirection;
                if (nextLane < 0 || nextLane >= laneCount) {
                    catchDirection *= -1;
                    nextLane = notes[notes.length - 1].lane + catchDirection;
                }
                preferredLane = Math.max(0, Math.min(laneCount - 1, nextLane));
            }
        }
        
        const lanes = physics.getBestLanes(simNotes, onset.time, config.allowedCost, style, desc.flow, isCatchGeneration, preferredLane);

        let nextNoteTime = 9999;
        if (noteIndex + 1 < onsets.length) nextNoteTime = onsets[noteIndex+1].time;
        
        const beatDur = 60 / structure.bpm;

        lanes.forEach(lane => {
            let type: NoteType = 'NORMAL';
            let duration = 0;

            // Check if this lane is currently holding
            const isLaneHolding = activeHolds.some(h => h.lane === lane);

            // --- HOLD LOGIC REFACTOR ---
            if (features.holds && !isLaneHolding && !isGhostNote) {
                // Scan forward to see when the next SIMILAR energy/pitch note is
                // This prevents hi-hats from cutting off vocal/melody holds!
                let nextSimilarNoteTime = onset.time + beatDur * 4; // cap at 4 beats
                let densityCount = 0; // count notes in the immediate future
                
                for(let j = noteIndex + 1; j < onsets.length; j++) {
                    const future = onsets[j];
                    if (future.time - onset.time > beatDur * 4) break;
                    
                    if (future.time - onset.time < beatDur * 1.5) {
                        densityCount++;
                    }
                    
                    // A major melody shift or a strong hit on the same freq range ends the hold
                    if (!future.isLowFreq && future.energy > 0.4) {
                        // If it's very close in time, it's a drum fill, so cut
                        if (future.time - onset.time < beatDur * 0.5) {
                            nextSimilarNoteTime = Math.min(nextSimilarNoteTime, future.time);
                            // Do not break immediately, we still want to count density
                        }
                        // Or if it's a prominent note
                        else if (future.energy > 0.7) {
                           nextSimilarNoteTime = Math.min(nextSimilarNoteTime, future.time);
                        }
                    }
                }
                
                let maxDur = nextSimilarNoteTime - onset.time;
                
                // If there are many rapid notes coming up, we shouldn't place a long hold here
                // because the player should be tapping that dense pattern!
                if (densityCount > 3 && maxDur > beatDur * 0.5) {
                    maxDur = beatDur * 0.5; // Severely limit hold
                }
                
                // For lower difficulties, prevent polyphony overlaps completely
                if (numericDiff <= 6) {
                     maxDur = Math.min(maxDur, nextNoteTime - onset.time);
                }
                
                const tooManyHolds = activeHolds.length >= 2 && numericDiff < 15;

                // Hold must at least span a 1/4 beat to look good
                if (maxDur > beatDur * 0.25 && !tooManyHolds) {
                    let holdChance = 0.0; 
                    
                    // HUMAN MAPPER LOGIC:
                    
                    // NEW: Hardware-based duration from DSP!
                    if (onset.duration !== undefined) {
                        if (onset.duration > beatDur * 0.5) holdChance += 1.0;
                        if (onset.duration > beatDur * 1.0) holdChance += 0.5;
                        // Limit maxDur based on actual sound sustain
                        maxDur = Math.min(maxDur, onset.duration + 0.1); 
                    }
                    
                    // 1. Long Gap = Sustained Sound (Vocals/Synths)
                    if (maxDur >= beatDur * 1.0) {
                        holdChance += Math.min(0.5, maxDur / (beatDur * 2));
                    }
                    
                    // 2. High Energy, Non-Kick hits that ring out (Crashes, shouts)
                    if (onset.energy > 0.8 && !onset.isLowFreq) {
                        holdChance += 0.4;
                    }
                    
                    // 3. Downbeats with space are extremely good hold positions
                    if (isDownbeat && maxDur > beatDur * 0.5) {
                        holdChance += 0.4;
                    }
                    
                    // 4. Thematic matching
                    if (style === 'hold') holdChance += 0.8; 
                    if (desc.focus === 'vocal' || desc.focus === 'melody') holdChance += 0.3;
                    if (numericDiff < 8) holdChance += 0.2; // Density scaling
                    
                    // 5. Short rapid notes should NOT be holds
                    if (maxDur < beatDur * 0.5 && style !== 'hold') holdChance -= 0.6;
                    
                    // Faint background notes should not be massive holds
                    if (onset.energy < 0.3) holdChance -= 0.8;
                    
                    // NEW: Use ZCR (Zero-Crossing Rate) to differentiate noisy vs tonal
                    if (onset.zcr !== undefined) {
                        if (onset.zcr > 0.35) { // Very noisy (snare, crash, shaker)
                            holdChance -= 2.0; // Hard kill on holds
                        } else if (onset.zcr < 0.1 && onset.duration !== undefined && onset.duration > beatDur * 0.5) { 
                            // Very tonal/harmonic and sustained (vocals, pure synth)
                            holdChance += 0.5;
                        }
                    }
                    
                    // 6. Kicks are rarely holds (unless forced by style)
                    if (onset.isLowFreq && onset.energy > 0.6) {
                         holdChance -= 1.0;
                         if (style !== 'hold') holdChance = -2.0; // Hard kill 
                    }

                    if (holdChance > 0 && Math.random() < holdChance) {
                        // Snap duration to grid to ensure it ends cleanly on a musical fraction
                        let targetDur = Math.min(maxDur, beatDur * 4.0);
                        
                        // Prevent holds from mindlessly stretching across long silent sections
                        // Cap at 2 beats for non-hold styles, or 1 measure for vocal/hold styles
                        const absoluteMax = (style === 'hold' || desc.focus === 'vocal') ? beatDur * 4.0 : beatDur * 1.5;
                        if (targetDur > absoluteMax) {
                            targetDur = absoluteMax;
                        }
                        
                        // We step back by 1/8th of a beat to leave a gap before the next note
                        const releaseGap = beatDur / 8;
                        targetDur = targetDur - releaseGap;
                        
                        // Only create if it's long enough to be distinct from a tap
                        if (targetDur >= beatDur * 0.25) {
                            duration = targetDur;
                        }
                    }
                }
            }

            // --- Catch Logic (Overlap Allowed) ---
            if (features.catch && duration === 0) {
                let catchChance = 0.0; 
                if (isGhostNote) catchChance = 1.0; // Force ghost notes to be CATCH
                
                if (isLaneHolding) {
                    catchChance = 1.0; 
                } else if (activeHolds.length > 0) {
                    catchChance += 0.6;
                }

                // Explicit Flow Logic for Meaningful Catch Notes
                if (!isGhostNote && activeHolds.length === 0) {
                    if (desc.flow === 'slide') catchChance = 0.6;
                    else if (isCatchChain) catchChance = 0.8; // Maintain the chain once it starts
                    else catchChance = 0; // DISABLE organic random single catch notes entirely
                }

                if (Math.random() < catchChance || isGhostNote) {
                    type = 'CATCH';
                    isCatchChain = true;
                } else {
                    isCatchChain = false; 
                }
            }

            notes.push(createNote(onset.time, lane, duration, type, onset));
        });

        lastGeneratedTime = onset.time;
        noteIndex++;
    }

    return notes;
};

const createNote = (time: number, lane: number, duration: number, type: NoteType, feature?: Partial<Onset>): Note => ({
    id: `note-${time.toFixed(3)}-${lane}`,
    time,
    lane: lane as NoteLane,
    hit: false,
    visible: true,
    duration,
    isHolding: false,
    type,
    pitch: feature?.pitch,
    zcr: feature?.zcr,
    energy: feature?.energy
});

export const calculateDifficultyRating = (notes: Note[], duration: number): number => {
    if (notes.length === 0 || duration === 0) return 0;
    const sortedNotes = [...notes].sort((a, b) => a.time - b.time);
    const SECTION_LENGTH = 0.5;
    const sections: number[] = [];
    let currentSectionStrain = 0;
    let currentSectionStart = 0;
    let previousNoteTime = -1;
    let previousNoteLane = -1;

    // Track last time each lane was hit to calculate jack strain
    const lastLaneTimes = new Map<number, number>();

    for (let i = 0; i < sortedNotes.length; i++) {
        const note = sortedNotes[i];
        
        while (note.time > currentSectionStart + SECTION_LENGTH) {
            sections.push(currentSectionStrain);
            currentSectionStrain = 0; 
            currentSectionStart += SECTION_LENGTH;
        }

        if (previousNoteTime === -1) {
            previousNoteTime = note.time;
            previousNoteLane = note.lane;
            lastLaneTimes.set(note.lane, note.time);
            currentSectionStrain += 1;
            continue;
        }

        const timeDelta = note.time - previousNoteTime;
        let strain = 0;

        if (timeDelta < 0.015) {
            // It's a chord! Add a small flat strain for chord density
            strain = 1.2; 
        } else {
            // Speed strain: base is 1 / (timeDelta^0.8) to penalize slow sections but reward speed
            strain = 1.0 / Math.pow(Math.max(timeDelta, 0.04), 0.8);
        }

        // Catch flow logic
        if (note.type === 'CATCH') {
            const isSmoothFlow = previousNoteLane !== -1 && 
                                 Math.abs(note.lane - previousNoteLane) <= 1 && 
                                 timeDelta < 0.25 && timeDelta >= 0.015;

            if (isSmoothFlow) {
                strain *= 0.15; // Smooth slides are easy
            } else {
                strain *= 0.6; // General slides
            }
        } 
        else if (note.duration > 0) {
            strain *= 0.85; // Holds are slightly easier than standard click streams
        }

        // Jacking strain (same lane hit quickly)
        const lastLaneTime = lastLaneTimes.get(note.lane) || -1;
        if (lastLaneTime !== -1 && note.type !== 'CATCH') {
            const laneDelta = note.time - lastLaneTime;
            if (laneDelta > 0.015 && laneDelta < 0.2) {
                strain += (0.2 / laneDelta) * 1.5;
            }
        }

        currentSectionStrain += strain;
        previousNoteTime = note.time;
        previousNoteLane = note.lane;
        lastLaneTimes.set(note.lane, note.time);
    }
    
    sections.push(currentSectionStrain);
    sections.sort((a, b) => b - a);
    
    let diff = 0;
    let weight = 1.0;
    const topSections = Math.min(sections.length, 40); 
    for (let i = 0; i < topSections; i++) {
        diff += sections[i] * weight;
        weight *= 0.85;
    }

    // Baseline tuning
    let finalRating = Math.pow(diff, 0.6) * 0.9;
    
    // Density bonus
    const nps = notes.length / duration;
    finalRating += nps * 0.2;

    return Math.max(1, parseFloat(finalRating.toFixed(2)));
};
