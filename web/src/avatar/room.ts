/**
 * LiveKit room connection, participant tracking, and track management.
 *
 * Extracted from `web/app.js` room-related functions (~1,500 lines).
 * UI updates are delegated via callbacks; LiveKit API is accessed through
 * the LIVEKIT global.
 */

import { AVATAR_JOIN_TIMEOUT_ERROR_CODE, AVATAR_PARTICIPANT_IDENTITY } from "../constants.js";
import { state } from "../state.js";
import type { AvatarConnectionState } from "../types.js";

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

export interface RoomCallbacks {
  onOutput: (detail: Record<string, unknown>) => void;
  onAvatarConnected: () => void;
  onAvatarDisconnected: () => void;
  onUpdateUi: () => void;
  onDataMessage: (payload: unknown, topic: unknown) => void;
}

let callbacks: RoomCallbacks = {
  onOutput: () => {},
  onAvatarConnected: () => {},
  onAvatarDisconnected: () => {},
  onUpdateUi: () => {},
  onDataMessage: () => {},
};

export function setRoomCallbacks(cb: Partial<RoomCallbacks>): void {
  callbacks = { ...callbacks, ...cb };
}

// ---------------------------------------------------------------------------
// Participant identity helpers
// ---------------------------------------------------------------------------

export function isAvatarParticipantIdentity(participantIdentity: unknown): boolean {
  const normalized = typeof participantIdentity === "string" ? participantIdentity.trim() : "";
  if (!normalized) return false;
  if (normalized === AVATAR_PARTICIPANT_IDENTITY) return true;
  if (
    state.room.activeAvatarParticipantIdentity &&
    normalized === state.room.activeAvatarParticipantIdentity
  )
    return true;
  return false;
}

export function rememberAvatarParticipantIdentity(participantIdentity: string): void {
  const normalized = typeof participantIdentity === "string" ? participantIdentity.trim() : "";
  if (!normalized) return;
  state.room.activeAvatarParticipantIdentity = normalized;
}

export function clearAvatarParticipantIdentity(): void {
  state.room.activeAvatarParticipantIdentity = "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function shouldTreatParticipantAsAvatar(participant: any): boolean {
  const identity = typeof participant?.identity === "string" ? participant.identity.trim() : "";
  if (!identity) return false;
  if (isAvatarParticipantIdentity(identity)) return true;
  if (identity.toLowerCase().startsWith("control-ui-")) return false;
  return false;
}

// ---------------------------------------------------------------------------
// Speech state helpers
// ---------------------------------------------------------------------------

export function setAvatarSpeechActive(nextValue: boolean): void {
  const prev = state.room.avatarSpeechActive;
  state.room.avatarSpeechActive = Boolean(nextValue);
  if (state.room.avatarSpeechActive) {
    state.room.avatarSpeechLastDetectedAt = Date.now();
  }
  if (prev !== state.room.avatarSpeechActive) {
    callbacks.onUpdateUi();
  }
}

export function clearAvatarSpeechActivity(): void {
  state.room.avatarSpeechActive = false;
}

export function syncAvatarSpeechStateFromSpeakers(speakers: unknown[]): void {
  const participants = Array.isArray(speakers) ? speakers : [];
  const avatarSpeaking = participants.some((p) => shouldTreatParticipantAsAvatar(p));
  setAvatarSpeechActive(avatarSpeaking);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function refreshAvatarSpeechState(room: any = state.room.activeRoom): void {
  if (!room) {
    clearAvatarSpeechActivity();
    return;
  }
  syncAvatarSpeechStateFromSpeakers(room.activeSpeakers);
}

// ---------------------------------------------------------------------------
// Media element helpers
// ---------------------------------------------------------------------------

export function isVideoElement(value: unknown): value is HTMLVideoElement {
  return Boolean(value && typeof value === "object" && (value as HTMLElement).tagName === "VIDEO");
}

export function isMediaElement(value: unknown): value is HTMLVideoElement | HTMLAudioElement {
  return Boolean(
    value &&
      typeof value === "object" &&
      ((value as HTMLElement).tagName === "VIDEO" || (value as HTMLElement).tagName === "AUDIO"),
  );
}

// ---------------------------------------------------------------------------
// Avatar video
// ---------------------------------------------------------------------------

export function getAvatarVideoElement(
  avatarMediaEl: HTMLElement | null = null,
): HTMLVideoElement | null {
  return avatarMediaEl?.querySelector("video") ?? null;
}

export function hasAvatarVideo(avatarMediaEl: HTMLElement | null = null): boolean {
  return Boolean(getAvatarVideoElement(avatarMediaEl));
}

// ---------------------------------------------------------------------------
// Room participant check
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hasAvatarParticipantInRoom(room: any = state.room.activeRoom): boolean {
  if (!room?.remoteParticipants?.values) return false;
  for (const participant of room.remoteParticipants.values()) {
    if (shouldTreatParticipantAsAvatar(participant)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Join timeout error
// ---------------------------------------------------------------------------

export function createAvatarJoinTimeoutError(message: string): Error & { code?: string } {
  const error: Error & { code?: string } = new Error(message);
  error.name = "AvatarJoinTimeoutError";
  error.code = AVATAR_JOIN_TIMEOUT_ERROR_CODE;
  return error;
}

export function isAvatarJoinTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error as Error & { code?: string }).code === AVATAR_JOIN_TIMEOUT_ERROR_CODE ||
      error.name === "AvatarJoinTimeoutError")
  );
}

// ---------------------------------------------------------------------------
// Backend progress description
// ---------------------------------------------------------------------------

export function hasAvatarBackendProgress(status: Record<string, unknown> | null): boolean {
  return Boolean(
    status &&
      typeof status === "object" &&
      (status.jobAcceptedAt ||
        status.agentSessionConnectedAt ||
        status.avatarStartBeginAt ||
        status.avatarStartConnectedAt ||
        status.gatewayChatFinalAt ||
        status.speechBeginAt ||
        status.speechFinishedAt),
  );
}

export function describeAvatarSessionProgress(status: Record<string, unknown> | null): string {
  if (!status || typeof status !== "object") return "";
  if (status.speechFailedAt) {
    return status.speechError
      ? `Avatar speech failed on the worker: ${status.speechError}`
      : "Avatar speech failed on the worker.";
  }
  if (status.speechBeginAt && !status.speechFinishedAt)
    return "Avatar started speaking. Waiting for the room media to catch up...";
  if (status.speechFinishedAt)
    return "Avatar reply finished on the worker. Waiting for room media...";
  if (status.avatarStartConnectedAt)
    return "Avatar renderer connected. Waiting for the room stream...";
  if (status.avatarStartBeginAt) return "Starting the avatar renderer...";
  if (status.agentSessionConnectedAt)
    return "Agent connected to the room. Starting avatar audio...";
  if (status.jobAcceptedAt) return "Avatar worker accepted the room job...";
  return "";
}

// ---------------------------------------------------------------------------
// Reconnectable session check
// ---------------------------------------------------------------------------

export function hasReconnectableSession(): boolean {
  if (!state.session.active || state.room.avatarLoadPending) return false;
  return (
    !state.room.activeRoom ||
    state.room.connectionState === "disconnected" ||
    state.room.avatarConnectionState === "disconnected"
  );
}

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

export function setAvatarConnectionState(nextState: AvatarConnectionState): void {
  state.room.avatarConnectionState = nextState;
}

export function setAvatarLoadingState(isPending: boolean, message = ""): void {
  state.room.avatarLoadPending = Boolean(isPending);
  state.room.avatarLoadMessage =
    state.room.avatarLoadPending && typeof message === "string" ? message.trim() : "";
}

// ---------------------------------------------------------------------------
// Disconnect room
// ---------------------------------------------------------------------------

export function disconnectRoom(_options: { keepDocumentPictureInPicture?: boolean } = {}): void {
  state.room.connectGeneration += 1;
  state.room.connectionState = "disconnected";
  setAvatarLoadingState(false);
  setAvatarConnectionState(state.session.active ? "disconnected" : "idle");

  const room = state.room.activeRoom as Record<string, unknown> | null;
  if (!room) {
    callbacks.onUpdateUi();
    return;
  }
  try {
    (room as { disconnect?: () => void }).disconnect?.();
  } catch {
    // Ignore disconnect errors.
  }
  state.room.activeRoom = null;
  callbacks.onUpdateUi();
}

// ---------------------------------------------------------------------------
// Voice transcript deduplication
// ---------------------------------------------------------------------------

export function resetVoiceTranscriptDeduplication(): void {
  state.voiceTranscript.lastByConnection.clear();
}

export function getVoiceTranscriptDeduplicationKey(sessionKey: string): string {
  return sessionKey;
}
