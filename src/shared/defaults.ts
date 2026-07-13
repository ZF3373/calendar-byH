import { DBShape, AppSettings, AISettings, TaskList, Task } from '@shared/types'

/** 默认设置 */
export const DEFAULT_SETTINGS: AppSettings = {
  opacity: 0.6,
  themeColor: '#4f8cff',
  fontSize: 14,
  lineHeight: 1.6,
  showLunar: false,
  showHoliday: false,
  autoStart: false,
  energySave: false,
  clickThrough: true,
  alwaysBottom: true,
  sound: 'beep',
  panelWidth: 280
}

export const DEFAULT_AI: AISettings = {
  enabled: false,
  provider: 'deepseek',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat'
}

/** 默认清单（首次启动种子数据） */
export function seedLists(): TaskList[] {
  const now = Date.now()
  const mk = (id: string, name: string, color: string): TaskList => ({
    id,
    name,
    color,
    createdAt: now
  })
  return [
    mk('work', '工作', '#4f8cff'),
    mk('life', '生活', '#3ecf8e'),
    mk('course', '课程', '#a06bff'),
    mk('wish', '心愿单', '#ff9f43'),
    mk('misc', '琐事', '#8a94a6')
  ]
}

export function seedTasks(): Task[] {
  const now = Date.now()
  return [
    {
      id: 't-demo-1',
      listId: 'work',
      title: '示例：阅读需求文档',
      done: true,
      repeat: 'none',
      reminders: [],
      completedOn: [],
      createdAt: now,
      order: 0
    },
    {
      id: 't-demo-2',
      listId: 'life',
      title: '示例：买菜',
      done: false,
      repeat: 'weekly',
      reminders: [{ id: 'r1', time: '18:30' }],
      completedOn: [],
      createdAt: now,
      order: 0
    }
  ]
}

export function emptyDB(): DBShape {
  return {
    lists: seedLists(),
    tasks: seedTasks(),
    ai: DEFAULT_AI,
    settings: DEFAULT_SETTINGS
  }
}
