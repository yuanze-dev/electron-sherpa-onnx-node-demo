import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const MODEL_DIRECTORY_NAME =
  'sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01';

const TOKEN_FILENAME = 'tokens.txt';
const MODEL_CANDIDATES = [
  'model.int8.onnx',
  'model.onnx',
  'encoder-epoch-99-avg-1.int8.onnx',
  'encoder-epoch-99-avg-1.onnx',
  'encoder.onnx',
];

export interface SherpaModelPaths {
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

const resolveExistingModelFile = (modelDir: string) => {
  for (const candidate of MODEL_CANDIDATES) {
    const candidatePath = path.join(modelDir, candidate);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error(
    `Missing model .onnx file in ${modelDir}. Expected one of: ${MODEL_CANDIDATES.join(
      ', ',
    )}`,
  );
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

  const model = resolveExistingModelFile(modelDir);

  return {
    modelRoot,
    modelDir,
    tokens,
    model,
  };
};
