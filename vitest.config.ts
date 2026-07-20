import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // ゲームロジック(src/core)はブラウザ非依存なので node 環境でテストする
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
