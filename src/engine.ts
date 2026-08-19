/**
 * Novel engine — the host half's core: LLM-driven story-bible extraction,
 * volume planning, chapter planning, chapter-by-chapter writing with
 * auto-review + rewrite, polish (de-AI-ify), narrative summaries, foreshadow
 * tracking, project persistence, and whole-book export. Pure Node (no
 * web-server dependencies), so routes stay thin and logic is testable.
 */

/**
 * 内容合规红线（平台硬性要求）：所有书籍、所有章节无条件生效，
 * 优先级高于单书大纲/圣经中的任何设定与作者自定义红线。
 * 注入点：章节生成系统提示 + 审稿系统提示（命中即 high）。
 */
export const COMPLIANCE_REDLINES: ReadonlyArray<string> = [
  '1. 不得出现反对宪法所确定的基本原则的内容。',
  '2. 不得出现危害国家安全、泄露国家秘密、颠覆国家政权、破坏国家统一的内容。',
  '3. 不得出现危害国家荣誉和利益的内容。',
  '4. 不得出现煽动民族仇恨、民族歧视、破坏民族团结的内容。',
  '5. 不得出现破坏国家宗教政策、宣扬邪教和愚昧迷信的内容（不得以真实宗教、邪教或迷信活动为背景进行宣扬）。',
  '6. 不得出现散布谣言、扰乱社会秩序、破坏社会稳定的内容。',
  '7. 不得出现淫秽色情、赌博、暴力、凶杀、恐怖或教唆犯罪的内容（网文语境：禁止露骨性描写、血腥暴力渲染、赌博教唆、犯罪手法详细教学）。',
  '8. 不得出现侮辱或者诽谤他人、侵害他人合法权益的内容（不得以真实人物、组织为原型进行侮辱或影射攻击）。',
  '9. 不得出现法律法规禁止的其他内容。',
]

import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createUserMessage, BlockAssembler, ReasoningEffortId, type GenerateOptions, type Message, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import { emptyProjectAssets, renderAllAssets, styleEngineSystemPrompt } from './assets.ts'
import type {
  AuditIssue,
  AuthorReview,
  BreakdownResponse,
  ChapterPlan,
  Foreshadow,
  NovelConfig,
  OutlineCandidate,
  Plotline,
  PlotlineHealthReport,
  PlotlinePlan,
  ProjectState,
  ReviewReport,
  RoleRecord,
  RoleStatusCard,
  StoryBible,
  StoryboardPlanResponse,
  StoryboardResponse,
  Volume,
  WorldState,
} from './protocol.ts'

/** Project state file name inside the output dir. */
export const PROJECT_FILE = 'novel-project.json'

// ------------------------------------------------------------------ helpers

/** Sanitize a file name: keep CJK/alphanumerics/space/dash/underscore. */
function safeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

/** Chapter output file name, e.g. 第001章_开篇.md */
export function chapterFileName(chapter: ChapterPlan): string {
  const title = safeFileName(chapter.title) || `第${chapter.no}章`
  return `第${String(chapter.no).padStart(3, '0')}章_${title}.md`
}

/** Infer a book name from the outline's first non-empty line. */
export function inferBookName(outline: string): string {
  const line = outline.split('\n').map(l => l.trim()).find(l => l.length > 0)
  return (line ?? '未命名小说').replace(/^《/, '').replace(/》.*$/, '').slice(0, 40)
}

// ------------------------------------------------------------------ project

/** Read the persisted project from the output dir (undefined when absent). */
export function loadProject(outputDir: string): ProjectState | undefined {
  const file = join(outputDir, PROJECT_FILE)
  if (!existsSync(file)) return undefined
  try {
    let rawText = readFileSync(file, 'utf8')
    // Tolerate a UTF-8 BOM (some editors / PowerShell writes add one).
    if (rawText.charCodeAt(0) === 0xFEFF) rawText = rawText.slice(1)
    const raw = JSON.parse(rawText) as ProjectState
    if (typeof raw.outline !== 'string' || !Array.isArray(raw.chapters)) return undefined
    // Normalize legacy projects (foreshadows / assets may be missing).
    if (!Array.isArray(raw.foreshadows)) raw.foreshadows = []
    if (raw.assets === undefined || typeof raw.assets !== 'object') raw.assets = emptyProjectAssets()
    if (!Array.isArray(raw.assets.antiAiRules)) raw.assets.antiAiRules = []
    if (!Array.isArray(raw.assets.auxiliaryProgressions)) raw.assets.auxiliaryProgressions = []
    if (!Array.isArray(raw.assets.styleAssets)) raw.assets.styleAssets = []
    if (!Array.isArray(raw.facts)) raw.facts = []
    if (!Array.isArray(raw.plotlines)) raw.plotlines = []
    return raw
  } catch {
    return undefined
  }
}

/** Persist the project state next to the chapters. */
export function saveProject(outputDir: string, project: ProjectState): void {
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, PROJECT_FILE), JSON.stringify(project, null, 2), 'utf8')
}

/**
 * 并发保护：长任务（章节计划生成/正文生成）在内存中持有旧快照，
 * 期间其他请求可能修改了「易变字段」（道藏/角色库/剧情线/人物志存档/简介/封面）。
 * 保存前用磁盘最新版本合并这些字段，避免旧快照覆盖新修改（曾导致角色卡丢失）。
 * 注意：调用方若自己修改了这些字段，不要使用本函数。
 */
export function mergeVolatileFromDisk(outputDir: string, project: ProjectState): void {
  try {
    const disk = loadProject(outputDir)
    if (disk === undefined) return
    project.bible = disk.bible
    project.roles = disk.roles
    project.plotlines = disk.plotlines
    project.roleStatus = disk.roleStatus
    project.blurb = disk.blurb
    project.coverPath = disk.coverPath
    project.facts = disk.facts
    project.assets = disk.assets
    project.world = disk.world
    project.volumes = disk.volumes
  } catch { /* 磁盘读取失败时保持原状 */ }
}

// ------------------------------------------------------------ sensitive words

/**
 * 内置违禁词库（网文平台常见审查类别）。只做硬匹配提示，不代替人工判断。
 * 词语刻意保持常见写法；作者可自行判断是否修改。
 */
const SENSITIVE_WORDS: ReadonlyArray<{ word: string; category: string }> = [
  // 政治敏感
  { word: '共匪', category: '政治' }, { word: '独裁', category: '政治' },
  { word: '法轮', category: '政治' }, { word: '六四', category: '政治' },
  { word: '天安门事件', category: '政治' }, { word: '翻墙', category: '政治' },
  { word: '政治敏感', category: '政治' },
  // 色情擦边
  { word: '乳沟', category: '擦边' }, { word: '酥胸', category: '擦边' },
  { word: '淫荡', category: '擦边' }, { word: '做爱', category: '擦边' },
  { word: '上床', category: '擦边' }, { word: '裸体', category: '擦边' },
  { word: '一丝不挂', category: '擦边' }, { word: '胴体', category: '擦边' },
  { word: '春药', category: '擦边' }, { word: '催情', category: '擦边' },
  { word: '迷奸', category: '擦边' }, { word: '强暴', category: '擦边' },
  { word: '轮奸', category: '擦边' }, { word: '援交', category: '擦边' },
  { word: '嫖娼', category: '擦边' }, { word: '卖淫', category: '擦边' },
  { word: '色情', category: '擦边' }, { word: '情色', category: '擦边' },
  { word: '撸管', category: '擦边' }, { word: '自慰', category: '擦边' },
  { word: '口交', category: '擦边' }, { word: '打炮', category: '擦边' },
  { word: '约炮', category: '擦边' }, { word: '一夜情', category: '擦边' },
  // 暴力血腥
  { word: '碎尸', category: '暴力' }, { word: '分尸', category: '暴力' },
  { word: '凌迟', category: '暴力' }, { word: '剥皮', category: '暴力' },
  { word: '开膛', category: '暴力' }, { word: '剖腹', category: '暴力' },
  { word: '挖心', category: '暴力' }, { word: '虐杀', category: '暴力' },
  { word: '凌辱', category: '暴力' }, { word: '血腥', category: '暴力' },
  { word: '大屠杀', category: '暴力' }, { word: '灭门', category: '暴力' },
  { word: '满门抄斩', category: '暴力' }, { word: '腰斩', category: '暴力' },
  { word: '活埋', category: '暴力' }, { word: '点天灯', category: '暴力' },
  // 辱骂攻击
  { word: '傻逼', category: '辱骂' }, { word: '傻B', category: '辱骂' },
  { word: '草泥马', category: '辱骂' }, { word: '妈的', category: '辱骂' },
  { word: '尼玛', category: '辱骂' }, { word: '去死', category: '辱骂' },
  { word: '废物', category: '辱骂' }, { word: '垃圾', category: '辱骂' },
  { word: '人渣', category: '辱骂' }, { word: '贱人', category: '辱骂' },
  { word: '婊子', category: '辱骂' }, { word: '狗日的', category: '辱骂' },
  // 广告引流
  { word: '加微信', category: '广告' }, { word: '加QQ', category: '广告' },
  { word: '微信公众号', category: '广告' }, { word: '淘宝', category: '广告' },
  { word: '拼多多', category: '广告' }, { word: '刷单', category: '广告' },
  { word: '充值返利', category: '广告' }, { word: '扫码领', category: '广告' },
  { word: '加群领', category: '广告' }, { word: 'vx', category: '广告' },
  { word: '扣扣', category: '广告' },
  // 其他违禁
  { word: '赌博', category: '其他' }, { word: '赌场', category: '其他' },
  { word: '毒品', category: '其他' }, { word: '冰毒', category: '其他' },
  { word: '摇头丸', category: '其他' }, { word: '自杀方法', category: '其他' },
  { word: '邪教', category: '其他' }, { word: '传销', category: '其他' },
  { word: '军火', category: '其他' }, { word: '枪支', category: '其他' },
  { word: '管制刀具', category: '其他' },
]

/** 对一段文本做违禁词硬匹配，返回命中（词/类别/次数）。 */
export function checkSensitiveText(text: string): Array<{ word: string; category: string; count: number }> {
  const hits: Array<{ word: string; category: string; count: number }> = []
  for (const entry of SENSITIVE_WORDS) {
    let count = 0
    let idx = text.indexOf(entry.word)
    while (idx !== -1) {
      count++
      idx = text.indexOf(entry.word, idx + entry.word.length)
    }
    if (count > 0) hits.push({ word: entry.word, category: entry.category, count })
  }
  return hits
}

/** List generated chapter files in the output dir (sorted). */
export function listChapterFiles(outputDir: string): string[] {
  if (!existsSync(outputDir)) return []
  try {
    return readdirSync(outputDir)
      .filter(name => /^第\d+章_.*\.md$/.test(name) && !name.endsWith('.bak.md'))
      .sort((a, b) => {
        const na = Number(/^第(\d+)章/.exec(a)?.[1] ?? 0)
        const nb = Number(/^第(\d+)章/.exec(b)?.[1] ?? 0)
        return na - nb
      })
  } catch {
    return []
  }
}

/** Re-sync chapter status against files on disk (a file may exist without state). */
export function syncProjectWithDisk(project: ProjectState, outputDir: string): void {
  const files = new Map<string, string>()
  for (const file of listChapterFiles(outputDir)) {
    const no = Number(/^第(\d+)章/.exec(file)?.[1] ?? 0)
    if (no > 0) files.set(String(no), file)
  }
  for (const chapter of project.chapters) {
    const file = files.get(String(chapter.no))
    if (file !== undefined && (chapter.status === 'pending' || chapter.status === 'generating')) {
      chapter.status = 'written'
      chapter.file = file
    }
  }
  project.updatedAt = new Date().toISOString()
}

/** Read a chapter's markdown body from disk (undefined when missing). */
export function readChapterFile(outputDir: string, chapter: ChapterPlan): string | undefined {
  if (chapter.file === undefined) return undefined
  const path = join(outputDir, chapter.file)
  if (!existsSync(path)) return undefined
  return readFileSync(path, 'utf8')
}

/** Create a fresh project from an outline. */
export function createProject(outline: string, outlinePath?: string): ProjectState {
  const now = new Date().toISOString()
  return {
    bookName: inferBookName(outline),
    outline,
    outlinePath,
    chapters: [],
    foreshadows: [],
    assets: emptyProjectAssets(),
    facts: [],
    createdAt: now,
    updatedAt: now,
  }
}

// ------------------------------------------------------------------- llm

/** One complete non-streaming LLM call. */
async function complete(
  ctx: Context,
  config: NovelConfig,
  options: { system: string; user: string; temperature?: number; maxTokens?: number },
): Promise<string> {
  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: options.user }],
    source: { kind: 'plugin', plugin: 'dsh-novel-forge' },
  })]
  const request: GenerateOptions = {
    provider: config.provider,
    model: config.model,
    messages,
    system: options.system,
    maxTokens: options.maxTokens ?? config.maxTokens,
    temperature: options.temperature ?? 0.7,
  }
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream(request)) {
    assembler.push(chunk)
  }
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    throw new Error(`LLM 调用失败（${finish.kind}）: ${finish.failure.message}`)
  }
  if (finish.kind === 'max-tokens') {
    throw new Error('LLM 输出达到 maxTokens 上限，请增大配置后重试')
  }
  const blocks = assembler.blocks()
  // Diagnostics: log the assembled block shape (reasoning-only turns yield no
  // text blocks — the v4-flash model can answer entirely in the reasoning
  // channel, which the adapter surfaces as a reasoning block).
  if (process.env.DSH_NOVEL_DEBUG === '1') {
    console.error('[dsh-novel-forge] complete: finish=%j blocks=%j', JSON.stringify(finish), blocks.map(b => `${b.type}:${'text' in b ? b.text.length : '?'}`))
  }
  const textBlocks = blocks
    .filter((block): block is Extract<StreamChunk, { type: 'block-end' }>['block'] & { type: 'text' } => block.type === 'text')
    .map(block => block.text)
  let text = textBlocks.join('\n').trim()
  // v4-flash can answer entirely in the reasoning channel (the adapter
  // surfaces that as a 'reasoning' block). Fall back to it when no text came
  // back — the reasoning content is the model's actual answer here.
  if (text === '') {
    const reasoning = blocks
      .filter((block): block is { type: 'reasoning'; text: string } => block.type === 'reasoning')
      .map(block => block.text)
      .join('\n')
      .trim()
    if (reasoning !== '') text = reasoning
  }
  return text
}

/**
 * Parse a JSON value out of a model response. Multi-level tolerance because
 * models are sloppy: prose around the JSON, ```json fences, a truncated tail,
 * or raw newlines inside string values all defeat a single JSON.parse. We
 * walk candidates from strictest to loosest.
 */
function parseJson<T>(text: string, wantArray: boolean): T {
  const candidates: string[] = []
  const push = (value: string | undefined): void => {
    if (value !== undefined && value.trim() !== '') candidates.push(value.trim())
  }

  // 1. Whole response, and any ```json fence body.
  push(text)
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  push(fenced?.[1])
  // 2. From the first opener to the last closer.
  const opener = wantArray ? '[' : '{'
  const closer = wantArray ? ']' : '}'
  const start = text.indexOf(opener)
  const end = text.lastIndexOf(closer)
  if (start !== -1 && end > start) push(text.slice(start, end + 1))
  // 3. Trim trailing prose (a "}..." tail after the last closer).
  const trimmed = text.replace(new RegExp(`${closer}[\\s\\S]*$`), closer)
  push(trimmed)
  const start2 = trimmed.indexOf(opener)
  if (start2 !== -1) push(trimmed.slice(start2))

  // Repair: models love raw newlines inside string values, which JSON forbids.
  const repair = (value: string): string => {
    let out = ''
    let inString = false
    for (let i = 0; i < value.length; i++) {
      const ch = value[i]!
      if (inString) {
        if (ch === '\\') {
          out += ch + (value[i + 1] ?? '')
          i++
          continue
        }
        if (ch === '"') {
          inString = false
          out += ch
          continue
        }
        if (ch === '\n' || ch === '\r') {
          out += '\\n'
          continue
        }
        out += ch
      } else {
        if (ch === '"') inString = true
        out += ch
      }
    }
    return out
  }

  for (const candidate of candidates) {
    for (const attempt of [candidate, repair(candidate)]) {
      try {
        const value = JSON.parse(attempt) as unknown
        if (!wantArray || Array.isArray(value)) return value as T
        // wantArray but the model wrapped the list in an object, e.g.
        // {"chapters": [...]} — extract the first array-valued key.
        if (typeof value === 'object' && value !== null) {
          for (const key of Object.keys(value as Record<string, unknown>)) {
            const inner = (value as Record<string, unknown>)[key]
            if (Array.isArray(inner)) return inner as T
          }
        }
        // Not an array — keep trying the remaining candidates.
      } catch {
        // try the next candidate
      }
    }
  }
  const preview = text.length > 300 ? text.slice(0, 300) + '…' : text
  throw new Error(`模型输出中未找到 JSON 数据。模型原始输出：${preview}`)
}

/** Parse a JSON array (chapters, volumes, issues...). */
function parseJsonArray<T>(text: string): T[] {
  const value = parseJson<T[]>(text, true)
  return Array.isArray(value) ? value : []
}

/** Parse a JSON object. */
function parseJsonObject<T>(text: string): T {
  const value = parseJson<T>(text, false)
  if (typeof value !== 'object' || value === null) throw new Error('模型输出不是 JSON 对象')
  return value
}

// ------------------------------------------------------------------ bible

/** System prompt for story-bible extraction. */
function bibleSystemPrompt(): string {
  return [
    '你是一位资深网文编辑兼设定架构师。你会收到一份小说大纲，请把它提炼成结构化的「设定圣经」(Story Bible)，供后续写作时严格引用。',
    '要求：',
    '1. 忠于大纲，不自行发明大纲之外的设定。',
    '2. 角色卡覆盖大纲明确出现的角色（主角必含），每个角色给出性格标签、目标、关键关系。',
    '3. 世界规则覆盖力量体系、金手指机制、势力、地理等所有硬性规则，逐条列出。',
    '4. 红线列出大纲中明确禁止的内容（如无后宫、不圣母、无无脑碾压等）。',
    '5. 风格列出叙事基调、节奏、POV 等写作风格要点。',
    '输出必须是合法 JSON 对象，不要输出任何其他文字或 Markdown 代码块标记。',
    '重要：所有字符串值内部不得包含换行符（不要用多行字符串），JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。',
    'JSON 结构：',
    '{"genre": "题材与基调一句话", "worldRules": ["规则1", "规则2", ...], "characters": [{"name": "角色名", "role": "protagonist|supporting|antagonist|other", "traits": ["标签1", ...], "goals": "目标与动机", "relations": "关键关系"}], "redLines": ["红线1", ...], "style": ["风格1", ...]}',
  ].join('\n')
}

/** Extract the story bible from an outline. */
export async function extractBible(ctx: Context, config: NovelConfig, outline: string): Promise<StoryBible> {
  const user = `请为下面这部小说提炼设定圣经：\n\n${outline}`
  const text = await complete(ctx, config, {
    system: bibleSystemPrompt(),
    user,
    temperature: 0.4,
    maxTokens: Math.max(config.maxTokens, 16000),
  })
  const raw = parseJsonObject<{
    genre?: unknown
    worldRules?: unknown
    characters?: unknown
    redLines?: unknown
    style?: unknown
  }>(text)
  const strArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : []
  const characters: StoryBible['characters'] = Array.isArray(raw.characters)
    ? raw.characters
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
        .map(entry => ({
          name: typeof entry.name === 'string' ? entry.name.trim() : '未命名',
          role: (['protagonist', 'supporting', 'antagonist', 'other'] as const).includes(entry.role as never)
            ? entry.role as StoryBible['characters'][number]['role']
            : 'other',
          traits: strArray(entry.traits),
          goals: typeof entry.goals === 'string' ? entry.goals : '',
          relations: typeof entry.relations === 'string' ? entry.relations : '',
          knowledge: strArray(entry.knowledge),
        }))
        .filter(card => card.name !== '')
    : []
  const bible: StoryBible = {
    genre: typeof raw.genre === 'string' ? raw.genre : '',
    worldRules: strArray(raw.worldRules),
    characters,
    redLines: strArray(raw.redLines),
    style: strArray(raw.style),
    generatedAt: new Date().toISOString(),
  }
  if (bible.worldRules.length === 0 && bible.characters.length === 0 && bible.redLines.length === 0) {
    throw new Error('道藏生成失败：模型没有返回有效内容')
  }
  return bible
}

// ------------------------------------------------------------------ volumes

/** System prompt for volume planning. */
function volumeSystemPrompt(): string {
  return [
    '你是一位资深网文总编。你会收到一份小说大纲，请把全书划分为若干「卷」（分卷），每卷有明确的剧情定位与起止章节。',
    '要求：',
    '1. 大纲已有分卷时，严格遵循大纲的分卷结构；没有时按剧情弧线合理划分（3-8 卷）。',
    '2. 卷定位一句话说明该卷的剧情重心。',
    '3. chapterStart/chapterEnd 给出该卷覆盖的章节区间（从 1 开始连续编号）。',
    '输出必须是合法 JSON 数组，不要输出任何其他文字：',
    '[{"no": 1, "title": "卷名", "summary": "卷定位与剧情重心", "chapterStart": 1, "chapterEnd": 80}]',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。',
  ].join('\n')
}

/** Plan volumes from an outline. */
export async function planVolumes(ctx: Context, config: NovelConfig, outline: string): Promise<Volume[]> {
  const user = `请为下面这部小说划分卷：\n\n${outline}`
  const text = await complete(ctx, config, { system: volumeSystemPrompt(), user, temperature: 0.4, maxTokens: Math.max(config.maxTokens, 12000) })
  const parsed = parseJsonArray<Record<string, unknown>>(text)
  const volumes: Volume[] = []
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i]
    if (typeof entry !== 'object' || entry === null) continue
    const no = typeof entry.no === 'number' ? entry.no : i + 1
    const title = typeof entry.title === 'string' ? entry.title.trim() : `第${no}卷`
    const summary = typeof entry.summary === 'string' ? entry.summary.trim() : ''
    const start = typeof entry.chapterStart === 'number' ? entry.chapterStart : undefined
    const end = typeof entry.chapterEnd === 'number' ? entry.chapterEnd : undefined
    volumes.push({
      no,
      title: title.slice(0, 40),
      summary: summary.slice(0, 300),
      chapterStart: start ?? 1,
      chapterEnd: end ?? 1,
    })
  }
  if (volumes.length === 0) throw new Error('卷计划生成失败：模型没有返回有效卷')
  return volumes
}

/** Assign a chapter to its volume by number. */
function volumeOf(chapterNo: number, volumes: Volume[] | undefined): number {
  if (volumes === undefined || volumes.length === 0) return 0
  for (const volume of volumes) {
    if (chapterNo >= volume.chapterStart && chapterNo <= volume.chapterEnd) return volume.no
  }
  return volumes[volumes.length - 1]?.no ?? 0
}

// ------------------------------------------------------------------- plan

/** The chapter-planning prompt template. */
function planSystemPrompt(volumes: Volume[] | undefined): string {
  const volumeBlock = volumes !== undefined && volumes.length > 0
    ? ['\n全书分卷结构（规划章节时需落在对应卷内）：']
      .concat(volumes.map(v => `第${v.no}卷《${v.title}》：${v.summary}（章节 ${v.chapterStart}-${v.chapterEnd}）`))
      .join('\n')
    : ''
  return [
    '你是一位资深中文网文策划编辑，擅长把小说大纲拆解为可执行的章节计划。',
    '你会收到一份小说大纲。请根据大纲的设定、主线与节奏，规划出一份章节计划。',
    '要求：',
    '1. 每章必须有明确的核心剧情推进（不能只是过渡或凑字数）。',
    '2. 章节之间要衔接自然，前章结尾为后章埋下钩子。',
    '3. 严格遵循大纲的人设、金手指规则、战力体系与世界观设定，不得自行发明冲突设定。',
    '4. 输出必须是合法的 JSON 数组，不要输出任何其他文字或 Markdown 代码块标记。',
    '5. 数组每个元素格式：{"title": "章节标题（10字以内，有网文感）", "beats": "结构化剧情要点（150-250字，必须包含四段，段间用换行分隔）：\\n本章目标：本章要完成的核心推进；\\n剧情要点：主要情节的起承转合（2-4 句）；\\n爽点/钩子：本章的爽点兑现或情绪钩子；\\n结尾钩子：本章结尾为下一章埋下的悬念"}',
    '重要：beats 字段内部必须使用 \\n 转义表示换行（JSON 字符串内不得有真实换行符），其余字符串值也不得包含真实换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。',
    volumeBlock,
  ].join('\n')
}

/** Build the writing system prompt (bible + outline + active foreshadows). */
function writeSystemPrompt(project: ProjectState): string {
  const bible = project.bible
  const sections: string[] = []
  if (bible !== undefined) {
    sections.push('==================== 设定圣经（写作时严格遵守） ====================')
    if (bible.genre !== '') sections.push(`题材基调：${bible.genre}`)
    if (bible.worldRules.length > 0) sections.push('世界规则：\n' + bible.worldRules.map(r => `- ${r}`).join('\n'))
    if (bible.characters.length > 0) {
      sections.push('角色卡：')
      for (const card of bible.characters) {
        const roleName = { protagonist: '主角', supporting: '配角', antagonist: '反派', other: '其他' }[card.role]
        sections.push(`- ${card.name}（${roleName}）：${card.traits.join('、')}${card.goals !== '' ? `；目标：${card.goals}` : ''}${card.relations !== '' ? `；关系：${card.relations}` : ''}`)
        if (Array.isArray(card.knowledge) && card.knowledge.length > 0) {
          sections.push(`  已知信息（该角色知道的：${card.knowledge.join('；')}；未列出的信息该角色一律不知道，不得写其知晓或提及）`)
        }
      }
    }
    // 角色库注入：定位 + 身份 + 关系（角色互动按定位规格写）。
    const roleLib = project.roles ?? []
    if (roleLib.length > 0) {
      const labelName = { protagonist: '主角', female_lead: '女主', female_support: '女配', support: '配角', antagonist: '反派', extra: '路人' }
      sections.push('角色库（出场角色按定位规格刻画互动）：')
      for (const r of roleLib) {
        sections.push(`- ${r.name}（${labelName[r.roleLabel]}）：${r.identity}${r.relations.length > 0 ? `；关系：${r.relations.join('、')}` : ''}`)
      }
    }
    if (bible.redLines.length > 0) sections.push('写作红线（违反即失败）：\n' + bible.redLines.map(r => `- ${r}`).join('\n'))
    if (bible.style.length > 0) sections.push('风格要求：\n' + bible.style.map(r => `- ${r}`).join('\n'))
  }
  const worldBlock = renderWorld(project.world)
  if (worldBlock !== '') sections.push(worldBlock)
  sections.push('==================== 全书大纲 ====================')
  // 超长大纲截断保护（防止上下文超限）；完整大纲在总纲页查看。
  const outlineBlock = project.outline.length > 6000
    ? project.outline.slice(0, 6000) + '\n…（大纲过长已节选，完整内容见总纲页）'
    : project.outline
  sections.push(outlineBlock)
  sections.push('==================== 大纲结束 ====================')
  const assetsBlock = renderAllAssets(project.assets)
  if (assetsBlock !== '') sections.push(assetsBlock)
  const active = project.foreshadows.filter(f => f.status === 'planted' || f.status === 'progressing')
  if (active.length > 0) {
    sections.push('==================== 活跃伏笔（近期需推进或回收的线索） ====================')
    for (const f of active) {
      sections.push(`- [${f.status === 'planted' ? '已埋设' : '推进中'}] ${f.description}${f.targetChapter !== undefined ? `（预计 ${f.targetChapter} 章回收）` : ''}`)
    }
  }
  const lines = (project.plotlines ?? []).filter(l => l.status === 'active' || l.status === 'paused')
  if (lines.length > 0) {
    const kindName = { main: '主线', branch: '支线', character: '人物线', mystery: '悬念线' }
    sections.push('==================== 剧情线（本章应推进至少一条活跃线） ====================')
    for (const l of lines) {
      sections.push(`- [${kindName[l.kind]}${l.status === 'paused' ? '·暂停中' : ''}] ${l.name}：${l.goal}${l.progress !== '' ? `（当前进度：${l.progress}）` : ''}`)
    }
  }
  sections.push('')
  sections.push('写作硬性要求：')
  sections.push('1. 每章 3000-4000 字（按中文字符计），只输出章节正文，不要输出标题、章回名、作者的话或任何 Markdown 标记。')
  sections.push('2. 以主角视角展开，动作、对话、心理描写交替推进，禁止大段设定说明。')
  sections.push('3. 尊重大纲与设定圣经：人设不崩、金手指规则不自相矛盾、战力不随意膨胀。')
  sections.push('4. 章末留一个钩子（悬念、反转或新线索），吸引读者读下一章。')
  sections.push('5. 语言流畅自然，符合中文网文语感，避免翻译腔与病句。')
  sections.push('6. 对话与冲突密度：每章至少 1 处实质对话或正面对抗/交锋场面；推理与心理活动必须用动作、环境细节、微表情、对话呈现，禁止整章纯内心独白铺陈（禁止"解说式"交代线索）。')
  sections.push('7. 反派与对手的行动力：本章出现的反派/对手必须有其行动、反制或压迫感（布局、试探、追索、交锋至少占其一），不得作为纯背景板存在。')
  sections.push('8. 配角辨识度：重要新登场配角应给姓名或可辨识的独有特征；禁止通篇用"瘦高个/灰衣人/戴面具者"等身形标签代称同一角色。')
  sections.push('9. 信息呈现方式：关键线索、设定、局势通过对话、动作、发现物呈现，禁止主角内心"讲解"给读者听。')
  sections.push('')
  sections.push('==================== 内容合规红线（平台硬性要求，最高优先级，违反即失败） ====================')
  sections.push(COMPLIANCE_REDLINES.join('\n'))
  sections.push('以上九条为硬性底线，任何情况下不得以任何形式出现或影射；若剧情确需涉及（如批判、反讽），只能以明确否定、揭露、批判的立场呈现，且不得展开细节。')
  return sections.join('\n')
}

/**
 * Plan chapters from an outline (optionally for one volume).
 */
export async function planChapters(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  chapterCount: number,
  volumeNo?: number,
  outputDir?: string,
): Promise<ChapterPlan[]> {
  const volume = project.volumes?.find(v => v.no === volumeNo)
  const existing = project.chapters
  const startNo = existing.length === 0 ? 1 : Math.max(...existing.map(c => c.no)) + 1
  const continuation = existing.length > 0
  const latestFacts = continuation && Array.isArray(project.facts)
    ? project.facts.slice(-15).map(f => `[第${f.chapterNo}章] ${f.text.slice(0, 150)}`).join('\n')
    : ''
  // 上一章（已写章节中章号最大者）结尾原文，作为续写剧情起点。
  let prevTail = ''
  if (continuation) {
    const written = existing.filter(c => c.status !== 'pending')
    const last = written[written.length - 1]
    if (last !== undefined && last.file !== undefined && outputDir !== undefined) {
      try {
        const raw = readFileSync(join(outputDir, last.file), 'utf8')
        prevTail = raw.replace(/^#.*$/m, '').trim().slice(-600)
      } catch { /* 文件缺失时忽略，仅依赖编年录 */ }
    }
  }
  // 续写模式下大纲截断到「关键剧情桥段」之前：只保留设定（人设/金手指/规则/战力），
  // 去掉分卷主线步骤模板，避免模型照抄已完成的剧情再走一遍。
  const outlineBlock = continuation
    ? (() => {
        const cut = project.outline.indexOf('七、关键剧情桥段')
        if (cut > 1500) return project.outline.slice(0, cut).trimEnd() + '\n（大纲后续剧情桥段与分卷细节从略；续写请以「上一章结尾原文」与「最新剧情状态」为剧情起点）'
        return project.outline.slice(0, 3000) + '\n…（大纲过长已节选）'
      })()
    : project.outline
  const user = [
    '请为下面这部小说规划章节。',
    volume !== undefined
      ? `本次只规划第 ${volume.no} 卷《${volume.title}》的章节：\n${volume.summary}`
      : continuation
        ? `本书已有 ${existing.length} 章已规划/已写作（见下方「已有章节」）。请规划**后续**章节：从第 ${startNo} 章开始。`
        : '请规划全书开篇章节。',
    continuation
      ? '【续写硬性要求】已有章节的剧情不得重写或重复，章节标题也不得与已有章节重复。以下情节均已在已有章节中发生过，后续章节**绝对不得再次出现**：穿越、暴雨送餐、滴血认主/古玉认主、首次进入墟境、用废铁淬炼首件法器、绝境肉身入鼎洗炼（该机缘已用尽）、杀死白袍弟子与灰衣随从、藏尸水沟。'
      : '',
    prevTail !== ''
      ? `【上一章（第 ${startNo - 1} 章）结尾原文】第 ${startNo} 章必须紧接此状态继续，从新的事件写起，不得回顾重述：\n${prevTail}`
      : '',
    latestFacts !== ''
      ? `【最新剧情状态（本书编年录，第 ${startNo - 1} 章结尾的事实）】规划续写时必须以此为起点，时间线、人物状态与地点衔接一致：\n${latestFacts}`
      : '',
    continuation
      ? '已有章节：\n'
        + existing.map(c => {
            const sm = c.summary !== undefined && c.summary !== '' ? `（${c.summary.slice(0, 120)}）` : ''
            return `第${c.no}章《${c.title}》${sm}`
          }).join('\n')
      : '',
    `全书大纲（设定参考，续写剧情不得与设定冲突）：\n${outlineBlock}`,
    '',
    `请规划 ${chapterCount} 章。输出 JSON 数组（不要输出其他文字）：`,
  ].join('\n')
  const system = planSystemPrompt(project.volumes) + (continuation
    ? '\n重要：本次是**续写规划**——已有章节的剧情不得重写或重复，新章节标题不得与已有章节标题相同，新章节的剧情必须从上一章结尾自然接续（人物状态、时间线、地点衔接一致）。'
    : '')
  const text = await complete(ctx, config, { system, user, temperature: 0.7, maxTokens: Math.max(config.maxTokens, 40000) })
  const parsed = parseJsonArray<Record<string, unknown>>(text)
  const chapters: ChapterPlan[] = []
  const existingNos = new Set(existing.map(c => c.no))
  const existingTitles = new Set(existing.map(c => c.title))
  let cursor = startNo
  for (const item of parsed) {
    if (chapters.length >= chapterCount) break
    if (typeof item !== 'object' || item === null) continue
    const entry = item as Record<string, unknown>
    const title = typeof entry.title === 'string' ? entry.title.trim().slice(0, 30) : ''
    const beats = typeof entry.beats === 'string' ? entry.beats.trim() : ''
    if (title === '' && beats === '') continue
    // 续写模式下，标题与已有章节重复的一律丢弃（模型可能复述旧章节）。
    if (title !== '' && existingTitles.has(title)) continue
    while (existingNos.has(cursor)) cursor++
    const no = cursor++
    chapters.push({
      no,
      volume: volumeOf(no, project.volumes),
      title: title || `第${no}章`,
      beats,
      targetChars: config.chapterChars,
      status: 'pending',
    })
  }
  if (chapters.length === 0) {
    throw new Error('章节计划生成失败：模型没有返回有效章节')
  }
  return chapters
}

// ------------------------------------------------------------------ writing

/** The review system prompt. */
function reviewSystemPrompt(project: ProjectState): string {
  const bible = project.bible
  const sections: string[] = [
    '你是一位严格的网文审稿编辑。你会收到一章正文以及本书的设定圣经与红线。',
    '请从以下维度审查本章：',
    '1. 人设一致性：角色行为是否符合角色卡（主角不圣母、不无脑、痞坏有分寸等）。',
    '2. 设定一致性：金手指规则、战力体系、世界观是否与设定圣经冲突。',
    '3. 红线检查：是否触犯写作红线（无后宫、无擦边、无无脑碾压等）。',
    '4. 文笔质量：语病、翻译腔、AI 套话（"不禁""仿佛""一时间"等高频词滥用）、流水账。',
    '5. 节奏与爽点：本章是否有推进、有钩子，是否拖沓灌水。',
    '6. 逻辑漏洞：前后矛盾、时间线错误、对话失真。',
    '7. 反 AI 规则：逐条核对下方「反 AI 规则」清单，命中即列为问题。',
    '8. 呈现方式：整章是否纯内心推理铺陈（无对话/无对抗，推理全靠解说）；反派是否纯背景板无行动；重要配角是否无名标签化（瘦高个/灰衣人全程代称）——命中即列为问题。',
    '9. 内容合规（最高优先级）：逐条核对下方「内容合规红线」，任何一条命中（含影射、暗示、详细描写）必须列为 high，并给出改写建议。',
    '输出必须是合法 JSON 对象，不要输出任何其他文字：',
    '{"score": 0-100的整数, "verdict": "一句话总评", "issues": [{"severity": "high|medium|low", "item": "问题描述", "suggestion": "修改建议"}]}',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ]
  const assetsBlock = renderAllAssets(project.assets)
  if (assetsBlock !== '') sections.push('\n' + assetsBlock)
  if (bible !== undefined) {
    sections.push('\n==================== 设定圣经 ====================')
    if (bible.worldRules.length > 0) sections.push('世界规则：\n' + bible.worldRules.map(r => `- ${r}`).join('\n'))
    if (bible.characters.length > 0) {
      sections.push('角色卡：')
      for (const card of bible.characters) {
        sections.push(`- ${card.name}（${card.role}）：${card.traits.join('、')}`)
        if (Array.isArray(card.knowledge) && card.knowledge.length > 0) {
          sections.push(`  该角色知道：${card.knowledge.join('；')}（未列出的信息该角色不知道）`)
        }
      }
    }
    if (bible.redLines.length > 0) sections.push('红线：\n' + bible.redLines.map(r => `- ${r}`).join('\n'))
  }
  sections.push('\n==================== 内容合规红线（平台硬性要求，最高优先级） ====================')
  sections.push(COMPLIANCE_REDLINES.join('\n'))
  sections.push('以上九条为硬性底线：正文中任何一条命中（含影射、暗示、详细展开）都必须列为 high，并给出改写建议；作者自定义红线不得豁免这九条。')
  return sections.join('\n')
}

/** Run the AI review on one chapter. */
export async function reviewChapter(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): Promise<ReviewReport> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) throw new Error(`章节 ${chapterNo} 的正文文件不存在`)
  const user = [
    `本章标题：《${chapter.title}》`,
    `本章剧情要点：${chapter.beats}`,
    '==================== 章节正文 ====================',
    body.replace(/^#\s+.*$/m, '').trim(),
  ].join('\n')
  const text = await complete(ctx, config, { system: reviewSystemPrompt(project), user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 16000) })
  const raw = parseJsonObject<{ score?: unknown; verdict?: unknown; issues?: unknown }>(text)
  const issues = Array.isArray(raw.issues)
    ? raw.issues
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
        .map(entry => ({
          severity: (['high', 'medium', 'low'] as const).includes(entry.severity as never)
            ? entry.severity as 'high' | 'medium' | 'low'
            : 'medium',
          item: typeof entry.item === 'string' ? entry.item : '',
          suggestion: typeof entry.suggestion === 'string' ? entry.suggestion : '',
        }))
        .filter(issue => issue.item !== '')
    : []
  const score = typeof raw.score === 'number' ? Math.max(0, Math.min(100, Math.round(raw.score))) : 60
  const report: ReviewReport = {
    score,
    passed: score >= config.reviewPassScore,
    verdict: typeof raw.verdict === 'string' ? raw.verdict.slice(0, 200) : '',
    issues,
    reviewedAt: new Date().toISOString(),
  }
  chapter.review = report
  chapter.status = report.passed ? 'approved' : 'rejected'
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
  return report
}

/**
 * 审查「任意正文文本」（作者手动编辑后的草稿，不落盘）。
 * 复用审稿提示词与红线/道藏/反AI规则；仅返回报告，不改文件不改状态。
 */
export async function reviewChapterText(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  text: string,
  previousReport?: ReviewReport,
): Promise<ReviewReport> {
  const user = [
    `书名：《${project.bookName}》`,
    previousReport !== undefined
      ? '==================== 上一轮审稿意见（逐条核对是否已解决） ====================\n'
        + previousReport.issues.map((it, i) => `${i + 1}. [${it.severity}] ${it.item}${it.suggestion !== '' ? ` → ${it.suggestion}` : ''}`).join('\n')
      : '',
    previousReport !== undefined
      ? '==================== 修订稿（上一轮审稿后按意见修订的正文） ===================='
      : '==================== 待审查正文 ====================',
    text.slice(0, 20000),
  ].join('\n')
  // 验证模式：携带上一轮报告时，逐条核对原意见是否解决 + 只挑新增 high，不再全新找茬。
  const system = previousReport !== undefined ? verifySystemPrompt(project) : reviewSystemPrompt(project)
  const raw = parseJsonObject<{ score?: unknown; verdict?: unknown; issues?: unknown }>(
    await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 16000) }),
  )
  const issues = Array.isArray(raw.issues)
    ? raw.issues
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
        .map(entry => ({
          severity: (['high', 'medium', 'low'] as const).includes(entry.severity as never)
            ? entry.severity as 'high' | 'medium' | 'low'
            : 'medium',
          item: typeof entry.item === 'string' ? entry.item : '',
          suggestion: typeof entry.suggestion === 'string' ? entry.suggestion : '',
        }))
        .filter(issue => issue.item !== '')
    : []
  const score = typeof raw.score === 'number' ? Math.max(0, Math.min(100, Math.round(raw.score))) : 60
  // 验证模式判定：原 high 全部解决 + 无新增 high → 通过（主观项不再卡修订）。
  let passed = score >= config.reviewPassScore
  if (previousReport !== undefined) {
    const hasHigh = issues.some(i => i.severity === 'high')
    const prevHigh = previousReport.issues.filter(i => i.severity === 'high')
    const prevHighResolved = prevHigh.every(p => !issues.some(i => i.item.includes(p.item.slice(0, 12))))
    passed = !hasHigh && prevHighResolved
  }
  return {
    score,
    passed,
    verdict: typeof raw.verdict === 'string' ? raw.verdict.slice(0, 200) : '',
    issues,
    reviewedAt: new Date().toISOString(),
  }
}

/** 验证模式系统提示：修订后逐条核对原意见是否解决，只挑新增 high，不重复挑剔主观项。 */
function verifySystemPrompt(project: ProjectState): string {
  return [
    '你是一位网文审稿验证员。作者已按上一轮审稿意见修订了本章，你需要验证修订效果。',
    '你的任务（严格按此执行）：',
    '1. 逐条核对「上一轮意见」中的每一条是否已在修订稿中解决——已解决的不再列出；未解决或部分解决的，按原严重度列出（item 需注明"未解决：原意见 xxx"）。',
    '2. 只挑修订【新引入】的 high 级问题（设定矛盾/逻辑硬伤/事实错误）——新引入的 medium/low 主观项（文笔/套话/节奏）不要列。',
    '3. 禁止重复挑剔上一轮已指出且本次已解决的主观项（如"缓缓/微微"等套话、错别字）——即使换个说法再提也不行。',
    '4. 严禁为了显得专业而新增"换一批毛病"式的意见；如果修订稿已解决全部 high 且无新增 high，输出 issues 为空数组。',
    'score 评分：按修订稿整体质量给 50-90 分（解决全部 high 且无新增 high 时给 70 以上）。',
    'verdict：一句话结论（如"原 high 已解决，无新增高风险问题"或"仍有未解决的 high"）。',
    '输出必须是合法 JSON 对象：{"score": 数字, "verdict": "一句话", "issues": [{"severity": "high|medium|low", "item": "问题", "suggestion": "建议"}]}',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
    `本书设定圣经（核对设定冲突用）：\n${project.bible !== undefined ? JSON.stringify(project.bible).slice(0, 3000) : '（无）'}`,
  ].join('\n')
}

/** Build the author-review system prompt (narrative structure, not prose). */
function authorReviewSystemPrompt(): string {
  return [
    '你是一位网文作者复盘助手。你会收到：本章正文、上一章结尾（钩子）、上一章作者复盘（如有）、活跃剧情线与编年录近期事实。',
    '请从叙事结构层面复盘本章（不评文笔，那是审稿的事）：',
    '1. hookHonored：上一章结尾的钩子/悬念是否在本章兑现或推进（true/false）。',
    '2. hookNote：钩子兑现情况一句话；未兑现时说明并给出"建议在第几章补"的建议。',
    '3. endingHook：本章结尾钩子强度，0-10 的整数（低于 6 说明结尾平淡，读者可能不想看下一章）。',
    '4. plotlineProgress：本章推进了哪条剧情线（主线/支线名），或"无实质推进"（连续无推进要提醒）。',
    '5. advancedLines：本章实际推进的剧情线名称数组——从「活跃剧情线」清单中选出推进了的线（名称必须与清单中的线名一字不差；没推进任何线则输出空数组）。',
    '6. continuity：与上一章结尾的衔接检查（人物位置/时间/伤势/资源/对话状态），发现问题要指出。',
    '7. trend：结合上一章复盘看近期节奏趋势（是否连续拖沓、爽点密度是否下降、是否需要调整）。',
    '输出必须是合法 JSON 对象，不要输出任何其他文字：',
    '{"hookHonored": true或false, "hookNote": "一句话", "endingHook": 0-10整数, "plotlineProgress": "一句话", "advancedLines": ["线名"], "continuity": "一句话", "trend": "一句话"}',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ].join('\n')
}

/** 作者复盘：对一章做叙事结构复盘（钩子兑现/结尾钩子/推进/连续性/趋势）。 */
export async function authorReviewChapter(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  chapterNo: number,
  body: string,
  prevTail: string,
): Promise<AuthorReview> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  const prevChapter = chapterNo > 1 ? project.chapters.find(c => c.no === chapterNo - 1) : undefined
  const lines = (project.plotlines ?? []).filter(l => l.status === 'active' || l.status === 'paused')
  const facts = (project.facts ?? []).slice(-10)
  const user = [
    `书名：《${project.bookName}》`,
    chapter !== undefined ? `本章：第 ${chapter.no} 章《${chapter.title}》` : `本章：第 ${chapterNo} 章`,
    prevTail !== ''
      ? `==================== 上一章（第 ${chapterNo - 1} 章）结尾（钩子） ====================\n${prevTail}`
      : '（本书第一章，无上一章钩子；hookHonored 视为 true，hookNote 写"开篇无前置钩子"）',
    prevChapter?.authorReview !== undefined
      ? `==================== 上一章作者复盘 ====================\n${JSON.stringify(prevChapter.authorReview)}`
      : '',
    lines.length > 0
      ? `==================== 活跃剧情线 ====================\n${lines.map(l => `- [${l.kind}] ${l.name}：${l.goal}${l.progress !== '' ? `（${l.progress}）` : ''}`).join('\n')}`
      : '',
    facts.length > 0
      ? `==================== 编年录近期事实 ====================\n${facts.map(f => `[第${f.chapterNo}章] ${f.text}`).join('\n')}`
      : '',
    '==================== 本章正文 ====================',
    body.slice(0, 16000),
    '',
    '只输出 JSON 对象。',
  ].join('\n')
  const raw = parseJsonObject<{
    hookHonored?: unknown
    hookNote?: unknown
    endingHook?: unknown
    plotlineProgress?: unknown
    advancedLines?: unknown
    continuity?: unknown
    trend?: unknown
  }>(
    await complete(ctx, config, { system: authorReviewSystemPrompt(), user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 4000) }),
  )
  // 解析推进的线名（与项目线名精确匹配；过滤不存在的名字）。
  const knownLineNames = new Set((project.plotlines ?? []).map(l => l.name))
  const advancedLines = Array.isArray(raw.advancedLines)
    ? raw.advancedLines.filter((n): n is string => typeof n === 'string' && n.trim() !== '' && knownLineNames.has(n.trim())).map(n => n.trim())
    : []
  return {
    hookHonored: raw.hookHonored === true,
    hookNote: typeof raw.hookNote === 'string' ? raw.hookNote.slice(0, 200) : '',
    endingHook: typeof raw.endingHook === 'number' ? Math.max(0, Math.min(10, Math.round(raw.endingHook))) : 5,
    plotlineProgress: typeof raw.plotlineProgress === 'string' ? raw.plotlineProgress.slice(0, 200) : '',
    advancedLines,
    continuity: typeof raw.continuity === 'string' ? raw.continuity.slice(0, 200) : '',
    trend: typeof raw.trend === 'string' ? raw.trend.slice(0, 200) : '',
    reviewedAt: new Date().toISOString(),
  }
}

/** 复盘后自动关联：把本章号写入复盘标记推进的剧情线（按名称匹配，去重）。 */
export function autoLinkPlotlines(project: ProjectState, chapterNo: number, advancedLines: string[]): void {
  if (!Array.isArray(project.plotlines) || advancedLines.length === 0) return
  for (const line of project.plotlines) {
    if (advancedLines.includes(line.name) && !line.chapters.includes(chapterNo)) {
      line.chapters.push(chapterNo)
    }
  }
}

/** AI 建议剧情线：基于大纲/卷计划/已写章节/编年录，提炼候选线。 */
export async function suggestPlotlines(ctx: Context, config: NovelConfig, project: ProjectState): Promise<Plotline[]> {
  const system = [
    '你是一位网文剧情架构师。根据本书的大纲、卷计划、已写章节标题与编年录，为作者提炼建议的剧情线（主线/支线/人物线/悬念线）。',
    '每条线要：名称简洁有力；目标写清楚这条线最终要完成什么；progress 写当前推进到哪（没有就空字符串）。',
    '建议 4-8 条，覆盖：1 条主线、1-2 条人物线、1-2 条悬念线、1-3 条支线。避免与大纲明显重复的废话线。',
    '输出必须是合法 JSON 数组，格式：[{"name": "线名", "kind": "main|branch|character|mystery", "goal": "目标", "progress": ""}]',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ].join('\n')
  const written = project.chapters.filter(c => c.status !== 'pending')
  const user = [
    `书名：《${project.bookName}》`,
    `大纲（节选前 4000 字）：\n${project.outline.slice(0, 4000)}`,
    project.volumes !== undefined && project.volumes.length > 0
      ? `卷计划：\n${project.volumes.map(v => `第${v.no}卷《${v.title}》：${v.summary}`).join('\n')}`
      : '',
    written.length > 0
      ? `已写章节：\n${written.map(c => `第${c.no}章《${c.title}》${c.summary !== undefined && c.summary !== '' ? `：${c.summary.slice(0, 80)}` : ''}`).join('\n')}`
      : '',
    (project.facts ?? []).length > 0
      ? `编年录近期事实（最近 15 条）：\n${(project.facts ?? []).slice(-15).map(f => `[第${f.chapterNo}章] ${f.text.slice(0, 100)}`).join('\n')}`
      : '',
    '只输出 JSON 数组。',
  ].join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.6, maxTokens: Math.max(config.maxTokens, 4000) })
  const raw = parseJsonArray<Record<string, unknown>>(text)
  const lines: Plotline[] = []
  const kinds = new Set(['main', 'branch', 'character', 'mystery'])
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, 40) : ''
    if (name === '') continue
    lines.push({
      id: '',
      name,
      kind: kinds.has(entry.kind as string) ? entry.kind as Plotline['kind'] : 'branch',
      goal: typeof entry.goal === 'string' ? entry.goal.trim().slice(0, 300) : '',
      progress: typeof entry.progress === 'string' ? entry.progress.trim().slice(0, 300) : '',
      status: 'active',
      chapters: [],
      createdAt: new Date().toISOString(),
    })
  }
  return lines
}

/** AI 刷新单条剧情线的进度：结合编年录与各章摘要分析该线推进到哪。 */
export async function refreshPlotlineProgress(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  line: Plotline,
): Promise<string> {
  const system = [
    '你是一位网文剧情线管理员。请根据「剧情线信息」与「本书已写章节摘要/编年录」，判断这条线目前推进到了哪一步。',
    '输出一句话（30-60 字）：这条线当前的状态、最近一次推进发生在第几章、下一步可能的方向。如果这条线还没开始推进，明确说"尚未推进"。',
    '输出必须是合法 JSON 对象：{"progress": "一句话"}',
    '重要：不要输出任何其他文字。',
  ].join('\n')
  const written = project.chapters.filter(c => c.status !== 'pending' && (c.summary !== undefined && c.summary !== ''))
  const user = [
    `剧情线：${line.name}（${line.kind}）`,
    `目标：${line.goal}`,
    `已知进度：${line.progress !== '' ? line.progress : '（无）'}`,
    `已关联章节：${line.chapters.length > 0 ? line.chapters.map(n => `第${n}章`).join('、') : '（无）'}`,
    `章节摘要（最近 8 章）：\n${written.slice(-8).map(c => `第${c.no}章《${c.title}》：${c.summary!.slice(0, 120)}`).join('\n')}`,
    (project.facts ?? []).length > 0
      ? `编年录近期事实（最近 15 条）：\n${(project.facts ?? []).slice(-15).map(f => `[第${f.chapterNo}章] ${f.text.slice(0, 100)}`).join('\n')}`
      : '',
    '只输出 JSON 对象。',
  ].join('\n\n')
  const raw = parseJsonObject<{ progress?: unknown }>(
    await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 2000) }),
  )
  return typeof raw.progress === 'string' ? raw.progress.trim().slice(0, 300) : ''
}

/** ✨ AI 从全书提炼角色库：大纲 + 道藏 + 编年录 + 章节摘要 → 结构化角色清单。 */
export async function extractRoles(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
): Promise<RoleRecord[]> {
  const system = [
    '你是一位网文角色库管理员。请根据本书的大纲、设定、编年录与章节摘要，提炼完整的角色库。',
    '覆盖原则：所有在编年录/章节中实际出场或有名有姓的角色都应收录；无名的功能性人物（如"矮胖姑娘"）用其身份简称收录并标注。',
    '数量控制：最多输出 10 个角色，宁缺毋滥；路人级一次带过的不要收录。',
    '每个角色输出：',
    '1. name：角色名（或身份简称）。',
    '2. roleLabel：定位——protagonist=主角；female_lead=女主（唯一知己/感情线核心，无后宫前提下只此一位）；female_support=重要女配；support=普通配角；antagonist=反派；extra=路人/背景。',
    '3. identity：身份一句话（宗门/势力/血脉/职业）。',
    '4. traits：3-6 个性格标签。',
    '5. goals：目标与动机一句话。',
    '6. relations：关系网数组，格式["角色名（关系）", ...]。',
    '7. arc：成长线数组，格式["阶段：说明", ...]（如"出场：祭品身份"/"转折：祭祀被中断脱身"）。',
    '8. knowledge：该角色已经知道的关键信息（3-8 条），不知道的信息不要写进去。',
    '精简要求：identity 控制在 30 字内；traits 3-6 个短标签；goals 60 字内；relations 2-5 条；arc 2-4 条；knowledge 每条 40 字内。整体输出量要紧凑，避免冗长。',
    '重要：用户消息里列出的「已收录角色」绝不要再次输出——这些角色已经在角色库里，跳过它们，只提炼未收录的。',
    '输出必须是合法 JSON 数组，不要输出其他文字：[{"name":"...", "roleLabel":"...", "identity":"...", "traits":[...], "goals":"...", "relations":[...], "arc":[...], "knowledge":[...]}]',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ].join('\n')
  const written = project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating')
  const existingRoles = project.roles ?? []
  const user = [
    `书名：《${project.bookName}》`,
    existingRoles.length > 0
      ? `已收录角色（跳过，不要输出）：${existingRoles.map(r => r.name).join('、')}`
      : '',
    `大纲（节选前 3000 字）：\n${project.outline.slice(0, 3000)}`,
    project.bible !== undefined && project.bible.characters.length > 0
      ? `已有角色卡（补充信息）：\n${project.bible.characters.map(c => `- ${c.name}（${c.role}）：${c.traits.join('、')}${c.goals !== '' ? `；目标：${c.goals}` : ''}`).join('\n')}`
      : '',
    (project.facts ?? []).length > 0
      ? `编年录（最近 60 条）：\n${(project.facts ?? []).slice(-60).map(f => `[第${f.chapterNo}章] ${f.text.slice(0, 80)}`).join('\n')}`
      : '',
    written.length > 0
      ? `已写章节标题（${written.length} 章）：\n${written.map(c => `第${c.no}章《${c.title}》`).join('、')}`
      : '',
    '只输出 JSON 数组。',
  ].join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 24000) })
  const raw = parseJsonArray<Record<string, unknown>>(text)
  const labels = new Set(['protagonist', 'female_lead', 'female_support', 'support', 'antagonist', 'extra'])
  const strArr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
  const roles: RoleRecord[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, 30) : ''
    if (name === '') continue
    roles.push({
      name,
      roleLabel: labels.has(entry.roleLabel as string) ? entry.roleLabel as RoleRecord['roleLabel'] : 'support',
      identity: typeof entry.identity === 'string' ? entry.identity.slice(0, 100) : '',
      traits: strArr(entry.traits).map(t => t.slice(0, 20)).slice(0, 8),
      goals: typeof entry.goals === 'string' ? entry.goals.slice(0, 200) : '',
      relations: strArr(entry.relations).map(r => r.slice(0, 60)).slice(0, 10),
      arc: strArr(entry.arc).map(a => a.slice(0, 120)).slice(0, 10),
      knowledge: strArr(entry.knowledge).map(k => k.slice(0, 120)).slice(0, 12),
    })
  }
  return roles
}

/** 动漫形象描述词（中文描述 + 英文 booru 标签 + 关键外貌标签）。 */
export interface RoleVisualPrompt {
  zh: string
  en: string
  tags: string[]
  source: string
}

/**
 * 为单个角色提炼「动漫形象描述词」：扫描该角色出场的已写章节正文，
 * 截取含外貌描写的段落，交给 LLM 提炼中文描述 + 英文绘图标签。
 */
export async function extractRoleVisual(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  roleName: string,
): Promise<RoleVisualPrompt> {
  const role = (project.roles ?? []).find(r => r.name === roleName)
  if (role === undefined) throw new Error(`角色「${roleName}」不在角色库中`)

  // 1. 扫描正文：收集该角色出场且可能含外貌描写的段落（最近 60 章内，每章最多 2 段，共 12 段）。
  const appearanceHints = /(发|眉|眼|眸|脸|肤|唇|身材|身高|衣|袍|裙|衫|靴|腰带|气质|模样|长相|容貌|披|束|扎|戴|佩|挂|绣|青|白|黑|红|蓝|紫|灰|银|金|少年|青年|少女|汉子|老者|中年|纤细|挺拔|瘦削|壮实|清秀|俊朗|英气|阴鸷|慈眉)/
  const excerpts: Array<{ no: number; text: string }> = []
  const written = project.chapters
    .filter(c => c.status !== 'pending' && c.status !== 'generating' && c.file !== undefined)
    .slice(-60)
  for (const chapter of written) {
    const body = readChapterFile(outputDir, chapter)
    if (body === undefined) continue
    const paras = body.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0)
    let perChapter = 0
    for (const para of paras) {
      if (perChapter >= 2 || excerpts.length >= 12) break
      if (!para.includes(roleName)) continue
      // 优先外貌描写段（含外貌关键词），否则纯动作段也收（LLM 自己判断）。
      if (appearanceHints.test(para) || excerpts.length < 4) {
        excerpts.push({ no: chapter.no, text: para.slice(0, 220) })
        perChapter++
      }
    }
    if (excerpts.length >= 12) break
  }
  if (excerpts.length === 0) {
    throw new Error(`正文中未找到「${roleName}」的出场描写（仅搜索最近 60 章），请确认角色名与正文一致`)
  }

  // 2. LLM 提炼。
  const system = [
    '你是一位动漫角色设定师。根据网文正文中该角色的实际外貌描写，提炼「动漫形象描述词」，用于 AI 绘图（NovelAI / Stable Diffusion / Midjourney / 豆包等）生成一致的角色立绘。',
    '硬性要求（依据优先）：',
    '1. 发色/发型/瞳色/服装/气质/标志物必须来自提供的正文段落，不得凭空发明。',
    '2. 正文未明确写到的项目（如瞳色没写），用「未定」标注，不要编造。',
    '3. 服装优先取正文明确出现的（颜色+款式），多次出现取最常穿的组合。',
    '输出三个部分：',
    '- zh：中文外貌描述，一段连贯文字（60-150 字）：发色发型、瞳色、脸型气质、服装（颜色款式）、身材、标志性物件。',
    '- en：英文绘图标签，booru 风格、逗号分隔、小写，30-50 个标签：含性别（1boy/1girl）、发色、发型、瞳色、服装（如 chinese hanfu / daoist robe）、气质、背景无关项。不要输出负面提示词。',
    '- tags：中文关键标签数组，5-10 个（如 ["黑发","束发","青色道袍","清秀","腰悬古玉"]）。',
    '- source：说明依据（如"第1章/第8章外貌描写；瞳色未明确"）。',
    '输出必须是合法 JSON 对象：{"zh": "...", "en": "...", "tags": [...], "source": "..."}',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ].join('\n')
  const user = [
    `书名：《${project.bookName}》`,
    `目标角色：${role.name}（${role.identity}）`,
    role.traits.length > 0 ? `性格标签：${role.traits.join('、')}` : '',
    `正文出场描写（含外貌线索的段落）：`,
    ...excerpts.map(e => `[第${e.no}章] ${e.text}`),
    '只输出 JSON 对象。',
  ].join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.4, maxTokens: Math.max(config.maxTokens, 4000) })
  const raw = parseJsonObject<{ zh?: unknown; en?: unknown; tags?: unknown; source?: unknown }>(text)
  const zh = typeof raw.zh === 'string' ? raw.zh.trim().slice(0, 500) : ''
  const en = typeof raw.en === 'string' ? raw.en.trim().slice(0, 1500) : ''
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t): t is string => typeof t === 'string' && t.trim() !== '').map(t => t.trim().slice(0, 20)).slice(0, 12)
    : []
  const source = typeof raw.source === 'string' ? raw.source.trim().slice(0, 300) : ''
  if (zh === '' || en === '') {
    throw new Error('形象描述提炼失败：LLM 未返回有效 JSON')
  }
  return { zh, en, tags, source }
}

/**
 * 开书想法 → AI 大纲：输入一句话想法，生成 2-3 个方向不同、可直接开书的完整大纲方案。
 * @param count 本次生成几个（默认 3，最多 3）
 * @param exclude 已暂留方案的剧情方向/卖点摘要（换批时避开，防止重复）
 */
export async function suggestOutlines(
  ctx: Context,
  config: NovelConfig,
  idea: string,
  count = 3,
  exclude: string[] = [],
): Promise<OutlineCandidate[]> {
  const n = Math.max(1, Math.min(3, Math.floor(count)))
  const system = [
    '你是一位资深网文策划。作者只给了一句「想法」，你需要把它扩展成 2-3 个【方向差异明显】的完整小说大纲方案，供作者挑选。',
    '每个方案必须满足：',
    '1. bookName：书名（6 字以内，抓眼球、点题）。',
    '2. genre：题材（如 仙侠修真 / 都市异能 / 玄幻 / 悬疑）。',
    '3. sellingPoint：核心卖点一句话（金手指/爽点/差异化，40 字内）。',
    '4. outline：完整大纲文本（至少 800 字，可直接作为开书大纲），结构包含：书名与题材、金手指/核心设定、主角人设与动机、主线剧情走向（至少 5 个阶段）、关键配角与势力、卖点与爽点设计、预计分卷（3-5 卷）。',
    '方向差异要求：',
    '- 方案之间的金手指/剧情走向必须明显不同（如：苟道发育流 vs 随身老爷爷流 vs 群像争霸流），不能只是换书名。',
    '- 忠实于作者想法的核心要素，但允许在不同方向上进行合理演绎。',
    '- 不输出任何与已列「需避开的方向」雷同的方案。',
    '输出必须是合法 JSON 数组，只输出数组本身：',
    '[{"id": "唯一id", "bookName": "...", "genre": "...", "sellingPoint": "...", "outline": "..."}]',
    `本次只输出 ${n} 个方案。`,
    '重要：所有字符串值内部不得包含换行符（大纲内部分段请用「。\n」或「；」自然断句），JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ].join('\n')
  const user = [
    `作者的想法：${idea}`,
    idea.trim().length < 40
      ? '作者的想法非常简短（可能只有一句）。请基于通用网文套路合理扩展补全：为每个方案自洽地设计金手指/核心设定、主角人设与动机、主线走向，使其成为完整可开书的大纲；不同方案的方向仍须明显差异。'
      : '',
    exclude.length > 0
      ? `需避开的已暂留方案方向（新方案不得与之雷同）：\n${exclude.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
      : '',
    `请生成 ${n} 个大纲方案。`,
    '只输出 JSON 数组。',
  ].join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.85, maxTokens: Math.max(config.maxTokens, 12000) })
  const parsed = parseJsonArray<Record<string, unknown>>(text)
  const candidates: OutlineCandidate[] = []
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue
    const bookName = typeof entry.bookName === 'string' ? entry.bookName.trim().slice(0, 30) : ''
    const outline = typeof entry.outline === 'string' ? entry.outline.trim() : ''
    if (bookName === '' || outline.length < 300) continue
    candidates.push({
      id: typeof entry.id === 'string' && entry.id !== '' ? entry.id : `oc-${Date.now().toString(36)}-${candidates.length}`,
      bookName,
      genre: typeof entry.genre === 'string' ? entry.genre.trim().slice(0, 20) : '',
      sellingPoint: typeof entry.sellingPoint === 'string' ? entry.sellingPoint.trim().slice(0, 120) : '',
      outline,
    })
  }
  if (candidates.length === 0) {
    throw new Error('大纲方案生成失败：LLM 未返回有效 JSON（可重试）')
  }
  return candidates.slice(0, n)
}

/** 拆书分析：对已写章节做结构/人物/文风/卖点四维体检。
 *  两阶段管道（借鉴 AI-Novel-Writing-Assistant）：
 *  ① 源片段笔记：每章抽取结构化笔记（剧情/人物/设定/写法/卖点/短板信号）
 *  ② 分节分析：按维度各跑一次 LLM，输出可读分析稿 + 结构化数据 + 证据链。
 *  @param scope 'recent'(默认最近20章) | 'volume:N' | 'all'
 *  @param preset 'quick'(总览/剧情/人物/文风) | 'standard'(+卖点)
 *  @param budgetTokens token 预算上限（超过即截断章节取样）。
 */
export async function breakdownBook(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  scope = 'recent',
  preset: 'quick' | 'standard' = 'quick',
  budgetTokens = 50000,
): Promise<BreakdownResponse> {
  // 1. 选章节范围。
  const written = project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating' && c.summary !== undefined && c.summary !== '')
  let selected = written
  if (scope === 'recent') selected = written.slice(-20)
  else if (/^volume:\d+$/.test(scope)) {
    const v = Number(scope.slice(7))
    selected = written.filter(c => c.volume === v)
  }
  if (selected.length === 0) throw new Error('没有可分析的已写章节（需要已生成并带摘要）')

  // 2. token 预算：估算每章正文+摘要成本，超预算则只取最近的章节。
  let budget = budgetTokens
  const chunks: Array<{ no: number; title: string; summary: string; body: string }> = []
  for (const c of selected.slice().reverse()) {
    const body = readChapterFile(outputDir, c) ?? ''
    // 粗估：每 4 字符 ≈ 1 token（中文），章节正文截 4000 字上限。
    const bodySlice = body.replace(/^#\s+.*$/m, '').trim().slice(0, 4000)
    const est = Math.ceil((bodySlice.length + (c.summary?.length ?? 0)) / 4) + 400
    if (est > budget && chunks.length > 0) break
    chunks.unshift({ no: c.no, title: c.title, summary: c.summary ?? '', body: bodySlice })
    budget -= est
  }

  // 3. 阶段一：源片段笔记（每章一次 LLM，串行控制 token）。
  const notes: string[] = []
  let usedTokens = 0
  const noteSystem = [
    '你是中文网文拆书助手。把单章正文整理成结构化笔记，供后续章节级分析复用。',
    '只输出 JSON 对象：',
    '{"summary": "1-2句", "plotPoints": ["..."], "characters": ["..."], "worldbuilding": ["..."], "styleTechniques": ["..."], "marketHighlights": ["..."], "weaknessSignals": ["..."]}',
    '硬规则：只提取正文明确出现的信息；每数组最多 4 项；不要补写原文外的动机/意图；evidence 不在此阶段输出。',
    '重要：直接输出 JSON，不要输出其他文字；字符串内不含换行。',
  ].join('\n')
  for (const ch of chunks) {
    const noteUser = [`第${ch.no}章《${ch.title}》`, '正文：', ch.body.slice(0, 3000)].join('\n')
    try {
      const text = await complete(ctx, config, { system: noteSystem, user: noteUser, temperature: 0.2, maxTokens: Math.max(config.maxTokens, 3000) })
      const raw = parseJsonObject<Record<string, unknown>>(text)
      const pick = (k: string): string[] => Array.isArray(raw[k]) ? raw[k].filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim().slice(0, 120)).slice(0, 4) : []
      notes.push(
        `【第${ch.no}章《${ch.title}》】\n`
        + `摘要：${typeof raw.summary === 'string' ? raw.summary.slice(0, 200) : ''}\n`
        + `剧情：${pick('plotPoints').join('；')}\n`
        + `人物：${pick('characters').join('；')}\n`
        + `设定：${pick('worldbuilding').join('；')}\n`
        + `写法：${pick('styleTechniques').join('；')}\n`
        + `卖点：${pick('marketHighlights').join('；')}\n`
        + `短板信号：${pick('weaknessSignals').join('；') || '（无明显短板信号）'}`,
      )
      usedTokens += 800
    } catch {
      // 单章笔记失败不致命——跳过继续。
    }
  }

  // 4. 阶段二：分节分析。
  const sectionsConfig: Array<{ key: string; title: string; focus: string; system: string }> = [
    {
      key: 'overview',
      title: '拆书总览',
      focus: '一句话定位、题材标签、整体优势与短板',
      system: [
        '你是资深中文网文拆书分析师，负责《拆书总览》小节。',
        '基于给定章节笔记做低风险综合判断，输出 JSON：{"markdown": "可直接展示的分析稿（简体中文，先给结论再说明体现在哪、为何成立）", "structured": {"oneLinePositioning": "一句话定位", "genreTags": ["题材标签"], "sellingPointTags": ["卖点标签"], "strengths": ["整体优势"], "weaknesses": ["整体短板"]}}',
        '硬规则：只基于笔记归纳；推断用「更偏向/可能」等谨慎措辞；证据不足写「材料不足」；不虚构原文细节。',
        '重要：直接输出 JSON，字符串内不含换行。',
      ].join('\n'),
    },
    {
      key: 'plot',
      title: '剧情结构',
      focus: '主线梗概、阶段推进、冲突升级、节奏风险',
      system: [
        '你是资深中文网文拆书分析师，负责《剧情结构》小节。',
        '基于给定章节笔记分析，输出 JSON：{"markdown": "分析稿（简体中文，先结论后依据）", "structured": {"mainlineSummary": "主线梗概", "phaseProgressions": ["阶段推进"], "escalationDesigns": ["冲突升级"], "paceRisks": ["节奏风险"], "reusablePatterns": ["可复用套路"]}}',
        '硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。',
        '重要：直接输出 JSON，字符串内不含换行。',
      ].join('\n'),
    },
    {
      key: 'character',
      title: '人物系统',
      focus: '主角定位、配角功能、关系网络、成长弧线、辨识度风险',
      system: [
        '你是资深中文网文拆书分析师，负责《人物系统》小节。',
        '基于给定章节笔记分析，输出 JSON：{"markdown": "分析稿（简体中文，先结论后依据）", "structured": {"protagonistPositioning": "主角定位", "supportingFunctions": ["配角功能"], "relationshipNetwork": ["关系网络"], "growthArcs": ["成长弧线"], "clarityRisks": ["辨识度风险"]}}',
        '硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。',
        '重要：直接输出 JSON，字符串内不含换行。',
      ].join('\n'),
    },
    {
      key: 'style',
      title: '文风与技法',
      focus: '叙事视角、语言风格、描写方式、节奏控制、钩子设计、可复用写法',
      system: [
        '你是资深中文网文拆书分析师，负责《文风与技法》小节。',
        '基于给定章节笔记分析，输出 JSON：{"markdown": "分析稿（简体中文，先结论后依据）", "structured": {"narrativePov": "叙事视角", "languageStyle": "语言风格", "dialoguePatterns": ["对话特征"], "rhythmControl": ["节奏控制"], "hookDesigns": ["钩子设计"], "reusableTechniques": ["可复用写法"]}}',
        '硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。',
        '重要：直接输出 JSON，字符串内不含换行。',
      ].join('\n'),
    },
  ]
  if (preset === 'standard') {
    sectionsConfig.push({
      key: 'market',
      title: '商业化卖点',
      focus: '读者爽点、点击驱动、人物/题材卖点、商业化风险',
      system: [
        '你是资深中文网文拆书分析师，负责《商业化卖点》小节。',
        '基于给定章节笔记分析，输出 JSON：{"markdown": "分析稿（简体中文，先结论后依据）", "structured": {"hookPoints": ["读者爽点"], "clickDrivers": ["点击驱动"], "characterSellingPoints": ["人物卖点"], "genreSellingPoints": ["题材卖点"], "commercialRisks": ["商业化风险"]}}',
        '硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。',
        '重要：直接输出 JSON，字符串内不含换行。',
      ].join('\n'),
    })
  }

  const notesText = notes.join('\n\n')
  const sections: BreakdownResponse['sections'] = []
  const evidence: BreakdownResponse['evidence'] = []
  for (const sec of sectionsConfig) {
    try {
      const text = await complete(ctx, config, {
        system: sec.system,
        user: `分析范围：${selected.length} 章（${scope === 'all' ? '全书' : scope === 'recent' ? '最近 20 章' : '指定卷'}）。\n\n章节笔记：\n${notesText}`,
        temperature: 0.3,
        maxTokens: Math.max(config.maxTokens, 6000),
      })
      const raw = parseJsonObject<{ markdown?: unknown; structured?: unknown }>(text)
      sections.push({
        key: sec.key,
        title: sec.title,
        markdown: typeof raw.markdown === 'string' ? raw.markdown.trim() : '（生成失败）',
        structured: typeof raw.structured === 'object' && raw.structured !== null ? raw.structured as Record<string, unknown> : {},
      })
      usedTokens += 2000
    } catch {
      sections.push({ key: sec.key, title: sec.title, markdown: '（本节生成失败，可重试）', structured: {} })
    }
  }

  return {
    sections,
    evidence,
    chaptersScanned: chunks.length,
    usedTokens,
  }
}

/**
 * 漫剧分镜生成：把一章正文改编为短视频漫剧分镜（吸收 manga-script-master 方法论）。
 * 产出：本集标题 + 赛道节奏说明 + 角色视觉锚点卡 + 分镜表（8-12 格）+ 结尾钩子。
 * 角色锚点优先复用角色库 imagePrompt（无则从正文提炼）。
 */
export async function generateStoryboard(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
  genre: string,
  platform: string,
  tool: string,
): Promise<StoryboardResponse> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) throw new Error(`章节 ${chapterNo} 尚未生成正文`)

  // 角色锚点：复用角色库 imagePrompt（优先）或章节内出场角色名。
  const roles = project.roles ?? []
  const roleCards = roles
    .filter(r => r.imagePrompt !== undefined && (body.includes(r.name) || chapter.summary?.includes(r.name) === true))
    .map(r => ({
      name: r.name,
      anchor: r.imagePrompt!.zh.slice(0, 120),
      tags: r.imagePrompt!.en.slice(0, 300),
    }))
    .slice(0, 3)

  const system = [
    '你是一位精通短视频算法与 AIGC 的顶级漫剧导演。把给定的一章网文改编为高完播率的漫剧分镜。',
    '硬性要求：',
    '1. 前 3 秒必须有强冲突或视觉冲击（黄金开局）；每 10 秒至少一个小高潮；结尾必须有悬念钩子。',
    '2. 所有情感必须具象化为动作（不能写"他很愤怒"，要写"他拳头砸碎桌角，碎片飞溅"）。',
    '3. 台词每句 ≤15 字，用画面推进叙事。',
    '4. 总时长 60-120 秒，分镜 8-12 格，每格标注时间码、景别、转场/动效。',
    '5. 输出 JSON：',
    '{"title": "本集标题（核心设定+冲突+悬念句式）", "pacingNote": "赛道判断与节奏说明（按爽文/甜宠/悬疑/搞笑模型）", "hook": "本集钩子一句话", "panels": [{"timecode": "0:00-0:03", "shot": "特写", "visual": "具象画面描述", "dialogue": "(情绪)台词", "transition": "硬切/闪白等", "prompt": "英文AI提示词：角色标签+表情+动作+场景+景别+光影+风格+9:16"}], "endingHook": "结尾钩子台词"}',
    '6. 英文 prompt 里的角色标签必须复用提供的角色锚点标签；多角色同框用 left/right/foreground 分隔。',
    '7. 严禁在提示词里出现文字/水印（画面内字幕后期加）。',
    '重要：直接输出 JSON，字符串内不含换行。',
  ].join('\n')

  const user = [
    `书名：《${project.bookName}》`,
    `章节：第 ${chapter.no} 章《${chapter.title}》`,
    chapter.summary !== undefined ? `章节摘要：${chapter.summary}` : '',
    `目标平台：${platform}（默认抖音竖屏 9:16）`,
    `赛道：${genre !== '' ? genre : '（由你按内容判断：爽文/甜宠/悬疑/搞笑）'}`,
    `AI 工具：${tool}（影响提示词格式）`,
    roleCards.length > 0
      ? `角色视觉锚点（英文标签全分镜强制复用）：\n${roleCards.map(r => `- ${r.name}：${r.tags}`).join('\n')}`
      : '（无角色锚点卡，从正文提炼 1-2 个核心角色并给出标签）',
    '==================== 正文 ====================',
    body.replace(/^#\s+.*$/m, '').trim().slice(0, 6000),
    '只输出 JSON 对象。',
  ].join('\n\n')

  const text = await complete(ctx, config, { system, user, temperature: 0.5, maxTokens: Math.max(config.maxTokens, 12000) })
  const raw = parseJsonObject<Record<string, unknown>>(text)
  const str = (v: unknown, fallback = ''): string => typeof v === 'string' ? v.trim() : fallback
  const panelsRaw = Array.isArray(raw.panels) ? raw.panels.filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null) : []
  const panels: StoryboardResponse['panels'] = panelsRaw
    .map((p, i) => ({
      index: i + 1,
      timecode: str(p.timecode, `0:${String(i * 10).padStart(2, '0')}`),
      shot: str(p.shot, '中景'),
      visual: str(p.visual),
      dialogue: str(p.dialogue),
      transition: str(p.transition, '硬切'),
      prompt: str(p.prompt),
    }))
    .filter(p => p.visual !== '')
    .slice(0, 12)

  return {
    title: str(raw.title, `第 ${chapter.no} 集`),
    pacingNote: str(raw.pacingNote, '（按内容判断赛道节奏）'),
    hook: str(raw.hook),
    characters: roleCards.map(r => ({
      name: r.name,
      visualAnchor: r.anchor,
      tags: r.tags,
      expressions: [],
    })),
    panels,
    endingHook: str(raw.endingHook),
  }
}

/**
 * 漫剧分集计划：AI 通读一卷的章节标题+摘要+beats，按故事弧线把章节分组为漫剧集。
 * 原则（吸收 manga-script 节奏模型）：高潮章单独成集、过渡章合并、断点选在钩子最强处。
 */
export async function planStoryboardEpisodes(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  volumeNo: number,
  platform: string,
  maxEpisodes: number,
): Promise<StoryboardPlanResponse> {
  const volume = project.volumes?.find(v => v.no === volumeNo)
  if (volume === undefined) throw new Error(`第 ${volumeNo} 卷不存在（卷计划未生成或卷号错误）`)
  const chapters = project.chapters
    .filter(c => c.volume === volumeNo && c.status !== 'pending' && c.status !== 'generating')
    .sort((a, b) => a.no - b.no)
  if (chapters.length === 0) throw new Error(`第 ${volumeNo} 卷没有已写章节`)

  // 每章给压缩摘要：标题 + beats 首段 + summary（限长）。
  const chapterBriefs = chapters.map(c => {
    const beatsHead = (c.beats ?? '').split('\n')[0] ?? ''
    return `第${c.no}章《${c.title}》｜${beatsHead.slice(0, 60)}｜${(c.summary ?? '').slice(0, 100)}`
  })

  const system = [
    '你是一位精通短视频算法与漫剧节奏的总导演。把给定的一卷网文改编为「漫剧分集计划」——不是按章分，而是按故事弧线分集。',
    '分集原则：',
    '1. 高潮章（大冲突/身份揭晓/大收获）单独成集或两章一集；过渡章（赶路/准备/日常）2-3 章合并为一集；支线穿插章并入相邻主线圈。',
    '2. 每集 60-120 秒 ≈ 1-2 章正文，但以"叙事任务完整"为准，不被章节号束缚。',
    '3. 断点选在钩子最强处：每集结尾必须留下让观众点下集的悬念。',
    '4. 全集数控制在 8 到上限之间（上限由输入给出），宁少勿碎。',
    '5. 卷的开局集要强（3 秒钩子），卷的结尾集要收束本卷弧线并埋下卷间钩子。',
    '输出 JSON：',
    '{"strategy": "本卷漫剧化策略一句话（赛道判断+整体节奏安排）", "episodes": [{"title": "集标题（冲突+悬念句式）", "chapters": [章号数组], "narrativeJob": "这集讲什么、为什么这么分（1-2句）", "openingHook": "开头3秒钩子", "endingHook": "结尾钩子"}]}',
    '硬性要求：episodes 按章号顺序排列且覆盖全部给定章节（不得遗漏）；chapters 数组必须连续（如 [81,82,83]）；每集 chapters 至少 1 章、最多 4 章；所有文字用简体中文。',
    '重要：直接输出 JSON，字符串内不含换行。',
  ].join('\n')

  const user = [
    `书名：《${project.bookName}》`,
    `第 ${volumeNo} 卷《${volume.title}》（${volume.chapterStart}-${volume.chapterEnd} 章）`,
    `卷定位：${volume.summary}`,
    `目标平台：${platform}（竖屏 9:16）`,
    `本卷已写章节（${chapters.length} 章，按序）：\n${chapterBriefs.join('\n')}`,
    `全集数上限：${maxEpisodes}`,
    '只输出 JSON 对象。',
  ].join('\n\n')

  const text = await complete(ctx, config, { system, user, temperature: 0.4, maxTokens: Math.max(config.maxTokens, 12000) })
  const raw = parseJsonObject<{ strategy?: unknown; episodes?: unknown }>(text)
  const episodesRaw = Array.isArray(raw.episodes) ? raw.episodes.filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null) : []
  const str = (v: unknown, fallback = ''): string => typeof v === 'string' ? v.trim() : fallback
  const episodes: StoryboardPlanResponse['episodes'] = []
  for (const e of episodesRaw) {
    const chaptersArr = Array.isArray(e.chapters) ? e.chapters.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0) : []
    if (chaptersArr.length === 0) continue
    episodes.push({
      index: episodes.length + 1,
      title: str(e.title, `第 ${episodes.length + 1} 集`),
      chapters: chaptersArr,
      narrativeJob: str(e.narrativeJob),
      openingHook: str(e.openingHook),
      endingHook: str(e.endingHook),
    })
  }
  if (episodes.length === 0) throw new Error('分集计划生成失败：LLM 未返回有效集数')

  return {
    strategy: str(raw.strategy, '（按内容判断赛道节奏）'),
    episodes,
    chaptersScanned: chapters.length,
  }
}

/** 🩺 剧情健康检查：基于已写章节数/各线状态/编年录，判断是否需要新线及添加时机。 */
export async function analyzePlotlineHealth(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
): Promise<PlotlineHealthReport> {
  const system = [
    '你是一位网文剧情架构师。请对本书的「剧情线体系」做健康检查，判断当前是否需要新增剧情线、应在多少章后添加。',
    '评估维度：各线最近推进到第几章（已写章节与关联章节的差值越大越危险）、各线状态、已写章节总数、卷计划当前进度、编年录近期事实。',
    '输出规则：',
    '1. verdict：一句话结论——"需要新增线" / "暂不需要" / "再写 N 章后需要"（N 给出具体章数）。',
    '2. timing：说明建议添加的时机（如：第 25 章前引入新支线，因为主线预计第 22 章告一段落）。',
    '3. reasons：3-5 条依据（引用具体数据：哪条线多少章没推进、已写章节数、卷进度等）。',
    '4. lines：对每条线给健康度——ok（近期推进过）/ warning（超过 5 章未推进）/ stale（超过 10 章未推进或悬置过久）。',
    '输出必须是合法 JSON 对象：{"verdict": "...", "timing": "...", "reasons": ["..."], "lines": [{"name": "线名", "health": "ok|warning|stale", "note": "一句说明"}]}',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ].join('\n')
  const written = project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating')
  const lines = (project.plotlines ?? []).filter(l => l.status === 'active' || l.status === 'paused')
  const user = [
    `书名：《${project.bookName}》`,
    `已写章节数：${written.length}（最新章号 ${written.length > 0 ? written[written.length - 1]!.no : 0}）`,
    project.volumes !== undefined && project.volumes.length > 0
      ? `卷计划：\n${project.volumes.map(v => `第${v.no}卷《${v.title}》（${v.chapterStart}-${v.chapterEnd}）：${v.summary.slice(0, 60)}`).join('\n')}`
      : '',
    `剧情线（${lines.length} 条）：\n${lines.length > 0
      ? lines.map(l => `- [${l.kind}] ${l.name}｜目标：${l.goal}｜进度：${l.progress !== '' ? l.progress : '未推进'}｜最近关联章节：${l.chapters.length > 0 ? '第' + Math.max(...l.chapters) + '章' : '无'}`).join('\n')
      : '（暂无剧情线）'}`,
    (project.facts ?? []).length > 0
      ? `编年录近期事实（最近 10 条）：\n${(project.facts ?? []).slice(-10).map(f => `[第${f.chapterNo}章] ${f.text.slice(0, 80)}`).join('\n')}`
      : '',
    '只输出 JSON 对象。',
  ].join('\n\n')
  const raw = parseJsonObject<{
    verdict?: unknown
    timing?: unknown
    reasons?: unknown
    lines?: unknown
  }>(await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 3000) }))
  const strArr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
  const lineArr = Array.isArray(raw.lines)
    ? raw.lines
        .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
        .map(entry => ({
          name: typeof entry.name === 'string' ? entry.name.slice(0, 40) : '',
          health: (['ok', 'warning', 'stale'] as const).includes(entry.health as never) ? entry.health as 'ok' | 'warning' | 'stale' : 'ok',
          note: typeof entry.note === 'string' ? entry.note.slice(0, 150) : '',
        }))
        .filter(x => x.name !== '')
    : []
  return {
    verdict: typeof raw.verdict === 'string' ? raw.verdict.slice(0, 100) : '',
    timing: typeof raw.timing === 'string' ? raw.timing.slice(0, 200) : '',
    reasons: strArr(raw.reasons).map(r => r.slice(0, 200)),
    lines: lineArr,
  }
}

/** ✨ AI 剧情方案：基于健康检查结果设计下一阶段方向与建议新线。 */
export async function designPlotlinePlan(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  health?: PlotlineHealthReport,
): Promise<PlotlinePlan> {
  const system = [
    '你是一位网文剧情架构师。请为本书设计「下一阶段的剧情方案」：给出未来 5-10 章的剧情方向，并建议 2-3 条值得新增的剧情线。',
    '要求：方向必须结合本书大纲/卷计划/现有线/编年录；新线要能落地（和当前主角处境、已有伏笔、下一阶段舞台相关），不得重复已有线。',
    '输出必须是合法 JSON 对象：{"direction": "下一阶段方向 60-120 字", "suggestions": [{"name": "线名", "kind": "main|branch|character|mystery", "goal": "目标", "progress": "初始进度（可空）"}]}',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    '重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。',
  ].join('\n')
  const written = project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating')
  const user = [
    `书名：《${project.bookName}》`,
    health !== undefined
      ? `健康检查结论：\n判定：${health.verdict}\n时机：${health.timing}\n依据：${health.reasons.join('；')}`
      : '',
    `大纲（节选前 3000 字）：\n${project.outline.slice(0, 3000)}`,
    project.volumes !== undefined && project.volumes.length > 0
      ? `卷计划：\n${project.volumes.map(v => `第${v.no}卷《${v.title}》：${v.summary.slice(0, 60)}`).join('\n')}`
      : '',
    `现有剧情线：\n${(project.plotlines ?? []).map(l => `- [${l.kind}${l.status === 'resolved' ? '·已完结' : ''}] ${l.name}：${l.goal}`).join('\n') || '（无）'}`,
    written.length > 0
      ? `最近写的章节：\n${written.slice(-5).map(c => `第${c.no}章《${c.title}》`).join('、')}`
      : '',
    '只输出 JSON 对象。',
  ].join('\n\n')
  const raw = parseJsonObject<{ direction?: unknown; suggestions?: unknown }>(
    await complete(ctx, config, { system, user, temperature: 0.6, maxTokens: Math.max(config.maxTokens, 3000) }),
  )
  const suggestions: Plotline[] = []
  const kinds = new Set(['main', 'branch', 'character', 'mystery'])
  if (Array.isArray(raw.suggestions)) {
    for (const entry of raw.suggestions) {
      if (typeof entry !== 'object' || entry === null) continue
      const e = entry as Record<string, unknown>
      const name = typeof e.name === 'string' ? e.name.trim().slice(0, 40) : ''
      if (name === '') continue
      suggestions.push({
        id: '',
        name,
        kind: kinds.has(e.kind as string) ? e.kind as Plotline['kind'] : 'branch',
        goal: typeof e.goal === 'string' ? e.goal.trim().slice(0, 300) : '',
        progress: typeof e.progress === 'string' ? e.progress.trim().slice(0, 300) : '',
        status: 'active',
        chapters: [],
        createdAt: new Date().toISOString(),
      })
    }
  }
  return {
    direction: typeof raw.direction === 'string' ? raw.direction.slice(0, 300) : '',
    suggestions,
  }
}

/** Build the rewrite system prompt (fix review issues / instructions). */
function rewriteSystemPrompt(project: ProjectState): string {
  const base = writeSystemPrompt(project)
  return base + '\n\n额外要求：你正在【修订】一章已写好的正文。保留原文中好的部分，只修改需要修改的地方，输出完整的新正文（不要只输出修改片段），字数与原文相当。'
}

/**
 * Stream a chapter rewrite. With `target` (a passage of the body), only that
 * passage's paragraph is rewritten and spliced back — everything else stays
 * untouched (local revision). Without `target`, the whole chapter is
 * rewritten. Yields delta text; persists when done.
 */
export async function* rewriteChapterStream(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
  instructions: string,
  target?: string,
): AsyncGenerator<{ frame: 'start' } | { frame: 'delta'; text: string } | { frame: 'drafted'; chars: number; draft: string }, void, unknown> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) throw new Error(`章节 ${chapterNo} 的正文文件不存在`)

  const reviewBlock = chapter.review !== undefined
    ? '审稿意见：\n' + chapter.review.issues.map(i => `[${i.severity}] ${i.item} → ${i.suggestion}`).join('\n')
    : ''

  // Local revision: find the paragraph containing `target` and only rewrite it.
  const bodyText = body.replace(/^#\s+.*$/m, '').trim()
  let localTarget: { paragraph: string; before: string; after: string } | undefined
  if (target !== undefined && target.trim() !== '') {
    const wanted = target.trim()
    // Normalize whitespace so multi-line / quoted snippets still match:
    // the assistant often copies a passage with line breaks and quotes.
    const normalize = (value: string): string => value.replace(/\s+/g, ' ').replace(/[“”"'‘’]/g, '')
    const wantedFlat = normalize(wanted)
    // Split into paragraphs on blank lines (or double newlines).
    const paragraphs = bodyText.split(/\n{2,}/)
    const idx = paragraphs.findIndex(p => normalize(p).includes(wantedFlat))
    if (idx === -1) {
      throw new Error(`在正文中未找到要修改的片段：「${wanted.slice(0, 40)}…」。请从正文中复制原文片段（无需整段，取片段即可）。`)
    }
    localTarget = {
      paragraph: paragraphs[idx]!,
      before: paragraphs.slice(0, idx).join('\n\n'),
      after: paragraphs.slice(idx + 1).join('\n\n'),
    }
  }

  const user = localTarget === undefined
    ? [
        `请修订第 ${chapter.no} 章《${chapter.title}》。`,
        reviewBlock,
        instructions !== '' ? `本次修订重点：${instructions}` : '',
        '==================== 原正文 ====================',
        bodyText,
      ].filter(line => line !== '').join('\n')
    : [
        `请修订第 ${chapter.no} 章《${chapter.title}》中的一个自然段。`,
        instructions !== '' ? `修改要求：${instructions}` : '',
        '==================== 需要修改的原文段落 ====================',
        localTarget.paragraph,
        '',
        '要求：',
        '1. 只输出修改后的【这一个段落】的完整新文本，不要输出任何说明、标题或 Markdown 标记。',
        '2. 保留该段的情节走向与角色口吻，只按修改要求调整。',
        '3. 段落长度与原文相当。',
      ].filter(line => line !== '').join('\n')

  const system = localTarget === undefined
    ? rewriteSystemPrompt(project)
    : '你是一位中文网文润色师。你会收到一章中的一个段落，请按修改要求重写该段。只输出新段落文本。'

  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: user }],
    source: { kind: 'plugin', plugin: 'dsh-novel-forge' },
  })]
  const request: GenerateOptions = {
    provider: config.provider,
    model: config.model,
    messages,
    system,
    // Rewriting outputs a full chapter: budget generously and skip
    // reasoning (a transform task) so the whole budget goes to the body.
    maxTokens: Math.max(config.maxTokens, 20000),
    temperature: 0.7,
    reasoningEffort: ReasoningEffortId('off'),
  }

  yield { frame: 'start' }
  const assembler = new BlockAssembler()
  let streamError: Error | undefined
  for await (const chunk of ctx.llm.stream(request)) {
    assembler.push(chunk)
    if (chunk.type === 'text-delta') yield { frame: 'delta', text: chunk.text }
  }
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    streamError = new Error(`修订失败（${finish.kind}）: ${finish.failure.message}`)
  } else if (finish.kind === 'max-tokens') {
    streamError = new Error('修订输出达到 maxTokens 上限，请增大配置后重试')
  }
  const rewritten = assembler
    .blocks()
    .filter((block): block is Extract<StreamChunk, { type: 'block-end' }>['block'] & { type: 'text' } => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
  if (streamError !== undefined) throw streamError
  if (rewritten.length < 20) throw new Error('修订结果过短，可能失败，请重试')

  // Splice: local -> replace the paragraph; whole -> replace the body.
  let newBody: string
  if (localTarget !== undefined) {
    newBody = [localTarget.before, rewritten, localTarget.after].filter(part => part !== '').join('\n\n')
  } else {
    newBody = rewritten
  }
  if (newBody.length < 100) throw new Error('修订结果过短，可能失败，请重试')

  // Draft mode: do NOT overwrite the file yet. Store the new body as a
  // pending draft; the user reviews the diff and decides to apply or
  // discard. File overwrite + status change happen on draft/apply.
  chapter.pendingDraft = newBody
  chapter.error = undefined
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
  yield { frame: 'drafted', chars: newBody.length, draft: newBody }
}

/** The de-AI-ify polish system prompt (with project writing assets injected). */
function polishSystemPrompt(project: ProjectState): string {
  const assetsBlock = renderAllAssets(project.assets)
  return [
    '你是一位中文网文润色师。你会收到一章正文，请做「去 AI 味」润色：',
    '1. 删除/替换 AI 高频套话与模式词：如"不禁""仿佛""一时间""不由得""顿时""然而""缓缓""轻轻""微微""默默""似乎""终于"等滥用。',
    '2. 把书面翻译腔改成口语化的中文网文语感。',
    '3. 拆分过长的排比句与堆砌的修饰语。',
    '4. 保留全部情节、人物、对话内容不变，只改表达。',
    '5. 输出完整的新正文，不要输出任何说明文字或 Markdown 标记。',
    '6. 必须遵守下方「反 AI 规则」与「写法资产」的表达边界；写法资产要求保留的风格特征（句式、台词、节奏）不得在润色中丢失。',
    assetsBlock !== '' ? assetsBlock : '',
  ].join('\n')
}

/** Stream a chapter polish (de-AI-ify). Draft-mode: the polished body lands
 *  in `chapter.pendingDraft` and is only applied on draft/apply. */
export async function* polishChapterStream(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): AsyncGenerator<{ frame: 'start' } | { frame: 'delta'; text: string } | { frame: 'drafted'; chars: number; draft: string }, void, unknown> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) throw new Error(`章节 ${chapterNo} 的正文文件不存在`)
  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: body.replace(/^#\s+.*$/m, '').trim() }],
    source: { kind: 'plugin', plugin: 'dsh-novel-forge' },
  })]
  const request: GenerateOptions = {
    provider: config.provider,
    model: config.model,
    messages,
    system: polishSystemPrompt(project),
    // Polish rewrites the whole chapter: generous budget, no reasoning
    // (transform task — the entire budget should go to the body).
    maxTokens: Math.max(config.maxTokens, 20000),
    temperature: 0.5,
    reasoningEffort: ReasoningEffortId('off'),
  }
  yield { frame: 'start' }
  const assembler = new BlockAssembler()
  let streamError: Error | undefined
  for await (const chunk of ctx.llm.stream(request)) {
    assembler.push(chunk)
    if (chunk.type === 'text-delta') yield { frame: 'delta', text: chunk.text }
  }
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    streamError = new Error(`润色失败（${finish.kind}）: ${finish.failure.message}`)
  } else if (finish.kind === 'max-tokens') {
    streamError = new Error('润色输出达到 maxTokens 上限')
  }
  const newBody = assembler
    .blocks()
    .filter((block): block is Extract<StreamChunk, { type: 'block-end' }>['block'] & { type: 'text' } => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
  if (streamError !== undefined) throw streamError
  if (newBody.length < 100) throw new Error('润色结果过短，可能失败，请重试')

  // Draft mode: keep the original file untouched until the user decides.
  chapter.pendingDraft = newBody
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
  yield { frame: 'drafted', chars: newBody.length, draft: newBody }
}

/** Generate one chapter (streaming). Yields progress frames; persists when done. */
export async function* generateChapterStream(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): AsyncGenerator<{ frame: 'start' } | { frame: 'delta'; text: string } | { frame: 'done'; file: string; chars: number }, void, unknown> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  // Note: the route layer owns the 'generating' status + concurrency guard;
  // this function must not refuse when status is 'generating' (the route sets
  // it before calling us).

  // Continuity: previous chapter's ending + its summary (narrative memory).
  let continuity = ''
  const prev = project.chapters.find(c => c.no === chapterNo - 1)
  if (prev?.file !== undefined) {
    const prevPath = join(outputDir, prev.file)
    if (existsSync(prevPath)) {
      const text = readFileSync(prevPath, 'utf8')
      continuity = text.slice(-900)
    }
  }
  const prevSummary = prev?.summary
  // 事实注入：最近 20 条（近因记忆）+ 按本章剧情要点检索的「相关旧事实」。
  // 长篇后旧设定可能被挤出近期窗口，故检索覆盖全部事实库：trigram 重合度 +
  // 角色名命中加权 + 近因加权，取 top 15，与近期事实去重，保证关键状态不写飞。
  const allFacts = project.facts ?? []
  const recentFacts = allFacts.slice(-20).map(f => f.text)
  const recentSet = new Set(recentFacts)
  const beatsText = chapter.beats
  const roleNames = (project.roles ?? [])
    .map(r => r.name)
    .filter((n): n is string => typeof n === 'string' && n !== '')
  const trigrams = (s: string): Set<string> => {
    const out = new Set<string>()
    for (let i = 0; i + 3 <= s.length; i++) {
      const tri = s.slice(i, i + 3)
      if (tri.trim() !== '') out.add(tri)
    }
    return out
  }
  const beatsTri = trigrams(beatsText)
  const beatRoles = roleNames.filter(n => beatsText.includes(n))
  const relatedFacts = allFacts
    .map((f, idx) => {
      const head = f.text.slice(0, 80)
      let score = 0
      for (const tri of trigrams(head)) if (beatsTri.has(tri)) score += 1
      if (beatRoles.length > 0) {
        for (const n of beatRoles) if (head.includes(n)) score += 8
      }
      // 近因加权：越新越优先（封顶 40 章）
      score += Math.min(idx, 40) / 10
      return { f, score }
    })
    .filter(x => x.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map(x => `[第${x.f.chapterNo}章] ${x.f.text}`)
    .filter(t => !recentSet.has(t.slice(t.indexOf(']') + 2)))

  // 暗线（伏笔）埋点注入：检索「目标章在当前章附近 + 尚未回收」的 planned 伏笔，
  // 把埋点细节要求注入本次生成，保证正文按规划埋线（否则伏笔列表与正文脱节）。
  const foreshadowHints = (project.foreshadows ?? [])
    .filter(f => f.status === 'planned' && f.targetChapter !== undefined && f.targetChapter > 0)
    .filter(f => Math.abs((f.targetChapter as number) - chapterNo) <= 12)
    .map(f => `- ${f.description.slice(0, 120)}${f.targetChapter !== undefined ? `（计划回收于第 ${f.targetChapter} 章）` : ''}`)

  const user = [
    `现在写第 ${chapter.no} 章，标题《${chapter.title}》。`,
    `本章剧情要点：${chapter.beats}`,
    '',
    foreshadowHints.length > 0
      ? `本章附近需顺势埋下以下暗线（自然带过，不喧宾夺主，1-2 句即可，但细节要可辨识、与描述吻合）：\n${foreshadowHints.join('\n')}`
      : '',
    recentFacts.length > 0
      ? `本书已确立的事实（新写内容不得与之矛盾）：\n${recentFacts.join('\n')}`
      : '',
    relatedFacts.length > 0
      ? `本章相关的既往事实（同样不得违背）：\n${relatedFacts.join('\n')}`
      : '',
    prevSummary !== undefined && prevSummary !== ''
      ? `上一章摘要：${prevSummary}`
      : '',
    continuity !== ''
      ? `上一章结尾（用于衔接，不要复述）：\n${continuity}`
      : '这是第一章，注意开篇要有吸引力。',
    '',
    `请写 ${chapter.targetChars} 字左右的正文，只输出正文。`,
  ].filter(line => line !== '').join('\n')

  const messages: Message[] = [createUserMessage({
    content: [{ type: 'text', text: user }],
    source: { kind: 'plugin', plugin: 'dsh-novel-forge' },
  })]
  const request: GenerateOptions = {
    provider: config.provider,
    model: config.model,
    messages,
    system: writeSystemPrompt(project),
    // Full-chapter output: budget generously (4000 chars ≈ 8-12k tokens,
    // plus the model's reasoning channel).
    maxTokens: Math.max(config.maxTokens, 20000),
    temperature: 0.85,
  }

  yield { frame: 'start' }

  const assembler = new BlockAssembler()
  let streamError: Error | undefined
  for await (const chunk of ctx.llm.stream(request)) {
    assembler.push(chunk)
    if (chunk.type === 'text-delta') {
      yield { frame: 'delta', text: chunk.text }
    }
  }
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    streamError = new Error(`生成失败（${finish.kind}）: ${finish.failure.message}`)
  } else if (finish.kind === 'max-tokens') {
    streamError = new Error('达到 maxTokens 上限，正文可能不完整，请增大 maxTokens 后重试')
  }
  const body = assembler
    .blocks()
    .filter((block): block is Extract<StreamChunk, { type: 'block-end' }>['block'] & { type: 'text' } => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim()
  if (streamError !== undefined) throw streamError
  if (body.length < 100) throw new Error('生成内容过短，可能失败，请重试')

  // Write the chapter file.
  const fileName = chapterFileName(chapter)
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(join(outputDir, fileName), `# 第${chapter.no}章 ${chapter.title}\n\n${body}\n`, 'utf8')

  chapter.status = 'written'
  chapter.chars = body.length
  chapter.file = fileName
  chapter.error = undefined
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)

  yield { frame: 'done', file: fileName, chars: body.length }
}

/** Generate a chapter summary (narrative memory). */
export async function summarizeChapter(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): Promise<string> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) throw new Error(`章节 ${chapterNo} 不在计划中`)
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) throw new Error(`章节 ${chapterNo} 的正文文件不存在`)
  const system = [
    '你是一位网文编辑。请为下面一章写一段 120-200 字的摘要，供后续章节写作时保持连贯性。',
    '摘要必须包含：本章发生的关键事件、主角状态变化（境界/资源/伤势/心境）、新增的伏笔或线索、角色关系变化。',
    '用客观陈述句，不要评价，不要剧透式感叹。只输出摘要正文。',
  ].join('\n')
  const user = body.replace(/^#\s+.*$/m, '').trim()
  const summary = await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 4000) })
  chapter.summary = summary.slice(0, 500)
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
  return chapter.summary
}

/**
 * 摘要 + 事实抽取合并为一次 LLM 调用（省一次调用与一次正文输入，
 * 批量生成时整体开销约省 25%）。
 * @returns 摘要与新增事实条数（失败返回空，调用方 best-effort）。
 */
export async function summarizeAndExtractFacts(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): Promise<{ summary: string; factCount: number }> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) return { summary: '', factCount: 0 }
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) return { summary: '', factCount: 0 }
  const system = [
    '你是一位网文编辑。请为下面一章做两件事，输出合法 JSON 对象：',
    '{"summary": "120-200字摘要，含关键事件/主角状态变化（境界资源伤势心境）/新增伏笔线索/角色关系变化，客观陈述不评价", "facts": ["已确立事实1", "…3-6条"]}',
    'facts 指：本章明确写出的、对后续有约束力的事实——人物当前状态、重要关系变化、地点与时间线、已落地或新增的伏笔线索、关键道具去向。',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
  ].join('\n')
  const user = body.replace(/^#\s+.*$/m, '').trim()
  const text = await complete(ctx, config, { system, user, temperature: 0.2, maxTokens: Math.max(config.maxTokens, 5000) })
  const raw = parseJsonObject<{ summary?: unknown; facts?: unknown }>(text)
  const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 500) : ''
  const factLines = Array.isArray(raw.facts)
    ? raw.facts
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 8)
        .map(v => v.trim().slice(0, 140))
    : []
  if (summary !== '') chapter.summary = summary
  const list = project.facts ?? []
  for (const line of factLines.slice(0, 8)) list.push({ chapterNo, text: line })
  project.facts = list.slice(-300)
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
  return { summary, factCount: factLines.length }
}

/**
 * 伏笔落地标记：检查刚生成的章节正文是否埋下了 planned 伏笔（关键词匹配），
 * 命中则将该伏笔标记为 planted 并记录 plantedChapter——保证暗线管理页与正文同步。
 * 纯关键词粗匹配，宁缺毋滥：仅处理「描述含可辨识关键词」的伏笔，无把握则不标。
 */
export function markForeshadowPlanted(
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): number {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) return 0
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) return 0
  let marked = 0
  for (const f of project.foreshadows ?? []) {
    if (f.status !== 'planned') continue
    if (f.plantedChapter !== undefined) continue
    // 从描述中提取关键词：书名号/引号内容优先（专有名词），否则取 2-4 字名词片段。
    const quoted = f.description.match(/[「“『《]([^」”』》]{2,12})[」”』》]/g)
    const keywords = (quoted !== null ? quoted : [])
      .map(q => q.slice(1, -1))
      .filter(k => k.length >= 2)
    // 无引号关键词时，退而求其次：用「本章附近注入过该伏笔」的信号（targetChapter 接近当前章）。
    const nearTarget = f.targetChapter !== undefined && Math.abs(f.targetChapter - chapterNo) <= 12
    if (keywords.length === 0 && !nearTarget) continue
    const hit = keywords.length === 0
      ? false
      : keywords.some(k => body.includes(k))
    if (hit || (keywords.length === 0 && nearTarget)) {
      // 命中或（无关键词但恰好在目标章附近被注入埋点要求）→ 保守起见，只有明确命中才标记。
      if (hit) {
        f.status = 'planted'
        f.plantedChapter = chapterNo
        marked++
      }
    }
  }
  if (marked > 0) {
    project.updatedAt = new Date().toISOString()
    saveProject(outputDir, project)
  }
  return marked
}

/**
 * 抽取本章「已确立事实」追加到事实库/时间线（最多 300 条，最新优先）。
 * 事实注入后续章节生成提示词，保证人物状态/境界/资源/关系长期一致。
 * @returns 新增事实条数（失败返回 0，调用方 best-effort）。
 */
export async function extractFacts(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  chapterNo: number,
): Promise<number> {
  const chapter = project.chapters.find(c => c.no === chapterNo)
  if (chapter === undefined) return 0
  const body = readChapterFile(outputDir, chapter)
  if (body === undefined) return 0
  const system = [
    '你是一位网文编辑。请从本章正文中抽取「已确立事实」，供后续章节保持一致。',
    '事实指：人物当前状态（境界/修为/伤势/资源/心境）、重要关系变化、地点与时间线、已落地或新增的伏笔线索、关键道具去向。',
    '要求：',
    '1. 只抽取本章明确写出的、对后续有约束力的内容；纯心理活动与无关细节不要。',
    '2. 每行一条事实，用客观陈述句，不含主观评价。',
    '3. 输出 3-6 条，每行一条，不要编号、不要前缀、不要解释。',
  ].join('\n')
  const user = body.replace(/^#\s+.*$/m, '').trim()
  // v4-flash 推理模型：reasoning channel 也占 maxTokens，预算给足避免截断。
  const text = await complete(ctx, config, { system, user, temperature: 0.2, maxTokens: Math.max(config.maxTokens, 4000) })
  const lines = text.split('\n')
    .map(line => line.replace(/^[-*\d.\s]+/, '').trim())
    .filter(line => line.length > 8)
    .slice(0, 8)
  if (lines.length === 0) return 0
  const facts = project.facts ?? []
  for (const line of lines) facts.push({ chapterNo, text: line.slice(0, 140) })
  project.facts = facts.slice(-300)
  project.updatedAt = new Date().toISOString()
  saveProject(outputDir, project)
  return lines.length
}

// ------------------------------------------------------------ book audit

const AUDIT_BATCH_SIZE = 10

/** 单批质检：设定 + 事实库 + 该批章节节选 → 矛盾清单。 */
async function auditBatch(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  batch: ChapterPlan[],
): Promise<AuditIssue[]> {
  const system = [
    '你是一位严谨的网文连续性审校编辑。你会收到一本小说的设定圣经、事实库和一批章节正文节选。',
    '请找出这批章节中的一致性矛盾，例如：',
    '- 人物状态冲突：境界/修为/伤势/资源在同一章内或跨章前后矛盾。',
    '- 设定违背：正文与世界观规则、金手指规则、写作红线冲突。',
    '- 时间线错乱：事件顺序、时间跨度、地点移动不合逻辑。',
    '- 细节穿帮：人名/地名/物品/数字前后不一致。',
    '要求：',
    '1. 只报告有实质证据的矛盾，不要泛泛而谈写作质量问题。',
    '2. 每条必须定位到具体章节号。',
    '3. 输出必须是合法 JSON 数组，格式：[{"chapterNo": 章节号, "severity": "high|medium|low", "item": "矛盾描述", "suggestion": "修改建议"}]',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
  ].join('\n')
  const factsBlock = (project.facts ?? []).slice(-60).map(f => `[第${f.chapterNo}章] ${f.text}`).join('\n')
  const chapterBlocks = batch.map(c => {
    const body = readChapterFile(outputDir, c)
    const excerpt = (body ?? '').replace(/^#\s+.*$/m, '').trim().slice(0, 700)
    return `【第${c.no}章《${c.title}》】\n${excerpt}`
  }).join('\n\n')
  const user = [
    '请对以下小说做一致性质检。',
    project.bible !== undefined
      ? '设定圣经：\n' + [
          project.bible.worldRules.length > 0 ? `世界规则：\n${project.bible.worldRules.map(r => `- ${r}`).join('\n')}` : '',
          project.bible.redLines.length > 0 ? `写作红线：\n${project.bible.redLines.map(r => `- ${r}`).join('\n')}` : '',
          project.bible.characters.length > 0 ? `角色：\n${project.bible.characters.map(ch => `- ${ch.name}（${ch.traits.join('、')}）`).join('\n')}` : '',
        ].filter(s => s !== '').join('\n')
      : '',
    factsBlock !== '' ? `已确立事实库：\n${factsBlock}` : '',
    `正文节选（每章前 700 字）：\n${chapterBlocks}`,
    '只输出 JSON 数组。',
  ].filter(s => s !== '').join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.2, maxTokens: Math.max(config.maxTokens, 12000) })
  const parsed = parseJsonArray<Record<string, unknown>>(text)
  const issues: AuditIssue[] = []
  for (const entry of parsed) {
    const item = typeof entry.item === 'string' ? entry.item : ''
    if (item === '') continue
    issues.push({
      chapterNo: Number(entry.chapterNo) || 0,
      severity: ['high', 'medium', 'low'].includes(entry.severity as string)
        ? entry.severity as AuditIssue['severity']
        : 'medium',
      item,
      suggestion: typeof entry.suggestion === 'string' ? entry.suggestion : '',
    })
  }
  return issues
}

/** 全书一致性质检：LLM 分批扫描已生成章节 + 设定 + 事实库，聚合矛盾清单。 */
export async function auditBook(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
): Promise<AuditIssue[]> {
  const written = project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating')
  if (written.length === 0) return []
  // 分批：每批 AUDIT_BATCH_SIZE 章，避免超长后单次爆上下文。
  const all: AuditIssue[] = []
  for (let i = 0; i < written.length; i += AUDIT_BATCH_SIZE) {
    const batch = written.slice(i, i + AUDIT_BATCH_SIZE)
    try {
      all.push(...await auditBatch(ctx, config, project, outputDir, batch))
    } catch { /* 单批失败不阻断其余批次 */ }
  }
  return all.slice(0, 50)
}

/** 小说简介：AI 生成或按已写开头补全（面向读者的作品门面）。 */
export async function generateBlurb(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  partial = '',
): Promise<string> {
  const system = [
    '你是一位网文平台编辑，擅长写抓人的作品简介。',
    '要求：',
    '1. 120-250 字，突出核心卖点（金手指/题材/爽点/人设反差），用一两句抛出开局钩子。',
    '2. 不剧透结局与关键反转；语气贴合题材（热血/悬疑/轻松/虐心）。',
    '3. 中文，直接输出简介正文，不要 Markdown、不要引号包裹、不要「简介：」前缀。',
  ].join('\n')
  const genreBlock = project.bible?.genre !== undefined ? `题材：${project.bible.genre}` : ''
  const volumeBlock = (project.volumes ?? []).slice(0, 3).map(v => v.title).join('、')
  const user = [
    `书名：《${project.bookName}》`,
    genreBlock,
    volumeBlock !== '' ? `卷结构：${volumeBlock}` : '',
    `已写章节数：${project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating').length}`,
    '大纲节选：\n' + project.outline.slice(0, 2500),
    partial.trim() !== ''
      ? `已有开头草稿（请保留其内容与语气，续写补全为完整简介）：\n${partial.trim()}`
      : '请全量生成一份完整简介。',
  ].filter(s => s !== '').join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.7, maxTokens: Math.max(config.maxTokens, 4000) })
  const blurb = text.replace(/^["'「『]|["'」』]$/g, '').replace(/^简介[：:]\s*/, '').trim().slice(0, 600)
  return blurb
}

// ---------------------------------------------------------------- world

/**
 * 组装全书上下文包（AI 助手 book_overview 工具）。
 * 分片策略：章节要点默认只给最近 30 章（避免超长后爆上下文）；
 * scope='full' 全量；scope=数字 只给该卷章节。
 */
export function bookOverview(project: ProjectState, scope: 'recent' | 'full' | number = 'recent'): string {
  const s: string[] = []
  s.push(`书名：${project.bookName}`)
  s.push(`【大纲全文】\n${project.outline}`)
  if (project.bible !== undefined) {
    const bible = project.bible
    s.push('【设定圣经】')
    if (bible.genre !== '') s.push(`题材基调：${bible.genre}`)
    if (bible.worldRules.length > 0) s.push('世界规则：\n' + bible.worldRules.map(r => `- ${r}`).join('\n'))
    if (bible.characters.length > 0) {
      s.push('角色卡：')
      for (const card of bible.characters) {
        const roleName = { protagonist: '主角', supporting: '配角', antagonist: '反派', other: '其他' }[card.role]
        s.push(`- ${card.name}（${roleName}）：${card.traits.join('、')}${card.goals !== '' ? `；目标：${card.goals}` : ''}${card.relations !== '' ? `；关系：${card.relations}` : ''}`)
      }
    }
    if (bible.redLines.length > 0) s.push('写作红线：\n' + bible.redLines.map(r => `- ${r}`).join('\n'))
    if (bible.style.length > 0) s.push('风格要求：\n' + bible.style.map(r => `- ${r}`).join('\n'))
  }
  const worldBlock = renderWorld(project.world)
  if (worldBlock !== '') s.push(worldBlock)
  if (project.volumes !== undefined && project.volumes.length > 0) {
    s.push('【卷结构】')
    for (const v of project.volumes) {
      s.push(`第${v.no}卷《${v.title}》：${v.summary}（章节 ${v.chapterStart}-${v.chapterEnd}）`)
    }
  }
  if (project.chapters.length > 0) {
    // 分片：默认最近 30 章；full 全量；数字 = 指定卷。
    const maxNo = project.chapters.reduce((m, c) => Math.max(m, c.no), 0)
    const shown = project.chapters.filter(c => {
      if (scope === 'full') return true
      if (typeof scope === 'number') return c.volume === scope
      return c.no > Math.max(0, maxNo - 30)
    })
    const label = scope === 'full' ? '全部章节（标题/状态/剧情要点/摘要）' : typeof scope === 'number' ? `第 ${scope} 卷章节（标题/状态/剧情要点/摘要）` : `最近 ${shown.length} 章（标题/状态/剧情要点/摘要）`
    s.push(`【${label}】`)
    const statusText: Record<string, string> = { pending: '待生成', generating: '生成中', written: '待审稿', reviewing: '审稿中', approved: '已通过', rejected: '待修订', error: '失败' }
    for (const c of shown) {
      s.push(`第${c.no}章《${c.title}》[${statusText[c.status] ?? c.status}]${c.chars !== undefined ? ` ${c.chars}字` : ''}\n剧情要点：${c.beats}\n摘要：${c.summary ?? '无'}`)
    }
    if (scope !== 'full' && project.chapters.length > shown.length) {
      s.push(`（还有 ${project.chapters.length - shown.length} 章未列出，可用 scope=volume:N 查看指定卷）`)
    }
  }
  if ((project.facts ?? []).length > 0) {
    s.push('【事实库（最近 40 条；更多用 facts_query 检索）】')
    for (const f of (project.facts ?? []).slice(-40)) {
      s.push(`- [第${f.chapterNo}章] ${f.text}`)
    }
  }
  if (project.foreshadows.length > 0) {
    s.push('【伏笔】')
    for (const f of project.foreshadows) {
      s.push(`- [${f.status}] ${f.description}${f.targetChapter !== undefined ? `（预计 ${f.targetChapter} 章回收）` : ''}`)
    }
  }
  if (project.blurb !== undefined && project.blurb !== '') s.push(`【小说简介】${project.blurb}`)
  return s.join('\n\n')
}

/** 一条影响分析结果（改动波及处）。 */
export interface ImpactItem {
  /** 位置：章节号 / 大纲 / 设定圣经 / 大世界 / 事实库 / 简介。 */
  location: string
  /** 原文片段（定位用）。 */
  quote: string
  /** 修改建议。 */
  suggestion: string
  /** must = 必须同步改；optional = 建议改；note = 备注（如保留旧称作古称）。 */
  kind: 'must' | 'optional' | 'note'
}

/**
 * 影响分析：LLM 扫描全书（大纲/设定/大世界/事实库/已写章节），
 * 定位一次改动波及的所有位置。助手在修改后主动调用，做连锁维护。
 */
export async function analyzeImpact(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  change: string,
): Promise<ImpactItem[]> {
  const system = [
    '你是一位网文一致性审校。作者要做一处修改，请找出这次改动会波及的所有位置（设定、大纲、已写章节正文、事实库、简介中可能因此过时或矛盾的内容）。',
    '输出必须是合法 JSON 数组，格式：[{"location": "位置（第N章/大纲/设定圣经-世界规则/大世界-境界/事实库/简介）", "quote": "原文片段（20-60字）", "suggestion": "修改建议", "kind": "must|optional|note"}]',
    'kind 含义：must=必须同步改否则矛盾；optional=建议改（影响观感）；note=备注（如旧称保留为古称、或无需改但需知晓）。',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
  ].join('\n')
  const written = project.chapters.filter(c => c.status !== 'pending' && c.status !== 'generating')
  // 轻量 base：大纲节选 + 道藏要点 + 编年录最近 40 条（替代全量 bookOverview，
  // 定位主要靠各批章节节选原文）。
  const base = [
    `要做的修改：${change}`,
    '以下为全书设定与规则要点（章节为分批节选）：',
    `大纲节选：\n${project.outline.slice(0, 2000)}`,
    project.bible !== undefined
      ? `道藏：${project.bible.worldRules.length} 条世界规则 / ${project.bible.redLines.length} 条红线 / 人物 ${project.bible.characters.map(c => c.name).join('、')}`
      : '',
    (project.facts ?? []).length > 0
      ? `编年录最近 40 条：\n${(project.facts ?? []).slice(-40).map(f => `[第${f.chapterNo}章] ${f.text}`).join('\n')}`
      : '',
  ].filter(s => s !== '').join('\n\n')
  const items: ImpactItem[] = []
  // 分批扫描章节正文（每批 8 章），聚合影响清单，避免超长后爆上下文。
  const IMPACT_BATCH_SIZE = 8
  for (let i = 0; i < written.length; i += IMPACT_BATCH_SIZE) {
    const batch = written.slice(i, i + IMPACT_BATCH_SIZE)
    const chapterBlock = batch.map(c => {
      const body = readChapterFile(outputDir, c)
      const excerpt = (body ?? '').replace(/^#\s+.*$/m, '').trim().slice(0, 500)
      return `【第${c.no}章《${c.title}》】\n${excerpt}`
    }).join('\n\n')
    const user = `${base}\n\n本批章节（第 ${batch[0]!.no}-${batch[batch.length - 1]!.no} 章）：\n${chapterBlock}\n\n只输出 JSON 数组。`
    try {
      const text = await complete(ctx, config, { system, user, temperature: 0.2, maxTokens: Math.max(config.maxTokens, 12000) })
      for (const entry of parseJsonArray<Record<string, unknown>>(text)) {
        const quote = typeof entry.quote === 'string' ? entry.quote.trim() : ''
        if (quote === '') continue
        items.push({
          location: typeof entry.location === 'string' ? entry.location : '未定位',
          quote: quote.slice(0, 120),
          suggestion: typeof entry.suggestion === 'string' ? entry.suggestion : '',
          kind: entry.kind === 'must' || entry.kind === 'optional' || entry.kind === 'note' ? entry.kind : 'optional',
        })
      }
    } catch { /* 单批失败不阻断其余批次 */ }
  }
  return items.slice(0, 30)
}

/** 把大世界结构化数据渲染成提示词块（境界体系按顺序强约束）。 */
export function renderWorld(world: WorldState | undefined): string {
  if (world === undefined) return ''
  const sections: string[] = ['==================== 大世界（结构化设定，写作时严格遵守） ====================']
  if (world.realms.length > 0) {
    sections.push('境界体系（由低到高，不得随意跳级或自创境界）：')
    world.realms.forEach((realm, i) => {
      sections.push(`${i + 1}. ${realm.name}${realm.description !== '' ? ` — ${realm.description}` : ''}`)
    })
  }
  if (world.regions.length > 0) {
    sections.push('地理区域：')
    for (const region of world.regions) {
      sections.push(`- ${region.name}${region.description !== '' ? `：${region.description}` : ''}${region.faction !== undefined && region.faction !== '' ? `（势力：${region.faction}）` : ''}`)
    }
  }
  if (world.factions.length > 0) {
    sections.push('势力分布：')
    for (const faction of world.factions) {
      sections.push(`- ${faction.name}（${faction.kind}）${faction.description !== '' ? `：${faction.description}` : ''}${faction.region !== undefined && faction.region !== '' ? `（驻地：${faction.region}）` : ''}`)
    }
  }
  return sections.join('\n')
}

/** AI 提炼大世界：从大纲 + 设定圣经生成结构化境界体系/区域/势力。 */
export async function extractWorld(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
): Promise<WorldState> {
  const system = [
    '你是一位网文世界观架构师。请根据小说大纲与设定圣经，提炼结构化「大世界」数据。',
    '输出必须是合法 JSON 对象：',
    '{"realms": [{"name": "境界名", "description": "突破条件/寿命/标志等"}], "regions": [{"name": "区域名", "description": "描述", "faction": "关联势力名或空"}], "factions": [{"name": "势力名", "kind": "宗门/家族/王朝/组织等", "description": "描述", "region": "驻地区域或空"}]}',
    '要求：',
    '1. realms 按由低到高顺序排列（修仙题材必须含完整境界链；无境界设定的题材可输出空数组）。',
    '2. 数量贴合大纲：realms 3-12 个，regions 2-10 个，factions 2-10 个。',
    '3. 内容严格来自大纲与设定圣经，不要凭空发明与大纲冲突的设定。',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
  ].join('\n')
  const bibleBlock = project.bible !== undefined
    ? [
        project.bible.genre !== '' ? `题材：${project.bible.genre}` : '',
        project.bible.worldRules.length > 0 ? `世界规则：\n${project.bible.worldRules.map(r => `- ${r}`).join('\n')}` : '',
      ].filter(s => s !== '').join('\n')
    : ''
  const user = [
    '请为这部小说提炼大世界数据。',
    `书名：《${project.bookName}》`,
    bibleBlock !== '' ? bibleBlock : '',
    '大纲：\n' + project.outline.slice(0, 5000),
    '只输出 JSON 对象。',
  ].filter(s => s !== '').join('\n\n')
  const text = await complete(ctx, config, { system, user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 12000) })
  const raw = parseJsonObject<{ realms?: unknown; regions?: unknown; factions?: unknown }>(text)
  const str = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
  const objArray = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null) : []
  const world: WorldState = {
    realms: objArray(raw.realms).map(entry => ({
      name: str(entry.name).slice(0, 20) || '未命名境界',
      description: str(entry.description).slice(0, 200),
    })).filter(r => r.name !== '未命名境界' || r.description !== ''),
    regions: objArray(raw.regions).map(entry => ({
      name: str(entry.name).slice(0, 30) || '未命名区域',
      description: str(entry.description).slice(0, 200),
      faction: str(entry.faction).slice(0, 30),
    })).filter(r => r.name !== '未命名区域' || r.description !== ''),
    factions: objArray(raw.factions).map(entry => ({
      name: str(entry.name).slice(0, 30) || '未命名势力',
      kind: str(entry.kind).slice(0, 20) || '组织',
      description: str(entry.description).slice(0, 200),
      region: str(entry.region).slice(0, 30),
    })).filter(f => f.name !== '未命名势力' || f.description !== ''),
  }
  return world
}

/**
 * 事实库回填：对历史已生成章节批量抽取事实（无事实记录的旧章节）。
 * @returns 回填的章节数。
 */
export async function backfillFacts(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
): Promise<number> {
  const have = new Set((project.facts ?? []).map(f => f.chapterNo))
  let filled = 0
  for (const chapter of project.chapters) {
    if (chapter.status === 'pending' || chapter.status === 'generating') continue
    if (chapter.file === undefined || have.has(chapter.no)) continue
    try {
      const n = await extractFacts(ctx, config, project, outputDir, chapter.no)
      if (n > 0) filled++
    } catch { /* best-effort per chapter */ }
    have.add(chapter.no)
  }
  return filled
}

/**
 * 角色卡刷新：出场统计由服务端从正文精确计算（角色名出现过的章节数、
 * 最近出现章节），LLM 只负责聚合「当前状态」一句话。
 */
export async function refreshCharacters(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
): Promise<RoleStatusCard[]> {
  // 名单优先用角色库（主表）；无角色库时退回道藏角色卡。
  const rawRoster = (((project.roles ?? []).length > 0 ? project.roles : project.bible?.characters) ?? []) as Array<{ name: string; traits?: string[]; role?: string; roleLabel?: string }>
  const roster = rawRoster.map(r => ({
    name: r.name,
    traits: r.traits ?? [],
    role: r.roleLabel !== undefined ? r.roleLabel : (r.role ?? 'other'),
  }))
  const facts = project.facts ?? []
  if (roster.length === 0 && facts.length === 0) return []

  // 服务端精确出场统计：遍历已写章节正文，统计每个角色名出现过的章节。
  const stat = new Map<string, { chapters: Set<number>; last: number }>()
  const known = roster.map(card => card.name)
  for (const chapter of project.chapters) {
    if (chapter.status === 'pending' || chapter.status === 'generating') continue
    const body = readChapterFile(outputDir, chapter)
    if (body === undefined) continue
    for (const name of known) {
      if (body.includes(name)) {
        const entry = stat.get(name) ?? { chapters: new Set<number>(), last: 0 }
        entry.chapters.add(chapter.no)
        if (chapter.no > entry.last) entry.last = chapter.no
        stat.set(name, entry)
      }
    }
  }

  // LLM 只聚合状态：名单（含 traits）+ 事实库 → [{name, status}]
  let statuses = new Map<string, string>()
  if (facts.length > 0) {
    const system = [
      '你是一位网文角色档案管理员。请根据「角色名单」与「已确立事实库」，为每个角色输出「当前状态」一句话（境界/修为/伤势/资源/心境）。',
      '输出必须是合法 JSON 数组，格式：[{"name": "角色名", "status": "当前状态一句话"}]',
      '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
    ].join('\n')
    const rosterBlock = roster.map(ch => `- ${ch.name}（${ch.traits.join('、')}）`).join('\n')
    const factsBlock = facts.map(f => `[第${f.chapterNo}章] ${f.text}`).join('\n')
    const user = [
      `角色名单：\n${rosterBlock}`,
      `已确立事实库（${facts.length} 条）：\n${factsBlock.slice(-6000)}`,
      '只输出 JSON 数组。',
    ].join('\n\n')
    try {
      const text = await complete(ctx, config, { system, user, temperature: 0.2, maxTokens: Math.max(config.maxTokens, 8000) })
      for (const entry of parseJsonArray<Record<string, unknown>>(text)) {
        const name = typeof entry.name === 'string' ? entry.name : ''
        if (name !== '' && typeof entry.status === 'string') statuses.set(name, entry.status)
      }
    } catch { /* status 聚合失败则只给出场统计 */ }
  }

  // 合并：出场统计（精确）+ 状态（LLM）+ 名单角色补全。
  const cards: RoleStatusCard[] = []
  const roleOf = (name: string): string => roster.find(c => c.name === name)?.role ?? 'other'
  for (const card of roster) {
    const entry = stat.get(card.name)
    cards.push({
      name: card.name,
      role: card.role,
      status: statuses.get(card.name) ?? '',
      lastChapter: entry?.last ?? 0,
      appearances: entry?.chapters.size ?? 0,
    })
  }
  // 名单外的角色（从事实库中识别到但不在设定圣经名单）仅当有出场统计时补充。
  for (const [name, entry] of stat) {
    if (!cards.some(c => c.name === name)) {
      cards.push({
        name,
        role: roleOf(name),
        status: statuses.get(name) ?? '',
        lastChapter: entry.last,
        appearances: entry.chapters.size,
      })
    }
  }
  return cards
}

// ------------------------------------------------------------- foreshadows

/** System prompt for foreshadow suggestions. */
function foreshadowSystemPrompt(): string {
  return [
    '你是一位网文伏笔设计师。你会收到大纲和已写的章节信息，请为小说建议 3-8 条值得埋设的伏笔。',
    '要求：',
    '1. 伏笔必须有明确的回收价值（推动主线、人物弧光、世界观揭秘）。',
    '2. 描述要具体，指出埋设章节与预计回收章节（可空缺）。',
    '3. 优先从大纲的暗线（如记忆代价、残片收集、身世谜团）中提炼。',
    '输出必须是合法 JSON 数组：',
    '[{"description": "伏笔描述", "plantedChapter": 章节号或null, "targetChapter": 章节号或null}]',
    '重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。',
  ].join('\n')
}

/** Suggest foreshadows from the outline + plan. */
export async function suggestForeshadows(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
): Promise<Foreshadow[]> {
  const user = [
    '请为下面这部小说设计伏笔。',
    `大纲：\n${project.outline}`,
    `已规划章节数：${project.chapters.length}`,
  ].join('\n')
  const text = await complete(ctx, config, { system: foreshadowSystemPrompt(), user, temperature: 0.5, maxTokens: Math.max(config.maxTokens, 12000) })
  const parsed = parseJsonArray<Record<string, unknown>>(text)
  const existing = new Set(project.foreshadows.map(f => f.description))
  const created: Foreshadow[] = []
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue
    const description = typeof entry.description === 'string' ? entry.description.trim() : ''
    if (description === '' || existing.has(description)) continue
    existing.add(description)
    created.push({
      id: `fs-${Date.now().toString(36)}-${created.length}`,
      description: description.slice(0, 200),
      plantedChapter: typeof entry.plantedChapter === 'number' ? entry.plantedChapter : undefined,
      targetChapter: typeof entry.targetChapter === 'number' ? entry.targetChapter : undefined,
      status: 'planned',
    })
  }
  project.foreshadows.push(...created)
  project.updatedAt = new Date().toISOString()
  return created
}

// -------------------------------------------------------------- style asset

/**
 * 写法引擎：从样本文本提取一份写法资产（叙事风格规则）。
 * @returns 提取出的风格规则（未持久化，由调用方存入 project.assets）。
 */
export async function extractStyleAsset(
  ctx: Context,
  config: NovelConfig,
  sampleText: string,
): Promise<{ proseRules: string[]; dialogueRules: string[]; descriptionRules: string[]; boundaries: string[] }> {
  const user = `请分析下面这段样本文本，提炼其叙事风格规则：\n\n${sampleText}`
  const text = await complete(ctx, config, { system: styleEngineSystemPrompt(), user, temperature: 0.3, maxTokens: Math.max(config.maxTokens, 12000) })
  const raw = parseJsonObject<{ proseRules?: unknown; dialogueRules?: unknown; descriptionRules?: unknown; boundaries?: unknown }>(text)
  const strArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : []
  const result = {
    proseRules: strArray(raw.proseRules),
    dialogueRules: strArray(raw.dialogueRules),
    descriptionRules: strArray(raw.descriptionRules),
    boundaries: strArray(raw.boundaries),
  }
  if (result.proseRules.length + result.dialogueRules.length + result.descriptionRules.length + result.boundaries.length === 0) {
    throw new Error('写法提取失败：模型没有返回有效规则')
  }
  return result
}

// ------------------------------------------------------------------ export

/** Export the whole book as one txt/md file. */
export function exportBook(outputDir: string, project: ProjectState, format: 'txt' | 'md'): { file: string; chars: number; chapters: number } {
  const parts: string[] = []
  if (format === 'md') {
    parts.push(`# ${project.bookName}\n`)
  } else {
    parts.push(project.bookName, '')
  }
  const done = project.chapters.filter(c => c.file !== undefined)
  for (const chapter of done) {
    const body = readChapterFile(outputDir, chapter) ?? ''
    if (format === 'md') {
      parts.push(`\n## 第${chapter.no}章 ${chapter.title}\n`, body.trim(), '')
    } else {
      parts.push('', `第${chapter.no}章 ${chapter.title}`, '', body.trim(), '')
    }
  }
  const content = parts.join('\n')
  const ext = format === 'md' ? 'md' : 'txt'
  const file = `《${safeFileName(project.bookName)}》全本.${ext}`
  writeFileSync(join(outputDir, file), content, 'utf8')
  return { file, chars: content.length, chapters: done.length }
}
