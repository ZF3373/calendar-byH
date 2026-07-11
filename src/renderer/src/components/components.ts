import type { Task, RepeatType } from '@shared/types'
import { $, el, toast, parseDate, pad, dateKey, repeatLabel, todayKey } from '../utils'

const df = (window as any).df

/** 渲染单个任务项（可勾选/拖拽/删除/点击编辑） */
export function renderTaskItem(t: Task): HTMLElement {
  const lists = (window as any).__state.lists
  const list = lists.find((l: any) => l.id === t.listId)
  const item = el('div', { class: `task-item${t.done ? ' done' : ''}`, draggable: 'true' })
  item.dataset.id = t.id

  const check = el('div', { class: 'task-check', text: t.done ? '✓' : '' })
  check.onclick = async (e) => {
    e.stopPropagation()
    await df.updateTask(t.id, { done: !t.done })
    ;(window as any).__render()
  }
  const title = el('div', { class: 'task-title', text: t.title })

  const meta: string[] = []
  const pd = parseDate(t.date)
  if (pd) meta.push(`${pad(pd.getMonth() + 1)}/${pad(pd.getDate())}`)
  const rl = repeatLabel(t.repeat)
  if (rl) meta.push(rl)
  if (t.reminders.length) meta.push(`🔔${t.reminders.map((r: any) => r.time).join('/')}`)

  const metaEl = el('div', { class: 'task-meta' })
  if (meta.length) metaEl.append(el('span', { text: meta.join(' · ') }))
  if (list) metaEl.append(el('span', { text: '#' + list.name, style: `color:${list.color}` }))

  const del = el('button', { class: 'task-del', text: '✕', title: '删除' })
  del.onclick = async (e) => {
    e.stopPropagation()
    await df.deleteTask(t.id)
    ;(window as any).__render()
  }

  item.append(check, title, metaEl, del)
  item.onclick = () => openTaskModal(t)
  return item
}

const REPEAT_OPTS: { v: RepeatType; label: string }[] = [
  { v: 'none', label: '不重复' },
  { v: 'daily', label: '每天' },
  { v: 'weekly', label: '每周' },
  { v: 'monthly', label: '每月' },
  { v: 'weekday', label: '工作日' },
  { v: 'custom', label: '自定义(天)' }
]

/** 新建/编辑任务弹层；presetDate 为点击视图位置预填的日期时间(YYYY-MM-DD HH:mm) */
export function openTaskModal(existing?: Task, presetDate?: string): void {
  const modal = $('#task-modal')!
  const lists = (window as any).__state.lists as any[]
  const t = existing
  const pd = t ? parseDate(t.date) : presetDate ? parseDate(presetDate.replace(' ', 'T')) : null
  const dateVal = pd ? `${dateKey(pd)}T${pad(pd.getHours())}:${pad(pd.getMinutes())}` : ''

  modal.innerHTML = ''
  const card = el('div', { class: 'modal-card' })
  card.append(el('h3', { text: t ? '编辑任务' : '新建任务' }))

  const titleField = field('标题', () => input({ id: 'f-title', placeholder: '要做点什么？' }, t?.title || ''))
  const listField = field(
    '清单',
    () =>
      select(
        lists.map((l) => ({ value: l.id, label: l.name, selected: t?.listId === l.id }))
      )
  )
  // list select 需要 id
  ;(listField.querySelector('select') as HTMLSelectElement).id = 'f-list'
  const dateField = field('日期时间', () => input({ id: 'f-date', type: 'datetime-local' }, dateVal))
  const repeatField = field(
    '重复',
    () => select(REPEAT_OPTS.map((o) => ({ value: o.v, label: o.label, selected: t?.repeat === o.v })))
  )
  ;(repeatField.querySelector('select') as HTMLSelectElement).id = 'f-repeat'
  const customField = field('自定义周期(天)', () => input({ id: 'f-custom', type: 'number', min: '1' }, String(t?.everyNDays || 2)))
  const remindField = field(
    '提醒时段(逗号分隔 HH:mm)',
    () => input({ id: 'f-remind', placeholder: '09:30,18:00' }, t?.reminders.map((r: any) => r.time).join(',') || '')
  )
  const noteField = field('备注', () => textarea({ id: 'f-note', rows: '2' }, t?.note || ''))

  const save = el('button', { class: 'btn-primary', text: t ? '保存' : '创建' })
  save.onclick = async () => {
    const title = ($('#f-title') as HTMLInputElement).value.trim()
    if (!title) return toast('标题不能为空')
    const listId = ($('#f-list') as HTMLSelectElement).value
    const dateRaw = ($('#f-date') as HTMLInputElement).value
    const repeat = ($('#f-repeat') as HTMLSelectElement).value as RepeatType
    const everyNDays = Number(($('#f-custom') as HTMLInputElement).value) || 2
    const remindRaw = ($('#f-remind') as HTMLInputElement).value
    const note = ($('#f-note') as HTMLTextAreaElement).value
    const reminders = remindRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((time, i) => ({ id: 'r' + i + Date.now().toString(36), time }))

    const payload: any = {
      listId,
      title,
      repeat,
      everyNDays: repeat === 'custom' ? everyNDays : undefined,
      reminders,
      note,
      done: t?.done || false
    }
    if (dateRaw) payload.date = dateRaw.replace('T', ' ')
    if (t) {
      await df.updateTask(t.id, payload)
    } else {
      await df.addTask(payload)
    }
    closeModal(modal)
    ;(window as any).__render()
    toast(t ? '已保存' : '已创建')
  }
  const cancel = el('button', { class: 'btn-ghost', text: '取消' })
  cancel.onclick = () => closeModal(modal)

  card.append(titleField, listField, dateField, repeatField, customField, remindField, noteField, save, cancel)
  modal.append(card)
  modal.classList.remove('hidden')
}

export function closeModal(m: HTMLElement): void {
  m.classList.add('hidden')
  m.innerHTML = ''
}

function field(label: string, build: () => HTMLElement): HTMLElement {
  const wrap = el('div', { class: 'field' })
  wrap.append(el('label', { text: label }))
  wrap.append(build())
  return wrap
}

// 安全构造辅助：用 DOM 属性赋值（.value/.textContent 天然免疫 XSS），杜绝 innerHTML 拼接用户数据
function input(attrs: Record<string, string>, value = ''): HTMLInputElement {
  const i = document.createElement('input')
  for (const [k, v] of Object.entries(attrs)) i.setAttribute(k, v)
  i.value = value
  return i
}
function textarea(attrs: Record<string, string>, value = ''): HTMLTextAreaElement {
  const t = document.createElement('textarea')
  for (const [k, v] of Object.entries(attrs)) t.setAttribute(k, v)
  t.value = value
  return t
}
function select(opts: { value: string; label: string; selected: boolean }[]): HTMLSelectElement {
  const s = document.createElement('select')
  for (const o of opts) {
    const op = document.createElement('option')
    op.value = o.value
    op.textContent = o.label
    if (o.selected) op.selected = true
    s.append(op)
  }
  return s
}

/** 设置弹层 */
export function openSettings(): void {
  const modal = $('#settings-modal')!
  const s = (window as any).__state.settings as any
  const ai = (window as any).__state.ai as any
  modal.innerHTML = ''
  const card = el('div', { class: 'modal-card' })
  card.append(el('h3', { text: '设置' }))

  const opacity = field('面板透明度', () => input({ id: 's-opacity', type: 'range', min: '0', max: '80' }, String(Math.round((s.opacity || 0.6) * 100))))
  const themeField = field('主题色', () => input({ id: 's-theme', type: 'color' }, s.themeColor || '#4f8cff'))
  const fontField = field('字体大小(px)', () => input({ id: 's-font', type: 'number', min: '11', max: '20' }, String(s.fontSize || 14)))
  const lhField = field('行间距', () => input({ id: 's-lh', type: 'number', step: '0.1', min: '1', max: '2.4' }, String(s.lineHeight || 1.6)))
  const bottom = field('常驻桌面(置底)', () => select([{ value: 'true', label: '开', selected: !!s.alwaysBottom }, { value: 'false', label: '关', selected: !s.alwaysBottom }]))
  ;(bottom.querySelector('select') as HTMLSelectElement).id = 's-bottom'
  const click = field('点击穿透', () => select([{ value: 'true', label: '开', selected: !!s.clickThrough }, { value: 'false', label: '关', selected: !s.clickThrough }]))
  ;(click.querySelector('select') as HTMLSelectElement).id = 's-click'
  const energy = field('节能模式', () => select([{ value: 'true', label: '开', selected: !!s.energySave }, { value: 'false', label: '关', selected: !s.energySave }]))
  ;(energy.querySelector('select') as HTMLSelectElement).id = 's-energy'
  const autostart = field('开机自启', () => select([{ value: 'true', label: '开', selected: !!s.autoStart }, { value: 'false', label: '关', selected: !s.autoStart }]))
  ;(autostart.querySelector('select') as HTMLSelectElement).id = 's-auto'

  const aiEnabled = field('启用 AI', () => select([{ value: 'true', label: '开', selected: !!ai.enabled }, { value: 'false', label: '关', selected: !ai.enabled }]))
  ;(aiEnabled.querySelector('select') as HTMLSelectElement).id = 'a-enabled'
  const aiKey = field('DeepSeek API Key', () => input({ id: 'a-key', placeholder: 'sk-...' }, ai.apiKey || ''))
  const aiModel = field('模型', () => select([{ value: 'deepseek-chat', label: 'deepseek-chat', selected: ai.model === 'deepseek-chat' }, { value: 'deepseek-reasoner', label: 'deepseek-reasoner', selected: ai.model === 'deepseek-reasoner' }]))
  ;(aiModel.querySelector('select') as HTMLSelectElement).id = 'a-model'

  const save = el('button', { class: 'btn-primary', text: '保存设置' })
  save.onclick = async () => {
    await df.updateSettings({
      opacity: Number(($('#s-opacity') as HTMLInputElement).value) / 100,
      themeColor: ($('#s-theme') as HTMLInputElement).value,
      fontSize: Number(($('#s-font') as HTMLInputElement).value),
      lineHeight: Number(($('#s-lh') as HTMLInputElement).value),
      alwaysBottom: ($('#s-bottom') as HTMLSelectElement).value === 'true',
      clickThrough: ($('#s-click') as HTMLSelectElement).value === 'true',
      energySave: ($('#s-energy') as HTMLSelectElement).value === 'true',
      autoStart: ($('#s-auto') as HTMLSelectElement).value === 'true'
    })
    await df.updateAI({
      enabled: ($('#a-enabled') as HTMLSelectElement).value === 'true',
      apiKey: ($('#a-key') as HTMLInputElement).value.trim(),
      model: ($('#a-model') as HTMLSelectElement).value
    })
    closeModal(modal)
    ;(window as any).__render()
    toast('设置已保存')
  }
  const cancel = el('button', { class: 'btn-ghost', text: '取消' })
  cancel.onclick = () => closeModal(modal)

  card.append(opacity, themeField, fontField, lhField, bottom, click, energy, autostart, el('h3', { text: 'AI 配置' }), aiEnabled, aiKey, aiModel, save, cancel)
  modal.append(card)
  modal.classList.remove('hidden')
}

export { todayKey }
