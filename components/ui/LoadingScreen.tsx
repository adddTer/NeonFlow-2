
import React from 'react';
import { Loader2, Zap, Radio } from 'lucide-react';

interface LoadingScreenProps {
  text: string;
  subText?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ text, subText }) => {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#050505] overflow-hidden">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 z-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-neon-blue/10 rounded-full blur-[120px] animate-pulse"></div>
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
          {/* Grid lines removed as requested */}
      </div>

      <div className="relative z-10 flex flex-col items-center max-w-md w-full p-8">
        
        {/* Holographic Spinner Container */}
        <div className="relative w-32 h-32 mb-10 flex items-center justify-center">
            {/* Outer Ring */}
            <div className="absolute inset-0 border-2 border-white/5 rounded-full"></div>
            <div className="absolute inset-0 border-t-2 border-neon-blue/50 rounded-full animate-spin" style={{ animationDuration: '3s' }}></div>
            
            {/* Middle Ring */}
            <div className="absolute inset-4 border border-white/10 rounded-full"></div>
            <div className="absolute inset-4 border-b-2 border-neon-purple/50 rounded-full animate-spin-slow" style={{ animationDirection: 'reverse' }}></div>

            {/* Core */}
            <div className="w-16 h-16 bg-white/5 backdrop-blur-md rounded-full flex items-center justify-center border border-white/10 shadow-[0_0_30px_rgba(0,243,255,0.15)] relative overflow-hidden group">
                 <div className="absolute inset-0 bg-gradient-to-tr from-neon-blue/20 to-neon-purple/20 animate-pulse"></div>
                 <Zap className="w-6 h-6 text-white relative z-10 animate-pulse-fast" />
            </div>

            {/* Orbiting Particles */}
            <div className="absolute w-full h-full animate-spin" style={{ animationDuration: '8s' }}>
                 <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-2 h-2 bg-neon-blue rounded-full shadow-[0_0_10px_#00f3ff]"></div>
            </div>
        </div>

        {/* Text HUD */}
        <div className="text-center space-y-3 relative">
            <div className="flex items-center justify-center gap-2 mb-2">
                 <Radio className="w-4 h-4 text-neon-blue animate-pulse" />
                 <span className="text-[10px] font-bold text-neon-blue uppercase tracking-[0.3em]">Processing</span>
            </div>
            
            <h2 className="text-3xl font-black text-white tracking-wider uppercase drop-shadow-lg">
                {text}
            </h2>
            
            {/* Scrolling decorative text line */}
            <div className="h-px w-full bg-gradient-to-r from-transparent via-white/20 to-transparent my-4"></div>

            {subText && (
                <div className="bg-white/5 border border-white/10 px-4 py-2 rounded-lg backdrop-blur-sm">
                    <p className="text-xs md:text-sm text-gray-300 font-mono tracking-wide">
                        {'>'} {subText}<span className="animate-blink">_</span>
                    </p>
                </div>
            )}
        </div>

        {/* Loading Bar */}
        <div className="w-full h-1 bg-white/10 rounded-full mt-8 overflow-hidden relative">
            <div className="absolute inset-y-0 left-0 h-full w-full bg-gradient-to-r from-transparent via-neon-blue to-transparent w-[50%] animate-[shimmer_2s_infinite]"></div>
        </div>
        
        <div className="mt-2 w-full flex justify-between text-[8px] text-gray-600 font-mono uppercase">
            <span>System: Online</span>
            <span>Memory: Allocating</span>
            <span>Ver: 2.0</span>
        </div>

      </div>
    </div>
  );
};
