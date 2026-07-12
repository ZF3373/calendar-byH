// 渲染进程共享工具
import type { Task, TaskList, AppSettings, AISettings, RepeatType } from '@shared/types'

declare const df: import('../../preload/index').DesktopFlowAPI

export type { Task, TaskList, AppSettings, AISettings, RepeatType }

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(sel)

export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k === 'html') node.innerHTML = v
    else if (k === 'text') node.textContent = v
    else node.setAttribute(k, v)
  }
  for (const c of children) node.append(c)
  return node
}

// 日期工具
export const pad = (n: number) => String(n).padStart(2, '0')
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayKey = () => dateKey(new Date())

export function parseDate(s?: string): Date | null {
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  return new Date(Number(y), Number(mo) - 1, Number(d), h ? Number(h) : 0, mi ? Number(mi) : 0)
}

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const diff = x.getDay() // 周日=0
  x.setDate(x.getDate() - diff)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function repeatLabel(r: RepeatType): string {
  return (
    {
      none: '',
      daily: '每天',
      weekly: '每周',
      monthly: '每月',
      weekday: '工作日',
      custom: '自定义'
    }[r] || ''
  )
}

let toastTimer: number | undefined
export function toast(msg: string): void {
  const t = $('#toast')!
  t.textContent = msg
  t.classList.remove('hidden')
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => t.classList.add('hidden'), 2000)
}

// 全局状态
export const state = {
  lists: [] as TaskList[],
  tasks: [] as Task[],
  settings: {} as AppSettings,
  ai: {} as AISettings,
  view: 'month' as 'day' | 'week' | 'month',
  activeList: '' as string, // '' = 全部
  cursorDate: new Date()
}

// 暴露到 window，供子模块（views/components）共享同一状态实例
;(globalThis as any).__state = state
