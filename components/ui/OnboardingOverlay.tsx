
import React, { useState } from 'react';
import { X, Music, BrainCircuit, Play, Settings, ArrowRight, Upload, Key, Disc, FileAudio, CheckCircle2 } from 'lucide-react';

interface OnboardingOverlayProps {
    onComplete: () => void;
}

export const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({ onComplete }) => {
    const [step, setStep] = useState(0);

    // --- Visual Components ---

    const WelcomeVisual = () => (
        <div className="relative w-40 h-40 flex items-center justify-center animate-fade-in">
            <div className="absolute inset-0 bg-neon-blue/20 rounded-full blur-2xl animate-pulse"></div>
            <div className="w-32 h-32 rounded-full border-4 border-white/10 flex items-center justify-center bg-black/60 animate-[spin_10s_linear_infinite] shadow-2xl relative z-10">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-white/10 to-transparent border border-white/5"></div>
                <div className="absolute inset-0 rounded-full border border-white/5 scale-90"></div>
                <div className="absolute inset-0 rounded-full border border-white/5 scale-75"></div>
            </div>
            <Music className="absolute w-12 h-12 text-white drop-shadow-[0_0_15px_rgba(0,243,255,0.8)] z-20 animate-float" />
            <div className="absolute -bottom-4 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-[10px] font-black uppercase tracking-widest text-white shadow-lg">
                V2.0
            </div>
        </div>
    );

    const ImportVisual = () => (
        <div className="relative w-full max-w-[240px] aspect-[16/10] bg-[#0a0a0a] rounded-xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-3 overflow-hidden group hover:border-neon-blue/50 transition-colors cursor-default">
            <div className="absolute inset-0 bg-gradient-to-br from-neon-blue/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            
            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6 text-gray-400 group-hover:text-neon-blue transition-colors" />
            </div>
            
            <div className="flex flex-col items-center gap-1 relative z-10">
                <div className="text-xs font-bold text-gray-300 group-hover:text-white">拖入音频文件</div>
                <div className="flex gap-2">
                    <span className="text-[9px] px-1.5 py-0.5 bg-white/5 rounded text-gray-500 font-mono">.MP3</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-white/5 rounded text-gray-500 font-mono">.FLAC</span>
                </div>
            </div>

            {/* Floating particles */}
            <div className="absolute top-2 left-4 w-1 h-1 bg-white/20 rounded-full animate-pulse"></div>
            <div className="absolute bottom-4 right-6 w-1 h-1 bg-white/20 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
        </div>
    );

    const AiVisual = () => (
        <div className="relative w-full max-w-[240px] flex flex-col items-center gap-4">
            <div className="flex items-end justify-center gap-1 h-16 w-full px-8">
                {[...Array(12)].map((_, i) => (
                    <div 
                        key={i} 
                        className="w-2 bg-gradient-to-t from-neon-purple to-purple-900/50 rounded-full"
                        style={{ 
                            height: '40%',
                            animation: `equalizer 0.8s ease-in-out infinite`,
                            animationDelay: `${i * 0.05}s`
                        }}
                    ></div>
                ))}
            </div>
            <div className="flex items-center gap-3 bg-neon-purple/10 px-4 py-2 rounded-full border border-neon-purple/20">
                <BrainCircuit className="w-4 h-4 text-neon-purple animate-pulse" />
                <span className="text-[10px] font-bold text-neon-purple uppercase tracking-wider">Analysis Active</span>
            </div>
        </div>
    );

    const PerformanceVisual = () => (
        <div className="w-full max-w-[260px] bg-[#050505] rounded-xl border border-white/10 p-4 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-neon-blue via-purple-500 to-neon-blue"></div>
            
            <div className="space-y-3">
                <div className="flex justify-between items-center">
                    <div className="text-[10px] font-bold text-gray-500 uppercase">Engine Status</div>
                    <BrainCircuit className="w-3 h-3 text-gray-600" />
                </div>
                
                <div className="space-y-1">
                    <label className="text-[10px] text-gray-400 font-bold block">Client-side DSP Parser</label>
                    <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 border border-white/10">
                        <Disc className="w-3 h-3 text-gray-500" />
                        <div className="flex gap-1 pt-0.5">
                            <div className="w-8 h-1.5 rounded-full bg-neon-blue/80 animate-pulse"></div>
                            <div className="w-4 h-1.5 rounded-full bg-purple-500/80 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                            <div className="w-12 h-1.5 rounded-full bg-neon-blue/80 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-green-400 bg-green-500/10 px-2 py-1.5 rounded-lg border border-green-500/20 w-fit">
                    <CheckCircle2 className="w-3 h-3" />
                    <span className="font-bold">Offline Ready</span>
                </div>
            </div>
        </div>
    );

    const ReadyVisual = () => (
        <div className="relative w-48 h-32 perspective-500 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-[#111] to-black">
            {/* Lane Lines */}
            <div className="absolute inset-0 flex justify-center gap-8 opacity-20 transform-style-3d rotate-x-60">
                <div className="w-px h-[200%] bg-white -mt-10"></div>
                <div className="w-px h-[200%] bg-white -mt-10"></div>
                <div className="w-px h-[200%] bg-white -mt-10"></div>
            </div>
            
            {/* Notes Falling */}
            <div className="absolute top-[-20px] left-[25%] w-8 h-4 bg-neon-blue rounded-sm shadow-[0_0_15px_#2dd4bf] animate-[fall_1.5s_linear_infinite]"></div>
            <div className="absolute top-[-20px] left-[55%] w-8 h-4 bg-neon-purple rounded-sm shadow-[0_0_15px_#818cf8] animate-[fall_1.2s_linear_infinite]" style={{ animationDelay: '0.6s' }}></div>
            
            {/* Hit Line */}
            <div className="absolute bottom-4 left-0 right-0 h-1 bg-white/50 shadow-[0_0_10px_white]"></div>
            
            {/* Play Overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.5)] animate-bounce">
                    <Play className="w-5 h-5 text-black fill-current ml-0.5" />
                </div>
            </div>
        </div>
    );

    const STEPS = [
        {
            title: "欢迎来到 NeonFlow 2",
            desc: "基于音频分析生成的节奏游戏引擎。将任何音频文件转化为可游玩的动态谱面。",
            visual: <WelcomeVisual />,
            bg: "from-blue-900/40 to-purple-900/40"
        },
        {
            title: "导入音乐",
            desc: "支持 .MP3 与 .FLAC 格式。系统将自动解析封面、元数据与音频特征。",
            visual: <ImportVisual />,
            bg: "from-blue-900/40 to-transparent"
        },
        {
            title: "DSP 算法生成",
            desc: "集成高精度信号处理引擎，精准分析歌曲结构、BPM 与动态能量，一键生成谱面。",
            visual: <AiVisual />,
            bg: "from-blue-900/40 to-transparent"
        },
        {
            title: "高性能架构",
            desc: "完全运行在浏览器中的客户端解析，通过 Web Worker 分流音频特征提取，告别卡顿。",
            visual: <PerformanceVisual />,
            bg: "from-gray-800/40 to-transparent"
        },
        {
            title: "准备就绪",
            desc: "戴上耳机，调整好下落速度与音频延迟。Enjoy the rhythm!",
            visual: <ReadyVisual />,
            bg: "from-yellow-900/20 to-transparent"
        }
    ];

    const currentStep = STEPS[step];
    const isLast = step === STEPS.length - 1;

    const handleNext = () => {
        if (isLast) onComplete();
        else setStep(s => s + 1);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in font-sans">
            <div className="w-full max-w-lg bg-[#0f172a] border border-white/20 rounded-3xl overflow-hidden shadow-2xl relative flex flex-col h-[550px]">
                
                {/* Background Art */}
                <div className={`absolute inset-0 bg-gradient-to-br ${currentStep.bg} transition-colors duration-700`}></div>
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>

                {/* Progress Bar (Top) */}
                <div className="absolute top-0 left-0 right-0 flex h-1">
                    {STEPS.map((_, i) => (
                        <div 
                            key={i} 
                            className={`flex-1 transition-colors duration-300 ${i <= step ? 'bg-white/80' : 'bg-white/10'}`}
                        ></div>
                    ))}
                </div>

                <div className="relative z-10 flex flex-col items-center text-center h-full p-8">
                    <button 
                        onClick={onComplete}
                        className="absolute top-6 right-6 p-2 text-gray-500 hover:text-white transition-colors hover:bg-white/10 rounded-full z-50"
                        title="跳过教程"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    {/* Content Area */}
                    <div className="flex-1 flex flex-col items-center justify-center w-full gap-8 mt-4">
                        {/* Visual Container */}
                        <div className="h-48 w-full flex items-center justify-center relative">
                            {currentStep.visual}
                        </div>
                        
                        <div className="space-y-4 max-w-sm animate-slide-up">
                            <h2 className="text-3xl font-black text-white uppercase tracking-tight drop-shadow-md">
                                {currentStep.title}
                            </h2>
                            <p className="text-gray-400 text-sm leading-relaxed font-medium">
                                {currentStep.desc}
                            </p>
                        </div>
                    </div>

                    {/* Footer Navigation */}
                    <div className="w-full pt-8 flex items-center justify-between mt-auto">
                        <div className="flex gap-2">
                            {STEPS.map((_, i) => (
                                <div 
                                    key={i} 
                                    className={`w-2 h-2 rounded-full transition-all duration-500 ${i === step ? 'bg-neon-blue w-6 shadow-[0_0_10px_#2dd4bf]' : 'bg-white/20'}`}
                                ></div>
                            ))}
                        </div>

                        <button 
                            onClick={handleNext}
                            className="group flex items-center gap-2 bg-white text-black px-8 py-3 rounded-xl font-black text-sm hover:bg-neon-blue hover:scale-105 transition-all active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                        >
                            {isLast ? "开始探索" : "下一步"}
                            {isLast ? <Play className="w-4 h-4 fill-current" /> : <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                        </button>
                    </div>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes equalizer {
                    0%, 100% { height: 20%; }
                    50% { height: 90%; }
                }
                @keyframes fall {
                    0% { transform: translateY(0); opacity: 0; }
                    10% { opacity: 1; }
                    100% { transform: translateY(150px); opacity: 1; }
                }
            `}} />
        </div>
    );
};
