import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPluginRuntimeMock } from "../test-utils/plugin-runtime-mock.ts";
import plugin from "./index.js";

const {
  mockSpawn,
  mockStat,
  actualStatHolder,
  mockFetch,
  mockResetProcessGroupChildren,
  mockStopChildProcess,
  mockStopMatchingProcesses,
} = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockStat: vi.fn(),
  actualStatHolder: { stat: null as null | ((path: string) => Promise<unknown>) },
  mockFetch: vi.fn(),
  mockResetProcessGroupChildren: vi.fn().mockResolvedValue(undefined),
  mockStopChildProcess: vi.fn().mockResolvedValue(undefined),
  mockStopMatchingProcesses: vi.fn().mockResolvedValue([]),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: vi.fn(() => Buffer.from("audio-bytes")),
  };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: mockSpawn,
  };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  actualStatHolder.stat = actual.stat as unknown as (path: string) => Promise<unknown>;
  return {
    ...actual,
    stat: mockStat,
  };
});

vi.mock("./sidecar-process-control.js", () => ({
  resetProcessGroupChildren: mockResetProcessGroupChildren,
  stopChildProcess: mockStopChildProcess,
  stopMatchingProcesses: mockStopMatchingProcesses,
}));

type RespondCall = [boolean, unknown?, { code: string; message: string }?];
type RegisteredHttpRoute = {
  path: string;
  handler: (req: unknown, res: unknown) => Promise<boolean>;
};

const baseConfig = {
  session: { mainKey: "main" },
  videoChat: {
    provider: "lemonslice" as const,
    lemonSlice: {
      apiKey: "ls-key",
      imageUrl: "https://example.com/avatar.png",
    },
    livekit: {
      url: "wss://example.livekit.cloud",
      apiKey: "lk-key",
      apiSecret: "lk-secret",
    },
  },
  messages: {
    tts: {
      elevenlabs: {
        apiKey: "eleven-key",
      },
    },
  },
};

const DEFAULT_GATEWAY_PORT = 1;
const SIDE_CAR_INSTANCE_ARG = `--openclaw-video-chat-instance=gateway-port-${DEFAULT_GATEWAY_PORT}`;
const SERVICE_GATEWAY_INSTANCE_ARG = "--openclaw-video-chat-instance=gateway-port-4321";

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as Record<string, unknown>;
}

function setup(config: unknown = baseConfig) {
  const runtime = createPluginRuntimeMock();
  const methods = new Map<string, unknown>();
  const services: unknown[] = [];
  const httpRoutes: unknown[] = [];
  const cliCommands: unknown[] = [];

  vi.mocked(runtime.config.loadConfig).mockReturnValue(config as never);
  vi.mocked(runtime.tts.textToSpeech).mockResolvedValue({
    success: true,
    audioPath: "/tmp/video-chat.mp3",
    provider: "elevenlabs",
    outputFormat: "mp3_44100_128",
  });
  vi.mocked(runtime.stt.transcribeAudioFile).mockResolvedValue({
    text: "hello from microphone",
  });

  plugin.register({
    id: "video-chat",
    name: "Claw Cast",
    source: "test",
    config,
    pluginConfig: {},
    runtime,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    registerGatewayMethod: (method: string, handler: unknown) => methods.set(method, handler),
    registerService: (service: unknown) => services.push(service),
    registerTool: () => {},
    registerHook: () => {},
    registerHttpRoute: (route: unknown) => httpRoutes.push(route),
    registerChannel: () => {},
    registerProvider: () => {},
    registerCli: (command: unknown) => cliCommands.push(command),
    registerCommand: () => {},
    resolvePath: (input: string) => `/tmp/${input}`,
    on: () => {},
    description: "test",
    version: "0",
  } as Parameters<typeof plugin.register>[0]);

  return { runtime, methods, services, httpRoutes, cliCommands };
}

function createSpawnedChild(pid: number): EventEmitter & {
  pid: number;
  kill: ReturnType<typeof vi.fn>;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  stdout: EventEmitter;
  stderr: EventEmitter;
} {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    kill: ReturnType<typeof vi.fn>;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.pid = pid;
  child.kill = vi.fn();
  child.exitCode = null;
  child.signalCode = null;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(() => resolve());
  });
}

class MockHttpResponse {
  statusCode = 200;
  headers = new Map<string, string>();
  body = "";

  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
  }

  end(body = "") {
    this.body += body;
  }

  header(name: string) {
    return this.headers.get(name.toLowerCase()) ?? null;
  }
}

async function invokeHttpRoute(
  httpRoutes: unknown[],
  routePath: string,
  request: {
    url: string;
    method?: string;
    body?: Record<string, unknown>;
  },
) {
  const route = httpRoutes.find(
    (entry): entry is RegisteredHttpRoute =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as RegisteredHttpRoute | null)?.path === "string" &&
      typeof (entry as RegisteredHttpRoute | null)?.handler === "function" &&
      (entry as RegisteredHttpRoute).path === routePath,
  );
  if (!route) {
    throw new Error(`missing HTTP route ${routePath}`);
  }

  const req = new EventEmitter() as EventEmitter & { url?: string; method?: string };
  req.url = request.url;
  req.method = request.method ?? "GET";
  const res = new MockHttpResponse();
  const handledPromise = route.handler(req, res);

  if (request.body !== undefined) {
    queueMicrotask(() => {
      req.emit("data", JSON.stringify(request.body));
      req.emit("end");
    });
  }

  const handled = await handledPromise;
  return { handled, res };
}

async function invoke(
  methods: Map<string, unknown>,
  method:
    | "videoChat.config"
    | "videoChat.setup.get"
    | "videoChat.setup.save"
    | "videoChat.session.create"
    | "videoChat.session.stop"
    | "videoChat.chat.history"
    | "videoChat.chat.send"
    | "videoChat.audio.transcribe"
    | "videoChat.tts.generate",
  params: Record<string, unknown>,
) {
  const handler = methods.get(method) as
    | ((ctx: {
        params: Record<string, unknown>;
        respond: ReturnType<typeof vi.fn>;
      }) => Promise<void>)
    | undefined;
  const respond = vi.fn();
  await handler?.({ params, respond });
  return respond;
}

describe("video-chat plugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    delete process.env.OPENCLAW_VIDEO_CHAT_AGENT_RUNNER;
    mockSpawn.mockImplementation(() => createSpawnedChild(4999));
    mockStopMatchingProcesses.mockResolvedValue([]);
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ text: "hello from microphone" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );
    mockStat.mockImplementation(async (candidate: string) => {
      if (
        candidate.endsWith("/video-chat/video-chat-agent-runner.js") ||
        candidate.endsWith("/mock-openclaw/dist/video-chat-agent-runner.js") ||
        candidate.endsWith("/mock-openclaw/index.js")
      ) {
        return {
          isFile: () => true,
          isDirectory: () => false,
        };
      }
      if (!actualStatHolder.stat) {
        throw new Error("missing actual stat implementation");
      }
      return actualStatHolder.stat(candidate);
    });
  });

  it("registers Claw Cast gateway methods and sidecar service", () => {
    const { methods, services, httpRoutes, cliCommands } = setup();
    expect(methods.has("videoChat.config")).toBe(true);
    expect(methods.has("videoChat.setup.get")).toBe(true);
    expect(methods.has("videoChat.setup.save")).toBe(true);
    expect(methods.has("videoChat.session.create")).toBe(true);
    expect(methods.has("videoChat.session.stop")).toBe(true);
    expect(methods.has("videoChat.audio.transcribe")).toBe(true);
    expect(methods.has("videoChat.tts.generate")).toBe(true);
    expect(services).toHaveLength(1);
    expect(httpRoutes).toHaveLength(9);
    expect(httpRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/plugins/video-chat/api",
          auth: "gateway",
          match: "prefix",
        }),
        expect.objectContaining({
          path: "/plugins/video-chat",
          auth: "plugin",
          match: "exact",
        }),
        expect.objectContaining({
          path: "/plugins/video-chat/config",
          auth: "plugin",
          match: "exact",
        }),
        expect.objectContaining({
          path: "/plugins/video-chat/readme",
          auth: "plugin",
          match: "exact",
        }),
        expect.objectContaining({
          path: "/plugins/video-chat/settings",
          auth: "plugin",
          match: "exact",
        }),
        expect.objectContaining({
          path: "/plugins/video-chat/bootstrap",
          auth: "plugin",
          match: "exact",
        }),
        expect.objectContaining({
          path: "/plugins/video-chat/app.js",
          auth: "plugin",
          match: "exact",
        }),
        expect.objectContaining({
          path: "/plugins/video-chat/assets",
          auth: "plugin",
          match: "prefix",
        }),
        expect.objectContaining({
          path: "/plugins/video-chat/styles",
          auth: "plugin",
          match: "prefix",
        }),
      ]),
    );
    expect(cliCommands).toHaveLength(1);
  });

  it("registers gateway token as the first video-chat setup CLI option", () => {
    const { cliCommands } = setup();
    const registerCli = cliCommands[0] as ((ctx: { program: unknown }) => void) | undefined;
    const optionFlags: string[] = [];
    let actionHandler: unknown;
    const commandApi = {
      description(description: string) {
        expect(description).toContain("gateway auth");
        return commandApi;
      },
      option(flag: string) {
        optionFlags.push(flag);
        return commandApi;
      },
      action(handler: unknown) {
        actionHandler = handler;
        return commandApi;
      },
    };

    registerCli?.({
      program: {
        command(name: string) {
          expect(name).toBe("video-chat-setup");
          return commandApi;
        },
      },
    });

    expect(optionFlags[0]).toBe("--gateway-token <token>");
    expect(actionHandler).toBeTypeOf("function");
  });

  it("prefers the bundled bridge runner over the native gateway sidecar command", async () => {
    process.env.OPENCLAW_VIDEO_CHAT_AGENT_RUNNER = "/mock-openclaw/dist/video-chat-agent-runner.js";
    mockStat.mockImplementation(async (candidate: string) => {
      if (
        candidate.endsWith("/video-chat/video-chat-agent-runner.js") ||
        candidate.endsWith("/mock-openclaw/dist/video-chat-agent-runner.js") ||
        candidate.endsWith("/mock-openclaw/index.js")
      ) {
        return {
          isFile: () => true,
          isDirectory: () => false,
        };
      }
      if (!actualStatHolder.stat) {
        throw new Error("missing actual stat implementation");
      }
      return actualStatHolder.stat(candidate);
    });
    const { services } = setup();
    const service = services[0] as
      | {
          start?: (ctx: { config: typeof baseConfig; gateway: { port: number; auth: object } }) => Promise<void>;
          stop?: () => Promise<void>;
        }
      | undefined;
    expect(service?.start).toBeTypeOf("function");

    const child = createSpawnedChild(4101);
    mockSpawn.mockImplementationOnce(() => child);

    await service?.start?.({
      config: baseConfig,
      gateway: {
        port: 4321,
        auth: { mode: "token", token: "gateway-token" },
      },
    });

    await flushMicrotasks();
    await flushMicrotasks();

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockStopMatchingProcesses).toHaveBeenCalledWith({
      commandPatterns: [
        [
          "job_proc_lazy_main.cjs",
          expect.stringContaining("/video-chat/video-chat-agent-runner-wrapper.mjs"),
          SERVICE_GATEWAY_INSTANCE_ARG,
        ],
        [
          expect.stringContaining("/video-chat/video-chat-agent-bridge.mjs"),
          SERVICE_GATEWAY_INSTANCE_ARG,
        ],
      ],
      termTimeoutMs: 400,
      postKillDelayMs: 200,
    });
    expect(mockSpawn.mock.calls[0]?.[1]).toEqual([
      expect.stringContaining("/video-chat/video-chat-agent-bridge.mjs"),
      expect.stringContaining("/video-chat/video-chat-agent-runner.js"),
      "/mock-openclaw/dist/video-chat-agent-runner.js",
      SERVICE_GATEWAY_INSTANCE_ARG,
    ]);
    await service?.stop?.();
  });

  it("uses the bundled bridge for the packaged runner by default", async () => {
    const { services } = setup();
    const service = services[0] as
      | {
          start?: (ctx: { config: typeof baseConfig; gateway: { port: number; auth: object } }) => Promise<void>;
          stop?: () => Promise<void>;
        }
      | undefined;
    expect(service?.start).toBeTypeOf("function");

    const child = createSpawnedChild(4102);
    mockSpawn.mockImplementationOnce(() => child);

    await service?.start?.({
      config: baseConfig,
      gateway: {
        port: 4321,
        auth: { mode: "token", token: "gateway-token" },
      },
    });

    await flushMicrotasks();

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockStopMatchingProcesses).toHaveBeenCalledWith({
      commandPatterns: [
        [
          "job_proc_lazy_main.cjs",
          expect.stringContaining("/video-chat/video-chat-agent-runner-wrapper.mjs"),
          SERVICE_GATEWAY_INSTANCE_ARG,
        ],
        [
          expect.stringContaining("/video-chat/video-chat-agent-bridge.mjs"),
          SERVICE_GATEWAY_INSTANCE_ARG,
        ],
      ],
      termTimeoutMs: 400,
      postKillDelayMs: 200,
    });
    expect(mockSpawn.mock.calls[0]?.[1]).toEqual([
      expect.stringContaining("/video-chat/video-chat-agent-bridge.mjs"),
      expect.stringContaining("/video-chat/video-chat-agent-runner.js"),
      expect.stringContaining("/openclaw/dist/video-chat-agent-runner.js"),
      SERVICE_GATEWAY_INSTANCE_ARG,
    ]);
    await service?.stop?.();
  });

  it("serializes concurrent sidecar startup", async () => {
    const { services } = setup();
    const service = services[0] as
      | {
          start?: (ctx: { config: typeof baseConfig; gateway: { port: number; auth: object } }) => Promise<void>;
          stop?: () => Promise<void>;
        }
      | undefined;
    expect(service?.start).toBeTypeOf("function");

    const child = createSpawnedChild(4103);
    mockSpawn.mockImplementationOnce(() => child);

    let resolveCleanup: (value: number[]) => void = () => {};
    const cleanupPromise = new Promise<number[]>((resolve) => {
      resolveCleanup = resolve;
    });
    mockStopMatchingProcesses.mockImplementationOnce(() => cleanupPromise);

    const startOne = service?.start?.({
      config: baseConfig,
      gateway: {
        port: 4321,
        auth: { mode: "token", token: "gateway-token" },
      },
    });
    const startTwo = service?.start?.({
      config: baseConfig,
      gateway: {
        port: 4321,
        auth: { mode: "token", token: "gateway-token" },
      },
    });

    try {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });

      expect(mockStopMatchingProcesses).toHaveBeenCalledTimes(1);
      expect(mockSpawn).not.toHaveBeenCalled();

      resolveCleanup([]);
      await Promise.all([startOne, startTwo]);
      await flushMicrotasks();

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      await service?.stop?.();
    } finally {
      resolveCleanup([]);
    }
  });

  it("returns redacted Claw Cast config state", async () => {
    const { methods } = setup();
    const respond = await invoke(methods, "videoChat.config", {});

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    expect(
      (call?.[1] as { config?: { configured?: boolean } } | undefined)?.config?.configured,
    ).toBe(true);
  });

  it("reads plugin-owned config from the plugin entry overlay", async () => {
    const { methods } = setup({
      session: { mainKey: "main" },
      plugins: {
        entries: {
          "video-chat": {
            config: {
              videoChat: baseConfig.videoChat,
              messages: baseConfig.messages,
            },
          },
        },
      },
    });

    const respond = await invoke(methods, "videoChat.config", {});
    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    expect(call?.[1]).toMatchObject({
      config: {
        configured: true,
        lemonSlice: {
          imageUrl: "https://example.com/avatar.png",
        },
      },
    });
  });

  it("mints a browser participant token for a session", async () => {
    const { methods } = setup();
    const respond = await invoke(methods, "videoChat.session.create", {
      sessionKey: "agent:main/main",
      interruptReplyOnNewMessage: true,
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    const payload = call?.[1] as
      | {
          roomName?: string;
          participantToken?: string;
          agentName?: string;
          interruptReplyOnNewMessage?: boolean;
        }
      | undefined;
    expect(payload?.roomName).toContain("openclaw-agent-main-main-");
    expect(payload?.participantToken?.split(".")).toHaveLength(3);
    expect(payload?.agentName).toBe("openclaw-video-chat");
    expect(payload?.interruptReplyOnNewMessage).toBe(true);
    expect(decodeJwtPayload(payload?.participantToken ?? "")).toMatchObject({
      roomConfig: {
        agents: [
          {
            agentName: "openclaw-video-chat",
            metadata:
              '{"sessionKey":"agent:main/main","imageUrl":"https://example.com/avatar.png","interruptReplyOnNewMessage":true}',
          },
        ],
      },
    });
  });

  it("returns canonical chat session key for default main session", async () => {
    const { methods } = setup();
    const respond = await invoke(methods, "videoChat.session.create", {});

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    const payload = call?.[1] as
      | {
          sessionKey?: string;
          chatSessionKey?: string;
          participantToken?: string;
        }
      | undefined;
    expect(payload?.sessionKey).toBe("main");
    expect(payload?.chatSessionKey).toBe("agent:main:main");
    expect(decodeJwtPayload(payload?.participantToken ?? "")).toMatchObject({
      roomConfig: {
        agents: [
          {
            metadata:
              '{"sessionKey":"agent:main:main","imageUrl":"https://example.com/avatar.png","interruptReplyOnNewMessage":false}',
          },
        ],
      },
    });
  });

  it("stops a session", async () => {
    const { methods } = setup();
    const respond = await invoke(methods, "videoChat.session.stop", {
      roomName: "openclaw-main-12345678",
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    expect(call?.[1]).toEqual({
      stopped: true,
      roomName: "openclaw-main-12345678",
    });
  });

  it("cleans stale wrapper jobs during session stop", async () => {
    const { methods } = setup();

    await invoke(methods, "videoChat.session.create", {});
    await invoke(methods, "videoChat.session.stop", {
      roomName: "openclaw-main-12345678",
    });

    expect(mockStopMatchingProcesses).toHaveBeenNthCalledWith(1, {
      commandPatterns: [
        [
          "job_proc_lazy_main.cjs",
          expect.stringContaining("/video-chat/video-chat-agent-runner-wrapper.mjs"),
          SIDE_CAR_INSTANCE_ARG,
        ],
        [expect.stringContaining("/video-chat/video-chat-agent-bridge.mjs"), SIDE_CAR_INSTANCE_ARG],
      ],
      termTimeoutMs: 400,
      postKillDelayMs: 200,
    });
    expect(mockStopMatchingProcesses).toHaveBeenNthCalledWith(2, {
      commandPatterns: [
        [
          "job_proc_lazy_main.cjs",
          expect.stringContaining("/video-chat/video-chat-agent-runner-wrapper.mjs"),
          SIDE_CAR_INSTANCE_ARG,
        ],
      ],
      keepPids: [4999],
      termTimeoutMs: 400,
      postKillDelayMs: 200,
    });
  });

  it("loads chat history through the runtime subagent API", async () => {
    const { httpRoutes, runtime } = setup();
    vi.mocked(runtime.subagent.getSessionMessages).mockResolvedValueOnce({
      messages: [
        {
          role: "user",
          content: [{ type: "input_text", text: "hello" }],
          idempotencyKey: "voice-chat-run-browser-123",
        },
      ],
    });

    const { handled, res } = await invokeHttpRoute(httpRoutes, "/plugins/video-chat/api", {
      url: "/plugins/video-chat/api/chat/history",
      method: "POST",
      body: {
        sessionKey: "agent:main:main",
        limit: 12,
      },
    });

    expect(handled).toBe(true);
    expect(runtime.subagent.getSessionMessages).toHaveBeenCalledWith({
      sessionKey: "agent:main:main",
      limit: 12,
    });
    expect(JSON.parse(res.body)).toEqual({
      success: true,
      messages: [
        {
          role: "user",
          content: [{ type: "input_text", text: "hello" }],
          idempotencyKey: "voice-chat-run-browser-123",
        },
      ],
    });
  });

  it("sends chat messages through the runtime subagent API", async () => {
    const { httpRoutes, runtime } = setup();
    vi.mocked(runtime.subagent.run).mockResolvedValueOnce({
      runId: "run-123",
    });

    const { handled, res } = await invokeHttpRoute(httpRoutes, "/plugins/video-chat/api", {
      url: "/plugins/video-chat/api/chat/send",
      method: "POST",
      body: {
        sessionKey: "agent:main:main",
        message: "show me the bug",
        idempotencyKey: "video-chat-ui-123",
        attachments: [
          {
            type: "image",
            mimeType: "image/png",
            fileName: "error.png",
            content: "Zm9v",
          },
        ],
      },
    });

    expect(handled).toBe(true);
    expect(runtime.subagent.run).toHaveBeenCalledWith({
      sessionKey: "agent:main:main",
      message: "show me the bug",
      deliver: false,
      idempotencyKey: "video-chat-ui-123",
      attachments: [
        {
          type: "image",
          mimeType: "image/png",
          fileName: "error.png",
          content: "Zm9v",
        },
      ],
    });
    expect(JSON.parse(res.body)).toEqual({
      success: true,
      response: {
        runId: "run-123",
      },
    });
  });

  it("loads chat history through the gateway method", async () => {
    const { methods, runtime } = setup();
    vi.mocked(runtime.subagent.getSessionMessages).mockResolvedValueOnce({
      messages: [
        {
          role: "user",
          content: [{ type: "input_text", text: "hello" }],
          idempotencyKey: "voice-chat-run-browser-123",
        },
      ],
    });

    const respond = await invoke(methods, "videoChat.chat.history", {
      sessionKey: "agent:main:main",
      limit: 12,
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    expect(runtime.subagent.getSessionMessages).toHaveBeenCalledWith({
      sessionKey: "agent:main:main",
      limit: 12,
    });
    expect(call?.[1]).toEqual({
      messages: [
        {
          role: "user",
          content: [{ type: "input_text", text: "hello" }],
          idempotencyKey: "voice-chat-run-browser-123",
        },
      ],
    });
  });

  it("sends chat messages through the gateway method", async () => {
    const { methods, runtime } = setup();
    vi.mocked(runtime.subagent.run).mockResolvedValueOnce({
      runId: "run-123",
    });

    const respond = await invoke(methods, "videoChat.chat.send", {
      sessionKey: "agent:main:main",
      message: "show me the bug",
      idempotencyKey: "video-chat-ui-123",
      attachments: [
        {
          type: "image",
          mimeType: "image/png",
          fileName: "error.png",
          content: "Zm9v",
        },
      ],
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    expect(runtime.subagent.run).toHaveBeenCalledWith({
      sessionKey: "agent:main:main",
      message: "show me the bug",
      deliver: false,
      idempotencyKey: "video-chat-ui-123",
      attachments: [
        {
          type: "image",
          mimeType: "image/png",
          fileName: "error.png",
          content: "Zm9v",
        },
      ],
    });
    expect(call?.[1]).toEqual({
      runId: "run-123",
    });
  });

  it("rejects invalid chat history params through the gateway method", async () => {
    const { methods, runtime } = setup();

    const respond = await invoke(methods, "videoChat.chat.history", {
      sessionKey: "   ",
      limit: 12,
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(false);
    expect(call?.[2]).toEqual({
      code: "INVALID_REQUEST",
      message: "invalid videoChat.chat.history params",
    });
    expect(runtime.subagent.getSessionMessages).not.toHaveBeenCalled();
  });

  it("rejects invalid chat send params through the gateway method", async () => {
    const { methods, runtime } = setup();
    const oversizedContent = "x".repeat(10 * 1024 * 1024 + 1);

    const respond = await invoke(methods, "videoChat.chat.send", {
      sessionKey: "agent:main:main",
      message: "show me the bug",
      attachments: [
        {
          type: "image",
          mimeType: "image/png",
          fileName: "error.png",
          content: oversizedContent,
        },
      ],
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(false);
    expect(call?.[2]).toEqual({
      code: "INVALID_REQUEST",
      message: "invalid videoChat.chat.send params",
    });
    expect(runtime.subagent.run).not.toHaveBeenCalled();
  });

  it("returns setup state for plugin-owned setup surfaces", async () => {
    const { methods } = setup();
    const respond = await invoke(methods, "videoChat.setup.get", {});

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    expect((call?.[1] as { setup?: { configured?: boolean } } | undefined)?.setup?.configured).toBe(
      true,
    );
  });

  it("saves setup values while preserving blank secrets", async () => {
    const { methods, runtime } = setup();
    const respond = await invoke(methods, "videoChat.setup.save", {
      lemonSliceApiKey: "",
      lemonSliceImageUrl: "https://example.com/new-avatar.png",
      livekitUrl: "wss://new.livekit.cloud",
      livekitApiKey: "",
      livekitApiSecret: "",
      elevenLabsApiKey: "",
      elevenLabsVoiceId: "voice-1234",
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    expect(runtime.config.writeConfigFile).toHaveBeenCalledTimes(1);
    const savedConfig = vi.mocked(runtime.config.writeConfigFile).mock.calls[0]?.[0] as
      | {
          plugins?: {
            entries?: {
              "video-chat"?: {
                config?: {
                  videoChat?: {
                    lemonSlice?: { apiKey?: string; imageUrl?: string };
                    livekit?: { url?: string; apiKey?: string; apiSecret?: string };
                  };
                  messages?: { tts?: { elevenlabs?: { apiKey?: string; voiceId?: string } } };
                };
              };
            };
          };
        }
      | undefined;
    const pluginConfig = savedConfig?.plugins?.entries?.["video-chat"]?.config;
    expect(pluginConfig?.videoChat?.lemonSlice?.apiKey).toBe("ls-key");
    expect(pluginConfig?.videoChat?.lemonSlice?.imageUrl).toBe("https://example.com/new-avatar.png");
    expect(pluginConfig?.videoChat?.livekit?.url).toBe("wss://new.livekit.cloud");
    expect(pluginConfig?.videoChat?.livekit?.apiKey).toBe("lk-key");
    expect(pluginConfig?.videoChat?.livekit?.apiSecret).toBe("lk-secret");
    expect(pluginConfig?.messages?.tts?.elevenlabs?.apiKey).toBe("eleven-key");
    expect(pluginConfig?.messages?.tts?.elevenlabs?.voiceId).toBe("voice-1234");
  });

  it("saves gateway token into the root gateway auth config", async () => {
    const { methods, runtime } = setup({
      ...baseConfig,
      gateway: {
        port: 18789,
        auth: { mode: "token", token: "old-gateway-token" },
      },
    });

    const respond = await invoke(methods, "videoChat.setup.save", {
      gatewayToken: "new-gateway-token",
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    const savedConfig = vi.mocked(runtime.config.writeConfigFile).mock.calls[0]?.[0] as
      | {
          gateway?: {
            port?: number;
            auth?: { mode?: string; token?: string };
          };
        }
      | undefined;
    expect(savedConfig?.gateway).toEqual({
      port: 18789,
      auth: { mode: "token", token: "new-gateway-token" },
    });
  });

  it("preserves the existing gateway token when setup save receives a blank token", async () => {
    const { methods, runtime } = setup({
      ...baseConfig,
      gateway: {
        port: 18789,
        auth: { mode: "token", token: "existing-gateway-token" },
      },
    });

    const respond = await invoke(methods, "videoChat.setup.save", {
      gatewayToken: "",
      lemonSliceImageUrl: "https://example.com/new-avatar.png",
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    const savedConfig = vi.mocked(runtime.config.writeConfigFile).mock.calls[0]?.[0] as
      | {
          gateway?: {
            port?: number;
            auth?: { mode?: string; token?: string };
          };
        }
      | undefined;
    expect(savedConfig?.gateway).toEqual({
      port: 18789,
      auth: { mode: "token", token: "existing-gateway-token" },
    });
  });

  it("saves setup values while preserving redacted secrets", async () => {
    const { methods, runtime } = setup();
    const respond = await invoke(methods, "videoChat.setup.save", {
      lemonSliceApiKey: "_REDACTED_",
      lemonSliceImageUrl: "https://example.com/new-avatar.png",
      livekitUrl: "wss://new.livekit.cloud",
      livekitApiKey: "__OPENCLAW_REDACTED__",
      livekitApiSecret: "_REDACTED_",
      elevenLabsApiKey: "__OPENCLAW_REDACTED__",
      elevenLabsVoiceId: "voice-1234",
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    expect(runtime.config.writeConfigFile).toHaveBeenCalledTimes(1);
    const savedConfig = vi.mocked(runtime.config.writeConfigFile).mock.calls[0]?.[0] as
      | {
          plugins?: {
            entries?: {
              "video-chat"?: {
                config?: {
                  videoChat?: {
                    lemonSlice?: { apiKey?: string; imageUrl?: string };
                    livekit?: { url?: string; apiKey?: string; apiSecret?: string };
                  };
                  messages?: { tts?: { elevenlabs?: { apiKey?: string; voiceId?: string } } };
                };
              };
            };
          };
        }
      | undefined;
    const pluginConfig = savedConfig?.plugins?.entries?.["video-chat"]?.config;
    expect(pluginConfig?.videoChat?.lemonSlice?.apiKey).toBe("ls-key");
    expect(pluginConfig?.videoChat?.lemonSlice?.imageUrl).toBe("https://example.com/new-avatar.png");
    expect(pluginConfig?.videoChat?.livekit?.url).toBe("wss://new.livekit.cloud");
    expect(pluginConfig?.videoChat?.livekit?.apiKey).toBe("lk-key");
    expect(pluginConfig?.videoChat?.livekit?.apiSecret).toBe("lk-secret");
    expect(pluginConfig?.messages?.tts?.elevenlabs?.apiKey).toBe("eleven-key");
    expect(pluginConfig?.messages?.tts?.elevenlabs?.voiceId).toBe("voice-1234");
  });

  it("rejects invalid setup save params", async () => {
    const { methods } = setup();
    const respond = await invoke(methods, "videoChat.setup.save", {
      livekitUrl: 12,
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(false);
    expect(call?.[2]?.code).toBe("INVALID_REQUEST");
  });

  it("rejects setup save when LemonSlice image URL is not a direct URL", async () => {
    const { methods } = setup();
    const respond = await invoke(methods, "videoChat.setup.save", {
      lemonSliceImageUrl: "https://e9riw81orx.ufs.sh/f/",
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(false);
    expect(call?.[2]?.code).toBe("INVALID_REQUEST");
    expect(call?.[2]?.message).toContain("videoChat.lemonSlice.imageUrl");
  });

  it("rejects invalid session params", async () => {
    const { methods } = setup();
    const respond = await invoke(methods, "videoChat.session.create", {
      interruptReplyOnNewMessage: "yes",
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(false);
    expect(call?.[2]?.code).toBe("INVALID_REQUEST");
    expect(call?.[2]?.message).toContain("invalid videoChat.session.create params");
  });

  it("rejects invalid session stop params", async () => {
    const { methods } = setup();
    const respond = await invoke(methods, "videoChat.session.stop", {
      roomName: 12,
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(false);
    expect(call?.[2]?.code).toBe("INVALID_REQUEST");
    expect(call?.[2]?.message).toContain("invalid videoChat.session.stop params");
  });

  it("rejects session create when configured LemonSlice image URL is not direct", async () => {
    const config = {
      ...baseConfig,
      videoChat: {
        ...baseConfig.videoChat,
        lemonSlice: {
          ...baseConfig.videoChat.lemonSlice,
          imageUrl: "https://e9riw81orx.ufs.sh/f/",
        },
      },
    };
    const { methods } = setup(config);
    const respond = await invoke(methods, "videoChat.session.create", {});

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(false);
    expect(call?.[2]?.code).toBe("INVALID_REQUEST");
    expect(call?.[2]?.message).toContain("videoChat.lemonSlice.imageUrl");
  });

  it("returns generated reply audio for browser publishing", async () => {
    const { methods } = setup();
    const respond = await invoke(methods, "videoChat.tts.generate", {
      text: "Hello from OpenClaw",
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    expect((call?.[1] as { mimeType?: string } | undefined)?.mimeType).toBe("audio/mpeg");
    expect((call?.[1] as { data?: string } | undefined)?.data).toBe(
      Buffer.from("audio-bytes").toString("base64"),
    );
  });

  it("falls back to telephony runtime TTS and returns WAV audio", async () => {
    const { methods, runtime } = setup();
    (runtime.tts as { textToSpeech?: unknown }).textToSpeech = undefined;
    vi.mocked(runtime.tts.textToSpeechTelephony).mockResolvedValue({
      success: true,
      audioBuffer: Buffer.from("pcm-audio"),
      provider: "elevenlabs",
      outputFormat: "pcm_22050",
      sampleRate: 22050,
    });

    const respond = await invoke(methods, "videoChat.tts.generate", {
      text: "Hello from OpenClaw",
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    expect((call?.[1] as { mimeType?: string } | undefined)?.mimeType).toBe("audio/wav");
    const encoded = (call?.[1] as { data?: string } | undefined)?.data ?? "";
    const wavBuffer = Buffer.from(encoded, "base64");
    expect(wavBuffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("transcribes uploaded browser audio", async () => {
    const { methods, runtime } = setup();
    vi.mocked(runtime.stt.transcribeAudioFile).mockRejectedValue(
      new Error("runtime STT should not be used"),
    );
    const respond = await invoke(methods, "videoChat.audio.transcribe", {
      sessionKey: "agent:main/main",
      mimeType: "audio/webm;codecs=opus",
      data: Buffer.from("audio-bytes").toString("base64"),
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    expect((call?.[1] as { transcript?: string } | undefined)?.transcript).toBe(
      "hello from microphone",
    );
    expect(runtime.stt.transcribeAudioFile).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]?.[0]).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect(mockFetch.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "xi-api-key": "eleven-key",
      },
    });
    const requestBody = mockFetch.mock.calls[0]?.[1]?.body;
    expect(requestBody).toBeInstanceOf(FormData);
    expect((requestBody as FormData).get("model_id")).toBe("scribe_v1");
    expect((requestBody as FormData).get("file")).toBeTruthy();
  });

  it("retries transient ElevenLabs transcription failures", async () => {
    const { methods } = setup();
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "temporary upstream issue" }), {
          status: 503,
          headers: {
            "content-type": "application/json",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: "hello after retry" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }),
      );

    const respond = await invoke(methods, "videoChat.audio.transcribe", {
      mimeType: "audio/webm;codecs=opus",
      data: Buffer.from("audio-bytes").toString("base64"),
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    expect((call?.[1] as { transcript?: string } | undefined)?.transcript).toBe("hello after retry");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("serves the shipped browser shell and setup API routes", async () => {
    const { httpRoutes } = setup();
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };

    const page = await invokeHttpRoute(httpRoutes, "/plugins/video-chat", {
      url: "/plugins/video-chat",
    });
    expect(page.handled).toBe(true);
    expect(page.res.statusCode).toBe(200);
    expect(page.res.header("content-type")).toBe("text/html; charset=utf-8");
    expect(page.res.header("permissions-policy")).toBe("microphone=(self)");
    expect(page.res.body).toContain("<title>Claw Cast</title>");
    expect(page.res.body).toContain('data-shared-topbar');
    expect(page.res.body).toContain('id="package-version-value"');
    expect(page.res.body).toContain(`>${packageJson.version}</span>`);
    expect(page.res.body).not.toContain("__SHARED_SHELL_BOOTSTRAP__");

    const readmePage = await invokeHttpRoute(httpRoutes, "/plugins/video-chat/readme", {
      url: "/plugins/video-chat/readme",
    });
    expect(readmePage.handled).toBe(true);
    expect(readmePage.res.statusCode).toBe(200);
    expect(readmePage.res.header("content-type")).toBe("text/html; charset=utf-8");
    expect(readmePage.res.body).toContain("<title>Claw Cast README</title>");
    expect(readmePage.res.body).toContain("<h2>Usage tips</h2>");
    expect(readmePage.res.body).toContain("/plugins/video-chat/assets/GreenConfig.png");
    expect(readmePage.res.body).not.toContain("__README_HTML__");

    const setupApi = await invokeHttpRoute(httpRoutes, "/plugins/video-chat/api", {
      url: "/plugins/video-chat/api/setup",
    });
    expect(setupApi.handled).toBe(true);
    expect(setupApi.res.statusCode).toBe(200);
    expect(setupApi.res.header("content-type")).toBe("application/json; charset=utf-8");
    expect(JSON.parse(setupApi.res.body)).toMatchObject({
      success: true,
      setup: {
        configured: true,
        lemonSlice: {
          apiKey: "ls-key",
        },
        livekit: {
          apiKey: "lk-key",
          apiSecret: "lk-secret",
        },
        tts: {
          elevenLabsApiKey: "eleven-key",
        },
      },
    });
  });

  it("bootstraps the configured gateway token for the browser settings page", async () => {
    const { httpRoutes, runtime } = setup({
      ...baseConfig,
      gateway: {
        port: 18789,
        auth: { mode: "token", token: "gateway-token" },
      },
    });
    (runtime as typeof runtime & { openclawVersion: string }).openclawVersion = "2026.3.11";

    const bootstrap = await invokeHttpRoute(httpRoutes, "/plugins/video-chat/bootstrap", {
      url: "/plugins/video-chat/bootstrap",
    });
    expect(bootstrap.handled).toBe(true);
    expect(bootstrap.res.statusCode).toBe(200);
    expect(bootstrap.res.header("content-type")).toBe("application/json; charset=utf-8");
    expect(JSON.parse(bootstrap.res.body)).toEqual({
      success: true,
      openclaw: {
        version: "2026.3.11",
        minimumCompatibleVersion: "2026.3.11",
        compatible: true,
      },
      gateway: {
        auth: {
          mode: "token",
          token: "gateway-token",
        },
      },
    });
  });

  it("reports incompatible OpenClaw versions in the browser bootstrap payload", async () => {
    const { httpRoutes, runtime } = setup();
    (runtime as typeof runtime & { openclawVersion: string }).openclawVersion = "2026.3.10";

    const bootstrap = await invokeHttpRoute(httpRoutes, "/plugins/video-chat/bootstrap", {
      url: "/plugins/video-chat/bootstrap",
    });
    expect(bootstrap.handled).toBe(true);
    expect(bootstrap.res.statusCode).toBe(200);
    expect(JSON.parse(bootstrap.res.body)).toMatchObject({
      success: true,
      openclaw: {
        version: "2026.3.10",
        minimumCompatibleVersion: "2026.3.11",
        compatible: false,
      },
    });
  });
});
