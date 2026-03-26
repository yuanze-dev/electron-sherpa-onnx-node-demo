import { contextBridge, ipcRenderer } from 'electron';
import { ASR_IPC_CHANNELS } from './shared/asr-contract';
import type {
  AsrStatusEvent,
  AudioChunkPayload,
  RawResultTransport,
  SherpaAsrApi,
  StartAsrResponse,
  StopAsrResponse,
  StartAsrRequest,
} from './shared/asr-contract';

// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const sherpaAsr: SherpaAsrApi = Object.freeze({
  startSession: (payload: StartAsrRequest): Promise<StartAsrResponse> =>
    ipcRenderer.invoke(ASR_IPC_CHANNELS.start, payload),
  pushAudioChunk: (payload: AudioChunkPayload) =>
    ipcRenderer.invoke(ASR_IPC_CHANNELS.pushAudio, payload),
  stopSession: (): Promise<StopAsrResponse> =>
    ipcRenderer.invoke(ASR_IPC_CHANNELS.stop),
  onResult: (listener: (transport: RawResultTransport) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: RawResultTransport) => {
      listener(payload);
    };
    ipcRenderer.on(ASR_IPC_CHANNELS.result, handler);
    return () => {
      ipcRenderer.removeListener(ASR_IPC_CHANNELS.result, handler);
    };
  },
  onStatus: (listener: (event: AsrStatusEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AsrStatusEvent) => {
      listener(payload);
    };
    ipcRenderer.on(ASR_IPC_CHANNELS.status, handler);
    return () => {
      ipcRenderer.removeListener(ASR_IPC_CHANNELS.status, handler);
    };
  },
});

contextBridge.exposeInMainWorld('sherpaAsr', sherpaAsr);

declare global {
  interface Window {
    readonly sherpaAsr: SherpaAsrApi;
  }
}
