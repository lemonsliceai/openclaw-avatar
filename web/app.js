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
const avatarMessageOverlayEl = document.getElementById("avatar-message-overlay");
const avatarPlaceholderEl = document.getElementById("avatar-placeholder");
const avatarPlaceholderStatusEl = document.getElementById("avatar-placeholder-status");
const avatarPlaceholderStatusDotEl = document.getElementById("avatar-placeholder-status-dot");
const avatarPlaceholderStatusTextEl = document.getElementById("avatar-placeholder-status-text");
const avatarPictureInPictureReturnButton = document.getElementById("avatar-pip-return");
const avatarToolbarStatusDotEl = document.getElementById("avatar-toolbar-status-dot");
const avatarToolbarStatusEl = document.getElementById("avatar-toolbar-status");
const avatarResizeHandleEl = document.getElementById("avatar-resize-handle");
const connectRoomButton = document.getElementById("connect-room");
const reconnectRoomButton = document.getElementById("reconnect-room");
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
const MIC_MUTED_STORAGE_KEY = "videoChat.microphoneMuted";
const AVATAR_SPEAKER_MUTED_STORAGE_KEY = "videoChat.avatarSpeakerMuted";
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
const AVATAR_PANE_MIN_WIDTH = 0;
const AVATAR_PANE_MAX_WIDTH = 1200;
const AVATAR_PIP_DEFAULT_ASPECT_RATIO = 16 / 9;
const AVATAR_PIP_HORIZONTAL_PADDING = 20;
const AVATAR_PIP_VERTICAL_PADDING = 20;
const AVATAR_PIP_TOOLBAR_HEIGHT = 72;
const AVATAR_PIP_MAX_VIDEO_HEIGHT = 560;
const AVATAR_PIP_END_CALL_ICON_URL = "https://unpkg.com/lucide-static@0.321.0/icons/phone-off.svg";
const AVATAR_PARTICIPANT_IDENTITY = "lemonslice-avatar-agent";
const SESSION_STARTING_STATUS = "Starting session...";
const AVATAR_LOADING_STATUS = "Avatar loading...";
const AVATAR_RECONNECTING_STATUS = "Reconnecting avatar...";
const VOICE_CHAT_RUN_ID_PREFIX = "video-chat-agent-";
const VOICE_TRANSCRIPT_EVENT_TOPIC = "video-chat.user-transcript";
const VOICE_TRANSCRIPT_EVENT_TYPE = "video-chat.user-transcript";

let activeSession = null;
let activeRoom = null;
let localAudioTrack = null;
let roomConnectGeneration = 0;
let roomConnectionState = LIVEKIT ? "disconnected" : "failed";
let avatarConnectionState = "idle";
let avatarLoadPending = false;
let avatarLoadMessage = "";
let preferredMicMuted = false;
let avatarSpeakerMuted = false;
let avatarDocumentPictureInPictureWindow = null;
let avatarDocumentPictureInPictureCleanup = null;
let avatarDocumentPictureInPictureElements = null;
let avatarPictureInPictureVideo = null;
const avatarMessageOverlayState = {
  fadeFrame: null,
  hideTimer: null,
};
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
const chatMessages = [];
let chatAwaitingReply = false;

function isTextAreaElement(element) {
  return Boolean(element && typeof element === "object" && element.nodeType === 1 && element.tagName === "TEXTAREA");
}

function isButtonElement(element) {
  return Boolean(element && typeof element === "object" && element.nodeType === 1 && element.tagName === "BUTTON");
}

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
  const avatarToolbarStatus = getAvatarToolbarStatusState();
  if (avatarToolbarStatusDotEl) {
    avatarToolbarStatusDotEl.classList.remove("ok", "warn", "danger");
    avatarToolbarStatusDotEl.classList.add(avatarToolbarStatus.tone);
  }
  if (avatarToolbarStatusEl) {
    avatarToolbarStatusEl.textContent = avatarToolbarStatus.text;
    avatarToolbarStatusEl.title = avatarToolbarStatus.text;
  }
  if (avatarPlaceholderStatusEl) {
    avatarPlaceholderStatusEl.title = avatarToolbarStatus.text;
  }
  if (avatarPlaceholderStatusTextEl) {
    avatarPlaceholderStatusTextEl.textContent = avatarToolbarStatus.text;
    avatarPlaceholderStatusTextEl.title = avatarToolbarStatus.text;
  }
  if (avatarPlaceholderStatusDotEl) {
    avatarPlaceholderStatusDotEl.classList.remove("ok", "warn", "danger");
    avatarPlaceholderStatusDotEl.classList.add(avatarToolbarStatus.tone);
  }
  if (avatarDocumentPictureInPictureElements?.statusEl) {
    avatarDocumentPictureInPictureElements.statusEl.textContent = avatarToolbarStatus.text;
    avatarDocumentPictureInPictureElements.statusEl.title = avatarToolbarStatus.text;
  }
  if (avatarDocumentPictureInPictureElements?.statusDotEl) {
    avatarDocumentPictureInPictureElements.statusDotEl.classList.remove("ok", "warn", "danger");
    avatarDocumentPictureInPictureElements.statusDotEl.classList.add(avatarToolbarStatus.tone);
  }
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

function setAvatarConnectionState(nextState) {
  avatarConnectionState =
    typeof nextState === "string" && nextState.trim() ? nextState.trim().toLowerCase() : "idle";
}

function hasReconnectableSession() {
  if (!activeSession || avatarLoadPending) {
    return false;
  }
  const normalizedConnectionState =
    typeof roomConnectionState === "string" ? roomConnectionState.trim().toLowerCase() : "";
  return (
    !activeRoom ||
    normalizedConnectionState === "disconnected" ||
    avatarConnectionState === "disconnected"
  );
}

function getAvatarToolbarStatusState() {
  const normalizedConnectionState =
    typeof roomConnectionState === "string" ? roomConnectionState.trim().toLowerCase() : "";

  if (avatarConnectionState === "disconnected") {
    return { text: "Disconnected", tone: "danger" };
  }

  if (activeRoom && normalizedConnectionState === "connected" && hasAvatarVideo()) {
    return { text: "Connected", tone: "ok" };
  }

  if (
    avatarLoadPending ||
    avatarConnectionState === "connecting" ||
    activeSession ||
    (activeRoom && normalizedConnectionState && normalizedConnectionState !== "disconnected")
  ) {
    return { text: "Connecting...", tone: "warn" };
  }

  return { text: "Disconnected", tone: "danger" };
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

function getStoredBooleanPreference(key, fallback = false) {
  try {
    const stored = localStorage.getItem(key);
    if (stored === "1" || stored === "true") {
      return true;
    }
    if (stored === "0" || stored === "false") {
      return false;
    }
  } catch {
    // Ignore storage failures.
  }
  return fallback;
}

function persistBooleanPreference(key, value) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Ignore storage failures.
  }
}

function loadMediaPreferences() {
  preferredMicMuted = getStoredBooleanPreference(MIC_MUTED_STORAGE_KEY);
  avatarSpeakerMuted = getStoredBooleanPreference(AVATAR_SPEAKER_MUTED_STORAGE_KEY);
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
  chatStatusEl.title = text;
}

function applyAvatarMessageOverlayStyles(element) {
  if (!element) {
    return;
  }
  element.style.position = "absolute";
  element.style.inset = "0";
  element.style.zIndex = "2";
  element.style.pointerEvents = "none";
  element.style.overflow = "hidden";
}

function applyAvatarMessageBubbleStyles(element) {
  if (!element) {
    return;
  }
  element.style.position = "absolute";
  element.style.left = "24px";
  element.style.bottom = "16%";
  element.style.transform = "none";
  element.style.width = "min(78%, 34rem)";
  element.style.padding = "12px 16px";
  element.style.borderRadius = "18px";
  element.style.border = "1px solid rgba(255, 255, 255, 0.14)";
  element.style.background = "rgba(15, 23, 42, 0.78)";
  element.style.backdropFilter = "blur(12px)";
  element.style.color = "#f8fafc";
  element.style.fontSize = "clamp(14px, 1.5vw, 17px)";
  element.style.lineHeight = "1.4";
  element.style.textAlign = "left";
  element.style.boxShadow = "0 18px 38px rgba(2, 6, 23, 0.4)";
  element.style.opacity = "0";
  element.style.transition = "opacity 260ms ease, transform 260ms ease";
  element.style.wordBreak = "break-word";
}

function clearAvatarMessageOverlayState(overlayEl, state = {}) {
  if (state.hideTimer) {
    clearTimeout(state.hideTimer);
    state.hideTimer = null;
  }
  if (state.fadeFrame) {
    state.fadeFrame.cancel();
    state.fadeFrame = null;
  }
  overlayEl?.replaceChildren();
}

function createAnimationFrameHandle(view, callback) {
  const frameView = view && typeof view.requestAnimationFrame === "function" ? view : window;
  const frameId = frameView.requestAnimationFrame(callback);
  return {
    cancel() {
      frameView.cancelAnimationFrame?.(frameId);
    },
  };
}

function animateAvatarSentMessage(message, options = {}) {
  const normalizedMessage = typeof message === "string" ? message.trim() : "";
  if (!normalizedMessage) {
    return;
  }

  const sourceInput = isTextAreaElement(options.sourceInput) ? options.sourceInput : null;
  const sourceDocument = sourceInput?.ownerDocument || document;
  const sourceWindow = sourceDocument.defaultView || window;
  const shouldTargetPictureInPictureOverlay =
    sourceDocument === document &&
    Boolean(avatarDocumentPictureInPictureElements?.messageOverlayEl) &&
    (avatarPaneEl?.hidden || avatarPaneEl?.classList.contains("avatar-pane--document-picture-in-picture-active"));
  const overlayEl = shouldTargetPictureInPictureOverlay
    ? avatarDocumentPictureInPictureElements?.messageOverlayEl
    : sourceDocument === document
      ? avatarMessageOverlayEl
      : avatarDocumentPictureInPictureElements?.messageOverlayEl;
  const overlayState = overlayEl === avatarMessageOverlayEl
    ? avatarMessageOverlayState
    : avatarDocumentPictureInPictureElements?.messageOverlayState;
  const overlayDocument = overlayEl?.ownerDocument || sourceDocument;
  const overlayWindow = overlayDocument.defaultView || sourceWindow;

  if (!overlayEl || !overlayState) {
    return;
  }

  applyAvatarMessageOverlayStyles(overlayEl);
  clearAvatarMessageOverlayState(overlayEl, overlayState);

  const bubbleEl = overlayDocument.createElement("div");
  bubbleEl.className = "avatar-message-overlay__bubble";
  bubbleEl.textContent = normalizedMessage;
  applyAvatarMessageBubbleStyles(bubbleEl);
  overlayEl.appendChild(bubbleEl);

  const revealBubble = () => {
    bubbleEl.classList.add("is-visible");
    bubbleEl.style.transition = "opacity 260ms ease, transform 260ms ease";
    bubbleEl.style.opacity = "1";
    bubbleEl.style.transform = "none";
    overlayState.hideTimer = overlayWindow.setTimeout(() => {
      bubbleEl.classList.add("is-fading");
      bubbleEl.style.opacity = "0";
      bubbleEl.style.transform = "translateY(-10px)";
      overlayState.hideTimer = overlayWindow.setTimeout(() => {
        if (overlayEl.contains(bubbleEl)) {
          bubbleEl.remove();
        }
        overlayState.hideTimer = null;
      }, 320);
    }, 3000);
  };

  if (!sourceInput || sourceDocument !== overlayDocument) {
    revealBubble();
    return;
  }

  const overlayRect = overlayEl.getBoundingClientRect();
  const bubbleRect = bubbleEl.getBoundingClientRect();
  const sourceRect = sourceInput.getBoundingClientRect();
  if (overlayRect.width <= 0 || overlayRect.height <= 0 || sourceRect.width <= 0 || sourceRect.height <= 0) {
    revealBubble();
    return;
  }

  const targetLeft = bubbleRect.left;
  const targetTop = bubbleRect.top;
  const startLeft = sourceRect.left + 9;
  const startTop = sourceRect.top + Math.max(6, sourceRect.height - bubbleRect.height - 8);
  const deltaX = startLeft - targetLeft;
  const deltaY = startTop - targetTop;

  bubbleEl.style.opacity = "0";
  bubbleEl.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

  overlayState.fadeFrame = createAnimationFrameHandle(sourceWindow, () => {
    bubbleEl.style.transition =
      "transform 520ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease";
    bubbleEl.style.opacity = "1";
    bubbleEl.style.transform = "none";
    overlayState.fadeFrame = null;
  });

  overlayState.hideTimer = overlayWindow.setTimeout(() => {
    bubbleEl.classList.add("is-fading");
    bubbleEl.style.transition = "opacity 260ms ease, transform 260ms ease";
    bubbleEl.style.opacity = "0";
    bubbleEl.style.transform = "translateY(-10px)";
    overlayState.hideTimer = overlayWindow.setTimeout(() => {
      if (overlayEl.contains(bubbleEl)) {
        bubbleEl.remove();
      }
      overlayState.hideTimer = null;
    }, 320);
  }, 3520);
}

function setHealthStatus(dotEl, valueEl, tone, text) {
  if (!dotEl || !valueEl) {
    return;
  }
  dotEl.classList.remove("ok", "warn");
  if (tone === "ok" || tone === "warn" || tone === "danger") {
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

function isVideoElement(value) {
  return Boolean(value && typeof value === "object" && value.tagName === "VIDEO");
}

function isMediaElement(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      (value.tagName === "VIDEO" || value.tagName === "AUDIO"),
  );
}

function updateAvatarAspectRatio(videoElement) {
  if (!shellEl) {
    return;
  }
  if (
    !isVideoElement(videoElement) ||
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

function hasDocumentPictureInPictureSupport() {
  return Boolean(
    globalThis.documentPictureInPicture &&
      typeof globalThis.documentPictureInPicture.requestWindow === "function",
  );
}

function isAvatarDocumentPictureInPictureActive() {
  return Boolean(avatarDocumentPictureInPictureWindow && !avatarDocumentPictureInPictureWindow.closed);
}

function getAvatarVideoAspectRatio(videoElement = getAvatarVideoElement()) {
  if (
    isVideoElement(videoElement) &&
    Number.isFinite(videoElement.videoWidth) &&
    Number.isFinite(videoElement.videoHeight) &&
    videoElement.videoWidth > 0 &&
    videoElement.videoHeight > 0
  ) {
    return videoElement.videoWidth / videoElement.videoHeight;
  }
  return AVATAR_PIP_DEFAULT_ASPECT_RATIO;
}

function getAvatarPictureInPictureWindowSize(options = {}) {
  const aspectRatio = getAvatarVideoAspectRatio();
  const preferredWidth = Number(options.preferredWidth);
  const preferredHeight = Number(options.preferredHeight);
  const hasPreferredWidth = Number.isFinite(preferredWidth) && preferredWidth > 0;
  const hasPreferredHeight = Number.isFinite(preferredHeight) && preferredHeight > 0;

  let width = Math.round(Math.min(720, Math.max(380, avatarPaneEl?.getBoundingClientRect().width || 460)));
  let videoHeight = Math.round(width / aspectRatio);

  if (hasPreferredWidth && hasPreferredHeight) {
    const contentWidth = Math.max(1, preferredWidth - AVATAR_PIP_HORIZONTAL_PADDING);
    const contentHeight = Math.max(
      1,
      preferredHeight - AVATAR_PIP_TOOLBAR_HEIGHT - AVATAR_PIP_VERTICAL_PADDING,
    );
    const heightFromWidth = Math.round(contentWidth / aspectRatio);
    const widthFromHeight = Math.round(contentHeight * aspectRatio);
    const heightDelta = Math.abs(contentHeight - heightFromWidth);
    const widthDelta = Math.abs(contentWidth - widthFromHeight);

    if (heightDelta <= widthDelta) {
      width = contentWidth;
      videoHeight = heightFromWidth;
    } else {
      width = widthFromHeight;
      videoHeight = contentHeight;
    }
  } else if (hasPreferredWidth) {
    width = Math.max(1, preferredWidth - AVATAR_PIP_HORIZONTAL_PADDING);
    videoHeight = Math.round(width / aspectRatio);
  } else if (hasPreferredHeight) {
    videoHeight = Math.max(1, preferredHeight - AVATAR_PIP_TOOLBAR_HEIGHT - AVATAR_PIP_VERTICAL_PADDING);
    width = Math.round(videoHeight * aspectRatio);
  }

  if (!Number.isFinite(videoHeight) || videoHeight <= 0) {
    videoHeight = 280;
  }
  if (videoHeight > AVATAR_PIP_MAX_VIDEO_HEIGHT) {
    videoHeight = AVATAR_PIP_MAX_VIDEO_HEIGHT;
    width = Math.round(videoHeight * aspectRatio);
  }

  return {
    width: width + AVATAR_PIP_HORIZONTAL_PADDING,
    height: videoHeight + AVATAR_PIP_TOOLBAR_HEIGHT + AVATAR_PIP_VERTICAL_PADDING,
  };
}

function getAvatarDocumentPictureInPictureStyles() {
  return `
    :root {
      color-scheme: dark;
    }

    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: #020617;
    }

    body {
      box-sizing: border-box;
      padding: 10px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #e2e8f0;
    }

    .avatar-pane {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      position: relative;
      width: 100%;
      height: 100%;
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 20px;
      overflow: hidden;
      background: #030712;
      isolation: isolate;
      box-shadow: 0 18px 40px rgba(2, 6, 23, 0.36);
    }

    .avatar-toolbar {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
      padding: 12px;
      background: linear-gradient(180deg, rgba(2, 6, 23, 0.94) 0%, rgba(2, 6, 23, 0.88) 100%);
      border-bottom: 1px solid rgba(148, 163, 184, 0.16);
    }

    .avatar-toolbar__meta {
      min-width: 0;
      display: flex;
      align-items: center;
    }

    .avatar-toolbar__status-indicator {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .avatar-toolbar__status-dot {
      flex-shrink: 0;
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #f59e0b;
      box-shadow: 0 0 8px rgba(245, 158, 11, 0.45);
    }

    .avatar-toolbar__status-dot.ok {
      background: #22c55e;
      box-shadow: 0 0 8px rgba(34, 197, 94, 0.45);
    }

    .avatar-toolbar__status-dot.warn {
      background: #f59e0b;
      box-shadow: 0 0 8px rgba(245, 158, 11, 0.45);
    }

    .avatar-toolbar__status-dot.danger {
      background: #ef4444;
      box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
    }

    .avatar-toolbar__status {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
      font-weight: 600;
      color: #f8fafc;
      text-shadow: 0 1px 2px rgba(2, 6, 23, 0.5);
    }

    .avatar-media {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 0;
      display: grid;
      place-items: center;
      background: #030712;
    }

    .avatar-media::after {
      content: "";
      position: absolute;
      inset: auto 0 0 0;
      height: 120px;
      background: linear-gradient(180deg, rgba(2, 6, 23, 0) 0%, rgba(2, 6, 23, 0.18) 28%, rgba(2, 6, 23, 0.74) 100%);
      pointer-events: none;
      z-index: 1;
    }

    .avatar-media video {
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      display: block;
      object-fit: contain;
      background: #000;
      position: relative;
      z-index: 0;
    }

    .avatar-media audio {
      display: none;
    }

    .avatar-pip-chat-compose {
      position: absolute;
      left: 14px;
      right: 14px;
      bottom: 14px;
      z-index: 2;
      display: block;
      padding: 0;
      border: none;
      background: transparent;
      backdrop-filter: none;
      box-shadow: none;
    }

    .avatar-pip-chat-compose textarea {
      display: block;
      width: 100%;
      min-height: 44px;
      max-height: 96px;
      padding: 11px 52px 11px 14px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 20px;
      background: rgba(2, 6, 23, 0.56);
      backdrop-filter: blur(18px) saturate(140%);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.05),
        0 14px 32px rgba(2, 6, 23, 0.42);
      color: #f8fafc;
      font: inherit;
      font-size: 14px;
      line-height: 1.4;
      resize: none;
      overflow-y: auto;
      box-sizing: border-box;
    }

    .avatar-pip-chat-compose textarea::placeholder {
      color: rgba(226, 232, 240, 0.72);
    }

    .avatar-pip-chat-compose textarea:focus {
      outline: none;
      border-color: rgba(59, 130, 246, 0.42);
      box-shadow:
        0 0 0 0.5px rgba(59, 130, 246, 0.34),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }

    .avatar-pip-chat-compose textarea:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .avatar-pip-chat-compose button {
      position: absolute;
      right: 8px;
      top: 50%;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.62);
      backdrop-filter: blur(5px);
      color: #e2e8f0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transform: translateY(-50%);
      transition:
        opacity 120ms ease,
        transform 120ms ease,
        border-color 120ms ease,
        background 120ms ease;
    }

    .avatar-pip-chat-compose button:not([hidden]):hover {
      border-color: rgba(56, 189, 248, 0.55);
      background: rgba(14, 165, 233, 0.18);
      color: #38bdf8;
    }

    .avatar-pip-chat-compose button:not([hidden]):active {
      transform: translateY(-50%) scale(0.96);
    }

    .avatar-pip-chat-compose button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      box-shadow: none;
    }

    .avatar-pip-chat-compose button svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .avatar-pip-chat-compose button[hidden] {
      display: none;
    }

    .avatar-pip-chat-compose button.is-hidden {
      display: none;
    }

    .avatar-controls {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      align-self: stretch;
      flex-wrap: wrap;
      gap: 10px;
    }

    .avatar-control {
      appearance: none;
      width: 44px;
      height: 44px;
      padding: 0;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(15, 23, 42, 0.62);
      backdrop-filter: blur(5px);
      color: #e2e8f0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .avatar-control:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .avatar-control svg {
      width: 20px;
      height: 20px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .avatar-control.is-muted {
      color: #f87171;
    }

    .avatar-control.is-active {
      color: #38bdf8;
      border-color: rgba(56, 189, 248, 0.55);
      background: rgba(14, 165, 233, 0.18);
    }

    .avatar-control--danger {
      width: 44px;
      min-width: 44px;
      padding: 0;
      color: #f87171;
      border-color: rgba(248, 113, 113, 0.42);
      background: rgba(127, 29, 29, 0.36);
    }

    .avatar-control--danger svg {
      display: none;
    }

    .avatar-control--danger::before {
      content: "";
      width: 22px;
      height: 22px;
      display: block;
      background: currentColor;
      -webkit-mask: url("${AVATAR_PIP_END_CALL_ICON_URL}") center / contain no-repeat;
      mask: url("${AVATAR_PIP_END_CALL_ICON_URL}") center / contain no-repeat;
    }

    .avatar-resize-handle {
      display: none !important;
    }
  `;
}

function cloneAvatarControlButton(sourceButton, ownerDocument) {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = sourceButton?.className || "btn avatar-control";
  button.innerHTML = sourceButton?.innerHTML || "";
  return button;
}

function createAvatarDocumentPictureInPictureEndCallButton(ownerDocument) {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = "btn avatar-control avatar-control--danger";
  button.setAttribute("aria-label", "End session");
  button.setAttribute("title", "End session");
  button.innerHTML = "<svg aria-hidden=\"true\"></svg>";
  return button;
}

function syncAvatarDocumentPictureInPictureButtons() {
  if (!avatarDocumentPictureInPictureElements) {
    return;
  }
  const buttonPairs = [
    [reconnectRoomButton, avatarDocumentPictureInPictureElements.reconnectButton],
    [toggleMicButton, avatarDocumentPictureInPictureElements.micButton],
    [toggleSpeakerButton, avatarDocumentPictureInPictureElements.speakerButton],
  ];
  for (const [sourceButton, targetButton] of buttonPairs) {
    if (!sourceButton || !targetButton) {
      continue;
    }
    targetButton.className = sourceButton.className;
    targetButton.disabled = sourceButton.disabled;
    targetButton.setAttribute("aria-label", sourceButton.getAttribute("aria-label") || "");
    targetButton.setAttribute("title", sourceButton.getAttribute("title") || "");
    targetButton.setAttribute("aria-pressed", sourceButton.getAttribute("aria-pressed") || "false");
  }

  const { endSessionButton } = avatarDocumentPictureInPictureElements;
  if (endSessionButton) {
    const hasSession = Boolean(activeSession);
    const hasRoom = Boolean(activeRoom);
    endSessionButton.disabled = !hasSession && !hasRoom;
  }
}

function getAvatarDocumentPictureInPictureChatInput() {
  const chatInputEl = avatarDocumentPictureInPictureElements?.chatInput;
  return isTextAreaElement(chatInputEl) ? chatInputEl : null;
}

function syncTextareaHeight(textarea, options = {}) {
  if (!isTextAreaElement(textarea)) {
    return;
  }
  const minHeight = Number.isFinite(options.minHeight) ? options.minHeight : 40;
  const maxHeight = Number.isFinite(options.maxHeight) ? options.maxHeight : 150;
  textarea.style.height = "auto";
  const nextHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
  textarea.style.height = `${nextHeight}px`;
}

function syncChatInputHeight() {
  syncTextareaHeight(chatInput);
}

function setMainChatComposerValue(nextValue) {
  if (!isTextAreaElement(chatInput)) {
    return;
  }
  const normalizedValue = typeof nextValue === "string" ? nextValue : "";
  if (chatInput.value !== normalizedValue) {
    chatInput.value = normalizedValue;
  }
  syncChatInputHeight();
}

function setAvatarDocumentPictureInPictureChatComposerValue(nextValue) {
  const pipChatInput = getAvatarDocumentPictureInPictureChatInput();
  if (!pipChatInput) {
    return;
  }
  const normalizedValue = typeof nextValue === "string" ? nextValue : "";
  if (pipChatInput.value !== normalizedValue) {
    pipChatInput.value = normalizedValue;
  }
  syncTextareaHeight(getAvatarDocumentPictureInPictureChatInput(), {
    minHeight: 44,
    maxHeight: 96,
  });
}

function syncAvatarDocumentPictureInPictureChatComposer() {
  if (!avatarDocumentPictureInPictureElements) {
    return;
  }

  const { chatInput: pipChatInput, chatSendButton: pipChatSendButton } = avatarDocumentPictureInPictureElements;
  if (!isTextAreaElement(pipChatInput) || !isButtonElement(pipChatSendButton)) {
    return;
  }

  const hasSession = Boolean(activeSession);
  const disabledTitle = hasSession
    ? "Send message"
    : "Start a session before sending chat messages.";
  const hasDraft = Boolean(String(pipChatInput.value || "").trim());
  pipChatInput.disabled = !hasSession;
  pipChatInput.placeholder = hasSession ? "Message" : "Start a session to message";
  pipChatInput.title = disabledTitle;
  pipChatSendButton.disabled = !hasSession;
  pipChatSendButton.hidden = !hasDraft;
  pipChatSendButton.classList.toggle("is-hidden", !hasDraft);
  pipChatSendButton.setAttribute("aria-hidden", hasDraft ? "false" : "true");
  pipChatSendButton.title = hasSession ? "Send message" : disabledTitle;
  pipChatSendButton.setAttribute("aria-label", hasSession ? "Send message" : disabledTitle);
}

function syncAvatarDocumentPictureInPictureMedia() {
  if (!avatarDocumentPictureInPictureElements?.videoEl) {
    return;
  }
  const { videoEl } = avatarDocumentPictureInPictureElements;
  const sourceVideo = getAvatarVideoElement();
  if (!isVideoElement(sourceVideo)) {
    videoEl.pause?.();
    videoEl.srcObject = null;
    avatarDocumentPictureInPictureElements.captureSourceVideo = null;
    return;
  }

  if (avatarDocumentPictureInPictureElements.captureSourceVideo === sourceVideo && videoEl.srcObject) {
    videoEl.muted = true;
    return;
  }

  let stream = null;
  if (typeof sourceVideo.captureStream === "function") {
    try {
      stream = sourceVideo.captureStream();
    } catch {
      stream = null;
    }
  }
  if (!stream && sourceVideo.srcObject) {
    stream = sourceVideo.srcObject;
  }

  videoEl.srcObject = stream || null;
  videoEl.muted = true;
  avatarDocumentPictureInPictureElements.captureSourceVideo = sourceVideo;
  void videoEl.play?.().catch(() => {});
}

function syncAvatarDocumentPictureInPicture() {
  syncAvatarDocumentPictureInPictureButtons();
  syncAvatarDocumentPictureInPictureMedia();
  syncAvatarDocumentPictureInPictureChatComposer();
}

function cleanupAvatarDocumentPictureInPicture() {
  const pictureInPictureWindow = avatarDocumentPictureInPictureWindow;
  if (pictureInPictureWindow && avatarDocumentPictureInPictureCleanup) {
    pictureInPictureWindow.removeEventListener("pagehide", avatarDocumentPictureInPictureCleanup);
  }
  if (avatarDocumentPictureInPictureElements?.videoEl) {
    avatarDocumentPictureInPictureElements.videoEl.pause?.();
    avatarDocumentPictureInPictureElements.videoEl.srcObject = null;
  }
  if (avatarDocumentPictureInPictureElements?.messageOverlayEl) {
    clearAvatarMessageOverlayState(
      avatarDocumentPictureInPictureElements.messageOverlayEl,
      avatarDocumentPictureInPictureElements.messageOverlayState,
    );
  }
  avatarDocumentPictureInPictureCleanup = null;
  avatarDocumentPictureInPictureWindow = null;
  avatarDocumentPictureInPictureElements = null;
  updateAvatarUiState();
  updatePictureInPictureButtonState();
}

function buildAvatarDocumentPictureInPictureView(pictureInPictureDocument) {
  const paneEl = pictureInPictureDocument.createElement("div");
  paneEl.className = "avatar-pane avatar-pane--picture-in-picture";

  const toolbarEl = pictureInPictureDocument.createElement("div");
  toolbarEl.className = "avatar-toolbar";

  const metaEl = pictureInPictureDocument.createElement("div");
  metaEl.className = "avatar-toolbar__meta";

  const statusIndicatorEl = pictureInPictureDocument.createElement("span");
  statusIndicatorEl.className = "avatar-toolbar__status-indicator";

  const statusDotEl = pictureInPictureDocument.createElement("span");
  statusDotEl.className = "avatar-toolbar__status-dot warn";
  statusDotEl.setAttribute("aria-hidden", "true");

  const statusEl = pictureInPictureDocument.createElement("span");
  statusEl.className = "avatar-toolbar__status";
  statusEl.textContent = getAvatarToolbarStatusState().text;

  statusIndicatorEl.append(statusDotEl, statusEl);
  metaEl.append(statusIndicatorEl);

  const controlsEl = pictureInPictureDocument.createElement("div");
  controlsEl.className = "avatar-controls";

  const reconnectButton = cloneAvatarControlButton(reconnectRoomButton, pictureInPictureDocument);
  const micButton = cloneAvatarControlButton(toggleMicButton, pictureInPictureDocument);
  const speakerButton = cloneAvatarControlButton(toggleSpeakerButton, pictureInPictureDocument);
  const endSessionButton = createAvatarDocumentPictureInPictureEndCallButton(pictureInPictureDocument);

  reconnectButton.addEventListener("click", () => {
    void reconnectAvatarSession().catch((error) => {
      setOutput({ action: "avatar-reconnect-failed", error: String(error) });
    });
  });
  micButton.addEventListener("click", () => {
    void toggleMicrophone();
  });
  speakerButton.addEventListener("click", () => {
    toggleAvatarSpeaker();
  });
  endSessionButton.addEventListener("click", () => {
    void stopActiveSession();
  });

  controlsEl.append(reconnectButton, micButton, speakerButton, endSessionButton);
  toolbarEl.append(metaEl, controlsEl);

  const mediaEl = pictureInPictureDocument.createElement("div");
  mediaEl.className = "avatar-media";

  const messageOverlayEl = pictureInPictureDocument.createElement("div");
  messageOverlayEl.className = "avatar-message-overlay";
  messageOverlayEl.setAttribute("aria-hidden", "true");

  const videoEl = pictureInPictureDocument.createElement("video");
  videoEl.autoplay = true;
  videoEl.playsInline = true;
  videoEl.muted = true;
  mediaEl.appendChild(videoEl);
  mediaEl.appendChild(messageOverlayEl);

  const chatFormEl = pictureInPictureDocument.createElement("form");
  chatFormEl.className = "avatar-pip-chat-compose";

  const chatInputEl = pictureInPictureDocument.createElement("textarea");
  chatInputEl.rows = 1;
  chatInputEl.placeholder = "Message";
  chatInputEl.autocomplete = "off";
  chatInputEl.spellcheck = true;
  chatInputEl.setAttribute("aria-label", "Message");

  const chatSendButton = pictureInPictureDocument.createElement("button");
  chatSendButton.type = "submit";
  chatSendButton.hidden = true;
  chatSendButton.classList.add("is-hidden");
  chatSendButton.setAttribute("aria-hidden", "true");
  chatSendButton.setAttribute("aria-label", "Send message");
  chatSendButton.setAttribute("title", "Send message");
  chatSendButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22 2 11 13"></path>
      <path d="m22 2-7 20-4-9-9-4 20-7Z"></path>
    </svg>
  `;

  chatInputEl.addEventListener("input", () => {
    syncTextareaHeight(chatInputEl, { minHeight: 44, maxHeight: 96 });
    syncAvatarDocumentPictureInPictureChatComposer();
  });
  chatInputEl.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) {
      return;
    }
    event.preventDefault();
    chatFormEl.requestSubmit();
  });
  chatFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitChatMessage(chatInputEl.value, { sourceInput: chatInputEl });
  });

  chatFormEl.append(chatInputEl, chatSendButton);
  mediaEl.appendChild(chatFormEl);

  paneEl.append(toolbarEl, mediaEl);
  pictureInPictureDocument.body.appendChild(paneEl);

  avatarDocumentPictureInPictureElements = {
    captureSourceVideo: null,
    chatForm: chatFormEl,
    chatInput: chatInputEl,
    chatSendButton,
    endSessionButton,
    mediaEl,
    messageOverlayEl,
    messageOverlayState: {
      fadeFrame: null,
      hideTimer: null,
    },
    micButton,
    paneEl,
    reconnectButton,
    speakerButton,
    statusDotEl,
    statusEl,
    videoEl,
  };
}

function getAvatarVideoElement() {
  const element = avatarMediaEl?.querySelector("video");
  return isVideoElement(element) ? element : null;
}

function canUseStandardPictureInPicture(videoElement) {
  return Boolean(
    isVideoElement(videoElement) &&
      typeof videoElement.requestPictureInPicture === "function" &&
      (typeof document.pictureInPictureEnabled !== "boolean" || document.pictureInPictureEnabled),
  );
}

function canUseWebkitPictureInPicture(videoElement) {
  return Boolean(
    isVideoElement(videoElement) &&
      typeof videoElement.webkitSupportsPresentationMode === "function" &&
      typeof videoElement.webkitSetPresentationMode === "function" &&
      videoElement.webkitSupportsPresentationMode("picture-in-picture"),
  );
}

function hasPictureInPictureBrowserSupport() {
  if (hasDocumentPictureInPictureSupport()) {
    return true;
  }
  if (typeof HTMLVideoElement === "undefined") {
    return false;
  }
  return Boolean(
    typeof HTMLVideoElement.prototype.requestPictureInPicture === "function" ||
      typeof HTMLVideoElement.prototype.webkitSupportsPresentationMode === "function",
  );
}

function hasAvatarPictureInPictureSupport(videoElement = getAvatarVideoElement()) {
  return (
    hasDocumentPictureInPictureSupport() ||
    canUseStandardPictureInPicture(videoElement) ||
    canUseWebkitPictureInPicture(videoElement)
  );
}

function isAvatarVideoPictureInPictureActive(videoElement = getAvatarVideoElement() ?? avatarPictureInPictureVideo) {
  if (!isVideoElement(videoElement)) {
    return false;
  }
  if (document.pictureInPictureElement === videoElement) {
    return true;
  }
  return videoElement.webkitPresentationMode === "picture-in-picture";
}

function isAvatarPictureInPictureActive(videoElement = getAvatarVideoElement() ?? avatarPictureInPictureVideo) {
  return isAvatarDocumentPictureInPictureActive() || isAvatarVideoPictureInPictureActive(videoElement);
}

function handleAvatarPictureInPictureStateChange() {
  updatePictureInPictureButtonState();
}

function bindAvatarPictureInPictureVideo(videoElement) {
  if (!isVideoElement(videoElement)) {
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
  if (isVideoElement(videoElement)) {
    videoElement.removeEventListener("enterpictureinpicture", handleAvatarPictureInPictureStateChange);
    videoElement.removeEventListener("leavepictureinpicture", handleAvatarPictureInPictureStateChange);
    videoElement.removeEventListener("webkitpresentationmodechanged", handleAvatarPictureInPictureStateChange);
  }
  if (!videoElement || videoElement === avatarPictureInPictureVideo) {
    avatarPictureInPictureVideo = null;
  }
}

async function enterAvatarDocumentPictureInPicture() {
  if (!hasDocumentPictureInPictureSupport()) {
    throw new Error("Document picture-in-picture is not available in this browser.");
  }
  if (isAvatarDocumentPictureInPictureActive()) {
    return;
  }

  if (isAvatarVideoPictureInPictureActive()) {
    await exitAvatarVideoPictureInPicture();
  }

  const pictureInPictureWindow = await globalThis.documentPictureInPicture.requestWindow(
    getAvatarPictureInPictureWindowSize(),
  );
  const pictureInPictureDocument = pictureInPictureWindow.document;

  avatarDocumentPictureInPictureWindow = pictureInPictureWindow;
  avatarDocumentPictureInPictureCleanup = cleanupAvatarDocumentPictureInPicture;

  pictureInPictureDocument.documentElement.lang = document.documentElement.lang || "en";
  pictureInPictureDocument.title = "Claw Cast";
  pictureInPictureDocument.body.className = "video-chat-pip";
  pictureInPictureDocument.body.textContent = "";

  const styleEl = pictureInPictureDocument.createElement("style");
  styleEl.textContent = getAvatarDocumentPictureInPictureStyles();
  pictureInPictureDocument.head.appendChild(styleEl);

  buildAvatarDocumentPictureInPictureView(pictureInPictureDocument);
  pictureInPictureWindow.addEventListener("pagehide", cleanupAvatarDocumentPictureInPicture);
  syncAvatarDocumentPictureInPicture();
  updateAvatarUiState();
  updatePictureInPictureButtonState();
}

async function enterAvatarVideoPictureInPicture() {
  const videoElement = getAvatarVideoElement();
  if (!isVideoElement(videoElement)) {
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

async function enterAvatarPictureInPicture() {
  if (hasDocumentPictureInPictureSupport()) {
    await enterAvatarDocumentPictureInPicture();
    return;
  }
  await enterAvatarVideoPictureInPicture();
}

async function exitAvatarDocumentPictureInPicture() {
  const cleanup = avatarDocumentPictureInPictureCleanup;
  const pictureInPictureWindow = avatarDocumentPictureInPictureWindow;
  cleanup?.();
  if (pictureInPictureWindow && !pictureInPictureWindow.closed) {
    pictureInPictureWindow.close();
  }
}

async function exitAvatarVideoPictureInPicture() {
  const videoElement = getAvatarVideoElement() ?? avatarPictureInPictureVideo;
  if (document.pictureInPictureElement && typeof document.exitPictureInPicture === "function") {
    await document.exitPictureInPicture();
    return;
  }
  if (
    isVideoElement(videoElement) &&
    typeof videoElement.webkitSetPresentationMode === "function" &&
    videoElement.webkitPresentationMode === "picture-in-picture"
  ) {
    videoElement.webkitSetPresentationMode("inline");
  }
}

async function exitAvatarPictureInPicture() {
  if (isAvatarDocumentPictureInPictureActive()) {
    await exitAvatarDocumentPictureInPicture();
    return;
  }
  await exitAvatarVideoPictureInPicture();
}

function updatePictureInPictureButtonState() {
  if (!togglePictureInPictureButton) {
    return;
  }

  const activeVideoElement = getAvatarVideoElement() ?? avatarPictureInPictureVideo;
  const hasVideo = Boolean(getAvatarVideoElement());
  const isActive = isAvatarPictureInPictureActive(activeVideoElement);
  const hasDocumentSupport = hasDocumentPictureInPictureSupport();
  const isSupported = hasAvatarPictureInPictureSupport(activeVideoElement);

  togglePictureInPictureButton.disabled = isActive ? false : hasDocumentSupport ? !isSupported : !hasVideo || !isSupported;
  togglePictureInPictureButton.classList.toggle("is-active", isActive);

  let label = "Pop out avatar";
  if (!hasPictureInPictureBrowserSupport()) {
    label = "Picture-in-picture is unavailable in this browser";
  } else if (!hasDocumentSupport && !hasVideo && !isActive) {
    label = "Picture-in-picture is available after the avatar video loads";
  } else if (!isSupported) {
    label = "Picture-in-picture is unavailable for this stream";
  } else if (isActive) {
    label = "Return avatar to the tab";
  } else if (hasDocumentSupport) {
    label = hasVideo ? "Open avatar in picture-in-picture" : "Open picture-in-picture for the avatar";
  }

  togglePictureInPictureButton.setAttribute("aria-label", label);
  togglePictureInPictureButton.setAttribute("title", label);
  syncAvatarDocumentPictureInPictureButtons();
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
  const isDocumentPictureInPicture = isAvatarDocumentPictureInPictureActive();

  if (avatarPaneEl) {
    avatarPaneEl.hidden = !showAvatarPane;
    avatarPaneEl.classList.toggle(
      "avatar-pane--document-picture-in-picture-active",
      showAvatarPane && isDocumentPictureInPicture,
    );
  }
  if (avatarPlaceholderEl) {
    avatarPlaceholderEl.hidden = !(showAvatarPane && isDocumentPictureInPicture);
  }
  if (!showAvatarPane) {
    updateAvatarAspectRatio(null);
  }
  syncAvatarDocumentPictureInPictureMedia();
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
        isLoading ? `Room state: ${normalizedConnectionState}` : "Disconnected from room. Reconnect to resume.",
        { loading: isLoading },
      );
      return;
    }
    if (avatarConnectionState === "disconnected") {
      setRoomStatus("Avatar disconnected. Reconnect to resume.");
      return;
    }
    if (!hasAvatarVideo()) {
      setRoomStatus(AVATAR_LOADING_STATUS, { loading: true });
      return;
    }
    setRoomStatus("Connected");
    return;
  }

  if (activeSession) {
    if (avatarConnectionState === "disconnected") {
      setRoomStatus("Avatar disconnected. Reconnect to resume.");
      return;
    }
    if (normalizedConnectionState === "connected" || avatarConnectionState === "connecting") {
      setRoomStatus(AVATAR_LOADING_STATUS, { loading: true });
      return;
    }
    if (normalizedConnectionState && normalizedConnectionState !== "disconnected") {
      setRoomStatus(`Room state: ${normalizedConnectionState}`, { loading: true });
      return;
    }
    setRoomStatus("Disconnected from room. Reconnect to resume.");
    return;
  }

  setRoomStatus("Disconnected");
}

function applyAvatarSpeakerMuteState() {
  if (avatarMediaEl) {
    const mediaElements = avatarMediaEl.querySelectorAll("audio, video");
    for (const element of mediaElements) {
      element.muted = avatarSpeakerMuted;
    }
  }
  syncAvatarDocumentPictureInPicture();
  if (!toggleSpeakerButton) {
    return;
  }
  toggleSpeakerButton.classList.toggle("is-muted", avatarSpeakerMuted);
  toggleSpeakerButton.setAttribute("aria-label", avatarSpeakerMuted ? "Unmute speaker" : "Mute speaker");
  toggleSpeakerButton.setAttribute("title", avatarSpeakerMuted ? "Unmute speaker" : "Mute speaker");
}

async function applyPreferredMicMuteState() {
  if (!localAudioTrack) {
    return;
  }
  if (Boolean(localAudioTrack.isMuted) === preferredMicMuted) {
    return;
  }
  if (preferredMicMuted) {
    await localAudioTrack.mute();
    return;
  }
  await localAudioTrack.unmute();
}

function clearChatLog() {
  renderedVoiceUserRuns.clear();
  chatMessages.length = 0;
  chatAwaitingReply = false;
  renderChatLog({ scrollToBottom: false });
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

function resolveChatTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function resolveMessageTimestamp(message) {
  if (!message || typeof message !== "object") {
    return Date.now();
  }
  const candidates = [
    message.timestamp,
    message.createdAt,
    message.created_at,
    message.time,
  ];
  for (const candidate of candidates) {
    const timestamp = resolveChatTimestamp(candidate);
    if (timestamp !== null) {
      return timestamp;
    }
  }
  return Date.now();
}

function getChatRoleClass(role) {
  const normalized = typeof role === "string" ? role.trim().toLowerCase() : "";
  if (normalized === "user") {
    return "user";
  }
  if (normalized === "assistant") {
    return "assistant";
  }
  return "other";
}

function getChatSenderLabel(roleClass) {
  if (roleClass === "user") {
    return "You";
  }
  if (roleClass === "assistant") {
    return "Agent";
  }
  return "System";
}

function getChatAvatarLabel(roleClass) {
  if (roleClass === "user") {
    return "Y";
  }
  if (roleClass === "assistant") {
    return "A";
  }
  return "S";
}

function formatChatTimestamp(timestamp) {
  return new Date(resolveChatTimestamp(timestamp) ?? Date.now()).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildChatTextContent(text) {
  const content = document.createElement("div");
  content.className = "chat-text";

  const normalizedText = String(text || "").replace(/\r\n/g, "\n").trim();
  const paragraphs = normalizedText ? normalizedText.split(/\n{2,}/) : [];

  if (!paragraphs.length) {
    const paragraph = document.createElement("p");
    paragraph.textContent = "";
    content.appendChild(paragraph);
    return content;
  }

  for (const paragraphText of paragraphs) {
    const paragraph = document.createElement("p");
    const lines = paragraphText.split("\n");
    lines.forEach((line, index) => {
      if (index > 0) {
        paragraph.appendChild(document.createElement("br"));
      }
      paragraph.appendChild(document.createTextNode(line));
    });
    content.appendChild(paragraph);
  }

  return content;
}

function createChatAvatar(roleClass) {
  const avatar = document.createElement("div");
  avatar.className = `chat-avatar ${roleClass}`;
  avatar.textContent = getChatAvatarLabel(roleClass);
  return avatar;
}

function createChatBubble(text) {
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble fade-in";
  bubble.appendChild(buildChatTextContent(text));
  return bubble;
}

function createTypingIndicatorGroup() {
  const group = document.createElement("article");
  group.className = "chat-group assistant";
  group.appendChild(createChatAvatar("assistant"));

  const messages = document.createElement("div");
  messages.className = "chat-group-messages";

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble chat-reading-indicator";
  bubble.setAttribute("aria-hidden", "true");

  const dots = document.createElement("span");
  dots.className = "chat-reading-indicator__dots";
  for (let index = 0; index < 3; index += 1) {
    dots.appendChild(document.createElement("span"));
  }
  bubble.appendChild(dots);
  messages.appendChild(bubble);
  group.appendChild(messages);

  return group;
}

function renderChatLog(options = {}) {
  if (!chatLogEl) {
    return;
  }

  const scrollToBottom = options.scrollToBottom !== false;
  chatLogEl.textContent = "";

  if (!chatMessages.length && !chatAwaitingReply) {
    const emptyState = document.createElement("div");
    emptyState.className = "video-chat-chat-empty";
    emptyState.textContent = "Chat history will appear here once the active session starts.";
    chatLogEl.appendChild(emptyState);
  } else {
    const groups = [];
    for (const message of chatMessages) {
      const roleClass = getChatRoleClass(message.role);
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.roleClass === roleClass) {
        lastGroup.messages.push(message);
      } else {
        groups.push({ roleClass, messages: [message] });
      }
    }

    for (const group of groups) {
      const groupEl = document.createElement("article");
      groupEl.className = `chat-group ${group.roleClass}`;
      groupEl.appendChild(createChatAvatar(group.roleClass));

      const messagesEl = document.createElement("div");
      messagesEl.className = "chat-group-messages";

      for (const message of group.messages) {
        messagesEl.appendChild(createChatBubble(message.text));
      }

      const footer = document.createElement("div");
      footer.className = "chat-group-footer";

      const sender = document.createElement("span");
      sender.className = "chat-sender-name";
      sender.textContent = getChatSenderLabel(group.roleClass);

      const timestamp = document.createElement("span");
      timestamp.className = "chat-group-timestamp";
      timestamp.textContent = formatChatTimestamp(group.messages[group.messages.length - 1].timestamp);

      footer.appendChild(sender);
      footer.appendChild(timestamp);
      messagesEl.appendChild(footer);
      groupEl.appendChild(messagesEl);
      chatLogEl.appendChild(groupEl);
    }
  }

  if (chatAwaitingReply) {
    chatLogEl.appendChild(createTypingIndicatorGroup());
  }

  if (scrollToBottom) {
    requestAnimationFrame(() => {
      if (chatLogEl) {
        chatLogEl.scrollTop = chatLogEl.scrollHeight;
      }
    });
  }
}

function replaceChatLog(entries) {
  chatMessages.length = 0;
  for (const entry of entries) {
    if (!entry || !entry.text) {
      continue;
    }
    chatMessages.push({
      role: entry.role,
      text: entry.text,
      timestamp: resolveChatTimestamp(entry.timestamp) ?? Date.now(),
    });
  }
  chatAwaitingReply = false;
  renderChatLog({ scrollToBottom: false });
}

function setChatAwaitingReply(nextValue) {
  const normalized = Boolean(nextValue);
  if (chatAwaitingReply === normalized) {
    return;
  }
  chatAwaitingReply = normalized;
  renderChatLog();
}

function appendChatLine(role, text, options = {}) {
  if (!chatLogEl || !text) {
    return;
  }
  chatMessages.push({
    role,
    text: String(text),
    timestamp: resolveChatTimestamp(options.timestamp) ?? Date.now(),
  });
  if (Object.prototype.hasOwnProperty.call(options, "awaitingReply")) {
    chatAwaitingReply = Boolean(options.awaitingReply);
  }
  renderChatLog();
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
  appendChatLine("user", text, {
    awaitingReply: true,
    timestamp: resolveMessageTimestamp(payload),
  });
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
    syncAvatarDocumentPictureInPictureChatComposer();
    return;
  }
  const hasSession = Boolean(activeSession);
  chatInput.disabled = !hasSession;
  chatSendButton.disabled = !hasSession;
  syncChatInputHeight();
  syncAvatarDocumentPictureInPictureChatComposer();
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
  chatAwaitingReply = false;
  if (gatewaySocket) {
    try {
      gatewaySocket.close();
    } catch {}
  }
  gatewaySocket = null;
  gatewayHandshakePromise = null;
  clearGatewayPendingRequests(new Error(reason));
  renderChatLog({ scrollToBottom: false });
}

function handleGatewayChatEvent(payload) {
  const expectedSessionKey = resolveChatSessionKey();
  const payloadSessionKey = typeof payload?.sessionKey === "string" ? payload.sessionKey.trim() : "";
  if (!expectedSessionKey || !payloadSessionKey || payloadSessionKey !== expectedSessionKey) {
    return;
  }

  const state = typeof payload.state === "string" ? payload.state : "";
  if (state === "delta") {
    setChatAwaitingReply(true);
    setChatStatus("Agent is responding...");
    return;
  }
  if (state === "final") {
    const text = extractAssistantText(payload.message) || "[No text in final message]";
    appendChatLine("assistant", text, {
      awaitingReply: false,
      timestamp: resolveMessageTimestamp(payload.message),
    });
    setChatStatus("Reply received.");
    return;
  }
  if (state === "error") {
    appendChatLine("system", payload.errorMessage || "Chat request failed.", {
      awaitingReply: false,
    });
    setChatStatus("Chat error.");
    return;
  }
  if (state === "aborted") {
    appendChatLine("system", "Chat run aborted.", {
      awaitingReply: false,
    });
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
      chatAwaitingReply = false;
      clearGatewayPendingRequests(new Error("Gateway websocket closed."));
      renderChatLog({ scrollToBottom: false });
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
  renderedVoiceUserRuns.clear();
  const entries = [];
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
      entries.push({
        role,
        text,
        timestamp: resolveMessageTimestamp(message),
      });
      if (role === "user") {
        const idempotencyKey =
          typeof message.idempotencyKey === "string" ? message.idempotencyKey.trim() : "";
        if (isVoiceRunId(idempotencyKey)) {
          renderedVoiceUserRuns.add(idempotencyKey);
        }
      }
    }
  }
  replaceChatLog(entries);
}

function clearRemoteTiles(options = {}) {
  const keepDocumentPictureInPicture = options.keepDocumentPictureInPicture === true;
  if (isAvatarVideoPictureInPictureActive()) {
    void exitAvatarVideoPictureInPicture().catch(() => {});
  }
  if (!keepDocumentPictureInPicture && isAvatarDocumentPictureInPictureActive()) {
    void exitAvatarDocumentPictureInPicture().catch(() => {});
  }
  if (!avatarMediaEl) {
    unbindAvatarPictureInPictureVideo();
    updateAvatarAspectRatio(null);
    updateAvatarUiState();
    return;
  }
  for (const mediaElement of avatarMediaEl.querySelectorAll("video, audio")) {
    if (isVideoElement(mediaElement)) {
      unbindAvatarPictureInPictureVideo(mediaElement);
    }
    mediaElement.remove();
  }
  unbindAvatarPictureInPictureVideo();
  updateAvatarAspectRatio(null);
  updateAvatarUiState();
}

async function maybeStartAvatarPictureInPicture() {
  if (!hasDocumentPictureInPictureSupport() || isAvatarPictureInPictureActive()) {
    return false;
  }
  try {
    await enterAvatarPictureInPicture();
    return true;
  } catch {
    return false;
  }
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
    if (isVideoElement(element)) {
      const updateRatio = () => {
        updateAvatarAspectRatio(element);
        syncAvatarDocumentPictureInPictureMedia();
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
  if (track.kind === "video") {
    markAvatarConnected();
  }
  updateAvatarUiState();
}

function detachTrack(track) {
  const elements = track.detach();
  for (const element of elements) {
    element.remove();
  }
  syncAvatarDocumentPictureInPictureMedia();
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

function markAvatarConnected() {
  setAvatarConnectionState("connected");
  updateRoomStatusState();
  updateRoomButtons();
}

function markAvatarDisconnected() {
  setAvatarConnectionState(activeSession ? "disconnected" : "idle");
  updateRoomStatusState();
  updateRoomButtons();
}

function updateRoomButtons() {
  const hasSession = Boolean(activeSession);
  const hasRoom = Boolean(activeRoom);
  if (connectRoomButton) {
    connectRoomButton.disabled = !hasSession || hasRoom;
  }
  if (reconnectRoomButton) {
    reconnectRoomButton.disabled = !hasReconnectableSession();
  }
  if (leaveRoomButton) {
    leaveRoomButton.disabled = !hasRoom;
  }
  if (toggleMicButton) {
    const micMuted = localAudioTrack ? Boolean(localAudioTrack.isMuted) : preferredMicMuted;
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
  syncAvatarDocumentPictureInPictureButtons();
}

function removeParticipantTile(participantIdentity) {
  if (!isAvatarParticipantIdentity(participantIdentity)) {
    return;
  }
  markAvatarDisconnected();
  clearRemoteTiles({ keepDocumentPictureInPicture: Boolean(activeRoom || activeSession) });
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
    if (track.kind === "audio") {
      localAudioTrack = track;
      try {
        await applyPreferredMicMuteState();
      } catch (error) {
        setOutput({ action: "mic-preference-apply-failed", error: String(error) });
      }
    }
    await room.localParticipant.publishTrack(track);
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
    } else if (isAvatarParticipantIdentity(participant.identity) && !hasAvatarVideo()) {
      markAvatarDisconnected();
    }
  });
  room.on(LIVEKIT.RoomEvent.ParticipantDisconnected, (participant) => {
    removeParticipantTile(participant.identity);
  });
  room.on(LIVEKIT.RoomEvent.ConnectionStateChanged, (state) => {
    roomConnectionState =
      typeof state === "string" && state.trim() ? state.trim().toLowerCase() : "disconnected";
    if (roomConnectionState !== "connected") {
      setAvatarConnectionState(activeSession ? "connecting" : "idle");
    }
    updateRoomStatusState();
    updateRoomButtons();
  });
  room.on(LIVEKIT.RoomEvent.Disconnected, () => {
    if (activeRoom !== room) {
      return;
    }
    roomConnectionState = "disconnected";
    setAvatarConnectionState(activeSession ? "disconnected" : "idle");
    activeRoom = null;
    setAvatarLoadingState(false);
    releaseLocalTracks();
    clearRemoteTiles();
    updateRoomButtons();
  });
}

async function connectToRoom(options = {}) {
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
  setAvatarConnectionState("connecting");
  const loadingMessage =
    typeof options.loadingMessage === "string" && options.loadingMessage.trim()
      ? options.loadingMessage.trim()
      : "";
  setAvatarLoadingState(Boolean(loadingMessage), loadingMessage);
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
      setAvatarConnectionState(activeSession ? "disconnected" : "idle");
      setAvatarLoadingState(false);
      releaseLocalTracks();
      updateRoomButtons();
      return;
    }
    activeRoom = room;
    roomConnectionState = "connected";
    clearRemoteTiles({ keepDocumentPictureInPicture: true });
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
      setAvatarConnectionState(activeSession ? "disconnected" : "idle");
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
    setAvatarConnectionState(activeSession ? "disconnected" : "idle");
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

function disconnectRoom(options = {}) {
  const keepDocumentPictureInPicture = options.keepDocumentPictureInPicture === true;
  roomConnectGeneration += 1;
  roomConnectionState = "disconnected";
  setAvatarLoadingState(false);
  setAvatarConnectionState(activeSession ? "disconnected" : "idle");
  if (!activeRoom) {
    releaseLocalTracks();
    clearRemoteTiles({ keepDocumentPictureInPicture });
    updateRoomButtons();
    return;
  }
  try {
    activeRoom.disconnect();
  } catch {}
  activeRoom = null;
  releaseLocalTracks();
  clearRemoteTiles({ keepDocumentPictureInPicture });
  updateRoomButtons();
}

async function reconnectAvatarSession() {
  if (!activeSession?.sessionKey || !activeSession?.roomName) {
    throw new Error("Start a session first.");
  }

  const priorSessionKey = activeSession.sessionKey;
  const priorRoomName = activeSession.roomName;
  const keepDocumentPictureInPicture = isAvatarDocumentPictureInPictureActive();

  setAvatarConnectionState("connecting");
  setAvatarLoadingState(true, AVATAR_RECONNECTING_STATUS);
  updateRoomButtons();
  try {
    disconnectRoom({
      keepDocumentPictureInPicture,
    });
    await requestJson("/plugins/video-chat/api/session/stop", {
      method: "POST",
      body: JSON.stringify({
        roomName: priorRoomName,
      }),
    });
    const payload = await requestJson("/plugins/video-chat/api/session", {
      method: "POST",
      body: JSON.stringify({ sessionKey: priorSessionKey }),
    });
    activeSession = payload.session;
    setChatPaneOpen(true);
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
    await connectToRoom({ loadingMessage: AVATAR_RECONNECTING_STATUS });
    setOutput({ action: "avatar-reconnected", roomName: activeSession?.roomName ?? null });
  } catch (error) {
    setAvatarConnectionState(activeSession ? "disconnected" : "idle");
    setAvatarLoadingState(false);
    updateRoomButtons();
    throw error;
  }
}

async function stopActiveSession() {
  const session = activeSession;
  disconnectRoom();
  activeSession = null;
  setAvatarConnectionState("idle");
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
    const autoPictureInPictureOpened = await maybeStartAvatarPictureInPicture();
    const formData = new FormData(sessionForm);
    const sessionKey = String(formData.get("sessionKey") || "").trim();
    roomConnectionState = "disconnected";
    setAvatarConnectionState("connecting");
    clearRemoteTiles({
      keepDocumentPictureInPicture: autoPictureInPictureOpened || isAvatarDocumentPictureInPictureActive(),
    });
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
      await connectToRoom({ loadingMessage: SESSION_STARTING_STATUS });
    } catch (error) {
      setAvatarLoadingState(false);
      if (autoPictureInPictureOpened) {
        await exitAvatarPictureInPicture().catch(() => {});
      }
      setOutput({ action: "session-start-failed", error: String(error) });
    }
  });
}

if (stopSessionButton) {
  stopSessionButton.addEventListener("click", async () => {
    await stopActiveSession();
  });
}

async function toggleMicrophone() {
  if (!localAudioTrack) {
    return;
  }
  try {
    const nextMuted = !localAudioTrack.isMuted;
    if (nextMuted) {
      await localAudioTrack.mute();
    } else {
      await localAudioTrack.unmute();
    }
    preferredMicMuted = nextMuted;
    persistBooleanPreference(MIC_MUTED_STORAGE_KEY, nextMuted);
    updateRoomButtons();
  } catch (error) {
    setOutput({ action: "mic-toggle-failed", error: String(error) });
  }
}

function toggleAvatarSpeaker() {
  avatarSpeakerMuted = !avatarSpeakerMuted;
  persistBooleanPreference(AVATAR_SPEAKER_MUTED_STORAGE_KEY, avatarSpeakerMuted);
  applyAvatarSpeakerMuteState();
  updateRoomButtons();
}

async function handlePictureInPictureToggle() {
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
}

if (connectRoomButton) {
  connectRoomButton.addEventListener("click", async () => {
    const autoPictureInPictureOpened = await maybeStartAvatarPictureInPicture();
    try {
      await connectToRoom({ loadingMessage: SESSION_STARTING_STATUS });
      setOutput({ action: "room-connected", roomName: activeSession?.roomName ?? null });
    } catch (error) {
      if (autoPictureInPictureOpened) {
        await exitAvatarPictureInPicture().catch(() => {});
      }
      setOutput({ action: "room-connect-failed", error: String(error) });
    }
  });
}

if (reconnectRoomButton) {
  reconnectRoomButton.addEventListener("click", () => {
    void reconnectAvatarSession().catch((error) => {
      setOutput({ action: "avatar-reconnect-failed", error: String(error) });
    });
  });
}

if (leaveRoomButton) {
  leaveRoomButton.addEventListener("click", () => {
    disconnectRoom();
    setOutput({ action: "room-left" });
  });
}

if (avatarPictureInPictureReturnButton) {
  avatarPictureInPictureReturnButton.addEventListener("click", () => {
    void handlePictureInPictureToggle();
  });
}

if (toggleMicButton) {
  toggleMicButton.addEventListener("click", () => {
    void toggleMicrophone();
  });
}

if (toggleSpeakerButton) {
  toggleSpeakerButton.addEventListener("click", () => {
    toggleAvatarSpeaker();
  });
}

if (togglePictureInPictureButton) {
  togglePictureInPictureButton.addEventListener("click", () => {
    void handlePictureInPictureToggle();
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

async function submitChatMessage(rawMessage, options = {}) {
  const message = String(rawMessage || "").trim();
  if (!message) {
    return false;
  }

  const sessionKey = resolveChatSessionKey();
  if (!sessionKey) {
    appendChatLine("system", "Start a session before sending chat messages.", {
      awaitingReply: false,
    });
    return false;
  }

  const idempotencyKey = `video-chat-ui-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  setChatPaneOpen(true);
  appendChatLine("user", message, { awaitingReply: true });
  animateAvatarSentMessage(message, { sourceInput: options.sourceInput });
  setMainChatComposerValue("");
  setAvatarDocumentPictureInPictureChatComposerValue("");
  syncAvatarDocumentPictureInPictureChatComposer();
  setChatStatus("Sending message...");

  try {
    const response = await gatewayRpc("chat.send", {
      sessionKey,
      message,
      idempotencyKey,
    });
    setOutput({ action: "chat-sent", sessionKey, response });
    setChatStatus("Awaiting agent reply...");
    return true;
  } catch (error) {
    appendChatLine("system", error instanceof Error ? error.message : "Chat send failed.", {
      awaitingReply: false,
    });
    setOutput({ action: "chat-send-failed", error: String(error) });
    setChatStatus("Chat send failed.");
    return false;
  }
}

if (isTextAreaElement(chatInput)) {
  chatInput.addEventListener("input", () => {
    syncChatInputHeight();
  });

  chatInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) {
      return;
    }
    event.preventDefault();
    chatForm?.requestSubmit();
  });
}

if (chatForm) {
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitChatMessage(chatInput?.value, { sourceInput: chatInput });
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
loadMediaPreferences();
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
