# htb_helper

 - 中文版文档请看: [README-zh.md](./README-zh.md)

`htb_helper` is a **Tauri 2 + React + Vite + Tailwind CSS** desktop utility designed to make Hack The Box (HTB) machine operations more convenient.

![1772384563284](image/README-zh/1772384563284.gif)

## Features

- **Token management**: configure and save your HTB API token in the app (persisted locally).
- **Active machine**: view active machine info and remaining time; supports copying the IP.
- **Machine actions**: `Spawn` / `Reset` / `Stop` / `Extend`.
- **Machine search**: search by machine name and spawn directly.
- **Flag submission**: submit by manual input; also supports reading from clipboard and auto-submitting (32-char MD5).
- **VPN config download**: select a VPN server, download UDP/TCP `.ovpn` files, and reveal them in your file explorer.

## Requirements

- **Node.js**: for frontend build
- **pnpm**: this project uses `pnpm-lock.yaml`
- **Rust toolchain**: for building Tauri (recommended via rustup)
- **Tauri prerequisites**: install the required platform dependencies per the official Tauri docs

## Development

```bash
pnpm install
pnpm tauri dev
```

Note: in `src-tauri/tauri.conf.json`, `beforeDevCommand` is `pnpm dev`, which automatically starts the Vite dev server.

## Build (bundle)

```bash
pnpm install
pnpm tauri build
```

Note: in `src-tauri/tauri.conf.json`, `beforeBuildCommand` is `pnpm build` (it runs `tsc && vite build` first).

**First run**: click `API Token` (top-right), paste your HTB API token, and save.
