import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: [
    'src/grow.ts',
    'src/hack.ts'
  ], // Entry point of your TypeScript code
  output: {
    dir: 'dist', // Output directory
    format: 'cjs', // Output format (ES Module)
  },
  plugins: [
    typescript(),
    nodeResolve()
  ]
};
