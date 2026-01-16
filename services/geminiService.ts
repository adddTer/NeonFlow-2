
import { GoogleGenAI, Type } from "@google/genai";
import { SongStructure, AITheme, DEFAULT_THEME, NoteLane } from "../types";

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
}

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

  // 默认结构（保底）
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
  
  // 默认主题
  let finalTheme = { ...DEFAULT_THEME };
  const finalMetadata = { title: undefined as string | undefined, artist: undefined as string | undefined, album: undefined as string | undefined };

  if ((!options.structure && !options.theme && !options.metadata) || !apiKey) {
    if (!apiKey) console.warn("No API Key provided, using DSP fallback.");
    return { structure: defaultStructure, theme: finalTheme, metadata: finalMetadata };
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    // Direction 1: Role Upgrade - Choreographer
    let systemInstruction = `You are an expert Rhythm Game Choreographer (Chart Designer). You analyze audio not just for structure, but for the *physical sensation* of playing it.`;
    let taskInstruction = "";
    
    if (options.structure) {
        taskInstruction += `
        Task 1: Choreography Analysis
        - Identify BPM.
        - Segment song.
        - **MANDATORY**: For each section, provide "Motion Descriptors":
          - flow: "linear" (scales/stairs), "zigzag" (trills/jumps), "circular" (rolls), "random".
          - hand_bias: "alternating" (L-R-L-R), "left_heavy", "right_heavy", "balanced".
          - focus: "vocal" (lyrical, sustained), "drum" (rhythmic, impact), "melody", "bass".
          - intensity: 0.0-1.0.
        `;
    }
    
    if (options.theme) {
        taskInstruction += `
        Task 2: Visual Theme
        - Analyze the "Vibe".
        - Generate palette: primaryColor, secondaryColor, catchColor.
        `;
    }

    if (options.metadata) {
        taskInstruction += `
        Task 3: Metadata
        - Filename: "${filename}"
        - Remove brackets, ft., official.
        - Prioritize original language title.
        `;
    }

    taskInstruction += `\nReturn strictly JSON.`;

    const properties: any = {};
    const requiredProps: string[] = [];

    if (options.structure) {
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
                // NEW: Motion Descriptors
                descriptors: {
                    type: Type.OBJECT,
                    properties: {
                        flow: { type: Type.STRING, enum: ['linear', 'zigzag', 'circular', 'random'] },
                        hand_bias: { type: Type.STRING, enum: ['alternating', 'left_heavy', 'right_heavy', 'balanced'] },
                        focus: { type: Type.STRING, enum: ['vocal', 'drum', 'melody', 'bass'] }
                    },
                    required: ['flow', 'hand_bias', 'focus']
                }
            },
            required: ['startTime', 'endTime', 'type', 'intensity', 'style', 'descriptors']
          }
        };
        requiredProps.push("bpm", "sections");
    }

    if (options.theme) {
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

    if (options.metadata) {
        properties.metadata = {
            type: Type.OBJECT,
            properties: {
                identifiedTitle: { type: Type.STRING },
                identifiedArtist: { type: Type.STRING },
                identifiedAlbum: { type: Type.STRING }
            }
        };
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
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
    });

    if (response.text) {
      const data = JSON.parse(response.text) as AIAnalysisResult;
      
      let structureResult = defaultStructure;
      if (options.structure && data.bpm && data.sections) {
          // Normalize descriptors if missing
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
    }
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    throw error;
  }
  
  return { structure: defaultStructure, theme: finalTheme, metadata: finalMetadata };
};

/**
 * Editor AI Copilot: Generate patterns based on user prompt with Audio Context
 */
export const generatePatternWithGemini = async (
    prompt: string,
    params: {
        bpm: number;
        laneCount: number;
        beatCount: number; // Length of pattern in beats
    },
    context: {
        audioBase64?: string; // Short snippet (~5-10s)
        precedingNotes?: { lane: number, timeDiff: number }[]; // Notes just before cursor
        existingNotesInWindow?: { lane: number, beatOffset: number }[]; // EXISTING NOTES IN TARGET AREA
    },
    userApiKey?: string
): Promise<{ 
    instructions: {
        type: 'CLEAR' | 'ADD';
        lanes?: number[]; // For CLEAR (empty = all)
        notes?: { beatOffset: number, lane: number, duration: number }[]; // For ADD
    }[]
}> => {
    const apiKey = getEffectiveKey(userApiKey);
    if (!apiKey) throw new Error("API Key Missing");

    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `
        You are an AI Assistant for a Rhythm Game Beatmap Editor.
        Your task is to interpret the user's natural language command and generate a SEQUENCE of edit instructions.
        
        CONTEXT:
        - Mode: ${params.laneCount}K (Lanes 0 to ${params.laneCount - 1})
        - BPM: ${params.bpm}
        - Target Range: ${params.beatCount} beats.
        
        INPUT DATA:
        - Audio Snippet: Starts at cursor (Beat 0). Align to transients.
        - Existing Notes: Provided in 'existingNotesInWindow'.
        
        INSTRUCTIONS LOGIC:
        - You can return multiple instructions to be executed in order.
        - **IMPORTANT**: If the user asks to "replace", "change", "overwrite", or "fix" something, you **MUST** issue a 'CLEAR' instruction first for the relevant lanes/area, followed by an 'ADD' instruction.
        - If the user asks to "add" or "layer" without removing, just use 'ADD'.
        - If the user asks to "delete" or "clear", just use 'CLEAR'.
        
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
