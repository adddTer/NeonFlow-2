
import React, { useEffect, useRef, useState } from 'react';
import { Note, ScoreState, GameStatus, AITheme, LaneCount, NoteLane, SongStructure, GameModifier } from '../types';
import { useSoundSystem } from '../hooks/useSoundSystem';
import { Particle, GhostNote, HitEffect } from './game/Visuals';
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
}

const BASE_TARGET_WIDTH = 100; 
const BASE_HIT_WINDOW_PERFECT = 0.050; 
const BASE_HIT_WINDOW_GOOD = 0.120; 
const BASE_HIT_WINDOW_CATCH = 0.100;
const SCORE_BASE_PERFECT = 1000;
const SCORE_BASE_GOOD = 500;
const SCORE_HOLD_TICK = 20; 
const LEAD_IN_TIME = 2.0; 

const GameCanvas: React.FC<GameCanvasProps> = ({ 
  status, audioBuffer, notes, structure, theme, audioOffset, scrollSpeed,
  keyBindings, modifiers, hideNotes, onScoreUpdate, onGameEnd 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  
  // Game State Refs
  const notesRef = useRef<Note[]>([]);
  const scoreRef = useRef<ScoreState>({ score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, hitHistory: [], modifiers: [] });
  const keyStateRef = useRef<boolean[]>([]);
  const laneMissStateRef = useRef<number[]>([]); 
  const laneHitStateRef = useRef<number[]>([]); 
  const effectRef = useRef<HitEffect[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const ghostNotesRef = useRef<GhostNote[]>([]); 
  const comboScaleRef = useRef<number>(1.0);
  const hasEndedRef = useRef(false);
  
  // Mod Specific Refs
  const playbackRateRef = useRef<number>(1.0);
  const hitWindowMultiplierRef = useRef<number>(1.0);
  const isAutoRef = useRef<boolean>(false);
  const isSuddenDeathRef = useRef<boolean>(false);
  const isHiddenRef = useRef<boolean>(false);
  const isFlashlightRef = useRef<boolean>(false);

  // Visual Smoothing Refs
  const smoothedIntensityRef = useRef<number>(0);

  // Layout & Config Refs
  const laneCountRef = useRef<LaneCount>(4);
  const keysRef = useRef<string[]>([]);
  const labelsRef = useRef<string[]>([]);
  const laneWidthRef = useRef<number>(BASE_TARGET_WIDTH);
  const startXRef = useRef<number>(0);
  const pixelsPerSecondRef = useRef<number>(800);
  const activeTouchesRef = useRef<Map<number, number>>(new Map()); 

  const [layout, setLayout] = useState({ startX: 0, laneWidth: 0, count: 4 });
  const { playHitSound } = useSoundSystem();

  // --- Mod Logic Initialization ---
  useEffect(() => {
      // 1. Rate Mods
      if (modifiers.includes(GameModifier.DoubleTime)) playbackRateRef.current = 1.5;
      else if (modifiers.includes(GameModifier.HalfTime)) playbackRateRef.current = 0.75;
      else playbackRateRef.current = 1.0;

      // 2. Difficulty Mods
      if (modifiers.includes(GameModifier.HardRock)) hitWindowMultiplierRef.current = 0.7; // 30% stricter
      else hitWindowMultiplierRef.current = 1.0;

      // 3. Other Flags
      isAutoRef.current = modifiers.includes(GameModifier.Auto);
      isSuddenDeathRef.current = modifiers.includes(GameModifier.SuddenDeath);
      isHiddenRef.current = modifiers.includes(GameModifier.Hidden);
      isFlashlightRef.current = modifiers.includes(GameModifier.Flashlight);

      // Score Multiplier Logic (Implicit in score calculation)
  }, [modifiers]);

  // --- Helpers for Input Hook ---
  const getCurrentGameTime = () => {
      const ctx = audioContextRef.current;
      if (!ctx) return 0;
      const outputLatency = (ctx as any).outputLatency || 0;
      const baseLatency = (ctx as any).baseLatency || 0;
      // Adjust for playback rate: (RealTimeDelta * Rate)
      const realTimeElapsed = ctx.currentTime - startTimeRef.current;
      const gameTimeElapsed = realTimeElapsed * playbackRateRef.current;
      
      return gameTimeElapsed - (audioOffset / 1000) - (outputLatency + baseLatency);
  };

  const getScoreMultiplier = () => {
      let mult = 1.0;
      if (modifiers.includes(GameModifier.DoubleTime)) mult *= 1.2;
      if (modifiers.includes(GameModifier.HalfTime)) mult *= 0.5;
      if (modifiers.includes(GameModifier.HardRock)) mult *= 1.1;
      if (modifiers.includes(GameModifier.Hidden)) mult *= 1.06;
      if (modifiers.includes(GameModifier.Flashlight)) mult *= 1.12;
      if (modifiers.includes(GameModifier.SuddenDeath)) mult *= 1.0; // High risk no reward (standard)
      if (modifiers.includes(GameModifier.Auto)) mult = 0; // Unranked
      return mult;
  };

  const processHit = (lane: number) => {
    if (!audioContextRef.current) return;
    const gameTime = getCurrentGameTime();
    
    // Apply HR Window scaling
    const windowGood = BASE_HIT_WINDOW_GOOD * hitWindowMultiplierRef.current;

    const hitNote = notesRef.current.find(n => 
      !n.hit && !n.missed && n.lane === lane && n.type === 'NORMAL' && 
      Math.abs(gameTime - n.time) < windowGood
    );

    if (hitNote) {
      const diff = gameTime - hitNote.time; // Negative = Early, Positive = Late
      const absDiff = Math.abs(diff);
      
      let type: 'PERFECT' | 'GOOD' = 'GOOD';
      let baseScore = SCORE_BASE_GOOD;
      const windowPerfect = BASE_HIT_WINDOW_PERFECT * hitWindowMultiplierRef.current;

      if (absDiff < windowPerfect) {
        type = 'PERFECT';
        baseScore = SCORE_BASE_PERFECT;
        scoreRef.current.perfect++;
      } else {
        scoreRef.current.good++;
      }

      // Record Offset for Histogram
      scoreRef.current.hitHistory.push(diff);

      triggerHitVisuals(lane, type);

      if (hideNotes) {
          ghostNotesRef.current.push({ lane: lane, timeDiff: hitNote.time - gameTime, life: 1.0 });
      }

      hitNote.hit = true;
      if (hitNote.duration > 0) hitNote.isHolding = true;
      else hitNote.visible = false;
      
      scoreRef.current.combo++;
      if (scoreRef.current.combo > scoreRef.current.maxCombo) scoreRef.current.maxCombo = scoreRef.current.combo;
      
      const modMult = getScoreMultiplier();
      const comboBonus = 1 + Math.min(scoreRef.current.combo, 100) / 50;
      scoreRef.current.score += baseScore * comboBonus * modMult;
    }
    onScoreUpdate({...scoreRef.current});
  };

  const processRelease = (lane: number) => {
      const holdingNote = notesRef.current.find(n => n.lane === lane && n.isHolding);
      if (holdingNote) holdingNote.isHolding = false;
  };

  // --- Use Input Hook ---
  const { handleGlobalTouch } = useGameInput({
      status,
      laneCountRef,
      keysRef,
      keyStateRef,
      laneWidthRef,
      startXRef,
      activeTouchesRef,
      onHit: processHit,
      onRelease: processRelease
  });

  // --- Initialization & Config ---
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

      if (containerRef.current) updateLayout(containerRef.current.clientWidth, containerRef.current.clientHeight);
  }, [notes, keyBindings]);

  useEffect(() => {
      const baseSpeed = 400;
      const speedMultiplier = 300;
      pixelsPerSecondRef.current = baseSpeed + ((scrollSpeed - 1) * speedMultiplier);
  }, [scrollSpeed]);

  const updateLayout = (w: number, h: number) => {
      const count = laneCountRef.current;
      const laneW = Math.min(BASE_TARGET_WIDTH, w / count);
      const startX = (w - (laneW * count)) / 2;
      laneWidthRef.current = laneW;
      startXRef.current = startX;
      setLayout({ startX, laneWidth: laneW, count });
  };

  useEffect(() => {
      if (!containerRef.current) return;
      const resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) updateLayout(entry.contentRect.width, entry.contentRect.height);
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
  }, []);

  // --- Audio Control ---
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
    
    // Apply Rate Mod
    source.playbackRate.value = playbackRateRef.current;
    
    const now = ctx.currentTime;
    
    // Adjust start time logic for playback rate
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

  // --- Status Management ---
  useEffect(() => {
    if (status === GameStatus.Playing && !audioContextRef.current) {
      notesRef.current = JSON.parse(JSON.stringify(notes));
      scoreRef.current = { score: 0, combo: 0, maxCombo: 0, perfect: 0, good: 0, miss: 0, hitHistory: [], modifiers };
      effectRef.current = []; particlesRef.current = []; ghostNotesRef.current = []; comboScaleRef.current = 1.0;
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

  // --- Visuals Logic ---
  const triggerHitVisuals = (lane: number, type: 'PERFECT' | 'GOOD') => {
      const isPerfect = type === 'PERFECT';
      playHitSound(type);
      laneHitStateRef.current[lane] = 1.0; 
      comboScaleRef.current = 1.5;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const laneX = (startXRef.current + lane * laneWidthRef.current + laneWidthRef.current / 2) * dpr;
      
      // Use logic similar to render loop to find "hit Y" for particles, though we can't easily access dynamic hitLineY here without ref.
      // For now, we assume a reasonable default or recalculate.
      // To be safe, we'll calc logic in game loop or just use a standard percentage since particles fall.
      // Let's use 85% as a safe baseline for particles spawn.
      const hitY = (canvasRef.current?.height || 0) * 0.85; 
      
      const hitColor = isPerfect ? theme.perfectColor : theme.goodColor;
      for (let i = 0; i < (isPerfect ? 15 : 8); i++) particlesRef.current.push(new Particle(laneX, hitY, hitColor));
      
      effectRef.current.push({ id: Math.random(), text: type, time: performance.now(), lane: lane, color: hitColor, scale: 1.5 });
  };

  // --- Render Loop ---
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
    if (!canvas || !containerRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = containerRef.current.getBoundingClientRect();
    if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width; const height = rect.height;
    const laneW = laneWidthRef.current; const startX = startXRef.current;
    const count = laneCountRef.current; const speed = pixelsPerSecondRef.current;
    
    // --- RESPONSIVE JUDGMENT LINE ---
    // Mobile/Portrait: 85% (Lower, for thumbs)
    // Desktop/Landscape: 80% (Standard VSRG)
    const isPortrait = height > width;
    const isSmallScreen = width < 768;
    const hitLineRatio = (isSmallScreen || isPortrait) ? 0.85 : 0.80;
    const hitLineY = height * hitLineRatio;

    // --- Kiai Time & Background Logic ---
    let targetIntensity = 0;
    
    if (structure && structure.sections) {
        const currentSection = structure.sections.find(s => gameTime >= s.startTime && gameTime < s.endTime);
        if (currentSection) {
            targetIntensity = currentSection.intensity;
            if (currentSection.type === 'chorus' || currentSection.type === 'drop') {
                targetIntensity = Math.max(targetIntensity, 0.85);
            }
        }
    }

    if (!isFrozen) {
        smoothedIntensityRef.current += (targetIntensity - smoothedIntensityRef.current) * 0.05;
    }
    const visualIntensity = smoothedIntensityRef.current;
    const isKiai = visualIntensity > 0.75;

    let beatPulse = 0;
    if (!isFrozen) {
        const bpm = structure?.bpm || 120;
        const beatDur = 60 / bpm;
        const phase = (gameTime % beatDur) / beatDur;
        beatPulse = Math.pow(1 - phase, 2); 
    }

    ctx.clearRect(0, 0, width, height); 
    
    // 1. Base Background
    ctx.fillStyle = '#0a0a0a'; 
    ctx.fillRect(0, 0, width, height);
    
    // 2. Pulse
    if (visualIntensity > 0.1) {
        const maxRadius = Math.max(width, height) * 0.8;
        const pulseRadius = maxRadius * (0.8 + beatPulse * 0.2); 
        const radialGrad = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, pulseRadius);
        const glowColor = isKiai ? theme.primaryColor : theme.secondaryColor;
        const opacity = (visualIntensity * 0.15) + (isKiai ? beatPulse * 0.1 : 0);
        
        radialGrad.addColorStop(0, `${glowColor}${Math.floor(opacity * 255).toString(16).padStart(2,'0')}`);
        radialGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = radialGrad;
        ctx.fillRect(0, 0, width, height);
    }
    
    // 3. Track Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; 
    ctx.fillRect(startX, 0, count * laneW, height);

    // 4. Background Particles
    if (visualIntensity > 0.4 && Math.random() > 0.85) {
         ctx.fillStyle = Math.random() > 0.5 ? theme.primaryColor : theme.secondaryColor;
         const px = startX + Math.random() * (laneW * count);
         const py = height;
         ctx.globalAlpha = 0.4 * visualIntensity;
         ctx.fillRect(px, py - Math.random() * 200, 2, Math.random() * 10 + 2);
         ctx.globalAlpha = 1.0;
    }

    // --- DRAW LANES & DIVIDERS ---
    for (let i = 0; i <= count; i++) {
        const x = startX + i * laneW;
        const divGrad = ctx.createLinearGradient(0, 0, 0, height);
        divGrad.addColorStop(0, 'rgba(255,255,255,0)');
        divGrad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
        divGrad.addColorStop(1, 'rgba(255,255,255,0.2)');
        
        ctx.fillStyle = divGrad;
        ctx.fillRect(x - 0.5, 0, 1, height);
    }

    // Draw Hit Zone
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.shadowBlur = 20;
    ctx.shadowColor = theme.primaryColor;
    const hitBarGrad = ctx.createLinearGradient(0, hitLineY - 5, 0, hitLineY + 5);
    hitBarGrad.addColorStop(0, 'rgba(255,255,255,0)');
    hitBarGrad.addColorStop(0.5, theme.primaryColor);
    hitBarGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hitBarGrad;
    ctx.fillRect(startX, hitLineY - 2, count * laneW, 4);
    
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(startX, hitLineY - 1, count * laneW, 2);
    ctx.restore();

    // Draw Lane Press Effects
    for (let i = 0; i < count; i++) {
        const x = startX + i * laneW;
        
        if (laneMissStateRef.current[i] > 0) {
            ctx.fillStyle = `rgba(255, 50, 50, ${laneMissStateRef.current[i] * 0.3})`; 
            ctx.fillRect(x, 0, laneW, height);
            if (!isFrozen) laneMissStateRef.current[i] = Math.max(0, laneMissStateRef.current[i] - 0.05);
        }
        
        if (laneHitStateRef.current[i] > 0) {
            const alpha = laneHitStateRef.current[i];
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const grad = ctx.createLinearGradient(x, hitLineY, x, hitLineY - 400); 
            grad.addColorStop(0, `${theme.primaryColor}${Math.floor(alpha * 150).toString(16).padStart(2,'0')}`);
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.fillRect(x, hitLineY - 400, laneW, 400);
            
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
            ctx.fillRect(x, hitLineY, laneW, height - hitLineY);
            ctx.restore();
            
            if (!isFrozen) laneHitStateRef.current[i] = Math.max(0, alpha - 0.15);
        }

        const isPressed = keyStateRef.current[i] || (isAutoRef.current && laneHitStateRef.current[i] > 0.5);
        if (isPressed) {
            const grad = ctx.createLinearGradient(x, hitLineY, x, hitLineY - 150);
            grad.addColorStop(0, `${theme.primaryColor}44`); 
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad; 
            ctx.fillRect(x, hitLineY - 150, laneW, 150);
            
            if (width >= 768) {
                ctx.fillStyle = '#ffffff';
                ctx.font = `bold 24px sans-serif`; ctx.textAlign = 'center';
                ctx.fillText(labelsRef.current[i], x + laneW / 2, hitLineY + 60);
            }
        } else if (width >= 768) {
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.font = `bold 24px sans-serif`; ctx.textAlign = 'center';
            ctx.fillText(labelsRef.current[i], x + laneW / 2, hitLineY + 60);
        }
    }

    // --- NOTES RENDERING ---
    notesRef.current.forEach(note => {
        if (!note.visible && !note.missed) return;
        
        // --- LOGIC ---
        if (isAutoRef.current && !note.hit && !note.missed && !isFrozen) {
            if (gameTime >= note.time) {
                note.hit = true;
                if (note.duration > 0) note.isHolding = true; else note.visible = false;
                scoreRef.current.perfect++; scoreRef.current.combo++;
                if (scoreRef.current.combo > scoreRef.current.maxCombo) scoreRef.current.maxCombo = scoreRef.current.combo;
                scoreRef.current.score += SCORE_BASE_PERFECT * (1 + Math.min(scoreRef.current.combo, 100) / 50) * getScoreMultiplier();
                triggerHitVisuals(note.lane, 'PERFECT');
                onScoreUpdate({...scoreRef.current});
            }
        }

        if (!isFrozen) {
            if (note.hit && !note.missed && !note.isHolding) return;
            // Catch
            if (note.type === 'CATCH' && !note.hit && !note.missed && !isAutoRef.current) {
                 const windowCatch = BASE_HIT_WINDOW_CATCH * hitWindowMultiplierRef.current;
                 if (Math.abs(gameTime - note.time) <= windowCatch && keyStateRef.current[note.lane]) {
                     note.hit = true; note.visible = false;
                     scoreRef.current.perfect++; scoreRef.current.combo++;
                     if (scoreRef.current.combo > scoreRef.current.maxCombo) scoreRef.current.maxCombo = scoreRef.current.combo;
                     scoreRef.current.score += SCORE_BASE_PERFECT * (1 + Math.min(scoreRef.current.combo, 100) / 50) * getScoreMultiplier();
                     triggerHitVisuals(note.lane, 'PERFECT'); onScoreUpdate({...scoreRef.current});
                 }
            }
            // Miss
            const windowGood = BASE_HIT_WINDOW_GOOD * hitWindowMultiplierRef.current;
            const noteMissTime = note.time + windowGood;
            if (!note.hit && !note.missed && gameTime > noteMissTime) {
                note.missed = true; note.hit = true; scoreRef.current.miss++; scoreRef.current.combo = 0;
                laneMissStateRef.current[note.lane] = 1.0; 
                effectRef.current.push({ id: Math.random(), text: 'MISS', time: performance.now(), lane: note.lane, color: '#888888', scale: 1.2 });
                if (isSuddenDeathRef.current && !hasEndedRef.current) { hasEndedRef.current = true; onGameEnd(scoreRef.current); }
                onScoreUpdate({...scoreRef.current});
            }
            // Hold Tick
            if (note.hit && note.duration > 0 && note.isHolding) {
                if (gameTime < note.time + note.duration) {
                    if (Math.random() > 0.5) particlesRef.current.push(new Particle((startX + note.lane * laneW + laneW / 2 + (Math.random() * 20 - 10))*dpr, hitLineY*dpr, theme.secondaryColor));
                    scoreRef.current.score += SCORE_HOLD_TICK * (1 + Math.min(scoreRef.current.combo, 100) / 100) * getScoreMultiplier();
                } else { note.visible = false; note.isHolding = false; }
                onScoreUpdate({...scoreRef.current});
            }
        } else {
            if (note.hit && !note.missed && !note.isHolding) return;
        }
        
        // --- DRAWING ---
        const timeDiff = note.time - gameTime;
        const headY = hitLineY - (timeDiff * speed); 
        const noteX = startX + note.lane * laneW + 4;
        const noteW = laneW - 8;
        
        let opacity = 1.0;
        if (isHiddenRef.current && !note.missed && !note.isHolding) {
            const dist = hitLineY - headY;
            if (dist < 400) { opacity = Math.max(0, (dist - 100) / 300); }
        }

        if (headY > -200 || (headY - note.duration * speed) < height) {
            if (!hideNotes || note.missed) {
                
                // --- COLOR LOGIC (Distinct 3 Colors) ---
                let noteColor = theme.primaryColor; // Default NORMAL
                
                if (note.missed) {
                    noteColor = '#555555';
                } else if (note.type === 'CATCH') {
                    noteColor = theme.catchColor || '#f9f871'; // Distinct CATCH
                } else if (note.duration > 0) {
                    noteColor = theme.secondaryColor; // Distinct HOLD
                }

                ctx.globalAlpha = note.missed ? 0.4 : opacity;
                
                // LONG NOTE BODY
                if (note.duration > 0) {
                    let drawHeadY = headY;
                    let drawHeight = note.duration * speed;
                    if (note.isHolding) {
                        drawHeadY = hitLineY;
                        drawHeight = Math.max(0, (note.time + note.duration - gameTime) * speed);
                    }
                    
                    const tailW = noteW * 0.85; // Wider body (85%)
                    const tailX = noteX + (noteW - tailW) / 2;
                    
                    const lnGrad = ctx.createLinearGradient(0, drawHeadY - drawHeight, 0, drawHeadY);
                    
                    // Gradient stops
                    lnGrad.addColorStop(0, `${noteColor}00`);  // Transparent tip
                    lnGrad.addColorStop(0.2, `${noteColor}66`); // Semi-transparent body
                    lnGrad.addColorStop(1, `${noteColor}CC`);   // Solid connection to head
                    
                    ctx.fillStyle = lnGrad;
                    ctx.fillRect(tailX, drawHeadY - drawHeight, tailW, drawHeight);
                    
                    // Border definition
                    ctx.strokeStyle = `${noteColor}88`;
                    ctx.lineWidth = 1; 
                    ctx.strokeRect(tailX, drawHeadY - drawHeight, tailW, drawHeight);

                    // --- HOLD TAIL CAP (Visual Clarity) ---
                    // Draw a solid line at the very top (physically) of the hold note
                    ctx.fillStyle = noteColor;
                    const tailCapY = drawHeadY - drawHeight;
                    if (tailCapY > 0) {
                        ctx.fillRect(tailX, tailCapY - 2, tailW, 4);
                        ctx.shadowBlur = 5; ctx.shadowColor = noteColor;
                        ctx.fillRect(tailX, tailCapY - 1, tailW, 2);
                        ctx.shadowBlur = 0;
                    }
                }

                // NOTE HEAD
                if (!note.isHolding || note.duration === 0) {
                    if (note.type === 'CATCH') {
                        // Diamond Shape
                        const cx = noteX + noteW / 2; const cy = headY;
                        ctx.save();
                        ctx.translate(cx, cy);
                        ctx.fillStyle = noteColor;
                        
                        // Glow
                        if(!note.missed) {
                            ctx.shadowBlur = 15;
                            ctx.shadowColor = noteColor;
                        }

                        ctx.beginPath(); 
                        ctx.moveTo(0, -12); 
                        ctx.lineTo(noteW/2 + 2, 0); 
                        ctx.lineTo(0, 12); 
                        ctx.lineTo(-noteW/2 - 2, 0); 
                        ctx.closePath(); 
                        ctx.fill();
                        
                        // Inner Detail
                        ctx.fillStyle = '#FFFFFF';
                        ctx.beginPath();
                        ctx.moveTo(0, -4); ctx.lineTo(4, 0); ctx.lineTo(0, 4); ctx.lineTo(-4, 0);
                        ctx.fill();
                        
                        ctx.restore();
                    } else {
                        // Rect Note (Normal & Hold Start)
                        const nh = 10; // Thin note (10px)
                        const ny = headY - nh/2;
                        
                        // Main Body
                        ctx.fillStyle = noteColor;
                        ctx.fillRect(noteX, ny, noteW, nh);
                        
                        // Top Highlight (3D effect)
                        ctx.fillStyle = 'rgba(255,255,255,0.8)';
                        ctx.fillRect(noteX, ny, noteW, 2); // Thinner highlight
                        
                        // Bottom Glow Strip
                        ctx.fillStyle = 'rgba(255,255,255,0.4)';
                        ctx.fillRect(noteX, ny + nh - 2, noteW, 2);
                        
                        // Border
                        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(noteX, ny, noteW, nh);
                    }
                } 
                ctx.globalAlpha = 1.0;
            }
        }
    });

    // --- FLASHLIGHT MOD ---
    if (isFlashlightRef.current) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        const flGrad = ctx.createRadialGradient(width/2, hitLineY, 50, width/2, hitLineY, 400);
        flGrad.addColorStop(0, 'rgba(0,0,0,1)');
        flGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = flGrad;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
    }

    // --- VISUALS & PARTICLES ---
    ghostNotesRef.current = ghostNotesRef.current.filter(g => g.life > 0);
    ghostNotesRef.current.forEach(g => {
        const y = hitLineY - (g.timeDiff * speed);
        ctx.globalAlpha = g.life * 0.5; ctx.fillStyle = theme.secondaryColor;
        ctx.fillRect(startX + g.lane * laneW + 4, y - 8, laneW - 8, 16);
        ctx.strokeStyle = '#ffffff'; ctx.strokeRect(startX + g.lane * laneW + 4, y - 8, laneW - 8, 16);
        ctx.globalAlpha = 1.0; if (!isFrozen) g.life -= 0.05;
    });

    particlesRef.current.forEach((p, i) => { if (!isFrozen) p.update(); p.draw(ctx); if (p.life <= 0) particlesRef.current.splice(i, 1); });

    // --- HIT TEXT EFFECT RENDER ---
    effectRef.current = effectRef.current.filter(effect => performance.now() - effect.time < 600);
    effectRef.current.forEach(effect => {
        const x = startX + effect.lane * laneW + laneW / 2;
        const progress = isFrozen ? 0 : (performance.now() - effect.time) / 600;
        ctx.save(); 
        ctx.fillStyle = effect.color; 
        
        // REFINED RESPONSIVE FONT SIZE
        // Scaled down: 5% of min dimension, capped at 40px
        const minDim = Math.min(width, height);
        const hitFontSize = Math.max(16, Math.min(40, minDim * 0.05));
        
        ctx.font = `900 ${hitFontSize}px Arial`; 
        ctx.textAlign = 'center';
        
        // DYNAMIC POSITIONING relative to hitLineY
        // Start roughly 2 lines above the hit line
        const startY = hitLineY - (hitFontSize * 2.0); 
        // Float upwards distance proportional to font size
        const moveDist = hitFontSize * 1.5; 
        
        const currentY = startY - (progress * moveDist);

        ctx.translate(x, currentY); 
        
        // Scale pulse effect
        const s = effect.scale * (1 - progress * 0.3);
        ctx.scale(s, s);
        ctx.globalAlpha = 1 - progress; 
        
        ctx.fillText(effect.text, 0, 0); 
        ctx.restore();
    });

    // --- UI OVERLAYS ---
    
    // Progress Bar (Top)
    const progress = Math.min(1, Math.max(0, gameTime) / (audioBuffer?.duration || 1));
    const barH = 6;
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(0, 0, width, barH);
    
    const progGrad = ctx.createLinearGradient(0, 0, width, 0);
    progGrad.addColorStop(0, theme.primaryColor);
    progGrad.addColorStop(1, theme.perfectColor);
    ctx.fillStyle = progGrad;
    ctx.shadowBlur = 10; ctx.shadowColor = theme.primaryColor;
    ctx.fillRect(0, 0, width * progress, barH);
    ctx.shadowBlur = 0;

    // Combo Counter (Center)
    if (scoreRef.current.combo > 0) {
        if (!isFrozen) comboScaleRef.current = comboScaleRef.current + (1.0 - comboScaleRef.current) * 0.1;
        ctx.save(); 
        
        // RESPONSIVE POSITIONING (Mobile Fix)
        const isLandscapeMobile = width > height && height < 500;
        const yPos = height * (isLandscapeMobile ? 0.2 : 0.3);
        
        ctx.translate(width / 2, yPos);
        ctx.scale(comboScaleRef.current, comboScaleRef.current);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        
        // Responsive Font Size
        const baseSize = Math.min(width, height);
        // Smaller relative size on mobile
        const fontSize = width < 600 ? 40 : Math.min(80, baseSize * 0.12); 
        
        // Combo Number
        ctx.font = `italic 900 ${fontSize}px sans-serif`; 
        ctx.fillStyle = scoreRef.current.combo >= 50 ? '#00f3ff' : '#ffffff'; 
        if (scoreRef.current.combo >= 100) ctx.fillStyle = '#f9f871';
        ctx.shadowBlur = 20; ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.fillText(scoreRef.current.combo.toString(), 0, 0);
        ctx.shadowBlur = 0;
        
        // Label
        ctx.font = `bold ${fontSize * 0.3}px sans-serif`; 
        ctx.fillStyle = '#aaaaaa'; 
        ctx.fillText("COMBO", 0, fontSize * 0.6);
        ctx.restore();
    }
    
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full flex justify-center overflow-hidden bg-black touch-none select-none"
        style={{ touchAction: 'none' }} onTouchStart={handleGlobalTouch} onTouchMove={handleGlobalTouch} onTouchEnd={handleGlobalTouch} onTouchCancel={handleGlobalTouch}>
      <canvas ref={canvasRef} className="block w-full h-full" />
      {/* UI Layer is now mostly drawn on canvas for better sync, but we can keep overlay if needed */}
      <div className="absolute top-4 right-4 text-right pointer-events-none hidden md:block">
          <div className="text-3xl font-black text-white tracking-tighter">{Math.floor(scoreRef.current.score).toLocaleString()}</div>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Score</div>
      </div>
    </div>
  );
};

export default GameCanvas;
