import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: [
    'src/grow.ts',
    'src/hack.ts',
    'src/weaken.ts',
    'src/upgrades.ts',
    'src/grow-loop.ts',
    'src/hack-loop.ts',
    'src/weaken-loop.ts',
    'src/basicrunner.ts'
  ], // Entry point of your TypeScript code
  output: {
    dir: 'dist', // Output directory
    format: 'es', // Output format (ES Module)
  },
  plugins: [
    typescript(),
    nodeResolve()
  ]
};
