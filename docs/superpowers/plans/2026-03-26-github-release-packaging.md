# GitHub Release Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CI release packaging that builds an unsigned macOS Apple Silicon `.dmg` and an unsigned Windows NSIS installer `.exe`, then uploads both to a GitHub Release for `v*` tags or manual dispatch.

**Architecture:** Keep Electron Forge for local development and introduce Electron Builder only for CI release packaging. Use one GitHub Actions workflow that resolves a target tag, runs native builds on macOS and Windows runners, filters to the user-facing installers, and publishes those assets to the matching GitHub Release.

**Tech Stack:** Electron Forge, Electron Builder, GitHub Actions, Node.js, npm

---

## File Structure

- Create: `electron-builder.json5`
  Responsibility: release-only packaging config for macOS `dmg` and Windows `nsis`.
- Modify: `package.json`
  Responsibility: add CI-facing scripts and dependencies for release packaging.
- Create: `.github/workflows/release.yml`
  Responsibility: build and publish release installers on tags and manual dispatch.
- Optional modify if needed during implementation: `.gitignore`
  Responsibility: ignore new builder output folders only if they are not already covered.

### Task 1: Add Electron Builder Release Configuration

**Files:**
- Create: `electron-builder.json5`
- Modify: `package.json`

- [ ] **Step 1: Inspect current package metadata and resource requirements**

Run: `sed -n '1,220p' package.json && sed -n '1,260p' forge.config.ts`
Expected: confirm `productName`, app entrypoint, and the required `resources/models` packaging rule.

- [ ] **Step 2: Write the failing packaging assumption checklist**

Document in the implementation notes for this task:
- builder must include `resources/models`
- builder must target `mac dmg arm64`
- builder must target `win nsis`
- builder must not auto-publish

Expected: a short checklist exists before config is written so implementation stays aligned with the spec.

- [ ] **Step 3: Create minimal Electron Builder config**

Write `electron-builder.json5` with:

```json5
{
  "appId": "me.timlau.electronsherpaonnxdemo",
  "productName": "electron-sherpa-onnx-node-demo",
  "directories": {
    "output": "release"
  },
  "files": [
    ".vite/**/*",
    "package.json",
    "node_modules/**/*"
  ],
  "extraResources": [
    {
      "from": "resources/models",
      "to": "models"
    }
  ],
  "mac": {
    "target": [
      {
        "target": "dmg",
        "arch": [
          "arm64"
        ]
      }
    ],
    "category": "public.app-category.utilities"
  },
  "win": {
    "target": [
      {
        "target": "nsis",
        "arch": [
          "x64"
        ]
      }
    ]
  },
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true
  },
  "publish": null
}
```

Expected: config expresses the requested release formats without changing Forge behavior.

- [ ] **Step 4: Add release packaging dependencies and scripts**

Update `package.json` to add:

```json
{
  "scripts": {
    "release:build": "electron-vite build || npm run package -- --help >/dev/null",
    "release:mac": "electron-builder --config electron-builder.json5 --mac dmg --arm64 --publish never",
    "release:win": "electron-builder --config electron-builder.json5 --win nsis --x64 --publish never"
  },
  "devDependencies": {
    "electron-builder": "<current-compatible-version>"
  }
}
```

Implementation note: adapt the build command to this repo's actual bundling path; if no standalone build script exists, use the Forge/Vite-compatible build command that produces `.vite/build`.

- [ ] **Step 5: Run dependency installation to update the lockfile**

Run: `npm install`
Expected: `package-lock.json` records `electron-builder` and any builder-side dependencies.

- [ ] **Step 6: Verify the builder config parses**

Run: `npx electron-builder --config electron-builder.json5 --help`
Expected: command exits successfully and recognizes the config file.

- [ ] **Step 7: Commit the configuration task**

Run:

```bash
git add electron-builder.json5 package.json package-lock.json
git commit -m "feat: add release packaging configuration"
```

Expected: packaging configuration lands as one focused commit.

### Task 2: Add GitHub Actions Release Workflow

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `package.json` if script names need adjustment after workflow dry-run review

- [ ] **Step 1: Write the workflow contract before implementation**

Record these requirements in the task notes:
- trigger on `push.tags: v*`
- support `workflow_dispatch` with a required `tag`
- resolve the effective tag once and share it with downstream jobs
- create-or-update the GitHub Release
- upload only `.dmg` and `.exe`

Expected: the workflow implementation has a concrete checklist to match.

- [ ] **Step 2: Create the workflow skeleton**

Write `.github/workflows/release.yml` with:

```yaml
name: Release

on:
  push:
    tags:
      - "v*"
  workflow_dispatch:
    inputs:
      tag:
        description: "Existing git tag to publish"
        required: true
        type: string
```

Expected: both automatic and manual entry points are declared.

- [ ] **Step 3: Add a tag-resolution job**

Implement a first job that:
- checks out the repo with full history
- resolves `github.ref_name` for tag pushes
- validates manual input with `git rev-parse "refs/tags/$TAG"`
- writes the chosen tag to job outputs

Expected: downstream build jobs consume one canonical tag and manual runs fail fast on invalid tags.

- [ ] **Step 4: Add parallel build jobs**

Implement two jobs:
- `build-macos` on `macos-latest`
- `build-windows` on `windows-latest`

Each job should:
- check out the resolved tag
- set up Node.js with npm cache
- run `npm ci`
- run the repo build step that produces `.vite/build`
- run either `npm run release:mac` or `npm run release:win`
- locate only the final installer file under `release/`
- upload that file via `actions/upload-artifact`

Expected: each platform job emits exactly one installer artifact.

- [ ] **Step 5: Add the publish job**

Implement a publish job that:
- depends on both build jobs
- downloads the temporary artifacts
- uses `softprops/action-gh-release` or `gh release upload` with overwrite behavior
- creates the Release if missing
- updates the Release if present

Expected: reruns are idempotent and attach only the final installers.

- [ ] **Step 6: Add least-privilege permissions**

Set workflow or job permissions to include:

```yaml
permissions:
  contents: write
```

Expected: the workflow can create releases and upload assets without requesting broader scopes.

- [ ] **Step 7: Validate artifact filtering**

Review the workflow’s file matching logic so it selects:
- macOS: `*.dmg`
- Windows: `*.exe`

And excludes:
- `*.blockmap`
- `latest*.yml`
- unpacked directories

Expected: the Release contains only end-user installers.

- [ ] **Step 8: Commit the workflow task**

Run:

```bash
git add .github/workflows/release.yml package.json
git commit -m "feat: add github release workflow"
```

Expected: CI release automation lands as a separate focused commit.

### Task 3: Verify Locally And Prepare CI Rollout

**Files:**
- Modify: `.github/workflows/release.yml` only if validation reveals path or artifact issues
- Modify: `package.json` only if validation reveals script mismatches

- [ ] **Step 1: Verify repository status before checks**

Run: `git status --short`
Expected: only the planned release automation files are changed.

- [ ] **Step 2: Validate package scripts without publishing**

Run: `npm run release:mac -- --help`
Expected: the script resolves and starts Electron Builder on a compatible machine.

Run: `npm run release:win -- --help`
Expected: the script resolves and starts Electron Builder on a compatible machine.

Implementation note: on a non-Windows machine, full NSIS packaging is not expected to complete; command validation is enough locally.

- [ ] **Step 3: Validate the workflow YAML**

Run one of:
- `npx prettier .github/workflows/release.yml --check`
- `yamllint .github/workflows/release.yml`

Expected: workflow syntax is valid.

- [ ] **Step 4: Review the final diff for scope**

Run: `git diff --stat HEAD~2..HEAD` or `git diff --stat`
Expected: only builder config, package metadata, lockfile, and release workflow changes are present.

- [ ] **Step 5: Document manual post-merge verification**

Record the release verification checklist:
- push a test tag like `v1.0.1`
- or run `workflow_dispatch` with an existing tag
- confirm one `.dmg` and one `.exe` are attached to the Release
- confirm there are no `.blockmap`, `.yml`, or unpacked assets

Expected: rollout steps are clear for the maintainer.

- [ ] **Step 6: Commit any validation fixes**

Run:

```bash
git add .github/workflows/release.yml package.json package-lock.json electron-builder.json5
git commit -m "chore: polish release packaging validation"
```

Expected: only real validation-driven fixes are committed; skip this commit if no further changes were needed.
