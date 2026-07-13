import { $, el, toast, todayKey } from '../utils'
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

/**
 * 文档待办解析（方案 C：AI-JSON 优先 + 本地正则兜底）
 * 1) 尝试从文本中抽取 JSON 数组（AI 优先返回结构化 JSON）
 * 2) JSON 抽取失败 → 退化为本地逐行正则解析
 * 返回 { title, date? }，date 为 YYYY-MM-DD
 */
function parseDocTodos(raw: string): { title: string; date?: string; wn?: number; wd?: number }[] {
  const fromSection = extractSectionTodos(raw)
  if (fromSection.length) return fromSection
  const fromJson = extractJsonTodos(raw)
  if (fromJson.length) return fromJson
  return extractLineTodos(raw)
}

/** 从文本中尽力抠出 JSON 数组并校验 */
function extractJsonTodos(raw: string): { title: string; date?: string; wn?: number; wd?: number }[] {
  const candidates: string[] = []
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) candidates.push(fence[1])
  const arr = raw.match(/\[[\s\S]*\]/)
  if (arr) candidates.push(arr[0])
  // 也尝试抽取独立的 { ... } 对象串
  const objs = raw.match(/\{[^{}]*"title"[^{}]*\}/g)
  if (objs) candidates.push('[' + objs.join(',') + ']')
  for (const c of candidates) {
    try {
      const data = JSON.parse(c)
      const list = Array.isArray(data) ? data : [data]
      const out = list
        .map((x: any) => {
          const title = typeof x === 'string' ? x : x?.title
          if (!title || typeof title !== 'string') return null
          // 优先用 AI 给的 date；缺失则从标题里强抽日期
          let date: string | undefined
          if (typeof x?.date === 'string') date = normalizeDate(x.date)
          // 年份合理性校验：与当前年差 > 1 视为异常（如 AI 编造 2027），丢弃
          if (date && !isPlausibleYear(date)) date = findDateInText(title) || undefined
          if (!date) date = findDateInText(title)
          // 相对周次：第N周(wn) + 周几(wd, 周一=1)；兼容 AI 返回字符串型数字
          const wnRaw = x?.wn
          const wdRaw = x?.wd
          const wn = Number.isFinite(Number(wnRaw)) && Number(wnRaw) > 0 ? Number(wnRaw) : undefined
          const wd = Number.isFinite(Number(wdRaw)) && Number(wdRaw) >= 1 && Number(wdRaw) <= 7 ? Number(wdRaw) : undefined
          return { title: title.trim(), date, wn, wd }
        })
        .filter(Boolean) as { title: string; date?: string; wn?: number; wd?: number }[]
      if (out.length) return out
    } catch {
      /* 该候选不是合法 JSON，试下一个 */
    }
  }
  return []
}

/** 本地逐行正则兜底（不依赖 AI 格式） */
function extractLineTodos(raw: string): { title: string; date?: string; wn?: number; wd?: number }[] {
  const out: { title: string; date?: string; wn?: number; wd?: number }[] = []
  for (const line of raw.split('\n')) {
    let s = line.trim()
    if (!s) continue
    s = s
      .replace(/^[-*]\s*(\[[ xX]?\])?\s*/, '')
      .replace(/^\d+[.)、]\s*/, '')
      .trim()
    if (!s) continue
    // 从整行（含标题）里搜日期，不要求日期在开头
    const date = findDateInText(s)
    if (date) {
      s = s
        .replace(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/, '')
        .replace(/(\d{1,2})[-/月.](\d{1,2})日?/, '')
        .replace(/\s*[（(]?\s*(到期|截止|due)\s*[:：]?\s*[）)]?/, '')
        .replace(/[（(]\s*[）)]/, '')
        .trim()
    }
    if (s) out.push({ title: s, date })
  }
  return out
}

/**
 * 按“小节标题”分块解析：针对 `#### 7月17日（周五）· 综合练习` 这类强结构文档。
 * - 命中 `M月D日` 的小节标题 → 该小节下所有题目/事项归属当天（YYYY-MM-DD）
 * - 年份：优先用文档中“起始日期：YYYY年M月D日”，否则取当前年
 * - 表格每行题 = 一条任务（title 取题号+题名，去链接）；普通列表项/说明行也各成一条
 * - 不依赖 AI 格式，100% 本地可控；AI 路径失败时的主解析
 */
function extractSectionTodos(raw: string): { title: string; date?: string; wn?: number; wd?: number }[] {
  const year = inferYear(raw)
  const lines = raw.split('\n')
  const out: { title: string; date?: string; wn?: number; wd?: number }[] = []
  let curDate: string | undefined
  let curHead = ''
  const flushHead = () => {
    if (curDate && curHead) out.push({ title: curHead.trim(), date: curDate })
    curHead = ''
  }
  for (const line of lines) {
    const head = line.match(/^#{2,4}\s*.*?(\d{1,2})月(\d{1,2})[日号]/)
    if (head) {
      flushHead()
      curDate = dateKeyLocal(new Date(year, Number(head[1]) - 1, Number(head[2])))
      // 标题里“·”之后是当天主题，作为一条任务标题
      const theme = line.replace(/^#{2,4}\s*/, '').split(/[·•]/).slice(1).join('·').trim()
      curHead = theme || line.replace(/^#{2,4}\s*/, '').trim()
      continue
    }
    if (!curDate) continue
    const t = line.trim()
    if (!t) continue
    // 表格行：| [CF 1445B - Jumps](url) | 贪心 | 25min | → 取第一格去链接
    const tbl = t.match(/^\|(.+)\|$/)
    if (tbl) {
      const cell = tbl[1].split('|')[0].trim()
      const name = cell.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s*-\s*$/, '').trim()
      if (name && !/^题目$|^-+$/.test(name)) out.push({ title: name, date: curDate })
      continue
    }
    // 无序列表项：- 打一场 Div2 模拟赛（2小时）
    const li = t.match(/^[-*]\s+(.*)$/)
    if (li) {
      const txt = li[1].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim()
      if (txt) out.push({ title: txt, date: curDate })
    }
  }
  flushHead()
  return out
}

/** 从文档里推断年份：优先“起始日期：YYYY年M月D日”，否则当前年 */
function inferYear(raw: string): number {
  const m = raw.match(/(\d{4})年/)
  if (m) return Number(m[1])
  return new Date().getFullYear()
}

/**
 * 从任意文本中“搜索”第一个日期并归一成 YYYY-MM-DD。
 * 支持：2026-07-20 / 2026/7/20 / 2026年7月20日 / 7月20日(同年，过去则推明年)
 * 用 search 模式（非整串匹配），能从“7月20日 提交报告”这类标题里抠出日期。
 */
function findDateInText(s: string): string | undefined {
  let m = s.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  // 无年份的相对日期（如 7月20日）：取同年，绝不跨年推算（避免误判产生错误年份）
  m = s.match(/(\d{1,2})[-/月.](\d{1,2})日?/)
  if (m) {
    const dt = new Date(new Date().getFullYear(), Number(m[1]) - 1, Number(m[2]))
    return dateKeyLocal(dt)
  }
  return undefined
}

/** 年份是否合理：与当前年差不超过 1 年（允许规划类文档跨年） */
function isPlausibleYear(date: string): boolean {
  const y = Number(date.slice(0, 4))
  if (!y) return false
  const diff = Math.abs(y - new Date().getFullYear())
  return diff <= 1
}

/** 把各种日期写法归一成 YYYY-MM-DD（支持 YYYY-M-D / M月D日(同年)） */
function normalizeDate(s: string): string | undefined {
  s = s.trim().replace(/[（(].*[）)]/, '').trim()
  return findDateInText(s)
}

function dateKeyLocal(dt: Date): string {
  const y = dt.getFullYear()
  const mo = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${mo}-${d}`
}

/** 周几数字(1=周一…7=周日) → 中文 */
function weekdayCn(wd?: number): string {
  const names = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日']
  return wd && wd >= 1 && wd <= 7 ? names[wd] : ''
}

/** 把 YYYY-MM-DD 字符串解析为本地 Date（中午避免时区边界） */
function parseDateLocal(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return new Date()
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
}

/** AI 教练 prompt（生成型）：让 AI 制定训练/备赛计划，用 `#### M月D日（周X）· 主题` 分块格式输出，
 *  这样本地 extractSectionTodos 能稳定抽取真实日期，不依赖 JSON 格式。预留多种教练（ACM/英语/考研…）。 */
const COACH_SYS_PROMPT = (today: string) =>
  `你是「AI 教练」，擅长把用户的备赛/训练目标拆解成可执行的日程计划。\n` +
  `当前真实日期：${today}（计划从该日起排，不要编造过去的日期）。\n` +
  `用户会描述目标（如“帮我制定 ACM 竞赛 8 周备赛计划”）。请：\n` +
  `1. 先给出整体分阶段说明（可选）。\n` +
  `2. 然后按【天】输出计划，每天一个二级~四级标题，格式严格为：\n` +
  `   #### M月D日（周X）· 当天主题\n` +
  `   其下用表格或列表列出当天的具体任务（每题/每项一行）。\n` +
  `3. 日期必须自 ${today} 起连续推算（第1天=${today}），用真实月日，不要写“第N天”而省略日期。\n` +
  `4. 只输出计划本身（markdown 分块），不要解释、不要代码块包裹、不要寒暄。\n` +
  `示例输出片段：\n` +
  `#### 7月17日（周五）· 二分查找入门\n` +
  `| 题目 | 知识点 | 限时 |\n` +
  `|------|--------|------|\n` +
  `| CF 706B - Interesting Drink | 二分查找 | 20min |\n` +
  `| 洛谷 P2249 - 查找 | 二分查找 | 15min |`

/** AI 教练类型（预留扩展：以后加英语教练/考研教练只需在此登记并分支） */
const COACHES = [{ id: 'acm', name: 'ACM 备赛', prompt: COACH_SYS_PROMPT }] as const
const DOC_SYS_PROMPT =
  '你是文档待办提取器。请逐条、不遗漏地提取文档中【所有】需要执行的任务/待办，返回一个 JSON 数组。每个元素形如 {"title":"任务名","date":"YYYY-MM-DD","wn":N,"wd":D}。\n规则：\n1. 必须返回文档中的【全部】任务，一条都不能省略，也不要合并。\n2. date 字段：仅当任务在文档中【明确出现具体日期】(如 2026-07-20、2026年7月20日)时才填对应的 YYYY-MM-DD。\n3. wn/wd 字段：当任务属于“第N周/周X/星期X”这类相对排期时，wn=第几周(整数,如第2周→2)，wd=星期几(周一=1,周二=2,…,周日=7)。例如“第2周周三”→wn:2,wd:3；“周日”→wn可留空,wd:7。\n4. 严禁编造：若同时有具体日期(date)则优先用 date，不必填 wn/wd；只有纯相对说法才填 wn/wd。\n5. 不要时间，不要编号，不要解释，不要 markdown 代码块，只返回纯 JSON 数组。\n示例：\n[{"title":"二分查找入门","wn":1,"wd":1},{"title":"模拟赛","wn":1,"wd":6},{"title":"提交季度报告","date":"2026-07-20"}]'

/** AI 助手弹层：周报 / 拆待办 / 问答 */
export function openAIPanel(): void {
  const modal = $('#ai-panel')!
  const ai = (window as any).__state.ai as any
  modal.innerHTML = ''
  const card = el('div', { class: 'modal-card' })
  card.append(el('h3', { text: '✨ AI 助手' }))

  if (!ai.apiKey) {
    card.append(el('div', { class: 'empty-hint', text: '尚未配置 AI。请在设置中填入 API Key 并启用。' }))
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
  const tdoc = el('button', { text: 'AI教练' })
  tabs.append(tb, tw, td, tdoc)
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
  // 文档待办区
  const docBox = el('div', { class: 'ai-doc-box hidden' })
  const fileInput = el('input', { type: 'file', accept: '.txt,.md,.text,text/plain,text/markdown' }) as HTMLInputElement
  fileInput.id = 'ai-doc-file'
  const docBtn = el('button', { class: 'btn-ghost', text: '选择文档并解析' })
  docBtn.onclick = () => fileInput.click()
  // 相对周次基准日（AI 排程锚点，与日历今天/明天无关）：文档没写起始日时默认留空，由用户手填
  const docBaseInput = el('input', { type: 'date' }) as HTMLInputElement
  docBaseInput.id = 'ai-doc-base'
  docBaseInput.value = '' // 留空：强制用户指定第1周起点，不挂钩日历日期
  // 注意：input 显隐由 docBaseWrap 统一控制，这里【不要】给 input 单独加 hidden，
  // 否则 wrapper 显示后 input 仍是 display:none，用户无法选日期（已踩坑）
  const docBaseWrap = el('div', { class: 'ai-doc-base hidden' })
  const docBaseToday = el('button', { class: 'btn-ghost ai-doc-base-today', text: '📅 重置为空' })
  docBaseToday.onclick = () => {
    docBaseInput.value = ''
  }
  docBaseWrap.append(
    el('span', { class: 'ai-doc-base-label', text: '📅 第1周从' }),
    docBaseInput,
    docBaseToday,
    el('span', { class: 'ai-doc-base-label', text: '开始（AI 排程锚点，与日历今天无关；留空则周次任务按今天排）' })
  )
  docBox.append(
    el('div', { class: 'ai-doc-hint', text: 'AI教练：可直接让 AI 生成训练/备赛计划（如 ACM 8周），或选已有 .txt/.md 文档导入。计划按真实日期排布。' }),
    fileInput,
    docBtn,
    docBaseWrap
  )
  const docList = el('div', { class: 'ai-doc-listing' })
  docBox.append(docList)
  const docCreateBtn = el('button', { class: 'btn-primary hidden', text: '创建文档待办' })
  docBox.append(docCreateBtn)
  const docClearBtn = el('button', { class: 'btn-ghost hidden', text: '🗑 清空上次导入' })
  docClearBtn.title = '删除所有“AI 文档提取”标记的任务（不影响手动添加的任务）'
  docClearBtn.onclick = async () => {
    if (!confirm('确认清空上次文档/AI 导入的全部任务？（仅删除标记为“AI 文档提取”的任务，手动任务不受影响）')) return
    docClearBtn.setAttribute('disabled', 'true')
    try {
      const n = await df.deleteTasksByNote('AI 文档提取')
      ;(window as any).__render()
      toast(n > 0 ? `已清空 ${n} 条导入任务` : '没有可清空的导入任务')
    } finally {
      docClearBtn.removeAttribute('disabled')
    }
  }
  docBox.append(docClearBtn)
  card.append(docBox)
  const close = el('button', { class: 'btn-ghost', text: '关闭' })
  close.onclick = () => closeModal(modal)
  card.append(close)

  const msgs: Msg[] = []
  let drafts: string[] = []
  let docTodos: { title: string; date?: string; wn?: number; wd?: number }[] = []
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
  const renderDocTodos = () => {
    docList.innerHTML = ''
    if (!docTodos.length) {
      docList.append(el('div', { class: 'empty-hint', text: '解析后这里会列出文档中的任务。' }))
      docCreateBtn.classList.add('hidden')
      return
    }
    for (const item of docTodos) {
      const row = el('label', { class: 'ai-doc-item' })
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.checked = true
      checkbox.dataset.title = item.title
      checkbox.dataset.date = item.date || ''
      checkbox.dataset.wn = item.wn != null ? String(item.wn) : ''
      checkbox.dataset.wd = item.wd != null ? String(item.wd) : ''
      row.append(checkbox, el('span', { class: 'ai-doc-title', text: item.title }))
      if (item.date) row.append(el('span', { class: 'ai-doc-date', text: `📅 ${item.date}` }))
      else if (item.wn != null || item.wd != null)
        row.append(el('span', { class: 'ai-doc-date ai-doc-week', text: `📅 第${item.wn || '?'}周${weekdayCn(item.wd)}` }))
      else row.append(el('span', { class: 'ai-doc-date ai-doc-date-today', text: '📅 今天(未指定)' }))
      docList.append(row)
    }
    docCreateBtn.classList.remove('hidden')
    docClearBtn.classList.remove('hidden')
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
      } else if (tdoc.classList.contains('active')) {
        docTodos = parseDocTodos(text)
        renderDocTodos()
        const hasWeek = docTodos.some((x) => typeof x.wn === 'number' || typeof x.wd === 'number')
        docBaseWrap.classList.toggle('hidden', !hasWeek)
        if (!docTodos.length) toast('未在文档中识别到待办项')
      }
    } catch (e: any) {
      msgs.push({ role: 'bot', text: '⚠ ' + (e?.message || '请求失败') })
    }
    send.removeAttribute('disabled')
    renderMsgs()
  }

  const parseAndShowDoc = async (file: File) => {
    const text = await file.text()
    if (!text.trim()) return toast('文档为空')
    docTodos = []
    renderDocTodos()
    docBtn.setAttribute('disabled', 'true')
    docBtn.textContent = '解析中…'
    try {
      // 选文件导入：直接用本地分块解析原文（保结构、按 `#### M月D日` 标题切分日期），
      // 不先过 AI——AI 会把结构化文档重写成无标题纯列表，破坏日期归属。
      // AI 仅服务于“生成计划”路径（文本框），不用于导入。
      let out = extractSectionTodos(text)
      if (!out.length) out = extractLineTodos(text)
      docTodos = out
      renderDocTodos()
      // 诊断：便于确认解析是否按日期分割（应远多于 2 条）
      console.log('[AI教练] 解析结果:', out.length, '条；首条=', out[0])
      toast(`已解析 ${out.length} 条任务（按日期分割）`)
      // 若文档含相对周次（第N周/周X），显示基准日输入让用户指定第1周起始
      const hasWeek = out.some((x) => typeof x.wn === 'number' || typeof x.wd === 'number')
      docBaseWrap.classList.toggle('hidden', !hasWeek)
      if (!docTodos.length) toast('未在文档中识别到待办项')
    } catch (e: any) {
      toast('解析失败：' + (e?.message || '请求失败'))
    } finally {
      docBtn.removeAttribute('disabled')
      docBtn.textContent = '选择文档并解析'
    }
  }
  fileInput.onchange = () => {
    const f = fileInput.files && fileInput.files[0]
    if (f) parseAndShowDoc(f)
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
    } else if (tdoc.classList.contains('active')) {
      const today = dateKeyLocal(new Date())
      ask(COACH_SYS_PROMPT(today), v)
    }
  }

  const selectTab = (btn: HTMLElement) => {
    ;[tb, tw, td, tdoc].forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    todoBox.classList.toggle('hidden', btn !== td)
    docBox.classList.toggle('hidden', btn !== tdoc)
    if (btn === td) renderDrafts()
    if (btn === tdoc) {
      input.placeholder = '让 AI 制定计划，如：帮我制定 ACM 竞赛 8 周备赛计划（或点上方按钮选已有文档导入）'
      input.value = '帮我制定 ACM 竞赛 8 周备赛计划'
    } else if (btn === tw) {
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
  tdoc.onclick = () => selectTab(tdoc)
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
  docCreateBtn.onclick = async () => {
    const checks = docList.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    const picked = [...checks]
      .filter((c) => c.checked)
      .map((c) => ({
        title: c.dataset.title || '',
        date: c.dataset.date || '',
        wn: c.dataset.wn ? Number(c.dataset.wn) : undefined,
        wd: c.dataset.wd ? Number(c.dataset.wd) : undefined
      }))
      .filter((x) => x.title)
    if (!picked.length) return toast('请先勾选要创建的待办')
    const listId = listSel.value
    const today = dateKeyLocal(new Date())
    const base = docBaseInput.value ? parseDateLocal(docBaseInput.value) : new Date()
    // 计算最终日期：已有 date > 按“第N周周X”映射 > 今天
    const resolveDate = (x: { date: string; wn?: number; wd?: number }): string => {
      if (x.date) return x.date
      if (x.wn != null || x.wd != null) {
        const start = new Date(base.getFullYear(), base.getMonth(), base.getDate())
        const baseWd = ((start.getDay() + 6) % 7) + 1 // 周一=1
        const wn = x.wn && x.wn > 0 ? x.wn - 1 : 0
        const wd = x.wd && x.wd >= 1 && x.wd <= 7 ? x.wd : baseWd
        start.setDate(start.getDate() + wn * 7 + (wd - baseWd))
        return dateKeyLocal(start)
        }
        // 兜底：无 date 且无周次 → 今天（保证非空，绝不存空串导致任务隐形）
        return todayKey()
        }
    // 无日期纯文本任务 → 今天；有周次但没设基准日 → 也按今天排（并提示）
    const noDateCount = picked.filter((x) => !x.date && x.wn == null && x.wd == null).length
    const weekNoBaseCount = picked.filter((x) => !docBaseInput.value && (x.wn != null || x.wd != null)).length
    docCreateBtn.setAttribute('disabled', 'true')
    try {
      // 串行创建：避免 172 条并发 IPC 调用导致主进程丢部分（并发会只成功少数）
      let created = 0
      for (const x of picked) {
        await df.addTask({
          listId,
          title: x.title,
          repeat: 'none',
          reminders: [],
          note: 'AI 文档提取',
          done: false,
          date: resolveDate(x) || todayKey()
        })
        created++
      }
      console.log('[AI教练] 实际创建条数:', created, '/ 待创建:', picked.length)
      ;(window as any).__render()
      toast(
        noDateCount > 0 || weekNoBaseCount > 0
          ? `已创建 ${picked.length} 条（${noDateCount} 条无日期→今天；${weekNoBaseCount} 条周次未设基准日→按今天排，建议在文档区填“第1周从”后重排）`
          : `已创建 ${picked.length} 条文档待办`
      )
      // 创建后自动把日历跳到最早的任务日期，避免“创建了但停在别的月份看不到”
      const allDates = picked
        .map((x) => resolveDate(x) || todayKey())
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort()
      if (allDates.length) {
        const st = (window as any).__state
        st.cursorDate = parseDateLocal(allDates[0])
      }
      ;(window as any).__render()
      docCreateBtn.removeAttribute('disabled')
    } finally {
    }
  }

  modal.append(card)
  modal.classList.remove('hidden')
}

function closeModal(m: HTMLElement): void {
  m.classList.add('hidden')
  m.innerHTML = ''
}
