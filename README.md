# dsh-novel-forge — AI 编译小说工作台 / AI Novel Writing Workbench

**中文** | [English](#english)

你的专属 AI 小说写作插件：把一份大纲"编译"成一本完整的小说。
Your personal AI novel-writing plugin for DSH: turn an outline into a complete novel.

---

## 功能一览 / Features

| 中文 | English |
|---|---|
| **创作工作流仪表盘**：主行动卡（推荐下一步）+ 创作旅程进度条 + 状态条 + 待办队列 + 资产健康 | **Workflow dashboard**: next-action hero card, journey progress bar, status strip, todo queue, asset health |
| **开书向导**：书架新建书时直接导入大纲（docx/粘贴），开书即建项目，书名自动识别 | **Book wizard**: create a book with its outline in one step — project is built immediately |
| **大纲只读化**：开书后大纲页只读展示；「更新大纲」可选仅改文本（保留进度）或重置项目重来 | **Read-only outline**: after opening a book the outline is read-only; update offers keep-progress or full reset |
| **章节计划结构化**：每章含 本章目标 / 剧情要点 / 爽点·钩子 / 结尾钩子 | **Structured chapter beats**: goal / plot points / payoff-hook / ending hook per chapter |
| **事实库 / 时间线**：每章自动抽取已确立事实，注入后续生成，保证长期一致 | **Fact ledger**: auto-extracted per-chapter facts injected into later chapters for consistency |
| **全书一致性质检**：LLM 扫描全本，输出矛盾清单（定位到章），一键去修订 | **Book audit**: LLM scans all chapters for contradictions, locates them, one-click to revise |
| **角色卡**：出场统计精确计算 + LLM 聚合当前状态，历史章节可回填事实库 | **Character cards**: precise appearance stats + LLM-aggregated status; backfill for old chapters |
| **润色/修订工作区**：左栏原文（选中即局部修订）+ 右栏指令/预览/应用，草稿制不覆盖原稿，自动备份 .bak | **Revision workspace**: editable original + selection-targeted local edits, draft-apply flow with auto-backup |
| **AI 助手悬浮窗**：可拖动、可拉大小、位置记忆，不占用工作台 | **Floating AI assistant**: draggable, resizable, position remembered |
| **分组导航 + 状态角标**：创作/工具/数据库分组，章节待办/伏笔/进度角标 | **Grouped nav + badges**: creation/tools/database groups with live badges |
| **iOS 风格毛玻璃 UI**（浅色/深色） | **iOS-style frosted glass UI** (light/dark) |
| **书架 / 伏笔管理 / 写作资产（题材·推进·写法·反AI规则·自定义引擎）/ 全本导出（TXT/MD）** | **Bookshelf / foreshadowing / writing assets / full-book export (TXT/MD)** |

## 快速开始 / Quick Start

```sh
pnpm install        # 安装依赖 / install dependencies
pnpm build          # 重新构建 lib/ / rebuild lib/
```

挂载到 dsh web profile / Mount into the dsh web profile:

```sh
dsh plugin --profile web add link:"<此目录绝对路径>"
```

或 / or in `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: novel-forge
      name: '@waterwx/dsh-novel-forge'
```

重启 dsh web 后，侧边栏出现「小说工坊」。
Restart dsh web and the "Novel Forge" entry appears in the sidebar.

## 安装方式 / Installation

### 从 GitHub 安装 / Install from GitHub

```sh
dsh plugin --profile web add github:watersxya/dsh-novel-forge
```

> 注意：pnpm ≥10 默认拒绝运行 git 依赖的 `prepare` 构建脚本。首次安装失败时，把 pnpm 提示的包键加入该 profile 的 `pnpm-workspace.yaml`：
> Note: pnpm ≥10 refuses to run `prepare` build scripts of git dependencies by default. On first failure, add the package key pnpm prints to the profile's `pnpm-workspace.yaml`:
>
> ```yaml
> allowBuilds:
>   '@waterwx/dsh-novel-forge': true
> ```
>
> 然后重新执行 `add`。只对源码可信的包授权。
> Then re-run `add`. Only allow packages whose source you trust.

### 从 npm 安装 / Install from npm（推荐 / recommended）

```sh
dsh plugin --profile web add @waterwx/dsh-novel-forge
```

npm 分发的是预构建产物，无需任何构建授权。
npm distribution ships prebuilt artifacts — no build authorization needed.

### 本地开发 / Local development

```sh
pnpm install && pnpm build
dsh plugin --profile web add link:"<本目录绝对路径>"
```

## 写作流程 / Writing Pipeline

```
开书（导入大纲） → 设定圣经 → 卷计划 → 章节计划（结构化 beats）
→ 逐章生成（自动摘要 + 事实抽取 + AI 审稿）
→ 修订/润色（工作区对比 → 应用草稿）→ 全书质检 → 角色卡 → 导出
（旁路：伏笔管理 / 写作资产 / AI 助手悬浮窗 / 书架多书）
```

## 目录结构 / Directory Layout

```
src/            插件源码（宿主半 + 浏览器半）/ plugin source (host + browser)
lib/            构建产物（lib/index.js 宿主 / lib/client.js 浏览器）/ build output
scripts/        工具脚本 / utility scripts
package.json    包定义（dsh.bundle.patch + dsh.client 声明）/ package definition
cordis.patch.yml  profile 挂载补丁 / profile mount patch
tsdown.config.ts  双面打包配置 / dual-face bundling config
```

## 数据位置 / Data Locations

- 书架 / Bookshelf：`~/.dsh/dsh-novel-forge-bookshelf.json`
- 每本书一个输出目录（含 `novel-project.json` + 各章 Markdown + 润色备份 `.bak.md`）/ each book owns an output directory
- AI 助手对话记录 / assistant log：`<输出目录>/novel-assistant.jsonl`

## 限制 / Limitations

- 生成消耗 LLM API 额度（默认 deepseek-official / deepseek-v4-flash）/ generation consumes LLM API quota
- 章节质量取决于大纲完整度 / chapter quality depends on outline completeness
- 设置写入 `~/.dsh/settings.yaml` 的 `dsh-novel-forge` 段 / settings persist in `~/.dsh/settings.yaml`

---

<a id="english"></a>

## English

# My Personal AI Novel Forge

This is the working copy of the `dsh-novel-forge` plugin. All
source code, build artifacts, and configuration are included — install, build,
and mount it any time.

## Feature Overview

- **Workflow dashboard**: next-action hero card with a reason, a 6-stage journey
  progress bar, a status strip, a todo queue, and asset health
- **Book wizard**: create a book with its outline in one step — project is built
  immediately and the title is inferred from the outline
- **Read-only outline**: after opening a book the outline page is read-only;
  "Update outline" offers either keep-progress text update or full project reset
- **Structured chapter beats**: every planned chapter carries goal / plot points /
  payoff-hook / ending hook sections
- **Fact ledger**: each chapter auto-extracts established facts (character state,
  resources, relations, foreshadow landings); the latest 20 are injected into
  later chapters to keep the long story consistent
- **Book audit**: one click scans all written chapters against the bible, fact
  ledger and red lines, reporting located contradictions with one-click revision
- **Character cards**: appearance statistics are computed precisely from the
  chapter bodies, status is LLM-aggregated; historical chapters can be backfilled
- **Revision workspace**: editable original on the left (select text for
  targeted local edits), instruction + preview + apply/cancel on the right;
  drafts never overwrite until applied, and applying auto-backs-up the original
- **Floating AI assistant**: draggable, resizable, position-remembered dialog —
  chat while working in other tabs
- **Grouped navigation with live badges**: creation / tools / database groups,
  badges for chapter todos, foreshadows and journey progress
- **iOS-style frosted glass UI** with light & dark palettes
- Bookshelf, foreshadowing management, writing assets (genre / progression /
  style templates / anti-AI rules / custom style engine), full-book export

## Getting Started

```sh
pnpm install        # install dependencies
pnpm build          # rebuild lib/
```

Mount into the dsh web profile:

```sh
dsh plugin --profile web add link:"<absolute path to this directory>"
```

Or insert into `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: novel-forge
      name: '@waterwx/dsh-novel-forge'
```

Restart dsh web, and the "Novel Forge" entry appears in the sidebar.

## Directory Layout

```
src/             Plugin source (host half + browser half)
lib/             Build output (lib/index.js host / lib/client.js browser)
scripts/         Utility scripts
package.json     Package definition (dsh.bundle.patch + dsh.client declaration)
cordis.patch.yml Profile mount patch
tsdown.config.ts Dual-face bundling config
```

## Data Locations

- Bookshelf: `~/.dsh/dsh-novel-forge-bookshelf.json`
- Each book owns an output directory (containing `novel-project.json` project state,
  per-chapter Markdown, and polish backups `.bak.md`)
- AI assistant conversation log: `<output-dir>/novel-assistant.jsonl`

## Limitations

- Generation consumes LLM API quota (provider/model default: `deepseek-official` /
  `deepseek-v4-flash`)
- Chapter quality depends on outline completeness; batch generation is serial
- Settings (output directory, model, review threshold, etc.) are edited in the
  panel's "Settings" tab and written to the `dsh-novel-forge` section of
  `~/.dsh/settings.yaml`
