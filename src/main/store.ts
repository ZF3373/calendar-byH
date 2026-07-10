import { app } from 'electron'
import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { join } from 'node:path'
import { DBShape, Task, TaskList, AppSettings, AISettings } from '@shared/types'
import { emptyDB } from '@shared/defaults'

/**
 * 本地存储层（主进程）。
 * 使用 lowdb 持久化到 userData/db.json。
 */
class Store {
  private db!: Low<DBShape>
  private ready = false

  /** 初始化数据库（应用启动时调用一次） */
  async init(): Promise<void> {
    const file = join(app.getPath('userData'), 'db.json')
    this.db = new Low<DBShape>(new JSONFile<DBShape>(file), emptyDB())
    await this.db.read()
    // 确保字段存在（兼容旧数据/部分写入）
    this.db.data ||= emptyDB()
    const d = this.db.data
    if (!d.lists) d.lists = emptyDB().lists
    if (!d.tasks) d.tasks = emptyDB().tasks
    if (!d.ai) d.ai = emptyDB().ai
    if (!d.settings) d.settings = emptyDB().settings
    this.ready = true
    await this.db.write()
  }

  private assert(): void {
    if (!this.ready) throw new Error('Store 未初始化，请先调用 init()')
  }

  async read(): Promise<DBShape> {
    this.assert()
    await this.db.read()
    return this.db.data
  }

  async write(): Promise<void> {
    this.assert()
    await this.db.write()
  }

  // ---- Lists ----
  async getLists(): Promise<TaskList[]> {
    return (await this.read()).lists
  }

  async addList(name: string, color: string): Promise<TaskList> {
    const d = await this.read()
    const list: TaskList = {
      id: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      color,
      createdAt: Date.now()
    }
    d.lists.push(list)
    await this.write()
    return list
  }

  async updateList(id: string, patch: Partial<TaskList>): Promise<void> {
    const d = await this.read()
    const l = d.lists.find((x) => x.id === id)
    if (l) Object.assign(l, patch)
    await this.write()
  }

  async deleteList(id: string): Promise<void> {
    const d = await this.read()
    d.lists = d.lists.filter((x) => x.id !== id)
    d.tasks = d.tasks.filter((x) => x.listId !== id)
    await this.write()
  }

  // ---- Tasks ----
  async getTasks(): Promise<Task[]> {
    return (await this.read()).tasks
  }

  async addTask(task: Omit<Task, 'id' | 'createdAt' | 'completedOn' | 'order'> & Partial<Pick<Task, 'order'>>): Promise<Task> {
    const d = await this.read()
    const full: Task = {
      id: 'T' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      createdAt: Date.now(),
      completedOn: [],
      order: typeof task.order === 'number' ? task.order : d.tasks.filter((t) => t.listId === task.listId).length,
      ...task
    }
    d.tasks.push(full)
    await this.write()
    return full
  }

  async updateTask(id: string, patch: Partial<Task>): Promise<void> {
    const d = await this.read()
    const t = d.tasks.find((x) => x.id === id)
    if (t) Object.assign(t, patch)
    await this.write()
  }

  async deleteTask(id: string): Promise<void> {
    const d = await this.read()
    d.tasks = d.tasks.filter((x) => x.id !== id)
    await this.write()
  }

  async reorderTasks(listId: string, orderedIds: string[]): Promise<void> {
    const d = await this.read()
    orderedIds.forEach((tid, idx) => {
      const t = d.tasks.find((x) => x.id === tid && x.listId === listId)
      if (t) t.order = idx
    })
    await this.write()
  }

  // ---- Settings ----
  async getSettings(): Promise<AppSettings> {
    return (await this.read()).settings
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const d = await this.read()
    d.settings = { ...d.settings, ...patch }
    await this.write()
    return d.settings
  }

  // ---- AI ----
  async getAI(): Promise<AISettings> {
    return (await this.read()).ai
  }

  async updateAI(patch: Partial<AISettings>): Promise<AISettings> {
    const d = await this.read()
    d.ai = { ...d.ai, ...patch }
    await this.write()
    return d.ai
  }
}

export const store = new Store()
