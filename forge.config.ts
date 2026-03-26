import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import fs from 'node:fs';
import path from 'node:path';

const MODELS_RESOURCE_PATH = path.resolve(__dirname, 'resources', 'models');
const SHERPA_NODE_MODULE_PATH = path.resolve(
  __dirname,
  'node_modules',
  'sherpa-onnx-node',
);
const SHERPA_PLATFORM = process.platform === 'win32' ? 'win' : process.platform;
const SHERPA_NATIVE_MODULE_NAME = `sherpa-onnx-${SHERPA_PLATFORM}-${process.arch}`;
const SHERPA_NATIVE_MODULE_PATH = path.resolve(
  __dirname,
  'node_modules',
  SHERPA_NATIVE_MODULE_NAME,
);
const MODEL_DIRECTORY_NAME =
  'sherpa-onnx-streaming-zipformer-small-ctc-zh-int8-2025-04-01';
const REQUIRED_MODEL_FILES = ['tokens.txt', 'model.int8.onnx', 'bbpe.model'];
const SHOULD_CODESIGN_MAC = process.env.MAC_CODESIGN === '1';
const MAC_CODESIGN_IDENTITY = process.env.MAC_CODESIGN_IDENTITY?.trim();

const assertSherpaRuntimePresent = (): void => {
  const missing: string[] = [];

  for (const [label, targetPath] of [
    ['sherpa runtime module', SHERPA_NODE_MODULE_PATH],
    ['sherpa native module', SHERPA_NATIVE_MODULE_PATH],
  ] as const) {
    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
      missing.push(`${label}: ${targetPath}`);
    }
  }

  if (missing.length > 0) {
    const formatted = missing.map((entry) => `- ${entry}`).join('\n');
    throw new Error(
      `Missing sherpa runtime assets for packaging:\n${formatted}\nEnsure npm installed the required platform packages before packaging.`,
    );
  }
};

const assertModelAssetsPresent = (): void => {
  const modelDir = path.join(MODELS_RESOURCE_PATH, MODEL_DIRECTORY_NAME);
  const missing: string[] = [];

  if (!fs.existsSync(modelDir) || !fs.statSync(modelDir).isDirectory()) {
    missing.push(`model directory: ${modelDir}`);
  } else {
    for (const fileName of REQUIRED_MODEL_FILES) {
      const filePath = path.join(modelDir, fileName);
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        missing.push(`file: ${filePath}`);
      }
    }
  }

  if (missing.length > 0) {
    const formatted = missing.map((entry) => `- ${entry}`).join('\n');
    throw new Error(
      `Missing sherpa model assets for packaging:\n${formatted}\nEnsure the model files are present under ${MODELS_RESOURCE_PATH} before packaging.`,
    );
  }
};

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    appBundleId: 'me.timlau.sherpaonnxdemo',
    appCategoryType: 'public.app-category.utilities',
    executableName: 'Sherpa ONNX Demo',
    osxSign: SHOULD_CODESIGN_MAC
      ? {
          identity: MAC_CODESIGN_IDENTITY || undefined,
        }
      : undefined,
    usageDescription: {
      Microphone: 'Sherpa ONNX Demo needs microphone access for realtime speech recognition.',
    },
    extraResource: [
      MODELS_RESOURCE_PATH,
      SHERPA_NODE_MODULE_PATH,
      SHERPA_NATIVE_MODULE_PATH,
    ],
  },
  hooks: {
    prePackage: async () => {
      assertModelAssetsPresent();
      assertSherpaRuntimePresent();
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerDMG(
      {
        name: 'Sherpa ONNX Demo',
        title: 'Sherpa ONNX Demo',
      },
      ['darwin'],
    ),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
