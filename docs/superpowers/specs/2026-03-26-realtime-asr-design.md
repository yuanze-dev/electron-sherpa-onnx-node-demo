# Realtime ASR Demo Design

## Goal

Build a minimal Electron demo that integrates `sherpa-onnx-node` with the streaming Chinese model from:

`https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01.tar.bz2`

The app should let the user:

- select a microphone
- click `Start` to begin realtime ASR
- click `Stop` to end realtime ASR
- see the current recognition text
- see the full raw result structure returned by `sherpa-onnx-node`

The UI should stay simple and use plain HTML and CSS.

## Confirmed Scope

In scope:

- Electron app with a single page
- microphone device selection
- explicit `Start` / `Stop` recognition controls
- streaming ASR using `sherpa-onnx-node`
- a text area for the recognized transcript
- a JSON area showing the full raw recognizer result object
- fixed local model directory in development
- packaging support so the model is included inside the built app for macOS and Windows

Out of scope:

- automatic model download
- advanced transcript editing or history
- waveform visualization
- multiple simultaneous recognition sessions
- speaker diarization or translation
- complex design system styling

## Recommended Architecture

Use a split architecture:

1. `renderer` handles UI, microphone enumeration, permission prompts, and audio capture.
2. `preload` exposes a minimal safe bridge between renderer and Electron IPC.
3. `main` owns `sherpa-onnx-node`, model path resolution, and the streaming recognizer session.

This keeps browser-specific microphone APIs in the renderer while keeping native Node bindings and model management in the main process.

## UI Design

The app is a single simple page with this layout:

1. Top control row
   - microphone selector
   - refresh devices button
   - start button
   - stop button
   - lightweight status or error text
2. Transcript panel
   - shows the current recognized text in a readable form
3. Raw result panel
   - shows the full `sherpa-onnx-node` result object using pretty-printed JSON

The transcript appears before the raw JSON so the human-readable result is easiest to scan, while the raw result remains visible for debugging and fidelity.

## Data Flow

### 1. Device setup

- The renderer requests microphone permission using browser media APIs.
- The renderer enumerates audio input devices and populates the selector.
- The selected device ID is stored in renderer state only.

### 2. Recognition start

- The user clicks `Start`.
- The renderer opens a `MediaStream` for the selected input device.
- The renderer creates a lightweight audio processing pipeline to convert incoming audio into mono 16 kHz PCM chunks suitable for `sherpa-onnx-node`.
- The renderer notifies the main process to start a new ASR session.
- The main process resolves the model path, creates the recognizer if needed, then creates a fresh recognition stream for the session.

### 3. Streaming loop

- The renderer sends PCM chunks to the main process through the preload bridge.
- The main process accepts audio samples into the sherpa stream.
- The main process periodically decodes and fetches the current recognition result.
- The main process sends the complete raw result object back to the renderer without application-specific reshaping beyond transport serialization.
- The renderer updates:
  - the transcript panel from `result.text`
  - the raw JSON panel from `JSON.stringify(result, null, 2)`

### 4. Recognition stop

- The user clicks `Stop`, or an unrecoverable session error occurs.
- The renderer stops the media stream and audio processing nodes.
- The main process finalizes and releases the current recognition stream state.
- The UI returns to idle and can be started again.

## Module Boundaries

### Renderer responsibilities

- render the page
- manage device selection
- manage start/stop button state
- request media permission
- capture and resample microphone audio
- display transcript, raw JSON, and status

### Preload responsibilities

- expose a minimal API such as:
  - list or refresh devices helpers if needed
  - start ASR session
  - push audio chunk
  - stop ASR session
  - subscribe to result events
  - subscribe to status or error events

### Main responsibilities

- resolve model file paths
- initialize `sherpa-onnx-node`
- create and dispose recognition sessions
- accept streamed audio chunks
- decode incrementally
- forward raw recognition results and errors to the renderer

## Model Directory Strategy

The model is stored in a fixed project directory, for example:

`resources/models/sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01/`

Development behavior:

- read directly from the project resources directory

Packaged behavior:

- bundle the same model directory into app resources
- resolve the packaged model root from `process.resourcesPath`

The main process should use one path-resolution helper so the rest of the app never needs to know whether it is running in development or production.

## Packaging Design

Packaging should account for the model assets explicitly.

- Electron Forge configuration should include the model directory as packaged resources
- the implementation should avoid runtime download requirements
- the app should fail clearly if the model directory is missing or incomplete
- packaging design must cover both macOS and Windows outputs

### Platform packaging requirements

macOS:

- packaged app must resolve bundled model assets from the app resources location used in macOS app bundles
- native module packaging must be compatible with the Electron version used by the project

Windows:

- packaged app must resolve bundled model assets from the installed application resources location on Windows
- packaging should account for native module distribution expectations on Windows as well

Cross-platform rule:

- model path resolution must rely on Electron runtime paths rather than hard-coded OS-specific absolute paths
- the same application code should work in development and in packaged builds on both macOS and Windows
- validation should include at least one packaged-build sanity check path for each target platform, even if full runtime voice testing is only available on the current machine

If the repository does not yet contain the extracted model files, implementation may wire the expected directory structure first and document the required placement clearly.

## Raw Result Fidelity

The user explicitly wants the original `sherpa-onnx-node` result structure.

Design rule:

- send the recognizer result object through IPC with as little transformation as possible
- do not map it into a custom app-specific schema
- only derive `result.text` separately for display in the transcript panel

This preserves the raw structure while still making the recognized text easy to read.

## Error Handling

The app should handle these cases clearly:

- no microphone permission
- no input device selected
- selected device becomes unavailable
- model path missing
- model initialization failure
- recognition session start failure
- audio processing failure
- runtime recognition error

Expected behavior:

- show a concise status or error message on screen
- restore the UI to a safe idle state after failure
- allow the user to retry after recoverable errors

No automatic retry loop is required.

## Validation Plan

Primary validation is manual, focused on the requested behavior:

1. launch the Electron app
2. verify microphone devices appear
3. choose a microphone
4. click `Start`
5. speak and confirm transcript updates
6. confirm the raw JSON panel updates with the full result object
7. click `Stop`
8. confirm recognition stops cleanly
9. verify error handling for at least one failure case, such as missing model files or denied microphone permission

Secondary validation:

- run static checks or build validation if the project setup supports them cleanly
- verify packaging configuration for both macOS and Windows targets

## Implementation Notes For Planning

The plan should include:

- dependency installation for `sherpa-onnx-node`
- project resource layout for model files
- preload IPC contract definition
- main-process ASR session management
- renderer audio capture and resampling path
- single-page UI implementation with plain HTML and CSS
- packaging configuration updates for model assets
- manual verification steps

## Success Criteria

The work is successful when:

- the Electron app presents a simple single-page ASR interface
- the user can select a microphone
- the user can explicitly start and stop recognition
- realtime recognition runs through `sherpa-onnx-node`
- recognized text is visible in a readable text panel
- the raw recognizer structure is visible in a pretty-printed JSON panel
- the model is resolved from a fixed directory in development
- packaging includes support for shipping the model inside the app on macOS and Windows
