# Realtime ASR Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal Electron app that performs realtime Chinese ASR with `sherpa-onnx-node`, lets the user choose a microphone, and shows both transcript text and the raw recognizer result object.

**Architecture:** Keep microphone capture and UI in the renderer, expose a narrow IPC bridge in preload, and keep `sherpa-onnx-node` session ownership plus model path resolution in the main process. Bundle the fixed model directory into packaged app resources so the same code path works for development, macOS packaging, and Windows packaging.

**Tech Stack:** Electron Forge, Vite, TypeScript, browser MediaDevices/Web Audio APIs, `sherpa-onnx-node`

---

## Planned File Structure

**Create:**

- `resources/models/.gitkeep`
- `src/shared/asr-contract.ts`
- `src/main/model-path.ts`
- `src/main/asr-session.ts`

**Modify:**

- `package.json`
- `package-lock.json`
- `forge.config.ts`
- `src/main.ts`
- `src/preload.ts`
- `src/renderer.ts`
- `src/index.css`
- `index.html`

**Verify with:**

- `npm run lint`
- `npm run package`
- manual runtime validation with `npm start`

### File Responsibilities

- `src/shared/asr-contract.ts`
  - shared TypeScript types for IPC payloads and raw recognizer event transport
- `src/main/model-path.ts`
  - resolve model root and required file paths for dev vs packaged runtime
- `src/main/asr-session.ts`
  - wrap `sherpa-onnx-node` recognizer creation, stream lifecycle, decode loop, and raw result retrieval
- `src/main.ts`
  - browser window setup, IPC handlers, and lifecycle wiring between renderer events and ASR session
- `src/preload.ts`
  - expose safe window API for start, push audio, stop, and result/status subscriptions
- `src/renderer.ts`
  - build the page behavior, enumerate microphones, capture/resample audio, and render transcript plus raw JSON
- `src/index.css`
  - minimal layout and state styling
- `index.html`
  - simple shell markup and mount points
- `forge.config.ts`
  - package native module support and copy model resources for macOS and Windows
- `package.json`
  - add dependency and any helper scripts needed for validation

### Task 1: Install Dependency And Reserve Model Location

**Files:**

- Create: `resources/models/.gitkeep`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Add the runtime dependency**

Edit `package.json` to add `sherpa-onnx-node` to `dependencies`.

- [ ] **Step 2: Install and refresh the lockfile**

Run: `npm install`
Expected: lockfile updates and `sherpa-onnx-node` appears in `package-lock.json`

- [ ] **Step 3: Create the packaged model root placeholder**

Create `resources/models/.gitkeep` and document in code comments or later README text that the extracted model directory should live under:

```text
resources/models/sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01/
```

- [ ] **Step 4: Smoke-check dependency resolution**

Run: `npm ls sherpa-onnx-node`
Expected: exactly one installed `sherpa-onnx-node` entry

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json resources/models/.gitkeep
git commit -m "chore: add sherpa runtime dependency"
```

### Task 2: Define Shared IPC Contract

**Files:**

- Create: `src/shared/asr-contract.ts`
- Modify: `src/preload.ts`

- [ ] **Step 1: Write the shared payload types**

Create `src/shared/asr-contract.ts` with focused types, for example:

```ts
export type AsrSessionStatus =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'stopping'
  | 'error';

export interface StartAsrRequest {
  sampleRate: number;
}

export interface AudioChunkPayload {
  samples: Float32Array | number[];
}

export interface AsrResultEvent {
  text: string;
  raw: Record<string, unknown>;
}
```

- [ ] **Step 2: Add the preload-facing API surface to the same contract file**

Define a window API interface such as:

```ts
export interface SherpaAsrApi {
  startSession(request: StartAsrRequest): Promise<void>;
  pushAudioChunk(payload: AudioChunkPayload): Promise<void>;
  stopSession(): Promise<void>;
  onResult(listener: (event: AsrResultEvent) => void): () => void;
  onStatus(listener: (status: string, message?: string) => void): () => void;
}
```

- [ ] **Step 3: Make preload import the shared contract types**

Update `src/preload.ts` so later work can expose the API with the shared type definitions rather than ad hoc string payloads.

- [ ] **Step 4: Verify TypeScript still parses the contract**

Run: `npm run lint`
Expected: no new parser or import errors

- [ ] **Step 5: Commit**

```bash
git add src/shared/asr-contract.ts src/preload.ts
git commit -m "feat: define asr ipc contract"
```

### Task 3: Build Main-Process Model Path Resolution

**Files:**

- Create: `src/main/model-path.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Implement a single model root resolver**

Create `src/main/model-path.ts` with helpers that choose between:

```ts
const devRoot = path.join(app.getAppPath(), 'resources', 'models');
const packagedRoot = path.join(process.resourcesPath, 'models');
```

Return the fully qualified model directory and expected file paths for the selected sherpa model.

- [ ] **Step 2: Add explicit validation for missing assets**

Make the helper verify the required model files exist and throw a readable error when they do not.

- [ ] **Step 3: Wire a small main-process smoke usage**

Import the helper from `src/main.ts` and ensure startup code or IPC setup can surface initialization errors using this helper later.

- [ ] **Step 4: Verify lint/static checks**

Run: `npm run lint`
Expected: path helper compiles cleanly

- [ ] **Step 5: Commit**

```bash
git add src/main/model-path.ts src/main.ts
git commit -m "feat: add model path resolution"
```

### Task 4: Wrap sherpa-onnx Session Lifecycle In Main Process

**Files:**

- Create: `src/main/asr-session.ts`
- Modify: `src/main.ts`
- Modify: `src/shared/asr-contract.ts`

- [ ] **Step 1: Create a focused ASR session wrapper**

Implement a class or module in `src/main/asr-session.ts` that:

- initializes the sherpa recognizer from resolved model files
- creates a stream per user session
- accepts PCM chunks
- runs incremental decode
- returns the latest raw recognizer result
- disposes session state on stop

- [ ] **Step 2: Extend the contract only if transport needs it**

If the raw result payload needs a stronger type than `Record<string, unknown>`, update `src/shared/asr-contract.ts` minimally without reshaping the recognizer output schema.

- [ ] **Step 3: Register IPC handlers in `src/main.ts`**

Add handlers for:

- `asr:start`
- `asr:push-audio`
- `asr:stop`

and event sending for:

- `asr:result`
- `asr:status`

- [ ] **Step 4: Make error paths explicit**

Ensure main-process exceptions become structured status events instead of uncaught crashes.

- [ ] **Step 5: Verify with lint**

Run: `npm run lint`
Expected: no type or import regressions

- [ ] **Step 6: Commit**

```bash
git add src/main/asr-session.ts src/main.ts src/shared/asr-contract.ts
git commit -m "feat: add main process asr session"
```

### Task 5: Expose A Narrow Preload Bridge

**Files:**

- Modify: `src/preload.ts`
- Modify: `src/shared/asr-contract.ts`

- [ ] **Step 1: Implement the context bridge API**

Expose methods like:

```ts
contextBridge.exposeInMainWorld('sherpaAsr', {
  startSession,
  pushAudioChunk,
  stopSession,
  onResult,
  onStatus,
});
```

- [ ] **Step 2: Add listener cleanup**

Each subscription method should return an unsubscribe function so the renderer can clean up on stop or reload.

- [ ] **Step 3: Add the window typing**

Extend the renderer global typing so `window.sherpaAsr` is strongly typed.

- [ ] **Step 4: Verify lint**

Run: `npm run lint`
Expected: preload bridge is type-safe and clean

- [ ] **Step 5: Commit**

```bash
git add src/preload.ts src/shared/asr-contract.ts
git commit -m "feat: expose sherpa preload bridge"
```

### Task 6: Build The Minimal HTML Shell And Styling

**Files:**

- Modify: `index.html`
- Modify: `src/index.css`

- [ ] **Step 1: Replace the starter markup**

Edit `index.html` to include semantic containers for:

- app title
- microphone selector
- refresh button
- start button
- stop button
- status text
- transcript panel
- raw JSON panel

- [ ] **Step 2: Add minimal but readable styling**

Update `src/index.css` for:

- page spacing
- a compact control row
- clear panel borders
- readable transcript typography
- monospaced raw JSON block
- disabled button and error state styling

- [ ] **Step 3: Keep the design intentionally simple**

Do not add extra UI like history, tabs, or waveform views.

- [ ] **Step 4: Verify visual shell loads**

Run: `npm start`
Expected: the Electron window shows the new static layout before wiring live behavior

- [ ] **Step 5: Commit**

```bash
git add index.html src/index.css
git commit -m "feat: add asr page layout"
```

### Task 7: Implement Renderer Device Selection And Audio Capture

**Files:**

- Modify: `src/renderer.ts`
- Modify: `src/shared/asr-contract.ts`

- [ ] **Step 1: Implement microphone permission and enumeration**

In `src/renderer.ts`, write the minimal device flow:

- request `getUserMedia({ audio: true })` once when needed
- call `enumerateDevices()`
- filter to `audioinput`
- populate the selector

- [ ] **Step 2: Add the start/stop UI state machine**

Represent states like:

- idle
- starting
- listening
- stopping
- error

Use those states to enable or disable buttons.

- [ ] **Step 3: Add audio capture and resampling**

Create a browser audio pipeline that converts microphone input into mono 16 kHz PCM chunks. Keep the implementation minimal and explicit. Favor `AudioContext` plus a processor/worklet path that can emit small buffers at a steady cadence.

- [ ] **Step 4: Send chunks through the preload bridge**

On start:

- call `window.sherpaAsr.startSession({ sampleRate: 16000 })`
- begin streaming chunks

On stop:

- stop all tracks
- tear down audio nodes
- call `window.sherpaAsr.stopSession()`

- [ ] **Step 5: Render transcript and raw result**

When `onResult` fires:

- set transcript text from `result.text`
- set raw JSON with `JSON.stringify(result.raw, null, 2)`

- [ ] **Step 6: Surface status and errors**

Display permission failures, missing device selection, and main-process errors in the status area.

- [ ] **Step 7: Verify the runtime flow**

Run: `npm start`
Expected: you can select a microphone, click `Start`, see status changes, and stop the session without renderer errors

- [ ] **Step 8: Commit**

```bash
git add src/renderer.ts src/shared/asr-contract.ts
git commit -m "feat: wire renderer realtime asr flow"
```

### Task 8: Package Model Resources For macOS And Windows

**Files:**

- Modify: `forge.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Update Forge packaging to include model assets**

Configure Forge packager options so the `resources/models` directory is available in packaged builds, and confirm the approach works with `asar` enabled.

- [ ] **Step 2: Account for native dependency packaging**

Verify the current Electron Forge setup handles the native `sherpa-onnx-node` module correctly during packaging. Add the smallest necessary config changes only if packaging output shows a problem.

- [ ] **Step 3: Keep macOS and Windows makers in scope**

Retain or adjust maker configuration so:

- macOS ZIP output remains available
- Windows Squirrel output remains available

- [ ] **Step 4: Sanity-check packaging commands**

Run: `npm run package`
Expected: packaging completes or, if blocked by missing local model files, the failure clearly identifies the missing resource rather than a broken config path

- [ ] **Step 5: Commit**

```bash
git add forge.config.ts package.json
git commit -m "chore: package model assets for desktop builds"
```

### Task 9: Final Verification And Cleanup

**Files:**

- Modify only if verification reveals defects

- [ ] **Step 1: Run lint one final time**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 2: Run app manually**

Run: `npm start`
Expected: PASS through the full manual acceptance flow:

- choose microphone
- start recognition
- speak
- transcript updates
- raw JSON updates
- stop recognition

- [ ] **Step 3: Run packaging validation**

Run: `npm run package`
Expected: packaging path is valid for the current machine, with macOS and Windows resource handling reflected in config

- [ ] **Step 4: Check git status**

Run: `git status --short`
Expected: clean working tree

- [ ] **Step 5: Commit any final fixes**

```bash
git add forge.config.ts index.html package.json package-lock.json src docs
git commit -m "fix: polish realtime asr integration"
```
