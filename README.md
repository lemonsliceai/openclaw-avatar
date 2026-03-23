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
- [Configure](#configure)
- [Join avatar session](#join-avatar-session)
- [Usage tips](#usage-tips)
- [Update](#update)
- [About The Install Warning](#about-the-install-warning)
- [License](#license)

<a id="prerequisites"></a>
## Prerequisites

### OpenClaw

Before installing and running this plugin, you must have an OpenClaw instance installed and configured.

- OpenClaw [install guide](https://docs.openclaw.ai/install#npm-pnpm)

After installing OpenClaw, configure at least one LLM provider before you install this plugin. We highly recommend using a fast model for a better experience. e.g. gpt-5-nano

```bash
openclaw config
```

### Providers

You will also need API keys with the following service providers:

- **LemonSlice** — real-time avatar. Get API key: https://lemonslice.com/agents/api  

- **LiveKit** — real-time video/audio infrastructure. Sign up at https://livekit.io

<a id="quickstart"></a>
## Quickstart

1. Install and configure OpenClaw with a working LLM provider by running `openclaw config`.

2. Install and enable the plugin:

```bash
openclaw plugins install openclaw-avatar-do-not-install-7f3c9d1@latest
openclaw plugins enable avatar
```

3. Run the plugin setup command and enter your LemonSlice and LiveKit credentials. Make sure OpenClaw already has speech-to-text and text-to-speech configured for the agents you want to use with Avatar:

```bash
openclaw avatar-setup
```

4. Start the OpenClaw gateway:

```bash
openclaw gateway run
```

5. Open the session UI for OpenClaw Avatar Chat:

```text
http://127.0.0.1:18789/plugins/avatar/
```

6. Paste a public avatar image URL, leave the session key as `main` unless you already use a different OpenClaw session, and start the session.

When setup is complete, the plugin config page should show green `OK` indicators for both Gateway and Config:

```text
http://127.0.0.1:18789/plugins/avatar/config
```

## Configure

The plugin can be configured with either the CLI (recommended) or the browser UI. The CLI path is the fastest option for most users. If you choose the browser UI, you must first [run the OpenClaw gateway](#run-gateway).

### CLI Config 

```bash
openclaw avatar-setup
```

This command is the recommended setup flow because it walks you through the required plugin credentials in one place.

### Browser Config

1. [Run the gateway](#run-gateway)

2. [Open the plugin UI](http://127.0.0.1:18789/plugins/avatar/config)

3. Set gateway token, click "Use Token"

4. Set provider values, click "Save"

Browser Config link
```text
http://127.0.0.1:18789/plugins/avatar/config
```

**Once the plugin is properly configured the Gateway and Config status indicators (top bar of plugin web UI) will read "OK" and show green lights.**

![Green Config](assets/GreenConfig.png)

<a id="run-gateway"></a>
### Run Gateway

Start

```bash
openclaw gateway run
```

If the gateway is currently running, it can be stopped by using:

```bash
openclaw gateway stop
```

The gateway can also be forcefully re-run:

```bash
openclaw gateway run --force
```

<a id="join-avatar-session"></a>
## Join avatar session

Open the session UI, fill in the form, and start your avatar session:

```text
http://127.0.0.1:18789/plugins/avatar/
```

Plugin documentation is also available in the web UI at:

```text
http://127.0.0.1:18789/plugins/avatar/readme
```

If you choose to use the picture-in-picture view for the avatar, do not close the avatar tab.

Session form fields:

- **Avatar image URL** - required for each session start.
- **Avatar timeout (seconds)** - defaults to `60`.

Session key tips:

- Leave the Session key field blank, or enter `main`, to use the default OpenClaw session key from `session.mainKey` (fallback: `main`).
- Enter a plain key like `research` if that is the session name you started in OpenClaw.
- For the default OpenClaw main agent, the fully qualified agent session key format is `agent:main:<sessionKey>`, for example `agent:main:main`.
- If OpenClaw already shows a full agent session key, paste it into the field exactly as-is.

Typical first run:

1. Keep the session key as `main`.

2. Paste your public avatar image URL.

3. Pick an avatar aspect ratio. Leave it at `16x9` unless your source image works better in one of the supported portrait or landscape ratios below.

4. Leave avatar timeout at `60` unless you need a different value.

5. Start the session and begin chatting through the page controls.

<a id="update"></a>
## Update

The plugin can be updated to the latest version using:

```bash
openclaw plugins update avatar  
```

<a id="license"></a>
## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
