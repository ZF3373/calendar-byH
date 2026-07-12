import { $, el, toast } from '../utils'
import { openSettings } from '../components/components'

const df = (window as any).df

interface Msg {
  role: 'user' | 'bot'
  text: string
}

function parseTodoDrafts(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*\[[ xX]?\]\s*/, ''))
    .map((line) => line.replace(/^[-*]\s*/, ''))
    .map((line) => line.replace(/^\d+[.)、]\s*/, ''))
    .map((line) => line.trim())
    .filter(Boolean)
}

/** AI 助手弹层：周报 / 拆待办 / 问答 */
export function openAIPanel(): void {
  const modal = $('#ai-panel')!
  const ai = (window as any).__state.ai as any
  modal.innerHTML = ''
  const card = el('div', { class: 'modal-card' })
  card.append(el('h3', { text: '✨ AI 助手' }))

  if (!ai.enabled || !ai.apiKey) {
    card.append(el('div', { class: 'empty-hint', text: '尚未配置 AI。请在设置中填入 DeepSeek API Key 并启用。' }))
    const go = el('button', { class: 'btn-primary', text: '去设置' })
    go.onclick = () => {
      closeModal(modal)
      openSettings()
    }
    card.append(go)
    modal.append(card)
    modal.classList.remove('hidden')
    return
  }

  // 标签页
  const tabs = el('div', { class: 'ai-tabs' })
  const tb = el('button', { text: '问答', class: 'active' })
  const tw = el('button', { text: '写周报' })
  const td = el('button', { text: '拆待办' })
  tabs.append(tb, tw, td)
  card.append(tabs)

  const box = el('div', { id: 'ai-box' })
  card.append(box)

  const input = el('textarea', { rows: '3', placeholder: '问我点什么，或描述要拆解的任务…' }) as HTMLTextAreaElement
  const send = el('button', { class: 'btn-primary', text: '发送' })
  card.append(input, send)
  const todoBox = el('div', { class: 'ai-todo-box hidden' })
  const todoHead = el('div', { class: 'ai-todo-head' })
  todoHead.append(el('span', { text: 'AI待办' }))
  const listSel = document.createElement('select')
  listSel.className = 'ai-todo-list'
  const lists = (window as any).__state.lists as any[]
  const active = (window as any).__state.activeList as string
  const defaultListId = active || lists[0]?.id || 'work'
  for (const l of lists) {
    const op = document.createElement('option')
    op.value = l.id
    op.textContent = l.name
    if (l.id === defaultListId) op.selected = true
    listSel.append(op)
  }
  todoHead.append(listSel)
  todoBox.append(todoHead)
  const todoList = el('div', { class: 'ai-todo-listing' })
  todoBox.append(todoList)
  const createBtn = el('button', { class: 'btn-primary', text: '创建AI待办' })
  createBtn.classList.add('hidden')
  todoBox.append(createBtn)
  card.append(todoBox)
  const close = el('button', { class: 'btn-ghost', text: '关闭' })
  close.onclick = () => closeModal(modal)
  card.append(close)

  const msgs: Msg[] = []
  let drafts: string[] = []
  const renderDrafts = () => {
    todoList.innerHTML = ''
    if (!drafts.length) {
      todoList.append(el('div', { class: 'empty-hint', text: '拆待办后会显示可导入任务。' }))
      createBtn.classList.add('hidden')
      return
    }
    for (const title of drafts) {
      const row = el('label', { class: 'ai-todo-item' })
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.checked = true
      checkbox.dataset.title = title
      row.append(checkbox, el('span', { text: title }))
      todoList.append(row)
    }
    createBtn.classList.remove('hidden')
  }
  const renderMsgs = () => {
    box.innerHTML = ''
    for (const m of msgs) box.append(el('div', { class: `ai-msg ${m.role}`, text: m.text }))
    box.scrollTop = box.scrollHeight
  }

  const ask = async (system: string, user: string) => {
    msgs.push({ role: 'user', text: user })
    renderMsgs()
    send.setAttribute('disabled', 'true')
    try {
      const text = await df.aiChat(
        [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        { offline: false }
      )
      msgs.push({ role: 'bot', text })
      if (td.classList.contains('active')) {
        drafts = parseTodoDrafts(text)
        todoBox.classList.remove('hidden')
        renderDrafts()
      }
    } catch (e: any) {
      msgs.push({ role: 'bot', text: '⚠ ' + (e?.message || '请求失败') })
    }
    send.removeAttribute('disabled')
    renderMsgs()
  }

  const tasksSummary = () => {
    const lists = (window as any).__state.lists as any[]
    const tasks = (window as any).__state.tasks as any[]
    return tasks
      .map((t) => `- [${t.done ? 'x' : ' '}] ${t.title}（${lists.find((l) => l.id === t.listId)?.name || ''}）`)
      .join('\n')
  }

  send.onclick = () => {
    const v = input.value.trim()
    if (!v) return
    input.value = ''
    if (tb.classList.contains('active')) {
      ask('你是桌面日程管理助手 DesktopFlow，简洁友好地回答用户关于任务与计划的问题。', v)
    } else if (tw.classList.contains('active')) {
      ask(
        '根据以下任务清单，生成一份结构化的周报（含：完成项、进行中、下周计划），用中文 markdown。',
        '我的任务清单：\n' + tasksSummary()
      )
    } else {
      ask(
        '把用户的自然语言需求拆解为清晰的待办清单，每条一行，带 - [ ] 前缀，可直接作为任务导入。只输出清单。',
        v
      )
    }
  }

  const selectTab = (btn: HTMLElement) => {
    ;[tb, tw, td].forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    todoBox.classList.toggle('hidden', btn !== td)
    if (btn === td) renderDrafts()
    if (btn === tw) {
      input.placeholder = '输入日期范围，如：本周'
      input.value = '请为本周生成周报'
    } else if (btn === td) {
      input.placeholder = '描述要拆解的任务，如：准备季度汇报'
      input.value = ''
    } else {
      input.placeholder = '问我点什么…'
      input.value = ''
    }
  }
  tb.onclick = () => selectTab(tb)
  tw.onclick = () => selectTab(tw)
  td.onclick = () => selectTab(td)
  createBtn.onclick = async () => {
    const checks = todoList.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    const picked = [...checks].filter((c) => c.checked).map((c) => c.dataset.title || '').filter(Boolean)
    if (!picked.length) return toast('请先勾选要创建的待办')
    const listId = listSel.value
    createBtn.setAttribute('disabled', 'true')
    try {
      await Promise.all(
        picked.map((title) =>
          df.addTask({
            listId,
            title,
            repeat: 'none',
            reminders: [],
            note: 'AI 拆待办生成',
            done: false
          })
        )
      )
      ;(window as any).__render()
      toast(`已创建 ${picked.length} 条待办`)
    } finally {
      createBtn.removeAttribute('disabled')
    }
  }

  modal.append(card)
  modal.classList.remove('hidden')
}

function closeModal(m: HTMLElement): void {
  m.classList.add('hidden')
  m.innerHTML = ''
}
