import type { Task, RepeatType } from '@shared/types'
import { $, el, toast, parseDate, pad, dateKey, repeatLabel, todayKey } from '../utils'

const df = (window as any).df

/** AI 服务商预设（均为 OpenAI 兼容格式，差异仅在默认 baseUrl 与模型候选） */
const AI_PRESETS: Record<string, { label: string; baseUrl: string; models: string[] }> = {
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner']
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o3-mini']
  },
  qwen: {
    label: '通义千问 (Qwen)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long']
  },
  kimi: {
    label: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k']
  },
  ollama: {
    label: 'Ollama (本地)',
    baseUrl: 'http://localhost:11434/v1',
    models: ['llama3', 'qwen2.5', 'deepseek-r1']
  },
  custom: {
    label: '自定义 / 其他 OpenAI 兼容',
    baseUrl: '',
    models: []
  }
}

/** 渲染单个任务项（可勾选/拖拽/删除/点击编辑） */
export function renderTaskItem(t: Task, continues = false): HTMLElement {
  const lists = (window as any).__state.lists
  const list = lists.find((l: any) => l.id === t.listId)
  const item = el('div', { class: `task-item${t.done ? ' done' : ''}${continues ? ' continues' : ''}`, draggable: 'true' })
  item.dataset.id = t.id

  const check = el('div', { class: 'task-check', text: t.done ? '✓' : '' })
  check.onclick = async (e) => {
    e.stopPropagation()
    await df.updateTask(t.id, { done: !t.done })
    ;(window as any).__render()
  }
  const title = el('div', { class: 'task-title', text: continues ? '↡ ' + t.title : t.title })

  const meta: string[] = []
  const pd = parseDate(t.date)
  if (pd) meta.push(`${pad(pd.getMonth() + 1)}/${pad(pd.getDate())}`)
  const pe = parseDate(t.endDate)
  if (pd && pe) meta.push(`${pad(pd.getHours())}:${pad(pd.getMinutes())}–${pad(pe.getHours())}:${pad(pe.getMinutes())}`)
  else if (pd) meta.push(`${pad(pd.getHours())}:${pad(pd.getMinutes())}`)
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
  const endVal = t?.endDate
    ? (() => {
        const e = parseDate(t.endDate)
        return e ? `${dateKey(e)}T${pad(e.getHours())}:${pad(e.getMinutes())}` : ''
      })()
    : ''
  const timeModeField = field(
    '时间类型',
    () =>
      select([
        { value: 'point', label: '时间点', selected: !t?.endDate },
        { value: 'range', label: '时间段', selected: !!t?.endDate }
      ])
  )
  ;(timeModeField.querySelector('select') as HTMLSelectElement).id = 'f-time-mode'
  const endField = field('结束时间', () => input({ id: 'f-end', type: 'datetime-local' }, endVal))
  const endInput = endField.querySelector('input') as HTMLInputElement
  const timeModeSel = timeModeField.querySelector('select') as HTMLSelectElement
  const syncEndVisibility = () => {
    endField.style.display = timeModeSel.value === 'range' ? '' : 'none'
  }
  timeModeSel.addEventListener('change', syncEndVisibility)
  syncEndVisibility()
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
    if (!dateRaw) return toast('请先选择日期时间')
    const repeat = ($('#f-repeat') as HTMLSelectElement).value as RepeatType
    const everyNDays = Number(($('#f-custom') as HTMLInputElement).value) || 2
    const remindRaw = ($('#f-remind') as HTMLInputElement).value
    const note = ($('#f-note') as HTMLTextAreaElement).value
    const timeMode = ($('#f-time-mode') as HTMLSelectElement).value
    const endDateRaw = ($('#f-end') as HTMLInputElement).value
    if (timeMode === 'range' && !endDateRaw) return toast('时间段任务需要填写结束时间')
    if (timeMode === 'range' && endDateRaw <= dateRaw) return toast('结束时间必须晚于开始时间')
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
    if (timeMode === 'range' && endDateRaw) payload.endDate = endDateRaw.replace('T', ' ')
    else payload.endDate = undefined
    if (t) {
      await df.updateTask(t.id, payload)
    } else {
      await df.addTask(payload)
    }
    closeModal(modal)
    ;(window as any).__render()
    toast(t ? '已保存' : '已创建')
  }
  const remove = el('button', { class: 'btn-danger', text: '删除任务' })
  remove.onclick = async () => {
    if (!t) return
    await df.deleteTask(t.id)
    closeModal(modal)
    ;(window as any).__render()
    toast('已删除')
  }
  const cancel = el('button', { class: 'btn-ghost', text: '取消' })
  cancel.onclick = () => closeModal(modal)

  card.append(titleField, listField, dateField, timeModeField, endField, repeatField, customField, remindField, noteField, save)
  if (t) card.append(remove)
  card.append(cancel)
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
  // 服务商 / 格式预设
  const curProvider = AI_PRESETS[ai.provider] ? ai.provider : 'deepseek'
  const aiProvider = field('服务商 / 格式', () =>
    select(
      Object.entries(AI_PRESETS).map(([v, p]) => ({
        value: v,
        label: p.label,
        selected: v === curProvider
      }))
    )
  )
  ;(aiProvider.querySelector('select') as HTMLSelectElement).id = 'a-provider'
  const aiKey = field('API Key', () => input({ id: 'a-key', placeholder: 'sk-...（本地 Ollama 可留空）' }, ai.apiKey || ''))
  // Base URL（按预设预填，可改；custom 留空让用户填）
  const aiBase = field('Base URL', () =>
    input({ id: 'a-base', placeholder: AI_PRESETS[curProvider].baseUrl || 'https://your-endpoint/v1' }, ai.baseUrl || AI_PRESETS[curProvider].baseUrl || '')
  )
  // 模型：预设服务商给下拉候选；custom 或用户手动指定时用文本输入
  const presetModels = AI_PRESETS[curProvider].models
  const useSelect = presetModels.length > 0 && presetModels.includes(ai.model)
  const aiModelSel = field('模型', () =>
    select(
      presetModels.map((m) => ({ value: m, label: m, selected: m === ai.model }))
    )
  )
  ;(aiModelSel.querySelector('select') as HTMLSelectElement).id = 'a-model-sel'
  const aiModelTxt = field('模型（手动填写）', () => input({ id: 'a-model-txt', placeholder: '模型名，如 deepseek-chat' }, useSelect ? '' : ai.model || ''))
  ;(aiModelTxt.querySelector('input') as HTMLInputElement).style.display = useSelect ? 'none' : ''

  // 切换服务商：联动预填 Base URL、刷新模型候选、切换模型输入方式
  // 注意：此时元素尚未挂载到 DOM，必须用 wrapper.querySelector 而非全局 $('#...')
  const providerSel = aiProvider.querySelector('select') as HTMLSelectElement
  providerSel.onchange = () => {
    const p = providerSel.value
    const preset = AI_PRESETS[p]
    ;(aiBase.querySelector('input') as HTMLInputElement).value = preset.baseUrl || ''
    // 重建模型下拉
    const sel = aiModelSel.querySelector('select') as HTMLSelectElement
    sel.innerHTML = ''
    preset.models.forEach((m) => {
      const o = document.createElement('option')
      o.value = m
      o.textContent = m
      sel.append(o)
    })
    const useSelNow = preset.models.length > 0
    ;(sel as unknown as HTMLElement).style.display = useSelNow ? '' : 'none'
    ;(aiModelTxt.querySelector('input') as HTMLElement).style.display = useSelNow ? 'none' : ''
  }

  // 测试连接：用当前表单值先写入再发起一次探针请求
  const testAi = el('button', { class: 'btn-ghost', text: '测试连接' })
  testAi.onclick = async () => {
    const provider = ($('#a-provider') as HTMLSelectElement).value as any
    const baseUrl = ($('#a-base') as HTMLInputElement).value.trim()
    const apiKey = ($('#a-key') as HTMLInputElement).value.trim()
    const model =
      ($('#a-model-sel') as HTMLSelectElement).style.display !== 'none'
        ? ($('#a-model-sel') as HTMLSelectElement).value
        : ($('#a-model-txt') as HTMLInputElement).value.trim()
    testAi.setAttribute('disabled', 'true')
    const oldText = testAi.textContent
    testAi.textContent = '测试中…'
    try {
      // 先按当前表单值保存（保留原有 enabled 开关，不强制开启），确保 aiChat 用最新配置
      const savedEnabled = (window as any).__state.ai?.enabled ?? true
      await df.updateAI({ enabled: savedEnabled, provider, apiKey, baseUrl, model })
      await df.aiChat([{ role: 'user', content: '你好，请只回复两个字：ok' }], {})
      toast('连接成功 ✓')
    } catch (err: any) {
      toast('连接失败：' + (err?.message || String(err)))
    } finally {
      testAi.removeAttribute('disabled')
      testAi.textContent = oldText
    }
  }

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
      enabled: ($('#a-enabled') as HTMLSelectElement).value === 'true' || (($('#a-key') as HTMLInputElement).value.trim() !== ''),
      provider: ($('#a-provider') as HTMLSelectElement).value as any,
      apiKey: ($('#a-key') as HTMLInputElement).value.trim(),
      baseUrl: ($('#a-base') as HTMLInputElement).value.trim(),
      // 下拉可见用下拉值，否则取手动输入
      model:
        ($('#a-model-sel') as HTMLSelectElement).style.display !== 'none'
          ? ($('#a-model-sel') as HTMLSelectElement).value
          : ($('#a-model-txt') as HTMLInputElement).value.trim()
    })
    closeModal(modal)
    ;(window as any).__render()
    toast('设置已保存')
  }
  const cancel = el('button', { class: 'btn-ghost', text: '取消' })
  cancel.onclick = () => closeModal(modal)

  card.append(
    opacity, themeField, fontField, lhField, bottom, click, energy, autostart,
    el('h3', { text: 'AI 配置' }),
    aiEnabled, aiProvider, aiKey, aiBase, aiModelSel, aiModelTxt, testAi, save, cancel
  )
  modal.append(card)
  modal.classList.remove('hidden')
}

export { todayKey }
