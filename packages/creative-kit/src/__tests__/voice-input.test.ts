import { describe, it, expect } from "vitest";
import { isSpeechRecognitionSupported, createVoiceInput } from "../agent/voice-input";

describe("Voice Input", () => {
  it("reports not supported in Node/test environment", () => {
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  it("creates voice input even when not supported", () => {
    const voice = createVoiceInput({
      onTranscript: () => {},
    });
    expect(voice.isSupported).toBe(false);
    expect(voice.isListening).toBe(false);
  });

  it("start() calls onError when not supported", () => {
    let error = "";
    const voice = createVoiceInput({
      onTranscript: () => {},
      onError: (e) => { error = e; },
    });
    voice.start();
    expect(error).toContain("not supported");
  });

  it("stop() is safe when not listening", () => {
    const voice = createVoiceInput({ onTranscript: () => {} });
    voice.stop(); // should not throw
  });
});
