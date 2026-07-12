import { $, toast } from './utils'
import { renderView, jumpToday, shiftCursor } from './views/views'
import { openTaskModal, closeModal, openSettings } from './components/components'
import { openAIPanel } from './api/ai-panel'
import type { AppSettings, AISettings } from '@shared/types'
import { state } from './utils'

const df = (window as any).df

/** 应用入口 */
async function main(): Promise<void> {
  const data = await df.getAll()
  state.lists = data.lists
  state.tasks = data.tasks
  state.settings = data.settings
  state.ai = data.ai
  state.view = 'month'
  state.activeList = ''
  state.cursorDate = new Date()

  bindEvents()
  applySettingsToDom(state.settings)
  renderView()

  // 订阅主进程事件
  df.onSettingsChanged((s: AppSettings) => {
    state.settings = s
    applySettingsToDom(s)
  })
  df.onViewSwitch((v: 'day' | 'week' | 'month') => {
    state.view = v
    renderView()
  })
  df.onReminderDue((r: any) => {
    toast(`⏰ ${r.time} ${r.title}`)
  })
  df.onNewTask(() => openTaskModal())
  df.onClickThrough((enabled: boolean) => {
    document.body.classList.toggle('click-through', enabled)
  })
}

/** 应用设置到 DOM（CSS 变量） */
function applySettingsToDom(s: AppSettings): void {
  const root = document.documentElement
  const theme = s.themeColor || '#4f8cff'
  root.style.setProperty('--theme', theme)
  // 同步主题色 RGB 分量，供 rgba(var(--theme-rgb)) 半透明强调使用
  const m = theme.match(/^#([0-9a-f]{6})$/i)
  if (m) {
    const n = parseInt(m[1], 16)
    root.style.setProperty('--theme-rgb', `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`)
  }
  root.style.setProperty('--font-size', (s.fontSize || 14) + 'px')
  root.style.setProperty('--line-height', String(s.lineHeight || 1.6))
  const app = $('#app')!
  ;(app as HTMLElement).style.background = '' // 固定深色毛玻璃，透明度统一由窗口 setOpacity 控制
  document.body.classList.toggle('click-through', !!s.clickThrough)
}

/** 事件绑定 */
function bindEvents(): void {
  $('#btn-settings')!.onclick = () => openSettings()
  $('#btn-hide')!.onclick = () => df.windowHide()
  $('#btn-ai')!.onclick = () => openAIPanel()
  $('#btn-new-task')!.onclick = () => openTaskModal(undefined, undefined)
  $('#btn-prev')!.onclick = () => shiftCursor(-1)
  $('#btn-next')!.onclick = () => shiftCursor(1)
  $('#btn-today')!.onclick = () => jumpToday()

  // 视图切换
  document.querySelectorAll('.view-switch button').forEach((b) => {
    ;(b as HTMLElement).onclick = () => {
      state.view = (b as HTMLElement).dataset.view as any
      renderView()
    }
  })

  // 拖动由 CSS -webkit-app-region: drag 原生处理（零抖动）；
  // 拖拽结束后吸附边缘
  $('#titlebar')!.addEventListener('mouseup', () => df.windowSnap())

  // 点击遮罩关闭弹层
  ;['task-modal', 'settings-modal', 'ai-panel'].forEach((id) => {
    const m = $('#' + id)!
    m.addEventListener('click', (e) => {
      if (e.target === m) closeModal(m)
    })
  })

  // 全局快捷键 Esc 关闭弹层
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      ;['task-modal', 'settings-modal', 'ai-panel'].forEach((id) => closeModal($('#' + id)!))
    }
  })

  // 暴露给子模块用于重渲染
  ;(window as any).__render = () => {
    df.getAll().then((d: any) => {
      state.lists = d.lists
      state.tasks = d.tasks
      state.settings = d.settings
      state.ai = d.ai
      renderView()
      applySettingsToDom(state.settings)
    })
  }
}

void main()
