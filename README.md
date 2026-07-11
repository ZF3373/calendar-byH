# DesktopFlow · 桌面流

常驻桌面的半透明毛玻璃轻量日程管理工具。像壁纸一样安静驻守桌面，半透明美学包裹高效任务管理，AI 智能加持。

> 需求文档：[需求.md](需求.md)（v1.0）。技术栈：**Electron + TypeScript（原生渲染，无框架）**。

## 核心特性（已实现）

- 🌊 **常驻桌面**：开机自启、置底常驻、点击穿透、托盘最小化、边缘吸附
- 💎 **毛玻璃 UI**：`backdrop-filter` 动态模糊，透明度 0~80% 可调
- 📋 **多清单**：工作 / 生活 / 课程 / 心愿单 / 琐事，可自建
- 🗓️ **三视图**：日（时间轴，课程/日程按时间段逐小时铺开为连续块）/ 周（7 列）/ 月（网格 + 任务点），`Ctrl+Shift+D/W/M` 切换
- 📚 **课程清单**：课程支持「开始—结束」时间段，日视图自动铺满对应小时区间
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

## 依赖安全说明（已知限制）

GitHub Dependabot 当前报告约 13 个依赖告警，主要来自**开发 / 构建期**及**特定平台**漏洞，对**已分发的桌面应用运行时威胁极低**（本应用 renderer 仅以 `file://` 加载本地内容，不加载远程网页，不启用 `nodeIntegration` 于不可信页面）。分类如下：

| 包 | 当前 | 修复需升级至 | 威胁面 | 处置 |
|---|---|---|---|---|
| electron | 33.x | 43.x | macOS/Linux 特定、需加载远程内容才触发；本应用本地加载 | 暂不强升（跨 10 个大版本破坏性，可能破坏本机受限构建环境） |
| vite / esbuild | 5.x | 8.x | 仅 dev server SSRF，**生产构建不受影响** | 暂不强升 |
| electron-builder | 25.x | 26.x | 仅打包 / 安装期 tar 路径穿越，不影响已发布应用运行 | 暂不强升 |
| glob（传递依赖） | — | — | CLI `-c` 命令注入，构建期 | ✅ 已通过 `npm audit fix` 修复 |

> 决策原则：优先稳定性与可构建性，避免在「无 MSVC、Electron 二进制需手动从 npmmirror 获取、打包有符号链接限制」的本机环境触发破坏性回归。待上游稳定或确有运行时需求时再评估升级。
