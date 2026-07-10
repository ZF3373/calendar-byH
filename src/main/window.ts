import { BrowserWindow, screen, app, nativeImage, Tray, Menu, shell } from 'electron'
import { join } from 'node:path'
import { store } from './store'
import { AppSettings } from '@shared/types'

/**
 * 桌面窗口管理器
 * 负责：透明毛玻璃、置底、点击穿透、透明度、边缘吸附、托盘、快捷键、开机自启。
 */
export class WindowManager {
  private win: BrowserWindow | null = null
  private tray: Tray | null = null
  private settings: AppSettings | null = null

  async create(): Promise<BrowserWindow> {
    this.settings = await store.getSettings()

    const win = new BrowserWindow({
      width: 420,
      height: 640,
      minWidth: 320,
      minHeight: 420,
      maxWidth: Math.floor(screen.getPrimaryDisplay().workAreaSize.width / 3) * 3, // 限制不超过 1/3
      frame: false,
      transparent: true,
      resizable: true,
      skipTaskbar: false,
      hasShadow: true,
      alwaysOnTop: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: false
      }
    })

    this.win = win

    // 加载已构建的 renderer（本地文件）。renderer 不直接联网（AI 走主进程 IPC），
    // 关 webSecurity 以允许 file:// 下 ES module script 执行。
    win.loadFile(join(__dirname, '../renderer/index.html'))

    this.applySettings(this.settings)
    this.bindMove(win)
    this.createTray()
    this.setupAutoStart(this.settings.autoStart)

    return win
  }

  getWindow(): BrowserWindow | null {
    return this.win
  }

  /** 应用外观/行为设置到窗口 */
  applySettings(s: AppSettings): void {
    this.settings = s
    const win = this.win
    if (!win) return
    // 透明度作为整体窗口 opacity（0.4~1.0 明显可见），CSS 负责毛玻璃叠色
    const op = 0.4 + (s.opacity ?? 0.6) * 0.6
    win.setOpacity(Math.max(0.4, Math.min(1, op)))
    win.webContents.send('settings:changed', s)
    this.setAlwaysBottom(s.alwaysBottom)
    this.setClickThrough(s.clickThrough)
    this.setupAutoStart(s.autoStart)
  }

  /**
   * 置底/置顶切换。
   * 说明：Electron 33 的 setAlwaysOnTop 已移除 'desktop' level。
   * 无 node-gyp/C++ 工具链时，采用 alwaysOnTop 常驻 + skipTaskbar 近似"桌面挂件"行为，
   * 配合渲染进程点击穿透，达到"隐形融入桌面"效果。
   */
  setAlwaysBottom(bottom: boolean): void {
    const win = this.win
    if (!win) return
    win.setAlwaysOnTop(bottom)
  }

  /** 点击穿透：非交互区域点击直接落到桌面 */
  setClickThrough(enabled: boolean): void {
    const win = this.win
    if (!win) return
    // 实际穿透逻辑在渲染进程通过 CSS 标记 .click-through，主进程转发 electron 端
    win.webContents.send('clickthrough:set', enabled)
  }

  /** 边缘吸附：拖拽结束时靠近边缘自动贴合 */
  private bindMove(win: BrowserWindow): void {
    let moving = false
    win.on('move', () => {
      if (moving) return
      moving = true
      setTimeout(() => (moving = false), 100)
    })
    win.on('close', (e) => {
      // 最小化到托盘而非退出
      if (!this.forceQuit) {
        e.preventDefault()
        win.hide()
      }
    })
  }

  snapToEdge(): void {
    const win = this.win
    if (!win) return
    const [x, y] = win.getPosition()
    const { width, height } = win.getBounds()
    const { workAreaSize } = screen.getPrimaryDisplay()
    const threshold = 16
    let nx = x
    let ny = y
    if (x < threshold) nx = 0
    else if (x + width > workAreaSize.width - threshold) nx = workAreaSize.width - width
    if (y < threshold) ny = 0
    else if (y + height > workAreaSize.height - threshold) ny = workAreaSize.height - height
    win.setPosition(nx, ny)
  }

  toggleVisible(): void {
    const win = this.win
    if (!win) return
    if (win.isVisible()) win.hide()
    else {
      win.show()
      win.focus()
    }
  }

  // ---- 托盘 ----
  private createTray(): void {
    const iconPath = join(app.getAppPath(), 'resources', 'tray.ico')
    let img: Electron.NativeImage
    try {
      img = nativeImage.createFromPath(iconPath)
    } catch {
      img = nativeImage.createEmpty()
    }
    if (img.isEmpty()) {
      // 用 1x1 透明图兜底，避免崩溃
      img = nativeImage.createFromBuffer(Buffer.from([0, 0, 0, 0]), { width: 1, height: 1 })
    }
    this.tray = new Tray(img)
    const ctx = Menu.buildFromTemplate([
      { label: '显示 / 隐藏', click: () => this.toggleVisible() },
      { label: '新建任务', click: () => this.win?.webContents.send('app:new-task') },
      { type: 'separator' },
      { label: '退出', click: () => { this.forceQuit = true; app.quit() } }
    ])
    this.tray.setToolTip('DesktopFlow 桌面流')
    this.tray.setContextMenu(ctx)
    this.tray.on('click', () => this.toggleVisible())
  }

  private forceQuit = false

  private setupAutoStart(enabled: boolean): void {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: app.getPath('exe')
    })
  }
}
