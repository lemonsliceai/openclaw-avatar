@ -0,0 +1,246 @@
---
summary: "Handoff guide for moving video chat into a standalone OpenClaw plugin repository"
read_when:
  - You are implementing video chat as an external plugin repository
  - You need parity with the in-tree OpenClaw video-chat plugin without gateway UI changes
title: "Video Chat Plugin External Handoff"
---

# Video Chat plugin external handoff

## Goal

Build and publish `video-chat` as a standalone plugin repo (npm + GitHub), with no core Gateway UI tab/button changes.

Required product behavior:

- No native Gateway `Video Chat` tab.
- No video-chat key editor on the Skills page.
- Setup is plugin-owned:
  - plugin setup command/wizard
  - plugin web page opened in a new tab (for key edits and session controls)

## Source of truth in the OpenClaw monorepo

Use these files as the parity baseline:

- `extensions/video-chat/index.ts`
- `extensions/video-chat/index.test.ts`
- `extensions/video-chat/package.json`
- `src/plugins/types.ts` (plugin API surface)
- `src/plugins/runtime/types-core.ts` (runtime helpers: config, tts, stt)

Current method and service contracts in the baseline plugin:

- Gateway methods:
  - `videoChat.config`
  - `videoChat.session.create`
  - `videoChat.audio.transcribe`
  - `videoChat.tts.generate`
- Service:
  - `video-chat-agent` sidecar process manager

## Current copied state (starting point)

This handoff now assumes the repo already contains:

```text
videoChatPlugin/
  package.json
  video-chat-external-handoff.md
  video-chat/
    index.ts
    index.test.ts
    openclaw.plugin.json
```

## Normalize this layout first

Before implementation, make the copied state loadable by OpenClaw as a linked package plugin.

1. Ensure the package extension entry points to `video-chat/index.ts`.
2. Ensure plugin manifest is discoverable at package root.

Recommended normalization:

```bash
cp video-chat/openclaw.plugin.json ./openclaw.plugin.json
```

Then keep `video-chat/openclaw.plugin.json` as a reference copy or remove it; root manifest is the one OpenClaw discovery expects for package installs.

After normalization, target layout:

```text
videoChatPlugin/
  package.json
  openclaw.plugin.json
  video-chat/
    index.ts
    index.test.ts
  web/
    index.html
    app.js
```

## Package file templates

### package.json

```json
{
  "name": "@your-scope/openclaw-video-chat",
  "version": "0.1.0",
  "description": "OpenClaw video chat plugin",
  "type": "module",
  "openclaw": {
    "extensions": ["./video-chat/index.ts"]
  },
  "peerDependencies": {
    "openclaw": ">=2026.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "openclaw": "^2026.0.0",
    "typescript": "^5.0.0",
    "vitest": "^4.0.0"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

### openclaw.plugin.json (package root)

`configSchema` is required for external/community plugins.

```json
{
  "id": "video-chat",
  "name": "Video Chat",
  "description": "Video chat gateway methods and sidecar worker",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

## Implementation steps

1. Start from the copied files already present under `video-chat/`.
2. Keep method names and payload contracts unchanged for compatibility.
   - Update `video-chat/index.test.ts` imports that reference monorepo-only helpers (for example `extensions/test-utils/plugin-runtime-mock.ts`) to local equivalents in this repo.
3. Keep the sidecar service behavior unchanged:
   - service id `video-chat-agent`
   - reject `trusted-proxy` auth mode
   - spawn command: `node <openclaw-entrypoint> gateway video-chat-agent`
4. Add plugin-owned setup surfaces (below).

## Plugin owned setup surfaces

Implement both surfaces in the plugin repo so core Gateway UI does not need to change.

### 1. CLI setup command

Use `api.registerCli(...)` in `index.ts` to add a command (for example `video-chat-setup`) that:

- prompts for:
  - LemonSlice API key
  - LemonSlice image URL
  - LiveKit URL
  - LiveKit API key
  - LiveKit API secret
  - ElevenLabs API key
- writes config using `api.runtime.config.writeConfigFile(...)`
- preserves existing secrets when inputs are blank

Config paths to write (current parity behavior):

- `videoChat.provider = "lemonslice"`
- `videoChat.lemonSlice.apiKey`
- `videoChat.lemonSlice.imageUrl`
- `videoChat.livekit.url`
- `videoChat.livekit.apiKey`
- `videoChat.livekit.apiSecret`
- `messages.tts.elevenlabs.apiKey`

### 2. Plugin page in new tab

Add plugin HTTP routes with `api.registerHttpRoute(...)`:

- `path: "/plugins/video-chat"` with `auth: "gateway"`
- `match: "prefix"` if serving assets

Serve `web/index.html` and `web/app.js`.

The page should:

- load current setup status from `videoChat.config`
- provide save form for keys/settings (via a new setup method, or plugin route endpoint)
- start/stop session using existing methods:
  - `videoChat.session.create`
  - `videoChat.audio.transcribe`
  - `videoChat.tts.generate`

This page is launched manually by URL, for example:

- `http://<gateway-host>:18789/plugins/video-chat/`

## Suggested new setup methods

Add methods for setup UI so no core UI change is required:

- `videoChat.setup.get`
- `videoChat.setup.save`

Keep error format aligned with current gateway method error shape:

- `code: "INVALID_REQUEST" | "UNAVAILABLE"`
- `message: string`

## Verification checklist

From the plugin repo:

```bash
npm install
npm run typecheck
npm test
```

Install on a local OpenClaw instance:

```bash
openclaw plugins install --link /absolute/path/to/videoChatPlugin
openclaw plugins list
openclaw gateway restart
openclaw gateway call videoChat.config --params '{}'
```

Expected:

- plugin loads as `video-chat`
- `videoChat.config` returns success payload
- plugin page reachable at `/plugins/video-chat/`
- no dependency on a core Gateway tab/button

## Publish and listing

For community listing eligibility:

1. Publish package to npm.
2. Push source to a public GitHub repository.
3. Include setup docs and issue tracking in the repo.
4. Submit docs PR to add your package to Community plugins.

Community listing requirements: [Community plugins](/plugins/community)

Plugin system reference: [Plugins](/tools/plugin)

Manifest requirements: [Plugin manifest](/plugins/manifest)

CLI management: [plugins CLI](/cli/plugins)