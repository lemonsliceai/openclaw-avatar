# OpenClaw Video Chat Plugin

External OpenClaw plugin that adds a LiveKit + LemonSlice video chat experience with setup UI, room controls, text chat, STT, and TTS.

## Architecture (Concise)

- Gateway plugin runtime (`video-chat/index.ts`)
  - Registers gateway methods (`videoChat.*`), HTTP routes, and `video-chat-agent` sidecar service.
  - Creates room/session tokens and dispatches LiveKit agent jobs.
- Browser UI (`web/index.html`, `web/app.js`)
  - Setup form, session controls, LiveKit room view, and text chat panel.
  - Calls plugin HTTP routes and gateway RPC.
- Sidecar worker
  - Runs the video chat agent entrypoint (`gateway video-chat-agent`) as a child process.
  - Connects to LiveKit and starts the LemonSlice avatar session.

## Where Keys/Config Are Stored

- Persistent plugin config is written to OpenClaw config under:
  - `plugins.entries.video-chat.config.videoChat.provider`
  - `plugins.entries.video-chat.config.videoChat.lemonSlice.apiKey`
  - `plugins.entries.video-chat.config.videoChat.lemonSlice.imageUrl`
  - `plugins.entries.video-chat.config.videoChat.livekit.url`
  - `plugins.entries.video-chat.config.videoChat.livekit.apiKey`
  - `plugins.entries.video-chat.config.videoChat.livekit.apiSecret`
  - `plugins.entries.video-chat.config.messages.tts.elevenlabs.apiKey`
  - `plugins.entries.video-chat.config.messages.tts.elevenlabs.voiceId`
- OpenClaw config file location is typically `~/.openclaw/openclaw.json`.
- Gateway token entered in the web UI is stored in browser `localStorage` using the same OpenClaw Control UI settings key:
  - `openclaw.control.settings.v1` (`token` field)
- Legacy plugin-only storage key `videoChat.gatewayToken` is automatically migrated on load.

## Install

```bash
npm install --legacy-peer-deps
openclaw plugins install --link /Users/scott/Documents/GitHub/videoChatPlugin
openclaw plugins list
```

## Run

1. Start/restart gateway:
```bash
openclaw gateway run --force
```

2. Open plugin UI:
```text
http://127.0.0.1:18789/plugins/video-chat/
```

3. In the UI:
- Enter gateway token (if gateway auth mode is token) and click `Use Token`.
- Fill setup values and click `Save Setup`.
- Click `Start Session`, then `Join Room`.

4. Verify plugin config/status:
```bash
openclaw gateway call videoChat.config --params '{}'
openclaw gateway call videoChat.setup.get --params '{}'
```

## Manual Sidecar Run (Debug)

If needed, run agent worker directly in a separate terminal:

```bash
LIVEKIT_URL="wss://<your-livekit-host>" \
LIVEKIT_API_KEY="<key>" \
LIVEKIT_API_SECRET="<secret>" \
LEMONSLICE_API_KEY="<key>" \
LEMONSLICE_IMAGE_URL="https://<direct-image-url>" \
ELEVENLABS_API_KEY="<key>" \
node /Users/scott/Documents/GitHub/openclaw/dist/index.js gateway video-chat-agent
```

Notes:
- `LEMONSLICE_IMAGE_URL` must be a direct image URL, not a directory/base path.
- You can override auto-discovery with `OPENCLAW_VIDEO_CHAT_AGENT_RUNNER=<absolute path to video-chat-agent-runner.js>`.

## Commands Exposed by Plugin

- Methods:
  - `videoChat.config`
  - `videoChat.setup.get`
  - `videoChat.setup.save`
  - `videoChat.session.create`
  - `videoChat.audio.transcribe`
  - `videoChat.tts.generate`
- Service:
  - `video-chat-agent`

## Local Checks

```bash
npm run typecheck
npm test
```
