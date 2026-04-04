# CLAUDE.md

This file provides context for Claude Code when working in this repository.

## Project

OpenClaw Avatar is a plugin that adds real-time video avatar conversations to OpenClaw. Users speak (or type), the OpenClaw agent responds, and a LemonSlice-powered avatar renders the response with lip-synced video.

## Build and Test Commands

```bash
npm install          # Install dependencies
npm run build        # Build backend (avatar/) to dist/
npm run build:web    # Build frontend (web/src/) to web/dist/
npm run build:all    # Build both
npm run typecheck    # TypeScript check (backend + web)
npm test             # Run tests (vitest)
npm run validate     # Full check: typecheck + test + pack:check
npm run lint         # Lint with Biome
npm run format       # Format with Biome
```

Always run `npm run validate` before opening a PR.

## Architecture

- **`avatar/`** — Backend gateway plugin (TypeScript, Node.js). `index.ts` is the main entry point. A sidecar child process runs the LiveKit agent runtime.
- **`web/src/`** — Frontend browser app (vanilla TypeScript, no framework). Organized into `avatar/`, `chat/`, `gateway/`, `ui/` domains with shared `state.ts`.
- **`scripts/`** — Build and release helpers (esbuild).
- **`test-utils/`** — Shared mocks for the OpenClaw plugin SDK.

## Code Style

- Functional/modular style, not class-based OOP.
- 2-space indentation, double quotes, semicolons.
- Biome handles linting and formatting. Run `npm run lint` to check, `npm run format` to fix.
- TypeScript strict mode is enabled for both backend and frontend.
- Match existing patterns in the file you are editing.

## Key Conventions

- State lives in `web/src/state.ts` as a single shared object. Modules import and mutate it directly.
- The sidecar process (`avatar-agent-runner.js`) runs in isolation from the gateway. Do not merge them.
- Backend uses `node:` protocol for Node.js imports.
- Frontend targets ES2022 with bundler module resolution (esbuild).
- Tests use vitest. Plugin SDK is mocked via path aliases in `vitest.config.ts`.
