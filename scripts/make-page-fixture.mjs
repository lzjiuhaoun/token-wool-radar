// 生成精简页面夹具：只保留线上整页中承载 loader payload 的 script 块。
// 用法：node scripts/make-page-fixture.mjs
// 整页快照缺失时自动抓取一次；产物为 test/fixtures/free-tokens.page.trimmed.html（入库）。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const FULL_FIXTURE = 'test/fixtures/free-tokens.page.html'
const TRIMMED_FIXTURE = 'test/fixtures/free-tokens.page.trimmed.html'
const PAGE_URL = 'https://aihot.news/free-tokens'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

let full
if (existsSync(FULL_FIXTURE)) {
  full = readFileSync(FULL_FIXTURE, 'utf8')
  console.log('using local snapshot:', FULL_FIXTURE)
} else {
  console.log('fetching', PAGE_URL)
  full = await (await fetch(PAGE_URL, { headers: { 'user-agent': UA } })).text()
}

const marker = 'window.__reactRouterContext.streamController.enqueue('
const at = full.indexOf(marker)
if (at === -1) throw new Error('no enqueue call found in the page')
const open = full.lastIndexOf('<script>', at)
const close = full.indexOf('</script>', at)
if (open === -1 || close === -1) throw new Error('enclosing script block not found')
const script = full.slice(open, close + '</script>'.length)
if (!script.includes('deals')) throw new Error('the script block carries no deals payload')

const trimmed = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charSet="utf-8"/><title>aihot free-tokens (fixture)</title></head>
<body><div id="root"></div>
${script}
</body>
</html>
`
writeFileSync(TRIMMED_FIXTURE, trimmed)
console.log('full:', full.length, 'chars → trimmed:', trimmed.length, 'chars →', TRIMMED_FIXTURE)
