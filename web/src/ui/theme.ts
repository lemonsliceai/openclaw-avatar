/**
 * Theme toggle — light / dark / system preference detection and application.
 *
 * Extracted from `web/app.js` theme functions.
 */

import { THEME_STORAGE_KEY } from "../constants.js";
import { state } from "../state.js";
import type { AppliedTheme, ThemePreference } from "../types.js";

// ---------------------------------------------------------------------------
// Resolve & apply
// ---------------------------------------------------------------------------

export function resolveThemePreference(value: unknown): ThemePreference {
  if (value === "dark" || value === "light" || value === "system") {
    return value;
  }
  return "system";
}

export function resolveAppliedTheme(
  preference: ThemePreference,
  systemThemeMedia: MediaQueryList | null = null,
): AppliedTheme {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return systemThemeMedia?.matches ? "light" : "dark";
}

export function renderThemeToggle(
  preference: ThemePreference,
  themeToggleEl: HTMLElement | null,
  themeToggleButtons: HTMLElement[],
): void {
  const indexByTheme: Record<string, number> = {
    system: 0,
    light: 1,
    dark: 2,
  };
  if (themeToggleEl) {
    themeToggleEl.style.setProperty("--theme-index", String(indexByTheme[preference] ?? 2));
  }
  for (const button of themeToggleButtons) {
    const value = resolveThemePreference(
      (button as HTMLElement & { dataset: DOMStringMap }).dataset.themeValue,
    );
    const active = value === preference;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

export function applyTheme(
  preference: unknown,
  systemThemeMedia: MediaQueryList | null,
  themeToggleEl: HTMLElement | null,
  themeToggleButtons: HTMLElement[],
): void {
  const nextPreference = resolveThemePreference(preference);
  state.ui.activeThemePreference = nextPreference;
  const applied = resolveAppliedTheme(nextPreference, systemThemeMedia);
  if (applied === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  renderThemeToggle(nextPreference, themeToggleEl, themeToggleButtons);
}

export function initThemeToggle(
  systemThemeMedia: MediaQueryList | null,
  themeToggleEl: HTMLElement | null,
  themeToggleButtons: HTMLElement[],
): void {
  let stored: ThemePreference = "system";
  try {
    stored = resolveThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Ignore.
  }
  applyTheme(stored, systemThemeMedia, themeToggleEl, themeToggleButtons);

  for (const button of themeToggleButtons) {
    button.addEventListener("click", () => {
      const next = resolveThemePreference(
        (button as HTMLElement & { dataset: DOMStringMap }).dataset.themeValue,
      );
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Ignore.
      }
      applyTheme(next, systemThemeMedia, themeToggleEl, themeToggleButtons);
    });
  }

  if (systemThemeMedia) {
    systemThemeMedia.addEventListener("change", () => {
      if (state.ui.activeThemePreference === "system") {
        applyTheme("system", systemThemeMedia, themeToggleEl, themeToggleButtons);
      }
    });
  }
}
