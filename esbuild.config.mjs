// Bundles src/main.js into the main.js that Obsidian loads. `node esbuild.config.mjs` watches; add `production` for one build.
import esbuild from 'esbuild';

const production = process.argv[2] === 'production';

const context = await esbuild.context({
  entryPoints: ['src/main.js'],
  bundle: true,
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
  format: 'cjs',
  target: 'es2020',
  // Not minified, so anyone can read exactly what runs in their vault
  minify: false,
  sourcemap: production ? false : 'inline',
  treeShaking: true,
  logLevel: 'info',
  outfile: 'main.js',
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
