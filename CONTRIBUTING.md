# Contributing to OpenClaw Avatar

Thanks for taking the time to contribute to OpenClaw Avatar.

We welcome bug reports, documentation updates, tests, fixes, and thoughtful feature improvements. Please keep changes focused, well-explained, and aligned with the existing plugin behavior.

## Ground Rules

- Be respectful and constructive in issues, pull requests, and reviews.
- Follow the expectations in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Do not commit secrets, API keys, tokens, or private credentials.
- Update documentation when setup steps, config, or user-facing behavior changes.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Build the plugin:

```bash
npm run build
```

3. Run the test and validation suite before opening a pull request:

```bash
npm run validate
```

If you are working on a smaller change, these scripts can also be run individually:

```bash
npm run lint         # Check lint and formatting (Biome)
npm run typecheck    # TypeScript type checking
npm test             # Unit and integration tests
npm run pack:check   # Verify the package builds correctly
```

## Project Layout

- `avatar/` contains the plugin runtime and sidecar logic (TypeScript, compiled to `dist/`).
- `web/` contains the browser UI for the avatar experience.
  - `web/src/` contains the modular TypeScript source (`gateway/`, `avatar/`, `chat/`, `ui/`).
  - `web/dist/` contains the bundled output (built via `npm run build:web`).
- `styles/` contains shared and page-specific stylesheets.
- `scripts/` contains build and packaging helpers.
- `test-utils/` contains shared test helpers and runtime mocks.

## Pull Request Expectations

- Describe the problem being solved and the approach you took.
- Include testing notes with the commands you ran.
- Add or update tests when behavior changes.
- Include screenshots or short recordings for UI changes when helpful.
- Keep pull requests narrow in scope when possible.

## Releases

Release steps and GitHub Actions setup are documented in [RELEASING.md](RELEASING.md).

## Code Style

- This project uses [Biome](https://biomejs.dev/) for linting and formatting. Run `npm run lint` to check and `npm run lint:fix` to auto-fix.
- Run `npm run format` to format all source files.
- Match the existing style and file structure.
- Prefer small, readable changes over broad refactors.
- Avoid unrelated cleanup in the same pull request.

## Reporting Bugs and Suggesting Changes

When opening an issue or pull request, include enough detail for someone else to reproduce or evaluate the change quickly:

- what happened
- what you expected
- steps to reproduce
- relevant logs, screenshots, or config snippets

## License

By contributing to this repository, you agree that your contributions will be licensed under the same license as the project.
