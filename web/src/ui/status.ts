/**
 * Status indicators — room status, avatar toolbar, health dots, connection state.
 *
 * Extracted from `web/app.js` status/UI-state functions.
 */

import { hasAvatarVideo } from "../avatar/room.js";
import { AVATAR_LOADING_STATUS, LIVEKIT, SESSION_STARTING_STATUS } from "../constants.js";
import { state } from "../state.js";

// ---------------------------------------------------------------------------
// DOM element references (passed in)
// ---------------------------------------------------------------------------

export interface StatusElements {
  roomStatusEl: HTMLElement | null;
  roomStatusTextEl: HTMLElement | null;
  roomStatusSpinnerEl: HTMLElement | null;
  gatewayHealthDotEl: HTMLElement | null;
  gatewayHealthValueEl: HTMLElement | null;
  keysHealthDotEl: HTMLElement | null;
  keysHealthValueEl: HTMLElement | null;
  avatarToolbarStatusDotEl: HTMLElement | null;
  avatarToolbarStatusEl: HTMLElement | null;
  avatarPlaceholderStatusEl: HTMLElement | null;
  avatarPlaceholderStatusDotEl: HTMLElement | null;
  avatarPlaceholderStatusTextEl: HTMLElement | null;
  avatarMediaEl: HTMLElement | null;
}

// ---------------------------------------------------------------------------
// Avatar toolbar status
// ---------------------------------------------------------------------------

export function getAvatarToolbarStatusState(avatarMediaEl: HTMLElement | null): {
  text: string;
  tone: string;
} {
  const connState = state.room.connectionState;
  if (state.room.avatarConnectionState === "disconnected") {
    return { text: "Disconnected", tone: "danger" };
  }
  if (state.room.activeRoom && connState === "connected" && hasAvatarVideo(avatarMediaEl)) {
    return { text: "Connected", tone: "ok" };
  }
  if (
    state.room.avatarLoadPending ||
    state.room.avatarConnectionState === "connecting" ||
    state.session.active ||
    (state.room.activeRoom && connState && connState !== "disconnected")
  ) {
    return { text: "Connecting...", tone: "warn" };
  }
  return { text: "Disconnected", tone: "danger" };
}

// ---------------------------------------------------------------------------
// Health status
// ---------------------------------------------------------------------------

export function setHealthStatus(
  dotEl: HTMLElement | null,
  valueEl: HTMLElement | null,
  tone: string,
  text: string,
): void {
  if (!dotEl || !valueEl) return;
  dotEl.classList.remove("ok", "warn", "danger");
  if (tone === "ok" || tone === "warn" || tone === "danger") {
    dotEl.classList.add(tone);
  }
  valueEl.textContent = text;
}

export function setGatewayHealthStatus(
  els: Pick<StatusElements, "gatewayHealthDotEl" | "gatewayHealthValueEl">,
  tone: string,
  text: string,
): void {
  if (state.setup.openClawCompatibility.compatible === false) {
    setHealthStatus(
      els.gatewayHealthDotEl,
      els.gatewayHealthValueEl,
      "danger",
      "incompatible openclaw version",
    );
    return;
  }
  setHealthStatus(els.gatewayHealthDotEl, els.gatewayHealthValueEl, tone, text);
}

export function setKeysHealthStatus(
  els: Pick<StatusElements, "keysHealthDotEl" | "keysHealthValueEl">,
  tone: string,
  text: string,
): void {
  setHealthStatus(els.keysHealthDotEl, els.keysHealthValueEl, tone, text);
}

// ---------------------------------------------------------------------------
// Room status display
// ---------------------------------------------------------------------------

export function setRoomStatus(
  text: string,
  els: StatusElements,
  options: { loading?: boolean } = {},
): void {
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
    (els.roomStatusSpinnerEl as HTMLElement).hidden = !loading;
  }
}

// ---------------------------------------------------------------------------
// Room status state resolution
// ---------------------------------------------------------------------------

export function updateRoomStatusState(els: StatusElements): void {
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
        { loading: isLoading },
      );
      return;
    }
    if (state.room.avatarConnectionState === "disconnected") {
      setRoomStatus("Avatar disconnected. Reconnect to resume.", els);
      return;
    }
    if (!hasAvatarVideo(els.avatarMediaEl)) {
      setRoomStatus(AVATAR_LOADING_STATUS, els, {
        loading: true,
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
        loading: true,
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
