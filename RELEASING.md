# Releasing OpenClaw Avatar

This repository is set up so you can merge to `main`, then click `Run workflow` in GitHub Actions to create and publish a release to both npm and ClawHub.

## One-time setup

Add these repository secrets in GitHub:

- `NPM_TOKEN`: npm publish token for `@lemonsliceai/openclaw-avatar`
- `CLAWHUB_TOKEN`: ClawHub token for an account that can publish this package
- `RELEASE_PUSH_TOKEN` (optional): fine-grained GitHub token for a bot or app that is allowed to push the automated release commit back to `main`

The release workflow lives at `.github/workflows/release.yml`.

If `main` is protected, GitHub has to allow this workflow to push the release commit and tag:

- If your repository is in an organization, add the GitHub Actions app, or the bot/app behind `RELEASE_PUSH_TOKEN`, to the branch protection bypass or push-allow list for `main`.
- If `Do not allow bypassing the above settings` is enabled, this workflow cannot write the release commit back to `main`.

## Release flow

1. Merge the changes you want to release into `main`.
2. Open `Actions` in GitHub and run the `Release` workflow on the `main` branch.
3. Choose `patch`, `minor`, `major`, or `prerelease`.
4. The workflow will:

- run `npm version ... --no-git-tag-version`
- run the existing validation suite
- sync `openclaw.plugin.json` and `package-lock.json`
- commit the release metadata back to `main`
- create and push a `vX.Y.Z` tag
- publish to npm
- publish to ClawHub
- create the GitHub Release entry

## Recovery

If a release partially fails after the version bump commit is already on `main`, rerun the same workflow with:

- branch: `main`
- `reuse_current_version`: `true`

That republishes the version already checked into `main` without incrementing again.

## Notes

- The workflow must be run on `main`.
- Tags stay in the default npm format, for example `v0.1.40`.
- If you use npm trusted publishing instead of an npm token later, the workflow already has the required `id-token: write` permission.
