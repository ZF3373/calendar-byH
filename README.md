# DesktopFlow · 桌面流

常驻桌面的半透明毛玻璃轻量日程管理工具。像壁纸一样安静驻守桌面，半透明美学包裹高效任务管理，AI 智能加持。

> 对应需求文档：`需求.md`（v1.0）。技术栈：**Electron + TypeScript（原生渲染，无框架）**。

## 核心特性（已实现）

- 🌊 **常驻桌面**：开机自启、置底常驻、点击穿透、托盘最小化、边缘吸附
- 💎 **毛玻璃 UI**：`backdrop-filter` 动态模糊，透明度 0~80% 可调
- 📋 **多清单**：工作 / 生活 / 课程 / 心愿单 / 琐事，可自建
- 🗓️ **三视图**：日（时间轴）/ 周（7 列）/ 月（网格 + 任务点），`Ctrl+Shift+D/W/M` 切换
- ⏰ **智能重复提醒**：每天 / 每周 / 每月 / 工作日 / 自定义周期 + 多时段 + 系统通知
- ✨ **AI 助手（DeepSeek）**：写周报、自然语言拆待办、对话问答；本地缓存优先，离线可用
- ⚙️ **自定义**：主题色、字体、行间距、节能模式、铃声

## 架构

```
src/
  shared/        类型与默认值（主/渲染/preload 共享）
  main/          主进程：窗口、存储(lowdb)、提醒调度、AI 客户端、IPC
  preload/       安全桥接（contextIsolation，只暴露白名单 API）
  renderer/      原生 TS SPA：视图、组件、AI 面板、毛玻璃样式
```

数据本地存储于 `userData/db.json`，AI 缓存放于 `userData/ai-cache/`。

## 开发

```bash
npm install
npm run dev        # 开发（electron-vite，需先起 dev server 或设置 DF_DEV_URL）
npm run build      # 生产构建 + 自动去除 crossorigin（scripts/postbuild.mjs）
npm start          # 运行已构建产物
```

> 说明：构建后 `scripts/postbuild.mjs` 会移除 `index.html` 中的 `crossorigin` 属性，
> 主进程以 `webSecurity:false` 加载 `file://` 资源（渲染端不直接联网，AI 请求经主进程 IPC 转发，安全可控）。

## 构建产物验证

- `out/main/index.js` · `out/preload/index.js` · `out/renderer/`（已构建验证可运行）
- 常驻内存约 100MB，满足"轻量"目标

## 已知限制 / 后续

- 置底采用 `alwaysOnTop` 近似（Electron 33 已移除 `desktop` 层级，无 C++ 工具链时的最佳方案）
- 农历 / 节假日标记、云同步、手机端联动为 v2.0+ 规划项
