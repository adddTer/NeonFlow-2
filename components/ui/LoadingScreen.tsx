
import React from 'react';
import { Cpu, RotateCcw, ActivitySquare, Loader2 } from 'lucide-react';

interface LoadingScreenProps {
  text: string;
  subText?: string;
  progress?: number; // 0 - 100
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ text, subText, progress }) => {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0a0a0c] overflow-hidden select-none cursor-wait font-sans">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-[20%] left-[20%] w-[800px] h-[800px] bg-neon-blue/10 rounded-full blur-[150px] mix-blend-screen animate-pulse duration-[4s]"></div>
          <div className="absolute bottom-[20%] right-[20%] w-[600px] h-[600px] bg-neon-purple/5 rounded-full blur-[120px] mix-blend-screen animate-pulse duration-[3s]" style={{ animationDelay: '1.5s' }}></div>
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay"></div>
          
          {/* Tech lines */}
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255, 255, 255, 1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 1) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
          <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-neon-blue/20 shadow-[0_0_15px_rgba(0,243,255,0.5)]"></div>
      </div>

      <div className="relative z-10 flex flex-col items-center w-full max-w-lg px-8">
        
        {/* Central Visual */}
        <div className="relative mb-16">
            {/* Hexagon rotating container */}
            <div className="relative w-32 h-32 flex items-center justify-center animate-[spin_10s_linear_infinite]">
                <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full text-white/5 opacity-50">
                    <polygon points="50 1 95 25 95 75 50 99 5 75 5 25" fill="none" stroke="currentColor" strokeWidth="1" />
                </svg>
                <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full text-neon-blue/30 rotate-180 animate-[pulse_2s_ease-in-out_infinite]">
                    <polygon points="50 1 95 25 95 75 50 99 5 75 5 25" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="10 20" />
                </svg>
            </div>
            
            {/* Inner rotating element */}
            <div className="absolute inset-0 flex items-center justify-center animate-[spin_3s_linear_infinite_reverse]">
                <div className="w-20 h-20 border-2 border-transparent border-t-neon-blue border-b-neon-purple rounded-full"></div>
            </div>
            
            {/* Core Icon */}
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center border border-neon-blue/50">
                    {progress !== undefined ? (
                        <span className="text-sm font-black text-white tabular-nums tracking-tighter">
                            {Math.floor(progress)}
                        </span>
                    ) : (
                        <ActivitySquare className="w-5 h-5 text-neon-blue animate-pulse" />
                    )}
                </div>
            </div>
        </div>

        {/* Typography & Status */}
        <div className="w-full flex flex-col items-center space-y-8">
            <div className="text-center">
                <h2 className="text-3xl font-black text-white tracking-widest uppercase mb-2">
                    {text}
                </h2>
                <div className="text-xs text-neon-blue font-bold tracking-widest uppercase animate-pulse flex items-center justify-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin"/> {subText || "加载中..."}
                </div>
            </div>
            
            {/* Progress Section */}
            <div className="w-full relative">
                {/* HUD Brackets */}
                <div className="absolute -left-4 -top-2 w-2 h-4 border-l-2 border-t-2 border-white/20"></div>
                <div className="absolute -left-4 -bottom-2 w-2 h-4 border-l-2 border-b-2 border-white/20"></div>
                <div className="absolute -right-4 -top-2 w-2 h-4 border-r-2 border-t-2 border-white/20"></div>
                <div className="absolute -right-4 -bottom-2 w-2 h-4 border-r-2 border-b-2 border-white/20"></div>

                {/* Main Bar */}
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/10 relative">
                    {progress !== undefined ? (
                        <>
                            <div 
                                className="absolute inset-y-0 left-0 bg-neon-blue shadow-[0_0_15px_#2dd4bf] transition-all duration-300 ease-out"
                                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                            ></div>
                            <div 
                                className="absolute inset-y-0 left-0 bg-white/50 animate-[loadingLine_1s_infinite_linear]"
                                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                            ></div>
                        </>
                    ) : (
                        <div className="absolute inset-y-0 left-0 h-full w-[30%] bg-neon-blue shadow-[0_0_15px_#2dd4bf] animate-[loadingLine_1.5s_infinite_ease-in-out]"></div>
                    )}
                </div>
            </div>
        </div>
        
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes loadingLine {
          from { transform: translateX(-100%); }
          to { transform: translateX(400%); }
        }
      `}} />
    </div>
  );
};
