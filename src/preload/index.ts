import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { AppSettings, AISettings, TaskList, Task, DueReminder } from '@shared/types'

/** 安全暴露给渲染进程的 API（contextIsolation 开启） */
const api = {
  // 数据
  getAll: (): Promise<{ lists: TaskList[]; tasks: Task[]; settings: AppSettings; ai: AISettings }> =>
    ipcRenderer.invoke('data:getAll'),
  addList: (name: string, color: string) => ipcRenderer.invoke('list:add', name, color),
  updateList: (id: string, patch: Partial<TaskList>) => ipcRenderer.invoke('list:update', id, patch),
  deleteList: (id: string) => ipcRenderer.invoke('list:delete', id),
  addTask: (payload: Omit<Task, 'id' | 'createdAt' | 'completedOn' | 'order'>) =>
    ipcRenderer.invoke('task:add', payload),
  updateTask: (id: string, patch: Partial<Task>) => ipcRenderer.invoke('task:update', id, patch),
  deleteTask: (id: string) => ipcRenderer.invoke('task:delete', id),
  deleteTasksByNote: (note: string) => ipcRenderer.invoke('task:deleteByNote', note),
  reorderTasks: (listId: string, ids: string[]) => ipcRenderer.invoke('task:reorder', listId, ids),
  updateSettings: (patch: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', patch),
  updateAI: (patch: Partial<AISettings>) => ipcRenderer.invoke('ai:update', patch),
  aiChat: (messages: { role: string; content: string }[], opts?: { offline?: boolean }) =>
    ipcRenderer.invoke('ai:chat', messages, opts),

  // 窗口
  windowHide: () => ipcRenderer.send('window:hide'),
  windowShow: () => ipcRenderer.send('window:show'),
  windowSnap: () => ipcRenderer.send('window:snap'),

  // 事件订阅
  onSettingsChanged: (cb: (s: AppSettings) => void) => {
    const l = (_e: IpcRendererEvent, s: AppSettings) => cb(s)
    ipcRenderer.on('settings:changed', l)
    return () => ipcRenderer.removeListener('settings:changed', l)
  },
  onViewSwitch: (cb: (v: 'day' | 'week' | 'month') => void) => {
    const l = (_e: IpcRendererEvent, v: 'day' | 'week' | 'month') => cb(v)
    ipcRenderer.on('view:switch', l)
    return () => ipcRenderer.removeListener('view:switch', l)
  },
  onReminderDue: (cb: (r: DueReminder) => void) => {
    const l = (_e: IpcRendererEvent, r: DueReminder) => cb(r)
    ipcRenderer.on('reminder:due', l)
    return () => ipcRenderer.removeListener('reminder:due', l)
  },
  onNewTask: (cb: () => void) => {
    const l = () => cb()
    ipcRenderer.on('app:new-task', l)
    return () => ipcRenderer.removeListener('app:new-task', l)
  },
  onClickThrough: (cb: (enabled: boolean) => void) => {
    const l = (_e: IpcRendererEvent, enabled: boolean) => cb(enabled)
    ipcRenderer.on('clickthrough:set', l)
    return () => ipcRenderer.removeListener('clickthrough:set', l)
  }
}

contextBridge.exposeInMainWorld('df', api)

export type DesktopFlowAPI = typeof api
