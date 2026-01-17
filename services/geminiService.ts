
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
                const data = JSON.parse(response.text);
                return data; 
            } else {
                throw new Error("Empty response text");
            }
        } catch (e: any) {
            console.warn(`Gemini Structure Attempt ${i+1} failed:`, e);
            lastError = e;
            if (i < maxRetries - 1) await sleep(1500 * (i + 1)); // Backoff
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

    let systemInstruction = `You are a World-Class Rhythm Game Level Designer (Mapper).
    
    GLOBAL CONTEXT:
    - Target Difficulty: ${diffLevel} / 20.
    - Style Preference: ${style}.
    
    CRITICAL INSTRUCTION FOR PATTERN SELECTION:
    1. **SUSTAINED SOUNDS = HOLDS**:
       - If you hear long vocals, synth pads, or held strings, you **MUST** set 'style' to **'hold'**.
       - Do not use 'stream' for slow, sustained sections.
       
    2. **UNIQUE MELODIES = RANDOM/JUMP**:
       - For distinct, non-repetitive melodies (solos, complex riffs), use 'style': **'jump'** and 'flow': **'random'**.
       - This tells the engine to create chaotic, high-contrast patterns.
       
    3. **FAST RHYTHMS = STREAM**:
       - Only use 'stream'/'linear' for actual high-speed drum rolls or arpeggios.
    `;

    let taskInstruction = `
        Task: Structure & Choreography
        - **Micro-Segmentation**: 
          - Analyze the audio texture changes (Kick/Snare/Vocal flow).
          - Break song into sections (approx 4-16 bars).
        
        - Define "Motion Descriptors" for each section:
          - style: 
             - 'hold': **MANDATORY** for long notes/vocals.
             - 'jump': For expressive, bouncy, or random melodies.
             - 'stream': For continuous 1/4 or 1/8 beat flows.
             - 'simple': For quiet parts.
          - descriptors.flow: 
             - 'slide': Smooth visual movement (Low Diff = Catch Stairs; High Diff = Tech Sliders).
             - 'linear': Directional streams (Stairs).
             - 'random': **Chaotic** placement for unique melodies.
             - 'zigzag', 'circular'.
          - descriptors.focus: 'drum', 'melody', 'vocal', 'bass'.
          - descriptors.special_pattern: 'burst', 'fill', 'none'.
          - intensity: 0.0 (Silence) to 1.0 (Peak).
    `;
        
    const properties: any = {};
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

// ... generatePatternWithGemini remains unchanged ...
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
        
        GLOBAL CONTEXT:
        - Mode: ${params.laneCount}K (Lanes 0 to ${params.laneCount - 1})
        - BPM: ${params.bpm}
        - Current Position: ${params.startTime ? params.startTime.toFixed(1) + 's' : '0.0s'}
        
        SONG STRUCTURE AWARENESS:
        ${structureContext}
        
        INPUT DATA:
        - Audio Snippet: Starts at cursor (Beat 0). Align to transients.
        - Existing Notes: Provided in 'existingNotesInWindow'.
        - Target Range: ${params.beatCount} beats.
        
        DECISION LOGIC (CRITICAL):
        1. **DEFAULT MODE = REPLACE**: If the user's intent is to create or generate a pattern (e.g., "create stream", "make jumps", "follow the drums", "fill this section"), you **MUST** clear the target area first to ensure a clean slate.
           - Return structure: [ { "type": "CLEAR" }, { "type": "ADD", "notes": [...] } ]
           
        2. **ADD MODE**: Only if the user EXPLICITLY says "add to", "layer on top", "keep existing", "don't delete", or "fill empty space".
           - Return structure: [ { "type": "ADD", "notes": [...] } ]
           
        3. **DELETE MODE**: If the user says "clear", "remove", "delete", "empty".
           - Return structure: [ { "type": "CLEAR" } ]
        
        Do not allow new notes to clash with old ones unless "layering" is explicitly requested. When in doubt, CLEAR first.
        
        EXISTING NOTES IN TARGET AREA:
        ${context.existingNotesInWindow && context.existingNotesInWindow.length > 0 
            ? JSON.stringify(context.existingNotesInWindow) 
            : "No notes currently in this area."}

        OUTPUT FORMAT (JSON):
        {
            "instructions": [
                {
                    "type": "CLEAR",
                    "lanes": [0, 1] // Optional. If omitted/empty, clears ALL lanes in the time window.
                },
                {
                    "type": "ADD",
                    "notes": [ { "beatOffset": 0.0, "lane": 0, "duration": 0 } ]
                }
            ]
        }
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
                                lanes: { 
                                    type: Type.ARRAY, 
                                    items: { type: Type.INTEGER },
                                    description: "For CLEAR: Specific lanes to clear. Empty = All."
                                },
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
                                    },
                                    description: "For ADD: List of notes to add."
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
