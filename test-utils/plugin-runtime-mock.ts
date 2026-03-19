import { vi } from "vitest";

export function createPluginRuntimeMock() {
  return {
    config: {
      loadConfig: vi.fn(),
      writeConfigFile: vi.fn().mockResolvedValue(undefined),
    },
    subagent: {
      run: vi.fn().mockResolvedValue({ runId: "test-run" }),
      waitForRun: vi.fn().mockResolvedValue({ status: "ok" }),
      getSessionMessages: vi.fn().mockResolvedValue({ messages: [] }),
      getSession: vi.fn().mockResolvedValue({ messages: [] }),
      deleteSession: vi.fn().mockResolvedValue(undefined),
    },
    videoAvatar: {
      synthesizeSpeech: vi.fn().mockResolvedValue({
        audioBuffer: Buffer.from("pcm-audio"),
        provider: "video-avatar",
        sampleRate: 24000,
      }),
      transcribeAudio: vi.fn().mockResolvedValue({
        text: "hello from microphone",
      }),
    },
    stt: {
      transcribeAudioFile: vi.fn(),
    },
  };
}
