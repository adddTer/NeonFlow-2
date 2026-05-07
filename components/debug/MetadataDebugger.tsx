
import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Bug, Image as ImageIcon, AlertTriangle, Zap, FileText, Activity, Music, TrendingUp } from 'lucide-react';
import { extractCoverArt } from '../../utils/audioMetadata';
import { fileToBase64 } from '../../utils/fileUtils';
import { AudioFeature } from '../../utils/audioAnalyzer';
import { Onset } from '../../types';
import { preprocessAudioData } from '../../utils/audioAnalyzer';

export const MetadataDebugger = ({ onClose, apiKey }: { onClose: () => void, apiKey: string }) => {
    const [logs, setLogs] = useState<string[]>([]);
    const [image, setImage] = useState<string | null>(null);
    const [fileName, setFileName] = useState("");
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    
    // UI State
    const [activeTab, setActiveTab] = useState<'COVER' | 'FEATURES' | 'ONSETS'>('COVER');
    
    // Audio Features State
    const [audioFeatures, setAudioFeatures] = useState<AudioFeature[]>([]);
    const [isExtracting, setIsExtracting] = useState(false);
    
    // Onsets State
    const [onsets, setOnsets] = useState<Onset[]>([]);
    const [isComputingOnsets, setIsComputingOnsets] = useState(false);
    const onsetCanvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (activeTab === 'ONSETS' && onsets.length > 0 && onsetCanvasRef.current) {
            const canvas = onsetCanvasRef.current;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            
            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);
            
            const maxEnergy = Math.max(...onsets.map(o => o.energy), 1);
            const duration = onsets[onsets.length - 1].time + 1;
            
            // Draw baseline
            ctx.beginPath();
            ctx.moveTo(0, h);
            ctx.lineTo(w, h);
            ctx.strokeStyle = '#333';
            ctx.stroke();

            onsets.forEach(onset => {
                const x = (onset.time / duration) * w;
                const height = (onset.energy / maxEnergy) * h * 0.8;
                
                ctx.fillStyle = onset.isLowFreq ? '#8b5cf6' : '#22d3ee'; // Purple for low, Blue for full
                ctx.fillRect(x - 1, h - height, 2, height);
            });
        }
    }, [activeTab, onsets]);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setSelectedFile(file);
        setLogs([]);
        setImage(null);
        setAudioFeatures([]);
        setOnsets([]);
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

    const handleFeatureExtraction = async () => {
        if (!selectedFile) return;
        setIsExtracting(true);
        setActiveTab('FEATURES');
        setLogs(prev => [...prev, `[AUDIO] Reading file array buffer...`]);
        setAudioFeatures([]);

        try {
            const arrayBuffer = await selectedFile.arrayBuffer();
            const audioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new audioContextClass();
            setLogs(prev => [...prev, `[AUDIO] Decoding audio data...`]);
            const decodedData = await ctx.decodeAudioData(arrayBuffer);
            
            setLogs(prev => [...prev, `[AUDIO] Dispatching to Worker for Pitch, RMS, ZCR...`]);
            const startTime = performance.now();
            
            const worker = new Worker(new URL('../../workers/featureWorker.ts', import.meta.url), { type: 'module' });
            
            worker.onmessage = (e) => {
                if (e.data.type === 'FEATURES_RESULT' && e.data.success) {
                    const features = e.data.features;
                    const endTime = performance.now();
                    setAudioFeatures(features);
                    setLogs(prev => [...prev, `[AUDIO] Extracted ${features.length} frames in ${((endTime - startTime) / 1000).toFixed(2)}s.`]);
                } else if (e.data.type === 'FEATURES_RESULT' && !e.data.success) {
                    setLogs(prev => [...prev, `[AUDIO] Worker Error: ${e.data.error}`]);
                }
                setIsExtracting(false);
                worker.terminate();
            };

            worker.postMessage({
                type: 'EXTRACT_FEATURES',
                payload: {
                    channelData: decodedData.getChannelData(0),
                    sampleRate: decodedData.sampleRate,
                    fps: 10
                }
            });
            
        } catch (e: any) {
            setLogs(prev => [...prev, `[AUDIO] Error: ${e.message}`]);
            setIsExtracting(false);
        }
    };

    const handleComputeOnsets = async () => {
        if (!selectedFile) return;
        setIsComputingOnsets(true);
        setActiveTab('ONSETS');
        setLogs(prev => [...prev, `[ONSETS] Decoding audio...`]);
        setOnsets([]);

        try {
            const arrayBuffer = await selectedFile.arrayBuffer();
            const audioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new audioContextClass();
            const decodedData = await ctx.decodeAudioData(arrayBuffer);
            
            setLogs(prev => [...prev, `[ONSETS] Preprocessing audio in Main Thread...`]);
            const { lowData, fullData } = await preprocessAudioData(decodedData);
            
            setLogs(prev => [...prev, `[ONSETS] Dispatching onset detection to Worker...`]);
            const startTime = performance.now();

            const worker = new Worker(new URL('../../workers/featureWorker.ts', import.meta.url), { type: 'module' });
            
            worker.onmessage = (e) => {
                if (e.data.type === 'ONSETS_RESULT' && e.data.success) {
                    const resOnsets = e.data.onsets;
                    const endTime = performance.now();
                    setOnsets(resOnsets);
                    setLogs(prev => [...prev, `[ONSETS] Detected ${resOnsets.length} onsets in ${((endTime - startTime) / 1000).toFixed(2)}s.`]);
                } else if (e.data.type === 'ONSETS_RESULT' && !e.data.success) {
                    setLogs(prev => [...prev, `[ONSETS] Worker Error: ${e.data.error}`]);
                }
                setIsComputingOnsets(false);
                worker.terminate();
            };

            worker.postMessage({
                type: 'COMPUTE_ONSETS',
                payload: {
                    lowData,
                    fullData,
                    sampleRate: decodedData.sampleRate
                }
            });
            
        } catch (e: any) {
            setLogs(prev => [...prev, `[ONSETS] Error: ${e.message}`]);
            setIsComputingOnsets(false);
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
                         音频信息调式器
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

                         <button 
                            onClick={handleFeatureExtraction}
                            disabled={!selectedFile || isExtracting}
                            className={`w-full py-3 mb-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all 
                                ${!selectedFile ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 
                                  'bg-white/10 text-white hover:bg-white/20 active:scale-95'
                                }`}
                         >
                             {isExtracting ? <Zap className="w-4 h-4 animate-pulse" /> : <Activity className="w-4 h-4" />}
                             {isExtracting ? "特征提取中..." : "测试音频特征提取 (Pitch, RMS, ZCR)"}
                         </button>

                         <button 
                            onClick={handleComputeOnsets}
                            disabled={!selectedFile || isComputingOnsets}
                            className={`w-full py-3 mb-6 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all 
                                ${!selectedFile ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 
                                  'bg-neon-purple/20 text-neon-purple border border-neon-purple/50 hover:bg-neon-purple/30 active:scale-95'
                                }`}
                         >
                             {isComputingOnsets ? <Zap className="w-4 h-4 animate-pulse" /> : <TrendingUp className="w-4 h-4" />}
                             {isComputingOnsets ? "节奏点计算中..." : "提取节奏点 (Onsets)"}
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
                                     const isSuccess = l.includes('SUCCESS') || l.includes('Extracted');
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
                                onClick={() => setActiveTab('FEATURES')}
                                className={`flex items-center gap-2 pb-2 text-sm font-bold transition-all border-b-2 ${activeTab === 'FEATURES' ? 'text-neon-blue border-neon-blue' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                             >
                                 <Activity className="w-4 h-4" /> 物理音频特征
                             </button>
                             <button 
                                onClick={() => setActiveTab('ONSETS')}
                                className={`flex items-center gap-2 pb-2 text-sm font-bold transition-all border-b-2 ${activeTab === 'ONSETS' ? 'text-neon-purple border-neon-purple' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                             >
                                 <TrendingUp className="w-4 h-4" /> 节奏点可视化
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

                             {activeTab === 'FEATURES' && (
                                 <div className="w-full h-full flex flex-col pt-4 px-4 pb-0 bg-[#050505] overflow-y-auto custom-scrollbar">
                                     {audioFeatures.length > 0 ? (
                                         <table className="w-full text-left text-xs text-green-400 font-mono">
                                             <thead className="sticky top-0 bg-[#050505] shadow-[0_4px_10px_#050505]">
                                                 <tr>
                                                     <th className="py-2 border-b border-white/10">Time (s)</th>
                                                     <th className="py-2 border-b border-white/10">RMS (Vol)</th>
                                                     <th className="py-2 border-b border-white/10">ZCR (Timbre)</th>
                                                     <th className="py-2 border-b border-white/10">Pitch (Hz)</th>
                                                 </tr>
                                             </thead>
                                             <tbody>
                                                 {audioFeatures.slice(0, 100).map((f, i) => (
                                                     <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                                                         <td className="py-1">{f.time.toFixed(2)}</td>
                                                         <td className="py-1">{(f.rms * 100).toFixed(2)}</td>
                                                         <td className="py-1">{f.zcr.toFixed(4)}</td>
                                                         <td className="py-1">{f.pitch.toFixed(1)}</td>
                                                     </tr>
                                                 ))}
                                             </tbody>
                                         </table>
                                     ) : (
                                         <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 gap-2">
                                             <Activity className="w-12 h-12 opacity-20" />
                                             <span className="text-xs">点击左侧提取特征按钮分析结构 (显示前 100 帧)</span>
                                         </div>
                                     )}
                                 </div>
                             )}

                             {activeTab === 'ONSETS' && (
                                 <div className="w-full h-full flex flex-col p-4 bg-[#050505] overflow-y-auto custom-scrollbar">
                                     {onsets.length > 0 ? (
                                         <>
                                            <div className="w-full flex-shrink-0 h-40 bg-black/50 rounded-xl mb-4 p-2 relative">
                                                <canvas width="800" height="150" ref={onsetCanvasRef} className="w-full h-full" />
                                                <div className="absolute top-2 right-4 text-xs font-mono text-gray-500 flex gap-4">
                                                    <span className="flex items-center gap-1"><div className="w-2 h-2 bg-[#8b5cf6] rounded-full"></div> 低频节奏</span>
                                                    <span className="flex items-center gap-1"><div className="w-2 h-2 bg-[#22d3ee] rounded-full"></div> 全频节奏</span>
                                                </div>
                                            </div>
                                            <table className="w-full text-left text-xs text-neon-purple font-mono flex-1">
                                                <thead className="sticky top-0 bg-[#050505] shadow-[0_4px_10px_#050505] z-10">
                                                    <tr>
                                                        <th className="py-2 border-b border-white/10">Time(s)</th>
                                                        <th className="py-2 border-b border-white/10">Val</th>
                                                        <th className="py-2 border-b border-white/10">Type</th>
                                                        <th className="py-2 border-b border-white/10">Pitch</th>
                                                        <th className="py-2 border-b border-white/10">ZCR</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {onsets.slice(0, 150).map((o, i) => (
                                                        <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                                                            <td className="py-1">{o.time.toFixed(3)}</td>
                                                            <td className="py-1">{o.energy.toFixed(3)}</td>
                                                            <td className="py-1">
                                                                <span className={o.isLowFreq ? "text-[#8b5cf6]" : "text-[#22d3ee]"}>
                                                                    {o.isLowFreq ? "Low" : "Full"}
                                                                </span>
                                                            </td>
                                                            <td className="py-1 text-white/50">{o.pitch ? Math.round(o.pitch) + 'Hz' : '-'}</td>
                                                            <td className="py-1 text-white/50">{o.zcr ? o.zcr.toFixed(3) : '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                         </>
                                     ) : (
                                         <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 gap-2">
                                             <TrendingUp className="w-12 h-12 opacity-20" />
                                             <span className="text-xs">点击左侧提取节奏点按钮</span>
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
