import {defineConfig} from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    // 'server-only' throws at import time in non-RSC contexts (including Vitest).
    // This alias replaces it with an empty stub so tests of server-only modules
    // still exercise the real logic while the guard is preserved in production.
    alias: {'server-only': path.resolve(__dirname, 'src/__mocks__/server-only.ts')},
  },
  test: {environment: 'node', include: ['src/**/*.test.ts'], globals: true},
});
