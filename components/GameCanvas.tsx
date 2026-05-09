
import React, { useEffect, useRef, useMemo } from 'react';
import { Note, ScoreState, GameStatus, AITheme, LaneCount, NoteLane, SongStructure, GameModifier } from '../types';
import { useSoundSystem } from '../hooks/useSoundSystem';
import { Particle, GhostNote, HitEffect, ObjectPool, GhostNoteObj } from './game/Visuals';
import { useGameInput } from './game/useGameInput';

interface GameCanvasProps {
  status: GameStatus;
  audioBuffer: AudioBuffer | null;
  notes: Note[];
  structure?: SongStructure;
  theme: AITheme;
  audioOffset: number; 
  scrollSpeed: number; 
  keyBindings: string[];
  modifiers: GameModifier[];
  hideNotes?: boolean; 
  isPaused?: boolean; 
  onScoreUpdate: (score: ScoreState) => void;
  onGameEnd: (finalScore: ScoreState) => void;
  showKeys?: boolean;
}

const BASE_TARGET_WIDTH = 100; 

// --- New Scoring Constants ---
const MAX_SCORE = 1000000;
const ACC_WEIGHT = 0.9;   // 900,000 points for Accuracy
const COMBO_WEIGHT = 0.1; // 100,000 points for Combo

// Hit Windows
const BASE_HIT_WINDOW_PERFECT = 0.050; 
const BASE_HIT_WINDOW_GOOD = 0.120; 
const BASE_HIT_WINDOW_CATCH = 0.120; // Slightly lenient for catch

const LEAD_IN_TIME = 2.0; 

// Helper for smooth color blending
const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
};

// Helper: Ensure color visibility (contrast against dark background)
const ensureContrast = (hex: string, fallback: string): string => {
    if (!hex) return fallback;
    const rgb = hexToRgb(hex);
    // Calculate luminance (Perceived brightness)
    const luma = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
    // Threshold: if darker than ~30% gray, swap to fallback
    if (luma < 80) return fallback;
    return hex;
};

const GameCanvas: React.FC<GameCanvasProps> = ({ 
  status, audioBuffer, notes, structure, theme, audioOffset, scrollSpeed,
  keyBindings, modifiers, hideNotes, onScoreUpdate, onGameEnd, showKeys
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  
  // Offscreen Canvas for Static Elements
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const layoutDirtyRef = useRef<boolean>(true);

  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const isMobileRef = useRef(false);

  const notesRef = useRef<Note[]>([]);
  const scoreRef = useRef<ScoreState>({ score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, hitHistory: [], modifiers: [] });
  const keyStateRef = useRef<boolean[]>([]);
  const laneMissStateRef = useRef<number[]>([]); 
  const laneHitStateRef = useRef<number[]>([]); 
  const effectRef = useRef<HitEffect[]>([]);
  
  // Object Pools
  const particlesRef = useRef<Particle[]>([]);
  const ghostNotesRef = useRef<GhostNoteObj[]>([]); 
  
  // Initialize pools once
  const particlePoolRef = useRef<ObjectPool<Particle>>(new ObjectPool(() => new Particle(), 100));
  const ghostNotePoolRef = useRef<ObjectPool<GhostNoteObj>>(new ObjectPool(() => new GhostNoteObj(), 50));

  const comboScaleRef = useRef<number>(1.0);
  const hasEndedRef = useRef(false);
  
  const playbackRateRef = useRef<number>(1.0);
  const hitWindowMultiplierRef = useRef<number>(1.0);
  const isAutoRef = useRef<boolean>(false);
  const isSuddenDeathRef = useRef<boolean>(false);
  const isHiddenRef = useRef<boolean>(false);
  const isFlashlightRef = useRef<boolean>(false);
  const isPerformanceRef = useRef<boolean>(false); 

  const smoothedIntensityRef = useRef<number>(0);

  const laneCountRef = useRef<LaneCount>(4);
  const keysRef = useRef<string[]>([]);
  const labelsRef = useRef<string[]>([]);
  const laneWidthRef = useRef<number>(BASE_TARGET_WIDTH);
  const startXRef = useRef<number>(0);
  const pixelsPerSecondRef = useRef<number>(800);
  const activeTouchesRef = useRef<Map<number, number>>(new Map()); 
  
  // Performance Stats Refs
  const fpsRef = useRef(0);
  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(0);
  const lastFrameTimeRef = useRef(0);

  const hitFlashScaleRef = useRef<number>(0); // NEW: Global hit impact flash

  const { playHitSound } = useSoundSystem();

  const timeToDistMap = useMemo(() => {
      if (!structure?.sections || structure.sections.length === 0) return null;
      
      const sorted = [...structure.sections].sort((a,b) => a.startTime - b.startTime);
      let currentDist = 0;
      const points: { time: number, dist: number, sv: number }[] = [];
      points.push({ time: -99999, dist: -99999, sv: 1.0 });
      points.push({ time: 0, dist: 0, sv: 1.0 });
  
      let lastTime = 0;
      for (const sec of sorted) {
          if (sec.endTime <= lastTime) continue; // Skip if fully contained in previous
          
          if (sec.startTime > lastTime) {
             currentDist += (sec.startTime - lastTime) * points[points.length - 1].sv;
             
             let sv = 1.0;
             if (sec.intensity < 0.4) sv = 0.5;
             else if (sec.intensity < 0.6) sv = 0.8;
             else if (sec.intensity > 0.8) sv = 1.3;
             
             points.push({ time: sec.startTime, dist: currentDist, sv });
          } else {
             let sv = 1.0;
             if (sec.intensity < 0.4) sv = 0.5;
             else if (sec.intensity < 0.6) sv = 0.8;
             else if (sec.intensity > 0.8) sv = 1.3;
             points[points.length - 1].sv = Math.max(points[points.length - 1].sv, sv);
          }
          
          let sv = points[points.length - 1].sv;
          currentDist += (sec.endTime - Math.max(lastTime, sec.startTime)) * sv;
          points.push({ time: sec.endTime, dist: currentDist, sv: 1.0 });
          lastTime = sec.endTime;
      }
      
      points.push({ time: 99999, dist: currentDist + (99999 - lastTime) * 1.0, sv: 1.0 });
      return points;
  }, [structure]);

  const specialModifiers = useMemo(() => {
      const mods = new Map<string, string>();
      let lastTime = -5; // Allow the very first note of the song to trigger it if energy is high!
      const sorted = [...notes].sort((a,b) => a.time - b.time);
      for (let i=0; i<sorted.length; i++) {
          const n = sorted[i];
          const hasEnergy = n.energy !== undefined;
          const energy = hasEnergy ? n.energy! : 0.8; // Fallback for old songs
          
          if (n.time - lastTime > 1.2 && energy > 0.6) {
              // Found a drop-in zero-frame start!
              mods.set(n.id, 'drop-in');
          }
          // Do not update lastTime if they are chord notes exactly at the same time
          if (i === 0 || Math.abs(n.time - sorted[i-1].time) > 0.05) {
              lastTime = n.time;
          }
      }
      return mods;
  }, [notes]);

  const getMappedTime = (t: number) => {
      if (!timeToDistMap) return t;
      let p1 = timeToDistMap[0];
      for (let i = 1; i < timeToDistMap.length; i++) {
          if (timeToDistMap[i].time > t) {
              return p1.dist + (t - p1.time) * p1.sv;
          }
          p1 = timeToDistMap[i];
      }
      return p1.dist + (t - p1.time) * p1.sv;
  };

  const getVisualGap = (noteT: number, gameT: number, noteId: string) => {
      let gap = getMappedTime(noteT) - getMappedTime(gameT);
      if (specialModifiers.has(noteId) && gap > 0) {
          const T = noteT - gameT; // Real time difference
          if (T > 0) {
              const T_fall = 0.6;
              const T_rise_end = 1.0;
              const T_rise_start = 1.4;
              
              if (T <= T_fall) {
                  // Fall normally (returns mapped gap)
                  return gap;
              } else {
                  // The static hover mapped distance
                  const fixedHoverGap = getMappedTime(noteT) - getMappedTime(noteT - T_fall);
                  
                  if (T <= T_rise_end) {
                      // Hover phase - apply gentle floating that tapers to 0 as it approaches T_fall
                      const floatFactor = Math.min(1, (T - T_fall) / 0.1);
                      const float = Math.sin(T * 12) * 0.05 * floatFactor;
                      return fixedHoverGap + float;
                  } else if (T <= T_rise_start) {
                      // Rise phase - rise from 0 to fixedHoverGap
                      const progress = (T_rise_start - T) / (T_rise_start - T_rise_end);
                      // Use easeOutCubic for smooth rise
                      const ease = 1 - Math.pow(1 - progress, 3);
                      return fixedHoverGap * ease;
                  } else {
                      return 9999;
                  }
              }
          }
      }
      return gap;
  };

  // Memoize safe theme to prevent flickering colors
  const safeTheme = useMemo(() => ({
      ...theme,
      primaryColor: ensureContrast(theme.primaryColor, '#00f3ff'),
      secondaryColor: ensureContrast(theme.secondaryColor, '#bd00ff')
  }), [theme]);

  // Create refs for props to avoid stale closures in gameLoop
  const audioOffsetRef = useRef(audioOffset);
  audioOffsetRef.current = audioOffset;
  const hideNotesRef = useRef(hideNotes);
  hideNotesRef.current = hideNotes;
  const showKeysRef = useRef(showKeys);
  showKeysRef.current = showKeys;

  const safeThemeRef = useRef(safeTheme);
  safeThemeRef.current = safeTheme;

  useEffect(() => {
      if (modifiers.includes(GameModifier.DoubleTime)) playbackRateRef.current = 1.5;
      else if (modifiers.includes(GameModifier.HalfTime)) playbackRateRef.current = 0.75;
      else playbackRateRef.current = 1.0;

      if (modifiers.includes(GameModifier.HardRock)) hitWindowMultiplierRef.current = 0.7;
      else hitWindowMultiplierRef.current = 1.0;

      isAutoRef.current = modifiers.includes(GameModifier.Auto);
      isSuddenDeathRef.current = modifiers.includes(GameModifier.SuddenDeath);
      isHiddenRef.current = modifiers.includes(GameModifier.Hidden);
      isFlashlightRef.current = modifiers.includes(GameModifier.Flashlight);
      isPerformanceRef.current = modifiers.includes(GameModifier.Performance);
  }, [modifiers]);

  const getCurrentGameTime = () => {
      const ctx = audioContextRef.current;
      if (!ctx) return 0;
      const outputLatency = (ctx as any).outputLatency || 0;
      const baseLatency = (ctx as any).baseLatency || 0;
      const realTimeElapsed = ctx.currentTime - startTimeRef.current;
      return (realTimeElapsed * playbackRateRef.current) - (audioOffsetRef.current / 1000) - (outputLatency + baseLatency);
  };

  const processHit = (lane: number) => {
    if (!audioContextRef.current) return;
    // Prevent manual input interference in Auto mode
    if (isAutoRef.current) return;

    const gameTime = getCurrentGameTime();
    const windowGood = BASE_HIT_WINDOW_GOOD * hitWindowMultiplierRef.current;

    // Prioritize clicking non-Catch notes first (heads of normal/holds)
    const hitNote = notesRef.current.find(n => 
      !n.hit && !n.missed && n.lane === lane && n.type === 'NORMAL' && 
      Math.abs(gameTime - n.time) < windowGood
    );

    if (hitNote) {
      const diff = gameTime - hitNote.time;
      const absDiff = Math.abs(diff);
      
      let type: 'PERFECT' | 'GOOD' = 'GOOD';
      const windowPerfect = BASE_HIT_WINDOW_PERFECT * hitWindowMultiplierRef.current;

      if (absDiff < windowPerfect) {
        type = 'PERFECT';
        scoreRef.current.perfect++;
      } else {
        scoreRef.current.good++;
      }

      const totalNotes = notes.length || 1;
      const accScorePerNote = (MAX_SCORE * ACC_WEIGHT) / totalNotes;
      const hitValue = type === 'PERFECT' ? 1.0 : 0.6;
      const gainedAccScore = accScorePerNote * hitValue;
      const comboScorePerNote = (MAX_SCORE * COMBO_WEIGHT) / totalNotes;

      let scoreToAdd = gainedAccScore + comboScorePerNote;
      if (hitNote.duration > 0) {
          hitNote.holdScoreTarget = scoreToAdd * 0.8;
          hitNote.holdScoreGained = 0;
          scoreToAdd = scoreToAdd * 0.2;
      }

      const newScore = scoreRef.current.score + scoreToAdd;
      scoreRef.current.score = Math.min(MAX_SCORE, newScore);

      scoreRef.current.hitHistory.push(diff);
      triggerHitVisuals(lane, type);

      if (hideNotesRef.current) {
          const g = ghostNotePoolRef.current.get();
          g.reset(lane, hitNote.time - gameTime, 1.0);
          ghostNotesRef.current.push(g);
      }

      hitNote.hit = true;
      if (hitNote.duration > 0) hitNote.isHolding = true;
      else hitNote.visible = false;
      
      scoreRef.current.combo++;
      if (scoreRef.current.combo > scoreRef.current.maxCombo) scoreRef.current.maxCombo = scoreRef.current.combo;
      
      onScoreUpdate({...scoreRef.current});
    }
  };

  const processRelease = (lane: number) => {
      // Prevent manual input interference in Auto mode (stops accidental hold breaks)
      if (isAutoRef.current) return;

      // Find note that is currently being held in this lane
      const holdingNote = notesRef.current.find(n => n.lane === lane && n.isHolding);
      
      if (holdingNote) {
          const gameTime = getCurrentGameTime();
          const endTime = holdingNote.time + holdingNote.duration;
          
          // Tolerance for early release (e.g., 200ms grace)
          const earlyTolerance = 0.2 * hitWindowMultiplierRef.current;
          
          if (gameTime < endTime - earlyTolerance) {
              // Released too early -> MISS / Break Combo
              holdingNote.isHolding = false;
              holdingNote.visible = false; // Stop drawing
              
              scoreRef.current.combo = 0;
              scoreRef.current.miss++;
              effectRef.current.push({ id: Math.random(), text: 'BREAK', time: performance.now(), lane: lane, color: '#888888', scale: 1.0 });
              onScoreUpdate({...scoreRef.current});
          } else {
              // Released at end (Successful completion logic handled in gameLoop mostly, but we can finalize here)
              if (holdingNote.holdScoreTarget && holdingNote.holdScoreTarget > 0) {
                  const remaining = holdingNote.holdScoreTarget - (holdingNote.holdScoreGained || 0);
                  if (remaining > 0) {
                      scoreRef.current.score = Math.min(MAX_SCORE, scoreRef.current.score + remaining);
                      holdingNote.holdScoreGained = holdingNote.holdScoreTarget;
                  }
              }
              holdingNote.isHolding = false;
          }
      }
  };

  const { handleGlobalTouch } = useGameInput({
      status, laneCountRef, keysRef, keyStateRef, laneWidthRef, startXRef, activeTouchesRef,
      onHit: processHit, onRelease: processRelease
  });

  useEffect(() => {
      const maxLaneIndex = notes.reduce((max, n) => Math.max(max, n.lane), 0);
      const count = maxLaneIndex > 3 ? 6 : 4;
      laneCountRef.current = count;
      const validBindings = keyBindings.length >= count ? keyBindings.slice(0, count) : (count === 6 ? ['s','d','f','j','k','l'] : ['d','f','j','k']);
      keysRef.current = validBindings.map(k => k.toLowerCase());
      labelsRef.current = validBindings.map(k => k.toUpperCase());
      keyStateRef.current = new Array(count).fill(false);
      laneMissStateRef.current = new Array(count).fill(0);
      laneHitStateRef.current = new Array(count).fill(0);
      
      if (sizeRef.current.width > 0) {
          layoutDirtyRef.current = true;
          const { width } = sizeRef.current;
          const laneW = Math.min(BASE_TARGET_WIDTH, width / count);
          laneWidthRef.current = laneW;
          startXRef.current = (width - (laneW * count)) / 2;
      }
  }, [notes, keyBindings]);

  useEffect(() => {
      pixelsPerSecondRef.current = 400 + ((scrollSpeed - 1) * 300);
  }, [scrollSpeed]);

  const updateLayout = (w: number, h: number) => {
      const count = laneCountRef.current;
      const laneW = Math.min(BASE_TARGET_WIDTH, w / count);
      const startX = (w - (laneW * count)) / 2;
      laneWidthRef.current = laneW;
      startXRef.current = startX;
      
      sizeRef.current = { 
          width: w, 
          height: h, 
          dpr: Math.min(window.devicePixelRatio || 1, 2) 
      };
      isMobileRef.current = w < 768;
      
      layoutDirtyRef.current = true;
  };

  useEffect(() => {
      if (!containerRef.current) return;
      const resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
              const { width, height } = entry.contentRect;
              updateLayout(width, height);
          }
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
  }, []);

  // --- Offscreen Buffering Logic ---
  const updateStaticLayer = () => {
      const { width, height, dpr } = sizeRef.current;
      if (width === 0 || height === 0) return;
      
      if (!staticCanvasRef.current) staticCanvasRef.current = document.createElement('canvas');
      const cvs = staticCanvasRef.current;
      
      if (cvs.width !== Math.floor(width * dpr) || cvs.height !== Math.floor(height * dpr)) {
          cvs.width = Math.floor(width * dpr);
          cvs.height = Math.floor(height * dpr);
      }
      
      const ctx = cvs.getContext('2d', { alpha: true });
      if (!ctx) return;
      
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      
      const count = laneCountRef.current;
      const laneW = laneWidthRef.current;
      const startX = startXRef.current;
      
      ctx.fillStyle = 'rgba(15, 20, 25, 0.7)'; 
      ctx.fillRect(startX, 0, count * laneW, height);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      for (let i = 1; i < count; i++) {
          ctx.fillRect(startX + i * laneW - 0.5, 0, 1, height);
      }
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(startX - 1, 0, 1, height);
      ctx.fillRect(startX + count * laneW, 0, 1, height);

      // Draw Key Labels if enabled and NOT mobile
      if (showKeysRef.current && !isMobileRef.current && labelsRef.current.length > 0) {
          const hitLineY = height * 0.80; // Standard desktop hit line
          ctx.font = 'bold 24px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          
          for (let i = 0; i < count; i++) {
              const x = startX + i * laneW + laneW / 2;
              const y = hitLineY + 60; // Below the hit line
              ctx.fillText(labelsRef.current[i], x, y);
          }
      }
  };

  const playMusic = (offset: number = 0) => {
    if (!audioBuffer) return;
    let ctx = audioContextRef.current;
    const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
    if (!ctx || ctx.state === 'closed') {
        ctx = new AudioContextClass({ latencyHint: 'interactive', sampleRate: audioBuffer.sampleRate });
        audioContextRef.current = ctx;
    } else if (ctx.state === 'suspended') ctx.resume();
    if (sourceRef.current) { try { sourceRef.current.stop(); } catch(e){} }
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.playbackRate.value = playbackRateRef.current;
    const now = ctx.currentTime;
    if (offset === 0) {
        startTimeRef.current = now + LEAD_IN_TIME;
        source.start(startTimeRef.current);
    } else {
        startTimeRef.current = now - (offset / playbackRateRef.current);
        source.start(0, offset);
    }
    sourceRef.current = source;
  };

  const stopMusic = () => {
    if (sourceRef.current) { try { sourceRef.current.stop(); } catch(e) {} sourceRef.current = null; }
    if (audioContextRef.current) {
       if (status === GameStatus.Finished || status === GameStatus.Library) { try { audioContextRef.current.close(); } catch(e) {} audioContextRef.current = null; } 
       else { try { audioContextRef.current.suspend(); } catch(e) {} }
    }
  };

  useEffect(() => {
    if (status === GameStatus.Playing && !audioContextRef.current) {
      notesRef.current = JSON.parse(JSON.stringify(notes));
      scoreRef.current = { score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, hitHistory: [], modifiers };
      effectRef.current = []; 
      particlesRef.current.forEach(p => particlePoolRef.current.release(p));
      particlesRef.current = []; 
      ghostNotesRef.current.forEach(g => ghostNotePoolRef.current.release(g));
      ghostNotesRef.current = [];
      comboScaleRef.current = 1.0;
      keyStateRef.current = new Array(laneCountRef.current).fill(false); 
      activeTouchesRef.current.clear();
      hasEndedRef.current = false;
      playMusic(0);
      requestRef.current = requestAnimationFrame(gameLoop);
    } 
    else if (status === GameStatus.Playing && audioContextRef.current?.state === 'suspended') {
         audioContextRef.current.resume();
         requestRef.current = requestAnimationFrame(gameLoop);
    }
    else if (status === GameStatus.Paused) {
        if (audioContextRef.current) audioContextRef.current.suspend();
        if (!requestRef.current) requestRef.current = requestAnimationFrame(gameLoop);
    }
    else if (status === GameStatus.Library || status === GameStatus.Finished) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      stopMusic();
      audioContextRef.current = null;
    }
    if (status === GameStatus.Countdown && audioContextRef.current) {
        requestRef.current = requestAnimationFrame(gameLoop);
    }
  }, [status]);

  const triggerHitVisuals = (lane: number, type: 'PERFECT' | 'GOOD') => {
      const isPerfect = type === 'PERFECT';
      playHitSound(type);
      laneHitStateRef.current[lane] = 1.0; 
      comboScaleRef.current = 1.4;
      hitFlashScaleRef.current = Math.min(0.6, hitFlashScaleRef.current + (isPerfect ? 0.2 : 0.1));
      const { height } = sizeRef.current;
      const laneX = (startXRef.current + lane * laneWidthRef.current + laneWidthRef.current / 2);
      const hitY = height * (isMobileRef.current ? 0.85 : 0.80);
      const hitColor = isPerfect ? safeThemeRef.current.perfectColor : safeThemeRef.current.goodColor;
      
      const pCount = isMobileRef.current ? (isPerfect ? 10 : 6) : (isPerfect ? 20 : 12);
      for (let i = 0; i < pCount; i++) {
          const p = particlePoolRef.current.get();
          p.reset(laneX, hitY, hitColor);
          particlesRef.current.push(p);
      }
      
      effectRef.current.push({ id: Math.random(), text: type, time: performance.now(), lane: lane, color: hitColor, scale: 1.4 });
  };

  const drawSystemStats = (ctx: CanvasRenderingContext2D, width: number, height: number, now: number) => {
      if (!isPerformanceRef.current) return;
      frameCountRef.current++;
      if (now - lastFpsTimeRef.current >= 1000) {
          fpsRef.current = frameCountRef.current;
          frameCountRef.current = 0;
          lastFpsTimeRef.current = now;
      }
      const frameTime = now - lastFrameTimeRef.current;
      const p = 10;
      const boxW = 140;
      const boxH = 90;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); 
      ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(p, p, boxW, boxH);
      ctx.strokeStyle = safeThemeRef.current.primaryColor; ctx.lineWidth = 1; ctx.strokeRect(p, p, boxW, boxH);
      ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = safeThemeRef.current.primaryColor;
      ctx.fillText(`FPS: ${fpsRef.current}`, p + 10, p + 10);
      ctx.fillText(`Frame Time: ${frameTime.toFixed(2)}ms`, p + 10, p + 25);
      ctx.fillStyle = '#fff';
      ctx.fillText(`Entities: ${particlesRef.current.length + ghostNotesRef.current.length}`, p + 10, p + 45);
      ctx.fillText(`Visible Notes: ${notesRef.current.filter(n => n.visible).length}`, p + 10, p + 60);
      const mem = (performance as any).memory;
      if (mem) {
          const used = (mem.usedJSHeapSize / 1024 / 1024).toFixed(1);
          ctx.fillStyle = '#aaa'; ctx.fillText(`Mem: ${used} MB`, p + 10, p + 75);
      }
      ctx.restore();
  };

  const gameLoop = (time: number) => {
    if (status === GameStatus.Finished || status === GameStatus.Library || !audioContextRef.current) return;
    const isFrozen = status === GameStatus.Paused || status === GameStatus.Countdown;
    const gameTime = getCurrentGameTime();

    if (status === GameStatus.Playing && audioBuffer && gameTime > audioBuffer.duration + 0.5) {
        if (!hasEndedRef.current) {
            hasEndedRef.current = true;
            onGameEnd(scoreRef.current);
        }
        return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); 
    if (!ctx) return;

    const { width, height, dpr } = sizeRef.current;
    if (width === 0 || height === 0) {
        requestRef.current = requestAnimationFrame(gameLoop);
        return;
    }
    if (canvas.width !== Math.floor(width * dpr)) {
        canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
        layoutDirtyRef.current = true;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (layoutDirtyRef.current) {
        updateStaticLayer();
        layoutDirtyRef.current = false;
    }

    const laneW = laneWidthRef.current; const startX = startXRef.current;
    const count = laneCountRef.current; const speed = pixelsPerSecondRef.current;
    const hitLineRatio = isMobileRef.current ? 0.85 : 0.80;
    const hitLineY = height * hitLineRatio;

    let targetIntensity = 0;
    let isDrop = false;
    let isBuild = false;
    if (structure?.sections) {
        const currentSection = structure.sections.find(s => gameTime >= s.startTime && gameTime < s.endTime);
        if (currentSection) {
            targetIntensity = currentSection.intensity;
            if (currentSection.type === 'chorus' || currentSection.type === 'drop') {
                targetIntensity = Math.max(targetIntensity, 1.2); 
                isDrop = true;
            }
            if (currentSection.type === 'build') {
                isBuild = true;
            }
        }
    }
    
    if (!isFrozen) smoothedIntensityRef.current += (targetIntensity - smoothedIntensityRef.current) * 0.02;
    const visualIntensity = smoothedIntensityRef.current;
    
    let beatPulse = 0;
    if (!isFrozen) {
        const bpm = structure?.bpm || 120;
        const beatDur = 60 / bpm;
        beatPulse = Math.pow(1 - (gameTime % beatDur) / beatDur, 2); 
    }

    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#13131f'); bgGrad.addColorStop(1, '#050508');
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = 0.08;
    const baseAmbient = ctx.createRadialGradient(width/2, height/2, width*0.1, width/2, height/2, width*0.8);
    baseAmbient.addColorStop(0, safeThemeRef.current.secondaryColor); baseAmbient.addColorStop(1, 'transparent');
    ctx.fillStyle = baseAmbient; ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1.0;
    
    const baseOpacity = visualIntensity * 0.25;
    const kiaiStrength = Math.max(0, (visualIntensity - 0.6) / 0.6); 
    const kiaiBoost = kiaiStrength * (beatPulse * 0.2);
    // Add hit flash to global ambient lighting
    const flashBoost = hitFlashScaleRef.current * 0.15;
    const finalOpacity = Math.min(0.5, baseOpacity + kiaiBoost + flashBoost);

    if (!isFrozen && hitFlashScaleRef.current > 0) {
        hitFlashScaleRef.current -= 0.05;
        if (hitFlashScaleRef.current < 0) hitFlashScaleRef.current = 0;
    }
    
    if (finalOpacity > 0.01) {
        ctx.globalAlpha = finalOpacity;
        const priRgb = hexToRgb(safeThemeRef.current.primaryColor);
        const secRgb = hexToRgb(safeThemeRef.current.secondaryColor);
        const mix = Math.min(1, Math.max(0, visualIntensity - 0.2) * 1.2);
        const r = Math.round(secRgb.r + (priRgb.r - secRgb.r) * mix);
        const g = Math.round(secRgb.g + (priRgb.g - secRgb.g) * mix);
        const b = Math.round(secRgb.b + (priRgb.b - secRgb.b) * mix);
        const glowColor = `rgb(${r},${g},${b})`;
        const radialGrad = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height) * 0.8);
        radialGrad.addColorStop(0, glowColor); radialGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = radialGrad; ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1.0;
    }
    
    if (staticCanvasRef.current && staticCanvasRef.current.width > 0 && staticCanvasRef.current.height > 0) {
        ctx.drawImage(staticCanvasRef.current, 0, 0, width, height);
    } else layoutDirtyRef.current = true;

    const hitBarAlpha = 0.4 + beatPulse * 0.3;
    ctx.fillStyle = `${safeThemeRef.current.primaryColor}${Math.floor(hitBarAlpha * 255).toString(16).padStart(2,'0')}`;
    ctx.fillRect(startX, hitLineY - 1, count * laneW, 2);
    ctx.fillStyle = `${safeThemeRef.current.primaryColor}22`;
    ctx.fillRect(startX, hitLineY - 3, count * laneW, 6);

    for (let i = 0; i < count; i++) {
        const x = startX + i * laneW;
        if (laneMissStateRef.current[i] > 0) {
            ctx.fillStyle = `rgba(255, 50, 50, ${laneMissStateRef.current[i] * 0.25})`; 
            ctx.fillRect(x, 0, laneW, height);
            if (!isFrozen) laneMissStateRef.current[i] = Math.max(0, laneMissStateRef.current[i] - 0.05);
        }
        if (laneHitStateRef.current[i] > 0) {
            const alpha = laneHitStateRef.current[i];
            const grad = ctx.createLinearGradient(x, hitLineY, x, hitLineY - 300); 
            grad.addColorStop(0, `${safeThemeRef.current.primaryColor}${Math.floor(alpha * 100).toString(16).padStart(2,'0')}`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(x, hitLineY - 300, laneW, 300);
            if (!isFrozen) laneHitStateRef.current[i] = Math.max(0, alpha - 0.1);
        }
        if (keyStateRef.current[i] || (isAutoRef.current && laneHitStateRef.current[i] > 0.5)) {
            ctx.fillStyle = `${safeThemeRef.current.primaryColor}22`; 
            ctx.fillRect(x, hitLineY - 150, laneW, 150);
        }
    }

    const viewLimitTop = -100;
    const viewLimitBottom = height + 100;
    
    // Sort notes so Holds are drawn first (bottom layer), then Normal/Catch on top
    // Note: This check runs every frame, could be optimized, but notes array is usually < 2000.
    // Ideally we should pre-sort or use layers. For now, we iterate and draw selectively.
    
    // 0. Chord Lines Indicator (多押提示)
    if (!hideNotesRef.current) {
        const visibleNotes = notesRef.current.filter(n => (n.visible || n.missed) && !n.isHolding && n.type !== 'CATCH');
        const chords = new Map<number, Note[]>();
        for (const note of visibleNotes) {
            const timeKey = Math.round(note.time * 100); // cluster by 10ms
            const prev = chords.get(timeKey) || [];
            prev.push(note);
            chords.set(timeKey, prev);
        }
        
        ctx.lineWidth = 4;
        ctx.strokeStyle = `rgba(255, 255, 255, 0.4)`;
        ctx.lineCap = 'round';
        for (const [timeKey, chordNotes] of chords.entries()) {
            if (chordNotes.length > 1) {
                const time = chordNotes[0].time;
                const headY = hitLineY - getVisualGap(time, gameTime, chordNotes[0].id) * speed;
                if (headY < viewLimitTop || headY > viewLimitBottom) continue;
                
                const minLane = Math.min(...chordNotes.map(n => n.lane));
                const maxLane = Math.max(...chordNotes.map(n => n.lane));
                
                const startXPos = startX + minLane * laneW + laneW / 2;
                const endXPos = startX + maxLane * laneW + laneW / 2;
                
                ctx.beginPath();
                ctx.moveTo(startXPos, headY - 5);
                ctx.lineTo(endXPos, headY - 5);
                ctx.stroke();
            }
        }
    }

    // 1. Draw Holds Bodies
    notesRef.current.forEach(note => {
        if (!note.visible && !note.missed) return;
        if (note.duration === 0) return; // Skip normal notes for now

        const headY = hitLineY - getVisualGap(note.time, gameTime, note.id) * speed; 
        const tailY = hitLineY - getVisualGap(note.time + note.duration, gameTime, note.id) * speed;
        if (headY < viewLimitTop || tailY > viewLimitBottom) return; 

        if (hideNotesRef.current && !note.missed) return;

        let noteAnimOffsetX = 0;
        if (!isFrozen && hitLineY - headY > 0) { 
            const distRatio = Math.max(0, Math.min(1, (hitLineY - headY) / hitLineY));
            noteAnimOffsetX = Math.sin(gameTime * 15 + note.time * 10 + note.lane) * (1.5 * visualIntensity) * distRatio;
        }

        const noteX = startX + note.lane * laneW + 4 + noteAnimOffsetX;
        const noteW = laneW - 8;
        
        let drawHeadY = headY;
        let drawTailY = tailY;
        if (note.isHolding) { 
            drawHeadY = hitLineY; 
            drawTailY = hitLineY - getVisualGap(note.time + note.duration, gameTime, note.id) * speed; 
        }
        let drawHeight = Math.max(0, drawHeadY - drawTailY);
        const tailW = noteW * 0.8; const tailX = noteX + (noteW - tailW) / 2;
        ctx.fillStyle = note.missed ? '#44444444' : `${safeThemeRef.current.secondaryColor}44`;
        ctx.fillRect(tailX, drawHeadY - drawHeight, tailW, drawHeight);
        ctx.fillStyle = note.missed ? '#444' : safeThemeRef.current.secondaryColor;
        ctx.fillRect(tailX, drawHeadY - drawHeight - 2, tailW, 4); 
    });

    // 2. Draw Note Heads & Handle Logic
    notesRef.current.forEach(note => {
        if (!note.visible && !note.missed) return;
        
        // Auto Play
        if (isAutoRef.current && !note.hit && !note.missed && !isFrozen && gameTime >= note.time) {
            note.hit = true;
            if (note.duration > 0) note.isHolding = true; else note.visible = false;
            
            scoreRef.current.perfect++; 
            scoreRef.current.combo++;
            if (scoreRef.current.combo > scoreRef.current.maxCombo) scoreRef.current.maxCombo = scoreRef.current.combo;
            
            const totalNotes = notesRef.current.length || 1;
            let scoreToAdd = ((MAX_SCORE * ACC_WEIGHT) / totalNotes) * 1.0 + ((MAX_SCORE * COMBO_WEIGHT) / totalNotes);
            if (note.duration > 0) {
                note.holdScoreTarget = scoreToAdd * 0.8;
                note.holdScoreGained = 0;
                scoreToAdd = scoreToAdd * 0.2;
            }
            scoreRef.current.score = Math.min(MAX_SCORE, scoreRef.current.score + scoreToAdd);

            // Record a perfect 0ms offset hit for histogram consistency
            scoreRef.current.hitHistory.push(0);

            triggerHitVisuals(note.lane, 'PERFECT');
            onScoreUpdate({...scoreRef.current});
        }

        if (!isFrozen) {
            // Already hit/holding?
            if (note.hit && !note.missed && !note.isHolding) {
                // Completely finished note, don't draw head
                if (note.duration === 0) return;
            }
            
            // --- Catch Logic Upgrade: Check for "Hold-through" ---
            if (note.type === 'CATCH' && !note.hit && !note.missed && !isAutoRef.current) {
                 const windowCatch = BASE_HIT_WINDOW_CATCH * hitWindowMultiplierRef.current;
                 // If key is CURRENTLY down (held) OR just pressed, allow catch
                 if (Math.abs(gameTime - note.time) <= windowCatch && keyStateRef.current[note.lane]) {
                     note.hit = true; note.visible = false;
                     scoreRef.current.perfect++; scoreRef.current.combo++;
                     const totalNotes = notesRef.current.length || 1;
                     const scorePerPerfect = ((MAX_SCORE * ACC_WEIGHT) / totalNotes) * 1.0 + ((MAX_SCORE * COMBO_WEIGHT) / totalNotes);
                     
                     scoreRef.current.score = Math.min(MAX_SCORE, scoreRef.current.score + scorePerPerfect);

                     triggerHitVisuals(note.lane, 'PERFECT'); 
                     onScoreUpdate({...scoreRef.current});
                 }
            }
            
            const windowGood = BASE_HIT_WINDOW_GOOD * hitWindowMultiplierRef.current;
            if (!note.hit && !note.missed && gameTime > note.time + windowGood) {
                note.missed = true; note.hit = true; scoreRef.current.miss++; scoreRef.current.combo = 0;
                laneMissStateRef.current[note.lane] = 0.8; 
                effectRef.current.push({ id: Math.random(), text: 'MISS', time: performance.now(), lane: note.lane, color: '#888888', scale: 1.2 });
                if (isSuddenDeathRef.current && !hasEndedRef.current) { hasEndedRef.current = true; onGameEnd(scoreRef.current); }
                onScoreUpdate({...scoreRef.current});
            }
            
            // Hold Logic: Ticks & Completion
            if (note.hit && note.duration > 0 && note.isHolding) {
                if (gameTime < note.time + note.duration) {
                    // Holding Effect
                    if (Math.random() > 0.6) {
                        const p = particlePoolRef.current.get();
                        p.reset((startX + note.lane * laneW + laneW / 2), hitLineY, safeThemeRef.current.secondaryColor);
                        particlesRef.current.push(p);
                    }
                    
                    if (note.holdScoreTarget && note.holdScoreTarget > 0) {
                        const progress = Math.max(0, Math.min(1, (gameTime - note.time) / note.duration));
                        const expectedGain = note.holdScoreTarget * progress;
                        const toAdd = expectedGain - (note.holdScoreGained || 0);
                        if (toAdd > 0) {
                            scoreRef.current.score = Math.min(MAX_SCORE, scoreRef.current.score + toAdd);
                            note.holdScoreGained = expectedGain;
                        }
                    }

                } else { 
                    // Hold Complete
                    if (note.holdScoreTarget && note.holdScoreTarget > 0) {
                        const remaining = note.holdScoreTarget - (note.holdScoreGained || 0);
                        if (remaining > 0) {
                            scoreRef.current.score = Math.min(MAX_SCORE, scoreRef.current.score + remaining);
                            note.holdScoreGained = note.holdScoreTarget;
                        }
                    }
                    note.visible = false; 
                    note.isHolding = false; 
                    triggerHitVisuals(note.lane, 'PERFECT'); // Visual flourish on release
                }
                onScoreUpdate({...scoreRef.current});
            }
        }
        
        const headY = hitLineY - getVisualGap(note.time, gameTime, note.id) * speed; 
        
        // Skip drawing if out of view (for non-holding notes)
        if (headY < viewLimitTop || headY > viewLimitBottom) return;
        if (hideNotesRef.current && !note.missed) return;

        let noteAnimOffsetX = 0;
        let noteAnimOffsetY = 0;
        if (!isFrozen && hitLineY - headY > 0) { 
            const distRatio = Math.max(0, Math.min(1, (hitLineY - headY) / hitLineY));
            if (note.duration === 0 && note.type !== 'CATCH') {
                noteAnimOffsetX = Math.sin(gameTime * 15 + note.time * 10 + note.lane) * (1.5 * visualIntensity) * distRatio;
                noteAnimOffsetY = Math.cos(gameTime * 20 + note.time * 20) * (1 * visualIntensity) * distRatio;
            }
        }

        const noteX = startX + note.lane * laneW + 4 + noteAnimOffsetX;
        const noteW = laneW - 8;
        const drawHeadY = headY + noteAnimOffsetY;
        let opacity = 1.0;
        if (isHiddenRef.current && !note.missed && !note.isHolding) opacity = Math.max(0, Math.min(1, (hitLineY - drawHeadY - 100) / 300));

        let noteColor = safeThemeRef.current.primaryColor; 
        if (note.missed) noteColor = '#444444';
        else if (note.type === 'CATCH') noteColor = safeThemeRef.current.catchColor || '#f9f871';
        else if (note.duration > 0) noteColor = safeThemeRef.current.secondaryColor;

        // --- Audio Feature Visuals ---
        let dynamicW = noteW;
        let dynamicX = noteX;
        let isTonal = false;
        
        if (!note.missed && note.energy !== undefined && note.zcr !== undefined) {
             // Energy scales the note slightly
             const energyBoost = note.energy * 6;
             dynamicW += energyBoost;
             dynamicX -= energyBoost / 2;
             
             // High ZCR (noise) adds extreme jitter, Low ZCR (bass) adds a subtle glow
             if (note.zcr > 0.4 && !isFrozen) {
                 dynamicX += (Math.random() - 0.5) * 4 * note.zcr;
             }
             if (note.zcr < 0.15) {
                 isTonal = true; 
             }
        }
        
        ctx.globalAlpha = note.missed ? 0.4 : opacity;
        
        if (isTonal && !note.missed) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = noteColor;
        } else {
            ctx.shadowBlur = 0;
        }

        // Draw Head (Only if not holding or it's a catch/tap)
        if (!note.isHolding || note.type === 'CATCH') {
            if (note.type === 'CATCH') {
                const cx = dynamicX + dynamicW / 2; const cy = drawHeadY;
                ctx.fillStyle = noteColor;
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(dynamicX + 4, drawHeadY - 6, dynamicW - 8, 12, 6);
                } else {
                    ctx.fillRect(dynamicX + 4, drawHeadY - 6, dynamicW - 8, 12);
                }
                ctx.fill();
                
                ctx.fillStyle = '#FFF';
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(dynamicX + 8, drawHeadY - 2, dynamicW - 16, 4, 2);
                } else {
                    ctx.fillRect(dynamicX + 8, drawHeadY - 2, dynamicW - 16, 4);
                }
                ctx.fill();
            } else {
                ctx.fillStyle = noteColor;
                ctx.fillRect(dynamicX, drawHeadY - 5, dynamicW, 10);
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillRect(dynamicX, drawHeadY - 5, dynamicW, 2);
            }
        } 
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;
    });

    if (isFlashlightRef.current) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        const flGrad = ctx.createRadialGradient(width/2, hitLineY, 50, width/2, hitLineY, 350);
        flGrad.addColorStop(0, 'rgba(0,0,0,1)'); flGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = flGrad; ctx.fillRect(0, 0, width, height);
        ctx.restore();
    }

    // Ghost Note Loop (Pooled)
    const activeGhosts = ghostNotesRef.current;
    for (let i = activeGhosts.length - 1; i >= 0; i--) {
        const g = activeGhosts[i];
        const y = hitLineY - (g.timeDiff * speed);
        ctx.globalAlpha = g.life * 0.4; ctx.fillStyle = safeThemeRef.current.secondaryColor;
        ctx.fillRect(startX + g.lane * laneW + 4, y - 6, laneW - 8, 12);
        ctx.globalAlpha = 1.0; 
        
        if (!isFrozen) g.life -= 0.05;
        
        if (g.life <= 0) {
            ghostNotePoolRef.current.release(g);
            // Swap Remove
            activeGhosts[i] = activeGhosts[activeGhosts.length - 1];
            activeGhosts.pop();
        }
    }

    // Particle Loop (Pooled)
    const activeParticles = particlesRef.current;
    for (let i = activeParticles.length - 1; i >= 0; i--) {
        const p = activeParticles[i];
        if (!isFrozen) p.update();
        p.draw(ctx);
        if (p.life <= 0) {
            particlePoolRef.current.release(p);
            // Swap Remove
            activeParticles[i] = activeParticles[activeParticles.length - 1];
            activeParticles.pop();
        }
    }

    effectRef.current = effectRef.current.filter(effect => performance.now() - effect.time < 500);
    effectRef.current.forEach(effect => {
        const progress = isFrozen ? 0 : (performance.now() - effect.time) / 500;
        ctx.save();
        ctx.fillStyle = effect.color;
        const fontSize = Math.max(16, Math.min(32, width * 0.06));
        ctx.font = `italic 900 ${fontSize}px Arial`; ctx.textAlign = 'center';
        const x = startX + effect.lane * laneW + laneW / 2;
        const y = hitLineY - 40 - (progress * 50);
        ctx.globalAlpha = 1 - progress;
        ctx.translate(x, y); ctx.scale(1.2 - progress * 0.2, 1.2 - progress * 0.2);
        ctx.fillText(effect.text, 0, 0);
        ctx.restore();
    });

    const progress = Math.min(1, Math.max(0, gameTime) / (audioBuffer?.duration || 1));
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(0, 0, width, 4);
    ctx.fillStyle = safeThemeRef.current.primaryColor; ctx.fillRect(0, 0, width * progress, 4);

    drawSystemStats(ctx, width, height, performance.now());

    if (scoreRef.current.combo > 0) {
        if (!isFrozen) comboScaleRef.current += (1.0 - comboScaleRef.current) * 0.15;
        ctx.save();
        const yPos = height * (width > height ? 0.2 : 0.3);
        ctx.translate(width / 2, yPos); ctx.scale(comboScaleRef.current, comboScaleRef.current);
        const fontSize = isMobileRef.current ? 32 : 80; // Reduced for mobile
        ctx.font = `italic 900 ${fontSize}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(scoreRef.current.combo.toString(), 0, 0);
        ctx.font = `bold ${fontSize * 0.3}px sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText("COMBO", 0, fontSize * 0.4);
        ctx.restore();
    }
    
    lastFrameTimeRef.current = performance.now();
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full flex justify-center overflow-hidden bg-black touch-none select-none"
        style={{ touchAction: 'none' }} onTouchStart={handleGlobalTouch} onTouchMove={handleGlobalTouch} onTouchEnd={handleGlobalTouch} onTouchCancel={handleGlobalTouch}>
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div className="absolute top-4 right-4 md:right-6 text-right pointer-events-none z-20 mix-blend-screen">
          <div className="text-xl md:text-3xl font-black text-white tracking-tighter tabular-nums drop-shadow-md">
              {Math.round(scoreRef.current.score).toLocaleString()}
          </div>
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest opacity-80">Score</div>
      </div>
    </div>
  );
};

export default GameCanvas;
