
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
    // Hide header in Editing mode as well to use the editor's internal toolbar
    if (status === GameStatus.Playing || status === GameStatus.Countdown || status === GameStatus.Paused || status === GameStatus.Editing) return null;

    const isLibrary = status === GameStatus.Library;

    return (
        <header className="p-4 md:p-6 border-b border-white/5 bg-[#030304]/80 backdrop-blur-xl flex justify-between items-center z-40 sticky top-0 shrink-0">
            <div className="flex items-center gap-3 group" onClick={isLibrary ? undefined : onBack}>
                {isLibrary ? (
                    <div className="relative cursor-pointer" onClick={onTitleClick}>
                        <div className="absolute inset-0 bg-neon-blue blur-lg opacity-20 group-hover:opacity-40 transition-opacity"></div>
                        <Music className="w-7 h-7 md:w-8 md:h-8 relative z-10 transition-colors text-neon-blue" />
                    </div>
                ) : (
                    <button className="group flex items-center justify-center w-10 h-10 rounded-full bg-white/5 border border-white/5 hover:bg-white/10 active:scale-95 transition-all">
                        <ArrowLeft className="w-5 h-5 text-white group-hover:-translate-x-0.5 transition-transform" />
                    </button>
                )}
                
                <div onClick={onTitleClick} className="cursor-default select-none flex items-baseline gap-1">
                    <h1 className="text-xl md:text-2xl font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 group-hover:to-white transition-all">
                        NEON<span style={{ color: isLibrary ? '#00f3ff' : theme.primaryColor }}>FLOW</span>
                    </h1>
                    <span className="text-sm font-black italic text-white/20">2</span>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button 
                    onClick={onSettings} 
                    disabled={status === GameStatus.Analyzing} 
                    className={`p-2.5 md:p-3 rounded-xl transition-all flex items-center gap-2 border ${status === GameStatus.Analyzing ? 'opacity-50 cursor-not-allowed border-transparent bg-transparent text-gray-600' : apiKeyStatus !== 'valid' ? 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20' : 'text-gray-400 border-white/5 hover:text-white hover:bg-white/5'}`} 
                    title="设置"
                >
                    {apiKeyStatus !== 'valid' && status !== GameStatus.Analyzing && <span className="text-xs font-bold hidden md:inline">配置 API</span>}
                    <Settings className="w-5 h-5" />
                </button>
            </div>
        </header>
    );
};
