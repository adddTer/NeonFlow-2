
import { GoogleGenAI, Type } from "@google/genai";
import { SongStructure, AITheme, DEFAULT_THEME } from "../types";

const getEffectiveKey = (userKey?: string) => {
  if (userKey && userKey.trim().length > 0) {
    return userKey.trim();
  }
  return process.env.API_KEY || '';
};

interface AIAnalysisResult {
    bpm?: number;
    sections?: any[];
    theme?: {
        primaryColor: string;
        secondaryColor: string;
        catchColor?: string;
        perfectColor: string;
        goodColor: string;
        mood: string;
    };
    metadata?: {
        identifiedTitle?: string;
        identifiedArtist?: string;
        identifiedAlbum?: string;
    }
}

export interface GenerationOptions {
    structure: boolean;
    theme: boolean;
    metadata: boolean;
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
                // Validate JSON parsing
                const data = JSON.parse(response.text);
                return data; 
            } else {
                throw new Error("Empty response text");
            }
        } catch (e: any) {
            console.warn(`Gemini Attempt ${i+1} failed:`, e);
            lastError = e;
            if (i < maxRetries - 1) await sleep(1500 * (i + 1)); // Backoff
        }
    }
    throw lastError;
};

/**
 * AI 决策层：分析歌曲结构 + 视觉主题 + 元数据识别
 */
export const analyzeStructureWithGemini = async (
  filename: string, 
  audioBase64: string, 
  mimeType: string,
  userApiKey?: string,
  options: GenerationOptions = { structure: true, theme: true, metadata: true }
): Promise<{ structure: SongStructure, theme: AITheme, metadata?: { title?: string, artist?: string, album?: string } }> => {
  
  const apiKey = getEffectiveKey(userApiKey);

  const defaultStructure: SongStructure = {
      bpm: 120,
      sections: [{ 
          startTime: 0, 
          endTime: 600, 
          type: 'verse', 
          intensity: 0.8, 
          style: 'stream',
          descriptors: { flow: 'linear', hand_bias: 'balanced', focus: 'melody' }
      }]
  };
  
  let finalTheme = { ...DEFAULT_THEME };
  const finalMetadata = { title: undefined as string | undefined, artist: undefined as string | undefined, album: undefined as string | undefined };

  if ((!options.structure && !options.theme && !options.metadata) || !apiKey) {
    if (!apiKey) console.warn("No API Key provided, using DSP fallback.");
    return { structure: defaultStructure, theme: finalTheme, metadata: finalMetadata };
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
    1. **Low Difficulty (1-7)**:
       - When you hear pitch scaling (stairs) or continuous flows, use **'slide'**.
       - 'slide' triggers Catch/Slider notes, which are fun and easy.
       - AVOID 'linear' (streams) at low difficulty.
       
    2. **High Difficulty (12-20)**:
       - When you hear pitch scaling or fast rhythms, use **'linear'**.
       - 'linear' triggers dense Note Streams (Stairs), requiring high stamina.
       - Use 'slide' ONLY for very specific synthesizer wubs or glissandos.
    
    3. **Mid Difficulty (8-11)**:
       - Mix 'linear' and 'slide' based on the instrument. 
       - Vocals -> 'slide'. Drums -> 'linear'/'zigzag'.
    `;

    let taskInstruction = "";
    const properties: any = {};
    const requiredProps: string[] = [];

    // --- Task 1: Structure (If requested) ---
    if (options.structure) {
        taskInstruction += `
        Task 1: Structure & Choreography
        - Identify accurate BPM.
        - **Micro-Segmentation**: 
          - The music changes frequently. Do NOT create sections longer than 8-10 seconds unless the song is monotonous.
          - Detect changes in: Drum Pattern (Kick/Snare), Instrument Density, Vocal Flow.
          - Create a new section immediately when the texture changes.
        
        - Define "Motion Descriptors" for each section:
          - style: 'stream' (continuous), 'jump' (spiky), 'hold' (long notes), 'simple' (breaks).
          - descriptors.flow: 
             - 'slide': Smooth visual movement (Low Diff = Catch Stairs; High Diff = Tech Sliders).
             - 'linear': Directional streams (Low Diff = Avoid; High Diff = Stamina Stairs).
             - 'circular': Rolling patterns.
             - 'zigzag': Sharp, angular jumps.
             - 'random': Chaotic/High Energy.
          - descriptors.focus: 
             - 'drum': Lock onto Kick/Snare.
             - 'melody': Follow lead synth/guitar.
             - 'vocal': Follow voice.
             - 'bass': Follow bassline.
          - descriptors.special_pattern: 
             - 'burst': Extremely fast 1/4 or 1/8 bursts (Drum fills).
             - 'fill': Syncopated rhythm pattern.
             - 'none': Standard.
          - intensity: 0.0 (Silence) to 1.0 (Peak Climax).
        `;
        
        properties.bpm = { type: Type.NUMBER };
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
        requiredProps.push("bpm", "sections");
    }
    
    // --- Task 2: Theme (If requested) ---
    if (options.theme) {
        taskInstruction += `
        Task 2: Visual Theme
        - Select colors that match the song's emotion (e.g., Red/Black for Aggressive, Pink/Cyan for Pop, Blue/Purple for Electronic).
        `;
        properties.theme = {
            type: Type.OBJECT,
            properties: {
                primaryColor: { type: Type.STRING },
                secondaryColor: { type: Type.STRING },
                catchColor: { type: Type.STRING },
                perfectColor: { type: Type.STRING },
                goodColor: { type: Type.STRING },
                mood: { type: Type.STRING }
            },
            required: ['primaryColor', 'secondaryColor', 'catchColor', 'perfectColor', 'goodColor', 'mood']
        };
        requiredProps.push("theme");
    }

    // --- Task 3: Metadata (If requested) ---
    if (options.metadata) {
        taskInstruction += `
        Task 3: Metadata
        - Filename: "${filename}"
        - Use 'googleSearch' to find official Title/Artist.
        `;
        properties.metadata = {
            type: Type.OBJECT,
            properties: {
                identifiedTitle: { type: Type.STRING },
                identifiedArtist: { type: Type.STRING },
                identifiedAlbum: { type: Type.STRING }
            }
        };
    }

    taskInstruction += `\nReturn strictly JSON.`;

    const promptPayload = {
        contents: {
            parts: [
                { inlineData: { mimeType: mimeType, data: audioBase64 } },
                { text: systemInstruction + taskInstruction }
            ]
        },
        config: {
            tools: options.metadata ? [{ googleSearch: {} }] : [],
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: properties,
                required: requiredProps.length > 0 ? requiredProps : undefined
            }
        }
    };

    try {
        const data = await generateWithRetry(ai, modelName, promptPayload, 3);
        
        let structureResult = defaultStructure;
        if (options.structure && data.bpm && data.sections) {
            const normalizedSections = data.sections.map((s: any) => ({
                ...s,
                descriptors: s.descriptors || { flow: 'random', hand_bias: 'balanced', focus: 'melody' }
            }));
            structureResult = { bpm: data.bpm, sections: normalizedSections };
        }
        
        if (options.theme && data.theme) {
            finalTheme = {
                primaryColor: data.theme.primaryColor,
                secondaryColor: data.theme.secondaryColor,
                catchColor: data.theme.catchColor || DEFAULT_THEME.catchColor,
                perfectColor: data.theme.perfectColor || data.theme.primaryColor,
                goodColor: data.theme.goodColor || '#ffffff',
                moodDescription: data.theme.mood
            };
        }

        if (options.metadata && data.metadata) {
            finalMetadata.title = data.metadata.identifiedTitle;
            finalMetadata.artist = data.metadata.identifiedArtist;
            finalMetadata.album = data.metadata.identifiedAlbum;
        }

        return { structure: structureResult, theme: finalTheme, metadata: finalMetadata };

    } catch (e: any) {
        throw new Error("AI_RETRY_EXHAUSTED");
    }

  } catch (error: any) {
    console.error("Gemini Analysis Failed:", error);
    if (error.message === "AI_RETRY_EXHAUSTED") throw error; // Re-throw specific error
    throw error;
  }
};

// ... generatePatternWithGemini ...
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
