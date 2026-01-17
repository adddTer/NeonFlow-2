
import { GoogleGenAI, Type } from "@google/genai";
import { AITheme, DEFAULT_THEME } from "../types";

const getEffectiveKey = (userKey?: string) => {
  if (userKey && userKey.trim().length > 0) {
    return userKey.trim();
  }
  return process.env.API_KEY || '';
};

export interface MetadataResult {
    title: string;
    artist: string;
    album?: string;
    bpm: number;
    theme: AITheme;
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
                // Robust JSON Parsing: Find first '{' and last '}'
                const text = response.text;
                const firstBrace = text.indexOf('{');
                const lastBrace = text.lastIndexOf('}');
                
                if (firstBrace !== -1 && lastBrace !== -1) {
                    const jsonStr = text.substring(firstBrace, lastBrace + 1);
                    try {
                        const data = JSON.parse(jsonStr);
                        return data; 
                    } catch (parseError) {
                        console.warn("JSON Parse Error:", parseError);
                    }
                }
                
                // Fallback: try cleaning code blocks
                let cleanStr = text.trim();
                if (cleanStr.startsWith('```')) {
                    cleanStr = cleanStr.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '');
                    try {
                        return JSON.parse(cleanStr);
                    } catch(e) {}
                }
                
                throw new Error("Failed to parse JSON response");
            } else {
                throw new Error("Empty response text");
            }
        } catch (e: any) {
            console.warn(`Metadata Analysis Attempt ${i+1} failed:`, e);
            lastError = e;
            if (i < maxRetries - 1) await sleep(1500 * (i + 1));
        }
    }
    throw lastError;
};

export const analyzeMetadataWithGemini = async (
  filename: string, 
  audioBase64: string, 
  mimeType: string,
  hintBPM: number, // Programmatic estimate
  userApiKey?: string
): Promise<MetadataResult> => {
  
  const apiKey = getEffectiveKey(userApiKey);
  
  // Default fallback
  const fallbackResult: MetadataResult = {
      title: filename.replace(/\.[^/.]+$/, "").replace(/_/g, " "),
      artist: "Unknown Artist",
      bpm: hintBPM,
      theme: DEFAULT_THEME
  };

  if (!apiKey) return fallbackResult;

  const ai = new GoogleGenAI({ apiKey });
  const modelName = 'gemini-3-flash-preview'; 

  const systemInstruction = `
    You are an Expert Music Metadata Archivist.
    Your task is to identify the official Song Metadata (Title, Artist, BPM) using 'googleSearch'.

    === 1. TITLE FORMATTING (THE GOLDEN RULE) ===
    
    **MANDATORY**: If a song has an official title in **BOTH** Native Language (Chinese/Japanese/Korean) **AND** English, you **MUST** return both.
    
    **FORMAT**: "NativeTitle EnglishTitle" (Separated by ONE SPACE).
    
    **[KEY EXAMPLE]**
    Context: User uploads "HOYO-MiX - 故事与甜饼 Stories and Sweets.mp3" or searches for this song.
    
    ❌ WRONG: "Stories and Sweets"            (Reason: Missing Native)
    ❌ WRONG: "故事与甜饼"                    (Reason: Missing English)
    ❌ WRONG: "故事与甜饼 (Stories and Sweets)" (Reason: Do NOT use brackets)
    ❌ WRONG: "Stories and Sweets 故事与甜饼"    (Reason: Native must be first)
    
    ✅ CORRECT: "故事与甜饼 Stories and Sweets"

    **NO AUTO-TRANSLATION**: Only include English if it is part of the OFFICIAL release title (on Spotify/Apple Music). If no official English title exists, return ONLY Native.

    === 2. CLEANING ===
    - Remove junk: (Official), [MV], (Cover), (Lyrics), (HQ).
    - Remove featuring artists from title.

    === 3. ARTIST ===
    - Use the standard international name (e.g. "HOYO-MiX", "YOASOBI").

    === 4. VISUAL THEME ===
    - NO dark colors (gray, black). Use saturated NEON colors.
  `;

  const promptPayload = {
      contents: {
          parts: [
              { inlineData: { mimeType: mimeType, data: audioBase64 } },
              { text: `Filename: "${filename}". DSP Estimated BPM: ${hintBPM}. Identify Metadata.` }
          ]
      },
      config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
              type: Type.OBJECT,
              properties: {
                  identifiedTitle: { type: Type.STRING },
                  identifiedArtist: { type: Type.STRING },
                  identifiedAlbum: { type: Type.STRING },
                  officialBpm: { type: Type.NUMBER },
                  theme: {
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
                  }
              },
              required: ['identifiedTitle', 'identifiedArtist', 'officialBpm', 'theme']
          }
      }
  };

  try {
      const data = await generateWithRetry(ai, modelName, promptPayload, 3);
      
      // Post-processing to enforce space rule in case AI hallucinates brackets despite prompt
      let cleanTitle = data.identifiedTitle || fallbackResult.title;
      // Regex: Remove brackets and ensure single spaces
      cleanTitle = cleanTitle.replace(/[\[\(\{]/g, ' ').replace(/[\]\)\}]/g, '').replace(/\s+/g, ' ').trim();

      return {
          title: cleanTitle,
          artist: data.identifiedArtist || fallbackResult.artist,
          album: data.identifiedAlbum,
          bpm: data.officialBpm || hintBPM,
          theme: {
              primaryColor: data.theme?.primaryColor || DEFAULT_THEME.primaryColor,
              secondaryColor: data.theme?.secondaryColor || DEFAULT_THEME.secondaryColor,
              catchColor: data.theme?.catchColor || DEFAULT_THEME.catchColor,
              perfectColor: data.theme?.perfectColor || DEFAULT_THEME.perfectColor,
              goodColor: data.theme?.goodColor || DEFAULT_THEME.goodColor,
              moodDescription: data.theme?.mood || "Analyzed"
          }
      };

  } catch (error) {
      console.error("Gemini Metadata Analysis Failed:", error);
      return fallbackResult;
  }
};
