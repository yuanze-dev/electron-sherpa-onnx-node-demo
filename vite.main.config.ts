import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'sherpa-onnx-node',
        /^sherpa-onnx-node\/.+$/,
        /^sherpa-onnx-(darwin|linux|win)-(arm64|x64|ia32)(\/.+)?$/,
      ],
    },
  },
});
