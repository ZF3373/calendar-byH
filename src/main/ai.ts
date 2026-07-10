import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { AISettings } from '@shared/types'

interface CacheEntry {
  ts: number
  text: string
}
type CacheMap = Record<string, CacheEntry>

/**
 * DeepSeek AI 客户端（主进程）。
 * - 直连 OpenAI 兼容接口
 * - 本地缓存：相同请求命中缓存离线可用（需求 2.6 本地缓存优先）
 */
export class AIClient {
  private cacheDir = join(app.getPath('userData'), 'ai-cache')
  private cacheFile = join(this.cacheDir, 'cache.json')
  private cache: CacheMap = {}

  constructor() {
    try {
      if (!existsSync(this.cacheDir)) mkdirSync(this.cacheDir, { recursive: true })
      if (existsSync(this.cacheFile)) {
        this.cache = JSON.parse(readFileSync(this.cacheFile, 'utf-8'))
      }
    } catch {
      this.cache = {}
    }
  }

  private cacheKey(cfg: AISettings, messages: { role: string; content: string }[]): string {
    return cfg.model + '|' + JSON.stringify(messages)
  }

  private saveCache(): void {
    try {
      writeFileSync(this.cacheFile, JSON.stringify(this.cache), 'utf-8')
    } catch {
      /* 缓存写入失败不影响主流程 */
    }
  }

  /** 调用模型；offline=true 时仅查缓存 */
  async chat(
    cfg: AISettings,
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    opts: { offline?: boolean; timeoutMs?: number } = {}
  ): Promise<string> {
    const key = this.cacheKey(cfg, messages)
    const hit = this.cache[key]
    if (hit && Date.now() - hit.ts < 7 * 86_400_000) {
      return hit.text // 一周内缓存有效
    }
    if (opts.offline) {
      throw new Error('离线且无缓存')
    }
    if (!cfg.apiKey) throw new Error('未配置 API Key')

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 30_000)
    try {
      const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          temperature: 0.7,
          stream: false
        }),
        signal: ctrl.signal
      })
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        throw new Error(`AI 请求失败 (${resp.status}): ${errText.slice(0, 200)}`)
      }
      const data = await resp.json()
      const text: string = data?.choices?.[0]?.message?.content ?? ''
      this.cache[key] = { ts: Date.now(), text }
      this.saveCache()
      return text
    } finally {
      clearTimeout(timer)
    }
  }
}

export const aiClient = new AIClient()
