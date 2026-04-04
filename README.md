# OpenClaw Avatar Plugin

Give your OpenClaw agent a face. The Avatar plugin adds real-time, interactive video calls to your OpenClaw instance. The avatar listens to you, sends your speech to the OpenClaw agent, and speaks the response back with lip-synced video — like FaceTime with your AI.

Design your avatar to match the agent's personality using just one photo. Powered by [LemonSlice](https://lemonslice.com/) for real-time avatar rendering and [LiveKit](https://livekit.io/) for video/audio transport.

## How It Works

```
You speak (or type) → STT transcription → OpenClaw LLM → TTS response → LemonSlice avatar renders lip-synced video
```

The plugin runs as a gateway plugin inside the OpenClaw process. It spawns an isolated sidecar worker for the LiveKit agent runtime, serves a browser-based UI on the OpenClaw web portal, and bridges everything through WebSocket RPC and LiveKit rooms.

## Features

- Real-time video avatar with expressive lip sync and gestures
- Voice-to-voice conversations via the OpenClaw gateway
- Text chat alongside video
- Design your own avatar with just one photo
- Picture-in-picture mode (keep the avatar floating while you work)
- Configurable session timeout (1-600 seconds)
- Multiple aspect ratios (3:2, 16:9, 9:16, 1:1)

## Architecture

```
Browser (web/)                         Node.js (avatar/)
+-----------------------+              +---------------------------+
| UI / Chat / Controls  |  WebSocket   | Gateway Plugin            |
|                       |<------------>| (avatar/index.ts)         |
| LiveKit Client SDK    |              |                           |
|    |                  |              | Sidecar Process           |
|    +------------------+--- LiveKit --+---> avatar-agent-runner   |
|    | Avatar video     |   (SFU)     |     + LemonSlice plugin   |
+-----------------------+              +---------------------------+
```

| Component | Description |
|-----------|-------------|
| **Backend (`avatar/`)** | Gateway plugin that registers HTTP routes and WebSocket RPC methods with the OpenClaw host. Manages sessions, credentials, LiveKit room creation, and token generation. |
| **Sidecar (`avatar-agent-runner.js`)** | Isolated child process running the LiveKit agent runtime with the LemonSlice plugin. Crash-recoverable, independently restartable. |
| **Frontend (`web/src/`)** | Vanilla TypeScript browser app (no framework). Connects to the gateway via WebSocket, joins a LiveKit room for real-time video/audio, and renders the avatar + chat UI. |

### Gateway Integration

The plugin registers the following WebSocket RPC methods with the OpenClaw gateway:

| Method | Purpose |
|--------|---------|
| `avatar.config` | Read current plugin configuration |
| `avatar.setup.get` | Get setup/credential status |
| `avatar.setup.save` | Save credentials and config |
| `avatar.session.create` | Create a new avatar session (LiveKit room + token) |
| `avatar.session.stop` | Stop an active session |
| `avatar.chat.history` | Load chat history for a session |
| `avatar.chat.send` | Send a message to the avatar |
| `avatar.transcribe` | Server-side audio transcription (STT) |
| `avatar.synthesize` | Text-to-speech synthesis |

HTTP API routes are also registered under `/plugins/openclaw-avatar/api/*` for the same operations.

## Installation

The plugin is distributed as an npm package (`@lemonsliceai/openclaw-avatar`) and installed through OpenClaw's plugin system.

Install from ClawHub:

```bash
openclaw plugins install clawhub:@lemonsliceai/openclaw-avatar
openclaw plugins enable openclaw-avatar
```

Or install directly from npm:

```bash
openclaw plugins install @lemonsliceai/openclaw-avatar@latest
openclaw plugins enable openclaw-avatar
```

Update to the latest version:

```bash
openclaw plugins update openclaw-avatar
```

**Minimum OpenClaw version:** `2026.3.23-1`

## Prerequisites

1. **A running OpenClaw instance** with at least one LLM provider (e.g. `openai/gpt-5-nano`), TTS, and STT configured. See the [minimum config example](#minimum-openclaw-config) below.
   - OpenClaw [getting started](https://docs.openclaw.ai/start/getting-started)
   - TTS setup: [docs.openclaw.ai/tts](https://docs.openclaw.ai/tts)
   - STT setup: [docs.openclaw.ai/audio](https://docs.openclaw.ai/audio)

2. **External service API keys:**
   - **LemonSlice** API key — real-time avatar rendering: [lemonslice.com/agents/api](https://lemonslice.com/agents/api)
   - **LiveKit** URL, API key, and API secret — real-time video/audio transport: [livekit.io](https://livekit.io)

## Quickstart

1. **Install and enable** the plugin (see [Installation](#installation) above).

2. **Allow the plugin** in `openclaw.json`:

```json
{
  "plugins": {
    "allow": ["openclaw-avatar"]
  }
}
```

3. **Run interactive setup** to enter your LemonSlice and LiveKit credentials:

```bash
openclaw openclaw-avatar-setup
```

4. **Restart the gateway:**

```bash
openclaw gateway run --force
```

5. **Open the web UI:**

```
http://127.0.0.1:18789/plugins/openclaw-avatar/
```

6. Enter your gateway auth credential (token or password) and click Connect.

7. Optionally paste an avatar image URL (a default is provided).

Avatar image tips: [lemonslice.com/docs/avatar-design](https://lemonslice.com/docs/avatar-design)

## Config

All configuration lives in `openclaw.json` under `plugins.entries.openclaw-avatar.config`:

```json
{
  "plugins": {
    "entries": {
      "openclaw-avatar": {
        "enabled": true,
        "config": {
          "avatar": {
            "provider": "lemonslice",
            "verbose": false,
            "lemonSlice": {
              "apiKey": "<lemonslice-api-key>",
              "imageUrl": "https://e9riw81orx.ufs.sh/f/z2nBEp3YISrtPNwLc0haBifGpR5UHA49jYDwQzbvS3mgVqLM"
            },
            "livekit": {
              "url": "wss://your-project.livekit.cloud",
              "apiKey": "<livekit-api-key>",
              "apiSecret": "<livekit-api-secret>"
            }
          }
        }
      }
    }
  }
}
```

API keys support environment variable references instead of inline strings:

```json
"apiKey": { "env": "LEMONSLICE_API_KEY" }
```

| Option | Default | Description |
|--------|---------|-------------|
| `avatar.provider` | — | Avatar provider. Currently only `"lemonslice"` is supported. |
| `avatar.verbose` | `false` | When `false`, gateway logs only show lifecycle events. Set to `true` for the full event stream. |
| `avatar.lemonSlice.apiKey` | — | LemonSlice API key (required). |
| `avatar.lemonSlice.imageUrl` | — | Default avatar image URL (optional). |
| `avatar.livekit.url` | — | LiveKit WebSocket URL, e.g. `wss://your-project.livekit.cloud` (required). |
| `avatar.livekit.apiKey` | — | LiveKit API key (required). |
| `avatar.livekit.apiSecret` | — | LiveKit API secret (required). |

OpenClaw stores its config at `~/.openclaw/openclaw.json`. Settings use dot notation, e.g. `gateway.auth.token` maps to `{ "gateway": { "auth": { "token": "..." } } }`.

## Web UI

| Page | URL |
|------|-----|
| Avatar chat | `http://127.0.0.1:18789/plugins/openclaw-avatar/` |
| Settings | `http://127.0.0.1:18789/plugins/openclaw-avatar/settings.html` |

The frontend authenticates with the OpenClaw gateway via WebSocket using token or password mode (matching `gateway.auth` in your `openclaw.json`). Auth credentials are stored in the browser's `localStorage`.

## Usage Tips

- Best used in a Chromium-based browser.
- If using picture-in-picture, **do not close the avatar tab**.
- Session timeout defaults to 60 seconds. This defines how long the avatar remains active without interaction.
- Avatar image design tips: [lemonslice.com/docs/avatar-design](https://lemonslice.com/docs/avatar-design)

## About the Install Warning

OpenClaw may show a warning during install:

```text
WARNING: Plugin "avatar" contains dangerous code patterns: Shell command execution detected (child_process);
Environment variable access combined with network send — possible credential harvesting
```

This is expected. The plugin uses `child_process` to spawn the sidecar worker process and reads environment variables for configured credentials. It does **not** execute arbitrary shell commands or exfiltrate environment variables. Outbound connections are limited to the configured LiveKit, LemonSlice, and OpenClaw services.

## Minimum OpenClaw Config

A working `openclaw.json` trimmed to the minimum sections Avatar depends on. Replace each placeholder with your own values.

```json
{
  "models": {
    "providers": {
      "openai": {
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "<openai-api-key>"
      }
    }
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "YOUR_GATEWAY_TOKEN"
    },
    "remote": {
      "url": "ws://127.0.0.1:18789",
      "token": "YOUR_GATEWAY_TOKEN"
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai/gpt-5-nano"
      }
    },
    "list": [
      {
        "id": "main"
      }
    ]
  },
  "messages": {
    "tts": {
      "auto": "always",
      "provider": "elevenlabs",
      "elevenlabs": {
        "apiKey": "<elevenlabs-api-key>",
        "voiceId": "pg7Nd5b8Y3tnfSndq5lh",
        "modelId": "eleven_flash_v2_5",
        "applyTextNormalization": "auto"
      }
    }
  },
  "tools": {
    "media": {
      "audio": {
        "enabled": true,
        "models": [
          {
            "provider": "groq",
            "model": "whisper-large-v3-turbo",
            "type": "provider",
            "timeoutSeconds": 60,
            "language": "en"
          }
        ]
      }
    }
  },
  "plugins": {
    "allow": ["openclaw-avatar"],
    "entries": {
      "openclaw-avatar": {
        "enabled": true,
        "config": {
          "avatar": {
            "provider": "lemonslice",
            "verbose": false,
            "lemonSlice": {
              "apiKey": "<lemonslice-api-key>"
            },
            "livekit": {
              "url": "wss://<your-project>.livekit.cloud",
              "apiKey": "<livekit-api-key>",
              "apiSecret": "<livekit-api-secret>"
            }
          }
        }
      }
    }
  }
}
```

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
