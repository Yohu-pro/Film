
import { GoogleGenAI, VideoGenerationReferenceType } from "@google/genai";
import { Resolution, AspectRatio, VideoMode, UserProfile } from "../types";

import { translate } from "../i18n";

export interface VeoRequest {
  mode: VideoMode;
  prompt: string;
  resolution: Resolution;
  aspectRatio: AspectRatio;
  images?: string[]; 
  previousVideo?: any; 
  negativePrompt?: string;
  onProgress?: (msg: string) => void;
  customApiKey?: string;
  profile?: UserProfile;
  lang?: 'EN' | 'VN';
  apiKeys?: string[];
  useProjectKey?: boolean;
}

const getRawBase64 = (base64String: string) => {
  if (!base64String) return "";
  const parts = base64String.split(',');
  return parts.length > 1 ? parts[1] : parts[0];
};

const fetchVideoAsBlobUrl = async (uri: string, apiKey: string): Promise<string> => {
  try {
    const response = await fetch(uri, {
      method: 'GET',
      headers: {
        'x-goog-api-key': apiKey,
      },
    });
    if (!response.ok) throw new Error("Network error.");
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (err) {
    console.error("Fetch blob failed:", err);
    // Fallback to query param for direct video tag usage if fetch fails
    const separator = uri.includes('?') ? '&' : '?';
    return `${uri}${separator}key=${apiKey}`; 
  }
};

export const generateVeoVideo = async ({
  mode,
  prompt,
  resolution,
  aspectRatio,
  images = [],
  previousVideo,
  onProgress,
  lang = 'EN',
  apiKeys = [],
  useProjectKey = true
}: VeoRequest): Promise<any> => {
  // Combine custom keys and default key
  const customKey = sessionStorage.getItem('veopro_custom_key');
  const defaultKey = process.env.API_KEY;
  
  let allKeys: string[] = [];
  
  if (useProjectKey) {
    if (defaultKey) allKeys.push(defaultKey);
    // Also include system pro keys if any
    const pro1 = process.env.GOOGLE_KEY_PRO1;
    const pro9 = process.env.GOOGLE_KEY_PRO9;
    if (pro1) allKeys.push(pro1);
    if (pro9) allKeys.push(pro9);
  } else {
    allKeys = [...apiKeys];
    if (customKey && !customKey.startsWith('GOOGLE_KEY_')) allKeys.unshift(customKey);
  }
  
  // Remove duplicates and empty keys, and filter out placeholders
  const uniqueKeys = Array.from(new Set(allKeys))
    .filter(k => k && k.trim() !== '' && !k.includes('GOOGLE_KEY_'));

  if (uniqueKeys.length === 0) throw new Error("API Key missing.");
  
  // Shuffle keys to distribute load across all available quotas
  for (let i = uniqueKeys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uniqueKeys[i], uniqueKeys[j]] = [uniqueKeys[j], uniqueKeys[i]];
  }
  
  let lastError: any = null;

  for (let i = 0; i < uniqueKeys.length; i++) {
    const apiKey = uniqueKeys[i];
    const ai = new GoogleGenAI({ apiKey });
    const model = (mode === VideoMode.CONSISTENCY || previousVideo) 
      ? 'veo-3.1-generate-preview' 
      : 'veo-3.1-fast-generate-preview';
    
    onProgress?.(`${translate('PROGRESS_INIT', lang)} (Key ${i + 1}/${uniqueKeys.length})`);

    let apiAspectRatio: "16:9" | "9:16" | "1:1" = "16:9";
    if (aspectRatio === AspectRatio.PORTRAIT || aspectRatio === AspectRatio.SUPER_TALL) {
      apiAspectRatio = "9:16";
    } else if (aspectRatio === AspectRatio.SQUARE) {
      apiAspectRatio = "1:1";
    }

    try {
      let operation;
      
      // If we have multiple keys, we skip internal retries on 429 to move to the next key faster.
      // Retries are only useful if we have a single key.
      const maxRetries = uniqueKeys.length > 1 ? 0 : 2;
      let retryCount = 0;

      const executeWithRetry = async (fn: () => Promise<any>): Promise<any> => {
        try {
          return await fn();
        } catch (error: any) {
          let errorMsg = error.message || "";
          try {
            const parsed = JSON.parse(errorMsg);
            if (parsed.error?.message) errorMsg = parsed.error.message;
          } catch { /* ignore */ }

          const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
          const isUnavailable = errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("high demand");
          
          if ((isQuota || isUnavailable) && retryCount < maxRetries) {
            retryCount++;
            const delay = Math.pow(2, retryCount) * 3000;
            onProgress?.(`${translate('PROGRESS_RENDERING', lang)} (${isUnavailable ? 'Service Busy' : 'Quota'} - Retry ${retryCount}/${maxRetries}...)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return await executeWithRetry(fn);
          }
          throw error;
        }
      };

      if (previousVideo) {
        onProgress?.(translate('PROGRESS_STITCH', lang));
        operation = await executeWithRetry(() => ai.models.generateVideos({
          model: 'veo-3.1-generate-preview',
          prompt,
          video: previousVideo,
          config: { numberOfVideos: 1, resolution, aspectRatio: apiAspectRatio }
        }));
      } else if (mode === VideoMode.CONSISTENCY && images.length > 0) {
        const referenceImages = images.map(img => ({
          image: { imageBytes: getRawBase64(img), mimeType: 'image/png' },
          referenceType: VideoGenerationReferenceType.ASSET
        }));
        operation = await executeWithRetry(() => ai.models.generateVideos({
          model: 'veo-3.1-generate-preview',
          prompt,
          config: { numberOfVideos: 1, referenceImages, resolution, aspectRatio: apiAspectRatio }
        }));
      } else if (mode === VideoMode.IMAGE_TO_VIDEO && images.length > 0) {
        operation = await executeWithRetry(() => ai.models.generateVideos({
          model, prompt,
          image: { imageBytes: getRawBase64(images[0]), mimeType: 'image/png' },
          config: { numberOfVideos: 1, resolution, aspectRatio: apiAspectRatio }
        }));
      } else if (mode === VideoMode.INTERPOLATION && images.length >= 2) {
        operation = await executeWithRetry(() => ai.models.generateVideos({
          model, prompt,
          image: { imageBytes: getRawBase64(images[0]), mimeType: 'image/png' },
          config: { 
            numberOfVideos: 1, resolution, aspectRatio: apiAspectRatio,
            lastFrame: { imageBytes: getRawBase64(images[1]), mimeType: 'image/png' }
          }
        }));
      } else {
        operation = await executeWithRetry(() => ai.models.generateVideos({
          model, prompt,
          config: { numberOfVideos: 1, resolution, aspectRatio: apiAspectRatio }
        }));
      }

      while (!operation.done) {
        await new Promise(r => setTimeout(r, 8000));
        operation = await ai.operations.getVideosOperation({ operation });
        onProgress?.(translate('PROGRESS_RENDERING', lang));
      }

      if (operation.error) {
        throw new Error(operation.error.message || "Video generation failed");
      }

      const videoRef = operation.response?.generatedVideos?.[0]?.video;
      if (!videoRef) {
        throw new Error("No video was generated in the response.");
      }
      const blobUrl = await fetchVideoAsBlobUrl(videoRef.uri, apiKey);
      
      return { finalUrl: blobUrl, videoRef: videoRef };
    } catch (error: any) {
      lastError = error;
      
      let errorMsg = error.message || "";
      try {
        // Try to parse if it's a JSON string from the API
        const parsed = JSON.parse(errorMsg);
        if (parsed.error?.message) errorMsg = parsed.error.message;
        if (parsed.error?.status) errorMsg += ` (${parsed.error.status})`;
      } catch {
        // Not JSON, use as is
      }

      const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
      const isAuth = errorMsg.includes("API key not valid") || 
                     errorMsg.includes("API key expired") ||
                     errorMsg.includes("401") || 
                     errorMsg.includes("403") || 
                     errorMsg.includes("PERMISSION_DENIED") ||
                     errorMsg.includes("INVALID_ARGUMENT") ||
                     (errorMsg.includes("400") && errorMsg.includes("API_KEY_INVALID"));
      
      if (isQuota || isAuth) {
        // Silence console noise for expected quota/auth failures when more keys are available
        if (i === uniqueKeys.length - 1) {
          console.error(`Final API Key (${i + 1}) failed:`, errorMsg);
        } else {
          console.warn(`Key ${i + 1} exhausted (${isQuota ? 'Quota' : 'Auth'}), trying next...`);
        }

        const failType = isQuota ? (lang === 'VN' ? 'Hết hạn mức' : 'Quota Exhausted') : (lang === 'VN' ? 'Lỗi xác thực' : 'Auth Error');
        onProgress?.(`${failType} (Key ${i + 1}/${uniqueKeys.length}). ${uniqueKeys.length > 1 ? 'Đang thử key tiếp theo...' : ''}`);
        
        // Increased delay before trying next key to avoid global rate limits
        await new Promise(r => setTimeout(r, 2500));
        continue; // Try next key
      }
      
      console.error(`API Error with key ${i + 1}:`, error);
      throw new Error(errorMsg, { cause: error }); // Other errors should probably stop the process
    }
  }
  
  const finalErrorMessage = lastError?.message || "All API keys failed.";
  const isQuota = finalErrorMessage.includes("429") || finalErrorMessage.includes("RESOURCE_EXHAUSTED") || finalErrorMessage.includes("quota");
  
  let userMessage = isQuota 
    ? `${translate('QUOTA_EXHAUSTED', lang)} (All ${uniqueKeys.length} keys exhausted)`
    : finalErrorMessage;

  if (isQuota) {
    userMessage += lang === 'VN' 
      ? "\n\nMẹo: Bạn có thể thêm nhiều API Key trong phần 'CÀI ĐẶT API KEY' ở mục 'BẢN QUYỀN' để hệ thống tự động luân chuyển khi hết hạn mức."
      : "\n\nTip: You can add multiple API Keys in the 'SETUP API KEY' section under 'LICENSE' to automatically cycle through them when quota is reached.";
  }
    
  throw new Error(userMessage, { cause: lastError });
};

export const generateGeminiText = async (
  prompt: string, 
  systemInstruction: string, 
  apiKeys: string[],
  lang: 'EN' | 'VN' = 'EN',
  useProjectKey: boolean = true
): Promise<string> => {
  const customKey = sessionStorage.getItem('veopro_custom_key');
  const defaultKey = process.env.API_KEY;
  
  let allKeys: string[] = [];
  
  if (useProjectKey) {
    if (defaultKey) allKeys.push(defaultKey);
    const pro1 = process.env.GOOGLE_KEY_PRO1;
    const pro9 = process.env.GOOGLE_KEY_PRO9;
    if (pro1) allKeys.push(pro1);
    if (pro9) allKeys.push(pro9);
  } else {
    allKeys = [...apiKeys];
    if (customKey && !customKey.startsWith('GOOGLE_KEY_')) allKeys.unshift(customKey);
  }
  
  const uniqueKeys = Array.from(new Set(allKeys)).filter(k => k && k.trim() !== '' && !k.includes('GOOGLE_KEY_'));
  
  if (uniqueKeys.length === 0) throw new Error("API Key missing.");

  // Shuffle keys to distribute load
  for (let i = uniqueKeys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uniqueKeys[i], uniqueKeys[j]] = [uniqueKeys[j], uniqueKeys[i]];
  }
  
  let lastError: any = null;
  for (let i = 0; i < uniqueKeys.length; i++) {
    const apiKey = uniqueKeys[i];
    const ai = new GoogleGenAI({ apiKey });
    
    // Try multiple models in case one is experiencing high demand (503)
    const models = ['gemini-3-flash-preview', 'gemini-3.1-pro-preview'];
    
    for (const modelName of models) {
      try {
        let retryCount = 0;
        const maxRetries = 3;
        
        const executeWithRetry = async (): Promise<string> => {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents: prompt,
              config: { systemInstruction }
            });
            return response.text || "";
          } catch (error: any) {
            let errorMsg = error.message || "";
            try {
              const parsed = JSON.parse(errorMsg);
              if (parsed.error?.message) errorMsg = parsed.error.message;
            } catch { /* ignore */ }

            const isUnavailable = errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("high demand");
            
            if (isUnavailable && retryCount < maxRetries) {
              retryCount++;
              const delay = Math.pow(2, retryCount) * 2000 + Math.random() * 1000;
              await new Promise(resolve => setTimeout(resolve, delay));
              return await executeWithRetry();
            }
            throw error;
          }
        };

        return await executeWithRetry();
      } catch (error: any) {
        lastError = error;
        let errorMsg = error.message || "";
        try {
          const parsed = JSON.parse(errorMsg);
          if (parsed.error?.message) errorMsg = parsed.error.message;
        } catch { /* ignore */ }

        const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
        const isAuth = errorMsg.includes("API key not valid") || errorMsg.includes("401") || errorMsg.includes("403") || errorMsg.includes("PERMISSION_DENIED");
        const isUnavailable = errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("high demand");
        
        // If it's a 503, try the next model for this key
        if (isUnavailable) {
          continue; 
        }
        
        // If it's quota or auth, try the next key
        if (isQuota || isAuth) {
          if (i === uniqueKeys.length - 1) {
            let userMsg = errorMsg;
            if (isQuota) {
              userMsg = (lang === 'VN' ? "Hết hạn mức API. Vui lòng thêm key hoặc nâng cấp gói." : "API Quota Exhausted. Please add more keys or upgrade.");
              userMsg += "\n(All " + uniqueKeys.length + " keys exhausted)";
              userMsg += lang === 'VN' 
                ? "\n\nMẹo: Bạn có thể thêm nhiều API Key trong phần 'CÀI ĐẶT API KEY' ở mục 'BẢN QUYỀN' để hệ thống tự động luân chuyển."
                : "\n\nTip: You can add multiple API Keys in the 'SETUP API KEY' section under 'LICENSE' to automatically cycle through them.";
            }
            lastError = new Error(userMsg);
          }
          break; // Exit model loop to try next key
        }
        throw error;
      }
    }
  }
  throw lastError;
};

export const generateGeminiImage = async (
  prompt: string, 
  systemInstruction: string, 
  apiKeys: string[], 
  aspectRatio: "16:9" | "9:16",
  refImage?: string,
  lang: 'EN' | 'VN' = 'EN',
  useProjectKey: boolean = true
): Promise<string> => {
  const customKey = sessionStorage.getItem('veopro_custom_key');
  const defaultKey = process.env.API_KEY;
  
  let allKeys: string[] = [];
  
  if (useProjectKey) {
    if (defaultKey) allKeys.push(defaultKey);
    const pro1 = process.env.GOOGLE_KEY_PRO1;
    const pro9 = process.env.GOOGLE_KEY_PRO9;
    if (pro1) allKeys.push(pro1);
    if (pro9) allKeys.push(pro9);
  } else {
    allKeys = [...apiKeys];
    if (customKey && !customKey.startsWith('GOOGLE_KEY_')) allKeys.unshift(customKey);
  }
  
  const uniqueKeys = Array.from(new Set(allKeys)).filter(k => k && k.trim() !== '' && !k.includes('GOOGLE_KEY_'));
  
  if (uniqueKeys.length === 0) throw new Error("API Key missing.");

  // Shuffle keys
  for (let i = uniqueKeys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uniqueKeys[i], uniqueKeys[j]] = [uniqueKeys[j], uniqueKeys[i]];
  }
  
  let lastError: any = null;
  for (let i = 0; i < uniqueKeys.length; i++) {
    const apiKey = uniqueKeys[i];
    const ai = new GoogleGenAI({ apiKey });
    
    // Fallback models for image generation
    const models = ['gemini-2.5-flash-image', 'gemini-3.1-flash-image-preview'];
    
    for (const modelName of models) {
      try {
        let retryCount = 0;
        const maxRetries = 3;

        const executeWithRetry = async (): Promise<string> => {
          try {
            const contentsParts: any[] = [];
            if (refImage) {
              const rawB64 = refImage.includes(',') ? refImage.split(',')[1] : refImage;
              contentsParts.push({ inlineData: { data: rawB64, mimeType: 'image/png' } });
            }
            
            // Ensure no Vietnamese text appears on the image
            const finalPrompt = `${prompt}\n\nIMPORTANT: Do not include any Vietnamese text in the image. If there is text on signs, labels, or backgrounds, it MUST be in English.`;
            contentsParts.push({ text: finalPrompt });

            const response = await ai.models.generateContent({
              model: modelName,
              contents: { parts: contentsParts },
              config: { 
                systemInstruction,
                imageConfig: { aspectRatio } 
              }
            });
            
            if (!response.candidates || response.candidates.length === 0) {
              console.error(`Gemini Image Gen (${modelName}): No candidates returned.`, response);
              throw new Error("No candidates returned from API.");
            }

            const candidate = response.candidates[0];
            if (candidate.finishReason === 'SAFETY') {
              console.error(`Gemini Image Gen (${modelName}): Safety filter blocked the request.`, candidate);
              throw new Error("Safety filter blocked the request.");
            }

            for (const part of candidate.content?.parts || []) {
              if (part.inlineData) {
                return `data:image/png;base64,${part.inlineData.data}`;
              }
              if (part.text) {
                console.warn(`Gemini Image Gen (${modelName}): Model returned text instead of image:`, part.text);
              }
            }
            
            console.error(`Gemini Image Gen (${modelName}): No image part found in response.`, candidate);
            throw new Error("No image generated.");
          } catch (error: any) {
            let errorMsg = error.message || "";
            try {
              const parsed = JSON.parse(errorMsg);
              if (parsed.error?.message) errorMsg = parsed.error.message;
            } catch { /* ignore */ }

            const isUnavailable = errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("high demand");
            
            if (isUnavailable && retryCount < maxRetries) {
              retryCount++;
              const delay = Math.pow(2, retryCount) * 2000 + Math.random() * 1000;
              await new Promise(resolve => setTimeout(resolve, delay));
              return await executeWithRetry();
            }
            throw error;
          }
        };

        return await executeWithRetry();
      } catch (error: any) {
        lastError = error;
        let errorMsg = error.message || "";
        try {
          const parsed = JSON.parse(errorMsg);
          if (parsed.error?.message) errorMsg = parsed.error.message;
        } catch { /* ignore */ }

        const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
        const isAuth = errorMsg.includes("API key not valid") || errorMsg.includes("401") || errorMsg.includes("403") || errorMsg.includes("PERMISSION_DENIED");
        const isUnavailable = errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("high demand");
        
        if (isUnavailable) continue;
        if (isQuota || isAuth) {
          if (i === uniqueKeys.length - 1) {
            let userMsg = errorMsg;
            if (isQuota) {
              userMsg = (lang === 'VN' ? "Hết hạn mức API. Vui lòng thêm key hoặc nâng cấp gói." : "API Quota Exhausted. Please add more keys or upgrade.");
              userMsg += "\n(All " + uniqueKeys.length + " keys exhausted)";
              userMsg += lang === 'VN' 
                ? "\n\nMẹo: Bạn có thể thêm nhiều API Key trong phần 'CÀI ĐẶT API KEY' ở mục 'BẢN QUYỀN' để hệ thống tự động luân chuyển."
                : "\n\nTip: You can add multiple API Keys in the 'SETUP API KEY' section under 'LICENSE' to automatically cycle through them.";
            }
            lastError = new Error(userMsg);
          }
          break;
        }
        throw error;
      }
    }
  }
  throw lastError;
};

export const generateGeminiVoice = async (
  text: string,
  voiceLang: string,
  voiceGender: 'MALE' | 'FEMALE',
  voiceStyle: string,
  apiKeys: string[],
  outputLanguage: 'EN' | 'VN',
  useProjectKey: boolean = true
): Promise<string> => {
  const customKey = sessionStorage.getItem('veopro_custom_key');
  const defaultKey = process.env.API_KEY;
  
  let allKeys: string[] = [];
  
  if (useProjectKey) {
    if (defaultKey) allKeys.push(defaultKey);
    const pro1 = process.env.GOOGLE_KEY_PRO1;
    const pro9 = process.env.GOOGLE_KEY_PRO9;
    if (pro1) allKeys.push(pro1);
    if (pro9) allKeys.push(pro9);
  } else {
    allKeys = [...apiKeys];
    if (customKey && !customKey.startsWith('GOOGLE_KEY_')) allKeys.unshift(customKey);
  }
  
  const uniqueKeys = Array.from(new Set(allKeys)).filter(k => k && k.trim() !== '' && !k.includes('GOOGLE_KEY_'));
  
  if (uniqueKeys.length === 0) throw new Error("API Key missing.");

  // Shuffle keys
  for (let i = uniqueKeys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uniqueKeys[i], uniqueKeys[j]] = [uniqueKeys[j], uniqueKeys[i]];
  }

  const langName = voiceLang === 'vi-VN' ? 'Vietnamese' : 
                   voiceLang === 'en-US' ? 'English' :
                   voiceLang === 'fr-FR' ? 'French' :
                   voiceLang === 'ru-RU' ? 'Russian' :
                   voiceLang === 'de-DE' ? 'German' :
                   voiceLang === 'zh-CN' ? 'Chinese' :
                   voiceLang === 'id-ID' ? 'Indonesian' :
                   voiceLang === 'hi-IN' ? 'Hindi' :
                   voiceLang === 'th-TH' ? 'Thai' : 'English';

  const styleText = translate(voiceStyle as any, outputLanguage);
  const promptText = `Please read the following text in ${langName} with a ${styleText} style. Text: ${text}`;
  
  let lastError: any = null;
  for (let i = 0; i < uniqueKeys.length; i++) {
    const apiKey = uniqueKeys[i];
    const ai = new GoogleGenAI({ apiKey });
    try {
      let retryCount = 0;
      const maxRetries = 3;

      const executeWithRetry = async (): Promise<string> => {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: { parts: [{ text: promptText }] },
            config: {
              responseModalities: ["AUDIO" as any],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voiceGender === 'MALE' ? 'Fenrir' : 'Kore' },
                },
              },
            },
          });

          const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (base64Audio) return base64Audio;
          throw new Error("No audio data returned");
        } catch (error: any) {
          let errorMsg = error.message || "";
          try {
            const parsed = JSON.parse(errorMsg);
            if (parsed.error?.message) errorMsg = parsed.error.message;
          } catch { /* ignore */ }

          const isUnavailable = errorMsg.includes("503") || errorMsg.includes("UNAVAILABLE") || errorMsg.includes("high demand");
          
          if (isUnavailable && retryCount < maxRetries) {
            retryCount++;
            const delay = Math.pow(2, retryCount) * 2000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            return await executeWithRetry();
          }
          throw error;
        }
      };

      return await executeWithRetry();
    } catch (error: any) {
      lastError = error;
      let errorMsg = error.message || "";
      try {
        const parsed = JSON.parse(errorMsg);
        if (parsed.error?.message) errorMsg = parsed.error.message;
      } catch { /* ignore */ }

      const isQuota = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
      const isAuth = errorMsg.includes("API key not valid") || errorMsg.includes("401") || errorMsg.includes("403") || errorMsg.includes("PERMISSION_DENIED");
      
      if (isQuota || isAuth) {
        if (i < uniqueKeys.length - 1) continue;
        
        let userMsg = errorMsg;
        if (isQuota) {
          userMsg = (outputLanguage === 'VN' ? "Hết hạn mức API. Vui lòng thêm key hoặc nâng cấp gói." : "API Quota Exhausted. Please add more keys or upgrade.");
          userMsg += "\n(All " + uniqueKeys.length + " keys exhausted)";
          userMsg += outputLanguage === 'VN' 
            ? "\n\nMẹo: Bạn có thể thêm nhiều API Key trong phần 'CÀI ĐẶT API KEY' ở mục 'BẢN QUYỀN' để hệ thống tự động luân chuyển."
            : "\n\nTip: You can add multiple API Keys in the 'SETUP API KEY' section under 'LICENSE' to automatically cycle through them.";
        }
        throw new Error(userMsg, { cause: error });
      }
      throw error;
    }
  }
  throw lastError;
};
