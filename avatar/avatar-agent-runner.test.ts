import { EventEmitter } from "node:events";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ReadableStream } from "node:stream/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import avatarAgent, {
  GatewayWsClient,
  buildLemonSliceAspectRatioPayload,
  computeStreamingTextDelta,
  requestGatewaySpeechSynthesis,
} from "./avatar-agent-runner.js";
import {
  AVATAR_ASPECT_RATIO_DEFAULT,
  AVATAR_ASPECT_RATIO_LOOKUP,
  AVATAR_ASPECT_RATIOS,
} from "./avatar-aspect-ratio.js";

const textEncoder = new TextEncoder();

function createMockSseResponse(chunks: string[], status = 200) {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(textEncoder.encode(chunk));
      }
      controller.close();
    },
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    body: stream,
    text: async () => chunks.join(""),
  };
}

async function waitForSignalEvent(
  signalFile: string,
  eventType: string,
  timeoutMs = 2_000,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const contents = await readFile(signalFile, "utf8");
      const hasEvent = contents
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .some((line) => {
          try {
            const parsed = JSON.parse(line) as { type?: string };
            return parsed.type === eventType;
          } catch {
            return false;
          }
        });
      if (hasEvent) {
        return;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`timed out waiting for signal event ${eventType}`);
}

async function waitForCondition(check: () => boolean, timeoutMs = 2_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out waiting for condition");
}

async function writeMockLiveKitDeps(tmpDir: string): Promise<string> {
  const agentsDir = path.join(tmpDir, "node_modules", "@livekit", "agents");
  const lemonsliceDir = path.join(tmpDir, "node_modules", "@livekit", "agents-plugin-lemonslice");
  const runnerPath = path.join(tmpDir, "mock-runner.js");

  await mkdir(agentsDir, { recursive: true });
  await mkdir(lemonsliceDir, { recursive: true });
  await writeFile(
    path.join(agentsDir, "package.json"),
    JSON.stringify({
      name: "@livekit/agents",
      type: "module",
      exports: "./index.js",
    }),
    "utf8",
  );
  await writeFile(
    path.join(lemonsliceDir, "package.json"),
    JSON.stringify({
      name: "@livekit/agents-plugin-lemonslice",
      type: "module",
      exports: "./index.js",
    }),
    "utf8",
  );
  await writeFile(
    path.join(agentsDir, "index.js"),
    `import { EventEmitter } from "node:events";

const state = (globalThis.__openclawAvatarRunnerTestState ??= {
  sessionStartOptions: [],
  avatarStartCalls: [],
});

class MockAudioOutput {}

class BaseChunkedStream {
  constructor(text, tts, connOptions, abortSignal) {
    this.inputText = text;
    this.tts = tts;
    this.connOptions = connOptions;
    this.abortSignal = abortSignal ?? new AbortController().signal;
    this.queue = { put() {} };
  }
}

class BaseTTS {
  constructor(sampleRate, channels, options) {
    this.initialSampleRate = sampleRate;
    this.channels = channels;
    this.options = options;
  }
}

class StreamAdapter {
  constructor() {}

  stream() {
    return {
      async close() {},
      async endInput() {},
      async *[Symbol.asyncIterator]() {},
    };
  }
}

class AgentSession extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.activity = null;
    this.output = { audio: new MockAudioOutput() };
  }

  async start(options) {
    state.sessionStartOptions.push(options);
    this.activity = { running: true };
  }

  interrupt() {
    return { await: Promise.resolve() };
  }

  say() {
    return {
      async waitForPlayout() {},
      async interrupt() {},
    };
  }
}

class Agent {
  constructor(options) {
    this.options = options;
  }
}

class AudioByteStream {
  constructor() {}

  write() {
    return [];
  }

  flush() {
    return [];
  }
}

export const voice = { AgentSession, Agent };
export const tts = {
  ChunkedStream: BaseChunkedStream,
  TTS: BaseTTS,
  StreamAdapter,
  SynthesizeStream: { END_OF_STREAM: Symbol.for("end-of-stream") },
};
export const tokenize = {
  basic: {
    SentenceTokenizer: class SentenceTokenizer {},
  },
};
export { AudioByteStream };
`,
    "utf8",
  );
  await writeFile(
    path.join(lemonsliceDir, "index.js"),
    `const state = (globalThis.__openclawAvatarRunnerTestState ??= {
  sessionStartOptions: [],
  avatarStartCalls: [],
});

export class AvatarSession {
  constructor(options) {
    this.options = options;
    this.avatarParticipantIdentity = "mock-avatar";
  }

  async start(_session, room, options) {
    state.avatarStartCalls.push({
      roomName: room?.name ?? "",
      options,
    });
  }
}
`,
    "utf8",
  );
  await writeFile(runnerPath, "export {};\n", "utf8");

  return runnerPath;
}

describe("GatewayWsClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("reconnects after an established plugin chat stream closes", async () => {
    const chatEvent = {
      type: "event",
      event: "chat",
      payload: {
        sessionKey: "agent:main:main",
        state: "final",
        runId: "run-1",
        message: {
          role: "assistant",
          text: "Hello from SSE",
        },
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createMockSseResponse([`event: chat\ndata: ${JSON.stringify(chatEvent)}\n\n`]),
      )
      .mockResolvedValueOnce(createMockSseResponse([]));
    const originalToken = process.env.OPENCLAW_AVATAR_GATEWAY_TOKEN;
    const originalPassword = process.env.OPENCLAW_AVATAR_GATEWAY_PASSWORD;
    process.env.OPENCLAW_AVATAR_GATEWAY_TOKEN = "gateway-token";
    process.env.OPENCLAW_AVATAR_GATEWAY_PASSWORD = "gateway-password";

    try {
      const client = new GatewayWsClient({
        fetchImpl: fetchMock,
        url: "http://127.0.0.1:18789/plugins/openclaw-avatar/api/chat/stream?sessionKey=agent%3Amain%3Amain",
        onChatEvent: vi.fn(),
      });

      const readyPromise = client.start();
      await readyPromise;
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/plugins/openclaw-avatar/api/chat/stream"),
        expect.objectContaining({
          headers: { accept: "text/event-stream" },
        }),
      );
      expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("authorization");

      await vi.advanceTimersByTimeAsync(500);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      client.stop();
      await vi.advanceTimersByTimeAsync(5_000);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(client.onChatEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "event",
          event: "chat",
          payload: expect.objectContaining({
            sessionKey: "agent:main:main",
            state: "final",
          }),
        }),
      );
    } finally {
      if (originalToken === undefined) {
        delete process.env.OPENCLAW_AVATAR_GATEWAY_TOKEN;
      } else {
        process.env.OPENCLAW_AVATAR_GATEWAY_TOKEN = originalToken;
      }
      if (originalPassword === undefined) {
        delete process.env.OPENCLAW_AVATAR_GATEWAY_PASSWORD;
      } else {
        process.env.OPENCLAW_AVATAR_GATEWAY_PASSWORD = originalPassword;
      }
    }
  });

  it("posts synthesis requests without authorization headers", async () => {
    const fetchMock = vi.fn(async (_url, options = {}) => {
      expect(_url).toBe("http://127.0.0.1:18789/plugins/openclaw-avatar/api/synthesize");
      expect(options).toMatchObject({
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      });
      expect((options as { headers?: Record<string, string> }).headers).not.toHaveProperty(
        "authorization",
      );
      expect((options as { body?: string }).body).toBe(JSON.stringify({ text: "Hello" }));
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            success: true,
            audioBase64: "AQ==",
            sampleRate: 16000,
            provider: "mock",
          }),
      } as Response;
    });

    const originalFetch = globalThis.fetch;
    const originalGatewayUrl = process.env.OPENCLAW_AVATAR_GATEWAY_URL;
    const originalToken = process.env.OPENCLAW_AVATAR_GATEWAY_TOKEN;
    const originalPassword = process.env.OPENCLAW_AVATAR_GATEWAY_PASSWORD;

    process.env.OPENCLAW_AVATAR_GATEWAY_URL = "ws://127.0.0.1:18789";
    process.env.OPENCLAW_AVATAR_GATEWAY_TOKEN = "gateway-token";
    process.env.OPENCLAW_AVATAR_GATEWAY_PASSWORD = "gateway-password";
    globalThis.fetch = fetchMock as typeof fetch;

    try {
      await expect(requestGatewaySpeechSynthesis("Hello", undefined)).resolves.toMatchObject({
        sampleRate: 16000,
        provider: "mock",
      });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalGatewayUrl === undefined) {
        delete process.env.OPENCLAW_AVATAR_GATEWAY_URL;
      } else {
        process.env.OPENCLAW_AVATAR_GATEWAY_URL = originalGatewayUrl;
      }
      if (originalToken === undefined) {
        delete process.env.OPENCLAW_AVATAR_GATEWAY_TOKEN;
      } else {
        process.env.OPENCLAW_AVATAR_GATEWAY_TOKEN = originalToken;
      }
      if (originalPassword === undefined) {
        delete process.env.OPENCLAW_AVATAR_GATEWAY_PASSWORD;
      } else {
        process.env.OPENCLAW_AVATAR_GATEWAY_PASSWORD = originalPassword;
      }
    }
  });

  it("fails the initial connect attempt without entering a reconnect loop", async () => {
    const fetchMock = vi.fn(async () => createMockSseResponse([], 503));
    const client = new GatewayWsClient({
      fetchImpl: fetchMock,
      url: "http://127.0.0.1:18789/plugins/openclaw-avatar/api/chat/stream?sessionKey=agent%3Amain%3Amain",
      onChatEvent: vi.fn(),
    });

    const readyPromise = client.start();
    await expect(readyPromise).rejects.toThrow("plugin request failed with status 503");

    await vi.runOnlyPendingTimersAsync();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("computeStreamingTextDelta", () => {
  it("returns the newly appended suffix for cumulative gateway text", () => {
    expect(computeStreamingTextDelta("Hello there", "Hello")).toBe(" there");
  });

  it("returns the full text for the first streamed chunk", () => {
    expect(computeStreamingTextDelta("Hello there", "")).toBe("Hello there");
  });

  it("returns an empty delta when the chunk is unchanged", () => {
    expect(computeStreamingTextDelta("same", "same")).toBe("");
  });

  it("returns an empty delta when the next chunk is empty", () => {
    expect(computeStreamingTextDelta("", "prefix")).toBe("");
  });

  it("returns null when the next chunk is not a monotonic prefix extension", () => {
    expect(computeStreamingTextDelta("Hello world", "Hi")).toBeNull();
  });
});

describe("avatar aspect ratio constants", () => {
  it("keeps the runner validation whitelist aligned with the shared constants", () => {
    expect(Array.from(AVATAR_ASPECT_RATIO_LOOKUP)).toEqual([
      ...AVATAR_ASPECT_RATIOS,
    ]);
    expect(AVATAR_ASPECT_RATIO_DEFAULT).toBe("3x2");
  });

  it("maps aspect ratio into the LemonSlice request payload", () => {
    expect(buildLemonSliceAspectRatioPayload("9x16")).toEqual({
      aspect_ratio: "9x16",
    });
    expect(buildLemonSliceAspectRatioPayload("invalid")).toEqual({
      aspect_ratio: AVATAR_ASPECT_RATIO_DEFAULT,
    });
  });
});

describe("avatarAgent test mode", () => {
  const originalTestMode = process.env.OPENCLAW_AVATAR_TEST_MODE;
  const originalSignalFile = process.env.OPENCLAW_AVATAR_TEST_SIGNAL_FILE;
  const originalDepsBaseRunner = process.env.OPENCLAW_AVATAR_DEPS_BASE_RUNNER;
  const originalRunnerPath = process.env.OPENCLAW_AVATAR_RUNNER_PATH;
  let tmpDir = "";

  afterEach(async () => {
    if (originalTestMode === undefined) {
      delete process.env.OPENCLAW_AVATAR_TEST_MODE;
    } else {
      process.env.OPENCLAW_AVATAR_TEST_MODE = originalTestMode;
    }
    if (originalSignalFile === undefined) {
      delete process.env.OPENCLAW_AVATAR_TEST_SIGNAL_FILE;
    } else {
      process.env.OPENCLAW_AVATAR_TEST_SIGNAL_FILE = originalSignalFile;
    }
    if (originalDepsBaseRunner === undefined) {
      delete process.env.OPENCLAW_AVATAR_DEPS_BASE_RUNNER;
    } else {
      process.env.OPENCLAW_AVATAR_DEPS_BASE_RUNNER = originalDepsBaseRunner;
    }
    if (originalRunnerPath === undefined) {
      delete process.env.OPENCLAW_AVATAR_RUNNER_PATH;
    } else {
      process.env.OPENCLAW_AVATAR_RUNNER_PATH = originalRunnerPath;
    }
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
    tmpDir = "";
  });

  it("writes connect-only runtime signals using the actual runner entry", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "avatar-runner-test-"));
    const signalFile = path.join(tmpDir, "signals.ndjson");
    const runnerPath = path.join(process.cwd(), "avatar", "avatar-agent-runner.js");
    process.env.OPENCLAW_AVATAR_TEST_MODE = "connect-only";
    process.env.OPENCLAW_AVATAR_TEST_SIGNAL_FILE = signalFile;
    process.env.OPENCLAW_AVATAR_DEPS_BASE_RUNNER = runnerPath;
    process.env.OPENCLAW_AVATAR_RUNNER_PATH = runnerPath;

    const room = new EventEmitter() as EventEmitter & {
      name: string;
      remoteParticipants: Map<string, unknown>;
    };
    room.name = "openclaw-main-testroom";
    room.remoteParticipants = new Map();

    const participant = { identity: "control-ui-test" };
    const ctx = {
      job: {
        metadata: JSON.stringify({
          sessionKey: "agent:main:main",
          imageUrl: "https://example.com/avatar.png",
          interruptReplyOnNewMessage: true,
        }),
      },
      room,
      connect: vi.fn(async () => {
        queueMicrotask(() => {
          room.emit("participant_connected", participant);
        });
      }),
      waitForParticipant: vi.fn(async () => {
        return participant;
      }),
    };

    const entryPromise = avatarAgent.entry(ctx);
    await waitForSignalEvent(signalFile, "awaiting-room-disconnect");
    room.emit("disconnected");
    await entryPromise;

    const events = (await readFile(signalFile, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type?: string; roomName?: string; participantIdentity?: string });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "job-entry-begin",
          roomName: "openclaw-main-testroom",
        }),
        expect.objectContaining({
          type: "ctx-connect-succeeded",
          roomName: "openclaw-main-testroom",
        }),
        expect.objectContaining({
          type: "wait-for-participant-succeeded",
          participantIdentity: "control-ui-test",
        }),
      ]),
    );
    expect(ctx.connect).toHaveBeenCalledTimes(1);
    expect(ctx.waitForParticipant).toHaveBeenCalledTimes(1);
  });

  it("skips dependency loading in connect-only test mode", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "avatar-runner-test-"));
    const signalFile = path.join(tmpDir, "signals.ndjson");
    process.env.OPENCLAW_AVATAR_TEST_MODE = "connect-only";
    process.env.OPENCLAW_AVATAR_TEST_SIGNAL_FILE = signalFile;
    delete process.env.OPENCLAW_AVATAR_DEPS_BASE_RUNNER;
    delete process.env.OPENCLAW_AVATAR_RUNNER_PATH;

    const room = new EventEmitter() as EventEmitter & {
      name: string;
      remoteParticipants: Map<string, unknown>;
    };
    room.name = "openclaw-main-testroom";
    room.remoteParticipants = new Map();

    const participant = { identity: "control-ui-test" };
    const ctx = {
      job: {
        metadata: JSON.stringify({
          sessionKey: "agent:main:main",
          imageUrl: "https://example.com/avatar.png",
          interruptReplyOnNewMessage: false,
        }),
      },
      room,
      connect: vi.fn(async () => {
        queueMicrotask(() => {
          room.emit("participant_connected", participant);
        });
      }),
      waitForParticipant: vi.fn(async () => participant),
    };

    const entryPromise = avatarAgent.entry(ctx);
    await waitForSignalEvent(signalFile, "awaiting-room-disconnect");
    room.emit("disconnected");

    await expect(entryPromise).resolves.toBeUndefined();
    expect(ctx.connect).toHaveBeenCalledTimes(1);
    expect(ctx.waitForParticipant).toHaveBeenCalledTimes(1);
  });

  it("ignores incomplete NDJSON lines while waiting for a signal event", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "avatar-runner-test-"));
    const signalFile = path.join(tmpDir, "signals.ndjson");
    await writeFile(signalFile, '{"type":"unrelated"}\n{"type":"awaiting-room-disconnect"', "utf8");

    const waitPromise = waitForSignalEvent(signalFile, "awaiting-room-disconnect", 1_000);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await appendFile(signalFile, '\n{"type":"awaiting-room-disconnect"}\n', "utf8");

    await expect(waitPromise).resolves.toBeUndefined();
  });
});

describe("avatarAgent lifecycle", () => {
  const originalGatewayUrl = process.env.OPENCLAW_AVATAR_GATEWAY_URL;
  const originalPluginUrl = process.env.OPENCLAW_AVATAR_PLUGIN_URL;
  const originalLemonSliceApiKey = process.env.OPENCLAW_AVATAR_LEMONSLICE_API_KEY;
  const originalDepsBaseRunner = process.env.OPENCLAW_AVATAR_DEPS_BASE_RUNNER;
  const originalRunnerPath = process.env.OPENCLAW_AVATAR_RUNNER_PATH;
  const originalFetch = globalThis.fetch;
  let tmpDir = "";

  afterEach(async () => {
    if (originalGatewayUrl === undefined) {
      delete process.env.OPENCLAW_AVATAR_GATEWAY_URL;
    } else {
      process.env.OPENCLAW_AVATAR_GATEWAY_URL = originalGatewayUrl;
    }
    if (originalPluginUrl === undefined) {
      delete process.env.OPENCLAW_AVATAR_PLUGIN_URL;
    } else {
      process.env.OPENCLAW_AVATAR_PLUGIN_URL = originalPluginUrl;
    }
    if (originalLemonSliceApiKey === undefined) {
      delete process.env.OPENCLAW_AVATAR_LEMONSLICE_API_KEY;
    } else {
      process.env.OPENCLAW_AVATAR_LEMONSLICE_API_KEY = originalLemonSliceApiKey;
    }
    if (originalDepsBaseRunner === undefined) {
      delete process.env.OPENCLAW_AVATAR_DEPS_BASE_RUNNER;
    } else {
      process.env.OPENCLAW_AVATAR_DEPS_BASE_RUNNER = originalDepsBaseRunner;
    }
    if (originalRunnerPath === undefined) {
      delete process.env.OPENCLAW_AVATAR_RUNNER_PATH;
    } else {
      process.env.OPENCLAW_AVATAR_RUNNER_PATH = originalRunnerPath;
    }
    globalThis.fetch = originalFetch;
    delete (globalThis as { __openclawAvatarRunnerTestState?: unknown })
      .__openclawAvatarRunnerTestState;
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
    tmpDir = "";
  });

  it("disables automatic session shutdown when participants disconnect", async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "avatar-runner-deps-"));
    const runnerPath = await writeMockLiveKitDeps(tmpDir);
    const state = ((globalThis as { __openclawAvatarRunnerTestState?: any })
      .__openclawAvatarRunnerTestState = {
      sessionStartOptions: [],
      avatarStartCalls: [],
    });

    process.env.OPENCLAW_AVATAR_GATEWAY_URL = "ws://127.0.0.1:18789";
    process.env.OPENCLAW_AVATAR_LEMONSLICE_API_KEY = "test-api-key";
    process.env.OPENCLAW_AVATAR_DEPS_BASE_RUNNER = runnerPath;
    process.env.OPENCLAW_AVATAR_RUNNER_PATH = runnerPath;
    globalThis.fetch = vi.fn(
      async () => createMockSseResponse([": keepalive\n\n"]) as unknown as Response,
    ) as unknown as typeof fetch;

    const room = new EventEmitter() as EventEmitter & {
      name: string;
      remoteParticipants: Map<string, unknown>;
      localParticipant: {
        trackPublications: Map<string, unknown>;
        publishData: ReturnType<typeof vi.fn>;
      };
    };
    room.name = "openclaw-main-testroom";
    room.remoteParticipants = new Map();
    room.localParticipant = {
      trackPublications: new Map(),
      publishData: vi.fn(async () => {}),
    };

    const entryPromise = avatarAgent.entry({
      job: {
        metadata: JSON.stringify({
          sessionKey: "agent:main:main",
          imageUrl: "https://example.com/avatar.png",
          interruptReplyOnNewMessage: true,
        }),
      },
      room,
    });

    await waitForCondition(
      () => state.sessionStartOptions.length === 1 && state.avatarStartCalls.length === 1,
      2_000,
    );

    room.emit("participant_disconnected", { identity: "control-ui-test" });

    expect(state.sessionStartOptions[0]).toMatchObject({
      inputOptions: {
        audioEnabled: true,
        textEnabled: true,
        closeOnDisconnect: false,
      },
      outputOptions: {
        audioEnabled: true,
      },
    });
    expect(state.avatarStartCalls[0]).toMatchObject({
      roomName: "openclaw-main-testroom",
      options: {
        extraPayload: {
          aspect_ratio: "3x2",
        },
      },
    });

    room.emit("disconnected");

    await expect(entryPromise).resolves.toBeUndefined();
  });
});
