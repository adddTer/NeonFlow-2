
import React, { useEffect, useRef, useState, useMemo } from 'react';
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
  
  // Cache for performance
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const isMobileRef = useRef(false);

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

  const { playHitSound } = useSoundSystem();

  // --- Mod Logic Initialization ---
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
  }, [modifiers]);

  const getCurrentGameTime = () => {
      const ctx = audioContextRef.current;
      if (!ctx) return 0;
      const outputLatency = (ctx as any).outputLatency || 0;
      const baseLatency = (ctx as any).baseLatency || 0;
      const realTimeElapsed = ctx.currentTime - startTimeRef.current;
      return (realTimeElapsed * playbackRateRef.current) - (audioOffset / 1000) - (outputLatency + baseLatency);
  };

  const getScoreMultiplier = () => {
      let mult = 1.0;
      if (modifiers.includes(GameModifier.DoubleTime)) mult *= 1.2;
      if (modifiers.includes(GameModifier.HalfTime)) mult *= 0.5;
      if (modifiers.includes(GameModifier.HardRock)) mult *= 1.1;
      if (modifiers.includes(GameModifier.Hidden)) mult *= 1.06;
      if (modifiers.includes(GameModifier.Flashlight)) mult *= 1.12;
      if (modifiers.includes(GameModifier.Auto)) mult = 0;
      return mult;
  };

  const processHit = (lane: number) => {
    if (!audioContextRef.current) return;
    const gameTime = getCurrentGameTime();
    const windowGood = BASE_HIT_WINDOW_GOOD * hitWindowMultiplierRef.current;

    const hitNote = notesRef.current.find(n => 
      !n.hit && !n.missed && n.lane === lane && n.type === 'NORMAL' && 
      Math.abs(gameTime - n.time) < windowGood
    );

    if (hitNote) {
      const diff = gameTime - hitNote.time;
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
      
      onScoreUpdate({...scoreRef.current});
    }
  };

  const processRelease = (lane: number) => {
      const holdingNote = notesRef.current.find(n => n.lane === lane && n.isHolding);
      if (holdingNote) holdingNote.isHolding = false;
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

  const triggerHitVisuals = (lane: number, type: 'PERFECT' | 'GOOD') => {
      const isPerfect = type === 'PERFECT';
      playHitSound(type);
      laneHitStateRef.current[lane] = 1.0; 
      comboScaleRef.current = 1.4;
      const { dpr, height } = sizeRef.current;
      const laneX = (startXRef.current + lane * laneWidthRef.current + laneWidthRef.current / 2);
      const hitY = height * (isMobileRef.current ? 0.85 : 0.80);
      const hitColor = isPerfect ? theme.perfectColor : theme.goodColor;
      
      const pCount = isMobileRef.current ? (isPerfect ? 10 : 6) : (isPerfect ? 20 : 12);
      for (let i = 0; i < pCount; i++) particlesRef.current.push(new Particle(laneX, hitY, hitColor));
      
      effectRef.current.push({ id: Math.random(), text: type, time: performance.now(), lane: lane, color: hitColor, scale: 1.4 });
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
    if (canvas.width !== Math.floor(width * dpr)) {
        canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr);
        canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const laneW = laneWidthRef.current; const startX = startXRef.current;
    const count = laneCountRef.current; const speed = pixelsPerSecondRef.current;
    const hitLineRatio = isMobileRef.current ? 0.85 : 0.80;
    const hitLineY = height * hitLineRatio;

    // Logic updates
    let targetIntensity = 0;
    if (structure?.sections) {
        const currentSection = structure.sections.find(s => gameTime >= s.startTime && gameTime < s.endTime);
        if (currentSection) {
            targetIntensity = currentSection.intensity;
            if (currentSection.type === 'chorus' || currentSection.type === 'drop') targetIntensity = Math.max(targetIntensity, 0.85);
        }
    }
    if (!isFrozen) smoothedIntensityRef.current += (targetIntensity - smoothedIntensityRef.current) * 0.05;
    const visualIntensity = smoothedIntensityRef.current;
    const isKiai = visualIntensity > 0.75;
    let beatPulse = 0;
    if (!isFrozen) {
        const bpm = structure?.bpm || 120;
        const beatDur = 60 / bpm;
        beatPulse = Math.pow(1 - (gameTime % beatDur) / beatDur, 2); 
    }

    // 1. Background (Solid)
    ctx.fillStyle = '#050505'; 
    ctx.fillRect(0, 0, width, height);
    
    // 2. Pulse (Glow layer - instead of shadowBlur)
    if (visualIntensity > 0.1) {
        const opacity = (visualIntensity * 0.1) + (isKiai ? beatPulse * 0.08 : 0);
        ctx.globalAlpha = opacity;
        const glowColor = isKiai ? theme.primaryColor : theme.secondaryColor;
        const radialGrad = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, width);
        radialGrad.addColorStop(0, glowColor);
        radialGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = radialGrad;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1.0;
    }
    
    // 3. Track Background
    ctx.fillStyle = 'rgba(10, 10, 15, 0.6)'; 
    ctx.fillRect(startX, 0, count * laneW, height);

    // 4. Dividers (Batched)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    for (let i = 1; i < count; i++) {
        ctx.fillRect(startX + i * laneW - 0.5, 0, 1, height);
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(startX - 1, 0, 1, height);
    ctx.fillRect(startX + count * laneW, 0, 1, height);

    // 5. Hit Zone (Layered Glows)
    const hitBarAlpha = 0.4 + beatPulse * 0.3;
    ctx.fillStyle = `${theme.primaryColor}${Math.floor(hitBarAlpha * 255).toString(16).padStart(2,'0')}`;
    ctx.fillRect(startX, hitLineY - 1, count * laneW, 2);
    // Extra glow layer
    ctx.fillStyle = `${theme.primaryColor}22`;
    ctx.fillRect(startX, hitLineY - 3, count * laneW, 6);

    // 6. Lane Press Effects
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
            grad.addColorStop(0, `${theme.primaryColor}${Math.floor(alpha * 100).toString(16).padStart(2,'0')}`);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.fillRect(x, hitLineY - 300, laneW, 300);
            if (!isFrozen) laneHitStateRef.current[i] = Math.max(0, alpha - 0.1);
        }
        if (keyStateRef.current[i] || (isAutoRef.current && laneHitStateRef.current[i] > 0.5)) {
            ctx.fillStyle = `${theme.primaryColor}22`; 
            ctx.fillRect(x, hitLineY - 150, laneW, 150);
        }
    }

    // 7. Notes (Culling & Performance)
    const viewLimitTop = -100;
    const viewLimitBottom = height + 100;

    // Cache some note drawing logic to minimize lookups
    notesRef.current.forEach(note => {
        if (!note.visible && !note.missed) return;
        
        if (isAutoRef.current && !note.hit && !note.missed && !isFrozen && gameTime >= note.time) {
            note.hit = true;
            if (note.duration > 0) note.isHolding = true; else note.visible = false;
            scoreRef.current.perfect++; scoreRef.current.combo++;
            if (scoreRef.current.combo > scoreRef.current.maxCombo) scoreRef.current.maxCombo = scoreRef.current.combo;
            scoreRef.current.score += SCORE_BASE_PERFECT * (1 + Math.min(scoreRef.current.combo, 100) / 50) * getScoreMultiplier();
            triggerHitVisuals(note.lane, 'PERFECT');
            onScoreUpdate({...scoreRef.current});
        }

        if (!isFrozen) {
            if (note.hit && !note.missed && !note.isHolding) return;
            if (note.type === 'CATCH' && !note.hit && !note.missed && !isAutoRef.current) {
                 if (Math.abs(gameTime - note.time) <= (BASE_HIT_WINDOW_CATCH * hitWindowMultiplierRef.current) && keyStateRef.current[note.lane]) {
                     note.hit = true; note.visible = false;
                     scoreRef.current.perfect++; scoreRef.current.combo++;
                     scoreRef.current.score += SCORE_BASE_PERFECT * (1 + Math.min(scoreRef.current.combo, 100) / 50) * getScoreMultiplier();
                     triggerHitVisuals(note.lane, 'PERFECT'); onScoreUpdate({...scoreRef.current});
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
            if (note.hit && note.duration > 0 && note.isHolding) {
                if (gameTime < note.time + note.duration) {
                    if (Math.random() > 0.6) particlesRef.current.push(new Particle((startX + note.lane * laneW + laneW / 2), hitLineY, theme.secondaryColor));
                    scoreRef.current.score += SCORE_HOLD_TICK * (1 + Math.min(scoreRef.current.combo, 100) / 100) * getScoreMultiplier();
                } else { note.visible = false; note.isHolding = false; }
                onScoreUpdate({...scoreRef.current});
            }
        }
        
        const headY = hitLineY - (note.time - gameTime) * speed; 
        // CULLING: Skip drawing if not in viewport
        if (headY > viewLimitBottom || (headY + note.duration * speed) < viewLimitTop) return; 

        const noteX = startX + note.lane * laneW + 4;
        const noteW = laneW - 8;
        let opacity = 1.0;
        if (isHiddenRef.current && !note.missed && !note.isHolding) opacity = Math.max(0, Math.min(1, (hitLineY - headY - 100) / 300));

        let noteColor = theme.primaryColor; 
        if (note.missed) noteColor = '#444444';
        else if (note.type === 'CATCH') noteColor = theme.catchColor || '#f9f871';
        else if (note.duration > 0) noteColor = theme.secondaryColor;

        ctx.globalAlpha = note.missed ? 0.4 : opacity;
        
        // Render Hold Body
        if (note.duration > 0) {
            let drawHeadY = headY;
            let drawHeight = note.duration * speed;
            if (note.isHolding) { drawHeadY = hitLineY; drawHeight = Math.max(0, (note.time + note.duration - gameTime) * speed); }
            const tailW = noteW * 0.8; const tailX = noteX + (noteW - tailW) / 2;
            ctx.fillStyle = `${noteColor}44`;
            ctx.fillRect(tailX, drawHeadY - drawHeight, tailW, drawHeight);
            ctx.fillStyle = noteColor;
            ctx.fillRect(tailX, drawHeadY - drawHeight - 2, tailW, 4); 
        }

        // Render Head
        if (!note.isHolding || note.duration === 0) {
            if (note.type === 'CATCH') {
                const cx = noteX + noteW / 2; const cy = headY;
                ctx.fillStyle = noteColor;
                ctx.beginPath(); ctx.moveTo(cx, cy - 10); ctx.lineTo(cx + 12, cy); ctx.lineTo(cx, cy + 10); ctx.lineTo(cx - 12, cy); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#FFF';
                ctx.beginPath(); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx + 4, cy); ctx.lineTo(cx, cy + 4); ctx.lineTo(cx - 4, cy); ctx.closePath(); ctx.fill();
            } else {
                ctx.fillStyle = noteColor;
                ctx.fillRect(noteX, headY - 5, noteW, 10);
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillRect(noteX, headY - 5, noteW, 2);
            }
        } 
        ctx.globalAlpha = 1.0;
    });

    // 8. Flashlight
    if (isFlashlightRef.current) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        const flGrad = ctx.createRadialGradient(width/2, hitLineY, 50, width/2, hitLineY, 350);
        flGrad.addColorStop(0, 'rgba(0,0,0,1)'); flGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = flGrad; ctx.fillRect(0, 0, width, height);
        ctx.restore();
    }

    // 9. Particles & Effects
    ghostNotesRef.current = ghostNotesRef.current.filter(g => g.life > 0);
    ghostNotesRef.current.forEach(g => {
        const y = hitLineY - (g.timeDiff * speed);
        ctx.globalAlpha = g.life * 0.4; ctx.fillStyle = theme.secondaryColor;
        ctx.fillRect(startX + g.lane * laneW + 4, y - 6, laneW - 8, 12);
        ctx.globalAlpha = 1.0; if (!isFrozen) g.life -= 0.05;
    });

    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        if (!isFrozen) p.update();
        p.draw(ctx);
        if (p.life <= 0) particlesRef.current.splice(i, 1);
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

    // 10. UI Bar (Progress)
    const progress = Math.min(1, Math.max(0, gameTime) / (audioBuffer?.duration || 1));
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(0, 0, width, 4);
    ctx.fillStyle = theme.primaryColor; ctx.fillRect(0, 0, width * progress, 4);

    // 11. Combo (Center)
    if (scoreRef.current.combo > 0) {
        if (!isFrozen) comboScaleRef.current += (1.0 - comboScaleRef.current) * 0.15;
        ctx.save();
        const yPos = height * (width > height ? 0.2 : 0.3);
        ctx.translate(width / 2, yPos); ctx.scale(comboScaleRef.current, comboScaleRef.current);
        const fontSize = isMobileRef.current ? 48 : 80;
        ctx.font = `italic 900 ${fontSize}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(scoreRef.current.combo.toString(), 0, 0);
        ctx.font = `bold ${fontSize * 0.3}px sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText("COMBO", 0, fontSize * 0.4);
        ctx.restore();
    }
    
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full flex justify-center overflow-hidden bg-black touch-none select-none"
        style={{ touchAction: 'none' }} onTouchStart={handleGlobalTouch} onTouchMove={handleGlobalTouch} onTouchEnd={handleGlobalTouch} onTouchCancel={handleGlobalTouch}>
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div className="absolute top-4 right-6 text-right pointer-events-none hidden md:block">
          <div className="text-3xl font-black text-white tracking-tighter tabular-nums">{Math.floor(scoreRef.current.score).toLocaleString()}</div>
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Score</div>
      </div>
    </div>
  );
};

export default GameCanvas;
