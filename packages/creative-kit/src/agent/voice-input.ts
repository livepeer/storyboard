/**
 * Voice Input — speech-to-text for the chat input.
 *
 * Uses the browser's SpeechRecognition API (Web Speech API).
 * Falls back gracefully when not available (Firefox, some mobile).
 *
 * Usage:
 *   const voice = createVoiceInput({
 *     onTranscript: (text) => setChatInput(text),
 *     onEnd: () => setRecording(false),
 *   });
 *   voice.start();  // shows microphone permission dialog
 *   voice.stop();   // stops listening
 */

export interface VoiceInputOptions {
  /** Called with the transcript as the user speaks (continuous updates) */
  onTranscript: (text: string, isFinal: boolean) => void;
  /** Called when recognition ends (user stopped or timeout) */
  onEnd?: () => void;
  /** Called on error */
  onError?: (error: string) => void;
  /** Language (default: "en-US") */
  language?: string;
  /** Continuous mode — keep listening until stopped (default: true) */
  continuous?: boolean;
}

export interface VoiceInput {
  start(): void;
  stop(): void;
  readonly isListening: boolean;
  readonly isSupported: boolean;
}

/** Check if the browser supports speech recognition. */
export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!(
    (window as unknown as Record<string, unknown>).SpeechRecognition ||
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition
  );
}

// Browser SpeechRecognition types (not in lib.dom.d.ts by default)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

/** Create a voice input handler. */
export function createVoiceInput(opts: VoiceInputOptions): VoiceInput {
  const supported = isSpeechRecognitionSupported();
  let recognition: AnySpeechRecognition = null;
  let listening = false;

  if (supported && typeof window !== "undefined") {
    const w = window as unknown as Record<string, unknown>;
    const SpeechRecognitionClass =
      (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => AnySpeechRecognition);
    recognition = new SpeechRecognitionClass();
    recognition.lang = opts.language || "en-US";
    recognition.continuous = opts.continuous ?? true;
    recognition.interimResults = true;

    recognition.onresult = (event: AnySpeechRecognition) => {
      let transcript = "";
      let isFinal = false;
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) isFinal = true;
      }
      opts.onTranscript(transcript, isFinal);
    };

    recognition.onend = () => {
      listening = false;
      opts.onEnd?.();
    };

    recognition.onerror = (event: AnySpeechRecognition) => {
      listening = false;
      const msg = event.error === "not-allowed"
        ? "Microphone access denied — check browser permissions"
        : event.error === "no-speech"
        ? "No speech detected — try again"
        : `Speech recognition error: ${event.error}`;
      opts.onError?.(msg);
    };
  }

  return {
    start() {
      if (!recognition) {
        opts.onError?.("Speech recognition not supported in this browser");
        return;
      }
      try {
        recognition.start();
        listening = true;
      } catch (e) {
        opts.onError?.(`Failed to start: ${(e as Error).message}`);
      }
    },

    stop() {
      if (recognition && listening) {
        recognition.stop();
        listening = false;
      }
    },

    get isListening() { return listening; },
    get isSupported() { return supported; },
  };
}
