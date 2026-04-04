// web/src/constants.ts
var OPENCLAW_SETTINGS_STORAGE_KEY = "openclaw.control.settings.v1";
var LEGACY_TOKEN_STORAGE_KEY = "avatar.gatewayToken";
var THEME_STORAGE_KEY = "avatar.themePreference";
var NAV_COLLAPSE_STORAGE_KEY = "avatar.navCollapsed";
var CHAT_PANE_STORAGE_KEY = "avatar.chatPaneOpen";
var CHAT_PANE_WIDTH_STORAGE_KEY = "avatar.chatPaneWidth";
var CHAT_PANE_WIDTH_CSS_VARIABLE = "--chat-pane-width";
var MIC_MUTED_STORAGE_KEY = "avatar.microphoneMuted";
var AVATAR_SPEAKER_MUTED_STORAGE_KEY = "avatar.avatarSpeakerMuted";
var AVATAR_AUTO_START_IN_PIP_STORAGE_KEY = "avatar.avatarAutoStartInPictureInPicture";
var SESSION_IMAGE_URL_STORAGE_KEY = "avatar.sessionImageUrl";
var SESSION_AVATAR_TIMEOUT_SECONDS_STORAGE_KEY = "avatar.sessionAvatarTimeoutSeconds";
var AVATAR_PANE_WIDTH_STORAGE_KEY = "avatar.avatarPaneWidth";
var AVATAR_PLUGIN_BASE_PATH = "/plugins/openclaw-avatar";
var DEFAULT_SESSION_IMAGE_URL = "https://e9riw81orx.ufs.sh/f/z2nBEp3YISrtPNwLc0haBifGpR5UHA49jYDwQzbvS3mgVqLM";
var REDACTED_SECRET_VALUE = "_REDACTED_";
var OPENCLAW_REDACTED_SECRET_VALUE = "__OPENCLAW_REDACTED__";
var GATEWAY_PROTOCOL_VERSION = 3;
var GATEWAY_WS_CLIENT = {
  id: "test",
  version: "avatar-plugin-ui",
  platform: "web",
  mode: "test"
};
var GATEWAY_WS_SCOPES = ["operator.read", "operator.write"];
var CHAT_PANE_MIN_WIDTH = 300;
var CHAT_PANE_MAX_WIDTH = 640;
var AVATAR_PANE_WIDTH_CSS_VARIABLE = "--avatar-pane-width";
var AVATAR_PANE_MIN_WIDTH = 0;
var AVATAR_PANE_MAX_WIDTH = 1200;
var AVATAR_PIP_DEFAULT_ASPECT_RATIO = 16 / 9;
var SESSION_AVATAR_TIMEOUT_DEFAULT_SECONDS = 60;
var SESSION_AVATAR_TIMEOUT_MIN_SECONDS = 1;
var SESSION_AVATAR_TIMEOUT_MAX_SECONDS = 600;
var SESSION_STARTING_STATUS = "Starting session...";
var AVATAR_LOADING_STATUS = "Avatar loading...";
var MINIMUM_COMPATIBLE_OPENCLAW_VERSION = "2026.3.22";
var SERVER_SPEECH_MAX_CAPTURE_BYTES = 512 * 1024;
var CHAT_MAX_IMAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
var CHAT_TOKEN_ESTIMATE_MIN_CHARS = 100;
var CHAT_SUPPORTED_IMAGE_MIME_TYPES = /* @__PURE__ */ new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif"
]);
var AVATAR_ASPECT_RATIOS = Object.freeze(["2x3", "3x2", "9x16", "16x9"]);
var AVATAR_ASPECT_RATIO_DEFAULT = "3x2";
var SESSION_AVATAR_ASPECT_RATIOS = new Set(AVATAR_ASPECT_RATIOS);
var LIVEKIT = globalThis.LivekitClient ?? globalThis.livekitClient ?? null;
var BROWSER_SPEECH_RECOGNITION = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition ?? null;

// web/src/state.ts
function createInitialState() {
  return {
    gateway: {
      socket: null,
      socketReady: false,
      handshakePromise: null,
      handshakeError: null,
      connectRequestId: null,
      requestCounter: 0,
      reconnectTimer: null,
      reconnectBackoffActive: false,
      authModeBootstrapReady: false,
      authModeBootstrapError: null,
      authModeBootstrapPromise: null,
      pendingRequests: /* @__PURE__ */ new Map()
    },
    room: {
      activeRoom: null,
      localAudioTrack: null,
      localAudioTrackPublished: false,
      connectGeneration: 0,
      connectionState: LIVEKIT ? "disconnected" : "failed",
      avatarConnectionState: "idle",
      activeAvatarParticipantIdentity: "",
      avatarSpeechActive: false,
      avatarSpeechLastDetectedAt: 0,
      recentAvatarReplies: [],
      avatarSessionAutoRecovering: false,
      avatarLoadPending: false,
      avatarLoadMessage: ""
    },
    media: {
      preferredMicMuted: false,
      avatarSpeakerMuted: false,
      avatarMutedForPendingChatReply: false
    },
    avatarInterrupt: {
      pending: false,
      ackTimer: null,
      voiceTranscriptionPending: false
    },
    avatarPip: {
      autoStartInPictureInPicture: true,
      documentPictureInPictureWindow: null,
      documentPictureInPictureCleanup: null,
      documentPictureInPictureElements: null,
      pictureInPictureVideo: null,
      messageOverlayState: {
        fadeFrame: null,
        hideTimer: null
      }
    },
    browserSpeech: {
      recognition: null,
      active: false,
      shouldRun: false,
      restartTimer: null
    },
    serverSpeech: {
      audioContext: null,
      sourceNode: null,
      processorNode: null,
      silenceNode: null,
      captureTrack: null,
      mediaRecorder: null,
      mimeType: "",
      captureSource: "",
      roomTrackMuted: false,
      captureError: "",
      discardNextCapture: false,
      encodedChunks: [],
      pendingFallbackWavBytes: null,
      pendingTranscriptRequest: null,
      queuedTranscriptRequest: null,
      startPromise: null,
      drainPromise: null,
      resolveDrainPromise: null,
      speechActive: false,
      speechStartedAt: 0,
      silenceStartedAt: 0,
      pcmChunks: [],
      pcmByteLength: 0,
      prerollChunks: [],
      speechFrameStreak: 0,
      voicedFrameCount: 0,
      bargeInActive: false,
      noiseFloor: 0,
      vadPrevInput: 0,
      vadPrevOutput: 0,
      submissionQueue: Promise.resolve(),
      startRetryTimer: null,
      startRetryCount: 0
    },
    voiceTranscript: {
      lastByConnection: /* @__PURE__ */ new Map()
    },
    session: {
      active: null,
      imageUrl: "",
      aspectRatio: AVATAR_ASPECT_RATIO_DEFAULT,
      avatarJoinTimeoutMs: SESSION_AVATAR_TIMEOUT_DEFAULT_SECONDS * 1e3,
      autoHelloSentSessionKeys: /* @__PURE__ */ new Set(),
      autoHelloPendingSessionKeys: /* @__PURE__ */ new Set()
    },
    chat: {
      messages: [],
      composerDrafts: {
        main: { attachments: [] },
        pip: { attachments: [] }
      },
      awaitingReply: false,
      renderQueued: false,
      renderScrollToBottom: false,
      composerAttachmentIdCounter: 0,
      renderedVoiceUserRuns: /* @__PURE__ */ new Set()
    },
    setup: {
      latestSetupStatus: null,
      openClawCompatibility: {
        version: null,
        minimumCompatibleVersion: MINIMUM_COMPATIBLE_OPENCLAW_VERSION,
        compatible: null
      },
      activeConfigSectionFilter: "all",
      activeConfigMode: "form",
      formBaseline: {
        livekitUrl: "",
        lemonSliceApiKey: "",
        livekitApiKey: "",
        livekitApiSecret: ""
      },
      rawBaseline: "",
      tokenVisible: false,
      secretVisibilityState: /* @__PURE__ */ new Set(),
      storedSetupSecretValues: /* @__PURE__ */ new Map()
    },
    ui: {
      activeThemePreference: "system"
    },
    debug: {
      logEntries: [],
      assistantMetadataBackfillTimers: /* @__PURE__ */ new Map()
    }
  };
}
var state = createInitialState();

// web/src/avatar/room.ts
var callbacks = {
  onOutput: () => {
  },
  onAvatarConnected: () => {
  },
  onAvatarDisconnected: () => {
  },
  onUpdateUi: () => {
  },
  onDataMessage: () => {
  }
};
function setRoomCallbacks(cb) {
  callbacks = { ...callbacks, ...cb };
}
function getAvatarVideoElement(avatarMediaEl = null) {
  return avatarMediaEl?.querySelector("video") ?? null;
}
function hasAvatarVideo(avatarMediaEl = null) {
  return Boolean(getAvatarVideoElement(avatarMediaEl));
}
function hasReconnectableSession() {
  if (!state.session.active || state.room.avatarLoadPending) return false;
  return !state.room.activeRoom || state.room.connectionState === "disconnected" || state.room.avatarConnectionState === "disconnected";
}
function setAvatarConnectionState(nextState) {
  state.room.avatarConnectionState = nextState;
}
function setAvatarLoadingState(isPending, message = "") {
  state.room.avatarLoadPending = Boolean(isPending);
  state.room.avatarLoadMessage = state.room.avatarLoadPending && typeof message === "string" ? message.trim() : "";
}
function disconnectRoom(_options = {}) {
  state.room.connectGeneration += 1;
  state.room.connectionState = "disconnected";
  setAvatarLoadingState(false);
  setAvatarConnectionState(state.session.active ? "disconnected" : "idle");
  const room = state.room.activeRoom;
  if (!room) {
    callbacks.onUpdateUi();
    return;
  }
  try {
    room.disconnect?.();
  } catch {
  }
  state.room.activeRoom = null;
  callbacks.onUpdateUi();
}

// web/src/avatar/pip.ts
function hasDocumentPictureInPictureSupport() {
  return typeof window !== "undefined" && "documentPictureInPicture" in window && typeof window.documentPictureInPicture === "object";
}
function canUseStandardPictureInPicture(videoElement) {
  if (!videoElement) return false;
  return typeof document.exitPictureInPicture === "function" && typeof videoElement.requestPictureInPicture === "function";
}
function canUseWebkitPictureInPicture(videoElement) {
  if (!videoElement) return false;
  return typeof videoElement.webkitSetPresentationMode === "function";
}
function hasAvatarPictureInPictureSupport(videoElement) {
  if (hasDocumentPictureInPictureSupport()) return true;
  if (!videoElement) return false;
  return canUseStandardPictureInPicture(videoElement) || canUseWebkitPictureInPicture(videoElement);
}

// web/src/utils.ts
function normalizeOptionalInputValue(value) {
  return typeof value === "string" ? value.trim() : "";
}
function getStoredBooleanPreference(key, fallback = false) {
  try {
    const stored = localStorage.getItem(key);
    if (stored === "1" || stored === "true") return true;
    if (stored === "0" || stored === "false") return false;
  } catch {
  }
  return fallback;
}
function persistBooleanPreference(key, value) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
  }
}
function persistStringPreference(key, value) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : String(value ?? ""));
  } catch {
  }
}

// web/src/gateway/auth.ts
var VALID_GATEWAY_AUTH_MODES = /* @__PURE__ */ new Set(["token", "password", "trusted-proxy", "none"]);
function readExplicitGatewayAuthMode(rawValue) {
  const normalized = typeof rawValue === "string" ? rawValue.trim().toLowerCase() : "";
  return VALID_GATEWAY_AUTH_MODES.has(normalized) ? normalized : null;
}
function trimStoredSecret(value) {
  return typeof value === "string" ? value.trim() : "";
}
function readStoredSecret(value, options = {}) {
  if (typeof value !== "string") {
    return "";
  }
  return options.trim === false ? value : value.trim();
}
function normalizeGatewayAuthMode(rawValue) {
  return readExplicitGatewayAuthMode(rawValue) || "token";
}
function inferGatewayAuthModeFromSettings(settings = {}) {
  const normalizedSettings = settings && typeof settings === "object" ? settings : {};
  const explicitMode = readExplicitGatewayAuthMode(normalizedSettings.gatewayAuthMode);
  if (explicitMode) {
    return explicitMode;
  }
  if (typeof normalizedSettings.password === "string" && normalizedSettings.password.trim().length > 0) {
    return "password";
  }
  return "token";
}
function getGatewayAuthStateFromSettings(settings = {}, legacyToken = "") {
  const normalizedSettings = settings && typeof settings === "object" ? settings : {};
  const mode = inferGatewayAuthModeFromSettings(normalizedSettings);
  const shouldTrimPasswordSecret = mode !== "password";
  const gatewayAuthSecret = readStoredSecret(normalizedSettings.gatewayAuthSecret, {
    trim: shouldTrimPasswordSecret
  });
  const password = readStoredSecret(normalizedSettings.password, {
    trim: shouldTrimPasswordSecret
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
function reconcileGatewayAuthStateWithServerMode(currentState, rawMode) {
  const mode = normalizeGatewayAuthMode(rawMode);
  const secret = trimStoredSecret(currentState?.secret);
  return { mode, secret };
}
function readStoredOpenClawSettings() {
  try {
    const rawSettings = localStorage.getItem(OPENCLAW_SETTINGS_STORAGE_KEY);
    if (rawSettings) {
      const parsed = JSON.parse(rawSettings);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    }
  } catch {
  }
  return {};
}
function logGatewayStorageFailure(context, error) {
  console.warn("[avatar-ui]", context, error);
}
function writeStoredOpenClawSettings(settings) {
  try {
    localStorage.setItem(OPENCLAW_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    logGatewayStorageFailure("openclaw-settings-write-failed", error);
  }
}
function readLegacyGatewayToken() {
  try {
    return localStorage.getItem(LEGACY_TOKEN_STORAGE_KEY) || "";
  } catch (error) {
    logGatewayStorageFailure("gateway-legacy-token-read-failed", error);
    return "";
  }
}
function removeLegacyGatewayToken() {
  try {
    localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
  } catch (error) {
    logGatewayStorageFailure("gateway-legacy-token-remove-failed", error);
  }
}
function getGatewayAuthState() {
  const settings = readStoredOpenClawSettings();
  const legacyToken = readLegacyGatewayToken();
  return getGatewayAuthStateFromSettings(settings, legacyToken);
}
function gatewayAuthRequiresSharedSecret(mode = getGatewayAuthState().mode) {
  return mode === "token" || mode === "password";
}
function getGatewayAuthMode() {
  return getGatewayAuthState().mode;
}
function getGatewayAuthDisplayName(mode = getGatewayAuthMode()) {
  if (mode === "password") {
    return "gateway password";
  }
  if (mode === "token") {
    return "gateway token";
  }
  return "gateway auth";
}
function getGatewayToken() {
  return getGatewayAuthState().secret;
}
function hasGatewayToken() {
  const { mode, secret } = getGatewayAuthState();
  return !gatewayAuthRequiresSharedSecret(mode) || secret.length > 0;
}
function getAuthHeaders() {
  const { mode, secret } = getGatewayAuthState();
  if (!gatewayAuthRequiresSharedSecret(mode) || !secret) {
    return {};
  }
  return {
    Authorization: `Bearer ${secret}`
  };
}
function createGatewayAuthModeBootstrapError(error) {
  const nextError = new Error(
    "Could not verify the server gateway auth mode. Retry after the server responds."
  );
  if (error !== void 0) {
    nextError.cause = error;
  }
  return nextError;
}
function resolveGatewayAuthModeForPersistence(rawMode) {
  if (rawMode !== void 0 && rawMode !== null) {
    return normalizeGatewayAuthMode(rawMode);
  }
  if (!state.gateway.authModeBootstrapReady) {
    throw createGatewayAuthModeBootstrapError(state.gateway.authModeBootstrapError);
  }
  return getGatewayAuthMode();
}
function persistGatewayToken(token, options = {}) {
  const mode = resolveGatewayAuthModeForPersistence(options.mode);
  const nextToken = typeof token === "string" ? mode === "password" ? token : token.trim() : "";
  const settings = readStoredOpenClawSettings();
  writeStoredOpenClawSettings({
    ...settings,
    gatewayAuthMode: mode,
    gatewayAuthSecret: nextToken,
    password: mode === "password" ? nextToken : "",
    token: mode === "token" ? nextToken : ""
  });
}
function clearGatewayToken() {
  const settings = readStoredOpenClawSettings();
  writeStoredOpenClawSettings({
    ...settings,
    gatewayAuthSecret: "",
    password: "",
    token: ""
  });
  removeLegacyGatewayToken();
}
function hydrateOpenClawCompatibility(payload) {
  const openclaw = payload?.openclaw ?? {};
  state.setup.openClawCompatibility = {
    version: typeof openclaw.version === "string" ? openclaw.version : null,
    minimumCompatibleVersion: typeof openclaw.minimumCompatibleVersion === "string" && openclaw.minimumCompatibleVersion.trim() ? openclaw.minimumCompatibleVersion.trim() : MINIMUM_COMPATIBLE_OPENCLAW_VERSION,
    compatible: typeof openclaw.compatible === "boolean" ? openclaw.compatible : null
  };
  return state.setup.openClawCompatibility;
}
async function requestBrowserBootstrapPayload() {
  const response = await fetch(`${AVATAR_PLUGIN_BASE_PATH}/bootstrap`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error("Failed to load browser bootstrap payload.");
  }
  hydrateOpenClawCompatibility(payload);
  return payload;
}
async function bootstrapGatewayAuthModeFromServer() {
  if (state.gateway.authModeBootstrapPromise) {
    return state.gateway.authModeBootstrapPromise;
  }
  state.gateway.authModeBootstrapPromise = (async () => {
    const payload = await requestBrowserBootstrapPayload();
    const gateway = payload?.gateway ?? {};
    const auth = gateway?.auth ?? {};
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
    return await state.gateway.authModeBootstrapPromise;
  } catch (error) {
    state.gateway.authModeBootstrapReady = false;
    state.gateway.authModeBootstrapError = error;
    throw error;
  } finally {
    state.gateway.authModeBootstrapPromise = null;
  }
}
async function ensureGatewayAuthModeBootstrapped() {
  if (state.gateway.authModeBootstrapReady) {
    return;
  }
  await bootstrapGatewayAuthModeFromServer();
}
function migrateLegacyGatewayTokenIfNeeded() {
  const legacy = readLegacyGatewayToken();
  if (!legacy?.trim()) {
    return;
  }
  if (!getGatewayToken()) {
    persistGatewayToken(legacy, { mode: getGatewayAuthMode() });
  }
  removeLegacyGatewayToken();
}

// web/src/avatar/session.ts
var callbacks2 = {
  onOutput: () => {
  },
  onSessionStopped: () => {
  }
};
function setSessionCallbacks(cb) {
  callbacks2 = { ...callbacks2, ...cb };
}
function resolveSessionAspectRatioValue(rawValue) {
  const normalized = typeof rawValue === "string" ? rawValue.trim() : "";
  if (SESSION_AVATAR_ASPECT_RATIOS.has(normalized)) {
    return normalized;
  }
  return AVATAR_ASPECT_RATIO_DEFAULT;
}
function parseSessionAvatarTimeoutSeconds(rawValue) {
  if (rawValue === null || rawValue === void 0) {
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
    Math.max(SESSION_AVATAR_TIMEOUT_MIN_SECONDS, rounded)
  );
}
function resolveSessionImageUrlValue(rawValue) {
  return normalizeOptionalInputValue(rawValue);
}
function isAllowedSessionImageUrlProtocol(protocol) {
  return protocol === "https:" || protocol === "http:" || protocol === "data:";
}
function assertValidSessionImageUrl(imageUrl) {
  const normalizedImageUrl = resolveSessionImageUrlValue(imageUrl);
  if (!normalizedImageUrl) {
    throw new Error("Avatar image URL is required.");
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(normalizedImageUrl);
  } catch {
    throw new Error("Invalid avatar image URL or unsupported protocol.");
  }
  if (!isAllowedSessionImageUrlProtocol(parsedUrl.protocol)) {
    throw new Error("Invalid avatar image URL or unsupported protocol.");
  }
  if (parsedUrl.protocol === "data:" && !/^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(normalizedImageUrl)) {
    throw new Error("Invalid avatar image URL or unsupported protocol.");
  }
  return normalizedImageUrl;
}
function buildSessionCreatePayload(sessionKey, options = {}) {
  const avatarImageUrl = assertValidSessionImageUrl(options.avatarImageUrl);
  return {
    sessionKey,
    avatarImageUrl,
    aspectRatio: resolveSessionAspectRatioValue(options.aspectRatio),
    avatarTimeoutSeconds: parseSessionAvatarTimeoutSeconds(options.avatarTimeoutSeconds),
    interruptReplyOnNewMessage: true
  };
}
function syncSessionInputsFromSetupStatus(setup, sessionImageUrlInput, storedImageUrl) {
  const normalizedStoredImageUrl = storedImageUrl?.trim();
  const hasStoredCustomImageUrl = Boolean(normalizedStoredImageUrl) && normalizedStoredImageUrl !== DEFAULT_SESSION_IMAGE_URL;
  const currentImageUrl = resolveSessionImageUrlValue(sessionImageUrlInput?.value);
  const lemonSlice = setup?.lemonSlice ?? {};
  const setupImageUrl = resolveSessionImageUrlValue(lemonSlice?.imageUrl);
  if (sessionImageUrlInput && typeof sessionImageUrlInput.value === "string" && !hasStoredCustomImageUrl && (!currentImageUrl || currentImageUrl === DEFAULT_SESSION_IMAGE_URL) && setupImageUrl) {
    sessionImageUrlInput.value = setupImageUrl;
  }
}
async function requestJson(path, options = {}) {
  const hasBody = options.body !== void 0 && options.body !== null;
  const response = await fetch(path, {
    headers: {
      ...hasBody ? { "content-type": "application/json" } : {},
      ...getAuthHeaders(),
      ...options.headers || {}
    },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    if (response.status === 401) {
      const error2 = new Error("Unauthorized: enter a valid gateway token or password.");
      error2.code = "GATEWAY_UNAUTHORIZED";
      error2.status = response.status;
      throw error2;
    }
    const errorObj = payload?.error ?? {};
    const details = errorObj?.details ?? {};
    const message = errorObj?.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.code = errorObj?.code;
    error.field = errorObj?.field ?? details?.field;
    error.type = errorObj?.type ?? details?.type;
    error.status = response.status;
    throw error;
  }
  return payload;
}
async function stopActiveSession(disconnectRoom2, stopAvatarSidecar) {
  const session = state.session.active;
  const sessionKey = session?.sessionKey;
  if (sessionKey) {
    state.session.autoHelloSentSessionKeys.delete(sessionKey);
    state.session.autoHelloPendingSessionKeys.delete(sessionKey);
  }
  disconnectRoom2();
  state.session.active = null;
  state.session.imageUrl = "";
  state.session.aspectRatio = AVATAR_ASPECT_RATIO_DEFAULT;
  state.session.avatarJoinTimeoutMs = SESSION_AVATAR_TIMEOUT_DEFAULT_SECONDS * 1e3;
  callbacks2.onSessionStopped();
  const roomName = session?.roomName;
  let sessionOutput;
  if (!roomName) {
    sessionOutput = { action: "session-stopped" };
  } else {
    try {
      await requestJson(`${AVATAR_PLUGIN_BASE_PATH}/api/session/stop`, {
        method: "POST",
        body: JSON.stringify({ roomName })
      });
      sessionOutput = { action: "session-stopped", roomName };
    } catch (error) {
      sessionOutput = {
        action: "session-stop-failed",
        roomName,
        error: String(error)
      };
    }
  }
  callbacks2.onOutput(sessionOutput);
  try {
    await stopAvatarSidecar();
    callbacks2.onOutput({
      ...sessionOutput,
      sidecar: { stopped: true }
    });
  } catch (error) {
    callbacks2.onOutput({
      ...sessionOutput,
      sidecar: { stopped: false, error: String(error) }
    });
  }
}

// web/src/avatar/speech.ts
function clearRecentAvatarReplies() {
  state.room.recentAvatarReplies.length = 0;
}

// web/src/chat/composer.ts
function normalizeChatComposerKey(key) {
  return key === "pip" ? "pip" : "main";
}
function nextChatComposerAttachmentId() {
  state.chat.composerAttachmentIdCounter += 1;
  return `chat-attachment-${Date.now()}-${state.chat.composerAttachmentIdCounter}`;
}
function isSupportedChatImageMimeType(mimeType) {
  return CHAT_SUPPORTED_IMAGE_MIME_TYPES.has(mimeType);
}
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file as data URL."));
      }
    };
    reader.onerror = () => reject(reader.error || new Error("File read failed."));
    reader.readAsDataURL(file);
  });
}
function extractImageFilesFromClipboardEvent(event) {
  const files = [];
  const items = event.clipboardData?.items;
  if (!items) return files;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind !== "file") continue;
    if (!isSupportedChatImageMimeType(item.type)) continue;
    const file = item.getAsFile();
    if (file && file.size <= CHAT_MAX_IMAGE_ATTACHMENT_BYTES) {
      files.push(file);
    }
  }
  return files;
}
function getChatComposerDraft(key = "main") {
  const normalized = normalizeChatComposerKey(key);
  return state.chat.composerDrafts[normalized] ?? { attachments: [] };
}
function clearChatComposerAttachments(key) {
  const normalized = normalizeChatComposerKey(key);
  const draft = state.chat.composerDrafts[normalized];
  if (draft) {
    draft.attachments = [];
  }
}
function removeChatComposerAttachment(key, attachmentId) {
  const normalized = normalizeChatComposerKey(key);
  const draft = state.chat.composerDrafts[normalized];
  if (!draft) return;
  draft.attachments = draft.attachments.filter((a) => a.id !== attachmentId);
}
function hasChatComposerDraftValue(value, attachments = []) {
  return typeof value === "string" && value.trim().length > 0 || attachments.length > 0;
}
function estimateChatTokens(value) {
  if (typeof value !== "string" || value.length < CHAT_TOKEN_ESTIMATE_MIN_CHARS) {
    return null;
  }
  return Math.ceil(value.length / 4);
}
function syncTextareaHeight(textarea, options = {}) {
  if (!textarea) return;
  const minHeight = options.minHeight ?? 40;
  const maxHeight = options.maxHeight ?? 200;
  textarea.style.height = "auto";
  const scrollHeight = textarea.scrollHeight;
  textarea.style.height = `${Math.min(maxHeight, Math.max(minHeight, scrollHeight))}px`;
}

// web/src/chat/messages.ts
function extractMessageUsageMeta(rawMessage) {
  if (!rawMessage || typeof rawMessage !== "object") return null;
  const usage = rawMessage.usage;
  if (!usage || typeof usage !== "object") return null;
  const inputTokens = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
  const outputTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
  if (inputTokens === 0 && outputTokens === 0) return null;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cost: usage.cost ?? null,
    model: rawMessage.model ?? null
  };
}
function appendChatLine(role, textOrMessage, options = {}) {
  const message = typeof textOrMessage === "string" ? {
    role,
    text: textOrMessage,
    timestamp: options.timestamp ?? void 0
  } : {
    role,
    text: textOrMessage.text,
    images: textOrMessage.images,
    timestamp: options.timestamp ?? void 0
  };
  if (options.runId) message.runId = options.runId;
  if (options.rawMessage) {
    message.usage = extractMessageUsageMeta(options.rawMessage) ?? void 0;
  }
  state.chat.messages.push(message);
  if (options.awaitingReply !== void 0) {
    state.chat.awaitingReply = Boolean(options.awaitingReply);
  }
}
function clearStreamingAssistantMessages() {
  let changed = false;
  for (const msg of state.chat.messages) {
    if (msg.role === "assistant" && msg.streaming) {
      msg.streaming = false;
      changed = true;
    }
  }
  return changed;
}
function findLatestStreamingAssistantMessage(runId = "") {
  for (let i = state.chat.messages.length - 1; i >= 0; i--) {
    const msg = state.chat.messages[i];
    if (msg.role === "assistant" && msg.streaming && (!runId || msg.runId === runId)) {
      return msg;
    }
  }
  return null;
}
function upsertStreamingAssistantMessage(textOrMessage, options = {}) {
  const content = typeof textOrMessage === "string" ? { text: textOrMessage, images: [] } : {
    text: textOrMessage.text,
    images: textOrMessage.images ?? []
  };
  const existing = findLatestStreamingAssistantMessage(options.runId);
  if (existing) {
    if (options.state === "delta") {
      existing.text = (existing.text || "") + content.text;
      if (content.images.length > 0) {
        existing.images = [...existing.images ?? [], ...content.images];
      }
    } else {
      existing.text = content.text;
      existing.images = content.images;
    }
    if (options.timestamp != null) {
      existing.timestamp = options.timestamp ?? void 0;
    }
    if (options.rawMessage) {
      existing.usage = extractMessageUsageMeta(options.rawMessage) ?? void 0;
    }
  } else {
    const msg = {
      role: "assistant",
      text: content.text,
      images: content.images,
      streaming: true,
      runId: options.runId,
      timestamp: options.timestamp ?? void 0
    };
    if (options.rawMessage) {
      msg.usage = extractMessageUsageMeta(options.rawMessage) ?? void 0;
    }
    state.chat.messages.push(msg);
  }
}
function finalizeStreamingAssistantMessage(textOrMessage, options = {}) {
  const existing = findLatestStreamingAssistantMessage(options.runId);
  const content = typeof textOrMessage === "string" ? { text: textOrMessage, images: [] } : {
    text: textOrMessage.text,
    images: textOrMessage.images ?? []
  };
  if (existing) {
    existing.streaming = false;
    if (content.text) existing.text = content.text;
    if (content.images.length > 0) existing.images = content.images;
    if (options.timestamp != null) existing.timestamp = options.timestamp ?? void 0;
    if (options.rawMessage) {
      existing.usage = extractMessageUsageMeta(options.rawMessage) ?? void 0;
    }
  } else if (content.text || content.images.length > 0) {
    appendChatLine("assistant", content, {
      runId: options.runId,
      timestamp: options.timestamp,
      rawMessage: options.rawMessage
    });
  }
  if (options.awaitingReply !== void 0) {
    state.chat.awaitingReply = Boolean(options.awaitingReply);
  }
}

// web/src/chat/renderer.ts
function formatChatTokensCompact(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

// web/src/gateway/socket.ts
var callbacks3 = {
  onChatEvent: () => {
  },
  onChatStatus: () => {
  },
  onOutput: () => {
  },
  onReady: () => {
  },
  onClose: () => {
  },
  onAfterClose: () => {
  }
};
function setGatewaySocketCallbacks(cb) {
  callbacks3 = { ...callbacks3, ...cb };
}
function nextGatewayRequestId() {
  state.gateway.requestCounter += 1;
  return `avatar-ui-${Date.now()}-${state.gateway.requestCounter}`;
}
function clearGatewayPendingRequests(error) {
  for (const [id, pending] of state.gateway.pendingRequests.entries()) {
    if (pending.timer) clearTimeout(pending.timer);
    pending.reject(error);
    state.gateway.pendingRequests.delete(id);
  }
}
function clearGatewayReconnectTimer() {
  state.gateway.reconnectBackoffActive = false;
  if (state.gateway.reconnectTimer === null) {
    return;
  }
  clearTimeout(state.gateway.reconnectTimer);
  state.gateway.reconnectTimer = null;
}
function createGatewayAuthError(message) {
  const error = new Error(message);
  error.code = "GATEWAY_AUTH_FAILED";
  return error;
}
function isGatewaySocketAuthError(error) {
  if (!error) {
    return false;
  }
  const code = typeof error?.code === "string" ? error.code : "";
  if (code === "GATEWAY_AUTH_FAILED") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /unauthorized|invalid token|invalid password|auth|401|403|forbidden/i.test(message);
}
function reportGatewaySocketAuthFailure(error) {
  callbacks3.onOutput({
    action: "auth-failed",
    error: error instanceof Error ? error.message : String(error)
  });
}
function closeGatewaySocket(reason) {
  clearGatewayReconnectTimer();
  state.gateway.socketReady = false;
  state.gateway.connectRequestId = null;
  if (state.gateway.socket) {
    try {
      state.gateway.socket.close();
    } catch {
    }
  }
  state.gateway.socket = null;
  state.gateway.handshakePromise = null;
  clearGatewayPendingRequests(new Error(reason));
  callbacks3.onClose(false);
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
    const token = getGatewayToken();
    const gatewayAuthMode = getGatewayAuthMode();
    const connectRequestId = nextGatewayRequestId();
    state.gateway.connectRequestId = connectRequestId;
    const auth = gatewayAuthRequiresSharedSecret(gatewayAuthMode) && token ? gatewayAuthMode === "password" ? { password: token } : { token } : null;
    const params = {
      minProtocol: GATEWAY_PROTOCOL_VERSION,
      maxProtocol: GATEWAY_PROTOCOL_VERSION,
      client: GATEWAY_WS_CLIENT,
      role: "operator",
      scopes: GATEWAY_WS_SCOPES,
      ...auth ? { auth } : {}
    };
    state.gateway.socket?.send(
      JSON.stringify({
        type: "req",
        id: connectRequestId,
        method: "connect",
        params
      })
    );
    return;
  }
  if (frame.type === "res") {
    if (frame.id === state.gateway.connectRequestId) {
      state.gateway.connectRequestId = null;
      if (!frame.ok) {
        const message2 = frame.error?.message || "Gateway websocket authorization failed.";
        state.gateway.handshakeError = createGatewayAuthError(message2);
        closeGatewaySocket(message2);
        callbacks3.onChatStatus(message2);
        return;
      }
      state.gateway.socketReady = true;
      callbacks3.onChatStatus("Chat connected.");
      callbacks3.onReady();
      return;
    }
    const pending = state.gateway.pendingRequests.get(frame.id);
    if (!pending) {
      return;
    }
    if (pending.timer) clearTimeout(pending.timer);
    state.gateway.pendingRequests.delete(frame.id);
    if (frame.ok) {
      pending.resolve(frame.payload ?? {});
      return;
    }
    const message = frame.error?.message || "Request failed";
    pending.reject(new Error(message));
    return;
  }
  if (frame.type === "event" && frame.event === "chat") {
    callbacks3.onChatEvent(frame.payload || {});
  }
}
async function ensureGatewaySocketConnected() {
  if (state.gateway.socketReady && state.gateway.socket && state.gateway.socket.readyState === WebSocket.OPEN) {
    return;
  }
  if (state.gateway.handshakePromise) {
    return state.gateway.handshakePromise;
  }
  state.gateway.handshakePromise = new Promise((resolve, reject) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${protocol}//${window.location.host}`;
    let settled = false;
    const onSettledError = (error) => {
      if (settled) return;
      settled = true;
      state.gateway.handshakePromise = null;
      reject(error);
    };
    const onSettledSuccess = () => {
      if (settled) return;
      settled = true;
      state.gateway.handshakePromise = null;
      resolve();
    };
    callbacks3.onChatStatus("Connecting chat websocket...");
    const ws = new WebSocket(socketUrl);
    state.gateway.socket = ws;
    state.gateway.socketReady = false;
    state.gateway.handshakeError = null;
    state.gateway.connectRequestId = null;
    const connectTimer = setTimeout(() => {
      onSettledError(new Error("Timed out connecting to gateway websocket."));
      closeGatewaySocket("Timed out connecting to gateway websocket.");
    }, 1e4);
    ws.addEventListener("message", (event) => {
      handleGatewaySocketMessage(event.data);
      if (!settled && state.gateway.socketReady) {
        clearTimeout(connectTimer);
        onSettledSuccess();
      }
    });
    ws.addEventListener("close", (evt) => {
      const closeReason = typeof evt?.reason === "string" ? evt.reason.toLowerCase() : "";
      const authFailure = state.gateway.handshakeError || evt?.code === 1008 || /unauthorized|invalid token|invalid password|auth|401|403|forbidden/i.test(closeReason);
      if (!settled) {
        clearTimeout(connectTimer);
        const closeError = state.gateway.handshakeError || (authFailure ? createGatewayAuthError(
          typeof evt?.reason === "string" && evt.reason.trim() ? evt.reason.trim() : "Gateway websocket authorization failed."
        ) : new Error("Gateway websocket closed before connect completed."));
        onSettledError(closeError);
      }
      if (state.gateway.socket === ws) {
        state.gateway.socket = null;
      }
      state.gateway.handshakeError = null;
      state.gateway.socketReady = false;
      state.gateway.connectRequestId = null;
      clearGatewayPendingRequests(new Error("Gateway websocket closed."));
      callbacks3.onChatStatus("Chat disconnected.");
      callbacks3.onAfterClose();
      const handshakeStillPending = !settled || state.gateway.connectRequestId !== null;
      if (!handshakeStillPending && !authFailure && !state.gateway.reconnectBackoffActive) {
        scheduleGatewaySocketReconnect();
      }
    });
    ws.addEventListener("error", () => {
      if (!settled) {
        clearTimeout(connectTimer);
        onSettledError(new Error("Gateway websocket connection failed."));
      }
    });
  });
  return state.gateway.handshakePromise;
}
function scheduleGatewaySocketReconnect(delayMs = 1e3) {
  if (state.gateway.reconnectTimer !== null || state.gateway.handshakePromise || !state.session.active || !hasGatewayToken() || state.gateway.socket && state.gateway.socket.readyState === WebSocket.OPEN && state.gateway.socketReady) {
    return;
  }
  state.gateway.reconnectBackoffActive = true;
  state.gateway.reconnectTimer = setTimeout(() => {
    state.gateway.reconnectTimer = null;
    if (!state.session.active || !hasGatewayToken()) {
      state.gateway.reconnectBackoffActive = false;
      return;
    }
    void ensureGatewaySocketConnected().catch((error) => {
      if (isGatewaySocketAuthError(error)) {
        state.gateway.reconnectBackoffActive = false;
        reportGatewaySocketAuthFailure(error);
        return;
      }
      callbacks3.onOutput({
        action: "chat-websocket-reconnect-failed",
        error: error instanceof Error ? error.message : String(error)
      });
      scheduleGatewaySocketReconnect(Math.min(delayMs * 2, 1e4));
    }).then(() => {
      if (state.gateway.socketReady) {
        state.gateway.reconnectBackoffActive = false;
      }
    });
  }, delayMs);
}

// web/src/ui/layout.ts
function updateNavCollapseButtonState(isCollapsed, navCollapseButton) {
  if (!navCollapseButton) return;
  const collapsed = Boolean(isCollapsed);
  navCollapseButton.setAttribute("aria-expanded", collapsed ? "false" : "true");
  navCollapseButton.setAttribute(
    "aria-label",
    collapsed ? "Expand navigation menu" : "Collapse navigation menu"
  );
  navCollapseButton.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
}
function setNavCollapsed(isCollapsed, els, options = {}) {
  const collapsed = Boolean(isCollapsed);
  const shouldPersist = options.persist !== false;
  els.shellEl?.classList.toggle("shell--nav-collapsed", collapsed);
  els.navEl?.classList.toggle("nav--collapsed", collapsed);
  updateNavCollapseButtonState(collapsed, els.navCollapseButton);
  if (!shouldPersist) return;
  try {
    localStorage.setItem(NAV_COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
  }
}
function initNavCollapseToggle(els) {
  if (!els.navCollapseButton) return;
  let storedCollapsed = false;
  try {
    storedCollapsed = localStorage.getItem(NAV_COLLAPSE_STORAGE_KEY) === "1";
  } catch {
    storedCollapsed = false;
  }
  setNavCollapsed(storedCollapsed, els, { persist: false });
  els.navCollapseButton.addEventListener("click", () => {
    const isCollapsed = els.shellEl?.classList.contains("shell--nav-collapsed") || els.navEl?.classList.contains("nav--collapsed");
    setNavCollapsed(!isCollapsed, els);
  });
}
function isMobileChatPane(mobileChatPaneMedia) {
  return Boolean(mobileChatPaneMedia?.matches);
}
function getChatPaneWidthBounds(contentEl) {
  const layoutWidth = contentEl?.getBoundingClientRect().width ?? window.innerWidth;
  const maxWidth = Math.max(
    CHAT_PANE_MIN_WIDTH,
    Math.min(CHAT_PANE_MAX_WIDTH, Math.floor(layoutWidth - 320))
  );
  return { min: CHAT_PANE_MIN_WIDTH, max: maxWidth };
}
function applyChatPaneWidth(nextWidth, shellEl, contentEl, options = {}) {
  if (!shellEl || !Number.isFinite(nextWidth)) return;
  const shouldPersist = options.persist !== false;
  const { min, max } = getChatPaneWidthBounds(contentEl);
  const clamped = Math.min(max, Math.max(min, Math.round(nextWidth)));
  shellEl.style.setProperty(CHAT_PANE_WIDTH_CSS_VARIABLE, `${clamped}px`);
  if (!shouldPersist) return;
  try {
    localStorage.setItem(CHAT_PANE_WIDTH_STORAGE_KEY, String(clamped));
  } catch {
  }
}
function setChatPaneOpen(isOpen, els, options = {}) {
  const shouldPersist = options.persist !== false;
  const isMobile = isMobileChatPane(els.mobileChatPaneMedia);
  els.shellEl?.classList.toggle("shell--chat-pane-open", isOpen);
  els.shellEl?.classList.toggle("shell--chat-pane-closed", !isOpen);
  if (els.chatPaneEl) {
    els.chatPaneEl.setAttribute("aria-hidden", isOpen ? "false" : "true");
    els.chatPaneEl.hidden = isMobile && !isOpen;
    if ("inert" in els.chatPaneEl) {
      els.chatPaneEl.inert = !isOpen;
    }
  }
  if (els.chatPaneBackdropEl) {
    els.chatPaneBackdropEl.hidden = !isMobile || !isOpen;
  }
  if (els.chatPaneResizerEl) {
    els.chatPaneResizerEl.hidden = isMobile || !isOpen;
  }
  if (els.chatPaneToggleButton) {
    els.chatPaneToggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
    els.chatPaneToggleButton.setAttribute(
      "title",
      isOpen ? "Hide text chat panel" : "Show text chat panel"
    );
  }
  if (shouldPersist) {
    try {
      localStorage.setItem(CHAT_PANE_STORAGE_KEY, isOpen ? "1" : "0");
    } catch {
    }
  }
}
function resolveInitialChatPaneOpen(mobileChatPaneMedia) {
  let isOpen = !isMobileChatPane(mobileChatPaneMedia);
  let storedWidth = 360;
  try {
    const stored = localStorage.getItem(CHAT_PANE_STORAGE_KEY);
    if (stored === "0") isOpen = false;
    else if (stored === "1") isOpen = true;
    const parsedWidth = Number(localStorage.getItem(CHAT_PANE_WIDTH_STORAGE_KEY));
    if (Number.isFinite(parsedWidth) && parsedWidth > 0) storedWidth = parsedWidth;
  } catch {
    storedWidth = 360;
  }
  return { isOpen, storedWidth };
}
function getAvatarPaneWidthBounds(avatarPaneEl, contentEl) {
  const availableWidth = avatarPaneEl?.parentElement?.getBoundingClientRect().width ?? contentEl?.getBoundingClientRect().width ?? window.innerWidth;
  const maxWidth = Math.max(
    AVATAR_PANE_MIN_WIDTH,
    Math.min(AVATAR_PANE_MAX_WIDTH, Math.floor(availableWidth))
  );
  return { min: AVATAR_PANE_MIN_WIDTH, max: maxWidth };
}
function applyAvatarPaneWidth(nextWidth, shellEl, avatarPaneEl, contentEl, options = {}) {
  if (!shellEl || !Number.isFinite(nextWidth)) return;
  const shouldPersist = options.persist !== false;
  const { min, max } = getAvatarPaneWidthBounds(avatarPaneEl, contentEl);
  const clamped = Math.min(max, Math.max(min, Math.round(nextWidth)));
  shellEl.style.setProperty(AVATAR_PANE_WIDTH_CSS_VARIABLE, `${clamped}px`);
  if (!shouldPersist) return;
  try {
    localStorage.setItem(AVATAR_PANE_WIDTH_STORAGE_KEY, String(clamped));
  } catch {
  }
}
function getCurrentAvatarPaneWidth(avatarPaneEl, shellEl) {
  const measuredWidth = avatarPaneEl?.hidden ? 0 : avatarPaneEl?.getBoundingClientRect().width;
  if (Number.isFinite(measuredWidth) && (measuredWidth ?? 0) > 0) return measuredWidth;
  const storedWidth = parseInt(
    shellEl?.style.getPropertyValue(AVATAR_PANE_WIDTH_CSS_VARIABLE) || "760",
    10
  );
  if (Number.isFinite(storedWidth) && storedWidth > 0) return storedWidth;
  return 760;
}
function initAvatarPaneResize(els) {
  let storedWidth = 760;
  try {
    const parsed = Number(localStorage.getItem(AVATAR_PANE_WIDTH_STORAGE_KEY));
    if (Number.isFinite(parsed) && parsed > 0) storedWidth = parsed;
  } catch {
    storedWidth = 760;
  }
  applyAvatarPaneWidth(storedWidth, els.shellEl, els.avatarPaneEl, els.contentEl, {
    persist: false
  });
  if (!els.avatarResizeHandleEl || !els.avatarPaneEl) return;
  els.avatarResizeHandleEl.addEventListener("pointerdown", (event) => {
    const pointerEvent = event;
    if (isMobileChatPane(els.mobileChatPaneMedia)) return;
    pointerEvent.preventDefault();
    const startX = pointerEvent.clientX;
    const startWidth = els.avatarPaneEl.getBoundingClientRect().width;
    els.shellEl?.classList.add("shell--avatar-resizing");
    const onPointerMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      applyAvatarPaneWidth(startWidth + deltaX, els.shellEl, els.avatarPaneEl, els.contentEl);
    };
    const onPointerUp = () => {
      els.shellEl?.classList.remove("shell--avatar-resizing");
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  });
  window.addEventListener("resize", () => {
    applyAvatarPaneWidth(
      getCurrentAvatarPaneWidth(els.avatarPaneEl, els.shellEl),
      els.shellEl,
      els.avatarPaneEl,
      els.contentEl,
      { persist: false }
    );
  });
}

// web/src/ui/setup.ts
var setupSecretFieldNames = ["lemonSliceApiKey", "livekitApiKey", "livekitApiSecret"];
var setupPayloadFieldNames = ["livekitUrl", ...setupSecretFieldNames];
function hasOwn(obj, key) {
  return Object.hasOwn(obj, key);
}
function isSetupSecretFieldName(name) {
  return setupSecretFieldNames.includes(name);
}
function isRedactedSecretValue(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return normalized === REDACTED_SECRET_VALUE || normalized === OPENCLAW_REDACTED_SECRET_VALUE;
}
function getStoredSetupSecretValueFromPayload(setup, fieldName) {
  const lemonSlice = setup?.lemonSlice ?? {};
  const livekit = setup?.livekit ?? {};
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
function getStoredSetupSecretValue(setup, fieldName) {
  if (state.setup.storedSetupSecretValues.has(fieldName)) {
    return normalizeOptionalInputValue(state.setup.storedSetupSecretValues.get(fieldName));
  }
  if (!setup) return "";
  return getStoredSetupSecretValueFromPayload(setup, fieldName);
}
function cacheSetupSecretValues(setup) {
  state.setup.storedSetupSecretValues.clear();
  if (!setup || typeof setup !== "object") return;
  for (const name of setupSecretFieldNames) {
    const value = getStoredSetupSecretValueFromPayload(setup, name);
    if (value) {
      state.setup.storedSetupSecretValues.set(name, value);
    }
  }
}
function redactSetupSecretValue(value, configured) {
  if (configured || normalizeOptionalInputValue(value).length > 0) {
    return REDACTED_SECRET_VALUE;
  }
  return "";
}
function sanitizeSetupStatusForClient(setup) {
  if (!setup || typeof setup !== "object") return null;
  const lemonSlice = setup.lemonSlice ?? {};
  const livekit = setup.livekit ?? {};
  return {
    ...setup,
    configured: Boolean(setup.configured),
    lemonSlice: {
      ...lemonSlice,
      apiKey: redactSetupSecretValue(lemonSlice.apiKey, lemonSlice.apiKeyConfigured)
    },
    livekit: {
      ...livekit,
      apiKey: redactSetupSecretValue(livekit.apiKey, livekit.apiKeyConfigured),
      apiSecret: redactSetupSecretValue(livekit.apiSecret, livekit.apiSecretConfigured)
    }
  };
}
function buildSetupPayloadFromForm(setupForm) {
  const payload = {};
  if (!setupForm) return payload;
  for (const name of setupPayloadFieldNames) {
    const field = setupForm.elements.namedItem(name);
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
function shouldPreserveStoredSecret(name, value) {
  if (!state.setup.latestSetupStatus) return false;
  const normalizedValue = normalizeOptionalInputValue(value);
  const storedValue = normalizeOptionalInputValue(
    getStoredSetupSecretValue(
      state.setup.latestSetupStatus,
      name
    )
  );
  return Boolean(storedValue) && normalizedValue === storedValue;
}
var SetupRawPayloadError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "SetupRawPayloadError";
  }
};
function isSetupRawPayloadError(error) {
  return error instanceof SetupRawPayloadError;
}
function parseSetupPayloadFromRaw(rawText) {
  const trimmed = typeof rawText === "string" ? rawText.trim() : "";
  if (!trimmed) return {};
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new SetupRawPayloadError("Raw payload must be valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new SetupRawPayloadError("Raw payload must be a JSON object.");
  }
  const payload = {};
  for (const name of setupPayloadFieldNames) {
    if (!hasOwn(parsed, name)) continue;
    const value = parsed[name];
    if (typeof value !== "string") {
      throw new SetupRawPayloadError(`"${name}" must be a string.`);
    }
    if (isSetupSecretFieldName(name) && isRedactedSecretValue(value)) continue;
    payload[name] = value;
  }
  return payload;
}
function serializeSetupPayload(payload) {
  return `${JSON.stringify(payload, null, 2)}
`;
}
function snapshotSetupFormBaseline(setupForm) {
  state.setup.formBaseline = {
    livekitUrl: getSetupFieldValue(setupForm, "livekitUrl"),
    lemonSliceApiKey: getSetupFieldValue(setupForm, "lemonSliceApiKey"),
    livekitApiKey: getSetupFieldValue(setupForm, "livekitApiKey"),
    livekitApiSecret: getSetupFieldValue(setupForm, "livekitApiSecret")
  };
}
function getSetupFieldValue(setupForm, name) {
  if (!setupForm) return "";
  const field = setupForm.elements.namedItem(name);
  return normalizeOptionalInputValue(field?.value);
}
function restoreSetupFormBaseline(setupForm) {
  if (!setupForm) return;
  for (const name of setupPayloadFieldNames) {
    const field = setupForm.elements.namedItem(name);
    if (!field || typeof field.value !== "string") continue;
    field.value = state.setup.formBaseline[name] ?? "";
  }
  state.setup.secretVisibilityState.clear();
}
function getSetupMissingForUi(setup) {
  if (!Array.isArray(setup?.missing)) return [];
  return setup.missing.filter((path) => typeof path === "string");
}
function isSetupConfiguredForUi(setup) {
  if (!setup || typeof setup !== "object") return false;
  if (setup.configured === true) return true;
  return getSetupMissingForUi(setup).length === 0;
}
function setupStatusLabel(setup) {
  if (!setup) return "Setup status unavailable";
  if (isSetupConfiguredForUi(setup)) {
    return "Configured: all required keys are set.";
  }
  const missing = getSetupMissingForUi(setup);
  return missing.length > 0 ? `Missing: ${missing.join(", ")}` : "Configured: all required keys are set.";
}

// web/src/ui/status.ts
function getAvatarToolbarStatusState(avatarMediaEl) {
  const connState = state.room.connectionState;
  if (state.room.avatarConnectionState === "disconnected") {
    return { text: "Disconnected", tone: "danger" };
  }
  if (state.room.activeRoom && connState === "connected" && hasAvatarVideo(avatarMediaEl)) {
    return { text: "Connected", tone: "ok" };
  }
  if (state.room.avatarLoadPending || state.room.avatarConnectionState === "connecting" || state.session.active || state.room.activeRoom && connState && connState !== "disconnected") {
    return { text: "Connecting...", tone: "warn" };
  }
  return { text: "Disconnected", tone: "danger" };
}
function setHealthStatus(dotEl, valueEl, tone, text) {
  if (!dotEl || !valueEl) return;
  dotEl.classList.remove("ok", "warn", "danger");
  if (tone === "ok" || tone === "warn" || tone === "danger") {
    dotEl.classList.add(tone);
  }
  valueEl.textContent = text;
}
function setGatewayHealthStatus(els, tone, text) {
  if (state.setup.openClawCompatibility.compatible === false) {
    setHealthStatus(
      els.gatewayHealthDotEl,
      els.gatewayHealthValueEl,
      "danger",
      "incompatible openclaw version"
    );
    return;
  }
  setHealthStatus(els.gatewayHealthDotEl, els.gatewayHealthValueEl, tone, text);
}
function setKeysHealthStatus(els, tone, text) {
  setHealthStatus(els.keysHealthDotEl, els.keysHealthValueEl, tone, text);
}
function setRoomStatus(text, els, options = {}) {
  const loading = Boolean(options.loading);
  const avatarToolbarStatus = getAvatarToolbarStatusState(els.avatarMediaEl);
  if (els.avatarToolbarStatusDotEl) {
    els.avatarToolbarStatusDotEl.classList.remove("ok", "warn", "danger");
    els.avatarToolbarStatusDotEl.classList.add(avatarToolbarStatus.tone);
  }
  if (els.avatarToolbarStatusEl) {
    els.avatarToolbarStatusEl.textContent = avatarToolbarStatus.text;
    els.avatarToolbarStatusEl.title = avatarToolbarStatus.text;
  }
  if (els.avatarPlaceholderStatusEl) {
    els.avatarPlaceholderStatusEl.title = avatarToolbarStatus.text;
  }
  if (els.avatarPlaceholderStatusTextEl) {
    els.avatarPlaceholderStatusTextEl.textContent = avatarToolbarStatus.text;
    els.avatarPlaceholderStatusTextEl.title = avatarToolbarStatus.text;
  }
  if (els.avatarPlaceholderStatusDotEl) {
    els.avatarPlaceholderStatusDotEl.classList.remove("ok", "warn", "danger");
    els.avatarPlaceholderStatusDotEl.classList.add(avatarToolbarStatus.tone);
  }
  if (els.roomStatusTextEl) {
    els.roomStatusTextEl.textContent = text;
  } else if (els.roomStatusEl) {
    els.roomStatusEl.textContent = text;
  }
  els.roomStatusEl?.classList.toggle("is-loading", loading);
  if (els.roomStatusSpinnerEl) {
    els.roomStatusSpinnerEl.hidden = !loading;
  }
}
function updateRoomStatusState(els) {
  if (!LIVEKIT) {
    setRoomStatus("LiveKit client failed to load from CDN.", els);
    return;
  }
  const connState = state.room.connectionState;
  if (state.room.avatarLoadPending) {
    setRoomStatus(state.room.avatarLoadMessage || SESSION_STARTING_STATUS, els, { loading: true });
    return;
  }
  if (state.room.activeRoom) {
    if (connState && connState !== "connected") {
      const isLoading = connState !== "disconnected";
      setRoomStatus(
        isLoading ? `Room state: ${connState}` : "Disconnected from room. Reconnect to resume.",
        els,
        { loading: isLoading }
      );
      return;
    }
    if (state.room.avatarConnectionState === "disconnected") {
      setRoomStatus("Avatar disconnected. Reconnect to resume.", els);
      return;
    }
    if (!hasAvatarVideo(els.avatarMediaEl)) {
      setRoomStatus(AVATAR_LOADING_STATUS, els, {
        loading: true
      });
      return;
    }
    setRoomStatus("Connected", els);
    return;
  }
  if (state.session.active) {
    if (state.room.avatarConnectionState === "disconnected") {
      setRoomStatus("Avatar disconnected. Reconnect to resume.", els);
      return;
    }
    if (connState === "connected" || state.room.avatarConnectionState === "connecting") {
      setRoomStatus(AVATAR_LOADING_STATUS, els, {
        loading: true
      });
      return;
    }
    if (connState && connState !== "disconnected") {
      setRoomStatus(`Room state: ${connState}`, els, { loading: true });
      return;
    }
    setRoomStatus("Disconnected from room. Reconnect to resume.", els);
    return;
  }
  setRoomStatus("Disconnected", els);
}

// web/src/ui/theme.ts
function resolveThemePreference(value) {
  if (value === "dark" || value === "light" || value === "system") {
    return value;
  }
  return "system";
}
function resolveAppliedTheme(preference, systemThemeMedia = null) {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return systemThemeMedia?.matches ? "light" : "dark";
}
function renderThemeToggle(preference, themeToggleEl, themeToggleButtons) {
  const indexByTheme = {
    system: 0,
    light: 1,
    dark: 2
  };
  if (themeToggleEl) {
    themeToggleEl.style.setProperty("--theme-index", String(indexByTheme[preference] ?? 2));
  }
  for (const button of themeToggleButtons) {
    const value = resolveThemePreference(
      button.dataset.themeValue
    );
    const active = value === preference;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  }
}
function applyTheme(preference, systemThemeMedia, themeToggleEl, themeToggleButtons) {
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
function initThemeToggle(systemThemeMedia, themeToggleEl, themeToggleButtons) {
  let stored = "system";
  try {
    stored = resolveThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
  }
  applyTheme(stored, systemThemeMedia, themeToggleEl, themeToggleButtons);
  for (const button of themeToggleButtons) {
    button.addEventListener("click", () => {
      const next = resolveThemePreference(
        button.dataset.themeValue
      );
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
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

// web/src/app.ts
function queryDomElements() {
  const $ = (id) => document.getElementById(id);
  const $q = (sel) => document.querySelector(sel);
  const $qa = (sel) => Array.from(document.querySelectorAll(sel));
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
    setupForm: $("setup-form"),
    setupRawForm: $("setup-raw-form"),
    setupRawInput: $("setup-raw-input"),
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
    sessionForm: $("session-form"),
    startSessionButton: $("start-session"),
    sessionImageUrlInput: $("session-image-url"),
    avatarTimeoutSecondsInput: $("avatar-timeout-seconds"),
    startInPictureInPictureCheckbox: $("start-in-pip"),
    stopSessionButton: $("stop-session"),
    // Token / auth
    tokenForm: $("token-form"),
    tokenInput: $("gateway-token"),
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
    chatForm: $("chat-form"),
    chatComposerInputEl: $("chat-composer-input"),
    chatAttachmentsEl: $("chat-attachments"),
    chatFileInput: $("chat-file-input"),
    chatInput: $("chat-input"),
    chatAttachButton: $("chat-attach"),
    chatSendButton: $("chat-send"),
    chatTokenEstimateEl: $("chat-token-estimate"),
    // Theme
    themeToggleEl: $("theme-toggle"),
    themeToggleButtons: $qa("[data-theme-value]"),
    systemThemeMedia: window.matchMedia("(prefers-color-scheme: light)")
  };
}
function setOutput(els, detail) {
  if (!els.outputEl) return;
  els.outputEl.textContent = JSON.stringify(detail);
}
function setChatStatus(els, text) {
  if (els.chatStatusEl) els.chatStatusEl.textContent = text;
}
function setConfigStatusMessage(els, message) {
  if (els.statusEl) els.statusEl.textContent = message;
}
function clearChatLog(els) {
  if (els.chatLogEl) els.chatLogEl.innerHTML = "";
  state.chat.messages = [];
  clearStreamingAssistantMessages();
}
function updateTokenFieldMasking(els) {
  if (!els.tokenInput) return;
  els.tokenInput.type = state.setup.tokenVisible ? "text" : "password";
}
function updateRoomButtons(els) {
  const hasSession = state.session.active !== null;
  const connected = state.room.connectionState === "connected";
  const reconnectable = hasReconnectableSession();
  if (els.connectRoomButton) {
    els.connectRoomButton.disabled = !hasSession || connected;
  }
  if (els.reconnectRoomButton) {
    els.reconnectRoomButton.disabled = !reconnectable;
    els.reconnectRoomButton.hidden = !reconnectable;
  }
  if (els.leaveRoomButton) {
    els.leaveRoomButton.disabled = !connected;
  }
  if (els.stopSessionButton) {
    els.stopSessionButton.disabled = !hasSession;
  }
  if (els.toggleMicButton) {
    els.toggleMicButton.disabled = !connected;
  }
  if (els.toggleSpeakerButton) {
    els.toggleSpeakerButton.disabled = !connected;
  }
  if (els.togglePictureInPictureButton) {
    els.togglePictureInPictureButton.hidden = !hasAvatarPictureInPictureSupport(null);
    els.togglePictureInPictureButton.disabled = !connected;
  }
}
function updateChatControls(els) {
  const hasToken = hasGatewayToken();
  const hasSession = state.session.active !== null;
  const enabled = hasToken && hasSession;
  if (els.chatInput) {
    els.chatInput.disabled = !enabled;
  }
  if (els.chatSendButton) {
    els.chatSendButton.disabled = !enabled;
  }
  if (els.chatAttachButton) {
    els.chatAttachButton.disabled = !enabled;
  }
}
function updateSessionStartButtonState(els) {
  if (!els.startSessionButton) return;
  els.startSessionButton.disabled = !hasGatewayToken();
}
function updateSetupSaveButtonState(els) {
  if (!els.setupSaveButton) return;
  els.setupSaveButton.disabled = false;
}
function refreshAllUiState(els) {
  updateRoomButtons(els);
  updateChatControls(els);
  updateAvatarUiState(els);
  updateRoomStatusState(els);
}
function updateAvatarUiState(els) {
  const connected = state.room.connectionState === "connected";
  if (els.avatarPlaceholderEl) {
    els.avatarPlaceholderEl.hidden = connected;
  }
  if (els.avatarMediaEl) {
    els.avatarMediaEl.hidden = !connected;
  }
  updateRoomButtons(els);
}
function loadMediaPreferences() {
  state.media.preferredMicMuted = getStoredBooleanPreference(MIC_MUTED_STORAGE_KEY, false);
  state.media.avatarSpeakerMuted = getStoredBooleanPreference(
    AVATAR_SPEAKER_MUTED_STORAGE_KEY,
    false
  );
}
function clearAllSetupSectionErrors(els) {
  const errorEls = [els.gatewayTokenErrorEl, els.lemonSliceErrorEl, els.liveKitErrorEl];
  for (const el of errorEls) {
    if (el) el.textContent = "";
  }
}
function getGatewayConnectInstruction() {
  return `Enter your gateway ${getGatewayAuthDisplayName()} to get started.`;
}
function getGatewayChatInstruction() {
  return `Enter your gateway ${getGatewayAuthDisplayName()} and start a session to use text chat.`;
}
function resetSetupSecretState(els, options = {}) {
  state.setup.storedSetupSecretValues.clear();
  state.setup.secretVisibilityState.clear();
  if (options.clearTokenField && els.tokenInput) {
    els.tokenInput.value = "";
  }
}
function setConfigMode(els, mode, options = {}) {
  const next = mode === "raw" ? "raw" : "form";
  state.setup.activeConfigMode = next;
  for (const btn of els.configModeButtons) {
    const btnMode = btn.getAttribute("data-config-mode");
    btn.classList.toggle("active", btnMode === next);
    btn.setAttribute("aria-pressed", btnMode === next ? "true" : "false");
  }
  if (els.setupForm) {
    els.setupForm.hidden = next !== "form";
  }
  if (els.setupRawForm) {
    els.setupRawForm.hidden = next !== "raw";
  }
  if (options.sync !== false && next === "raw") {
    syncRawFromForm(els);
  }
}
function syncRawFromForm(els) {
  if (!els.setupRawInput) return;
  const payload = buildSetupPayloadFromForm(els.setupForm);
  els.setupRawInput.value = serializeSetupPayload(payload);
}
function snapshotSetupRawBaseline(els) {
  state.setup.rawBaseline = els.setupRawInput?.value ?? "";
}
function initConfigSectionFiltering(els) {
  for (const btn of els.configSectionFilterButtons) {
    btn.addEventListener("click", () => {
      const filter = btn.getAttribute("data-section-filter") ?? "all";
      state.setup.activeConfigSectionFilter = filter;
      for (const b of els.configSectionFilterButtons) {
        b.classList.toggle("active", b.getAttribute("data-section-filter") === filter);
      }
      for (const card of els.configSectionCards) {
        const section = card.getAttribute("data-config-section") ?? "";
        card.hidden = filter !== "all" && section !== filter;
      }
    });
  }
}
function renderChatComposerAttachments(els) {
  if (!els.chatAttachmentsEl) return;
  const draft = getChatComposerDraft("main");
  if (!draft.attachments.length) {
    els.chatAttachmentsEl.innerHTML = "";
    els.chatAttachmentsEl.hidden = true;
    return;
  }
  els.chatAttachmentsEl.hidden = false;
  const fragment = document.createDocumentFragment();
  for (const att of draft.attachments) {
    const chip = document.createElement("span");
    chip.className = "chat-attachment-chip";
    chip.textContent = att.name;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "chat-attachment-remove";
    removeBtn.textContent = "\xD7";
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
function syncChatComposerUi(els) {
  syncTextareaHeight(els.chatInput);
  const value = els.chatInput?.value ?? "";
  const draft = getChatComposerDraft("main");
  const hasValue = hasChatComposerDraftValue(value, draft.attachments);
  if (els.chatSendButton) {
    els.chatSendButton.disabled = !hasValue || state.chat.awaitingReply;
  }
  if (els.chatTokenEstimateEl) {
    const tokens = estimateChatTokens(value);
    els.chatTokenEstimateEl.textContent = tokens !== null ? formatChatTokensCompact(tokens) : "";
  }
}
async function addChatComposerAttachments(els, files) {
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
        dataUrl
      });
    } catch {
    }
  }
  renderChatComposerAttachments(els);
  syncChatComposerUi(els);
}
async function refreshSetupStatus(els) {
  try {
    const raw = await requestJson("/api/setup", { method: "GET" });
    const setupData = raw;
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
        missing.length > 0 ? `Missing: ${missing.join(", ")}` : "Checking"
      );
    }
    setOutput(els, { action: "setup-status-loaded", label: setupStatusLabel(setupData) });
  } catch (error) {
    setGatewayHealthStatus(els, "error", "Error");
    setKeysHealthStatus(els, "error", "Error");
    setOutput(els, { action: "setup-status-error", error: String(error) });
  }
}
async function saveSetupPayload(els, payload) {
  try {
    await requestJson("/api/setup", {
      method: "PUT",
      body: JSON.stringify(payload)
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
function wireGatewaySocketCallbacks(els) {
  setGatewaySocketCallbacks({
    onChatEvent(payload) {
      const type = payload.type;
      const text = payload.text ?? payload.content ?? "";
      if (type === "message.delta" || type === "message.start") {
        upsertStreamingAssistantMessage(text, {
          state: type,
          runId: payload.runId
        });
      } else if (type === "message.complete") {
        finalizeStreamingAssistantMessage(text, {
          runId: payload.runId
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
    }
  });
}
function wireSessionCallbacks(els) {
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
    }
  });
}
function wireRoomCallbacks(els) {
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
    }
  });
}
function attachSetupFormListeners(els) {
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
      const input = document.getElementById(targetId);
      if (input?.value) {
        navigator.clipboard.writeText(input.value).catch(() => {
        });
      }
    });
  }
  for (const btn of els.sensitiveFieldVisibilityButtons) {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-toggle-secret-visibility");
      if (!targetId) return;
      const input = document.getElementById(targetId);
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
function attachSetupRawListeners(els) {
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
          els.setupRawErrorEl.textContent = error.message;
        }
      }
    });
  }
}
function attachConfigModeListeners(els) {
  for (const btn of els.configModeButtons) {
    btn.addEventListener("click", () => {
      const nextMode = btn.getAttribute("data-config-mode") ?? "form";
      setConfigMode(els, nextMode);
    });
  }
  setConfigMode(els, "form", { sync: false });
}
function attachSessionFormListeners(els) {
  if (!els.sessionForm) return;
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
          els.avatarTimeoutSecondsInput?.value
        )
      });
      const response = await requestJson("/api/session", {
        method: "POST",
        body: JSON.stringify(payload)
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
function loadSessionFormPreferences(els) {
  if (els.sessionImageUrlInput) {
    try {
      const stored = localStorage.getItem(SESSION_IMAGE_URL_STORAGE_KEY);
      if (stored) els.sessionImageUrlInput.value = stored;
    } catch {
    }
  }
  if (els.avatarTimeoutSecondsInput) {
    try {
      const stored = localStorage.getItem(SESSION_AVATAR_TIMEOUT_SECONDS_STORAGE_KEY);
      if (stored) {
        els.avatarTimeoutSecondsInput.value = String(parseSessionAvatarTimeoutSeconds(stored));
      }
    } catch {
    }
  }
  if (els.startInPictureInPictureCheckbox) {
    els.startInPictureInPictureCheckbox.checked = getStoredBooleanPreference(
      AVATAR_AUTO_START_IN_PIP_STORAGE_KEY,
      true
    );
  }
}
function persistSessionFormPreferences(els) {
  if (els.sessionImageUrlInput) {
    persistStringPreference(SESSION_IMAGE_URL_STORAGE_KEY, els.sessionImageUrlInput.value);
  }
  if (els.avatarTimeoutSecondsInput) {
    persistStringPreference(
      SESSION_AVATAR_TIMEOUT_SECONDS_STORAGE_KEY,
      els.avatarTimeoutSecondsInput.value
    );
  }
}
function doStopActiveSession() {
  const noopSidecar = async () => {
  };
  stopActiveSession(() => disconnectRoom(), noopSidecar);
}
function attachSessionControlListeners(els) {
  els.stopSessionButton?.addEventListener("click", () => {
    doStopActiveSession();
  });
  els.startInPictureInPictureCheckbox?.addEventListener("change", () => {
    persistBooleanPreference(
      AVATAR_AUTO_START_IN_PIP_STORAGE_KEY,
      els.startInPictureInPictureCheckbox?.checked ?? true
    );
  });
}
function attachRoomControlListeners(els) {
  els.leaveRoomButton?.addEventListener("click", () => {
    disconnectRoom();
    refreshAllUiState(els);
  });
}
function attachChatListeners(els) {
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
      const files = Array.from(e.dataTransfer?.files ?? []);
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
      timestamp: Date.now()
    });
    setChatStatus(els, "");
    setOutput(els, { action: "chat-message-sent", content: value });
  });
}
function attachDocumentListeners(els) {
  const resumePlayback = (_reason) => {
    const videos = els.avatarMediaEl?.querySelectorAll("video, audio");
    if (!videos) return;
    for (const media of Array.from(videos)) {
      if (media.paused && !media.ended) {
        media.play().catch(() => {
        });
      }
    }
  };
  document.addEventListener("visibilitychange", () => resumePlayback("visibilitychange"));
  window.addEventListener("pageshow", () => resumePlayback("pageshow"));
  window.addEventListener("focus", () => resumePlayback("focus"));
}
function attachTokenListeners(els) {
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
      navigator.clipboard.writeText(value).catch(() => {
      });
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
      "Gateway auth cleared for this browser. Enter a token or password to continue."
    );
    setOutput(els, { action: "gateway-token-cleared" });
  });
}
function attachReloadListener(els) {
  els.reloadButton?.addEventListener("click", () => {
    refreshSetupStatus(els);
  });
}
async function initializeGatewaySetupState(els) {
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
    refreshSetupStatus(els).catch(() => {
    });
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
function init() {
  const els = queryDomElements();
  loadMediaPreferences();
  initNavCollapseToggle(els);
  const chatPaneInitial = resolveInitialChatPaneOpen(els.mobileChatPaneMedia);
  applyChatPaneWidth(chatPaneInitial.storedWidth, els.shellEl, els.contentEl, {
    persist: false
  });
  setChatPaneOpen(chatPaneInitial.isOpen, els, { persist: false });
  els.chatPaneToggleButton?.addEventListener("click", () => {
    const isOpen = els.shellEl?.classList.contains("shell--chat-pane-open");
    setChatPaneOpen(!isOpen, els);
  });
  els.chatPaneCloseButton?.addEventListener("click", () => setChatPaneOpen(false, els));
  els.chatPaneBackdropEl?.addEventListener("click", () => setChatPaneOpen(false, els));
  initAvatarPaneResize(els);
  initThemeToggle(els.systemThemeMedia, els.themeToggleEl, els.themeToggleButtons);
  initConfigSectionFiltering(els);
  updateTokenFieldMasking(els);
  updateRoomButtons(els);
  updateChatControls(els);
  renderChatComposerAttachments(els);
  clearChatLog(els);
  updateAvatarUiState(els);
  wireGatewaySocketCallbacks(els);
  wireSessionCallbacks(els);
  wireRoomCallbacks(els);
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
  initializeGatewaySetupState(els).catch((error) => {
    setOutput(els, { action: "gateway-setup-init-failed", error: String(error) });
    updateRoomStatusState(els);
  });
}
init();
//# sourceMappingURL=app.js.map
