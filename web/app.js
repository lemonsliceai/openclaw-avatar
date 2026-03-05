const statusEl = document.getElementById("status");
const outputEl = document.getElementById("output");
const setupForm = document.getElementById("setup-form");
const sessionForm = document.getElementById("session-form");
const ttsForm = document.getElementById("tts-form");
const reloadButton = document.getElementById("reload-status");
const stopSessionButton = document.getElementById("stop-session");
const tokenForm = document.getElementById("token-form");
const tokenInput = document.getElementById("gateway-token");
const clearTokenButton = document.getElementById("clear-token");
const roomStatusEl = document.getElementById("room-status");
const localPreviewEl = document.getElementById("local-preview");
const remoteGridEl = document.getElementById("remote-grid");
const connectRoomButton = document.getElementById("connect-room");
const leaveRoomButton = document.getElementById("leave-room");
const toggleMicButton = document.getElementById("toggle-mic");
const toggleCameraButton = document.getElementById("toggle-camera");
const chatStatusEl = document.getElementById("chat-status");
const chatLogEl = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatSendButton = document.getElementById("chat-send");

const TOKEN_STORAGE_KEY = "videoChat.gatewayToken";
const LIVEKIT = globalThis.LivekitClient || globalThis.livekitClient || null;
const GATEWAY_PROTOCOL_VERSION = 3;
const GATEWAY_WS_CLIENT = {
  id: "test",
  version: "video-chat-plugin-ui",
  platform: "web",
  mode: "test",
};

let activeSession = null;
let activeRoom = null;
let localAudioTrack = null;
let localVideoTrack = null;
let gatewaySocket = null;
let gatewaySocketReady = false;
let gatewayHandshakePromise = null;
let gatewayConnectRequestId = null;
let gatewayRequestCounter = 0;
const gatewayPendingRequests = new Map();

function escapeSelectorValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function setOutput(value) {
  outputEl.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function setRoomStatus(text) {
  roomStatusEl.textContent = text;
}

function getGatewayToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
}

function hasGatewayToken() {
  return getGatewayToken().trim().length > 0;
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
  chatStatusEl.textContent = text;
}

function clearChatLog() {
  chatLogEl.textContent = "";
}

function appendChatLine(role, text) {
  if (!text) {
    return;
  }
  const line = document.createElement("article");
  line.className = `chat-line ${role}`;
  const message = document.createElement("div");
  message.className = "chat-msg";
  const heading = document.createElement("strong");
  heading.className = "muted";
  heading.textContent =
    role === "user" ? "You" : role === "assistant" ? "Agent" : role === "system" ? "System" : role;
  const body = document.createElement("p");
  body.className = "chat-bubble";
  body.textContent = text;
  message.appendChild(heading);
  message.appendChild(body);
  line.appendChild(message);
  chatLogEl.appendChild(line);
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
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
  const hasSession = Boolean(activeSession);
  chatInput.disabled = !hasSession;
  chatSendButton.disabled = !hasSession;
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
  if (gatewaySocket) {
    try {
      gatewaySocket.close();
    } catch {}
  }
  gatewaySocket = null;
  gatewayHandshakePromise = null;
  clearGatewayPendingRequests(new Error(reason));
}

function handleGatewayChatEvent(payload) {
  const expectedSessionKey = resolveChatSessionKey();
  const payloadSessionKey = typeof payload?.sessionKey === "string" ? payload.sessionKey.trim() : "";
  if (!expectedSessionKey || !payloadSessionKey || payloadSessionKey !== expectedSessionKey) {
    return;
  }

  const state = typeof payload.state === "string" ? payload.state : "";
  if (state === "delta") {
    setChatStatus("Agent is responding...");
    return;
  }
  if (state === "final") {
    const text = extractAssistantText(payload.message) || "[No text in final message]";
    appendChatLine("assistant", text);
    setChatStatus("Reply received.");
    return;
  }
  if (state === "error") {
    appendChatLine("system", payload.errorMessage || "Chat request failed.");
    setChatStatus("Chat error.");
    return;
  }
  if (state === "aborted") {
    appendChatLine("system", "Chat run aborted.");
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
      clearGatewayPendingRequests(new Error("Gateway websocket closed."));
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
  clearChatLog();
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
        : typeof message.content === "string"
          ? message.content
          : extractAssistantText(message);
    if (text) {
      appendChatLine(role, text);
    }
  }
}

function clearRemoteTiles() {
  remoteGridEl.textContent = "";
}

function createRemoteTile(participantIdentity) {
  const tile = document.createElement("article");
  tile.className = "tile list-item";
  tile.dataset.participantIdentity = participantIdentity;

  const heading = document.createElement("h3");
  heading.className = "list-title";
  heading.textContent = participantIdentity;
  tile.appendChild(heading);

  const media = document.createElement("div");
  media.className = "media";
  media.dataset.mediaOwner = participantIdentity;
  tile.appendChild(media);

  remoteGridEl.appendChild(tile);
  return media;
}

function getRemoteMediaContainer(participantIdentity) {
  const existing = remoteGridEl.querySelector(
    `[data-media-owner="${escapeSelectorValue(participantIdentity)}"]`,
  );
  if (existing) {
    return existing;
  }
  return createRemoteTile(participantIdentity);
}

function attachTrackToContainer(track, container) {
  const element = track.attach();
  element.autoplay = true;
  element.playsInline = true;
  if (track.kind === "video") {
    const priorVideo = container.querySelector("video");
    if (priorVideo) {
      priorVideo.remove();
    }
  }
  if (track.kind === "audio") {
    const priorAudio = container.querySelector("audio");
    if (priorAudio) {
      priorAudio.remove();
    }
  }
  container.appendChild(element);
}

function detachTrack(track) {
  const elements = track.detach();
  for (const element of elements) {
    element.remove();
  }
}

function releaseLocalTracks() {
  if (localAudioTrack) {
    try {
      localAudioTrack.stop();
      detachTrack(localAudioTrack);
    } catch {}
  }
  if (localVideoTrack) {
    try {
      localVideoTrack.stop();
      detachTrack(localVideoTrack);
    } catch {}
  }
  localAudioTrack = null;
  localVideoTrack = null;
  localPreviewEl.textContent = "";
}

function updateRoomButtons() {
  const hasSession = Boolean(activeSession);
  const hasRoom = Boolean(activeRoom);
  connectRoomButton.disabled = !hasSession || hasRoom;
  leaveRoomButton.disabled = !hasRoom;
  toggleMicButton.disabled = !hasRoom || !localAudioTrack;
  toggleCameraButton.disabled = !hasRoom || !localVideoTrack;
  toggleMicButton.textContent = localAudioTrack?.isMuted ? "Unmute Mic" : "Mute Mic";
  toggleCameraButton.textContent = localVideoTrack?.isMuted ? "Enable Camera" : "Disable Camera";
}

function removeParticipantTile(participantIdentity) {
  const tile = remoteGridEl.querySelector(
    `[data-participant-identity="${escapeSelectorValue(participantIdentity)}"]`,
  );
  if (tile) {
    tile.remove();
  }
}

async function publishLocalTracks(room) {
  if (!LIVEKIT) {
    throw new Error("LiveKit client library did not load");
  }
  const tracks = await LIVEKIT.createLocalTracks({
    audio: true,
    video: true,
  });
  for (const track of tracks) {
    await room.localParticipant.publishTrack(track);
    if (track.kind === "audio") {
      localAudioTrack = track;
    } else if (track.kind === "video") {
      localVideoTrack = track;
      const localMediaElement = track.attach();
      localMediaElement.autoplay = true;
      localMediaElement.playsInline = true;
      localMediaElement.muted = true;
      localPreviewEl.textContent = "";
      localPreviewEl.appendChild(localMediaElement);
    }
  }
}

function bindRoomEvents(room) {
  if (!LIVEKIT) {
    return;
  }
  room.on(LIVEKIT.RoomEvent.TrackSubscribed, (track, publication, participant) => {
    const container = getRemoteMediaContainer(participant.identity);
    attachTrackToContainer(track, container);
    updateRoomButtons();
  });
  room.on(LIVEKIT.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
    detachTrack(track);
    const hasSubscribedTracks = Array.from(participant.trackPublications.values()).some(
      (item) => Boolean(item.track),
    );
    if (!hasSubscribedTracks) {
      removeParticipantTile(participant.identity);
    }
  });
  room.on(LIVEKIT.RoomEvent.ParticipantDisconnected, (participant) => {
    removeParticipantTile(participant.identity);
  });
  room.on(LIVEKIT.RoomEvent.ConnectionStateChanged, (state) => {
    setRoomStatus(`Room state: ${state}`);
  });
  room.on(LIVEKIT.RoomEvent.Disconnected, () => {
    activeRoom = null;
    releaseLocalTracks();
    clearRemoteTiles();
    setRoomStatus("Disconnected from room.");
    updateRoomButtons();
  });
}

async function connectToRoom() {
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

  setRoomStatus("Connecting to room...");
  const room = new LIVEKIT.Room({
    adaptiveStream: true,
    dynacast: true,
  });

  bindRoomEvents(room);

  try {
    await room.connect(activeSession.livekitUrl, activeSession.participantToken);
    activeRoom = room;
    setRoomStatus(`Connected to ${activeSession.roomName}`);
    clearRemoteTiles();
    await publishLocalTracks(room);

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
    try {
      room.disconnect();
    } catch {}
    activeRoom = null;
    releaseLocalTracks();
    updateRoomButtons();
    throw error;
  }
}

function disconnectRoom() {
  if (!activeRoom) {
    return;
  }
  try {
    activeRoom.disconnect();
  } catch {}
  activeRoom = null;
  releaseLocalTracks();
  clearRemoteTiles();
  setRoomStatus("Disconnected from room.");
  updateRoomButtons();
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

async function refreshSetupStatus() {
  if (!hasGatewayToken()) {
    statusEl.textContent = "Enter a gateway token above, then click Use Token.";
    return;
  }
  statusEl.textContent = "Loading setup status...";
  try {
    const payload = await requestJson("/plugins/video-chat/api/setup");
    statusEl.textContent = setupStatusLabel(payload.setup);
    const livekitUrlField = setupForm.elements.namedItem("livekitUrl");
    const imageUrlField = setupForm.elements.namedItem("lemonSliceImageUrl");
    if (livekitUrlField && payload.setup?.livekit?.url) {
      livekitUrlField.value = payload.setup.livekit.url;
    }
    if (imageUrlField && payload.setup?.lemonSlice?.imageUrl) {
      imageUrlField.value = payload.setup.lemonSlice.imageUrl;
    }
  } catch (error) {
    statusEl.textContent = error instanceof Error ? error.message : "Failed to load status";
  }
}

setupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(setupForm);
  const body = Object.fromEntries(formData.entries());
  try {
    const payload = await requestJson("/plugins/video-chat/api/setup", {
      method: "POST",
      body: JSON.stringify(body),
    });
    statusEl.textContent = setupStatusLabel(payload.setup);
    setOutput({ action: "setup-saved", setup: payload.setup });
    setupForm.reset();
  } catch (error) {
    setOutput({ action: "setup-save-failed", error: String(error) });
  }
});

sessionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(sessionForm);
  const sessionKey = String(formData.get("sessionKey") || "").trim();
  try {
    const payload = await requestJson("/plugins/video-chat/api/session", {
      method: "POST",
      body: JSON.stringify({ sessionKey }),
    });
    activeSession = payload.session;
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
    await connectToRoom();
  } catch (error) {
    setOutput({ action: "session-start-failed", error: String(error) });
  }
});

stopSessionButton.addEventListener("click", () => {
  disconnectRoom();
  activeSession = null;
  updateRoomButtons();
  updateChatControls();
  clearChatLog();
  setChatStatus("Start a session to use text chat.");
  setOutput({ action: "session-stopped" });
});

connectRoomButton.addEventListener("click", async () => {
  try {
    await connectToRoom();
    setOutput({ action: "room-connected", roomName: activeSession?.roomName ?? null });
  } catch (error) {
    setOutput({ action: "room-connect-failed", error: String(error) });
  }
});

leaveRoomButton.addEventListener("click", () => {
  disconnectRoom();
  setOutput({ action: "room-left" });
});

toggleMicButton.addEventListener("click", async () => {
  if (!localAudioTrack) {
    return;
  }
  try {
    if (localAudioTrack.isMuted) {
      await localAudioTrack.unmute();
    } else {
      await localAudioTrack.mute();
    }
    updateRoomButtons();
  } catch (error) {
    setOutput({ action: "mic-toggle-failed", error: String(error) });
  }
});

toggleCameraButton.addEventListener("click", async () => {
  if (!localVideoTrack) {
    return;
  }
  try {
    if (localVideoTrack.isMuted) {
      await localVideoTrack.unmute();
    } else {
      await localVideoTrack.mute();
    }
    updateRoomButtons();
  } catch (error) {
    setOutput({ action: "camera-toggle-failed", error: String(error) });
  }
});

ttsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(ttsForm);
  const text = String(formData.get("text") || "");
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
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = String(chatInput.value || "").trim();
  if (!message) {
    return;
  }
  const sessionKey = resolveChatSessionKey();
  if (!sessionKey) {
    appendChatLine("system", "Start a session before sending chat messages.");
    return;
  }
  const idempotencyKey = `video-chat-ui-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  appendChatLine("user", message);
  chatInput.value = "";
  setChatStatus("Sending message...");
  try {
    const response = await gatewayRpc("chat.send", {
      sessionKey,
      message,
      idempotencyKey,
    });
    setOutput({ action: "chat-sent", sessionKey, response });
    setChatStatus("Awaiting agent reply...");
  } catch (error) {
    appendChatLine("system", error instanceof Error ? error.message : "Chat send failed.");
    setOutput({ action: "chat-send-failed", error: String(error) });
    setChatStatus("Chat send failed.");
  }
});

reloadButton.addEventListener("click", () => {
  refreshSetupStatus().catch(() => {});
});

tokenForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const token = String(tokenInput.value || "").trim();
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
  window.location.reload();
});

clearTokenButton.addEventListener("click", () => {
  disconnectRoom();
  closeGatewaySocket("Gateway token cleared.");
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  tokenInput.value = "";
  activeSession = null;
  updateRoomButtons();
  updateChatControls();
  clearChatLog();
  setChatStatus("Enter a gateway token to use text chat.");
  statusEl.textContent = "Gateway token cleared. Enter a token to continue.";
  setOutput({ action: "gateway-token-cleared" });
});

tokenInput.value = getGatewayToken();
updateRoomButtons();
updateChatControls();
clearChatLog();

if (hasGatewayToken()) {
  refreshSetupStatus().catch(() => {});
  setChatStatus("Start a session to use text chat.");
} else {
  statusEl.textContent = "Enter a gateway token above, then click Use Token.";
  setChatStatus("Enter a gateway token to use text chat.");
}

if (LIVEKIT) {
  setRoomStatus("No active room connection.");
} else {
  setRoomStatus("LiveKit client failed to load from CDN.");
}
