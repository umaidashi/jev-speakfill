import { build } from 'esbuild'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
mkdirSync('dist', { recursive: true })
const BUILD = JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' '))
await build({
  entryPoints: {
    background: 'src/hosts/ext/background.ts',
    content: 'src/hosts/ext/content.ts',
    sidepanel: 'src/hosts/ext/sidepanel.ts',
    options: 'src/hosts/ext/options.ts',
    grant: 'src/hosts/ext/grant.ts',
  },
  bundle: true, format: 'esm', outdir: 'dist', target: 'chrome116', sourcemap: true, charset: 'utf8', define: { __BUILD__: BUILD },
})
cpSync('src/hosts/ext/static', 'dist', { recursive: true })

// examples/web-app: フロートボタン widget + サンプルページ + backend
await build({ entryPoints: { widget: 'examples/web-app/widget.ts' }, bundle: true, format: 'iife', outdir: 'dist/web-app', target: 'chrome116', sourcemap: true, charset: 'utf8', define: { __BUILD__: BUILD } })
cpSync('examples/web-app/index.html', 'dist/web-app/index.html')
// 拡張の手動確認用サンプルは同じフォーム（widget なし）
writeFileSync('examples/form.html', readFileSync('examples/web-app/index.html', 'utf8').replace(/<script src="widget.js"><\/script>\n?/, ''))
await build({ entryPoints: { server: 'examples/web-app/server/index.ts' }, bundle: true, platform: 'node', format: 'esm', outfile: 'dist/server.mjs', target: 'node20' })
