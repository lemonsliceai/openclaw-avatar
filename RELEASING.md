# Releasing OpenClaw Avatar

This repository is set up so you can merge to `main`, then click `Run workflow` in GitHub Actions to create and publish a release to both npm and ClawHub.

## Release flow

1. Merge the changes you want to release into `main`.
2. Open `Actions` in GitHub and run the `Release` workflow on the `main` branch.
3. Choose `patch`, `minor`, `major`, or `prerelease`.
4. GitHub will pause for `release` environment approval before the job can access publish secrets.
5. After approval, the workflow will:

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
- Provenance is generated automatically for public packages from public repos when npm trusted publishing is used.
