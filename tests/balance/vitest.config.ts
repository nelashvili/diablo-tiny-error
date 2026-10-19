import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../vite.config';

export default mergeConfig(
  base,
  defineConfig({ test: { include: ['tests/balance/**/*.sim.ts'], testTimeout: 600000 } }),
);
