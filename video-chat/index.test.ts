import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPluginRuntimeMock } from "../test-utils/plugin-runtime-mock.ts";
import plugin from "./index.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync: vi.fn(() => Buffer.from("audio-bytes")),
  };
});

type RespondCall = [boolean, unknown?, { code: string; message: string }?];

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

function setup(config = baseConfig) {
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
    name: "Video Chat",
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
  });

  it("registers video chat gateway methods and sidecar service", () => {
    const { methods, services, httpRoutes, cliCommands } = setup();
    expect(methods.has("videoChat.config")).toBe(true);
    expect(methods.has("videoChat.setup.get")).toBe(true);
    expect(methods.has("videoChat.setup.save")).toBe(true);
    expect(methods.has("videoChat.session.create")).toBe(true);
    expect(methods.has("videoChat.session.stop")).toBe(true);
    expect(methods.has("videoChat.audio.transcribe")).toBe(true);
    expect(methods.has("videoChat.tts.generate")).toBe(true);
    expect(services).toHaveLength(1);
    expect(httpRoutes).toHaveLength(2);
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
          match: "prefix",
        }),
      ]),
    );
    expect(cliCommands).toHaveLength(1);
  });

  it("returns redacted video chat config state", async () => {
    const { methods } = setup();
    const respond = await invoke(methods, "videoChat.config", {});

    const call = respond.mock.calls[0] as RespondCall | undefined;
    expect(call?.[0]).toBe(true);
    expect(
      (call?.[1] as { config?: { configured?: boolean } } | undefined)?.config?.configured,
    ).toBe(true);
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
    const { methods } = setup();
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
  });
});
