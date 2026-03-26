# GitHub Release Packaging Design

## Summary

This project should publish downloadable desktop installers to GitHub Releases for two targets:

- macOS Apple Silicon (`arm64`) as a `.dmg`
- Windows as a mainstream installer, implemented as an NSIS `.exe`

The release pipeline should support both automatic publishing on `v*` tags and manual re-runs via GitHub Actions. The packages will be unsigned and unnotarized for now. The existing Electron Forge local development workflow should remain intact; release packaging in CI will use Electron Builder because it produces the desired `.dmg` and NSIS outputs more naturally than the current Forge maker configuration.

## Goals

- Publish macOS Apple Silicon `.dmg` artifacts to GitHub Releases.
- Publish Windows NSIS installer `.exe` artifacts to GitHub Releases.
- Trigger automatically when a `v*` git tag is pushed.
- Support manual release publishing for an existing tag through `workflow_dispatch`.
- Upload only end-user installer artifacts, not intermediate packaging outputs.
- Keep the current local Electron Forge developer workflow unchanged.

## Non-Goals

- Code signing or notarization for macOS builds.
- Windows code signing.
- Linux packaging changes.
- Replacing Electron Forge for local development.
- Adding auto-update feeds or delta update infrastructure.

## Architecture

The repository will use a split packaging model:

- Electron Forge remains the tool for local development and existing packaging scripts already used by the repo.
- Electron Builder is added only for release packaging in CI.
- A single GitHub Actions workflow orchestrates release builds for macOS and Windows and attaches the final artifacts to a GitHub Release.

This keeps the current project structure stable while allowing release outputs that match the requested formats.

## Components

### 1. Electron Builder Configuration

A new Electron Builder config file will define release-only packaging behavior:

- mac target: `dmg`
- mac arch: `arm64`
- win target: `nsis`
- artifact naming that includes product name, version, platform, and arch where useful
- inclusion of the packaged model resources required by the app
- disabling publish-from-builder behavior so GitHub Actions stays in control of Release creation and asset upload

The config should point Electron Builder at the app entry points already produced by the existing project build pipeline and preserve the current resource packaging behavior for `resources/models`.

### 2. Package Scripts

`package.json` should gain release-oriented scripts for CI usage. These scripts should:

- build the app for distribution
- run Electron Builder for macOS arm64
- run Electron Builder for Windows NSIS

The scripts should be explicit so the workflow can invoke the correct target on each OS without branching logic hidden in shell commands.

### 3. GitHub Actions Workflow

One workflow file under `.github/workflows/` will handle release publishing.

#### Trigger behavior

- `push` on tags matching `v*`
- `workflow_dispatch` with an input for a tag name

#### Tag resolution

- For tag pushes, the workflow uses the pushed tag.
- For manual runs, the workflow uses the provided tag and fails clearly if the tag does not exist.

#### Build matrix

The workflow will run two jobs in parallel:

- `macos-latest` to build the Apple Silicon `.dmg`
- `windows-latest` to build the NSIS `.exe`

Each job will:

- check out the repository at the selected tag
- set up Node.js
- install dependencies with `npm ci`
- run the appropriate Electron Builder script
- collect only the intended final installer artifact
- upload it as a temporary workflow artifact for the publish job

#### Publish job

A final publish job will:

- wait for both build jobs
- create the GitHub Release if it does not exist
- reuse the existing GitHub Release if it already exists
- upload the macOS `.dmg` and Windows `.exe`
- overwrite matching assets on re-run so manual recovery is straightforward

The workflow should use the repository `GITHUB_TOKEN`, which is sufficient for release creation and asset uploads in a standard public repository.

## Data Flow

1. A `v*` tag is pushed, or a manual workflow run is started with a tag input.
2. The workflow resolves the effective release tag.
3. The macOS runner checks out that tag and builds the `.dmg`.
4. The Windows runner checks out that tag and builds the NSIS `.exe`.
5. Each runner uploads only its final installer artifact to the workflow run.
6. The publish job downloads the two installer artifacts.
7. The publish job creates or updates the GitHub Release for the tag.
8. The release ends with exactly the user-facing installer assets attached.

## Artifact Rules

Only the following release assets should be published:

- one macOS Apple Silicon `.dmg`
- one Windows NSIS `.exe`

The workflow should intentionally avoid uploading:

- unpacked application directories
- blockmap files
- generated metadata files
- zip artifacts
- builder temp outputs
- extra Windows helper files unless they are required for installation

If Electron Builder generates both an installer and auxiliary metadata, the workflow should explicitly select only the installer asset.

## Error Handling

The release process should fail early and clearly in these situations:

- the manually provided tag does not exist
- required model assets are missing from `resources/models`
- Electron Builder does not produce the expected `.dmg` or `.exe`
- the workflow lacks permission to create or update the GitHub Release

The workflow should also be safe to re-run:

- re-running a failed publish for the same tag should update the existing Release assets rather than requiring manual cleanup

## Testing Strategy

Validation should focus on configuration correctness and CI safety:

- local config sanity check by installing dependencies and validating the new package scripts
- workflow YAML validation by inspecting syntax and required permissions
- a manual dry run path through `workflow_dispatch` against an existing tag after merge
- verification that the resulting Release contains only the `.dmg` and `.exe`

Because macOS and Windows packaging require their native runners, end-to-end verification is expected to happen in GitHub Actions rather than entirely on a single local machine.

## Risks And Trade-Offs

### Adding Electron Builder Beside Electron Forge

This introduces a second packaging tool, which adds some maintenance overhead. That trade-off is acceptable because it avoids destabilizing the existing Forge-based development flow while meeting the requested release formats precisely.

### Unsigned And Unnotarized Distribution

The produced installers will download and attach correctly, but end users will encounter the usual OS trust warnings. This is expected and acceptable for the current scope.

### macOS Runner Architecture

The workflow will request an Apple Silicon artifact. If GitHub-hosted runner behavior changes or arm64 packaging support becomes inconsistent, the builder config may need adjustment. For current planning purposes, targeting `arm64` on the macOS runner is the intended behavior.

## Open Decisions Already Resolved

The following decisions are fixed for implementation:

- automatic release on `v*` tags: yes
- manual re-publish support: yes
- mac format: unsigned, unnotarized `dmg`
- windows format: unsigned NSIS installer `.exe`
- release upload scope: only end-user installer artifacts
- release strategy: create if missing, update if present

## Implementation Readiness

This spec is ready for implementation planning. The work is focused on one feature set: release packaging and publishing for macOS and Windows in GitHub Actions. It does not require unrelated application code changes.
