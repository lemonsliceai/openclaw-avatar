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
6. The `Publish Release` workflow runs automatically from the merged `main` commit.
7. GitHub will pause for `release` environment approval before the publish job can access publish secrets.
8. After approval, the publish workflow will:

- create and push the `vX.Y.Z` tag from the merged `main` commit
- publish to npm
- publish to ClawHub
- create or update the GitHub Release entry

## Recovery

If publishing partially fails after the release PR is merged, rerun the failed `Publish Release` workflow run for that commit.

## Notes

- The prepare and publish workflows must both run from `main`.
- `RELEASE_PUSH_TOKEN` is recommended for `Prepare Release` so the generated PR behaves like a normal PR and can trigger follow-on workflows.
- `CLAWHUB_TOKEN` is still required in the `release` environment for publishing to ClawHub.
- The publish workflow only proceeds for commits associated with a prepared release PR.
- Tags stay in the default npm format, for example `v0.1.40`.
- Provenance is generated automatically for public packages from public repos when npm trusted publishing is used.
