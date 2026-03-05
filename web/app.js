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

const TOKEN_STORAGE_KEY = "videoChat.gatewayToken";
const LIVEKIT = globalThis.LivekitClient || globalThis.livekitClient || null;

let activeSession = null;
let activeRoom = null;
let localAudioTrack = null;
let localVideoTrack = null;

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

function clearRemoteTiles() {
  remoteGridEl.textContent = "";
}

function createRemoteTile(participantIdentity) {
  const tile = document.createElement("article");
  tile.className = "tile";
  tile.dataset.participantIdentity = participantIdentity;

  const heading = document.createElement("h3");
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
    await connectToRoom();
  } catch (error) {
    setOutput({ action: "session-start-failed", error: String(error) });
  }
});

stopSessionButton.addEventListener("click", () => {
  disconnectRoom();
  activeSession = null;
  updateRoomButtons();
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
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  tokenInput.value = "";
  activeSession = null;
  updateRoomButtons();
  statusEl.textContent = "Gateway token cleared. Enter a token to continue.";
  setOutput({ action: "gateway-token-cleared" });
});

tokenInput.value = getGatewayToken();
updateRoomButtons();

if (hasGatewayToken()) {
  refreshSetupStatus().catch(() => {});
} else {
  statusEl.textContent = "Enter a gateway token above, then click Use Token.";
}

if (LIVEKIT) {
  setRoomStatus("No active room connection.");
} else {
  setRoomStatus("LiveKit client failed to load from CDN.");
}
