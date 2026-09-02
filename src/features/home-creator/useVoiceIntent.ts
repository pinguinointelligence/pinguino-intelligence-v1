/**
 * GELLATTI HOME — voice capture (§19, §20).
 *
 * A thin, honest wrapper over the browser's own recogniser. It produces a TRANSCRIPT
 * and nothing else: the sentence goes through `parseIntent` exactly like typed text,
 * which is what §19 means by "three input methods into the SAME intent" and why §20
 * needs no separate transcript page.
 *
 * Honest states: a browser without the API reports `unavailable` (never a silently
 * dead button), and a refused microphone reports `permission-denied`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceState = 'idle' | 'listening' | 'unavailable' | 'permission-denied';

interface MinimalRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => MinimalRecognition;

function getSpeechCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useVoiceIntent(options: {
  lang?: string;
  onTranscript: (transcript: string) => void;
}) {
  const { lang = 'pl-PL', onTranscript } = options;
  // Availability is a FACT about the browser, known at first render — not a state
  // change to synchronise afterwards. A lazy initialiser keeps SSR safe (no window →
  // `unavailable`) without an effect that would re-render every mount.
  const [state, setState] = useState<VoiceState>(() =>
    getSpeechCtor() === null ? 'unavailable' : 'idle',
  );
  const recognitionRef = useRef<MinimalRecognition | null>(null);
  // The latest callback is kept in a ref so `start` does not need to be rebuilt (and
  // the live recogniser torn down) every time the parent re-renders with a new closure.
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setState((current) => (current === 'listening' ? 'idle' : current));
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechCtor();
    if (Ctor === null) {
      setState('unavailable');
      return;
    }
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, i) => {
        const alternatives = event.results[i];
        return alternatives?.[0]?.transcript ?? '';
      })
        .join(' ')
        .trim();
      if (transcript) onTranscriptRef.current(transcript);
    };
    recognition.onerror = (event) => {
      setState(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'permission-denied'
          : 'idle',
      );
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setState((current) => (current === 'listening' ? 'idle' : current));
    };
    recognitionRef.current = recognition;
    setState('listening');
    recognition.start();
  }, [lang]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return { state, start, stop, toggle: () => (state === 'listening' ? stop() : start()) };
}
