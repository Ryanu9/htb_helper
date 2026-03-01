# htb_helper

`htb_helper` 是一个基于 **Tauri 2 + React + Vite + Tailwind CSS** 的桌面小工具，用来更方便地管理你在 Hack The Box（HTB）上的 Machine 操作。
![1772384563284](image/README-zh/1772384563284.gif)

## 功能

- **Token 管理**：在应用内设置/保存 HTB API Token（本地持久化）。
- **当前激活机器**：查看 active machine 信息与剩余时间；支持复制 IP。
- **机器操作**：`Spawn` / `Reset` / `Stop` / `Extend`。
- **机器搜索**：按名字搜索机器并直接 Spawn。
- **提交 Flag**：支持手动输入提交；也支持从剪贴板读取并自动提交（32 位 MD5）。
- **VPN 配置下载**：选择 VPN Server，下载 UDP/TCP 的 `.ovpn` 文件并可在文件管理器中定位。

## 环境要求

- **Node.js**：用于前端构建
- **pnpm**：本项目使用 `pnpm-lock.yaml`
- **Rust 工具链**：用于构建 Tauri（建议通过 rustup 安装）
- **Tauri 依赖**：按 Tauri 官方文档安装对应平台依赖

## 开发运行

```bash
pnpm install
pnpm tauri dev
```

说明：`src-tauri/tauri.conf.json` 里 `beforeDevCommand` 是 `pnpm dev`，会自动启动 Vite 开发服务器。

## 构建（打包）

```bash
pnpm install
pnpm tauri build
```

说明：`src-tauri/tauri.conf.json` 里 `beforeBuildCommand` 是 `pnpm build`（会先执行 `tsc && vite build`）。

**首次使用**：点击右上角 `API Token`，填入你的 HTB API Token 并保存。
