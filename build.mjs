import { build } from 'esbuild'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
mkdirSync('dist', { recursive: true })
const BUILD = JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' '))
await build({
  entryPoints: {
    background: 'src/ext/background.ts',
    content: 'src/ext/content.ts',
    sidepanel: 'src/ext/sidepanel.ts',
    options: 'src/ext/options.ts',
    grant: 'src/ext/grant.ts',
  },
  bundle: true, format: 'esm', outdir: 'dist', target: 'chrome116', sourcemap: true, charset: 'utf8', define: { __BUILD__: BUILD },
})
cpSync('src/ext/static', 'dist', { recursive: true })

// web サンプル: フロートボタン widget + ページ
await build({ entryPoints: { widget: 'src/web/widget.ts' }, bundle: true, format: 'iife', outdir: 'dist/web', target: 'chrome116', sourcemap: true, charset: 'utf8', define: { __BUILD__: BUILD } })
cpSync('src/web/index.html', 'dist/web/index.html')
// 拡張の手動確認用サンプルは同じフォーム（widget なし）
writeFileSync('examples/form.html', readFileSync('src/web/index.html', 'utf8').replace(/<script src="widget.js"><\/script>\n?/, ''))
// backend
await build({ entryPoints: { server: 'src/server/index.ts' }, bundle: true, platform: 'node', format: 'esm', outfile: 'dist/server.mjs', target: 'node20' })
