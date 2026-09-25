import { build } from 'esbuild'
import { cpSync, mkdirSync } from 'node:fs'
mkdirSync('dist', { recursive: true })
await build({
  entryPoints: {
    background: 'src/ext/background.ts',
    content: 'src/ext/content.ts',
    sidepanel: 'src/ext/sidepanel.ts',
    options: 'src/ext/options.ts',
    grant: 'src/ext/grant.ts',
  },
  bundle: true, format: 'esm', outdir: 'dist', target: 'chrome116', sourcemap: true,
})
cpSync('src/ext/static', 'dist', { recursive: true })

// web サンプル: フロートボタン widget + ページ
await build({ entryPoints: { widget: 'src/web/widget.ts' }, bundle: true, format: 'iife', outdir: 'dist/web', target: 'chrome116', sourcemap: true })
cpSync('src/web/index.html', 'dist/web/index.html')
// backend
await build({ entryPoints: { server: 'src/server/index.ts' }, bundle: true, platform: 'node', format: 'esm', outfile: 'dist/server.mjs', target: 'node20' })
