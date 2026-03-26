import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const MODEL_DIRECTORY_NAME =
  'sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01';

const TOKEN_FILENAME = 'tokens.txt';
const MODEL_FILENAME = 'model.int8.onnx';
const BPE_MODEL_FILENAME = 'bbpe.model';

interface SherpaModelPaths {
  modelRoot: string;
  modelDir: string;
  tokens: string;
  model: string;
}

const ensureFileExists = (filePath: string, label: string) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label} at ${filePath}`);
  }
};

export const resolveSherpaModelPaths = (): SherpaModelPaths => {
  const modelRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'models')
    : path.join(app.getAppPath(), 'resources', 'models');

  const modelDir = path.join(modelRoot, MODEL_DIRECTORY_NAME);

  if (!fs.existsSync(modelDir)) {
    throw new Error(
      `Missing sherpa model directory at ${modelDir}. Ensure the extracted model exists under ${modelRoot}.`,
    );
  }

  const tokens = path.join(modelDir, TOKEN_FILENAME);
  ensureFileExists(tokens, 'tokens file');

  const model = path.join(modelDir, MODEL_FILENAME);
  ensureFileExists(model, 'model file');

  const bpeModel = path.join(modelDir, BPE_MODEL_FILENAME);
  ensureFileExists(bpeModel, 'bpe model file');

  return {
    modelRoot,
    modelDir,
    tokens,
    model,
  };
};
