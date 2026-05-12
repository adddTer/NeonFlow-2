
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
        <header className="fixed top-0 left-0 right-0 z-50 p-6 md:p-8 pointer-events-none">
            <div className="w-full flex justify-between items-start">
                
                {/* Logo / Back Section */}
                <div 
                    className={`flex items-center gap-4 bg-black/50 backdrop-blur-2xl border border-white/10 px-6 py-3 rounded-2xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] pointer-events-auto transition-all group pr-8`}
                >
                    {isLibrary ? (
                        <div className="relative flex items-center justify-center bg-white/5 w-10 h-10 rounded-xl cursor-pointer" onClick={onTitleClick}>
                            <div className="absolute inset-0 bg-neon-blue blur-md opacity-20 group-hover:opacity-50 transition-opacity animate-pulse"></div>
                            <Music className="w-5 h-5 text-neon-blue relative z-10" />
                        </div>
                    ) : (
                        <button onClick={onBack} className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 transition-all cursor-pointer">
                            <ArrowLeft className="w-5 h-5 text-white group-hover:-translate-x-1 transition-transform" />
                        </button>
                    )}
                    
                    <div onClick={onTitleClick} className="flex flex-col select-none cursor-pointer">
                        <div className="flex items-baseline gap-1.5">
                            <span className="font-black text-white tracking-[0.2em] text-lg leading-none">NEON</span>
                            <span className="font-bold text-gray-500 tracking-[0.2em] text-lg leading-none" style={{ color: isLibrary ? undefined : theme.primaryColor }}>FLOW</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-black text-neon-purple/90 tracking-widest bg-neon-purple/20 px-1.5 py-0.5 rounded uppercase">V2</span>
                        </div>
                    </div>
                </div>

                {/* Settings & Status */}
                <div className="flex gap-4 items-center">
                    <button 
                        onClick={onSettings} 
                        disabled={status === GameStatus.Analyzing} 
                        className={`pointer-events-auto w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-2xl border
                            ${status === GameStatus.Analyzing 
                                ? 'opacity-50 cursor-not-allowed bg-black/20 border-white/5 text-gray-500' 
                                : 'bg-black/50 border-white/10 text-gray-400 hover:text-white hover:bg-black/80 hover:border-white/30 hover:shadow-[0_0_30px_rgba(255,255,255,0.1)]'
                            }`}
                        title="系统设置"
                    >
                        <Settings className="w-6 h-6 transition-transform duration-500 group-hover:rotate-180" />
                    </button>
                </div>
            </div>
        </header>
    );
};
