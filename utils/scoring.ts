
import { ScoreState } from '../types';

export interface GradeResult {
    rank: string;
    color: string;
    label: string;
    shadow?: string;
}

// --- 1. Grade Calculation (Based on 1,000,000 Score) ---
export const calculateGrade = (rawScore: number): GradeResult => {
    // Score is now 0 - 1,000,000
    // FIX: Round to nearest integer to handle floating point errors (e.g. 999999.99 -> 1000000)
    // This matches the UI display logic in ResultScreen.
    const score = Math.round(rawScore);

    if (score >= 1000000) return { 
        rank: 'φ', // Phi (Theoretical Perfect)
        color: 'text-cyan-200', 
        label: '理论值', 
        shadow: 'drop-shadow-[0_0_25px_rgba(165,243,252,0.8)]'
    };
    if (score >= 995000) return { 
        rank: 'SSS', 
        color: 'text-neon-pink', 
        label: '神乎其技', 
        shadow: 'drop-shadow-[0_0_15px_rgba(255,0,255,0.6)]'
    };
    if (score >= 990000) return { 
        rank: 'SS', 
        color: 'text-yellow-400', 
        label: '精彩绝伦',
        shadow: 'drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]'
    };
    if (score >= 970000) return { rank: 'S', color: 'text-neon-blue', label: '名列前茅' }; 
    if (score >= 930000) return { rank: 'A', color: 'text-green-400', label: '优秀' }; 
    if (score >= 850000) return { rank: 'B', color: 'text-gray-200', label: '合格' }; 
    if (score >= 700000) return { rank: 'C', color: 'text-orange-400', label: '勉强' }; 
    
    return { rank: 'D', color: 'text-red-500', label: '失败' }; 
};

export const calculateAccuracy = (perfect: number, good: number, total: number): number => {
    if (total === 0) return 0;
    // Standard VSRG Weight: Perfect 100%, Good 60%, Miss 0%
    const totalPoints = (perfect * 1.0) + (good * 0.6);
    return Math.floor((totalPoints / total) * 100);
};

/**
 * --- 2. Piecewise Linear Rating Algorithm ---
 * Same logic, just ensuring consistency with new tiers if needed.
 */
export const calculateRating = (difficulty: number, score: number): number => {
    if (difficulty === 0) return 0;

    let rating = 0;
    
    // Normalize score cap
    const val = Math.min(score, 1000000);

    if (val >= 1000000) {
        // Max Score Bonus
        rating = difficulty + 2.0;
    } 
    else if (val >= 990000) {
        // 990k - 1M
        rating = difficulty + 1.0 + ((val - 990000) / 10000);
    } 
    else if (val >= 970000) {
        // 970k - 990k
        rating = difficulty + ((val - 970000) / 20000);
    }
    else if (val >= 800000) {
        // 800k - 970k
        const ratio = (val - 800000) / 170000; 
        const minRating = difficulty * 0.6;
        rating = minRating + (ratio * (difficulty - minRating));
    }
    else {
        // < 800k
        rating = difficulty * 0.6 * (Math.max(0, val) / 800000);
    }

    return Math.max(0, parseFloat(rating.toFixed(2)));
};
