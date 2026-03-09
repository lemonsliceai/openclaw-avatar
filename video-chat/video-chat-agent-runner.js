import { randomUUID } from "node:crypto";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const GATEWAY_PROTOCOL_VERSION = 3;
const GATEWAY_CLIENT_ID = "gateway-client";
const USER_TRANSCRIPT_DUPLICATE_WINDOW_MS = 5_000;
const VOICE_TRANSCRIPT_EVENT_TOPIC = "video-chat.user-transcript";
const VOICE_TRANSCRIPT_EVENT_TYPE = "video-chat.user-transcript";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

function resolveDepsBaseRunnerPath() {
  const value =
    process.env.OPENCLAW_VIDEO_CHAT_DEPS_BASE_RUNNER?.trim() ||
    process.env.OPENCLAW_VIDEO_CHAT_RUNNER_PATH?.trim();
  if (!value) {
    throw new Error("Missing OPENCLAW_VIDEO_CHAT_DEPS_BASE_RUNNER");
  }
  return path.resolve(value);
}

function createBaseResolver(baseRunnerPath) {
  return createRequire(path.join(path.dirname(baseRunnerPath), "__openclaw_video_chat__.js"));
}

async function importFromBase(baseRunnerPath, specifier) {
  const resolver = createBaseResolver(baseRunnerPath);
  return import(pathToFileURL(resolver.resolve(specifier)).href);
}

async function loadDeps() {
  const baseRunnerPath = resolveDepsBaseRunnerPath();
  const [agentsModule, elevenlabsModule, lemonsliceModule, wsModule] = await Promise.all([
    importFromBase(baseRunnerPath, "@livekit/agents"),
    importFromBase(baseRunnerPath, "@livekit/agents-plugin-elevenlabs"),
    importFromBase(baseRunnerPath, "@livekit/agents-plugin-lemonslice"),
    importFromBase(baseRunnerPath, "ws"),
  ]);

  const WebSocket = wsModule?.WebSocket ?? wsModule?.default ?? wsModule;
  if (!WebSocket) {
    throw new Error("Failed to load ws dependency for Claw Cast agent");
  }

  return {
    agents: agentsModule,
    elevenlabs: elevenlabsModule,
    lemonslice: lemonsliceModule,
    WebSocket,
  };
}

function parseJobMetadata(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("LiveKit Claw Cast job metadata is missing");
  }
  const parsed = JSON.parse(raw);
  const sessionKey = typeof parsed.sessionKey === "string" ? parsed.sessionKey.trim() : "";
  const imageUrl = typeof parsed.imageUrl === "string" ? parsed.imageUrl.trim() : "";
  if (!sessionKey || !imageUrl) {
    throw new Error("LiveKit Claw Cast job metadata is incomplete");
  }
  return { sessionKey, imageUrl };
}

function extractTextFromMessage(message) {
  if (!message || typeof message !== "object") {
    return null;
  }
  if (typeof message.text === "string" && message.text.trim()) {
    return message.text.trim();
  }
  if (typeof message.content === "string" && message.content.trim()) {
    return message.content.trim();
  }
  if (!Array.isArray(message.content)) {
    return null;
  }
  const parts = [];
  for (const block of message.content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
      parts.push(block.text.trim());
    }
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

async function publishVoiceTranscriptEvent(params) {
  const participant = params.room?.localParticipant;
  if (!participant || typeof participant.publishData !== "function") {
    return;
  }
  const text = typeof params.text === "string" ? params.text.trim() : "";
  const sessionKey = typeof params.sessionKey === "string" ? params.sessionKey.trim() : "";
  const idempotencyKey =
    typeof params.idempotencyKey === "string" ? params.idempotencyKey.trim() : "";
  if (!text || !sessionKey || !idempotencyKey) {
    return;
  }

  const payload = new TextEncoder().encode(
    JSON.stringify({
      type: VOICE_TRANSCRIPT_EVENT_TYPE,
      sessionKey,
      idempotencyKey,
      text,
    }),
  );
  await participant.publishData(payload, {
    reliable: true,
    topic: VOICE_TRANSCRIPT_EVENT_TOPIC,
  });
}

class GatewayWsClient {
  constructor(params) {
    this.WebSocket = params.WebSocket;
    this.url = params.url;
    this.token = params.token;
    this.password = params.password;
    this.onChatEvent = params.onChatEvent;
    this.pending = new Map();
    this.connectRequestId = null;
    this.ws = null;
    this.connected = false;
    this.closed = false;
    this.readyPromise = null;
    this.resolveReady = null;
    this.rejectReady = null;
  }

  async start() {
    if (this.readyPromise) {
      return this.readyPromise;
    }
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });

    const ws = new this.WebSocket(this.url);
    this.ws = ws;

    ws.on("open", () => {
      console.log("[video-chat-agent] gateway websocket opened");
    });

    ws.on("message", (raw) => {
      this.handleMessage(raw.toString());
    });

    ws.on("error", (error) => {
      if (!this.connected) {
        this.rejectReady?.(error);
      }
      console.error(
        `[video-chat-agent] gateway websocket error: ${error instanceof Error ? error.message : String(error)}`,
      );
    });

    ws.on("close", (code, reason) => {
      const message = `gateway websocket closed code=${code}${reason ? ` reason=${String(reason)}` : ""}`;
      if (!this.connected) {
        this.rejectReady?.(new Error(message));
      }
      console.warn(`[video-chat-agent] ${message}`);
      this.connected = false;
      const error = new Error(message);
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
    });

    return this.readyPromise;
  }

  stop() {
    this.closed = true;
    if (this.ws && this.ws.readyState === this.WebSocket.OPEN) {
      this.ws.close(1000, "Claw Cast session closed");
    }
  }

  async request(method, params) {
    if (!this.ws || this.ws.readyState !== this.WebSocket.OPEN) {
      throw new Error("gateway not connected");
    }
    const id = randomUUID();
    const frame = {
      type: "req",
      id,
      method,
      params,
    };
    const responsePromise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.ws.send(JSON.stringify(frame));
    return responsePromise;
  }

  handleMessage(raw) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (parsed?.type === "event") {
      if (parsed.event === "connect.challenge") {
        this.sendConnect(parsed.payload?.nonce);
        return;
      }
      if (parsed.event === "chat") {
        this.onChatEvent?.(parsed);
      }
      return;
    }

    if (parsed?.type !== "res" || typeof parsed.id !== "string") {
      return;
    }

    const pending = this.pending.get(parsed.id);
    if (!pending) {
      return;
    }
    this.pending.delete(parsed.id);

    if (parsed.ok) {
      if (parsed.id === this.connectRequestId) {
        this.connected = true;
        this.resolveReady?.(parsed.payload);
      }
      pending.resolve(parsed.payload);
      return;
    }

    const error = new Error(parsed?.error?.message ?? "unknown gateway error");
    if (parsed.id === this.connectRequestId) {
      this.rejectReady?.(error);
    }
    pending.reject(error);
  }

  sendConnect(nonce) {
    const trimmedNonce = typeof nonce === "string" ? nonce.trim() : "";
    if (!trimmedNonce) {
      this.rejectReady?.(new Error("gateway connect challenge missing nonce"));
      this.ws?.close(1008, "connect challenge missing nonce");
      return;
    }
    const id = randomUUID();
    this.connectRequestId = id;
    this.pending.set(id, {
      resolve: () => {},
      reject: (error) => {
        this.rejectReady?.(error);
      },
    });
    this.ws?.send(
      JSON.stringify({
        type: "req",
        id,
        method: "connect",
        params: {
          minProtocol: GATEWAY_PROTOCOL_VERSION,
          maxProtocol: GATEWAY_PROTOCOL_VERSION,
          client: {
            id: GATEWAY_CLIENT_ID,
            displayName: "OpenClaw Claw Cast Agent",
            version: "video-chat-plugin",
            platform: process.platform,
            mode: "backend",
          },
          role: "operator",
          scopes: ["operator.admin"],
          auth:
            this.token || this.password
              ? {
                  ...(this.token ? { token: this.token } : {}),
                  ...(this.password ? { password: this.password } : {}),
                }
              : undefined,
        },
      }),
    );
  }
}

async function connectGatewayBridge(params) {
  const client = new GatewayWsClient({
    WebSocket: params.WebSocket,
    url: requireEnv("OPENCLAW_VIDEO_CHAT_GATEWAY_URL"),
    token: process.env.OPENCLAW_VIDEO_CHAT_GATEWAY_TOKEN?.trim() || "",
    password: process.env.OPENCLAW_VIDEO_CHAT_GATEWAY_PASSWORD?.trim() || "",
    onChatEvent: params.onChatEvent,
  });
  await client.start();
  console.log(`[video-chat-agent] gateway bridge ready for session ${params.sessionKey}`);
  return client;
}

async function runVideoChatAgentEntry(ctx) {
  const deps = await loadDeps();
  const metadata = parseJobMetadata(ctx.job?.metadata);
  const elevenLabsApiKey = requireEnv("OPENCLAW_VIDEO_CHAT_ELEVENLABS_API_KEY");
  const lemonSliceApiKey = requireEnv("OPENCLAW_VIDEO_CHAT_LEMONSLICE_API_KEY");
  const elevenLabsVoiceId = process.env.OPENCLAW_VIDEO_CHAT_ELEVENLABS_VOICE_ID?.trim();
  const elevenLabsModelId = process.env.OPENCLAW_VIDEO_CHAT_ELEVENLABS_MODEL_ID?.trim();
  const sttModel = process.env.OPENCLAW_VIDEO_CHAT_STT_MODEL?.trim();
  const sttLanguage = process.env.OPENCLAW_VIDEO_CHAT_STT_LANGUAGE?.trim();

  const tts = new deps.elevenlabs.TTS({
    apiKey: elevenLabsApiKey,
    ...(elevenLabsVoiceId ? { voiceId: elevenLabsVoiceId } : {}),
    ...(elevenLabsModelId ? { modelId: elevenLabsModelId } : {}),
  });
  const stt = new deps.agents.inference.STT({
    ...(sttModel ? { model: sttModel } : {}),
    ...(sttLanguage ? { language: sttLanguage } : {}),
  });

  const session = new deps.agents.voice.AgentSession({
    stt,
    tts,
  });
  const agent = new deps.agents.voice.Agent({
    instructions:
      "You are OpenClaw's LiveKit avatar transport. Do not generate replies yourself; only forward user speech to the local OpenClaw gateway and speak the gateway's final replies.",
  });

  const spokenRuns = new Set();
  let lastUserTranscript = "";
  let lastUserTranscriptAt = 0;
  let gatewayClient = null;

  console.log("[video-chat-agent] connecting gateway bridge");
  gatewayClient = await connectGatewayBridge({
    WebSocket: deps.WebSocket,
    sessionKey: metadata.sessionKey,
    onChatEvent: (event) => {
      const payload = event?.payload;
      if (!payload || payload.sessionKey !== metadata.sessionKey || payload.state !== "final") {
        return;
      }
      const runId = typeof payload.runId === "string" ? payload.runId : "";
      if (runId && spokenRuns.has(runId)) {
        return;
      }
      const text = extractTextFromMessage(payload.message);
      if (!text) {
        return;
      }
      if (runId) {
        spokenRuns.add(runId);
      }
      console.log(`[video-chat-agent] speaking gateway reply${runId ? ` run=${runId}` : ""}`);
      session.say(text, { allowInterruptions: false });
    },
  });

  session.on("user_input_transcribed", async (event) => {
    if (!event?.isFinal) {
      return;
    }
    const transcript = typeof event.transcript === "string" ? event.transcript.trim() : "";
    if (!transcript) {
      return;
    }
    const duplicateTranscript =
      lastUserTranscript &&
      transcript.toLowerCase() === lastUserTranscript.toLowerCase() &&
      Date.now() - lastUserTranscriptAt < USER_TRANSCRIPT_DUPLICATE_WINDOW_MS;
    if (duplicateTranscript) {
      return;
    }
    lastUserTranscript = transcript;
    lastUserTranscriptAt = Date.now();

    try {
      console.log(`[video-chat-agent] forwarding user transcript: ${transcript}`);
      const idempotencyKey = `video-chat-agent-${randomUUID()}`;
      await session.interrupt({ force: true });
      try {
        await publishVoiceTranscriptEvent({
          room: ctx.room,
          sessionKey: metadata.sessionKey,
          idempotencyKey,
          text: transcript,
        });
      } catch (error) {
        console.warn(
          `[video-chat-agent] failed to publish live transcript event: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      await gatewayClient.request("chat.send", {
        sessionKey: metadata.sessionKey,
        message: transcript,
        idempotencyKey,
      });
    } catch (error) {
      console.error(
        `[video-chat-agent] failed to forward user transcript: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
      );
    }
  });

  console.log("[video-chat-agent] connecting agent session to room");
  await session.start({
    agent,
    room: ctx.room,
    inputOptions: {
      audioEnabled: true,
      textEnabled: true,
    },
    outputOptions: { audioEnabled: true },
  });
  console.log("[video-chat-agent] agent session connected");

  const avatar = new deps.lemonslice.AvatarSession({
    apiKey: lemonSliceApiKey,
    agentImageUrl: metadata.imageUrl,
  });
  console.log("[video-chat-agent] starting lemonslice avatar session");
  await avatar.start(session, ctx.room);
  console.log("[video-chat-agent] lemonslice avatar session started");

  await new Promise((resolve) => {
    const room = ctx.room;
    const finish = () => {
      gatewayClient?.stop();
      resolve();
    };
    room.on?.("disconnected", finish);
    room.on?.("room_disconnected", finish);
  });
}

export const videoChatAgent = { entry: runVideoChatAgentEntry };
export default videoChatAgent;
