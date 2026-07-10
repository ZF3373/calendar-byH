// 构建后处理：移除 index.html 中的 crossorigin 属性，避免 file:// 下 ES module 被 CORS 拦截
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const f = join(process.cwd(), 'out', 'renderer', 'index.html')
let html = readFileSync(f, 'utf-8')
const before = (html.match(/crossorigin/g) || []).length
html = html.replace(/\s+crossorigin/g, '')
writeFileSync(f, html, 'utf-8')
console.log(`stripped ${before} crossorigin attribute(s) from out/renderer/index.html`)
