
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
    difficultyLevel?: number; // 1-20
    stylePreference?: string; // 'Balanced' | 'Stream' | 'Tech' | 'Flow'
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

  try {
    const diffLevel = options.difficultyLevel || 10;
    const style = options.stylePreference || 'Balanced';

    let systemInstruction = `You are an expert Rhythm Game Choreographer. Analyze the audio for structure, theme, and playability.
    
    CONTEXT:
    - User Request Difficulty: ${diffLevel}/20 (1=Beginner, 20=Grandmaster).
    - Style Preference: ${style}.
    - Do NOT blindly follow the difficulty number. Listen to the song. If the song is slow and calm, do NOT force high intensity even if difficulty is 20. If it's fast, allow intensity.
    - Your output determines the "skeleton" of the beatmap.
    `;

    let taskInstruction = "";
    
    if (options.structure) {
        taskInstruction += `
        Task 1: Structure & Choreography
        - Identify accurate BPM.
        - Segment song by musical phrases.
        - For each section, define "Motion Descriptors" suitable for a ${diffLevel}/20 difficulty chart:
          - flow: "linear" (scales), "zigzag" (jumps), "circular" (rolls), "random".
          - hand_bias: "alternating", "left_heavy", "right_heavy", "balanced".
          - focus: "vocal", "drum", "melody", "bass".
          - intensity: 0.0 to 1.0 (Relative density).
        `;
    }
    
    if (options.theme) {
        taskInstruction += `
        Task 2: Visual Theme
        - Analyze the mood.
        - Generate colors (Hex codes).
        `;
    }

    if (options.metadata) {
        taskInstruction += `
        Task 3: Metadata Extraction & Cleaning
        - Filename provided: "${filename}"
        - Use the 'googleSearch' tool to find the official track title and artist.
        - Rules for Title:
          1. Remove file extensions (like .mp3, .flac).
          2. Remove the Artist part if it appears in the filename (e.g. "Artist - Title" -> keep "Title").
          3. **Language Priority**: If the title is bilingual (e.g. official title has both Chinese and English), ALWAYS format it as "[Chinese Title] [English Title]". Chinese MUST come first. Separate with a single space. No parentheses.
             - Example: "A Dramatic Irony 戏剧性反讽" -> "戏剧性反讽 A Dramatic Irony".
          4. **Preserve Stylistic Syntax**: Do NOT remove special characters that are part of the actual song title (e.g. "NAME == ", "feat.", "vs.").
             - Example: "NAME == 隐德来希 NAME == Entelechy" must be preserved exactly, do not shorten to "隐德来希 Entelechy".
          5. If specific metadata cannot be found, clean the filename by replacing underscores with spaces.
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

// ... keep generatePatternWithGemini as is ...
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
