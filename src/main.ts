import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { SherpaAsrSession } from './main/asr-session';
import { resolveSherpaModelPaths } from './main/model-path';
import type {
  AsrSessionStatus,
  AsrStatusEvent,
  AudioChunkPayload,
  RawResultTransport,
  StartAsrRequest,
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

const ensureModelAvailable = () => {
  try {
    resolveSherpaModelPaths();
  } catch (error) {
    console.error('Failed to resolve sherpa model assets.', error);
    throw error;
  }
};

const sendStatus = (event: AsrStatusEvent) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('asr:status', event);
};

const sendResult = (event: RawResultTransport) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('asr:result', event);
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
};

ipcMain.handle('asr:start', async (_event, payload: StartAsrRequest) => {
  try {
    emitStatus('starting');
    if (!asrSession) {
      asrSession = new SherpaAsrSession();
    }
    const sessionId = asrSession.start(payload);
    emitStatus('listening', sessionId);
  } catch (error) {
    handleAsrError('start', error);
  }
});

ipcMain.handle('asr:push-audio', async (_event, payload: AudioChunkPayload) => {
  try {
    if (!asrSession) {
      throw new Error('ASR session has not been started.');
    }
    const result = asrSession.pushAudio(payload);
    if (result) {
      sendResult({
        sessionId: asrSession.getSessionId(),
        rawResult: result,
        emittedAt: Date.now(),
      });
    }
  } catch (error) {
    handleAsrError('push-audio', error);
  }
});

ipcMain.handle('asr:stop', async () => {
  try {
    if (!asrSession) {
      emitStatus('idle');
      return;
    }
    const sessionId = asrSession.getSessionId();
    emitStatus('stopping', sessionId);
    const result = asrSession.stop();
    if (result) {
      sendResult({
        sessionId,
        rawResult: result,
        emittedAt: Date.now(),
      });
    }
    emitStatus('idle', sessionId);
  } catch (error) {
    handleAsrError('stop', error);
  } finally {
    if (asrSession && !asrSession.isActive()) {
      asrSession = null;
    }
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  ensureModelAvailable();
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
