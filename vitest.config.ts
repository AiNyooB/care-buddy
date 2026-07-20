import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Vitest 配置
// 与 vite.config.ts 共享 @/* 别名；utils 测试使用 node 环境，
// 后续如需 hooks/组件测试可在测试文件顶部用 `// @vitest-environment jsdom` 切换。
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'src-tauri/target'],
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/utils/**', 'src/store/**', 'src/services/**', 'src/data/**'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/test/**'],
    },
  },
})
