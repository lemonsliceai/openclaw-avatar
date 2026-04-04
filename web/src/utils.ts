/**
 * Shared low-level utilities used across multiple domain modules.
 *
 * This module intentionally has no domain-specific imports — it provides
 * generic helpers so that domain modules never need to import from each
 * other for trivial operations like safe-trimming or localStorage access.
 */

// ---------------------------------------------------------------------------
// String normalization
// ---------------------------------------------------------------------------

export function normalizeOptionalInputValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// ---------------------------------------------------------------------------
// localStorage preference helpers (safe try/catch wrappers)
// ---------------------------------------------------------------------------

export function getStoredBooleanPreference(key: string, fallback = false): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored === "1" || stored === "true") return true;
    if (stored === "0" || stored === "false") return false;
  } catch {
    // Ignore storage failures.
  }
  return fallback;
}

export function persistBooleanPreference(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Ignore storage failures.
  }
}

export function getStoredStringPreference(key: string, fallback = ""): string {
  try {
    const stored = localStorage.getItem(key);
    if (typeof stored === "string") return stored;
  } catch {
    // Ignore storage failures.
  }
  return fallback;
}

export function persistStringPreference(key: string, value: string): void {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : String(value ?? ""));
  } catch {
    // Ignore storage failures.
  }
}
