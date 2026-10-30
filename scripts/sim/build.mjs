// Bundles the simulator CLI for plain node: tsx's keepNames wraps every inner
// function on each call, which costs about a third of the run time.
import * as path from 'node:path';

import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '../..');

await build({
  entryPoints: [path.join(root, 'scripts/sim/index.ts')],
  outfile: path.join(root, 'sim-output/.build/sim.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  alias: { '@': path.join(root, 'src') },
  logLevel: 'warning',
  plugins: [
    {
      // Content files require() their icons; each one becomes its path, as in assets.cjs.
      name: 'assets',
      setup(b) {
        b.onLoad({ filter: /\.(png|jpe?g|gif|webp)$/ }, (args) => ({ contents: `module.exports = ${JSON.stringify(args.path)};`, loader: 'js' }));
      },
    },
  ],
});
