# OpenClaw Claw Cast Plugin

Standalone OpenClaw plugin that adds a LemonSlice + LiveKit + Eleven Labs Avatar Cast experience with plugin-owned setup, browser session controls, text chat, speech-to-text, and text-to-speech.

## What Ships

- Gateway extension: `video-chat/index.ts`
- Sidecar helpers:
  - `video-chat/video-chat-agent-bridge.mjs`
  - `video-chat/video-chat-agent-runner-wrapper.mjs`
  - `video-chat/video-chat-agent-runner.js`
  - `video-chat/sidecar-process-control.ts`
- Web UI:
  - `web/index.html`
  - `web/settings.html`
  - `web/app.js`
  - `styles/`
- Plugin manifest: `openclaw.plugin.json`

`package.json` uses a `files` allowlist so `npm pack` only includes the runtime files above and excludes tests, local dependencies, and editor artifacts.

## Runtime Surface

- Gateway methods:
  - `videoChat.config`
  - `videoChat.setup.get`
  - `videoChat.setup.save`
  - `videoChat.session.create`
  - `videoChat.session.stop`
  - `videoChat.audio.transcribe`
  - `videoChat.tts.generate`
- HTTP routes:
  - `/plugins/video-chat`
  - `/plugins/video-chat/config`
  - `/plugins/video-chat/api/*`
  - `/plugins/video-chat/styles/*`
- Service:
  - `video-chat-agent`
- CLI command:
  - `video-chat-setup`

## Prerequisites

Before installing and running this plugin, you will need accounts with the following services:

- **LemonSlice** — provides the avatar/character rendering for the video chat experience.
  Sign up at https://www.lemonslice.com

- **ElevenLabs** — powers text-to-speech (TTS) voice synthesis.
  Sign up at https://elevenlabs.io

- **LiveKit** — provides the real-time video/audio room infrastructure.
  Sign up at https://livekit.io

Once you have accounts, retrieve API keys from each service and supply them during plugin setup (via the browser config page or the `video-chat-setup` CLI command).

## Install

```bash
npm install --legacy-peer-deps
openclaw plugins install --link /Users/scott/Documents/GitHub/videoChatPlugin
openclaw plugins list
```

## Run

1. Start or restart the gateway:

```bash
openclaw gateway run
```

2. Open the plugin UI:

```text
http://127.0.0.1:18789/plugins/video-chat/
```

3. Configure the plugin with either:
  - the browser config page at `/plugins/video-chat/config`
  - the registered `video-chat-setup` CLI command, using flags or interactive prompts

4. Start a session, join the room, and use the chat, STT, and TTS controls from the page.

## Manual Sidecar Run

For debugging the LiveKit agent directly:

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

- `LEMONSLICE_IMAGE_URL` must be a direct image URL, not a directory URL.
- `OPENCLAW_VIDEO_CHAT_AGENT_RUNNER` can override the runner path auto-discovery.

## Verification

Release validation is codified in the project scripts:

```bash
npm run typecheck
npm test
npm run pack:check
npm run validate
```

Current automated coverage includes:

- gateway method registration and request validation
- plugin-owned config overlay behavior
- HTTP route serving for the shipped UI/API entry points
- sidecar process-group shutdown and reset behavior
- TTS and STT integration points through the plugin runtime mock
