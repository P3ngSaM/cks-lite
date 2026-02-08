# 桌面打包流水线（exe / dmg）

更新时间：2026-02-07

目标：把 CKS Lite 的桌面端打包链路标准化，保证 Windows 和 macOS 都能产出可分发安装包。

## 已落地

- 新增 GitHub Actions：`.github/workflows/desktop-bundle.yml`
  - 触发：`workflow_dispatch`、`main` 分支 push（desktop-app 相关路径）
  - 平台：`windows-latest`、`macos-latest`
  - 产物：`desktop-app/src-tauri/target/release/bundle/**`

- 统一 Tauri 构建前置命令
  - `desktop-app/src-tauri/tauri.conf.json`
  - `beforeDevCommand`: `npm run dev`
  - `beforeBuildCommand`: `npm run build`

- 桌面运行时自动拉起后端（Tauri）
  - Rust 新增命令：`start_agent_service`
  - Rust 新增诊断命令：`get_agent_startup_diagnostics`
  - App 启动后自动触发（仅 Tauri 环境）
  - 自动定位 `agent-sdk` 目录来源：
    1. `CKS_AGENT_SDK_DIR`
    2. bundle 资源目录中的 `agent-sdk`
  3. 常见开发目录相对路径
  - 启动失败时可通过 diagnostics 返回的 hints 快速定位缺失项（Python / agent-sdk 资源路径）。

- bundle 资源纳入后端代码
  - `desktop-app/src-tauri/tauri.conf.json`
  - `bundle.resources` 包含：`../../agent-sdk`

## 本地验证命令

在 `desktop-app` 目录执行：

```bash
npm run build
npm run tauri:build
```

> 说明：`tauri:build` 会在 `src-tauri/target/release/bundle` 产出平台安装包。

## 下一步建议（主线）

1. 接入签名与公证（尤其 macOS）
2. 将 Agent SDK 必要运行资源纳入 bundle 资源清单
3. 增加发布版本号与 changelog 自动化
