/**
 * Gateway WebSocket — connection lifecycle, auth handshake, reconnect with
 * exponential backoff, and request/response multiplexing.
 *
 * Extracted from the ~400 lines of gateway socket logic in `web/app.js`.
 * Chat-event handling and UI side-effects are delegated to callbacks that
 * the orchestrator (`app.ts`) wires up at init time.
 */

import { GATEWAY_PROTOCOL_VERSION, GATEWAY_WS_CLIENT, GATEWAY_WS_SCOPES } from "../constants.js";
import { state } from "../state.js";
import {
  gatewayAuthRequiresSharedSecret,
  getGatewayAuthMode,
  getGatewayToken,
  hasGatewayToken,
} from "./auth.js";

// ---------------------------------------------------------------------------
// Callbacks — wired by the orchestrator so this module stays UI-agnostic
// ---------------------------------------------------------------------------

export interface GatewaySocketCallbacks {
  onChatEvent: (payload: Record<string, unknown>) => void;
  onChatStatus: (text: string) => void;
  onOutput: (detail: Record<string, unknown>) => void;
  onReady: () => void;
  onClose: (wasAuthFailure: boolean) => void;
  /** Called after the close handler clears local state. */
  onAfterClose: () => void;
}

let callbacks: GatewaySocketCallbacks = {
  onChatEvent: () => {},
  onChatStatus: () => {},
  onOutput: () => {},
  onReady: () => {},
  onClose: () => {},
  onAfterClose: () => {},
};

export function setGatewaySocketCallbacks(cb: Partial<GatewaySocketCallbacks>): void {
  callbacks = { ...callbacks, ...cb };
}

// ---------------------------------------------------------------------------
// Request-ID generation
// ---------------------------------------------------------------------------

export function nextGatewayRequestId(): string {
  state.gateway.requestCounter += 1;
  return `avatar-ui-${Date.now()}-${state.gateway.requestCounter}`;
}

// ---------------------------------------------------------------------------
// Pending request management
// ---------------------------------------------------------------------------

export function clearGatewayPendingRequests(error: Error): void {
  for (const [id, pending] of state.gateway.pendingRequests.entries()) {
    if (pending.timer) clearTimeout(pending.timer);
    pending.reject(error);
    state.gateway.pendingRequests.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Reconnect timer
// ---------------------------------------------------------------------------

export function clearGatewayReconnectTimer(): void {
  state.gateway.reconnectBackoffActive = false;
  if (state.gateway.reconnectTimer === null) {
    return;
  }
  clearTimeout(state.gateway.reconnectTimer);
  state.gateway.reconnectTimer = null;
}

// ---------------------------------------------------------------------------
// Auth error helpers
// ---------------------------------------------------------------------------

export function createGatewayAuthError(message: string): Error & { code?: string } {
  const error: Error & { code?: string } = new Error(message);
  error.code = "GATEWAY_AUTH_FAILED";
  return error;
}

export function isGatewaySocketAuthError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const code =
    typeof (error as Record<string, unknown>)?.code === "string"
      ? ((error as Record<string, unknown>).code as string)
      : "";
  if (code === "GATEWAY_AUTH_FAILED") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /unauthorized|invalid token|invalid password|auth|401|403|forbidden/i.test(message);
}

function reportGatewaySocketAuthFailure(error: unknown): void {
  callbacks.onOutput({
    action: "auth-failed",
    error: error instanceof Error ? error.message : String(error),
  });
}

// ---------------------------------------------------------------------------
// Socket lifecycle
// ---------------------------------------------------------------------------

export function closeGatewaySocket(reason: string): void {
  clearGatewayReconnectTimer();
  state.gateway.socketReady = false;
  state.gateway.connectRequestId = null;

  if (state.gateway.socket) {
    try {
      state.gateway.socket.close();
    } catch {
      // Ignore close errors.
    }
  }
  state.gateway.socket = null;
  state.gateway.handshakePromise = null;
  clearGatewayPendingRequests(new Error(reason));

  callbacks.onClose(false);
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

function handleGatewaySocketMessage(raw: unknown): void {
  let frame: Record<string, unknown> | null = null;
  try {
    frame = JSON.parse(String(raw)) as Record<string, unknown>;
  } catch {
    return;
  }
  if (!frame || typeof frame !== "object") {
    return;
  }

  // --- connect.challenge handshake ---
  if (frame.type === "event" && frame.event === "connect.challenge") {
    const token = getGatewayToken();
    const gatewayAuthMode = getGatewayAuthMode();
    const connectRequestId = nextGatewayRequestId();
    state.gateway.connectRequestId = connectRequestId;
    const auth =
      gatewayAuthRequiresSharedSecret(gatewayAuthMode) && token
        ? gatewayAuthMode === "password"
          ? { password: token }
          : { token }
        : null;
    const params = {
      minProtocol: GATEWAY_PROTOCOL_VERSION,
      maxProtocol: GATEWAY_PROTOCOL_VERSION,
      client: GATEWAY_WS_CLIENT,
      role: "operator",
      scopes: GATEWAY_WS_SCOPES,
      ...(auth ? { auth } : {}),
    };
    state.gateway.socket?.send(
      JSON.stringify({
        type: "req",
        id: connectRequestId,
        method: "connect",
        params,
      }),
    );
    return;
  }

  // --- response frames ---
  if (frame.type === "res") {
    if (frame.id === state.gateway.connectRequestId) {
      state.gateway.connectRequestId = null;
      if (!frame.ok) {
        const message =
          ((frame.error as Record<string, unknown>)?.message as string) ||
          "Gateway websocket authorization failed.";
        state.gateway.handshakeError = createGatewayAuthError(message);
        closeGatewaySocket(message);
        callbacks.onChatStatus(message);
        return;
      }
      state.gateway.socketReady = true;
      callbacks.onChatStatus("Chat connected.");
      callbacks.onReady();
      return;
    }

    const pending = state.gateway.pendingRequests.get(frame.id as string);
    if (!pending) {
      return;
    }
    if (pending.timer) clearTimeout(pending.timer);
    state.gateway.pendingRequests.delete(frame.id as string);
    if (frame.ok) {
      pending.resolve((frame.payload as Record<string, unknown>) ?? {});
      return;
    }
    const message =
      ((frame.error as Record<string, unknown>)?.message as string) || "Request failed";
    pending.reject(new Error(message));
    return;
  }

  // --- chat event ---
  if (frame.type === "event" && frame.event === "chat") {
    callbacks.onChatEvent((frame.payload as Record<string, unknown>) || {});
  }
}

// ---------------------------------------------------------------------------
// Connect
// ---------------------------------------------------------------------------

export async function ensureGatewaySocketConnected(): Promise<void> {
  if (
    state.gateway.socketReady &&
    state.gateway.socket &&
    state.gateway.socket.readyState === WebSocket.OPEN
  ) {
    return;
  }
  if (state.gateway.handshakePromise) {
    return state.gateway.handshakePromise as Promise<void>;
  }

  state.gateway.handshakePromise = new Promise<void>((resolve, reject) => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${protocol}//${window.location.host}`;
    let settled = false;

    const onSettledError = (error: unknown): void => {
      if (settled) return;
      settled = true;
      state.gateway.handshakePromise = null;
      reject(error);
    };
    const onSettledSuccess = (): void => {
      if (settled) return;
      settled = true;
      state.gateway.handshakePromise = null;
      resolve();
    };

    callbacks.onChatStatus("Connecting chat websocket...");
    const ws = new WebSocket(socketUrl);
    state.gateway.socket = ws;
    state.gateway.socketReady = false;
    state.gateway.handshakeError = null;
    state.gateway.connectRequestId = null;

    const connectTimer = setTimeout(() => {
      onSettledError(new Error("Timed out connecting to gateway websocket."));
      closeGatewaySocket("Timed out connecting to gateway websocket.");
    }, 10_000);

    ws.addEventListener("message", (event: MessageEvent) => {
      handleGatewaySocketMessage(event.data);
      if (!settled && state.gateway.socketReady) {
        clearTimeout(connectTimer);
        onSettledSuccess();
      }
    });

    ws.addEventListener("close", (evt: CloseEvent) => {
      const closeReason = typeof evt?.reason === "string" ? evt.reason.toLowerCase() : "";
      const authFailure =
        state.gateway.handshakeError ||
        evt?.code === 1008 ||
        /unauthorized|invalid token|invalid password|auth|401|403|forbidden/i.test(closeReason);
      if (!settled) {
        clearTimeout(connectTimer);
        const closeError =
          state.gateway.handshakeError ||
          (authFailure
            ? createGatewayAuthError(
                typeof evt?.reason === "string" && evt.reason.trim()
                  ? evt.reason.trim()
                  : "Gateway websocket authorization failed.",
              )
            : new Error("Gateway websocket closed before connect completed."));
        onSettledError(closeError);
      }
      if (state.gateway.socket === ws) {
        state.gateway.socket = null;
      }
      state.gateway.handshakeError = null;
      state.gateway.socketReady = false;
      state.gateway.connectRequestId = null;

      clearGatewayPendingRequests(new Error("Gateway websocket closed."));
      callbacks.onChatStatus("Chat disconnected.");
      callbacks.onAfterClose();

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

  return state.gateway.handshakePromise as Promise<void>;
}

// ---------------------------------------------------------------------------
// Reconnect
// ---------------------------------------------------------------------------

export function scheduleGatewaySocketReconnect(delayMs = 1_000): void {
  if (
    state.gateway.reconnectTimer !== null ||
    state.gateway.handshakePromise ||
    !state.session.active ||
    !hasGatewayToken() ||
    (state.gateway.socket &&
      state.gateway.socket.readyState === WebSocket.OPEN &&
      state.gateway.socketReady)
  ) {
    return;
  }
  state.gateway.reconnectBackoffActive = true;
  state.gateway.reconnectTimer = setTimeout(() => {
    state.gateway.reconnectTimer = null;
    if (!state.session.active || !hasGatewayToken()) {
      state.gateway.reconnectBackoffActive = false;
      return;
    }
    void ensureGatewaySocketConnected()
      .catch((error) => {
        if (isGatewaySocketAuthError(error)) {
          state.gateway.reconnectBackoffActive = false;
          reportGatewaySocketAuthFailure(error);
          return;
        }
        callbacks.onOutput({
          action: "chat-websocket-reconnect-failed",
          error: error instanceof Error ? error.message : String(error),
        });
        scheduleGatewaySocketReconnect(Math.min(delayMs * 2, 10_000));
      })
      .then(() => {
        if (state.gateway.socketReady) {
          state.gateway.reconnectBackoffActive = false;
        }
      });
  }, delayMs);
}

// ---------------------------------------------------------------------------
// Prime for chat (convenience)
// ---------------------------------------------------------------------------

export async function primeGatewaySocketForChat(): Promise<boolean> {
  try {
    await ensureGatewaySocketConnected();
    clearGatewayReconnectTimer();
    return true;
  } catch (error) {
    if (isGatewaySocketAuthError(error)) {
      reportGatewaySocketAuthFailure(error);
      callbacks.onChatStatus(
        error instanceof Error ? error.message : "Gateway authentication failed.",
      );
      return false;
    }
    callbacks.onOutput({
      action: "chat-websocket-unavailable",
      error: error instanceof Error ? error.message : String(error),
    });
    scheduleGatewaySocketReconnect();
    return false;
  }
}

// ---------------------------------------------------------------------------
// RPC
// ---------------------------------------------------------------------------

export async function gatewayRpc(
  method: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  await ensureGatewaySocketConnected();
  if (
    !state.gateway.socket ||
    state.gateway.socket.readyState !== WebSocket.OPEN ||
    !state.gateway.socketReady
  ) {
    throw new Error("Gateway websocket is not connected.");
  }
  const id = nextGatewayRequestId();
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.gateway.pendingRequests.delete(id);
      reject(new Error(`${method} timed out.`));
    }, 20_000);
    state.gateway.pendingRequests.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
      timer,
    });
    state.gateway.socket!.send(
      JSON.stringify({
        type: "req",
        id,
        method,
        params,
      }),
    );
  });
}
