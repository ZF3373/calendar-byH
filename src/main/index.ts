import { app, ipcMain, globalShortcut, BrowserWindow } from 'electron'
import { store } from './store'
import { WindowManager } from './window'
import { ReminderScheduler } from './reminder'
import { aiClient } from './ai'
import { DueReminder } from '@shared/types'

let winMgr: WindowManager

async function bootstrap(): Promise<void> {
  await app.whenReady()
  await store.init()

  winMgr = new WindowManager()
  const win = await winMgr.create()

  // 提醒调度
  const scheduler = new ReminderScheduler()
  scheduler.start((r: DueReminder) => {
    win.webContents.send('reminder:due', r)
  })

  registerIpc(scheduler)

  // 全局快捷键：Ctrl+Shift+D/W/M 切换视图
  globalShortcut.register('CommandOrControl+Shift+D', () => win.webContents.send('view:switch', 'day'))
  globalShortcut.register('CommandOrControl+Shift+W', () => win.webContents.send('view:switch', 'week'))
  globalShortcut.register('CommandOrControl+Shift+M', () => win.webContents.send('view:switch', 'month'))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) winMgr.create()
  })
}

function registerIpc(scheduler: ReminderScheduler): void {
  // ---- 数据读取 ----
  ipcMain.handle('data:getAll', async () => {
    const [lists, tasks, settings, ai] = await Promise.all([
      store.getLists(),
      store.getTasks(),
      store.getSettings(),
      store.getAI()
    ])
    return { lists, tasks, settings, ai }
  })

  // ---- Lists ----
  ipcMain.handle('list:add', async (_e, name: string, color: string) => store.addList(name, color))
  ipcMain.handle('list:update', async (_e, id: string, patch) => store.updateList(id, patch))
  ipcMain.handle('list:delete', async (_e, id: string) => store.deleteList(id))

  // ---- Tasks ----
  ipcMain.handle('task:add', async (_e, payload) => store.addTask(payload))
  ipcMain.handle('task:update', async (_e, id: string, patch) => store.updateTask(id, patch))
  ipcMain.handle('task:delete', async (_e, id: string) => store.deleteTask(id))
  ipcMain.handle('task:reorder', async (_e, listId: string, ids: string[]) => store.reorderTasks(listId, ids))

  // ---- Settings ----
  ipcMain.handle('settings:update', async (_e, patch) => {
    const s = await store.updateSettings(patch)
    winMgr.applySettings(s)
    return s
  })

  // ---- AI ----
  ipcMain.handle('ai:update', async (_e, patch) => store.updateAI(patch))
  ipcMain.handle('ai:chat', async (_e, messages, opts) => {
    const cfg = await store.getAI()
    return aiClient.chat(cfg, messages, opts)
  })

  // ---- 窗口控制 ----
  ipcMain.on('window:hide', () => winMgr.getWindow()?.hide())
  ipcMain.on('window:show', () => winMgr.getWindow()?.show())
  ipcMain.on('window:snap', () => winMgr.snapToEdge())
  ipcMain.on('scheduler:reset', () => {
    scheduler.stop()
    scheduler.start()
  })
}

app.whenReady().then(async () => {
  await bootstrap()
})
app.on('window-all-closed', () => {
  // 常驻应用：不退出
})
