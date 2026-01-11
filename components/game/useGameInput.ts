
import React, { useEffect, MutableRefObject } from 'react';
import { GameStatus, LaneCount } from '../../types';

interface UseGameInputProps {
    status: GameStatus;
    laneCountRef: MutableRefObject<LaneCount>;
    keysRef: MutableRefObject<string[]>;
    keyStateRef: MutableRefObject<boolean[]>;
    laneWidthRef: MutableRefObject<number>;
    startXRef: MutableRefObject<number>;
    activeTouchesRef: MutableRefObject<Map<number, number>>;
    onHit: (lane: number) => void;
    onRelease: (lane: number) => void;
}

export const useGameInput = ({
    status,
    laneCountRef,
    keysRef,
    keyStateRef,
    laneWidthRef,
    startXRef,
    activeTouchesRef,
    onHit,
    onRelease
}: UseGameInputProps) => {

    // --- Keyboard Input ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (status !== GameStatus.Playing) return;
            
            const keyIndex = keysRef.current.indexOf(e.key.toLowerCase());
            if (keyIndex !== -1 && !keyStateRef.current[keyIndex]) {
                keyStateRef.current[keyIndex] = true;
                onHit(keyIndex);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (status !== GameStatus.Playing) return;
            const keyIndex = keysRef.current.indexOf(e.key.toLowerCase());
            if (keyIndex !== -1) {
                keyStateRef.current[keyIndex] = false;
                onRelease(keyIndex);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [status]); // Only re-bind when status changes (play/pause)

    // --- Touch Input Helpers ---
    const getLaneFromTouchX = (touchX: number) => {
        const laneW = laneWidthRef.current;
        const startX = startXRef.current;
        const count = laneCountRef.current;
        const relativeX = touchX - startX;
        const index = Math.floor(relativeX / laneW);
        if (index >= 0 && index < count) return index;
        return -1;
    };

    const engageLane = (lane: number) => {
        if (lane < 0 || lane >= laneCountRef.current) return;
        keyStateRef.current[lane] = true;
        onHit(lane);
    };

    const disengageLane = (lane: number) => {
        if (lane < 0 || lane >= laneCountRef.current) return;
        // Only release if NO other touch is currently holding this lane
        const isStillHeld = Array.from(activeTouchesRef.current.values()).includes(lane);
        if (!isStillHeld) {
            keyStateRef.current[lane] = false;
            onRelease(lane);
        }
    };

    // --- Global Touch Handler ---
    const handleGlobalTouch = (e: React.TouchEvent) => {
        if (status !== GameStatus.Playing) return;
        if (e.cancelable && e.type !== 'touchstart') {
            e.preventDefault();
        }

        const changed = e.changedTouches;
        for (let i = 0; i < changed.length; i++) {
            const t = changed[i];
            const touchId = t.identifier;
            const lane = getLaneFromTouchX(t.clientX);
            
            if (e.type === 'touchstart') {
                if (lane !== -1) {
                    activeTouchesRef.current.set(touchId, lane);
                    engageLane(lane);
                }
            } 
            else if (e.type === 'touchmove') {
                const oldLane = activeTouchesRef.current.get(touchId);
                if (lane !== oldLane) {
                    activeTouchesRef.current.set(touchId, lane);
                    if (oldLane !== undefined && oldLane !== -1) disengageLane(oldLane);
                    if (lane !== -1) engageLane(lane);
                }
            }
            else if (e.type === 'touchend' || e.type === 'touchcancel') {
                const oldLane = activeTouchesRef.current.get(touchId);
                activeTouchesRef.current.delete(touchId);
                if (oldLane !== undefined && oldLane !== -1) disengageLane(oldLane);
            }
        }
    };

    return { handleGlobalTouch };
};
