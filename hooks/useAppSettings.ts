
import { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { KeyConfig } from '../types';

const LS_KEY_API = 'neonflow_api_key';
const LS_KEY_DEBUG = 'neonflow_debug_mode';
const LS_KEY_SPEED = 'neonflow_scroll_speed';
const LS_KEY_BINDINGS = 'neonflow_key_bindings';

export const useAppSettings = () => {
    const [scrollSpeed, setScrollSpeed] = useState<number>(5.0);
    const [keyConfig, setKeyConfig] = useState<KeyConfig>({
        k4: ['d', 'f', 'j', 'k'],
        k6: ['s', 'd', 'f', 'j', 'k', 'l']
    });
    const [audioOffset, setAudioOffset] = useState<number>(0);
    const [isDebugMode, setIsDebugMode] = useState(false);
    
    // API Key State
    const [customApiKey, setCustomApiKey] = useState("");
    const [apiKeyStatus, setApiKeyStatus] = useState<'valid' | 'missing' | 'checking' | 'invalid'>('missing');
    const [validationError, setValidationError] = useState<string | null>(null);
    const hasEnvKey = !!process.env.API_KEY;

    // Load Settings
    useEffect(() => {
        const savedOffset = localStorage.getItem('neonflow_audio_offset');
        if (savedOffset) setAudioOffset(Number(savedOffset));

        const savedSpeed = localStorage.getItem(LS_KEY_SPEED);
        if (savedSpeed) setScrollSpeed(Number(savedSpeed));

        const savedBindings = localStorage.getItem(LS_KEY_BINDINGS);
        if (savedBindings) {
            try {
                setKeyConfig(JSON.parse(savedBindings));
            } catch(e) {}
        }

        const debug = localStorage.getItem(LS_KEY_DEBUG);
        if (debug === 'true') setIsDebugMode(true);

        const storedKey = localStorage.getItem(LS_KEY_API);
        if (storedKey) {
            setCustomApiKey(storedKey);
            validateKey(storedKey);
        } else if (hasEnvKey) {
            validateKey(process.env.API_KEY || "");
        }
    }, []);

    const validateKey = async (key: string) => {
        if (!key.trim()) return false;
        setApiKeyStatus('checking');
        setValidationError(null);
        try {
            const ai = new GoogleGenAI({ apiKey: key });
            await ai.models.countTokens({
               model: 'gemini-3-flash-preview',
               contents: { parts: [{ text: 'ping' }] }
            });
            setApiKeyStatus('valid');
            return true;
        } catch (e: any) {
            console.error("API Validation Failed", e);
            setApiKeyStatus('invalid');
            setValidationError(e.message || "连接 Gemini API 失败");
            return false;
        }
    };

    const handleSaveSettings = async (closeModal: () => void) => {
        localStorage.setItem(LS_KEY_SPEED, String(scrollSpeed));
        const trimmedKey = customApiKey.trim();
        
        if (!trimmedKey && !hasEnvKey) {
            localStorage.removeItem(LS_KEY_API);
            setApiKeyStatus('missing');
            return;
        }
        
        const keyToValidate = trimmedKey || process.env.API_KEY || "";
        const isValid = await validateKey(keyToValidate);
        
        if (isValid) {
            if (trimmedKey) localStorage.setItem(LS_KEY_API, trimmedKey);
            closeModal();
        }
    };

    const toggleDebugMode = () => {
        const newState = !isDebugMode;
        setIsDebugMode(newState);
        localStorage.setItem(LS_KEY_DEBUG, String(newState));
        alert(newState ? "调试模式已开启" : "调试模式已关闭");
    };

    return {
        scrollSpeed, setScrollSpeed,
        keyConfig, setKeyConfig,
        audioOffset, setAudioOffset,
        isDebugMode, toggleDebugMode,
        customApiKey, setCustomApiKey,
        apiKeyStatus, validationError,
        validateKey, handleSaveSettings,
        hasEnvKey
    };
};
