
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
    maxRetries = 3,
    onRawOutput?: (text: string) => void
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
                if (onRawOutput) onRawOutput(response.text);

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
  userApiKey?: string,
  onRawOutput?: (text: string) => void
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
    你是一位专业的音乐元数据归档专家。
    你的任务是结合音频指纹和 'googleSearch' 工具识别官方歌曲元数据（标题、艺术家、BPM）。

    === 1. 标题格式规则（最高优先级）===
    
    **强制双语保留**：如果歌曲在官方发行平台（Spotify/Apple Music/Bilibili）上拥有**原生语言（中文/日文/韩文）**和**英文**的双语标题，你**必须**将两者都保留。
    
    **输出格式**："原生标题 英文标题"（中间用一个空格分隔，**严禁**使用括号）。
    
    **[标准示例]**
    输入文件："HOYO-MiX - 故事与甜饼 Stories and Sweets.mp3"
    
    ❌ 错误："Stories and Sweets"            (原因：丢失了原生标题)
    ❌ 错误："故事与甜饼"                    (原因：丢失了英文标题)
    ❌ 错误："故事与甜饼 (Stories and Sweets)" (原因：禁止使用括号)
    ❌ 错误："Stories and Sweets 故事与甜饼"    (原因：原生标题必须排在前面)
    
    ✅ 正确："故事与甜饼 Stories and Sweets"

    **禁止自造翻译**：只有官方存在英文标题时才包含它。如果官方只有原生标题，则**仅返回原生标题**，绝对不要自己翻译。

    === 2. 数据清理 ===
    - 移除无关标签：(Official), [MV], (Cover), (Lyrics), (HQ), (PV)。
    - 移除 Feat/客串信息：不要把 feat. xxx 放在标题里。

    === 3. 艺术家 ===
    - 使用最通用的国际标准名（例如 "HOYO-MiX", "YOASOBI", "Kenshi Yonezu"）。

    === 4. 视觉主题 ===
    - **禁止**使用暗色（灰色、黑色）。**必须**使用高饱和度的霓虹色系（如 #00f3ff, #ff00ff, #f9f871）。
  `;

  const promptPayload = {
      contents: {
          parts: [
              { inlineData: { mimeType: mimeType, data: audioBase64 } },
              { text: `
文件名: "${filename}"
DSP 估算 BPM: ${hintBPM}

### 💀 绝对强制指令 (必须执行):
1. **对抗英语偏见**: 这是一首亚洲歌曲 (Asian Song)。严禁英语中心主义，不要只返回英文翻译！
2. **搜索策略**: 你必须专门搜索: "${filename} 原生中文标题" 或 "${filename} 原生日文标题"。
3. **输出规则**: 
   - 如果文件名已经是中文，**必须保留它**。
   - 如果你找到了英文标题，将其追加在中文标题**之后**。
4. **最终格式**: "原生标题 英文标题"
` }
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
      const data = await generateWithRetry(ai, modelName, promptPayload, 3, onRawOutput);
      
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
