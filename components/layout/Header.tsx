
import React from 'react';
import { Music, Settings, ArrowLeft } from 'lucide-react';
import { GameStatus, AITheme } from '../../types';

interface HeaderProps {
    status: GameStatus;
    theme: AITheme;
    apiKeyStatus: string;
    onBack: () => void;
    onSettings: () => void;
    onTitleClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
    status, theme, apiKeyStatus, onBack, onSettings, onTitleClick 
}) => {
    // Hide header in Editing/Playing modes to use their internal HUDs
    if (status === GameStatus.Playing || status === GameStatus.Countdown || status === GameStatus.Paused || status === GameStatus.Editing) return null;

    const isLibrary = status === GameStatus.Library;

    return (
        <header className="fixed top-0 left-0 right-0 z-50 p-4 md:p-6 pointer-events-none">
            <div className="max-w-7xl mx-auto flex justify-between items-start">
                
                {/* Logo / Back Section */}
                <div 
                    className="flex items-center gap-3 bg-black/40 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-full shadow-2xl pointer-events-auto cursor-pointer hover:bg-black/60 hover:border-white/20 transition-all group"
                    onClick={isLibrary ? undefined : onBack}
                >
                    {isLibrary ? (
                        <div className="relative" onClick={onTitleClick}>
                            <div className="absolute inset-0 bg-neon-blue blur-md opacity-20 group-hover:opacity-50 transition-opacity animate-pulse"></div>
                            <Music className="w-5 h-5 text-neon-blue relative z-10" />
                        </div>
                    ) : (
                        <button className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 transition-all">
                            <ArrowLeft className="w-4 h-4 text-white group-hover:-translate-x-0.5 transition-transform" />
                        </button>
                    )}
                    
                    <div onClick={onTitleClick} className="flex items-baseline gap-1 select-none">
                        <span className="font-black text-white tracking-widest text-sm">NEON</span>
                        <span className="font-light text-gray-400 tracking-wider text-sm" style={{ color: isLibrary ? undefined : theme.primaryColor }}>FLOW</span>
                        <span className="text-[9px] font-black text-neon-purple/80 ml-1 border border-neon-purple/30 px-1 rounded">V2</span>
                    </div>
                </div>

                {/* Settings & Status */}
                <div className="flex gap-2">
                    {/* API Status Indicator (Only show if issue or analyzing) */}
                    {apiKeyStatus !== 'valid' && status !== GameStatus.Analyzing && (
                        <div className="pointer-events-auto bg-red-500/10 backdrop-blur-md border border-red-500/30 px-3 py-2 rounded-full flex items-center gap-2 animate-pulse">
                            <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_#ef4444]"></div>
                            <span className="text-[10px] font-bold text-red-400 hidden md:inline">API 未连接</span>
                        </div>
                    )}

                    <button 
                        onClick={onSettings} 
                        disabled={status === GameStatus.Analyzing} 
                        className={`pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-xl backdrop-blur-md border
                            ${status === GameStatus.Analyzing 
                                ? 'opacity-50 cursor-not-allowed bg-black/20 border-white/5 text-gray-500' 
                                : 'bg-black/40 border-white/10 text-gray-300 hover:text-white hover:bg-black/60 hover:border-neon-blue/50 hover:shadow-[0_0_15px_rgba(0,243,255,0.2)]'
                            }`}
                        title="系统设置"
                    >
                        <Settings className="w-5 h-5 transition-transform group-hover:rotate-90" />
                    </button>
                </div>
            </div>
        </header>
    );
};
