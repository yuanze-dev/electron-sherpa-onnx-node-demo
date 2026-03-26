import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { SherpaAsrSession } from './main/asr-session';
import { ASR_IPC_CHANNELS } from './shared/asr-contract';
import type {
  AsrSessionStatus,
  AsrStatusEvent,
  AudioChunkPayload,
  RawResultTransport,
  StartAsrResponse,
  StartAsrRequest,
  StopAsrResponse,
} from './shared/asr-contract';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let asrSession: SherpaAsrSession | null = null;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

const sendStatus = (event: AsrStatusEvent) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(ASR_IPC_CHANNELS.status, event);
};

const sendResult = (event: RawResultTransport) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(ASR_IPC_CHANNELS.result, event);
};

const emitStatus = (status: AsrSessionStatus, sessionId = '', message?: string) => {
  sendStatus({
    status,
    sessionId,
    message,
    emittedAt: Date.now(),
  });
};

const handleAsrError = (action: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ASR ${action} failed.`, error);
  const sessionId = asrSession?.getSessionId() ?? '';
  emitStatus('error', sessionId, message);
  return message;
};

const exitAfterFatalError = (code = 1) => {
  const shutdown = () => {
    if (!app.isReady()) {
      process.exit(code);
      return;
    }
    app.exit(code);
  };

  setTimeout(shutdown, 100);
};

process.on('uncaughtException', (error) => {
  handleAsrError('uncaughtException', error);
  exitAfterFatalError(1);
});

process.on('unhandledRejection', (reason) => {
  handleAsrError('unhandledRejection', reason);
  exitAfterFatalError(1);
});

const assertValidSampleRate = (sampleRate: number) => {
  if (!Number.isFinite(sampleRate)) {
    throw new Error('Sample rate must be a finite number.');
  }
  if (sampleRate < 8000 || sampleRate > 48000) {
    throw new Error('Sample rate must be between 8000 and 48000 Hz.');
  }
};

const MAX_AUDIO_SAMPLES = 16000 * 2;

const assertValidAudioPayload = (payload: AudioChunkPayload) => {
  if (
    !payload ||
    (!Array.isArray(payload.samples) &&
      !(payload.samples instanceof Float32Array))
  ) {
    throw new Error('Audio payload must include PCM samples.');
  }
  const samples = payload.samples;
  if (samples.length === 0) {
    return;
  }
  if (samples.length > MAX_AUDIO_SAMPLES) {
    throw new Error('Audio payload is too large.');
  }
  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i];
    if (!Number.isFinite(value)) {
      throw new Error('Audio payload contains non-finite values.');
    }
    if (value < -1 || value > 1) {
      throw new Error('Audio payload contains samples outside [-1, 1].');
    }
  }
};

ipcMain.handle(
  ASR_IPC_CHANNELS.start,
  async (_event, payload: StartAsrRequest): Promise<StartAsrResponse> => {
  try {
    assertValidSampleRate(payload.sampleRate);
    emitStatus('starting');
    if (!asrSession) {
      asrSession = new SherpaAsrSession();
    }
    const sessionId = asrSession.start(payload);
    emitStatus('listening', sessionId);
    return { sessionId };
  } catch (error) {
    handleAsrError('start', error);
    throw error;
  }
},
);

ipcMain.handle(
  ASR_IPC_CHANNELS.pushAudio,
  async (_event, payload: AudioChunkPayload): Promise<void> => {
  try {
    if (!asrSession) {
      throw new Error('ASR session has not been started.');
    }
    assertValidAudioPayload(payload);
    const result = asrSession.pushAudio(payload);
    if (result) {
      const transport: RawResultTransport = {
        sessionId: asrSession.getSessionId(),
        rawResult: result,
        emittedAt: Date.now(),
      };
      sendResult(transport);
    }
  } catch (error) {
    handleAsrError('push-audio', error);
    throw error;
  }
},
);

ipcMain.handle(
  ASR_IPC_CHANNELS.stop,
  async (): Promise<StopAsrResponse> => {
  try {
    if (!asrSession) {
      emitStatus('idle');
      return { sessionId: '', wasActive: false };
    }
    const sessionId = asrSession.getSessionId();
    emitStatus('stopping', sessionId);
    const result = asrSession.stop();
    if (result) {
      const transport: RawResultTransport = {
        sessionId,
        rawResult: result,
        emittedAt: Date.now(),
      };
      sendResult(transport);
      emitStatus('idle', sessionId);
      return { sessionId, wasActive: true };
    }
    emitStatus('idle', sessionId);
    return { sessionId, wasActive: true };
  } catch (error) {
    handleAsrError('stop', error);
    throw error;
  } finally {
    if (asrSession && !asrSession.isActive()) {
      asrSession = null;
    }
  }
},
);

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
