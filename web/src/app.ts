/**
 * Application orchestration and bootstrap.
 *
 * This is the thin entry-point that imports every domain module, queries DOM
 * elements, wires cross-module callbacks, and runs the initialization sequence.
 * No business logic lives here — only sequencing and delegation.
 *
 * Bootstrap order:
 *   1. Query DOM elements
 *   2. Load persisted preferences (media, theme, layout)
 *   3. Initialize UI chrome (nav collapse, chat pane, avatar pane, theme)
 *   4. Wire module callbacks (gateway socket, session, room)
 *   5. Attach event listeners
 *   6. Run async gateway bootstrap (auth mode, token, setup status)
 */

// ---------------------------------------------------------------------------
// Module imports
// ---------------------------------------------------------------------------

import { hasAvatarPictureInPictureSupport } from "./avatar/pip.js";
import {
  disconnectRoom,
  hasReconnectableSession,
  setAvatarConnectionState,
  setAvatarLoadingState,
  setRoomCallbacks,
} from "./avatar/room.js";
// Avatar
import {
  assertValidSessionImageUrl,
  buildSessionCreatePayload,
  parseSessionAvatarTimeoutSeconds,
  requestJson,
  resolveSessionImageUrlValue,
  setSessionCallbacks,
  stopActiveSession,
  syncSessionInputsFromSetupStatus,
} from "./avatar/session.js";
import { clearRecentAvatarReplies } from "./avatar/speech.js";
// Chat
import {
  clearChatComposerAttachments,
  estimateChatTokens,
  extractImageFilesFromClipboardEvent,
  getChatComposerDraft,
  hasChatComposerDraftValue,
  isSupportedChatImageMimeType,
  nextChatComposerAttachmentId,
  readFileAsDataUrl,
  removeChatComposerAttachment,
  syncTextareaHeight,
} from "./chat/composer.js";
import {
  appendChatLine,
  clearStreamingAssistantMessages,
  finalizeStreamingAssistantMessage,
  upsertStreamingAssistantMessage,
} from "./chat/messages.js";
import { formatChatTokensCompact } from "./chat/renderer.js";
// Constants
import {
  AVATAR_AUTO_START_IN_PIP_STORAGE_KEY,
  AVATAR_SPEAKER_MUTED_STORAGE_KEY,
  MIC_MUTED_STORAGE_KEY,
  SESSION_AVATAR_TIMEOUT_SECONDS_STORAGE_KEY,
  SESSION_IMAGE_URL_STORAGE_KEY,
} from "./constants.js";
// Gateway
import {
  clearGatewayToken,
  ensureGatewayAuthModeBootstrapped,
  getGatewayAuthDisplayName,
  getGatewayToken,
  hasGatewayToken,
  migrateLegacyGatewayTokenIfNeeded,
  persistGatewayToken,
} from "./gateway/auth.js";
import {
  closeGatewaySocket,
  ensureGatewaySocketConnected,
  setGatewaySocketCallbacks,
} from "./gateway/socket.js";
import { state } from "./state.js";
import {
  applyChatPaneWidth,
  initAvatarPaneResize,
  initNavCollapseToggle,
  type LayoutElements,
  resolveInitialChatPaneOpen,
  setChatPaneOpen,
} from "./ui/layout.js";
import {
  buildSetupPayloadFromForm,
  cacheSetupSecretValues,
  getSetupMissingForUi,
  isSetupConfiguredForUi,
  isSetupRawPayloadError,
  parseSetupPayloadFromRaw,
  restoreSetupFormBaseline,
  sanitizeSetupStatusForClient,
  serializeSetupPayload,
  setupStatusLabel,
  snapshotSetupFormBaseline,
} from "./ui/setup.js";
import {
  type StatusElements,
  setGatewayHealthStatus,
  setKeysHealthStatus,
  updateRoomStatusState,
} from "./ui/status.js";
// UI
import { initThemeToggle } from "./ui/theme.js";
import {
  getStoredBooleanPreference,
  persistBooleanPreference,
  persistStringPreference,
} from "./utils.js";

// ---------------------------------------------------------------------------
// DOM element references
// ---------------------------------------------------------------------------

interface DomElements extends LayoutElements, StatusElements {
  statusEl: HTMLElement | null;
  outputEl: HTMLElement | null;

  // Setup
  setupForm: HTMLFormElement | null;
  setupRawForm: HTMLFormElement | null;
  setupRawInput: HTMLTextAreaElement | null;
  setupRawErrorEl: HTMLElement | null;
  setupSaveButton: HTMLElement | null;
  configCancelButton: HTMLElement | null;
  configModeButtons: HTMLElement[];
  configSectionFilterButtons: HTMLElement[];
  configSectionCards: HTMLElement[];
  sensitiveFieldInputs: HTMLElement[];
  sensitiveFieldCopyButtons: HTMLElement[];
  sensitiveFieldVisibilityButtons: HTMLElement[];

  // Setup error display
  gatewayTokenErrorEl: HTMLElement | null;
  lemonSliceErrorEl: HTMLElement | null;
  liveKitErrorEl: HTMLElement | null;

  // Session
  sessionForm: HTMLFormElement | null;
  startSessionButton: HTMLElement | null;
  sessionImageUrlInput: HTMLInputElement | null;
  avatarTimeoutSecondsInput: HTMLInputElement | null;
  startInPictureInPictureCheckbox: HTMLInputElement | null;
  stopSessionButton: HTMLElement | null;

  // Token / auth
  tokenForm: HTMLFormElement | null;
  tokenInput: HTMLInputElement | null;
  copyTokenButton: HTMLElement | null;
  toggleTokenVisibilityButton: HTMLElement | null;
  clearTokenButton: HTMLElement | null;

  // Room controls
  connectRoomButton: HTMLElement | null;
  reconnectRoomButton: HTMLElement | null;
  leaveRoomButton: HTMLElement | null;
  toggleMicButton: HTMLElement | null;
  toggleSpeakerButton: HTMLElement | null;
  togglePictureInPictureButton: HTMLElement | null;
  reloadButton: HTMLElement | null;

  // Avatar display
  avatarMediaEl: HTMLElement | null;
  avatarMessageOverlayEl: HTMLElement | null;
  avatarPlaceholderEl: HTMLElement | null;
  avatarPlaceholderStatusEl: HTMLElement | null;
  avatarPlaceholderStatusDotEl: HTMLElement | null;
  avatarPlaceholderStatusTextEl: HTMLElement | null;
  avatarPictureInPictureReturnButton: HTMLElement | null;
  avatarToolbarStatusDotEl: HTMLElement | null;
  avatarToolbarStatusEl: HTMLElement | null;

  // Chat
  chatStatusEl: HTMLElement | null;
  chatLogEl: HTMLElement | null;
  chatForm: HTMLFormElement | null;
  chatComposerInputEl: HTMLElement | null;
  chatAttachmentsEl: HTMLElement | null;
  chatFileInput: HTMLInputElement | null;
  chatInput: HTMLTextAreaElement | null;
  chatAttachButton: HTMLElement | null;
  chatSendButton: HTMLElement | null;
  chatTokenEstimateEl: HTMLElement | null;

  // Theme
  themeToggleEl: HTMLElement | null;
  themeToggleButtons: HTMLElement[];
  systemThemeMedia: MediaQueryList | null;
}

function queryDomElements(): DomElements {
  const $ = (id: string) => document.getElementById(id);
  const $q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
  const $qa = (sel: string) => Array.from(document.querySelectorAll(sel)) as HTMLElement[];

  return {
    statusEl: $("status"),
    outputEl: $("output"),

    // Layout
    shellEl: $q(".shell"),
    navEl: $("plugin-nav") ?? $q(".nav"),
    contentEl: $q(".content.avatar-layout"),
    navCollapseButton: $("nav-collapse-toggle"),
    chatPaneToggleButton: $("chat-pane-toggle"),
    chatPaneCloseButton: $("chat-pane-close"),
    chatPaneBackdropEl: $("chat-pane-backdrop"),
    chatPaneResizerEl: $("chat-pane-resizer"),
    chatPaneEl: $("chat-pane"),
    avatarPaneEl: $("avatar-pane"),
    avatarResizeHandleEl: $("avatar-resize-handle"),
    mobileChatPaneMedia: window.matchMedia("(max-width: 768px)"),

    // Setup
    setupForm: $("setup-form") as HTMLFormElement | null,
    setupRawForm: $("setup-raw-form") as HTMLFormElement | null,
    setupRawInput: $("setup-raw-input") as HTMLTextAreaElement | null,
    setupRawErrorEl: $("setup-raw-error"),
    setupSaveButton: $q('button[form="setup-form"][type="submit"]'),
    configCancelButton: $("config-cancel"),
    configModeButtons: $qa("[data-config-mode]"),
    configSectionFilterButtons: $qa("[data-section-filter]"),
    configSectionCards: $qa("[data-config-section]"),
    sensitiveFieldInputs: $qa("[data-sensitive-field]"),
    sensitiveFieldCopyButtons: $qa("[data-copy-secret]"),
    sensitiveFieldVisibilityButtons: $qa("[data-toggle-secret-visibility]"),

    // Setup errors
    gatewayTokenErrorEl: $("gateway-token-error"),
    lemonSliceErrorEl: $("lemonslice-error"),
    liveKitErrorEl: $("livekit-error"),

    // Session
    sessionForm: $("session-form") as HTMLFormElement | null,
    startSessionButton: $("start-session"),
    sessionImageUrlInput: $("session-image-url") as HTMLInputElement | null,
    avatarTimeoutSecondsInput: $("avatar-timeout-seconds") as HTMLInputElement | null,
    startInPictureInPictureCheckbox: $("start-in-pip") as HTMLInputElement | null,
    stopSessionButton: $("stop-session"),

    // Token / auth
    tokenForm: $("token-form") as HTMLFormElement | null,
    tokenInput: $("gateway-token") as HTMLInputElement | null,
    copyTokenButton: $("copy-token"),
    toggleTokenVisibilityButton: $("toggle-token-visibility"),
    clearTokenButton: $("clear-token"),

    // Room controls
    connectRoomButton: $("connect-room"),
    reconnectRoomButton: $("reconnect-room"),
    leaveRoomButton: $("leave-room"),
    toggleMicButton: $("toggle-mic"),
    toggleSpeakerButton: $("toggle-speaker"),
    togglePictureInPictureButton: $("toggle-picture-in-picture"),
    reloadButton: $("reload-status"),

    // Avatar display
    avatarMediaEl: $("avatar-media"),
    avatarMessageOverlayEl: $("avatar-message-overlay"),
    avatarPlaceholderEl: $("avatar-placeholder"),
    avatarPlaceholderStatusEl: $("avatar-placeholder-status"),
    avatarPlaceholderStatusDotEl: $("avatar-placeholder-status-dot"),
    avatarPlaceholderStatusTextEl: $("avatar-placeholder-status-text"),
    avatarPictureInPictureReturnButton: $("avatar-pip-return"),
    avatarToolbarStatusDotEl: $("avatar-toolbar-status-dot"),
    avatarToolbarStatusEl: $("avatar-toolbar-status"),

    // Health / status
    gatewayHealthDotEl: $("gateway-health-dot"),
    gatewayHealthValueEl: $("gateway-health-value"),
    keysHealthDotEl: $("keys-health-dot"),
    keysHealthValueEl: $("keys-health-value"),
    roomStatusEl: $("room-status"),
    roomStatusTextEl: $("room-status-text"),
    roomStatusSpinnerEl: $("room-status-spinner"),

    // Chat
    chatStatusEl: $("chat-status"),
    chatLogEl: $("chat-log"),
    chatForm: $("chat-form") as HTMLFormElement | null,
    chatComposerInputEl: $("chat-composer-input"),
    chatAttachmentsEl: $("chat-attachments"),
    chatFileInput: $("chat-file-input") as HTMLInputElement | null,
    chatInput: $("chat-input") as HTMLTextAreaElement | null,
    chatAttachButton: $("chat-attach"),
    chatSendButton: $("chat-send"),
    chatTokenEstimateEl: $("chat-token-estimate"),

    // Theme
    themeToggleEl: $("theme-toggle"),
    themeToggleButtons: $qa("[data-theme-value]"),
    systemThemeMedia: window.matchMedia("(prefers-color-scheme: light)"),
  };
}

// ---------------------------------------------------------------------------
// Thin UI helpers (no business logic — just DOM state toggles)
// ---------------------------------------------------------------------------

function setOutput(els: Pick<DomElements, "outputEl">, detail: Record<string, unknown>): void {
  if (!els.outputEl) return;
  els.outputEl.textContent = JSON.stringify(detail);
}

function setChatStatus(els: Pick<DomElements, "chatStatusEl">, text: string): void {
  if (els.chatStatusEl) els.chatStatusEl.textContent = text;
}

function setConfigStatusMessage(els: Pick<DomElements, "statusEl">, message: string): void {
  if (els.statusEl) els.statusEl.textContent = message;
}

function clearChatLog(els: Pick<DomElements, "chatLogEl">): void {
  if (els.chatLogEl) els.chatLogEl.innerHTML = "";
  state.chat.messages = [];
  clearStreamingAssistantMessages();
}

function updateTokenFieldMasking(els: Pick<DomElements, "tokenInput">): void {
  if (!els.tokenInput) return;
  els.tokenInput.type = state.setup.tokenVisible ? "text" : "password";
}

function updateRoomButtons(els: DomElements): void {
  const hasSession = state.session.active !== null;
  const connected = state.room.connectionState === "connected";
  const reconnectable = hasReconnectableSession();

  if (els.connectRoomButton) {
    (els.connectRoomButton as HTMLButtonElement).disabled = !hasSession || connected;
  }
  if (els.reconnectRoomButton) {
    (els.reconnectRoomButton as HTMLButtonElement).disabled = !reconnectable;
    (els.reconnectRoomButton as HTMLElement).hidden = !reconnectable;
  }
  if (els.leaveRoomButton) {
    (els.leaveRoomButton as HTMLButtonElement).disabled = !connected;
  }
  if (els.stopSessionButton) {
    (els.stopSessionButton as HTMLButtonElement).disabled = !hasSession;
  }
  if (els.toggleMicButton) {
    (els.toggleMicButton as HTMLButtonElement).disabled = !connected;
  }
  if (els.toggleSpeakerButton) {
    (els.toggleSpeakerButton as HTMLButtonElement).disabled = !connected;
  }
  if (els.togglePictureInPictureButton) {
    (els.togglePictureInPictureButton as HTMLElement).hidden =
      !hasAvatarPictureInPictureSupport(null);
    (els.togglePictureInPictureButton as HTMLButtonElement).disabled = !connected;
  }
}

function updateChatControls(els: DomElements): void {
  const hasToken = hasGatewayToken();
  const hasSession = state.session.active !== null;
  const enabled = hasToken && hasSession;
  if (els.chatInput) {
    (els.chatInput as HTMLTextAreaElement).disabled = !enabled;
  }
  if (els.chatSendButton) {
    (els.chatSendButton as HTMLButtonElement).disabled = !enabled;
  }
  if (els.chatAttachButton) {
    (els.chatAttachButton as HTMLButtonElement).disabled = !enabled;
  }
}

function updateSessionStartButtonState(els: Pick<DomElements, "startSessionButton">): void {
  if (!els.startSessionButton) return;
  (els.startSessionButton as HTMLButtonElement).disabled = !hasGatewayToken();
}

function updateSetupSaveButtonState(els: Pick<DomElements, "setupSaveButton">): void {
  if (!els.setupSaveButton) return;
  (els.setupSaveButton as HTMLButtonElement).disabled = false;
}

function refreshAllUiState(els: DomElements): void {
  updateRoomButtons(els);
  updateChatControls(els);
  updateAvatarUiState(els);
  updateRoomStatusState(els);
}

function updateAvatarUiState(els: DomElements): void {
  const connected = state.room.connectionState === "connected";
  if (els.avatarPlaceholderEl) {
    (els.avatarPlaceholderEl as HTMLElement).hidden = connected;
  }
  if (els.avatarMediaEl) {
    (els.avatarMediaEl as HTMLElement).hidden = !connected;
  }
  updateRoomButtons(els);
}

function loadMediaPreferences(): void {
  state.media.preferredMicMuted = getStoredBooleanPreference(MIC_MUTED_STORAGE_KEY, false);
  state.media.avatarSpeakerMuted = getStoredBooleanPreference(
    AVATAR_SPEAKER_MUTED_STORAGE_KEY,
    false,
  );
}

function clearAllSetupSectionErrors(
  els: Pick<DomElements, "gatewayTokenErrorEl" | "lemonSliceErrorEl" | "liveKitErrorEl">,
): void {
  const errorEls = [els.gatewayTokenErrorEl, els.lemonSliceErrorEl, els.liveKitErrorEl];
  for (const el of errorEls) {
    if (el) el.textContent = "";
  }
}

function getGatewayConnectInstruction(): string {
  return `Enter your gateway ${getGatewayAuthDisplayName()} to get started.`;
}

function getGatewayChatInstruction(): string {
  return `Enter your gateway ${getGatewayAuthDisplayName()} and start a session to use text chat.`;
}

function resetSetupSecretState(
  els: Pick<DomElements, "tokenInput">,
  options: { clearTokenField?: boolean } = {},
): void {
  state.setup.storedSetupSecretValues.clear();
  state.setup.secretVisibilityState.clear();
  if (options.clearTokenField && els.tokenInput) {
    els.tokenInput.value = "";
  }
}

// ---------------------------------------------------------------------------
// Config mode toggle
// ---------------------------------------------------------------------------

function setConfigMode(els: DomElements, mode: string, options: { sync?: boolean } = {}): void {
  const next = mode === "raw" ? "raw" : "form";
  state.setup.activeConfigMode = next;

  for (const btn of els.configModeButtons) {
    const btnMode = btn.getAttribute("data-config-mode");
    btn.classList.toggle("active", btnMode === next);
    btn.setAttribute("aria-pressed", btnMode === next ? "true" : "false");
  }

  if (els.setupForm) {
    (els.setupForm as HTMLElement).hidden = next !== "form";
  }
  if (els.setupRawForm) {
    (els.setupRawForm as HTMLElement).hidden = next !== "raw";
  }
  if (options.sync !== false && next === "raw") {
    syncRawFromForm(els);
  }
}

function syncRawFromForm(els: DomElements): void {
  if (!els.setupRawInput) return;
  const payload = buildSetupPayloadFromForm(els.setupForm);
  els.setupRawInput.value = serializeSetupPayload(payload);
}

function snapshotSetupRawBaseline(els: DomElements): void {
  state.setup.rawBaseline = els.setupRawInput?.value ?? "";
}

// ---------------------------------------------------------------------------
// Config section filtering
// ---------------------------------------------------------------------------

function initConfigSectionFiltering(els: DomElements): void {
  for (const btn of els.configSectionFilterButtons) {
    btn.addEventListener("click", () => {
      const filter = btn.getAttribute("data-section-filter") ?? "all";
      state.setup.activeConfigSectionFilter = filter;
      for (const b of els.configSectionFilterButtons) {
        b.classList.toggle("active", b.getAttribute("data-section-filter") === filter);
      }
      for (const card of els.configSectionCards) {
        const section = card.getAttribute("data-config-section") ?? "";
        (card as HTMLElement).hidden = filter !== "all" && section !== filter;
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Chat composer UI helpers
// ---------------------------------------------------------------------------

function renderChatComposerAttachments(els: DomElements): void {
  if (!els.chatAttachmentsEl) return;
  const draft = getChatComposerDraft("main");
  if (!draft.attachments.length) {
    els.chatAttachmentsEl.innerHTML = "";
    (els.chatAttachmentsEl as HTMLElement).hidden = true;
    return;
  }
  (els.chatAttachmentsEl as HTMLElement).hidden = false;
  const fragment = document.createDocumentFragment();
  for (const att of draft.attachments) {
    const chip = document.createElement("span");
    chip.className = "chat-attachment-chip";
    chip.textContent = att.name;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "chat-attachment-remove";
    removeBtn.textContent = "\u00d7";
    removeBtn.addEventListener("click", () => {
      removeChatComposerAttachment("main", att.id);
      renderChatComposerAttachments(els);
    });
    chip.appendChild(removeBtn);
    fragment.appendChild(chip);
  }
  els.chatAttachmentsEl.innerHTML = "";
  els.chatAttachmentsEl.appendChild(fragment);
}

function syncChatComposerUi(els: DomElements): void {
  syncTextareaHeight(els.chatInput);
  const value = els.chatInput?.value ?? "";
  const draft = getChatComposerDraft("main");
  const hasValue = hasChatComposerDraftValue(value, draft.attachments);
  if (els.chatSendButton) {
    (els.chatSendButton as HTMLButtonElement).disabled = !hasValue || state.chat.awaitingReply;
  }
  if (els.chatTokenEstimateEl) {
    const tokens = estimateChatTokens(value);
    els.chatTokenEstimateEl.textContent = tokens !== null ? formatChatTokensCompact(tokens) : "";
  }
}

async function addChatComposerAttachments(els: DomElements, files: File[]): Promise<void> {
  const draft = getChatComposerDraft("main");
  for (const file of files) {
    if (!isSupportedChatImageMimeType(file.type)) continue;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      draft.attachments.push({
        id: nextChatComposerAttachmentId(),
        file,
        name: file.name,
        mimeType: file.type,
        dataUrl,
      });
    } catch {
      // Skip unreadable files.
    }
  }
  renderChatComposerAttachments(els);
  syncChatComposerUi(els);
}

// ---------------------------------------------------------------------------
// Setup status refresh
// ---------------------------------------------------------------------------

async function refreshSetupStatus(els: DomElements): Promise<void> {
  try {
    const raw = await requestJson("/api/setup", { method: "GET" });
    const setupData = raw as Record<string, unknown>;
    const sanitized = sanitizeSetupStatusForClient(setupData);
    if (sanitized) {
      state.setup.latestSetupStatus = sanitized;
      cacheSetupSecretValues(setupData);
    }
    syncSessionInputsFromSetupStatus(setupData, els.sessionImageUrlInput, state.session.imageUrl);
    snapshotSetupFormBaseline(els.setupForm);
    syncRawFromForm(els);
    snapshotSetupRawBaseline(els);
    updateSetupSaveButtonState(els);

    if (isSetupConfiguredForUi(setupData)) {
      setGatewayHealthStatus(els, "ok", "Connected");
      setKeysHealthStatus(els, "ok", "Configured");
    } else {
      setGatewayHealthStatus(els, "ok", "Connected");
      const missing = getSetupMissingForUi(setupData);
      setKeysHealthStatus(
        els,
        "warn",
        missing.length > 0 ? `Missing: ${missing.join(", ")}` : "Checking",
      );
    }
    setOutput(els, { action: "setup-status-loaded", label: setupStatusLabel(setupData) });
  } catch (error) {
    setGatewayHealthStatus(els, "error", "Error");
    setKeysHealthStatus(els, "error", "Error");
    setOutput(els, { action: "setup-status-error", error: String(error) });
  }
}

// ---------------------------------------------------------------------------
// Setup form save
// ---------------------------------------------------------------------------

async function saveSetupPayload(els: DomElements, payload: Record<string, string>): Promise<void> {
  try {
    await requestJson("/api/setup", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    await refreshSetupStatus(els);
    clearAllSetupSectionErrors(els);
    setConfigStatusMessage(els, "Settings saved.");
    setOutput(els, { action: "setup-saved" });
  } catch (error) {
    setConfigStatusMessage(els, `Save failed: ${String(error)}`);
    setOutput(els, { action: "setup-save-error", error: String(error) });
  }
}

// ---------------------------------------------------------------------------
// Wire module callbacks
// ---------------------------------------------------------------------------

function wireGatewaySocketCallbacks(els: DomElements): void {
  setGatewaySocketCallbacks({
    onChatEvent(payload) {
      const type = payload.type as string | undefined;
      const text = (payload.text ?? payload.content ?? "") as string;
      if (type === "message.delta" || type === "message.start") {
        upsertStreamingAssistantMessage(text, {
          state: type,
          runId: payload.runId as string | undefined,
        });
      } else if (type === "message.complete") {
        finalizeStreamingAssistantMessage(text, {
          runId: payload.runId as string | undefined,
        });
        state.chat.awaitingReply = false;
        syncChatComposerUi(els);
      }
    },
    onChatStatus(text) {
      setChatStatus(els, text);
    },
    onOutput(detail) {
      setOutput(els, detail);
    },
    onReady() {
      setGatewayHealthStatus(els, "ok", "Connected");
      setOutput(els, { action: "gateway-socket-ready" });
    },
    onClose(_wasAuthFailure) {
      setGatewayHealthStatus(els, "warn", "Disconnected");
    },
    onAfterClose() {
      updateRoomButtons(els);
    },
  });
}

function wireSessionCallbacks(els: DomElements): void {
  setSessionCallbacks({
    onOutput(detail) {
      setOutput(els, detail);
    },
    onSessionStopped() {
      state.session.active = null;
      setAvatarConnectionState("idle");
      setAvatarLoadingState(false, "");
      clearRecentAvatarReplies();
      refreshAllUiState(els);
      setChatStatus(els, "Session stopped.");
    },
  });
}

function wireRoomCallbacks(els: DomElements): void {
  setRoomCallbacks({
    onOutput(detail) {
      setOutput(els, detail);
    },
    onAvatarConnected() {
      refreshAllUiState(els);
      setOutput(els, { action: "avatar-connected" });
    },
    onAvatarDisconnected() {
      refreshAllUiState(els);
      setOutput(els, { action: "avatar-disconnected" });
    },
    onUpdateUi() {
      refreshAllUiState(els);
    },
    onDataMessage(_payload, _topic) {
      // Data message routing handled by specific modules.
    },
  });
}

// ---------------------------------------------------------------------------
// Event listener attachment
// ---------------------------------------------------------------------------

function attachSetupFormListeners(els: DomElements): void {
  if (!els.setupForm) return;

  els.setupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = buildSetupPayloadFromForm(els.setupForm);
    saveSetupPayload(els, payload);
  });

  for (const btn of els.sensitiveFieldCopyButtons) {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-copy-secret");
      if (!targetId) return;
      const input = document.getElementById(targetId) as HTMLInputElement | null;
      if (input?.value) {
        navigator.clipboard.writeText(input.value).catch(() => {});
      }
    });
  }

  for (const btn of els.sensitiveFieldVisibilityButtons) {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-toggle-secret-visibility");
      if (!targetId) return;
      const input = document.getElementById(targetId) as HTMLInputElement | null;
      if (!input) return;
      const isHidden = input.type === "password";
      input.type = isHidden ? "text" : "password";
      if (isHidden) {
        state.setup.secretVisibilityState.add(targetId);
      } else {
        state.setup.secretVisibilityState.delete(targetId);
      }
    });
  }

  snapshotSetupFormBaseline(els.setupForm);
  syncRawFromForm(els);
  snapshotSetupRawBaseline(els);
  updateSetupSaveButtonState(els);
}

function attachSetupRawListeners(els: DomElements): void {
  if (!els.setupRawInput) return;

  els.setupRawInput.addEventListener("input", () => {
    if (els.setupRawErrorEl) els.setupRawErrorEl.textContent = "";
    updateSetupSaveButtonState(els);
  });

  if (els.setupRawForm) {
    els.setupRawForm.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        const payload = parseSetupPayloadFromRaw(els.setupRawInput?.value ?? "");
        saveSetupPayload(els, payload);
      } catch (error) {
        if (isSetupRawPayloadError(error) && els.setupRawErrorEl) {
          els.setupRawErrorEl.textContent = (error as Error).message;
        }
      }
    });
  }
}

function attachConfigModeListeners(els: DomElements): void {
  for (const btn of els.configModeButtons) {
    btn.addEventListener("click", () => {
      const nextMode = btn.getAttribute("data-config-mode") ?? "form";
      setConfigMode(els, nextMode);
    });
  }
  setConfigMode(els, "form", { sync: false });
}

function attachSessionFormListeners(els: DomElements): void {
  if (!els.sessionForm) return;

  // Load stored preferences
  if (els.avatarTimeoutSecondsInput) {
    const raw = els.avatarTimeoutSecondsInput.value;
    const parsed = parseSessionAvatarTimeoutSeconds(raw);
    els.avatarTimeoutSecondsInput.value = String(parsed);
  }
  loadSessionFormPreferences(els);

  els.sessionForm.addEventListener("input", () => {
    persistSessionFormPreferences(els);
    updateSessionStartButtonState(els);
  });

  els.sessionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!hasGatewayToken()) return;

    try {
      const imageUrl = resolveSessionImageUrlValue(els.sessionImageUrlInput?.value);
      assertValidSessionImageUrl(imageUrl);

      setAvatarLoadingState(true, "Starting session\u2026");
      updateRoomButtons(els);
      updateAvatarUiState(els);

      const sessionKey = `session-${Date.now()}`;
      const payload = buildSessionCreatePayload(sessionKey, {
        avatarImageUrl: imageUrl,
        avatarTimeoutSeconds: parseSessionAvatarTimeoutSeconds(
          els.avatarTimeoutSecondsInput?.value,
        ),
      });

      const response = await requestJson("/api/session", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      state.session.active = response;
      state.session.imageUrl = imageUrl;

      await ensureGatewaySocketConnected();

      refreshAllUiState(els);
      setChatStatus(els, "Session started. Type a message to chat.");
      setOutput(els, { action: "session-started" });
    } catch (error) {
      setAvatarLoadingState(false, "");
      updateRoomButtons(els);
      updateAvatarUiState(els);
      setOutput(els, { action: "session-start-error", error: String(error) });
    }
  });
}

function loadSessionFormPreferences(els: DomElements): void {
  if (els.sessionImageUrlInput) {
    try {
      const stored = localStorage.getItem(SESSION_IMAGE_URL_STORAGE_KEY);
      if (stored) els.sessionImageUrlInput.value = stored;
    } catch {
      /* ignore */
    }
  }
  if (els.avatarTimeoutSecondsInput) {
    try {
      const stored = localStorage.getItem(SESSION_AVATAR_TIMEOUT_SECONDS_STORAGE_KEY);
      if (stored) {
        els.avatarTimeoutSecondsInput.value = String(parseSessionAvatarTimeoutSeconds(stored));
      }
    } catch {
      /* ignore */
    }
  }
  if (els.startInPictureInPictureCheckbox) {
    els.startInPictureInPictureCheckbox.checked = getStoredBooleanPreference(
      AVATAR_AUTO_START_IN_PIP_STORAGE_KEY,
      true,
    );
  }
}

function persistSessionFormPreferences(els: DomElements): void {
  if (els.sessionImageUrlInput) {
    persistStringPreference(SESSION_IMAGE_URL_STORAGE_KEY, els.sessionImageUrlInput.value);
  }
  if (els.avatarTimeoutSecondsInput) {
    persistStringPreference(
      SESSION_AVATAR_TIMEOUT_SECONDS_STORAGE_KEY,
      els.avatarTimeoutSecondsInput.value,
    );
  }
}

function doStopActiveSession(): void {
  const noopSidecar = async () => {};
  stopActiveSession(() => disconnectRoom(), noopSidecar);
}

function attachSessionControlListeners(els: DomElements): void {
  els.stopSessionButton?.addEventListener("click", () => {
    doStopActiveSession();
  });

  els.startInPictureInPictureCheckbox?.addEventListener("change", () => {
    persistBooleanPreference(
      AVATAR_AUTO_START_IN_PIP_STORAGE_KEY,
      els.startInPictureInPictureCheckbox?.checked ?? true,
    );
  });
}

function attachRoomControlListeners(els: DomElements): void {
  els.leaveRoomButton?.addEventListener("click", () => {
    disconnectRoom();
    refreshAllUiState(els);
  });
}

function attachChatListeners(els: DomElements): void {
  if (!els.chatInput) return;

  els.chatInput.addEventListener("input", () => {
    syncChatComposerUi(els);
  });

  els.chatInput.addEventListener("paste", (event) => {
    const files = extractImageFilesFromClipboardEvent(event);
    if (files.length > 0) {
      event.preventDefault();
      addChatComposerAttachments(els, files);
    }
  });

  els.chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      els.chatForm?.requestSubmit();
    }
  });

  els.chatAttachButton?.addEventListener("click", () => {
    els.chatFileInput?.click();
  });

  els.chatFileInput?.addEventListener("change", () => {
    const files = Array.from(els.chatFileInput?.files ?? []);
    if (files.length > 0) {
      addChatComposerAttachments(els, files);
      if (els.chatFileInput) els.chatFileInput.value = "";
    }
  });

  // Drag and drop
  if (els.chatComposerInputEl) {
    els.chatComposerInputEl.addEventListener("dragenter", (e) => {
      e.preventDefault();
      els.chatComposerInputEl?.classList.add("dragover");
    });
    els.chatComposerInputEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      els.chatComposerInputEl?.classList.add("dragover");
    });
    els.chatComposerInputEl.addEventListener("dragleave", () => {
      els.chatComposerInputEl?.classList.remove("dragover");
    });
    els.chatComposerInputEl.addEventListener("drop", (e) => {
      e.preventDefault();
      els.chatComposerInputEl?.classList.remove("dragover");
      const files = Array.from((e as DragEvent).dataTransfer?.files ?? []);
      if (files.length > 0) {
        addChatComposerAttachments(els, files);
      }
    });
  }

  els.chatForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!hasGatewayToken() || !state.session.active) return;
    const value = (els.chatInput?.value ?? "").trim();
    const draft = getChatComposerDraft("main");
    if (!hasChatComposerDraftValue(value, draft.attachments)) return;

    state.chat.awaitingReply = true;
    clearChatComposerAttachments("main");
    if (els.chatInput) els.chatInput.value = "";
    syncChatComposerUi(els);
    renderChatComposerAttachments(els);

    appendChatLine("user", value, {
      timestamp: Date.now(),
    });
    setChatStatus(els, "");
    setOutput(els, { action: "chat-message-sent", content: value });
  });
}

function attachDocumentListeners(els: DomElements): void {
  const resumePlayback = (_reason: string) => {
    // Attempt to resume any paused avatar media elements after tab
    // visibility or focus changes.
    const videos = els.avatarMediaEl?.querySelectorAll("video, audio");
    if (!videos) return;
    for (const media of Array.from(videos) as HTMLMediaElement[]) {
      if (media.paused && !media.ended) {
        media.play().catch(() => {});
      }
    }
  };

  document.addEventListener("visibilitychange", () => resumePlayback("visibilitychange"));
  window.addEventListener("pageshow", () => resumePlayback("pageshow"));
  window.addEventListener("focus", () => resumePlayback("focus"));
}

function attachTokenListeners(els: DomElements): void {
  if (els.configCancelButton) {
    els.configCancelButton.addEventListener("click", () => {
      restoreSetupFormBaseline(els.setupForm);
      if (els.setupRawInput) {
        els.setupRawInput.value = state.setup.rawBaseline;
      }
      updateSetupSaveButtonState(els);
    });
  }

  if (els.tokenForm) {
    els.tokenForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = els.tokenInput?.value ?? "";
      if (!value.trim()) return;
      persistGatewayToken(value.trim());
      window.location.reload();
    });
  }

  els.tokenInput?.addEventListener("input", () => {
    if (els.gatewayTokenErrorEl) els.gatewayTokenErrorEl.textContent = "";
    updateTokenFieldMasking(els);
  });

  els.copyTokenButton?.addEventListener("click", () => {
    const value = els.tokenInput?.value;
    if (value) {
      navigator.clipboard.writeText(value).catch(() => {});
    }
  });

  els.toggleTokenVisibilityButton?.addEventListener("mousedown", (e) => {
    e.preventDefault();
  });
  els.toggleTokenVisibilityButton?.addEventListener("click", () => {
    state.setup.tokenVisible = !state.setup.tokenVisible;
    updateTokenFieldMasking(els);
  });

  els.clearTokenButton?.addEventListener("click", () => {
    doStopActiveSession();
    closeGatewaySocket("Gateway auth cleared.");
    clearGatewayToken();
    resetSetupSecretState(els, { clearTokenField: true });
    state.setup.tokenVisible = false;
    updateTokenFieldMasking(els);
    updateRoomButtons(els);
    updateChatControls(els);
    clearChatLog(els);
    setChatStatus(els, getGatewayChatInstruction());
    setGatewayHealthStatus(els, "warn", "Auth Needed");
    setKeysHealthStatus(els, "warn", "Needs Auth");
    setConfigStatusMessage(
      els,
      "Gateway auth cleared for this browser. Enter a token or password to continue.",
    );
    setOutput(els, { action: "gateway-token-cleared" });
  });
}

function attachReloadListener(els: DomElements): void {
  els.reloadButton?.addEventListener("click", () => {
    refreshSetupStatus(els);
  });
}

// ---------------------------------------------------------------------------
// Async gateway bootstrap
// ---------------------------------------------------------------------------

async function initializeGatewaySetupState(els: DomElements): Promise<void> {
  try {
    await ensureGatewayAuthModeBootstrapped();
  } catch (error) {
    setConfigStatusMessage(els, `Gateway auth mode detection failed: ${String(error)}`);
    setOutput(els, { action: "gateway-auth-bootstrap-failed", error: String(error) });
    return;
  }

  migrateLegacyGatewayTokenIfNeeded();

  if (els.tokenInput) {
    els.tokenInput.value = getGatewayToken();
  }
  updateTokenFieldMasking(els);
  updateSessionStartButtonState(els);

  if (hasGatewayToken()) {
    setGatewayHealthStatus(els, "warn", "Checking");
    setKeysHealthStatus(els, "warn", "Checking");
    refreshSetupStatus(els).catch(() => {});
    setChatStatus(els, "Start a session to use text chat.");
  } else {
    clearAllSetupSectionErrors(els);
    setConfigStatusMessage(els, getGatewayConnectInstruction());
    setGatewayHealthStatus(els, "warn", "Auth Needed");
    setKeysHealthStatus(els, "warn", "Needs Auth");
    setChatStatus(els, getGatewayChatInstruction());
  }

  updateRoomStatusState(els);
}

// ---------------------------------------------------------------------------
// Main initialization
// ---------------------------------------------------------------------------

function init(): void {
  const els = queryDomElements();

  // 1. Load persisted preferences
  loadMediaPreferences();

  // 2. Initialize UI chrome
  initNavCollapseToggle(els);

  const chatPaneInitial = resolveInitialChatPaneOpen(els.mobileChatPaneMedia);
  applyChatPaneWidth(chatPaneInitial.storedWidth, els.shellEl, els.contentEl, {
    persist: false,
  });
  setChatPaneOpen(chatPaneInitial.isOpen, els, { persist: false });

  // Chat pane toggle/close/backdrop listeners
  els.chatPaneToggleButton?.addEventListener("click", () => {
    const isOpen = els.shellEl?.classList.contains("shell--chat-pane-open");
    setChatPaneOpen(!isOpen, els);
  });
  els.chatPaneCloseButton?.addEventListener("click", () => setChatPaneOpen(false, els));
  els.chatPaneBackdropEl?.addEventListener("click", () => setChatPaneOpen(false, els));

  initAvatarPaneResize(els);
  initThemeToggle(els.systemThemeMedia, els.themeToggleEl, els.themeToggleButtons);
  initConfigSectionFiltering(els);

  // 3. Initial UI state
  updateTokenFieldMasking(els);
  updateRoomButtons(els);
  updateChatControls(els);
  renderChatComposerAttachments(els);
  clearChatLog(els);
  updateAvatarUiState(els);

  // 4. Wire cross-module callbacks
  wireGatewaySocketCallbacks(els);
  wireSessionCallbacks(els);
  wireRoomCallbacks(els);

  // 5. Attach event listeners
  attachSetupFormListeners(els);
  attachSetupRawListeners(els);
  attachConfigModeListeners(els);
  attachSessionFormListeners(els);
  attachSessionControlListeners(els);
  attachRoomControlListeners(els);
  attachChatListeners(els);
  attachTokenListeners(els);
  attachReloadListener(els);
  attachDocumentListeners(els);

  // 6. Async gateway bootstrap
  initializeGatewaySetupState(els).catch((error) => {
    setOutput(els, { action: "gateway-setup-init-failed", error: String(error) });
    updateRoomStatusState(els);
  });
}

// Auto-initialize when loaded as a module in the browser.
init();
