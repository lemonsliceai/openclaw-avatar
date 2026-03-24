# Openclaw - Avatar Plugin

Give your OpenClaw agent a face! The Avatar Plugin allows you to have a real-time, interactive video call with your agent. 
The avatar listens to you, sends your speech to your OpenClaw agent, and speaks the response back with lip-synced video. It’s like FaceTime.  

Design your OpenClaw’s face to match its personality. Unlimited avatar options. Powered by LemonSlice, real-time AI avatar technology. 

## How it Works
You speak (or type) → Microphone / Speech Input → OpenClaw processes → OpenClaw TTS response -> LemonSlice
This plugin works with the OpenClaw gateway. It allows you to have a floating FaceTime-style avatar on your screen while you work. 
## Features
- Real-time video avatar 
- Expressive lip sync and whole-body gestures
- Voice-to-voice conversations
- Design your own avatar (just one photo!) 
- Picture-in-picture experience (have the avatar hangout while you work) 

**Outline**

- [Prerequisites](#prerequisites)
- [Quickstart](#quickstart)
- [Config](#config)
- [Usage tips](#usage-tips)
- [Update](#update)
- [About The Install Warning](#about-the-install-warning)
- [Minimum Openclaw config](#minimum-openclaw-config)
- [License](#license)

<a id="prerequisites"></a>
## Prerequisites

### OpenClaw

Before installing and running this plugin, you must have an OpenClaw instance installed and configured with at least one LLM provider, and TTS and STT capabilities. A minimum OpenClaw config example [can be found below](#minimum-openclaw-config).

- OpenClaw [getting started](https://docs.openclaw.ai/start/getting-started)

We recommend using a fast model for a better experience. e.g. gpt-5-nano

### About OpenClaw Config

- OpenClaw stores its config in a JSON file on your machine, for example `~/.openclaw/openclaw.json`.
- Config settings are usually referenced with dot notation, for example `gateway.auth.token`.
- A minimum OpenClaw config example [can be found below](#minimum-openclaw-config).

<a id="tts-for-avatar"></a>
### TTS for avatar

Avatar uses the core `messages.tts` configuration for avatar speech playback. Configure it in your main OpenClaw config. Provider setup, examples, and caveats live here: https://docs.openclaw.ai/tts

<a id="stt-for-avatar"></a>
### STT for avatar

Avatar uses the core `tools.media.audio` configuration for speech-to-text during avatar sessions. Configure it in your main OpenClaw config. Provider setup, examples, and transcription model options live here: https://docs.openclaw.ai/audio

### Providers

You will also need API keys with the following service providers:

- **LemonSlice** — real-time avatar. Get API key: https://lemonslice.com/agents/api  

- **LiveKit** — real-time video/audio infrastructure. Sign up at https://livekit.io

<a id="quickstart"></a>
## Quickstart

1. Install and enable the plugin.

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

2. Allow the Avatar plugin:

`openclaw.json` - `plugins.allow`
```json
{
  "plugins": {
    "allow": [
      "openclaw-avatar"
    ]
  }
}
```

3. Run the plugin setup command and enter your LemonSlice and LiveKit credentials. No gateway auth token is required in the plugin UI. Make sure OpenClaw already has speech-to-text and text-to-speech configured for the agents you want to use with Avatar:

```bash
openclaw openclaw-avatar-setup
```

4. Restart the OpenClaw gateway:

```bash
openclaw gateway run --force
```

5. Open the session UI for OpenClaw Avatar Chat:

```text
http://127.0.0.1:18789/plugins/openclaw-avatar/
```

6. Paste a public avatar image URL.

<a id="config"></a>
## Config

In `openclaw.json` under `plugins.entries`

```json
{
  "plugins": {
    "entries": {
      "openclaw-avatar": {
        "config": {
          "avatar": {
            "provider": "lemonslice",
            "verbose": false,
            "lemonSlice": {
              "apiKey": "<lemonslice-api-key>",
              "imageUrl": "https://example.com/avatar-image.jpg"
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

`avatar.verbose` defaults to `false`. When it is `false`, the gateway log only receives Avatar sidecar-ready, session start/end lifecycle events, and the worker progress state changes shown above the avatar in the main view. Set it to `true` to restore the full Avatar event stream.

<a id="usage-tips"></a>
## Usage tips

- The plugin is best used in a Chromium-based browser.
- If you choose to use the picture-in-picture view for the avatar, **do not close the avatar tab**.
- Avatar image tips: https://lemonslice.com/docs/avatar-design 
- Avatar timeout (seconds)- defaults to `60`. This defines how long your avatar will remain in the chat without interaction.

<a id="update"></a>
## Update

The plugin can be updated to the latest version using:

```bash
openclaw plugins update openclaw-avatar  
```

<a id="about-the-install-warning"></a>
## About The Install Warning

OpenClaw may show a warning like this during install:

```text
WARNING: Plugin "avatar" contains dangerous code patterns: Shell command execution detected (child_process) (.../avatar/index.ts:1727); Environment variable access combined with network send — possible credential harvesting (.../avatar/index.ts:212)
```

That warning is expected for this plugin. It is flagging two real implementation details:

- `child_process` in `avatar/index.ts` is used to start a local sidecar worker for the `avatar-agent` service. That worker runs the long-lived LiveKit agent runtime in a separate process so it can be started, stopped, restarted, and isolated from the main gateway process.
- `process.env` plus network activity in `avatar/index.ts` is used to read setup defaults and plugin-specific runtime variables, then connect to the local OpenClaw gateway and the configured LiveKit, LemonSlice, and OpenClaw speech/media runtime services that power the plugin.

What this plugin is not doing:

- It does not execute arbitrary shell snippets from user input.
- The plugin does not scan unrelated environment variables and send them to a third-party endpoint.
- Outbound connections are limited to the services required for the avatar flow and the local OpenClaw gateway bridge.

What it does do:

- Launch a local worker process for the avatar agent runtime.
- Read the plugin's configured credentials, and optionally specific documented environment variables, to supply those services.
- Send audio, transcript, and session traffic only to the configured providers needed for Avatar to function.

<a id="minimum-openclaw-config"></a>
## Minimum Openclaw config

This example is assembled from a working local `openclaw.json` and trimmed down to the minimum sections Avatar depends on. Replace each placeholder with your own providers and values. 

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
        "voiceId": "<elevenlabs-voice-id>",
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

<a id="license"></a>
## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
