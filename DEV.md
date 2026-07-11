# 本机开发笔记（Windows / MinGW 环境）

本项目在本机（Windows 10 + MSYS/git-bash，仅 MinGW x86_64-pc-windows-gnu，**无 MSVC**）构建 Electron 应用时踩过的坑与定型方案，沉淀于此，避免重复踩雷。

## 1. Electron 二进制手动安装

GitHub Releases 被墙，`npm install` 多半拉不到 Electron 二进制。需手动从 npmmirror 下载并解压：

```bash
VER=$(node -p "require('./node_modules/electron/package.json').version")
curl -o node_modules/electron/dist/electron.zip \
  "https://cdn.npmmirror.com/binaries/electron/$VER/electron-v$VER-win32-x64.zip"
# 解压到 node_modules/electron/dist/ 下（覆盖出 electron.exe）
```

> **关键**：`node_modules/electron/path.txt` 必须**无末尾换行**，否则启动报 `ENOENT`。用编辑器确保文件内容仅为单行路径、无 `\n`。

## 2. file:// 加载 renderer 的 CORS 问题

Vite 构建出的 `index.html` 含 `<script type="module" crossorigin>`，在 `file://` 协议下会被 CORS 拦截导致模块不执行、界面空白。

修复链路（`scripts/postbuild.mjs` 已自动处理）：
1. postbuild 脚本去除 `index.html` 里的 `crossorigin` 属性；
2. 主进程 `webPreferences.webSecurity = false`；
3. 用 `loadFile()` 加载本地文件。

## 3. 终止 Electron 进程

bash 下 `taskkill //F` 无效（参数解析问题）。正确：

```bash
cmd /c "taskkill /F /IM electron.exe"
```

## 4. 为何选 Electron 而非 Tauri

本机**无 MSVC**，Tauri Windows 构建需 Rust + MSVC 工具链，风险高。优先 Electron（纯 Node + MinGW 可跑）。

## 5. 渲染端 `el()` 辅助函数须支持 `text`

`src/renderer/src/utils.ts` 的 `el(tag, {text})` 必须走 `node.textContent = x`，**不能**当 `setAttribute`。否则动态文字（清单名、任务标题、月历数字）不渲染、界面文字消失。验证时用 `textContent` 而非元素计数（计数正常但文字为空）。

## 6. CDP 验证交互（可选）

启动加 `--remote-debugging-port=9222`，用 `node + ws` 包连 `/json` 中 page target 的 `webSocketDebuggerUrl`，`Runtime.evaluate` 查 DOM。真实点击用 `Input.dispatchMouseEvent` 坐标点击——`el.click()` 会绕过 `pointer-events` 掩盖穿透 bug。

## 7. CI（GitHub Actions）

`.github/workflows/ci.yml` 在 ubuntu 上跑 `typecheck + build`，设 `ELECTRON_SKIP_BINARY_DOWNLOAD=1` 跳过二进制下载（只需编译 TS）。Windows 安装包打包（`electron-builder --win`）在本机受限环境有符号链接坑，未纳入 CI。
