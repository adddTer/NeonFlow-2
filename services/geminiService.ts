
import { GoogleGenAI, Type } from "@google/genai";
import { SongStructure } from "../types";

const getEffectiveKey = (userKey?: string) => {
  if (userKey && userKey.trim().length > 0) {
    return userKey.trim();
  }
  return process.env.API_KEY || '';
};

export interface GenerationOptions {
    difficultyLevel?: number; // 1-20
    stylePreference?: string; // 'Balanced' | 'Stream' | 'Tech' | 'Flow'
    modelOverride?: string; // Allow forcing a model (e.g. Pro)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const generateWithRetry = async (
    ai: GoogleGenAI, 
    model: string, 
    prompt: any, 
    maxRetries = 3
): Promise<any> => {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: prompt.contents,
                config: prompt.config
            });
            
            if (response.text) {
                // Sanitize JSON
                const text = response.text;
                const firstBrace = text.indexOf('{');
                const lastBrace = text.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                    return JSON.parse(text.substring(firstBrace, lastBrace + 1));
                }
                return JSON.parse(text); 
            } else {
                throw new Error("Empty response text");
            }
        } catch (e: any) {
            console.warn(`Gemini Structure Attempt ${i+1} failed:`, e);
            lastError = e;
            if (i < maxRetries - 1) await sleep(1500 * (i + 1));
        }
    }
    throw lastError;
};

/**
 * AI 决策层：仅分析歌曲结构 (Structure)
 * Metadata, BPM, Theme now handled in Phase 1.
 */
export const analyzeStructureWithGemini = async (
  audioBase64: string, 
  mimeType: string,
  userApiKey?: string,
  options: GenerationOptions = {}
): Promise<{ sections: SongStructure['sections'] }> => {
  
  const apiKey = getEffectiveKey(userApiKey);

  const defaultSections: SongStructure['sections'] = [{ 
      startTime: 0, 
      endTime: 600, 
      type: 'verse', 
      intensity: 0.8, 
      style: 'stream',
      descriptors: { flow: 'linear', hand_bias: 'balanced', focus: 'melody' }
  }];
  
  if (!apiKey) {
    console.warn("No API Key provided, using DSP fallback.");
    return { sections: defaultSections };
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = options.modelOverride || 'gemini-3-flash-preview';

  try {
    const diffLevel = options.difficultyLevel || 10;
    const style = options.stylePreference || 'Balanced';

    // Granular Difficulty Guidance (Scale 1-20)
    let difficultyGuidance = "";
    
    if (diffLevel <= 5) {
        difficultyGuidance = `
        - **DIFFICULTY ${diffLevel} (BEGINNER/EASY)**: 
          - **SIMPLIFY**: Drastically merge short sections. Ignore fast drum fills.
          - **FOCUS**: Main Melody (Vocals) and Downbeats only.
          - **FLOW**: STRICT 'linear' or simple 'slide'. NO 'random'.
          - **INTENSITY**: Cap at 0.5. Keep it sparse.
        `;
    } else if (diffLevel <= 10) {
        difficultyGuidance = `
        - **DIFFICULTY ${diffLevel} (NORMAL/ADVANCED)**: 
          - **STANDARD**: Follow the rhythm closely (1/4 and 1/8 notes).
          - **FOCUS**: Drums and Vocals balanced.
          - **FLOW**: 'zigzag' or 'circular' allowed for chorus.
          - **INTENSITY**: Range 0.4 to 0.8.
        `;
    } else if (diffLevel <= 15) {
        difficultyGuidance = `
        - **DIFFICULTY ${diffLevel} (HARD/EXPERT)**: 
          - **COMPLEXITY**: Capture 1/16th note streams.
          - **FOCUS**: Technical Drum rhythms and syncopation.
          - **FLOW**: Use 'random' for fast sections.
          - **STYLE**: 'stream' is dominant.
          - **INTENSITY**: Push to 0.9 for drops.
        `;
    } else {
        difficultyGuidance = `
        - **DIFFICULTY ${diffLevel} (MASTER/TITAN)**: 
          - **LIMIT BREAK**: Capture EVERY sonic detail (1/32 bursts, grace notes).
          - **CHAOS**: Aggressive segmentation (change patterns every 2 bars).
          - **FLOW**: 'random' and 'jump' heavily favored.
          - **INTENSITY**: Peak at 1.0 (Maximum Density).
        `;
    }

    let systemInstruction = `You are a World-Class Rhythm Game Level Designer.
    
    GLOBAL CONTEXT:
    - **Difficulty Scale**: 1 (Easiest) to 20 (Hardest).
    - **Current Target Level**: ${diffLevel}.
    - **Style**: ${style}.
    
    ${difficultyGuidance}
    
    CRITICAL PATTERN RULES:
    1. **SUSTAINED SOUNDS = HOLD NOTES (IMPORTANT)**:
       - Whenever you hear long vocals, synth pads, or held strings, you **MUST** set 'style' to **'hold'**.
       - The engine relies on this tag to generate long notes.
       
    2. **UNIQUE/COMPLEX MELODIES = RANDOM/JUMP**:
       - For distinct, non-repetitive melodies (solos, complex riffs), use 'style': **'jump'** and 'flow': **'random'**.
       
    3. **FAST DRUMS = STREAM**:
       - Use 'stream'/'linear' ONLY for consistent drum rolls or arpeggios.
    `;

    let taskInstruction = `
        Task: Structure & Choreography
        - **Micro-Segmentation**: 
          - Analyze the audio texture changes.
          - Break song into sections (approx 4-16 bars).
        
        - Define "Motion Descriptors" for each section:
          - style: 
             - 'hold': **MANDATORY** for long notes/vocals.
             - 'jump': For expressive, bouncy melodies.
             - 'stream': For continuous flows.
             - 'simple': For quiet parts.
          - descriptors.flow: 
             - 'random': **Chaotic** placement for unique melodies.
             - 'slide': Smooth visual movement.
             - 'linear': Directional streams.
             - 'zigzag', 'circular'.
          - descriptors.focus: 'drum', 'melody', 'vocal', 'bass'.
          - descriptors.special_pattern: 'burst', 'fill', 'none'.
          - intensity: 0.0 (Silence) to 1.0 (Peak).
    `;
        
    const properties: any = {};
    // Optional explanation field for debugging, not shown to user
    properties.difficulty_context = { type: Type.STRING };
    
    properties.sections = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
            startTime: { type: Type.NUMBER },
            endTime: { type: Type.NUMBER },
            type: { type: Type.STRING },
            intensity: { type: Type.NUMBER },
            style: { type: Type.STRING, enum: ['stream', 'jump', 'hold', 'simple'] },
            descriptors: {
                type: Type.OBJECT,
                properties: {
                    flow: { type: Type.STRING, enum: ['linear', 'zigzag', 'circular', 'random', 'slide'] },
                    hand_bias: { type: Type.STRING, enum: ['alternating', 'left_heavy', 'right_heavy', 'balanced'] },
                    focus: { type: Type.STRING, enum: ['vocal', 'drum', 'melody', 'bass'] },
                    special_pattern: { type: Type.STRING, enum: ['burst', 'fill', 'none'] }
                },
                required: ['flow', 'hand_bias', 'focus']
            }
        },
        required: ['startTime', 'endTime', 'type', 'intensity', 'style', 'descriptors']
      }
    };

    taskInstruction += `\nReturn strictly JSON.`;

    const promptPayload = {
        contents: {
            parts: [
                { inlineData: { mimeType: mimeType, data: audioBase64 } },
                { text: systemInstruction + taskInstruction }
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: properties,
                required: ['sections']
            }
        }
    };

    try {
        const data = await generateWithRetry(ai, modelName, promptPayload, 3);
        
        let sectionsResult = defaultSections;
        if (data.sections) {
            sectionsResult = data.sections.map((s: any) => ({
                ...s,
                descriptors: s.descriptors || { flow: 'random', hand_bias: 'balanced', focus: 'melody' }
            }));
        }
        
        return { sections: sectionsResult };

    } catch (e: any) {
        throw new Error("AI_RETRY_EXHAUSTED");
    }

  } catch (error: any) {
    console.error("Gemini Analysis Failed:", error);
    if (error.message === "AI_RETRY_EXHAUSTED") throw error;
    throw error;
  }
};

// ... generatePatternWithGemini logic remains similar but ensures robust return ...
export const generatePatternWithGemini = async (
    prompt: string,
    params: {
        bpm: number;
        laneCount: number;
        beatCount: number; 
        startTime?: number; 
    },
    context: {
        audioBase64?: string; 
        precedingNotes?: { lane: number, timeDiff: number }[]; 
        existingNotesInWindow?: { lane: number, beatOffset: number }[]; 
        structure?: SongStructure; 
    },
    userApiKey?: string
): Promise<{ 
    instructions: {
        type: 'CLEAR' | 'ADD';
        lanes?: number[]; 
        notes?: { beatOffset: number, lane: number, duration: number }[]; 
    }[]
}> => {
    const apiKey = getEffectiveKey(userApiKey);
    if (!apiKey) throw new Error("API Key Missing");

    const ai = new GoogleGenAI({ apiKey });

    // Build structure info string
    const structureContext = context.structure?.sections.map(s => 
        `- [${s.startTime.toFixed(1)}s - ${s.endTime.toFixed(1)}s] ${s.type.toUpperCase()} (Intensity: ${s.intensity})`
    ).join('\n') || "Structure unknown.";

    const systemInstruction = `
        You are an AI Assistant for a Rhythm Game Beatmap Editor.
        Your task is to interpret the user's natural language command and generate a SEQUENCE of edit instructions.
        ...
    `;
    
    const contents: any[] = [];
    if (context.audioBase64) {
        contents.push({
            inlineData: { mimeType: 'audio/wav', data: context.audioBase64 }
        });
    }
    contents.push({ text: `User Prompt: "${prompt}"` });

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: contents },
        config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    instructions: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                type: { type: Type.STRING, enum: ['CLEAR', 'ADD'] },
                                lanes: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                                notes: {
                                    type: Type.ARRAY,
                                    items: {
                                        type: Type.OBJECT,
                                        properties: {
                                            beatOffset: { type: Type.NUMBER },
                                            lane: { type: Type.INTEGER },
                                            duration: { type: Type.NUMBER }
                                        },
                                        required: ['beatOffset', 'lane', 'duration']
                                    }
                                }
                            },
                            required: ['type']
                        }
                    }
                },
                required: ['instructions']
            }
        }
    });

    if (response.text) {
        return JSON.parse(response.text);
    }
    return { instructions: [] };
};
