
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
                // Sanitize: Remove markdown code blocks if present
                let jsonStr = response.text.trim();
                if (jsonStr.startsWith('```')) {
                    jsonStr = jsonStr.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '');
                }
                
                try {
                    const data = JSON.parse(jsonStr);
                    return data;
                } catch (parseError) {
                    console.warn("JSON Parse Error on sanitized text:", jsonStr);
                    throw parseError;
                }
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
    You are an Expert Music Metadata Archivist and Visual Designer.
    Your task is to identify the Song Metadata (Title, Artist, BPM) and design a Visual Theme based on the audio and filename.
    
    You MUST use 'googleSearch' to verify the song details.

    ### 1. TITLE & ARTIST RULES (STRICT):
    - **Remove Artist from Title**: If the filename is "Artist - Title", return Title only in the title field.
    - **Language Priority (CRITICAL)**: 
      - **Priority Order**: [Chinese] > [Japanese/Korean] > [English] > [Other].
      - **ALWAYS PRESERVE/FIND THE NATIVE TITLE**. 
      - **Logic**:
        1. If the filename ALREADY contains Chinese/Japanese, **YOU MUST PUT IT FIRST**.
        2. If the filename is English ONLY (e.g. "Polumnia Omnia") but the artist is Asian (e.g. "HOYO-MiX"), you **MUST** search for the original Chinese/Japanese title (e.g. "啁晰流变之砂").
        3. **English** (or other official aliases) follows after a space.
      - **Separator**: Use a single space. No brackets around the alias.
      - **Format**: \`[Primary Language Title] [Secondary Language Title]\`
      
      **Examples:**
      - File: "HOYO-MiX - 戏剧性反讽 A Dramatic Irony" -> Title: "戏剧性反讽 A Dramatic Irony" (Preserve Order)
      - File: "HOYO-MiX - Polumnia Omnia" -> Search -> Title: "啁晰流变之砂 Polumnia Omnia" (Find Chinese)
      - File: "Genshin Impact - Lie of the Beholder" -> Title: "瞳孔里的伪象 Lie of the Beholder" (Find Chinese)
      - Incorrect: "A Dramatic Irony" (Missing Native)
      - Incorrect: "A Dramatic Irony 戏剧性反讽" (Wrong Order)
      
    - **Preserve Stylistic Prefixes**: Do NOT remove intentional style markers like "NAME ==".
      - Example: "HOYO-MiX - NAME == 隐德来希 NAME == Entelechy" -> Title: "NAME == 隐德来希 NAME == Entelechy".
    
    ### 2. BPM (Beats Per Minute):
    - Use 'googleSearch' to find the official BPM.
    - Programmatic Estimate Provided: ${hintBPM}. 
    - If Google Search finds a definitive BPM, use that. If not, use the estimate or refine it based on audio context.
    
    ### 3. VISUAL THEME (NO DARK COLORS):
    - Determine 'primaryColor' and 'secondaryColor' based on the song's cover art or mood.
    - **CONSTRAINT**: The game background is dark/black. 
    - **FORBIDDEN**: Do NOT use dark gray, black, or very dark colors (e.g. #333333, #1a1a1a, #222222) for primary/secondary.
    - **REQUIRED**: Use BRIGHT, SATURATED, or NEON colors (e.g. #00f3ff, #ff00ff, #f9f871, #00ffaa) that pop against black.
  `;

  const promptPayload = {
      contents: {
          parts: [
              { inlineData: { mimeType: mimeType, data: audioBase64 } },
              { text: `Filename: "${filename}". DSP Estimated BPM: ${hintBPM}. Identify Metadata, BPM and Theme.` }
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
      
      return {
          title: data.identifiedTitle || fallbackResult.title,
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
