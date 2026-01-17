
import React, { useState } from 'react';
import { X, Upload, Bug, Image as ImageIcon, AlertTriangle, Zap, Bot, FileText } from 'lucide-react';
import { extractCoverArt } from '../../utils/audioMetadata';
import { analyzeMetadataWithGemini } from '../../services/metadataService';
import { fileToBase64 } from '../../utils/fileUtils';

export const MetadataDebugger = ({ onClose, apiKey }: { onClose: () => void, apiKey: string }) => {
    const [logs, setLogs] = useState<string[]>([]);
    const [image, setImage] = useState<string | null>(null);
    const [fileName, setFileName] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    
    // AI Debug State
    const [activeTab, setActiveTab] = useState<'COVER' | 'AI'>('COVER');
    const [aiRaw, setAiRaw] = useState<string>("");
    const [isAiLoading, setIsAiLoading] = useState(false);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setSelectedFile(file);
        setLogs([]);
        setImage(null);
        setAiRaw("");
        setFileName(file.name);
        
        const timestamp = new Date().toLocaleTimeString();
        setLogs([`[${timestamp}] Selected file: ${file.name}`, `[${timestamp}] Size: ${(file.size / 1024 / 1024).toFixed(2)} MB`, `[${timestamp}] Type: ${file.type}`]);

        // Local Analysis
        try {
            const result = await extractCoverArt(file, (msg) => {
                setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
            });
            
            if (result) {
                setImage(result);
                setActiveTab('COVER');
                setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] SUCCESS: Image data extracted.`]);
            } else {
                setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] FAILURE: No image found in metadata.`]);
            }
        } catch (err: any) {
            setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: ${err.message}`]);
        }
    };

    const handleAiTest = async () => {
        if (!selectedFile) return;
        if (!apiKey) {
            setLogs(prev => [...prev, `[AI] ERROR: API Key Missing.`]);
            return;
        }

        setIsAiLoading(true);
        setActiveTab('AI');
        setAiRaw("Thinking...");
        
        try {
            setLogs(prev => [...prev, `[AI] Reading file base64...`]);
            const base64Str = await fileToBase64(selectedFile);
            const base64Data = base64Str.split(',')[1];
            
            setLogs(prev => [...prev, `[AI] Sending to Gemini...`]);
            
            const result = await analyzeMetadataWithGemini(
                selectedFile.name,
                base64Data,
                selectedFile.type,
                120, // Dummy BPM hint
                apiKey,
                (rawText) => {
                    setAiRaw(rawText);
                    setLogs(prev => [...prev, `[AI] Received Raw Output.`]);
                }
            );
            
            setLogs(prev => [...prev, `[AI] Parsed Title: ${result.title}`]);
            setLogs(prev => [...prev, `[AI] Parsed Artist: ${result.artist}`]);
            setLogs(prev => [...prev, `[AI] Parsed BPM: ${result.bpm}`]);

        } catch (e: any) {
            setAiRaw(prev => prev + `\n\n[ERROR]: ${e.message}`);
            setLogs(prev => [...prev, `[AI] Error: ${e.message}`]);
        } finally {
            setIsAiLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#0f172a] w-full max-w-5xl h-[85vh] rounded-3xl flex flex-col border border-white/20 relative shadow-2xl overflow-hidden">
                 
                 {/* Header */}
                 <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
                     <h2 className="text-xl font-black text-white flex items-center gap-3">
                         <div className="p-2 bg-neon-purple/20 rounded-lg">
                             <Bug className="text-neon-purple w-6 h-6" />
                         </div>
                         元数据分析调试器
                     </h2>
                     <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
                        <X className="w-5 h-5 text-white"/>
                     </button>
                 </div>

                 {/* Content */}
                 <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                     
                     {/* Left: Controls & Logs */}
                     <div className="flex-1 flex flex-col p-6 border-b md:border-b-0 md:border-r border-white/10 min-w-[40%] bg-[#0a0a0a]">
                         
                         <label className="flex items-center justify-center gap-3 w-full py-4 bg-white/10 border-2 border-dashed border-white/20 text-white font-bold rounded-xl cursor-pointer hover:bg-white/20 transition-all active:scale-95 mb-4 group">
                             <Upload className="w-5 h-5 text-gray-400 group-hover:text-white" /> 
                             {fileName ? '更换文件' : '上传音频 (.mp3, .flac)'}
                             <input type="file" onChange={handleFile} className="hidden" accept="audio/*,.flac" />
                         </label>

                         {/* AI Trigger */}
                         <button 
                            onClick={handleAiTest}
                            disabled={!selectedFile || !apiKey || isAiLoading}
                            className={`w-full py-3 mb-6 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all 
                                ${!selectedFile ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 
                                  !apiKey ? 'bg-red-900/20 text-red-400 border border-red-500/30' :
                                  'bg-gradient-to-r from-neon-blue to-neon-purple text-white hover:shadow-[0_0_20px_rgba(139,92,246,0.4)] active:scale-95'
                                }`}
                         >
                             {isAiLoading ? <Zap className="w-4 h-4 animate-pulse" /> : <Bot className="w-4 h-4" />}
                             {!apiKey ? "需要 API Key (在设置中配置)" : isAiLoading ? "AI 分析中..." : "测试 Gemini 元数据分析"}
                         </button>

                         <div className="flex items-center gap-2 mb-2 text-xs font-bold text-gray-500 uppercase tracking-widest">
                             <ActivityIcon /> 系统日志
                         </div>
                         
                         <div className="flex-1 bg-black rounded-xl p-4 font-mono text-xs overflow-y-auto border border-white/10 custom-scrollbar">
                             {logs.length === 0 ? (
                                 <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-2 opacity-50">
                                     <AlertTriangle className="w-8 h-8" />
                                     <p>等待操作...</p>
                                 </div>
                             ) : (
                                 logs.map((l, i) => {
                                     const isError = l.includes('ERROR') || l.includes('FAILURE');
                                     const isSuccess = l.includes('SUCCESS');
                                     const isHeader = l.includes('Block Found') || l.includes('Detected');
                                     const isAi = l.includes('[AI]');
                                     
                                     return (
                                        <div key={i} className={`mb-1.5 break-all border-b border-white/5 pb-1 ${
                                            isError ? 'text-red-400 font-bold' : 
                                            isSuccess ? 'text-green-400 font-bold' : 
                                            isHeader ? 'text-blue-300' : 
                                            isAi ? 'text-neon-purple' : 'text-gray-400'
                                        }`}>
                                            {l}
                                        </div>
                                     );
                                 })
                             )}
                         </div>
                     </div>

                     {/* Right: Preview Tabs */}
                     <div className="flex-[1.5] p-6 flex flex-col bg-[#0f172a] relative">
                         
                         <div className="flex gap-4 mb-4 border-b border-white/10 pb-2">
                             <button 
                                onClick={() => setActiveTab('COVER')}
                                className={`flex items-center gap-2 pb-2 text-sm font-bold transition-all border-b-2 ${activeTab === 'COVER' ? 'text-white border-white' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                             >
                                 <ImageIcon className="w-4 h-4" /> 本地封面解析
                             </button>
                             <button 
                                onClick={() => setActiveTab('AI')}
                                className={`flex items-center gap-2 pb-2 text-sm font-bold transition-all border-b-2 ${activeTab === 'AI' ? 'text-neon-purple border-neon-purple' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                             >
                                 <FileText className="w-4 h-4" /> AI 原始返回数据
                             </button>
                         </div>
                         
                         <div className="flex-1 bg-black/40 rounded-2xl border border-white/10 overflow-hidden relative">
                             {activeTab === 'COVER' && (
                                 image ? (
                                     <div className="w-full h-full flex items-center justify-center relative bg-[url('https://grainy-gradients.vercel.app/noise.svg')]">
                                         <img src={image} className="max-w-full max-h-full object-contain shadow-2xl relative z-10" alt="Extracted Cover" />
                                         <div className="absolute inset-0 bg-contain bg-center opacity-20 blur-xl" style={{ backgroundImage: `url(${image})` }}></div>
                                     </div>
                                 ) : (
                                     <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 gap-2">
                                         <ImageIcon className="w-12 h-12 opacity-20" />
                                         <span className="text-xs">暂无图片数据</span>
                                     </div>
                                 )
                             )}

                             {activeTab === 'AI' && (
                                 <div className="w-full h-full flex flex-col">
                                     {aiRaw ? (
                                         <textarea 
                                            readOnly 
                                            value={aiRaw} 
                                            className="w-full h-full bg-[#050505] p-4 text-xs font-mono text-green-400 resize-none outline-none custom-scrollbar leading-relaxed"
                                         />
                                     ) : (
                                         <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 gap-2">
                                             <Bot className="w-12 h-12 opacity-20" />
                                             <span className="text-xs">点击左侧“测试 Gemini”按钮获取原始响应</span>
                                         </div>
                                     )}
                                 </div>
                             )}
                         </div>
                     </div>
                 </div>
            </div>
        </div>
    );
};

const ActivityIcon = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
);
