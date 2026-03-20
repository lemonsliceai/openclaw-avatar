# Openclaw - Avatar Plugin

Give your Openclaw agents a face! Avatar enables a real time video avatar for any of your Openclaw agents. Now you can speak directly with your agent and bring them anywhere on your desktop!

Avatar is an OpenClaw plugin that integrates LemonSlice and LiveKit to deliver a real-time avatar experience with plugin-managed setup, browser session controls, text chat, and avatar speech routed through OpenClaw's shared speech/media runtime.

<div>
  <a href="https://www.loom.com/share/307a34384a0b4dc4a5391d8bbc9accf7">
    <p>Avatar Demo - Watch Video</p>
  </a>
  <a href="https://www.loom.com/share/307a34384a0b4dc4a5391d8bbc9accf7">
    <img
      src="https://cdn.loom.com/sessions/thumbnails/307a34384a0b4dc4a5391d8bbc9accf7-5fbac2c9d95c536d-full-play.gif#t=0.1"
      alt="Avatar demo video thumbnail"
    />
  </a>
</div>

**Outline**

- [Prerequisites](#prerequisites)
- [Quickstart](#quickstart)
- [Install](#install)
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

After installing OpenClaw, configure at least one LLM provider before you install this plugin. We highly recommend using a fast model for a better experience. Examples below.
- qwen3-30B-A3B
- gpt-5-nano
- claude-haiku-4-5

```bash
openclaw config
```

For plugin submission and reviewer setup, this `openclaw config` step is required. After configuring a valid LLM provider, make sure your agent is also set up with a primary model:

```text
http://127.0.0.1:18789/agents
```

### Providers

You will also need accounts with the following service providers:

- **LemonSlice** — provides the avatar/character rendering for the avatar experience.
  Sign up at https://www.lemonslice.com

- **OpenClaw speech/media providers** — Avatar now prefers whatever TTS and audio-transcription capabilities you have already configured in OpenClaw for your agents.
  Configure those first in OpenClaw so avatar reply speech and browser voice transcription can use the shared runtime contracts.

- **LiveKit** — provides the real-time video/audio room infrastructure.
  Sign up at https://livekit.io

- **Publicly Accessible Image URL** - The source image for the avatar.
  Sample image URL: `https://e9riw81orx.ufs.sh/f/z2nBEp3YISrtNkoagYf5CBjh3ZkFEumULAJYeQriWT8tg79y`

Once you have accounts, retrieve API keys from each service and supply them during plugin setup. Enter the avatar image URL on the main session page when you start a session.

<a id="quickstart"></a>
## Quickstart

If you want the shortest path from install to first conversation, follow these steps in order:

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

5. Open the session UI:

```text
http://127.0.0.1:18789/plugins/avatar/
```

6. Paste a public avatar image URL, leave the session key as `main` unless you already use a different OpenClaw session, and start the session.

When setup is complete, the plugin config page should show green `OK` indicators for both Gateway and Config:

```text
http://127.0.0.1:18789/plugins/avatar/config
```

<a id="install"></a>
## Install

Plugin installation:

```bash
openclaw plugins install openclaw-avatar-do-not-install-7f3c9d1@latest
openclaw plugins enable avatar
openclaw plugins list
```

Verify that Avatar is listed. 

<a id="configure"></a>
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

<a id="usage-tips"></a>
## Usage tips

- The plugin is best used in a Chromium-based browser.

Best image sizes:

| aspect_ratio | resolution |
|--------------|------------|
| 2x3          | 368×560    |
| 3x2          | 560×368    |
| 9x16         | 336×608    |
| 16x9         | 608×336    |

<a id="update"></a>
## Update

The plugin can be updated to the latest version using:

```bash
openclaw plugins update avatar  
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

<a id="license"></a>
## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
