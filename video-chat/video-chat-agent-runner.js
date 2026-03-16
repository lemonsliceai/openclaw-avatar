import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const GATEWAY_PROTOCOL_VERSION = 3;
const GATEWAY_CLIENT_ID = "gateway-client";
const AVATAR_CONTROL_EVENT_TOPIC = "video-chat.avatar-control";
const AVATAR_CONTROL_ACK_EVENT_TOPIC = "video-chat.avatar-control-ack";

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

function resolveSpecifierFromBase(baseRunnerPath, specifier) {
  const resolver = createBaseResolver(baseRunnerPath);
  return resolver.resolve(specifier);
}

function resolveSpecifierFromCandidates(baseRunnerPaths, specifier) {
  let lastError = null;
  for (const baseRunnerPath of baseRunnerPaths) {
    try {
      return resolveSpecifierFromBase(baseRunnerPath, specifier);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`Unable to resolve ${specifier}`);
}

async function importFromBase(baseRunnerPath, specifier) {
  return import(pathToFileURL(resolveSpecifierFromBase(baseRunnerPath, specifier)).href);
}

async function importFromCandidates(baseRunnerPaths, specifier) {
  return import(pathToFileURL(resolveSpecifierFromCandidates(baseRunnerPaths, specifier)).href);
}

async function loadDeps() {
  const runnerPath = process.env.OPENCLAW_VIDEO_CHAT_RUNNER_PATH?.trim();
  const baseRunnerPath = resolveDepsBaseRunnerPath();
  const resolutionPaths = Array.from(
    new Set(
      [runnerPath ? path.resolve(process.cwd(), runnerPath) : "", baseRunnerPath].filter(
        (value) => typeof value === "string" && value.trim(),
      ),
    ),
  );
  const [agentsModule, elevenlabsModule, lemonsliceModule, wsModule] = await Promise.all([
    importFromCandidates(resolutionPaths, "@livekit/agents"),
    importFromCandidates(resolutionPaths, "@livekit/agents-plugin-elevenlabs"),
    importFromCandidates(resolutionPaths, "@livekit/agents-plugin-lemonslice"),
    importFromCandidates(resolutionPaths, "ws"),
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
  const interruptReplyOnNewMessage = parsed.interruptReplyOnNewMessage === true;
  if (!sessionKey || !imageUrl) {
    throw new Error("LiveKit Claw Cast job metadata is incomplete");
  }
  return { sessionKey, imageUrl, interruptReplyOnNewMessage };
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

function decodeRoomDataPayload(payload) {
  if (typeof payload === "string") {
    return payload;
  }
  if (payload instanceof Uint8Array) {
    return new TextDecoder().decode(payload);
  }
  if (payload && typeof payload === "object" && payload.buffer instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(payload.buffer));
  }
  return "";
}

function summarizeTrackPublication(publication) {
  if (!publication || typeof publication !== "object") {
    return null;
  }
  return {
    sid: typeof publication.sid === "string" ? publication.sid : "",
    trackSid: typeof publication.trackSid === "string" ? publication.trackSid : "",
    source: typeof publication.source === "string" ? publication.source : "",
    kind: typeof publication.kind === "string" ? publication.kind : "",
    name: typeof publication.trackName === "string" ? publication.trackName : "",
    subscribed: Boolean(publication.subscribed ?? publication.isSubscribed),
    hasTrack: Boolean(publication.track),
  };
}

function summarizeParticipant(participant) {
  if (!participant || typeof participant !== "object") {
    return null;
  }
  return {
    identity: typeof participant.identity === "string" ? participant.identity : "",
    sid: typeof participant.sid === "string" ? participant.sid : "",
    publications: Array.from(participant.trackPublications?.values?.() || [])
      .map((publication) => summarizeTrackPublication(publication))
      .filter(Boolean),
  };
}

function logRoomSnapshot(label, room) {
  if (!room || typeof room !== "object") {
    console.log(`[video-chat-agent] ${label} room snapshot unavailable`);
    return;
  }
  console.log(
    `[video-chat-agent] ${label} room snapshot ${JSON.stringify({
      roomName: typeof room.name === "string" ? room.name : "",
      localParticipant: summarizeParticipant(room.localParticipant),
      remoteParticipants: Array.from(room.remoteParticipants?.values?.() || [])
        .map((participant) => summarizeParticipant(participant))
        .filter(Boolean),
    })}`,
  );
}

function emitParentDebug(event, fields = {}) {
  try {
    if (typeof process.send === "function") {
      process.send({
        case: "openclawVideoChatDebug",
        value: {
          event,
          fields,
        },
      });
    }
  } catch {}
}

function getVideoChatTestMode() {
  return process.env.OPENCLAW_VIDEO_CHAT_TEST_MODE?.trim() || "";
}

async function writeTestSignal(type, payload = {}) {
  const signalFile = process.env.OPENCLAW_VIDEO_CHAT_TEST_SIGNAL_FILE?.trim();
  if (!signalFile) {
    return;
  }
  await mkdir(path.dirname(signalFile), { recursive: true });
  await appendFile(
    signalFile,
    `${JSON.stringify({
      type,
      at: Date.now(),
      ...payload,
    })}\n`,
    "utf8",
  );
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
    this.hasConnectedOnce = false;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
  }

  async start() {
    if (this.readyPromise) {
      return this.readyPromise;
    }
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.openSocket();
    return this.readyPromise;
  }

  stop() {
    this.closed = true;
    this.clearReconnectTimer();
    if (
      this.ws &&
      (this.ws.readyState === this.WebSocket.OPEN || this.ws.readyState === this.WebSocket.CONNECTING)
    ) {
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

  resolveReadyOnce(payload) {
    const resolveReady = this.resolveReady;
    this.resolveReady = null;
    this.rejectReady = null;
    resolveReady?.(payload);
  }

  rejectReadyOnce(error) {
    const rejectReady = this.rejectReady;
    this.resolveReady = null;
    this.rejectReady = null;
    rejectReady?.(error);
  }

  clearReconnectTimer() {
    if (this.reconnectTimer === null) {
      return;
    }
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  scheduleReconnect(reason) {
    if (this.closed || !this.hasConnectedOnce || this.reconnectTimer !== null) {
      return;
    }
    const attempt = this.reconnectAttempt + 1;
    this.reconnectAttempt = attempt;
    const delayMs = Math.min(5_000, 500 * 2 ** Math.min(attempt - 1, 3));
    console.warn(
      `[video-chat-agent] gateway websocket reconnect scheduled in ${delayMs}ms attempt=${attempt} after ${reason}`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delayMs);
    this.reconnectTimer.unref?.();
  }

  forceReconnect(reason) {
    if (this.closed) {
      return;
    }
    const ws = this.ws;
    if (!ws || ws.readyState === this.WebSocket.CLOSING || ws.readyState === this.WebSocket.CLOSED) {
      this.scheduleReconnect(reason);
      return;
    }
    try {
      ws.close(1012, "gateway reconnect");
    } catch {
      this.scheduleReconnect(reason);
    }
  }

  disposeSocket(socket, code = 1000, reason = "") {
    if (!socket) {
      return;
    }
    if (this.ws === socket) {
      this.ws = null;
    }
    this.connectRequestId = null;
    this.connected = false;
    socket.removeAllListeners?.();
    if (
      socket.readyState === this.WebSocket.CLOSING ||
      socket.readyState === this.WebSocket.CLOSED
    ) {
      return;
    }
    try {
      socket.close(code, reason);
    } catch {}
  }

  openSocket() {
    if (this.closed) {
      return;
    }
    const ws = new this.WebSocket(this.url);
    this.ws = ws;
    this.connectRequestId = null;

    ws.on("open", () => {
      if (this.ws !== ws) {
        return;
      }
      console.log(
        `[video-chat-agent] gateway websocket ${this.hasConnectedOnce ? "reopened" : "opened"}`,
      );
    });

    ws.on("message", (raw) => {
      if (this.ws !== ws) {
        return;
      }
      this.handleMessage(raw.toString());
    });

    ws.on("error", (error) => {
      if (this.ws !== ws) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[video-chat-agent] gateway websocket error: ${message}`);
      if (!this.hasConnectedOnce) {
        this.rejectReadyOnce(error instanceof Error ? error : new Error(message));
        return;
      }
      this.forceReconnect(message);
    });

    ws.on("close", (code, reason) => {
      if (this.ws !== ws && this.ws !== null) {
        return;
      }
      if (this.ws === ws) {
        this.ws = null;
      }
      const message = `gateway websocket closed code=${code}${reason ? ` reason=${String(reason)}` : ""}`;
      console.warn(`[video-chat-agent] ${message}`);
      this.connected = false;
      const error = new Error(message);
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
      if (!this.hasConnectedOnce) {
        this.rejectReadyOnce(error);
        return;
      }
      this.scheduleReconnect(message);
    });
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
        const reconnected = this.hasConnectedOnce;
        this.hasConnectedOnce = true;
        this.reconnectAttempt = 0;
        this.clearReconnectTimer();
        if (reconnected) {
          console.log("[video-chat-agent] gateway websocket reconnected");
        }
        this.resolveReadyOnce(parsed.payload);
      }
      pending.resolve(parsed.payload);
      return;
    }

    const error = new Error(parsed?.error?.message ?? "unknown gateway error");
    if (parsed.id === this.connectRequestId) {
      if (!this.hasConnectedOnce) {
        this.disposeSocket(this.ws, 1008, "gateway connect rejected");
        this.rejectReadyOnce(error);
      } else {
        this.forceReconnect(error.message);
      }
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
        if (!this.hasConnectedOnce) {
          this.rejectReadyOnce(error);
          return;
        }
        this.forceReconnect(error instanceof Error ? error.message : String(error));
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
  emitParentDebug("gateway-bridge.connect.begin", {
    sessionKey: params.sessionKey,
  });
  const client = new GatewayWsClient({
    WebSocket: params.WebSocket,
    url: requireEnv("OPENCLAW_VIDEO_CHAT_GATEWAY_URL"),
    token: process.env.OPENCLAW_VIDEO_CHAT_GATEWAY_TOKEN?.trim() || "",
    password: process.env.OPENCLAW_VIDEO_CHAT_GATEWAY_PASSWORD?.trim() || "",
    onChatEvent: params.onChatEvent,
  });
  await client.start();
  console.log(`[video-chat-agent] gateway bridge ready for session ${params.sessionKey}`);
  emitParentDebug("gateway-bridge.connect.ready", {
    sessionKey: params.sessionKey,
  });
  return client;
}

async function runVideoChatAgentTestMode(ctx, metadata) {
  const roomName = typeof ctx?.room?.name === "string" ? ctx.room.name : "";
  console.log(
    `[video-chat-agent] test mode connect-only begin sessionKey=${metadata.sessionKey} roomName=${roomName}`,
  );
  await writeTestSignal("job-entry-begin", {
    sessionKey: metadata.sessionKey,
    roomName,
  });
  ctx.room?.on?.("participant_connected", (participant) => {
    const participantIdentity = typeof participant?.identity === "string" ? participant.identity : "";
    console.log(`[video-chat-agent] test mode participant connected identity=${participantIdentity}`);
    void writeTestSignal("participant-connected", {
      roomName,
      participantIdentity,
    });
  });
  ctx.room?.on?.("disconnected", () => {
    void writeTestSignal("room-disconnected", {
      roomName,
    });
  });
  await ctx.connect();
  console.log(`[video-chat-agent] test mode ctx.connect succeeded roomName=${roomName}`);
  logRoomSnapshot("after-test-mode-connect", ctx.room);
  await writeTestSignal("ctx-connect-succeeded", {
    roomName,
    remoteParticipantCount: ctx.room?.remoteParticipants?.size ?? 0,
  });
  try {
    const participant = await Promise.race([
      ctx.waitForParticipant(),
      new Promise((resolve) => {
        setTimeout(() => resolve(null), 5_000);
      }),
    ]);
    if (participant) {
      const participantIdentity = typeof participant?.identity === "string" ? participant.identity : "";
      console.log(
        `[video-chat-agent] test mode waitForParticipant succeeded identity=${participantIdentity}`,
      );
      await writeTestSignal("wait-for-participant-succeeded", {
        roomName,
        participantIdentity,
      });
    } else {
      console.warn(`[video-chat-agent] test mode waitForParticipant timed out roomName=${roomName}`);
      await writeTestSignal("wait-for-participant-timeout", {
        roomName,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[video-chat-agent] test mode waitForParticipant failed: ${message}`);
    await writeTestSignal("wait-for-participant-failed", {
      roomName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  console.log(`[video-chat-agent] test mode awaiting room disconnect roomName=${roomName}`);
  await writeTestSignal("awaiting-room-disconnect", {
    roomName,
  });
  await new Promise((resolve) => {
    const finish = () => resolve(undefined);
    ctx.room?.on?.("disconnected", finish);
    ctx.room?.on?.("room_disconnected", finish);
  });
}

async function runVideoChatAgentEntry(ctx) {
  const metadata = parseJobMetadata(ctx.job?.metadata);
  console.log(
    `[video-chat-agent] job entry begin sessionKey=${metadata.sessionKey} roomName=${typeof ctx?.room?.name === "string" ? ctx.room.name : ""} interruptible=${metadata.interruptReplyOnNewMessage === true}`,
  );
  emitParentDebug("job.entry.begin", {
    sessionKey: metadata.sessionKey,
    roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
    interruptible: metadata.interruptReplyOnNewMessage === true,
  });
  if (getVideoChatTestMode() === "connect-only") {
    await runVideoChatAgentTestMode(ctx, metadata);
    return;
  }
  const deps = await loadDeps();
  const elevenLabsApiKey = requireEnv("OPENCLAW_VIDEO_CHAT_ELEVENLABS_API_KEY");
  const lemonSliceApiKey = requireEnv("OPENCLAW_VIDEO_CHAT_LEMONSLICE_API_KEY");
  const elevenLabsVoiceId = process.env.OPENCLAW_VIDEO_CHAT_ELEVENLABS_VOICE_ID?.trim();
  const elevenLabsModelId = process.env.OPENCLAW_VIDEO_CHAT_ELEVENLABS_MODEL_ID?.trim();

  const tts = new deps.elevenlabs.TTS({
    apiKey: elevenLabsApiKey,
    ...(elevenLabsVoiceId ? { voiceId: elevenLabsVoiceId } : {}),
    ...(elevenLabsModelId ? { modelId: elevenLabsModelId } : {}),
  });

  const session = new deps.agents.voice.AgentSession({
    tts,
  });
  const agent = new deps.agents.voice.Agent({
    instructions:
      "You are OpenClaw's LiveKit avatar transport. Do not generate replies yourself; only forward user speech to the local OpenClaw gateway and speak the gateway's final replies.",
  });

  const spokenRuns = new Set();
  let gatewayClient = null;
  const interruptReplyOnNewMessage = metadata.interruptReplyOnNewMessage === true;
  ctx.room?.on?.("participant_connected", (participant) => {
    const participantIdentity = typeof participant?.identity === "string" ? participant.identity : "";
    console.log(
      `[video-chat-agent] room participant connected identity=${participantIdentity}`,
    );
    emitParentDebug("room.participant.connected", {
      sessionKey: metadata.sessionKey,
      roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
      participantIdentity,
    });
  });
  ctx.room?.on?.("participant_disconnected", (participant) => {
    const participantIdentity = typeof participant?.identity === "string" ? participant.identity : "";
    console.log(
      `[video-chat-agent] room participant disconnected identity=${participantIdentity}`,
    );
    emitParentDebug("room.participant.disconnected", {
      sessionKey: metadata.sessionKey,
      roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
      participantIdentity,
    });
  });
  ctx.room?.on?.("track_subscribed", (track, publication, participant) => {
    const participantIdentity = typeof participant?.identity === "string" ? participant.identity : "";
    const trackKind = typeof track?.kind === "string" ? track.kind : "";
    const trackSource = typeof publication?.source === "string" ? publication.source : "";
    console.log(
      `[video-chat-agent] room track subscribed participant=${participantIdentity} kind=${trackKind} source=${trackSource}`,
    );
    emitParentDebug("room.track.subscribed", {
      sessionKey: metadata.sessionKey,
      roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
      participantIdentity,
      trackKind,
      trackSource,
    });
  });
  ctx.room?.on?.("track_unsubscribed", (track, publication, participant) => {
    const participantIdentity = typeof participant?.identity === "string" ? participant.identity : "";
    const trackKind = typeof track?.kind === "string" ? track.kind : "";
    const trackSource = typeof publication?.source === "string" ? publication.source : "";
    console.log(
      `[video-chat-agent] room track unsubscribed participant=${participantIdentity} kind=${trackKind} source=${trackSource}`,
    );
    emitParentDebug("room.track.unsubscribed", {
      sessionKey: metadata.sessionKey,
      roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
      participantIdentity,
      trackKind,
      trackSource,
    });
  });
  ctx.room?.on?.("dataReceived", async (payload, participant, kind, topic) => {
    void participant;
    void kind;
    const normalizedTopic = typeof topic === "string" ? topic.trim() : "";
    if (normalizedTopic !== AVATAR_CONTROL_EVENT_TOPIC) {
      return;
    }
    const decoded = decodeRoomDataPayload(payload);
    if (!decoded) {
      return;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(decoded);
    } catch {
      parsed = null;
    }
    if (!parsed || parsed.type !== "avatar-control" || parsed.action !== "interrupt-speech") {
      return;
    }
    console.log("[video-chat-agent] interrupting avatar speech from room control event");
    emitParentDebug("speech.interrupt.requested", {
      sessionKey: metadata.sessionKey,
      roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
      source: typeof parsed.source === "string" ? parsed.source : "",
    });
    try {
      await session.interrupt({ force: true }).await;
      await ctx.room?.localParticipant?.publishData?.(
        new TextEncoder().encode(
          JSON.stringify({
            type: "avatar-control",
            action: "interrupt-speech-complete",
            sessionKey: metadata.sessionKey,
            source: typeof parsed.source === "string" ? parsed.source : "",
            at: Date.now(),
          }),
        ),
        {
          reliable: true,
          topic: AVATAR_CONTROL_ACK_EVENT_TOPIC,
        },
      );
      emitParentDebug("speech.interrupt.completed", {
        sessionKey: metadata.sessionKey,
        roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
        source: typeof parsed.source === "string" ? parsed.source : "",
      });
    } catch (error) {
      console.error(
        `[video-chat-agent] failed to interrupt avatar speech: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
      );
      emitParentDebug("speech.interrupt.failed", {
        sessionKey: metadata.sessionKey,
        roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
        source: typeof parsed.source === "string" ? parsed.source : "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  console.log("[video-chat-agent] connecting gateway bridge");
  gatewayClient = await connectGatewayBridge({
    WebSocket: deps.WebSocket,
    sessionKey: metadata.sessionKey,
    onChatEvent: async (event) => {
      const payload = event?.payload;
      const payloadSessionKey =
        typeof payload?.sessionKey === "string" ? payload.sessionKey.trim() : "";
      const payloadState = typeof payload?.state === "string" ? payload.state.trim() : "";
      const runId = typeof payload?.runId === "string" ? payload.runId : "";
      if (payloadState) {
        console.log(
          `[video-chat-agent] received gateway chat event state=${payloadState}${runId ? ` run=${runId}` : ""}`,
        );
        emitParentDebug("gateway-chat-event.received", {
          sessionKey: metadata.sessionKey,
          roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
          runId,
          state: payloadState,
        });
      }
      if (!payload || payloadSessionKey !== metadata.sessionKey || payloadState !== "final") {
        return;
      }
      if (runId && spokenRuns.has(runId)) {
        return;
      }
      const text = extractTextFromMessage(payload.message);
      if (!text) {
        return;
      }
      console.log(
        `[video-chat-agent] speaking gateway reply${runId ? ` run=${runId}` : ""} length=${text.length} interruptible=${interruptReplyOnNewMessage}`,
      );
      emitParentDebug("speech.begin", {
        sessionKey: metadata.sessionKey,
        roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
        runId,
        textLength: text.length,
        interruptible: interruptReplyOnNewMessage,
        outputAudioSink:
          session?.output?.audio?.constructor?.name || typeof session?.output?.audio,
      });
      logRoomSnapshot("before-session-say", ctx.room);
      try {
        if (interruptReplyOnNewMessage) {
          await session.interrupt({ force: true }).await;
        }
        const speechHandle = session.say(text, {
          allowInterruptions: interruptReplyOnNewMessage,
        });
        if (runId) {
          spokenRuns.add(runId);
        }
        await speechHandle.waitForPlayout();
        console.log(
          `[video-chat-agent] ${speechHandle.interrupted ? "interrupted" : "finished"} gateway reply${runId ? ` run=${runId}` : ""}`,
        );
        emitParentDebug("speech.finished", {
          sessionKey: metadata.sessionKey,
          roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
          runId,
          interrupted: speechHandle.interrupted === true,
          outputAudioSink:
            session?.output?.audio?.constructor?.name || typeof session?.output?.audio,
        });
        logRoomSnapshot("after-session-say", ctx.room);
      } catch (error) {
        console.error(
          `[video-chat-agent] failed to speak gateway reply${runId ? ` run=${runId}` : ""}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
        );
        emitParentDebug("speech.failed", {
          sessionKey: metadata.sessionKey,
          roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
          runId,
          error: error instanceof Error ? error.message : String(error),
          outputAudioSink:
            session?.output?.audio?.constructor?.name || typeof session?.output?.audio,
        });
        logRoomSnapshot("session-say-failed", ctx.room);
      }
    },
  });
  try {
    console.log("[video-chat-agent] connecting agent session to room");
    emitParentDebug("agent-session.start.begin", {
      sessionKey: metadata.sessionKey,
      roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
    });
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
    emitParentDebug("agent-session.start.connected", {
      sessionKey: metadata.sessionKey,
      roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
      outputAudioSink:
        session?.output?.audio?.constructor?.name || typeof session?.output?.audio,
    });
    logRoomSnapshot("after-agent-session-start", ctx.room);

    const avatar = new deps.lemonslice.AvatarSession({
      apiKey: lemonSliceApiKey,
      agentImageUrl: metadata.imageUrl,
    });
    console.log("[video-chat-agent] starting lemonslice avatar session");
    emitParentDebug("avatar.start.begin", {
      sessionKey: metadata.sessionKey,
      roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
      outputAudioSink:
        session?.output?.audio?.constructor?.name || typeof session?.output?.audio,
    });
    await avatar.start(session, ctx.room);
    console.log("[video-chat-agent] lemonslice avatar session started");
    emitParentDebug("avatar.start.connected", {
      sessionKey: metadata.sessionKey,
      roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
      outputAudioSink:
        session?.output?.audio?.constructor?.name || typeof session?.output?.audio,
      avatarParticipantIdentity: avatar?.avatarParticipantIdentity ?? "",
    });
    logRoomSnapshot("after-avatar-session-start", ctx.room);

    await new Promise((resolve) => {
      const room = ctx.room;
      const finish = () => {
        console.log(
          `[video-chat-agent] room disconnected sessionKey=${metadata.sessionKey} roomName=${typeof room?.name === "string" ? room.name : ""}`,
        );
        emitParentDebug("room.disconnected", {
          sessionKey: metadata.sessionKey,
          roomName: typeof room?.name === "string" ? room.name : "",
        });
        gatewayClient?.stop();
        resolve();
      };
      room.on?.("disconnected", finish);
      room.on?.("room_disconnected", finish);
    });
  } finally {
    gatewayClient?.stop();
  }
}

export const videoChatAgent = { entry: runVideoChatAgentEntry };
export { GatewayWsClient };
export default videoChatAgent;
