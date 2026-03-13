import { spawn, type ChildProcess } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import type {
  GatewayRequestHandlerOptions,
  OpenClawConfig,
  OpenClawPluginApi,
  OpenClawPluginServiceContext,
  RespondFn,
} from "openclaw/plugin-sdk";
import { hasConfiguredSecretInput, normalizeResolvedSecretInputString } from "openclaw/plugin-sdk";
import {
  resetProcessGroupChildren,
  stopChildProcess,
  stopMatchingProcesses,
} from "./sidecar-process-control.js";

const VIDEO_CHAT_AUDIO_MAX_BYTES = 25 * 1024 * 1024;
const LIVEKIT_TOKEN_TTL_SECONDS = 60 * 60;
const VIDEO_CHAT_ROOM_PREFIX = "openclaw";
const VIDEO_CHAT_ROOM_PART_FALLBACK = "main";
const VIDEO_CHAT_ROOM_PART_MAX_LENGTH = 48;
const VIDEO_CHAT_AGENT_NAME = "openclaw-video-chat";
const VIDEO_CHAT_PLUGIN_ID = "video-chat";
const VIDEO_CHAT_SIDECAR_INSTANCE_ARG_PREFIX = "--openclaw-video-chat-instance=";
const REDACTED_SECRET_VALUES = new Set(["_REDACTED_", "__OPENCLAW_REDACTED__"]);
const PACKAGE_VERSION_PLACEHOLDER = "__PACKAGE_VERSION__";
const ELEVENLABS_SPEECH_TO_TEXT_API_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const ELEVENLABS_SPEECH_TO_TEXT_MODEL_ID = "scribe_v1";
const ELEVENLABS_SPEECH_TO_TEXT_MAX_ATTEMPTS = 3;

type VideoChatConfigResponse = {
  provider: "lemonslice" | null;
  configured: boolean;
  missing: string[];
  lemonSlice: {
    apiKey: string | null;
    apiKeyConfigured: boolean;
    imageUrl: string | null;
  };
  livekit: {
    url: string | null;
    apiKey: string | null;
    apiKeyConfigured: boolean;
    apiSecret: string | null;
    apiSecretConfigured: boolean;
  };
  tts: {
    elevenLabsApiKey: string | null;
    elevenLabsApiKeyConfigured: boolean;
    elevenLabsVoiceId: string | null;
  };
};

type VideoChatSessionResult = {
  provider: "lemonslice";
  sessionKey: string;
  chatSessionKey: string;
  roomName: string;
  livekitUrl: string;
  participantIdentity: string;
  participantToken: string;
  agentName: string;
  interruptReplyOnNewMessage: boolean;
};

type VideoChatSessionStopResult = {
  stopped: true;
  roomName: string;
};

type SidecarCredentials = {
  lemonSliceApiKey: string;
  elevenLabsApiKey: string;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  elevenLabsVoiceId?: string;
  elevenLabsModelId?: string;
};

type VideoChatAgentSidecar = {
  stop: () => Promise<void>;
  resetJobs: () => Promise<void>;
};

type SidecarLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

type GatewayRuntime = NonNullable<OpenClawPluginServiceContext["gateway"]>;
type SidecarGatewayRuntime =
  | GatewayRuntime
  | { port: number; auth: { mode: "none" } };

type LiveKitAgentDispatch = {
  agentName: string;
  metadata?: string;
};

type LiveKitRoomConfig = {
  agents?: LiveKitAgentDispatch[];
};

type GatewayErrorShape = {
  code: string;
  message: string;
  details?: unknown;
};

type VideoChatSetupInput = {
  gatewayToken?: string;
  lemonSliceApiKey?: string;
  lemonSliceImageUrl?: string;
  livekitUrl?: string;
  livekitApiKey?: string;
  livekitApiSecret?: string;
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
};

type HttpResponsePayload = {
  status: number;
  headers?: Record<string, string>;
  body: string | Buffer;
};

type VideoChatSessionHandlers = {
  createSession: (params: {
    config: OpenClawConfig;
    sessionKey: string;
    interruptReplyOnNewMessage?: boolean;
  }) => Promise<VideoChatSessionResult>;
  stopSession: (params: { roomName: string }) => Promise<VideoChatSessionStopResult>;
};

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalSetupSecretString(value: unknown): string | undefined {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) {
    return undefined;
  }
  return REDACTED_SECRET_VALUES.has(trimmed) ? undefined : trimmed;
}

function validateLemonSliceImageUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "videoChat.lemonSlice.imageUrl must be a valid URL";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "videoChat.lemonSlice.imageUrl must use http or https";
  }

  const trimmedPath = parsed.pathname.replace(/\/+$/g, "");
  if (!trimmedPath || trimmedPath === "/") {
    return "videoChat.lemonSlice.imageUrl must be a direct image URL, not a directory";
  }

  const lastPathSegment = trimmedPath.split("/").at(-1) ?? "";
  if (!lastPathSegment || lastPathSegment === "f") {
    return "videoChat.lemonSlice.imageUrl must include an image path after the host";
  }

  return null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asObjectRecord(value: unknown): Record<string, unknown> {
  return isObjectRecord(value) ? value : {};
}

function readVideoChatPluginConfig(config: OpenClawConfig): Record<string, unknown> | null {
  const plugins = asObjectRecord(config.plugins);
  const entries = asObjectRecord(plugins.entries);
  const pluginEntry = asObjectRecord(entries[VIDEO_CHAT_PLUGIN_ID]);
  const pluginConfig = pluginEntry.config;
  return isObjectRecord(pluginConfig) ? pluginConfig : null;
}

function resolveEffectiveVideoChatConfig(config: OpenClawConfig): OpenClawConfig {
  const pluginConfig = readVideoChatPluginConfig(config);
  if (!pluginConfig) {
    return config;
  }
  // Plugin-owned setup is persisted under plugins.entries.video-chat.config, but the rest of the
  // runtime reads the effective top-level videoChat/messages branches.
  const effective: OpenClawConfig = { ...config };
  if (isObjectRecord(pluginConfig.videoChat)) {
    effective.videoChat = pluginConfig.videoChat as OpenClawConfig["videoChat"];
  }
  if (isObjectRecord(pluginConfig.messages)) {
    effective.messages = pluginConfig.messages as OpenClawConfig["messages"];
  }
  return effective;
}

function resolveGatewayRuntimeFromConfig(config: OpenClawConfig): SidecarGatewayRuntime | null {
  const root = asObjectRecord(config);
  const gateway = asObjectRecord(root.gateway);
  const auth = asObjectRecord(gateway.auth);

  const envPort = Number(process.env.OPENCLAW_GATEWAY_PORT ?? "");
  const configPort = gateway.port;
  const resolvedPort =
    typeof configPort === "number" && Number.isFinite(configPort)
      ? configPort
      : Number.isFinite(envPort)
        ? envPort
        : 18789;
  const port = Math.max(1, Math.floor(resolvedPort));

  const mode = typeof auth.mode === "string" ? auth.mode.trim() : "";
  if (mode === "password") {
    const password =
      typeof auth.password === "string" && auth.password.trim()
        ? auth.password
        : typeof process.env.OPENCLAW_GATEWAY_PASSWORD === "string" &&
            process.env.OPENCLAW_GATEWAY_PASSWORD.trim()
          ? process.env.OPENCLAW_GATEWAY_PASSWORD
          : undefined;
    return { port, auth: { mode: "password", password } };
  }
  if (mode === "trusted-proxy") {
    return { port, auth: { mode: "trusted-proxy" } };
  }
  if (mode === "none") {
    return { port, auth: { mode: "none" } };
  }
  const token =
    typeof auth.token === "string" && auth.token.trim()
      ? auth.token
      : typeof process.env.OPENCLAW_GATEWAY_TOKEN === "string" &&
          process.env.OPENCLAW_GATEWAY_TOKEN.trim()
        ? process.env.OPENCLAW_GATEWAY_TOKEN
        : undefined;
  return { port, auth: { mode: "token", token } };
}

function respondGatewayError(
  respond: RespondFn,
  code: "INVALID_REQUEST" | "UNAVAILABLE",
  message: string,
  details?: unknown,
): void {
  const errorShape: GatewayErrorShape = details ? { code, message, details } : { code, message };
  respond(false, undefined, errorShape);
}

function mimeTypeForAudioPath(audioPath: string): string {
  if (audioPath.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (audioPath.endsWith(".opus")) {
    return "audio/ogg; codecs=opus";
  }
  if (audioPath.endsWith(".wav")) {
    return "audio/wav";
  }
  return "application/octet-stream";
}

function pcm16LeToWavBuffer(params: { pcm: Buffer; sampleRate: number }): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = params.sampleRate * blockAlign;
  const dataSize = params.pcm.length;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(params.sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataSize, 40);
  params.pcm.copy(wav, 44);
  return wav;
}

function toAudioBuffer(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const decoded = Buffer.from(trimmed, "base64");
      return decoded.length > 0 ? decoded : null;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeMimeType(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : undefined;
}

function extensionForAudioMimeType(mimeType: string | undefined): string {
  switch (mimeType) {
    case "audio/mpeg":
    case "audio/mp3":
      return ".mp3";
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
      return ".wav";
    case "audio/ogg":
    case "audio/ogg; codecs=opus":
      return ".ogg";
    case "audio/webm":
    case "audio/webm;codecs=opus":
    case "audio/webm; codecs=opus":
      return ".webm";
    case "audio/mp4":
      return ".mp4";
    case "audio/x-m4a":
      return ".m4a";
    case "audio/aac":
      return ".aac";
    case "audio/flac":
      return ".flac";
    default:
      return ".bin";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function truncateForLog(value: string, maxLength = 240): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function parseElevenLabsErrorMessage(rawBody: string, status: number): string {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return `Claw Cast transcription failed: ElevenLabs returned ${status}`;
  }

  try {
    const payload = JSON.parse(trimmed) as Record<string, unknown>;
    const detail = payload.detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail.trim();
    }
    if (Array.isArray(detail)) {
      const detailMessage = detail
        .map((entry) => {
          if (typeof entry === "string" && entry.trim()) {
            return entry.trim();
          }
          if (
            entry &&
            typeof entry === "object" &&
            typeof (entry as { msg?: unknown }).msg === "string" &&
            (entry as { msg: string }).msg.trim()
          ) {
            return (entry as { msg: string }).msg.trim();
          }
          return "";
        })
        .filter(Boolean)
        .join("; ");
      if (detailMessage) {
        return detailMessage;
      }
    }
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message.trim();
    }
    if (
      payload.error &&
      typeof payload.error === "object" &&
      typeof (payload.error as { message?: unknown }).message === "string" &&
      (payload.error as { message: string }).message.trim()
    ) {
      return (payload.error as { message: string }).message.trim();
    }
  } catch {}

  return `Claw Cast transcription failed: ElevenLabs returned ${status} (${truncateForLog(trimmed)})`;
}

function sanitizeVideoChatRoomPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    return VIDEO_CHAT_ROOM_PART_FALLBACK;
  }
  return normalized.slice(0, VIDEO_CHAT_ROOM_PART_MAX_LENGTH);
}

function resolveVideoChatChatSessionKey(params: {
  requestedSessionKey: string;
  config: OpenClawConfig;
}): string {
  const requested = params.requestedSessionKey.trim();
  if (!requested) {
    return "agent:main:main";
  }
  if (requested.includes(":")) {
    return requested;
  }
  const mainKey = normalizeOptionalString(params.config.session?.mainKey) ?? "main";
  if (requested.toLowerCase() !== mainKey.toLowerCase()) {
    return requested;
  }
  return `agent:main:${mainKey}`;
}

function toBase64Url(value: Buffer | string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function toBase64UrlJson(value: object): string {
  return toBase64Url(Buffer.from(JSON.stringify(value)));
}

function buildVideoChatDispatchMetadata(params: {
  sessionKey: string;
  imageUrl: string;
  interruptReplyOnNewMessage?: boolean;
}): string {
  return JSON.stringify({
    sessionKey: params.sessionKey,
    imageUrl: params.imageUrl,
    interruptReplyOnNewMessage: params.interruptReplyOnNewMessage === true,
  });
}

function createLiveKitAccessToken(params: {
  apiKey: string;
  apiSecret: string;
  roomName: string;
  identity: string;
  metadata?: Record<string, string>;
  roomConfig?: LiveKitRoomConfig;
  ttlSeconds?: number;
  nowMs?: number;
}): string {
  const nowMs = params.nowMs ?? Date.now();
  const issuedAt = Math.floor(nowMs / 1000);
  const expiresAt = issuedAt + (params.ttlSeconds ?? LIVEKIT_TOKEN_TTL_SECONDS);
  const header = toBase64UrlJson({ alg: "HS256", typ: "JWT" });
  const payload = toBase64UrlJson({
    iss: params.apiKey,
    sub: params.identity,
    iat: issuedAt,
    nbf: issuedAt - 10,
    exp: expiresAt,
    name: params.identity,
    metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
    roomConfig: params.roomConfig,
    video: {
      room: params.roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  });
  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", params.apiSecret).update(signingInput).digest();
  return `${signingInput}.${toBase64Url(signature)}`;
}

function validateVideoChatRoomName(roomName: string): string {
  const normalizedRoomName = roomName.trim();
  if (!normalizedRoomName) {
    throw new Error("roomName is required");
  }
  if (!normalizedRoomName.startsWith(`${VIDEO_CHAT_ROOM_PREFIX}-`)) {
    throw new Error("invalid Claw Cast room name");
  }
  return normalizedRoomName;
}

function buildVideoChatConfigResponse(config: OpenClawConfig): VideoChatConfigResponse {
  const effective = resolveEffectiveVideoChatConfig(config);
  const provider = effective.videoChat?.provider === "lemonslice" ? "lemonslice" : null;
  const lemonSlice = effective.videoChat?.lemonSlice;
  const livekit = effective.videoChat?.livekit;
  const elevenLabs = effective.messages?.tts?.elevenlabs;
  const missing: string[] = [];
  const readSecretValue = (value: unknown, path: string): string | null => {
    if (!hasConfiguredSecretInput(value)) {
      return null;
    }
    return normalizeResolvedSecretInputString({ value, path });
  };

  if (provider !== "lemonslice") {
    missing.push("videoChat.provider");
  }
  if (!hasConfiguredSecretInput(lemonSlice?.apiKey)) {
    missing.push("videoChat.lemonSlice.apiKey");
  }
  if (!normalizeOptionalString(lemonSlice?.imageUrl)) {
    missing.push("videoChat.lemonSlice.imageUrl");
  }
  if (!normalizeOptionalString(livekit?.url)) {
    missing.push("videoChat.livekit.url");
  }
  if (!hasConfiguredSecretInput(livekit?.apiKey)) {
    missing.push("videoChat.livekit.apiKey");
  }
  if (!hasConfiguredSecretInput(livekit?.apiSecret)) {
    missing.push("videoChat.livekit.apiSecret");
  }
  if (!hasConfiguredSecretInput(elevenLabs?.apiKey)) {
    missing.push("messages.tts.elevenlabs.apiKey");
  }

  return {
    provider,
    configured: missing.length === 0,
    missing,
    lemonSlice: {
      apiKey: readSecretValue(lemonSlice?.apiKey, "videoChat.lemonSlice.apiKey"),
      apiKeyConfigured: hasConfiguredSecretInput(lemonSlice?.apiKey),
      imageUrl: normalizeOptionalString(lemonSlice?.imageUrl) ?? null,
    },
    livekit: {
      url: normalizeOptionalString(livekit?.url) ?? null,
      apiKey: readSecretValue(livekit?.apiKey, "videoChat.livekit.apiKey"),
      apiKeyConfigured: hasConfiguredSecretInput(livekit?.apiKey),
      apiSecret: readSecretValue(livekit?.apiSecret, "videoChat.livekit.apiSecret"),
      apiSecretConfigured: hasConfiguredSecretInput(livekit?.apiSecret),
    },
    tts: {
      elevenLabsApiKey: readSecretValue(elevenLabs?.apiKey, "messages.tts.elevenlabs.apiKey"),
      elevenLabsApiKeyConfigured: hasConfiguredSecretInput(elevenLabs?.apiKey),
      elevenLabsVoiceId: normalizeOptionalString(elevenLabs?.voiceId) ?? null,
    },
  };
}

function parseVideoChatSetupInput(
  params: Record<string, unknown>,
  method: string,
): VideoChatSetupInput {
  const readInput = (key: keyof VideoChatSetupInput): string | undefined => {
    const value = params[key];
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== "string") {
      throw new Error(`invalid ${method} params`);
    }
    return value;
  };

  const parsed: VideoChatSetupInput = {
    gatewayToken: readInput("gatewayToken"),
    lemonSliceApiKey: readInput("lemonSliceApiKey"),
    lemonSliceImageUrl: readInput("lemonSliceImageUrl"),
    livekitUrl: readInput("livekitUrl"),
    livekitApiKey: readInput("livekitApiKey"),
    livekitApiSecret: readInput("livekitApiSecret"),
    elevenLabsApiKey: readInput("elevenLabsApiKey"),
    elevenLabsVoiceId: readInput("elevenLabsVoiceId"),
  };

  const lemonSliceImageUrl = normalizeOptionalString(parsed.lemonSliceImageUrl);
  if (lemonSliceImageUrl) {
    const validationError = validateLemonSliceImageUrl(lemonSliceImageUrl);
    if (validationError) {
      throw new Error(`invalid ${method} params: ${validationError}`);
    }
  }

  return parsed;
}

function applyVideoChatSetupToConfig(
  config: OpenClawConfig,
  setupInput: VideoChatSetupInput,
): OpenClawConfig {
  const effective = resolveEffectiveVideoChatConfig(config);
  const gatewayRecord = asObjectRecord(config.gateway);
  const gatewayAuthRecord = asObjectRecord(gatewayRecord.auth);
  const gatewayToken = normalizeOptionalSetupSecretString(setupInput.gatewayToken);
  const lemonSliceApiKey =
    normalizeOptionalSetupSecretString(setupInput.lemonSliceApiKey) ??
    effective.videoChat?.lemonSlice?.apiKey;
  const lemonSliceImageUrl =
    normalizeOptionalString(setupInput.lemonSliceImageUrl) ??
    effective.videoChat?.lemonSlice?.imageUrl;
  const livekitUrl =
    normalizeOptionalString(setupInput.livekitUrl) ?? effective.videoChat?.livekit?.url;
  const livekitApiKey =
    normalizeOptionalSetupSecretString(setupInput.livekitApiKey) ??
    effective.videoChat?.livekit?.apiKey;
  const livekitApiSecret =
    normalizeOptionalSetupSecretString(setupInput.livekitApiSecret) ??
    effective.videoChat?.livekit?.apiSecret;
  const elevenLabsApiKey =
    normalizeOptionalSetupSecretString(setupInput.elevenLabsApiKey) ??
    effective.messages?.tts?.elevenlabs?.apiKey;
  const elevenLabsVoiceId =
    normalizeOptionalString(setupInput.elevenLabsVoiceId) ??
    effective.messages?.tts?.elevenlabs?.voiceId;

  const plugins = asObjectRecord(config.plugins);
  const entries = asObjectRecord(plugins.entries);
  const pluginEntry = asObjectRecord(entries[VIDEO_CHAT_PLUGIN_ID]);
  const existingPluginConfig = asObjectRecord(pluginEntry.config);

  const videoChatRecord = asObjectRecord(effective.videoChat);
  const lemonSliceRecord = asObjectRecord(videoChatRecord.lemonSlice);
  const livekitRecord = asObjectRecord(videoChatRecord.livekit);
  const messagesRecord = asObjectRecord(effective.messages);
  const ttsRecord = asObjectRecord(messagesRecord.tts);
  const elevenLabsRecord = asObjectRecord(ttsRecord.elevenlabs);

  return {
    ...config,
    ...(gatewayToken
      ? {
          gateway: {
            ...gatewayRecord,
            auth: {
              ...gatewayAuthRecord,
              mode: "token",
              token: gatewayToken,
            },
          },
        }
      : {}),
    plugins: {
      ...plugins,
      entries: {
        ...entries,
        [VIDEO_CHAT_PLUGIN_ID]: {
          ...pluginEntry,
          config: {
            ...existingPluginConfig,
            videoChat: {
              ...videoChatRecord,
              provider: "lemonslice",
              lemonSlice: {
                ...lemonSliceRecord,
                apiKey: lemonSliceApiKey,
                imageUrl: lemonSliceImageUrl,
              },
              livekit: {
                ...livekitRecord,
                url: livekitUrl,
                apiKey: livekitApiKey,
                apiSecret: livekitApiSecret,
              },
            },
            messages: {
              ...messagesRecord,
              tts: {
                ...ttsRecord,
                elevenlabs: {
                  ...elevenLabsRecord,
                  apiKey: elevenLabsApiKey,
                  voiceId: elevenLabsVoiceId,
                },
              },
            },
          },
        },
      },
    },
  };
}

async function writeConfigFile(api: OpenClawPluginApi, config: OpenClawConfig): Promise<void> {
  const writer = (api.runtime.config as { writeConfigFile?: unknown }).writeConfigFile;
  if (typeof writer !== "function") {
    throw new Error("Claw Cast setup is unavailable: runtime config writer is missing");
  }
  await (writer as (nextConfig: OpenClawConfig) => Promise<void>)(config);
}

async function transcribeVideoChatAudio(params: {
  runtime: OpenClawPluginApi["runtime"];
  logger: OpenClawPluginApi["logger"];
  cfg: OpenClawConfig;
  base64Data: string;
  mimeType?: unknown;
}): Promise<{ transcript: string }> {
  const base64 = params.base64Data.trim();
  if (!base64) {
    throw new Error("audio data is required");
  }

  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(base64, "base64");
  } catch {
    throw new Error("invalid base64 audio payload");
  }

  if (audioBuffer.length === 0) {
    throw new Error("audio payload is empty");
  }
  if (audioBuffer.length > VIDEO_CHAT_AUDIO_MAX_BYTES) {
    throw new Error("audio payload is too large");
  }

  const effectiveConfig = resolveEffectiveVideoChatConfig(params.cfg);
  const elevenLabsApiKey = normalizeResolvedSecretInputString({
    value: effectiveConfig.messages?.tts?.elevenlabs?.apiKey,
    path: "messages.tts.elevenlabs.apiKey",
  });
  if (!elevenLabsApiKey) {
    throw new Error("Claw Cast transcription is unavailable: missing ElevenLabs API key");
  }

  const mimeType = normalizeMimeType(params.mimeType);
  const fileName = `input${extensionForAudioMimeType(mimeType)}`;

  for (let attempt = 1; attempt <= ELEVENLABS_SPEECH_TO_TEXT_MAX_ATTEMPTS; attempt += 1) {
    const form = new FormData();
    form.append("model_id", ELEVENLABS_SPEECH_TO_TEXT_MODEL_ID);
    form.append(
      "file",
      new Blob([new Uint8Array(audioBuffer)], { type: mimeType ?? "application/octet-stream" }),
      fileName,
    );

    try {
      const response = await fetch(ELEVENLABS_SPEECH_TO_TEXT_API_URL, {
        method: "POST",
        headers: {
          "xi-api-key": elevenLabsApiKey,
        },
        body: form,
      });

      const rawBody = await response.text();
      if (!response.ok) {
        const message = parseElevenLabsErrorMessage(rawBody, response.status);
        const retryable = response.status === 429 || response.status >= 500;
        params.logger.warn(
          `Claw Cast transcription attempt ${attempt}/${ELEVENLABS_SPEECH_TO_TEXT_MAX_ATTEMPTS} failed with status=${response.status}: ${message}`,
        );
        if (retryable && attempt < ELEVENLABS_SPEECH_TO_TEXT_MAX_ATTEMPTS) {
          await sleep(250 * attempt);
          continue;
        }
        throw new Error(message);
      }

      let payload: Record<string, unknown> | null = null;
      if (rawBody.trim()) {
        try {
          payload = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
          payload = null;
        }
      }

      const transcript = typeof payload?.text === "string" ? payload.text.trim() : "";
      if (!transcript) {
        throw new Error("Claw Cast transcription returned no text");
      }
      return { transcript };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const networkError =
        message === "fetch failed" ||
        message.includes("ECONNRESET") ||
        message.includes("ETIMEDOUT") ||
        message.includes("ENOTFOUND");
      if (networkError && attempt < ELEVENLABS_SPEECH_TO_TEXT_MAX_ATTEMPTS) {
        params.logger.warn(
          `Claw Cast transcription attempt ${attempt}/${ELEVENLABS_SPEECH_TO_TEXT_MAX_ATTEMPTS} errored: ${message}`,
        );
        await sleep(250 * attempt);
        continue;
      }
      throw error;
    }
  }

  throw new Error("Claw Cast transcription failed after retries");
}

async function generateVideoChatSpeech(params: {
  runtime: OpenClawPluginApi["runtime"];
  cfg: OpenClawConfig;
  text: string;
}): Promise<{
  mimeType: string;
  data: string;
  provider: string | null | undefined;
  outputFormat: string | null | undefined;
}> {
  const text = params.text.trim();
  if (!text) {
    throw new Error("text is required");
  }

  const cfg = resolveEffectiveVideoChatConfig(params.cfg);
  const ttsRuntime = params.runtime.tts as Record<string, unknown>;
  const textToSpeech = ttsRuntime?.textToSpeech;
  if (typeof textToSpeech === "function") {
    const result = await (
      textToSpeech as (input: {
        text: string;
        cfg: OpenClawConfig;
      }) => Promise<{
        success: boolean;
        audioPath?: string;
        audioBuffer?: unknown;
        error?: string;
        provider?: string | null;
        outputFormat?: string | null;
      }>
    )({
      text,
      cfg,
    });
    if (!result.success) {
      throw new Error(result.error ?? "Claw Cast TTS generation failed");
    }
    if (typeof result.audioPath === "string" && result.audioPath.trim()) {
      const audio = readFileSync(result.audioPath);
      return {
        mimeType: mimeTypeForAudioPath(result.audioPath),
        data: audio.toString("base64"),
        provider: result.provider,
        outputFormat: result.outputFormat,
      };
    }
    const buffer = toAudioBuffer(result.audioBuffer);
    if (buffer) {
      return {
        mimeType: "audio/mpeg",
        data: buffer.toString("base64"),
        provider: result.provider,
        outputFormat: result.outputFormat,
      };
    }
    throw new Error("Claw Cast TTS generation failed: runtime returned no audio payload");
  }

  const textToSpeechTelephony = ttsRuntime?.textToSpeechTelephony;
  if (typeof textToSpeechTelephony === "function") {
    const result = await (
      textToSpeechTelephony as (input: {
        text: string;
        cfg: OpenClawConfig;
      }) => Promise<{
        success: boolean;
        audioBuffer?: unknown;
        error?: string;
        provider?: string | null;
        outputFormat?: string | null;
        sampleRate?: number;
      }>
    )({
      text,
      cfg,
    });
    if (!result.success) {
      throw new Error(result.error ?? "Claw Cast TTS generation failed");
    }
    const pcmBuffer = toAudioBuffer(result.audioBuffer);
    if (!pcmBuffer) {
      throw new Error("Claw Cast TTS generation failed: telephony output missing audio buffer");
    }
    const sampleRate =
      typeof result.sampleRate === "number" && Number.isFinite(result.sampleRate)
        ? Math.max(8_000, Math.floor(result.sampleRate))
        : 24_000;
    const wav = pcm16LeToWavBuffer({ pcm: pcmBuffer, sampleRate });
    return {
      mimeType: "audio/wav",
      data: wav.toString("base64"),
      provider: result.provider,
      outputFormat: result.outputFormat ?? `pcm_${sampleRate}`,
    };
  }

  throw new Error("Claw Cast TTS generation failed: runtime TTS API is unavailable");
}

function readCliOption(options: unknown, key: string): string | undefined {
  if (!isObjectRecord(options)) {
    return undefined;
  }
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}

async function promptTerminalField(params: {
  rl: ReturnType<typeof createInterface>;
  label: string;
  defaultValue?: string;
}): Promise<string | undefined> {
  const prompt = `${params.label}${params.defaultValue ? ` [${params.defaultValue}]` : ""}: `;
  const input = (await params.rl.question(prompt)).trim();
  if (input.length === 0) {
    return undefined;
  }
  return input;
}

async function runVideoChatSetupCli(api: OpenClawPluginApi, options: unknown): Promise<void> {
  const currentConfig = api.runtime.config.loadConfig();
  const effectiveCurrentConfig = resolveEffectiveVideoChatConfig(currentConfig);

  let setupInput: VideoChatSetupInput = {
    gatewayToken:
      readCliOption(options, "gatewayToken") ??
      process.env.VIDEO_CHAT_GATEWAY_TOKEN ??
      process.env.OPENCLAW_GATEWAY_TOKEN,
    lemonSliceApiKey:
      readCliOption(options, "lemonsliceApiKey") ??
      readCliOption(options, "lemonSliceApiKey") ??
      process.env.VIDEO_CHAT_LEMONSLICE_API_KEY,
    lemonSliceImageUrl:
      readCliOption(options, "lemonsliceImageUrl") ??
      readCliOption(options, "lemonSliceImageUrl") ??
      process.env.VIDEO_CHAT_LEMONSLICE_IMAGE_URL,
    livekitUrl: readCliOption(options, "livekitUrl") ?? process.env.VIDEO_CHAT_LIVEKIT_URL,
    livekitApiKey:
      readCliOption(options, "livekitApiKey") ?? process.env.VIDEO_CHAT_LIVEKIT_API_KEY,
    livekitApiSecret:
      readCliOption(options, "livekitApiSecret") ?? process.env.VIDEO_CHAT_LIVEKIT_API_SECRET,
    elevenLabsApiKey:
      readCliOption(options, "elevenlabsApiKey") ??
      readCliOption(options, "elevenLabsApiKey") ??
      process.env.VIDEO_CHAT_ELEVENLABS_API_KEY,
    elevenLabsVoiceId:
      readCliOption(options, "elevenlabsVoiceId") ??
      readCliOption(options, "elevenLabsVoiceId") ??
      process.env.VIDEO_CHAT_ELEVENLABS_VOICE_ID,
  };

  if (
    Object.values(setupInput).every((value) => value === undefined) &&
    process.stdin.isTTY &&
    process.stdout.isTTY
  ) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      setupInput = {
        gatewayToken: await promptTerminalField({ rl, label: "Gateway token" }),
        lemonSliceApiKey: await promptTerminalField({ rl, label: "LemonSlice API key" }),
        lemonSliceImageUrl: await promptTerminalField({
          rl,
          label: "LemonSlice image URL",
          defaultValue: normalizeOptionalString(
            effectiveCurrentConfig.videoChat?.lemonSlice?.imageUrl,
          ),
        }),
        livekitUrl: await promptTerminalField({
          rl,
          label: "LiveKit URL",
          defaultValue: normalizeOptionalString(effectiveCurrentConfig.videoChat?.livekit?.url),
        }),
        livekitApiKey: await promptTerminalField({ rl, label: "LiveKit API key" }),
        livekitApiSecret: await promptTerminalField({ rl, label: "LiveKit API secret" }),
        elevenLabsApiKey: await promptTerminalField({ rl, label: "ElevenLabs API key" }),
        elevenLabsVoiceId: await promptTerminalField({
          rl,
          label: "ElevenLabs voice ID",
          defaultValue: normalizeOptionalString(
            effectiveCurrentConfig.messages?.tts?.elevenlabs?.voiceId,
          ),
        }),
      };
    } finally {
      rl.close();
    }
  }

  const hasAnyInput = Object.values(setupInput).some((value) => value !== undefined);
  if (!hasAnyInput) {
    throw new Error(
      "Claw Cast setup command requires CLI options, environment variables, or interactive input",
    );
  }

  const nextConfig = applyVideoChatSetupToConfig(currentConfig, setupInput);
  await writeConfigFile(api, nextConfig);
  const status = buildVideoChatConfigResponse(nextConfig);
  api.logger.info(
    `Claw Cast setup saved${status.configured ? "" : `; missing ${status.missing.join(", ")}`}`,
  );
}

function registerVideoChatSetupCli(api: OpenClawPluginApi): void {
  api.registerCli(({ program }: { program: any }) => {
      program
        .command("video-chat-setup")
        .description("Configure OpenClaw gateway auth and Claw Cast provider credentials")
        .option("--gateway-token <token>", "OpenClaw gateway token")
        .option("--lemonslice-api-key <key>", "LemonSlice API key")
        .option("--lemonslice-image-url <url>", "LemonSlice image URL")
        .option("--livekit-url <url>", "LiveKit URL")
        .option("--livekit-api-key <key>", "LiveKit API key")
        .option("--livekit-api-secret <secret>", "LiveKit API secret")
        .option("--elevenlabs-api-key <key>", "ElevenLabs API key")
        .option("--elevenlabs-voice-id <id>", "ElevenLabs voice ID")
        .action(async (options: unknown) => {
          await runVideoChatSetupCli(api, options);
        });
    });
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", () => reject(new Error("failed to read request body")));
  });
}

async function readRequestJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const text = (await readRequestBody(request)).trim();
  if (!text) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("invalid JSON body");
  }
  if (!isObjectRecord(parsed)) {
    throw new Error("invalid JSON body");
  }
  return parsed;
}

function sendHttpResponse(res: ServerResponse, payload: HttpResponsePayload): void {
  res.statusCode = payload.status;
  for (const [name, value] of Object.entries(payload.headers ?? {})) {
    res.setHeader(name, value);
  }
  res.end(payload.body);
}

function asJsonResponse(body: unknown, status = 200): HttpResponsePayload {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function asTextResponse(body: string, contentType: string, status = 200): HttpResponsePayload {
  return {
    status,
    headers: { "content-type": contentType },
    body,
  };
}

function withBrowserShellHeaders(payload: HttpResponsePayload): HttpResponsePayload {
  return {
    ...payload,
    headers: {
      ...(payload.headers ?? {}),
      "permissions-policy": "microphone=(self)",
    },
  };
}

function parseRequestPathname(urlValue: string | undefined): string | null {
  if (!urlValue) {
    return null;
  }
  try {
    return new URL(urlValue, "http://127.0.0.1").pathname;
  } catch {
    return null;
  }
}

async function resolveExistingDirectory(candidates: string[]): Promise<string | null> {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    try {
      const entry = await stat(normalized);
      if (entry.isDirectory()) {
        return normalized;
      }
    } catch {
      // Keep scanning fallback directories.
    }
  }
  return null;
}

async function resolveExistingFile(candidates: string[]): Promise<string | null> {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    try {
      const entry = await stat(normalized);
      if (entry.isFile()) {
        return normalized;
      }
    } catch {
      // Keep scanning fallback files.
    }
  }
  return null;
}

function moduleWebRootCandidates(): string[] {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(moduleDir, "..", "web"),
    path.resolve(moduleDir, "..", "..", "web"),
  ];
}

function moduleStylesRootCandidates(): string[] {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(moduleDir, "..", "styles"),
    path.resolve(moduleDir, "..", "..", "styles"),
  ];
}

function modulePackageJsonCandidates(): string[] {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(moduleDir, "..", "package.json"),
    path.resolve(moduleDir, "..", "..", "package.json"),
  ];
}

function moduleReadmeCandidates(): string[] {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(moduleDir, "..", "README.md"),
    path.resolve(moduleDir, "..", "..", "README.md"),
  ];
}

function moduleAssetsRootCandidates(): string[] {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(moduleDir, "..", "assets"),
    path.resolve(moduleDir, "..", "..", "assets"),
  ];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function encodePathSegments(value: string): string {
  return value
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function resolveReadmeHref(target: string): string {
  const trimmed = target.trim();
  if (!trimmed) {
    return "#";
  }
  if (
    trimmed.startsWith("#") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:")
  ) {
    return trimmed;
  }
  if (trimmed === "README.md" || trimmed === "./README.md") {
    return "/plugins/video-chat/readme";
  }
  if (trimmed.startsWith("assets/")) {
    return `/plugins/video-chat/assets/${encodePathSegments(trimmed.slice("assets/".length))}`;
  }
  return trimmed;
}

function renderMarkdownInline(value: string): string {
  const codeTokens: string[] = [];
  const storeCodeToken = (html: string) => {
    const token = `\u0000CODE${codeTokens.length}\u0000`;
    codeTokens.push(html);
    return token;
  };

  let rendered = value.replace(/`([^`]+)`/g, (_match, code: string) =>
    storeCodeToken(`<code>${escapeHtml(code)}</code>`),
  );
  rendered = escapeHtml(rendered);
  rendered = rendered.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, href: string) => {
    const src = resolveReadmeHref(href);
    return `<img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}" loading="lazy" />`;
  });
  rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
    const resolvedHref = resolveReadmeHref(href);
    return `<a href="${escapeHtmlAttribute(resolvedHref)}">${label}</a>`;
  });
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  rendered = rendered.replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,!?]|$)/g, "$1<em>$2</em>");
  rendered = rendered.replace(
    /(^|[\s(])(https?:\/\/[^\s<)]+)(?=[\s).,!?]|$)/g,
    '$1<a href="$2">$2</a>',
  );
  return rendered.replace(/\u0000CODE(\d+)\u0000/g, (_match, index: string) => {
    return codeTokens[Number(index)] ?? "";
  });
}

function isMarkdownTableSeparator(line: string): boolean {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
}

function parseMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function renderMarkdownList(lines: string[], startIndex: number, indentLength: number) {
  const items: string[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const itemMatch = lines[index]?.match(/^(\s*)-\s+(.*)$/);
    if (!itemMatch) {
      break;
    }
    const currentIndent = itemMatch[1]?.length ?? 0;
    if (currentIndent < indentLength) {
      break;
    }
    if (currentIndent !== indentLength) {
      break;
    }

    const itemParts = [renderMarkdownInline(itemMatch[2] ?? "")];
    index += 1;

    while (index < lines.length) {
      const nextLine = lines[index] ?? "";
      if (!nextLine.trim()) {
        index += 1;
        break;
      }

      const nestedItemMatch = nextLine.match(/^(\s*)-\s+(.*)$/);
      if (nestedItemMatch) {
        const nestedIndent = nestedItemMatch[1]?.length ?? 0;
        if (nestedIndent === indentLength) {
          break;
        }
        if (nestedIndent > indentLength) {
          const nestedList = renderMarkdownList(lines, index, nestedIndent);
          itemParts.push(nestedList.html);
          index = nestedList.nextIndex;
          continue;
        }
        break;
      }

      const continuationIndent = nextLine.match(/^\s*/)?.[0].length ?? 0;
      if (continuationIndent > indentLength) {
        const paragraphLines = [nextLine.trim()];
        index += 1;
        while (index < lines.length) {
          const candidate = lines[index] ?? "";
          if (!candidate.trim()) {
            index += 1;
            break;
          }
          const candidateListMatch = candidate.match(/^(\s*)-\s+(.*)$/);
          if (candidateListMatch) {
            const candidateIndent = candidateListMatch[1]?.length ?? 0;
            if (candidateIndent <= continuationIndent) {
              break;
            }
          }
          const candidateIndent = candidate.match(/^\s*/)?.[0].length ?? 0;
          if (candidateIndent <= indentLength) {
            break;
          }
          paragraphLines.push(candidate.trim());
          index += 1;
        }
        itemParts.push(`<p>${renderMarkdownInline(paragraphLines.join(" "))}</p>`);
        continue;
      }

      break;
    }

    items.push(`<li>${itemParts.join("")}</li>`);
  }

  return {
    html: `<ul>${items.join("")}</ul>`,
    nextIndex: index,
  };
}

function renderMarkdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^```/.test(trimmed)) {
      const language = trimmed.slice(3).trim();
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !/^```/.test((lines[index] ?? "").trim())) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      const languageClass = language ? ` class="language-${escapeHtmlAttribute(language)}"` : "";
      html.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    if (trimmed.startsWith("<div")) {
      const block: string[] = [];
      while (index < lines.length) {
        const currentLine = lines[index] ?? "";
        block.push(currentLine);
        index += 1;
        if (currentLine.trim() === "</div>") {
          break;
        }
      }
      html.push(block.join("\n"));
      continue;
    }

    if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
      html.push(line);
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1]?.length ?? 1;
      html.push(`<h${level}>${renderMarkdownInline(headingMatch[2] ?? "")}</h${level}>`);
      index += 1;
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isMarkdownTableSeparator(lines[index + 1] ?? "")) {
      const headerCells = parseMarkdownTableRow(line);
      index += 2;
      const bodyRows: string[] = [];
      while (index < lines.length) {
        const rowLine = lines[index] ?? "";
        if (!rowLine.trim() || !rowLine.includes("|")) {
          break;
        }
        const cells = parseMarkdownTableRow(rowLine);
        bodyRows.push(
          `<tr>${cells.map((cell) => `<td>${renderMarkdownInline(cell)}</td>`).join("")}</tr>`,
        );
        index += 1;
      }
      html.push(
        `<table><thead><tr>${headerCells
          .map((cell) => `<th>${renderMarkdownInline(cell)}</th>`)
          .join("")}</tr></thead><tbody>${bodyRows.join("")}</tbody></table>`,
      );
      continue;
    }

    const listMatch = line.match(/^(\s*)-\s+(.*)$/);
    if (listMatch) {
      const list = renderMarkdownList(lines, index, listMatch[1]?.length ?? 0);
      html.push(list.html);
      index = list.nextIndex;
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index] ?? "";
      const nextTrimmed = nextLine.trim();
      if (
        !nextTrimmed ||
        /^```/.test(nextTrimmed) ||
        /^#{1,6}\s+/.test(nextLine) ||
        /^(\s*)-\s+/.test(nextLine) ||
        nextTrimmed.startsWith("<") ||
        (nextLine.includes("|") &&
          index + 1 < lines.length &&
          isMarkdownTableSeparator(lines[index + 1] ?? ""))
      ) {
        break;
      }
      paragraphLines.push(nextTrimmed);
      index += 1;
    }
    html.push(`<p>${renderMarkdownInline(paragraphLines.join(" "))}</p>`);
  }

  return html.join("\n");
}

function contentTypeForAssetPath(assetPath: string): string {
  const extension = path.extname(assetPath).toLowerCase();
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".gif") {
    return "image/gif";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  if (extension === ".svg") {
    return "image/svg+xml";
  }
  return "application/octet-stream";
}

function registerVideoChatHttpRoutes(
  api: OpenClawPluginApi,
  sessionHandlers: VideoChatSessionHandlers,
): void {
  let cachedWebRootPath: string | null | undefined;
  let cachedStylesRootPath: string | null | undefined;
  let cachedPackageVersion: string | undefined;
  let cachedReadmePath: string | null | undefined;
  let cachedAssetsRootPath: string | null | undefined;

  const resolveWebRootPath = async (): Promise<string> => {
    if (cachedWebRootPath !== undefined) {
      if (!cachedWebRootPath) {
        throw new Error("unable to locate plugin web assets");
      }
      return cachedWebRootPath;
    }
    const configuredCandidates = [
      api.resolvePath("web"),
      api.resolvePath("./web"),
      api.resolvePath("../web"),
    ];
    const webRootPath = await resolveExistingDirectory([
      ...configuredCandidates,
      ...moduleWebRootCandidates(),
    ]);
    cachedWebRootPath = webRootPath;
    if (!webRootPath) {
      throw new Error("unable to locate plugin web assets");
    }
    return webRootPath;
  };

  const readWebAsset = async (relativePath: string): Promise<string> => {
    const normalized = path.posix.normalize(`/${relativePath}`).replace(/^\/+/, "");
    if (
      !normalized ||
      normalized.startsWith("..") ||
      (!normalized.endsWith(".html") && !normalized.endsWith(".js"))
    ) {
      throw new Error("invalid web asset path");
    }
    const webRootPath = await resolveWebRootPath();
    const resolvedPath = path.resolve(webRootPath, normalized);
    const relative = path.relative(webRootPath, resolvedPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("invalid web asset path");
    }
    return readFile(resolvedPath, "utf8");
  };

  const resolvePackageVersion = async (): Promise<string> => {
    if (cachedPackageVersion !== undefined) {
      return cachedPackageVersion;
    }
    const packageJsonPath = await resolveExistingFile([
      api.resolvePath("package.json"),
      api.resolvePath("./package.json"),
      api.resolvePath("../package.json"),
      ...modulePackageJsonCandidates(),
    ]);
    if (!packageJsonPath) {
      cachedPackageVersion = "unknown";
      return cachedPackageVersion;
    }
    try {
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: unknown };
      cachedPackageVersion =
        typeof packageJson.version === "string" && packageJson.version.trim()
          ? packageJson.version.trim()
          : "unknown";
      return cachedPackageVersion;
    } catch {
      cachedPackageVersion = "unknown";
      return cachedPackageVersion;
    }
  };

  const readRenderedHtmlAsset = async (relativePath: string): Promise<string> => {
    const [html, packageVersion] = await Promise.all([
      readWebAsset(relativePath),
      resolvePackageVersion(),
    ]);
    return html.replaceAll(PACKAGE_VERSION_PLACEHOLDER, packageVersion);
  };

  const resolveReadmePath = async (): Promise<string> => {
    if (cachedReadmePath !== undefined) {
      if (!cachedReadmePath) {
        throw new Error("unable to locate plugin README");
      }
      return cachedReadmePath;
    }
    const readmePath = await resolveExistingFile([
      api.resolvePath("README.md"),
      api.resolvePath("./README.md"),
      api.resolvePath("../README.md"),
      ...moduleReadmeCandidates(),
    ]);
    cachedReadmePath = readmePath;
    if (!readmePath) {
      throw new Error("unable to locate plugin README");
    }
    return readmePath;
  };

  const readRenderedReadmePage = async (): Promise<string> => {
    const [template, packageVersion, readmePath] = await Promise.all([
      readWebAsset("readme.html"),
      resolvePackageVersion(),
      resolveReadmePath(),
    ]);
    const markdown = await readFile(readmePath, "utf8");
    const readmeHtml = renderMarkdownToHtml(markdown);
    return template
      .replaceAll(PACKAGE_VERSION_PLACEHOLDER, packageVersion)
      .replace("__README_HTML__", readmeHtml);
  };

  const resolveAssetsRootPath = async (): Promise<string> => {
    if (cachedAssetsRootPath !== undefined) {
      if (!cachedAssetsRootPath) {
        throw new Error("unable to locate plugin assets");
      }
      return cachedAssetsRootPath;
    }
    const assetsRootPath = await resolveExistingDirectory([
      api.resolvePath("assets"),
      api.resolvePath("./assets"),
      api.resolvePath("../assets"),
      ...moduleAssetsRootCandidates(),
    ]);
    cachedAssetsRootPath = assetsRootPath;
    if (!assetsRootPath) {
      throw new Error("unable to locate plugin assets");
    }
    return assetsRootPath;
  };

  const readAssetBuffer = async (relativePath: string): Promise<{ contentType: string; body: Buffer }> => {
    const normalized = path.posix.normalize(`/${relativePath}`).replace(/^\/+/, "");
    if (!normalized || normalized.startsWith("..")) {
      throw new Error("invalid asset path");
    }
    const assetsRootPath = await resolveAssetsRootPath();
    const resolvedPath = path.resolve(assetsRootPath, normalized);
    const relative = path.relative(assetsRootPath, resolvedPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("invalid asset path");
    }
    const body = await readFile(resolvedPath);
    return {
      contentType: contentTypeForAssetPath(resolvedPath),
      body,
    };
  };

  const resolveStylesRootPath = async (): Promise<string> => {
    if (cachedStylesRootPath !== undefined) {
      if (!cachedStylesRootPath) {
        throw new Error("unable to locate plugin style assets");
      }
      return cachedStylesRootPath;
    }
    const configuredCandidates = [
      api.resolvePath("styles"),
      api.resolvePath("./styles"),
      api.resolvePath("../styles"),
    ];
    const stylesRootPath = await resolveExistingDirectory([
      ...configuredCandidates,
      ...moduleStylesRootCandidates(),
    ]);
    cachedStylesRootPath = stylesRootPath;
    if (!stylesRootPath) {
      throw new Error("unable to locate plugin style assets");
    }
    return stylesRootPath;
  };

  const readStyleAsset = async (relativePath: string): Promise<string> => {
    const normalized = path.posix.normalize(`/${relativePath}`).replace(/^\/+/, "");
    if (!normalized || normalized.startsWith("..") || !normalized.endsWith(".css")) {
      throw new Error("invalid style asset path");
    }
    const stylesRootPath = await resolveStylesRootPath();
    const resolvedPath = path.resolve(stylesRootPath, normalized);
    const relative = path.relative(stylesRootPath, resolvedPath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("invalid style asset path");
    }
    return readFile(resolvedPath, "utf8");
  };

  const buildBrowserBootstrapPayload = (config: OpenClawConfig) => {
    const gateway = resolveGatewayRuntimeFromConfig(config);
    if (!gateway) {
      return {
        success: true,
        gateway: {
          auth: { mode: "none" as const },
        },
      };
    }
    if (gateway.auth.mode === "token") {
      return {
        success: true,
        gateway: {
          auth: {
            mode: "token" as const,
            token: gateway.auth.token ?? "",
          },
        },
      };
    }
    return {
      success: true,
      gateway: {
        auth: { mode: gateway.auth.mode },
      },
    };
  };

  api.registerHttpRoute({
    path: "/plugins/video-chat/api",
    auth: "gateway",
    match: "prefix",
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const pathname = parseRequestPathname(req.url);
      if (!pathname) {
        return false;
      }
      const normalizedPath = pathname.replace(/\/+$/, "") || "/plugins/video-chat/api";
      if (!normalizedPath.startsWith("/plugins/video-chat/api")) {
        return false;
      }

      const method = (req.method ?? "GET").toUpperCase();

      try {
        if (normalizedPath === "/plugins/video-chat/api/setup") {
          if (method === "GET") {
            const cfg = api.runtime.config.loadConfig();
            sendHttpResponse(
              res,
              asJsonResponse({
                success: true,
                setup: buildVideoChatConfigResponse(cfg),
              }),
            );
            return true;
          }
          if (method === "POST") {
            const params = await readRequestJson(req);
            const setupInput = parseVideoChatSetupInput(params, "videoChat.setup.save");
            const currentConfig = api.runtime.config.loadConfig();
            const nextConfig = applyVideoChatSetupToConfig(currentConfig, setupInput);
            await writeConfigFile(api, nextConfig);
            sendHttpResponse(
              res,
              asJsonResponse({
                success: true,
                setup: buildVideoChatConfigResponse(nextConfig),
              }),
            );
            return true;
          }
          sendHttpResponse(
            res,
            asJsonResponse(
              {
                success: false,
                error: { code: "INVALID_REQUEST", message: "method not allowed" },
              },
              405,
            ),
          );
          return true;
        }

        if (normalizedPath === "/plugins/video-chat/api/session") {
          if (method === "POST") {
            const params = await readRequestJson(req);
            if (params.sessionKey !== undefined && typeof params.sessionKey !== "string") {
              throw new Error("invalid videoChat.session.create params");
            }
            if (
              params.interruptReplyOnNewMessage !== undefined &&
              typeof params.interruptReplyOnNewMessage !== "boolean"
            ) {
              throw new Error("invalid videoChat.session.create params");
            }
            const cfg = api.runtime.config.loadConfig();
            const sessionKey =
              (typeof params.sessionKey === "string" && params.sessionKey.trim()) ||
              cfg.session?.mainKey ||
              "main";
            const session = await sessionHandlers.createSession({
              config: cfg,
              sessionKey,
              interruptReplyOnNewMessage: params.interruptReplyOnNewMessage === true,
            });
            sendHttpResponse(
              res,
              asJsonResponse({
                success: true,
                session,
              }),
            );
            return true;
          }
          sendHttpResponse(
            res,
            asJsonResponse(
              {
                success: false,
                error: { code: "INVALID_REQUEST", message: "method not allowed" },
              },
              405,
            ),
          );
          return true;
        }

        if (normalizedPath === "/plugins/video-chat/api/session/stop" && method === "POST") {
          const params = await readRequestJson(req);
          if (typeof params.roomName !== "string") {
            throw new Error("invalid videoChat.session.stop params");
          }
          const result = await sessionHandlers.stopSession({
            roomName: params.roomName,
          });
          sendHttpResponse(
            res,
            asJsonResponse({
              success: true,
              ...result,
            }),
          );
          return true;
        }

        if (normalizedPath === "/plugins/video-chat/api/transcribe" && method === "POST") {
          const params = await readRequestJson(req);
          if (typeof params.data !== "string") {
            throw new Error("invalid videoChat.audio.transcribe params");
          }
          if (params.mimeType !== undefined && typeof params.mimeType !== "string") {
            throw new Error("invalid videoChat.audio.transcribe params");
          }
          const cfg = api.runtime.config.loadConfig();
          const result = await transcribeVideoChatAudio({
            runtime: api.runtime,
            logger: api.logger,
            cfg,
            base64Data: params.data,
            mimeType: params.mimeType,
          });
          sendHttpResponse(
            res,
            asJsonResponse({
              success: true,
              ...result,
            }),
          );
          return true;
        }

        if (normalizedPath === "/plugins/video-chat/api/tts" && method === "POST") {
          const params = await readRequestJson(req);
          if (typeof params.text !== "string") {
            throw new Error("invalid videoChat.tts.generate params");
          }
          const cfg = api.runtime.config.loadConfig();
          const result = await generateVideoChatSpeech({
            runtime: api.runtime,
            cfg,
            text: params.text,
          });
          sendHttpResponse(
            res,
            asJsonResponse({
              success: true,
              ...result,
            }),
          );
          return true;
        }

        sendHttpResponse(res, asTextResponse("Not Found", "text/plain; charset=utf-8", 404));
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Claw Cast plugin page request failed";
        const code =
          message.includes("invalid ") || message.endsWith(" is required")
            ? "INVALID_REQUEST"
            : "UNAVAILABLE";
        sendHttpResponse(
          res,
          asJsonResponse(
            {
              success: false,
              error: { code, message },
            },
            code === "INVALID_REQUEST" ? 400 : 503,
          ),
        );
        return true;
      }
    },
  });

  const uiHandler = async (req: IncomingMessage, res: ServerResponse) => {
    const pathname = parseRequestPathname(req.url);
    if (!pathname) {
      return false;
    }
    const normalizedPath = pathname.replace(/\/+$/, "") || "/plugins/video-chat";
    try {
      if (normalizedPath.startsWith("/plugins/video-chat/assets/")) {
        const assetPath = decodeURIComponent(
          normalizedPath.slice("/plugins/video-chat/assets/".length),
        );
        const asset = await readAssetBuffer(assetPath);
        sendHttpResponse(
          res,
          {
            status: 200,
            headers: { "content-type": asset.contentType },
            body: asset.body,
          },
        );
        return true;
      }
      if (normalizedPath.startsWith("/plugins/video-chat/styles/")) {
        const assetPath = decodeURIComponent(
          normalizedPath.slice("/plugins/video-chat/styles/".length),
        );
        const css = await readStyleAsset(assetPath);
        sendHttpResponse(res, asTextResponse(css, "text/css; charset=utf-8"));
        return true;
      }
      if (normalizedPath === "/plugins/video-chat") {
        const html = await readRenderedHtmlAsset("index.html");
        sendHttpResponse(res, withBrowserShellHeaders(asTextResponse(html, "text/html; charset=utf-8")));
        return true;
      }
      if (normalizedPath === "/plugins/video-chat/readme") {
        const html = await readRenderedReadmePage();
        sendHttpResponse(res, withBrowserShellHeaders(asTextResponse(html, "text/html; charset=utf-8")));
        return true;
      }
      if (
        normalizedPath === "/plugins/video-chat/settings" ||
        normalizedPath === "/plugins/video-chat/config"
      ) {
        const html = await readRenderedHtmlAsset("settings.html");
        sendHttpResponse(res, withBrowserShellHeaders(asTextResponse(html, "text/html; charset=utf-8")));
        return true;
      }
      if (normalizedPath === "/plugins/video-chat/app.js") {
        const script = await readWebAsset("app.js");
        sendHttpResponse(res, asTextResponse(script, "application/javascript; charset=utf-8"));
        return true;
      }
      sendHttpResponse(res, asTextResponse("Not Found", "text/plain; charset=utf-8", 404));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Claw Cast plugin page request failed";
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        sendHttpResponse(res, asTextResponse("Not Found", "text/plain; charset=utf-8", 404));
        return true;
      }
      sendHttpResponse(
        res,
        asJsonResponse(
          {
            success: false,
            error: { code: "UNAVAILABLE", message },
          },
          503,
        ),
      );
      return true;
    }
  };

  api.registerHttpRoute({
    path: "/plugins/video-chat",
    auth: "plugin",
    match: "exact",
    handler: uiHandler,
  });

  api.registerHttpRoute({
    path: "/plugins/video-chat/config",
    auth: "plugin",
    match: "exact",
    handler: uiHandler,
  });

  api.registerHttpRoute({
    path: "/plugins/video-chat/readme",
    auth: "plugin",
    match: "exact",
    handler: uiHandler,
  });

  api.registerHttpRoute({
    path: "/plugins/video-chat/settings",
    auth: "plugin",
    match: "exact",
    handler: uiHandler,
  });

  api.registerHttpRoute({
    path: "/plugins/video-chat/bootstrap",
    auth: "plugin",
    match: "exact",
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const pathname = parseRequestPathname(req.url);
      if (!pathname) {
        return false;
      }
      const normalizedPath = pathname.replace(/\/+$/, "") || "/plugins/video-chat/bootstrap";
      if (normalizedPath !== "/plugins/video-chat/bootstrap") {
        return false;
      }
      try {
        const config = api.runtime.config.loadConfig();
        sendHttpResponse(res, asJsonResponse(buildBrowserBootstrapPayload(config)));
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "failed to load Claw Cast browser bootstrap";
        sendHttpResponse(
          res,
          asJsonResponse(
            {
              success: false,
              error: { code: "UNAVAILABLE", message },
            },
            503,
          ),
        );
        return true;
      }
    },
  });

  api.registerHttpRoute({
    path: "/plugins/video-chat/app.js",
    auth: "plugin",
    match: "exact",
    handler: uiHandler,
  });

  api.registerHttpRoute({
    path: "/plugins/video-chat/assets",
    auth: "plugin",
    match: "prefix",
    handler: uiHandler,
  });

  api.registerHttpRoute({
    path: "/plugins/video-chat/styles",
    auth: "plugin",
    match: "prefix",
    handler: uiHandler,
  });
}

type SidecarLaunchCommand = {
  executable: string;
  args: string[];
  description: string;
  fallback?: SidecarLaunchCommand;
};

function resolveSidecarBridgeScriptPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(moduleDir, "video-chat-agent-bridge.mjs");
}

function resolveSidecarRunnerWrapperPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(moduleDir, "video-chat-agent-runner-wrapper.mjs");
}

function buildSidecarInstanceArg(gateway: SidecarGatewayRuntime): string {
  return `${VIDEO_CHAT_SIDECAR_INSTANCE_ARG_PREFIX}gateway-port-${gateway.port}`;
}

function buildStartupSidecarCleanupPatterns(params: {
  bridgeScriptPath: string;
  wrapperScriptPath: string;
  instanceArg: string;
}): string[][] {
  return [
    ["job_proc_lazy_main.cjs", params.wrapperScriptPath, params.instanceArg],
    [params.bridgeScriptPath, params.instanceArg],
  ];
}

function buildSessionResetCleanupPatterns(params: {
  wrapperScriptPath: string;
  instanceArg: string;
}): string[][] {
  return [["job_proc_lazy_main.cjs", params.wrapperScriptPath, params.instanceArg]];
}

function resolveCustomSidecarRunnerPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(moduleDir, "video-chat-agent-runner.js");
}

function collectRunnerCandidates(params: { entryScript?: string }): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const pushCandidate = (candidate: string) => {
    const normalized = candidate.trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    candidates.push(normalized);
  };

  const addAncestorCandidates = (startPath: string, depth: number) => {
    let current = path.resolve(startPath);
    for (let index = 0; index < depth; index += 1) {
      pushCandidate(path.join(current, "video-chat-agent-runner.js"));
      pushCandidate(path.join(current, "dist", "video-chat-agent-runner.js"));
      pushCandidate(path.join(current, "openclaw", "dist", "video-chat-agent-runner.js"));
      pushCandidate(path.join(current, "node_modules", "openclaw", "dist", "video-chat-agent-runner.js"));
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  };

  const envRunnerPath = normalizeOptionalString(process.env.OPENCLAW_VIDEO_CHAT_AGENT_RUNNER);
  if (envRunnerPath) {
    pushCandidate(path.resolve(envRunnerPath));
  }

  if (params.entryScript) {
    addAncestorCandidates(path.dirname(path.resolve(params.entryScript)), 6);
  }
  addAncestorCandidates(path.dirname(fileURLToPath(import.meta.url)), 6);
  addAncestorCandidates(process.cwd(), 4);
  return candidates;
}

async function resolveSidecarLaunchCommand(
  entryScript: string | undefined,
): Promise<SidecarLaunchCommand | null> {
  const customRunnerPath = await resolveExistingFile([resolveCustomSidecarRunnerPath()]);
  const bridgeScriptPath = resolveSidecarBridgeScriptPath();
  // Always prefer the bundled bridge so the plugin uses its own dependency tree instead of the
  // host OpenClaw install's agent runtime.
  const baseRunnerCandidates = collectRunnerCandidates({ entryScript }).filter((candidate) => {
    if (!customRunnerPath) {
      return true;
    }
    return path.resolve(candidate) !== path.resolve(customRunnerPath);
  });
  const baseRunnerPath = await resolveExistingFile(baseRunnerCandidates);
  if (customRunnerPath) {
    const args = [bridgeScriptPath, customRunnerPath];
    if (baseRunnerPath) {
      args.push(baseRunnerPath);
    }
    return {
      executable: process.execPath,
      args,
      description: `node ${args.join(" ")}`,
    };
  }
  if (baseRunnerPath) {
    return {
      executable: process.execPath,
      args: [bridgeScriptPath, baseRunnerPath],
      description: `node ${bridgeScriptPath} ${baseRunnerPath}`,
    };
  }
  if (entryScript) {
    return {
      executable: process.execPath,
      args: [entryScript, "gateway", "video-chat-agent"],
      description: `node ${entryScript} gateway video-chat-agent`,
    };
  }
  return null;
}

async function createVideoChatSession(params: {
  config: OpenClawConfig;
  sessionKey: string;
  interruptReplyOnNewMessage?: boolean;
  nowMs?: number;
}): Promise<VideoChatSessionResult> {
  const effectiveConfig = resolveEffectiveVideoChatConfig(params.config);
  const status = buildVideoChatConfigResponse(params.config);
  if (!status.configured) {
    throw new Error(`Claw Cast is not configured: missing ${status.missing.join(", ")}`);
  }

  const lemonSlice = effectiveConfig.videoChat?.lemonSlice;
  const livekit = effectiveConfig.videoChat?.livekit;
  const elevenLabsApiKey = normalizeResolvedSecretInputString({
    value: effectiveConfig.messages?.tts?.elevenlabs?.apiKey,
    path: "messages.tts.elevenlabs.apiKey",
  });
  const lemonSliceImageUrl = normalizeOptionalString(lemonSlice?.imageUrl);
  const livekitUrl = normalizeOptionalString(livekit?.url);
  const apiKey = normalizeResolvedSecretInputString({
    value: livekit?.apiKey,
    path: "videoChat.livekit.apiKey",
  });
  const apiSecret = normalizeResolvedSecretInputString({
    value: livekit?.apiSecret,
    path: "videoChat.livekit.apiSecret",
  });
  if (!lemonSliceImageUrl || !livekitUrl || !apiKey || !apiSecret || !elevenLabsApiKey) {
    throw new Error(
      "Claw Cast is not configured: missing LemonSlice, LiveKit, or ElevenLabs credentials",
    );
  }
  const imageUrlValidationError = validateLemonSliceImageUrl(lemonSliceImageUrl);
  if (imageUrlValidationError) {
    throw new Error(`Claw Cast is not configured: ${imageUrlValidationError}`);
  }

  const roomName = `${VIDEO_CHAT_ROOM_PREFIX}-${sanitizeVideoChatRoomPart(params.sessionKey)}-${randomUUID().slice(0, 8)}`;
  const chatSessionKey = resolveVideoChatChatSessionKey({
    requestedSessionKey: params.sessionKey,
    config: effectiveConfig,
  });
  const interruptReplyOnNewMessage = params.interruptReplyOnNewMessage === true;
  const participantIdentity = `control-ui-${randomUUID().slice(0, 12)}`;
  const participantToken = createLiveKitAccessToken({
    apiKey,
    apiSecret,
    roomName,
    identity: participantIdentity,
    metadata: {
      source: "openclaw-control-ui",
      sessionKey: params.sessionKey,
    },
    roomConfig: {
      agents: [
        {
          agentName: VIDEO_CHAT_AGENT_NAME,
          metadata: buildVideoChatDispatchMetadata({
            sessionKey: chatSessionKey,
            imageUrl: lemonSliceImageUrl,
            interruptReplyOnNewMessage,
          }),
        },
      ],
    },
    nowMs: params.nowMs,
  });

  return {
    provider: "lemonslice",
    sessionKey: params.sessionKey,
    chatSessionKey,
    roomName,
    livekitUrl,
    participantIdentity,
    participantToken,
    agentName: VIDEO_CHAT_AGENT_NAME,
    interruptReplyOnNewMessage,
  };
}

async function stopVideoChatSession(params: {
  roomName: string;
}): Promise<VideoChatSessionStopResult> {
  const roomName = validateVideoChatRoomName(params.roomName);
  return {
    stopped: true,
    roomName,
  };
}

function resolveVideoChatAgentCredentials(config: OpenClawConfig): SidecarCredentials | null {
  const effective = resolveEffectiveVideoChatConfig(config);
  if (effective.videoChat?.provider !== "lemonslice") {
    return null;
  }

  const lemonSliceApiKey = normalizeResolvedSecretInputString({
    value: effective.videoChat?.lemonSlice?.apiKey,
    path: "videoChat.lemonSlice.apiKey",
  });
  const livekitUrl = normalizeOptionalString(effective.videoChat?.livekit?.url);
  const livekitApiKey = normalizeResolvedSecretInputString({
    value: effective.videoChat?.livekit?.apiKey,
    path: "videoChat.livekit.apiKey",
  });
  const livekitApiSecret = normalizeResolvedSecretInputString({
    value: effective.videoChat?.livekit?.apiSecret,
    path: "videoChat.livekit.apiSecret",
  });
  const elevenLabsApiKey = normalizeResolvedSecretInputString({
    value: effective.messages?.tts?.elevenlabs?.apiKey,
    path: "messages.tts.elevenlabs.apiKey",
  });
  if (
    !lemonSliceApiKey ||
    !livekitUrl ||
    !livekitApiKey ||
    !livekitApiSecret ||
    !elevenLabsApiKey
  ) {
    return null;
  }

  return {
    lemonSliceApiKey,
    elevenLabsApiKey,
    livekitUrl,
    livekitApiKey,
    livekitApiSecret,
    elevenLabsVoiceId: normalizeOptionalString(effective.messages?.tts?.elevenlabs?.voiceId),
    elevenLabsModelId: normalizeOptionalString(effective.messages?.tts?.elevenlabs?.modelId),
  };
}

function attachLineLogger(
  stream: NodeJS.ReadableStream | null | undefined,
  logger: (message: string) => void,
) {
  if (!stream) {
    return;
  }
  let buffered = "";
  stream.on("data", (chunk: Buffer | string) => {
    buffered += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    while (true) {
      const newlineIndex = buffered.indexOf("\n");
      if (newlineIndex < 0) {
        break;
      }
      const line = buffered.slice(0, newlineIndex).trim();
      buffered = buffered.slice(newlineIndex + 1);
      if (line) {
        logger(line);
      }
    }
  });
  stream.on("end", () => {
    const tail = buffered.trim();
    if (tail) {
      logger(tail);
    }
  });
}

function buildWorkerEnv(params: {
  gateway: SidecarGatewayRuntime;
  credentials: SidecarCredentials;
}): NodeJS.ProcessEnv {
  const instanceArg = buildSidecarInstanceArg(params.gateway);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LIVEKIT_URL: params.credentials.livekitUrl,
    LIVEKIT_API_KEY: params.credentials.livekitApiKey,
    LIVEKIT_API_SECRET: params.credentials.livekitApiSecret,
    OPENCLAW_VIDEO_CHAT_GATEWAY_URL: `ws://127.0.0.1:${params.gateway.port}`,
    OPENCLAW_VIDEO_CHAT_LEMONSLICE_API_KEY: params.credentials.lemonSliceApiKey,
    OPENCLAW_VIDEO_CHAT_ELEVENLABS_API_KEY: params.credentials.elevenLabsApiKey,
    OPENCLAW_VIDEO_CHAT_INSTANCE_ARG: instanceArg,
  };

  if (params.gateway.auth.mode === "token" && params.gateway.auth.token) {
    env.OPENCLAW_VIDEO_CHAT_GATEWAY_TOKEN = params.gateway.auth.token;
  }
  if (params.gateway.auth.mode === "password" && params.gateway.auth.password) {
    env.OPENCLAW_VIDEO_CHAT_GATEWAY_PASSWORD = params.gateway.auth.password;
  }
  if (params.credentials.elevenLabsVoiceId) {
    env.OPENCLAW_VIDEO_CHAT_ELEVENLABS_VOICE_ID = params.credentials.elevenLabsVoiceId;
  }
  if (params.credentials.elevenLabsModelId) {
    env.OPENCLAW_VIDEO_CHAT_ELEVENLABS_MODEL_ID = params.credentials.elevenLabsModelId;
  }
  return env;
}

async function startVideoChatAgentSidecar(params: {
  config: OpenClawConfig;
  gateway: SidecarGatewayRuntime;
  log: SidecarLogger;
}): Promise<VideoChatAgentSidecar | null> {
  if (params.gateway.auth.mode === "trusted-proxy" || params.gateway.auth.mode === "none") {
    params.log.warn(
      `Claw Cast agent sidecar disabled: gateway auth mode=${params.gateway.auth.mode} is not supported for the local worker bridge`,
    );
    return null;
  }

  const credentials = resolveVideoChatAgentCredentials(params.config);
  if (!credentials) {
    params.log.info(
      "Claw Cast agent sidecar disabled: missing LiveKit, LemonSlice, or ElevenLabs credentials",
    );
    return null;
  }

  const entryScript = process.argv[1];
  const bridgeScriptPath = resolveSidecarBridgeScriptPath();
  const wrapperScriptPath = resolveSidecarRunnerWrapperPath();
  const instanceArg = buildSidecarInstanceArg(params.gateway);
  const resolvedLaunchCommand = await resolveSidecarLaunchCommand(entryScript);
  const launchCommand =
    resolvedLaunchCommand &&
    path.resolve(resolvedLaunchCommand.args[0] ?? "") === path.resolve(bridgeScriptPath)
      ? {
          ...resolvedLaunchCommand,
          args: [...resolvedLaunchCommand.args, instanceArg],
          description: `${resolvedLaunchCommand.description} ${instanceArg}`,
        }
      : resolvedLaunchCommand;
  if (!launchCommand) {
    params.log.warn(
      "Claw Cast agent sidecar disabled: unable to resolve worker entrypoint (set OPENCLAW_VIDEO_CHAT_AGENT_RUNNER to override)",
    );
    return null;
  }
  params.log.info(`Claw Cast agent sidecar launch command: ${launchCommand.description}`);

  try {
    const stalePids = await stopMatchingProcesses({
      commandPatterns: buildStartupSidecarCleanupPatterns({
        bridgeScriptPath,
        wrapperScriptPath,
        instanceArg,
      }),
      termTimeoutMs: 400,
      postKillDelayMs: 200,
    });
    if (stalePids.length > 0) {
      params.log.warn(
        `[video-chat-agent] cleaned up stale sidecar processes before launch: ${stalePids.join(", ")}`,
      );
    }
  } catch (error) {
    params.log.warn(
      `[video-chat-agent] failed to clean up stale sidecar processes before launch: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  let child: ChildProcess | null = null;
  let childProcessGroupId: number | null = null;
  let respawnTimer: ReturnType<typeof setTimeout> | null = null;
  let stopping = false;
  const recentExits: number[] = [];
  let unsupportedLegacyCommand = false;
  let activeLaunchCommand = launchCommand;

  const spawnChild = () => {
    unsupportedLegacyCommand = false;
    const next = spawn(activeLaunchCommand.executable, activeLaunchCommand.args, {
      env: buildWorkerEnv({
        gateway: params.gateway,
        credentials,
      }),
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    child = next;
    childProcessGroupId =
      typeof next.pid === "number" && Number.isInteger(next.pid) && next.pid > 0 ? next.pid : null;
    attachLineLogger(next.stdout, (message) => params.log.info(`[video-chat-agent] ${message}`));
    attachLineLogger(next.stderr, (message) => {
      if (
        activeLaunchCommand.args[1] === "gateway" &&
        message.includes("too many arguments for 'gateway'")
      ) {
        unsupportedLegacyCommand = true;
      }
      params.log.warn(`[video-chat-agent] ${message}`);
    });
    next.once("exit", (code, signal) => {
      child = null;
      if (stopping) {
        return;
      }
      if (unsupportedLegacyCommand) {
        const fallbackCommand = activeLaunchCommand.fallback;
        if (!fallbackCommand) {
          params.log.error(
            "Claw Cast agent sidecar launch command is unsupported by this OpenClaw CLI build; set OPENCLAW_VIDEO_CHAT_AGENT_RUNNER to a video-chat-agent-runner.js path",
          );
          return;
        }
        params.log.warn(
          `Claw Cast agent sidecar launch command is unsupported by this OpenClaw CLI build; falling back to ${fallbackCommand.description}`,
        );
        activeLaunchCommand = fallbackCommand;
        spawnChild();
        return;
      }
      const now = Date.now();
      recentExits.push(now);
      while (recentExits.length > 0 && now - recentExits[0] > 30_000) {
        recentExits.shift();
      }
      if (recentExits.length >= 5) {
        params.log.error(
          `Claw Cast agent sidecar exited repeatedly${code !== null ? ` code=${code}` : ""}${signal ? ` signal=${signal}` : ""}; giving up until the gateway restarts`,
        );
        return;
      }
      params.log.warn(
        `Claw Cast agent sidecar exited${code !== null ? ` code=${code}` : ""}${signal ? ` signal=${signal}` : ""}; restarting`,
      );
      respawnTimer = setTimeout(() => {
        respawnTimer = null;
        spawnChild();
      }, 1_000);
      respawnTimer.unref();
    });
  };

  spawnChild();

  return {
    resetJobs: async () => {
      if (stopping) {
        return;
      }
      const processGroupId = childProcessGroupId;
      if (process.platform === "win32" || !processGroupId || processGroupId <= 0) {
        return;
      }
      await resetProcessGroupChildren({ processGroupId, settleMs: 300 });
      await stopMatchingProcesses({
        commandPatterns: buildSessionResetCleanupPatterns({
          wrapperScriptPath,
          instanceArg,
        }),
        keepPids: [processGroupId],
        termTimeoutMs: 400,
        postKillDelayMs: 200,
      });
    },
    stop: async () => {
      stopping = true;
      if (respawnTimer) {
        clearTimeout(respawnTimer);
        respawnTimer = null;
      }
      await stopChildProcess({
        child,
        processGroupId: childProcessGroupId,
      });
      child = null;
      childProcessGroupId = null;
    },
  };
}

function assertMethodParams(
  params: GatewayRequestHandlerOptions["params"],
  method: string,
  respond: RespondFn,
): params is Record<string, unknown> {
  if (!isObjectRecord(params)) {
    respondGatewayError(respond, "INVALID_REQUEST", `invalid ${method} params`);
    return false;
  }
  return true;
}

const videoChatPlugin = {
  id: VIDEO_CHAT_PLUGIN_ID,
  name: "Claw Cast",
  description: "Claw Cast gateway methods and sidecar worker",
  register(api: OpenClawPluginApi) {
    let sidecar: VideoChatAgentSidecar | null = null;
    let sidecarStartupPromise: Promise<VideoChatAgentSidecar | null> | null = null;

    const ensureSidecarRunning = async (
      config: OpenClawConfig,
      gateway?: OpenClawPluginServiceContext["gateway"],
    ): Promise<void> => {
      if (sidecar) {
        return;
      }
      if (sidecarStartupPromise) {
        sidecar = sidecar ?? (await sidecarStartupPromise);
        return;
      }
      const runtimeGateway = gateway ?? resolveGatewayRuntimeFromConfig(config);
      if (!runtimeGateway) {
        api.logger.warn(
          "Claw Cast agent sidecar disabled: gateway runtime details are unavailable",
        );
        return;
      }
      const startupPromise = startVideoChatAgentSidecar({
        config,
        gateway: runtimeGateway,
        log: api.logger,
      });
      sidecarStartupPromise = startupPromise;
      try {
        sidecar = await startupPromise;
      } finally {
        if (sidecarStartupPromise === startupPromise) {
          sidecarStartupPromise = null;
        }
      }
    };

    const resetSidecarJobs = async (): Promise<void> => {
      if (!sidecar) {
        return;
      }
      await sidecar.resetJobs().catch((error) => {
        api.logger.warn(
          `[video-chat-agent] failed to reset sidecar jobs: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    };

    const createManagedSession = async (params: {
      config: OpenClawConfig;
      sessionKey: string;
      interruptReplyOnNewMessage?: boolean;
    }): Promise<VideoChatSessionResult> => {
      await ensureSidecarRunning(params.config);
      return createVideoChatSession(params);
    };

    const stopManagedSession = async (params: {
      roomName: string;
    }): Promise<VideoChatSessionStopResult> => {
      const result = await stopVideoChatSession({ roomName: params.roomName });
      await resetSidecarJobs();
      return result;
    };

    registerVideoChatSetupCli(api);
    registerVideoChatHttpRoutes(api, {
      createSession: createManagedSession,
      stopSession: stopManagedSession,
    });

    api.registerGatewayMethod(
      "videoChat.config",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          if (!assertMethodParams(params, "videoChat.config", respond)) {
            return;
          }
          const cfg = api.runtime.config.loadConfig();
          respond(true, { config: buildVideoChatConfigResponse(cfg) });
        } catch (error) {
          respondGatewayError(
            respond,
            "UNAVAILABLE",
            error instanceof Error ? error.message : "failed to load Claw Cast config",
          );
        }
      },
    );

    api.registerGatewayMethod(
      "videoChat.setup.get",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          if (!assertMethodParams(params, "videoChat.setup.get", respond)) {
            return;
          }
          const cfg = api.runtime.config.loadConfig();
          respond(true, { setup: buildVideoChatConfigResponse(cfg) });
        } catch (error) {
          respondGatewayError(
            respond,
            "UNAVAILABLE",
            error instanceof Error ? error.message : "failed to load Claw Cast setup",
          );
        }
      },
    );

    api.registerGatewayMethod(
      "videoChat.setup.save",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          if (!assertMethodParams(params, "videoChat.setup.save", respond)) {
            return;
          }
          const setupInput = parseVideoChatSetupInput(params, "videoChat.setup.save");
          const currentConfig = api.runtime.config.loadConfig();
          const nextConfig = applyVideoChatSetupToConfig(currentConfig, setupInput);
          await writeConfigFile(api, nextConfig);
          respond(true, { setup: buildVideoChatConfigResponse(nextConfig) });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "failed to save Claw Cast setup";
          const isInvalid = message.includes("invalid videoChat.setup.save params");
          respondGatewayError(respond, isInvalid ? "INVALID_REQUEST" : "UNAVAILABLE", message);
        }
      },
    );

    api.registerGatewayMethod(
      "videoChat.session.create",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          if (!assertMethodParams(params, "videoChat.session.create", respond)) {
            return;
          }
          if (params.sessionKey !== undefined && typeof params.sessionKey !== "string") {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid videoChat.session.create params",
            );
            return;
          }
          if (
            params.interruptReplyOnNewMessage !== undefined &&
            typeof params.interruptReplyOnNewMessage !== "boolean"
          ) {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid videoChat.session.create params",
            );
            return;
          }
          const cfg = api.runtime.config.loadConfig();
          const sessionKey =
            (typeof params.sessionKey === "string" && params.sessionKey.trim()) ||
            cfg.session?.mainKey ||
            "main";

          const payload = await createManagedSession({
            config: cfg,
            sessionKey,
            interruptReplyOnNewMessage: params.interruptReplyOnNewMessage === true,
          });
          respond(true, payload);
        } catch (error) {
          respondGatewayError(
            respond,
            "INVALID_REQUEST",
            error instanceof Error ? error.message : "Claw Cast session creation failed",
          );
        }
      },
    );

    api.registerGatewayMethod(
      "videoChat.session.stop",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          if (!assertMethodParams(params, "videoChat.session.stop", respond)) {
            return;
          }
          if (typeof params.roomName !== "string") {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid videoChat.session.stop params",
            );
            return;
          }
          const result = await stopManagedSession({
            roomName: params.roomName,
          });
          respond(true, result);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Claw Cast session stop failed";
          respondGatewayError(
            respond,
            message.includes("invalid ") || message.endsWith(" is required")
              ? "INVALID_REQUEST"
              : "UNAVAILABLE",
            message,
          );
        }
      },
    );

    api.registerGatewayMethod(
      "videoChat.audio.transcribe",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          if (!assertMethodParams(params, "videoChat.audio.transcribe", respond)) {
            return;
          }
          if (typeof params.data !== "string") {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid videoChat.audio.transcribe params",
            );
            return;
          }
          if (params.mimeType !== undefined && typeof params.mimeType !== "string") {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid videoChat.audio.transcribe params",
            );
            return;
          }
          if (params.sessionKey !== undefined && typeof params.sessionKey !== "string") {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid videoChat.audio.transcribe params",
            );
            return;
          }
          const cfg = api.runtime.config.loadConfig();
          const result = await transcribeVideoChatAudio({
            runtime: api.runtime,
            logger: api.logger,
            cfg,
            base64Data: params.data,
            mimeType: params.mimeType,
          });
          respond(true, result);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Claw Cast transcription failed";
          const invalidMessages = new Set([
            "audio data is required",
            "invalid base64 audio payload",
            "audio payload is empty",
            "audio payload is too large",
          ]);
          respondGatewayError(
            respond,
            invalidMessages.has(message) ? "INVALID_REQUEST" : "UNAVAILABLE",
            message,
          );
        }
      },
    );

    api.registerGatewayMethod(
      "videoChat.tts.generate",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          if (!assertMethodParams(params, "videoChat.tts.generate", respond)) {
            return;
          }
          if (typeof params.text !== "string") {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid videoChat.tts.generate params",
            );
            return;
          }

          const text = params.text.trim();
          const cfg = api.runtime.config.loadConfig();
          const result = await generateVideoChatSpeech({
            runtime: api.runtime,
            cfg,
            text,
          });
          respond(true, result);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Claw Cast TTS generation failed";
          respondGatewayError(
            respond,
            message === "text is required" ? "INVALID_REQUEST" : "UNAVAILABLE",
            message,
          );
        }
      },
    );

    api.registerService({
      id: "video-chat-agent",
      start: async (ctx) => {
        if (sidecar) {
          return;
        }
        await ensureSidecarRunning(ctx.config, ctx.gateway);
      },
      stop: async () => {
        if (!sidecar && sidecarStartupPromise) {
          sidecar = await sidecarStartupPromise.catch(() => null);
        }
        if (!sidecar) {
          return;
        }
        await sidecar.stop().catch(() => {});
        sidecar = null;
      },
    });
  },
};

export default videoChatPlugin;
