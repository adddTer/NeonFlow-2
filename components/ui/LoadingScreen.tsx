
import React from 'react';
import { Loader2, Zap, Radio, Cpu, Layers } from 'lucide-react';

interface LoadingScreenProps {
  text: string;
  subText?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ text, subText }) => {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#030304] overflow-hidden">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 z-0">
          {/* Deep Deep Glows */}
          <div className="absolute top-0 left-1/4 w-[800px] h-[800px] bg-indigo-900/10 rounded-full blur-[160px] animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-900/10 rounded-full blur-[140px] animate-pulse" style={{ animationDelay: '1s' }}></div>
          
          {/* Subtle Scanning Line */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent h-[2px] w-full animate-[scan_4s_linear_infinite]"></div>
          
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-30 mix-blend-overlay"></div>
      </div>

      <div className="relative z-10 flex flex-col items-center max-w-lg w-full p-10">
        
        {/* Holographic Geometric Core */}
        <div className="relative w-40 h-40 mb-12 flex items-center justify-center">
            {/* Outer Rotating HUD - Indigo */}
            <div className="absolute inset-0 border-[1.5px] border-indigo-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-t-[3px] border-indigo-500 rounded-full animate-spin" style={{ animationDuration: '2.5s' }}></div>
            
            {/* Middle Rotating HUD - Violet */}
            <div className="absolute inset-6 border border-white/5 rounded-full"></div>
            <div className="absolute inset-6 border-b-[2px] border-purple-500 rounded-full animate-spin-slow" style={{ animationDirection: 'reverse', animationDuration: '4s' }}></div>

            {/* Inner Static Core */}
            <div className="w-20 h-20 bg-white/[0.03] backdrop-blur-xl rounded-2xl flex items-center justify-center border border-white/10 shadow-[0_0_40px_rgba(99,102,241,0.1)] relative overflow-hidden group rotate-45">
                 <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-purple-500/10 animate-pulse"></div>
                 <div className="-rotate-45 relative z-10">
                    <Cpu className="w-8 h-8 text-indigo-400 animate-pulse" />
                 </div>
            </div>

            {/* Orbiting Satellite Data Points */}
            <div className="absolute w-full h-full animate-spin" style={{ animationDuration: '6s' }}>
                 <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-1.5 h-1.5 bg-indigo-400 rounded-full shadow-[0_0_12px_#818cf8]"></div>
            </div>
            <div className="absolute w-full h-full animate-spin" style={{ animationDuration: '10s', animationDirection: 'reverse' }}>
                 <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 w-1 h-1 bg-purple-400 rounded-full shadow-[0_0_10px_#a855f7]"></div>
            </div>
        </div>

        {/* Text Interface */}
        <div className="text-center space-y-4 relative w-full">
            <div className="flex items-center justify-center gap-2.5">
                 <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></div>
                 <span className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.4em] drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]">初始化系统</span>
            </div>
            
            <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">
                {text}
            </h2>
            
            {/* Elegant Loading Bar */}
            <div className="relative h-[3px] w-full bg-white/5 rounded-full overflow-hidden mt-6 mb-2">
                <div className="absolute inset-y-0 left-0 h-full w-[40%] bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-[loadingLine_1.5s_infinite_ease-in-out]"></div>
            </div>

            {subText && (
                <div className="pt-2">
                    <p className="text-xs text-gray-400 font-medium tracking-wide">
                        <span className="text-indigo-500 font-bold mr-2">LOG:</span>
                        {subText}<span className="animate-blink">_</span>
                    </p>
                </div>
            )}
        </div>
        
        {/* Technical Metadata Footer */}
        <div className="mt-16 w-full grid grid-cols-3 gap-4 border-t border-white/5 pt-6">
            <div className="flex flex-col gap-1">
                <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest">Buffer</span>
                <span className="text-[10px] text-gray-400 font-mono">OK / 1024</span>
            </div>
            <div className="flex flex-col gap-1 items-center">
                <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest">Logic</span>
                <span className="text-[10px] text-gray-400 font-mono">STABLE</span>
            </div>
            <div className="flex flex-col gap-1 items-end">
                <span className="text-[8px] text-gray-500 font-bold uppercase tracking-widest">Render</span>
                <span className="text-[10px] text-gray-400 font-mono">60 FPS</span>
            </div>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes scan {
          from { transform: translateY(-100vh); }
          to { transform: translateY(100vh); }
        }
        @keyframes loadingLine {
          from { left: -50%; }
          to { left: 100%; }
        }
        .animate-blink {
          animation: blink 1s step-end infinite;
        }
        @keyframes blink {
          50% { opacity: 0; }
        }
      `}} />
    </div>
  );
};
