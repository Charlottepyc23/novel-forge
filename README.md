# My Personal AI Novel Forge (Standalone Copy)

This is a **complete, standalone copy** of the `dsh-novel-forge` plugin, saved to
your Desktop and kept separate from the live working copy. All source code,
build artifacts, and configuration are included — install, build, and mount it
any time.

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
pnpm install        # install dependencies (node_modules was cleaned; one command restores it)
pnpm build          # rebuild lib/
```

Mount into the dsh web profile:

```sh
dsh plugin --profile web add link:"<用户目录>\Desktop\ai xiaoshuo"
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
scripts/         Restart script
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
