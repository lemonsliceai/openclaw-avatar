import { vi } from "vitest";

export function createPluginRuntimeMock() {
  return {
    config: {
      loadConfig: vi.fn(),
      writeConfigFile: vi.fn().mockResolvedValue(undefined),
    },
    tts: {
      textToSpeech: vi.fn(),
      textToSpeechTelephony: vi.fn(),
    },
    stt: {
      transcribeAudioFile: vi.fn(),
    },
  };
}
