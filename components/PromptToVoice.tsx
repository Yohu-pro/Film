
import React, { useState } from 'react';
import { Plus, Trash2, Play, Download, Copy, RotateCcw, CheckSquare, Square, Settings2, Loader2, Volume2, Pencil, Save, X } from 'lucide-react';
import { translate } from '../i18n';
import { UserProfile } from '../types';
import { supabase } from '../supabaseClient';
import { generateGeminiText, generateGeminiVoice } from '../services/gemini';

interface PromptToVoiceProps {
  outputLanguage: 'EN' | 'VN';
  profile: UserProfile;
  useProjectKey: boolean;
  deductCredit: (amount: number) => Promise<boolean>;
}

interface PromptBlock {
  id: string;
  text: string;
}

interface TextBlock {
  id: string;
  text: string;
  selected: boolean;
}

export const PromptToVoice: React.FC<PromptToVoiceProps> = ({ outputLanguage, profile, useProjectKey, deductCredit }) => {
  const [prompts, setPrompts] = useState<PromptBlock[]>([{ id: '1', text: '' }]);
  const [generatedTextBlocks, setGeneratedTextBlocks] = useState<TextBlock[]>([]);
  const [selectedTopic, setSelectedTopic] = useState('TOPIC_FILM_REVIEW');
  const [isGeneratingText, setIsGeneratingText] = useState(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [manualText, setManualText] = useState('');

  const saveEditBlock = (id: string) => {
    setGeneratedTextBlocks(generatedTextBlocks.map(b => b.id === id ? { ...b, text: editingText } : b));
    setEditingBlockId(null);
  };

  const cancelEditBlock = () => {
    setEditingBlockId(null);
    setEditingText('');
  };

  const startEditingBlock = (block: TextBlock) => {
    setEditingBlockId(block.id);
    setEditingText(block.text);
  };

  const addManualBlock = () => {
    if (!manualText.trim()) return;
    const newBlock: TextBlock = {
      id: `manual-${Date.now()}`,
      text: manualText,
      selected: true
    };
    setGeneratedTextBlocks([...generatedTextBlocks, newBlock]);
    setManualText('');
  };
  
  // Auto-play audio when URL is set
  React.useEffect(() => {
    if (audioUrl && audioRef.current) {
      const playAudio = async () => {
        try {
          // Small delay to ensure browser is ready after blob URL creation
          await new Promise(resolve => setTimeout(resolve, 100));
          if (audioRef.current) {
            audioRef.current.load();
            await audioRef.current.play();
          }
        } catch (err) {
          console.error("Auto-play failed:", err);
        }
      };
      playAudio();
    }
  }, [audioUrl]);
  
  // Voice Settings
  const [voiceLang, setVoiceLang] = useState(outputLanguage === 'VN' ? 'vi-VN' : 'en-US');
  
  // Sync voice language with app language
  React.useEffect(() => {
    setVoiceLang(outputLanguage === 'VN' ? 'vi-VN' : 'en-US');
  }, [outputLanguage]);

  const [voiceGender, setVoiceGender] = useState<'MALE' | 'FEMALE'>('FEMALE');
  const [voiceStyle, setVoiceStyle] = useState('STYLE_NATURAL');
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const [showErrorHint, setShowErrorHint] = useState(false);

  const addPrompt = () => {
    setPrompts([...prompts, { id: Date.now().toString(), text: '' }]);
  };

  const removePrompt = (id: string) => {
    if (prompts.length > 1) {
      setPrompts(prompts.filter(p => p.id !== id));
    }
  };

  const updatePrompt = (id: string, text: string) => {
    setPrompts(prompts.map(p => p.id === id ? { ...p, text } : p));
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleSelectAll = () => {
    const allSelected = generatedTextBlocks.every(b => b.selected);
    setGeneratedTextBlocks(generatedTextBlocks.map(b => ({ ...b, selected: !allSelected })));
  };

  const toggleSelectBlock = (id: string) => {
    setGeneratedTextBlocks(generatedTextBlocks.map(b => b.id === id ? { ...b, selected: !b.selected } : b));
  };

  const removeGeneratedBlock = (id: string) => {
    setGeneratedTextBlocks(generatedTextBlocks.filter(b => b.id !== id));
  };

  const generateText = async () => {
    if (prompts.every(p => !p.text.trim())) return;
    
    setIsGeneratingText(true);
    setStatusMessage(translate('STATUS_GENERATING_TEXT', outputLanguage));
    setGeneratedTextBlocks([]);
    
    try {
      const newBlocks: TextBlock[] = [];
      
      // Process each prompt block individually to maintain 1:1 mapping
      for (let i = 0; i < prompts.length; i++) {
        const prompt = prompts[i];
        if (!prompt.text.trim()) continue;

        const success = await deductCredit(1);
        if (!success) break;

        const systemInstruction = outputLanguage === 'VN' ? 
          `Bạn là một công cụ chuyên nghiệp phân tích kịch bản và mở rộng cốt truyện điện ảnh.
          Nhiệm vụ: Chuyển đổi các gợi ý (prompts) thành một phiên bản chuyên nghiệp, điện ảnh và giàu cảm xúc hơn, đồng thời vẫn giữ nguyên cốt truyện, lời thoại, trình tự thời gian và sự liền mạch của nhân vật.
          
          QUY TẮC QUAN TRỌNG:
          1. Mỗi dòng gợi ý đại diện cho chính xác 8 giây thời lượng.
          2. Duy trì MỘT ĐOẠN VĂN cho mỗi phần gốc, không gộp hoặc tách các phần.
          3. Cải thiện nhịp điệu câu để giọng đọc tự nhiên hơn, đảm bảo nhịp độ mượt mà, độ dài câu đa dạng và sự leo thang cảm xúc được kiểm soát.
          4. Loại bỏ các mô tả hiệu ứng âm thanh thừa hoặc lặp đi lặp lại.
          5. TRÁNH các thuật ngữ kỹ thuật làm phim như góc máy quay hoặc tham chiếu khung hình.
          6. Thay thế các mô tả hình ảnh quá sát nghĩa bằng ngôn ngữ điện ảnh giàu cảm xúc.
          7. Tăng cường chiều sâu tâm lý, sự rõ ràng về chủ đề và tính mạch lạc của câu chuyện theo chủ đề đã chọn.
          8. Giữ giọng điệu trang nhã và tiết chế thay vì kịch tính thái quá.
          9. Giữ nguyên tất cả lời thoại chính xác như đã viết trong ngoặc kép " ", chỉ điều chỉnh ngữ pháp nhỏ nếu cần thiết.
          10. Đảm bảo mỗi đoạn văn có độ dài CỐ ĐỊNH từ 22 đến 23 từ (KHÔNG ĐƯỢC ÍT HƠN HOẶC NHIỀU HƠN). Đây là quy tắc quan trọng nhất để khớp với thời lượng 8 giây.
          11. KHÔNG đánh số cảnh (Cảnh 1, Cảnh 2...).
          12. KHÔNG dùng từ "lời nhắc" hay "prompt".
          13. Thêm hướng dẫn nhạc nền trong ngoặc đơn (ví dụ: (sự căng thẳng tăng dần của dàn nhạc)). Hướng dẫn này sẽ được dùng để định hướng cảm xúc nhưng không được hiển thị khi tạo giọng đọc.
          14. Kết quả cuối cùng phải mang lại cảm giác như một bài đánh giá phim cao cấp hoặc lời dẫn chuyện điện ảnh chất lượng cao.
          15. TUYỆT ĐỐI KHÔNG TRỘN LẪN NGÔN NGỮ. Nếu yêu cầu là Tiếng Việt, toàn bộ văn bản phải là Tiếng Việt. Nếu là Tiếng Anh, toàn bộ phải là Tiếng Anh.
          16. Văn phong phải trôi chảy, tránh lặp từ, sử dụng các tính từ mạnh mẽ để gợi hình ảnh.
          17. KHÔNG ĐƯỢC TỰ Ý THÊM CÁC PHẦN GIỚI THIỆU NHƯ "Dưới đây là kịch bản...". CHỈ TRẢ VỀ NỘI DUNG KỊCH BẢN.` :
          
          `You are a professional script analyzer and cinematic plot expander.
          Task: Convert prompts into a professional, cinematic, and emotional version while maintaining the original plot, dialogue, sequence, and character continuity.
          
          IMPORTANT RULES:
          1. Each prompt line represents exactly 8 seconds of duration.
          2. Maintain ONE PARAGRAPH per original part, without merging or splitting sections.
          3. Improve sentence rhythm for a more natural reading voice, ensuring smooth pacing, varied sentence lengths, and controlled emotional escalation.
          4. Remove redundant or repetitive sound effect descriptions.
          5. AVOID technical filmmaking terms like camera angles or frame references.
          6. Replace overly literal visual descriptions with evocative, emotional cinematic language.
          7. Enhance psychological depth, thematic clarity, and story coherence based on the chosen theme.
          8. Maintain an elegant and restrained tone rather than over-dramatization.
          9. Preserve all dialogue exactly as written in quotes " ", with only minor grammatical adjustments if necessary for natural speech.
          10. Ensure each paragraph has a FIXED LENGTH of 22 to 23 words (NO MORE, NO LESS). This is the most critical rule for 8-second timing.
          11. NO scene numbering (Scene 1, Scene 2...).
          12. NO mention of the word "prompt" or "suggestion".
          13. Add cinematic music instructions in parentheses (e.g., (increasing orchestral tension)). These are for emotional guidance and won't be read aloud.
          14. The final result must feel like a high-end film review or high-quality cinematic narration.
          15. ABSOLUTELY NO LANGUAGE MIXING. If the request is Vietnamese, the entire text must be in Vietnamese. If English, the entire text must be in English.
          16. Use fluid prose, avoid word repetition, and use powerful adjectives to evoke imagery.
          17. DO NOT ADD INTRODUCTORY TEXT like "Here is your script...". RETURN ONLY THE SCRIPT CONTENT.`;

        const text = await generateGeminiText(prompt.text, systemInstruction, profile.api_keys || [], outputLanguage, useProjectKey);
        newBlocks.push({
          id: `gen-${i}-${Date.now()}`,
          text: text,
          selected: true
        });
        
        // Update progress if multiple blocks
        setProgress((i + 1) / prompts.length * 100);
      }
      
      setGeneratedTextBlocks(newBlocks);
    } catch (error) {
      console.error("Text generation error:", error);
      alert(translate('AI_ERROR', outputLanguage));
    } finally {
      setIsGeneratingText(false);
      setStatusMessage('');
      setProgress(0);
    }
  };

  const generateVoice = async () => {
    const selectedText = generatedTextBlocks
      .filter(b => b.selected)
      .map(b => b.text)
      .join('\n\n');
    
    if (!selectedText) return;

    setIsGeneratingVoice(true);
    setStatusMessage(translate('STATUS_GENERATING_VOICE', outputLanguage));
    setProgress(10);
    setShowErrorHint(false);

    try {
      // Split the text into chunks of ~2000 characters to avoid 500 errors
      const chunks = [];
      for (let i = 0; i < selectedText.length; i += 2000) {
        chunks.push(selectedText.substring(i, i + 2000));
      }

      const audioParts: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        setStatusMessage(`${translate('STATUS_GENERATING_VOICE', outputLanguage)} (${i + 1}/${chunks.length})`);
        setProgress(10 + (i / chunks.length) * 70);
        
        // Clean text: remove cinematic cues in parentheses before synthesis
        const cleanText = chunks[i].replace(/\([^)]*\)/g, '').trim();
        if (!cleanText) {
          audioParts.push(''); // Skip empty chunks but keep index
          continue;
        }

        const base64Audio = await generateGeminiVoice(
          cleanText,
          voiceLang,
          voiceGender,
          voiceStyle,
          profile.api_keys || [],
          outputLanguage,
          useProjectKey
        );
        
        audioParts.push(base64Audio);
      }

      setStatusMessage(translate('STATUS_MERGING', outputLanguage));
      setProgress(90);

      // Merge audio parts
      if (audioParts.length > 0) {
        // Concatenate all base64 parts into a single Uint8Array
        const allPcmData = audioParts.map(part => {
          const binaryString = atob(part);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return bytes;
        });

        // Calculate total length
        const totalLength = allPcmData.reduce((acc, curr) => acc + curr.length, 0);
        const mergedPcm = new Uint8Array(totalLength);
        let offset = 0;
        for (const data of allPcmData) {
          mergedPcm.set(data, offset);
          offset += data.length;
        }

        // Add WAV header (Gemini TTS returns 24kHz mono PCM)
        const wavData = addWavHeader(mergedPcm, 24000);
        const combinedBlob = new Blob([wavData], { type: 'audio/wav' });
        const url = URL.createObjectURL(combinedBlob);
        setAudioUrl(url);
        
        // Save to Supabase
        await supabase.from('voice_generations').insert([{
          user_email: profile.email,
          text: selectedText.substring(0, 1000), // Save snippet
          audio_url: url, // In production, this would be a permanent storage URL
          created_at: new Date().toISOString()
        }]);
      }

      setProgress(100);
    } catch (error) {
      console.error("Voice generation error:", error);
      setShowErrorHint(true);
      alert(translate('AI_ERROR', outputLanguage));
    } finally {
      setIsGeneratingVoice(false);
      setStatusMessage('');
      setTimeout(() => setProgress(0), 2000);
    }
  };

  const addWavHeader = (pcmData: Uint8Array, sampleRate: number) => {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    // RIFF identifier
    view.setUint32(0, 0x52494646, false); // "RIFF"
    // file length
    view.setUint32(4, 36 + pcmData.length, true);
    // RIFF type
    view.setUint32(8, 0x57415645, false); // "WAVE"
    // format chunk identifier
    view.setUint32(12, 0x666d7420, false); // "fmt "
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (1 = PCM)
    view.setUint16(20, 1, true);
    // channel count (1 = mono)
    view.setUint16(22, 1, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * 2, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    view.setUint32(36, 0x64617461, false); // "data"
    // data chunk length
    view.setUint32(40, pcmData.length, true);

    const wav = new Uint8Array(header.byteLength + pcmData.length);
    wav.set(new Uint8Array(header), 0);
    wav.set(pcmData, header.byteLength);
    return wav;
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
      {/* Header with Plan Info */}
      <div className="px-4 py-2 bg-white border-b border-slate-100 flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-xl font-black text-blue-700 tracking-tighter uppercase leading-none">
            {translate('PROMPT_TO_VOICE', outputLanguage)}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#8B93FF] to-[#5755FE] text-white shadow-lg flex items-center gap-2">
            <span className="text-[10px] font-serif font-black italic tracking-wider uppercase">
              {translate('CREDITS_VALUE', outputLanguage)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden p-4 gap-4">
        {/* Left Column: Prompts */}
        <div className="w-1/2 flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <Settings2 size={16} className="text-blue-600" />
              {translate('PROMPT_INPUT_LABEL', outputLanguage)}
            </h3>
            <button 
              onClick={addPrompt}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition shadow-lg active:scale-95"
            >
              <Plus size={14} />
              {translate('ADD_PROMPT', outputLanguage)}
            </button>
          </div>

          <p className="text-[10px] text-slate-500 font-bold italic mb-2">
            {translate('PROMPT_HINT', outputLanguage)}
          </p>

          {prompts.map((prompt, index) => (
            <div key={prompt.id} className="relative group">
              <textarea
                value={prompt.text}
                onChange={(e) => updatePrompt(prompt.id, e.target.value)}
                placeholder={`${translate('PROMPT_INPUT_LABEL', outputLanguage)} #${index + 1}...`}
                className="w-full h-48 bg-white border border-slate-200 rounded-2xl p-3 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition shadow-sm resize-none"
              />
              <div className="absolute bottom-4 right-4 flex items-center gap-3">
                <span className={`text-[10px] font-black uppercase ${prompt.text.length > 4000 ? 'text-red-500' : 'text-slate-400'}`}>
                  {translate('WORD_COUNT', outputLanguage, { count: prompt.text.split(/\s+/).filter(Boolean).length })}
                </span>
                {prompts.length > 1 && (
                  <button 
                    onClick={() => removePrompt(prompt.id)}
                    className="p-2 text-slate-400 hover:text-red-500 transition"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              {prompt.text.length > 4500 && (
                <p className="mt-1 text-[9px] text-red-500 font-bold uppercase tracking-tighter">
                  {translate('PROMPT_WARNING', outputLanguage)}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Right Column: Generated Text & Voice */}
        <div className="w-1/2 flex flex-col gap-4 overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{translate('TOPIC_LABEL', outputLanguage)}</span>
              <select 
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
              >
                <option value="TOPIC_FILM_REVIEW">{translate('TOPIC_FILM_REVIEW', outputLanguage)}</option>
                <option value="TOPIC_STORYTELLING">{translate('TOPIC_STORYTELLING', outputLanguage)}</option>
                <option value="TOPIC_DOCUMENT">{translate('TOPIC_DOCUMENT', outputLanguage)}</option>
                <option value="TOPIC_LIVESTREAM">{translate('TOPIC_LIVESTREAM', outputLanguage)}</option>
                <option value="TOPIC_SALES_REVIEW">{translate('TOPIC_SALES_REVIEW', outputLanguage)}</option>
                <option value="TOPIC_EDUCATION">{translate('TOPIC_EDUCATION', outputLanguage)}</option>
                <option value="TOPIC_DIY">{translate('TOPIC_DIY', outputLanguage)}</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={generateText}
                disabled={isGeneratingText}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition shadow-lg active:scale-95 disabled:opacity-50"
              >
                {isGeneratingText ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                {translate('GENERATE_TEXT', outputLanguage)}
              </button>
            </div>
          </div>

          <div className="flex-1 bg-white border border-slate-200 rounded-3xl overflow-hidden flex flex-col shadow-inner">
            <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button 
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase hover:text-blue-600 transition"
                >
                  {generatedTextBlocks.every(b => b.selected) ? <CheckSquare size={14} /> : <Square size={14} />}
                  {translate('SELECT_ALL_TEXT', outputLanguage)}
                </button>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const newBlock: TextBlock = { id: `manual-${Date.now()}`, text: '', selected: true };
                    setGeneratedTextBlocks([...generatedTextBlocks, newBlock]);
                    startEditingBlock(newBlock);
                  }}
                  className="p-1.5 text-slate-400 hover:text-blue-600 transition"
                >
                  <Plus size={16} />
                </button>
                <button 
                  onClick={() => handleCopyText(generatedTextBlocks.map(b => b.text).join('\n\n'))}
                  className="p-1.5 text-slate-400 hover:text-blue-600 transition"
                >
                  <Copy size={16} />
                </button>
                <button 
                  onClick={() => setGeneratedTextBlocks([])}
                  className="p-1.5 text-slate-400 hover:text-red-500 transition"
                >
                  <RotateCcw size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar flex flex-col">
              {generatedTextBlocks.length === 0 && !isGeneratingText && (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-4 min-h-full">
                  <textarea
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    placeholder={translate('WAITING_COMMAND', outputLanguage).toUpperCase()}
                    className="w-full flex-1 bg-transparent border-none text-center text-sm font-medium text-slate-600 focus:outline-none resize-none placeholder:text-slate-300 placeholder:font-black placeholder:tracking-[0.2em] p-10 pt-20"
                  />
                  {manualText.trim() && (
                    <button 
                      onClick={addManualBlock}
                      className="mb-20 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition shadow-lg active:scale-95"
                    >
                      <Plus size={14} />
                      {translate('ADD_SCENE', outputLanguage)}
                    </button>
                  )}
                  {!manualText && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-20">
                      <Loader2 size={48} className="mb-4" />
                    </div>
                  )}
                </div>
              )}
              {isGeneratingText && (
                <div className="h-full flex flex-col items-center justify-center gap-4">
                  <Loader2 size={32} className="animate-spin text-blue-600" />
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest animate-pulse">{translate('STATUS_GENERATING_TEXT', outputLanguage)}</p>
                </div>
              )}
              {generatedTextBlocks.map((block) => (
                <div 
                  key={block.id} 
                  className={`p-3 rounded-2xl border transition-all relative group ${block.selected ? 'bg-blue-50/50 border-blue-200 shadow-sm' : 'bg-white border-slate-100 opacity-60'}`}
                  onClick={() => !editingBlockId && toggleSelectBlock(block.id)}
                >
                  <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {editingBlockId === block.id ? (
                      <>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            saveEditBlock(block.id);
                          }}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                        >
                          <Save size={14} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            cancelEditBlock();
                          }}
                          className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg transition"
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            startEditingBlock(block);
                          }}
                          className="p-1.5 text-blue-400 hover:text-blue-600 transition"
                        >
                          <Pencil size={14} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            removeGeneratedBlock(block.id);
                          }}
                          className="p-1.5 text-slate-300 hover:text-red-500 transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      {block.selected ? <CheckSquare size={16} className="text-blue-600" /> : <Square size={16} className="text-slate-300" />}
                    </div>
                    {editingBlockId === block.id ? (
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="flex-1 bg-white border border-blue-200 rounded-xl p-1.5 text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px] resize-none"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">{block.text}</p>
                    )}
                  </div>
                  <div className="mt-2 flex justify-end">
                    <span className={`text-[10px] font-serif font-black uppercase ${block.text.split(/\s+/).filter(Boolean).length === 22 || block.text.split(/\s+/).filter(Boolean).length === 23 ? 'text-emerald-500' : 'text-slate-400'}`}>
                      {translate('WORD_COUNT', outputLanguage, { count: block.text.split(/\s+/).filter(Boolean).length })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Voice Generation Controls */}
          <div className="bg-white border border-slate-200 rounded-3xl p-3 shadow-lg space-y-2">
            <div className="flex items-center justify-between">
              <button 
                onClick={() => setShowVoiceSettings(!showVoiceSettings)}
                className="flex items-center gap-2 text-[10px] font-serif font-black text-slate-500 uppercase tracking-widest hover:text-blue-600 transition"
              >
                <Settings2 size={14} />
                {translate('VOICE_SETTINGS', outputLanguage)}
              </button>
              <button 
                onClick={generateVoice}
                disabled={isGeneratingVoice || generatedTextBlocks.filter(b => b.selected).length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-[10px] font-serif font-black uppercase tracking-widest hover:bg-red-700 transition shadow-lg active:scale-95 disabled:opacity-50"
              >
                {isGeneratingVoice ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />}
                {translate('GENERATE_VOICE', outputLanguage)}
              </button>
            </div>

            {showVoiceSettings && (
              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-200">
                <div className="space-y-1">
                  <label className="text-[10px] font-serif font-black text-slate-400 uppercase">{translate('LANGUAGE_LABEL', outputLanguage)}</label>
                  <select 
                    value={voiceLang}
                    onChange={(e) => setVoiceLang(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                  >
                    <option value="vi-VN">Tiếng Việt</option>
                    <option value="en-US">English (US)</option>
                    <option value="fr-FR">{translate('LANG_FRENCH', outputLanguage)}</option>
                    <option value="ru-RU">{translate('LANG_RUSSIAN', outputLanguage)}</option>
                    <option value="de-DE">{translate('LANG_GERMAN', outputLanguage)}</option>
                    <option value="zh-CN">{translate('LANG_CHINESE', outputLanguage)}</option>
                    <option value="id-ID">{translate('LANG_INDONESIAN', outputLanguage)}</option>
                    <option value="hi-IN">{translate('LANG_HINDI', outputLanguage)}</option>
                    <option value="th-TH">{translate('LANG_THAI', outputLanguage)}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-serif font-black text-slate-400 uppercase">{translate('GENDER_LABEL', outputLanguage)}</label>
                  <select 
                    value={voiceGender}
                    onChange={(e) => setVoiceGender(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                  >
                    <option value="FEMALE">{translate('FEMALE_VOICE', outputLanguage)}</option>
                    <option value="MALE">{translate('MALE_VOICE', outputLanguage)}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-serif font-black text-slate-400 uppercase">{translate('STYLE_LABEL', outputLanguage)}</label>
                  <select 
                    value={voiceStyle}
                    onChange={(e) => setVoiceStyle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-lg px-2 py-1 text-[10px] font-bold outline-none"
                  >
                    <option value="STYLE_NATURAL">{translate('STYLE_NATURAL', outputLanguage)}</option>
                    <option value="STYLE_EMOTIONAL">{translate('STYLE_EMOTIONAL', outputLanguage)}</option>
                    <option value="STYLE_NARRATION">{translate('STYLE_NARRATION', outputLanguage)}</option>
                    <option value="STYLE_SALES">{translate('STYLE_SALES', outputLanguage)}</option>
                    <option value="STYLE_PODCAST">{translate('STYLE_PODCAST', outputLanguage)}</option>
                  </select>
                </div>
              </div>
            )}

            {(isGeneratingVoice || progress > 0) && (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest animate-pulse">{statusMessage}</span>
                  <span className="text-[9px] font-black text-blue-600">{Math.round(progress)}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-600 transition-all duration-300" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {showErrorHint && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-2xl">
                <p className="text-[10px] font-bold text-red-600 italic">
                  {translate('VOICE_GEN_ERROR_HINT', outputLanguage)}
                </p>
              </div>
            )}

            {audioUrl && (
              <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100 animate-in fade-in duration-500">
                <audio ref={audioRef} controls src={audioUrl} className="flex-1 h-8" />
                <a 
                  href={audioUrl} 
                  download="generated_voice.mp3"
                  className="p-2 bg-white text-blue-600 rounded-xl border border-blue-100 shadow-sm hover:bg-blue-50 transition active:scale-95"
                >
                  <Download size={16} />
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
