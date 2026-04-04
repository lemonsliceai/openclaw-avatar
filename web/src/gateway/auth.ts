/**
 * Gateway authentication — token/password storage, auth mode detection,
 * and server-side mode bootstrapping.
 *
 * Consolidates logic from the legacy `web/gateway-auth.js` and the
 * auth-related functions scattered through `web/app.js`.
 */

import {
  AVATAR_PLUGIN_BASE_PATH,
  LEGACY_TOKEN_STORAGE_KEY,
  MINIMUM_COMPATIBLE_OPENCLAW_VERSION,
  OPENCLAW_SETTINGS_STORAGE_KEY,
} from "../constants.js";
import { state } from "../state.js";
import type { GatewayAuthMode, GatewayAuthState, OpenClawCompatibility } from "../types.js";

// ---------------------------------------------------------------------------
// Valid auth modes (mirrored from legacy gateway-auth.js)
// ---------------------------------------------------------------------------

const VALID_GATEWAY_AUTH_MODES = new Set<string>(["token", "password", "trusted-proxy", "none"]);

// ---------------------------------------------------------------------------
// Low-level helpers (from gateway-auth.js)
// ---------------------------------------------------------------------------

function readExplicitGatewayAuthMode(rawValue: unknown): GatewayAuthMode | null {
  const normalized = typeof rawValue === "string" ? rawValue.trim().toLowerCase() : "";
  return VALID_GATEWAY_AUTH_MODES.has(normalized) ? (normalized as GatewayAuthMode) : null;
}

function trimStoredSecret(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStoredSecret(value: unknown, options: { trim?: boolean } = {}): string {
  if (typeof value !== "string") {
    return "";
  }
  return options.trim === false ? value : value.trim();
}

// ---------------------------------------------------------------------------
// Exported gateway-auth.js equivalents
// ---------------------------------------------------------------------------

export function normalizeGatewayAuthMode(rawValue: unknown): GatewayAuthMode {
  return readExplicitGatewayAuthMode(rawValue) || "token";
}

export function inferGatewayAuthModeFromSettings(
  settings: Record<string, unknown> = {},
): GatewayAuthMode {
  const normalizedSettings = settings && typeof settings === "object" ? settings : {};
  const explicitMode = readExplicitGatewayAuthMode(normalizedSettings.gatewayAuthMode);
  if (explicitMode) {
    return explicitMode;
  }
  if (
    typeof normalizedSettings.password === "string" &&
    (normalizedSettings.password as string).trim().length > 0
  ) {
    return "password";
  }
  return "token";
}

export function getGatewayAuthStateFromSettings(
  settings: Record<string, unknown> = {},
  legacyToken = "",
): GatewayAuthState {
  const normalizedSettings = settings && typeof settings === "object" ? settings : {};
  const mode = inferGatewayAuthModeFromSettings(normalizedSettings);
  const shouldTrimPasswordSecret = mode !== "password";
  const gatewayAuthSecret = readStoredSecret(normalizedSettings.gatewayAuthSecret, {
    trim: shouldTrimPasswordSecret,
  });
  const password = readStoredSecret(normalizedSettings.password, {
    trim: shouldTrimPasswordSecret,
  });
  const token = readStoredSecret(normalizedSettings.token);
  const legacy = readStoredSecret(legacyToken);
  const preferredSharedSecret = mode === "password" ? password : token;
  const secondarySharedSecret = mode === "password" ? token : password;

  if (preferredSharedSecret) {
    return { mode, secret: preferredSharedSecret };
  }
  if (gatewayAuthSecret) {
    return { mode, secret: gatewayAuthSecret };
  }
  if (secondarySharedSecret) {
    return { mode, secret: secondarySharedSecret };
  }
  return { mode, secret: legacy };
}

export function reconcileGatewayAuthStateWithServerMode(
  currentState: Partial<GatewayAuthState>,
  rawMode: unknown,
): GatewayAuthState {
  const mode = normalizeGatewayAuthMode(rawMode);
  const secret = trimStoredSecret(currentState?.secret);
  return { mode, secret };
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

export function readStoredOpenClawSettings(): Record<string, unknown> {
  try {
    const rawSettings = localStorage.getItem(OPENCLAW_SETTINGS_STORAGE_KEY);
    if (rawSettings) {
      const parsed = JSON.parse(rawSettings);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    }
  } catch {
    // Fall through to empty settings.
  }
  return {};
}

function logGatewayStorageFailure(context: string, error: unknown): void {
  console.warn("[avatar-ui]", context, error);
}

export function writeStoredOpenClawSettings(settings: Record<string, unknown>): void {
  try {
    localStorage.setItem(OPENCLAW_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    logGatewayStorageFailure("openclaw-settings-write-failed", error);
  }
}

export function readLegacyGatewayToken(): string {
  try {
    return localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY) || "";
  } catch (error) {
    logGatewayStorageFailure("gateway-legacy-token-read-failed", error);
    return "";
  }
}

export function removeLegacyGatewayToken(): void {
  try {
    localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
  } catch (error) {
    logGatewayStorageFailure("gateway-legacy-token-remove-failed", error);
  }
}

// ---------------------------------------------------------------------------
// Re-export preference helpers from shared utils for backwards compatibility.
// These are generic localStorage helpers that don't belong in the auth domain.
export {
  getStoredBooleanPreference,
  getStoredStringPreference,
  persistBooleanPreference,
  persistStringPreference,
} from "../utils.js";

// ---------------------------------------------------------------------------
// High-level auth queries (from app.js)
// ---------------------------------------------------------------------------

export function getGatewayAuthState(): GatewayAuthState {
  const settings = readStoredOpenClawSettings();
  const legacyToken = readLegacyGatewayToken();
  return getGatewayAuthStateFromSettings(settings, legacyToken);
}

export function gatewayAuthRequiresSharedSecret(
  mode: GatewayAuthMode = getGatewayAuthState().mode,
): boolean {
  return mode === "token" || mode === "password";
}

export function getGatewayAuthMode(): GatewayAuthMode {
  return getGatewayAuthState().mode;
}

export function getGatewayAuthDisplayName(mode: GatewayAuthMode = getGatewayAuthMode()): string {
  if (mode === "password") {
    return "gateway password";
  }
  if (mode === "token") {
    return "gateway token";
  }
  return "gateway auth";
}

export function getGatewayToken(): string {
  return getGatewayAuthState().secret;
}

export function hasGatewayToken(): boolean {
  const { mode, secret } = getGatewayAuthState();
  return !gatewayAuthRequiresSharedSecret(mode) || secret.length > 0;
}

export function getAuthHeaders(): Record<string, string> {
  const { mode, secret } = getGatewayAuthState();
  if (!gatewayAuthRequiresSharedSecret(mode) || !secret) {
    return {};
  }
  return {
    Authorization: `Bearer ${secret}`,
  };
}

// ---------------------------------------------------------------------------
// Token persistence
// ---------------------------------------------------------------------------

export function createGatewayAuthModeBootstrapError(error?: unknown): Error {
  const nextError = new Error(
    "Could not verify the server gateway auth mode. Retry after the server responds.",
  );
  if (error !== undefined) {
    nextError.cause = error;
  }
  return nextError;
}

export function resolveGatewayAuthModeForPersistence(rawMode?: unknown): GatewayAuthMode {
  if (rawMode !== undefined && rawMode !== null) {
    return normalizeGatewayAuthMode(rawMode);
  }
  if (!state.gateway.authModeBootstrapReady) {
    throw createGatewayAuthModeBootstrapError(state.gateway.authModeBootstrapError);
  }
  return getGatewayAuthMode();
}

export function persistGatewayToken(token: string, options: { mode?: GatewayAuthMode } = {}): void {
  const mode = resolveGatewayAuthModeForPersistence(options.mode);
  const nextToken = typeof token === "string" ? (mode === "password" ? token : token.trim()) : "";
  const settings = readStoredOpenClawSettings();
  writeStoredOpenClawSettings({
    ...settings,
    gatewayAuthMode: mode,
    gatewayAuthSecret: nextToken,
    password: mode === "password" ? nextToken : "",
    token: mode === "token" ? nextToken : "",
  });
}

export function clearGatewayToken(): void {
  const settings = readStoredOpenClawSettings();
  writeStoredOpenClawSettings({
    ...settings,
    gatewayAuthSecret: "",
    password: "",
    token: "",
  });
  removeLegacyGatewayToken();
}

// ---------------------------------------------------------------------------
// OpenClaw compatibility hydration
// ---------------------------------------------------------------------------

export function hydrateOpenClawCompatibility(
  payload: Record<string, unknown>,
): OpenClawCompatibility {
  const openclaw = (payload?.openclaw ?? {}) as Record<string, unknown>;
  state.setup.openClawCompatibility = {
    version: typeof openclaw.version === "string" ? openclaw.version : null,
    minimumCompatibleVersion:
      typeof openclaw.minimumCompatibleVersion === "string" &&
      (openclaw.minimumCompatibleVersion as string).trim()
        ? (openclaw.minimumCompatibleVersion as string).trim()
        : MINIMUM_COMPATIBLE_OPENCLAW_VERSION,
    compatible: typeof openclaw.compatible === "boolean" ? openclaw.compatible : null,
  };
  return state.setup.openClawCompatibility;
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

export async function requestBrowserBootstrapPayload(): Promise<Record<string, unknown>> {
  const response = await fetch(`${AVATAR_PLUGIN_BASE_PATH}/bootstrap`);
  const payload: Record<string, unknown> = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error("Failed to load browser bootstrap payload.");
  }
  hydrateOpenClawCompatibility(payload);
  return payload;
}

export async function refreshOpenClawCompatibility(): Promise<boolean> {
  try {
    await requestBrowserBootstrapPayload();
    return true;
  } catch {
    return false;
  }
}

export async function bootstrapGatewayAuthModeFromServer(): Promise<GatewayAuthMode> {
  if (state.gateway.authModeBootstrapPromise) {
    return state.gateway.authModeBootstrapPromise as Promise<GatewayAuthMode>;
  }
  state.gateway.authModeBootstrapPromise = (async () => {
    const payload = await requestBrowserBootstrapPayload();
    const gateway = (payload?.gateway ?? {}) as Record<string, unknown>;
    const auth = (gateway?.auth ?? {}) as Record<string, unknown>;
    const mode = normalizeGatewayAuthMode(auth?.mode);
    const currentAuth = getGatewayAuthState();
    if (mode !== currentAuth.mode) {
      const nextAuth = reconcileGatewayAuthStateWithServerMode(currentAuth, mode);
      persistGatewayToken(nextAuth.secret, { mode: nextAuth.mode });
    }
    state.gateway.authModeBootstrapReady = true;
    state.gateway.authModeBootstrapError = null;
    return mode;
  })();
  try {
    return (await state.gateway.authModeBootstrapPromise) as GatewayAuthMode;
  } catch (error) {
    state.gateway.authModeBootstrapReady = false;
    state.gateway.authModeBootstrapError = error;
    throw error;
  } finally {
    state.gateway.authModeBootstrapPromise = null;
  }
}

export async function ensureGatewayAuthModeBootstrapped(): Promise<void> {
  if (state.gateway.authModeBootstrapReady) {
    return;
  }
  await bootstrapGatewayAuthModeFromServer();
}

export function migrateLegacyGatewayTokenIfNeeded(): void {
  const legacy = readLegacyGatewayToken();
  if (!legacy?.trim()) {
    return;
  }
  if (!getGatewayToken()) {
    persistGatewayToken(legacy, { mode: getGatewayAuthMode() });
  }
  removeLegacyGatewayToken();
}
