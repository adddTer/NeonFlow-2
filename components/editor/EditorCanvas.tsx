
import React, { useRef, useEffect, useState } from 'react';
import { Note, LaneCount, AITheme, NoteLane } from '../../types';
import { SnapDivisor, EditorTool } from '../../hooks/useChartEditor';

interface EditorCanvasProps {
    notes: Note[];
    currentTime: number;
    duration: number;
    laneCount: LaneCount;
    theme: AITheme;
    bpm: number;
    snapDivisor: SnapDivisor;
    zoomLevel: number; 
    activeTool: EditorTool;
    selectedNoteIds: Set<string>;
    
    // Interactions
    onSeek: (time: number) => void;
    onAddNote: (time: number, lane: number, duration?: number) => void;
    onNoteClick: (id: string, multi: boolean) => void;
    onNoteRightClick: (id: string) => void;
    getSnapTime: (time: number) => number; // Helper from hook
    
    // Live Recording
    activeRecordingLanes?: { [key: number]: number };
    recordSnap?: boolean;

    // AI Visuals
    aiRegion?: { start: number, end: number }; // Time range to highlight
}

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
    notes, currentTime, duration, laneCount, theme, bpm, snapDivisor, zoomLevel,
    activeTool, selectedNoteIds,
    onSeek, onAddNote, onNoteClick, onNoteRightClick, getSnapTime,
    activeRecordingLanes, recordSnap, aiRegion
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [canvasHeight, setCanvasHeight] = useState(0);
    const [canvasWidth, setCanvasWidth] = useState(0);

    // Interaction State
    const [dragState, setDragState] = useState<{
        isDragging: boolean;
        startX: number;
        startY: number;
        startTime: number;
        startLane: number;
        currentY: number;
    } | null>(null);

    // Configuration
    const PIXELS_PER_SECOND = 200 * zoomLevel;
    const LANE_WIDTH = Math.min(60, 400 / laneCount);
    const TRACK_WIDTH = LANE_WIDTH * laneCount;
    const HIT_LINE_Y = canvasHeight * 0.8; 

    // --- Helpers ---
    const timeToY = (time: number) => HIT_LINE_Y - (time - currentTime) * PIXELS_PER_SECOND;
    const yToTime = (y: number) => currentTime + (HIT_LINE_Y - y) / PIXELS_PER_SECOND;
    
    const xToLane = (x: number) => {
        const startX = (canvasWidth - TRACK_WIDTH) / 2;
        if (x < startX || x > startX + TRACK_WIDTH) return -1;
        return Math.floor((x - startX) / LANE_WIDTH);
    };

    // --- Interaction Handlers ---
    const handleMouseDown = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const rawTime = yToTime(y);
        const lane = xToLane(x);
        
        // Find clicked note
        const clickedNote = notes.find(n => {
            const ny = timeToY(n.time);
            const startX = (canvasWidth - TRACK_WIDTH) / 2 + n.lane * LANE_WIDTH;
            // Check Head
            const hitHead = x >= startX && x <= startX + LANE_WIDTH && y >= ny - 10 && y <= ny + 10;
            // Check Body (if hold)
            let hitBody = false;
            if (n.duration > 0) {
                const tailY = timeToY(n.time + n.duration);
                // Note: time flows up visually (Y decreases as Time increases), 
                // BUT our formula is: y = hit - (t - curr)*pps.
                // Larger time = Smaller Y (Higher on screen).
                // So Head is at ny, Tail is at tailY (smaller value).
                // Rect is from tailY to ny.
                hitBody = x >= startX + 4 && x <= startX + LANE_WIDTH - 4 && y >= tailY && y <= ny;
            }
            return hitHead || hitBody;
        });

        if (e.button === 0) { // Left Click
            if (activeTool === 'ADD' && lane >= 0) {
                if (clickedNote) {
                    // If clicking existing note in Add mode, treat as selection to avoid accidental overlaps
                    onNoteClick(clickedNote.id, e.ctrlKey || e.shiftKey);
                } else {
                    // Start dragging to create
                    const snappedTime = getSnapTime(rawTime);
                    setDragState({
                        isDragging: true,
                        startX: x,
                        startY: y,
                        startTime: snappedTime,
                        startLane: lane,
                        currentY: y
                    });
                }
            } else if (activeTool === 'SELECT' || activeTool === 'DELETE') {
                 if (clickedNote) {
                    if (activeTool === 'DELETE') onNoteRightClick(clickedNote.id);
                    else onNoteClick(clickedNote.id, e.ctrlKey || e.shiftKey);
                 } else {
                     onSeek(rawTime); // Seek on empty space
                 }
            }
        } else if (e.button === 2) { // Right Click
            if (clickedNote) {
                onNoteRightClick(clickedNote.id);
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!dragState || !dragState.isDragging) return;
        
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const y = e.clientY - rect.top;
        
        setDragState(prev => prev ? { ...prev, currentY: y } : null);
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (dragState && activeTool === 'ADD') {
            const rawEndTime = yToTime(dragState.currentY);
            // Ensure end time is after start time for holds
            let duration = 0;
            
            // If we dragged downwards (visually), typically means "later" in some editors, 
            // BUT here Time flows Up (Future is Top). 
            // Wait, standard VSRG editor: Future is UP.
            // yToTime formula: Higher Y (lower screen) = Lower Time (Past). 
            // Lower Y (higher screen) = Higher Time (Future).
            
            // If user drags mouse UP, rawEndTime > startTime. Duration positive.
            // If user drags mouse DOWN, rawEndTime < startTime.
            // Let's support creating holds by dragging UP (into future).
            
            // Calculate raw duration
            if (rawEndTime > dragState.startTime) {
                duration = rawEndTime - dragState.startTime;
            }
            
            // Threshold for creating a hold vs a tap
            // If dragged significantly (> 1/16th beat or > 20px), make it a hold
            const isHold = duration > (60/bpm)/8; 
            
            onAddNote(dragState.startTime, dragState.startLane, isHold ? duration : 0);
        }
        setDragState(null);
    };

    // --- Render Loop ---
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Resize logic...
        if (containerRef.current) {
            const { clientWidth, clientHeight } = containerRef.current;
            if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
                canvas.width = clientWidth;
                canvas.height = clientHeight;
                setCanvasWidth(clientWidth);
                setCanvasHeight(clientHeight);
            }
        }

        const width = canvas.width;
        const height = canvas.height;
        const startX = (width - TRACK_WIDTH) / 2;

        ctx.clearRect(0, 0, width, height);

        // 1. Background
        ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#111'; ctx.fillRect(startX, 0, TRACK_WIDTH, height);

        // Lane Dividers
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
        for (let i = 0; i <= laneCount; i++) {
            const x = startX + i * LANE_WIDTH;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }

        // 2. Grid
        const startTime = yToTime(height);
        const endTime = yToTime(0);
        const beatInterval = 60 / bpm;
        const snapInterval = beatInterval / (snapDivisor / 4);
        const firstBeat = Math.floor(startTime / snapInterval) * snapInterval;
        
        ctx.textAlign = 'right'; ctx.font = '10px monospace';

        for (let t = firstBeat; t <= endTime; t += snapInterval) {
            const y = timeToY(t);
            const isMeasure = Math.abs((t / (beatInterval * 4)) % 1) < 0.01;
            const isBeat = Math.abs((t / beatInterval) % 1) < 0.01;

            if (isMeasure) { ctx.strokeStyle = '#666'; ctx.lineWidth = 2; }
            else if (isBeat) { ctx.strokeStyle = '#444'; ctx.lineWidth = 1; }
            else { ctx.strokeStyle = '#222'; ctx.lineWidth = 0.5; }

            ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(startX + TRACK_WIDTH, y); ctx.stroke();
            if (isMeasure) { ctx.fillStyle = '#888'; ctx.fillText(t.toFixed(1) + 's', startX - 10, y + 3); }
        }

        // 2.5 AI Context Region Highlight
        if (aiRegion) {
            const regionYEnd = timeToY(aiRegion.start); 
            const regionYStart = timeToY(aiRegion.end);
            // Note: time flows Up. Start time is lower Y (bottom), End time is higher Y (top).
            // But Y coord decreases as we go up.
            // So startY (visually lower) > endY (visually higher).
            
            const regionH = regionYEnd - regionYStart;
            
            ctx.fillStyle = 'rgba(189, 0, 255, 0.1)'; // Neon Purple tint
            ctx.fillRect(startX, regionYStart, TRACK_WIDTH, regionH);
            
            ctx.strokeStyle = 'rgba(189, 0, 255, 0.5)';
            ctx.lineWidth = 2;
            ctx.strokeRect(startX, regionYStart, TRACK_WIDTH, regionH);
            
            // Draw Label
            ctx.fillStyle = '#bd00ff';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText("AI 视窗", startX + TRACK_WIDTH + 10, regionYEnd - 5);
        }

        // 3. Notes
        const renderNoteObj = (note: Note, isSelected: boolean, isGhost: boolean = false) => {
            const headY = timeToY(note.time);
            
            let tailY = headY;
            if (note.duration > 0) {
                tailY = timeToY(note.time + note.duration);
            }

            // Visibility Check
            // Note extends from tailY (top) to headY (bottom)
            if (!isGhost && (tailY > height + 50 || headY < -500)) return;

            const x = startX + note.lane * LANE_WIDTH + 2;
            const w = LANE_WIDTH - 4;
            const h = 12;

            let color = theme.primaryColor;
            if (note.type === 'CATCH') color = theme.catchColor;
            
            // Hold Body
            if (note.duration > 0) {
                const bodyH = headY - tailY;
                
                ctx.fillStyle = isSelected ? '#fff' : (isGhost ? color : theme.secondaryColor) + '88';
                ctx.fillRect(x + 4, tailY, w - 8, bodyH);
                ctx.strokeStyle = isGhost ? color : theme.secondaryColor;
                ctx.strokeRect(x + 4, tailY, w - 8, bodyH);
            }

            // Note Head
            const y = headY;
            ctx.fillStyle = isSelected ? '#ffffff' : color;
            if (isGhost) ctx.globalAlpha = 0.6;
            
            if (note.type === 'CATCH') {
                 const cx = x + w/2;
                 ctx.beginPath(); ctx.moveTo(cx, y - h); ctx.lineTo(x + w, y); ctx.lineTo(cx, y + h); ctx.lineTo(x, y); ctx.fill();
            } else {
                 ctx.fillRect(x, y - h/2, w, h);
            }
            
            if (isGhost) ctx.globalAlpha = 1.0;

            if (isSelected) {
                ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 2;
                ctx.strokeRect(x - 2, y - h/2 - 2, w + 4, h + 4);
            }
        };

        notes.forEach(n => renderNoteObj(n, selectedNoteIds.has(n.id)));

        // 4. Drag Preview (Ghost Note)
        if (dragState && activeTool === 'ADD') {
            const rawEndTime = yToTime(dragState.currentY);
            let duration = 0;
            if (rawEndTime > dragState.startTime) {
                duration = rawEndTime - dragState.startTime;
            }
            
            // Snap the duration visually
            let snappedDuration = 0;
            if (duration > 0) {
                const endTimeSnapped = getSnapTime(dragState.startTime + duration);
                snappedDuration = Math.max(0, endTimeSnapped - dragState.startTime);
            }

            const ghostNote: Note = {
                id: 'ghost',
                time: dragState.startTime,
                lane: dragState.startLane as NoteLane,
                type: 'NORMAL',
                duration: snappedDuration,
                hit: false, visible: true, isHolding: false
            };
            renderNoteObj(ghostNote, false, true);
        }

        // 5. Recording Preview
        if (activeRecordingLanes) {
            Object.entries(activeRecordingLanes).forEach(([laneStr, rawStartTime]) => {
                const lane = parseInt(laneStr);
                // Apply snap to start time if recordSnap is on, to show true start position
                const startTime = recordSnap ? getSnapTime(rawStartTime) : rawStartTime;
                
                // Calculate duration relative to current time
                const duration = Math.max(0, currentTime - startTime);
                
                const previewNote: Note = {
                    id: `rec-${lane}`,
                    time: startTime,
                    lane: lane as NoteLane,
                    type: 'NORMAL',
                    duration: duration,
                    hit: false, visible: true, isHolding: false
                };
                
                // Render as normal note (not ghost, not selected)
                renderNoteObj(previewNote, false, false);
            });
        }

        // 6. Hit Line
        ctx.strokeStyle = '#ff0044'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(startX - 20, HIT_LINE_Y); ctx.lineTo(startX + TRACK_WIDTH + 20, HIT_LINE_Y); ctx.stroke();
        ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#ff0044'; ctx.textAlign = 'right';
        ctx.fillText("判定线", startX - 25, HIT_LINE_Y + 4);

    }, [notes, currentTime, canvasHeight, canvasWidth, laneCount, theme, bpm, snapDivisor, zoomLevel, selectedNoteIds, dragState, activeRecordingLanes, aiRegion]);

    return (
        <div ref={containerRef} className="w-full h-full bg-[#050505] relative overflow-hidden cursor-crosshair">
            <canvas 
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onContextMenu={(e) => e.preventDefault()}
                className="block"
            />
        </div>
    );
};
