import { createRequire } from 'node:module';
import { resolveSherpaModelPaths } from './model-path';
import type {
  AudioChunkPayload,
  RawSherpaOnlineResult,
  StartAsrRequest,
} from '../shared/asr-contract';

const require = createRequire(import.meta.url);

interface OnlineStreamLike {
  acceptWaveform(payload: { samples: Float32Array; sampleRate: number }): void;
  inputFinished(): void;
}

interface OnlineRecognizerLike {
  createStream(): OnlineStreamLike;
  isReady(stream: OnlineStreamLike): boolean;
  decode(stream: OnlineStreamLike): void;
  isEndpoint(stream: OnlineStreamLike): boolean;
  reset(stream: OnlineStreamLike): void;
  getResult(stream: OnlineStreamLike): RawSherpaOnlineResult;
}

interface OnlineRecognizerConfig {
  featConfig?: {
    sampleRate?: number;
    featureDim?: number;
  };
  modelConfig?: {
    zipformer2Ctc?: {
      model?: string;
    };
    tokens?: string;
    bpeVocab?: string;
    numThreads?: number;
    debug?: boolean | number;
    provider?: string;
  };
  decodingMethod?: string;
  enableEndpoint?: boolean | number;
}

type OnlineRecognizerConstructor = new (
  config: OnlineRecognizerConfig,
) => OnlineRecognizerLike;

const loadOnlineRecognizer = (): OnlineRecognizerConstructor => {
  const streamingAsr = require(
    'sherpa-onnx-node/streaming-asr.js',
  ) as { OnlineRecognizer?: OnlineRecognizerConstructor };
  const OnlineRecognizer = streamingAsr.OnlineRecognizer;

  if (!OnlineRecognizer) {
    throw new Error('sherpa-onnx-node OnlineRecognizer is not available.');
  }

  return OnlineRecognizer;
};

const toFloat32Array = (samples: Float32Array | number[]): Float32Array => {
  if (samples instanceof Float32Array) {
    return samples;
  }
  return Float32Array.from(samples);
};

export class SherpaAsrSession {
  private recognizer: OnlineRecognizerLike | null = null;
  private stream: OnlineStreamLike | null = null;
  private sessionId = '';
  private sampleRate = 16000;
  private lastResult: RawSherpaOnlineResult | null = null;

  getSessionId(): string {
    return this.sessionId;
  }

  isActive(): boolean {
    return Boolean(this.recognizer && this.stream);
  }

  start(request: StartAsrRequest): string {
    if (this.recognizer || this.stream) {
      throw new Error('ASR session is already active.');
    }

    this.sampleRate = request.sampleRate;
    this.lastResult = null;

    try {
      const { tokens, model, bpeModel } = resolveSherpaModelPaths();

      const OnlineRecognizer = loadOnlineRecognizer();
      const config: OnlineRecognizerConfig = {
        featConfig: {
          sampleRate: this.sampleRate,
        },
        modelConfig: {
          zipformer2Ctc: {
            model,
          },
          tokens,
          bpeVocab: bpeModel,
          numThreads: 2,
          provider: 'cpu',
          debug: 0,
        },
        decodingMethod: 'greedy_search',
        enableEndpoint: 1,
      };

      this.recognizer = new OnlineRecognizer(config);
      this.stream = this.recognizer.createStream();
      this.sessionId = `session-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2, 8)}`;
      return this.sessionId;
    } catch (error) {
      this.recognizer = null;
      this.stream = null;
      this.sessionId = '';
      this.lastResult = null;
      throw error;
    }
  }

  pushAudio(payload: AudioChunkPayload): RawSherpaOnlineResult | null {
    if (!this.stream || !this.recognizer) {
      throw new Error('ASR session has not been started.');
    }

    const samples = toFloat32Array(payload.samples);
    if (samples.length === 0) {
      return null;
    }

    this.stream.acceptWaveform({
      samples,
      sampleRate: this.sampleRate,
    });

    return this.decodeAvailable();
  }

  stop(): RawSherpaOnlineResult | null {
    if (!this.stream || !this.recognizer) {
      return null;
    }

    this.stream.inputFinished();
    const finalResult = this.decodeAvailable();

    this.stream = null;
    this.recognizer = null;
    this.sessionId = '';
    this.lastResult = null;

    return finalResult;
  }

  private decodeAvailable(): RawSherpaOnlineResult | null {
    if (!this.stream || !this.recognizer) {
      return null;
    }

    let latest: RawSherpaOnlineResult | null = this.lastResult;
    let decoded = false;
    while (this.recognizer.isReady(this.stream)) {
      this.recognizer.decode(this.stream);
      latest = this.recognizer.getResult(this.stream);
      decoded = true;
      if (this.recognizer.isEndpoint(this.stream)) {
        this.recognizer.reset(this.stream);
      }
    }

    if (!decoded) {
      latest = this.recognizer.getResult(this.stream);
    }

    this.lastResult = latest;
    return latest;
  }
}
