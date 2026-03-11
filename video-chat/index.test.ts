import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPluginRuntimeMock } from "../test-utils/plugin-runtime-mock.ts";
import plugin from "./index.js";

const { mockSpawn, mockStat, actualStatHolder, mockFetch } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockStat: vi.fn(),
  actualStatHolder: { stat: null as null | ((path: string) => Promise<unknown>) },
  mockFetch: vi.fn(),
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
  resetProcessGroupChildren: vi.fn().mockResolvedValue(undefined),
  stopChildProcess: vi.fn().mockResolvedValue(undefined),
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
  stdout: EventEmitter;
  stderr: EventEmitter;
} {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.pid = pid;
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
    expect(httpRoutes).toHaveLength(6);
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
          path: "/plugins/video-chat/settings",
          auth: "plugin",
          match: "exact",
        }),
        expect.objectContaining({
          path: "/plugins/video-chat/app.js",
          auth: "plugin",
          match: "exact",
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

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockSpawn.mock.calls[0]?.[1]).toEqual([
      expect.stringContaining("/video-chat/video-chat-agent-bridge.mjs"),
      expect.stringContaining("/video-chat/video-chat-agent-runner.js"),
      "/mock-openclaw/dist/video-chat-agent-runner.js",
    ]);
    await service?.stop?.();
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
    });

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    const payload = call?.[1] as
      | {
          roomName?: string;
          participantToken?: string;
          agentName?: string;
        }
      | undefined;
    expect(payload?.roomName).toContain("openclaw-agent-main-main-");
    expect(payload?.participantToken?.split(".")).toHaveLength(3);
    expect(payload?.agentName).toBe("openclaw-video-chat");
    expect(decodeJwtPayload(payload?.participantToken ?? "")).toMatchObject({
      roomConfig: {
        agents: [
          {
            agentName: "openclaw-video-chat",
            metadata:
              '{"sessionKey":"agent:main/main","imageUrl":"https://example.com/avatar.png"}',
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
              '{"sessionKey":"agent:main:main","imageUrl":"https://example.com/avatar.png"}',
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
      sessionKey: 12,
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
    expect(page.res.body).toContain('id="package-version-value"');
    expect(page.res.body).toContain(`>${packageJson.version}</span>`);

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
});
