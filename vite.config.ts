import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// GitHub Pages ではリポジトリ名がサブパスになるため base を合わせる。
// 独自ドメインやローカル開発時は '/' で問題ない。
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/fami_war_like/' : '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    // Phaser 本体が大きくバンドルされるため、警告の閾値を引き上げる
    chunkSizeWarningLimit: 1600,
  },
});
