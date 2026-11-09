import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

// Host 半：本地无依赖，直接打成单文件 ESM。
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  jsx: 'automatic',
  logLevel: 'info',
})

// Client 半：打包成 __ModuleLoader__.load 的 loader 格式；
// React 来自浏览器模块表，标为 external 由运行时 require。
await build({
  entryPoints: ['src/client/index.tsx'],
  outfile: 'dist/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome120', 'firefox120', 'safari17'],
  jsx: 'transform',
  loader: { '.css': 'text' },
  external: ['react', 'react/jsx-runtime'],
  banner: {
    js: [
      `window.__ModuleLoader__.load({`,
      `  id: ${JSON.stringify(pkg.name)},`,
      `  factory: (require) => {`,
      `    var module = { exports: {} };`,
      `    var exports = module.exports;`,
    ].join('\n'),
  },
  footer: {
    js: ['    return module.exports;', '  },', '});'].join('\n'),
  },
  logLevel: 'info',
})

console.log('built dist/index.js + dist/client.js')
