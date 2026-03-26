export type AsrSessionStatus =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'stopping'
  | 'error';

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

export interface RawSherpaOnlineResult {
  text: string;
  tokens: string[];
  timestamps: number[];
  ys_probs: number[];
  lm_probs: number[];
  context_scores: number[];
  segment: number;
  words: number[];
  start_time: number;
  is_final: boolean;
  is_eof: boolean;
}

export interface RawResultTransport {
  /** The active session identifier (if supported) or an empty string. */
  sessionId: string;
  /** The raw recognizer payload emitted by `sherpa-onnx-node`. */
  rawResult: RawSherpaOnlineResult;
  /** Milliseconds since the Unix epoch when the event was emitted. */
  emittedAt: number;
}

export interface AsrStatusEvent {
  status: AsrSessionStatus;
  sessionId: string;
  message?: string;
  emittedAt: number;
}

export interface SherpaAsrApi {
  /** Preload bridge API exposed on `window.sherpaAsr` via `contextBridge`. */
  startSession(payload: StartAsrRequest): Promise<RawResultTransport | null>;
  pushAudioChunk(payload: AudioChunkPayload): Promise<RawResultTransport | null>;
  stopSession(): Promise<RawResultTransport | null>;
  onResult(listener: (transport: RawResultTransport) => void): () => void;
  onStatus(listener: (event: AsrStatusEvent) => void): () => void;
}
