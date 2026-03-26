import type { SherpaAsrApi } from './shared/asr-contract';

// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

declare global {
  interface Window {
    sherpaAsr?: SherpaAsrApi;
  }
}
