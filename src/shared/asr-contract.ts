export type AsrSessionStatus =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'stopping'
  | 'error';

export const ASR_IPC_CHANNELS = {
  start: 'asr:start',
  pushAudio: 'asr:push-audio',
  stop: 'asr:stop',
  result: 'asr:result',
  status: 'asr:status',
} as const;

export interface StartAsrRequest {
  /** Input PCM sample rate in Hz (e.g., 16000). */
  sampleRate: number;
  /** Optional chunk duration hint in samples; the renderer can opt out. */
  chunkSamples?: number;
}

export interface AudioChunkPayload {
  /** 1 channel PCM samples in the range [-1, 1]. */
  samples: Float32Array | number[];
}

export type RawSherpaOnlineResult = Record<string, unknown>;

export interface RawResultTransport {
  /** The active session identifier (if supported) or an empty string. */
  sessionId: string;
  /** The raw recognizer payload emitted by `sherpa-onnx-node`. */
  rawResult: RawSherpaOnlineResult;
  /** Milliseconds since the Unix epoch when the event was emitted. */
  emittedAt: number;
}

export interface StartAsrResponse {
  sessionId: string;
}

export interface StopAsrResponse {
  sessionId: string;
  wasActive: boolean;
}

export interface AsrStatusEvent {
  status: AsrSessionStatus;
  sessionId: string;
  message?: string;
  emittedAt: number;
}

export interface SherpaAsrApi {
  /** Preload bridge API exposed on `window.sherpaAsr` via `contextBridge`. */
  startSession(payload: StartAsrRequest): Promise<StartAsrResponse>;
  /** Stream results are delivered via `onResult`. */
  pushAudioChunk(payload: AudioChunkPayload): Promise<void>;
  /** Final result is delivered via `onResult` before idle status. */
  stopSession(): Promise<StopAsrResponse>;
  onResult(listener: (transport: RawResultTransport) => void): () => void;
  onStatus(listener: (event: AsrStatusEvent) => void): () => void;
}
