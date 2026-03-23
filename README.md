# Openclaw - Avatar Plugin

Give your OpenClaw agent a face! The Avatar Plugin allows you to have a real-time, interactive video call with your agent. 
The avatar listens to you, sends your speech to your OpenClaw agent, and speaks the response back with lip-synced video. It’s like FaceTime.  

Design your OpenClaw’s face to match its personality. Unlimited avatar options. Powered by LemonSlice, real-time AI avatar technology. 

## How it Works
You speak (or type) → Avatar transcribes → OpenClaw processes → Avatar speaks response
This plugin works with the OpenClaw gateway. It allows you to have a floating FaceTime-style avatar on your screen while you work. 
## Features
- Real-time video avatar 
- Expressive lip sync and whole body gestures
- Voice-to-voice conversations
- Design your own avatar (just one photo!) 
- Picture-in-picture experience (have the avatar hangout while you work) 

**Outline**

- [Prerequisites](#prerequisites)
- [Quickstart](#quickstart)
- [Join avatar session](#join-avatar-session)
- [Config](#config)
- [Usage tips](#usage-tips)
- [Update](#update)
- [License](#license)

<a id="prerequisites"></a>
## Prerequisites

### OpenClaw

Before installing and running this plugin, you must have an OpenClaw instance installed and configured with at least one LLM provider, and TTS and STT capabilties.

- OpenClaw [getting started](https://docs.openclaw.ai/start/getting-started)

We recommend using a fast model for a better experience. e.g. gpt-5-nano

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

1. Install and enable the plugin:

```bash
openclaw plugins install @lemonslice/avatar@latest
openclaw plugins enable avatar
```

2. Allow the Avatar plugin:

`openclaw.json`
```
"plugins": {
    ...
    "allow": [
      "avatar"],
    ...
}
```
or via gateway UI

http://127.0.0.1:18789/automation

3. Run the plugin setup command and enter your LemonSlice and LiveKit credentials. Make sure OpenClaw already has speech-to-text and text-to-speech configured for the agents you want to use with Avatar:

```bash
openclaw avatar-setup
```

4. Restart the OpenClaw gateway:

```bash
openclaw gateway run --force
```

5. Open the session UI for OpenClaw Avatar Chat:

```text
http://127.0.0.1:18789/plugins/avatar/
```

6. Paste a public avatar image URL, leave the session key as `main` unless you already use a different OpenClaw session, and start the session.

<a id="config"></a>
## Config

In `openclaw.json`

```json
{
  "plugins": {
    ...
    "entries": {
      "avatar": {
        "config": {
          "avatar": {
            "provider": "lemonslice",
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
    },
    ...
  }
}
```

<a id="usage-tips"></a>
## Usage tips

- The plugin is best used in a Chromium-based browser.
- If you choose to use the picture-in-picture view for the avatar, **do not close the avatar tab** .
- Avatar image tips: https://lemonslice.com/docs/avatar-design 
- Avatar timeout (seconds)- defaults to `60`. This defines how long your avatar will remain in the chat without interaction.

<a id="update"></a>
## Update

The plugin can be updated to the latest version using:

```bash
openclaw plugins update avatar  
```

<a id="license"></a>
## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
