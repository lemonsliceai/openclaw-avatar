/**
 * Setup / config UI — form ↔ raw JSON sync, secret masking, health indicators.
 *
 * Extracted from `web/app.js` setup functions.
 */

import { OPENCLAW_REDACTED_SECRET_VALUE, REDACTED_SECRET_VALUE } from "../constants.js";
import { state } from "../state.js";
import type { SetupStatus } from "../types.js";
import { normalizeOptionalInputValue } from "../utils.js";

// Re-export so existing consumers don't break.
export { normalizeOptionalInputValue } from "../utils.js";

// ---------------------------------------------------------------------------
// Field name lists
// ---------------------------------------------------------------------------

export const setupSecretFieldNames = ["lemonSliceApiKey", "livekitApiKey", "livekitApiSecret"];

export const setupPayloadFieldNames = ["livekitUrl", ...setupSecretFieldNames];

export function hasOwn(obj: object, key: string): boolean {
  return Object.hasOwn(obj, key);
}

export function isSetupSecretFieldName(name: string): boolean {
  return setupSecretFieldNames.includes(name);
}

export function isRedactedSecretValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return normalized === REDACTED_SECRET_VALUE || normalized === OPENCLAW_REDACTED_SECRET_VALUE;
}

// ---------------------------------------------------------------------------
// Secret value storage
// ---------------------------------------------------------------------------

export function getStoredSetupSecretValueFromPayload(
  setup: Record<string, unknown>,
  fieldName: string,
): string {
  const lemonSlice = (setup?.lemonSlice ?? {}) as Record<string, unknown>;
  const livekit = (setup?.livekit ?? {}) as Record<string, unknown>;
  switch (fieldName) {
    case "lemonSliceApiKey":
      return normalizeOptionalInputValue(lemonSlice.apiKey);
    case "livekitApiKey":
      return normalizeOptionalInputValue(livekit.apiKey);
    case "livekitApiSecret":
      return normalizeOptionalInputValue(livekit.apiSecret);
    default:
      return "";
  }
}

export function getStoredSetupSecretValue(
  setup: Record<string, unknown> | null,
  fieldName: string,
): string {
  if (state.setup.storedSetupSecretValues.has(fieldName)) {
    return normalizeOptionalInputValue(state.setup.storedSetupSecretValues.get(fieldName));
  }
  if (!setup) return "";
  return getStoredSetupSecretValueFromPayload(setup, fieldName);
}

export function cacheSetupSecretValues(setup: Record<string, unknown>): void {
  state.setup.storedSetupSecretValues.clear();
  if (!setup || typeof setup !== "object") return;
  for (const name of setupSecretFieldNames) {
    const value = getStoredSetupSecretValueFromPayload(setup, name);
    if (value) {
      state.setup.storedSetupSecretValues.set(name, value);
    }
  }
}

// ---------------------------------------------------------------------------
// Secret redaction / sanitization
// ---------------------------------------------------------------------------

export function redactSetupSecretValue(value: unknown, configured: unknown): string {
  if (configured || normalizeOptionalInputValue(value).length > 0) {
    return REDACTED_SECRET_VALUE;
  }
  return "";
}

export function sanitizeSetupStatusForClient(setup: Record<string, unknown>): SetupStatus | null {
  if (!setup || typeof setup !== "object") return null;
  const lemonSlice = (setup.lemonSlice ?? {}) as Record<string, unknown>;
  const livekit = (setup.livekit ?? {}) as Record<string, unknown>;
  return {
    ...setup,
    configured: Boolean(setup.configured),
    lemonSlice: {
      ...lemonSlice,
      apiKey: redactSetupSecretValue(lemonSlice.apiKey, lemonSlice.apiKeyConfigured),
    },
    livekit: {
      ...livekit,
      apiKey: redactSetupSecretValue(livekit.apiKey, livekit.apiKeyConfigured),
      apiSecret: redactSetupSecretValue(livekit.apiSecret, livekit.apiSecretConfigured),
    },
  } as SetupStatus;
}

// ---------------------------------------------------------------------------
// Setup form payload
// ---------------------------------------------------------------------------

export function buildSetupPayloadFromForm(
  setupForm: HTMLFormElement | null,
): Record<string, string> {
  const payload: Record<string, string> = {};
  if (!setupForm) return payload;
  for (const name of setupPayloadFieldNames) {
    const field = setupForm.elements.namedItem(name) as HTMLInputElement | null;
    if (!field || typeof field.value !== "string") continue;
    const isSecretField = isSetupSecretFieldName(name);
    if (isSecretField && shouldPreserveStoredSecret(name, field.value)) {
      payload[name] = REDACTED_SECRET_VALUE;
      continue;
    }
    payload[name] = field.value;
  }
  return payload;
}

export function shouldPreserveStoredSecret(name: string, value: string): boolean {
  if (!state.setup.latestSetupStatus) return false;
  const normalizedValue = normalizeOptionalInputValue(value);
  const storedValue = normalizeOptionalInputValue(
    getStoredSetupSecretValue(
      state.setup.latestSetupStatus as unknown as Record<string, unknown>,
      name,
    ),
  );
  return Boolean(storedValue) && normalizedValue === storedValue;
}

// ---------------------------------------------------------------------------
// Raw JSON payload
// ---------------------------------------------------------------------------

export class SetupRawPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SetupRawPayloadError";
  }
}

export function isSetupRawPayloadError(error: unknown): boolean {
  return error instanceof SetupRawPayloadError;
}

export function parseSetupPayloadFromRaw(rawText: string): Record<string, string> {
  const trimmed = typeof rawText === "string" ? rawText.trim() : "";
  if (!trimmed) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new SetupRawPayloadError("Raw payload must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SetupRawPayloadError("Raw payload must be a JSON object.");
  }
  const payload: Record<string, string> = {};
  for (const name of setupPayloadFieldNames) {
    if (!hasOwn(parsed, name)) continue;
    const value = (parsed as Record<string, unknown>)[name];
    if (typeof value !== "string") {
      throw new SetupRawPayloadError(`"${name}" must be a string.`);
    }
    if (isSetupSecretFieldName(name) && isRedactedSecretValue(value)) continue;
    payload[name] = value;
  }
  return payload;
}

export function serializeSetupPayload(payload: Record<string, string>): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Form baseline snapshots
// ---------------------------------------------------------------------------

export function snapshotSetupFormBaseline(setupForm: HTMLFormElement | null): void {
  state.setup.formBaseline = {
    livekitUrl: getSetupFieldValue(setupForm, "livekitUrl"),
    lemonSliceApiKey: getSetupFieldValue(setupForm, "lemonSliceApiKey"),
    livekitApiKey: getSetupFieldValue(setupForm, "livekitApiKey"),
    livekitApiSecret: getSetupFieldValue(setupForm, "livekitApiSecret"),
  };
}

export function getSetupFieldValue(setupForm: HTMLFormElement | null, name: string): string {
  if (!setupForm) return "";
  const field = setupForm.elements.namedItem(name) as HTMLInputElement | null;
  return normalizeOptionalInputValue(field?.value);
}

export function restoreSetupFormBaseline(setupForm: HTMLFormElement | null): void {
  if (!setupForm) return;
  for (const name of setupPayloadFieldNames) {
    const field = setupForm.elements.namedItem(name) as HTMLInputElement | null;
    if (!field || typeof field.value !== "string") continue;
    field.value = (state.setup.formBaseline as unknown as Record<string, string>)[name] ?? "";
  }
  state.setup.secretVisibilityState.clear();
}

// ---------------------------------------------------------------------------
// Dirty checks
// ---------------------------------------------------------------------------

export function isSecretFieldDirty(setupForm: HTMLFormElement | null, name: string): boolean {
  if (!setupForm) return false;
  const field = setupForm.elements.namedItem(name) as HTMLInputElement | null;
  if (!field || typeof field.value !== "string") return false;
  return (
    normalizeOptionalInputValue(field.value) !==
    normalizeOptionalInputValue(
      (state.setup.formBaseline as unknown as Record<string, string>)[name],
    )
  );
}

export function isSetupFormDirty(setupForm: HTMLFormElement | null): boolean {
  if (!setupForm) return false;
  const urlsDirty =
    getSetupFieldValue(setupForm, "livekitUrl") !== state.setup.formBaseline.livekitUrl;
  const secretsDirty =
    isSecretFieldDirty(setupForm, "lemonSliceApiKey") ||
    isSecretFieldDirty(setupForm, "livekitApiKey") ||
    isSecretFieldDirty(setupForm, "livekitApiSecret");
  return urlsDirty || secretsDirty;
}

// ---------------------------------------------------------------------------
// Setup status helpers
// ---------------------------------------------------------------------------

export function getSetupMissingForUi(setup: Record<string, unknown>): string[] {
  if (!Array.isArray(setup?.missing)) return [];
  return (setup.missing as unknown[]).filter((path): path is string => typeof path === "string");
}

export function isSetupConfiguredForUi(setup: Record<string, unknown> | null): boolean {
  if (!setup || typeof setup !== "object") return false;
  if (setup.configured === true) return true;
  return getSetupMissingForUi(setup).length === 0;
}

export function setupStatusLabel(setup: Record<string, unknown> | null): string {
  if (!setup) return "Setup status unavailable";
  if (isSetupConfiguredForUi(setup)) {
    return "Configured: all required keys are set.";
  }
  const missing = getSetupMissingForUi(setup);
  return missing.length > 0
    ? `Missing: ${missing.join(", ")}`
    : "Configured: all required keys are set.";
}
