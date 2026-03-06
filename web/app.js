const statusEl = document.getElementById("status");
const outputEl = document.getElementById("output");
const setupForm = document.getElementById("setup-form");
const setupRawForm = document.getElementById("setup-raw-form");
const setupRawInput = document.getElementById("setup-raw-input");
const setupRawErrorEl = document.getElementById("setup-raw-error");
const sessionForm = document.getElementById("session-form");
const ttsForm = document.getElementById("tts-form");
const ttsTextInput = document.getElementById("tts-text");
const ttsGenerateButton = document.getElementById("tts-generate");
const reloadButton = document.getElementById("reload-status");
const setupSaveButton = document.querySelector('button[form="setup-form"][type="submit"]');
const stopSessionButton = document.getElementById("stop-session");
const tokenForm = document.getElementById("token-form");
const tokenInput = document.getElementById("gateway-token");
const clearTokenButton = document.getElementById("clear-token");
const replaceTokenButton = document.getElementById("replace-token");
const navCollapseButton = document.getElementById("nav-collapse-toggle");
const chatPaneToggleButton = document.getElementById("chat-pane-toggle");
const chatPaneCloseButton = document.getElementById("chat-pane-close");
const chatPaneBackdropEl = document.getElementById("chat-pane-backdrop");
const chatPaneResizerEl = document.getElementById("chat-pane-resizer");
const chatPaneEl = document.getElementById("chat-pane");
const contentEl = document.querySelector(".content.video-chat-layout");
const shellEl = document.querySelector(".shell");
const navEl = document.getElementById("plugin-nav") || document.querySelector(".nav");
const themeToggleEl = document.getElementById("theme-toggle");
const themeToggleButtons = Array.from(document.querySelectorAll("[data-theme-value]"));
const gatewayHealthDotEl = document.getElementById("gateway-health-dot");
const gatewayHealthValueEl = document.getElementById("gateway-health-value");
const keysHealthDotEl = document.getElementById("keys-health-dot");
const keysHealthValueEl = document.getElementById("keys-health-value");
const roomStatusEl = document.getElementById("room-status");
const roomStatusTextEl = document.getElementById("room-status-text");
const roomStatusSpinnerEl = document.getElementById("room-status-spinner");
const avatarPaneEl = document.getElementById("avatar-pane");
const avatarMediaEl = document.getElementById("avatar-media");
const avatarResizeHandleEl = document.getElementById("avatar-resize-handle");
const connectRoomButton = document.getElementById("connect-room");
const leaveRoomButton = document.getElementById("leave-room");
const toggleMicButton = document.getElementById("toggle-mic");
const toggleSpeakerButton = document.getElementById("toggle-speaker");
const togglePictureInPictureButton = document.getElementById("toggle-picture-in-picture");
const chatStatusEl = document.getElementById("chat-status");
const chatLogEl = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatSendButton = document.getElementById("chat-send");

const OPENCLAW_SETTINGS_STORAGE_KEY = "openclaw.control.settings.v1";
const LEGACY_TOKEN_STORAGE_KEY = "videoChat.gatewayToken";
const THEME_STORAGE_KEY = "videoChat.themePreference";
const NAV_COLLAPSE_STORAGE_KEY = "videoChat.navCollapsed";
const CHAT_PANE_STORAGE_KEY = "videoChat.chatPaneOpen";
const CHAT_PANE_WIDTH_STORAGE_KEY = "videoChat.chatPaneWidth";
const REDACTED_SECRET_VALUE = "_REDACTED_";
const OPENCLAW_REDACTED_SECRET_VALUE = "__OPENCLAW_REDACTED__";
const LIVEKIT = globalThis.LivekitClient || globalThis.livekitClient || null;
const GATEWAY_PROTOCOL_VERSION = 3;
const GATEWAY_WS_CLIENT = {
  id: "test",
  version: "video-chat-plugin-ui",
  platform: "web",
  mode: "test",
};
const CHAT_PANE_MIN_WIDTH = 300;
const CHAT_PANE_MAX_WIDTH = 640;
const AVATAR_PANE_WIDTH_STORAGE_KEY = "videoChat.avatarPaneWidth";
const AVATAR_PANE_MIN_WIDTH = 320;
const AVATAR_PANE_MAX_WIDTH = 1200;
const AVATAR_PARTICIPANT_IDENTITY = "lemonslice-avatar-agent";
const SESSION_STARTING_STATUS = "Starting session...";
const AVATAR_LOADING_STATUS = "Avatar loading...";
const VOICE_CHAT_RUN_ID_PREFIX = "video-chat-agent-";
const VOICE_TRANSCRIPT_EVENT_TOPIC = "video-chat.user-transcript";
const VOICE_TRANSCRIPT_EVENT_TYPE = "video-chat.user-transcript";

let activeSession = null;
let activeRoom = null;
let localAudioTrack = null;
let roomConnectGeneration = 0;
let roomConnectionState = LIVEKIT ? "disconnected" : "failed";
let avatarLoadPending = false;
let avatarLoadMessage = "";
let avatarSpeakerMuted = false;
let avatarPictureInPictureVideo = null;
let gatewaySocket = null;
let gatewaySocketReady = false;
let gatewayHandshakePromise = null;
let gatewayConnectRequestId = null;
let gatewayRequestCounter = 0;
const gatewayPendingRequests = new Map();
const sensitiveFieldReplaceButtons = Array.from(document.querySelectorAll("[data-replace-secret]"));
const sensitiveFieldInputs = Array.from(document.querySelectorAll("[data-sensitive-field]"));
const configSectionFilterButtons = Array.from(document.querySelectorAll("[data-section-filter]"));
const configSectionCards = Array.from(document.querySelectorAll("[data-config-section]"));
const configModeButtons = Array.from(document.querySelectorAll("[data-config-mode]"));
const secretEditState = new Set();
const mobileChatPaneMedia =
  typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 960px)") : null;
const systemThemeMedia =
  typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: light)") : null;
let activeThemePreference = "system";
let tokenEditMode = false;
let latestSetupStatus = null;
let activeConfigSectionFilter = "all";
let activeConfigMode = "form";
let setupFormBaseline = {
  lemonSliceImageUrl: "",
  livekitUrl: "",
  elevenLabsVoiceId: "",
};
let setupRawBaseline = "";
const renderedVoiceUserRuns = new Set();

function setOutput(value) {
  if (!outputEl) {
    return;
  }
  outputEl.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function setRoomStatus(text, options = {}) {
  if (!roomStatusEl && !roomStatusTextEl) {
    return;
  }
  const loading = Boolean(options.loading);
  if (roomStatusTextEl) {
    roomStatusTextEl.textContent = text;
  } else if (roomStatusEl) {
    roomStatusEl.textContent = text;
  }
  roomStatusEl?.classList.toggle("is-loading", loading);
  if (roomStatusSpinnerEl) {
    roomStatusSpinnerEl.hidden = !loading;
  }
}

function getGatewayToken() {
  try {
    const rawSettings = localStorage.getItem(OPENCLAW_SETTINGS_STORAGE_KEY);
    if (rawSettings) {
      const parsed = JSON.parse(rawSettings);
      if (parsed && typeof parsed === "object" && typeof parsed.token === "string") {
        return parsed.token;
      }
    }
  } catch {
    // Fall through to legacy key lookup.
  }
  return localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY) || "";
}

function hasGatewayToken() {
  return getGatewayToken().trim().length > 0;
}

function persistGatewayToken(token) {
  const nextToken = typeof token === "string" ? token.trim() : "";
  let settings = {};
  try {
    const raw = localStorage.getItem(OPENCLAW_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        settings = parsed;
      }
    }
  } catch {
    settings = {};
  }
  localStorage.setItem(
    OPENCLAW_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      ...settings,
      token: nextToken,
    }),
  );
}

function clearGatewayToken() {
  let settings = {};
  try {
    const raw = localStorage.getItem(OPENCLAW_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        settings = parsed;
      }
    }
  } catch {
    settings = {};
  }
  localStorage.setItem(
    OPENCLAW_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      ...settings,
      token: "",
    }),
  );
  localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
}

function migrateLegacyGatewayTokenIfNeeded() {
  const legacy = localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY);
  if (!legacy || !legacy.trim()) {
    return;
  }
  if (!getGatewayToken().trim()) {
    persistGatewayToken(legacy);
  }
  localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
}

function getAuthHeaders() {
  const token = getGatewayToken().trim();
  if (!token) {
    return {};
  }
  return {
    Authorization: `Bearer ${token}`,
  };
}

function setChatStatus(text) {
  if (!chatStatusEl) {
    return;
  }
  chatStatusEl.textContent = text;
}

function setHealthStatus(dotEl, valueEl, tone, text) {
  if (!dotEl || !valueEl) {
    return;
  }
  dotEl.classList.remove("ok", "warn");
  if (tone === "ok" || tone === "warn") {
    dotEl.classList.add(tone);
  }
  valueEl.textContent = text;
}

function setGatewayHealthStatus(tone, text) {
  setHealthStatus(gatewayHealthDotEl, gatewayHealthValueEl, tone, text);
}

function setKeysHealthStatus(tone, text) {
  setHealthStatus(keysHealthDotEl, keysHealthValueEl, tone, text);
}

function preventSensitiveCopy(event) {
  event.preventDefault();
}

function maskSensitiveField(input, isMasked) {
  if (!input) {
    return;
  }
  if (isMasked) {
    input.value = "";
    input.placeholder = REDACTED_SECRET_VALUE;
    input.disabled = true;
  } else {
    input.disabled = false;
    input.placeholder = "";
  }
}

function updateSensitiveFieldMasking(setup) {
  if (!setupForm) {
    return;
  }
  const configuredMap = new Map([
    ["lemonSliceApiKey", Boolean(setup?.lemonSlice?.apiKeyConfigured)],
    ["livekitApiKey", Boolean(setup?.livekit?.apiKeyConfigured)],
    ["livekitApiSecret", Boolean(setup?.livekit?.apiSecretConfigured)],
    ["elevenLabsApiKey", Boolean(setup?.tts?.elevenLabsApiKeyConfigured)],
  ]);

  for (const [fieldName, configured] of configuredMap.entries()) {
    const input = setupForm.elements.namedItem(fieldName);
    const editing = secretEditState.has(fieldName);
    maskSensitiveField(input, configured && !editing);
  }

  for (const button of sensitiveFieldReplaceButtons) {
    const fieldName = button.getAttribute("data-replace-secret");
    const configured = configuredMap.get(fieldName);
    if (!fieldName || !configured) {
      button.style.display = "none";
      continue;
    }
    button.style.display = "";
    button.textContent = secretEditState.has(fieldName) ? "Cancel" : "Replace";
  }

  updateSetupSaveButtonState();
}

function normalizeOptionalInputValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getSetupFieldValue(name) {
  if (!setupForm) {
    return "";
  }
  const field = setupForm.elements.namedItem(name);
  return normalizeOptionalInputValue(field?.value);
}

const setupPayloadFieldNames = [
  "lemonSliceApiKey",
  "lemonSliceImageUrl",
  "livekitUrl",
  "livekitApiKey",
  "livekitApiSecret",
  "elevenLabsApiKey",
  "elevenLabsVoiceId",
];
const setupSecretFieldNames = [
  "lemonSliceApiKey",
  "livekitApiKey",
  "livekitApiSecret",
  "elevenLabsApiKey",
];

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isSetupSecretFieldName(name) {
  return setupSecretFieldNames.includes(name);
}

function isRedactedSecretValue(value) {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim();
  return normalized === REDACTED_SECRET_VALUE || normalized === OPENCLAW_REDACTED_SECRET_VALUE;
}

function buildSetupPayloadFromForm() {
  const payload = {};
  if (!setupForm) {
    return payload;
  }
  for (const name of setupPayloadFieldNames) {
    const field = setupForm.elements.namedItem(name);
    if (!field || typeof field.value !== "string") {
      continue;
    }
    const isSecretField = isSetupSecretFieldName(name);
    payload[name] = field.disabled && isSecretField ? REDACTED_SECRET_VALUE : field.value;
  }
  return payload;
}

function applySetupPayloadToForm(payload) {
  if (!setupForm || !payload || typeof payload !== "object") {
    return;
  }

  secretEditState.clear();
  for (const name of setupSecretFieldNames) {
    if (!hasOwn(payload, name)) {
      continue;
    }
    const value = payload[name];
    if (typeof value === "string" && normalizeOptionalInputValue(value).length > 0) {
      secretEditState.add(name);
    }
  }
  updateSensitiveFieldMasking(latestSetupStatus);

  for (const name of setupPayloadFieldNames) {
    if (!hasOwn(payload, name)) {
      continue;
    }
    const field = setupForm.elements.namedItem(name);
    if (!field || field.disabled || typeof field.value !== "string") {
      continue;
    }
    const value = payload[name];
    if (typeof value === "string") {
      field.value = value;
    }
  }

  updateSensitiveFieldMasking(latestSetupStatus);
}

function parseSetupPayloadFromRaw(rawText) {
  const trimmed = typeof rawText === "string" ? rawText.trim() : "";
  if (!trimmed) {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("Raw payload must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Raw payload must be a JSON object.");
  }

  const payload = {};
  for (const name of setupPayloadFieldNames) {
    if (!hasOwn(parsed, name)) {
      continue;
    }
    const value = parsed[name];
    if (typeof value !== "string") {
      throw new Error(`"${name}" must be a string.`);
    }
    if (isSetupSecretFieldName(name) && isRedactedSecretValue(value)) {
      continue;
    }
    payload[name] = value;
  }
  return payload;
}

function serializeSetupPayload(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function setSetupRawError(message) {
  if (!setupRawErrorEl) {
    return;
  }
  const next = typeof message === "string" ? message.trim() : "";
  if (!next) {
    setupRawErrorEl.textContent = "";
    setupRawErrorEl.classList.add("is-mode-hidden");
    return;
  }
  setupRawErrorEl.textContent = next;
  setupRawErrorEl.classList.remove("is-mode-hidden");
}

function syncRawFromForm() {
  if (!setupRawInput) {
    return;
  }
  setupRawInput.value = serializeSetupPayload(buildSetupPayloadFromForm());
  setSetupRawError("");
}

function syncFormFromRaw() {
  if (!setupRawInput) {
    return { ok: true };
  }
  try {
    const payload = parseSetupPayloadFromRaw(setupRawInput.value);
    applySetupPayloadToForm(payload);
    setSetupRawError("");
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Raw payload is invalid.";
    setSetupRawError(message);
    setOutput({ action: "setup-raw-parse-failed", error: message });
    return { ok: false, error: message };
  }
}

function snapshotSetupRawBaseline() {
  setupRawBaseline = setupRawInput?.value ?? "";
}

function snapshotSetupFormBaseline() {
  setupFormBaseline = {
    lemonSliceImageUrl: getSetupFieldValue("lemonSliceImageUrl"),
    livekitUrl: getSetupFieldValue("livekitUrl"),
    elevenLabsVoiceId: getSetupFieldValue("elevenLabsVoiceId"),
  };
}

function isSecretFieldDirty(name) {
  if (!setupForm) {
    return false;
  }
  const field = setupForm.elements.namedItem(name);
  if (!field || field.disabled) {
    return false;
  }
  return normalizeOptionalInputValue(field.value).length > 0;
}

function isSetupFormDirty() {
  if (!setupForm) {
    return false;
  }

  const urlsDirty =
    getSetupFieldValue("lemonSliceImageUrl") !== setupFormBaseline.lemonSliceImageUrl ||
    getSetupFieldValue("livekitUrl") !== setupFormBaseline.livekitUrl;
  const voiceIdDirty =
    getSetupFieldValue("elevenLabsVoiceId") !== setupFormBaseline.elevenLabsVoiceId;

  const secretsDirty =
    isSecretFieldDirty("lemonSliceApiKey") ||
    isSecretFieldDirty("livekitApiKey") ||
    isSecretFieldDirty("livekitApiSecret") ||
    isSecretFieldDirty("elevenLabsApiKey");

  return urlsDirty || voiceIdDirty || secretsDirty;
}

function isSetupRawDirty() {
  if (!setupRawInput) {
    return false;
  }
  return setupRawInput.value !== setupRawBaseline;
}

function setConfigMode(nextMode, options = {}) {
  const mode = nextMode === "raw" ? "raw" : "form";
  const shouldSync = options.sync !== false;
  activeConfigMode = mode;

  if (mode === "raw" && shouldSync) {
    syncRawFromForm();
  }
  if (mode === "form" && shouldSync) {
    syncFormFromRaw();
  }

  if (setupForm) {
    setupForm.classList.toggle("is-mode-hidden", mode !== "form");
  }
  if (setupRawForm) {
    setupRawForm.classList.toggle("is-mode-hidden", mode !== "raw");
  }
  for (const button of configModeButtons) {
    const buttonMode = button.getAttribute("data-config-mode");
    button.classList.toggle("active", buttonMode === mode);
    button.setAttribute("aria-pressed", buttonMode === mode ? "true" : "false");
  }
  if (setupSaveButton) {
    setupSaveButton.setAttribute("form", mode === "raw" ? "setup-raw-form" : "setup-form");
  }
  updateSetupSaveButtonState();
}

function updateSetupSaveButtonState() {
  if (!setupSaveButton) {
    return;
  }
  setupSaveButton.disabled = activeConfigMode === "raw" ? !isSetupRawDirty() : !isSetupFormDirty();
}

function updateTokenFieldMasking() {
  if (!tokenInput) {
    return;
  }
  const hasStoredToken = hasGatewayToken();
  const shouldMask = hasStoredToken && !tokenEditMode;
  if (shouldMask) {
    tokenInput.value = "";
    tokenInput.placeholder = "******** (stored)";
    tokenInput.disabled = true;
  } else {
    tokenInput.disabled = false;
    tokenInput.placeholder = "";
  }
  if (replaceTokenButton) {
    replaceTokenButton.style.display = hasStoredToken ? "" : "none";
    replaceTokenButton.textContent = tokenEditMode ? "Cancel" : "Replace";
  }
}

function updateKeysHealthFromSetup(setup) {
  if (!setup || typeof setup !== "object") {
    setKeysHealthStatus("warn", "Unknown");
    return;
  }
  if (setup.configured) {
    setKeysHealthStatus("ok", "OK");
    return;
  }
  const missingCount = Array.isArray(setup.missing) ? setup.missing.length : 0;
  setKeysHealthStatus("warn", missingCount > 0 ? `Missing ${missingCount}` : "Missing");
}

function resolveThemePreference(value) {
  if (value === "dark" || value === "light" || value === "system") {
    return value;
  }
  return "system";
}

function resolveAppliedTheme(preference) {
  if (preference === "light") {
    return "light";
  }
  if (preference === "dark") {
    return "dark";
  }
  return systemThemeMedia?.matches ? "light" : "dark";
}

function renderThemeToggle(preference) {
  const indexByTheme = { system: 0, light: 1, dark: 2 };
  if (themeToggleEl) {
    themeToggleEl.style.setProperty("--theme-index", String(indexByTheme[preference] ?? 2));
  }
  for (const button of themeToggleButtons) {
    const value = resolveThemePreference(button.dataset.themeValue);
    const active = value === preference;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function applyTheme(preference) {
  const nextPreference = resolveThemePreference(preference);
  activeThemePreference = nextPreference;
  const applied = resolveAppliedTheme(nextPreference);
  if (applied === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  renderThemeToggle(nextPreference);
}

function initThemeToggle() {
  const stored = resolveThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  applyTheme(stored);

  for (const button of themeToggleButtons) {
    button.addEventListener("click", () => {
      const nextPreference = resolveThemePreference(button.dataset.themeValue);
      localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
      applyTheme(nextPreference);
    });
  }

  if (systemThemeMedia) {
    systemThemeMedia.addEventListener("change", () => {
      if (activeThemePreference === "system") {
        applyTheme("system");
      }
    });
  }
}

function updateNavCollapseButtonState(isCollapsed) {
  if (!navCollapseButton) {
    return;
  }
  const collapsed = Boolean(isCollapsed);
  navCollapseButton.setAttribute("aria-expanded", collapsed ? "false" : "true");
  navCollapseButton.setAttribute(
    "aria-label",
    collapsed ? "Expand navigation menu" : "Collapse navigation menu",
  );
  navCollapseButton.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
}

function setNavCollapsed(isCollapsed, options = {}) {
  const collapsed = Boolean(isCollapsed);
  const shouldPersist = options.persist !== false;

  if (shellEl) {
    shellEl.classList.toggle("shell--nav-collapsed", collapsed);
  }
  if (navEl) {
    navEl.classList.toggle("nav--collapsed", collapsed);
  }
  updateNavCollapseButtonState(collapsed);

  if (!shouldPersist) {
    return;
  }
  try {
    localStorage.setItem(NAV_COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // Ignore storage failures.
  }
}

function initNavCollapseToggle() {
  if (!navCollapseButton) {
    return;
  }

  let storedCollapsed = false;
  try {
    storedCollapsed = localStorage.getItem(NAV_COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    storedCollapsed = false;
  }
  setNavCollapsed(storedCollapsed, { persist: false });

  navCollapseButton.addEventListener("click", () => {
    const isCollapsed =
      shellEl?.classList.contains("shell--nav-collapsed") || navEl?.classList.contains("nav--collapsed");
    setNavCollapsed(!isCollapsed);
  });
}

function isMobileChatPane() {
  return Boolean(mobileChatPaneMedia?.matches);
}

function updateChatPaneToggleState(isOpen) {
  if (!chatPaneToggleButton) {
    return;
  }
  chatPaneToggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
  chatPaneToggleButton.setAttribute("title", isOpen ? "Hide text chat panel" : "Show text chat panel");
}

function getChatPaneWidthBounds() {
  const layoutWidth = contentEl?.getBoundingClientRect().width ?? window.innerWidth;
  const maxWidth = Math.max(
    CHAT_PANE_MIN_WIDTH,
    Math.min(CHAT_PANE_MAX_WIDTH, Math.floor(layoutWidth - 320)),
  );
  return {
    min: CHAT_PANE_MIN_WIDTH,
    max: maxWidth,
  };
}

function applyChatPaneWidth(nextWidth, options = {}) {
  if (!shellEl || !Number.isFinite(nextWidth)) {
    return;
  }
  const shouldPersist = options.persist !== false;
  const { min, max } = getChatPaneWidthBounds();
  const clamped = Math.min(max, Math.max(min, Math.round(nextWidth)));
  shellEl.style.setProperty("--video-chat-pane-width", `${clamped}px`);
  if (!shouldPersist) {
    return;
  }
  try {
    localStorage.setItem(CHAT_PANE_WIDTH_STORAGE_KEY, String(clamped));
  } catch {
    // Ignore storage failures.
  }
}

function setChatPaneOpen(isOpen, options = {}) {
  const shouldPersist = options.persist !== false;
  shellEl?.classList.toggle("shell--chat-pane-open", isOpen);
  shellEl?.classList.toggle("shell--chat-pane-closed", !isOpen);
  if (chatPaneEl) {
    chatPaneEl.setAttribute("aria-hidden", isOpen ? "false" : "true");
  }
  if (chatPaneBackdropEl) {
    chatPaneBackdropEl.hidden = !isMobileChatPane();
  }
  updateChatPaneToggleState(isOpen);

  if (shouldPersist) {
    try {
      localStorage.setItem(CHAT_PANE_STORAGE_KEY, isOpen ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
  }
}

function initChatPane() {
  let isOpen = true;
  let storedWidth = 360;
  try {
    const stored = localStorage.getItem(CHAT_PANE_STORAGE_KEY);
    if (stored === "0") {
      isOpen = false;
    } else if (stored === "1") {
      isOpen = true;
    }
    const parsedWidth = Number(localStorage.getItem(CHAT_PANE_WIDTH_STORAGE_KEY));
    if (Number.isFinite(parsedWidth) && parsedWidth > 0) {
      storedWidth = parsedWidth;
    }
  } catch {
    isOpen = true;
    storedWidth = 360;
  }

  applyChatPaneWidth(storedWidth, { persist: false });
  setChatPaneOpen(isOpen, { persist: false });

  chatPaneToggleButton?.addEventListener("click", () => {
    const nextOpen = shellEl ? shellEl.classList.contains("shell--chat-pane-closed") : true;
    setChatPaneOpen(nextOpen);
    if (nextOpen && activeSession && chatInput) {
      chatInput.focus();
    }
  });

  chatPaneCloseButton?.addEventListener("click", () => {
    setChatPaneOpen(false);
  });

  chatPaneBackdropEl?.addEventListener("click", () => {
    setChatPaneOpen(false);
  });

  mobileChatPaneMedia?.addEventListener("change", () => {
    const open = shellEl ? shellEl.classList.contains("shell--chat-pane-open") : true;
    applyChatPaneWidth(parseInt(shellEl?.style.getPropertyValue("--video-chat-pane-width") || "360", 10), {
      persist: false,
    });
    setChatPaneOpen(open, { persist: false });
  });

  if (chatPaneResizerEl) {
    const resizeFromClientX = (clientX) => {
      const rect = contentEl?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      applyChatPaneWidth(rect.right - clientX);
    };

    chatPaneResizerEl.addEventListener("pointerdown", (event) => {
      if (isMobileChatPane() || shellEl?.classList.contains("shell--chat-pane-closed")) {
        return;
      }
      event.preventDefault();
      shellEl?.classList.add("shell--chat-pane-resizing");
      resizeFromClientX(event.clientX);

      const handlePointerMove = (moveEvent) => {
        resizeFromClientX(moveEvent.clientX);
      };

      const handlePointerUp = () => {
        shellEl?.classList.remove("shell--chat-pane-resizing");
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    });

    chatPaneResizerEl.addEventListener("keydown", (event) => {
      if (isMobileChatPane()) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      event.preventDefault();
      const currentWidth = parseInt(shellEl?.style.getPropertyValue("--video-chat-pane-width") || "360", 10);
      const delta = event.key === "ArrowLeft" ? 24 : -24;
      applyChatPaneWidth(currentWidth + delta);
    });
  }

  window.addEventListener("resize", () => {
    const currentWidth = parseInt(shellEl?.style.getPropertyValue("--video-chat-pane-width") || "360", 10);
    applyChatPaneWidth(currentWidth, { persist: false });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (!shellEl?.classList.contains("shell--chat-pane-open")) {
      return;
    }
    setChatPaneOpen(false);
  });
}

function getAvatarPaneWidthBounds() {
  const availableWidth =
    avatarPaneEl?.parentElement?.getBoundingClientRect().width ??
    contentEl?.getBoundingClientRect().width ??
    window.innerWidth;
  const maxWidth = Math.max(
    AVATAR_PANE_MIN_WIDTH,
    Math.min(AVATAR_PANE_MAX_WIDTH, Math.floor(availableWidth)),
  );
  return {
    min: AVATAR_PANE_MIN_WIDTH,
    max: maxWidth,
  };
}

function applyAvatarPaneWidth(nextWidth, options = {}) {
  if (!shellEl || !Number.isFinite(nextWidth)) {
    return;
  }
  const shouldPersist = options.persist !== false;
  const { min, max } = getAvatarPaneWidthBounds();
  const clamped = Math.min(max, Math.max(min, Math.round(nextWidth)));
  shellEl.style.setProperty("--avatar-pane-width", `${clamped}px`);
  if (!shouldPersist) {
    return;
  }
  try {
    localStorage.setItem(AVATAR_PANE_WIDTH_STORAGE_KEY, String(clamped));
  } catch {
    // Ignore storage failures.
  }
}

function getCurrentAvatarPaneWidth() {
  const measuredWidth = avatarPaneEl?.hidden ? 0 : avatarPaneEl?.getBoundingClientRect().width;
  if (Number.isFinite(measuredWidth) && measuredWidth > 0) {
    return measuredWidth;
  }
  const storedWidth = parseInt(shellEl?.style.getPropertyValue("--avatar-pane-width") || "760", 10);
  if (Number.isFinite(storedWidth) && storedWidth > 0) {
    return storedWidth;
  }
  return 760;
}

function initAvatarPaneResize() {
  let storedWidth = 760;
  try {
    const parsed = Number(localStorage.getItem(AVATAR_PANE_WIDTH_STORAGE_KEY));
    if (Number.isFinite(parsed) && parsed > 0) {
      storedWidth = parsed;
    }
  } catch {
    storedWidth = 760;
  }
  applyAvatarPaneWidth(storedWidth, { persist: false });

  if (!avatarResizeHandleEl || !avatarPaneEl) {
    return;
  }

  avatarResizeHandleEl.addEventListener("pointerdown", (event) => {
    if (isMobileChatPane()) {
      return;
    }
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = avatarPaneEl.getBoundingClientRect().width;
    shellEl?.classList.add("shell--avatar-resizing");

    const onPointerMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      applyAvatarPaneWidth(startWidth + deltaX);
    };
    const onPointerUp = () => {
      shellEl?.classList.remove("shell--avatar-resizing");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });

  avatarResizeHandleEl.addEventListener("keydown", (event) => {
    if (isMobileChatPane()) {
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    const currentWidth = avatarPaneEl.getBoundingClientRect().width;
    const delta = event.key === "ArrowLeft" ? -24 : 24;
    applyAvatarPaneWidth(currentWidth + delta);
  });

  window.addEventListener("resize", () => {
    applyAvatarPaneWidth(getCurrentAvatarPaneWidth(), { persist: false });
  });
}

function isAvatarParticipantIdentity(participantIdentity) {
  const normalized = typeof participantIdentity === "string" ? participantIdentity.trim() : "";
  if (!normalized) {
    return false;
  }
  if (normalized === AVATAR_PARTICIPANT_IDENTITY) {
    return true;
  }
  if (normalized.toLowerCase().includes("agent")) {
    return false;
  }
  return false;
}

function updateAvatarAspectRatio(videoElement) {
  if (!shellEl) {
    return;
  }
  if (
    !(videoElement instanceof HTMLVideoElement) ||
    !Number.isFinite(videoElement.videoWidth) ||
    !Number.isFinite(videoElement.videoHeight) ||
    videoElement.videoWidth <= 0 ||
    videoElement.videoHeight <= 0
  ) {
    shellEl.style.setProperty("--avatar-aspect-ratio", "16 / 9");
    return;
  }
  shellEl.style.setProperty("--avatar-aspect-ratio", `${videoElement.videoWidth} / ${videoElement.videoHeight}`);
}

function getAvatarVideoElement() {
  const element = avatarMediaEl?.querySelector("video");
  return element instanceof HTMLVideoElement ? element : null;
}

function canUseStandardPictureInPicture(videoElement) {
  return Boolean(
    videoElement instanceof HTMLVideoElement &&
      typeof videoElement.requestPictureInPicture === "function" &&
      (typeof document.pictureInPictureEnabled !== "boolean" || document.pictureInPictureEnabled),
  );
}

function canUseWebkitPictureInPicture(videoElement) {
  return Boolean(
    videoElement instanceof HTMLVideoElement &&
      typeof videoElement.webkitSupportsPresentationMode === "function" &&
      typeof videoElement.webkitSetPresentationMode === "function" &&
      videoElement.webkitSupportsPresentationMode("picture-in-picture"),
  );
}

function hasPictureInPictureBrowserSupport() {
  if (typeof HTMLVideoElement === "undefined") {
    return false;
  }
  return Boolean(
    typeof HTMLVideoElement.prototype.requestPictureInPicture === "function" ||
      typeof HTMLVideoElement.prototype.webkitSupportsPresentationMode === "function",
  );
}

function hasAvatarPictureInPictureSupport(videoElement = getAvatarVideoElement()) {
  return canUseStandardPictureInPicture(videoElement) || canUseWebkitPictureInPicture(videoElement);
}

function isAvatarPictureInPictureActive(videoElement = getAvatarVideoElement() ?? avatarPictureInPictureVideo) {
  if (!(videoElement instanceof HTMLVideoElement)) {
    return false;
  }
  if (document.pictureInPictureElement === videoElement) {
    return true;
  }
  return videoElement.webkitPresentationMode === "picture-in-picture";
}

function handleAvatarPictureInPictureStateChange() {
  updatePictureInPictureButtonState();
}

function bindAvatarPictureInPictureVideo(videoElement) {
  if (!(videoElement instanceof HTMLVideoElement)) {
    return;
  }
  if (avatarPictureInPictureVideo && avatarPictureInPictureVideo !== videoElement) {
    unbindAvatarPictureInPictureVideo(avatarPictureInPictureVideo);
  }
  avatarPictureInPictureVideo = videoElement;
  videoElement.addEventListener("enterpictureinpicture", handleAvatarPictureInPictureStateChange);
  videoElement.addEventListener("leavepictureinpicture", handleAvatarPictureInPictureStateChange);
  videoElement.addEventListener("webkitpresentationmodechanged", handleAvatarPictureInPictureStateChange);
  updatePictureInPictureButtonState();
}

function unbindAvatarPictureInPictureVideo(videoElement = avatarPictureInPictureVideo) {
  if (videoElement instanceof HTMLVideoElement) {
    videoElement.removeEventListener("enterpictureinpicture", handleAvatarPictureInPictureStateChange);
    videoElement.removeEventListener("leavepictureinpicture", handleAvatarPictureInPictureStateChange);
    videoElement.removeEventListener("webkitpresentationmodechanged", handleAvatarPictureInPictureStateChange);
  }
  if (!videoElement || videoElement === avatarPictureInPictureVideo) {
    avatarPictureInPictureVideo = null;
  }
}

async function enterAvatarPictureInPicture() {
  const videoElement = getAvatarVideoElement();
  if (!(videoElement instanceof HTMLVideoElement)) {
    throw new Error("Avatar video is not ready yet.");
  }
  if (canUseStandardPictureInPicture(videoElement)) {
    if (
      document.pictureInPictureElement &&
      document.pictureInPictureElement !== videoElement &&
      typeof document.exitPictureInPicture === "function"
    ) {
      await document.exitPictureInPicture();
    }
    await videoElement.requestPictureInPicture();
    return;
  }
  if (canUseWebkitPictureInPicture(videoElement)) {
    videoElement.webkitSetPresentationMode("picture-in-picture");
    return;
  }
  throw new Error("Picture-in-picture is not available in this browser.");
}

async function exitAvatarPictureInPicture() {
  const videoElement = getAvatarVideoElement() ?? avatarPictureInPictureVideo;
  if (document.pictureInPictureElement && typeof document.exitPictureInPicture === "function") {
    await document.exitPictureInPicture();
    return;
  }
  if (
    videoElement instanceof HTMLVideoElement &&
    typeof videoElement.webkitSetPresentationMode === "function" &&
    videoElement.webkitPresentationMode === "picture-in-picture"
  ) {
    videoElement.webkitSetPresentationMode("inline");
  }
}

function updatePictureInPictureButtonState() {
  if (!togglePictureInPictureButton) {
    return;
  }

  const activeVideoElement = getAvatarVideoElement() ?? avatarPictureInPictureVideo;
  const hasVideo = Boolean(getAvatarVideoElement());
  const isActive = isAvatarPictureInPictureActive(activeVideoElement);
  const isSupported = hasAvatarPictureInPictureSupport(activeVideoElement);

  togglePictureInPictureButton.disabled = isActive ? !isSupported : !hasVideo || !isSupported;
  togglePictureInPictureButton.classList.toggle("is-active", isActive);

  let label = "Pop out avatar";
  if (!hasPictureInPictureBrowserSupport()) {
    label = "Picture-in-picture is unavailable in this browser";
  } else if (!hasVideo && !isActive) {
    label = "Picture-in-picture is available after the avatar video loads";
  } else if (!isSupported) {
    label = "Picture-in-picture is unavailable for this stream";
  } else if (isActive) {
    label = "Return avatar to the tab";
  }

  togglePictureInPictureButton.setAttribute("aria-label", label);
  togglePictureInPictureButton.setAttribute("title", label);
}

function hasAvatarVideo() {
  return Boolean(getAvatarVideoElement());
}

function setAvatarLoadingState(isPending, message = "") {
  avatarLoadPending = Boolean(isPending);
  avatarLoadMessage = avatarLoadPending && typeof message === "string" ? message.trim() : "";
  updateRoomStatusState();
}

function updateAvatarUiState() {
  const showAvatarPane = hasAvatarVideo();

  if (avatarPaneEl) {
    avatarPaneEl.hidden = !showAvatarPane;
  }
  if (!showAvatarPane) {
    updateAvatarAspectRatio(null);
  }
  updatePictureInPictureButtonState();
  updateRoomStatusState();
}

function updateRoomStatusState() {
  if (!LIVEKIT) {
    setRoomStatus("LiveKit client failed to load from CDN.");
    return;
  }

  const normalizedConnectionState =
    typeof roomConnectionState === "string" ? roomConnectionState.trim().toLowerCase() : "";

  if (avatarLoadPending) {
    setRoomStatus(avatarLoadMessage || SESSION_STARTING_STATUS, { loading: true });
    return;
  }

  if (activeRoom) {
    if (normalizedConnectionState && normalizedConnectionState !== "connected") {
      const isLoading = normalizedConnectionState !== "disconnected";
      setRoomStatus(
        isLoading ? `Room state: ${normalizedConnectionState}` : "Disconnected from room.",
        { loading: isLoading },
      );
      return;
    }
    if (!hasAvatarVideo()) {
      setRoomStatus(AVATAR_LOADING_STATUS, { loading: true });
      return;
    }
    const roomName =
      typeof activeSession?.roomName === "string" && activeSession.roomName.trim()
        ? activeSession.roomName.trim()
        : "room";
    setRoomStatus(`Connected to ${roomName}`);
    return;
  }

  if (activeSession) {
    if (normalizedConnectionState === "connected") {
      setRoomStatus(AVATAR_LOADING_STATUS, { loading: true });
      return;
    }
    if (normalizedConnectionState && normalizedConnectionState !== "disconnected") {
      setRoomStatus(`Room state: ${normalizedConnectionState}`, { loading: true });
      return;
    }
    setRoomStatus("Disconnected from room.");
    return;
  }

  setRoomStatus("No active room connection.");
}

function applyAvatarSpeakerMuteState() {
  if (avatarMediaEl) {
    const mediaElements = avatarMediaEl.querySelectorAll("audio, video");
    for (const element of mediaElements) {
      element.muted = avatarSpeakerMuted;
    }
  }
  if (!toggleSpeakerButton) {
    return;
  }
  toggleSpeakerButton.classList.toggle("is-muted", avatarSpeakerMuted);
  toggleSpeakerButton.setAttribute("aria-label", avatarSpeakerMuted ? "Unmute speaker" : "Mute speaker");
  toggleSpeakerButton.setAttribute("title", avatarSpeakerMuted ? "Unmute speaker" : "Mute speaker");
}

function clearChatLog() {
  renderedVoiceUserRuns.clear();
  if (!chatLogEl) {
    return;
  }
  chatLogEl.textContent = "";
}

function applyConfigSectionFilter(nextFilter) {
  const normalizedFilter = typeof nextFilter === "string" && nextFilter.trim() ? nextFilter.trim() : "all";
  activeConfigSectionFilter = normalizedFilter;

  for (const button of configSectionFilterButtons) {
    const buttonFilter = (button.getAttribute("data-section-filter") || "").trim() || "all";
    button.classList.toggle("active", buttonFilter === normalizedFilter);
  }

  for (const section of configSectionCards) {
    const sectionKey = (section.getAttribute("data-config-section") || "").trim();
    const shouldHide = normalizedFilter !== "all" && sectionKey !== normalizedFilter;
    section.classList.toggle("is-filter-hidden", shouldHide);
  }
}

function initConfigSectionFiltering() {
  if (!configSectionFilterButtons.length || !configSectionCards.length) {
    return;
  }

  for (const button of configSectionFilterButtons) {
    button.addEventListener("click", () => {
      const nextFilter = button.getAttribute("data-section-filter") || "all";
      applyConfigSectionFilter(nextFilter);
    });
  }

  applyConfigSectionFilter(activeConfigSectionFilter);
}

function appendChatLine(role, text) {
  if (!chatLogEl || !text) {
    return;
  }
  const line = document.createElement("article");
  line.className = `chat-line ${role}`;
  const message = document.createElement("div");
  message.className = "chat-msg";
  const heading = document.createElement("strong");
  heading.className = "muted";
  heading.textContent =
    role === "user" ? "You" : role === "assistant" ? "Agent" : role === "system" ? "System" : role;
  const body = document.createElement("p");
  body.className = "chat-bubble";
  body.textContent = text;
  message.appendChild(heading);
  message.appendChild(body);
  line.appendChild(message);
  chatLogEl.appendChild(line);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

function extractAssistantText(message) {
  if (!message || typeof message !== "object") {
    return "";
  }
  if (typeof message.text === "string" && message.text.trim()) {
    return message.text.trim();
  }
  if (typeof message.content === "string" && message.content.trim()) {
    return message.content.trim();
  }
  if (!Array.isArray(message.content)) {
    return "";
  }
  const textBlocks = message.content
    .filter((item) => item && typeof item === "object" && item.type === "text")
    .map((item) => (typeof item.text === "string" ? item.text.trim() : ""))
    .filter(Boolean);
  return textBlocks.join("\n\n");
}

function extractUserText(message) {
  if (!message || typeof message !== "object") {
    return "";
  }
  if (typeof message.content === "string" && message.content.trim()) {
    return message.content.trim();
  }
  if (Array.isArray(message.content)) {
    const textBlocks = message.content
      .filter((item) => item && typeof item === "object" && item.type === "text")
      .map((item) => (typeof item.text === "string" ? item.text.trim() : ""))
      .filter(Boolean);
    if (textBlocks.length > 0) {
      return textBlocks.join("\n\n");
    }
  }
  if (typeof message.text === "string" && message.text.trim()) {
    return message.text.trim();
  }
  return "";
}

function isVoiceRunId(runId) {
  return typeof runId === "string" && runId.startsWith(VOICE_CHAT_RUN_ID_PREFIX);
}

function decodeLiveKitDataPayload(payload) {
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

function appendVoiceUserTranscript(payload) {
  const expectedSessionKey = resolveChatSessionKey();
  const payloadSessionKey = typeof payload?.sessionKey === "string" ? payload.sessionKey.trim() : "";
  if (!expectedSessionKey || !payloadSessionKey || payloadSessionKey !== expectedSessionKey) {
    return;
  }
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  if (!text) {
    return;
  }
  const idempotencyKey =
    typeof payload?.idempotencyKey === "string" ? payload.idempotencyKey.trim() : "";
  if (isVoiceRunId(idempotencyKey) && renderedVoiceUserRuns.has(idempotencyKey)) {
    return;
  }
  appendChatLine("user", text);
  if (isVoiceRunId(idempotencyKey)) {
    renderedVoiceUserRuns.add(idempotencyKey);
  }
  setChatStatus("Awaiting agent reply...");
}

function handleLiveKitDataMessage(payload, topic) {
  const normalizedTopic = typeof topic === "string" ? topic.trim() : "";
  if (normalizedTopic && normalizedTopic !== VOICE_TRANSCRIPT_EVENT_TOPIC) {
    return;
  }

  const json = decodeLiveKitDataPayload(payload);
  if (!json) {
    return;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(json);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== "object") {
    return;
  }
  if (parsed.type !== VOICE_TRANSCRIPT_EVENT_TYPE) {
    return;
  }
  appendVoiceUserTranscript(parsed);
}

function resolveChatSessionKey() {
  if (!activeSession) {
    return "";
  }
  if (typeof activeSession.chatSessionKey === "string" && activeSession.chatSessionKey.trim()) {
    return activeSession.chatSessionKey.trim();
  }
  if (typeof activeSession.sessionKey === "string" && activeSession.sessionKey.trim()) {
    return activeSession.sessionKey.trim();
  }
  return "";
}

function updateChatControls() {
  if (!chatInput || !chatSendButton) {
    return;
  }
  const hasSession = Boolean(activeSession);
  chatInput.disabled = !hasSession;
  chatSendButton.disabled = !hasSession;
}

function nextGatewayRequestId() {
  gatewayRequestCounter += 1;
  return `video-chat-ui-${Date.now()}-${gatewayRequestCounter}`;
}

function clearGatewayPendingRequests(error) {
  for (const [id, pending] of gatewayPendingRequests.entries()) {
    clearTimeout(pending.timer);
    pending.reject(error);
    gatewayPendingRequests.delete(id);
  }
}

function closeGatewaySocket(reason) {
  gatewaySocketReady = false;
  gatewayConnectRequestId = null;
  if (gatewaySocket) {
    try {
      gatewaySocket.close();
    } catch {}
  }
  gatewaySocket = null;
  gatewayHandshakePromise = null;
  clearGatewayPendingRequests(new Error(reason));
}

function handleGatewayChatEvent(payload) {
  const expectedSessionKey = resolveChatSessionKey();
  const payloadSessionKey = typeof payload?.sessionKey === "string" ? payload.sessionKey.trim() : "";
  if (!expectedSessionKey || !payloadSessionKey || payloadSessionKey !== expectedSessionKey) {
    return;
  }

  const state = typeof payload.state === "string" ? payload.state : "";
  if (state === "delta") {
    setChatStatus("Agent is responding...");
    return;
  }
  if (state === "final") {
    const text = extractAssistantText(payload.message) || "[No text in final message]";
    appendChatLine("assistant", text);
    setChatStatus("Reply received.");
    return;
  }
  if (state === "error") {
    appendChatLine("system", payload.errorMessage || "Chat request failed.");
    setChatStatus("Chat error.");
    return;
  }
  if (state === "aborted") {
    appendChatLine("system", "Chat run aborted.");
    setChatStatus("Chat run aborted.");
  }
}

function handleGatewaySocketMessage(raw) {
  let frame = null;
  try {
    frame = JSON.parse(String(raw));
  } catch {
    return;
  }
  if (!frame || typeof frame !== "object") {
    return;
  }

  if (frame.type === "event" && frame.event === "connect.challenge") {
    const token = getGatewayToken().trim();
    const connectRequestId = nextGatewayRequestId();
    gatewayConnectRequestId = connectRequestId;
    const params = {
      minProtocol: GATEWAY_PROTOCOL_VERSION,
      maxProtocol: GATEWAY_PROTOCOL_VERSION,
      client: GATEWAY_WS_CLIENT,
      role: "operator",
      scopes: ["operator.admin"],
      ...(token ? { auth: { token } } : {}),
    };
    gatewaySocket?.send(
      JSON.stringify({
        type: "req",
        id: connectRequestId,
        method: "connect",
        params,
      }),
    );
    return;
  }

  if (frame.type === "res") {
    if (frame.id === gatewayConnectRequestId) {
      gatewayConnectRequestId = null;
      if (!frame.ok) {
        const message = frame?.error?.message || "Gateway websocket authorization failed.";
        closeGatewaySocket(message);
        setChatStatus(message);
        return;
      }
      gatewaySocketReady = true;
      setChatStatus("Chat connected.");
      return;
    }

    const pending = gatewayPendingRequests.get(frame.id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    gatewayPendingRequests.delete(frame.id);
    if (frame.ok) {
      pending.resolve(frame.payload ?? {});
      return;
    }
    const message = frame?.error?.message || `${pending.method} failed`;
    pending.reject(new Error(message));
    return;
  }

  if (frame.type === "event" && frame.event === "chat") {
    handleGatewayChatEvent(frame.payload || {});
  }
}

async function ensureGatewaySocketConnected() {
  if (gatewaySocketReady && gatewaySocket && gatewaySocket.readyState === WebSocket.OPEN) {
    return;
  }
  if (gatewayHandshakePromise) {
    return gatewayHandshakePromise;
  }

  gatewayHandshakePromise = new Promise((resolve, reject) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${protocol}//${window.location.host}`;
    let settled = false;
    const onSettledError = (error) => {
      if (settled) {
        return;
      }
      settled = true;
      gatewayHandshakePromise = null;
      reject(error);
    };
    const onSettledSuccess = () => {
      if (settled) {
        return;
      }
      settled = true;
      gatewayHandshakePromise = null;
      resolve();
    };

    setChatStatus("Connecting chat websocket...");
    const ws = new WebSocket(socketUrl);
    gatewaySocket = ws;
    gatewaySocketReady = false;
    gatewayConnectRequestId = null;

    const connectTimer = setTimeout(() => {
      onSettledError(new Error("Timed out connecting to gateway websocket."));
      closeGatewaySocket("Timed out connecting to gateway websocket.");
    }, 10_000);

    ws.addEventListener("message", (event) => {
      handleGatewaySocketMessage(event.data);
      if (!settled && gatewaySocketReady) {
        clearTimeout(connectTimer);
        onSettledSuccess();
      }
    });

    ws.addEventListener("close", () => {
      if (!settled) {
        clearTimeout(connectTimer);
        onSettledError(new Error("Gateway websocket closed before connect completed."));
      }
      if (gatewaySocket === ws) {
        gatewaySocket = null;
      }
      gatewaySocketReady = false;
      gatewayConnectRequestId = null;
      clearGatewayPendingRequests(new Error("Gateway websocket closed."));
      setChatStatus("Chat disconnected.");
    });

    ws.addEventListener("error", () => {
      if (!settled) {
        clearTimeout(connectTimer);
        onSettledError(new Error("Gateway websocket connection failed."));
      }
    });
  });

  return gatewayHandshakePromise;
}

async function gatewayRpc(method, params) {
  await ensureGatewaySocketConnected();
  if (!gatewaySocket || gatewaySocket.readyState !== WebSocket.OPEN || !gatewaySocketReady) {
    throw new Error("Gateway websocket is not connected.");
  }
  const id = nextGatewayRequestId();
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      gatewayPendingRequests.delete(id);
      reject(new Error(`${method} timed out.`));
    }, 20_000);
    gatewayPendingRequests.set(id, { resolve, reject, timer, method });
    gatewaySocket.send(
      JSON.stringify({
        type: "req",
        id,
        method,
        params,
      }),
    );
  });
}

async function loadChatHistory() {
  const sessionKey = resolveChatSessionKey();
  if (!sessionKey) {
    return;
  }
  const history = await gatewayRpc("chat.history", {
    sessionKey,
    limit: 30,
  });
  clearChatLog();
  const messages = Array.isArray(history?.messages) ? history.messages : [];
  for (const message of messages) {
    if (!message || typeof message !== "object") {
      continue;
    }
    const role = typeof message.role === "string" ? message.role : "";
    if (role !== "user" && role !== "assistant") {
      continue;
    }
    const text =
      role === "assistant"
        ? extractAssistantText(message)
        : extractUserText(message);
    if (text) {
      appendChatLine(role, text);
      if (role === "user") {
        const idempotencyKey =
          typeof message.idempotencyKey === "string" ? message.idempotencyKey.trim() : "";
        if (isVoiceRunId(idempotencyKey)) {
          renderedVoiceUserRuns.add(idempotencyKey);
        }
      }
    }
  }
}

function clearRemoteTiles() {
  if (isAvatarPictureInPictureActive()) {
    void exitAvatarPictureInPicture().catch(() => {});
  }
  if (!avatarMediaEl) {
    unbindAvatarPictureInPictureVideo();
    updateAvatarAspectRatio(null);
    updateAvatarUiState();
    return;
  }
  for (const mediaElement of avatarMediaEl.querySelectorAll("video, audio")) {
    mediaElement.remove();
  }
  unbindAvatarPictureInPictureVideo();
  updateAvatarAspectRatio(null);
  updateAvatarUiState();
}

function getRemoteMediaContainer(participantIdentity) {
  if (!avatarMediaEl || !isAvatarParticipantIdentity(participantIdentity)) {
    return null;
  }
  return avatarMediaEl;
}

function attachTrackToContainer(track, container) {
  if (!container) {
    return;
  }
  const element = track.attach();
  element.autoplay = true;
  element.playsInline = true;
  if (track.kind === "video") {
    const priorVideo = container.querySelector("video");
    if (priorVideo) {
      unbindAvatarPictureInPictureVideo(priorVideo);
      priorVideo.remove();
    }
    if (element instanceof HTMLVideoElement) {
      const updateRatio = () => {
        updateAvatarAspectRatio(element);
      };
      element.addEventListener("loadedmetadata", updateRatio);
      element.addEventListener("resize", updateRatio);
      bindAvatarPictureInPictureVideo(element);
      updateRatio();
    }
  }
  if (track.kind === "audio") {
    const priorAudio = container.querySelector("audio");
    if (priorAudio) {
      priorAudio.remove();
    }
  }
  container.appendChild(element);
  applyAvatarSpeakerMuteState();
  updateAvatarUiState();
}

function detachTrack(track) {
  const elements = track.detach();
  for (const element of elements) {
    element.remove();
  }
}

function releaseLocalTracks() {
  if (localAudioTrack) {
    try {
      localAudioTrack.stop();
      detachTrack(localAudioTrack);
    } catch {}
  }
  localAudioTrack = null;
}

function updateRoomButtons() {
  const hasSession = Boolean(activeSession);
  const hasRoom = Boolean(activeRoom);
  if (connectRoomButton) {
    connectRoomButton.disabled = !hasSession || hasRoom;
  }
  if (leaveRoomButton) {
    leaveRoomButton.disabled = !hasRoom;
  }
  if (toggleMicButton) {
    const micMuted = Boolean(localAudioTrack?.isMuted);
    toggleMicButton.disabled = !hasRoom || !localAudioTrack;
    toggleMicButton.classList.toggle("is-muted", micMuted);
    toggleMicButton.setAttribute("aria-label", micMuted ? "Unmute microphone" : "Mute microphone");
    toggleMicButton.setAttribute("title", micMuted ? "Unmute microphone" : "Mute microphone");
  }
  if (toggleSpeakerButton) {
    toggleSpeakerButton.disabled = !hasRoom;
    toggleSpeakerButton.classList.toggle("is-muted", avatarSpeakerMuted);
    toggleSpeakerButton.setAttribute("aria-label", avatarSpeakerMuted ? "Unmute speaker" : "Mute speaker");
    toggleSpeakerButton.setAttribute("title", avatarSpeakerMuted ? "Unmute speaker" : "Mute speaker");
  }
  updatePictureInPictureButtonState();
}

function removeParticipantTile(participantIdentity) {
  if (!isAvatarParticipantIdentity(participantIdentity)) {
    return;
  }
  clearRemoteTiles();
}

async function publishLocalTracks(room) {
  if (!LIVEKIT) {
    throw new Error("LiveKit client library did not load");
  }
  const tracks = await LIVEKIT.createLocalTracks({
    audio: true,
    video: false,
  });
  for (const track of tracks) {
    await room.localParticipant.publishTrack(track);
    if (track.kind === "audio") {
      localAudioTrack = track;
    }
  }
}

function bindRoomEvents(room) {
  if (!LIVEKIT) {
    return;
  }
  room.on(LIVEKIT.RoomEvent.DataReceived, (payload, participant, kind, topic) => {
    void participant;
    void kind;
    handleLiveKitDataMessage(payload, topic);
  });
  room.on(LIVEKIT.RoomEvent.TrackSubscribed, (track, publication, participant) => {
    void publication;
    const container = getRemoteMediaContainer(participant.identity);
    attachTrackToContainer(track, container);
    updateRoomButtons();
  });
  room.on(LIVEKIT.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
    void publication;
    detachTrack(track);
    updateAvatarUiState();
    const hasSubscribedTracks = Array.from(participant.trackPublications.values()).some(
      (item) => Boolean(item.track),
    );
    if (!hasSubscribedTracks) {
      removeParticipantTile(participant.identity);
    }
  });
  room.on(LIVEKIT.RoomEvent.ParticipantDisconnected, (participant) => {
    removeParticipantTile(participant.identity);
  });
  room.on(LIVEKIT.RoomEvent.ConnectionStateChanged, (state) => {
    roomConnectionState =
      typeof state === "string" && state.trim() ? state.trim().toLowerCase() : "disconnected";
    updateRoomStatusState();
  });
  room.on(LIVEKIT.RoomEvent.Disconnected, () => {
    if (activeRoom !== room) {
      return;
    }
    roomConnectionState = "disconnected";
    activeRoom = null;
    setAvatarLoadingState(false);
    releaseLocalTracks();
    clearRemoteTiles();
    updateRoomButtons();
  });
}

async function connectToRoom() {
  if (!activeSession) {
    throw new Error("Start a session first.");
  }
  if (!LIVEKIT) {
    throw new Error(
      "LiveKit client failed to load. Check internet access to cdn.jsdelivr.net and reload page.",
    );
  }
  if (activeRoom) {
    return;
  }

  const connectGeneration = ++roomConnectGeneration;
  roomConnectionState = "connecting";
  setAvatarLoadingState(false);
  updateRoomStatusState();
  const room = new LIVEKIT.Room({
    adaptiveStream: true,
    dynacast: true,
  });

  bindRoomEvents(room);

  try {
    await room.connect(activeSession.livekitUrl, activeSession.participantToken);
    if (connectGeneration !== roomConnectGeneration || !activeSession) {
      try {
        room.disconnect();
      } catch {}
      roomConnectionState = "disconnected";
      releaseLocalTracks();
      updateRoomButtons();
      return;
    }
    activeRoom = room;
    roomConnectionState = "connected";
    clearRemoteTiles();
    setAvatarLoadingState(false);
    updateRoomStatusState();
    await publishLocalTracks(room);
    if (connectGeneration !== roomConnectGeneration || !activeSession || activeRoom !== room) {
      try {
        room.disconnect();
      } catch {}
      if (activeRoom === room) {
        activeRoom = null;
      }
      roomConnectionState = "disconnected";
      setAvatarLoadingState(false);
      releaseLocalTracks();
      clearRemoteTiles();
      updateRoomButtons();
      return;
    }

    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (!publication.track) {
          continue;
        }
        const container = getRemoteMediaContainer(participant.identity);
        attachTrackToContainer(publication.track, container);
      }
    }
    updateRoomButtons();
  } catch (error) {
    roomConnectionState = "disconnected";
    setAvatarLoadingState(false);
    try {
      room.disconnect();
    } catch {}
    if (activeRoom === room) {
      activeRoom = null;
    }
    releaseLocalTracks();
    updateRoomButtons();
    throw error;
  }
}

function disconnectRoom() {
  roomConnectGeneration += 1;
  roomConnectionState = "disconnected";
  setAvatarLoadingState(false);
  if (!activeRoom) {
    releaseLocalTracks();
    clearRemoteTiles();
    updateRoomButtons();
    return;
  }
  try {
    activeRoom.disconnect();
  } catch {}
  activeRoom = null;
  releaseLocalTracks();
  clearRemoteTiles();
  updateRoomButtons();
}

async function stopActiveSession() {
  const session = activeSession;
  disconnectRoom();
  activeSession = null;
  updateAvatarUiState();
  updateRoomButtons();
  updateChatControls();
  clearChatLog();
  setChatStatus("Start a session to use text chat.");

  if (!session?.roomName) {
    setOutput({ action: "session-stopped" });
    return;
  }

  try {
    await requestJson("/plugins/video-chat/api/session/stop", {
      method: "POST",
      body: JSON.stringify({ roomName: session.roomName }),
    });
    setOutput({ action: "session-stopped", roomName: session.roomName });
  } catch (error) {
    setOutput({
      action: "session-stop-failed",
      roomName: session.roomName,
      error: String(error),
    });
  }
}

async function requestJson(path, options = {}) {
  const hasBody = options.body !== undefined && options.body !== null;
  const response = await fetch(path, {
    headers: {
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...getAuthHeaders(),
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    if (response.status === 401) {
      throw new Error("Unauthorized: enter a valid gateway token.");
    }
    const message = payload?.error?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

function setupStatusLabel(setup) {
  if (!setup) {
    return "Setup status unavailable";
  }
  if (setup.configured) {
    return "Configured: all required keys are set.";
  }
  return `Missing: ${setup.missing.join(", ")}`;
}

function populateSetupFormFromSetupStatus(setup) {
  if (!setupForm) {
    return;
  }
  const livekitUrlField = setupForm.elements.namedItem("livekitUrl");
  const imageUrlField = setupForm.elements.namedItem("lemonSliceImageUrl");
  const elevenLabsVoiceIdField = setupForm.elements.namedItem("elevenLabsVoiceId");
  if (livekitUrlField && typeof livekitUrlField.value === "string") {
    livekitUrlField.value = normalizeOptionalInputValue(setup?.livekit?.url);
  }
  if (imageUrlField && typeof imageUrlField.value === "string") {
    imageUrlField.value = normalizeOptionalInputValue(setup?.lemonSlice?.imageUrl);
  }
  if (elevenLabsVoiceIdField && typeof elevenLabsVoiceIdField.value === "string") {
    elevenLabsVoiceIdField.value = normalizeOptionalInputValue(setup?.tts?.elevenLabsVoiceId);
  }
}

function syncSetupEditorsFromCurrentForm() {
  updateSensitiveFieldMasking(latestSetupStatus);
  syncRawFromForm();
  snapshotSetupFormBaseline();
  snapshotSetupRawBaseline();
  updateSetupSaveButtonState();
}

async function saveSetupPayload(body) {
  const payload = await requestJson("/plugins/video-chat/api/setup", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (statusEl) {
    statusEl.textContent = setupStatusLabel(payload.setup);
  }
  latestSetupStatus = payload.setup ?? null;
  setGatewayHealthStatus("ok", "OK");
  updateKeysHealthFromSetup(payload.setup);
  populateSetupFormFromSetupStatus(payload.setup);
  secretEditState.clear();
  syncSetupEditorsFromCurrentForm();
  setOutput({ action: "setup-saved", setup: payload.setup });
  return payload;
}

async function refreshSetupStatus() {
  if (!hasGatewayToken()) {
    latestSetupStatus = null;
    secretEditState.clear();
    syncSetupEditorsFromCurrentForm();
    if (statusEl) {
      statusEl.textContent = "Enter a gateway token above, then click Use Token.";
    }
    setGatewayHealthStatus("warn", "Token Missing");
    setKeysHealthStatus("warn", "Needs Token");
    return;
  }
  if (statusEl) {
    statusEl.textContent = "Loading setup status...";
  }
  setGatewayHealthStatus("warn", "Checking");
  setKeysHealthStatus("warn", "Checking");
  try {
    const payload = await requestJson("/plugins/video-chat/api/setup");
    latestSetupStatus = payload.setup ?? null;
    if (statusEl) {
      statusEl.textContent = setupStatusLabel(payload.setup);
    }
    setGatewayHealthStatus("ok", "OK");
    updateKeysHealthFromSetup(payload.setup);
    populateSetupFormFromSetupStatus(payload.setup);
    syncSetupEditorsFromCurrentForm();
  } catch (error) {
    latestSetupStatus = null;
    syncSetupEditorsFromCurrentForm();
    const message = error instanceof Error ? error.message : "Failed to load status";
    if (statusEl) {
      statusEl.textContent = message;
    }
    if (message.toLowerCase().includes("unauthorized")) {
      setGatewayHealthStatus("warn", "Unauthorized");
      setKeysHealthStatus("warn", "Needs Auth");
    } else {
      setGatewayHealthStatus("danger", "Error");
      setKeysHealthStatus("danger", "Unknown");
    }
  }
}

if (setupForm) {
  setupForm.addEventListener("input", () => {
    updateSetupSaveButtonState();
  });
  setupForm.addEventListener("change", () => {
    updateSetupSaveButtonState();
  });

  for (const input of sensitiveFieldInputs) {
    input.addEventListener("copy", preventSensitiveCopy);
    input.addEventListener("cut", preventSensitiveCopy);
  }
  for (const button of sensitiveFieldReplaceButtons) {
    button.addEventListener("click", () => {
      const fieldName = button.getAttribute("data-replace-secret");
      if (!fieldName || !setupForm) {
        return;
      }
      if (secretEditState.has(fieldName)) {
        secretEditState.delete(fieldName);
      } else {
        secretEditState.add(fieldName);
      }
      updateSensitiveFieldMasking(latestSetupStatus);
      const input = setupForm.elements.namedItem(fieldName);
      if (input && !input.disabled) {
        input.value = "";
        input.focus();
      }
      updateSetupSaveButtonState();
    });
  }

  setupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(setupForm);
    const body = Object.fromEntries(formData.entries());
    try {
      await saveSetupPayload(body);
    } catch (error) {
      setGatewayHealthStatus("danger", "Error");
      setOutput({ action: "setup-save-failed", error: String(error) });
    }
  });

  snapshotSetupFormBaseline();
  syncRawFromForm();
  snapshotSetupRawBaseline();
  updateSetupSaveButtonState();
}

if (setupRawInput) {
  setupRawInput.addEventListener("input", () => {
    setSetupRawError("");
    updateSetupSaveButtonState();
  });
}

if (setupRawForm) {
  setupRawForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const body = parseSetupPayloadFromRaw(setupRawInput?.value ?? "");
      await saveSetupPayload(body);
    } catch (error) {
      setGatewayHealthStatus("danger", "Error");
      const message = error instanceof Error ? error.message : String(error);
      setSetupRawError(message);
      setOutput({ action: "setup-save-failed", error: message });
    }
  });
}

if (configModeButtons.length) {
  for (const button of configModeButtons) {
    button.addEventListener("click", () => {
      const nextMode = button.getAttribute("data-config-mode") || "form";
      setConfigMode(nextMode);
    });
  }
  setConfigMode("form", { sync: false });
}

if (sessionForm) {
  sessionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(sessionForm);
    const sessionKey = String(formData.get("sessionKey") || "").trim();
    roomConnectionState = "disconnected";
    clearRemoteTiles();
    setAvatarLoadingState(true, SESSION_STARTING_STATUS);
    try {
      const payload = await requestJson("/plugins/video-chat/api/session", {
        method: "POST",
        body: JSON.stringify({ sessionKey }),
      });
      activeSession = payload.session;
      setChatPaneOpen(true);
      setOutput({ action: "session-started", session: activeSession });
      updateRoomButtons();
      updateChatControls();
      try {
        await ensureGatewaySocketConnected();
        await loadChatHistory();
        setChatStatus(`Text chat ready for ${resolveChatSessionKey()}.`);
      } catch (chatError) {
        setChatStatus(chatError instanceof Error ? chatError.message : "Failed to initialize chat.");
        appendChatLine("system", "Text chat initialization failed.");
      }
      await connectToRoom();
    } catch (error) {
      setAvatarLoadingState(false);
      setOutput({ action: "session-start-failed", error: String(error) });
    }
  });
}

if (stopSessionButton) {
  stopSessionButton.addEventListener("click", async () => {
    await stopActiveSession();
  });
}

if (connectRoomButton) {
  connectRoomButton.addEventListener("click", async () => {
    try {
      await connectToRoom();
      setOutput({ action: "room-connected", roomName: activeSession?.roomName ?? null });
    } catch (error) {
      setOutput({ action: "room-connect-failed", error: String(error) });
    }
  });
}

if (leaveRoomButton) {
  leaveRoomButton.addEventListener("click", () => {
    disconnectRoom();
    setOutput({ action: "room-left" });
  });
}

if (toggleMicButton) {
  toggleMicButton.addEventListener("click", async () => {
    if (!localAudioTrack) {
      return;
    }
    try {
      if (localAudioTrack.isMuted) {
        await localAudioTrack.unmute();
      } else {
        await localAudioTrack.mute();
      }
      updateRoomButtons();
    } catch (error) {
      setOutput({ action: "mic-toggle-failed", error: String(error) });
    }
  });
}

if (toggleSpeakerButton) {
  toggleSpeakerButton.addEventListener("click", () => {
    avatarSpeakerMuted = !avatarSpeakerMuted;
    applyAvatarSpeakerMuteState();
    updateRoomButtons();
  });
}

if (togglePictureInPictureButton) {
  togglePictureInPictureButton.addEventListener("click", async () => {
    try {
      if (isAvatarPictureInPictureActive()) {
        await exitAvatarPictureInPicture();
      } else {
        await enterAvatarPictureInPicture();
      }
      updatePictureInPictureButtonState();
      setOutput({
        action: "avatar-picture-in-picture",
        active: isAvatarPictureInPictureActive(),
      });
    } catch (error) {
      setOutput({
        action: "avatar-picture-in-picture-failed",
        error: String(error),
      });
    }
  });
}

if (ttsForm) {
  const requestTts = async (text) => {
  try {
    const payload = await requestJson("/plugins/video-chat/api/tts", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    setOutput({ action: "tts-generated", provider: payload.provider, mimeType: payload.mimeType });
    if (typeof payload.data === "string" && payload.data.length > 0) {
      const audio = new Audio(`data:${payload.mimeType || "audio/mpeg"};base64,${payload.data}`);
      await audio.play().catch(() => {});
    }
  } catch (error) {
    setOutput({ action: "tts-failed", error: String(error) });
  }
  };

  if (ttsForm instanceof HTMLFormElement) {
    ttsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(ttsForm);
      await requestTts(String(formData.get("text") || ""));
    });
  }

  if (ttsGenerateButton) {
    ttsGenerateButton.addEventListener("click", async () => {
      const text = typeof ttsTextInput?.value === "string" ? ttsTextInput.value : "";
      await requestTts(text);
    });
  }
}

if (chatForm) {
  chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = String(chatInput.value || "").trim();
  if (!message) {
    return;
  }
  const sessionKey = resolveChatSessionKey();
  if (!sessionKey) {
    appendChatLine("system", "Start a session before sending chat messages.");
    return;
  }
  const idempotencyKey = `video-chat-ui-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  setChatPaneOpen(true);
  appendChatLine("user", message);
  chatInput.value = "";
  setChatStatus("Sending message...");
  try {
    const response = await gatewayRpc("chat.send", {
      sessionKey,
      message,
      idempotencyKey,
    });
    setOutput({ action: "chat-sent", sessionKey, response });
    setChatStatus("Awaiting agent reply...");
  } catch (error) {
    appendChatLine("system", error instanceof Error ? error.message : "Chat send failed.");
    setOutput({ action: "chat-send-failed", error: String(error) });
    setChatStatus("Chat send failed.");
  }
  });
}

if (reloadButton) {
  reloadButton.addEventListener("click", () => {
    refreshSetupStatus().catch(() => {});
  });
}

if (tokenForm) {
  tokenForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const token = String(tokenInput?.value || "").trim();
    if (token) {
      persistGatewayToken(token);
    } else if (!hasGatewayToken()) {
      clearGatewayToken();
    }
    window.location.reload();
  });
}

if (tokenInput) {
  tokenInput.addEventListener("copy", preventSensitiveCopy);
  tokenInput.addEventListener("cut", preventSensitiveCopy);
}

if (replaceTokenButton) {
  replaceTokenButton.addEventListener("click", () => {
    tokenEditMode = !tokenEditMode;
    updateTokenFieldMasking();
    if (tokenEditMode && tokenInput) {
      tokenInput.value = "";
      tokenInput.focus();
    }
  });
}

if (clearTokenButton) {
  clearTokenButton.addEventListener("click", async () => {
    await stopActiveSession();
    closeGatewaySocket("Gateway token cleared.");
    clearGatewayToken();
    if (tokenInput) {
      tokenInput.value = "";
    }
    tokenEditMode = false;
    updateTokenFieldMasking();
    updateRoomButtons();
    updateChatControls();
    clearChatLog();
    setChatStatus("Enter a gateway token to use text chat.");
    setGatewayHealthStatus("warn", "Token Missing");
    setKeysHealthStatus("warn", "Needs Token");
    if (statusEl) {
      statusEl.textContent = "Gateway token cleared. Enter a token to continue.";
    }
    setOutput({ action: "gateway-token-cleared" });
  });
}

migrateLegacyGatewayTokenIfNeeded();
initNavCollapseToggle();
initChatPane();
initAvatarPaneResize();
applyAvatarSpeakerMuteState();
updateTokenFieldMasking();
initThemeToggle();
initConfigSectionFiltering();
updateRoomButtons();
updateChatControls();
clearChatLog();
updateAvatarUiState();

if (hasGatewayToken()) {
  setGatewayHealthStatus("warn", "Checking");
  setKeysHealthStatus("warn", "Checking");
  refreshSetupStatus().catch(() => {});
  setChatStatus("Start a session to use text chat.");
} else {
  if (statusEl) {
    statusEl.textContent = "Enter a gateway token above, then click Use Token.";
  }
  setGatewayHealthStatus("warn", "Token Missing");
  setKeysHealthStatus("warn", "Needs Token");
  setChatStatus("Enter a gateway token to use text chat.");
}

updateRoomStatusState();
