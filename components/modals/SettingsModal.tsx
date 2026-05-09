
import React, { useState } from 'react';
import { Settings, X, Keyboard, Volume2, Gauge, Bug, Check, Loader2, AlertTriangle, Key, Monitor, Gamepad2, MousePointer2, RefreshCw, Eye, Cpu } from 'lucide-react';
import { KeyConfig } from '../../types';

interface SettingsModalProps {
    onClose: () => void;
    scrollSpeed: number;
    setScrollSpeed: (s: number) => void;
    keyConfig: KeyConfig;
    setKeyConfig: (k: KeyConfig) => void;
    audioOffset: number;
    openCalibration: () => void;
    isDebugMode: boolean;
    openMetadataDebugger: () => void;
    apiKeyStatus: 'valid' | 'missing' | 'checking' | 'invalid';
    customApiKey: string;
    setCustomApiKey: (k: string) => void;
    handleSaveSettings: () => void;
    validationError: string | null;
    rebindingKey: { mode: 4 | 6; index: number } | null;
    setRebindingKey: (k: { mode: 4 | 6; index: number } | null) => void;
    hasEnvKey: boolean;
    onRestartTutorial?: () => void;
    showKeys: boolean;
    setShowKeys: (b: boolean) => void;
}

type SettingsTab = 'GAMEPLAY' | 'CONTROLS' | 'SYSTEM';

export const SettingsModal: React.FC<SettingsModalProps> = ({
    onClose, scrollSpeed, setScrollSpeed,
    keyConfig, setKeyConfig,
    audioOffset, openCalibration,
    isDebugMode, openMetadataDebugger,
    apiKeyStatus, customApiKey, setCustomApiKey,
    handleSaveSettings, validationError,
    rebindingKey, setRebindingKey, hasEnvKey,
    onRestartTutorial,
    showKeys, setShowKeys
}) => {
    
    const [activeTab, setActiveTab] = useState<SettingsTab>('GAMEPLAY');
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    const TabButton = ({ id, icon: Icon, label }: { id: SettingsTab, icon: any, label: string }) => (
        <button 
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-3 px-4 py-3 md:py-5 md:px-6 rounded-none border-l-2 text-xs md:text-sm font-black uppercase tracking-widest transition-all whitespace-nowrap group
                ${activeTab === id 
                    ? 'border-neon-blue bg-neon-blue/10 text-white shadow-[inset_20px_0_20px_-20px_rgba(0,243,255,0.3)]' 
                    : 'border-transparent text-gray-500 hover:bg-white/5 hover:text-gray-300'
                }`}
        >
            <Icon className={`w-4 h-4 md:w-5 md:h-5 ${activeTab === id ? 'text-neon-blue drop-shadow-[0_0_5px_#00f3ff]' : 'opacity-50 group-hover:opacity-100 transition-opacity'}`} />
            {label}
        </button>
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-6 animate-fade-in font-sans">
             
             {/* Backdrop */}
             <div className="absolute inset-0 bg-black/90 backdrop-blur-md"></div>
             
             {/* Tech Grid Background */}
             <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 1) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

             <div className="relative z-10 bg-[#08080a] md:border border-white/10 md:rounded-2xl w-full max-w-5xl h-full md:h-[85vh] shadow-2xl flex flex-col overflow-hidden">
                 
                 {/* Header */}
                 <div className="flex items-center justify-between p-4 md:p-6 border-b border-white/5 bg-black/50 shrink-0 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-[#111] border border-white/10 rounded-lg relative overflow-hidden group">
                            <div className="absolute inset-0 bg-neon-blue/20 translate-y-full group-hover:translate-y-0 transition-transform"></div>
                            <Settings className="w-5 h-5 text-neon-blue relative z-10" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white uppercase tracking-widest leading-none">系统设置</h2>
                            <span className="text-[9px] text-neon-blue font-bold tracking-widest uppercase">控制面板 v2.0</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 text-gray-500 hover:text-white hover:bg-red-500/20 hover:border-red-500/50 border border-transparent rounded-xl transition-all group">
                        <X className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    </button>
                 </div>

                 {/* Body Layout */}
                 <div className="flex flex-col md:flex-row flex-1 overflow-hidden relative">
                     
                     {/* Navigation (Top on Mobile, Left on Desktop) */}
                     <div className="w-full md:w-64 bg-black/60 border-b md:border-b-0 md:border-r border-white/5 flex flex-row md:flex-col pt-2 md:pt-4 md:pb-4 overflow-x-auto md:overflow-y-auto shrink-0 hide-scrollbar z-10">
                         <div className="hidden md:block px-6 pb-2 text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 border-b border-white/5">类别</div>
                         <TabButton id="GAMEPLAY" icon={Gauge} label="游玩设置" />
                         <TabButton id="CONTROLS" icon={Gamepad2} label="按键设置" />
                         <TabButton id="SYSTEM" icon={Cpu} label="系统选项" />
                     </div>

                     {/* Content Area */}
                     <div className="flex-1 bg-[#0a0a0c] p-4 md:p-10 overflow-y-auto custom-scrollbar relative">
                         
                         {/* Rebinding Overlay */}
                         {rebindingKey && (
                             <div className="absolute inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center animate-fade-in text-center p-8">
                                 <div className="relative mb-8">
                                    <div className="absolute inset-0 bg-neon-blue blur-[30px] opacity-20 rounded-full animate-pulse"></div>
                                    <Keyboard className="w-20 h-20 text-neon-blue relative z-10" />
                                 </div>
                                 <h3 className="text-3xl font-black text-white mb-3 uppercase tracking-widest drop-shadow-lg">等待输入</h3>
                                 <p className="text-neon-blue text-sm mb-10 font-mono font-bold uppercase tracking-widest bg-neon-blue/10 border border-neon-blue/20 px-6 py-3 rounded-lg shadow-inner">请按下任意键以绑定...</p>
                                 <button onClick={() => setRebindingKey(null)} className="px-10 py-4 bg-transparent border-2 border-white/20 hover:border-white hover:bg-white/5 text-white font-black uppercase tracking-widest text-xs transition-all">取消绑定</button>
                             </div>
                         )}

                         <div className="max-w-2xl mx-auto space-y-10 pb-20 md:pb-0">
                             
                             {/* GAMEPLAY TAB */}
                             {activeTab === 'GAMEPLAY' && (
                                 <div className="space-y-8 animate-fade-in">
                                     <SectionHeader title="性能与交互" />
                                     
                                     {/* Speed Control */}
                                     <div className="bg-[#111] border border-white/5 rounded-2xl p-6 relative overflow-hidden group hover:border-white/20 transition-colors">
                                         <div className="absolute top-0 left-0 w-1 h-full bg-neon-blue opacity-50 group-hover:opacity-100 transition-opacity"></div>
                                         <div className="flex justify-between items-center mb-8">
                                              <div className="flex items-center gap-4">
                                                  <div className="p-3 bg-black border border-white/10 rounded-xl text-neon-blue drop-shadow-md"><Gauge className="w-6 h-6" /></div>
                                                  <div>
                                                      <div className="font-black text-white text-lg tracking-tight">下落速度</div>
                                                      <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">音符接近速率</div>
                                                  </div>
                                              </div>
                                              <div className="text-cyan-400 font-black font-mono text-4xl tabular-nums drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]">{scrollSpeed.toFixed(1)}</div>
                                         </div>
                                         
                                         <div className="relative h-14 flex items-center bg-black/50 px-4 rounded-xl border border-white/5">
                                            <input 
                                                type="range" 
                                                min="1.0" 
                                                max="10.0" 
                                                step="0.1"
                                                value={scrollSpeed}
                                                onChange={(e) => setScrollSpeed(Number(e.target.value))}
                                                className="w-full h-1 bg-gray-800 rounded-full appearance-none cursor-pointer accent-cyan-400 hover:accent-white transition-all outline-none"
                                            />
                                         </div>
                                         <div className="flex justify-between text-[10px] text-gray-600 font-black tracking-widest font-mono mt-3 px-2 uppercase">
                                             <span>1.0 慢</span>
                                             <span>目标: 5.0</span>
                                             <span>10.0 快</span>
                                         </div>
                                     </div>

                                     {/* Audio Calibration */}
                                     <div className="bg-[#111] border border-white/5 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:border-white/20 transition-colors relative overflow-hidden group">
                                         <div className="absolute top-0 left-0 w-1 h-full bg-neon-purple opacity-50 group-hover:opacity-100 transition-opacity"></div>
                                         <div className="flex items-center gap-4">
                                             <div className="p-3 bg-black border border-white/10 rounded-xl text-neon-purple drop-shadow-md"><Volume2 className="w-6 h-6" /></div>
                                             <div>
                                                 <div className="font-black text-white text-lg tracking-tight">音频偏移</div>
                                                 <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">硬件延迟同步</div>
                                             </div>
                                         </div>
                                         <div className="flex items-center gap-4 w-full md:w-auto">
                                             <div className="bg-black px-4 py-2.5 rounded-xl border border-white/10 font-mono text-sm text-gray-400 shadow-inner">
                                                 {audioOffset > 0 ? `+${audioOffset}` : audioOffset}<span className="text-[10px] ml-1 opacity-50">毫秒</span>
                                             </div>
                                             <button 
                                                 onClick={openCalibration}
                                                 className="flex-1 md:flex-none px-6 py-3 bg-white/10 border border-white/20 hover:bg-white text-white hover:text-black text-xs font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 whitespace-nowrap"
                                             >
                                                 自动校准
                                             </button>
                                         </div>
                                     </div>

                                     {/* Show Keys Toggle (Desktop Only) */}
                                     {!isMobile && (
                                         <div className="bg-[#111] border border-white/5 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:border-white/20 transition-colors relative overflow-hidden group">
                                             <div className="absolute top-0 left-0 w-1 h-full bg-gray-400 opacity-50 group-hover:opacity-100 transition-opacity"></div>
                                             <div className="flex items-center gap-4">
                                                 <div className="p-3 bg-black border border-white/10 rounded-xl text-gray-300 drop-shadow-md"><Eye className="w-6 h-6" /></div>
                                                 <div>
                                                     <div className="font-black text-white text-lg tracking-tight">HUD 悬浮窗</div>
                                                     <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">在轨道上显示按键绑定</div>
                                                 </div>
                                             </div>
                                             <button 
                                                onClick={() => setShowKeys(!showKeys)}
                                                className={`w-16 h-8 rounded-full border-2 transition-all relative flex items-center px-1 ${showKeys ? 'bg-cyan-500/20 border-cyan-400' : 'bg-black border-gray-600'}`}
                                             >
                                                 <div className={`w-5 h-5 rounded-full transition-transform ${showKeys ? 'bg-cyan-400 translate-x-8 shadow-[0_0_10px_#22d3ee]' : 'bg-gray-500 translate-x-0'}`}></div>
                                             </button>
                                         </div>
                                     )}
                                 </div>
                             )}

                             {/* CONTROLS TAB */}
                             {activeTab === 'CONTROLS' && (
                                 <div className="space-y-10 animate-fade-in">
                                     <SectionHeader title="输入矩阵" />
                                     
                                     {/* 4K Config */}
                                     <div className="bg-[#111] border border-white/5 rounded-2xl p-8 relative overflow-hidden group">
                                         <div className="absolute top-0 right-0 p-4 opacity-10">
                                            <div className="text-[60px] font-black italic leading-none">4K</div>
                                         </div>
                                         <div className="flex items-center gap-3 mb-8 relative z-10">
                                             <div className="w-2 h-2 bg-cyan-400 rounded-sm shadow-sm"></div>
                                             <span className="text-sm font-black text-white uppercase tracking-widest">标准模式</span>
                                         </div>
                                         <div className="grid grid-cols-4 gap-4 relative z-10">
                                             {keyConfig.k4.map((k, i) => (
                                                 <KeyButton 
                                                    key={i} 
                                                    label={`轨道 0${i+1}`} 
                                                    value={k} 
                                                    onClick={() => setRebindingKey({mode: 4, index: i})} 
                                                    color="text-cyan-400"
                                                    borderColor="group-hover:border-cyan-400/50 border-white/10"
                                                    bgHover="hover:bg-cyan-400/10"
                                                 />
                                             ))}
                                         </div>
                                     </div>

                                     {/* 6K Config */}
                                     <div className="bg-[#111] border border-white/5 rounded-2xl p-8 relative overflow-hidden group">
                                         <div className="absolute top-0 right-0 p-4 opacity-10">
                                            <div className="text-[60px] font-black italic leading-none">6K</div>
                                         </div>
                                         <div className="flex items-center gap-3 mb-8 relative z-10">
                                             <div className="w-2 h-2 bg-neon-purple rounded-sm shadow-sm"></div>
                                             <span className="text-sm font-black text-white uppercase tracking-widest">专家模式</span>
                                         </div>
                                         <div className="grid grid-cols-6 gap-3 relative z-10">
                                             {keyConfig.k6.map((k, i) => (
                                                 <KeyButton 
                                                    key={i} 
                                                    label={`0${i+1}`} 
                                                    value={k} 
                                                    onClick={() => setRebindingKey({mode: 6, index: i})} 
                                                    color="text-neon-purple"
                                                    borderColor="group-hover:border-neon-purple/50 border-white/10"
                                                    bgHover="hover:bg-neon-purple/10"
                                                 />
                                             ))}
                                         </div>
                                     </div>
                                 </div>
                             )}

                             {/* SYSTEM TAB */}
                             {activeTab === 'SYSTEM' && (
                                 <div className="space-y-8 animate-fade-in">
                                     <SectionHeader title="诊断与维护" />
                                     
                                     {/* Service Connection */}
                                     <div className="p-6 rounded-2xl border bg-[#111] border-white/5 relative overflow-hidden">
                                          <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-green-500/10 to-transparent pointer-events-none"></div>
                                          <div className="flex items-center justify-between mb-4 relative z-10">
                                              <div className="font-black text-white text-lg tracking-tight flex items-center gap-3">
                                                  <div className="p-2 bg-black border border-white/10 rounded-lg"><Monitor className="w-5 h-5 text-gray-400"/></div>
                                                  DSP 引擎状态
                                              </div>
                                              <div className="text-[10px] font-black uppercase px-3 py-1.5 rounded bg-green-500/10 border border-green-500/30 text-green-400 flex items-center gap-2 shadow-sm">
                                                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
                                                  本地运行
                                              </div>
                                          </div>
                                          <p className="text-xs text-gray-500 font-mono leading-relaxed p-4 bg-black/50 rounded-xl border border-white/5">
                                              NeonFlow 严格在本地运行。节奏和元数据提取利用客户端 GPU/CPU 音频处理途径。
                                          </p>
                                     </div>

                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                         {onRestartTutorial && (
                                             <button 
                                                 onClick={onRestartTutorial}
                                                 className="p-6 bg-[#111] border border-white/5 hover:border-white/30 text-left rounded-2xl transition-all flex flex-col items-start justify-center gap-4 group"
                                             >
                                                 <div className="p-3 bg-black rounded-xl border border-white/10 text-gray-300 group-hover:text-white transition-colors">
                                                     <RefreshCw className="w-6 h-6 group-hover:-rotate-90 transition-transform duration-500"/> 
                                                 </div>
                                                 <div>
                                                    <div className="font-black text-white uppercase tracking-wider mb-1">重置教程</div>
                                                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">清除新手引导标记</div>
                                                 </div>
                                             </button>
                                         )}

                                         {isDebugMode && (
                                             <button 
                                                 onClick={openMetadataDebugger}
                                                 className="p-6 bg-[#111] border border-neon-purple/20 hover:border-neon-purple/50 text-left rounded-2xl transition-all flex flex-col items-start justify-center gap-4 group hover:shadow-[0_0_20px_rgba(181,60,255,0.15)]"
                                             >
                                                 <div className="p-3 bg-black rounded-xl border border-neon-purple/30 text-neon-purple">
                                                     <Bug className="w-6 h-6 group-hover:-translate-y-1 transition-transform"/> 
                                                 </div>
                                                 <div>
                                                    <div className="font-black text-neon-purple uppercase tracking-wider mb-1">元数据调试器</div>
                                                    <div className="text-[10px] text-neon-purple/50 font-bold uppercase tracking-widest">检查原始轨道数据</div>
                                                 </div>
                                             </button>
                                         )}
                                     </div>
                                 </div>
                             )}
                         </div>
                     </div>
                 </div>

                 {/* Footer Actions */}
                 <div className="p-4 md:p-6 border-t border-white/5 bg-black/50 backdrop-blur-xl flex justify-between items-center shrink-0">
                     <div className="text-[9px] font-mono text-gray-600 hidden md:block">
                         所有更改在确认后立即生效
                     </div>
                     <div className="flex gap-3 w-full md:w-auto">
                         <button 
                            onClick={onClose}
                            className="flex-1 md:flex-none px-6 py-4 rounded-xl text-xs font-black uppercase tracking-widest text-gray-400 border border-transparent hover:border-white/10 hover:text-white hover:bg-white/5 transition-colors"
                         >
                             取消
                         </button>
                         <button 
                            onClick={handleSaveSettings}
                            disabled={apiKeyStatus === 'checking'}
                            className="flex-1 md:flex-none px-10 py-4 bg-white text-black text-xs font-black uppercase tracking-widest rounded-xl hover:bg-cyan-400 hover:text-black transition-all shadow-lg hover:shadow-cyan-400/50 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95"
                         >
                             {apiKeyStatus === 'checking' && <Loader2 className="w-4 h-4 animate-spin"/>}
                             确认
                         </button>
                     </div>
                 </div>
             </div>
        </div>
    );
};

const SectionHeader = ({ title, color = "text-gray-400" }: { title: string, color?: string }) => (
    <div className="flex items-center gap-4 mb-6">
        <h3 className={`text-xs font-black ${color} uppercase tracking-[0.3em]`}>
            {title}
        </h3>
        <div className="h-px bg-white/5 flex-1"></div>
    </div>
);

const KeyButton = ({ label, value, onClick, color, borderColor, bgHover }: any) => (
    <button 
        onClick={onClick}
        className={`aspect-square rounded-2xl bg-black border ${borderColor} ${bgHover} transition-all flex flex-col items-center justify-center group relative overflow-hidden active:scale-95 shadow-inner`}
    >
        <span className="text-[8px] md:text-[9px] text-gray-500 font-bold mb-2 group-hover:text-gray-300 tracking-[0.2em]">{label}</span>
        <span className={`font-black text-2xl md:text-3xl uppercase ${color}`}>{value}</span>
        <div className={`absolute bottom-0 left-0 right-0 h-1 bg-current ${color} opacity-20 group-hover:opacity-100 transition-opacity`}></div>
    </button>
);
