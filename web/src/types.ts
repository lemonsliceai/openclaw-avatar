import type { AvatarAspectRatio } from "./constants.js";

// ---------------------------------------------------------------------------
// Gateway auth
// ---------------------------------------------------------------------------

export type GatewayAuthMode = "token" | "password" | "trusted-proxy" | "none";

export interface GatewayAuthState {
  mode: GatewayAuthMode;
  secret: string;
}

// ---------------------------------------------------------------------------
// Gateway WebSocket
// ---------------------------------------------------------------------------

export type GatewayConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface GatewayWsClient {
  readonly id: string;
  readonly version: string;
  readonly platform: string;
  readonly mode: string;
}

export interface GatewayPendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

// ---------------------------------------------------------------------------
// Room / LiveKit
// ---------------------------------------------------------------------------

export type RoomConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export type AvatarConnectionState =
  | "idle"
  | "starting"
  | "loading"
  | "connected"
  | "connecting"
  | "disconnected"
  | "reconnecting"
  | "error";

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface SessionConfig {
  imageUrl: string;
  aspectRatio: AvatarAspectRatio;
  avatarJoinTimeoutMs: number;
  avatarTimeoutSeconds: number;
  startInPictureInPicture: boolean;
}

export interface SessionCreatePayload {
  sessionKey: string;
  imageUrl: string;
  aspectRatio: AvatarAspectRatio;
  avatarJoinTimeoutMs: number;
  avatarTimeoutSeconds: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// OpenClaw compatibility
// ---------------------------------------------------------------------------

export interface OpenClawCompatibility {
  version: string | null;
  minimumCompatibleVersion: string;
  compatible: boolean | null;
}

// ---------------------------------------------------------------------------
// Setup / config
// ---------------------------------------------------------------------------

export type ConfigMode = "form" | "raw";
export type ConfigSectionFilter = "all" | string;

export interface SetupFormBaseline {
  livekitUrl: string;
  lemonSliceApiKey: string;
  livekitApiKey: string;
  livekitApiSecret: string;
}

export type SetupSectionKey = "gateway-token" | "lemonslice" | "livekit";

export interface SetupStatus {
  configured: boolean;
  missing?: string[];
  serverMode?: string;
  livekitUrl?: string;
  lemonSliceApiKey?: string;
  livekitApiKey?: string;
  livekitApiSecret?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export type ChatRole = "user" | "assistant" | "system" | "error";

export interface ChatAttachment {
  id: string;
  file: File | Blob;
  name: string;
  mimeType: string;
  dataUrl: string;
}

export interface ChatMessageImageSource {
  type: "base64";
  media_type: string;
  data: string;
}

export interface ChatMessageContentBlock {
  type: string;
  text?: string;
  source?: ChatMessageImageSource;
  image_url?: { url: string };
  [key: string]: unknown;
}

export interface ChatMessage {
  role: ChatRole;
  text: string;
  content?: ChatMessageContentBlock[];
  runId?: string;
  streaming?: boolean;
  timestamp?: number;
  idempotencyKey?: string;
  usage?: ChatMessageUsage;
  images?: string[];
}

export interface ChatMessageUsage {
  input_tokens?: number;
  output_tokens?: number;
}

export interface ChatComposerDraft {
  attachments: ChatAttachment[];
}

export type ChatComposerKey = "main" | "pip";

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export type ThemePreference = "light" | "dark" | "system";
export type AppliedTheme = "light" | "dark";

// ---------------------------------------------------------------------------
// Speech / VAD
// ---------------------------------------------------------------------------

export interface SpeechMetrics {
  rms: number;
  highPassLevel: number;
  zeroCrossingRate: number;
}

export interface RecentAvatarReply {
  text: string;
  tokens: string[];
  at: number;
}

// ---------------------------------------------------------------------------
// Avatar message overlay
// ---------------------------------------------------------------------------

export interface AvatarMessageOverlayState {
  fadeFrame: number | null;
  hideTimer: ReturnType<typeof setTimeout> | null;
}

// ---------------------------------------------------------------------------
// Avatar PiP
// ---------------------------------------------------------------------------

export interface AvatarDocumentPipElements {
  root: HTMLElement;
  video: HTMLVideoElement | null;
  chatInput: HTMLTextAreaElement | null;
  chatForm: HTMLFormElement | null;
  chatAttachments: HTMLElement | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Debug log
// ---------------------------------------------------------------------------

export interface DebugLogEntry {
  event: string;
  timestamp: number;
  details: Record<string, unknown>;
}
