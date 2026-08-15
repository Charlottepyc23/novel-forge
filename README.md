# dsh-novel-forge — AI 编译小说工作台 / AI Novel Writing Workbench

**中文** | [English](#english)

你的专属 AI 小说写作插件：把一份大纲"编译"成一本完整的小说。
Your personal AI novel-writing plugin for DSH: turn an outline into a complete novel.

---

## 功能一览 / Features

| 中文 | English |
|---|---|
| **创作工作流**：大纲 → 设定圣经 → 卷计划 → 章节计划 → 逐章生成 + AI 审稿 → 润色/导出 | **Workflow**: outline → story bible → volumes → chapter plan → chapter-by-chapter writing with AI review → polish/export |
| **书架**：同时管理多本书，点击切换进度继续编译，可新建书 | **Bookshelf**: manage multiple books at once — click to switch and keep writing, or start a new one |
| **写作资产**：题材基底库 / 推进模式库 / 8 套预置写法模板 / 12 条反 AI 规则 / 自定义写法引擎 | **Writing assets**: genre library / progression modes / 8 preset style templates / 12 anti-AI rules / custom style engine |
| **AI 助手**：对话讨论剧情，助手可直接修改大纲、设定、章节（工具调用实时可见） | **AI assistant**: chat about the plot; the assistant edits outline, settings, and chapters live |
| **docx 导入**：点击选择或拖拽本机大纲文件，浏览器本地解析 | **docx import**: pick or drag a local outline file — parsed in the browser |
| **逐章生成**：3000–4000 字/章，自动摘要（叙事记忆）+ AI 审稿 + 按意见修订 + 去 AI 味 | **Chapter generation**: 3000–4000 chars per chapter with summaries, AI review, revise-by-feedback, de-AI polish |
| **伏笔管理 / 全本导出（TXT/MD）** | **Foreshadowing / full-book export (TXT/MD)** |

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
      name: '@ryan/dsh-novel-forge'
```

重启 dsh web 后，侧边栏出现「小说工坊」。
Restart dsh web and the "Novel Forge" entry appears in the sidebar.

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
- 每本书一个输出目录（含 `novel-project.json` + 各章 Markdown）/ each book owns an output directory
- AI 助手对话记录 / assistant log：`<输出目录>/novel-assistant.jsonl`

## 限制 / Limitations

- 生成消耗 LLM API 额度（默认 deepseek-official / deepseek-v4-flash）/ generation consumes LLM API quota
- 章节质量取决于大纲完整度 / chapter quality depends on outline completeness
- 设置写入 `~/.dsh/settings.yaml` 的 `dsh-novel-forge` 段 / settings persist in `~/.dsh/settings.yaml`

---

<a id="english"></a>

## English

# My Personal AI Novel Forge (Standalone Copy)

This is a **complete, standalone copy** of the `dsh-novel-forge` plugin. All
source code, build artifacts, and configuration are included — install, build,
and mount it any time.

## Feature Overview

- **Workflow**: Outline → Story Bible → Volume Plan → Chapter Plan → chapter-by-chapter
  writing with AI review → polish / export
- **Bookshelf**: manage multiple books at once — click to switch progress and keep
  writing, or start a new book
- **Writing assets**: genre base library / progression mode library / 8 preset style
  templates / 12 anti-AI rules / custom style engine
- **AI Assistant**: discuss plot in chat; the assistant can directly edit the outline,
  settings, and chapters (tool calls are visible live)
- **docx import**: pick a local outline file or drag & drop it — parsed in the browser,
  no server upload
- **Chapter generation**: 3000–4000 characters per chapter, with automatic summary
  (narrative memory), AI review, revise-by-feedback, and de-AI polish
- **Foreshadowing management / full-book export (TXT/MD)**

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
      name: '@ryan/dsh-novel-forge'
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
- Each book owns an output directory (containing `novel-project.json` project state
  plus per-chapter Markdown files)
- AI assistant conversation log: `<output-dir>/novel-assistant.jsonl`

## Limitations

- Generation consumes LLM API quota (provider/model default: `deepseek-official` /
  `deepseek-v4-flash`)
- Chapter quality depends on outline completeness; batch generation is serial
- Settings (output directory, model, review threshold, etc.) are edited in the
  panel's "Settings" tab and written to the `dsh-novel-forge` section of
  `~/.dsh/settings.yaml`
