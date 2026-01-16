
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
