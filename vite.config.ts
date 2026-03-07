/// <reference types="vitest/config" />
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  // Fail production build if mock/simulate audio env is set (e.g. on Vercel)
  if (mode === 'production' && (env.VITE_AUDIO_MOCK === 'true' || env.VITE_SIMULATE_AUDIO === 'true')) {
    throw new Error(
      'Do not set VITE_AUDIO_MOCK or VITE_SIMULATE_AUDIO in production (e.g. Vercel). Remove them from Environment Variables and redeploy.'
    );
  }
  return {
    server: {
      port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.OPEN_ROUTER_API_KEY),
      'process.env.OPEN_ROUTER_API_KEY': JSON.stringify(env.OPEN_ROUTER_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['**/*.test.ts', '**/*.test.tsx', 'e2e/**/*.e2e.test.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json-summary'],
        include: [
          'schemas/**/*.ts',
          'services/**/*.ts',
          'lib/**/*.ts',
          'api/**/*.ts',
        ],
        exclude: ['**/*.test.ts', '**/*.integration.test.ts', '**/*.d.ts', 'node_modules'],
      },
    },
  };
});
