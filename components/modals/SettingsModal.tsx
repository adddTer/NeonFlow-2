
import React, { useState } from 'react';
import { Settings, X, Keyboard, Volume2, Gauge, Bug, Check, Loader2, AlertTriangle, Key, Monitor, Gamepad2, MousePointer2, RefreshCw } from 'lucide-react';
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
    onRestartTutorial?: () => void; // New Prop
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
    onRestartTutorial
}) => {
    
    const [activeTab, setActiveTab] = useState<SettingsTab>('GAMEPLAY');

    const TabButton = ({ id, icon: Icon, label }: { id: SettingsTab, icon: any, label: string }) => (
        <button 
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-3 md:py-4 md:px-6 rounded-xl text-xs md:text-sm font-bold transition-all whitespace-nowrap
                ${activeTab === id 
                    ? 'bg-white text-black shadow-lg scale-[1.02]' 
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
        >
            <Icon className={`w-4 h-4 md:w-5 md:h-5 ${activeTab === id ? 'text-black' : 'text-current'}`} />
            {label}
        </button>
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-0 md:p-4 animate-fade-in">
             <div className="bg-[#0f172a] md:border border-white/20 md:rounded-3xl w-full max-w-4xl h-full md:h-[85vh] shadow-2xl relative flex flex-col overflow-hidden">
                 
                 {/* Header */}
                 <div className="flex items-center justify-between p-4 md:p-6 border-b border-white/5 bg-[#0a0a0a] shrink-0">
                    <h2 className="text-lg md:text-xl font-black text-white flex items-center gap-3 uppercase tracking-wider">
                        <div className="p-2 bg-neon-blue/10 rounded-lg">
                            <Settings className="w-5 h-5 text-neon-blue" />
                        </div>
                        设置
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-2 bg-white/5 rounded-full hover:bg-white/10 active:scale-95">
                        <X className="w-5 h-5" />
                    </button>
                 </div>

                 {/* Body Layout */}
                 <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                     
                     {/* Navigation (Top on Mobile, Left on Desktop) */}
                     <div className="w-full md:w-64 bg-[#050505] border-b md:border-b-0 md:border-r border-white/5 flex flex-row md:flex-col p-2 md:p-4 gap-2 overflow-x-auto md:overflow-y-auto shrink-0 hide-scrollbar">
                         <TabButton id="GAMEPLAY" icon={Gauge} label="游戏体验" />
                         <TabButton id="CONTROLS" icon={Gamepad2} label="键位控制" />
                         <TabButton id="SYSTEM" icon={Monitor} label="系统 & API" />
                     </div>

                     {/* Content Area */}
                     <div className="flex-1 bg-[#0f172a] p-4 md:p-8 overflow-y-auto custom-scrollbar relative">
                         
                         {/* Rebinding Overlay */}
                         {rebindingKey && (
                             <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center animate-fade-in text-center p-6 rounded-xl">
                                 <Keyboard className="w-16 h-16 text-neon-blue mb-6 animate-bounce" />
                                 <h3 className="text-2xl font-black text-white mb-2 uppercase tracking-widest">输入新按键</h3>
                                 <p className="text-gray-400 text-sm mb-8 font-mono bg-white/5 px-4 py-2 rounded-lg">按下键盘任意键以绑定...</p>
                                 <button onClick={() => setRebindingKey(null)} className="px-8 py-3 bg-white/10 rounded-full hover:bg-white/20 text-sm font-bold text-white transition-colors border border-white/10">取消</button>
                             </div>
                         )}

                         <div className="max-w-2xl mx-auto space-y-8 pb-20 md:pb-0">
                             
                             {/* GAMEPLAY TAB */}
                             {activeTab === 'GAMEPLAY' && (
                                 <div className="space-y-6 animate-fade-in">
                                     <SectionHeader title="基础设置" />
                                     
                                     {/* Speed Control */}
                                     <div className="bg-white/5 border border-white/5 rounded-2xl p-6 transition-all hover:bg-white/[0.07]">
                                         <div className="flex justify-between items-center mb-6">
                                              <div className="flex items-center gap-3">
                                                  <div className="p-2 bg-neon-blue/20 rounded-lg text-neon-blue"><Gauge className="w-5 h-5" /></div>
                                                  <div>
                                                      <div className="font-bold text-white">下落速度</div>
                                                      <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Scroll Speed</div>
                                                  </div>
                                              </div>
                                              <div className="text-neon-blue font-black font-mono text-2xl">{scrollSpeed.toFixed(1)}</div>
                                         </div>
                                         
                                         <div className="relative h-12 flex items-center">
                                            <input 
                                                type="range" 
                                                min="1.0" 
                                                max="10.0" 
                                                step="0.1"
                                                value={scrollSpeed}
                                                onChange={(e) => setScrollSpeed(Number(e.target.value))}
                                                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-neon-blue hover:accent-white transition-all"
                                            />
                                         </div>
                                         <div className="flex justify-between text-[10px] text-gray-500 font-bold tracking-widest font-mono">
                                             <span>1.0 (SLOW)</span>
                                             <span>10.0 (FAST)</span>
                                         </div>
                                     </div>

                                     {/* Audio Calibration */}
                                     <div className="bg-white/5 border border-white/5 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all hover:bg-white/[0.07]">
                                         <div className="flex items-center gap-3">
                                             <div className="p-2 bg-neon-purple/20 rounded-lg text-neon-purple"><Volume2 className="w-5 h-5" /></div>
                                             <div>
                                                 <div className="font-bold text-white">音频延迟校准</div>
                                                 <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Global Offset</div>
                                             </div>
                                         </div>
                                         <div className="flex items-center gap-4 w-full md:w-auto">
                                             <div className="bg-black/40 px-3 py-1.5 rounded-lg border border-white/10 font-mono text-xs text-gray-300">
                                                 {audioOffset > 0 ? `+${audioOffset}` : audioOffset}ms
                                             </div>
                                             <button 
                                                 onClick={openCalibration}
                                                 className="flex-1 md:flex-none px-5 py-2.5 bg-white text-black text-xs font-black uppercase tracking-wider rounded-xl hover:bg-neon-purple hover:text-white transition-all shadow-lg active:scale-95"
                                             >
                                                 进入校准
                                             </button>
                                         </div>
                                     </div>
                                 </div>
                             )}

                             {/* CONTROLS TAB */}
                             {activeTab === 'CONTROLS' && (
                                 <div className="space-y-8 animate-fade-in">
                                     <SectionHeader title="键位配置" />
                                     
                                     {/* 4K Config */}
                                     <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
                                         <div className="flex items-center gap-2 mb-4">
                                             <div className="w-1.5 h-6 bg-neon-blue rounded-full"></div>
                                             <span className="text-sm font-black text-white uppercase tracking-wider">4 Key Mode</span>
                                         </div>
                                         <div className="grid grid-cols-4 gap-3 md:gap-4">
                                             {keyConfig.k4.map((k, i) => (
                                                 <KeyButton 
                                                    key={i} 
                                                    label={`LANE ${i+1}`} 
                                                    value={k} 
                                                    onClick={() => setRebindingKey({mode: 4, index: i})} 
                                                    color="text-neon-blue"
                                                    borderColor="group-hover:border-neon-blue"
                                                 />
                                             ))}
                                         </div>
                                     </div>

                                     {/* 6K Config */}
                                     <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
                                         <div className="flex items-center gap-2 mb-4">
                                             <div className="w-1.5 h-6 bg-neon-purple rounded-full"></div>
                                             <span className="text-sm font-black text-white uppercase tracking-wider">6 Key Mode</span>
                                         </div>
                                         <div className="grid grid-cols-6 gap-2 md:gap-3">
                                             {keyConfig.k6.map((k, i) => (
                                                 <KeyButton 
                                                    key={i} 
                                                    label={`L${i+1}`} 
                                                    value={k} 
                                                    onClick={() => setRebindingKey({mode: 6, index: i})} 
                                                    color="text-neon-purple"
                                                    borderColor="group-hover:border-neon-purple"
                                                 />
                                             ))}
                                         </div>
                                     </div>
                                 </div>
                             )}

                             {/* SYSTEM TAB */}
                             {activeTab === 'SYSTEM' && (
                                 <div className="space-y-6 animate-fade-in">
                                     <SectionHeader title="服务连接" />
                                     
                                     {/* API Status */}
                                     <div className={`p-6 rounded-2xl border transition-all ${apiKeyStatus === 'valid' ? 'bg-green-500/5 border-green-500/20' : apiKeyStatus === 'invalid' ? 'bg-red-500/5 border-red-500/20' : 'bg-white/5 border-white/10'}`}>
                                          <div className="flex items-center justify-between mb-2">
                                              <div className="font-bold text-white flex items-center gap-2">
                                                  <div className={`w-2 h-2 rounded-full ${apiKeyStatus === 'valid' ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : apiKeyStatus === 'checking' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></div>
                                                  Gemini AI Service
                                              </div>
                                              <div className={`text-xs font-bold uppercase px-2 py-1 rounded bg-black/20 ${apiKeyStatus === 'valid' ? 'text-green-400' : apiKeyStatus === 'invalid' ? 'text-red-400' : 'text-gray-400'}`}>
                                                  {apiKeyStatus === 'valid' ? 'ONLINE' : apiKeyStatus === 'checking' ? 'CHECKING...' : apiKeyStatus === 'invalid' ? 'ERROR' : 'OFFLINE'}
                                              </div>
                                          </div>
                                          <p className="text-xs text-gray-500 leading-relaxed pl-4 border-l-2 border-white/5">
                                              NeonFlow 2 使用 <strong>gemini-3-flash-preview</strong> 模型进行实时谱面生成与分析。请确保您的 API Key 有效且支持该模型。
                                          </p>
                                     </div>

                                     <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
                                         <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">API Configuration</label>
                                         <div className="relative group">
                                             <input 
                                                 type="password" 
                                                 value={customApiKey}
                                                 onChange={(e) => setCustomApiKey(e.target.value)}
                                                 placeholder={hasEnvKey ? "已通过环境变量配置 (可覆盖)" : "在此粘贴您的 API Key (AIza...)"}
                                                 className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white text-sm focus:border-neon-blue focus:ring-1 focus:ring-neon-blue transition-all outline-none font-mono placeholder:text-gray-600 group-hover:bg-black/60"
                                             />
                                             <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5 group-focus-within:text-neon-blue transition-colors" />
                                         </div>
                                         {validationError && (
                                              <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                                                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                                  <p className="text-xs text-red-300 font-medium">{validationError}</p>
                                              </div>
                                         )}
                                     </div>

                                     <div className="border-t border-white/5 pt-6 space-y-4">
                                         <SectionHeader title="其他选项" />
                                         
                                         {onRestartTutorial && (
                                             <button 
                                                 onClick={onRestartTutorial}
                                                 className="w-full py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 group uppercase tracking-wide"
                                             >
                                                 <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform"/> 
                                                 重置新手引导
                                             </button>
                                         )}

                                         {isDebugMode && (
                                             <button 
                                                 onClick={openMetadataDebugger}
                                                 className="w-full py-4 bg-neon-purple/5 border border-neon-purple/20 hover:bg-neon-purple/10 text-neon-purple text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 group"
                                             >
                                                 <Bug className="w-4 h-4 group-hover:rotate-12 transition-transform"/> 
                                                 启动元数据调试器
                                             </button>
                                         )}
                                     </div>
                                 </div>
                             )}
                         </div>
                     </div>
                 </div>

                 {/* Footer Actions */}
                 <div className="p-4 md:p-6 border-t border-white/5 bg-[#0a0a0a] flex justify-end gap-3 shrink-0">
                     <button 
                        onClick={onClose}
                        className="px-6 py-3 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                     >
                         取消
                     </button>
                     <button 
                        onClick={handleSaveSettings}
                        disabled={apiKeyStatus === 'checking'}
                        className="px-8 py-3 bg-white text-black text-xs font-black uppercase tracking-wider rounded-xl hover:bg-neon-blue hover:text-black transition-all shadow-lg disabled:opacity-50 flex items-center gap-2 active:scale-95"
                     >
                         {apiKeyStatus === 'checking' && <Loader2 className="w-3 h-3 animate-spin"/>}
                         保存更改
                     </button>
                 </div>
             </div>
        </div>
    );
};

const SectionHeader = ({ title, color = "text-gray-500" }: { title: string, color?: string }) => (
    <h3 className={`text-xs font-black ${color} uppercase tracking-widest border-b border-white/5 pb-2 mb-4`}>
        {title}
    </h3>
);

const KeyButton = ({ label, value, onClick, color, borderColor }: any) => (
    <button 
        onClick={onClick}
        className={`aspect-square rounded-xl bg-black/40 border border-white/10 hover:bg-white/5 transition-all flex flex-col items-center justify-center group relative overflow-hidden active:scale-95 ${borderColor}`}
    >
        <span className="text-[9px] md:text-[10px] text-gray-600 font-bold mb-1 group-hover:text-gray-400">{label}</span>
        <span className={`font-black text-xl md:text-2xl uppercase ${color}`}>{value}</span>
        <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity bg-current ${color}`}></div>
    </button>
);
