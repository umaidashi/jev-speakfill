// npm パッケージ用: 型は tsc、JS は入口ごとに esbuild で 1 ファイルに束ねる（Node ESM は拡張子なしの相対 import を解決できないため）
import { build } from 'esbuild'
import { execSync } from 'node:child_process'
import { rmSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
rmSync('dist/lib', { recursive: true, force: true })
execSync('tsc -p tsconfig.build.json', { stdio: 'inherit' })
for (const [entry, out] of [['src/core/index.ts', 'dist/lib/core/index.js'], ['src/hosts/dom/index.ts', 'dist/lib/hosts/dom/index.js'], ['src/hosts/web/index.ts', 'dist/lib/hosts/web/index.js']]) {
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', outfile: out, charset: 'utf8', external: [] })
}

// .d.ts の相対 import に .js を付ける（moduleResolution: nodenext の利用者が型を解決できるように）
function fixDts(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) fixDts(p)
    else if (name.endsWith('.d.ts')) {
      const add = (m, a, b, c) => (/\.(js|d\.ts|json)$/.test(b) ? m : `${a}${b}.js${c}`)
      writeFileSync(p, readFileSync(p, 'utf8')
        .replace(/(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g, add)          // import ... from './x'
        .replace(/(import\(['"])(\.\.?\/[^'"]+?)(['"]\))/g, add))       // import("./x").T
    }
  }
}
fixDts('dist/lib')
