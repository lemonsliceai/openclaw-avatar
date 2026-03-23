import { spawn, type ChildProcess } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { promises as dns } from "node:dns";
import { readFile, stat, unlink, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
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
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import {
  resetProcessGroupChildren,
  stopChildProcess,
  stopMatchingProcesses,
} from "./sidecar-process-control.js";
import {
  AVATAR_ASPECT_RATIO_DEFAULT,
  AVATAR_ASPECT_RATIOS,
} from "./avatar-aspect-ratio.js";

const AVATAR_AUDIO_MAX_BYTES = 25 * 1024 * 1024;
const AVATAR_ATTACHMENT_COUNT_MAX = 4;
const AVATAR_ATTACHMENT_CONTENT_MAX_BYTES = 10 * 1024 * 1024;
const AVATAR_ATTACHMENT_TOTAL_MAX_BYTES =
  AVATAR_ATTACHMENT_COUNT_MAX * AVATAR_ATTACHMENT_CONTENT_MAX_BYTES;
const LIVEKIT_TOKEN_TTL_SECONDS = 60 * 60;
const AVATAR_ROOM_PREFIX = "openclaw";
const AVATAR_ROOM_PART_FALLBACK = "main";
const AVATAR_ROOM_PART_MAX_LENGTH = 48;
const AVATAR_AGENT_NAME = "openclaw-avatar";
const AVATAR_SIDECAR_AGENT_NAME_ENV = "OPENCLAW_AVATAR_AGENT_NAME";
const AVATAR_PLUGIN_ID = "avatar";
const OPENCLAW_MIN_COMPATIBLE_VERSION = "2026.3.22";
const AVATAR_SIDECAR_INSTANCE_ARG_PREFIX = "--openclaw-avatar-instance=";
const AVATAR_SIDECAR_RESET_SETTLE_MS = 1_000;
const AVATAR_SIDECAR_READY_TIMEOUT_MS = 12_000;
const AVATAR_SIDECAR_START_MAX_ATTEMPTS = 3;
const AVATAR_SIDECAR_READY_LOG_FRAGMENT = "worker registered and ready";
const REDACTED_SECRET_VALUES = new Set(["_REDACTED_", "__OPENCLAW_REDACTED__"]);
const PACKAGE_VERSION_PLACEHOLDER = "__PACKAGE_VERSION__";
const SHARED_SHELL_BOOTSTRAP_PLACEHOLDER = "__SHARED_SHELL_BOOTSTRAP__";
const README_HTML_PLACEHOLDER_REGEX = /__README_HTML__/g;
const AVATAR_SETUP_VERIFY_TIMEOUT_MS = 4_000;
const INVALID_CHAT_HISTORY_PARAMS_ERROR = "invalid avatar.chat.history params";
const INVALID_CHAT_SEND_PARAMS_ERROR = "invalid avatar.chat.send params";
const AVATAR_TIMEOUT_DEFAULT_SECONDS = 60;
const AVATAR_TIMEOUT_MIN_SECONDS = 1;
const AVATAR_TIMEOUT_MAX_SECONDS = 600;
const AVATAR_RUNTIME_SPEECH_VERIFY_TEXT = "OpenClaw speech check.";
const AVATAR_NON_VERBOSE_GATEWAY_EVENTS = new Set([
  "sidecar.ready",
  "session.create.succeeded",
  "session.stop.completed",
  "session.progress.job.accepted",
  "session.progress.agent.connected",
  "session.progress.avatar.starting",
  "session.progress.avatar.connected",
  "speech.playback.begin",
  "speech.playback.finished",
  "speech.playback.failed",
]);
const AVATAR_NON_VERBOSE_EVENT_FIELD_ALLOWLIST: Record<string, string[]> = {
  "sidecar.ready": ["attempt", "generation"],
  "session.create.succeeded": [
    "sessionKey",
    "chatSessionKey",
    "roomName",
    "avatarTimeoutSeconds",
    "aspectRatio",
  ],
  "session.stop.completed": ["roomName"],
  "session.progress.job.accepted": ["roomName"],
  "session.progress.agent.connected": ["roomName", "sessionKey"],
  "session.progress.avatar.starting": ["roomName", "sessionKey"],
  "session.progress.avatar.connected": ["roomName", "sessionKey"],
  "speech.playback.begin": ["roomName", "sessionKey"],
  "speech.playback.finished": ["roomName", "sessionKey"],
  "speech.playback.failed": ["roomName", "sessionKey", "error"],
};
const AVATAR_LOGGER_CONTROL = Symbol("avatarLoggerControl");

type AvatarAspectRatio = (typeof AVATAR_ASPECT_RATIOS)[number];

type AvatarConfigResponse = {
  provider: "lemonslice" | null;
  configured: boolean;
  missing: string[];
  verbose: boolean;
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
};

type AvatarSessionResult = {
  provider: "lemonslice";
  sessionKey: string;
  chatSessionKey: string;
  roomName: string;
  livekitUrl: string;
  participantIdentity: string;
  participantToken: string;
  agentName: string;
  avatarImageUrl: string;
  avatarTimeoutSeconds: number;
  aspectRatio: AvatarAspectRatio;
  interruptReplyOnNewMessage: boolean;
};

type AvatarAgentDispatchResult = {
  id: string;
  room: string;
  agentName: string;
};

type AvatarSessionRuntimeStatus = {
  roomName: string;
  createdAt: number;
  updatedAt: number;
  jobId?: string;
  jobAcceptedAt?: number;
  agentSessionConnectedAt?: number;
  agentSessionOutputAudioSink?: string;
  avatarStartBeginAt?: number;
  avatarStartConnectedAt?: number;
  avatarOutputAudioSink?: string;
  avatarParticipantIdentity?: string;
  gatewayChatFinalAt?: number;
  speechBeginAt?: number;
  speechFinishedAt?: number;
  speechFailedAt?: number;
  speechError?: string;
};

type AvatarSessionStopResult = {
  stopped: true;
  roomName: string;
};

type AvatarLogger = Pick<OpenClawPluginApi["logger"], "info" | "warn" | "error"> & {
  debug?: (message: string) => void;
  [AVATAR_LOGGER_CONTROL]?: {
    getVerbose: () => boolean;
  };
};

type SidecarCredentials = {
  lemonSliceApiKey: string;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
};

type AvatarAgentSidecar = {
  agentName: string;
  configFingerprint: string | null;
  isRunning: () => boolean;
  waitForReady: () => Promise<void>;
  stop: () => Promise<void>;
  resetJobs: () => Promise<void>;
  waitForIdle: () => Promise<void>;
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

type AvatarSetupInput = {
  gatewayToken?: string;
  lemonSliceApiKey?: string;
  livekitUrl?: string;
  livekitApiKey?: string;
  livekitApiSecret?: string;
  verbose?: boolean;
};

type HttpResponsePayload = {
  status: number;
  headers?: Record<string, string>;
  body: string | Buffer;
};

type AvatarSessionHandlers = {
  createSession: (params: {
    config: OpenClawConfig;
    sessionKey: string;
    avatarImageUrl?: string;
    avatarTimeoutSeconds?: number;
    aspectRatio?: string;
    interruptReplyOnNewMessage?: boolean;
  }) => Promise<AvatarSessionResult>;
  stopSession: (params: { roomName: string }) => Promise<AvatarSessionStopResult>;
  loadSessionStatus: (params: {
    roomName: string;
  }) => Promise<AvatarSessionRuntimeStatus | null> | AvatarSessionRuntimeStatus | null;
  restartSidecar: (params: { config: OpenClawConfig; reason?: string }) => Promise<{ restarted: boolean }>;
  stopSidecar: (params?: { reason?: string }) => Promise<{ stopped: boolean }>;
};

type AvatarChatAttachmentInput = {
  type: string;
  mimeType: string;
  fileName: string;
  content: string;
};

type AvatarChatHistoryResult = {
  messages?: unknown[];
};

type AvatarChatSendResult = Record<string, unknown>;

type ParsedAvatarHistoryParams = {
  sessionKey: string;
  limit?: number;
};

type ParsedAvatarSendParams = {
  sessionKey: string;
  message: string;
  attachments?: AvatarChatAttachmentInput[];
  idempotencyKey?: string;
};

class AvatarRequestError extends Error {
  code: "INVALID_REQUEST" | "UNAVAILABLE";

  constructor(code: "INVALID_REQUEST" | "UNAVAILABLE", message: string) {
    super(message);
    this.name = "AvatarRequestError";
    this.code = code;
  }
}

function normalizeInterruptReplyOnNewMessage(interruptReplyOnNewMessage?: boolean): boolean {
  return interruptReplyOnNewMessage ?? true;
}

function normalizeAvatarTimeoutSeconds(avatarTimeoutSeconds?: number): number {
  if (!Number.isFinite(avatarTimeoutSeconds)) {
    return AVATAR_TIMEOUT_DEFAULT_SECONDS;
  }
  const normalized = Math.floor(avatarTimeoutSeconds ?? AVATAR_TIMEOUT_DEFAULT_SECONDS);
  return Math.min(
    AVATAR_TIMEOUT_MAX_SECONDS,
    Math.max(AVATAR_TIMEOUT_MIN_SECONDS, normalized),
  );
}

function normalizeAvatarAspectRatio(aspectRatio?: string | null): AvatarAspectRatio {
  const normalized = normalizeOptionalString(aspectRatio);
  if (!normalized) {
    return AVATAR_ASPECT_RATIO_DEFAULT;
  }
  const normalizedAspectRatio = normalized as AvatarAspectRatio;
  if (AVATAR_ASPECT_RATIOS.includes(normalizedAspectRatio)) {
    return normalizedAspectRatio;
  }
  throw new Error(
    `invalid avatar.session.create params: aspectRatio must be one of ${AVATAR_ASPECT_RATIOS.join(", ")}`,
  );
}

type AvatarSubagentRunParams = {
  sessionKey: string;
  message: string;
  extraSystemPrompt?: string;
  lane?: string;
  deliver?: boolean;
  idempotencyKey?: string;
  attachments?: AvatarChatAttachmentInput[];
};

type AvatarSubagentRuntime = {
  run: (params: AvatarSubagentRunParams) => Promise<AvatarChatSendResult>;
  getSessionMessages: (params: {
    sessionKey: string;
    limit?: number;
  }) => Promise<AvatarChatHistoryResult>;
};

type AvatarChatHandlers = {
  loadHistory: (params: {
    sessionKey: string;
    limit?: number;
  }) => Promise<AvatarChatHistoryResult>;
  sendMessage: (params: {
    sessionKey: string;
    message: string;
    attachments?: AvatarChatAttachmentInput[];
    idempotencyKey?: string;
  }) => Promise<AvatarChatSendResult>;
};

type AvatarSpeechRuntime = NonNullable<OpenClawPluginApi["runtime"]["tts"]>;
type AvatarVideoAvatarRuntime = NonNullable<OpenClawPluginApi["runtime"]["videoAvatar"]>;
type AvatarAudioTranscriptionRuntime = {
  transcribeAudioFile: (input: {
    filePath: string;
    cfg: OpenClawConfig;
    mime?: string;
  }) => Promise<{ text?: string }>;
};
type AvatarSpeechSynthesisResult = {
  audioBuffer: Buffer;
  sampleRate: number;
  provider: string | null;
};

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeAvatarVerbose(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeResolvedSecretInputString(params: { value: unknown; path: string }): string {
  const direct = normalizeOptionalString(params.value);
  if (direct) {
    return direct;
  }
  if (params.value && typeof params.value === "object" && !Array.isArray(params.value)) {
    const nested = normalizeOptionalString((params.value as Record<string, unknown>).value);
    if (nested) {
      return nested;
    }
  }
  throw new Error(`missing required config: ${params.path}`);
}

function hasConfiguredSecretInput(value: unknown): boolean {
  if (normalizeOptionalString(value)) {
    return true;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const candidate = value as Record<string, unknown>;
    if (normalizeOptionalString(candidate.value)) {
      return true;
    }
    if (normalizeOptionalString(candidate.env)) {
      return true;
    }
  }
  return false;
}

const AVATAR_TRANSCRIPTION_LANGUAGE_ALIASES: Record<string, string> = {
  arabic: "ar",
  chinese: "zh",
  dutch: "nl",
  english: "en",
  french: "fr",
  german: "de",
  hindi: "hi",
  italian: "it",
  japanese: "ja",
  korean: "ko",
  portuguese: "pt",
  russian: "ru",
  spanish: "es",
};

function normalizeAvatarTranscriptionLanguage(value: unknown): string | undefined {
  const raw = normalizeOptionalString(value);
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.replace(/_/g, "-").trim();
  if (/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(trimmed)) {
    return trimmed;
  }
  return AVATAR_TRANSCRIPTION_LANGUAGE_ALIASES[trimmed.toLowerCase()];
}

function normalizeAvatarTranscriptionConfig(cfg: OpenClawConfig): OpenClawConfig {
  const audioConfig = cfg.tools?.media?.audio;
  if (!audioConfig || typeof audioConfig !== "object") {
    return cfg;
  }

  const nextAudioConfig = { ...audioConfig } as Record<string, unknown>;
  let changed = false;

  const normalizedLanguage = normalizeAvatarTranscriptionLanguage(nextAudioConfig.language);
  if (normalizedLanguage !== nextAudioConfig.language) {
    if (normalizedLanguage) {
      nextAudioConfig.language = normalizedLanguage;
    } else {
      delete nextAudioConfig.language;
    }
    changed = true;
  }

  const rawModels = Array.isArray(nextAudioConfig.models) ? nextAudioConfig.models : null;
  if (rawModels) {
    const nextModels = rawModels.map((entry) => {
      if (!entry || typeof entry !== "object") {
        return entry;
      }
      const nextEntry = { ...(entry as Record<string, unknown>) };
      const normalizedEntryLanguage = normalizeAvatarTranscriptionLanguage(nextEntry.language);
      if (normalizedEntryLanguage === nextEntry.language) {
        return entry;
      }
      if (normalizedEntryLanguage) {
        nextEntry.language = normalizedEntryLanguage;
      } else {
        delete nextEntry.language;
      }
      changed = true;
      return nextEntry;
    });
    if (changed) {
      nextAudioConfig.models = nextModels;
    }
  }

  if (!changed) {
    return cfg;
  }

  return {
    ...cfg,
    tools: {
      ...(cfg.tools ?? {}),
      media: {
        ...(cfg.tools?.media ?? {}),
        audio: nextAudioConfig,
      },
    },
  };
}

function summarizeIdempotencyKeyForLog(value: unknown): {
  idempotencyKeyPresent: boolean;
  idempotencyKeyDigest?: string;
} {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return {
      idempotencyKeyPresent: false,
    };
  }
  return {
    idempotencyKeyPresent: true,
    idempotencyKeyDigest: createHmac("sha256", AVATAR_PLUGIN_ID)
      .update(normalized)
      .digest("hex")
      .slice(0, 12),
  };
}

function cloneConfigSnapshot(config: OpenClawConfig): OpenClawConfig {
  if (typeof structuredClone === "function") {
    return structuredClone(config);
  }
  return JSON.parse(JSON.stringify(config)) as OpenClawConfig;
}

function formatLogValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    const compact = normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
    return JSON.stringify(compact);
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatLogValue(item)).join(",")}]`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatLogFields(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${formatLogValue(value)}`)
    .join(" ");
}

function normalizeAvatarLogPrefix(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return "[avatar]";
  }
  if (/^\[avatar-agent(?=\/|\])/.test(trimmed)) {
    return trimmed.replace(/^\[avatar-agent(?=\/|\])/, "[avatar");
  }
  if (/^\[avatar(?=\/|\])/.test(trimmed)) {
    return trimmed;
  }
  return `[avatar] ${trimmed}`;
}

function shouldEmitAvatarGatewayMessage(logger: AvatarLogger, message: string): boolean {
  const getVerbose = logger[AVATAR_LOGGER_CONTROL]?.getVerbose;
  if (!getVerbose) {
    return true;
  }
  if (getVerbose()) {
    return true;
  }
  if (!message.startsWith("[avatar] ")) {
    return false;
  }
  const event = message.slice("[avatar] ".length).split(/\s+/, 1)[0] ?? "";
  return AVATAR_NON_VERBOSE_GATEWAY_EVENTS.has(event);
}

function isAvatarLoggerVerbose(logger: AvatarLogger): boolean {
  const getVerbose = logger[AVATAR_LOGGER_CONTROL]?.getVerbose;
  if (!getVerbose) {
    return true;
  }
  return getVerbose();
}

function filterAvatarLogFieldsForVerbosity(
  logger: AvatarLogger,
  event: string,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  if (isAvatarLoggerVerbose(logger)) {
    return fields;
  }
  const allowedKeys = AVATAR_NON_VERBOSE_EVENT_FIELD_ALLOWLIST[event];
  if (!allowedKeys) {
    return fields;
  }
  return Object.fromEntries(
    allowedKeys
      .filter((key) => fields[key] !== undefined)
      .map((key) => [key, fields[key]]),
  );
}

function readAvatarVerbose(config: OpenClawConfig): boolean {
  const effective = resolveEffectiveAvatarConfig(config);
  return normalizeAvatarVerbose(effective.avatar?.verbose) === true;
}

function createAvatarGatewayLogger(
  logger: OpenClawPluginApi["logger"],
  getConfig: () => OpenClawConfig,
): AvatarLogger {
  const readVerbose = (): boolean => {
    try {
      return readAvatarVerbose(getConfig());
    } catch {
      return true;
    }
  };
  const shouldEmit = (message: string): boolean =>
    shouldEmitAvatarGatewayMessage(
      {
        info: logger.info,
        warn: logger.warn,
        error: logger.error,
        debug: logger.debug,
        [AVATAR_LOGGER_CONTROL]: {
          getVerbose: readVerbose,
        },
      },
      message,
    );
  return {
    info: (message: string) => {
      if (shouldEmit(message)) {
        logger.info(message);
      }
    },
    warn: (message: string) => {
      if (shouldEmit(message)) {
        logger.warn(message);
      }
    },
    error: (message: string) => {
      if (shouldEmit(message)) {
        logger.error(message);
      }
    },
    debug: (message: string) => {
      if (shouldEmit(message)) {
        logger.debug(message);
      }
    },
    [AVATAR_LOGGER_CONTROL]: {
      getVerbose: readVerbose,
    },
  };
}

function logAvatarEvent(
  logger: AvatarLogger,
  level: "debug" | "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const filteredFields = filterAvatarLogFieldsForVerbosity(logger, event, fields);
  const suffix = formatLogFields(filteredFields);
  const message = `[avatar] ${event}${suffix ? ` ${suffix}` : ""}`;
  if (!shouldEmitAvatarGatewayMessage(logger, message)) {
    return;
  }
  if (level === "debug") {
    if (typeof logger.debug === "function") {
      logger.debug(message);
    }
    return;
  }
  logger[level](message);
}

function parseAvatarDebugFieldValue(rawValue: string): unknown {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (trimmed === "null") {
    return null;
  }
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && /^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return numeric;
  }
  return trimmed;
}

function parseAvatarDebugFields(rawFields: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const matcher = /([A-Za-z][A-Za-z0-9]*)=("(?:\\.|[^"])*"|true|false|null|-?\d+(?:\.\d+)?|[^\s]+)/g;
  for (const match of rawFields.matchAll(matcher)) {
    const [, key, rawValue] = match;
    fields[key] = parseAvatarDebugFieldValue(rawValue);
  }
  return fields;
}

function parseVersionSegments(value: unknown): number[] | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }
  const segments = normalized.match(/\d+/g);
  if (!segments?.length) {
    return null;
  }
  const parsed = segments.map((segment) => Number.parseInt(segment, 10));
  return parsed.every((segment) => Number.isFinite(segment)) ? parsed : null;
}

function normalizeVersionString(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  return normalized && parseVersionSegments(normalized) ? normalized : null;
}

function compareVersionSegments(left: number[], right: number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) {
      return delta > 0 ? 1 : -1;
    }
  }
  return 0;
}

function isOpenClawVersionCompatible(
  version: unknown,
  minimumVersion: string = OPENCLAW_MIN_COMPATIBLE_VERSION,
): boolean | null {
  const normalizedVersion = parseVersionSegments(version);
  const normalizedMinimumVersion = parseVersionSegments(minimumVersion);
  if (!normalizedVersion || !normalizedMinimumVersion) {
    return null;
  }
  return compareVersionSegments(normalizedVersion, normalizedMinimumVersion) >= 0;
}

function normalizeOptionalSetupSecretString(value: unknown): string | undefined {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) {
    return undefined;
  }
  return REDACTED_SECRET_VALUES.has(trimmed) ? undefined : trimmed;
}

function normalizeIpAddress(address: string): string {
  const trimmed = address.trim().toLowerCase();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isPrivateOrLoopbackIpv4(address: string): boolean {
  const octets = address.split(".").map((octet) => Number.parseInt(octet, 10));
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  if (octets[0] === 127) {
    return true;
  }
  if (octets[0] === 10) {
    return true;
  }
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) {
    return true;
  }
  return octets[0] === 192 && octets[1] === 168;
}

function resolveLeadingIpv6Hextet(address: string): number | null {
  const [head] = address.split("::", 1);
  const firstSegment = (head.split(":", 1)[0] ?? "").trim();
  if (firstSegment.length === 0) {
    return 0;
  }
  if (!/^[0-9a-f]{1,4}$/i.test(firstSegment)) {
    return null;
  }
  const parsed = Number.parseInt(firstSegment, 16);
  return Number.isInteger(parsed) ? parsed : null;
}

function isPrivateOrLoopbackIpAddress(address: string): boolean {
  const normalized = normalizeIpAddress(address);
  const family = isIP(normalized);
  if (family === 4) {
    return isPrivateOrLoopbackIpv4(normalized);
  }
  if (family === 6) {
    if (normalized === "::1") {
      return true;
    }
    if (normalized.startsWith("::ffff:")) {
      return isPrivateOrLoopbackIpv4(normalized.slice("::ffff:".length));
    }
    const leadingHextet = resolveLeadingIpv6Hextet(normalized);
    if (leadingHextet !== null) {
      // fc00::/7 (ULA) and fe80::/10 (link-local)
      if ((leadingHextet & 0xfe00) === 0xfc00 || (leadingHextet & 0xffc0) === 0xfe80) {
        return true;
      }
    }
  }
  return false;
}

async function validateAvatarImageUrl(value: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "avatarImageUrl must be a valid URL";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "avatarImageUrl must use http or https";
  }

  const trimmedPath = parsed.pathname.replace(/\/+$/g, "");
  if (!trimmedPath || trimmedPath === "/") {
    return "avatarImageUrl must be a direct image URL, not a directory";
  }

  const lastPathSegment = trimmedPath.split("/").at(-1) ?? "";
  if (!lastPathSegment || lastPathSegment === "f") {
    return "avatarImageUrl must include an image path after the host";
  }

  const normalizedHostname = parsed.hostname.trim().toLowerCase().replace(/\.+$/g, "");
  if (normalizedHostname === "localhost") {
    return "avatarImageUrl must not resolve to localhost or private network";
  }
  if (isPrivateOrLoopbackIpAddress(normalizedHostname)) {
    return "avatarImageUrl must not resolve to localhost or private network";
  }
  if (isIP(normalizedHostname) === 0) {
    try {
      const resolvedAddresses = await dns.lookup(normalizedHostname, { all: true, verbatim: true });
      if (resolvedAddresses.some((record) => isPrivateOrLoopbackIpAddress(record.address))) {
        return "avatarImageUrl must not resolve to localhost or private network";
      }
    } catch {
      // Keep URL validation non-blocking for transient DNS failures.
    }
  }

  return null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asObjectRecord(value: unknown): Record<string, unknown> {
  return isObjectRecord(value) ? value : {};
}

function sanitizeAvatarSecretConfigInput(
  value: unknown,
): string | { value?: string; env?: string } | undefined {
  const directValue = normalizeOptionalString(value);
  if (directValue) {
    return directValue;
  }
  if (!isObjectRecord(value)) {
    return undefined;
  }
  const nestedValue = normalizeOptionalString(value.value);
  const env = normalizeOptionalString(value.env);
  if (!nestedValue && !env) {
    return undefined;
  }
  return {
    ...(nestedValue ? { value: nestedValue } : {}),
    ...(env ? { env } : {}),
  };
}

function sanitizeAvatarConfigValue(
  value: unknown,
): OpenClawConfig["avatar"] | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const record = asObjectRecord(value);
  const lemonSlice = asObjectRecord(record.lemonSlice);
  const livekit = asObjectRecord(record.livekit);

  const provider = normalizeOptionalString(record.provider) === "lemonslice" ? "lemonslice" : undefined;
  const verbose = normalizeAvatarVerbose(record.verbose);
  const lemonSliceApiKey = sanitizeAvatarSecretConfigInput(lemonSlice.apiKey);
  const lemonSliceImageUrl = normalizeOptionalString(lemonSlice.imageUrl);
  const livekitUrl = normalizeOptionalString(livekit.url);
  const livekitApiKey = sanitizeAvatarSecretConfigInput(livekit.apiKey);
  const livekitApiSecret = sanitizeAvatarSecretConfigInput(livekit.apiSecret);

  const sanitized: Record<string, unknown> = {
    ...(provider ? { provider } : {}),
    ...(verbose !== undefined ? { verbose } : {}),
    ...(
      lemonSliceApiKey || lemonSliceImageUrl
        ? {
            lemonSlice: {
              ...(lemonSliceApiKey !== undefined ? { apiKey: lemonSliceApiKey } : {}),
              ...(lemonSliceImageUrl ? { imageUrl: lemonSliceImageUrl } : {}),
            },
          }
        : {}
    ),
    ...(
      livekitUrl || livekitApiKey || livekitApiSecret
        ? {
            livekit: {
              ...(livekitUrl ? { url: livekitUrl } : {}),
              ...(livekitApiKey !== undefined ? { apiKey: livekitApiKey } : {}),
              ...(livekitApiSecret !== undefined ? { apiSecret: livekitApiSecret } : {}),
            },
          }
        : {}
    ),
  };

  return Object.keys(sanitized).length > 0 ? (sanitized as OpenClawConfig["avatar"]) : undefined;
}

function readAvatarPluginConfig(config: OpenClawConfig): Record<string, unknown> | null {
  const plugins = asObjectRecord(config.plugins);
  const entries = asObjectRecord(plugins.entries);
  const pluginEntry = asObjectRecord(entries[AVATAR_PLUGIN_ID]);
  const pluginConfig = pluginEntry.config;
  return isObjectRecord(pluginConfig) ? pluginConfig : null;
}

function resolveEffectiveAvatarConfig(config: OpenClawConfig): OpenClawConfig {
  const pluginConfig = readAvatarPluginConfig(config);
  if (!pluginConfig) {
    return config;
  }
  // Plugin-owned setup is persisted under plugins.entries.avatar.config, but Avatar only
  // owns the avatar branch now. Shared speech/media config must come from the gateway root.
  const effective: OpenClawConfig = { ...config };
  const sanitizedPluginAvatar = sanitizeAvatarConfigValue(pluginConfig.avatar);
  if (sanitizedPluginAvatar) {
    effective.avatar = sanitizedPluginAvatar;
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

function getAvatarSubagentRuntime(api: OpenClawPluginApi): AvatarSubagentRuntime {
  const candidate = (api.runtime as OpenClawPluginApi["runtime"] & {
    subagent?: AvatarSubagentRuntime;
  }).subagent;
  if (
    !candidate ||
    typeof candidate.run !== "function" ||
    typeof candidate.getSessionMessages !== "function"
  ) {
    throw new Error("Avatar chat runtime unavailable during this request");
  }
  return candidate;
}

function getAvatarSpeechRuntime(
  runtime: OpenClawPluginApi["runtime"],
): AvatarSpeechRuntime | null {
  const candidate = runtime.tts;
  if (!candidate || typeof candidate.textToSpeechTelephony !== "function") {
    return null;
  }
  return candidate;
}

function getAvatarVideoAvatarRuntime(
  runtime: OpenClawPluginApi["runtime"],
): Partial<AvatarVideoAvatarRuntime> | null {
  const candidate = runtime.videoAvatar;
  if (!candidate || typeof candidate.synthesizeSpeech !== "function") {
    return null;
  }
  return candidate;
}

function hasAvatarVideoAvatarSpeechRuntime(runtime: OpenClawPluginApi["runtime"]): boolean {
  return typeof getAvatarVideoAvatarRuntime(runtime)?.synthesizeSpeech === "function";
}

function getAvatarSttRuntime(
  runtime: OpenClawPluginApi["runtime"],
): AvatarAudioTranscriptionRuntime | null {
  const sttRuntime = (runtime as OpenClawPluginApi["runtime"] & {
    stt?: AvatarAudioTranscriptionRuntime;
  }).stt;
  if (sttRuntime && typeof sttRuntime.transcribeAudioFile === "function") {
    return sttRuntime;
  }
  return null;
}

function getAvatarMediaUnderstandingRuntime(
  runtime: OpenClawPluginApi["runtime"],
): AvatarAudioTranscriptionRuntime | null {
  const mediaUnderstanding = (runtime as OpenClawPluginApi["runtime"] & {
    mediaUnderstanding?: AvatarAudioTranscriptionRuntime;
  }).mediaUnderstanding;
  if (mediaUnderstanding && typeof mediaUnderstanding.transcribeAudioFile === "function") {
    return mediaUnderstanding;
  }
  return null;
}

function normalizeRuntimeAudioBuffer(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  return null;
}

function createPcmWaveBuffer(params: {
  pcmAudioBuffer: Buffer;
  sampleRate: number;
  numChannels?: number;
}): Buffer {
  const numChannels = Math.max(1, Math.floor(params.numChannels ?? 1));
  const bitsPerSample = 16;
  const byteRate = params.sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = params.pcmAudioBuffer.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(params.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, params.pcmAudioBuffer]);
}

async function transcribeAudioBufferWithRuntime(params: {
  runtime: OpenClawPluginApi["runtime"];
  logger: AvatarLogger;
  cfg: OpenClawConfig;
  audioBuffer: Buffer;
  mimeType: string;
  sessionKey?: string;
}): Promise<{ text?: string; provider?: string }> {
  const transcriptionConfig = normalizeAvatarTranscriptionConfig(params.cfg);
  const sttRuntime = getAvatarSttRuntime(params.runtime);
  const mediaUnderstandingRuntime = getAvatarMediaUnderstandingRuntime(params.runtime);
  if (!sttRuntime && !mediaUnderstandingRuntime) {
    throw new Error("Avatar transcription runtime unavailable");
  }

  const tryNormalizeTranscript = (
    result: { text?: string } | null | undefined,
    provider: string,
  ): { text?: string; provider?: string } | null => {
    const text = normalizeOptionalString(result?.text);
    if (!text) {
      return null;
    }
    return { text, provider };
  };

  const runtimeErrors: Array<{ provider: string; error: unknown }> = [];
  const rememberRuntimeError = (provider: string, error: unknown): void => {
    runtimeErrors.push({ provider, error });
    logAvatarEvent(params.logger, "warn", "transcription.runtime.failed", {
      provider,
      mimeType: params.mimeType,
      ...(normalizeOptionalString(params.sessionKey)
        ? { sessionKey: normalizeOptionalString(params.sessionKey) }
        : {}),
      error: error instanceof Error ? error.message : String(error),
    });
  };

  let filePath: string | null = null;
  const ensureAudioFilePath = async (): Promise<string> => {
    if (filePath) {
      return filePath;
    }
    const extension = extensionForAudioMimeType(params.mimeType) || ".wav";
    filePath = path.join(tmpdir(), `openclaw-avatar-${randomUUID()}${extension}`);
    await writeFile(filePath, params.audioBuffer);
    return filePath;
  };

  try {
    if (sttRuntime) {
      const handoffPath = await ensureAudioFilePath();
      const handoffStat = await stat(handoffPath);
      logAvatarEvent(params.logger, "info", "transcription.runtime.handoff", {
        provider: "stt",
        fileBytes: handoffStat.size,
        mimeType: params.mimeType,
        ...(normalizeOptionalString(params.sessionKey)
          ? { sessionKey: normalizeOptionalString(params.sessionKey) }
          : {}),
      });
      try {
        const result = tryNormalizeTranscript(
          await sttRuntime.transcribeAudioFile({
            filePath: handoffPath,
            cfg: transcriptionConfig,
            mime: params.mimeType,
          }),
          "stt",
        );
        if (result) {
          return result;
        }
      } catch (error) {
        rememberRuntimeError("stt", error);
      }
    }

    if (mediaUnderstandingRuntime) {
      const handoffPath = await ensureAudioFilePath();
      const handoffStat = await stat(handoffPath);
      logAvatarEvent(params.logger, "info", "transcription.runtime.handoff", {
        provider: "media-understanding",
        fileBytes: handoffStat.size,
        mimeType: params.mimeType,
        ...(normalizeOptionalString(params.sessionKey)
          ? { sessionKey: normalizeOptionalString(params.sessionKey) }
          : {}),
      });
      try {
        const result = tryNormalizeTranscript(
          await mediaUnderstandingRuntime.transcribeAudioFile({
            filePath: handoffPath,
            cfg: transcriptionConfig,
            mime: params.mimeType,
          }),
          "media-understanding",
        );
        if (result) {
          return result;
        }
      } catch (error) {
        rememberRuntimeError("media-understanding", error);
      }
    }

    if (runtimeErrors.length > 0) {
      const lastError = runtimeErrors.at(-1)?.error;
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }

    return {
      text: "",
      provider:
        (sttRuntime && "stt") ||
        (mediaUnderstandingRuntime && "media-understanding") ||
        undefined,
    };
  } finally {
    if (filePath) {
      await unlink(filePath).catch(() => {});
    }
  }
}

async function synthesizeAvatarSpeechWithRuntime(params: {
  runtime: OpenClawPluginApi["runtime"];
  cfg: OpenClawConfig;
  text: string;
}): Promise<AvatarSpeechSynthesisResult> {
  const videoAvatar = getAvatarVideoAvatarRuntime(params.runtime);
  if (videoAvatar && typeof videoAvatar.synthesizeSpeech === "function") {
    const result = await videoAvatar.synthesizeSpeech({
      text: params.text,
      cfg: params.cfg,
    });
    const audioBuffer = normalizeRuntimeAudioBuffer(result.audioBuffer);
    const sampleRate =
      typeof result.sampleRate === "number" && Number.isFinite(result.sampleRate)
        ? Math.floor(result.sampleRate)
        : 0;
    if (!audioBuffer || sampleRate <= 0) {
      throw new Error("Avatar speech synthesis failed");
    }

    return {
      audioBuffer,
      sampleRate,
      provider: normalizeOptionalString(result.provider) ?? null,
    };
  }

  const speechRuntime = getAvatarSpeechRuntime(params.runtime);
  if (!speechRuntime) {
    throw new Error("Avatar speech runtime unavailable");
  }

  const result = await speechRuntime.textToSpeechTelephony({
    text: params.text,
    cfg: params.cfg,
  });
  const audioBuffer = normalizeRuntimeAudioBuffer(result.audioBuffer);
  const sampleRate =
    typeof result.sampleRate === "number" && Number.isFinite(result.sampleRate)
      ? Math.floor(result.sampleRate)
      : 0;
  if (!result.success || !audioBuffer || sampleRate <= 0) {
    throw new Error(result.error ?? "Avatar speech synthesis failed");
  }

  return {
    audioBuffer,
    sampleRate,
    provider: normalizeOptionalString(result.provider) ?? null,
  };
}

function isValidChatAttachmentInput(value: unknown): value is AvatarChatAttachmentInput {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { type?: unknown }).type === "string" &&
      typeof (value as { mimeType?: unknown }).mimeType === "string" &&
      typeof (value as { fileName?: unknown }).fileName === "string" &&
      typeof (value as { content?: unknown }).content === "string",
  );
}

function normalizeChatAttachmentInputs(value: unknown): AvatarChatAttachmentInput[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(INVALID_CHAT_SEND_PARAMS_ERROR);
  }
  const attachments = value.filter((item) => item !== null && item !== undefined);
  const totalAttachmentBytes = attachments.reduce((total, item) => {
    const content = typeof (item as { content?: unknown }).content === "string"
      ? (item as { content: string }).content
      : "";
    return total + Buffer.byteLength(content, "utf8");
  }, 0);
  if (
    attachments.length > AVATAR_ATTACHMENT_COUNT_MAX ||
    totalAttachmentBytes > AVATAR_ATTACHMENT_TOTAL_MAX_BYTES
  ) {
    throw new Error(INVALID_CHAT_SEND_PARAMS_ERROR);
  }
  if (!attachments.every(isValidChatAttachmentInput)) {
    throw new Error(INVALID_CHAT_SEND_PARAMS_ERROR);
  }
  return attachments.map((attachment) => {
    const type = attachment.type.trim();
    const mimeType = attachment.mimeType.trim();
    const fileName = attachment.fileName.trim();
    const content = attachment.content.trim();
    if (
      type.length === 0 ||
      mimeType.length === 0 ||
      fileName.length === 0 ||
      content.length === 0 ||
      Buffer.byteLength(content, "utf8") > AVATAR_ATTACHMENT_CONTENT_MAX_BYTES
    ) {
      throw new Error(INVALID_CHAT_SEND_PARAMS_ERROR);
    }
    return {
      type,
      mimeType,
      fileName,
      content,
    };
  });
}

function parseRequiredTrimmedString(value: unknown, errorMessage: string): string {
  if (typeof value !== "string") {
    throw new Error(errorMessage);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(errorMessage);
  }
  return trimmed;
}

function parseChatHistoryParams(params: Record<string, unknown>): ParsedAvatarHistoryParams {
  if (params.limit !== undefined && typeof params.limit !== "number") {
    throw new Error(INVALID_CHAT_HISTORY_PARAMS_ERROR);
  }
  return {
    sessionKey: parseRequiredTrimmedString(params.sessionKey, INVALID_CHAT_HISTORY_PARAMS_ERROR),
    limit:
      typeof params.limit === "number" && Number.isFinite(params.limit)
        ? Math.max(1, Math.floor(params.limit))
        : undefined,
  };
}

async function readChatHistoryParams(
  request: IncomingMessage,
): Promise<ParsedAvatarHistoryParams> {
  return parseChatHistoryParams(await readRequestJson(request));
}

function parseChatSendParams(params: Record<string, unknown>): ParsedAvatarSendParams {
  if (params.idempotencyKey !== undefined && typeof params.idempotencyKey !== "string") {
    throw new Error(INVALID_CHAT_SEND_PARAMS_ERROR);
  }
  return {
    sessionKey: parseRequiredTrimmedString(params.sessionKey, INVALID_CHAT_SEND_PARAMS_ERROR),
    message: parseRequiredTrimmedString(params.message, INVALID_CHAT_SEND_PARAMS_ERROR),
    attachments: normalizeChatAttachmentInputs(params.attachments),
    idempotencyKey: normalizeOptionalString(params.idempotencyKey),
  };
}

async function readChatSendParams(request: IncomingMessage): Promise<ParsedAvatarSendParams> {
  return parseChatSendParams(await readRequestJson(request));
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

function getAvatarErrorCode(
  error: unknown,
  message: string,
): "INVALID_REQUEST" | "UNAVAILABLE" {
  if (error instanceof AvatarRequestError) {
    return error.code;
  }
  return message.includes("invalid ") || message.endsWith(" is required")
    ? "INVALID_REQUEST"
    : "UNAVAILABLE";
}

function normalizeMimeType(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const [baseMimeType] = trimmed.split(";");
  const normalized = baseMimeType?.trim().toLowerCase();
  return normalized || undefined;
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

function sanitizeAvatarRoomPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    return AVATAR_ROOM_PART_FALLBACK;
  }
  return normalized.slice(0, AVATAR_ROOM_PART_MAX_LENGTH);
}

function resolveAvatarChatSessionKey(params: {
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

function buildAvatarDispatchMetadata(params: {
  sessionKey: string;
  imageUrl: string;
  avatarTimeoutSeconds?: number;
  aspectRatio?: string | null;
  interruptReplyOnNewMessage?: boolean;
}): string {
  return JSON.stringify({
    sessionKey: params.sessionKey,
    imageUrl: params.imageUrl,
    avatarTimeoutSeconds: normalizeAvatarTimeoutSeconds(params.avatarTimeoutSeconds),
    aspectRatio: normalizeAvatarAspectRatio(params.aspectRatio),
    interruptReplyOnNewMessage: normalizeInterruptReplyOnNewMessage(params.interruptReplyOnNewMessage),
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

function validateAvatarRoomName(roomName: string): string {
  const normalizedRoomName = roomName.trim();
  if (!normalizedRoomName) {
    throw new Error("roomName is required");
  }
  if (!normalizedRoomName.startsWith(`${AVATAR_ROOM_PREFIX}-`)) {
    throw new Error("invalid Avatar room name");
  }
  return normalizedRoomName;
}

function isAvatarTtsConfigured(config: OpenClawConfig): boolean {
  const effective = resolveEffectiveAvatarConfig(config);
  const ttsRecord = asObjectRecord(asObjectRecord(effective.messages).tts);
  return Boolean(normalizeOptionalString(ttsRecord.provider));
}

function isAvatarAudioTranscriptionConfigured(config: OpenClawConfig): boolean {
  const effective = resolveEffectiveAvatarConfig(config);
  const audioRecord = asObjectRecord(asObjectRecord(asObjectRecord(effective.tools).media).audio);
  if (audioRecord.enabled === false) {
    return false;
  }
  return Array.isArray(audioRecord.models) && audioRecord.models.length > 0;
}

function buildAvatarConfigResponse(
  config: OpenClawConfig,
  runtime?: OpenClawPluginApi["runtime"],
): AvatarConfigResponse {
  const effective = resolveEffectiveAvatarConfig(config);
  const provider = effective.avatar?.provider === "lemonslice" ? "lemonslice" : null;
  const lemonSlice = effective.avatar?.lemonSlice;
  const livekit = effective.avatar?.livekit;
  const missing: string[] = [];
  const readSecretValue = (value: unknown, path: string): string | null => {
    if (!hasConfiguredSecretInput(value)) {
      return null;
    }
    return normalizeResolvedSecretInputString({ value, path });
  };

  if (provider !== "lemonslice") {
    missing.push("avatar.provider");
  }
  if (!hasConfiguredSecretInput(lemonSlice?.apiKey)) {
    missing.push("avatar.lemonSlice.apiKey");
  }
  if (!normalizeOptionalString(livekit?.url)) {
    missing.push("avatar.livekit.url");
  }
  if (!hasConfiguredSecretInput(livekit?.apiKey)) {
    missing.push("avatar.livekit.apiKey");
  }
  if (!hasConfiguredSecretInput(livekit?.apiSecret)) {
    missing.push("avatar.livekit.apiSecret");
  }
  if (!isAvatarTtsConfigured(config)) {
    missing.push("messages.tts");
  }
  if (!isAvatarAudioTranscriptionConfigured(config)) {
    missing.push("tools.media.audio");
  }
  if (
    runtime &&
    !hasAvatarVideoAvatarSpeechRuntime(runtime) &&
    !getAvatarSpeechRuntime(runtime)
  ) {
    missing.push("messages.tts");
  }
  if (
    runtime &&
    !getAvatarSttRuntime(runtime) &&
    !getAvatarMediaUnderstandingRuntime(runtime)
  ) {
    missing.push("tools.media.audio");
  }
  const uniqueMissing = [...new Set(missing)];

  return {
    provider,
    configured: uniqueMissing.length === 0,
    missing: uniqueMissing,
    verbose: readAvatarVerbose(config),
    lemonSlice: {
      apiKey: readSecretValue(lemonSlice?.apiKey, "avatar.lemonSlice.apiKey"),
      apiKeyConfigured: hasConfiguredSecretInput(lemonSlice?.apiKey),
      imageUrl: normalizeOptionalString(lemonSlice?.imageUrl) ?? null,
    },
    livekit: {
      url: normalizeOptionalString(livekit?.url) ?? null,
      apiKey: readSecretValue(livekit?.apiKey, "avatar.livekit.apiKey"),
      apiKeyConfigured: hasConfiguredSecretInput(livekit?.apiKey),
      apiSecret: readSecretValue(livekit?.apiSecret, "avatar.livekit.apiSecret"),
      apiSecretConfigured: hasConfiguredSecretInput(livekit?.apiSecret),
    },
  };
}

function extractErrorStatus(error: unknown): number | null {
  if (typeof (error as { status?: unknown })?.status === "number") {
    return Number((error as { status: number }).status);
  }
  if (typeof (error as { statusCode?: unknown })?.statusCode === "number") {
    return Number((error as { statusCode: number }).statusCode);
  }
  return null;
}

function classifySetupVerificationError(message: string, error: unknown): AvatarRequestError {
  const status = extractErrorStatus(error);
  const normalizedMessage = message.trim();
  const normalizedErrorCode =
    typeof (error as { code?: unknown })?.code === "string"
      ? (error as { code: string }).code.trim().toUpperCase()
      : "";
  if (
    !status &&
    (
      /fetch failed|enotfound|econnreset|econnrefused|getaddrinfo|socket hang up|network error/i.test(
        normalizedMessage,
      ) ||
      /^(ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT)$/i.test(normalizedErrorCode)
    )
  ) {
    return new AvatarRequestError("UNAVAILABLE", normalizedMessage);
  }
  if (
    status === 429 ||
    (typeof status === "number" && status >= 500) ||
    /timed out|timeout|aborterror/i.test(normalizedMessage)
  ) {
    return new AvatarRequestError("UNAVAILABLE", normalizedMessage);
  }
  return new AvatarRequestError("INVALID_REQUEST", normalizedMessage);
}

async function verifyLiveKitSetupConfig(params: {
  logger: AvatarLogger;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
}): Promise<void> {
  logAvatarEvent(params.logger, "info", "setup.verify.livekit.begin", {
    livekitUrl: params.livekitUrl,
  });
  try {
    const { RoomServiceClient } = await import("livekit-server-sdk");
    const client = new RoomServiceClient(
      params.livekitUrl,
      params.livekitApiKey,
      params.livekitApiSecret,
      { requestTimeout: AVATAR_SETUP_VERIFY_TIMEOUT_MS },
    );
    await client.listRooms([]);
    logAvatarEvent(params.logger, "info", "setup.verify.livekit.succeeded", {
      livekitUrl: params.livekitUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const requestError = classifySetupVerificationError(
      `LiveKit URL or API credentials could not be verified: ${message}`,
      error,
    );
    logAvatarEvent(
      params.logger,
      requestError.code === "INVALID_REQUEST" ? "warn" : "error",
      "setup.verify.livekit.failed",
      {
        livekitUrl: params.livekitUrl,
        code: requestError.code,
        error: requestError.message,
      },
    );
    throw requestError;
  }
}

async function verifyCoreSpeechSetupConfig(params: {
  logger: AvatarLogger;
  runtime: OpenClawPluginApi["runtime"];
  config: OpenClawConfig;
}): Promise<void> {
  logAvatarEvent(params.logger, "info", "setup.verify.core-speech.begin");
  try {
    const synthesized = await synthesizeAvatarSpeechWithRuntime({
      runtime: params.runtime,
      cfg: params.config,
      text: AVATAR_RUNTIME_SPEECH_VERIFY_TEXT,
    });
    const waveBuffer = createPcmWaveBuffer({
      pcmAudioBuffer: synthesized.audioBuffer,
      sampleRate: synthesized.sampleRate,
    });
    const transcription = await transcribeAudioBufferWithRuntime({
      runtime: params.runtime,
      logger: params.logger,
      cfg: params.config,
      audioBuffer: waveBuffer,
      mimeType: "audio/wav",
    });
    const text = normalizeOptionalString(transcription.text);
    if (!text) {
      throw new Error(
        "Avatar speech-to-text could not be verified through OpenClaw's media runtime",
      );
    }
    logAvatarEvent(params.logger, "info", "setup.verify.core-speech.succeeded", {
      provider: synthesized.provider ?? "runtime",
      transcriptChars: text.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const requestError = classifySetupVerificationError(
      `Avatar core speech runtime could not be verified: ${message}`,
      error,
    );
    logAvatarEvent(
      params.logger,
      requestError.code === "INVALID_REQUEST" ? "warn" : "error",
      "setup.verify.core-speech.failed",
      {
        code: requestError.code,
        error: requestError.message,
      },
    );
    throw requestError;
  }
}

function parseAvatarSetupInput(
  params: Record<string, unknown>,
  method: string,
): AvatarSetupInput {
  const readInput = (key: keyof AvatarSetupInput): string | undefined => {
    const value = params[key];
    if (value === undefined) {
      return undefined;
    }
    if (typeof value !== "string") {
      throw new Error(`invalid ${method} params`);
    }
    return value;
  };

  const parsed: AvatarSetupInput = {
    gatewayToken: readInput("gatewayToken"),
    lemonSliceApiKey: readInput("lemonSliceApiKey"),
    livekitUrl: readInput("livekitUrl"),
    livekitApiKey: readInput("livekitApiKey"),
    livekitApiSecret: readInput("livekitApiSecret"),
  };
  if (params.verbose !== undefined) {
    if (typeof params.verbose !== "boolean") {
      throw new Error(`invalid ${method} params`);
    }
    parsed.verbose = params.verbose;
  }

  return parsed;
}

function applyAvatarSetupToConfig(
  config: OpenClawConfig,
  setupInput: AvatarSetupInput,
): OpenClawConfig {
  const effective = resolveEffectiveAvatarConfig(config);
  const gatewayRecord = asObjectRecord(config.gateway);
  const gatewayAuthRecord = asObjectRecord(gatewayRecord.auth);
  const gatewayToken = normalizeOptionalSetupSecretString(setupInput.gatewayToken);
  const lemonSliceApiKey =
    normalizeOptionalSetupSecretString(setupInput.lemonSliceApiKey) ??
    effective.avatar?.lemonSlice?.apiKey;
  const livekitUrl =
    normalizeOptionalString(setupInput.livekitUrl) ?? effective.avatar?.livekit?.url;
  const livekitApiKey =
    normalizeOptionalSetupSecretString(setupInput.livekitApiKey) ??
    effective.avatar?.livekit?.apiKey;
  const livekitApiSecret =
    normalizeOptionalSetupSecretString(setupInput.livekitApiSecret) ??
    effective.avatar?.livekit?.apiSecret;

  const plugins = asObjectRecord(config.plugins);
  const entries = asObjectRecord(plugins.entries);
  const pluginEntry = asObjectRecord(entries[AVATAR_PLUGIN_ID]);
  const existingPluginConfig = asObjectRecord(pluginEntry.config);

  const avatarRecord = asObjectRecord(sanitizeAvatarConfigValue(effective.avatar));
  const lemonSliceRecord = asObjectRecord(avatarRecord.lemonSlice);
  const livekitRecord = asObjectRecord(avatarRecord.livekit);
  const verbose =
    normalizeAvatarVerbose(setupInput.verbose) ?? normalizeAvatarVerbose(avatarRecord.verbose);

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
        [AVATAR_PLUGIN_ID]: {
          ...pluginEntry,
          config: {
            ...existingPluginConfig,
            avatar: {
              ...avatarRecord,
              ...(verbose !== undefined ? { verbose } : {}),
              provider: "lemonslice",
              lemonSlice: {
                ...lemonSliceRecord,
                apiKey: lemonSliceApiKey,
              },
              livekit: {
                ...livekitRecord,
                url: livekitUrl,
                apiKey: livekitApiKey,
                apiSecret: livekitApiSecret,
              },
            },
          },
        },
      },
    },
  };
}

function buildAvatarProviderConfigSnapshot(config: OpenClawConfig): string {
  const effective = resolveEffectiveAvatarConfig(config);
  return JSON.stringify({
    provider: effective.avatar?.provider ?? null,
    lemonSliceApiKey: effective.avatar?.lemonSlice?.apiKey ?? null,
    livekitUrl: effective.avatar?.livekit?.url ?? null,
    livekitApiKey: effective.avatar?.livekit?.apiKey ?? null,
    livekitApiSecret: effective.avatar?.livekit?.apiSecret ?? null,
  });
}

function shouldVerifyAvatarSetupConfig(
  currentConfig: OpenClawConfig,
  nextConfig: OpenClawConfig,
): boolean {
  return (
    buildAvatarProviderConfigSnapshot(currentConfig) !==
    buildAvatarProviderConfigSnapshot(nextConfig)
  );
}

async function writeConfigFile(api: OpenClawPluginApi, config: OpenClawConfig): Promise<void> {
  const writer = (api.runtime.config as { writeConfigFile?: unknown }).writeConfigFile;
  if (typeof writer !== "function") {
    throw new Error("Avatar setup is unavailable: runtime config writer is missing");
  }
  await (writer as (nextConfig: OpenClawConfig) => Promise<void>)(config);
}

async function verifyAvatarSetupConfig(params: {
  logger: AvatarLogger;
  runtime: OpenClawPluginApi["runtime"];
  config: OpenClawConfig;
}): Promise<void> {
  const effective = resolveEffectiveAvatarConfig(params.config);
  const livekitUrl = normalizeOptionalString(effective.avatar?.livekit?.url);
  const livekitApiKey = hasConfiguredSecretInput(effective.avatar?.livekit?.apiKey)
    ? normalizeResolvedSecretInputString({
        value: effective.avatar?.livekit?.apiKey,
        path: "avatar.livekit.apiKey",
      })
    : undefined;
  const livekitApiSecret = hasConfiguredSecretInput(effective.avatar?.livekit?.apiSecret)
    ? normalizeResolvedSecretInputString({
        value: effective.avatar?.livekit?.apiSecret,
        path: "avatar.livekit.apiSecret",
      })
    : undefined;
  const speechRuntime = getAvatarSpeechRuntime(params.runtime);
  const sttRuntime = getAvatarSttRuntime(params.runtime);
  const mediaUnderstandingRuntime = getAvatarMediaUnderstandingRuntime(params.runtime);
  const hasVideoAvatarSpeechRuntime = hasAvatarVideoAvatarSpeechRuntime(params.runtime);

  const checks: Promise<void>[] = [];
  if (livekitUrl && livekitApiKey && livekitApiSecret) {
    checks.push(
      verifyLiveKitSetupConfig({
        logger: params.logger,
        livekitUrl,
        livekitApiKey,
        livekitApiSecret,
      }),
    );
  }
  if (
    (hasVideoAvatarSpeechRuntime || speechRuntime) &&
    (sttRuntime || mediaUnderstandingRuntime) &&
    isAvatarTtsConfigured(params.config) &&
    isAvatarAudioTranscriptionConfigured(params.config)
  ) {
    checks.push(
      verifyCoreSpeechSetupConfig({
        logger: params.logger,
        runtime: params.runtime,
        config: params.config,
      }),
    );
  }

  await Promise.all(checks);
}

async function transcribeAvatarAudio(params: {
  runtime: OpenClawPluginApi["runtime"];
  logger: AvatarLogger;
  cfg: OpenClawConfig;
  base64Data: string;
  mimeType?: unknown;
  sessionKey?: string;
  captureSource?: string;
  roomTrackMuted?: boolean;
  captureError?: string;
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
  if (audioBuffer.length > AVATAR_AUDIO_MAX_BYTES) {
    throw new Error("audio payload is too large");
  }

  const mimeType = normalizeMimeType(params.mimeType);
  logAvatarEvent(params.logger, "info", "transcription.requested", {
    bytes: audioBuffer.length,
    mimeType: mimeType ?? "application/octet-stream",
    ...(normalizeOptionalString(params.sessionKey)
      ? { sessionKey: normalizeOptionalString(params.sessionKey) }
      : {}),
    ...(normalizeOptionalString(params.captureSource)
      ? { captureSource: normalizeOptionalString(params.captureSource) }
      : {}),
    ...(params.roomTrackMuted === true ? { roomTrackMuted: true } : {}),
    ...(normalizeOptionalString(params.captureError)
      ? { captureError: normalizeOptionalString(params.captureError) }
      : {}),
  });

  const runtimeTranscription = await transcribeAudioBufferWithRuntime({
    runtime: params.runtime,
    logger: params.logger,
    cfg: params.cfg,
    audioBuffer,
    mimeType: mimeType ?? "audio/wav",
    sessionKey: params.sessionKey,
  });
  const transcript = normalizeOptionalString(runtimeTranscription.text) ?? "";
  logAvatarEvent(
    params.logger,
    "info",
    transcript ? "transcription.succeeded" : "transcription.ignored",
    {
      bytes: audioBuffer.length,
      mimeType: mimeType ?? "application/octet-stream",
      transcriptChars: transcript.length,
      provider: normalizeOptionalString(runtimeTranscription.provider) ?? "runtime",
    },
  );
  return { transcript };
}

async function synthesizeAvatarAudio(params: {
  runtime: OpenClawPluginApi["runtime"];
  logger: AvatarLogger;
  cfg: OpenClawConfig;
  text: string;
}): Promise<{ audioBase64: string; sampleRate: number; provider: string | null }> {
  const text = params.text.trim();
  if (!text) {
    throw new Error("speech text is required");
  }

  logAvatarEvent(params.logger, "info", "speech.synthesize.requested", {
    textChars: text.length,
  });
  const result = await synthesizeAvatarSpeechWithRuntime({
    runtime: params.runtime,
    cfg: params.cfg,
    text,
  });
  logAvatarEvent(params.logger, "info", "speech.synthesize.succeeded", {
    textChars: text.length,
    sampleRate: result.sampleRate,
    provider: result.provider ?? "runtime",
  });
  return {
    audioBase64: result.audioBuffer.toString("base64"),
    sampleRate: result.sampleRate,
    provider: result.provider,
  };
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

async function runAvatarSetupCli(api: OpenClawPluginApi, options: unknown): Promise<void> {
  const currentConfig = api.runtime.config.loadConfig();
  const effectiveCurrentConfig = resolveEffectiveAvatarConfig(currentConfig);

  let setupInput: AvatarSetupInput = {
    gatewayToken:
      readCliOption(options, "gatewayToken") ??
      process.env.AVATAR_GATEWAY_TOKEN ??
      process.env.OPENCLAW_GATEWAY_TOKEN,
    lemonSliceApiKey:
      readCliOption(options, "lemonsliceApiKey") ??
      readCliOption(options, "lemonSliceApiKey") ??
      process.env.AVATAR_LEMONSLICE_API_KEY,
    livekitUrl: readCliOption(options, "livekitUrl") ?? process.env.AVATAR_LIVEKIT_URL,
    livekitApiKey:
      readCliOption(options, "livekitApiKey") ?? process.env.AVATAR_LIVEKIT_API_KEY,
    livekitApiSecret:
      readCliOption(options, "livekitApiSecret") ?? process.env.AVATAR_LIVEKIT_API_SECRET,
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
        livekitUrl: await promptTerminalField({
          rl,
          label: "LiveKit URL",
          defaultValue: normalizeOptionalString(effectiveCurrentConfig.avatar?.livekit?.url),
        }),
        livekitApiKey: await promptTerminalField({ rl, label: "LiveKit API key" }),
        livekitApiSecret: await promptTerminalField({ rl, label: "LiveKit API secret" }),
      };
    } finally {
      rl.close();
    }
  }

  const hasAnyInput = Object.values(setupInput).some((value) => value !== undefined);
  if (!hasAnyInput) {
    throw new Error(
      "Avatar setup command requires CLI options, environment variables, or interactive input",
    );
  }

  const nextConfig = applyAvatarSetupToConfig(currentConfig, setupInput);
  if (shouldVerifyAvatarSetupConfig(currentConfig, nextConfig)) {
    await verifyAvatarSetupConfig({
      logger: api.logger,
      runtime: api.runtime,
      config: nextConfig,
    });
  }
  await writeConfigFile(api, nextConfig);
  const status = buildAvatarConfigResponse(nextConfig);
  api.logger.info(
    `Avatar setup saved${status.configured ? "" : `; missing ${status.missing.join(", ")}`}`,
  );
}

function registerAvatarSetupCli(api: OpenClawPluginApi): void {
  api.registerCli(({ program }: { program: any }) => {
      program
        .command("avatar-setup")
        .description("Configure OpenClaw gateway auth and Avatar provider credentials")
        .option("--gateway-token <token>", "OpenClaw gateway token")
        .option("--lemonslice-api-key <key>", "LemonSlice API key")
        .option("--livekit-url <url>", "LiveKit URL")
        .option("--livekit-api-key <key>", "LiveKit API key")
        .option("--livekit-api-secret <secret>", "LiveKit API secret")
        .action(async (options: unknown) => {
          await runAvatarSetupCli(api, options);
        });
    }, { commands: ["avatar-setup"] });
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

function setNoStoreHeaders(res: ServerResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
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

function withNoStoreHeaders(payload: HttpResponsePayload): HttpResponsePayload {
  return {
    ...payload,
    headers: {
      ...(payload.headers ?? {}),
      "cache-control": "no-store, max-age=0",
      pragma: "no-cache",
    },
  };
}

function parseRequestUrl(urlValue: string | undefined): URL | null {
  if (!urlValue) {
    return null;
  }
  try {
    return new URL(urlValue, "http://127.0.0.1");
  } catch {
    return null;
  }
}

function parseRequestPathname(urlValue: string | undefined): string | null {
  return parseRequestUrl(urlValue)?.pathname ?? null;
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

function moduleOpenClawPackageJsonCandidates(): string[] {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(moduleDir, "..", "node_modules", "openclaw", "package.json"),
    path.resolve(moduleDir, "..", "..", "node_modules", "openclaw", "package.json"),
  ];
}

function modulePluginManifestCandidates(): string[] {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(moduleDir, "..", "openclaw.plugin.json"),
    path.resolve(moduleDir, "..", "..", "openclaw.plugin.json"),
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
    return "/plugins/avatar/readme";
  }
  if (trimmed.startsWith("assets/")) {
    return `/plugins/avatar/assets/${encodePathSegments(trimmed.slice("assets/".length))}`;
  }
  return trimmed;
}

function renderMarkdownInline(value: string): string {
  const htmlTokens: string[] = [];
  const storeHtmlToken = (html: string) => {
    const token = `\u0000HTML${htmlTokens.length}\u0000`;
    htmlTokens.push(html);
    return token;
  };

  let rendered = value.replace(/`([^`]+)`/g, (_match, code: string) =>
    storeHtmlToken(`<code>${escapeHtml(code)}</code>`),
  );
  rendered = escapeHtml(rendered);
  rendered = rendered.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, href: string) => {
    const src = resolveReadmeHref(href);
    return storeHtmlToken(
      `<img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}" loading="lazy" />`,
    );
  });
  rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
    const resolvedHref = resolveReadmeHref(href);
    return storeHtmlToken(`<a href="${escapeHtmlAttribute(resolvedHref)}">${label}</a>`);
  });
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  rendered = rendered.replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,!?]|$)/g, "$1<em>$2</em>");
  rendered = rendered.replace(
    /(^|[\s(])(https?:\/\/[^\s<]*[^\s<).,!?])/g,
    '$1<a href="$2">$2</a>',
  );
  return rendered.replace(/\u0000HTML(\d+)\u0000/g, (_match, index: string) => {
    return htmlTokens[Number(index)] ?? "";
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

function registerAvatarHttpRoutes(
  api: OpenClawPluginApi,
  handlers: AvatarSessionHandlers & AvatarChatHandlers,
  logger: AvatarLogger,
): void {
  let cachedWebRootPath: string | null | undefined;
  let cachedStylesRootPath: string | null | undefined;
  let cachedPluginRootPath: string | null | undefined;
  let cachedPackageVersion: string | undefined;
  let cachedHostOpenClawVersion: string | null | undefined;
  let cachedReadmePath: string | null | undefined;
  let cachedAssetsRootPath: string | null | undefined;

  const resolvePluginRootPath = async (): Promise<string> => {
    if (cachedPluginRootPath !== undefined) {
      if (!cachedPluginRootPath) {
        throw new Error("unable to locate plugin root");
      }
      return cachedPluginRootPath;
    }

    const manifestCandidates = [
      api.resolvePath("openclaw.plugin.json"),
      api.resolvePath("./openclaw.plugin.json"),
      api.resolvePath("../openclaw.plugin.json"),
      ...modulePluginManifestCandidates(),
    ];
    const seen = new Set<string>();

    for (const candidate of manifestCandidates) {
      const normalized = candidate.trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      try {
        const entry = await stat(normalized);
        if (!entry.isFile()) {
          continue;
        }
        const manifest = JSON.parse(await readFile(normalized, "utf8")) as { id?: unknown };
        if (manifest.id === api.id) {
          cachedPluginRootPath = path.dirname(normalized);
          return cachedPluginRootPath;
        }
      } catch {
        // Keep scanning fallback manifests.
      }
    }

    const packageJsonPath = await resolveExistingFile(modulePackageJsonCandidates());
    if (packageJsonPath) {
      cachedPluginRootPath = path.dirname(packageJsonPath);
      return cachedPluginRootPath;
    }

    const readmePath = await resolveExistingFile(moduleReadmeCandidates());
    if (readmePath) {
      cachedPluginRootPath = path.dirname(readmePath);
      return cachedPluginRootPath;
    }

    cachedPluginRootPath = null;
    throw new Error("unable to locate plugin root");
  };

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
    let packageJsonPath: string | null = null;
    try {
      const pluginRootPath = await resolvePluginRootPath();
      packageJsonPath = await resolveExistingFile([path.join(pluginRootPath, "package.json")]);
    } catch {
      packageJsonPath = await resolveExistingFile([
        api.resolvePath("package.json"),
        api.resolvePath("./package.json"),
        ...modulePackageJsonCandidates(),
      ]);
    }
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

  const collectOpenClawPackageJsonCandidates = (): string[] => {
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
    const addAncestorCandidates = (startPath: string, levels: number) => {
      let current = path.resolve(startPath);
      for (let depth = 0; depth <= levels; depth += 1) {
        pushCandidate(path.join(current, "openclaw", "package.json"));
        pushCandidate(path.join(current, "node_modules", "openclaw", "package.json"));
        const parent = path.dirname(current);
        if (parent === current) {
          break;
        }
        current = parent;
      }
    };

    pushCandidate(api.resolvePath("node_modules/openclaw/package.json"));
    pushCandidate(api.resolvePath("./node_modules/openclaw/package.json"));
    pushCandidate(api.resolvePath("../node_modules/openclaw/package.json"));
    for (const candidate of moduleOpenClawPackageJsonCandidates()) {
      pushCandidate(candidate);
    }
    addAncestorCandidates(path.dirname(fileURLToPath(import.meta.url)), 6);
    addAncestorCandidates(process.cwd(), 4);
    return candidates;
  };

  const resolveHostOpenClawVersion = async (): Promise<string | null> => {
    if (cachedHostOpenClawVersion !== undefined) {
      return cachedHostOpenClawVersion;
    }

    const runtimeRecord = asObjectRecord(api.runtime);
    const directCandidates = [
      runtimeRecord.openclawVersion,
      runtimeRecord.hostVersion,
      runtimeRecord.appVersion,
      process.env.OPENCLAW_VERSION,
      process.env.OPENCLAW_APP_VERSION,
    ];
    for (const candidate of directCandidates) {
      const normalized = normalizeVersionString(candidate);
      if (normalized) {
        cachedHostOpenClawVersion = normalized;
        return cachedHostOpenClawVersion;
      }
    }

    const packageJsonPath = await resolveExistingFile(collectOpenClawPackageJsonCandidates());
    if (!packageJsonPath) {
      cachedHostOpenClawVersion = null;
      return cachedHostOpenClawVersion;
    }

    try {
      const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: unknown };
      cachedHostOpenClawVersion = normalizeVersionString(packageJson.version);
      return cachedHostOpenClawVersion;
    } catch {
      cachedHostOpenClawVersion = null;
      return cachedHostOpenClawVersion;
    }
  };

  const readRenderedHtmlAsset = async (relativePath: string): Promise<string> => {
    const [html, packageVersion, sharedShellScript] = await Promise.all([
      readWebAsset(relativePath),
      resolvePackageVersion(),
      readWebAsset("shared-shell.js"),
    ]);
    const renderedSharedShellScript = sharedShellScript.replaceAll(
      PACKAGE_VERSION_PLACEHOLDER,
      packageVersion,
    );
    return html
      .replaceAll(PACKAGE_VERSION_PLACEHOLDER, packageVersion)
      .replace(SHARED_SHELL_BOOTSTRAP_PLACEHOLDER, renderedSharedShellScript);
  };

  const resolveReadmePath = async (): Promise<string> => {
    if (cachedReadmePath !== undefined) {
      if (!cachedReadmePath) {
        throw new Error("unable to locate plugin README");
      }
      return cachedReadmePath;
    }
    let readmePath: string | null = null;
    try {
      const pluginRootPath = await resolvePluginRootPath();
      readmePath = await resolveExistingFile([path.join(pluginRootPath, "README.md")]);
    } catch {
      readmePath = await resolveExistingFile([
        api.resolvePath("README.md"),
        api.resolvePath("./README.md"),
        ...moduleReadmeCandidates(),
      ]);
    }
    cachedReadmePath = readmePath;
    if (!readmePath) {
      throw new Error("unable to locate plugin README");
    }
    return readmePath;
  };

  const readRenderedReadmePage = async (): Promise<string> => {
    const [template, packageVersion, readmePath, sharedShellScript] = await Promise.all([
      readWebAsset("readme.html"),
      resolvePackageVersion(),
      resolveReadmePath(),
      readWebAsset("shared-shell.js"),
    ]);
    const markdown = await readFile(readmePath, "utf8");
    const readmeHtml = renderMarkdownToHtml(markdown);
    const renderedSharedShellScript = sharedShellScript.replaceAll(
      PACKAGE_VERSION_PLACEHOLDER,
      packageVersion,
    );
    return template
      .replaceAll(PACKAGE_VERSION_PLACEHOLDER, packageVersion)
      .replace(SHARED_SHELL_BOOTSTRAP_PLACEHOLDER, renderedSharedShellScript)
      .replace(README_HTML_PLACEHOLDER_REGEX, readmeHtml);
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

  const buildBrowserBootstrapPayload = async (config: OpenClawConfig) => {
    const gateway = resolveGatewayRuntimeFromConfig(config);
    const openclawVersion = await resolveHostOpenClawVersion();
    const openclaw = {
      version: openclawVersion,
      minimumCompatibleVersion: OPENCLAW_MIN_COMPATIBLE_VERSION,
      compatible: openclawVersion === null ? null : isOpenClawVersionCompatible(openclawVersion),
    };
    if (!gateway) {
      return {
        success: true,
        openclaw,
        gateway: {
          auth: { mode: "none" as const },
        },
      };
    }
    if (gateway.auth.mode === "token") {
      return {
        success: true,
        openclaw,
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
      openclaw,
      gateway: {
        auth: { mode: gateway.auth.mode },
      },
    };
  };

  api.registerHttpRoute({
    path: "/plugins/avatar/api",
    auth: "gateway",
    match: "prefix",
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const pathname = parseRequestPathname(req.url);
      if (!pathname) {
        return false;
      }
      const normalizedPath = pathname.replace(/\/+$/, "") || "/plugins/avatar/api";
      if (!normalizedPath.startsWith("/plugins/avatar/api")) {
        return false;
      }

      const method = (req.method ?? "GET").toUpperCase();

      try {
        if (normalizedPath === "/plugins/avatar/api/setup") {
          if (method === "GET") {
            const cfg = api.runtime.config.loadConfig();
            sendHttpResponse(
              res,
              asJsonResponse({
                success: true,
                setup: buildAvatarConfigResponse(cfg, api.runtime),
              }),
            );
            return true;
          }
          if (method === "POST") {
            const params = await readRequestJson(req);
            const setupInput = parseAvatarSetupInput(params, "avatar.setup.save");
            const currentConfig = api.runtime.config.loadConfig();
            const nextConfig = applyAvatarSetupToConfig(currentConfig, setupInput);
            if (shouldVerifyAvatarSetupConfig(currentConfig, nextConfig)) {
              await verifyAvatarSetupConfig({
                logger,
                runtime: api.runtime,
                config: nextConfig,
              });
            }
            await writeConfigFile(api, nextConfig);
            sendHttpResponse(
              res,
              asJsonResponse({
                success: true,
                setup: buildAvatarConfigResponse(nextConfig, api.runtime),
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

        if (normalizedPath === "/plugins/avatar/api/session") {
          if (method === "POST") {
            const params = await readRequestJson(req);
            if (params.sessionKey !== undefined && typeof params.sessionKey !== "string") {
              throw new Error("invalid avatar.session.create params");
            }
            if (params.avatarImageUrl !== undefined && typeof params.avatarImageUrl !== "string") {
              throw new Error("invalid avatar.session.create params");
            }
            if (
              params.avatarTimeoutSeconds !== undefined &&
              (typeof params.avatarTimeoutSeconds !== "number" ||
                !Number.isFinite(params.avatarTimeoutSeconds))
            ) {
              throw new Error("invalid avatar.session.create params");
            }
            if (params.aspectRatio !== undefined && typeof params.aspectRatio !== "string") {
              throw new Error("invalid avatar.session.create params");
            }
            if (
              params.interruptReplyOnNewMessage !== undefined &&
              typeof params.interruptReplyOnNewMessage !== "boolean"
            ) {
              throw new Error("invalid avatar.session.create params");
            }
            const cfg = api.runtime.config.loadConfig();
            const sessionKey =
              (typeof params.sessionKey === "string" && params.sessionKey.trim()) ||
              cfg.session?.mainKey ||
              "main";
            const interruptReplyOnNewMessage = normalizeInterruptReplyOnNewMessage(
              params.interruptReplyOnNewMessage,
            );
            const avatarImageUrl =
              typeof params.avatarImageUrl === "string" ? params.avatarImageUrl.trim() : undefined;
            const avatarTimeoutSeconds =
              typeof params.avatarTimeoutSeconds === "number"
                ? normalizeAvatarTimeoutSeconds(params.avatarTimeoutSeconds)
                : undefined;
            const aspectRatio =
              typeof params.aspectRatio === "string"
                ? normalizeAvatarAspectRatio(params.aspectRatio)
                : undefined;
            logAvatarEvent(logger, "info", "http.session.create.requested", {
              sessionKey,
              avatarImageUrlProvided: Boolean(avatarImageUrl),
              avatarTimeoutSeconds: avatarTimeoutSeconds ?? AVATAR_TIMEOUT_DEFAULT_SECONDS,
              aspectRatio: aspectRatio ?? AVATAR_ASPECT_RATIO_DEFAULT,
              interruptReplyOnNewMessage,
            });
            const session = await handlers.createSession({
              config: cfg,
              sessionKey,
              avatarImageUrl,
              avatarTimeoutSeconds,
              aspectRatio,
              interruptReplyOnNewMessage,
            });
            logAvatarEvent(logger, "info", "http.session.create.completed", {
              sessionKey: session.sessionKey,
              roomName: session.roomName,
              chatSessionKey: session.chatSessionKey,
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

        if (normalizedPath === "/plugins/avatar/api/session/status" && method === "GET") {
          const requestUrl = parseRequestUrl(req.url);
          const roomName = normalizeOptionalString(requestUrl?.searchParams.get("roomName"));
          if (!roomName) {
            throw new Error("roomName is required");
          }
          logAvatarEvent(logger, "info", "http.session.status.requested", {
            roomName,
          });
          const status = await handlers.loadSessionStatus({ roomName });
          logAvatarEvent(logger, "info", "http.session.status.completed", {
            roomName,
            found: Boolean(status),
            updatedAt: status?.updatedAt,
          });
          sendHttpResponse(
            res,
            asJsonResponse({
              success: true,
              status,
            }),
          );
          return true;
        }

        if (normalizedPath === "/plugins/avatar/api/session/stop" && method === "POST") {
          const params = await readRequestJson(req);
          if (typeof params.roomName !== "string") {
            throw new Error("invalid avatar.session.stop params");
          }
          logAvatarEvent(logger, "info", "http.session.stop.requested", {
            roomName: params.roomName,
          });
          const result = await handlers.stopSession({
            roomName: params.roomName,
          });
          logAvatarEvent(logger, "info", "http.session.stop.completed", {
            roomName: result.roomName,
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

        if (normalizedPath === "/plugins/avatar/api/sidecar/restart" && method === "POST") {
          const cfg = api.runtime.config.loadConfig();
          logAvatarEvent(logger, "info", "http.sidecar.restart.requested");
          const result = await handlers.restartSidecar({
            config: cfg,
            reason: "http-sidecar-restart",
          });
          logAvatarEvent(logger, "info", "http.sidecar.restart.completed", {
            restarted: result.restarted,
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

        if (normalizedPath === "/plugins/avatar/api/sidecar/stop" && method === "POST") {
          logAvatarEvent(logger, "info", "http.sidecar.stop.requested");
          const result = await handlers.stopSidecar({
            reason: "http-sidecar-stop",
          });
          logAvatarEvent(logger, "info", "http.sidecar.stop.completed", {
            stopped: result.stopped,
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

        if (normalizedPath === "/plugins/avatar/api/chat/history" && method === "POST") {
          const params = await readChatHistoryParams(req);
          logAvatarEvent(logger, "info", "http.chat.history.requested", {
            sessionKey: params.sessionKey,
            limit: params.limit ?? 30,
          });
          const result = await handlers.loadHistory(params);
          logAvatarEvent(logger, "info", "http.chat.history.completed", {
            sessionKey: params.sessionKey,
            messageCount: Array.isArray(result.messages) ? result.messages.length : 0,
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

        if (normalizedPath === "/plugins/avatar/api/chat/send" && method === "POST") {
          const params = await readChatSendParams(req);
          logAvatarEvent(logger, "info", "http.chat.send.requested", {
            sessionKey: params.sessionKey,
            messageChars: params.message.length,
            attachmentCount: params.attachments?.length ?? 0,
            ...summarizeIdempotencyKeyForLog(params.idempotencyKey),
          });
          const result = await handlers.sendMessage(params);
          logAvatarEvent(logger, "info", "http.chat.send.completed", {
            sessionKey: params.sessionKey,
            messageChars: params.message.length,
            attachmentCount: params.attachments?.length ?? 0,
            ...summarizeIdempotencyKeyForLog(params.idempotencyKey),
          });
          sendHttpResponse(
            res,
            asJsonResponse({
              success: true,
              response: result,
            }),
          );
          return true;
        }

        if (normalizedPath === "/plugins/avatar/api/transcribe" && method === "POST") {
          const params = await readRequestJson(req);
          if (typeof params.data !== "string") {
            throw new Error("invalid avatar.audio.transcribe params");
          }
          if (params.mimeType !== undefined && typeof params.mimeType !== "string") {
            throw new Error("invalid avatar.audio.transcribe params");
          }
          if (params.sessionKey !== undefined && typeof params.sessionKey !== "string") {
            throw new Error("invalid avatar.audio.transcribe params");
          }
          if (params.captureSource !== undefined && typeof params.captureSource !== "string") {
            throw new Error("invalid avatar.audio.transcribe params");
          }
          if (params.roomTrackMuted !== undefined && typeof params.roomTrackMuted !== "boolean") {
            throw new Error("invalid avatar.audio.transcribe params");
          }
          if (params.captureError !== undefined && typeof params.captureError !== "string") {
            throw new Error("invalid avatar.audio.transcribe params");
          }
          const cfg = api.runtime.config.loadConfig();
          const base64Length = params.data.length;
          logAvatarEvent(logger, "info", "http.transcribe.requested", {
            mimeType: params.mimeType ?? "application/octet-stream",
            base64Chars: base64Length,
            ...(typeof params.sessionKey === "string" && params.sessionKey.trim()
              ? { sessionKey: params.sessionKey.trim() }
              : {}),
            ...(typeof params.captureSource === "string" && params.captureSource.trim()
              ? { captureSource: params.captureSource.trim() }
              : {}),
            ...(params.roomTrackMuted === true ? { roomTrackMuted: true } : {}),
            ...(typeof params.captureError === "string" && params.captureError.trim()
              ? { captureError: params.captureError.trim() }
              : {}),
          });
          const result = await transcribeAvatarAudio({
            runtime: api.runtime,
            logger,
            cfg,
            base64Data: params.data,
            mimeType: params.mimeType,
            sessionKey: params.sessionKey,
            captureSource: params.captureSource,
            roomTrackMuted: params.roomTrackMuted,
            captureError: params.captureError,
          });
          logAvatarEvent(logger, "info", "http.transcribe.completed", {
            mimeType: params.mimeType ?? "application/octet-stream",
            base64Chars: base64Length,
            transcriptChars: result.transcript.length,
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

        if (normalizedPath === "/plugins/avatar/api/synthesize" && method === "POST") {
          const params = await readRequestJson(req);
          if (typeof params.text !== "string") {
            throw new Error("invalid avatar.audio.synthesize params");
          }
          const cfg = api.runtime.config.loadConfig();
          logAvatarEvent(logger, "info", "http.synthesize.requested", {
            textChars: params.text.length,
          });
          const result = await synthesizeAvatarAudio({
            runtime: api.runtime,
            logger,
            cfg,
            text: params.text,
          });
          logAvatarEvent(logger, "info", "http.synthesize.completed", {
            textChars: params.text.length,
            sampleRate: result.sampleRate,
            provider: result.provider ?? "runtime",
          });
          setNoStoreHeaders(res);
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
          error instanceof Error ? error.message : "Avatar plugin page request failed";
        const code = getAvatarErrorCode(error, message);
        logAvatarEvent(logger, code === "INVALID_REQUEST" ? "warn" : "error", "http.request.failed", {
          method,
          path: normalizedPath,
          code,
          error: message,
        });
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
    const normalizedPath = pathname.replace(/\/+$/, "") || "/plugins/avatar";
    try {
      if (normalizedPath.startsWith("/plugins/avatar/assets/")) {
        const assetPath = decodeURIComponent(
          normalizedPath.slice("/plugins/avatar/assets/".length),
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
      if (normalizedPath.startsWith("/plugins/avatar/styles/")) {
        const assetPath = decodeURIComponent(
          normalizedPath.slice("/plugins/avatar/styles/".length),
        );
        const css = await readStyleAsset(assetPath);
        sendHttpResponse(res, asTextResponse(css, "text/css; charset=utf-8"));
        return true;
      }
      if (normalizedPath === "/plugins/avatar") {
        const html = await readRenderedHtmlAsset("index.html");
        sendHttpResponse(
          res,
          withNoStoreHeaders(withBrowserShellHeaders(asTextResponse(html, "text/html; charset=utf-8"))),
        );
        return true;
      }
      if (normalizedPath === "/plugins/avatar/readme") {
        const html = await readRenderedReadmePage();
        sendHttpResponse(
          res,
          withNoStoreHeaders(withBrowserShellHeaders(asTextResponse(html, "text/html; charset=utf-8"))),
        );
        return true;
      }
      if (
        normalizedPath === "/plugins/avatar/settings" ||
        normalizedPath === "/plugins/avatar/config"
      ) {
        const html = await readRenderedHtmlAsset("settings.html");
        sendHttpResponse(
          res,
          withNoStoreHeaders(withBrowserShellHeaders(asTextResponse(html, "text/html; charset=utf-8"))),
        );
        return true;
      }
      if (normalizedPath === "/plugins/avatar/app.js") {
        const script = await readWebAsset("app.js");
        sendHttpResponse(
          res,
          withNoStoreHeaders(asTextResponse(script, "application/javascript; charset=utf-8")),
        );
        return true;
      }
      if (normalizedPath === "/plugins/avatar/avatar-aspect-ratio.js") {
        const script = await readFile(new URL("./avatar-aspect-ratio.js", import.meta.url), "utf8");
        sendHttpResponse(
          res,
          withNoStoreHeaders(asTextResponse(script, "application/javascript; charset=utf-8")),
        );
        return true;
      }
      sendHttpResponse(res, asTextResponse("Not Found", "text/plain; charset=utf-8", 404));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Avatar plugin page request failed";
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
    path: "/plugins/avatar",
    auth: "plugin",
    match: "exact",
    handler: uiHandler,
  });

  api.registerHttpRoute({
    path: "/plugins/avatar/config",
    auth: "plugin",
    match: "exact",
    handler: uiHandler,
  });

  api.registerHttpRoute({
    path: "/plugins/avatar/readme",
    auth: "plugin",
    match: "exact",
    handler: uiHandler,
  });

  api.registerHttpRoute({
    path: "/plugins/avatar/settings",
    auth: "plugin",
    match: "exact",
    handler: uiHandler,
  });

  api.registerHttpRoute({
    path: "/plugins/avatar/bootstrap",
    auth: "plugin",
    match: "exact",
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const pathname = parseRequestPathname(req.url);
      if (!pathname) {
        return false;
      }
      const normalizedPath = pathname.replace(/\/+$/, "") || "/plugins/avatar/bootstrap";
      if (normalizedPath !== "/plugins/avatar/bootstrap") {
        return false;
      }
      setNoStoreHeaders(res);
      try {
        const config = api.runtime.config.loadConfig();
        sendHttpResponse(res, asJsonResponse(await buildBrowserBootstrapPayload(config)));
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "failed to load Avatar browser bootstrap";
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
    path: "/plugins/avatar/app.js",
    auth: "plugin",
    match: "exact",
    handler: uiHandler,
  });

  api.registerHttpRoute({
    path: "/plugins/avatar/avatar-aspect-ratio.js",
    auth: "plugin",
    match: "exact",
    handler: uiHandler,
  });

  api.registerHttpRoute({
    path: "/plugins/avatar/assets",
    auth: "plugin",
    match: "prefix",
    handler: uiHandler,
  });

  api.registerHttpRoute({
    path: "/plugins/avatar/styles",
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
  return path.join(moduleDir, "avatar-agent-bridge.mjs");
}

function resolveSidecarRunnerWrapperPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(moduleDir, "avatar-agent-runner-wrapper.mjs");
}

function buildSidecarInstanceArg(gateway: SidecarGatewayRuntime): string {
  return `${AVATAR_SIDECAR_INSTANCE_ARG_PREFIX}gateway-port-${gateway.port}`;
}

function buildSidecarAgentName(params: {
  gateway: SidecarGatewayRuntime;
  generation: number;
}): string {
  return `${AVATAR_AGENT_NAME}-${params.gateway.port}-${params.generation}-${randomUUID().slice(0, 8)}`;
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
  return path.join(moduleDir, "avatar-agent-runner.js");
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
      pushCandidate(path.join(current, "avatar-agent-runner.js"));
      pushCandidate(path.join(current, "dist", "avatar-agent-runner.js"));
      pushCandidate(path.join(current, "openclaw", "dist", "avatar-agent-runner.js"));
      pushCandidate(path.join(current, "node_modules", "openclaw", "dist", "avatar-agent-runner.js"));
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  };

  const envRunnerPath = normalizeOptionalString(process.env.OPENCLAW_AVATAR_AGENT_RUNNER);
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
      args: [entryScript, "gateway", "avatar-agent"],
      description: `node ${entryScript} gateway avatar-agent`,
    };
  }
  return null;
}

async function createAvatarSession(params: {
  config: OpenClawConfig;
  sessionKey: string;
  avatarImageUrl?: string;
  avatarTimeoutSeconds?: number;
  aspectRatio?: string;
  interruptReplyOnNewMessage?: boolean;
  agentName?: string;
  nowMs?: number;
}): Promise<AvatarSessionResult> {
  const effectiveConfig = resolveEffectiveAvatarConfig(params.config);
  const status = buildAvatarConfigResponse(params.config);
  if (!status.configured) {
    throw new Error(`Avatar is not configured: missing ${status.missing.join(", ")}`);
  }

  const livekit = effectiveConfig.avatar?.livekit;
  const avatarImageUrl = normalizeOptionalString(params.avatarImageUrl);
  const avatarTimeoutSeconds = normalizeAvatarTimeoutSeconds(params.avatarTimeoutSeconds);
  const aspectRatio = normalizeAvatarAspectRatio(params.aspectRatio);
  const livekitUrl = normalizeOptionalString(livekit?.url);
  const apiKey = normalizeResolvedSecretInputString({
    value: livekit?.apiKey,
    path: "avatar.livekit.apiKey",
  });
  const apiSecret = normalizeResolvedSecretInputString({
    value: livekit?.apiSecret,
    path: "avatar.livekit.apiSecret",
  });
  if (!avatarImageUrl) {
    throw new Error(
      "invalid avatar.session.create params: avatarImageUrl is required",
    );
  }
  if (!livekitUrl || !apiKey || !apiSecret) {
    throw new Error("Avatar session creation is unavailable: missing LiveKit credentials");
  }
  const imageUrlValidationError = await validateAvatarImageUrl(avatarImageUrl);
  if (imageUrlValidationError) {
    throw new Error(`invalid avatar.session.create params: ${imageUrlValidationError}`);
  }

  const roomName = `${AVATAR_ROOM_PREFIX}-${sanitizeAvatarRoomPart(params.sessionKey)}-${randomUUID().slice(0, 8)}`;
  const chatSessionKey = resolveAvatarChatSessionKey({
    requestedSessionKey: params.sessionKey,
    config: effectiveConfig,
  });
  const interruptReplyOnNewMessage = normalizeInterruptReplyOnNewMessage(
    params.interruptReplyOnNewMessage,
  );
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
    agentName: normalizeOptionalString(params.agentName) ?? AVATAR_AGENT_NAME,
    avatarImageUrl,
    avatarTimeoutSeconds,
    aspectRatio,
    interruptReplyOnNewMessage,
  };
}

async function stopAvatarSession(params: {
  roomName: string;
}): Promise<AvatarSessionStopResult> {
  const roomName = validateAvatarRoomName(params.roomName);
  return {
    stopped: true,
    roomName,
  };
}

function resolveAvatarAgentCredentials(config: OpenClawConfig): SidecarCredentials | null {
  const effective = resolveEffectiveAvatarConfig(config);
  if (effective.avatar?.provider !== "lemonslice") {
    return null;
  }

  const lemonSliceApiKey = normalizeResolvedSecretInputString({
    value: effective.avatar?.lemonSlice?.apiKey,
    path: "avatar.lemonSlice.apiKey",
  });
  const livekitUrl = normalizeOptionalString(effective.avatar?.livekit?.url);
  const livekitApiKey = normalizeResolvedSecretInputString({
    value: effective.avatar?.livekit?.apiKey,
    path: "avatar.livekit.apiKey",
  });
  const livekitApiSecret = normalizeResolvedSecretInputString({
    value: effective.avatar?.livekit?.apiSecret,
    path: "avatar.livekit.apiSecret",
  });
  if (
    !lemonSliceApiKey ||
    !livekitUrl ||
    !livekitApiKey ||
    !livekitApiSecret
  ) {
    return null;
  }

  return {
    lemonSliceApiKey,
    livekitUrl,
    livekitApiKey,
    livekitApiSecret,
  };
}

function resolveAvatarLiveKitCredentials(config: OpenClawConfig): {
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
} | null {
  const credentials = resolveAvatarAgentCredentials(config);
  if (!credentials) {
    return null;
  }
  return {
    livekitUrl: credentials.livekitUrl,
    livekitApiKey: credentials.livekitApiKey,
    livekitApiSecret: credentials.livekitApiSecret,
  };
}

function resolveAvatarConfigFingerprint(config: OpenClawConfig): string | null {
  const credentials = resolveAvatarLiveKitCredentials(config);
  if (!credentials) {
    return null;
  }
  return JSON.stringify(credentials);
}

function isSameConfigFingerprint(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return (left ?? null) === (right ?? null);
}

function isNotFoundAvatarDispatchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const status =
    typeof (error as { status?: unknown })?.status === "number"
      ? Number((error as { status: number }).status)
      : typeof (error as { statusCode?: unknown })?.statusCode === "number"
        ? Number((error as { statusCode: number }).statusCode)
        : null;
  const rawCode = (error as { code?: unknown })?.code;
  const code =
    typeof rawCode === "string"
      ? rawCode.toLowerCase()
      : typeof rawCode === "number"
        ? String(rawCode)
        : "";
  const normalizedMessage = message.toLowerCase();
  return (
    status === 404 ||
    code === "404" ||
    code === "not_found" ||
    normalizedMessage.includes("not found") ||
    normalizedMessage.includes("404")
  );
}

function shouldRunAvatarRuntimeObservation(): boolean {
  if (process.env.OPENCLAW_AVATAR_DISABLE_SESSION_OBSERVER === "1") {
    return false;
  }
  return !(
    process.env.NODE_ENV === "test" ||
    typeof process.env.VITEST === "string" ||
    typeof process.env.VITEST_POOL_ID === "string" ||
    typeof process.env.VITEST_WORKER_ID === "string" ||
    process.argv.some((value) => value.includes("vitest"))
  );
}

function sleepWithUnref(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, delayMs);
    timer.unref?.();
  });
}

async function createAvatarRoom(params: {
  config: OpenClawConfig;
  roomName: string;
  logger: AvatarLogger;
}): Promise<void> {
  const credentials = resolveAvatarLiveKitCredentials(params.config);
  if (!credentials) {
    throw new Error("Avatar room creation is unavailable: missing LiveKit credentials");
  }
  logAvatarEvent(params.logger, "info", "livekit.room.create.begin", {
    roomName: params.roomName,
  });
  try {
    const { RoomServiceClient } = await import("livekit-server-sdk");
    const client = new RoomServiceClient(
      credentials.livekitUrl,
      credentials.livekitApiKey,
      credentials.livekitApiSecret,
    );
    await client.createRoom({
      name: params.roomName,
    });
    logAvatarEvent(params.logger, "info", "livekit.room.create.succeeded", {
      roomName: params.roomName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logAvatarEvent(params.logger, "error", "livekit.room.create.failed", {
      roomName: params.roomName,
      error: message,
    });
    throw new Error(`Avatar room creation failed: ${message}`);
  }
}

async function deleteAvatarRoom(params: {
  config: OpenClawConfig;
  roomName: string;
  logger: AvatarLogger;
}): Promise<void> {
  const credentials = resolveAvatarLiveKitCredentials(params.config);
  if (!credentials) {
    logAvatarEvent(params.logger, "warn", "livekit.room.delete.skipped", {
      roomName: params.roomName,
      reason: "missing-livekit-credentials",
    });
    return;
  }
  logAvatarEvent(params.logger, "info", "livekit.room.delete.begin", {
    roomName: params.roomName,
  });
  try {
    const { RoomServiceClient } = await import("livekit-server-sdk");
    const client = new RoomServiceClient(
      credentials.livekitUrl,
      credentials.livekitApiKey,
      credentials.livekitApiSecret,
    );
    await client.deleteRoom(params.roomName);
    logAvatarEvent(params.logger, "info", "livekit.room.delete.succeeded", {
      roomName: params.roomName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      typeof (error as { status?: unknown })?.status === "number"
        ? Number((error as { status: number }).status)
        : typeof (error as { statusCode?: unknown })?.statusCode === "number"
          ? Number((error as { statusCode: number }).statusCode)
          : null;
    const code =
      typeof (error as { code?: unknown })?.code === "string"
        ? (error as { code: string }).code.toLowerCase()
        : "";
    if (status === 404 || code === "not_found" || message.toLowerCase().includes("not found")) {
      logAvatarEvent(params.logger, "info", "livekit.room.delete.skipped", {
        roomName: params.roomName,
        reason: "not-found",
        error: message,
      });
      return;
    }
    throw error;
  }
}

async function observeAvatarSessionState(params: {
  config: OpenClawConfig;
  roomName: string;
  participantIdentity: string;
  dispatchId: string;
  logger: AvatarLogger;
  isActive?: () => boolean;
  maxAttempts?: number;
  delayMs?: number;
}): Promise<void> {
  if (!shouldRunAvatarRuntimeObservation()) {
    return;
  }
  const credentials = resolveAvatarLiveKitCredentials(params.config);
  if (!credentials) {
    return;
  }
  const maxAttempts = Number.isFinite(params.maxAttempts) ? Math.max(1, params.maxAttempts ?? 0) : 12;
  const delayMs = Number.isFinite(params.delayMs) ? Math.max(100, params.delayMs ?? 0) : 1_000;
  try {
    const { AgentDispatchClient, RoomServiceClient } = await import("livekit-server-sdk");
    const dispatchClient = new AgentDispatchClient(
      credentials.livekitUrl,
      credentials.livekitApiKey,
      credentials.livekitApiSecret,
    );
    const roomClient = new RoomServiceClient(
      credentials.livekitUrl,
      credentials.livekitApiKey,
      credentials.livekitApiSecret,
    );

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (params.isActive && !params.isActive()) {
        return;
      }

      const [roomsResult, participantsResult, dispatchResult] = await Promise.allSettled([
        roomClient.listRooms([params.roomName]),
        roomClient.listParticipants(params.roomName),
        dispatchClient.getDispatch(params.dispatchId, params.roomName),
      ]);

      const rooms = roomsResult.status === "fulfilled" ? roomsResult.value : [];
      const participants = participantsResult.status === "fulfilled" ? participantsResult.value : [];
      const dispatch = dispatchResult.status === "fulfilled" ? dispatchResult.value : undefined;
      const participantIdentities = participants
        .map((participant) => (typeof participant?.identity === "string" ? participant.identity : ""))
        .filter(Boolean);
      const browserParticipantJoined = participantIdentities.includes(params.participantIdentity);
      const dispatchJobs = Array.isArray(dispatch?.state?.jobs) ? dispatch.state.jobs : [];
      const dispatchJobIds = dispatchJobs
        .map((job) => (typeof job?.id === "string" ? job.id : ""))
        .filter(Boolean);
      const dispatchJobStatuses = dispatchJobs.map((job) => ({
        id: typeof job?.id === "string" ? job.id : "",
        status: typeof job?.state?.status === "number" ? job.state.status : undefined,
        error: typeof job?.state?.error === "string" && job.state.error.trim() ? job.state.error : undefined,
        startedAt:
          typeof job?.state?.startedAt === "bigint" ? job.state.startedAt.toString() : undefined,
        endedAt: typeof job?.state?.endedAt === "bigint" ? job.state.endedAt.toString() : undefined,
      }));
      const dispatchJobStatusSummary = dispatchJobStatuses.reduce<Record<string, number>>((summary, job) => {
        const statusKey = job.status === undefined ? "unknown" : String(job.status);
        summary[statusKey] = (summary[statusKey] ?? 0) + 1;
        return summary;
      }, {});
      const deletedAt =
        typeof dispatch?.state?.deletedAt === "bigint" ? dispatch.state.deletedAt.toString() : undefined;

      logAvatarEvent(params.logger, "info", "livekit.session.observe", {
        attempt,
        roomName: params.roomName,
        roomExists: rooms.some((room) => room?.name === params.roomName),
        participantCount: participantIdentities.length,
        browserParticipantJoined,
        dispatchId: params.dispatchId,
        dispatchExists: Boolean(dispatch),
        dispatchJobCount: dispatchJobIds.length,
        dispatchJobStatusSummary:
          Object.keys(dispatchJobStatusSummary).length > 0 ? dispatchJobStatusSummary : undefined,
        dispatchDeletedAt: deletedAt,
        roomError:
          roomsResult.status === "rejected"
            ? roomsResult.reason instanceof Error
              ? roomsResult.reason.message
              : String(roomsResult.reason)
            : undefined,
        participantError:
          participantsResult.status === "rejected"
            ? participantsResult.reason instanceof Error
              ? participantsResult.reason.message
              : String(participantsResult.reason)
            : undefined,
        dispatchError:
          dispatchResult.status === "rejected"
            ? dispatchResult.reason instanceof Error
              ? dispatchResult.reason.message
              : String(dispatchResult.reason)
            : undefined,
      });
      logAvatarEvent(params.logger, "debug", "livekit.session.observe.detail", {
        attempt,
        roomName: params.roomName,
        dispatchId: params.dispatchId,
        participantIdentities,
        browserParticipantIdentity: params.participantIdentity,
        dispatchJobIds,
        dispatchJobStatuses,
      });

      if (browserParticipantJoined && dispatchJobIds.length > 0) {
        logAvatarEvent(params.logger, "info", "livekit.session.observe.ready", {
          roomName: params.roomName,
          participantIdentity: params.participantIdentity,
          dispatchId: params.dispatchId,
          dispatchJobIds,
          attempts: attempt,
        });
        return;
      }

      if (attempt < maxAttempts) {
        await sleepWithUnref(delayMs);
      }
    }

    logAvatarEvent(params.logger, "warn", "livekit.session.observe.timeout", {
      roomName: params.roomName,
      participantIdentity: params.participantIdentity,
      dispatchId: params.dispatchId,
      attempts: maxAttempts,
    });
  } catch (error) {
    logAvatarEvent(params.logger, "warn", "livekit.session.observe.failed", {
      roomName: params.roomName,
      participantIdentity: params.participantIdentity,
      dispatchId: params.dispatchId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function createAvatarAgentDispatch(params: {
  config: OpenClawConfig;
  session: AvatarSessionResult;
  logger: AvatarLogger;
}): Promise<AvatarAgentDispatchResult> {
  const credentials = resolveAvatarLiveKitCredentials(params.config);
  if (!credentials) {
    throw new Error("Avatar agent dispatch is unavailable: missing LiveKit credentials");
  }
  if (!params.session.avatarImageUrl) {
    throw new Error("Avatar agent dispatch is unavailable: missing avatar image URL");
  }
  const metadata = buildAvatarDispatchMetadata({
    sessionKey: params.session.chatSessionKey,
    imageUrl: params.session.avatarImageUrl,
    avatarTimeoutSeconds: params.session.avatarTimeoutSeconds,
    aspectRatio: params.session.aspectRatio,
    interruptReplyOnNewMessage: params.session.interruptReplyOnNewMessage,
  });
  logAvatarEvent(params.logger, "info", "agent-dispatch.create.begin", {
    roomName: params.session.roomName,
    agentName: params.session.agentName,
    chatSessionKey: params.session.chatSessionKey,
  });
  try {
    const { AgentDispatchClient } = await import("livekit-server-sdk");
    const client = new AgentDispatchClient(
      credentials.livekitUrl,
      credentials.livekitApiKey,
      credentials.livekitApiSecret,
    );
    const dispatch = await client.createDispatch(params.session.roomName, params.session.agentName, {
      metadata,
    });
    logAvatarEvent(params.logger, "info", "agent-dispatch.create.succeeded", {
      roomName: params.session.roomName,
      agentName: params.session.agentName,
      dispatchId: dispatch.id,
    });
    return {
      id: dispatch.id,
      room: dispatch.room,
      agentName: dispatch.agentName,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logAvatarEvent(params.logger, "error", "agent-dispatch.create.failed", {
      roomName: params.session.roomName,
      agentName: params.session.agentName,
      chatSessionKey: params.session.chatSessionKey,
      error: message,
    });
    throw new Error(`Avatar agent dispatch failed: ${message}`);
  }
}

async function deleteAvatarAgentDispatch(params: {
  config: OpenClawConfig;
  roomName: string;
  dispatchId: string;
  logger: AvatarLogger;
}): Promise<void> {
  const credentials = resolveAvatarLiveKitCredentials(params.config);
  if (!credentials) {
    logAvatarEvent(params.logger, "warn", "agent-dispatch.delete.skipped", {
      roomName: params.roomName,
      dispatchId: params.dispatchId,
      reason: "missing-livekit-credentials",
    });
    return;
  }
  logAvatarEvent(params.logger, "info", "agent-dispatch.delete.begin", {
    roomName: params.roomName,
    dispatchId: params.dispatchId,
  });
  try {
    const { AgentDispatchClient } = await import("livekit-server-sdk");
    const client = new AgentDispatchClient(
      credentials.livekitUrl,
      credentials.livekitApiKey,
      credentials.livekitApiSecret,
    );
    await client.deleteDispatch(params.dispatchId, params.roomName);
    logAvatarEvent(params.logger, "info", "agent-dispatch.delete.succeeded", {
      roomName: params.roomName,
      dispatchId: params.dispatchId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isNotFoundAvatarDispatchError(error)) {
      logAvatarEvent(params.logger, "info", "agent-dispatch.delete.skipped", {
        roomName: params.roomName,
        dispatchId: params.dispatchId,
        reason: "already-deleted",
        error: message,
      });
      return;
    }
    logAvatarEvent(params.logger, "warn", "agent-dispatch.delete.failed", {
      roomName: params.roomName,
      dispatchId: params.dispatchId,
      error: message,
    });
    throw error;
  }
}

function attachLineLogger(
  stream: NodeJS.ReadableStream | null | undefined,
  logger: (message: string) => void,
  onLine?: (message: string) => void,
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
        onLine?.(line);
        logger(line);
      }
    }
  });
  stream.on("end", () => {
    const tail = buffered.trim();
    if (tail) {
      onLine?.(tail);
      logger(tail);
    }
  });
}

function buildWorkerEnv(params: {
  gateway: SidecarGatewayRuntime;
  credentials: SidecarCredentials;
  agentName: string;
}): NodeJS.ProcessEnv {
  const instanceArg = buildSidecarInstanceArg(params.gateway);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LIVEKIT_URL: params.credentials.livekitUrl,
    LIVEKIT_API_KEY: params.credentials.livekitApiKey,
    LIVEKIT_API_SECRET: params.credentials.livekitApiSecret,
    OPENCLAW_AVATAR_GATEWAY_URL: `ws://127.0.0.1:${params.gateway.port}`,
    OPENCLAW_AVATAR_LEMONSLICE_API_KEY: params.credentials.lemonSliceApiKey,
    OPENCLAW_AVATAR_INSTANCE_ARG: instanceArg,
    [AVATAR_SIDECAR_AGENT_NAME_ENV]: params.agentName,
  };

  if (params.gateway.auth.mode === "token" && params.gateway.auth.token) {
    env.OPENCLAW_AVATAR_GATEWAY_TOKEN = params.gateway.auth.token;
  }
  if (params.gateway.auth.mode === "password" && params.gateway.auth.password) {
    env.OPENCLAW_AVATAR_GATEWAY_PASSWORD = params.gateway.auth.password;
  }
  return env;
}

async function startAvatarAgentSidecar(params: {
  config: OpenClawConfig;
  gateway: SidecarGatewayRuntime;
  log: SidecarLogger;
  agentName: string;
  onWorkerLine?: (message: string) => void;
}): Promise<AvatarAgentSidecar | null> {
  if (params.gateway.auth.mode === "trusted-proxy" || params.gateway.auth.mode === "none") {
    params.log.warn(
      `Avatar agent sidecar disabled: gateway auth mode=${params.gateway.auth.mode} is not supported for the local worker bridge`,
    );
    return null;
  }

  const credentials = resolveAvatarAgentCredentials(params.config);
  if (!credentials) {
    params.log.info(
      "Avatar agent sidecar disabled: missing LiveKit or LemonSlice credentials",
    );
    return null;
  }
  const configFingerprint = resolveAvatarConfigFingerprint(params.config);

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
      "Avatar agent sidecar disabled: unable to resolve worker entrypoint (set OPENCLAW_AVATAR_AGENT_RUNNER to override)",
    );
    return null;
  }
  params.log.info(
    `Avatar agent sidecar launch command: ${launchCommand.description} agentName=${params.agentName}`,
  );

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
        `[avatar] cleaned up stale sidecar processes before launch: ${stalePids.join(", ")}`,
      );
    }
  } catch (error) {
    params.log.warn(
      `[avatar] failed to clean up stale sidecar processes before launch: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  let child: ChildProcess | null = null;
  let childProcessGroupId: number | null = null;
  let respawnTimer: ReturnType<typeof setTimeout> | null = null;
  let resetJobsPromise: Promise<void> | null = null;
  let stopping = false;
  const recentExits: number[] = [];
  let unsupportedLegacyCommand = false;
  let activeLaunchCommand = launchCommand;
  const hasRunningChild = () => Boolean(child && child.exitCode === null && child.signalCode === null);
  let readyPromise: Promise<void> = Promise.resolve();
  let resolveReady: (() => void) | null = null;
  let rejectReady: ((error: Error) => void) | null = null;
  let readyTimer: ReturnType<typeof setTimeout> | null = null;
  let childReady = false;

  const clearReadyTimer = () => {
    if (!readyTimer) {
      return;
    }
    clearTimeout(readyTimer);
    readyTimer = null;
  };

  const settleReady = (error?: Error) => {
    clearReadyTimer();
    const reject = rejectReady;
    const resolve = resolveReady;
    rejectReady = null;
    resolveReady = null;
    if (error) {
      reject?.(error);
      return;
    }
    childReady = true;
    resolve?.();
  };

  const beginReadyWait = () => {
    childReady = false;
    readyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    void readyPromise.catch(() => {});
    readyTimer = setTimeout(() => {
      settleReady(
        new Error(
          `Avatar agent sidecar did not register with LiveKit within ${AVATAR_SIDECAR_READY_TIMEOUT_MS}ms`,
        ),
      );
    }, AVATAR_SIDECAR_READY_TIMEOUT_MS);
    readyTimer.unref();
  };

  const observeWorkerLine = (message: string) => {
    params.onWorkerLine?.(message);
    if (childReady) {
      return;
    }
    if (
      message.includes(AVATAR_SIDECAR_READY_LOG_FRAGMENT) ||
      message.includes("registered worker")
    ) {
      settleReady();
    }
  };

  const spawnChild = () => {
    if (stopping || hasRunningChild()) {
      return;
    }
    beginReadyWait();
    unsupportedLegacyCommand = false;
    const next = spawn(activeLaunchCommand.executable, activeLaunchCommand.args, {
      env: buildWorkerEnv({
        gateway: params.gateway,
        credentials,
        agentName: params.agentName,
      }),
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    child = next;
    childProcessGroupId =
      typeof next.pid === "number" && Number.isInteger(next.pid) && next.pid > 0 ? next.pid : null;
    params.log.info(
      `[avatar] spawned sidecar process pid=${childProcessGroupId ?? "unknown"} agentName=${params.agentName} command=${activeLaunchCommand.description}`,
    );
    attachLineLogger(
      next.stdout,
      (message) => params.log.info(normalizeAvatarLogPrefix(message)),
      observeWorkerLine,
    );
    attachLineLogger(next.stderr, (message) => {
      observeWorkerLine(message);
      if (
        activeLaunchCommand.args[1] === "gateway" &&
        message.includes("too many arguments for 'gateway'")
      ) {
        unsupportedLegacyCommand = true;
      }
      params.log.warn(normalizeAvatarLogPrefix(message));
    });
    next.once("exit", (code, signal) => {
      child = null;
      childProcessGroupId = null;
      if (!childReady) {
        settleReady(
          new Error(
            `Avatar agent sidecar exited before registration${code !== null ? ` code=${code}` : ""}${signal ? ` signal=${signal}` : ""}`,
          ),
        );
      }
      if (stopping) {
        return;
      }
      if (unsupportedLegacyCommand) {
        const fallbackCommand = activeLaunchCommand.fallback;
        if (!fallbackCommand) {
          params.log.error(
            "Avatar agent sidecar launch command is unsupported by this OpenClaw CLI build; set OPENCLAW_AVATAR_AGENT_RUNNER to a avatar-agent-runner.js path",
          );
          return;
        }
        params.log.warn(
          `Avatar agent sidecar launch command is unsupported by this OpenClaw CLI build; falling back to ${fallbackCommand.description}`,
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
          `Avatar agent sidecar exited repeatedly${code !== null ? ` code=${code}` : ""}${signal ? ` signal=${signal}` : ""}; giving up until the gateway restarts`,
        );
        return;
      }
      params.log.warn(
        `Avatar agent sidecar exited${code !== null ? ` code=${code}` : ""}${signal ? ` signal=${signal}` : ""}; restarting`,
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
    agentName: params.agentName,
    configFingerprint,
    isRunning: () => hasRunningChild(),
    waitForReady: async () => {
      await readyPromise;
    },
    waitForIdle: async () => {
      if (resetJobsPromise) {
        await resetJobsPromise;
      }
    },
    resetJobs: async () => {
      if (stopping) {
        return;
      }
      if (resetJobsPromise) {
        await resetJobsPromise;
        return;
      }
      const nextResetPromise = (async () => {
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
        // Give the worker a brief window to advertise itself idle again before the next dispatch.
        await sleep(AVATAR_SIDECAR_RESET_SETTLE_MS);
      })();
      resetJobsPromise = nextResetPromise;
      try {
        await nextResetPromise;
      } finally {
        if (resetJobsPromise === nextResetPromise) {
          resetJobsPromise = null;
        }
      }
    },
    stop: async () => {
      stopping = true;
      if (respawnTimer) {
        clearTimeout(respawnTimer);
        respawnTimer = null;
      }
      settleReady(new Error("Avatar agent sidecar stopped"));
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

const avatarPlugin = definePluginEntry({
  id: AVATAR_PLUGIN_ID,
  name: "Avatar",
  description: "Avatar gateway methods and sidecar worker",
  register(api: OpenClawPluginApi) {
    let sidecar: AvatarAgentSidecar | null = null;
    let sidecarStartupPromise: Promise<AvatarAgentSidecar | null> | null = null;
    let sidecarGeneration = 0;
    let sidecarAgentName: string | null = null;
    let sidecarAgentNameGeneration = -1;
    let lastGateway: GatewayRuntime | null = null;
    const agentDispatchIdsByRoom = new Map<string, string>();
    const sessionObservationIdsByRoom = new Map<string, string>();
    const sessionRuntimeStatusByRoom = new Map<string, AvatarSessionRuntimeStatus>();
    const roomConfigByName = new Map<string, OpenClawConfig>();
    const sessionByRoom = new Map<string, AvatarSessionResult>();
    const gatewayLogger = createAvatarGatewayLogger(api.logger, () => api.runtime.config.loadConfig());

    const updateSessionRuntimeStatus = (
      roomName: string,
      patch: Partial<AvatarSessionRuntimeStatus>,
    ): AvatarSessionRuntimeStatus => {
      const now = Date.now();
      const current = sessionRuntimeStatusByRoom.get(roomName) ?? {
        roomName,
        createdAt: now,
        updatedAt: now,
      };
      const next = {
        ...current,
        ...patch,
        roomName,
        updatedAt: now,
      };
      sessionRuntimeStatusByRoom.set(roomName, next);
      return next;
    };

    const clearSessionRuntimeStatus = (roomName: string): void => {
      sessionRuntimeStatusByRoom.delete(roomName);
    };

    const rememberManagedRoom = (session: AvatarSessionResult, config: OpenClawConfig): void => {
      sessionByRoom.set(session.roomName, { ...session });
      roomConfigByName.set(session.roomName, cloneConfigSnapshot(config));
    };

    const getManagedRoomConfig = (roomName: string): OpenClawConfig =>
      roomConfigByName.get(roomName) ?? api.runtime.config.loadConfig();

    const clearManagedRoom = (roomName: string): void => {
      agentDispatchIdsByRoom.delete(roomName);
      sessionObservationIdsByRoom.delete(roomName);
      clearSessionRuntimeStatus(roomName);
      sessionByRoom.delete(roomName);
      roomConfigByName.delete(roomName);
    };

    const startManagedRoomObservation = (params: {
      session: AvatarSessionResult;
      config: OpenClawConfig;
      dispatchId: string;
    }): void => {
      const sessionObservationId = randomUUID();
      const observedRoomName = params.session.roomName;
      sessionObservationIdsByRoom.set(observedRoomName, sessionObservationId);
      void observeAvatarSessionState({
        config: params.config,
        roomName: observedRoomName,
        participantIdentity: params.session.participantIdentity,
        dispatchId: params.dispatchId,
        logger: gatewayLogger,
        isActive: () => sessionObservationIdsByRoom.get(observedRoomName) === sessionObservationId,
      });
    };

    const assignManagedRoomDispatch = async (params: {
      session: AvatarSessionResult;
      config: OpenClawConfig;
      commit?: boolean;
    }): Promise<AvatarAgentDispatchResult> => {
      const dispatch = await createAvatarAgentDispatch({
        config: params.config,
        session: params.session,
        logger: gatewayLogger,
      });
      if (params.commit === false) {
        return dispatch;
      }
      sessionByRoom.set(params.session.roomName, { ...params.session });
      agentDispatchIdsByRoom.set(params.session.roomName, dispatch.id);
      startManagedRoomObservation({
        session: params.session,
        config: params.config,
        dispatchId: dispatch.id,
      });
      return dispatch;
    };

    const commitManagedRoomDispatch = (params: {
      session: AvatarSessionResult;
      config: OpenClawConfig;
      dispatch: AvatarAgentDispatchResult;
    }): void => {
      sessionByRoom.set(params.session.roomName, { ...params.session });
      agentDispatchIdsByRoom.set(params.session.roomName, params.dispatch.id);
      startManagedRoomObservation({
        session: params.session,
        config: params.config,
        dispatchId: params.dispatch.id,
      });
    };

    const collectRoomsForRedispatch = (): Array<{
      roomName: string;
      session: AvatarSessionResult;
      config: OpenClawConfig;
      dispatchId?: string;
    }> => {
      const roomNames = new Set<string>([
        ...sessionByRoom.keys(),
        ...roomConfigByName.keys(),
        ...agentDispatchIdsByRoom.keys(),
        ...sessionRuntimeStatusByRoom.keys(),
      ]);
      const rooms: Array<{
        roomName: string;
        session: AvatarSessionResult;
        config: OpenClawConfig;
        dispatchId?: string;
      }> = [];
      for (const roomName of roomNames) {
        const session = sessionByRoom.get(roomName);
        const config = roomConfigByName.get(roomName);
        if (!session || !config) {
          continue;
        }
        rooms.push({
          roomName,
          session: { ...session },
          config,
          dispatchId: agentDispatchIdsByRoom.get(roomName),
        });
      }
      return rooms;
    };

    const observeWorkerRuntimeLine = (message: string): void => {
      const childEventMatch = message.match(
        /^\[(?:avatar|avatar-agent)\/job pid=\d+\]\s+([A-Za-z0-9._-]+)(?:\s+(.*))?$/,
      );
      if (childEventMatch && !childEventMatch[1]?.includes("[")) {
        const [, eventName, rawFields = ""] = childEventMatch;
        const fields = parseAvatarDebugFields(rawFields);
        const roomName = normalizeOptionalString(fields.roomName);
        if (!roomName) {
          return;
        }
        switch (eventName) {
          case "agent-session.start.connected":
            updateSessionRuntimeStatus(roomName, {
              agentSessionConnectedAt: Date.now(),
              agentSessionOutputAudioSink: normalizeOptionalString(fields.outputAudioSink),
            });
            logAvatarEvent(gatewayLogger, "info", "session.progress.agent.connected", {
              roomName,
              sessionKey: normalizeOptionalString(fields.sessionKey),
              outputAudioSink: normalizeOptionalString(fields.outputAudioSink),
            });
            return;
          case "avatar.start.begin":
            updateSessionRuntimeStatus(roomName, {
              avatarStartBeginAt: Date.now(),
            });
            logAvatarEvent(gatewayLogger, "info", "session.progress.avatar.starting", {
              roomName,
              sessionKey: normalizeOptionalString(fields.sessionKey),
            });
            return;
          case "avatar.start.connected":
            updateSessionRuntimeStatus(roomName, {
              avatarStartConnectedAt: Date.now(),
              avatarOutputAudioSink: normalizeOptionalString(fields.outputAudioSink),
              avatarParticipantIdentity: normalizeOptionalString(fields.avatarParticipantIdentity),
            });
            logAvatarEvent(gatewayLogger, "info", "session.progress.avatar.connected", {
              roomName,
              sessionKey: normalizeOptionalString(fields.sessionKey),
              outputAudioSink: normalizeOptionalString(fields.outputAudioSink),
              avatarParticipantIdentity: normalizeOptionalString(fields.avatarParticipantIdentity),
            });
            return;
          case "gateway-chat-event.received":
            if (fields.state === "final") {
              updateSessionRuntimeStatus(roomName, {
                gatewayChatFinalAt: Date.now(),
              });
              logAvatarEvent(gatewayLogger, "info", "gateway.chat.final.received", {
                roomName,
                sessionKey: normalizeOptionalString(fields.sessionKey),
                runId: normalizeOptionalString(fields.runId),
                state: normalizeOptionalString(fields.state),
              });
            }
            return;
          case "speech.begin":
            updateSessionRuntimeStatus(roomName, {
              speechBeginAt: Date.now(),
              avatarOutputAudioSink:
                normalizeOptionalString(fields.outputAudioSink) ??
                sessionRuntimeStatusByRoom.get(roomName)?.avatarOutputAudioSink,
            });
            logAvatarEvent(gatewayLogger, "info", "speech.playback.begin", {
              roomName,
              sessionKey: normalizeOptionalString(fields.sessionKey),
              runId: normalizeOptionalString(fields.runId),
              textLength: typeof fields.textLength === "number" ? fields.textLength : undefined,
              interruptible:
                typeof fields.interruptible === "boolean" ? fields.interruptible : undefined,
              outputAudioSink:
                normalizeOptionalString(fields.outputAudioSink) ??
                sessionRuntimeStatusByRoom.get(roomName)?.avatarOutputAudioSink,
            });
            return;
          case "speech.finished":
            updateSessionRuntimeStatus(roomName, {
              speechFinishedAt: Date.now(),
              avatarOutputAudioSink:
                normalizeOptionalString(fields.outputAudioSink) ??
                sessionRuntimeStatusByRoom.get(roomName)?.avatarOutputAudioSink,
            });
            logAvatarEvent(gatewayLogger, "info", "speech.playback.finished", {
              roomName,
              sessionKey: normalizeOptionalString(fields.sessionKey),
              runId: normalizeOptionalString(fields.runId),
              interrupted:
                typeof fields.interrupted === "boolean" ? fields.interrupted : undefined,
              outputAudioSink:
                normalizeOptionalString(fields.outputAudioSink) ??
                sessionRuntimeStatusByRoom.get(roomName)?.avatarOutputAudioSink,
            });
            return;
          case "speech.failed":
            updateSessionRuntimeStatus(roomName, {
              speechFailedAt: Date.now(),
              speechError: normalizeOptionalString(fields.error),
              avatarOutputAudioSink:
                normalizeOptionalString(fields.outputAudioSink) ??
                sessionRuntimeStatusByRoom.get(roomName)?.avatarOutputAudioSink,
            });
            logAvatarEvent(gatewayLogger, "warn", "speech.playback.failed", {
              roomName,
              sessionKey: normalizeOptionalString(fields.sessionKey),
              runId: normalizeOptionalString(fields.runId),
              error: normalizeOptionalString(fields.error),
              outputAudioSink:
                normalizeOptionalString(fields.outputAudioSink) ??
                sessionRuntimeStatusByRoom.get(roomName)?.avatarOutputAudioSink,
            });
            return;
          default:
            return;
        }
      }

      const requestAcceptedMatch = message.match(
        /^\[(?:avatar|avatar-agent)\]\s+request func accepted job\s+jobId=([^\s]+)\s+roomName=([^\s]+)\s+/,
      );
      if (requestAcceptedMatch) {
        const [, jobId, roomName] = requestAcceptedMatch;
        updateSessionRuntimeStatus(roomName, {
          jobId,
          jobAcceptedAt: Date.now(),
        });
        logAvatarEvent(gatewayLogger, "info", "session.progress.job.accepted", {
          roomName,
          jobId,
        });
      }
    };

    const isCurrentSidecarGeneration = (generation: number): boolean =>
      generation === sidecarGeneration;

    const nextSidecarGeneration = (): number => {
      sidecarGeneration += 1;
      return sidecarGeneration;
    };

    const resolveSidecarAgentName = (
      gateway: SidecarGatewayRuntime,
      generation: number,
    ): string => {
      if (!sidecarAgentName || sidecarAgentNameGeneration !== generation) {
        sidecarAgentName = buildSidecarAgentName({ gateway, generation });
        sidecarAgentNameGeneration = generation;
      }
      return sidecarAgentName;
    };

    const clearSidecarAgentName = (): void => {
      sidecarAgentName = null;
      sidecarAgentNameGeneration = -1;
    };

    const isGatewayRuntime = (gateway: SidecarGatewayRuntime): gateway is GatewayRuntime =>
      gateway.auth.mode !== "none";

    const ensureSidecarRunning = async (
      config: OpenClawConfig,
      gateway?: SidecarGatewayRuntime,
    ): Promise<string | null> => {
      if (gateway && isGatewayRuntime(gateway)) {
        lastGateway = gateway;
      }
      const attemptGeneration = sidecarGeneration;
      const runtimeGateway = gateway ?? lastGateway ?? resolveGatewayRuntimeFromConfig(config);
      if (!runtimeGateway) {
        gatewayLogger.warn(
          "Avatar agent sidecar disabled: gateway runtime details are unavailable",
        );
        return null;
      }
      const currentAgentName = resolveSidecarAgentName(runtimeGateway, attemptGeneration);
      const requestedFingerprint = resolveAvatarConfigFingerprint(config);

      const stopSidecarForFingerprintMismatch = async (
        activeSidecar: AvatarAgentSidecar,
        source: "cached" | "starting" | "started",
      ): Promise<void> => {
        logAvatarEvent(gatewayLogger, "warn", "sidecar.recycle.config-mismatch", {
          generation: attemptGeneration,
          source,
          agentName: activeSidecar.agentName,
          activeFingerprint: activeSidecar.configFingerprint,
          requestedFingerprint,
        });
        await activeSidecar.stop().catch(() => {});
        if (sidecar === activeSidecar) {
          sidecar = null;
        }
      };

      const getOrStartSidecar = async (): Promise<AvatarAgentSidecar | null> => {
        if (!isCurrentSidecarGeneration(attemptGeneration)) {
          return null;
        }
        if (sidecar) {
          if (!isSameConfigFingerprint(sidecar.configFingerprint, requestedFingerprint)) {
            const staleSidecar = sidecar;
            await stopSidecarForFingerprintMismatch(staleSidecar, "cached");
            if (!isCurrentSidecarGeneration(attemptGeneration)) {
              return null;
            }
          } else {
            return sidecar;
          }
        }
        if (sidecar) {
          return sidecar;
        }
        if (sidecarStartupPromise) {
          const startingSidecar = await sidecarStartupPromise;
          if (!isCurrentSidecarGeneration(attemptGeneration)) {
            return null;
          }
          if (
            startingSidecar &&
            !isSameConfigFingerprint(startingSidecar.configFingerprint, requestedFingerprint)
          ) {
            await stopSidecarForFingerprintMismatch(startingSidecar, "starting");
            return null;
          }
          sidecar = sidecar ?? startingSidecar;
          return sidecar;
        }
        const startupPromise = startAvatarAgentSidecar({
          config,
          gateway: runtimeGateway,
          log: gatewayLogger,
          agentName: currentAgentName,
          onWorkerLine: observeWorkerRuntimeLine,
        });
        sidecarStartupPromise = startupPromise;
        try {
          const startedSidecar = await startupPromise;
          if (!isCurrentSidecarGeneration(attemptGeneration)) {
            await startedSidecar?.stop().catch(() => {});
            return null;
          }
          if (
            startedSidecar &&
            !isSameConfigFingerprint(startedSidecar.configFingerprint, requestedFingerprint)
          ) {
            await stopSidecarForFingerprintMismatch(startedSidecar, "started");
            return null;
          }
          sidecar = startedSidecar;
          return sidecar;
        } finally {
          if (sidecarStartupPromise === startupPromise) {
            sidecarStartupPromise = null;
          }
        }
      };

      for (let attempt = 1; attempt <= AVATAR_SIDECAR_START_MAX_ATTEMPTS; attempt += 1) {
        if (!isCurrentSidecarGeneration(attemptGeneration)) {
          return null;
        }
        logAvatarEvent(gatewayLogger, "info", "sidecar.ensure.attempt", {
          attempt,
          generation: attemptGeneration,
          agentName: currentAgentName,
          gatewayPort: runtimeGateway.port,
          gatewayAuthMode: runtimeGateway.auth.mode,
          requestedFingerprint,
          hasExistingSidecar: Boolean(sidecar),
          startupInFlight: Boolean(sidecarStartupPromise),
        });

        const staleSidecar = sidecar;
        if (staleSidecar && !staleSidecar.isRunning()) {
          gatewayLogger.warn("[avatar] detected stale sidecar state; restarting worker");
          await staleSidecar.stop().catch(() => {});
          if (!isCurrentSidecarGeneration(attemptGeneration)) {
            return null;
          }
          if (sidecar === staleSidecar) {
            sidecar = null;
          }
        }

        const activeSidecar = await getOrStartSidecar();
        if (!isCurrentSidecarGeneration(attemptGeneration) || !activeSidecar) {
          continue;
        }

        try {
          await activeSidecar.waitForReady();
          if (!isCurrentSidecarGeneration(attemptGeneration) || sidecar !== activeSidecar) {
            return null;
          }
          await activeSidecar.waitForIdle();
          if (!isCurrentSidecarGeneration(attemptGeneration) || sidecar !== activeSidecar) {
            return null;
          }
          logAvatarEvent(gatewayLogger, "info", "sidecar.ready", {
            attempt,
            generation: attemptGeneration,
            agentName: activeSidecar.agentName,
            gatewayPort: runtimeGateway.port,
            configFingerprint: activeSidecar.configFingerprint,
          });
          return activeSidecar.agentName;
        } catch (error) {
          if (!isCurrentSidecarGeneration(attemptGeneration)) {
            return null;
          }
          const message = error instanceof Error ? error.message : String(error);
          gatewayLogger.warn(
            `[avatar] startup attempt ${attempt}/${AVATAR_SIDECAR_START_MAX_ATTEMPTS} failed: ${message}`,
          );
          await activeSidecar.stop().catch(() => {});
          if (!isCurrentSidecarGeneration(attemptGeneration)) {
            return null;
          }
          if (sidecar === activeSidecar) {
            sidecar = null;
          }
          if (attempt === AVATAR_SIDECAR_START_MAX_ATTEMPTS) {
            throw new Error(
              `Avatar agent sidecar failed to become ready after ${AVATAR_SIDECAR_START_MAX_ATTEMPTS} attempts: ${message}`,
            );
          }
        }
      }
      return null;
    };

    const resetSidecarJobs = async (reason = "unspecified"): Promise<void> => {
      if (!sidecar) {
        logAvatarEvent(gatewayLogger, "info", "sidecar.jobs.reset.skipped", {
          reason,
          activeSidecar: false,
        });
        return;
      }
      logAvatarEvent(gatewayLogger, "info", "sidecar.jobs.reset.begin", {
        reason,
      });
      try {
        await sidecar.resetJobs();
        logAvatarEvent(gatewayLogger, "info", "sidecar.jobs.reset.completed", {
          reason,
        });
      } catch (error) {
        logAvatarEvent(gatewayLogger, "warn", "sidecar.jobs.reset.failed", {
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const stopManagedSidecar = async (params?: {
      reason?: string;
      clearRoomTracking?: boolean;
    }): Promise<{ stopped: boolean }> => {
      const reason = params?.reason ?? "unspecified";
      const clearRoomTracking = params?.clearRoomTracking === true;
      logAvatarEvent(gatewayLogger, "info", "sidecar.stop.requested", {
        reason,
        agentName: sidecarAgentName,
        activeSidecar: Boolean(sidecar),
        startupInFlight: Boolean(sidecarStartupPromise),
      });
      const stopGeneration = nextSidecarGeneration();
      clearSidecarAgentName();
      const startupPromise = sidecarStartupPromise;
      let activeSidecar = sidecar;
      if (!activeSidecar && startupPromise) {
        activeSidecar = await startupPromise.catch(() => null);
      }
      if (!activeSidecar) {
        if (sidecarStartupPromise === startupPromise) {
          sidecarStartupPromise = null;
        }
        if (isCurrentSidecarGeneration(stopGeneration)) {
          sidecar = null;
        }
        if (clearRoomTracking) {
          agentDispatchIdsByRoom.clear();
          sessionObservationIdsByRoom.clear();
          sessionRuntimeStatusByRoom.clear();
          sessionByRoom.clear();
          roomConfigByName.clear();
        }
        logAvatarEvent(gatewayLogger, "info", "sidecar.stop.completed", {
          reason,
          agentName: null,
          stopped: false,
        });
        return { stopped: false };
      }
      await activeSidecar.stop().catch(() => {});
      if (sidecar === activeSidecar) {
        sidecar = null;
      }
      if (sidecarStartupPromise === startupPromise) {
        sidecarStartupPromise = null;
      }
      if (clearRoomTracking) {
        agentDispatchIdsByRoom.clear();
        sessionObservationIdsByRoom.clear();
        sessionRuntimeStatusByRoom.clear();
        sessionByRoom.clear();
        roomConfigByName.clear();
      }
      logAvatarEvent(gatewayLogger, "info", "sidecar.stop.completed", {
        reason,
        agentName: null,
        stopped: true,
      });
      return { stopped: true };
    };

    const restartManagedSidecar = async (params: {
      config: OpenClawConfig;
      gateway?: GatewayRuntime;
      reason?: string;
    }): Promise<{ restarted: boolean }> => {
      logAvatarEvent(gatewayLogger, "info", "sidecar.restart.requested", {
        reason: params.reason ?? "unspecified",
        agentName: sidecarAgentName,
        gatewayPort: params.gateway?.port ?? lastGateway?.port,
        gatewayAuthMode:
          params.gateway?.auth.mode ??
          lastGateway?.auth.mode ??
          resolveGatewayRuntimeFromConfig(params.config)?.auth.mode ??
          "unknown",
      });
      const roomsToRedispatch = collectRoomsForRedispatch();
      await stopManagedSidecar({ reason: `restart:${params.reason ?? "unspecified"}` });
      const runtimeGateway =
        params.gateway ?? lastGateway ?? resolveGatewayRuntimeFromConfig(params.config) ?? undefined;
      const readyAgentName = await ensureSidecarRunning(params.config, runtimeGateway);
      if (!readyAgentName) {
        logAvatarEvent(gatewayLogger, "warn", "sidecar.restart.redispatch.skipped", {
          reason: params.reason ?? "unspecified",
          gatewayPort: runtimeGateway?.port,
          gatewayAuthMode: runtimeGateway?.auth.mode ?? "unknown",
          roomCount: roomsToRedispatch.length,
        });
        logAvatarEvent(gatewayLogger, "info", "sidecar.restart.completed", {
          reason: params.reason ?? "unspecified",
          restarted: false,
          agentName: null,
          gatewayPort: runtimeGateway?.port,
          redispatchedRoomCount: 0,
        });
        return { restarted: false };
      }
      const activeSidecar = sidecar;
      const activeFingerprint = activeSidecar?.configFingerprint ?? null;
      const requestedFingerprint = resolveAvatarConfigFingerprint(params.config);
      let redispatchedRoomCount = 0;
      for (const room of roomsToRedispatch) {
        const roomFingerprint = resolveAvatarConfigFingerprint(room.config);
        if (
          !isSameConfigFingerprint(roomFingerprint, activeFingerprint) ||
          !isSameConfigFingerprint(roomFingerprint, requestedFingerprint)
        ) {
          logAvatarEvent(gatewayLogger, "warn", "sidecar.restart.redispatch.skipped", {
            roomName: room.roomName,
            priorDispatchId: room.dispatchId,
            reason: "config-fingerprint-mismatch",
            roomFingerprint,
            requestedFingerprint,
            activeFingerprint,
            agentName: readyAgentName,
          });
          continue;
        }
        const nextSession = {
          ...room.session,
          agentName: readyAgentName,
        };
        try {
          const oldDispatchId = room.dispatchId;
          const nextDispatch = await assignManagedRoomDispatch({
            session: nextSession,
            config: room.config,
            commit: false,
          });
          try {
            if (oldDispatchId && oldDispatchId !== nextDispatch.id) {
              await deleteAvatarAgentDispatch({
                config: room.config,
                roomName: room.roomName,
                dispatchId: oldDispatchId,
                logger: gatewayLogger,
              });
            }
          } catch (error) {
            if (nextDispatch.id !== oldDispatchId) {
              await deleteAvatarAgentDispatch({
                config: room.config,
                roomName: room.roomName,
                dispatchId: nextDispatch.id,
                logger: gatewayLogger,
              }).catch((cleanupError) => {
                logAvatarEvent(gatewayLogger, "warn", "sidecar.restart.redispatch.rollback.failed", {
                  roomName: room.roomName,
                  dispatchId: nextDispatch.id,
                  priorDispatchId: oldDispatchId,
                  error:
                    cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
                });
              });
            }
            throw error;
          }
          commitManagedRoomDispatch({
            session: nextSession,
            config: room.config,
            dispatch: nextDispatch,
          });
          redispatchedRoomCount += 1;
          logAvatarEvent(gatewayLogger, "info", "sidecar.restart.redispatch.succeeded", {
            roomName: room.roomName,
            priorDispatchId: oldDispatchId,
            dispatchId: nextDispatch.id,
            agentName: nextSession.agentName,
          });
        } catch (error) {
          logAvatarEvent(gatewayLogger, "warn", "sidecar.restart.redispatch.failed", {
            roomName: room.roomName,
            priorDispatchId: room.dispatchId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      logAvatarEvent(gatewayLogger, "info", "sidecar.restart.completed", {
        reason: params.reason ?? "unspecified",
        restarted: Boolean(sidecar),
        agentName: readyAgentName,
        gatewayPort: runtimeGateway?.port,
        redispatchedRoomCount,
      });
      return { restarted: Boolean(sidecar) };
    };

    const createManagedSession = async (params: {
      config: OpenClawConfig;
      sessionKey: string;
      avatarImageUrl?: string;
      avatarTimeoutSeconds?: number;
      aspectRatio?: string;
      interruptReplyOnNewMessage?: boolean;
    }): Promise<AvatarSessionResult> => {
      const interruptReplyOnNewMessage = normalizeInterruptReplyOnNewMessage(
        params.interruptReplyOnNewMessage,
      );
      const avatarTimeoutSeconds = normalizeAvatarTimeoutSeconds(params.avatarTimeoutSeconds);
      const aspectRatio = normalizeAvatarAspectRatio(params.aspectRatio);
      logAvatarEvent(gatewayLogger, "info", "session.create.begin", {
        sessionKey: params.sessionKey,
        avatarImageUrlProvided: Boolean(normalizeOptionalString(params.avatarImageUrl)),
        avatarTimeoutSeconds,
        aspectRatio,
        interruptReplyOnNewMessage,
      });
      let session: AvatarSessionResult | null = null;
      try {
        const readyAgentName = await ensureSidecarRunning(params.config);
        if (!readyAgentName) {
          throw new Error("Avatar agent sidecar did not start.");
        }
        session = await createAvatarSession({
          ...params,
          agentName: readyAgentName,
        });
        const roomConfigSnapshot = cloneConfigSnapshot(params.config);
        rememberManagedRoom(session, roomConfigSnapshot);
        updateSessionRuntimeStatus(session.roomName, {
          createdAt: Date.now(),
        });
        await createAvatarRoom({
          config: roomConfigSnapshot,
          roomName: session.roomName,
          logger: gatewayLogger,
        });
        const dispatch = await assignManagedRoomDispatch({
          session,
          config: roomConfigSnapshot,
        });
        logAvatarEvent(gatewayLogger, "info", "session.create.succeeded", {
          sessionKey: session.sessionKey,
          chatSessionKey: session.chatSessionKey,
          roomName: session.roomName,
          participantIdentity: session.participantIdentity,
          agentName: session.agentName,
          dispatchId: dispatch.id,
          avatarTimeoutSeconds: session.avatarTimeoutSeconds,
          aspectRatio: session.aspectRatio,
          interruptReplyOnNewMessage: session.interruptReplyOnNewMessage,
        });
        return session;
      } catch (error) {
        if (session?.roomName) {
          const roomConfig = getManagedRoomConfig(session.roomName);
          await deleteAvatarRoom({
            config: roomConfig,
            roomName: session.roomName,
            logger: gatewayLogger,
          });
          clearManagedRoom(session.roomName);
        }
        logAvatarEvent(gatewayLogger, "error", "session.create.failed", {
          sessionKey: params.sessionKey,
          avatarImageUrlProvided: Boolean(normalizeOptionalString(params.avatarImageUrl)),
          avatarTimeoutSeconds,
          aspectRatio,
          interruptReplyOnNewMessage,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    };

    const stopManagedSession = async (params: {
      roomName: string;
    }): Promise<AvatarSessionStopResult> => {
      logAvatarEvent(gatewayLogger, "info", "session.stop.begin", {
        roomName: params.roomName,
      });
      if (!roomConfigByName.has(params.roomName) || !sessionObservationIdsByRoom.has(params.roomName)) {
        const message = `Avatar session stop refused for unmanaged room ${params.roomName}`;
        logAvatarEvent(gatewayLogger, "warn", "session.stop.skipped", {
          roomName: params.roomName,
          reason: "unmanaged-room",
        });
        throw new Error(message);
      }
      const roomConfig = getManagedRoomConfig(params.roomName);
      const dispatchId = agentDispatchIdsByRoom.get(params.roomName);
      const result = await stopAvatarSession({ roomName: params.roomName });
      if (dispatchId) {
        await deleteAvatarAgentDispatch({
          config: roomConfig,
          roomName: params.roomName,
          dispatchId,
          logger: gatewayLogger,
        });
      }
      await resetSidecarJobs(`session-stop:${params.roomName}`);
      await deleteAvatarRoom({
        config: roomConfig,
        roomName: params.roomName,
        logger: gatewayLogger,
      });
      clearManagedRoom(params.roomName);
      logAvatarEvent(gatewayLogger, "info", "session.stop.completed", {
        roomName: result.roomName,
      });
      return result;
    };

    const loadManagedChatHistory = async (params: {
      sessionKey: string;
      limit?: number;
    }): Promise<AvatarChatHistoryResult> => {
      logAvatarEvent(gatewayLogger, "info", "chat.history.requested", {
        sessionKey: params.sessionKey,
        limit: params.limit ?? 30,
      });
      const subagentRuntime = getAvatarSubagentRuntime(api);
      const result = await subagentRuntime.getSessionMessages({
        sessionKey: params.sessionKey,
        limit: params.limit ?? 30,
      });
      const messages = Array.isArray(result.messages) ? result.messages : [];
      logAvatarEvent(gatewayLogger, "info", "chat.history.succeeded", {
        sessionKey: params.sessionKey,
        messageCount: messages.length,
      });
      return {
        messages,
      };
    };

    const sendManagedChatMessage = async (params: {
      sessionKey: string;
      message: string;
      attachments?: AvatarChatAttachmentInput[];
      idempotencyKey?: string;
    }): Promise<AvatarChatSendResult> => {
      logAvatarEvent(gatewayLogger, "info", "chat.send.begin", {
        sessionKey: params.sessionKey,
        messageChars: params.message.length,
        attachmentCount: params.attachments?.length ?? 0,
        ...summarizeIdempotencyKeyForLog(params.idempotencyKey),
      });
      const subagentRuntime = getAvatarSubagentRuntime(api);
      // The gateway agent schema accepts attachments even though the current runtime typings
      // only expose the text-centric subset.
      const runParams: AvatarSubagentRunParams = {
        sessionKey: params.sessionKey,
        message: params.message,
        deliver: false,
        ...(params.attachments && params.attachments.length > 0
          ? { attachments: params.attachments }
          : {}),
        ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
      };
      try {
        const result = await subagentRuntime.run(runParams);
        logAvatarEvent(gatewayLogger, "info", "chat.send.succeeded", {
          sessionKey: params.sessionKey,
          messageChars: params.message.length,
          attachmentCount: params.attachments?.length ?? 0,
          ...summarizeIdempotencyKeyForLog(params.idempotencyKey),
        });
        return result;
      } catch (error) {
        logAvatarEvent(gatewayLogger, "error", "chat.send.failed", {
          sessionKey: params.sessionKey,
          messageChars: params.message.length,
          attachmentCount: params.attachments?.length ?? 0,
          ...summarizeIdempotencyKeyForLog(params.idempotencyKey),
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    };

    registerAvatarSetupCli(api);
    registerAvatarHttpRoutes(api, {
      createSession: createManagedSession,
      stopSession: stopManagedSession,
      loadSessionStatus: ({ roomName }) => sessionRuntimeStatusByRoom.get(roomName) ?? null,
      restartSidecar: async ({ config, reason }) => restartManagedSidecar({ config, reason }),
      stopSidecar: async (params) => stopManagedSidecar(params),
      loadHistory: loadManagedChatHistory,
      sendMessage: sendManagedChatMessage,
    }, gatewayLogger);

    api.registerGatewayMethod(
      "avatar.config",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          if (!assertMethodParams(params, "avatar.config", respond)) {
            return;
          }
          const cfg = api.runtime.config.loadConfig();
          respond(true, { config: buildAvatarConfigResponse(cfg, api.runtime) });
        } catch (error) {
          respondGatewayError(
            respond,
            "UNAVAILABLE",
            error instanceof Error ? error.message : "failed to load Avatar config",
          );
        }
      },
    );

    api.registerGatewayMethod(
      "avatar.setup.get",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          if (!assertMethodParams(params, "avatar.setup.get", respond)) {
            return;
          }
          const cfg = api.runtime.config.loadConfig();
          respond(true, { setup: buildAvatarConfigResponse(cfg, api.runtime) });
        } catch (error) {
          respondGatewayError(
            respond,
            "UNAVAILABLE",
            error instanceof Error ? error.message : "failed to load Avatar setup",
          );
        }
      },
    );

    api.registerGatewayMethod(
      "avatar.setup.save",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          if (!assertMethodParams(params, "avatar.setup.save", respond)) {
            return;
          }
          const setupInput = parseAvatarSetupInput(params, "avatar.setup.save");
          const currentConfig = api.runtime.config.loadConfig();
          const nextConfig = applyAvatarSetupToConfig(currentConfig, setupInput);
          if (shouldVerifyAvatarSetupConfig(currentConfig, nextConfig)) {
            await verifyAvatarSetupConfig({
              logger: gatewayLogger,
              runtime: api.runtime,
              config: nextConfig,
            });
          }
          await writeConfigFile(api, nextConfig);
          respond(true, { setup: buildAvatarConfigResponse(nextConfig, api.runtime) });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "failed to save Avatar setup";
          respondGatewayError(respond, getAvatarErrorCode(error, message), message);
        }
      },
    );

    api.registerGatewayMethod(
      "avatar.session.create",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          if (!assertMethodParams(params, "avatar.session.create", respond)) {
            return;
          }
          if (params.sessionKey !== undefined && typeof params.sessionKey !== "string") {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid avatar.session.create params",
            );
            return;
          }
          if (params.avatarImageUrl !== undefined && typeof params.avatarImageUrl !== "string") {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid avatar.session.create params",
            );
            return;
          }
          if (
            params.avatarTimeoutSeconds !== undefined &&
            (typeof params.avatarTimeoutSeconds !== "number" ||
              !Number.isFinite(params.avatarTimeoutSeconds))
          ) {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid avatar.session.create params",
            );
            return;
          }
          if (params.aspectRatio !== undefined && typeof params.aspectRatio !== "string") {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid avatar.session.create params",
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
              "invalid avatar.session.create params",
            );
            return;
          }
          const cfg = api.runtime.config.loadConfig();
          const sessionKey =
            (typeof params.sessionKey === "string" && params.sessionKey.trim()) ||
            cfg.session?.mainKey ||
            "main";
          const interruptReplyOnNewMessage = normalizeInterruptReplyOnNewMessage(
            params.interruptReplyOnNewMessage,
          );
          const avatarImageUrl =
            typeof params.avatarImageUrl === "string" ? params.avatarImageUrl.trim() : undefined;
          const avatarTimeoutSeconds =
            typeof params.avatarTimeoutSeconds === "number"
              ? normalizeAvatarTimeoutSeconds(params.avatarTimeoutSeconds)
              : undefined;
          const aspectRatio =
            typeof params.aspectRatio === "string"
              ? normalizeAvatarAspectRatio(params.aspectRatio)
              : undefined;

          const payload = await createManagedSession({
            config: cfg,
            sessionKey,
            avatarImageUrl,
            avatarTimeoutSeconds,
            aspectRatio,
            interruptReplyOnNewMessage,
          });
          respond(true, payload);
        } catch (error) {
          respondGatewayError(
            respond,
            "INVALID_REQUEST",
            error instanceof Error ? error.message : "Avatar session creation failed",
          );
        }
      },
    );

    api.registerGatewayMethod(
      "avatar.session.stop",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          if (!assertMethodParams(params, "avatar.session.stop", respond)) {
            return;
          }
          if (typeof params.roomName !== "string") {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid avatar.session.stop params",
            );
            return;
          }
          const result = await stopManagedSession({
            roomName: params.roomName,
          });
          respond(true, result);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Avatar session stop failed";
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
      "avatar.sidecar.restart",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          if (!assertMethodParams(params, "avatar.sidecar.restart", respond)) {
            return;
          }
          const cfg = api.runtime.config.loadConfig();
          respond(
            true,
            await restartManagedSidecar({ config: cfg, reason: "gateway-method-sidecar-restart" }),
          );
        } catch (error) {
          respondGatewayError(
            respond,
            "UNAVAILABLE",
            error instanceof Error ? error.message : "Avatar sidecar restart failed",
          );
        }
      },
    );

    api.registerGatewayMethod(
      "avatar.sidecar.stop",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          if (!assertMethodParams(params, "avatar.sidecar.stop", respond)) {
            return;
          }
          respond(true, await stopManagedSidecar({ reason: "gateway-method-sidecar-stop" }));
        } catch (error) {
          respondGatewayError(
            respond,
            "UNAVAILABLE",
            error instanceof Error ? error.message : "Avatar sidecar stop failed",
          );
        }
      },
    );

    api.registerGatewayMethod(
      "avatar.audio.transcribe",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          if (!assertMethodParams(params, "avatar.audio.transcribe", respond)) {
            return;
          }
          if (typeof params.data !== "string") {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid avatar.audio.transcribe params",
            );
            return;
          }
          if (params.mimeType !== undefined && typeof params.mimeType !== "string") {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid avatar.audio.transcribe params",
            );
            return;
          }
          if (params.sessionKey !== undefined && typeof params.sessionKey !== "string") {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid avatar.audio.transcribe params",
            );
            return;
          }
          if (params.captureSource !== undefined && typeof params.captureSource !== "string") {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid avatar.audio.transcribe params",
            );
            return;
          }
          if (params.roomTrackMuted !== undefined && typeof params.roomTrackMuted !== "boolean") {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid avatar.audio.transcribe params",
            );
            return;
          }
          if (params.captureError !== undefined && typeof params.captureError !== "string") {
            respondGatewayError(
              respond,
              "INVALID_REQUEST",
              "invalid avatar.audio.transcribe params",
            );
            return;
          }
          const cfg = api.runtime.config.loadConfig();
          const result = await transcribeAvatarAudio({
            runtime: api.runtime,
            logger: gatewayLogger,
            cfg,
            base64Data: params.data,
            mimeType: params.mimeType,
            sessionKey: params.sessionKey,
            captureSource: params.captureSource,
            roomTrackMuted: params.roomTrackMuted,
            captureError: params.captureError,
          });
          respond(true, result);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Avatar transcription failed";
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
      "avatar.chat.history",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          if (!assertMethodParams(params, "avatar.chat.history", respond)) {
            return;
          }
          const result = await loadManagedChatHistory(parseChatHistoryParams(params));
          respond(true, result);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Avatar chat history failed";
          respondGatewayError(
            respond,
            message === INVALID_CHAT_HISTORY_PARAMS_ERROR ? "INVALID_REQUEST" : "UNAVAILABLE",
            message,
          );
        }
      },
    );

    api.registerGatewayMethod(
      "avatar.chat.send",
      async ({ params, respond }: GatewayRequestHandlerOptions) => {
        try {
          if (!assertMethodParams(params, "avatar.chat.send", respond)) {
            return;
          }
          const result = await sendManagedChatMessage(parseChatSendParams(params));
          respond(true, result);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Avatar chat send failed";
          respondGatewayError(
            respond,
            message === INVALID_CHAT_SEND_PARAMS_ERROR ? "INVALID_REQUEST" : "UNAVAILABLE",
            message,
          );
        }
      },
    );

    api.registerService({
      id: "avatar-agent",
      start: async (ctx) => {
        logAvatarEvent(gatewayLogger, "info", "service.start", {
          serviceId: "avatar-agent",
          gatewayPort: ctx.gateway?.port,
          gatewayAuthMode: ctx.gateway?.auth.mode ?? "unknown",
        });
        await ensureSidecarRunning(ctx.config, ctx.gateway);
      },
      stop: async () => {
        logAvatarEvent(gatewayLogger, "info", "service.stop", {
          serviceId: "avatar-agent",
        });
        await stopManagedSidecar({ reason: "service-stop", clearRoomTracking: true });
      },
    });
  },
});

export default avatarPlugin;
