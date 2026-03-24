/** Canonical avatar aspect ratio exports live in `./avatar-aspect-ratio.js`. */
import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  AVATAR_ASPECT_RATIO_DEFAULT,
  AVATAR_ASPECT_RATIO_LOOKUP,
  AVATAR_ASPECT_RATIOS,
} from "./avatar-aspect-ratio.js";

const GATEWAY_PROTOCOL_VERSION = 3;
const GATEWAY_CLIENT_ID = "gateway-client";
const AVATAR_CONTROL_EVENT_TOPIC = "avatar.avatar-control";
const AVATAR_CONTROL_ACK_EVENT_TOPIC = "avatar.avatar-control-ack";

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

function normalizeAspectRatio(rawAspectRatio) {
  if (typeof rawAspectRatio !== "string") {
    return AVATAR_ASPECT_RATIO_DEFAULT;
  }
  const normalized = rawAspectRatio.trim();
  return AVATAR_ASPECT_RATIO_LOOKUP.has(normalized)
    ? normalized
    : AVATAR_ASPECT_RATIO_DEFAULT;
}

function resolveDepsBaseRunnerPath() {
  const value =
    process.env.OPENCLAW_AVATAR_DEPS_BASE_RUNNER?.trim() ||
    process.env.OPENCLAW_AVATAR_RUNNER_PATH?.trim();
  if (!value) {
    throw new Error("Missing OPENCLAW_AVATAR_DEPS_BASE_RUNNER");
  }
  return path.resolve(value);
}

function createBaseResolver(baseRunnerPath) {
  return createRequire(path.join(path.dirname(baseRunnerPath), "__openclaw_avatar__.js"));
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
  const runnerPath = process.env.OPENCLAW_AVATAR_RUNNER_PATH?.trim();
  const baseRunnerPath = resolveDepsBaseRunnerPath();
  const resolutionPaths = Array.from(
    new Set(
      [runnerPath ? path.resolve(process.cwd(), runnerPath) : "", baseRunnerPath].filter(
        (value) => typeof value === "string" && value.trim(),
      ),
    ),
  );
  const [agentsModule, lemonsliceModule] = await Promise.all([
    importFromCandidates(resolutionPaths, "@livekit/agents"),
    importFromCandidates(resolutionPaths, "@livekit/agents-plugin-lemonslice"),
  ]);

  return {
    agents: agentsModule,
    lemonslice: lemonsliceModule,
  };
}

function parseJobMetadata(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error("LiveKit Avatar job metadata is missing");
  }
  const parsed = JSON.parse(raw);
  const sessionKey = typeof parsed.sessionKey === "string" ? parsed.sessionKey.trim() : "";
  const imageUrl = typeof parsed.imageUrl === "string" ? parsed.imageUrl.trim() : "";
  const avatarTimeoutSeconds =
    typeof parsed.avatarTimeoutSeconds === "number" && Number.isFinite(parsed.avatarTimeoutSeconds)
      ? Math.min(600, Math.max(1, Math.floor(parsed.avatarTimeoutSeconds)))
      : 60;
  const aspectRatio = normalizeAspectRatio(parsed.aspectRatio);
  const interruptReplyOnNewMessage = parsed.interruptReplyOnNewMessage === true;
  if (!sessionKey || !imageUrl) {
    throw new Error("LiveKit Avatar job metadata is incomplete");
  }
  return { sessionKey, imageUrl, avatarTimeoutSeconds, aspectRatio, interruptReplyOnNewMessage };
}

export function buildLemonSliceAspectRatioPayload(aspectRatio) {
  return { aspect_ratio: normalizeAspectRatio(aspectRatio) };
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

function normalizeGatewayRunKey(runId) {
  if (typeof runId !== "string") {
    return "__default__";
  }
  const normalized = runId.trim();
  return normalized || "__default__";
}

export function computeStreamingTextDelta(nextText, previousText = "") {
  const normalizedNext = typeof nextText === "string" ? nextText : "";
  const normalizedPrevious = typeof previousText === "string" ? previousText : "";
  if (!normalizedNext) {
    return "";
  }
  if (!normalizedPrevious) {
    return normalizedNext;
  }
  if (normalizedNext === normalizedPrevious) {
    return "";
  }
  if (!normalizedNext.startsWith(normalizedPrevious)) {
    return null;
  }
  return normalizedNext.slice(normalizedPrevious.length);
}

function shouldFlushGatewaySpeechDelta(deltaText, unflushedTextLength, close) {
  if (close) {
    return true;
  }
  if (typeof deltaText !== "string" || !deltaText) {
    return false;
  }
  if (/[.!?;:\n]/.test(deltaText)) {
    return true;
  }
  return unflushedTextLength >= 48;
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
    console.log(`[avatar-agent] ${label} room snapshot unavailable`);
    return;
  }
  console.log(
    `[avatar-agent] ${label} room snapshot ${JSON.stringify({
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
        case: "openclawAvatarDebug",
        value: {
          event,
          fields,
        },
      });
    }
  } catch {}
}

function getAvatarTestMode() {
  return process.env.OPENCLAW_AVATAR_TEST_MODE?.trim() || "";
}

async function writeTestSignal(type, payload = {}) {
  const signalFile = process.env.OPENCLAW_AVATAR_TEST_SIGNAL_FILE?.trim();
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

function resolvePluginHttpBaseUrl() {
  const value =
    process.env.OPENCLAW_AVATAR_PLUGIN_URL?.trim() ||
    process.env.OPENCLAW_AVATAR_GATEWAY_URL?.trim();
  if (!value) {
    throw new Error("Missing OPENCLAW_AVATAR_GATEWAY_URL");
  }
  const url = new URL(value);
  if (url.protocol === "ws:") {
    url.protocol = "http:";
  } else if (url.protocol === "wss:") {
    url.protocol = "https:";
  }
  return url;
}

function buildPluginHttpUrl(pathname, searchParams = null) {
  const pluginUrl = resolvePluginHttpBaseUrl();
  pluginUrl.pathname = pathname;
  const normalizedSearchParams = new URLSearchParams(searchParams ?? {});
  pluginUrl.search = normalizedSearchParams.toString();
  pluginUrl.hash = "";
  return pluginUrl.toString();
}

function parsePluginHttpErrorMessage(status, rawBody) {
  const trimmed = typeof rawBody === "string" ? rawBody.trim() : "";
  if (!trimmed) {
    return `plugin request failed with status ${status}`;
  }
  try {
    const payload = JSON.parse(trimmed);
    if (typeof payload?.error?.message === "string" && payload.error.message.trim()) {
      return payload.error.message.trim();
    }
    if (typeof payload?.message === "string" && payload.message.trim()) {
      return payload.message.trim();
    }
  } catch {}
  return `plugin request failed with status ${status}: ${trimmed}`;
}

function tryParseJson(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    return raw;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function normalizeChatStreamEvent(eventName, data) {
  const parsed = tryParseJson(data);
  if (parsed && typeof parsed === "object") {
    if (
      parsed.type === "event" &&
      parsed.event === "chat" &&
      parsed.payload &&
      typeof parsed.payload === "object"
    ) {
      return parsed;
    }
    if (parsed.event === "chat" && parsed.payload && typeof parsed.payload === "object") {
      return {
        type: "event",
        event: "chat",
        payload: parsed.payload,
      };
    }
    if (typeof parsed.sessionKey === "string" && typeof parsed.state === "string") {
      return {
        type: "event",
        event: "chat",
        payload: parsed,
      };
    }
    if (eventName === "chat") {
      return {
        type: "event",
        event: "chat",
        payload: parsed,
      };
    }
  }
  if (eventName === "chat" && typeof parsed === "string" && parsed.trim()) {
    return {
      type: "event",
      event: "chat",
      payload: {
        sessionKey: "",
        state: "final",
        message: { text: parsed.trim() },
      },
    };
  }
  return null;
}

class GatewayWsClient {
  constructor(params) {
    this.fetchImpl = params.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    this.url = params.url;
    this.onChatEvent = params.onChatEvent;
    this.closed = false;
    this.readyPromise = null;
    this.resolveReady = null;
    this.rejectReady = null;
    this.hasConnectedOnce = false;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.currentAbortController = null;
  }

  async start() {
    if (this.readyPromise) {
      return this.readyPromise;
    }
    if (typeof this.fetchImpl !== "function") {
      throw new Error("Fetch is unavailable for plugin chat stream");
    }
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    void this.openStream();
    return this.readyPromise;
  }

  stop() {
    this.closed = true;
    this.clearReconnectTimer();
    this.abortCurrentStream("Avatar session closed");
    if (this.rejectReady) {
      this.rejectReadyOnce(new Error("plugin chat stream stopped"));
    }
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

  abortCurrentStream(reason) {
    const controller = this.currentAbortController;
    this.currentAbortController = null;
    if (!controller) {
      return;
    }
    try {
      controller.abort(reason);
    } catch {
      controller.abort();
    }
  }

  scheduleReconnect(reason) {
    if (this.closed || !this.hasConnectedOnce || this.reconnectTimer !== null) {
      return;
    }
    const attempt = this.reconnectAttempt + 1;
    this.reconnectAttempt = attempt;
    const delayMs = Math.min(5_000, 500 * 2 ** Math.min(attempt - 1, 3));
    console.warn(
      `[avatar-agent] plugin chat stream reconnect scheduled in ${delayMs}ms attempt=${attempt} after ${reason}`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.openStream();
    }, delayMs);
    this.reconnectTimer.unref?.();
  }

  async openStream() {
    if (this.closed) {
      return;
    }
    const controller = new AbortController();
    this.currentAbortController = controller;
    const connectingMessage = this.hasConnectedOnce ? "reconnecting" : "opening";
    console.log(`[avatar-agent] plugin chat stream ${connectingMessage}`);
    try {
      const response = await this.fetchImpl(this.url, {
        headers: {
          accept: "text/event-stream",
        },
        signal: controller.signal,
      });
      if (this.closed || controller.signal.aborted) {
        return;
      }
      if (!response.ok) {
        const rawBody = await response.text().catch(() => "");
        throw new Error(parsePluginHttpErrorMessage(response.status, rawBody));
      }
      if (!response.body || typeof response.body.getReader !== "function") {
        throw new Error("plugin chat stream response did not include a readable body");
      }
      const reconnected = this.hasConnectedOnce;
      this.hasConnectedOnce = true;
      this.reconnectAttempt = 0;
      this.clearReconnectTimer();
      if (reconnected) {
        console.log("[avatar-agent] plugin chat stream reconnected");
      } else {
        console.log("[avatar-agent] plugin chat stream opened");
      }
      this.resolveReadyOnce({ success: true });
      await this.readStream(response.body, controller.signal);
      if (!this.closed && !controller.signal.aborted) {
        this.scheduleReconnect("stream ended");
      }
    } catch (error) {
      if (this.closed || controller.signal.aborted || isAbortError(error)) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[avatar-agent] plugin chat stream error: ${message}`);
      if (!this.hasConnectedOnce) {
        this.rejectReadyOnce(error instanceof Error ? error : new Error(message));
        return;
      }
      this.scheduleReconnect(message);
    } finally {
      if (this.currentAbortController === controller) {
        this.currentAbortController = null;
      }
    }
  }

  async readStream(body, signal) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventName = "";
    let eventId = "";
    let dataLines = [];

    const dispatch = () => {
      const payloadText = dataLines.join("\n");
      if (!eventName && !eventId && !payloadText) {
        return;
      }
      const normalizedEvent = normalizeChatStreamEvent(eventName || "message", payloadText);
      if (normalizedEvent) {
        try {
          this.onChatEvent?.(normalizedEvent);
        } catch (error) {
          console.error(
            `[avatar-agent] plugin chat stream event handler failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
          );
        }
      }
      eventName = "";
      eventId = "";
      dataLines = [];
    };

    try {
      while (true) {
        if (signal.aborted) {
          break;
        }
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        while (true) {
          const newlineIndex = buffer.indexOf("\n");
          if (newlineIndex === -1) {
            break;
          }
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) {
            dispatch();
            continue;
          }
          if (line.startsWith(":")) {
            continue;
          }
          const colonIndex = line.indexOf(":");
          const field = colonIndex === -1 ? line : line.slice(0, colonIndex);
          let valuePart = colonIndex === -1 ? "" : line.slice(colonIndex + 1);
          if (valuePart.startsWith(" ")) {
            valuePart = valuePart.slice(1);
          }
          if (field === "event") {
            eventName = valuePart;
            continue;
          }
          if (field === "data") {
            dataLines.push(valuePart);
            continue;
          }
          if (field === "id") {
            eventId = valuePart;
          }
        }
      }
      dispatch();
    } finally {
      try {
        await reader.cancel();
      } catch {}
    }
  }
}

function decodeGatewaySpeechAudioBuffer(value) {
  if (typeof value !== "string") {
    throw new Error("gateway speech response did not include audio");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("gateway speech response returned empty audio");
  }
  return Buffer.from(trimmed, "base64");
}

function normalizeGatewaySpeechPayload(payload) {
  const sampleRate =
    typeof payload?.sampleRate === "number" && Number.isFinite(payload.sampleRate)
      ? Math.floor(payload.sampleRate)
      : 0;
  if (sampleRate <= 0) {
    throw new Error("gateway speech response did not include a valid sample rate");
  }
  return {
    audioBuffer: decodeGatewaySpeechAudioBuffer(payload?.audioBase64),
    sampleRate,
    provider:
      typeof payload?.provider === "string" && payload.provider.trim() ? payload.provider.trim() : "",
  };
}

function isAbortError(error) {
  return (
    (typeof DOMException === "function" && error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

async function requestGatewaySpeechSynthesis(text, signal) {
  try {
    const response = await fetch(buildPluginHttpUrl("/plugins/openclaw-avatar/api/synthesize"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal,
    });
    const rawBody = await response.text();
    if (!response.ok) {
      throw new Error(parsePluginHttpErrorMessage(response.status, rawBody));
    }
    let payload = null;
    if (rawBody.trim()) {
      try {
        payload = JSON.parse(rawBody);
      } catch {
        payload = null;
      }
    }
    const body = payload && payload.success === true ? payload : null;
    if (!body) {
      throw new Error("plugin speech response returned no payload");
    }
    return normalizeGatewaySpeechPayload(body);
  } catch (error) {
    if (isAbortError(error)) {
      return null;
    }
    throw error;
  }
}

function createGatewaySpeechTts(params) {
  const { deps } = params;

  class GatewaySpeechChunkedStream extends deps.agents.tts.ChunkedStream {
    label = "openclaw.GatewaySpeechChunkedStream";

    constructor(tts, text, connOptions, abortSignal) {
      super(text, tts, connOptions, abortSignal);
      this.tts = tts;
    }

    async run() {
      const payload = await requestGatewaySpeechSynthesis(this.inputText, this.abortSignal);
      if (!payload) {
        return;
      }
      this.tts.setSampleRate(payload.sampleRate);
      const frameStream = new deps.agents.AudioByteStream(this.tts.sampleRate, 1);
      const arrayBuffer = payload.audioBuffer.buffer.slice(
        payload.audioBuffer.byteOffset,
        payload.audioBuffer.byteOffset + payload.audioBuffer.byteLength,
      );
      const frames = [...frameStream.write(arrayBuffer), ...frameStream.flush()];
      if (frames.length === 0) {
        throw new Error("gateway speech response returned no audio frames");
      }
      const requestId = randomUUID();
      const segmentId = randomUUID();
      for (let index = 0; index < frames.length; index += 1) {
        if (this.abortSignal.aborted) {
          return;
        }
        this.queue.put({
          requestId,
          segmentId,
          frame: frames[index],
          final: index === frames.length - 1,
          ...(index === 0 ? { deltaText: this.inputText } : {}),
        });
      }
    }
  }

  class GatewaySpeechTTS extends deps.agents.tts.TTS {
    label = "openclaw.GatewaySpeechTTS";

    constructor(sampleRate = 16_000) {
      super(sampleRate, 1, { streaming: false });
      this.outputSampleRate = sampleRate;
    }

    get sampleRate() {
      return this.outputSampleRate;
    }

    setSampleRate(sampleRate) {
      if (Number.isFinite(sampleRate) && sampleRate > 0) {
        this.outputSampleRate = Math.floor(sampleRate);
      }
    }

    synthesize(text, connOptions, abortSignal) {
      return new GatewaySpeechChunkedStream(this, text, connOptions, abortSignal);
    }

    stream(options) {
      return new deps.agents.tts.StreamAdapter(
        this,
        new deps.agents.tokenize.basic.SentenceTokenizer(),
      ).stream(options);
    }
  }

  return new GatewaySpeechTTS();
}

async function runAvatarAgentTestMode(ctx, metadata) {
  const roomName = typeof ctx?.room?.name === "string" ? ctx.room.name : "";
  console.log(
    `[avatar-agent] test mode connect-only begin sessionKey=${metadata.sessionKey} roomName=${roomName}`,
  );
  await writeTestSignal("job-entry-begin", {
    sessionKey: metadata.sessionKey,
    roomName,
  });
  ctx.room?.on?.("participant_connected", (participant) => {
    const participantIdentity = typeof participant?.identity === "string" ? participant.identity : "";
    console.log(`[avatar-agent] test mode participant connected identity=${participantIdentity}`);
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
  console.log(`[avatar-agent] test mode ctx.connect succeeded roomName=${roomName}`);
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
        `[avatar-agent] test mode waitForParticipant succeeded identity=${participantIdentity}`,
      );
      await writeTestSignal("wait-for-participant-succeeded", {
        roomName,
        participantIdentity,
      });
    } else {
      console.warn(`[avatar-agent] test mode waitForParticipant timed out roomName=${roomName}`);
      await writeTestSignal("wait-for-participant-timeout", {
        roomName,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[avatar-agent] test mode waitForParticipant failed: ${message}`);
    await writeTestSignal("wait-for-participant-failed", {
      roomName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  console.log(`[avatar-agent] test mode awaiting room disconnect roomName=${roomName}`);
  await writeTestSignal("awaiting-room-disconnect", {
    roomName,
  });
  await new Promise((resolve) => {
    const finish = () => resolve(undefined);
    ctx.room?.on?.("disconnected", finish);
    ctx.room?.on?.("room_disconnected", finish);
  });
}

async function runAvatarAgentEntry(ctx) {
  const metadata = parseJobMetadata(ctx.job?.metadata);
  console.log(
    `[avatar-agent] job entry begin sessionKey=${metadata.sessionKey} roomName=${typeof ctx?.room?.name === "string" ? ctx.room.name : ""} interruptible=${metadata.interruptReplyOnNewMessage === true}`,
  );
  emitParentDebug("job.entry.begin", {
    sessionKey: metadata.sessionKey,
    roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
    interruptible: metadata.interruptReplyOnNewMessage === true,
  });
  if (getAvatarTestMode() === "connect-only") {
    await runAvatarAgentTestMode(ctx, metadata);
    return;
  }
  const deps = await loadDeps();
  const lemonSliceApiKey = requireEnv("OPENCLAW_AVATAR_LEMONSLICE_API_KEY");
  const tts = createGatewaySpeechTts({ deps });

  const session = new deps.agents.voice.AgentSession({
    tts,
  });
  const agent = new deps.agents.voice.Agent({
    instructions:
      "You are OpenClaw's LiveKit avatar transport. Do not generate replies yourself; only forward user speech to the local OpenClaw gateway and speak the gateway's final replies.",
  });

  const spokenRuns = new Set();
  const runProcessingQueues = new Map();
  let speechProcessingQueue = Promise.resolve();
  let gatewayClient = null;
  let activeGatewaySpeech = null;
  const interruptReplyOnNewMessage = metadata.interruptReplyOnNewMessage === true;

  const buildGatewaySpeechDebugContext = (runId = "") => ({
    sessionKey: metadata.sessionKey,
    roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
    runId,
  });

  const logGatewaySpeechCleanupError = (operation, runId, error) => {
    const errorMessage = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(
      `[avatar-agent] failed to ${operation}${runId ? ` run=${runId}` : ""}: ${errorMessage}`,
    );
    emitParentDebug("speech.cleanup.failed", {
      ...buildGatewaySpeechDebugContext(runId),
      operation,
      error: error instanceof Error ? error.message : String(error),
    });
  };

  const runGatewaySpeechCleanupStep = async (operation, runId, action) => {
    try {
      return await action();
    } catch (error) {
      logGatewaySpeechCleanupError(operation, runId, error);
      return undefined;
    }
  };

  const queueSpeechProcessing = (action) => {
    const next = speechProcessingQueue.catch(() => {}).then(action);
    const cleanup = next.catch(() => {}).finally(() => {
      if (speechProcessingQueue === cleanup) {
        speechProcessingQueue = Promise.resolve();
      }
    });
    speechProcessingQueue = cleanup;
    return next;
  };

  const emitGatewaySpeechFlush = async (reply) => {
    const runId = typeof reply?.runId === "string" ? reply.runId : "";
    const flushedTextLength =
      reply && typeof reply.streamedText === "string" ? reply.streamedText.length : 0;
    await runGatewaySpeechCleanupStep("flush gateway speech", runId, () => reply.ttsStream.flush());
    reply.flushedTextLength = flushedTextLength;
    emitParentDebug("speech.flush", {
      sessionKey: metadata.sessionKey,
      roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
      runId,
      flushedTextLength,
    });
  };

  const startGatewaySpeech = async (runId) => {
    const normalizedRunId = typeof runId === "string" ? runId.trim() : "";
    const runKey = normalizeGatewayRunKey(normalizedRunId);
    if (activeGatewaySpeech?.runKey === runKey) {
      return activeGatewaySpeech;
    }
    if (activeGatewaySpeech) {
      activeGatewaySpeech.closed = true;
      await runGatewaySpeechCleanupStep(
        "close active gateway speech controller",
        activeGatewaySpeech.runId,
        () => activeGatewaySpeech.controller?.close(),
      );
      await runGatewaySpeechCleanupStep(
        "close active gateway speech stream",
        activeGatewaySpeech.runId,
        () => activeGatewaySpeech.ttsStream.close(),
      );
      await runGatewaySpeechCleanupStep(
        "interrupt session for active gateway speech",
        activeGatewaySpeech.runId,
        () => session.interrupt({ force: true }).await,
      );
      activeGatewaySpeech = null;
    }
    if (interruptReplyOnNewMessage) {
      await runGatewaySpeechCleanupStep(
        "interrupt session before new gateway speech",
        normalizedRunId,
        () => session.interrupt({ force: true }).await,
      );
    }

    let controllerRef = null;
    const textStream = new ReadableStream({
      start(controller) {
        controllerRef = controller;
      },
    });
    const ttsStream = tts.stream();
    const audioStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of ttsStream) {
            if (chunk === deps.agents.tts.SynthesizeStream.END_OF_STREAM) {
              break;
            }
            if (!chunk || typeof chunk !== "object" || !chunk.frame) {
              continue;
            }
            controller.enqueue(chunk.frame);
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
      cancel() {
        void ttsStream.close();
      },
    });
    const speechHandle = session.say(textStream, {
      audio: audioStream,
      allowInterruptions: interruptReplyOnNewMessage,
    });
    const reply = {
      runId: normalizedRunId,
      runKey,
      controller: controllerRef,
      ttsStream,
      speechHandle,
      streamedText: "",
      flushedTextLength: 0,
      closed: false,
    };
    activeGatewaySpeech = reply;
    console.log(
      `[avatar-agent] speaking streamed gateway reply${normalizedRunId ? ` run=${normalizedRunId}` : ""} interruptible=${interruptReplyOnNewMessage}`,
    );
    emitParentDebug("speech.begin", {
      sessionKey: metadata.sessionKey,
      roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
      runId: normalizedRunId,
      interruptible: interruptReplyOnNewMessage,
      outputAudioSink:
        session?.output?.audio?.constructor?.name || typeof session?.output?.audio,
    });
    logRoomSnapshot("before-session-say", ctx.room);
    void speechHandle.waitForPlayout().then(() => {
      console.log(
        `[avatar-agent] ${speechHandle.interrupted ? "interrupted" : "finished"} gateway reply${normalizedRunId ? ` run=${normalizedRunId}` : ""}`,
      );
      emitParentDebug("speech.finished", {
        sessionKey: metadata.sessionKey,
        roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
        runId: normalizedRunId,
        interrupted: speechHandle.interrupted === true,
        outputAudioSink:
          session?.output?.audio?.constructor?.name || typeof session?.output?.audio,
      });
      logRoomSnapshot("after-session-say", ctx.room);
    }).catch((error) => {
      console.error(
        `[avatar-agent] failed to speak gateway reply${normalizedRunId ? ` run=${normalizedRunId}` : ""}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
      );
      emitParentDebug("speech.failed", {
        sessionKey: metadata.sessionKey,
        roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
        runId: normalizedRunId,
        error: error instanceof Error ? error.message : String(error),
        outputAudioSink:
          session?.output?.audio?.constructor?.name || typeof session?.output?.audio,
      });
      logRoomSnapshot("session-say-failed", ctx.room);
    }).finally(() => {
      if (activeGatewaySpeech === reply) {
        activeGatewaySpeech = null;
      }
    });
    return reply;
  };

  const pushGatewaySpeechUpdate = async (runId, text, { close = false } = {}) => {
    const normalizedText = typeof text === "string" ? text : "";
    if (!normalizedText && !close) {
      return;
    }
    let reply = await startGatewaySpeech(runId);
    const deltaText = computeStreamingTextDelta(normalizedText, reply.streamedText);
    if (deltaText === null) {
      console.warn(
        `[avatar-agent] gateway reply delta reset recovered${reply.runId ? ` run=${reply.runId}` : ""}`,
      );
      await stopGatewaySpeech(reply.runId);
      reply = await startGatewaySpeech(reply.runId);
      reply.streamedText = "";
      reply.flushedTextLength = 0;
      if (normalizedText) {
        reply.controller?.enqueue(normalizedText);
        reply.ttsStream.pushText(normalizedText);
      }
      reply.streamedText = normalizedText;
      const unflushedTextLength = reply.streamedText.length - reply.flushedTextLength;
      if (shouldFlushGatewaySpeechDelta(normalizedText, unflushedTextLength, close)) {
        await emitGatewaySpeechFlush(reply);
      }
      emitParentDebug("speech.delta", {
        sessionKey: metadata.sessionKey,
        roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
        runId: reply.runId,
        textLength: normalizedText.length,
        deltaLength: normalizedText.length,
        reset: true,
      });
    } else if (deltaText) {
      reply.controller?.enqueue(deltaText);
      reply.ttsStream.pushText(deltaText);
      reply.streamedText = normalizedText;
      const unflushedTextLength = reply.streamedText.length - reply.flushedTextLength;
      if (shouldFlushGatewaySpeechDelta(deltaText, unflushedTextLength, close)) {
        await emitGatewaySpeechFlush(reply);
      }
      emitParentDebug("speech.delta", {
        sessionKey: metadata.sessionKey,
        roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
        runId: reply.runId,
        textLength: normalizedText.length,
        deltaLength: deltaText.length,
      });
    }
    if (close && reply.flushedTextLength < reply.streamedText.length) {
      await emitGatewaySpeechFlush(reply);
    }
    if (close && !reply.closed) {
      reply.closed = true;
      await runGatewaySpeechCleanupStep("close gateway speech controller", reply.runId, () =>
        reply.controller?.close(),
      );
      await runGatewaySpeechCleanupStep("end gateway speech input", reply.runId, () =>
        reply.ttsStream.endInput(),
      );
      spokenRuns.add(reply.runKey);
    }
  };

  const stopGatewaySpeech = async (runId) => {
    const runKey = normalizeGatewayRunKey(runId);
    if (activeGatewaySpeech?.runKey !== runKey) {
      return;
    }
    activeGatewaySpeech.closed = true;
    await runGatewaySpeechCleanupStep(
      "close gateway speech controller",
      activeGatewaySpeech.runId,
      () => activeGatewaySpeech.controller?.close(),
    );
    await runGatewaySpeechCleanupStep(
      "close gateway speech stream",
      activeGatewaySpeech.runId,
      () => activeGatewaySpeech.ttsStream.close(),
    );
    await runGatewaySpeechCleanupStep(
      "interrupt session for stopped gateway speech",
      activeGatewaySpeech.runId,
      () => session.interrupt({ force: true }).await,
    );
    activeGatewaySpeech = null;
  };

  const processGatewayEvent = async (event, normalizedRunKey) => {
    try {
      const payload = event?.payload;
      const payloadSessionKey =
        typeof payload?.sessionKey === "string" ? payload.sessionKey.trim() : "";
      const payloadState = typeof payload?.state === "string" ? payload.state.trim() : "";
      const runId = typeof payload?.runId === "string" ? payload.runId.trim() : "";
      if (payloadState) {
        console.log(
          `[avatar-agent] received gateway chat event state=${payloadState}${runId ? ` run=${runId}` : ""}`,
        );
        emitParentDebug("gateway-chat-event.received", {
          sessionKey: metadata.sessionKey,
          roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
          runId,
          state: payloadState,
        });
      }
      if (!payload || payloadSessionKey !== metadata.sessionKey) {
        return;
      }
      const text = extractTextFromMessage(payload.message);
      if (
        payloadState === "delta" ||
        payloadState === "final" ||
        payloadState === "aborted" ||
        payloadState === "error"
      ) {
        await queueSpeechProcessing(async () => {
          if (payloadState === "delta") {
            if (!text || spokenRuns.has(normalizedRunKey)) {
              return;
            }
            await pushGatewaySpeechUpdate(runId, text);
            return;
          }
          if (payloadState === "final") {
            if (spokenRuns.has(normalizedRunKey) && activeGatewaySpeech?.runKey !== normalizedRunKey) {
              return;
            }
            await pushGatewaySpeechUpdate(runId, text, { close: true });
            return;
          }
          await stopGatewaySpeech(runId);
        });
      }
    } catch (error) {
      console.error(
        `[avatar-agent] failed to process gateway reply event: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
      );
      emitParentDebug("speech.failed", {
        sessionKey: metadata.sessionKey,
        roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
        runId: typeof event?.payload?.runId === "string" ? event.payload.runId.trim() : "",
        error: error instanceof Error ? error.message : String(error),
        outputAudioSink:
          session?.output?.audio?.constructor?.name || typeof session?.output?.audio,
      });
      logRoomSnapshot("session-say-failed", ctx.room);
    }
  };

  ctx.room?.on?.("participant_connected", (participant) => {
    const participantIdentity = typeof participant?.identity === "string" ? participant.identity : "";
    console.log(
      `[avatar-agent] room participant connected identity=${participantIdentity}`,
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
      `[avatar-agent] room participant disconnected identity=${participantIdentity}`,
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
      `[avatar-agent] room track subscribed participant=${participantIdentity} kind=${trackKind} source=${trackSource}`,
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
      `[avatar-agent] room track unsubscribed participant=${participantIdentity} kind=${trackKind} source=${trackSource}`,
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
    console.log("[avatar-agent] interrupting avatar speech from room control event");
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
        `[avatar-agent] failed to interrupt avatar speech: ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
      );
      emitParentDebug("speech.interrupt.failed", {
        sessionKey: metadata.sessionKey,
        roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
        source: typeof parsed.source === "string" ? parsed.source : "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  console.log("[avatar-agent] connecting plugin chat stream");
  emitParentDebug("chat-stream.connect.begin", {
    sessionKey: metadata.sessionKey,
  });
  gatewayClient = new GatewayWsClient({
    url: buildPluginHttpUrl("/plugins/openclaw-avatar/api/chat/stream", {
      sessionKey: metadata.sessionKey,
    }),
    onChatEvent: (event) => {
      const runId = typeof event?.payload?.runId === "string" ? event.payload.runId.trim() : "";
      const normalizedRunKey = normalizeGatewayRunKey(runId);
      const previous = runProcessingQueues.get(normalizedRunKey) || Promise.resolve();
      const next = previous
        .then(() => processGatewayEvent(event, normalizedRunKey))
        .catch(() => {})
        .finally(() => {
          if (runProcessingQueues.get(normalizedRunKey) === next) {
            runProcessingQueues.delete(normalizedRunKey);
          }
      });
      runProcessingQueues.set(normalizedRunKey, next);
    },
  });
  await gatewayClient.start();
  emitParentDebug("chat-stream.connect.ready", {
    sessionKey: metadata.sessionKey,
  });
  try {
    console.log("[avatar-agent] connecting agent session to room");
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
    console.log("[avatar-agent] agent session connected");
    emitParentDebug("agent-session.start.connected", {
      sessionKey: metadata.sessionKey,
      roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
      outputAudioSink:
        session?.output?.audio?.constructor?.name || typeof session?.output?.audio,
    });
    logRoomSnapshot("after-agent-session-start", ctx.room);

    const aspectRatioPayload = buildLemonSliceAspectRatioPayload(metadata.aspectRatio);
    const avatar = new deps.lemonslice.AvatarSession({
      apiKey: lemonSliceApiKey,
      agentImageUrl: metadata.imageUrl,
      idleTimeout: metadata.avatarTimeoutSeconds,
      // `extraPayload` on the constructor works with the currently installed
      // LemonSlice package, while newer upstream versions also accept it on start().
      extraPayload: aspectRatioPayload,
    });
    console.log("[avatar-agent] starting lemonslice avatar session");
    emitParentDebug("avatar.start.begin", {
      sessionKey: metadata.sessionKey,
      roomName: typeof ctx?.room?.name === "string" ? ctx.room.name : "",
      outputAudioSink:
        session?.output?.audio?.constructor?.name || typeof session?.output?.audio,
    });
    await avatar.start(session, ctx.room, {
      extraPayload: aspectRatioPayload,
    });
    console.log("[avatar-agent] lemonslice avatar session started");
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
          `[avatar-agent] room disconnected sessionKey=${metadata.sessionKey} roomName=${typeof room?.name === "string" ? room.name : ""}`,
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

export const avatarAgent = { entry: runAvatarAgentEntry };
export { GatewayWsClient, requestGatewaySpeechSynthesis };
export default avatarAgent;
