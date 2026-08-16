# dsh-novel-forge — AI 编译小说工作台 / AI Novel Writing Workbench

**中文** | [English](#english)

你的专属 AI 小说写作插件：把一份大纲"编译"成一本完整的小说。
Your personal AI novel-writing plugin for DSH: turn an outline into a complete novel.

---

## 功能一览 / Features

| 中文 | English |
|---|---|
| **创作工作流仪表盘**：主行动卡（推荐下一步）+ 创作旅程进度条 + 状态条 + 待办队列 + 资产健康 | **Workflow dashboard**: next-action hero card, journey progress bar, status strip, todo queue, asset health |
| **书架首页**：书卡网格（封面/简介/进度）+ 开书向导独立页，进入工坊先选书 | **Bookshelf home**: book card grid with covers, blurbs and progress, plus a dedicated book-wizard page |
| **正文编辑 + AI 审查 + 保存**：章节工作区直接改文，审查草稿不落盘，保存即审稿（沿用报告不重复审） | **Edit → AI check → save**: edit chapter text, review the draft without persisting, save-with-review reuses the report |
| **按意见修订**：审稿未通过时一键按意见自动修订（指令自动预填 high 优先问题） | **Revise by review**: one click to revise with the review feedback pre-filled |
| **国风模块**：总纲 / 道藏 / 大世界 / 人物志 / 暗线 / 编年录 / 文戒 / 笔法帖 / 心法 | **Wuxia-flavored modules**: outline, story bible, world, characters, foreshadows, fact ledger, anti-AI rules, style templates, custom style |
| **规模化加固**：上下文分片、相关事实注入、质检/影响分析分批、status 瘦身、按卷折叠、token 优化（摘要+事实合并省 25%） | **Scale hardening**: sharded contexts, related-fact injection, batched audit/impact, slim status, volume folding, token optimizations |
| **开书向导**：书架新建书时直接导入大纲（docx/粘贴），开书即建项目，书名自动识别 | **Book wizard**: create a book with its outline in one step — project is built immediately |
| **大纲只读化**：开书后大纲页只读展示；「更新大纲」可选仅改文本（保留进度）或重置项目重来 | **Read-only outline**: after opening a book the outline is read-only; update offers keep-progress or full reset |
| **章节计划结构化**：每章含 本章目标 / 剧情要点 / 爽点·钩子 / 结尾钩子 | **Structured chapter beats**: goal / plot points / payoff-hook / ending hook per chapter |
| **章节计划续写模式**：已有章节时自动续写规划（上一章结尾原文 + 编年录锚点 + 已发生情节禁令），不再重头生成；追加自动去重 | **Continuation planning**: with existing chapters the planner continues from the last chapter's ending (tail text + fact anchors + banned-repeat list), never restarts; duplicate titles are dropped on append |
| **事实库 / 时间线**：每章自动抽取已确立事实，注入后续生成，保证长期一致 | **Fact ledger**: auto-extracted per-chapter facts injected into later chapters for consistency |
| **全书一致性质检**：LLM 扫描全本，输出矛盾清单（定位到章），一键去修订 | **Book audit**: LLM scans all chapters for contradictions, locates them, one-click to revise |
| **角色卡**：出场统计精确计算 + LLM 聚合当前状态，历史章节可回填事实库 | **Character cards**: precise appearance stats + LLM-aggregated status; backfill for old chapters |
| **润色/修订工作区**：左栏原文（选中即局部修订）+ 右栏指令/预览/应用，草稿制不覆盖原稿，自动备份 .bak | **Revision workspace**: editable original + selection-targeted local edits, draft-apply flow with auto-backup |
| **章节编辑独立页**：点「编辑」进入独占整页（左导航保留），原文｜对比左右各半、原稿新稿并排高亮，默认即对比模式 | **Full-page chapter editor**: opening a chapter takes over the content pane; original vs draft side by side with highlighted changes, diff view by default |
| **审稿问题勾选修复**：审查报告每条问题可勾选，一键按所选问题修订（默认勾 high） | **Selective review fixes**: check any review issues (high pre-checked) and fix them in one click |
| **编辑器字号可调**：设置页 12-24px + 编辑页 A−/A＋ 快捷调整（localStorage 记忆） | **Adjustable editor font size**: 12-24px in settings plus A−/A＋ in the editor toolbar (localStorage) |
| **AI 助手悬浮窗**：可拖动、可拉大小、位置记忆；「编辑老师」全量知情 + 影响分析 + 步骤卡片 + 思考计时 + 清空聊天 | **Floating AI assistant**: draggable, resizable, position remembered; full-context "editor" persona with impact analysis and live step cards |
| **分组导航 + 状态角标**：创作/工具/数据库分组，章节待办/伏笔/进度角标 | **Grouped nav + badges**: creation/tools/database groups with live badges |
| **iOS 风格毛玻璃 UI**（浅色/深色） | **iOS-style frosted glass UI** (light/dark) |
| **书架 / 伏笔管理 / 写作资产（题材·推进·写法·反AI规则·自定义引擎）/ 全本导出（TXT/MD）/ 卷首语与封面** | **Bookshelf / foreshadowing / writing assets / full-book export (TXT/MD) / blurb & cover** |

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
- **Bookshelf home**: book card grid with covers, blurbs and progress; a
  dedicated book-wizard page opens a new book with its outline in one step
- **Edit → AI check → save**: edit chapter text in the workspace, review the
  draft without persisting, and save-with-review reuses the report (never
  double-review); one-click "revise by review" pre-fills the feedback
- **Wuxia-flavored modules**: 总纲 (outline), 道藏 (story bible), 大世界 (world),
  人物志 (characters), 暗线 (foreshadows), 编年录 (fact ledger), 文戒 (anti-AI
  rules), 笔法帖 (style templates), 心法 (custom style)
- **Read-only outline**: after opening a book the outline page is read-only;
  "Update outline" offers either keep-progress text update or full project reset
- **Structured chapter beats**: every planned chapter carries goal / plot points /
  payoff-hook / ending hook sections
- **Continuation planning**: with existing chapters the planner continues from the
  last chapter's ending — it injects the previous chapter's tail text, fact-ledger
  anchors and a banned-repeat list (e.g. no re-entering the xu-jing), and trims the
  outline to settings-only, so regenerating a plan never restarts the story;
  duplicate titles are dropped on append
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
- **Full-page chapter editor**: clicking "Edit" takes over the content pane
  (left nav stays); original vs draft side by side 1:1 with highlighted
  changes, diff view on by default
- **Selective review fixes**: every review issue gets a checkbox (high issues
  pre-checked) and one click fixes exactly the checked ones
- **Adjustable editor font size**: 12-24px in settings plus A−/A＋ shortcuts in
  the editor toolbar, remembered in localStorage
- **Floating AI assistant**: draggable, resizable, position-remembered dialog
  with a full-context "editor" persona, impact analysis, live step cards and
  conversation clearing
- **Grouped navigation with live badges**: creation / tools / database groups,
  badges for chapter todos, foreshadows and journey progress
- **Scale hardening**: sharded book contexts, related-fact injection, batched
  audit/impact analysis, slim status payload, volume folding and token
  optimizations (summary+facts merged into one call, ~25% cheaper batches)
- **iOS-style frosted glass UI** with light & dark palettes
- Bookshelf, foreshadowing management, writing assets (genre / progression /
  style templates / anti-AI rules / custom style engine), full-book export,
  blurb & cover

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
