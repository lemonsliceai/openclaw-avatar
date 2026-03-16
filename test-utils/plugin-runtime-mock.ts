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
    stt: {
      transcribeAudioFile: vi.fn(),
    },
  };
}
