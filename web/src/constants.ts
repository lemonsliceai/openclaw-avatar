// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

export const OPENCLAW_SETTINGS_STORAGE_KEY = "openclaw.control.settings.v1";
export const LEGACY_TOKEN_STORAGE_KEY = "avatar.gatewayToken";
export const THEME_STORAGE_KEY = "avatar.themePreference";
export const NAV_COLLAPSE_STORAGE_KEY = "avatar.navCollapsed";
export const CHAT_PANE_STORAGE_KEY = "avatar.chatPaneOpen";
export const CHAT_PANE_WIDTH_STORAGE_KEY = "avatar.chatPaneWidth";
export const CHAT_PANE_WIDTH_CSS_VARIABLE = "--chat-pane-width";
export const MIC_MUTED_STORAGE_KEY = "avatar.microphoneMuted";
export const AVATAR_SPEAKER_MUTED_STORAGE_KEY = "avatar.avatarSpeakerMuted";
export const AVATAR_AUTO_START_IN_PIP_STORAGE_KEY = "avatar.avatarAutoStartInPictureInPicture";
export const SESSION_IMAGE_URL_STORAGE_KEY = "avatar.sessionImageUrl";
export const SESSION_AVATAR_TIMEOUT_SECONDS_STORAGE_KEY = "avatar.sessionAvatarTimeoutSeconds";
export const AVATAR_PANE_WIDTH_STORAGE_KEY = "avatar.avatarPaneWidth";
export const AVATAR_DEBUG_LOGGING_STORAGE_KEY = "avatar.debugLogging";

// ---------------------------------------------------------------------------
// Paths & URLs
// ---------------------------------------------------------------------------

export const AVATAR_PLUGIN_BASE_PATH = "/plugins/openclaw-avatar";
export const DEFAULT_SESSION_IMAGE_URL =
  "https://e9riw81orx.ufs.sh/f/z2nBEp3YISrtPNwLc0haBifGpR5UHA49jYDwQzbvS3mgVqLM";
export const AVATAR_PIP_END_CALL_ICON_URL =
  "https://unpkg.com/lucide-static@0.321.0/icons/phone-off.svg";

// ---------------------------------------------------------------------------
// Redaction sentinels
// ---------------------------------------------------------------------------

export const REDACTED_SECRET_VALUE = "_REDACTED_";
export const OPENCLAW_REDACTED_SECRET_VALUE = "__OPENCLAW_REDACTED__";

// ---------------------------------------------------------------------------
// Gateway protocol
// ---------------------------------------------------------------------------

export const GATEWAY_PROTOCOL_VERSION = 3;
export const GATEWAY_WS_CLIENT = {
  id: "test",
  version: "avatar-plugin-ui",
  platform: "web",
  mode: "test",
} as const;
export const GATEWAY_WS_SCOPES: readonly string[] = ["operator.read", "operator.write"];

// ---------------------------------------------------------------------------
// Layout sizing
// ---------------------------------------------------------------------------

export const CHAT_PANE_MIN_WIDTH = 300;
export const CHAT_PANE_MAX_WIDTH = 640;
export const AVATAR_PANE_WIDTH_CSS_VARIABLE = "--avatar-pane-width";
export const AVATAR_PANE_MIN_WIDTH = 0;
export const AVATAR_PANE_MAX_WIDTH = 1200;

// ---------------------------------------------------------------------------
// Debug logging
// ---------------------------------------------------------------------------

export const AVATAR_DEBUG_LOGGING = false;
export const AVATAR_DEBUG_LOGGING_QUERY_PARAM = "avatarDebug";

// ---------------------------------------------------------------------------
// Avatar PiP
// ---------------------------------------------------------------------------

export const AVATAR_PIP_DEFAULT_ASPECT_RATIO = 16 / 9;
export const AVATAR_PIP_HORIZONTAL_PADDING = 20;
export const AVATAR_PIP_VERTICAL_PADDING = 20;
export const AVATAR_PIP_TOOLBAR_HEIGHT = 72;
export const AVATAR_PIP_MAX_VIDEO_HEIGHT = 560;

// ---------------------------------------------------------------------------
// Avatar identity & join
// ---------------------------------------------------------------------------

export const AVATAR_PARTICIPANT_IDENTITY = "lemonslice-avatar-agent";
export const AVATAR_JOIN_TIMEOUT_ERROR_CODE = "AVATAR_JOIN_TIMEOUT";
export const AVATAR_JOIN_TIMEOUT_MS = 12_000;
export const AVATAR_JOIN_PROGRESS_GRACE_MS = 12_000;
export const AVATAR_JOIN_MAX_TIMEOUT_MS = 45_000;

// ---------------------------------------------------------------------------
// Avatar session
// ---------------------------------------------------------------------------

export const SESSION_AVATAR_TIMEOUT_DEFAULT_SECONDS = 60;
export const SESSION_AVATAR_TIMEOUT_MIN_SECONDS = 1;
export const SESSION_AVATAR_TIMEOUT_MAX_SECONDS = 600;
export const AVATAR_STATUS_POLL_MS = 1_000;
export const AVATAR_STATUS_REQUEST_TIMEOUT_MS = 4_000;
export const AVATAR_AUTO_RECOVERY_MAX_ATTEMPTS = 3;
export const SESSION_STARTING_STATUS = "Starting session...";
export const AVATAR_LOADING_STATUS = "Avatar loading...";
export const AVATAR_RECONNECTING_STATUS = "Reconnecting avatar...";
export const AVATAR_AUTO_HELLO_MESSAGE = "hello";

// ---------------------------------------------------------------------------
// Voice / transcript events
// ---------------------------------------------------------------------------

export const VOICE_CHAT_RUN_ID_PREFIX = "avatar-agent-";
export const VOICE_TRANSCRIPT_EVENT_TOPIC = "avatar.user-transcript";
export const VOICE_TRANSCRIPT_EVENT_TYPE = "avatar.user-transcript";
export const AVATAR_CONTROL_EVENT_TOPIC = "avatar.avatar-control";
export const AVATAR_CONTROL_ACK_EVENT_TOPIC = "avatar.avatar-control-ack";
export const VOICE_TRANSCRIPT_DUPLICATE_WINDOW_MS = 5_000;
export const VOICE_TRANSCRIPT_DUPLICATE_MIN_LENGTH = 12;

// ---------------------------------------------------------------------------
// Avatar echo suppression
// ---------------------------------------------------------------------------

export const AVATAR_ECHO_RECENT_REPLY_RETENTION_MS = 30_000;
export const AVATAR_ECHO_ACTIVE_WINDOW_MS = 4_000;
export const SERVER_SPEECH_AVATAR_COOLDOWN_MS = 2_500;
export const AVATAR_ECHO_MIN_TRANSCRIPT_CHARS = 18;
export const AVATAR_ECHO_MIN_TRANSCRIPT_TOKENS = 4;
export const AVATAR_ECHO_TOKEN_OVERLAP_THRESHOLD = 0.8;
export const AVATAR_ECHO_MAX_RECENT_REPLIES = 4;

// ---------------------------------------------------------------------------
// OpenClaw compatibility
// ---------------------------------------------------------------------------

export const MINIMUM_COMPATIBLE_OPENCLAW_VERSION = "2026.3.22";
export const INCOMPATIBLE_OPENCLAW_VERSION_MESSAGE = "incompatible openclaw version";

// ---------------------------------------------------------------------------
// Server-side speech / VAD
// ---------------------------------------------------------------------------

export const SERVER_SPEECH_SAMPLE_RATE = 16_000;
export const SERVER_SPEECH_BUFFER_SIZE = 4_096;
export const SERVER_SPEECH_SILENCE_MS = 300;
export const SERVER_SPEECH_MIN_DURATION_MS = 120;
export const SERVER_SPEECH_MIN_RMS_THRESHOLD = 0.02;
export const SERVER_SPEECH_HIGH_PASS_COEFFICIENT = 0.97;
export const SERVER_SPEECH_HIGH_PASS_LEVEL_THRESHOLD = 0.012;
export const SERVER_SPEECH_NOISE_FLOOR_MULTIPLIER = 2.2;
export const SERVER_SPEECH_NOISE_FLOOR_RISE_SMOOTHING = 0.2;
export const SERVER_SPEECH_NOISE_FLOOR_FALL_SMOOTHING = 0.03;
export const SERVER_SPEECH_ZERO_CROSSING_MIN = 0.015;
export const SERVER_SPEECH_ZERO_CROSSING_MAX = 0.25;
export const SERVER_SPEECH_START_CONSECUTIVE_FRAMES = 2;
export const SERVER_SPEECH_MIN_VOICED_FRAMES = 3;
export const SERVER_SPEECH_MAX_PREROLL_CHUNKS = 3;
export const SERVER_SPEECH_MAX_CAPTURE_BYTES = 512 * 1024;
export const SERVER_SPEECH_CAPTURE_MIME_TYPES: readonly string[] = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
];
export const SERVER_SPEECH_TRANSCRIBE_REQUEST_TIMEOUT_MS = 20_000;
export const SERVER_SPEECH_START_RETRY_BASE_DELAY_MS = 500;
export const SERVER_SPEECH_START_RETRY_MAX_DELAY_MS = 4_000;
export const SERVER_SPEECH_START_RETRY_MAX_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Avatar interrupt
// ---------------------------------------------------------------------------

export const AVATAR_INTERRUPT_ACK_TIMEOUT_MS = 3_000;

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const CHAT_MAX_IMAGE_ATTACHMENTS = 4;
export const CHAT_MAX_IMAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const CHAT_JSON_RENDER_LIMIT = 20_000;
export const CHAT_TOKEN_ESTIMATE_MIN_CHARS = 100;
export const CHAT_SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
]);
export const CHAT_WELCOME_SUGGESTIONS: readonly string[] = [
  "What can you do?",
  "Help me test the avatar",
  "Summarize the latest exchange",
  "Give me a next step",
];
export const CHAT_INPUT_PLACEHOLDER_TEXT = "Type a message";

// ---------------------------------------------------------------------------
// Setup error routing
// ---------------------------------------------------------------------------

export const STRUCTURED_SETUP_ERROR_SECTION_MAP = new Map<string, string>([
  ["GATEWAY_UNAUTHORIZED", "gateway-token"],
  ["GATEWAY_TOKEN", "gateway-token"],
  ["LEMONSLICE", "lemonslice"],
  ["LIVEKIT", "livekit"],
]);

export const STRUCTURED_SETUP_ERROR_FIELD_MAP = new Map<string, string>([
  ["gatewayToken", "gateway-token"],
  ["gatewayPassword", "gateway-token"],
  ["lemonSliceApiKey", "lemonslice"],
  ["livekitUrl", "livekit"],
  ["livekitApiKey", "livekit"],
  ["livekitApiSecret", "livekit"],
]);

// ---------------------------------------------------------------------------
// Aspect ratios (re-exported from avatar module)
// ---------------------------------------------------------------------------

export const AVATAR_ASPECT_RATIOS = Object.freeze(["2x3", "3x2", "9x16", "16x9"] as const);
export type AvatarAspectRatio = (typeof AVATAR_ASPECT_RATIOS)[number];
export const AVATAR_ASPECT_RATIO_DEFAULT: AvatarAspectRatio = "3x2";
export const SESSION_AVATAR_ASPECT_RATIOS = new Set<AvatarAspectRatio>(AVATAR_ASPECT_RATIOS);

// ---------------------------------------------------------------------------
// Runtime globals (from third-party scripts loaded by the host page)
// ---------------------------------------------------------------------------

export const LIVEKIT =
  (globalThis as Record<string, unknown>).LivekitClient ??
  (globalThis as Record<string, unknown>).livekitClient ??
  null;

// SpeechRecognition is only available in some browsers and not in the default
// DOM lib typings. We use a minimal interface to avoid pulling in extra type
// packages. Downstream consumers that interact with the API should cast as
// needed or augment the global type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const BROWSER_SPEECH_RECOGNITION: (new () => any) | null =
  ((globalThis as Record<string, unknown>).SpeechRecognition as (new () => unknown) | null) ??
  ((globalThis as Record<string, unknown>).webkitSpeechRecognition as (new () => unknown) | null) ??
  null;
