import { $, el, toast } from './utils'
import { renderView } from './views/views'
import { openTaskModal, openSettings, closeModal } from './components/components'
import { openAIPanel } from './api/ai-panel'
import type { Task, TaskList, AppSettings, AISettings } from '@shared/types'
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

  bindEvents()
  applySettingsToDom(state.settings)
  renderSidebar()
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

/** 渲染左侧清单栏 */
function renderSidebar(): void {
  const sb = $('#sidebar')!
  sb.innerHTML = ''
  const allItem = el('div', { class: `list-item${state.activeList === '' ? ' active' : ''}` })
  allItem.append(el('span', { class: 'list-dot', style: 'background:#bbb' }))
  allItem.append(el('span', { class: 'list-name', text: '全部' }))
  allItem.append(el('span', { class: 'list-count', text: String(state.tasks.length) }))
  allItem.onclick = () => {
    state.activeList = ''
    renderSidebar()
    renderView()
  }
  sb.append(allItem)

  for (const l of state.lists as TaskList[]) {
    const cnt = (state.tasks as Task[]).filter((t) => t.listId === l.id).length
    const item = el('div', { class: `list-item${state.activeList === l.id ? ' active' : ''}` })
    item.append(el('span', { class: 'list-dot', style: `background:${l.color}` }))
    item.append(el('span', { class: 'list-name', text: l.name }))
    item.append(el('span', { class: 'list-count', text: String(cnt) }))
    item.onclick = () => {
      state.activeList = l.id
      renderSidebar()
      renderView()
    }
    sb.append(item)
  }

  const add = el('button', { id: 'add-list', text: '＋ 新建清单' })
  add.onclick = () => promptAddList()
  sb.append(add)
}

function promptAddList(): void {
  const name = prompt('清单名称：')
  if (!name) return
  const color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
  df.addList(name.trim(), color).then(() => df.getAll().then((d: any) => {
    state.lists = d.lists
    state.tasks = d.tasks
    renderSidebar()
  }))
}

/** 事件绑定 */
function bindEvents(): void {
  $('#btn-new')!.onclick = () => openTaskModal()
  $('#btn-settings')!.onclick = () => openSettings()
  $('#btn-ai')!.onclick = () => openAIPanel()
  $('#btn-hide')!.onclick = () => df.windowHide()

  // 视图切换
  document.querySelectorAll('.view-switch button').forEach((b) => {
    ;(b as HTMLElement).onclick = () => {
      state.view = (b as HTMLElement).dataset.view as any
      renderView()
    }
  })

  // 标题栏拖拽（发送 snap 由 main 处理边缘吸附）
  const tb = $('#titlebar')!
  let drag = false
  let sx = 0
  let sy = 0
  tb.addEventListener('mousedown', (e) => {
    drag = true
    sx = e.clientX
    sy = e.clientY
  })
  window.addEventListener('mouseup', () => {
    if (drag) {
      drag = false
      df.windowSnap()
    }
  })
  window.addEventListener('mousemove', (e) => {
    if (!drag) return
    // 透传位移给主进程需额外实现；此处仅触发 snap 逻辑
    void (sx - e.clientX)
    void (sy - e.clientY)
  })

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
      renderSidebar()
      renderView()
      applySettingsToDom(state.settings)
    })
  }
}

void main()
