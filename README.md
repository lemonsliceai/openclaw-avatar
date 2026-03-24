# Openclaw - Avatar Plugin

Give your OpenClaw agent a face! The Avatar Plugin allows you to have a real-time, interactive video call with your OpenClaw agent. The avatar listens to you, sends your speech to your agent, and speaks the response back with lip-synced video... like FaceTime! 

Design your OpenClaw’s face to match its personality. Unlimited avatar options. Powered by [LemonSlice](https://lemonslice.com/), real-time AI avatar technology. 

## How it Works

```
You speak (or type) → Transcribe speech → OpenClaw processes → OpenClaw TTS response -> LemonSlice avatar
```

This plugin works with the OpenClaw gateway. It allows you to have a floating FaceTime-style avatar on your screen while you work.   

## Features

- Real-time video avatar 
- Expressive lip sync and whole-body gestures
- Voice-to-voice conversations
- Design your own avatar with just one photo!
- Picture-in-picture experience (have the avatar hangout while you work)



## Outline

- [Prerequisites](#prerequisites)
- [Quickstart](#quickstart)
- [Config](#config)
- [Usage tips](#usage-tips)
- [Update](#update)
- [About The Install Warning](#about-the-install-warning)
- [Minimum Openclaw config](#minimum-openclaw-config)
- [License](#license)

## Prerequisites

### OpenClaw

Before installing and running this plugin, you must have an OpenClaw instance installed and configured with at least one LLM provider (e.g. gpt-5-nano), as well as TTS and STT capabilities. A minimum OpenClaw config example [can be found below](#minimum-openclaw-config).

- OpenClaw [getting started](https://docs.openclaw.ai/start/getting-started)

#### About OpenClaw Config

If you're new to OpenClaw, installation can be complicated. The easiest way to install plugins or capabilities is to modify your `openclaw.json` file directly. 

- OpenClaw stores its config in a JSON file on your machine, for example `~/.openclaw/openclaw.json`.
- Config settings are often referenced with dot notation, for example `gateway.auth.token` means:

```json
"gateway": {
  "auth": {
    "token": "<VALUE.OF.TOKEN>"
  }
}
```

- A minimum OpenClaw config example [can be found below](#minimum-openclaw-config). If something is not working for you, double check your `openclaw.json` file against this one and make them match.

### TTS for avatar

Avatar uses the core `messages.tts` configuration for avatar speech playback. Set it up here: [https://docs.openclaw.ai/tts](https://docs.openclaw.ai/tts)

### STT for avatar

Avatar uses the core `tools.media.audio` configuration for speech-to-text during avatar sessions. Set it up here: [https://docs.openclaw.ai/audio](https://docs.openclaw.ai/audio)

### Providers

You will also need API keys with the following service providers:

- **LemonSlice** — real-time avatar: [https://lemonslice.com/agents/api](https://lemonslice.com/agents/api)  
- **LiveKit** — real-time video/audio infrastructure: [https://livekit.io](https://livekit.io)

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

3. Run the plugin setup command and enter your LemonSlice and LiveKit credentials. Make sure OpenClaw already has speech-to-text (STT) and text-to-speech (TTS) configured for the agents you want to use with Avatar:

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

6. Enter your gateway auth credential on the main page and click Connect.

7. Paste a public avatar image URL (optional, default provided).

```
https://e9riw81orx.ufs.sh/f/z2nBEp3YISrtPNwLc0haBifGpR5UHA49jYDwQzbvS3mgVqLM
```

Image tips: [https://lemonslice.com/docs/avatar-design](https://lemonslice.com/docs/avatar-design) 

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

`avatar.verbose` defaults to `false`. When it is `false`, the gateway log only receives Avatar sidecar-ready, session start/end lifecycle events, and the worker progress state changes shown above the avatar in the main view. Set it to `true` to restore the full Avatar event stream.

## Usage tips

- The plugin is best used in a Chromium-based browser.
- If you choose to use the picture-in-picture view for the avatar, **do not close the avatar tab**.
- Avatar image tips: [https://lemonslice.com/docs/avatar-design](https://lemonslice.com/docs/avatar-design) 
- Avatar timeout (seconds)- defaults to `60`. This defines how long your avatar will remain in the chat without interaction.

## Update

The plugin can be updated to the latest version using:

```bash
openclaw plugins update openclaw-avatar  
```

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
