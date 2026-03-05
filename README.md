# OpenClaw Video Chat Plugin

Standalone external plugin for OpenClaw video chat.

This package provides:
- Gateway methods for video chat config/session/audio/TTS.
- `video-chat-agent` sidecar service management.
- Plugin-owned setup surfaces (CLI setup command + plugin web page at `/plugins/video-chat/`).

## Repository Layout

- `video-chat/index.ts`: plugin implementation.
- `video-chat/index.test.ts`: plugin tests.
- `openclaw.plugin.json`: plugin manifest (required for external/community plugin discovery).
- `web/index.html`, `web/app.js`: plugin-owned setup/session web UI.

## Local Development

Install dependencies:

```bash
npm install --legacy-peer-deps
```

Run checks:

```bash
npm run typecheck
npm test
```

Notes:
- `openclaw` is a `peerDependency`.
- In some environments (npm v11), plain `npm install` may try to auto-install peers and fail on upstream SSH-only transitive deps. `--legacy-peer-deps` avoids this.

## Install Into OpenClaw (Linked Plugin)

Replace the path with your local clone path.

```bash
openclaw plugins install --link /Users/scott/Documents/GitHub/videoChatPlugin
openclaw plugins list
openclaw gateway restart
openclaw gateway call videoChat.config --params '{}'
```

Expected results:
- Plugin loads as `video-chat`.
- `videoChat.config` returns a success payload.
- Plugin page is reachable at `http://<gateway-host>:18789/plugins/video-chat/`.

## Setup

### CLI setup command

The plugin registers a CLI setup command:

```bash
openclaw video-chat-setup
```

The setup flow saves these config values:
- `plugins.entries.video-chat.config.videoChat.provider = "lemonslice"`
- `plugins.entries.video-chat.config.videoChat.lemonSlice.apiKey`
- `plugins.entries.video-chat.config.videoChat.lemonSlice.imageUrl`
- `plugins.entries.video-chat.config.videoChat.livekit.url`
- `plugins.entries.video-chat.config.videoChat.livekit.apiKey`
- `plugins.entries.video-chat.config.videoChat.livekit.apiSecret`
- `plugins.entries.video-chat.config.messages.tts.elevenlabs.apiKey`

Blank inputs preserve existing values/secrets.

### Plugin web page

Open:

```text
http://<gateway-host>:18789/plugins/video-chat/
```

The page supports:
- Entering a gateway token (stored in browser localStorage) and reloading to authorize API calls.
- Reading setup status.
- Saving keys/settings.
- Starting/stopping sessions.
- Calling TTS helper endpoint for browser-side validation.

## Gateway Methods

Implemented methods:
- `videoChat.config`
- `videoChat.setup.get`
- `videoChat.setup.save`
- `videoChat.session.create`
- `videoChat.audio.transcribe`
- `videoChat.tts.generate`

Service:
- `video-chat-agent`

## Publish Checklist

1. Pick npm package scope/name and update `package.json` (`name`, `version`, `description`).
2. Ensure `openclaw.plugin.json` is present at package root.
3. Confirm all checks pass:
   - `npm run typecheck`
   - `npm test`
4. Publish package:
   - `npm publish --access public` (if scoped package intended to be public)
5. Push source to a public GitHub repository.
6. Add setup docs/issues/contributing guidance in repo.
7. Submit OpenClaw docs/community listing PR referencing npm package + GitHub repo.

## Quick Verification Commands

```bash
openclaw gateway call videoChat.setup.get --params '{}'
openclaw gateway call videoChat.session.create --params '{"sessionKey":"agent:main/main"}'
```
