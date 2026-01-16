
import React, { useState } from 'react';
import { X, ChevronRight, Music, BrainCircuit, Play, Settings, ArrowRight } from 'lucide-react';

interface OnboardingOverlayProps {
    onComplete: () => void;
}

export const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({ onComplete }) => {
    const [step, setStep] = useState(0);

    const STEPS = [
        {
            title: "欢迎来到 NeonFlow 2",
            desc: "您的下一代 AI 节奏游戏引擎。将任何音频文件转化为可游玩的动态谱面。",
            icon: null,
            bg: "from-blue-900/40 to-purple-900/40"
        },
        {
            title: "导入音乐",
            desc: "点击右上角的「新乐谱」按钮，上传您的本地音频文件（.mp3, .flac）。",
            icon: <Music className="w-12 h-12 text-neon-blue" />,
            bg: "from-blue-900/40 to-transparent"
        },
        {
            title: "AI 生成",
            desc: "系统将自动分析 BPM、歌曲结构与情感色彩，为您生成独一无二的谱面。",
            icon: <BrainCircuit className="w-12 h-12 text-neon-purple" />,
            bg: "from-purple-900/40 to-transparent"
        },
        {
            title: "配置 API Key",
            desc: "为了获得最佳的 AI 分析体验，请在设置中填入您的 Google Gemini API Key。",
            icon: <Settings className="w-12 h-12 text-gray-300" />,
            bg: "from-gray-800/40 to-transparent"
        },
        {
            title: "准备就绪",
            desc: "戴上耳机，调整好下落速度与延迟，开始您的 NeonFlow 之旅吧！",
            icon: <Play className="w-12 h-12 text-neon-yellow fill-current" />,
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-fade-in">
            <div className="w-full max-w-lg bg-[#0f172a] border border-white/20 rounded-3xl overflow-hidden shadow-2xl relative flex flex-col">
                
                {/* Background Art */}
                <div className={`absolute inset-0 bg-gradient-to-br ${currentStep.bg} transition-colors duration-500`}></div>
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>

                <div className="relative z-10 p-8 flex flex-col items-center text-center h-full min-h-[400px]">
                    <button 
                        onClick={onComplete}
                        className="absolute top-4 right-4 p-2 text-gray-500 hover:text-white transition-colors hover:bg-white/10 rounded-full"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="flex-1 flex flex-col items-center justify-center w-full">
                        {currentStep.icon && (
                            <div className="w-24 h-24 bg-white/5 rounded-3xl border border-white/10 flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(0,0,0,0.3)] animate-float">
                                {currentStep.icon}
                            </div>
                        )}
                        
                        <h2 className="text-2xl font-black text-white mb-4 uppercase tracking-wide">
                            {currentStep.title}
                        </h2>
                        <p className="text-gray-400 text-sm leading-relaxed max-w-sm">
                            {currentStep.desc}
                        </p>
                    </div>

                    <div className="w-full pt-8 flex items-center justify-between">
                        {/* Pagination Dots */}
                        <div className="flex gap-2">
                            {STEPS.map((_, i) => (
                                <div 
                                    key={i} 
                                    className={`w-2 h-2 rounded-full transition-all duration-300 ${i === step ? 'bg-white w-6' : 'bg-white/20'}`}
                                ></div>
                            ))}
                        </div>

                        <button 
                            onClick={handleNext}
                            className="group flex items-center gap-2 bg-white text-black px-6 py-3 rounded-xl font-bold text-sm hover:bg-neon-blue transition-all active:scale-95 shadow-lg"
                        >
                            {isLast ? "开始探索" : "下一步"}
                            {isLast ? <Play className="w-4 h-4 fill-current" /> : <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
