
import { useState, useRef, useEffect, useCallback } from 'react';
import { Note, SongStructure, NoteLane, LaneCount, NoteType } from '../types';

export type EditorTool = 'SELECT' | 'ADD' | 'DELETE' | 'HOLD';
export type SnapDivisor = 1 | 2 | 4 | 8 | 16 | 32;

interface UseChartEditorProps {
    initialNotes: Note[];
    audioBuffer: AudioBuffer | null;
    structure: SongStructure | undefined;
    laneCount: LaneCount;
    onSave: (notes: Note[]) => void;
}

export const useChartEditor = ({
    initialNotes,
    audioBuffer,
    structure,
    laneCount,
    onSave
}: UseChartEditorProps) => {
    // -- Data State --
    const [notes, setNotes] = useState<Note[]>(JSON.parse(JSON.stringify(initialNotes)));
    const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    
    // -- Playback State --
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [playbackRate, setPlaybackRate] = useState(1.0);
    
    // -- Editor Config State --
    const [snapDivisor, setSnapDivisor] = useState<SnapDivisor>(4);
    const [activeTool, setActiveTool] = useState<EditorTool>('SELECT');
    const [zoomLevel, setZoomLevel] = useState(1.0);

    // -- Audio Internals --
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<AudioBufferSourceNode | null>(null);
    const startTimeRef = useRef<number>(0);
    const startOffsetRef = useRef<number>(0);
    const animationFrameRef = useRef<number>(0);

    // -- Helpers --
    const bpm = structure?.bpm || 120;
    const beatDuration = 60 / bpm;

    const getSnapTime = useCallback((time: number) => {
        if (snapDivisor === 32) return time; 
        const snapInterval = beatDuration / (snapDivisor / 1); 
        return Math.round(time / snapInterval) * snapInterval;
    }, [beatDuration, snapDivisor]);

    // High Precision Time Getter for Recording
    const getExactTime = useCallback(() => {
        // If playing, calculate time based on AudioContext to avoid React state lag
        if (isPlaying && audioContextRef.current) {
            const now = audioContextRef.current.currentTime;
            const elapsed = (now - startTimeRef.current) * playbackRate;
            return startOffsetRef.current + elapsed;
        }
        return currentTime;
    }, [isPlaying, currentTime, playbackRate]);

    // -- Audio Control --
    const togglePlay = useCallback(() => {
        if (isPlaying) {
            pause();
        } else {
            play();
        }
    }, [isPlaying, currentTime, audioBuffer, playbackRate]);

    const play = () => {
        if (!audioBuffer) return;
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
        if (!audioContextRef.current) audioContextRef.current = new Ctx();
        const ctx = audioContextRef.current!;

        if (ctx.state === 'suspended') ctx.resume();

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.playbackRate.value = playbackRate;

        if (currentTime >= audioBuffer.duration) {
            setCurrentTime(0);
            startOffsetRef.current = 0;
        } else {
            startOffsetRef.current = currentTime;
        }

        startTimeRef.current = ctx.currentTime;
        source.start(0, startOffsetRef.current);
        sourceRef.current = source;
        setIsPlaying(true);

        const tick = () => {
            const now = ctx.currentTime;
            const elapsed = (now - startTimeRef.current) * playbackRate;
            const newTime = startOffsetRef.current + elapsed;
            
            if (newTime >= audioBuffer.duration) {
                setCurrentTime(audioBuffer.duration);
                setIsPlaying(false);
                return;
            }

            setCurrentTime(newTime);
            animationFrameRef.current = requestAnimationFrame(tick);
        };
        animationFrameRef.current = requestAnimationFrame(tick);
    };

    const pause = () => {
        if (sourceRef.current) {
            try { sourceRef.current.stop(); } catch(e) {}
            sourceRef.current = null;
        }
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        setIsPlaying(false);
    };

    const seek = (time: number) => {
        const wasPlaying = isPlaying;
        if (wasPlaying) pause();
        const clamped = Math.max(0, Math.min(time, audioBuffer?.duration || 0));
        setCurrentTime(clamped);
    };

    // -- Note Manipulation --
    
    // Enhanced addNote to support Hold dragging and optional snap
    const addNote = (time: number, lane: number, duration: number = 0, type: NoteType = 'NORMAL', snap: boolean = true) => {
        const startTime = snap ? getSnapTime(time) : time;
        
        let finalDuration = duration;
        if (duration > 0) {
            const rawEndTime = startTime + duration;
            // For holds, we typically snap the end time too if snap is enabled
            if (snap) {
                const snappedEndTime = getSnapTime(rawEndTime);
                finalDuration = Math.max(0, snappedEndTime - startTime);
            }
        }

        // Check for exact duplicate
        const exists = notes.some(n => Math.abs(n.time - startTime) < 0.001 && n.lane === lane);
        if (exists) return;

        const newNote: Note = {
            id: crypto.randomUUID(),
            time: startTime,
            lane: lane as NoteLane,
            type: type,
            duration: finalDuration,
            hit: false,
            visible: true,
            isHolding: false
        };
        setNotes(prev => [...prev, newNote]);
        setHasUnsavedChanges(true);
    };

    const deleteSelected = () => {
        if (selectedNoteIds.size === 0) return;
        setNotes(prev => prev.filter(n => !selectedNoteIds.has(n.id)));
        setSelectedNoteIds(new Set());
        setHasUnsavedChanges(true);
    };

    const deleteNote = (id: string) => {
         setNotes(prev => prev.filter(n => n.id !== id));
         setHasUnsavedChanges(true);
    };

    const updateNote = (id: string, updates: Partial<Note>) => {
        setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
        setHasUnsavedChanges(true);
    };

    const toggleSelection = (id: string, multi: boolean) => {
        const newSet = new Set(multi ? selectedNoteIds : []);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedNoteIds(newSet);
    };

    // Cleanup
    useEffect(() => {
        return () => {
            if (sourceRef.current) try { sourceRef.current.stop(); } catch(e){}
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (audioContextRef.current) audioContextRef.current.close();
        };
    }, []);

    const saveChanges = () => {
        const sorted = [...notes].sort((a, b) => a.time - b.time);
        onSave(sorted);
        setHasUnsavedChanges(false);
    };

    return {
        notes,
        currentTime,
        isPlaying,
        snapDivisor,
        activeTool,
        zoomLevel,
        selectedNoteIds,
        bpm,
        hasUnsavedChanges,
        
        setSnapDivisor,
        setActiveTool,
        setZoomLevel,
        
        togglePlay,
        seek,
        addNote,
        deleteNote,
        updateNote,
        deleteSelected,
        toggleSelection,
        saveChanges,
        
        getSnapTime,
        getExactTime
    };
};
