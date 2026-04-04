# Architecture

This document describes the high-level architecture of OpenClaw Avatar to help contributors navigate the codebase.

## System Overview

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

**Data flow:** User speaks (or types) -> browser captures speech -> WebSocket to gateway -> OpenClaw LLM processes -> TTS response -> LiveKit room -> LemonSlice avatar renders lip-synced video in browser.

## Two Domains

### Backend: `avatar/`

The gateway plugin that runs inside the OpenClaw process.

| File | Purpose |
|------|---------|
| `index.ts` | Plugin entry point. Registers gateway request handlers, manages sessions, routes chat messages, handles config and credentials. |
| `sidecar-process-control.ts` | Starts, monitors, and stops the LiveKit agent sidecar as a child process. Handles crash recovery and idle shutdown. |
| `avatar-agent-runner.js` | The sidecar entry point. Runs the LiveKit agent runtime with the LemonSlice avatar plugin in an isolated process. |
| `avatar-agent-bridge.mjs` | Communication bridge between the sidecar agent and the main gateway process. |
| `avatar-aspect-ratio.ts` | Aspect ratio constants and validation. |

The sidecar architecture isolates the long-lived LiveKit agent runtime from the gateway process, allowing independent restart and crash recovery.

### Frontend: `web/src/`

A vanilla TypeScript browser application (no framework). Organized by feature domain:

| Directory | Purpose |
|-----------|---------|
| `avatar/` | Session lifecycle, LiveKit room connection, speech capture (VAD, echo suppression), picture-in-picture. |
| `chat/` | Message types, chat input/composer, message rendering. |
| `gateway/` | WebSocket connection to gateway, auth handshake, reconnect with exponential backoff. |
| `ui/` | Layout management (resizable panes), setup/config UI, status display, theme toggle. |

Shared modules at the `web/src/` root:

| File | Purpose |
|------|---------|
| `app.ts` | Bootstrap orchestrator. Imports all modules, queries DOM, wires callbacks, runs init sequence. No business logic. |
| `state.ts` | Single centralized state object. All modules read/write from this shared object directly. |
| `types.ts` | TypeScript interfaces for the frontend domain. |
| `constants.ts` | Configuration values, storage keys, protocol constants, thresholds. |
| `utils.ts` | Small shared helpers. |

## State Management

State is a single plain object in `web/src/state.ts` with domain-specific sub-objects (`gateway`, `room`, `media`, `chat`, `ui`, etc.). Modules import and mutate it directly. There is no reactivity framework or change notification system.

## Key Design Decisions

- **Functional/modular over class hierarchies.** The domain is pipeline-shaped, not taxonomy-shaped. Functions compose better for real-time media processing.
- **Sidecar process for the agent runtime.** Isolates LiveKit/LemonSlice from the gateway process for independent lifecycle management and crash recovery.
- **No frontend framework.** The UI is thin enough that vanilla DOM manipulation keeps the bundle small and avoids framework churn.
- **Centralized shared state.** Simpler than prop-drilling or a pub/sub system for a codebase of this size.
