import { build } from 'esbuild'
import { cpSync, mkdirSync } from 'node:fs'
mkdirSync('dist', { recursive: true })
await build({
  entryPoints: {
    background: 'src/ext/background.ts',
    content: 'src/ext/content.ts',
    sidepanel: 'src/ext/sidepanel.ts',
    options: 'src/ext/options.ts',
  },
  bundle: true, format: 'esm', outdir: 'dist', target: 'chrome116', sourcemap: true,
})
cpSync('src/ext/static', 'dist', { recursive: true })
