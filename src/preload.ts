import { contextBridge, ipcRenderer } from 'electron';
import type {
  AsrStatusEvent,
  AudioChunkPayload,
  RawResultTransport,
  SherpaAsrApi,
  StartAsrRequest,
} from './shared/asr-contract';

// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const sherpaAsr: SherpaAsrApi = {
  startSession: (payload: StartAsrRequest) =>
    ipcRenderer.invoke('asr:start', payload),
  pushAudioChunk: (payload: AudioChunkPayload) =>
    ipcRenderer.invoke('asr:push-audio', payload),
  stopSession: () => ipcRenderer.invoke('asr:stop'),
  onResult: (listener: (transport: RawResultTransport) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: RawResultTransport) => {
      listener(payload);
    };
    ipcRenderer.on('asr:result', handler);
    return () => {
      ipcRenderer.removeListener('asr:result', handler);
    };
  },
  onStatus: (listener: (event: AsrStatusEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AsrStatusEvent) => {
      listener(payload);
    };
    ipcRenderer.on('asr:status', handler);
    return () => {
      ipcRenderer.removeListener('asr:status', handler);
    };
  },
};

contextBridge.exposeInMainWorld('sherpaAsr', sherpaAsr);

declare global {
  interface Window {
    sherpaAsr: SherpaAsrApi;
  }
}
