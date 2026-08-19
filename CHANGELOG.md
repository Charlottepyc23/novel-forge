# Changelog

本文件的更新说明由维护者负责维护；每次发版都会同步更新。

## [1.1.9] - 2026-08-19

### 修复

- 修复项目跨盘/跨目录移动后残留的旧路径问题
- 修复 dsh web 启动时 novel-forge 因 `schemastery` 缺少 `exports` 导致的加载失败
- 修复 `@linxin666/dsh-client-ui-web-ui-settings` 在 rc.7 下 keyed slot 报错

### 变更

- 插件与小说目录统一到新的 `D:\用户目录\harness` 结构：
  - 插件：`<插件目录>`
  - 小说：`~/.dsh/novels`
- 新增 `scripts/patch-schemastery.mjs`，在 `pnpm install` 后自动补回 `schemastery` 的 `exports`，避免再次启动失败
- 更新辅助脚本、诊断脚本、重启脚本中的路径

### 其他

- 保持本地链接方式安装，无需重新发布即可使用
