# Releasing OpenClaw Avatar

This repository is set up so normal changes merge to `main`, then release preparation happens in a dedicated PR before anything is published.

## Release flow

1. Merge the changes you want to release into `main`.
2. Open `Actions` in GitHub and run the `Prepare Release` workflow on the `main` branch.
3. Choose `patch`, `minor`, `major`, or `prerelease`.
4. The workflow will:

- run `npm version ... --no-git-tag-version`
- sync `openclaw.plugin.json` and `package-lock.json`
- run the existing validation suite
- create a `release/vX.Y.Z` branch
- commit the release metadata on that branch
- open a release PR back to `main`

5. Merge that release PR through the normal protected-branch flow.
6. Open `Actions` in GitHub and run the `Publish Release` workflow on the `main` branch.
7. Confirm `main` is currently at the prepared release merge commit you want to publish.
8. Leave `publish_to_clawhub` unchecked unless you explicitly want to push this release to ClawHub.
9. GitHub will pause for `release` environment approval before the publish job can access publish secrets.
10. After approval, the publish workflow will:

- create and push the `vX.Y.Z` tag from the current `main` commit
- publish to npm
- optionally publish to ClawHub when `publish_to_clawhub` is enabled
- create or update the GitHub Release entry

## Recovery

If publishing partially fails after the release PR is merged, rerun `Publish Release` on `main` while `main` still points at the same release commit.

## Notes

- The prepare and publish workflows must both run from `main`.
- `RELEASE_PUSH_TOKEN` is recommended for `Prepare Release` so the generated PR behaves like a normal PR and can trigger follow-on workflows.
- `CLAWHUB_TOKEN` must be configured as a GitHub Actions secret in the `release` environment.
- The publish workflow uses the current `main` commit and does not verify that it came from the release PR flow.
- ClawHub publishing is opt-in per manual release run and defaults to off.
- Tags stay in the default npm format, for example `v0.1.40`.
- Provenance is generated automatically for public packages from public repos when npm trusted publishing is used.
- npm trusted publishing currently requires Node `22.14.0+` and npm CLI `11.5.1+`, so the workflow upgrades npm explicitly before publishing.
