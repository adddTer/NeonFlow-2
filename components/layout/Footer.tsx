
import React from 'react';
import { Bug } from 'lucide-react';

interface FooterProps {
    isDebugMode: boolean;
    onClick: () => void;
}

export const Footer: React.FC<FooterProps> = ({ isDebugMode, onClick }) => {
    return (
        <footer className="p-4 md:p-6 text-center text-[8px] md:text-[10px] text-gray-700 uppercase tracking-[0.2em] bg-[#030304] shrink-0 border-t border-white/5 select-none" onClick={onClick}>
            <p className="flex items-center justify-center gap-2">
                NeonFlow 2 • AI Rhythm Engine 
                {isDebugMode && <span className="text-red-500 font-bold flex items-center gap-1"><Bug className="w-3 h-3"/> DEV MODE</span>}
            </p>
        </footer>
    );
};
