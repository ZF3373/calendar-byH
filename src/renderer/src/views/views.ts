import type { Task } from '@shared/types'
import { $, el, dateKey, parseDate, WEEKDAYS, startOfWeek, addDays, todayKey, pad } from '../utils'
import { renderTaskItem, openTaskModal } from '../components/components'

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
    .sort((a, b) => (parseDate(a.date)?.getTime() || 0) - (parseDate(b.date)?.getTime() || 0))
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
      const row = el('div', { class: 'month-task-mini' })
      row.append(el('span', { class: 'month-dot', style: `background:${list?.color || '#888'}` }))
      row.append(el('span', { class: 'month-mini-text', text: taskBrief(t) }))
      cell.append(row)
    }
    if (dayTasks.length > 2) {
      cell.append(el('div', { class: 'month-more', text: `+${dayTasks.length - 2} 项` }))
    }
    cell.onclick = () => openTaskModal(undefined, `${dateKey(day)} 09:00`)
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
    for (const t of tasksForDay(day)) col.append(renderTaskItem(t))
    col.onclick = (e) => {
      if ((e.target as HTMLElement).closest('.task-item')) return
      openTaskModal(undefined, `${dateKey(day)} 09:00`)
    }
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
    for (const t of allDay) body.append(renderTaskItem(t))
    strip.append(body)
    axis.append(strip)
  }

  for (let h = 0; h < 24; h++) {
    const row = el('div', { class: 'day-hour' })
    row.append(el('div', { class: 'hh', text: `${String(h).padStart(2, '0')}:00` }))
    const body = el('div', { style: 'flex:1' })
    const day = new Date(now)
    day.setHours(h)
    for (const { t, continues } of tasksForHour(day, h)) body.append(renderTaskItem(t, continues))
    row.append(body)
    row.onclick = (e) => {
      // 点空白时间行 → 以该小时为预设时间打开新建
      if ((e.target as HTMLElement).closest('.task-item')) return
      openTaskModal(undefined, `${dateKey(day)} ${String(h).padStart(2, '0')}:00`)
    }
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
}

export function shiftCursor(step: number): void {
  const s = (window as any).__state
  const d = getCursorDate()
  if (s.view === 'day') d.setDate(d.getDate() + step)
  else if (s.view === 'week') d.setDate(d.getDate() + step * 7)
  else d.setMonth(d.getMonth() + step)
  s.cursorDate = d
  renderView()
}

export function jumpToday(): void {
  ;(window as any).__state.cursorDate = new Date()
  renderView()
}
