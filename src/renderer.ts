import './index.css';

type UiStatus = 'idle' | 'starting' | 'listening' | 'stopping' | 'error';

interface AppState {
  status: UiStatus;
  statusMessage: string;
  error: string | null;
  sessionId: string;
}

const TARGET_SAMPLE_RATE = 16000;
const DEFAULT_CHUNK_FRAMES = 1024;
const MAX_PUSH_PER_TICK = 4;
const MAX_QUEUE_CHUNKS = 32;

const state: AppState = {
  status: 'idle',
  statusMessage: 'Idle',
  error: null,
  sessionId: '',
};

const micSelect = document.querySelector<HTMLSelectElement>('#mic-select');
const refreshButton = document.querySelector<HTMLButtonElement>('#refresh-mics');
const startButton = document.querySelector<HTMLButtonElement>('#start-button');
const stopButton = document.querySelector<HTMLButtonElement>('#stop-button');
const statusText = document.querySelector<HTMLDivElement>('#status-text');
const transcriptText = document.querySelector<HTMLParagraphElement>('#transcript-text');
const rawJson = document.querySelector<HTMLPreElement>('#raw-json');

if (!micSelect || !refreshButton || !startButton || !stopButton || !statusText || !transcriptText || !rawJson) {
  throw new Error('Renderer UI elements missing from DOM.');
}

let mediaStream: MediaStream | null = null;
let audioContext: AudioContext | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let processorNode: ScriptProcessorNode | null = null;
let silenceNode: GainNode | null = null;
let sessionActive = false;
let pushQueue: Float32Array[] = [];
let isPushing = false;
let permissionGranted = false;
let unsubscribeResult: (() => void) | null = null;
let unsubscribeStatus: (() => void) | null = null;

const updateStatus = (status: UiStatus, message: string, error?: string | null) => {
  state.status = status;
  state.statusMessage = message;
  state.error = error ?? null;
  statusText.textContent = message;
  statusText.classList.toggle('is-error', Boolean(error));
  updateControls();
};

const updateControls = () => {
  const isBusy = state.status === 'starting' || state.status === 'stopping';
  const isListening = state.status === 'listening';
  startButton.disabled = isBusy || isListening;
  stopButton.disabled = isBusy || !isListening;
  refreshButton.disabled = isBusy || isListening;
  micSelect.disabled = isBusy || isListening;
};

const extractTranscript = (rawResult: Record<string, unknown>): string => {
  const direct = rawResult.text;
  if (typeof direct === 'string' && direct.trim().length > 0) {
    return direct.trim();
  }
  const nested = rawResult.result;
  if (nested && typeof nested === 'object' && 'text' in nested) {
    const nestedText = (nested as { text?: unknown }).text;
    if (typeof nestedText === 'string' && nestedText.trim().length > 0) {
      return nestedText.trim();
    }
  }
  return '';
};

const prettyPrintRaw = (rawResult: Record<string, unknown>) => {
  try {
    rawJson.textContent = JSON.stringify(rawResult, null, 2);
  } catch (error) {
    rawJson.textContent = `Failed to stringify result: ${String(error)}`;
  }
};

const resetTranscript = () => {
  transcriptText.textContent = 'No transcript yet.';
  rawJson.textContent = '{}';
};

const stopMediaStream = () => {
  if (mediaStream) {
    for (const track of mediaStream.getTracks()) {
      track.stop();
    }
  }
  mediaStream = null;
};

const teardownAudio = () => {
  if (processorNode) {
    processorNode.disconnect();
  }
  if (sourceNode) {
    sourceNode.disconnect();
  }
  if (silenceNode) {
    silenceNode.disconnect();
  }
  processorNode = null;
  sourceNode = null;
  silenceNode = null;

  if (audioContext) {
    audioContext.close().catch(() => undefined);
  }
  audioContext = null;
  stopMediaStream();
  pushQueue = [];
  isPushing = false;
};

const handleRendererError = (message: string, error?: unknown) => {
  console.error(message, error);
  updateStatus('error', message, message);
};

const ensurePermission = async () => {
  if (permissionGranted) {
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    permissionGranted = true;
    stream.getTracks().forEach((track) => track.stop());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Microphone permission denied: ${message}`);
  }
};

const populateDevices = async (options?: { requestPermission?: boolean }) => {
  if (options?.requestPermission) {
    await ensurePermission();
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const inputs = devices.filter((device) => device.kind === 'audioinput');

  const selected = micSelect.value;
  micSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select a microphone';
  micSelect.appendChild(placeholder);

  for (const device of inputs) {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Microphone ${micSelect.options.length}`;
    micSelect.appendChild(option);
  }

  const hasSelected = inputs.some((device) => device.deviceId === selected);
  if (hasSelected) {
    micSelect.value = selected;
  }
};

const resampleToTarget = (input: Float32Array, inputRate: number): Float32Array => {
  if (inputRate === TARGET_SAMPLE_RATE) {
    return input.slice();
  }
  const ratio = inputRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio;
    const index = Math.floor(position);
    const nextIndex = Math.min(index + 1, input.length - 1);
    const weight = position - index;
    output[i] = input[index] * (1 - weight) + input[nextIndex] * weight;
  }
  return output;
};

const enqueueSamples = (samples: Float32Array) => {
  if (samples.length === 0) {
    return;
  }
  if (pushQueue.length >= MAX_QUEUE_CHUNKS) {
    const overflow = pushQueue.length - MAX_QUEUE_CHUNKS + 1;
    pushQueue.splice(0, overflow);
  }
  pushQueue.push(samples.slice());
  if (!isPushing) {
    void flushQueue();
  }
};

const flushQueue = async () => {
  if (isPushing) {
    return;
  }
  isPushing = true;
  try {
    let count = 0;
    while (pushQueue.length > 0 && sessionActive && count < MAX_PUSH_PER_TICK) {
      const chunk = pushQueue.shift();
      if (!chunk) {
        break;
      }
      await window.sherpaAsr.pushAudioChunk({ samples: chunk });
      count += 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    handleRendererError(`Audio push failed: ${message}`, error);
    await stopSession();
  } finally {
    isPushing = false;
    if (pushQueue.length > 0 && sessionActive) {
      setTimeout(() => {
        void flushQueue();
      }, 0);
    }
  }
};

const buildAudioGraph = async (deviceId: string) => {
  stopMediaStream();
  const constraints: MediaStreamConstraints = {
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    video: false,
  };
  mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

  audioContext = new AudioContext();
  sourceNode = audioContext.createMediaStreamSource(mediaStream);
  processorNode = audioContext.createScriptProcessor(DEFAULT_CHUNK_FRAMES, 1, 1);
  silenceNode = audioContext.createGain();
  silenceNode.gain.value = 0;

  processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
    if (!sessionActive || !audioContext) {
      return;
    }
    const input = event.inputBuffer.getChannelData(0);
    const resampled = resampleToTarget(input, audioContext.sampleRate);
    enqueueSamples(resampled);
  };

  sourceNode.connect(processorNode);
  processorNode.connect(silenceNode);
  silenceNode.connect(audioContext.destination);

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
};

const stopSession = async (options?: { preserveStatus?: boolean }) => {
  const preserveStatus = options?.preserveStatus ?? false;
  if (!sessionActive && state.status !== 'listening') {
    teardownAudio();
    if (!preserveStatus) {
      updateStatus('idle', 'Idle');
    }
    return;
  }
  if (!preserveStatus) {
    updateStatus('stopping', 'Stopping session...');
  }
  sessionActive = false;
  teardownAudio();
  try {
    const response = await window.sherpaAsr.stopSession();
    state.sessionId = response.sessionId;
    if (!preserveStatus) {
      updateStatus('idle', 'Idle');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    handleRendererError(`Failed to stop session: ${message}`, error);
  }
};

const startSession = async () => {
  if (state.status === 'starting' || state.status === 'listening') {
    return;
  }
  if (!micSelect.value) {
    updateStatus('error', 'Select a microphone before starting.', 'Select a microphone before starting.');
    return;
  }

  updateStatus('starting', 'Requesting microphone...');
  resetTranscript();

  try {
    await ensurePermission();
    await buildAudioGraph(micSelect.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    handleRendererError(`Microphone error: ${message}`, error);
    return;
  }

  try {
    const response = await window.sherpaAsr.startSession({
      sampleRate: TARGET_SAMPLE_RATE,
    });
    state.sessionId = response.sessionId;
    sessionActive = true;
    updateStatus('listening', 'Listening...');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    handleRendererError(`Failed to start session: ${message}`, error);
    await stopSession();
  }
};

const wireListeners = () => {
  if (!unsubscribeResult) {
    unsubscribeResult = window.sherpaAsr.onResult((transport) => {
      if (!transport) {
        return;
      }
      const transcript = extractTranscript(transport.rawResult);
      if (transcript.length > 0) {
        transcriptText.textContent = transcript;
      }
      prettyPrintRaw(transport.rawResult);
    });
  }

  if (!unsubscribeStatus) {
    unsubscribeStatus = window.sherpaAsr.onStatus((event) => {
      if (!event) {
        return;
      }
      const message = event.message ?? '';
      if (event.status === 'error') {
        updateStatus('error', message || 'ASR error', message || 'ASR error');
        void stopSession({ preserveStatus: true });
        return;
      }
      if (event.status === 'starting') {
        updateStatus('starting', 'Starting session...');
        return;
      }
      if (event.status === 'listening') {
        updateStatus('listening', 'Listening...');
        return;
      }
      if (event.status === 'stopping') {
        updateStatus('stopping', 'Stopping session...');
        return;
      }
      if (event.status === 'idle') {
        updateStatus('idle', 'Idle');
      }
    });
  }
};

refreshButton.addEventListener('click', () => {
  updateStatus(state.status, 'Refreshing microphones...');
  populateDevices({ requestPermission: true })
    .then(() => {
      updateStatus(state.status, 'Microphones updated.');
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      handleRendererError(`Failed to enumerate microphones: ${message}`, error);
    });
});

startButton.addEventListener('click', () => {
  void startSession();
});

stopButton.addEventListener('click', () => {
  void stopSession();
});

window.addEventListener('beforeunload', () => {
  if (unsubscribeResult) {
    unsubscribeResult();
    unsubscribeResult = null;
  }
  if (unsubscribeStatus) {
    unsubscribeStatus();
    unsubscribeStatus = null;
  }
  sessionActive = false;
  teardownAudio();
});

wireListeners();
updateControls();

populateDevices({ requestPermission: false }).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  handleRendererError(`Failed to enumerate microphones: ${message}`, error);
});
