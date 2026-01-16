
import React from 'react';
import { Cpu } from 'lucide-react';

interface LoadingScreenProps {
  text: string;
  subText?: string;
  progress?: number; // 0 - 100
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ text, subText, progress }) => {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#030304] overflow-hidden select-none cursor-wait">
      
      {/* Background Ambience */}
      <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute top-[-10%] left-[20%] w-[1000px] h-[1000px] bg-indigo-900/10 rounded-full blur-[180px] animate-pulse"></div>
          <div className="absolute bottom-[-10%] right-[20%] w-[800px] h-[800px] bg-purple-900/10 rounded-full blur-[160px] animate-pulse" style={{ animationDelay: '1.5s' }}></div>
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-30 mix-blend-overlay"></div>
      </div>

      <div className="relative z-10 flex flex-col items-center w-full max-w-md px-8">
        
        {/* Central Visual */}
        <div className="relative mb-16 group">
            {/* Outer Rings */}
            <div className="absolute inset-[-20px] border border-white/5 rounded-full animate-[spin_8s_linear_infinite]"></div>
            <div className="absolute inset-[-10px] border border-white/5 rounded-full animate-[spin_5s_linear_infinite_reverse]"></div>
            
            {/* Main Spinner */}
            <div className="relative w-24 h-24 flex items-center justify-center">
                <div className="absolute inset-0 border-2 border-white/10 rounded-full"></div>
                <div className="absolute inset-0 border-t-2 border-indigo-500 rounded-full animate-spin" style={{ animationDuration: '1.5s' }}></div>
                
                {/* Core Icon */}
                <div className="absolute inset-0 flex items-center justify-center animate-pulse">
                    <Cpu className="w-8 h-8 text-indigo-400 drop-shadow-[0_0_15px_rgba(99,102,241,0.6)]" />
                </div>
            </div>
        </div>

        {/* Typography & Status */}
        <div className="w-full flex flex-col items-center space-y-6">
            <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic drop-shadow-2xl">
                {text}
            </h2>
            
            {/* Progress Section */}
            <div className="w-full space-y-3">
                {/* Bar */}
                <div className="relative h-[2px] w-full bg-white/10 rounded-full overflow-hidden">
                    {progress !== undefined ? (
                        <div 
                            className="absolute inset-y-0 left-0 h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 transition-all duration-300 ease-out shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                        >
                            <div className="absolute inset-0 bg-white/50 animate-[loadingLine_1s_infinite_linear]"></div>
                        </div>
                    ) : (
                        <div className="absolute inset-y-0 left-0 h-full w-[40%] bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-[loadingLine_1.5s_infinite_ease-in-out]"></div>
                    )}
                </div>

                {/* Meta Info */}
                <div className="flex justify-between items-baseline px-1">
                    <span className="text-[10px] text-gray-400 font-mono font-bold tracking-widest uppercase animate-pulse">
                        {subText || "PROCESSING..."}
                    </span>
                    {progress !== undefined && (
                        <span className="text-xl font-black text-indigo-400 font-mono tabular-nums leading-none tracking-tighter">
                            {Math.floor(progress).toString().padStart(2, '0')}<span className="text-xs align-top opacity-50">%</span>
                        </span>
                    )}
                </div>
            </div>
        </div>
        
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes loadingLine {
          from { left: -50%; }
          to { left: 100%; }
        }
      `}} />
    </div>
  );
};
