import { useCallback, useEffect, useRef, useState } from 'react';

export const useTTS = () => {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());

  // Revoke all cached object URLs on unmount to avoid memory leaks.
  useEffect(() => {
    return () => {
      cacheRef.current.forEach((url) => URL.revokeObjectURL(url));
      cacheRef.current.clear();
    };
  }, []);

  const fetchAudio = useCallback(async (text: string): Promise<string> => {
    const key = text.slice(0, 500);
    if (cacheRef.current.has(key)) return cacheRef.current.get(key)!;

    const token = localStorage.getItem('token');
    const res = await fetch('/api/tts/speak', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ text: key }),
    });
    if (!res.ok) throw new Error('TTS failed');

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    cacheRef.current.set(key, url);
    return url;
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlaying(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    if (!text?.trim()) return;
    stop();
    setPlaying(true);

    try {
      const url = await fetchAudio(text);
      const audio = new Audio(url);
      audioRef.current = audio;

      const cleanup = () => {
        setPlaying(false);
        if (audioRef.current === audio) audioRef.current = null;
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      await audio.play();
    } catch (err) {
      console.error('TTS error:', err);
      setPlaying(false);
    }
  }, [fetchAudio, stop]);

  // Fire-and-forget prefetch — fills the cache silently so speak() is instant.
  const prefetch = useCallback((texts: string[]) => {
    for (const text of texts) {
      if (!text?.trim()) continue;
      const key = text.slice(0, 500);
      if (!cacheRef.current.has(key)) {
        fetchAudio(text).catch(() => {});
      }
    }
  }, [fetchAudio]);

  return { speak, stop, playing, prefetch };
};
