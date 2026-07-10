// 共享类型定义（主进程 / 渲染进程 / preload 通用）

/** 清单 */
export interface TaskList {
  id: string
  name: string
  color: string // 主题色，如 '#4f8cff'
  createdAt: number
}

/** 重复规则类型 */
export type RepeatType =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'weekday' // 工作日（周一~周五）
  | 'custom' // 自定义周期（everyNDays）

/** 提醒时段 */
export interface ReminderSlot {
  id: string
  time: string // 'HH:mm'
}

/** 任务 */
export interface Task {
  id: string
  listId: string
  title: string
  note?: string
  done: boolean
  // 日期时间，使用本地时间 ISO 字符串 'YYYY-MM-DD' 或 'YYYY-MM-DDTHH:mm'
  date?: string
  // 重复
  repeat: RepeatType
  everyNDays?: number // repeat==='custom' 时生效
  // 提醒（可多个时段）
  reminders: ReminderSlot[]
  // 重复任务的完成标记（key: 日期 'YYYY-MM-DD'）
  completedOn: string[]
  createdAt: number
  order: number // 同清单内排序
}

/** AI 模型配置 */
export interface AISettings {
  enabled: boolean
  provider: 'deepseek'
  apiKey: string
  baseUrl: string
  model: string // deepseek-chat / deepseek-reasoner 等
}

/** 外观与行为设置 */
export interface AppSettings {
  opacity: number // 面板透明度 0~0.8
  themeColor: string
  fontSize: number // px
  lineHeight: number
  showLunar: boolean
  showHoliday: boolean
  autoStart: boolean
  energySave: boolean // 节能模式
  clickThrough: boolean // 非交互区点击穿透
  alwaysBottom: boolean // 置底
  sound: 'mute' | 'beep' | 'custom'
  customSoundPath?: string
}

/** 持久化数据根结构 */
export interface DBShape {
  lists: TaskList[]
  tasks: Task[]
  ai: AISettings
  settings: AppSettings
}

/** 提醒判定结果（供主进程调度器使用） */
export interface DueReminder {
  taskId: string
  title: string
  date: string // 触发日期 'YYYY-MM-DD'
  time: string // 'HH:mm'
}
