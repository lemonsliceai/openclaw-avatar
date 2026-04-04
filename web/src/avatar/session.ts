/**
 * Avatar session lifecycle — create, stop, config parsing, auto-recovery.
 *
 * Extracted from `web/app.js` session-related functions.
 * UI side-effects (button updates, status display) are delegated via callbacks.
 */

import type { AvatarAspectRatio } from "../constants.js";
import {
  AVATAR_ASPECT_RATIO_DEFAULT,
  AVATAR_PLUGIN_BASE_PATH,
  DEFAULT_SESSION_IMAGE_URL,
  SESSION_AVATAR_ASPECT_RATIOS,
  SESSION_AVATAR_TIMEOUT_DEFAULT_SECONDS,
  SESSION_AVATAR_TIMEOUT_MAX_SECONDS,
  SESSION_AVATAR_TIMEOUT_MIN_SECONDS,
} from "../constants.js";
import { getAuthHeaders } from "../gateway/auth.js";
import { state } from "../state.js";
import { normalizeOptionalInputValue } from "../utils.js";

// ---------------------------------------------------------------------------
// Callbacks — wired by orchestrator
// ---------------------------------------------------------------------------

export interface SessionCallbacks {
  onOutput: (detail: Record<string, unknown>) => void;
  onSessionStopped: () => void;
}

let callbacks: SessionCallbacks = {
  onOutput: () => {},
  onSessionStopped: () => {},
};

export function setSessionCallbacks(cb: Partial<SessionCallbacks>): void {
  callbacks = { ...callbacks, ...cb };
}

// ---------------------------------------------------------------------------
// Session config helpers
// ---------------------------------------------------------------------------

export function resolveSessionAspectRatioValue(rawValue: unknown): AvatarAspectRatio {
  const normalized = typeof rawValue === "string" ? rawValue.trim() : "";
  if (SESSION_AVATAR_ASPECT_RATIOS.has(normalized as AvatarAspectRatio)) {
    return normalized as AvatarAspectRatio;
  }
  return AVATAR_ASPECT_RATIO_DEFAULT;
}

export function parseAspectRatioValueToNumber(rawValue: unknown): number | null {
  const [widthRaw, heightRaw] = (typeof rawValue === "string" ? rawValue : "").split("x");
  const width = Number(widthRaw);
  const height = Number(heightRaw);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return width / height;
}

export function parseSessionAspectRatioNumber(rawValue: unknown): number | null {
  const aspectRatio = parseAspectRatioValueToNumber(resolveSessionAspectRatioValue(rawValue));
  return aspectRatio;
}

export function parseSessionAvatarTimeoutSeconds(rawValue: unknown): number {
  if (rawValue === null || rawValue === undefined) {
    return SESSION_AVATAR_TIMEOUT_DEFAULT_SECONDS;
  }
  if (typeof rawValue === "string" && !rawValue.trim()) {
    return SESSION_AVATAR_TIMEOUT_DEFAULT_SECONDS;
  }
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return SESSION_AVATAR_TIMEOUT_DEFAULT_SECONDS;
  }
  const rounded = Math.floor(parsed);
  return Math.min(
    SESSION_AVATAR_TIMEOUT_MAX_SECONDS,
    Math.max(SESSION_AVATAR_TIMEOUT_MIN_SECONDS, rounded),
  );
}

export function resolveSessionAvatarJoinTimeoutMs(rawValue: unknown): number {
  return parseSessionAvatarTimeoutSeconds(rawValue) * 1000;
}

export function resolveSessionImageUrlValue(rawValue: unknown): string {
  return normalizeOptionalInputValue(rawValue);
}

export function isAllowedSessionImageUrlProtocol(protocol: string): boolean {
  return protocol === "https:" || protocol === "http:" || protocol === "data:";
}

export function assertValidSessionImageUrl(imageUrl: unknown): string {
  const normalizedImageUrl = resolveSessionImageUrlValue(imageUrl);
  if (!normalizedImageUrl) {
    throw new Error("Avatar image URL is required.");
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedImageUrl);
  } catch {
    throw new Error("Invalid avatar image URL or unsupported protocol.");
  }
  if (!isAllowedSessionImageUrlProtocol(parsedUrl.protocol)) {
    throw new Error("Invalid avatar image URL or unsupported protocol.");
  }
  if (
    parsedUrl.protocol === "data:" &&
    !/^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(normalizedImageUrl)
  ) {
    throw new Error("Invalid avatar image URL or unsupported protocol.");
  }
  return normalizedImageUrl;
}

export function buildSessionCreatePayload(
  sessionKey: string,
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  const avatarImageUrl = assertValidSessionImageUrl(options.avatarImageUrl);
  return {
    sessionKey,
    avatarImageUrl,
    aspectRatio: resolveSessionAspectRatioValue(options.aspectRatio),
    avatarTimeoutSeconds: parseSessionAvatarTimeoutSeconds(options.avatarTimeoutSeconds),
    interruptReplyOnNewMessage: true,
  };
}

// ---------------------------------------------------------------------------
// Aspect ratio application
// ---------------------------------------------------------------------------

export function getPreferredSessionAspectRatio(): AvatarAspectRatio {
  return state.session.aspectRatio;
}

export function applyPreferredAvatarAspectRatio(shellEl: HTMLElement | null): void {
  if (!shellEl) return;
  const [widthRaw, heightRaw] = getPreferredSessionAspectRatio().split("x");
  shellEl.style.setProperty("--avatar-aspect-ratio", `${widthRaw} / ${heightRaw}`);
}

export function hydrateSessionAspectSettings(
  payload: Record<string, unknown>,
  priorAspectRatio: unknown,
  priorAvatarJoinTimeoutMs: number,
  shellEl: HTMLElement | null,
): void {
  const session = (payload?.session ?? {}) as Record<string, unknown>;
  state.session.aspectRatio = resolveSessionAspectRatioValue(
    session?.aspectRatio ?? priorAspectRatio,
  );
  state.session.avatarJoinTimeoutMs = priorAvatarJoinTimeoutMs;
  applyPreferredAvatarAspectRatio(shellEl);
}

// ---------------------------------------------------------------------------
// Session image URL sync from setup status
// ---------------------------------------------------------------------------

export function syncSessionInputsFromSetupStatus(
  setup: Record<string, unknown>,
  sessionImageUrlInput: HTMLInputElement | null,
  storedImageUrl: string,
): void {
  const normalizedStoredImageUrl = storedImageUrl?.trim();
  const hasStoredCustomImageUrl =
    Boolean(normalizedStoredImageUrl) && normalizedStoredImageUrl !== DEFAULT_SESSION_IMAGE_URL;
  const currentImageUrl = resolveSessionImageUrlValue(sessionImageUrlInput?.value);
  const lemonSlice = (setup?.lemonSlice ?? {}) as Record<string, unknown>;
  const setupImageUrl = resolveSessionImageUrlValue(lemonSlice?.imageUrl);
  if (
    sessionImageUrlInput &&
    typeof sessionImageUrlInput.value === "string" &&
    !hasStoredCustomImageUrl &&
    (!currentImageUrl || currentImageUrl === DEFAULT_SESSION_IMAGE_URL) &&
    setupImageUrl
  ) {
    sessionImageUrlInput.value = setupImageUrl;
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

export async function requestJson(
  path: string,
  options: RequestInit & { headers?: Record<string, string> } = {},
): Promise<Record<string, unknown>> {
  const hasBody = options.body !== undefined && options.body !== null;
  const response = await fetch(path, {
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload: Record<string, unknown> = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    if (response.status === 401) {
      const error = new Error("Unauthorized: enter a valid gateway token or password.") as Error & {
        code?: string;
        status?: number;
      };
      error.code = "GATEWAY_UNAUTHORIZED";
      error.status = response.status;
      throw error;
    }
    const errorObj = (payload?.error ?? {}) as Record<string, unknown>;
    const details = (errorObj?.details ?? {}) as Record<string, unknown>;
    const message = (errorObj?.message as string) || `Request failed (${response.status})`;
    const error = new Error(message) as Error & {
      code?: unknown;
      field?: unknown;
      type?: unknown;
      status?: number;
    };
    error.code = errorObj?.code;
    error.field = errorObj?.field ?? details?.field;
    error.type = errorObj?.type ?? details?.type;
    error.status = response.status;
    throw error;
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Stop session
// ---------------------------------------------------------------------------

export async function stopActiveSession(
  disconnectRoom: () => void,
  stopAvatarSidecar: () => Promise<void>,
): Promise<void> {
  const session = state.session.active as Record<string, unknown> | null;
  const sessionKey = session?.sessionKey as string | undefined;
  if (sessionKey) {
    state.session.autoHelloSentSessionKeys.delete(sessionKey);
    state.session.autoHelloPendingSessionKeys.delete(sessionKey);
  }
  disconnectRoom();
  state.session.active = null;
  state.session.imageUrl = "";
  state.session.aspectRatio = AVATAR_ASPECT_RATIO_DEFAULT;
  state.session.avatarJoinTimeoutMs = SESSION_AVATAR_TIMEOUT_DEFAULT_SECONDS * 1000;

  callbacks.onSessionStopped();

  const roomName = session?.roomName as string | undefined;
  let sessionOutput: Record<string, unknown>;
  if (!roomName) {
    sessionOutput = { action: "session-stopped" };
  } else {
    try {
      await requestJson(`${AVATAR_PLUGIN_BASE_PATH}/api/session/stop`, {
        method: "POST",
        body: JSON.stringify({ roomName }),
      });
      sessionOutput = { action: "session-stopped", roomName };
    } catch (error) {
      sessionOutput = {
        action: "session-stop-failed",
        roomName,
        error: String(error),
      };
    }
  }

  callbacks.onOutput(sessionOutput);

  try {
    await stopAvatarSidecar();
    callbacks.onOutput({
      ...sessionOutput,
      sidecar: { stopped: true },
    });
  } catch (error) {
    callbacks.onOutput({
      ...sessionOutput,
      sidecar: { stopped: false, error: String(error) },
    });
  }
}

// ---------------------------------------------------------------------------
// Chat session key resolution
// ---------------------------------------------------------------------------

export function resolveChatSessionKey(): string {
  const session = state.session.active as Record<string, unknown> | null;
  if (!session) return "";
  return typeof session.sessionKey === "string" ? session.sessionKey.trim() : "";
}
