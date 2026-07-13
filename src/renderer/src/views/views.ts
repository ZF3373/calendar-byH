import type { Task } from '@shared/types'
import { $, el, dateKey, parseDate, WEEKDAYS, startOfWeek, addDays, todayKey, pad, repeatLabel, linkify } from '../utils'
import { renderTaskItem, openTaskModal } from '../components/components'

const df = (window as any).df

/** 判断任务在某天是否出现（含重复展开） */
function taskOnDate(t: Task, day: Date): boolean {
  const dk = dateKey(day)
  if (t.repeat === 'none') {
    const pd = parseDate(t.date)
    return !!pd && dateKey(pd) === dk
  }
  const dow = day.getDay()
  const base = parseDate(t.date) || new Date(t.createdAt)
  switch (t.repeat) {
    case 'daily':
      return true
    case 'weekday':
      return dow >= 1 && dow <= 5
    case 'weekly':
      return base.getDay() === dow
    case 'monthly':
      return base.getDate() === day.getDate()
    case 'custom': {
      const n = t.everyNDays ?? 1
      const days = Math.floor((day.getTime() - base.getTime()) / 86_400_000)
      return days >= 0 && days % n === 0
    }
    default:
      return false
  }
}

function tasksForDay(day: Date): Task[] {
  const all = getVisibleTasks()
  return all
    .filter((t) => taskOnDate(t, day))
    .sort((a, b) => {
      const oa = typeof a.order === 'number' ? a.order : 0
      const ob = typeof b.order === 'number' ? b.order : 0
      if (oa !== ob) return oa - ob
      return (parseDate(a.date)?.getTime() || 0) - (parseDate(b.date)?.getTime() || 0)
    })
}

function getVisibleTasks(): Task[] {
  const s = (window as any).__state
  const all = s.tasks as Task[]
  return s.activeList ? all.filter((t) => t.listId === s.activeList) : all
}

function getCursorDate(): Date {
  const cur = (window as any).__state.cursorDate
  return cur instanceof Date ? new Date(cur) : new Date()
}

const MONTH_NAMES = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

/** 拖拽浮层（显示任务标题，跟随鼠标，比原生 drag image 更直观） */
let dragOverlay: HTMLElement | null = null

function showDragOverlay(title: string, x: number, y: number): void {
  hideDragOverlay()
  const ov = document.createElement('div')
  ov.className = 'drag-overlay'
  ov.textContent = title
  ov.style.left = x + 'px'
  ov.style.top = y + 'px'
  document.body.appendChild(ov)
  dragOverlay = ov
}

function moveDragOverlay(x: number, y: number): void {
  if (dragOverlay) {
    dragOverlay.style.left = x + 'px'
    dragOverlay.style.top = y + 'px'
  }
}

function hideDragOverlay(): void {
  if (dragOverlay) {
    dragOverlay.remove()
    dragOverlay = null
  }
}

/** 给任务项元素加拖拽源（记录任务 id），供月/周/日视图统一复用 */
function makeDraggableTask(item: HTMLElement, t: Task): void {
  item.setAttribute('draggable', 'true')
  item.addEventListener('dragstart', (e) => {
    ;(window as any).__dragTaskId = t.id
    item.classList.add('dragging')
    // 隐藏浏览器原生 drag image（用自定义浮层替代）
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', t.id)
      const img = new Image()
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
      try { e.dataTransfer.setDragImage(img, 0, 0) } catch { /* 忽略 */ }
    }
    showDragOverlay(t.title, e.clientX, e.clientY)
  })
  item.addEventListener('drag', (e) => {
    if (e.clientX || e.clientY) moveDragOverlay(e.clientX, e.clientY)
  })
  item.addEventListener('dragend', () => {
    item.classList.remove('dragging')
    ;(window as any).__dragTaskId = null
    document.querySelectorAll('.drop-target').forEach((c) => c.classList.remove('drop-target'))
    hideDragOverlay()
  })
}

// 全局跟随鼠标更新浮层位置（drag 事件在某些容器外不触发，document 级更稳）
document.addEventListener('dragover', (e) => {
  if (dragOverlay) moveDragOverlay(e.clientX, e.clientY)
})

/**
 * 给某容器绑定「拖放改期」目标。
 * @param el      目标容器（周列 / 日时间行 / 全天区）
 * @param day     目标日期
 * @param hour    目标小时（不传则保留原时间；传 undefined 且 allDay=true 表示转为全天）
 * @param allDay  为 true 时把任务改为无具体时间（全天）
 */
function bindDayDropTarget(el: HTMLElement, day: Date, hour?: number, allDay = false): void {
  el.addEventListener('dragover', (e) => {
    if (!(window as any).__dragTaskId) return
    e.preventDefault()
    e.dataTransfer && (e.dataTransfer.dropEffect = 'move')
    el.classList.add('drop-target')
  })
  el.addEventListener('dragleave', () => el.classList.remove('drop-target'))
  el.addEventListener('drop', async (e) => {
    e.preventDefault()
    el.classList.remove('drop-target')
    const id = (window as any).__dragTaskId as string | null
    if (!id) return
    const task = ((window as any).__state.tasks as Task[]).find((x) => x.id === id)
    if (!task) return
    let newDate: string
    if (allDay) {
      // 全天：仅日期，无时间
      newDate = dateKey(day)
    } else {
      const orig = parseDate(task.date)
      const hh = hour !== undefined ? pad(hour) : orig ? pad(orig.getHours()) : '09'
      const mm = hour !== undefined ? '00' : orig ? pad(orig.getMinutes()) : '00'
      newDate = `${dateKey(day)}T${hh}:${mm}`
    }
    if (task.date === newDate) return
    await df.updateTask(id, { date: newDate })
    ;(window as any).__render()
  })
}

function taskBrief(task: Task): string {
  const d = parseDate(task.date)
  if (!d) return task.title
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${task.title}`
}

export function renderMonth(container: HTMLElement): void {
  container.innerHTML = ''
  const lists = (window as any).__state.lists
  const cur = getCursorDate()
  const y = cur.getFullYear()
  const m = cur.getMonth()
  $('#period-label')!.textContent = `${y}年 ${MONTH_NAMES[m]}`

  const first = new Date(y, m, 1)
  const startDow = first.getDay()
  const gridStart = addDays(first, -startDow)
  const grid = el('div', { class: 'month-grid' })
  for (const wd of WEEKDAYS) {
    grid.append(el('div', { class: 'month-weekhead', text: `周${wd}` }))
  }
  for (let i = 0; i < 42; i++) {
    const day = addDays(gridStart, i)
    const inMonth = day.getMonth() === m
    const dk = dateKey(day)
    const dayTasks = tasksForDay(day)
    const cell = el('div', {
      class: `month-cell${inMonth ? '' : ' other'}${dk === todayKey() ? ' today' : ''}`
    })
    cell.append(el('div', { class: 'dnum', text: String(day.getDate()) }))
    for (const t of dayTasks.slice(0, 2)) {
      const list = lists.find((l: any) => l.id === t.listId)
      const row = el('div', { class: 'month-task-mini', draggable: 'true' })
      row.dataset.id = t.id
      row.dataset.date = t.date || ''
      row.append(el('span', { class: 'month-dot', style: `background:${list?.color || '#888'}` }))
      row.append(el('span', { class: 'month-mini-text', text: taskBrief(t) }))
      // 拖拽开始：记录任务 id
      row.addEventListener('dragstart', (e) => {
        ;(window as any).__dragTaskId = t.id
        row.classList.add('dragging')
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', t.id)
        }
        e.stopPropagation()
      })
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging')
        ;(window as any).__dragTaskId = null
        document.querySelectorAll('.month-cell.drop-target').forEach((c) => c.classList.remove('drop-target'))
      })
      cell.append(row)
    }
    if (dayTasks.length > 2) {
      cell.append(el('div', { class: 'month-more', text: `+${dayTasks.length - 2} 项` }))
    }
    cell.onclick = () => {
      ;(window as any).__state.selectedDate = day
      openTaskModal(undefined, `${dateKey(day)} 09:00`)
    }
    // 拖放目标：把任务改期到该日（保留原时间）
    cell.addEventListener('dragover', (e) => {
      if (!(window as any).__dragTaskId) return
      e.preventDefault()
      e.dataTransfer && (e.dataTransfer.dropEffect = 'move')
      cell.classList.add('drop-target')
    })
    cell.addEventListener('dragleave', () => cell.classList.remove('drop-target'))
    cell.addEventListener('drop', async (e) => {
      e.preventDefault()
      cell.classList.remove('drop-target')
      const id = (window as any).__dragTaskId as string | null
      if (!id) return
      const task = ((window as any).__state.tasks as Task[]).find((x) => x.id === id)
      if (!task) return
      // 拼出目标日期：目标日 + 原时间（无时间则默认 09:00）
      const orig = parseDate(task.date)
      const hh = orig ? pad(orig.getHours()) : '09'
      const mm = orig ? pad(orig.getMinutes()) : '00'
      const newDate = `${dateKey(day)}T${hh}:${mm}`
      if (task.date === newDate) return
      await df.updateTask(id, { date: newDate })
      ;(window as any).__render()
    })
    grid.append(cell)
  }
  container.append(grid)
}

export function renderWeek(container: HTMLElement): void {
  container.innerHTML = ''
  const start = startOfWeek(getCursorDate())
  $('#period-label')!.textContent = `${dateKey(start)} ~ ${dateKey(addDays(start, 6))}`
  const grid = el('div', { class: 'week-grid' })
  for (let i = 0; i < 7; i++) {
    const day = addDays(start, i)
    const col = el('div', { class: `week-col${dateKey(day) === todayKey() ? ' today' : ''}` })
    col.append(el('div', { class: 'wd', text: `周${WEEKDAYS[day.getDay()]} ${day.getDate()}` }))
    for (const t of tasksForDay(day)) {
      const item = renderTaskItem(t)
      makeDraggableTask(item, t)
      col.append(item)
    }
    col.onclick = (e) => {
      if ((e.target as HTMLElement).closest('.task-item')) return
      openTaskModal(undefined, `${dateKey(day)} 09:00`)
    }
    // 拖放目标：把任务改期到该日（保留原时间）
    bindDayDropTarget(col, day)
    grid.append(col)
  }
  container.append(grid)
}

export function renderDay(container: HTMLElement): void {
  container.innerHTML = ''
  const now = getCursorDate()
  $('#period-label')!.textContent = `${dateKey(now)} 周${WEEKDAYS[now.getDay()]}`
  const axis = el('div', { class: 'day-axis' })

  // 全天任务（无具体时间 / 重复任务无 date-time）：单独置顶展示一次
  const allDay = tasksForDay(now).filter((t) => !parseDate(t.date)?.getHours() && (t.repeat !== 'none' || !t.date))
  if (allDay.length) {
    const strip = el('div', { class: 'all-day', style: 'margin-bottom:8px' })
    strip.append(el('div', { class: 'hh', text: '全天' }))
    const body = el('div', { style: 'flex:1' })
    for (const t of allDay) {
      const item = renderTaskItem(t)
      makeDraggableTask(item, t)
      body.append(item)
    }
    strip.append(body)
    // 全天区作为 drop 目标：拖到此处 → 清除具体时间（转为全天）
    bindDayDropTarget(strip, now, undefined, true)
    axis.append(strip)
  }

  for (let h = 0; h < 24; h++) {
    const row = el('div', { class: 'day-hour' })
    row.append(el('div', { class: 'hh', text: `${String(h).padStart(2, '0')}:00` }))
    const body = el('div', { style: 'flex:1' })
    const day = new Date(now)
    day.setHours(h)
    for (const { t, continues } of tasksForHour(day, h)) {
      const item = renderTaskItem(t, continues)
      makeDraggableTask(item, t)
      body.append(item)
    }
    row.append(body)
    row.onclick = (e) => {
      // 点空白时间行 → 以该小时为预设时间打开新建
      if ((e.target as HTMLElement).closest('.task-item')) return
      openTaskModal(undefined, `${dateKey(day)} ${String(h).padStart(2, '0')}:00`)
    }
    // 拖放目标：把任务改期到「今天 + 该小时」
    bindDayDropTarget(row, now, h)
    axis.append(row)
  }
  container.append(axis)
}

/** 按小时返回该小时应显示的任务；带 endDate 的时间段任务会跨多小时逐行铺开 */
function tasksForHour(day: Date, h: number): { t: Task; continues: boolean }[] {
  const all = getVisibleTasks()
  const out: { t: Task; continues: boolean }[] = []
  for (const t of all) {
    if (!taskOnDate(t, day)) continue
    const pd = parseDate(t.date)
    const pe = parseDate(t.endDate)
    if (!pd) continue // 无具体时间的重复任务已在全天区
    const sh = pd.getHours()
    if (sh === h) out.push({ t, continues: false }) // 起点
    else if (pe && h > sh && h <= pe.getHours()) out.push({ t, continues: true }) // 跨行中段/末端
  }
  out.sort((a, b) => (parseDate(a.t.date)?.getMinutes() || 0) - (parseDate(b.t.date)?.getMinutes() || 0))
  return out
}

export function renderView(): void {
  const v = (window as any).__state.view as string
  const view = $('#view')!
  if (v === 'day') renderDay(view)
  else if (v === 'week') renderWeek(view)
  else renderMonth(view)
  // 高亮视图按钮
  document.querySelectorAll('.view-switch button').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.view === v)
  })
  renderDetail()
}

/** 右侧当日详情面板：迷你日历 + 选中日任务清单（对标参考 HTML 布局） */
export function renderDetail(): void {
  const s = (window as any).__state
  const panel = $('#detail')!
  panel.innerHTML = ''
  // 日/周视图下详情面板跟随光标日；月视图下跟随 selectedDate
  const base = s.view === 'month' ? s.selectedDate : s.cursorDate
  const sel = base instanceof Date ? new Date(base) : new Date()

  // 头部
  const head = el('div', { class: 'detail-head' })
  const prev = el('i', { class: 'fa fa-chevron-left', text: '‹' })
  prev.style.cursor = 'pointer'
  prev.onclick = () => { sel.setMonth(sel.getMonth() - 1); s.selectedDate = sel; renderDetail() }
  const next = el('i', { class: 'fa fa-chevron-right', text: '›' })
  next.style.cursor = 'pointer'
  next.onclick = () => { sel.setMonth(sel.getMonth() + 1); s.selectedDate = sel; renderDetail() }
  head.append(prev, el('span', { class: 'detail-month', text: `${sel.getFullYear()}年${sel.getMonth() + 1}月` }), next)
  panel.append(head)

  // 迷你日历（选中日所属月）
  panel.append(renderMiniCalendar(sel))

  // 选中日任务清单
  const dayTasks = tasksForDay(sel)
  const listWrap = el('div', { class: 'detail-tasks' })
  listWrap.append(el('div', { class: 'detail-date', text: `${sel.getMonth() + 1}月${sel.getDate()}日 周${WEEKDAYS[sel.getDay()]}` }))
  if (dayTasks.length === 0) {
    listWrap.append(el('div', { class: 'empty-hint', text: '暂无任务' }))
  } else {
    for (const t of dayTasks) {
      const lists = (window as any).__state.lists
      const list = lists.find((l: any) => l.id === t.listId)
      const row = el('div', { class: `detail-task${t.done ? ' done' : ''}`, draggable: 'true' })
      row.dataset.id = t.id
      row.dataset.list = t.listId

      // 左：勾选圈
      const check = el('span', { class: `detail-check${t.done ? ' done' : ''}`, text: t.done ? '✓' : '' })
      check.onclick = async (e) => {
        e.stopPropagation()
        await df.updateTask(t.id, { done: !t.done })
        ;(window as any).__render()
      }
      row.append(check)

      // 右：主体（标题 + 元信息）
      const body = el('div', { class: 'detail-task-body' })
      const title = el('div', { class: 'detail-task-title' })
      title.append(...linkify(t.title))
      if (!t.done && list?.color) title.style.color = list.color
      body.append(title)

      const meta: string[] = []
      const pd = parseDate(t.date)
      const pe = parseDate(t.endDate)
      if (pd) {
        if (pe) meta.push(`${pad(pd.getHours())}:${pad(pd.getMinutes())}–${pad(pe.getHours())}:${pad(pe.getMinutes())}`)
        else if (pd.getHours() || pd.getMinutes()) meta.push(`${pad(pd.getHours())}:${pad(pd.getMinutes())}`)
      }
      const rl = repeatLabel(t.repeat)
      if (rl) meta.push(rl)
      if (t.reminders.length) meta.push(`🔔 ${t.reminders.map((r: any) => r.time).join(' ')}`)
      if (list) meta.push(`#${list.name}`)
      if (meta.length) body.append(el('div', { class: 'detail-task-meta', text: meta.join('  ·  ') }))
      if (t.note) {
        const note = el('div', { class: 'detail-task-note' })
        note.append(...linkify(t.note))
        body.append(note)
      }

      row.append(body)
      row.onclick = () => openTaskModal(t)
      listWrap.append(row)
    }

    // 拖拽重排：仅同清单内生效（order 按 listId 独立编号，跨清单不污染）
    bindDetailDragReorder(listWrap)
  }
  panel.append(listWrap)
}

/**
 * 详情面板任务卡片拖拽重排。
 * 仅允许同一清单(listId)内的卡片互相排序；跨清单拖拽不触发持久化（避免污染其他清单的 order）。
 * 重排后按当前 DOM 顺序，对受影响清单分别调用 df.reorderTasks。
 */
function bindDetailDragReorder(wrap: HTMLElement): void {
  let dragId: string | null = null
  let dragList: string | null = null

  wrap.addEventListener('dragstart', (e) => {
    const card = (e.target as HTMLElement).closest('.detail-task') as HTMLElement | null
    if (!card) return
    dragId = card.dataset.id || null
    dragList = card.dataset.list || null
    card.classList.add('dragging')
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', dragId || '')
    }
  })

  wrap.addEventListener('dragover', (e) => {
    e.preventDefault()
    if (!dragId) return
    const over = (e.target as HTMLElement).closest('.detail-task') as HTMLElement | null
    if (!over || over.dataset.id === dragId) return
    // 跨清单不允许插值（保持语义干净）
    if (over.dataset.list !== dragList) return
    const dragging = wrap.querySelector('.detail-task.dragging') as HTMLElement | null
    if (!dragging) return
    const rect = over.getBoundingClientRect()
    const after = e.clientY > rect.top + rect.height / 2
    wrap.insertBefore(dragging, after ? over.nextSibling : over)
  })

  wrap.addEventListener('dragend', async () => {
    const dragging = wrap.querySelector('.detail-task.dragging') as HTMLElement | null
    if (dragging) dragging.classList.remove('dragging')
    if (!dragId || !dragList) return
    // 收集当前 DOM 顺序，按 listId 分组提取受影响清单的新顺序
    const changed = new Map<string, string[]>()
    wrap.querySelectorAll('.detail-task')!.forEach((c) => {
      const elc = c as HTMLElement
      const lid = elc.dataset.list
      const cid = elc.dataset.id
      if (!lid || !cid) return
      if (!changed.has(lid)) changed.set(lid, [])
      changed.get(lid)!.push(cid)
    })
    // 仅持久化「与拖拽源同清单」的那一组（其余分组顺序未变，避免误写）
    const ordered = changed.get(dragList)
    if (ordered && ordered.length > 1) {
      await df.reorderTasks(dragList, ordered)
    }
    dragId = null
    dragList = null
    ;(window as any).__render()
  })
}

/** 迷你月历：点击某天切换 selectedDate 并重渲染详情面板 */
function renderMiniCalendar(sel: Date): HTMLElement {
  const s = (window as any).__state
  const y = sel.getFullYear()
  const m = sel.getMonth()
  const first = new Date(y, m, 1)
  const startDow = first.getDay()
  const gridStart = addDays(first, -startDow)
  const wrap = el('div', { class: 'mini-cal' })
  for (const wd of WEEKDAYS) {
    wrap.append(el('div', { class: 'mini-weekhead', text: `周${wd}` }))
  }
  for (let i = 0; i < 42; i++) {
    const day = addDays(gridStart, i)
    const inMonth = day.getMonth() === m
    const dk = dateKey(day)
    const isSel = dk === dateKey(s.selectedDate)
    const isToday = dk === todayKey()
    const cls = `mini-cell${inMonth ? '' : ' other'}${isSel ? ' selected' : ''}${isToday ? ' today' : ''}`
    const cell = el('div', { class: cls })
    cell.append(el('span', { class: 'mini-dnum', text: String(day.getDate()) }))
    // 有任务的日子：按清单色渲染小圆点（最多 3 个）
    const dayTasks = tasksForDay(day)
    if (dayTasks.length) {
      const dots = el('div', { class: 'mini-dots' })
      const seen = new Set<string>()
      for (const t of dayTasks) {
        if (seen.size >= 3) break
        const list = (window as any).__state.lists.find((l: any) => l.id === t.listId)
        const color = list?.color || '#888'
        if (seen.has(color)) continue
        seen.add(color)
        const dot = el('span', { class: 'mini-dot' })
        dot.style.background = color
        dots.append(dot)
      }
      cell.append(dots)
    }
    cell.onclick = () => {
      if (s.view === 'month') {
        s.selectedDate = day
        renderDetail()
      } else {
        // 日/周视图下点击迷你日历 → 主视图光标跳转到该天
        s.cursorDate = day
        renderView()
      }
    }
    wrap.append(cell)
  }
  return wrap
}

export function shiftCursor(step: number): void {
  const s = (window as any).__state
  const d = getCursorDate()
  if (s.view === 'day') d.setDate(d.getDate() + step)
  else if (s.view === 'week') d.setDate(d.getDate() + step * 7)
  else d.setMonth(d.getMonth() + step)
  s.cursorDate = d
  s.selectedDate = d
  renderView()
}

export function jumpToday(): void {
  ;(window as any).__state.cursorDate = new Date()
  ;(window as any).__state.selectedDate = new Date()
  renderView()
}
