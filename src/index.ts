/**
 * dsh-novel-forge — host half. Mounts the AI novel-forge workbench: docx
 * outline import, LLM chapter planning, chapter-by-chapter generation
 * (3000-4000 chars each), Markdown output into your chosen folder, and the
 * /api/dsh-novel-forge route family. The browser half (./client) renders the
 * workbench panel. Everything rides official NPM SDK packages — no dsh source
 * changes.
 */

import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { ConfigPatch, NovelConfig } from './protocol.ts'
import { makeRoutes } from './routes.ts'
import { activeBookOutputDir } from './bookshelf.ts'

/** Stable cordis plugin name. */
export const name = 'novel-forge'

/** Services required before the novel-forge surfaces can mount. */
export const inject = ['webServer', 'llm', 'systemPrompt']

/**
 * Settings namespace of the novel-forge capability — the section the web
 * settings surface edits. Spelled here rather than imported: the browser half
 * spells the same value and must not depend on a Host package.
 */
export const NOVEL_SETTINGS_NAMESPACE = settingsNamespace('dsh-novel-forge')

/** Plugin config, validated by the same-named schemastery schema. */
export interface Config {
  /** When true (default), a system-prompt section announces the plugin to every agent. */
  announceToAgent?: boolean
  /** Master switch for the plugin (routes, prompt section). */
  enabled?: boolean
  /** Absolute path of the default docx outline to load. */
  outlinePath?: string
  /** Absolute output directory for chapters + project state. */
  outputDir?: string
  /** LLM provider route. */
  provider?: string
  /** LLM model id. */
  model?: string
  /** Target characters per chapter. */
  chapterChars?: number
  /** Max output tokens per chapter call. */
  maxTokens?: number
  /** Review pass threshold (0-100). */
  reviewPassScore?: number
  /** Whether generation auto-runs review after writing. */
  autoReview?: boolean
}

export const Config: z<Config> = z.object({
  announceToAgent: z.boolean().default(true),
  enabled: z.boolean().default(true),
  outlinePath: z.string().default('C:\\Users\\Ryan\\Desktop\\《示例书》全书大纲_重新排版版.docx'),
  outputDir: z.string().default('C:\\Users\\Ryan\\Desktop\\示例书'),
  provider: z.string().default('deepseek-official'),
  model: z.string().default('deepseek-v4-flash'),
  chapterChars: z.number().default(3500),
  maxTokens: z.number().default(12000),
  reviewPassScore: z.number().default(70),
  autoReview: z.boolean().default(true),
})

/** Schema defaults, re-read for hand-built test contexts. */
const DEFAULT_ANNOUNCE = true
const DEFAULT_OUTLINE_PATH = 'C:\\Users\\Ryan\\Desktop\\《示例书》全书大纲_重新排版版.docx'
const DEFAULT_OUTPUT_DIR = 'C:\\Users\\Ryan\\Desktop\\示例书'
const DEFAULT_PROVIDER = 'deepseek-official'
const DEFAULT_MODEL = 'deepseek-v4-flash'
const DEFAULT_CHAPTER_CHARS = 3500
const DEFAULT_MAX_TOKENS = 12000
const DEFAULT_REVIEW_PASS_SCORE = 70
const DEFAULT_AUTO_REVIEW = true

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 160

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const NOVEL_GUIDANCE = '本机已安装 dsh-novel-forge 插件（AI 编译小说工作台）：侧边栏「小说工坊」入口。能力：读取 docx 大纲（默认桌面《示例书》大纲）或粘贴大纲文本；用 LLM 提炼设定圣经（人设/世界观/金手指规则/写作红线）；生成卷计划与章节计划；逐章调用 LLM 生成 3000-4000 字正文并保存为 Markdown（默认输出到 桌面\\示例书）；每章自动生成摘要（叙事记忆）、自动 AI 审稿（人设/设定/红线/文笔/爽点/逻辑），支持按审稿意见重写、去 AI 味润色、伏笔管理、批量连写与全本导出（txt/md）。限制：生成消耗 LLM API 额度；输出目录与模型可在插件设置中修改；章节正文质量取决于大纲完整度。用户提到「小说 / 大纲 / 写小说 / 章节 / 审稿 / 伏笔 / 润色 / 示例书」时即指本插件，请据此协作。'

/** Resolve a config-like value into the full runtime config. */
export function resolveConfig(value: Partial<Config> | undefined): NovelConfig {
  return {
    outlinePath: value?.outlinePath ?? DEFAULT_OUTLINE_PATH,
    outputDir: value?.outputDir ?? DEFAULT_OUTPUT_DIR,
    provider: value?.provider ?? DEFAULT_PROVIDER,
    model: value?.model ?? DEFAULT_MODEL,
    chapterChars: value?.chapterChars ?? DEFAULT_CHAPTER_CHARS,
    maxTokens: value?.maxTokens ?? DEFAULT_MAX_TOKENS,
    reviewPassScore: value?.reviewPassScore ?? DEFAULT_REVIEW_PASS_SCORE,
    autoReview: value?.autoReview ?? DEFAULT_AUTO_REVIEW,
  }
}

/**
 * Mount the routes and announcement.
 * @param ctx - host plugin context carrying webServer/llm/systemPrompt.
 * @param config - resolved plugin config (schema defaults applied by the loader).
 */
export function apply(ctx: Context, config?: Config): void {
  // The live source the routes read: the settings section once the web
  // settings surface is served, the composition entry otherwise.
  let current: () => Config = () => config ?? {}
  const resolve = (): NovelConfig => {
    const resolved = resolveConfig(current())
    // 书架激活的书优先决定输出目录（settings 仍可改默认值）。
    const shelfDir = activeBookOutputDir()
    if (shelfDir !== undefined) {
      return { ...resolved, outputDir: shelfDir }
    }
    return resolved
  }

  const patchConfig = async (patch: ConfigPatch): Promise<NovelConfig> => {
    const next: ConfigPatch = {}
    if (patch.outlinePath !== undefined) next.outlinePath = patch.outlinePath
    if (patch.outputDir !== undefined) next.outputDir = patch.outputDir
    if (patch.provider !== undefined) next.provider = patch.provider
    if (patch.model !== undefined) next.model = patch.model
    if (patch.chapterChars !== undefined) next.chapterChars = patch.chapterChars
    if (patch.maxTokens !== undefined) next.maxTokens = patch.maxTokens
    if (patch.reviewPassScore !== undefined) next.reviewPassScore = patch.reviewPassScore
    if (patch.autoReview !== undefined) next.autoReview = patch.autoReview
    // Persist through the settings seam when available; otherwise keep in memory.
    // (ctx.get is the non-strict service access — no inject requirement, same
    // pattern installSettingsSection itself uses.)
    const settings = ctx.get('settings')
    if (settings !== undefined) {
      await settings.update(NOVEL_SETTINGS_NAMESPACE, next as Record<string, unknown>)
    } else {
      current = () => ({ ...current(), ...next })
    }
    return resolve()
  }

  let disposeSection: (() => void) | undefined
  let disposeRoutes: (() => void) | undefined

  const sync = (): void => {
    if (disposeSection !== undefined) {
      disposeSection()
      disposeSection = undefined
    }
    if (disposeRoutes !== undefined) {
      disposeRoutes()
      disposeRoutes = undefined
    }
    const value = resolve()
    if (!(current().enabled ?? true)) return
    if (current().announceToAgent ?? DEFAULT_ANNOUNCE) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:dsh-novel-forge',
        order: SECTION_ORDER,
        text: NOVEL_GUIDANCE,
      })
    }
    const routes = makeRoutes({ ctx, getConfig: resolve, patchConfig })
    disposeRoutes = ctx.effect(
      () => {
        const disposers = routes.map(route => ctx.webServer.register(route))
        return () => { for (const dispose of disposers) dispose() }
      },
      'dsh-novel-forge: routes',
    )
    void value
  }

  installSettingsSection(ctx, NOVEL_SETTINGS_NAMESPACE, Config, config ?? {}, {
    setSource: (source) => {
      current = source
      sync()
    },
    onChange: sync,
  })

  // Initial registration from the composition entry.
  sync()
}
