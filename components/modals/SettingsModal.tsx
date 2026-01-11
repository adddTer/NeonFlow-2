
import React from 'react';
import { Settings, X, Keyboard, ShieldAlert, Volume2, Gauge, Bug, Check, Loader2, AlertTriangle, Key } from 'lucide-react';
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
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
    onClose, scrollSpeed, setScrollSpeed,
    keyConfig, setKeyConfig,
    audioOffset, openCalibration,
    isDebugMode, openMetadataDebugger,
    apiKeyStatus, customApiKey, setCustomApiKey,
    handleSaveSettings, validationError,
    rebindingKey, setRebindingKey, hasEnvKey
}) => {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
             <div className="bg-[#0f172a] border border-white/20 rounded-3xl p-6 w-full max-w-md shadow-2xl relative max-h-[85vh] overflow-y-auto custom-scrollbar flex flex-col">
                 <div className="flex items-center justify-between mb-6 shrink-0">
                    <h2 className="text-2xl font-black flex items-center gap-3">
                        <Settings className="w-6 h-6 text-neon-blue" />
                        设置
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-2 bg-white/5 rounded-full">
                        <X className="w-5 h-5" />
                    </button>
                 </div>
                 
                 {/* Rebinding Overlay */}
                 {rebindingKey && (
                     <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center rounded-3xl backdrop-blur-sm animate-fade-in p-6 text-center">
                         <Keyboard className="w-12 h-12 text-neon-blue mb-4 animate-bounce" />
                         <h3 className="text-xl font-bold text-white mb-2">输入按键</h3>
                         <p className="text-gray-400 text-sm mb-6">请按下键盘任意键以绑定该轨道...</p>
                         <button onClick={() => setRebindingKey(null)} className="px-6 py-2 bg-white/10 rounded-full hover:bg-white/20 text-sm">取消</button>
                     </div>
                 )}

                 <div className="mb-6 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-xs text-blue-200 flex items-start gap-2 shrink-0">
                     <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                     <span>本应用仅支持 Google Gemini API。请确保您的 API Key 有效且具有 gemini-3-flash-preview 模型访问权限。</span>
                 </div>

                 <div className="space-y-6 pb-2">
                    {/* Audio Calibration */}
                    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between">
                        <div>
                            <div className="font-bold text-sm text-white">音频延迟校准</div>
                            <div className="text-xs text-gray-400 mt-1">当前偏移: {audioOffset > 0 ? `+${audioOffset}` : audioOffset}ms</div>
                        </div>
                        <button 
                            onClick={openCalibration}
                            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
                        >
                            <Volume2 className="w-3.5 h-3.5" />
                            校准
                        </button>
                    </div>

                    {/* Scroll Speed Slider */}
                    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                        <div className="flex justify-between items-center">
                             <div className="font-bold text-sm text-white flex items-center gap-2">
                                 <Gauge className="w-4 h-4 text-neon-blue" />
                                 下落速度
                             </div>
                             <div className="text-neon-blue font-black font-mono text-lg">{scrollSpeed.toFixed(1)}</div>
                        </div>
                        <input 
                            type="range" 
                            min="1.0" 
                            max="10.0" 
                            step="0.1"
                            value={scrollSpeed}
                            onChange={(e) => setScrollSpeed(Number(e.target.value))}
                            className="w-full accent-neon-blue h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-gray-500 font-bold tracking-widest">
                            <span>SLOW</span>
                            <span>FAST</span>
                        </div>
                    </div>

                    {/* Key Bindings */}
                    <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-4">
                        <div className="font-bold text-sm text-white flex items-center gap-2 border-b border-white/5 pb-2">
                            <Keyboard className="w-4 h-4 text-neon-blue" />
                            键位配置
                        </div>
                        
                        {/* 4K Bindings */}
                        <div className="space-y-2">
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">4道模式</div>
                            <div className="grid grid-cols-4 gap-2">
                                {keyConfig.k4.map((k, i) => (
                                    <button 
                                        key={i}
                                        onClick={() => setRebindingKey({mode: 4, index: i})}
                                        className="aspect-square rounded-xl bg-black/40 border border-white/10 hover:border-neon-blue hover:text-neon-blue transition-all flex items-center justify-center font-black text-lg uppercase"
                                    >
                                        {k}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 6K Bindings */}
                        <div className="space-y-2">
                            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">6道模式</div>
                            <div className="grid grid-cols-6 gap-2">
                                {keyConfig.k6.map((k, i) => (
                                    <button 
                                        key={i}
                                        onClick={() => setRebindingKey({mode: 6, index: i})}
                                        className="aspect-square rounded-xl bg-black/40 border border-white/10 hover:border-neon-blue hover:text-neon-blue transition-all flex items-center justify-center font-black text-lg uppercase"
                                    >
                                        {k}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* DEBUG TOOLS */}
                    {isDebugMode && (
                        <div className="p-4 bg-neon-purple/10 border border-neon-purple/20 rounded-2xl flex items-center justify-between">
                            <div>
                                <div className="font-bold text-sm text-neon-purple flex items-center gap-1.5">
                                    <Bug className="w-3.5 h-3.5"/> 调试工具
                                </div>
                                <div className="text-xs text-gray-400 mt-1">仅 DEV 模式下可见</div>
                            </div>
                            <button 
                                onClick={openMetadataDebugger}
                                className="px-4 py-2 bg-neon-purple/20 hover:bg-neon-purple/30 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-2"
                            >
                                封面解析测试
                            </button>
                        </div>
                    )}

                    <div className={`p-4 rounded-2xl border flex items-center justify-between ${apiKeyStatus === 'valid' ? 'bg-green-500/10 border-green-500/20' : apiKeyStatus === 'invalid' ? 'bg-red-500/10 border-red-500/20' : 'bg-gray-800/50 border-white/10'}`}>
                         <span className="font-bold text-sm text-gray-200">API 状态</span>
                         {apiKeyStatus === 'valid' ? (
                            <span className="flex items-center gap-1.5 text-green-400 font-bold text-xs uppercase">
                                <Check className="w-3.5 h-3.5"/> 已连接
                            </span>
                         ) : apiKeyStatus === 'checking' ? (
                            <span className="flex items-center gap-1.5 text-yellow-400 font-bold text-xs uppercase">
                                <Loader2 className="w-3.5 h-3.5 animate-spin"/> 验证中...
                            </span>
                         ) : apiKeyStatus === 'invalid' ? (
                            <span className="flex items-center gap-1.5 text-red-400 font-bold text-xs uppercase">
                                <AlertTriangle className="w-3.5 h-3.5"/> 错误
                            </span>
                         ) : (
                            <span className="flex items-center gap-1.5 text-gray-400 font-bold text-xs uppercase">
                                未配置
                            </span>
                         )}
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">Gemini API Key</label>
                        <div className="relative">
                            <input 
                                type="password" 
                                value={customApiKey}
                                onChange={(e) => {
                                    setCustomApiKey(e.target.value);
                                }}
                                placeholder={hasEnvKey ? "已配置环境变量" : "在此粘贴 API Key"}
                                className="w-full bg-black/30 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm focus:border-neon-blue focus:ring-1 focus:ring-neon-blue transition-all outline-none"
                            />
                            <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
                        </div>
                        {validationError && (
                             <p className="text-[10px] text-red-400 mt-1">{validationError}</p>
                        )}
                        <p className="text-[10px] text-gray-600 leading-relaxed">
                            您的 Key 仅存储在本地浏览器中。如果验证失败，请检查网络连接或 Key 权限。
                        </p>
                    </div>

                    <div className="pt-4">
                        <button 
                            onClick={handleSaveSettings}
                            disabled={apiKeyStatus === 'checking'}
                            className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {apiKeyStatus === 'checking' ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin"/> 验证中...
                                </>
                            ) : (
                                "保存并验证"
                            )}
                        </button>
                    </div>
                 </div>
             </div>
        </div>
    );
};
