/**
 * Centralized application state.
 *
 * Every mutable global from the legacy `web/app.js` is mapped into one of the
 * domain-specific sub-objects below. Modules read and write state through
 * this single import rather than reaching into shared top-level variables.
 *
 * The store is intentionally a plain object — no framework, no proxy magic.
 * If downstream modules need change notifications we can add a lightweight
 * emitter later without changing the shape.
 */

import type { AvatarAspectRatio } from "./constants.js";
import {
  AVATAR_ASPECT_RATIO_DEFAULT,
  LIVEKIT,
  MINIMUM_COMPATIBLE_OPENCLAW_VERSION,
  SESSION_AVATAR_TIMEOUT_DEFAULT_SECONDS,
} from "./constants.js";
import type {
  AvatarConnectionState,
  AvatarDocumentPipElements,
  AvatarMessageOverlayState,
  ChatComposerDraft,
  ChatMessage,
  ConfigMode,
  DebugLogEntry,
  GatewayPendingRequest,
  OpenClawCompatibility,
  RecentAvatarReply,
  RoomConnectionState,
  SetupFormBaseline,
  SetupStatus,
  ThemePreference,
} from "./types.js";

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------

export interface GatewayState {
  socket: WebSocket | null;
  socketReady: boolean;
  handshakePromise: Promise<unknown> | null;
  handshakeError: unknown;
  connectRequestId: string | null;
  requestCounter: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectBackoffActive: boolean;
  authModeBootstrapReady: boolean;
  authModeBootstrapError: unknown;
  authModeBootstrapPromise: Promise<unknown> | null;
  pendingRequests: Map<string, GatewayPendingRequest>;
}

// ---------------------------------------------------------------------------
// Room / LiveKit
// ---------------------------------------------------------------------------

export interface RoomState {
  activeRoom: unknown;
  localAudioTrack: unknown;
  localAudioTrackPublished: boolean;
  connectGeneration: number;
  connectionState: RoomConnectionState;
  avatarConnectionState: AvatarConnectionState;
  activeAvatarParticipantIdentity: string;
  avatarSpeechActive: boolean;
  avatarSpeechLastDetectedAt: number;
  recentAvatarReplies: RecentAvatarReply[];
  avatarSessionAutoRecovering: boolean;
  avatarLoadPending: boolean;
  avatarLoadMessage: string;
}

// ---------------------------------------------------------------------------
// Media / mic / speaker
// ---------------------------------------------------------------------------

export interface MediaState {
  preferredMicMuted: boolean;
  avatarSpeakerMuted: boolean;
  avatarMutedForPendingChatReply: boolean;
}

// ---------------------------------------------------------------------------
// Avatar interrupt
// ---------------------------------------------------------------------------

export interface AvatarInterruptState {
  pending: boolean;
  ackTimer: ReturnType<typeof setTimeout> | null;
  voiceTranscriptionPending: boolean;
}

// ---------------------------------------------------------------------------
// Avatar PiP
// ---------------------------------------------------------------------------

export interface AvatarPipState {
  autoStartInPictureInPicture: boolean;
  documentPictureInPictureWindow: Window | null;
  documentPictureInPictureCleanup: (() => void) | null;
  documentPictureInPictureElements: AvatarDocumentPipElements | null;
  pictureInPictureVideo: HTMLVideoElement | null;
  messageOverlayState: AvatarMessageOverlayState;
}

// ---------------------------------------------------------------------------
// Speech — browser recognition
// ---------------------------------------------------------------------------

export interface BrowserSpeechState {
  recognition: unknown;
  active: boolean;
  shouldRun: boolean;
  restartTimer: ReturnType<typeof setTimeout> | null;
}

// ---------------------------------------------------------------------------
// Speech — server-side transcription
// ---------------------------------------------------------------------------

export interface ServerSpeechState {
  audioContext: AudioContext | null;
  sourceNode: MediaStreamAudioSourceNode | null;
  processorNode: ScriptProcessorNode | null;
  silenceNode: GainNode | null;
  captureTrack: MediaStreamTrack | null;
  mediaRecorder: MediaRecorder | null;
  mimeType: string;
  captureSource: string;
  roomTrackMuted: boolean;
  captureError: string;
  discardNextCapture: boolean;
  encodedChunks: Blob[];
  pendingFallbackWavBytes: Uint8Array | null;
  pendingTranscriptRequest: Promise<unknown> | null;
  queuedTranscriptRequest: Promise<unknown> | null;
  startPromise: Promise<unknown> | null;
  drainPromise: Promise<unknown> | null;
  resolveDrainPromise: (() => void) | null;
  speechActive: boolean;
  speechStartedAt: number;
  silenceStartedAt: number;
  pcmChunks: Float32Array[];
  pcmByteLength: number;
  prerollChunks: Float32Array[];
  speechFrameStreak: number;
  voicedFrameCount: number;
  bargeInActive: boolean;
  noiseFloor: number;
  vadPrevInput: number;
  vadPrevOutput: number;
  submissionQueue: Promise<void>;
  startRetryTimer: ReturnType<typeof setTimeout> | null;
  startRetryCount: number;
}

// ---------------------------------------------------------------------------
// Voice transcript deduplication
// ---------------------------------------------------------------------------

export interface VoiceTranscriptState {
  lastByConnection: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface SessionState {
  active: unknown;
  imageUrl: string;
  aspectRatio: AvatarAspectRatio;
  avatarJoinTimeoutMs: number;
  autoHelloSentSessionKeys: Set<string>;
  autoHelloPendingSessionKeys: Set<string>;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface ChatState {
  messages: ChatMessage[];
  composerDrafts: Record<string, ChatComposerDraft>;
  awaitingReply: boolean;
  renderQueued: boolean;
  renderScrollToBottom: boolean;
  composerAttachmentIdCounter: number;
  renderedVoiceUserRuns: Set<string>;
}

// ---------------------------------------------------------------------------
// Setup / config UI
// ---------------------------------------------------------------------------

export interface SetupState {
  latestSetupStatus: SetupStatus | null;
  openClawCompatibility: OpenClawCompatibility;
  activeConfigSectionFilter: string;
  activeConfigMode: ConfigMode;
  formBaseline: SetupFormBaseline;
  rawBaseline: string;
  tokenVisible: boolean;
  secretVisibilityState: Set<string>;
  storedSetupSecretValues: Map<string, string>;
}

// ---------------------------------------------------------------------------
// UI / theme
// ---------------------------------------------------------------------------

export interface UiState {
  activeThemePreference: ThemePreference;
}

// ---------------------------------------------------------------------------
// Debug
// ---------------------------------------------------------------------------

export interface DebugState {
  logEntries: DebugLogEntry[];
  assistantMetadataBackfillTimers: Map<string, ReturnType<typeof setTimeout>>;
}

// ---------------------------------------------------------------------------
// Root application state
// ---------------------------------------------------------------------------

export interface AppState {
  gateway: GatewayState;
  room: RoomState;
  media: MediaState;
  avatarInterrupt: AvatarInterruptState;
  avatarPip: AvatarPipState;
  browserSpeech: BrowserSpeechState;
  serverSpeech: ServerSpeechState;
  voiceTranscript: VoiceTranscriptState;
  session: SessionState;
  chat: ChatState;
  setup: SetupState;
  ui: UiState;
  debug: DebugState;
}

// ---------------------------------------------------------------------------
// Initial state factory
// ---------------------------------------------------------------------------

export function createInitialState(): AppState {
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
      pendingRequests: new Map(),
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
      avatarLoadMessage: "",
    },

    media: {
      preferredMicMuted: false,
      avatarSpeakerMuted: false,
      avatarMutedForPendingChatReply: false,
    },

    avatarInterrupt: {
      pending: false,
      ackTimer: null,
      voiceTranscriptionPending: false,
    },

    avatarPip: {
      autoStartInPictureInPicture: true,
      documentPictureInPictureWindow: null,
      documentPictureInPictureCleanup: null,
      documentPictureInPictureElements: null,
      pictureInPictureVideo: null,
      messageOverlayState: {
        fadeFrame: null,
        hideTimer: null,
      },
    },

    browserSpeech: {
      recognition: null,
      active: false,
      shouldRun: false,
      restartTimer: null,
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
      startRetryCount: 0,
    },

    voiceTranscript: {
      lastByConnection: new Map(),
    },

    session: {
      active: null,
      imageUrl: "",
      aspectRatio: AVATAR_ASPECT_RATIO_DEFAULT,
      avatarJoinTimeoutMs: SESSION_AVATAR_TIMEOUT_DEFAULT_SECONDS * 1000,
      autoHelloSentSessionKeys: new Set(),
      autoHelloPendingSessionKeys: new Set(),
    },

    chat: {
      messages: [],
      composerDrafts: {
        main: { attachments: [] },
        pip: { attachments: [] },
      },
      awaitingReply: false,
      renderQueued: false,
      renderScrollToBottom: false,
      composerAttachmentIdCounter: 0,
      renderedVoiceUserRuns: new Set(),
    },

    setup: {
      latestSetupStatus: null,
      openClawCompatibility: {
        version: null,
        minimumCompatibleVersion: MINIMUM_COMPATIBLE_OPENCLAW_VERSION,
        compatible: null,
      },
      activeConfigSectionFilter: "all",
      activeConfigMode: "form",
      formBaseline: {
        livekitUrl: "",
        lemonSliceApiKey: "",
        livekitApiKey: "",
        livekitApiSecret: "",
      },
      rawBaseline: "",
      tokenVisible: false,
      secretVisibilityState: new Set(),
      storedSetupSecretValues: new Map(),
    },

    ui: {
      activeThemePreference: "system",
    },

    debug: {
      logEntries: [],
      assistantMetadataBackfillTimers: new Map(),
    },
  };
}

// ---------------------------------------------------------------------------
// Singleton instance — the single source of truth for the running app.
// ---------------------------------------------------------------------------

export const state: AppState = createInitialState();
