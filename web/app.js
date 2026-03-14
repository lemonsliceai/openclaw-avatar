const statusEl = document.getElementById("status");
const outputEl = document.getElementById("output");
const setupForm = document.getElementById("setup-form");
const setupRawForm = document.getElementById("setup-raw-form");
const setupRawInput = document.getElementById("setup-raw-input");
const setupRawErrorEl = document.getElementById("setup-raw-error");
const sessionForm = document.getElementById("session-form");
const startInPictureInPictureCheckbox = document.getElementById("start-in-pip");
const interruptAgentSpeechCheckbox = document.getElementById("interrupt-agent-speech");
const ttsForm = document.getElementById("tts-form");
const ttsTextInput = document.getElementById("tts-text");
const ttsGenerateButton = document.getElementById("tts-generate");
const reloadButton = document.getElementById("reload-status");
const configCancelButton = document.getElementById("config-cancel");
const setupSaveButton = document.querySelector('button[form="setup-form"][type="submit"]');
const stopSessionButton = document.getElementById("stop-session");
const tokenForm = document.getElementById("token-form");
const tokenInput = document.getElementById("gateway-token");
const copyTokenButton = document.getElementById("copy-token");
const toggleTokenVisibilityButton = document.getElementById("toggle-token-visibility");
const clearTokenButton = document.getElementById("clear-token");
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
const chatComposerInputEl = document.getElementById("chat-composer-input");
let chatAttachmentsEl = document.getElementById("chat-attachments");
const chatFileInput = document.getElementById("chat-file-input");
const chatInput = document.getElementById("chat-input");
const chatAttachButton = document.getElementById("chat-attach");
const chatSendButton = document.getElementById("chat-send");
const chatTokenEstimateEl = document.getElementById("chat-token-estimate");

const OPENCLAW_SETTINGS_STORAGE_KEY = "openclaw.control.settings.v1";
const LEGACY_TOKEN_STORAGE_KEY = "videoChat.gatewayToken";
const THEME_STORAGE_KEY = "videoChat.themePreference";
const NAV_COLLAPSE_STORAGE_KEY = "videoChat.navCollapsed";
const CHAT_PANE_STORAGE_KEY = "videoChat.chatPaneOpen";
const CHAT_PANE_WIDTH_STORAGE_KEY = "videoChat.chatPaneWidth";
const MIC_MUTED_STORAGE_KEY = "videoChat.microphoneMuted";
const AVATAR_SPEAKER_MUTED_STORAGE_KEY = "videoChat.avatarSpeakerMuted";
const AVATAR_AUTO_START_IN_PIP_STORAGE_KEY = "videoChat.avatarAutoStartInPictureInPicture";
const AVATAR_INTERRUPT_REPLY_ON_NEW_MESSAGE_STORAGE_KEY = "videoChat.avatarInterruptReplyOnNewMessage";
const REDACTED_SECRET_VALUE = "_REDACTED_";
const OPENCLAW_REDACTED_SECRET_VALUE = "__OPENCLAW_REDACTED__";
const LIVEKIT = globalThis.LivekitClient || globalThis.livekitClient || null;
const BROWSER_SPEECH_RECOGNITION =
  globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
const GATEWAY_PROTOCOL_VERSION = 3;
const GATEWAY_WS_CLIENT = {
  id: "test",
  version: "video-chat-plugin-ui",
  platform: "web",
  mode: "test",
};
const GATEWAY_WS_SCOPES = ["operator.read", "operator.write"];
const CHAT_PANE_MIN_WIDTH = 300;
const CHAT_PANE_MAX_WIDTH = 640;
const AVATAR_PANE_WIDTH_STORAGE_KEY = "videoChat.avatarPaneWidth";
const AVATAR_PANE_MIN_WIDTH = 0;
const AVATAR_PANE_MAX_WIDTH = 1200;
// Debug logging is opt-in because even sanitized entries can still expose session timing and flow details.
// Enable with `?videoChatDebug=1` or `localStorage.setItem("videoChat.debugLogging", "true")`.
const VIDEO_CHAT_DEBUG_LOGGING = false;
const VIDEO_CHAT_DEBUG_LOGGING_QUERY_PARAM = "videoChatDebug";
const VIDEO_CHAT_DEBUG_LOGGING_STORAGE_KEY = "videoChat.debugLogging";
const AVATAR_PIP_DEFAULT_ASPECT_RATIO = 16 / 9;
const AVATAR_PIP_HORIZONTAL_PADDING = 20;
const AVATAR_PIP_VERTICAL_PADDING = 20;
const AVATAR_PIP_TOOLBAR_HEIGHT = 72;
const AVATAR_PIP_MAX_VIDEO_HEIGHT = 560;
const AVATAR_PIP_END_CALL_ICON_URL = "https://unpkg.com/lucide-static@0.321.0/icons/phone-off.svg";
const AVATAR_PARTICIPANT_IDENTITY = "lemonslice-avatar-agent";
const AVATAR_JOIN_TIMEOUT_ERROR_CODE = "AVATAR_JOIN_TIMEOUT";
const AVATAR_AUTO_RECOVERY_MAX_ATTEMPTS = 3;
const SESSION_STARTING_STATUS = "Starting session...";
const AVATAR_LOADING_STATUS = "Avatar loading...";
const AVATAR_RECONNECTING_STATUS = "Reconnecting avatar...";
const VOICE_CHAT_RUN_ID_PREFIX = "video-chat-agent-";
const VOICE_TRANSCRIPT_EVENT_TOPIC = "video-chat.user-transcript";
const VOICE_TRANSCRIPT_EVENT_TYPE = "video-chat.user-transcript";
const VOICE_TRANSCRIPT_DUPLICATE_WINDOW_MS = 5_000;
const VOICE_TRANSCRIPT_DUPLICATE_MIN_LENGTH = 12;
const AVATAR_ECHO_RECENT_REPLY_RETENTION_MS = 30_000;
const AVATAR_ECHO_ACTIVE_WINDOW_MS = 4_000;
const AVATAR_ECHO_MIN_TRANSCRIPT_CHARS = 18;
const AVATAR_ECHO_MIN_TRANSCRIPT_TOKENS = 4;
const AVATAR_ECHO_TOKEN_OVERLAP_THRESHOLD = 0.8;
const AVATAR_ECHO_MAX_RECENT_REPLIES = 4;
const MINIMUM_COMPATIBLE_OPENCLAW_VERSION = "2026.3.11";
const INCOMPATIBLE_OPENCLAW_VERSION_MESSAGE = "incompatible openclaw version";
const SERVER_SPEECH_SILENCE_MS = 900;
const SERVER_SPEECH_MAX_SEGMENT_MS = 9_000;
const SERVER_SPEECH_MONITOR_INTERVAL_MS = 150;
const SERVER_SPEECH_LEVEL_THRESHOLD = 0.05;
const SERVER_SPEECH_MIN_SEGMENT_BYTES = 1_024;
const CHAT_MAX_IMAGE_ATTACHMENTS = 4;
const CHAT_MAX_IMAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const CHAT_JSON_RENDER_LIMIT = 20_000;
const CHAT_TOKEN_ESTIMATE_MIN_CHARS = 100;
const CHAT_SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const CHAT_WELCOME_SUGGESTIONS = [
  "What can you do?",
  "Help me test the avatar",
  "Summarize the latest exchange",
  "Give me a next step",
];

let activeSession = null;
let activeRoom = null;
let localAudioTrack = null;
let browserSpeechRecognition = null;
let browserSpeechRecognitionActive = false;
let browserSpeechRecognitionShouldRun = false;
let browserSpeechRecognitionRestartTimer = null;
const lastVoiceTranscriptByConnection = new Map();
let preferServerSpeechTranscription = true;
let serverSpeechTranscriptionUnavailable = false;
let serverSpeechRecorder = null;
let serverSpeechRecorderMimeType = "";
let serverSpeechRecorderChunks = [];
let serverSpeechRecorderSegmentActive = false;
let serverSpeechRecorderSegmentStartedAt = 0;
let serverSpeechRecorderLastSpeechAt = 0;
let serverSpeechRecorderStopReason = "";
let serverSpeechRecorderMonitorTimer = null;
let serverSpeechRecorderAudioContext = null;
let serverSpeechRecorderSourceNode = null;
let serverSpeechRecorderAnalyser = null;
let serverSpeechRecorderAnalyserBuffer = null;
let serverSpeechRecorderStartPromise = null;
let serverSpeechTranscriptionQueue = Promise.resolve();
let roomConnectGeneration = 0;
let roomConnectionState = LIVEKIT ? "disconnected" : "failed";
let avatarConnectionState = "idle";
let activeAvatarParticipantIdentity = "";
let avatarSpeechActive = false;
let avatarSpeechLastDetectedAt = 0;
const recentAvatarReplies = [];
let avatarSessionAutoRecovering = false;
let avatarLoadPending = false;
let avatarLoadMessage = "";
let preferredMicMuted = false;
let avatarSpeakerMuted = false;
let avatarAutoStartInPictureInPicture = true;
let avatarInterruptReplyOnNewMessage = true;
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
const sensitiveFieldInputs = Array.from(document.querySelectorAll("[data-sensitive-field]"));
const sensitiveFieldCopyButtons = Array.from(document.querySelectorAll("[data-copy-secret]"));
const sensitiveFieldVisibilityButtons = Array.from(document.querySelectorAll("[data-toggle-secret-visibility]"));
const configSectionFilterButtons = Array.from(document.querySelectorAll("[data-section-filter]"));
const configSectionCards = Array.from(document.querySelectorAll("[data-config-section]"));
const configModeButtons = Array.from(document.querySelectorAll("[data-config-mode]"));
const secretVisibilityState = new Set();
const storedSetupSecretValues = new Map();
const mobileChatPaneMedia =
  typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 960px)") : null;
const systemThemeMedia =
  typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: light)") : null;
let activeThemePreference = "system";
let tokenVisible = false;
let latestSetupStatus = null;
let openClawCompatibility = {
  version: null,
  minimumCompatibleVersion: MINIMUM_COMPATIBLE_OPENCLAW_VERSION,
  compatible: null,
};
let activeConfigSectionFilter = "all";
let activeConfigMode = "form";
let setupFormBaseline = {
  lemonSliceImageUrl: "",
  livekitUrl: "",
  elevenLabsVoiceId: "",
  lemonSliceApiKey: "",
  livekitApiKey: "",
  livekitApiSecret: "",
  elevenLabsApiKey: "",
};
let setupRawBaseline = "";
const renderedVoiceUserRuns = new Set();
const chatMessages = [];
const chatComposerDrafts = {
  main: {
    attachments: [],
  },
  pip: {
    attachments: [],
  },
};
let chatAwaitingReply = false;
let chatComposerAttachmentIdCounter = 0;
const debugLogEntries = [];
const assistantMetadataBackfillTimers = new Map();

function isTextAreaElement(element) {
  return Boolean(element && typeof element === "object" && element.nodeType === 1 && element.tagName === "TEXTAREA");
}

function isButtonElement(element) {
  return Boolean(element && typeof element === "object" && element.nodeType === 1 && element.tagName === "BUTTON");
}

function isBlobLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.arrayBuffer === "function" &&
      typeof value.type === "string",
  );
}

function nextChatComposerAttachmentId() {
  chatComposerAttachmentIdCounter += 1;
  return `chat-attachment-${Date.now()}-${chatComposerAttachmentIdCounter}`;
}

function normalizeChatComposerKey(key) {
  return key === "pip" ? "pip" : "main";
}

function normalizeComparableSpeechText(value) {
  return String(value || "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function extractComparableSpeechTokens(value) {
  const normalized = normalizeComparableSpeechText(value);
  if (!normalized) {
    return [];
  }
  return normalized.split(/\s+/u).filter((token) => [...token].length > 2);
}

function pruneRecentAvatarReplies(now = Date.now()) {
  for (let index = recentAvatarReplies.length - 1; index >= 0; index -= 1) {
    if (now - recentAvatarReplies[index].at > AVATAR_ECHO_RECENT_REPLY_RETENTION_MS) {
      recentAvatarReplies.splice(index, 1);
    }
  }
}

function clearRecentAvatarReplies() {
  recentAvatarReplies.length = 0;
}

function rememberRecentAvatarReply(text, timestamp = Date.now()) {
  const normalized = normalizeComparableSpeechText(text);
  const tokens = extractComparableSpeechTokens(text);
  if (!normalized) {
    return;
  }
  recentAvatarReplies.unshift({
    at: Number.isFinite(timestamp) ? timestamp : Date.now(),
    normalized,
    tokens,
  });
  pruneRecentAvatarReplies();
  if (recentAvatarReplies.length > AVATAR_ECHO_MAX_RECENT_REPLIES) {
    recentAvatarReplies.splice(AVATAR_ECHO_MAX_RECENT_REPLIES);
  }
}

function setAvatarSpeechActive(nextValue) {
  const normalized = Boolean(nextValue);
  if (normalized) {
    avatarSpeechActive = true;
    avatarSpeechLastDetectedAt = Date.now();
    return;
  }
  if (avatarSpeechActive) {
    avatarSpeechLastDetectedAt = Date.now();
  }
  avatarSpeechActive = false;
}

function clearAvatarSpeechActivity() {
  avatarSpeechActive = false;
  avatarSpeechLastDetectedAt = 0;
}

function isAvatarSpeechRecent(now = Date.now()) {
  return Boolean(
    avatarSpeechActive ||
      (avatarSpeechLastDetectedAt > 0 && now - avatarSpeechLastDetectedAt <= AVATAR_ECHO_ACTIVE_WINDOW_MS),
  );
}

function countMatchingSpeechTokens(candidateTokens, referenceTokens) {
  if (!candidateTokens.length || !referenceTokens.length) {
    return 0;
  }
  const remaining = new Map();
  for (const token of referenceTokens) {
    remaining.set(token, (remaining.get(token) || 0) + 1);
  }
  let matches = 0;
  for (const token of candidateTokens) {
    const count = remaining.get(token) || 0;
    if (count <= 0) {
      continue;
    }
    matches += 1;
    remaining.set(token, count - 1);
  }
  return matches;
}

function shouldSuppressVoiceTranscriptAsAvatarEcho(rawTranscript) {
  const now = Date.now();
  if (!isAvatarSpeechRecent(now)) {
    return false;
  }
  pruneRecentAvatarReplies(now);
  const normalizedTranscript = normalizeComparableSpeechText(rawTranscript);
  if (!normalizedTranscript || normalizedTranscript.length < AVATAR_ECHO_MIN_TRANSCRIPT_CHARS) {
    return false;
  }
  const transcriptTokens = extractComparableSpeechTokens(rawTranscript);
  if (transcriptTokens.length < AVATAR_ECHO_MIN_TRANSCRIPT_TOKENS) {
    return false;
  }
  for (const reply of recentAvatarReplies) {
    if (!reply?.normalized) {
      continue;
    }
    if (
      reply.normalized === normalizedTranscript ||
      reply.normalized.includes(normalizedTranscript) ||
      normalizedTranscript.includes(reply.normalized)
    ) {
      return true;
    }
    const matchingTokens = countMatchingSpeechTokens(transcriptTokens, reply.tokens);
    if (matchingTokens / transcriptTokens.length >= AVATAR_ECHO_TOKEN_OVERLAP_THRESHOLD) {
      return true;
    }
  }
  return false;
}

function getChatComposerDraft(key = "main") {
  return chatComposerDrafts[normalizeChatComposerKey(key)];
}

function isSupportedChatImageMimeType(mimeType) {
  return typeof mimeType === "string" && CHAT_SUPPORTED_IMAGE_MIME_TYPES.has(mimeType.trim().toLowerCase());
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!isBlobLike(file)) {
      reject(new Error("Clipboard item is not a file."));
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    });
    reader.addEventListener("error", () => {
      reject(reader.error || new Error("Failed to read clipboard image."));
    });
    reader.readAsDataURL(file);
  });
}

function extractImageFilesFromClipboardEvent(event) {
  const clipboardItems = Array.from(event?.clipboardData?.items || []);
  const itemFiles = clipboardItems
    .filter((item) => item?.kind === "file" && isSupportedChatImageMimeType(item.type))
    .map((item) => item.getAsFile())
    .filter((file) => isBlobLike(file));
  if (itemFiles.length > 0) {
    return itemFiles;
  }
  return Array.from(event?.clipboardData?.files || []).filter(
    (file) => isBlobLike(file) && isSupportedChatImageMimeType(file?.type),
  );
}

async function addChatComposerAttachments(files, key = "main", options = {}) {
  const imageFiles = Array.from(files || []).filter(
    (file) => isBlobLike(file) && isSupportedChatImageMimeType(file?.type),
  );
  if (imageFiles.length === 0) {
    return false;
  }

  const sourceLabel = typeof options.sourceLabel === "string" && options.sourceLabel.trim()
    ? options.sourceLabel.trim()
    : "image";
  const attachments = getChatComposerDraft(key).attachments;
  const remainingSlots = CHAT_MAX_IMAGE_ATTACHMENTS - attachments.length;
  if (remainingSlots <= 0) {
    setChatStatus(`You can attach up to ${CHAT_MAX_IMAGE_ATTACHMENTS} images per message.`);
    return true;
  }

  const filesToRead = imageFiles.slice(0, remainingSlots);
  const skippedForLimit = imageFiles.length - filesToRead.length;
  let skippedInvalid = 0;
  const nextAttachments = [];

  for (const file of filesToRead) {
    if (!file || !isSupportedChatImageMimeType(file.type)) {
      skippedInvalid += 1;
      continue;
    }
    if (Number.isFinite(file.size) && file.size > CHAT_MAX_IMAGE_ATTACHMENT_BYTES) {
      skippedInvalid += 1;
      setChatStatus(`${sourceLabel} is too large. Limit ${Math.round(CHAT_MAX_IMAGE_ATTACHMENT_BYTES / (1024 * 1024))} MB.`);
      continue;
    }
    const dataUrl = await readFileAsDataUrl(file).catch(() => "");
    if (!dataUrl) {
      skippedInvalid += 1;
      continue;
    }
    nextAttachments.push({
      id: nextChatComposerAttachmentId(),
      dataUrl,
      mimeType: file.type,
      name: file.name || "Pasted image",
    });
  }

  if (nextAttachments.length === 0) {
    return true;
  }

  attachments.push(...nextAttachments);
  renderChatComposerAttachments();
  if (normalizeChatComposerKey(key) === "pip") {
    syncAvatarDocumentPictureInPictureChatComposer();
  }

  const skippedCount = Math.max(0, skippedForLimit + skippedInvalid);
  setChatStatus(
    skippedCount > 0
      ? `Added ${nextAttachments.length} image${nextAttachments.length === 1 ? "" : "s"}. Extra images were skipped.`
      : `Added ${nextAttachments.length} image${nextAttachments.length === 1 ? "" : "s"} to the message.`,
  );
  return true;
}

function createChatComposerAttachmentPreview(attachment, ownerDocument, options = {}) {
  const previewEl = ownerDocument.createElement("div");
  previewEl.className = "chat-attachment";

  const imageEl = ownerDocument.createElement("img");
  imageEl.className = "chat-attachment__img";
  imageEl.src = attachment.dataUrl;
  imageEl.alt = attachment.name || "Pasted image";
  imageEl.decoding = "async";
  previewEl.appendChild(imageEl);

  if (typeof options.onRemove === "function") {
    const removeButton = ownerDocument.createElement("button");
    removeButton.type = "button";
    removeButton.className = "chat-attachment__remove";
    removeButton.setAttribute("aria-label", "Remove pasted image");
    removeButton.setAttribute("title", "Remove pasted image");
    removeButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 6 6 18"></path>
        <path d="m6 6 12 12"></path>
      </svg>
    `;
    removeButton.addEventListener("click", () => {
      options.onRemove(attachment.id);
    });
    previewEl.appendChild(removeButton);
  }

  return previewEl;
}

function createChatComposerAttachmentsContainer(ownerDocument, className, id = "") {
  const container = ownerDocument.createElement("div");
  container.className = className;
  container.setAttribute("aria-label", "Pasted image attachments");
  if (id) {
    container.id = id;
  }
  return container;
}

function getChatComposerAttachmentsContainer(key = "main") {
  return normalizeChatComposerKey(key) === "pip" ? avatarDocumentPictureInPictureElements?.chatAttachments || null : chatAttachmentsEl;
}

function setChatComposerAttachmentRemoveButtonsInteractive(container, interactive) {
  if (!container) {
    return;
  }
  const isInteractive = interactive !== false;
  const removeButtons = Array.from(container.querySelectorAll(".chat-attachment__remove"));
  for (const removeButton of removeButtons) {
    if (!isButtonElement(removeButton)) {
      continue;
    }
    removeButton.disabled = !isInteractive;
    if (isInteractive) {
      removeButton.removeAttribute("aria-disabled");
      removeButton.removeAttribute("tabindex");
    } else {
      removeButton.setAttribute("aria-disabled", "true");
      removeButton.tabIndex = -1;
    }
  }
}

function ensureChatComposerAttachmentsContainer() {
  if (!chatForm || !chatComposerInputEl) {
    return null;
  }
  if (!chatAttachmentsEl) {
    chatAttachmentsEl = createChatComposerAttachmentsContainer(document, "chat-attachments", "chat-attachments");
  }
  if (!chatAttachmentsEl.isConnected) {
    chatComposerInputEl.insertBefore(chatAttachmentsEl, chatInput || chatComposerInputEl.firstChild || null);
  }
  return chatAttachmentsEl;
}

function removeChatComposerAttachmentsContainer() {
  if (chatAttachmentsEl?.isConnected) {
    chatAttachmentsEl.remove();
  }
}

function ensureAvatarDocumentPictureInPictureChatAttachmentsContainer() {
  if (!avatarDocumentPictureInPictureElements?.chatForm) {
    return null;
  }
  if (!avatarDocumentPictureInPictureElements.chatAttachments) {
    avatarDocumentPictureInPictureElements.chatAttachments = createChatComposerAttachmentsContainer(
      avatarDocumentPictureInPictureElements.chatForm.ownerDocument || document,
      "chat-attachments",
    );
  }
  const { chatAttachments, chatForm: pipChatForm, chatInputRow: pipChatInputRow } = avatarDocumentPictureInPictureElements;
  if (!chatAttachments.isConnected) {
    pipChatForm.insertBefore(chatAttachments, pipChatInputRow || null);
  }
  return chatAttachments;
}

function removeAvatarDocumentPictureInPictureChatAttachmentsContainer() {
  if (avatarDocumentPictureInPictureElements?.chatAttachments?.isConnected) {
    avatarDocumentPictureInPictureElements.chatAttachments.remove();
  }
}

function renderMainChatComposerAttachments() {
  const attachments = getChatComposerDraft("main").attachments;
  if (attachments.length === 0) {
    removeChatComposerAttachmentsContainer();
    return;
  }
  const container = ensureChatComposerAttachmentsContainer();
  if (!container) {
    return;
  }
  container.replaceChildren();
  for (const attachment of attachments) {
    container.appendChild(
      createChatComposerAttachmentPreview(attachment, container.ownerDocument || document, {
        onRemove: (attachmentId) => removeChatComposerAttachment("main", attachmentId),
      }),
    );
  }
}

function renderAvatarDocumentPictureInPictureChatAttachments() {
  const attachments = getChatComposerDraft("pip").attachments;
  if (attachments.length === 0) {
    removeAvatarDocumentPictureInPictureChatAttachmentsContainer();
    return;
  }
  const container = ensureAvatarDocumentPictureInPictureChatAttachmentsContainer();
  if (!container) {
    return;
  }
  container.replaceChildren();
  for (const attachment of attachments) {
    container.appendChild(
      createChatComposerAttachmentPreview(attachment, container.ownerDocument || document, {
        onRemove: (attachmentId) => removeChatComposerAttachment("pip", attachmentId),
      }),
    );
  }
}

function renderChatComposerAttachments() {
  renderMainChatComposerAttachments();
  renderAvatarDocumentPictureInPictureChatAttachments();
}

function clearChatComposerAttachments(key) {
  const attachments = getChatComposerDraft(key).attachments;
  if (attachments.length === 0) {
    renderChatComposerAttachments();
    if (normalizeChatComposerKey(key) === "pip") {
      syncAvatarDocumentPictureInPictureChatComposer();
    }
    return;
  }
  attachments.length = 0;
  renderChatComposerAttachments();
  if (normalizeChatComposerKey(key) === "pip") {
    syncAvatarDocumentPictureInPictureChatComposer();
  }
}

function clearAllChatComposerAttachments() {
  clearChatComposerAttachments("main");
  clearChatComposerAttachments("pip");
}

function removeChatComposerAttachment(key, attachmentId) {
  const attachments = getChatComposerDraft(key).attachments;
  const index = attachments.findIndex((attachment) => attachment.id === attachmentId);
  if (index < 0) {
    return;
  }
  attachments.splice(index, 1);
  renderChatComposerAttachments();
  if (normalizeChatComposerKey(key) === "pip") {
    syncAvatarDocumentPictureInPictureChatComposer();
  }
}

async function addChatComposerAttachmentsFromClipboardEvent(event, key = "main") {
  const imageFiles = extractImageFilesFromClipboardEvent(event);
  if (imageFiles.length === 0) {
    return false;
  }

  event.preventDefault();
  return addChatComposerAttachments(imageFiles, key, {
    sourceLabel: "Pasted image",
  });
}

function hasChatComposerDraftValue(value, attachments = []) {
  return Boolean(String(value || "").trim()) || attachments.length > 0;
}

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") {
    return null;
  }
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1],
    data: match[2],
  };
}

function buildChatSendAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }
  return attachments
    .map((attachment) => {
      const parsedDataUrl = parseDataUrl(attachment?.dataUrl);
      if (!parsedDataUrl) {
        return null;
      }
      return {
        type: "image",
        mimeType: parsedDataUrl.mimeType,
        fileName: attachment.name || "pasted-image",
        content: parsedDataUrl.data,
      };
    })
    .filter(Boolean);
}

function resolveChatContentTextParts(content) {
  if (!Array.isArray(content)) {
    return [];
  }
  return content
    .filter((item) => item && typeof item === "object")
    .filter((item) => item.type === "text" || item.type === "input_text" || item.type === "output_text")
    .map((item) => (typeof item.text === "string" ? item.text.trim() : ""))
    .filter(Boolean);
}

function buildDataUrlFromImageSource(source) {
  if (!source || typeof source !== "object") {
    return "";
  }
  if (source.type === "url" && typeof source.url === "string" && source.url.trim()) {
    return source.url.trim();
  }
  const data = typeof source.data === "string" ? source.data.trim() : "";
  const mimeType = [
    source.mime_type,
    source.media_type,
    source.mimeType,
    source.mediaType,
  ].find((value) => typeof value === "string" && value.trim());
  if (!data || !mimeType) {
    return "";
  }
  return `data:${mimeType.trim()};base64,${data}`;
}

function resolveChatImageUrl(block) {
  if (!block || typeof block !== "object") {
    return "";
  }
  if (typeof block.imageUrl === "string" && block.imageUrl.trim()) {
    return block.imageUrl.trim();
  }
  if (typeof block.url === "string" && block.url.trim()) {
    return block.url.trim();
  }
  if (typeof block.image_url === "string" && block.image_url.trim()) {
    return block.image_url.trim();
  }
  if (block.image_url && typeof block.image_url === "object") {
    const url = typeof block.image_url.url === "string" ? block.image_url.url.trim() : "";
    if (url) {
      return url;
    }
  }
  return buildDataUrlFromImageSource(block.source);
}

function extractChatMessageContent(message) {
  if (!message || typeof message !== "object") {
    return { text: "", images: [] };
  }

  const textParts = resolveChatContentTextParts(message.content);
  const images =
    Array.isArray(message.content)
      ? message.content
          .filter((item) => item && typeof item === "object")
          .map((item) => {
            const type = typeof item.type === "string" ? item.type.trim() : "";
            if (
              type !== "input_image" &&
              type !== "image" &&
              type !== "image_url" &&
              !item.image_url &&
              !item.imageUrl &&
              !item.source &&
              !item.url
            ) {
              return null;
            }
            const url = resolveChatImageUrl(item);
            if (!url) {
              return null;
            }
            return {
              url,
              alt:
                typeof item.alt === "string" && item.alt.trim()
                  ? item.alt.trim()
                  : typeof item.name === "string" && item.name.trim()
                    ? item.name.trim()
                    : "Pasted image",
            };
          })
          .filter(Boolean)
      : [];

  let text = textParts.join("\n\n");
  if (!text && typeof message.content === "string" && message.content.trim()) {
    text = message.content.trim();
  }
  if (!text && typeof message.text === "string" && message.text.trim()) {
    text = message.text.trim();
  }

  return { text, images };
}

function stripStoredUserTimestampPrefix(text) {
  const normalized = typeof text === "string" ? text.trim() : "";
  if (!normalized) {
    return "";
  }
  return normalized.replace(
    /^\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?\s+\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(?::\d{2})?\s+[A-Z]{2,5}\]\s*/u,
    "",
  );
}

function openChatImage(url) {
  if (typeof url !== "string" || !url.trim()) {
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function setOutput(value) {
  if (!outputEl) {
    return;
  }
  outputEl.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function debugLog(event, details = {}) {
  if (!isVideoChatDebugLoggingEnabled()) {
    return;
  }
  const entry = {
    at: new Date().toISOString(),
    event,
    ...sanitizeDebugLogDetails(details),
  };
  debugLogEntries.push(entry);
  if (debugLogEntries.length > 30) {
    debugLogEntries.splice(0, debugLogEntries.length - 30);
  }
  console.log("[video-chat-ui]", entry);
  setOutput({
    debug: debugLogEntries,
  });
}

function summarizeTrackPublication(publication) {
  if (!publication || typeof publication !== "object") {
    return null;
  }
  return {
    sid: typeof publication.trackSid === "string" ? publication.trackSid : "",
    source: typeof publication.source === "string" ? publication.source : "",
    kind: typeof publication.kind === "string" ? publication.kind : "",
    trackName: typeof publication.trackName === "string" ? publication.trackName : "",
    isSubscribed: Boolean(publication.isSubscribed),
    isMuted: Boolean(publication.isMuted),
    hasTrack: Boolean(publication.track),
  };
}

function summarizeParticipantState(participant) {
  if (!participant || typeof participant !== "object") {
    return null;
  }
  return {
    identity: typeof participant.identity === "string" ? participant.identity : "",
    sid: typeof participant.sid === "string" ? participant.sid : "",
    publicationCount: Array.from(participant.trackPublications?.values?.() || []).length,
    publications: Array.from(participant.trackPublications?.values?.() || [])
      .map((publication) => summarizeTrackPublication(publication))
      .filter(Boolean),
  };
}

function summarizeRoomState(room = activeRoom) {
  if (!room || typeof room !== "object") {
    return null;
  }
  return {
    name: typeof room.name === "string" ? room.name : "",
    connectionState:
      typeof room.state === "string"
        ? room.state
        : typeof room.connectionState === "string"
          ? room.connectionState
          : roomConnectionState,
    localParticipant: summarizeParticipantState(room.localParticipant),
    remoteParticipants: Array.from(room.remoteParticipants?.values?.() || [])
      .map((participant) => summarizeParticipantState(participant))
      .filter(Boolean),
    attachedMediaElements: avatarMediaEl
      ? Array.from(avatarMediaEl.querySelectorAll("audio, video")).map((element) => ({
          tagName: element.tagName.toLowerCase(),
          muted: Boolean(element.muted),
          paused: Boolean(element.paused),
          readyState:
            typeof element.readyState === "number" && Number.isFinite(element.readyState)
              ? element.readyState
              : null,
          srcObjectTracks:
            element.srcObject && typeof element.srcObject.getTracks === "function"
              ? element.srcObject.getTracks().map((track) => ({
                  kind: track.kind,
                  enabled: track.enabled,
                  muted: track.muted,
                  readyState: track.readyState,
                }))
              : [],
        }))
      : [],
  };
}

function debugLogRoomState(event, room = activeRoom, details = {}) {
  debugLog(event, {
    ...details,
    roomState: summarizeRoomState(room),
  });
}

function syncVideoChatDebugGlobals() {
  try {
    globalThis.__videoChatDebug = {
      get entries() {
        return debugLogEntries.slice();
      },
      get roomState() {
        return summarizeRoomState();
      },
      dumpRoomState() {
        const snapshot = summarizeRoomState();
        console.log("[video-chat-ui]", { event: "manual-room-state", roomState: snapshot });
        return snapshot;
      },
    };
  } catch {}
}

function isVideoChatDebugLoggingEnabled() {
  if (VIDEO_CHAT_DEBUG_LOGGING) {
    return true;
  }
  try {
    const params = new URLSearchParams(globalThis.location?.search || "");
    const queryValue = params.get(VIDEO_CHAT_DEBUG_LOGGING_QUERY_PARAM);
    if (typeof queryValue === "string") {
      const normalized = queryValue.trim().toLowerCase();
      if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
        return true;
      }
    }
  } catch {}
  try {
    const storedValue = globalThis.localStorage?.getItem(VIDEO_CHAT_DEBUG_LOGGING_STORAGE_KEY);
    if (typeof storedValue === "string") {
      const normalized = storedValue.trim().toLowerCase();
      return (
        normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on"
      );
    }
  } catch {}
  return false;
}

syncVideoChatDebugGlobals();

function sanitizeDebugLogValue(key, value) {
  if (value === null || value === undefined) {
    return value;
  }
  const normalizedKey = typeof key === "string" ? key.trim().toLowerCase() : "";
  if (
    normalizedKey === "livekiturl" ||
    normalizedKey === "sessionkey" ||
    normalizedKey === "activesessionkey" ||
    normalizedKey === "participantidentity" ||
    normalizedKey === "roomname" ||
    normalizedKey === "participanttoken"
  ) {
    return "[redacted]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDebugLogValue("", item));
  }
  if (value && typeof value === "object") {
    return sanitizeDebugLogDetails(value);
  }
  return value;
}

function sanitizeDebugLogDetails(details) {
  if (!details || typeof details !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, sanitizeDebugLogValue(key, value)]),
  );
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
  avatarAutoStartInPictureInPicture = getStoredBooleanPreference(AVATAR_AUTO_START_IN_PIP_STORAGE_KEY, true);
  avatarInterruptReplyOnNewMessage = getStoredBooleanPreference(
    AVATAR_INTERRUPT_REPLY_ON_NEW_MESSAGE_STORAGE_KEY,
    true,
  );
  if (startInPictureInPictureCheckbox) {
    startInPictureInPictureCheckbox.checked = avatarAutoStartInPictureInPicture;
  }
  if (interruptAgentSpeechCheckbox) {
    interruptAgentSpeechCheckbox.checked = avatarInterruptReplyOnNewMessage;
  }
}

function buildSessionCreatePayload(sessionKey) {
  return {
    sessionKey,
    interruptReplyOnNewMessage: avatarInterruptReplyOnNewMessage,
  };
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

function hydrateOpenClawCompatibility(payload) {
  openClawCompatibility = {
    version: typeof payload?.openclaw?.version === "string" ? payload.openclaw.version : null,
    minimumCompatibleVersion:
      typeof payload?.openclaw?.minimumCompatibleVersion === "string" &&
      payload.openclaw.minimumCompatibleVersion.trim()
        ? payload.openclaw.minimumCompatibleVersion.trim()
        : MINIMUM_COMPATIBLE_OPENCLAW_VERSION,
    compatible: typeof payload?.openclaw?.compatible === "boolean" ? payload.openclaw.compatible : null,
  };
  return openClawCompatibility;
}

async function requestBrowserBootstrapPayload() {
  const response = await fetch("/plugins/video-chat/bootstrap");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error("Failed to load browser bootstrap payload.");
  }
  hydrateOpenClawCompatibility(payload);
  return payload;
}

async function refreshOpenClawCompatibility() {
  try {
    await requestBrowserBootstrapPayload();
    return true;
  } catch {
    return false;
  }
}

async function bootstrapGatewayTokenFromServer() {
  try {
    const payload = await requestBrowserBootstrapPayload();
    const token =
      typeof payload?.gateway?.auth?.token === "string" ? payload.gateway.auth.token.trim() : "";
    if (!token) {
      return false;
    }
    if (token !== getGatewayToken().trim()) {
      persistGatewayToken(token);
    }
    return true;
  } catch {
    return false;
  }
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

async function submitVoiceTranscript(rawTranscript) {
  const transcript = typeof rawTranscript === "string" ? rawTranscript.trim() : "";
  if (!transcript) {
    return false;
  }

  const sessionKey = resolveChatSessionKey();
  if (!sessionKey) {
    return false;
  }

  if (shouldSuppressVoiceTranscriptAsAvatarEcho(transcript)) {
    debugLog("voice-chat:transcript-suppressed", {
      reason: "avatar-echo",
      transcriptLength: transcript.length,
    });
    return false;
  }

  const dedupeKey = getVoiceTranscriptDeduplicationKey(sessionKey);
  const priorTranscriptEntry = lastVoiceTranscriptByConnection.get(dedupeKey);
  const duplicateTranscript =
    transcript.length >= VOICE_TRANSCRIPT_DUPLICATE_MIN_LENGTH &&
    priorTranscriptEntry &&
    transcript.toLowerCase() === priorTranscriptEntry.transcript &&
    Date.now() - priorTranscriptEntry.at < VOICE_TRANSCRIPT_DUPLICATE_WINDOW_MS;
  if (duplicateTranscript) {
    return false;
  }
  lastVoiceTranscriptByConnection.set(dedupeKey, {
    transcript: transcript.toLowerCase(),
    at: Date.now(),
  });

  const idempotencyKey = `${VOICE_CHAT_RUN_ID_PREFIX}browser-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  setChatPaneOpen(true);
  appendChatLine("user", transcript, {
    awaitingReply: true,
  });
  setChatStatus("Sending message...");

  try {
    await ensureGatewaySocketConnected();
    const payload = await requestJson("/plugins/video-chat/api/chat/send", {
      method: "POST",
      body: JSON.stringify({
        sessionKey,
        message: transcript,
        idempotencyKey,
      }),
    });
    const response = payload?.response ?? {};
    setOutput({
      action: "voice-chat-sent",
      sessionKey,
      idempotencyKey,
      response,
    });
    setChatStatus("Awaiting agent reply...");
    return true;
  } catch (error) {
    appendChatLine("system", error instanceof Error ? error.message : "Voice chat send failed.", {
      awaitingReply: false,
    });
    setOutput({ action: "voice-chat-send-failed", error: String(error) });
    setChatStatus("Voice chat send failed.");
    return false;
  }
}

function browserSpeechRecognitionSupported() {
  return typeof BROWSER_SPEECH_RECOGNITION === "function";
}

function serverSpeechTranscriptionSupported() {
  const mediaStreamTrack = localAudioTrack?.mediaStreamTrack;
  return Boolean(
    typeof globalThis.MediaRecorder === "function" &&
      mediaStreamTrack &&
      typeof MediaStream === "function" &&
      typeof FileReader === "function",
  );
}

function shouldRunVoiceTranscription() {
  return Boolean(activeSession && activeRoom && localAudioTrack && !localAudioTrack.isMuted);
}

function shouldPreferBrowserSpeechRecognition() {
  return Boolean(
    shouldRunVoiceTranscription() &&
      browserSpeechRecognitionSupported() &&
      (!preferServerSpeechTranscription ||
        !serverSpeechTranscriptionSupported() ||
        serverSpeechTranscriptionUnavailable),
  );
}

function setServerSpeechTranscriptionFallback(reason) {
  if (
    preferServerSpeechTranscription ||
    !serverSpeechTranscriptionSupported() ||
    serverSpeechTranscriptionUnavailable
  ) {
    return;
  }
  preferServerSpeechTranscription = true;
  setOutput({
    action: "voice-chat-server-transcription-fallback",
    reason,
  });
}

function setBrowserSpeechRecognitionFallback(reason) {
  if (!preferServerSpeechTranscription || !browserSpeechRecognitionSupported()) {
    return;
  }
  serverSpeechTranscriptionUnavailable = true;
  preferServerSpeechTranscription = false;
  setOutput({
    action: "voice-chat-browser-transcription-fallback",
    reason,
  });
}

function reportServerSpeechTranscriptionFailure(action, error, details = {}) {
  setOutput({
    action,
    error: error instanceof Error ? error.message : String(error),
    ...details,
  });
  setBrowserSpeechRecognitionFallback("start-failed");
}

function clearBrowserSpeechRecognitionRestartTimer() {
  if (browserSpeechRecognitionRestartTimer === null) {
    return;
  }
  clearTimeout(browserSpeechRecognitionRestartTimer);
  browserSpeechRecognitionRestartTimer = null;
}

function stopBrowserSpeechRecognition() {
  browserSpeechRecognitionShouldRun = false;
  clearBrowserSpeechRecognitionRestartTimer();
  if (!browserSpeechRecognition || !browserSpeechRecognitionActive) {
    return;
  }
  browserSpeechRecognitionActive = false;
  try {
    browserSpeechRecognition.stop();
  } catch {}
}

function pickServerSpeechRecorderMimeType() {
  if (typeof globalThis.MediaRecorder?.isTypeSupported !== "function") {
    return "audio/webm;codecs=opus";
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  for (const candidate of candidates) {
    if (globalThis.MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return "";
}

function measureServerSpeechLevel() {
  if (!serverSpeechRecorderAnalyser || !serverSpeechRecorderAnalyserBuffer) {
    return 0;
  }
  serverSpeechRecorderAnalyser.getByteTimeDomainData(serverSpeechRecorderAnalyserBuffer);
  let total = 0;
  for (const sample of serverSpeechRecorderAnalyserBuffer) {
    const normalized = (sample - 128) / 128;
    total += normalized * normalized;
  }
  return Math.sqrt(total / serverSpeechRecorderAnalyserBuffer.length);
}

function readBlobAsBase64(blob) {
  return new Promise((resolve, reject) => {
    if (!(blob instanceof Blob)) {
      reject(new Error("Audio payload is not a Blob."));
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const commaIndex = dataUrl.indexOf(",");
      resolve(commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl);
    });
    reader.addEventListener("error", () => {
      reject(reader.error || new Error("Failed to read recorded audio."));
    });
    reader.readAsDataURL(blob);
  });
}

function resetServerSpeechRecorderSegment() {
  serverSpeechRecorderSegmentActive = false;
  serverSpeechRecorderSegmentStartedAt = 0;
  serverSpeechRecorderLastSpeechAt = 0;
  serverSpeechRecorderStopReason = "";
}

function queueServerSpeechSegmentTranscription(segmentBlob, reason) {
  const mimeType = segmentBlob.type || serverSpeechRecorderMimeType || "audio/webm";
  const segmentBytes = segmentBlob.size;
  const task = serverSpeechTranscriptionQueue
    .catch(() => {})
    .then(async () => {
      const data = await readBlobAsBase64(segmentBlob);
      if (!data) {
        return false;
      }
      const payload = await requestJson("/plugins/video-chat/api/transcribe", {
        method: "POST",
        body: JSON.stringify({
          mimeType,
          data,
        }),
      });
      const transcript = typeof payload?.transcript === "string" ? payload.transcript.trim() : "";
      if (!transcript) {
        return false;
      }
      await submitVoiceTranscript(transcript);
      setOutput({
        action: "server-speech-transcribed",
        reason,
        mimeType,
        bytes: segmentBytes,
      });
      return true;
    })
    .catch((error) => {
      reportServerSpeechTranscriptionFailure("server-speech-transcription-failed", error, {
        reason,
        mimeType,
        bytes: segmentBytes,
      });
      syncVoiceTranscription();
      return false;
    });
  serverSpeechTranscriptionQueue = task;
  return task;
}

function finalizeServerSpeechRecorderSegment(reason) {
  const segmentChunks = serverSpeechRecorderChunks.slice();
  serverSpeechRecorderChunks = [];
  const mimeType = serverSpeechRecorderMimeType || segmentChunks[0]?.blob?.type || "audio/webm";
  serverSpeechRecorderMimeType = "";
  resetServerSpeechRecorderSegment();
  if (reason === "discard" || segmentChunks.length === 0) {
    return;
  }
  const segmentBlob = new Blob(segmentChunks.map((chunk) => chunk.blob), {
    type: mimeType,
  });
  if (segmentBlob.size < SERVER_SPEECH_MIN_SEGMENT_BYTES) {
    return;
  }
  void queueServerSpeechSegmentTranscription(segmentBlob, reason);
}

function stopServerSpeechRecorderSegment(reason) {
  if (!serverSpeechRecorder) {
    finalizeServerSpeechRecorderSegment(reason);
    return;
  }
  if (serverSpeechRecorder.state === "inactive") {
    finalizeServerSpeechRecorderSegment(reason);
    return;
  }
  serverSpeechRecorderStopReason = reason;
  try {
    serverSpeechRecorder.stop();
  } catch (error) {
    setOutput({
      action: "server-speech-recorder-stop-failed",
      error: error instanceof Error ? error.message : String(error),
      reason,
    });
    finalizeServerSpeechRecorderSegment(reason);
  }
}

function startServerSpeechRecorderSegment(now) {
  const mediaStreamTrack = localAudioTrack?.mediaStreamTrack;
  if (!mediaStreamTrack || serverSpeechRecorder) {
    return;
  }
  const mimeType = pickServerSpeechRecorderMimeType();
  const stream = new MediaStream([mediaStreamTrack]);
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  serverSpeechRecorderChunks = [];
  serverSpeechRecorder = recorder;
  serverSpeechRecorderMimeType = recorder.mimeType || mimeType || "audio/webm";
  serverSpeechRecorderSegmentActive = true;
  serverSpeechRecorderSegmentStartedAt = now;
  serverSpeechRecorderLastSpeechAt = now;
  serverSpeechRecorderStopReason = "";

  recorder.addEventListener("dataavailable", (event) => {
    if (!(event.data instanceof Blob) || event.data.size === 0) {
      return;
    }
    serverSpeechRecorderChunks.push({
      blob: event.data,
      at: Date.now(),
    });
  });
  recorder.addEventListener("error", (event) => {
    reportServerSpeechTranscriptionFailure(
      "server-speech-recorder-error",
      event?.error instanceof Error
        ? event.error
        : typeof event?.error === "string"
          ? event.error
          : new Error("Unknown MediaRecorder error"),
    );
    if (shouldRunVoiceTranscription() && !shouldPreferBrowserSpeechRecognition()) {
      stopServerSpeechRecorderSegment("discard");
    }
    syncVoiceTranscription();
  });
  recorder.addEventListener("stop", () => {
    const reason = serverSpeechRecorderStopReason || "stop";
    serverSpeechRecorder = null;
    finalizeServerSpeechRecorderSegment(reason);
  });

  recorder.start();
  setOutput({
    action: "server-speech-segment-recording-started",
    mimeType: serverSpeechRecorderMimeType,
  });
}

function monitorServerSpeechRecorder() {
  if (!serverSpeechRecorderAnalyser || !serverSpeechRecorderAnalyserBuffer) {
    return;
  }
  const now = Date.now();
  const level = measureServerSpeechLevel();
  const speaking = level >= SERVER_SPEECH_LEVEL_THRESHOLD;
  if (speaking) {
    if (!serverSpeechRecorderSegmentActive) {
      startServerSpeechRecorderSegment(now);
    } else {
      serverSpeechRecorderLastSpeechAt = now;
    }
  }
  if (!serverSpeechRecorderSegmentActive) {
    return;
  }
  const segmentAge = now - serverSpeechRecorderSegmentStartedAt;
  const silenceDuration = serverSpeechRecorderLastSpeechAt > 0 ? now - serverSpeechRecorderLastSpeechAt : 0;
  if (segmentAge >= SERVER_SPEECH_MAX_SEGMENT_MS) {
    stopServerSpeechRecorderSegment("max-duration");
    return;
  }
  if (!speaking && silenceDuration >= SERVER_SPEECH_SILENCE_MS) {
    stopServerSpeechRecorderSegment("silence");
  }
}

function stopServerSpeechTranscription(options = {}) {
  if (serverSpeechRecorderMonitorTimer !== null) {
    clearInterval(serverSpeechRecorderMonitorTimer);
    serverSpeechRecorderMonitorTimer = null;
  }
  stopServerSpeechRecorderSegment(options.flush === true ? "stop" : "discard");
  if (serverSpeechRecorderSourceNode) {
    try {
      serverSpeechRecorderSourceNode.disconnect();
    } catch {}
  }
  if (serverSpeechRecorderAnalyser) {
    try {
      serverSpeechRecorderAnalyser.disconnect();
    } catch {}
  }
  if (serverSpeechRecorderAudioContext) {
    void serverSpeechRecorderAudioContext.close().catch(() => {});
  }
  serverSpeechRecorderAudioContext = null;
  serverSpeechRecorderSourceNode = null;
  serverSpeechRecorderAnalyser = null;
  serverSpeechRecorderAnalyserBuffer = null;
  serverSpeechRecorderStartPromise = null;
}

async function startServerSpeechTranscription() {
  if (serverSpeechRecorder || serverSpeechRecorderStartPromise || !serverSpeechTranscriptionSupported()) {
    return;
  }
  const mediaStreamTrack = localAudioTrack?.mediaStreamTrack;
  if (!mediaStreamTrack) {
    return;
  }
  serverSpeechRecorderStartPromise = (async () => {
    const AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (typeof AudioContextCtor !== "function") {
      throw new Error("AudioContext is unavailable for server speech transcription.");
    }
    const mimeType = pickServerSpeechRecorderMimeType();
    const stream = new MediaStream([mediaStreamTrack]);
    const audioContext = new AudioContextCtor();
    const sourceNode = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.2;
    sourceNode.connect(analyser);
    try {
      await audioContext.resume();
    } catch {}
    serverSpeechTranscriptionUnavailable = false;
    serverSpeechRecorderAudioContext = audioContext;
    serverSpeechRecorderSourceNode = sourceNode;
    serverSpeechRecorderAnalyser = analyser;
    serverSpeechRecorderAnalyserBuffer = new Uint8Array(analyser.fftSize);
    resetServerSpeechRecorderSegment();
    serverSpeechRecorderMonitorTimer = setInterval(
      monitorServerSpeechRecorder,
      SERVER_SPEECH_MONITOR_INTERVAL_MS,
    );
    setOutput({
      action: "server-speech-transcription-ready",
      mimeType,
    });
  })()
    .catch((error) => {
      reportServerSpeechTranscriptionFailure("server-speech-recorder-start-failed", error);
      syncVoiceTranscription();
    })
    .finally(() => {
      serverSpeechRecorderStartPromise = null;
    });
  await serverSpeechRecorderStartPromise;
}

function ensureBrowserSpeechRecognition() {
  if (browserSpeechRecognition || !browserSpeechRecognitionSupported()) {
    return browserSpeechRecognition;
  }

  const recognition = new BROWSER_SPEECH_RECOGNITION();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.lang =
    document.documentElement.lang ||
    (typeof navigator?.language === "string" ? navigator.language : "") ||
    "en-US";

  recognition.addEventListener("result", (event) => {
    if (!event?.results) {
      return;
    }
    const finalized = [];
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result?.isFinal) {
        continue;
      }
      const transcript = typeof result[0]?.transcript === "string" ? result[0].transcript.trim() : "";
      if (transcript) {
        finalized.push(transcript);
      }
    }
    if (finalized.length > 0) {
      void submitVoiceTranscript(finalized.join(" ")).catch((error) => {
        setOutput({ action: "voice-chat-transcript-submit-failed", error: String(error) });
      });
    }
  });

  recognition.addEventListener("error", (event) => {
    browserSpeechRecognitionActive = false;
    const code = typeof event?.error === "string" ? event.error : "unknown";
    if (code === "aborted" || code === "no-speech") {
      return;
    }
    if (code === "not-allowed" || code === "service-not-allowed") {
      browserSpeechRecognitionShouldRun = false;
      setChatStatus("Browser speech recognition permission was denied.");
      setServerSpeechTranscriptionFallback(code);
      syncVoiceTranscription();
      return;
    }
    setOutput({
      action: "browser-speech-recognition-error",
      error: code,
      message: typeof event?.message === "string" ? event.message : "",
    });
    setServerSpeechTranscriptionFallback(code);
    syncVoiceTranscription();
  });

  recognition.addEventListener("end", () => {
    browserSpeechRecognitionActive = false;
    if (!browserSpeechRecognitionShouldRun) {
      return;
    }
    clearBrowserSpeechRecognitionRestartTimer();
    browserSpeechRecognitionRestartTimer = setTimeout(() => {
      syncVoiceTranscription();
    }, 750);
  });

  browserSpeechRecognition = recognition;
  return recognition;
}

function syncVoiceTranscription() {
  const shouldRun = shouldRunVoiceTranscription();
  browserSpeechRecognitionShouldRun = shouldRun && shouldPreferBrowserSpeechRecognition();

  if (!shouldRun) {
    stopBrowserSpeechRecognition();
    stopServerSpeechTranscription();
    return;
  }

  if (shouldPreferBrowserSpeechRecognition()) {
    stopServerSpeechTranscription();
    const recognition = ensureBrowserSpeechRecognition();
    if (!recognition || browserSpeechRecognitionActive) {
      return;
    }
    try {
      recognition.lang =
        document.documentElement.lang ||
        (typeof navigator?.language === "string" ? navigator.language : "") ||
        "en-US";
      recognition.start();
      browserSpeechRecognitionActive = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("already started")) {
        setOutput({ action: "browser-speech-recognition-start-failed", error: message });
        setServerSpeechTranscriptionFallback("start-failed");
        void startServerSpeechTranscription();
      }
    }
    return;
  }

  stopBrowserSpeechRecognition();
  void startServerSpeechTranscription();
}

function syncBrowserSpeechRecognition() {
  syncVoiceTranscription();
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
  element.style.display = "block";
  element.style.maxWidth = "min(78vw, 34rem)";
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
  element.style.wordBreak = "break-word";
}

function applyAvatarMessagePayloadStyles(element) {
  if (!element) {
    return;
  }
  element.style.position = "absolute";
  element.style.left = "24px";
  element.style.bottom = "16%";
  element.style.display = "flex";
  element.style.flexDirection = "column";
  element.style.alignItems = "flex-start";
  element.style.gap = "10px";
  element.style.transform = "none";
  element.style.opacity = "0";
  element.style.pointerEvents = "none";
  element.style.transition = "opacity 260ms ease, transform 260ms ease";
}

function applyAvatarMessageBubbleAttachmentsStyles(element, sourceRect = null) {
  if (!element) {
    return;
  }
  if (sourceRect && sourceRect.width > 0) {
    element.style.width = `${sourceRect.width}px`;
    element.style.maxWidth = `${sourceRect.width}px`;
  }
  element.style.margin = "0";
  element.style.pointerEvents = "none";
}

function copyComputedElementStyles(sourceElement, targetElement) {
  if (!sourceElement || !targetElement) {
    return;
  }
  const sourceWindow = sourceElement.ownerDocument?.defaultView || window;
  const computedStyles = sourceWindow.getComputedStyle(sourceElement);
  for (const propertyName of computedStyles) {
    targetElement.style.setProperty(propertyName, computedStyles.getPropertyValue(propertyName));
  }
  const sourceChildren = Array.from(sourceElement.children);
  const targetChildren = Array.from(targetElement.children);
  const childCount = Math.min(sourceChildren.length, targetChildren.length);
  for (let index = 0; index < childCount; index += 1) {
    copyComputedElementStyles(sourceChildren[index], targetChildren[index]);
  }
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
  const sourceAttachmentsContainer = options.sourceAttachmentsContainer?.isConnected
    ? options.sourceAttachmentsContainer
    : null;
  const hasAttachments = Boolean(sourceAttachmentsContainer);
  if (!normalizedMessage && !hasAttachments) {
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

  const payloadEl = overlayDocument.createElement("div");
  payloadEl.className = "avatar-message-overlay__bubble";
  applyAvatarMessagePayloadStyles(payloadEl);

  let attachmentsPreviewRect = null;
  let bubbleEl = null;
  if (normalizedMessage) {
    bubbleEl = overlayDocument.createElement("div");
    const messageTextEl = overlayDocument.createElement("div");
    applyAvatarMessageBubbleStyles(bubbleEl);
    messageTextEl.textContent = normalizedMessage;
    bubbleEl.appendChild(messageTextEl);
    payloadEl.appendChild(bubbleEl);
  }
  if (hasAttachments) {
    setChatComposerAttachmentRemoveButtonsInteractive(sourceAttachmentsContainer, false);
    attachmentsPreviewRect = sourceAttachmentsContainer.getBoundingClientRect();
    const attachmentsPreviewEl = sourceAttachmentsContainer.cloneNode(true);
    attachmentsPreviewEl.removeAttribute("id");
    attachmentsPreviewEl.setAttribute("aria-hidden", "true");
    copyComputedElementStyles(sourceAttachmentsContainer, attachmentsPreviewEl);
    applyAvatarMessageBubbleAttachmentsStyles(attachmentsPreviewEl, attachmentsPreviewRect);
    setChatComposerAttachmentRemoveButtonsInteractive(attachmentsPreviewEl, false);
    payloadEl.prepend(attachmentsPreviewEl);
  }
  overlayEl.appendChild(payloadEl);

  const revealBubble = () => {
    payloadEl.classList.add("is-visible");
    payloadEl.style.transition = "opacity 260ms ease, transform 260ms ease";
    payloadEl.style.opacity = "1";
    payloadEl.style.transform = "none";
    overlayState.hideTimer = overlayWindow.setTimeout(() => {
      payloadEl.classList.add("is-fading");
      payloadEl.style.opacity = "0";
      payloadEl.style.transform = "translateY(-10px)";
      overlayState.hideTimer = overlayWindow.setTimeout(() => {
        if (overlayEl.contains(payloadEl)) {
          payloadEl.remove();
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
  const payloadRect = payloadEl.getBoundingClientRect();
  const bubbleRect = bubbleEl?.getBoundingClientRect() || null;
  const sourceRect = sourceInput.getBoundingClientRect();
  const sourceAttachmentsRect = attachmentsPreviewRect || sourceAttachmentsContainer?.getBoundingClientRect() || null;
  if (overlayRect.width <= 0 || overlayRect.height <= 0 || sourceRect.width <= 0 || sourceRect.height <= 0) {
    revealBubble();
    return;
  }

  const targetLeft = payloadRect.left;
  const targetTop = payloadRect.top;
  const bubbleStartLeft = sourceRect.left + 9;
  const bubbleStartTop = sourceRect.top + Math.max(6, sourceRect.height - (bubbleRect?.height || payloadRect.height) - 8);
  const startLeft = sourceAttachmentsRect ? sourceAttachmentsRect.left : bubbleStartLeft;
  const startTop = sourceAttachmentsRect ? sourceAttachmentsRect.top : bubbleStartTop;
  const deltaX = startLeft - targetLeft;
  const deltaY = startTop - targetTop;

  payloadEl.style.opacity = "0";
  payloadEl.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
  if (bubbleEl && sourceAttachmentsRect && bubbleRect) {
    const bubbleDeltaX = bubbleStartLeft - (bubbleRect.left + deltaX);
    const bubbleDeltaY = bubbleStartTop - (bubbleRect.top + deltaY);
    bubbleEl.style.transform = `translate(${bubbleDeltaX}px, ${bubbleDeltaY}px)`;
  }

  overlayState.fadeFrame = createAnimationFrameHandle(sourceWindow, () => {
    payloadEl.style.transition =
      "transform 520ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease";
    payloadEl.style.opacity = "1";
    payloadEl.style.transform = "none";
    if (bubbleEl) {
      bubbleEl.style.transition = "transform 520ms cubic-bezier(0.22, 1, 0.36, 1)";
      bubbleEl.style.transform = "none";
    }
    overlayState.fadeFrame = null;
  });

  overlayState.hideTimer = overlayWindow.setTimeout(() => {
    payloadEl.classList.add("is-fading");
    payloadEl.style.transition = "opacity 260ms ease, transform 260ms ease";
    payloadEl.style.opacity = "0";
    payloadEl.style.transform = "translateY(-10px)";
    overlayState.hideTimer = overlayWindow.setTimeout(() => {
      if (overlayEl.contains(payloadEl)) {
        payloadEl.remove();
      }
      overlayState.hideTimer = null;
    }, 320);
  }, 3520);
}

function setHealthStatus(dotEl, valueEl, tone, text) {
  if (!dotEl || !valueEl) {
    return;
  }
  dotEl.classList.remove("ok", "warn", "danger");
  if (tone === "ok" || tone === "warn" || tone === "danger") {
    dotEl.classList.add(tone);
  }
  valueEl.textContent = text;
}

function setGatewayHealthStatus(tone, text) {
  if (openClawCompatibility.compatible === false) {
    setHealthStatus(gatewayHealthDotEl, gatewayHealthValueEl, "danger", INCOMPATIBLE_OPENCLAW_VERSION_MESSAGE);
    return;
  }
  setHealthStatus(gatewayHealthDotEl, gatewayHealthValueEl, tone, text);
}

function setKeysHealthStatus(tone, text) {
  setHealthStatus(keysHealthDotEl, keysHealthValueEl, tone, text);
}

async function copyTextToClipboard(text) {
  const value = typeof text === "string" ? text : "";
  if (!value) {
    throw new Error("Nothing to copy.");
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const helper = document.createElement("textarea");
  helper.value = value;
  helper.setAttribute("readonly", "true");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.append(helper);
  helper.select();
  const copied = document.execCommand("copy");
  helper.remove();
  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

function flashCopyButton(button) {
  if (!button) {
    return;
  }
  const originalLabel =
    button.getAttribute("data-copy-label") ||
    button.getAttribute("aria-label") ||
    button.getAttribute("title") ||
    "Copy";
  if (!button.getAttribute("data-copy-label")) {
    button.setAttribute("data-copy-label", originalLabel);
  }
  button.classList.add("is-copied");
  button.title = "Copied";
  button.setAttribute("aria-label", "Copied");
  window.setTimeout(() => {
    button.classList.remove("is-copied");
    button.title = originalLabel;
    button.setAttribute("aria-label", originalLabel);
  }, 1200);
}

function setSensitiveInputVisible(input, visible) {
  if (!input) {
    return;
  }
  const hadFocus = document.activeElement === input;
  const selectionStart = typeof input.selectionStart === "number" ? input.selectionStart : null;
  const selectionEnd = typeof input.selectionEnd === "number" ? input.selectionEnd : null;
  const selectionDirection = input.selectionDirection || "none";
  input.type = visible ? "text" : "password";
  if (!hadFocus || selectionStart === null || selectionEnd === null) {
    return;
  }
  requestAnimationFrame(() => {
    input.focus({ preventScroll: true });
    try {
      input.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
    } catch {
      // Some browsers can briefly reject selection updates during type toggles.
    }
  });
}

function getStoredSetupSecretValue(setup, fieldName) {
  if (storedSetupSecretValues.has(fieldName)) {
    return normalizeOptionalInputValue(storedSetupSecretValues.get(fieldName));
  }
  switch (fieldName) {
    case "lemonSliceApiKey":
      return normalizeOptionalInputValue(setup?.lemonSlice?.apiKey);
    case "livekitApiKey":
      return normalizeOptionalInputValue(setup?.livekit?.apiKey);
    case "livekitApiSecret":
      return normalizeOptionalInputValue(setup?.livekit?.apiSecret);
    case "elevenLabsApiKey":
      return normalizeOptionalInputValue(setup?.tts?.elevenLabsApiKey);
    default:
      return "";
  }
}

function cacheSetupSecretValues(setup) {
  storedSetupSecretValues.clear();
  if (!setup || typeof setup !== "object") {
    return;
  }
  for (const name of setupSecretFieldNames) {
    const value = getStoredSetupSecretValueFromPayload(setup, name);
    if (value) {
      storedSetupSecretValues.set(name, value);
    }
  }
}

function getStoredSetupSecretValueFromPayload(setup, fieldName) {
  switch (fieldName) {
    case "lemonSliceApiKey":
      return normalizeOptionalInputValue(setup?.lemonSlice?.apiKey);
    case "livekitApiKey":
      return normalizeOptionalInputValue(setup?.livekit?.apiKey);
    case "livekitApiSecret":
      return normalizeOptionalInputValue(setup?.livekit?.apiSecret);
    case "elevenLabsApiKey":
      return normalizeOptionalInputValue(setup?.tts?.elevenLabsApiKey);
    default:
      return "";
  }
}

function redactSetupSecretValue(value, configured) {
  if (configured || normalizeOptionalInputValue(value).length > 0) {
    return REDACTED_SECRET_VALUE;
  }
  return "";
}

function sanitizeSetupStatusForClient(setup) {
  if (!setup || typeof setup !== "object") {
    return setup ?? null;
  }
  return {
    ...setup,
    lemonSlice: {
      ...setup.lemonSlice,
      apiKey: redactSetupSecretValue(setup?.lemonSlice?.apiKey, setup?.lemonSlice?.apiKeyConfigured),
    },
    livekit: {
      ...setup.livekit,
      apiKey: redactSetupSecretValue(setup?.livekit?.apiKey, setup?.livekit?.apiKeyConfigured),
      apiSecret: redactSetupSecretValue(
        setup?.livekit?.apiSecret,
        setup?.livekit?.apiSecretConfigured,
      ),
    },
    tts: {
      ...setup.tts,
      elevenLabsApiKey: redactSetupSecretValue(
        setup?.tts?.elevenLabsApiKey,
        setup?.tts?.elevenLabsApiKeyConfigured,
      ),
    },
  };
}

function updateSensitiveVisibilityButton(button, visible, label) {
  if (!button) {
    return;
  }
  const action = visible ? "Hide" : "Show";
  button.setAttribute("aria-pressed", visible ? "true" : "false");
  button.setAttribute("aria-label", `${action} ${label}`);
  button.setAttribute("title", `${action} ${label}`);
}

function updateSensitiveCopyButton(button, enabled, label) {
  if (!button) {
    return;
  }
  const actionLabel = enabled ? `Copy ${label}` : `Copy ${label}`;
  button.disabled = false;
  button.setAttribute("aria-disabled", "false");
  button.setAttribute("aria-label", actionLabel);
  button.setAttribute("title", actionLabel);
}

function maskSensitiveField(input, isMasked) {
  if (!input) {
    return;
  }
  if (isMasked) {
    input.placeholder = REDACTED_SECRET_VALUE;
    input.readOnly = true;
    input.setAttribute("aria-readonly", "true");
  } else {
    input.readOnly = false;
    input.removeAttribute("aria-readonly");
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
    const visible = secretVisibilityState.has(fieldName);
    maskSensitiveField(input, false);
    setSensitiveInputVisible(input, visible);
  }

  for (const button of sensitiveFieldVisibilityButtons) {
    const fieldName = button.getAttribute("data-toggle-secret-visibility");
    const configured = configuredMap.get(fieldName);
    if (!fieldName) {
      continue;
    }
    updateSensitiveVisibilityButton(
      button,
      secretVisibilityState.has(fieldName) && Boolean(configured || normalizeOptionalInputValue(setupForm.elements.namedItem(fieldName)?.value).length),
      button.getAttribute("data-secret-label") || "secret",
    );
  }

  for (const button of sensitiveFieldCopyButtons) {
    const fieldName = button.getAttribute("data-copy-secret");
    if (!fieldName) {
      continue;
    }
    const input = setupForm.elements.namedItem(fieldName);
    const value = typeof input?.value === "string" ? normalizeOptionalInputValue(input.value) : "";
    const canCopy = Boolean(value) || Boolean(getStoredSetupSecretValue(setup, fieldName));
    updateSensitiveCopyButton(button, canCopy, button.getAttribute("data-secret-label") || "secret");
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
    const value = field.value;
    if (isSecretField && shouldPreserveStoredSecret(name, value)) {
      payload[name] = REDACTED_SECRET_VALUE;
      continue;
    }
    payload[name] = value;
  }
  return payload;
}

function applySetupPayloadToForm(payload) {
  if (!setupForm || !payload || typeof payload !== "object") {
    return;
  }

  secretVisibilityState.clear();
  updateSensitiveFieldMasking(latestSetupStatus);

  for (const name of setupPayloadFieldNames) {
    if (!hasOwn(payload, name)) {
      continue;
    }
    const field = setupForm.elements.namedItem(name);
    if (!field || typeof field.value !== "string") {
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
    lemonSliceApiKey: getSetupFieldValue("lemonSliceApiKey"),
    livekitApiKey: getSetupFieldValue("livekitApiKey"),
    livekitApiSecret: getSetupFieldValue("livekitApiSecret"),
    elevenLabsApiKey: getSetupFieldValue("elevenLabsApiKey"),
  };
}

function restoreSetupFormBaseline() {
  if (!setupForm) {
    return;
  }
  for (const name of setupPayloadFieldNames) {
    const field = setupForm.elements.namedItem(name);
    if (!field || typeof field.value !== "string") {
      continue;
    }
    field.value = setupFormBaseline[name] ?? "";
  }
  secretVisibilityState.clear();
  updateSensitiveFieldMasking(latestSetupStatus);
}

function isSecretFieldDirty(name) {
  if (!setupForm) {
    return false;
  }
  const field = setupForm.elements.namedItem(name);
  if (!field || typeof field.value !== "string") {
    return false;
  }
  return normalizeOptionalInputValue(field.value) !== normalizeOptionalInputValue(setupFormBaseline[name]);
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

function isTokenDirty() {
  if (!tokenInput) {
    return false;
  }
  return normalizeOptionalInputValue(tokenInput.value) !== normalizeOptionalInputValue(getGatewayToken());
}

function hasPendingConfigEdits() {
  return isTokenDirty() || (activeConfigMode === "raw" ? isSetupRawDirty() : isSetupFormDirty());
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
  if (configCancelButton) {
    configCancelButton.disabled = !hasPendingConfigEdits();
  }
}

function updateTokenFieldMasking() {
  if (!tokenInput) {
    return;
  }
  const hasStoredToken = normalizeOptionalInputValue(getGatewayToken()).length > 0;
  tokenInput.placeholder = "";
  tokenInput.disabled = false;
  setSensitiveInputVisible(tokenInput, tokenVisible);
  if (copyTokenButton) {
    copyTokenButton.style.display = hasStoredToken || normalizeOptionalInputValue(tokenInput.value).length ? "" : "none";
  }
  if (toggleTokenVisibilityButton) {
    toggleTokenVisibilityButton.style.display = hasStoredToken || normalizeOptionalInputValue(tokenInput.value).length ? "" : "none";
    updateSensitiveVisibilityButton(toggleTokenVisibilityButton, tokenVisible, "gateway token");
  }
  if (configCancelButton) {
    configCancelButton.disabled = !hasPendingConfigEdits();
  }
}

function shouldPreserveStoredSecret(name, value) {
  if (!latestSetupStatus) {
    return false;
  }
  const normalizedValue = normalizeOptionalInputValue(value);
  const storedValue = normalizeOptionalInputValue(getStoredSetupSecretValue(latestSetupStatus, name));
  return Boolean(storedValue) && normalizedValue === storedValue;
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

function waitForAnimationFrame() {
  return new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve(undefined));
      return;
    }
    window.setTimeout(() => resolve(undefined), 16);
  });
}

async function waitForChatPaneLayoutReady() {
  // Give viewport/media-query state a moment to settle after navigation before revealing the pane.
  await waitForAnimationFrame();
  await waitForAnimationFrame();
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
  const isMobile = isMobileChatPane();
  shellEl?.classList.toggle("shell--chat-pane-open", isOpen);
  shellEl?.classList.toggle("shell--chat-pane-closed", !isOpen);

  if (!isOpen && chatPaneEl?.contains(document.activeElement)) {
    chatPaneToggleButton?.focus({ preventScroll: true });
  }

  if (chatPaneEl) {
    chatPaneEl.setAttribute("aria-hidden", isOpen ? "false" : "true");
    chatPaneEl.hidden = isMobile && !isOpen;
    if ("inert" in chatPaneEl) {
      chatPaneEl.inert = !isOpen;
    }
  }
  if (chatPaneBackdropEl) {
    chatPaneBackdropEl.hidden = !isMobile || !isOpen;
  }
  if (chatPaneResizerEl) {
    chatPaneResizerEl.hidden = isMobile || !isOpen;
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

function resolveInitialChatPaneOpen() {
  let isOpen = !isMobileChatPane();
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
    storedWidth = 360;
  }

  return { isOpen, storedWidth };
}

let chatPaneInitPromise = null;

async function doInitChatPane() {
  let { isOpen, storedWidth } = resolveInitialChatPaneOpen();

  applyChatPaneWidth(storedWidth, { persist: false });
  await waitForChatPaneLayoutReady();

  ({ isOpen, storedWidth } = resolveInitialChatPaneOpen());
  applyChatPaneWidth(storedWidth, { persist: false });
  setChatPaneOpen(isOpen, { persist: false });
  shellEl?.classList.add("shell--chat-pane-ready");
  document.documentElement.classList.remove("video-chat-preload-layout-pending");
  document.documentElement.classList.remove("video-chat-preload-chat-pane-pending");
  document.documentElement.classList.remove("video-chat-preload-chat-pane-closed");

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

function initChatPane() {
  if (!chatPaneInitPromise) {
    chatPaneInitPromise = doInitChatPane().catch((error) => {
      chatPaneInitPromise = null;
      throw error;
    });
  }

  return chatPaneInitPromise;
}

globalThis.initChatPane = initChatPane;

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
  if (activeAvatarParticipantIdentity && normalized === activeAvatarParticipantIdentity) {
    return true;
  }
  return false;
}

function rememberAvatarParticipantIdentity(participantIdentity) {
  const normalized = typeof participantIdentity === "string" ? participantIdentity.trim() : "";
  if (!normalized) {
    return;
  }
  activeAvatarParticipantIdentity = normalized;
}

function clearAvatarParticipantIdentity() {
  activeAvatarParticipantIdentity = "";
}

function shouldTreatParticipantAsAvatar(participant, track = null) {
  void track;
  const identity = typeof participant?.identity === "string" ? participant.identity.trim() : "";
  if (!identity) {
    return false;
  }
  if (isAvatarParticipantIdentity(identity)) {
    return true;
  }
  if (identity.toLowerCase().startsWith("control-ui-")) {
    return false;
  }
  return false;
}

function syncAvatarSpeechStateFromSpeakers(speakers) {
  const participants = Array.isArray(speakers) ? speakers : [];
  const avatarSpeaking = participants.some((participant) => shouldTreatParticipantAsAvatar(participant));
  setAvatarSpeechActive(avatarSpeaking);
}

function refreshAvatarSpeechState(room = activeRoom) {
  if (!room) {
    clearAvatarSpeechActivity();
    return;
  }
  syncAvatarSpeechStateFromSpeakers(room.activeSpeakers);
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

function resetVoiceTranscriptDeduplication() {
  lastVoiceTranscriptByConnection.clear();
}

function getVoiceTranscriptDeduplicationKey(sessionKey) {
  return `${sessionKey}:${roomConnectGeneration}`;
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
      --bg: #020617;
      --panel: rgba(15, 23, 42, 0.88);
      --border: rgba(148, 163, 184, 0.22);
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
      display: grid;
      gap: 8px;
      padding: 0;
      border: none;
      background: transparent;
      backdrop-filter: none;
      box-shadow: none;
    }

    .avatar-pip-chat-compose__row {
      position: relative;
    }

    .avatar-pip-chat-compose .chat-attachments {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px;
      background: var(--panel);
      border-radius: 8px;
      border: 1px solid var(--border);
      width: fit-content;
      max-width: 100%;
      align-self: flex-start;
    }

    .avatar-pip-chat-compose .chat-attachment {
      position: relative;
      width: 80px;
      height: 80px;
      border-radius: 6px;
      overflow: hidden;
      border: 1px solid var(--border);
      background: var(--bg);
    }

    .avatar-pip-chat-compose .chat-attachment__img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .avatar-pip-chat-compose .chat-attachment__remove {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: none;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      font-size: 12px;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 150ms ease-out;
    }

    .avatar-pip-chat-compose .chat-attachment:hover .chat-attachment__remove {
      opacity: 1;
    }

    .avatar-pip-chat-compose .chat-attachment__remove:hover {
      background: rgba(220, 38, 38, 0.9);
    }

    .avatar-pip-chat-compose .chat-attachment__remove svg {
      width: 12px;
      height: 12px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2px;
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

    .avatar-pip-chat-compose__row button {
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

    .avatar-pip-chat-compose__row button:not([hidden]):hover {
      border-color: rgba(56, 189, 248, 0.55);
      background: rgba(14, 165, 233, 0.18);
      color: #38bdf8;
    }

    .avatar-pip-chat-compose__row button:not([hidden]):active {
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

function estimateChatTokens(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length < CHAT_TOKEN_ESTIMATE_MIN_CHARS) {
    return "";
  }
  return `~${Math.ceil(normalized.length / 4)} tokens`;
}

function syncChatTokenEstimate() {
  if (!chatTokenEstimateEl) {
    return;
  }
  const estimate = estimateChatTokens(chatInput?.value || "");
  chatTokenEstimateEl.textContent = estimate;
  chatTokenEstimateEl.hidden = !estimate;
}

function syncChatComposerUi() {
  syncChatInputHeight();
  syncChatTokenEstimate();
}

function syncChatComposerInputHeight(input) {
  if (!isTextAreaElement(input)) {
    return;
  }
  if (input === chatInput) {
    syncChatComposerUi();
    return;
  }
  syncTextareaHeight(input, {
    minHeight: 44,
    maxHeight: 96,
  });
}

function setChatComposerInputValue(input, nextValue) {
  if (!isTextAreaElement(input)) {
    return;
  }
  const normalizedValue = typeof nextValue === "string" ? nextValue : "";
  if (input.value !== normalizedValue) {
    input.value = normalizedValue;
  }
  syncChatComposerInputHeight(input);
}

function syncAvatarDocumentPictureInPictureChatComposer() {
  if (!avatarDocumentPictureInPictureElements) {
    return;
  }

  const {
    chatInput: pipChatInput,
    chatSendButton: pipChatSendButton,
    chatAttachments: pipChatAttachments,
  } = avatarDocumentPictureInPictureElements;
  if (!isTextAreaElement(pipChatInput) || !isButtonElement(pipChatSendButton)) {
    return;
  }

  const hasSession = Boolean(activeSession);
  const disabledTitle = hasSession
    ? "Send message"
    : "Start a session before sending chat messages.";
  const pipAttachments = getChatComposerDraft("pip").attachments;
  const hasDraft = hasChatComposerDraftValue(pipChatInput.value, pipAttachments);
  pipChatInput.disabled = !hasSession;
  pipChatInput.placeholder = hasSession
    ? "Message the active session. Press Enter to send, Shift+Enter for a new line."
    : "Start a session to message";
  pipChatInput.title = disabledTitle;
  pipChatSendButton.disabled = !hasSession;
  pipChatSendButton.hidden = !hasDraft;
  pipChatSendButton.classList.toggle("is-hidden", !hasDraft);
  pipChatSendButton.setAttribute("aria-hidden", hasDraft ? "false" : "true");
  pipChatSendButton.title = hasSession ? "Send message" : disabledTitle;
  pipChatSendButton.setAttribute("aria-label", hasSession ? "Send message" : disabledTitle);
  if (pipAttachments.length > 0) {
    ensureAvatarDocumentPictureInPictureChatAttachmentsContainer();
  } else if (pipChatAttachments) {
    removeAvatarDocumentPictureInPictureChatAttachmentsContainer();
  }
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

  const chatInputRowEl = pictureInPictureDocument.createElement("div");
  chatInputRowEl.className = "avatar-pip-chat-compose__row";

  const chatInputEl = pictureInPictureDocument.createElement("textarea");
  chatInputEl.rows = 1;
  chatInputEl.placeholder = "Message the active session. Press Enter to send, Shift+Enter for a new line.";
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
  chatInputEl.addEventListener("paste", (event) => {
    void addChatComposerAttachmentsFromClipboardEvent(event, "pip").catch((error) => {
      setChatStatus(error instanceof Error ? error.message : "Failed to paste image.");
    });
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
    await submitChatMessage(chatInputEl.value, { sourceInput: chatInputEl, sourceComposer: "pip" });
  });

  chatInputRowEl.append(chatInputEl, chatSendButton);
  chatFormEl.append(chatInputRowEl);
  mediaEl.appendChild(chatFormEl);

  paneEl.append(toolbarEl, mediaEl);
  pictureInPictureDocument.body.appendChild(paneEl);

  avatarDocumentPictureInPictureElements = {
    captureSourceVideo: null,
    chatAttachments: null,
    chatForm: chatFormEl,
    chatInput: chatInputEl,
    chatInputRow: chatInputRowEl,
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
  renderChatComposerAttachments();
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
  clearRecentAvatarReplies();
  clearAllChatComposerAttachments();
  updateChatControls();
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

function formatChatTimestamp(timestamp) {
  return new Date(resolveChatTimestamp(timestamp) ?? Date.now()).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeChatHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeChatHtmlAttribute(value) {
  return escapeChatHtml(value).replaceAll('"', "&quot;");
}

function normalizeChatHref(href) {
  const trimmed = String(href || "").trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    return "";
  }
  return "";
}

function normalizeChatImageSrc(src) {
  const trimmed = String(src || "").trim();
  if (!trimmed) {
    return "";
  }
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }
  return "";
}

function renderChatMarkdownInline(value) {
  const htmlTokens = [];
  const storeHtmlToken = (html) => {
    const token = `[[__VC_HTML_${htmlTokens.length}__]]`;
    htmlTokens.push(html);
    return token;
  };

  let rendered = String(value || "").replace(/`([^`]+)`/g, (_match, code) =>
    storeHtmlToken(`<code>${escapeChatHtml(code)}</code>`),
  );
  rendered = rendered.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, href) => {
    const src = normalizeChatImageSrc(href);
    if (!src) {
      return _match;
    }
    return storeHtmlToken(
      `<img class="markdown-inline-image" src="${escapeChatHtmlAttribute(src)}" alt="${escapeChatHtmlAttribute(alt)}" loading="lazy" />`,
    );
  });
  rendered = rendered.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    const resolvedHref = normalizeChatHref(href);
    if (!resolvedHref) {
      return _match;
    }
    return storeHtmlToken(
      `<a href="${escapeChatHtmlAttribute(resolvedHref)}" target="_blank" rel="noopener noreferrer">${escapeChatHtml(label)}</a>`,
    );
  });
  rendered = rendered.replace(/(^|[\s(])(https?:\/\/[^\s<]*[^\s<).,!?])/g, (_match, prefix, href) => {
    const resolvedHref = normalizeChatHref(href);
    if (!resolvedHref) {
      return `${prefix}${href}`;
    }
    return `${prefix}${storeHtmlToken(
      `<a href="${escapeChatHtmlAttribute(resolvedHref)}" target="_blank" rel="noopener noreferrer">${escapeChatHtml(href)}</a>`,
    )}`;
  });
  rendered = escapeChatHtml(rendered);
  rendered = rendered.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  rendered = rendered.replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,!?]|$)/g, "$1<em>$2</em>");
  return rendered.replace(/\[\[__VC_HTML_(\d+)__\]\]/g, (_match, index) => {
    return htmlTokens[Number(index)] ?? "";
  });
}

function isChatMarkdownTableSeparator(line) {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
}

function parseChatMarkdownTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function renderChatMarkdownList(lines, startIndex, indentLength) {
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const itemMatch = lines[index]?.match(/^(\s*)-\s+(.*)$/);
    if (!itemMatch) {
      break;
    }
    const currentIndent = itemMatch[1]?.length ?? 0;
    if (currentIndent !== indentLength) {
      break;
    }

    const itemParts = [renderChatMarkdownInline(itemMatch[2] ?? "")];
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
          const nestedList = renderChatMarkdownList(lines, index, nestedIndent);
          itemParts.push(nestedList.html);
          index = nestedList.nextIndex;
          continue;
        }
        break;
      }

      const continuationIndent = nextLine.match(/^\s*/)?.[0].length ?? 0;
      if (continuationIndent <= indentLength) {
        break;
      }
      itemParts.push(`<p>${renderChatMarkdownInline(nextLine.trim())}</p>`);
      index += 1;
    }

    items.push(`<li>${itemParts.join("")}</li>`);
  }

  return {
    html: `<ul>${items.join("")}</ul>`,
    nextIndex: index,
  };
}

function renderChatMarkdownToHtml(markdown) {
  const lines = String(markdown || "").replace(/\r\n?/g, "\n").split("\n");
  const html = [];
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
      const codeLines = [];
      while (index < lines.length && !/^```/.test((lines[index] ?? "").trim())) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      const languageClass = language ? ` class="language-${escapeChatHtmlAttribute(language)}"` : "";
      html.push(`<pre><code${languageClass}>${escapeChatHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1]?.length ?? 1;
      html.push(`<h${level}>${renderChatMarkdownInline(headingMatch[2] ?? "")}</h${level}>`);
      index += 1;
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isChatMarkdownTableSeparator(lines[index + 1] ?? "")) {
      const headerCells = parseChatMarkdownTableRow(line);
      index += 2;
      const bodyRows = [];
      while (index < lines.length) {
        const rowLine = lines[index] ?? "";
        if (!rowLine.trim() || !rowLine.includes("|")) {
          break;
        }
        const cells = parseChatMarkdownTableRow(rowLine);
        bodyRows.push(`<tr>${cells.map((cell) => `<td>${renderChatMarkdownInline(cell)}</td>`).join("")}</tr>`);
        index += 1;
      }
      html.push(
        `<table><thead><tr>${headerCells.map((cell) => `<th>${renderChatMarkdownInline(cell)}</th>`).join("")}</tr></thead><tbody>${bodyRows.join("")}</tbody></table>`,
      );
      continue;
    }

    const listMatch = line.match(/^(\s*)-\s+(.*)$/);
    if (listMatch) {
      const list = renderChatMarkdownList(lines, index, listMatch[1]?.length ?? 0);
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
        (nextLine.includes("|") && index + 1 < lines.length && isChatMarkdownTableSeparator(lines[index + 1] ?? ""))
      ) {
        break;
      }
      paragraphLines.push(nextTrimmed);
      index += 1;
    }
    html.push(`<p>${renderChatMarkdownInline(paragraphLines.join(" "))}</p>`);
  }

  return html.join("\n");
}

function detectChatJsonBlock(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed || trimmed.length > CHAT_JSON_RENDER_LIMIT) {
    return null;
  }
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        parsed,
        pretty: JSON.stringify(parsed, null, 2),
      };
    } catch {
      return null;
    }
  }
  return null;
}

function formatChatTokensCompact(n) {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}

function extractMessageUsageMeta(rawMessage) {
  if (!rawMessage || typeof rawMessage !== "object") {
    return null;
  }
  const usage = rawMessage.usage && typeof rawMessage.usage === "object" ? rawMessage.usage : null;
  const cost = rawMessage.cost && typeof rawMessage.cost === "object" ? rawMessage.cost : null;
  const model = typeof rawMessage.model === "string" && rawMessage.model !== "gateway-injected"
    ? rawMessage.model
    : "";

  const meta = {
    input: Number(usage?.input ?? usage?.inputTokens ?? 0) || 0,
    output: Number(usage?.output ?? usage?.outputTokens ?? 0) || 0,
    cacheRead: Number(usage?.cacheRead ?? usage?.cache_read_input_tokens ?? 0) || 0,
    cacheWrite: Number(usage?.cacheWrite ?? usage?.cache_creation_input_tokens ?? 0) || 0,
    cost: Number(cost?.total ?? 0) || 0,
    model,
  };

  if (!meta.input && !meta.output && !meta.cacheRead && !meta.cacheWrite && !meta.cost && !meta.model) {
    return null;
  }
  return meta;
}

function mergeGroupMessageMeta(messages) {
  const merged = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    model: "",
  };

  for (const message of messages) {
    const meta = extractMessageUsageMeta(message?.rawMessage);
    if (!meta) {
      continue;
    }
    merged.input += meta.input;
    merged.output += meta.output;
    merged.cacheRead += meta.cacheRead;
    merged.cacheWrite += meta.cacheWrite;
    merged.cost += meta.cost;
    if (meta.model) {
      merged.model = meta.model;
    }
  }

  if (!merged.input && !merged.output && !merged.cacheRead && !merged.cacheWrite && !merged.cost && !merged.model) {
    return null;
  }
  return merged;
}

function createMessageMetaEl(meta) {
  if (!meta) {
    return null;
  }
  const metaEl = document.createElement("span");
  metaEl.className = "msg-meta";

  const appendPart = (className, text) => {
    const part = document.createElement("span");
    part.className = className;
    part.textContent = text;
    metaEl.appendChild(part);
  };

  if (meta.input) {
    appendPart("msg-meta__tokens", `↑${formatChatTokensCompact(meta.input)}`);
  }
  if (meta.output) {
    appendPart("msg-meta__tokens", `↓${formatChatTokensCompact(meta.output)}`);
  }
  if (meta.cacheRead) {
    appendPart("msg-meta__cache", `R${formatChatTokensCompact(meta.cacheRead)}`);
  }
  if (meta.cacheWrite) {
    appendPart("msg-meta__cache", `W${formatChatTokensCompact(meta.cacheWrite)}`);
  }
  if (meta.cost > 0) {
    appendPart("msg-meta__cost", `$${meta.cost.toFixed(4)}`);
  }
  if (meta.model) {
    const shortModel = meta.model.includes("/") ? meta.model.split("/").pop() : meta.model;
    appendPart("msg-meta__model", shortModel || meta.model);
  }

  return metaEl.childElementCount > 0 ? metaEl : null;
}

function createSvgFromMarkup(markup) {
  const template = document.createElement("template");
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

function buildWelcomeState() {
  const emptyState = document.createElement("div");
  emptyState.className = "agent-chat__welcome";

  const avatar = document.createElement("div");
  avatar.className = "agent-chat__avatar--logo";
  avatar.appendChild(
    createSvgFromMarkup(`
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2v4"></path>
        <path d="M12 18v4"></path>
        <path d="m4.93 4.93 2.83 2.83"></path>
        <path d="m16.24 16.24 2.83 2.83"></path>
        <path d="M2 12h4"></path>
        <path d="M18 12h4"></path>
        <path d="m4.93 19.07 2.83-2.83"></path>
        <path d="m16.24 7.76 2.83-2.83"></path>
        <circle cx="12" cy="12" r="3.5"></circle>
      </svg>
    `),
  );
  emptyState.appendChild(avatar);

  const heading = document.createElement("h2");
  heading.textContent = activeSession ? "Ready to chat" : "Start a session to chat";
  emptyState.appendChild(heading);

  const badges = document.createElement("div");
  badges.className = "agent-chat__badges";
  const badge = document.createElement("span");
  badge.className = "agent-chat__badge";
  badge.textContent = activeSession ? "Active session connected" : "Waiting for a session";
  badges.appendChild(badge);
  emptyState.appendChild(badges);

  const hint = document.createElement("p");
  hint.className = "agent-chat__hint";
  hint.innerHTML = activeSession
    ? 'Type a message below or pick a suggestion to get moving.'
    : 'Use the main controls to start a session, then your chat will appear here.';
  emptyState.appendChild(hint);

  if (activeSession) {
    const suggestions = document.createElement("div");
    suggestions.className = "agent-chat__suggestions";
    for (const suggestion of CHAT_WELCOME_SUGGESTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "agent-chat__suggestion";
      button.textContent = suggestion;
      button.addEventListener("click", () => {
        if (!isTextAreaElement(chatInput)) {
          return;
        }
        chatInput.value = suggestion;
        syncChatComposerUi();
        chatForm?.requestSubmit();
      });
      suggestions.appendChild(button);
    }
    emptyState.appendChild(suggestions);
  }

  return emptyState;
}

function buildChatTextContent(text) {
  const content = document.createElement("div");
  content.className = "chat-text";
  const normalizedText = String(text || "").replace(/\r\n/g, "\n").trim();
  const jsonBlock = detectChatJsonBlock(normalizedText);
  if (jsonBlock) {
    const details = document.createElement("details");
    details.className = "chat-json-collapse";

    const summary = document.createElement("summary");
    summary.className = "chat-json-summary";
    summary.innerHTML = `
      <span class="chat-json-badge">JSON</span>
      <span class="chat-json-label">${
        Array.isArray(jsonBlock.parsed)
          ? `Array (${jsonBlock.parsed.length} item${jsonBlock.parsed.length === 1 ? "" : "s"})`
          : jsonBlock.parsed && typeof jsonBlock.parsed === "object"
            ? `Object (${Object.keys(jsonBlock.parsed).length} keys)`
            : "JSON"
      }</span>
    `;
    details.appendChild(summary);

    const pre = document.createElement("pre");
    pre.className = "chat-json-content";
    const code = document.createElement("code");
    code.textContent = jsonBlock.pretty;
    pre.appendChild(code);
    details.appendChild(pre);
    content.appendChild(details);
    return content;
  }

  content.innerHTML = renderChatMarkdownToHtml(normalizedText);
  return content;
}

function createChatAvatar(roleClass) {
  const avatar = document.createElement("div");
  avatar.className = `chat-avatar ${roleClass}`;
  const svgMarkup =
    roleClass === "user"
      ? `
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="4"></circle>
          <path d="M20 21a8 8 0 1 0-16 0"></path>
        </svg>
      `
      : roleClass === "assistant"
        ? `
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16l-6.4 5.2L8 14 2 9.2h7.6z"></path>
          </svg>
        `
        : `
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"></circle>
            <path d="M12 8h.01"></path>
            <path d="M11 12h1v4h1"></path>
          </svg>
        `;
  const icon = createSvgFromMarkup(svgMarkup);
  if (icon) {
    avatar.appendChild(icon);
  }
  return avatar;
}

function createChatImageGallery(images) {
  if (!Array.isArray(images) || images.length === 0) {
    return null;
  }
  const gallery = document.createElement("div");
  gallery.className = "chat-message-images";
  for (const image of images) {
    if (!image?.url) {
      continue;
    }
    const imageEl = document.createElement("img");
    imageEl.className = "chat-message-image";
    imageEl.src = image.url;
    imageEl.alt = image.alt || "Message image";
    imageEl.loading = "lazy";
    imageEl.decoding = "async";
    imageEl.addEventListener("click", () => {
      openChatImage(image.url);
    });
    gallery.appendChild(imageEl);
  }
  return gallery.childElementCount > 0 ? gallery : null;
}

function buildChatBubbleContent(message) {
  const fragment = document.createDocumentFragment();
  const gallery = createChatImageGallery(message?.images);
  if (gallery) {
    fragment.appendChild(gallery);
  }
  if (message?.text) {
    fragment.appendChild(buildChatTextContent(message.text));
  }
  return fragment;
}

function createChatBubble(message) {
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble fade-in";
  bubble.appendChild(buildChatBubbleContent(message));
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
    chatLogEl.appendChild(buildWelcomeState());
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
        messagesEl.appendChild(createChatBubble(message));
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
      const meta = createMessageMetaEl(mergeGroupMessageMeta(group.messages));
      if (meta) {
        footer.appendChild(meta);
      }
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
    const hasImages = Array.isArray(entry?.images) && entry.images.length > 0;
    if (!entry || (!entry.text && !hasImages)) {
      continue;
    }
    chatMessages.push({
      role: entry.role,
      text: typeof entry.text === "string" ? entry.text : "",
      images: hasImages ? entry.images : [],
      timestamp: resolveChatTimestamp(entry.timestamp) ?? Date.now(),
      rawMessage: entry?.rawMessage && typeof entry.rawMessage === "object" ? entry.rawMessage : null,
    });
  }
  chatAwaitingReply = false;
  updateChatControls();
  renderChatLog({ scrollToBottom: false });
}

function setChatAwaitingReply(nextValue) {
  const normalized = Boolean(nextValue);
  if (chatAwaitingReply === normalized) {
    return;
  }
  chatAwaitingReply = normalized;
  updateChatControls();
  renderChatLog();
}

function appendChatLine(role, textOrMessage, options = {}) {
  if (!chatLogEl) {
    return;
  }
  const content =
    typeof textOrMessage === "string"
      ? { text: String(textOrMessage), images: [] }
      : textOrMessage && typeof textOrMessage === "object"
        ? {
            text: typeof textOrMessage.text === "string" ? textOrMessage.text : "",
            images: Array.isArray(textOrMessage.images) ? textOrMessage.images : [],
          }
        : { text: "", images: [] };
  if (!content.text && content.images.length === 0) {
    return;
  }
  chatMessages.push({
    role,
    text: content.text,
    images: content.images,
    timestamp: resolveChatTimestamp(options.timestamp) ?? Date.now(),
    rawMessage: options.rawMessage && typeof options.rawMessage === "object" ? options.rawMessage : null,
  });
  if (Object.prototype.hasOwnProperty.call(options, "awaitingReply")) {
    chatAwaitingReply = Boolean(options.awaitingReply);
    updateChatControls();
  }
  renderChatLog();
}

function extractAssistantText(message) {
  return extractChatMessageContent(message).text;
}

function extractUserText(message) {
  return extractChatMessageContent(message).text;
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
  if (chatAttachButton) {
    chatAttachButton.disabled = !hasSession;
  }
  if (chatFileInput) {
    chatFileInput.disabled = !hasSession;
  }
  chatSendButton.disabled = !hasSession || chatAwaitingReply;
  if (getChatComposerDraft("main").attachments.length > 0) {
    ensureChatComposerAttachmentsContainer();
  } else {
    removeChatComposerAttachmentsContainer();
  }
  syncChatComposerUi();
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
  updateChatControls();
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
    const content = extractChatMessageContent(payload.message);
    if (content.text) {
      rememberRecentAvatarReply(content.text, resolveMessageTimestamp(payload.message));
    }
    const assistantMessage = content.text || content.images.length > 0 ? content : "[No text in final message]";
    appendChatLine(
      "assistant",
      assistantMessage,
      {
        awaitingReply: false,
        timestamp: resolveMessageTimestamp(payload.message),
        rawMessage: payload.message,
      },
    );
    if (!extractMessageUsageMeta(payload.message) && content.text) {
      scheduleAssistantMessageMetadataBackfill({
        sessionKey: expectedSessionKey,
        text: content.text,
        timestamp: resolveMessageTimestamp(payload.message),
      });
    }
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
      scopes: GATEWAY_WS_SCOPES,
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
  const history = await requestJson("/plugins/video-chat/api/chat/history", {
    method: "POST",
    body: JSON.stringify({
      sessionKey,
      limit: 30,
    }),
  });
  renderedVoiceUserRuns.clear();
  clearRecentAvatarReplies();
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
    const content = extractChatMessageContent(message);
    if (role === "user") {
      content.text = stripStoredUserTimestampPrefix(content.text);
    }
    if (content.text || content.images.length > 0) {
      entries.push({
        role,
        text: content.text,
        images: content.images,
        timestamp: resolveMessageTimestamp(message),
        rawMessage: message,
      });
      if (role === "assistant" && content.text) {
        rememberRecentAvatarReply(content.text, resolveMessageTimestamp(message));
      }
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

async function backfillAssistantMessageMetadataFromHistory(params = {}) {
  const sessionKey = typeof params.sessionKey === "string" ? params.sessionKey.trim() : "";
  const targetText = typeof params.text === "string" ? params.text.trim() : "";
  const targetTimestamp = resolveChatTimestamp(params.timestamp) ?? Date.now();
  if (!sessionKey || !targetText) {
    return;
  }

  const history = await requestJson("/plugins/video-chat/api/chat/history", {
    method: "POST",
    body: JSON.stringify({
      sessionKey,
      limit: 30,
    }),
  });

  const normalizedTarget = normalizeComparableSpeechText(targetText);
  const historyMessages = Array.isArray(history?.messages) ? history.messages : [];
  let matchedHistoryMessage = null;

  for (let index = historyMessages.length - 1; index >= 0; index -= 1) {
    const historyMessage = historyMessages[index];
    if (!historyMessage || typeof historyMessage !== "object" || historyMessage.role !== "assistant") {
      continue;
    }
    if (!extractMessageUsageMeta(historyMessage)) {
      continue;
    }
    const historyContent = extractChatMessageContent(historyMessage);
    const normalizedHistoryText = normalizeComparableSpeechText(historyContent.text);
    const historyTimestamp = resolveMessageTimestamp(historyMessage);
    if (
      normalizedHistoryText &&
      normalizedHistoryText === normalizedTarget &&
      Math.abs(historyTimestamp - targetTimestamp) <= 5 * 60 * 1000
    ) {
      matchedHistoryMessage = historyMessage;
      break;
    }
  }

  if (!matchedHistoryMessage) {
    return;
  }

  for (let index = chatMessages.length - 1; index >= 0; index -= 1) {
    const message = chatMessages[index];
    if (!message || message.role !== "assistant" || extractMessageUsageMeta(message.rawMessage)) {
      continue;
    }
    const normalizedLocalText = normalizeComparableSpeechText(message.text);
    if (!normalizedLocalText || normalizedLocalText !== normalizedTarget) {
      continue;
    }
    if (Math.abs((resolveChatTimestamp(message.timestamp) ?? Date.now()) - targetTimestamp) > 5 * 60 * 1000) {
      continue;
    }
    message.rawMessage = matchedHistoryMessage;
    renderChatLog({ scrollToBottom: false });
    break;
  }
}

function scheduleAssistantMessageMetadataBackfill(params = {}) {
  const sessionKey = typeof params.sessionKey === "string" ? params.sessionKey.trim() : "";
  if (!sessionKey) {
    return;
  }
  const existingTimer = assistantMetadataBackfillTimers.get(sessionKey);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  const timer = setTimeout(() => {
    assistantMetadataBackfillTimers.delete(sessionKey);
    void backfillAssistantMessageMetadataFromHistory(params).catch(() => {});
  }, 350);
  assistantMetadataBackfillTimers.set(sessionKey, timer);
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
    clearAvatarParticipantIdentity();
    clearAvatarSpeechActivity();
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
  clearAvatarParticipantIdentity();
  clearAvatarSpeechActivity();
  unbindAvatarPictureInPictureVideo();
  updateAvatarAspectRatio(null);
  updateAvatarUiState();
}

async function maybeStartAvatarPictureInPicture() {
  if (
    !avatarAutoStartInPictureInPicture ||
    !hasPictureInPictureBrowserSupport() ||
    isAvatarPictureInPictureActive()
  ) {
    debugLog("pip:auto-start-skipped", {
      enabled: avatarAutoStartInPictureInPicture,
      hasPictureInPictureBrowserSupport: hasPictureInPictureBrowserSupport(),
      alreadyActive: isAvatarPictureInPictureActive(),
    });
    return false;
  }
  try {
    await enterAvatarPictureInPicture();
    debugLog("pip:auto-start-opened", {
      mode: isAvatarDocumentPictureInPictureActive() ? "document" : "video",
    });
    return true;
  } catch (error) {
    debugLog("pip:auto-start-failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

function getRemoteMediaContainer(participant, track = null) {
  const participantIdentity = typeof participant?.identity === "string" ? participant.identity.trim() : "";
  const shouldAttach = Boolean(avatarMediaEl && shouldTreatParticipantAsAvatar(participant, track));
  debugLog("avatar:media-container", {
    participantIdentity,
    trackKind: typeof track?.kind === "string" ? track.kind : "",
    shouldAttach,
    activeAvatarParticipantIdentity,
  });
  if (!shouldAttach) {
    return null;
  }
  rememberAvatarParticipantIdentity(participant.identity);
  return avatarMediaEl;
}

function attachTrackToContainer(track, container) {
  if (!container) {
    return;
  }
  const element = track.attach();
  debugLog("livekit:track-attached", {
    trackKind: track?.kind ?? "",
    elementTag: element?.tagName?.toLowerCase?.() ?? "",
  });
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
  if (isMediaElement(element) && typeof element.play === "function") {
    void element.play().catch((error) => {
      setOutput({
        action: "remote-media-play-failed",
        kind: track.kind,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
  if (track.kind === "video") {
    markAvatarConnected();
  }
  debugLogRoomState("livekit:track-attached-state", activeRoom, {
    trackKind: track?.kind ?? "",
    elementTag: element?.tagName?.toLowerCase?.() ?? "",
  });
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
  stopBrowserSpeechRecognition();
  stopServerSpeechTranscription();
  serverSpeechTranscriptionUnavailable = false;
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

function hasAvatarParticipantInRoom(room = activeRoom) {
  if (!room?.remoteParticipants?.values) {
    return false;
  }
  for (const participant of room.remoteParticipants.values()) {
    if (shouldTreatParticipantAsAvatar(participant)) {
      return true;
    }
  }
  return false;
}

function createAvatarJoinTimeoutError(message) {
  const error = new Error(message);
  error.name = "AvatarJoinTimeoutError";
  error.code = AVATAR_JOIN_TIMEOUT_ERROR_CODE;
  return error;
}

function isAvatarJoinTimeoutError(error) {
  return (
    error instanceof Error &&
    (error.code === AVATAR_JOIN_TIMEOUT_ERROR_CODE || error.name === "AvatarJoinTimeoutError")
  );
}

async function waitForAvatarParticipant(room, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 12_000;
  const pollMs = Number.isFinite(options.pollMs) ? options.pollMs : 200;
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (activeRoom !== room) {
      throw new Error("Room changed before avatar joined.");
    }
    if (!activeSession) {
      throw new Error("Session ended before avatar joined.");
    }
    if (hasAvatarParticipantInRoom(room) || hasAvatarVideo()) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, pollMs);
    });
  }
  throw createAvatarJoinTimeoutError("Timed out waiting for avatar to join the room.");
}

async function restartVideoChatSidecar() {
  const payload = await requestJson("/plugins/video-chat/api/sidecar/restart", {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (payload?.restarted !== true) {
    throw new Error(
      `Sidecar restart was not acknowledged: ${JSON.stringify(payload ?? {})}`,
    );
  }
  setOutput({
    action: "sidecar-restarted",
    restarted: true,
  });
  return payload;
}

async function stopVideoChatSidecar() {
  const payload = await requestJson("/plugins/video-chat/api/sidecar/stop", {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (payload?.stopped !== true) {
    throw new Error(`Sidecar stop was not acknowledged: ${JSON.stringify(payload ?? {})}`);
  }
  return payload;
}

async function connectToRoomAndEnsureAvatar(options = {}) {
  const remainingAutoRecoveryAttempts = Number.isFinite(options.autoRecoveryAttemptsRemaining)
    ? Math.max(0, Math.floor(options.autoRecoveryAttemptsRemaining))
    : AVATAR_AUTO_RECOVERY_MAX_ATTEMPTS;
  await connectToRoom(options);
  const room = activeRoom;
  if (!room) {
    return;
  }
  try {
    await waitForAvatarParticipant(room, {
      timeoutMs: options.avatarJoinTimeoutMs,
    });
  } catch (error) {
    if (
      !isAvatarJoinTimeoutError(error) ||
      options.allowAutoRecovery === false ||
      avatarSessionAutoRecovering ||
      !activeSession ||
      remainingAutoRecoveryAttempts <= 0
    ) {
      throw error;
    }
    avatarSessionAutoRecovering = true;
    setOutput({
      action: "avatar-session-auto-recovering",
      roomName: activeSession?.roomName ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
    setAvatarLoadingState(true, "Avatar did not join. Restarting worker and recreating session...");
    updateRoomButtons();
    try {
      const nextAutoRecoveryAttemptsRemaining = remainingAutoRecoveryAttempts - 1;
      await reconnectAvatarSession({
        allowAutoRecovery: nextAutoRecoveryAttemptsRemaining > 0,
        restartSidecar: true,
        autoRecoveryAttemptsRemaining: nextAutoRecoveryAttemptsRemaining,
      });
      return;
    } finally {
      avatarSessionAutoRecovering = false;
    }
  }
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
  syncBrowserSpeechRecognition();
}

function removeParticipantTile(participantIdentity) {
  if (!isAvatarParticipantIdentity(participantIdentity)) {
    return;
  }
  clearAvatarParticipantIdentity();
  clearAvatarSpeechActivity();
  markAvatarDisconnected();
  clearRemoteTiles({ keepDocumentPictureInPicture: Boolean(activeRoom || activeSession) });
}

async function publishLocalTracks(room) {
  if (!LIVEKIT) {
    throw new Error("LiveKit client library did not load");
  }
  let tracks = [];
  try {
    preferServerSpeechTranscription = true;
    serverSpeechTranscriptionUnavailable = false;
    tracks = await LIVEKIT.createLocalTracks({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } catch (error) {
    debugLog("livekit:local-audio-unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    setOutput({
      action: "microphone-unavailable",
      error: error instanceof Error ? error.message : String(error),
    });
    updateRoomButtons();
    throw error;
  }
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
    debugLogRoomState("livekit:local-track-published", room, {
      trackKind: track.kind,
    });
  }
}

function bindRoomEvents(room) {
  if (!LIVEKIT) {
    return;
  }
  room.on(LIVEKIT.RoomEvent.ParticipantConnected, (participant) => {
    debugLog("livekit:participant-connected", {
      participantIdentity: participant?.identity ?? "",
      publicationCount: Array.from(participant?.trackPublications?.values?.() || []).length,
    });
    debugLogRoomState("livekit:participant-connected-state", room, {
      participantIdentity: participant?.identity ?? "",
    });
  });
  room.on(LIVEKIT.RoomEvent.DataReceived, (payload, participant, kind, topic) => {
    void participant;
    void kind;
    handleLiveKitDataMessage(payload, topic);
  });
  room.on?.(LIVEKIT.RoomEvent.ActiveSpeakersChanged, (speakers) => {
    debugLog("livekit:active-speakers-changed", {
      participantIdentities: Array.isArray(speakers)
        ? speakers.map((participant) =>
            sanitizeDebugLogValue("participantIdentity", participant?.identity ?? ""),
          )
        : [],
    });
    syncAvatarSpeechStateFromSpeakers(speakers);
  });
  room.on?.(LIVEKIT.RoomEvent.TrackPublished, (publication, participant) => {
    debugLog("livekit:track-published", {
      participantIdentity: participant?.identity ?? "",
      publication: summarizeTrackPublication(publication),
    });
    debugLogRoomState("livekit:track-published-state", room, {
      participantIdentity: participant?.identity ?? "",
    });
  });
  room.on?.(LIVEKIT.RoomEvent.TrackUnpublished, (publication, participant) => {
    debugLog("livekit:track-unpublished", {
      participantIdentity: participant?.identity ?? "",
      publication: summarizeTrackPublication(publication),
    });
    debugLogRoomState("livekit:track-unpublished-state", room, {
      participantIdentity: participant?.identity ?? "",
    });
  });
  room.on(LIVEKIT.RoomEvent.TrackSubscribed, (track, publication, participant) => {
    debugLog("livekit:track-subscribed", {
      participantIdentity: participant?.identity ?? "",
      trackKind: track?.kind ?? "",
      publicationCount: Array.from(participant?.trackPublications?.values?.() || []).length,
      publication: summarizeTrackPublication(publication),
    });
    const container = getRemoteMediaContainer(participant, track);
    attachTrackToContainer(track, container);
    debugLogRoomState("livekit:track-subscribed-state", room, {
      participantIdentity: participant?.identity ?? "",
      trackKind: track?.kind ?? "",
    });
    refreshAvatarSpeechState(room);
    updateRoomButtons();
  });
  room.on(LIVEKIT.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
    debugLog("livekit:track-unsubscribed", {
      participantIdentity: participant?.identity ?? "",
      trackKind: track?.kind ?? "",
      publication: summarizeTrackPublication(publication),
    });
    detachTrack(track);
    debugLogRoomState("livekit:track-unsubscribed-state", room, {
      participantIdentity: participant?.identity ?? "",
      trackKind: track?.kind ?? "",
    });
    updateAvatarUiState();
    const hasSubscribedTracks = Array.from(participant.trackPublications.values()).some(
      (item) => Boolean(item.track),
    );
    if (!hasSubscribedTracks) {
      removeParticipantTile(participant.identity);
    } else if (shouldTreatParticipantAsAvatar(participant) && !hasAvatarVideo()) {
      rememberAvatarParticipantIdentity(participant.identity);
      markAvatarDisconnected();
    }
    refreshAvatarSpeechState(room);
  });
  room.on(LIVEKIT.RoomEvent.ParticipantDisconnected, (participant) => {
    debugLog("livekit:participant-disconnected", {
      participantIdentity: participant?.identity ?? "",
    });
    debugLogRoomState("livekit:participant-disconnected-state", room, {
      participantIdentity: participant?.identity ?? "",
    });
    removeParticipantTile(participant.identity);
    refreshAvatarSpeechState(room);
  });
  room.on(LIVEKIT.RoomEvent.ConnectionStateChanged, (state) => {
    roomConnectionState =
      typeof state === "string" && state.trim() ? state.trim().toLowerCase() : "disconnected";
    debugLog("livekit:connection-state", {
      state: roomConnectionState,
      activeSessionKey: activeSession?.sessionKey ?? "",
    });
    debugLogRoomState("livekit:connection-state-snapshot", room, {
      state: roomConnectionState,
    });
    if (roomConnectionState !== "connected") {
      setAvatarConnectionState(activeSession ? "connecting" : "idle");
    }
    updateRoomStatusState();
    updateRoomButtons();
  });
  room.on(LIVEKIT.RoomEvent.Disconnected, () => {
    debugLog("livekit:room-disconnected", {
      activeSessionKey: activeSession?.sessionKey ?? "",
    });
    debugLogRoomState("livekit:room-disconnected-state", room, {
      activeSessionKey: activeSession?.sessionKey ?? "",
    });
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
    debugLog("livekit:connect-begin", {
      livekitUrl: activeSession.livekitUrl,
      participantIdentity: activeSession.participantIdentity ?? "",
      roomName: activeSession.roomName ?? "",
    });
    await room.connect(activeSession.livekitUrl, activeSession.participantToken);
    debugLog("livekit:connect-success", {
      localParticipantIdentity: room.localParticipant?.identity ?? "",
      remoteParticipantCount: room.remoteParticipants.size,
      roomName: activeSession.roomName ?? "",
    });
    debugLogRoomState("livekit:connect-success-state", room, {
      remoteParticipantCount: room.remoteParticipants.size,
    });
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
      debugLog("livekit:existing-remote-participant", {
        participantIdentity: participant?.identity ?? "",
        publicationCount: Array.from(participant?.trackPublications?.values?.() || []).length,
      });
      for (const publication of participant.trackPublications.values()) {
        if (!publication.track) {
          debugLog("livekit:existing-publication-no-track", {
            participantIdentity: participant?.identity ?? "",
            publicationKind: publication?.kind ?? "",
          });
          continue;
        }
        const container = getRemoteMediaContainer(participant, publication.track);
        attachTrackToContainer(publication.track, container);
      }
    }
    refreshAvatarSpeechState(room);
    debugLogRoomState("livekit:post-connect-room-state", room);
    updateRoomButtons();
  } catch (error) {
    debugLog("livekit:connect-failed", {
      error: error instanceof Error ? error.message : String(error),
      roomName: activeSession?.roomName ?? "",
    });
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
  resetVoiceTranscriptDeduplication();
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

async function reconnectAvatarSession(options = {}) {
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
    if (options.restartSidecar !== false) {
      setAvatarLoadingState(true, "Restarting Claw Cast worker...");
      await restartVideoChatSidecar();
    }
    const payload = await requestJson("/plugins/video-chat/api/session", {
      method: "POST",
      body: JSON.stringify(buildSessionCreatePayload(priorSessionKey)),
    });
    activeSession = payload.session;
    resetVoiceTranscriptDeduplication();
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
    const restoreAutoRecovering = avatarSessionAutoRecovering;
    const allowNestedAutoRecovery =
      options.allowAutoRecovery !== false &&
      Number.isFinite(options.autoRecoveryAttemptsRemaining) &&
      options.autoRecoveryAttemptsRemaining > 0;
    if (allowNestedAutoRecovery) {
      avatarSessionAutoRecovering = false;
    }
    try {
      await connectToRoomAndEnsureAvatar({
        loadingMessage: AVATAR_RECONNECTING_STATUS,
        allowAutoRecovery: options.allowAutoRecovery,
        autoRecoveryAttemptsRemaining: options.autoRecoveryAttemptsRemaining,
      });
    } finally {
      avatarSessionAutoRecovering = restoreAutoRecovering;
    }
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
  resetVoiceTranscriptDeduplication();
  setAvatarConnectionState("idle");
  updateAvatarUiState();
  updateRoomButtons();
  updateChatControls();
  clearChatLog();
  setChatStatus("Start a session to use text chat.");

  let sessionOutput;
  if (!session?.roomName) {
    sessionOutput = { action: "session-stopped" };
  } else {
    try {
      await requestJson("/plugins/video-chat/api/session/stop", {
        method: "POST",
        body: JSON.stringify({ roomName: session.roomName }),
      });
      sessionOutput = { action: "session-stopped", roomName: session.roomName };
    } catch (error) {
      sessionOutput = {
        action: "session-stop-failed",
        roomName: session.roomName,
        error: String(error),
      };
    }
  }

  setOutput(sessionOutput);

  try {
    await stopVideoChatSidecarForSession();
    setOutput({
      ...sessionOutput,
      sidecar: {
        stopped: true,
      },
    });
  } catch (error) {
    setOutput({
      ...sessionOutput,
      sidecar: {
        stopped: false,
        error: String(error),
      },
    });
  }
}

async function stopVideoChatSidecarForSession() {
  await stopVideoChatSidecar();
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
  for (const name of setupSecretFieldNames) {
    const field = setupForm.elements.namedItem(name);
    if (!field || typeof field.value !== "string") {
      continue;
    }
    field.value = getStoredSetupSecretValue(setup, name);
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
  updateSensitiveFieldMasking(setup);
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
  cacheSetupSecretValues(payload.setup);
  const sanitizedSetup = sanitizeSetupStatusForClient(payload.setup);
  if (statusEl) {
    statusEl.textContent = setupStatusLabel(sanitizedSetup);
  }
  latestSetupStatus = sanitizedSetup;
  setGatewayHealthStatus("ok", "OK");
  updateKeysHealthFromSetup(sanitizedSetup);
  populateSetupFormFromSetupStatus(sanitizedSetup);
  secretVisibilityState.clear();
  syncSetupEditorsFromCurrentForm();
  setOutput({ action: "setup-saved", setup: sanitizedSetup });
  return payload;
}

async function refreshSetupStatus() {
  if (!hasGatewayToken()) {
    latestSetupStatus = null;
    storedSetupSecretValues.clear();
    secretVisibilityState.clear();
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
    const [payload] = await Promise.all([
      requestJson("/plugins/video-chat/api/setup"),
      refreshOpenClawCompatibility(),
    ]);
    cacheSetupSecretValues(payload.setup);
    const sanitizedSetup = sanitizeSetupStatusForClient(payload.setup);
    latestSetupStatus = sanitizedSetup;
    if (statusEl) {
      statusEl.textContent = setupStatusLabel(sanitizedSetup);
    }
    setGatewayHealthStatus("ok", "OK");
    updateKeysHealthFromSetup(sanitizedSetup);
    populateSetupFormFromSetupStatus(sanitizedSetup);
    syncSetupEditorsFromCurrentForm();
  } catch (error) {
    latestSetupStatus = null;
    storedSetupSecretValues.clear();
    secretVisibilityState.clear();
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
    input.addEventListener("input", () => {
      updateSetupSaveButtonState();
    });
  }
  for (const button of sensitiveFieldCopyButtons) {
    button.addEventListener("click", async () => {
      const fieldName = button.getAttribute("data-copy-secret");
      if (!fieldName || !setupForm) {
        return;
      }
      const input = setupForm.elements.namedItem(fieldName);
      if (!input || typeof input.value !== "string") {
        return;
      }
      const inputValue = normalizeOptionalInputValue(input.value);
      const value = isRedactedSecretValue(inputValue)
        ? getStoredSetupSecretValue(latestSetupStatus, fieldName)
        : inputValue;
      if (!value) {
        return;
      }
      try {
        await copyTextToClipboard(value);
        flashCopyButton(button);
      } catch (error) {
        setOutput({ action: "secret-copy-failed", error: String(error) });
      }
    });
  }
  for (const button of sensitiveFieldVisibilityButtons) {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    button.addEventListener("click", () => {
      const fieldName = button.getAttribute("data-toggle-secret-visibility");
      if (!fieldName || !setupForm) {
        return;
      }
      if (secretVisibilityState.has(fieldName)) {
        secretVisibilityState.delete(fieldName);
      } else {
        secretVisibilityState.add(fieldName);
      }
      updateSensitiveFieldMasking(latestSetupStatus);
    });
  }

  setupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = buildSetupPayloadFromForm();
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
      setAvatarLoadingState(true, "Restarting Claw Cast worker...");
      await restartVideoChatSidecar();
      const payload = await requestJson("/plugins/video-chat/api/session", {
        method: "POST",
        body: JSON.stringify(buildSessionCreatePayload(sessionKey)),
      });
      activeSession = payload.session;
      resetVoiceTranscriptDeduplication();
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
      await connectToRoomAndEnsureAvatar({
        loadingMessage: SESSION_STARTING_STATUS,
      });
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

if (startInPictureInPictureCheckbox) {
  startInPictureInPictureCheckbox.addEventListener("change", () => {
    avatarAutoStartInPictureInPicture = startInPictureInPictureCheckbox.checked;
    persistBooleanPreference(AVATAR_AUTO_START_IN_PIP_STORAGE_KEY, avatarAutoStartInPictureInPicture);
  });
}

if (interruptAgentSpeechCheckbox) {
  interruptAgentSpeechCheckbox.addEventListener("change", () => {
    avatarInterruptReplyOnNewMessage = interruptAgentSpeechCheckbox.checked;
    persistBooleanPreference(
      AVATAR_INTERRUPT_REPLY_ON_NEW_MESSAGE_STORAGE_KEY,
      avatarInterruptReplyOnNewMessage,
    );
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
      await connectToRoomAndEnsureAvatar({
        loadingMessage: SESSION_STARTING_STATUS,
      });
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
  const sourceInput = isTextAreaElement(options.sourceInput) ? options.sourceInput : null;
  const sourceComposer = normalizeChatComposerKey(options.sourceComposer);
  const composerDraft = getChatComposerDraft(sourceComposer);
  const sourceAttachmentsContainer = getChatComposerAttachmentsContainer(sourceComposer);
  const attachments = composerDraft.attachments.map((attachment) => ({ ...attachment }));
  const hasAttachments = attachments.length > 0;
  if (!message && attachments.length === 0) {
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
  const rpcAttachments = hasAttachments ? buildChatSendAttachments(attachments) : [];
  setChatPaneOpen(true);
  appendChatLine(
    "user",
    hasAttachments
      ? {
          text: message,
          images: attachments.map((attachment) => ({
            url: attachment.dataUrl,
            alt: attachment.name || "Pasted image",
          })),
        }
      : message,
    { awaitingReply: true },
  );
  animateAvatarSentMessage(message, {
    sourceInput,
    sourceAttachmentsContainer: hasAttachments ? sourceAttachmentsContainer : null,
  });
  setChatComposerInputValue(sourceInput, "");
  clearChatComposerAttachments(sourceComposer);
  syncAvatarDocumentPictureInPictureChatComposer();
  setChatStatus("Sending message...");

  try {
    await ensureGatewaySocketConnected();
    const payload = await requestJson("/plugins/video-chat/api/chat/send", {
      method: "POST",
      body: JSON.stringify({
        sessionKey,
        message,
        ...(rpcAttachments.length > 0 ? { attachments: rpcAttachments } : {}),
        idempotencyKey,
      }),
    });
    const response = payload?.response ?? {};
    setOutput({ action: "chat-sent", sessionKey, response });
    setChatStatus("Awaiting agent reply...");
    return true;
  } catch (error) {
    setChatComposerInputValue(sourceInput, message);
    composerDraft.attachments.push(...attachments);
    renderChatComposerAttachments();
    syncAvatarDocumentPictureInPictureChatComposer();
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
    syncChatComposerUi();
  });

  chatInput.addEventListener("paste", (event) => {
    void addChatComposerAttachmentsFromClipboardEvent(event, "main").catch((error) => {
      setChatStatus(error instanceof Error ? error.message : "Failed to paste image.");
    });
  });

  chatInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) {
      return;
    }
    event.preventDefault();
    chatForm?.requestSubmit();
  });
}

if (chatAttachButton && chatFileInput) {
  chatAttachButton.addEventListener("click", () => {
    if (chatAttachButton.disabled) {
      return;
    }
    chatFileInput.click();
  });
}

if (chatFileInput) {
  chatFileInput.addEventListener("change", () => {
    void addChatComposerAttachments(chatFileInput.files || [], "main", {
      sourceLabel: "Image",
    }).finally(() => {
      chatFileInput.value = "";
    });
  });
}

if (chatComposerInputEl) {
  chatComposerInputEl.addEventListener("dragenter", (event) => {
    if (!activeSession) {
      return;
    }
    event.preventDefault();
    chatComposerInputEl.classList.add("agent-chat__input--dragover");
  });

  chatComposerInputEl.addEventListener("dragover", (event) => {
    if (!activeSession) {
      return;
    }
    event.preventDefault();
    chatComposerInputEl.classList.add("agent-chat__input--dragover");
  });

  chatComposerInputEl.addEventListener("dragleave", (event) => {
    const nextTarget = event.relatedTarget;
    if (!(nextTarget instanceof Node) || !chatComposerInputEl.contains(nextTarget)) {
      chatComposerInputEl.classList.remove("agent-chat__input--dragover");
    }
  });

  chatComposerInputEl.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    chatComposerInputEl.classList.remove("agent-chat__input--dragover");
    if (!activeSession) {
      return;
    }
    void addChatComposerAttachments(event.dataTransfer?.files || [], "main", {
      sourceLabel: "Dropped image",
    }).catch((error) => {
      setChatStatus(error instanceof Error ? error.message : "Failed to attach dropped image.");
    });
  });
}

if (chatForm) {
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitChatMessage(chatInput?.value, { sourceInput: chatInput, sourceComposer: "main" });
  });
}

if (reloadButton) {
  reloadButton.addEventListener("click", () => {
    refreshSetupStatus().catch(() => {});
  });
}

if (configCancelButton) {
  configCancelButton.addEventListener("click", () => {
    tokenVisible = false;
    if (tokenInput) {
      tokenInput.value = getGatewayToken();
    }
    if (activeConfigMode === "raw") {
      if (setupRawInput) {
        setupRawInput.value = setupRawBaseline;
      }
      setSetupRawError("");
      restoreSetupFormBaseline();
      syncFormFromRaw();
    } else {
      restoreSetupFormBaseline();
      syncRawFromForm();
    }
    updateTokenFieldMasking();
    updateSetupSaveButtonState();
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
  tokenInput.addEventListener("input", () => {
    updateTokenFieldMasking();
  });
}

if (copyTokenButton) {
  copyTokenButton.addEventListener("click", async () => {
    try {
      await copyTextToClipboard(String(tokenInput?.value || getGatewayToken() || ""));
      flashCopyButton(copyTokenButton);
    } catch (error) {
      setOutput({ action: "gateway-token-copy-failed", error: String(error) });
    }
  });
}

if (toggleTokenVisibilityButton) {
  toggleTokenVisibilityButton.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  toggleTokenVisibilityButton.addEventListener("click", () => {
    tokenVisible = !tokenVisible;
    updateTokenFieldMasking();
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
    tokenVisible = false;
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
renderChatComposerAttachments();
clearChatLog();
updateAvatarUiState();

async function initializeGatewaySetupState() {
  await bootstrapGatewayTokenFromServer();
  if (tokenInput) {
    tokenInput.value = getGatewayToken();
  }
  updateTokenFieldMasking();
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
}

initializeGatewaySetupState().catch(() => {
  updateRoomStatusState();
});
