
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

/**
 * Converts a slice of an AudioBuffer to a WAV Base64 string.
 * Used for sending audio context to Gemini.
 */
export const sliceAudioBufferToWavBase64 = async (
    buffer: AudioBuffer, 
    startTime: number, 
    duration: number
): Promise<string> => {
    const sr = buffer.sampleRate;
    const startSample = Math.floor(Math.max(0, startTime) * sr);
    const endSample = Math.floor(Math.min(buffer.duration, startTime + duration) * sr);
    const length = endSample - startSample;
    
    if (length <= 0) return "";

    // 1. Extract raw PCM data (Mono is enough for rhythm analysis and saves bandwidth)
    // We mix down to mono if stereo
    const pcmData = new Float32Array(length);
    const left = buffer.getChannelData(0);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;

    for (let i = 0; i < length; i++) {
        let val = left[startSample + i];
        if (right) val = (val + right[startSample + i]) / 2;
        pcmData[i] = val;
    }

    // 2. Encode to WAV
    // Standard WAV Header (44 bytes)
    const wavBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(wavBuffer);

    const writeString = (offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    // RIFF chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');

    // fmt sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample

    // data sub-chunk
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);

    // Write PCM samples
    let offset = 44;
    for (let i = 0; i < length; i++) {
        let s = Math.max(-1, Math.min(1, pcmData[i]));
        // Convert float to 16-bit PCM
        s = s < 0 ? s * 0x8000 : s * 0x7FFF;
        view.setInt16(offset, s, true);
        offset += 2;
    }

    // 3. Convert ArrayBuffer to Base64
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64data = reader.result as string;
            // Remove data URL prefix (data:audio/wav;base64,)
            resolve(base64data.split(',')[1]); 
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};
