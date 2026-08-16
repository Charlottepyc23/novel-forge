/**
 * AI assistant engine — a conversational editor over the novel project.
 *
 * The user talks to the assistant about plot, characters, settings; the
 * assistant can reply in prose AND emit action directives that the host
 * executes (rewrite a paragraph, edit the bible, regenerate a chapter,
 * export the book, ...). Conversation history persists next to the project
 * as NDJSON, so a reload keeps the thread.
 *
 * Action protocol: the model emits a line of the form
 *   <dsh-action name="toolName">{jsonArgs}</dsh-action>
 * anywhere in its reply. The host strips it, executes the tool, appends the
 * result as a tool-role message, and continues the loop (bounded rounds).
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { createUserMessage, createAssistantMessage, BlockAssembler, type GenerateOptions, type Message, type StreamChunk, type ContentBlock } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'
import type { AssistantMessage, NovelConfig, ProjectState } from './protocol.ts'
import { emptyProjectAssets } from './assets.ts'
import {
  analyzeImpact,
  bookOverview,
  chapterFileName,
  exportBook,
  generateChapterStream,
  readChapterFile,
  reviewChapter,
  saveProject,
  summarizeAndExtractFacts,
} from './engine.ts'
import { rewriteChapterStream } from './engine.ts'

/** History file name inside the output dir. */
export const ASSISTANT_HISTORY_FILE = 'novel-assistant.jsonl'

/** Max tool-call rounds per user turn (safety bound). */
const MAX_TOOL_ROUNDS = 6

/** Max history messages kept in context (older ones summarized away). */
const MAX_HISTORY_MESSAGES = 18

// ------------------------------------------------------------------ history

/** Load the persisted conversation (empty when none). */
export function loadAssistantHistory(outputDir: string): AssistantMessage[] {
  const file = join(outputDir, ASSISTANT_HISTORY_FILE)
  if (!existsSync(file)) return []
  const messages: AssistantMessage[] = []
  try {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (line.trim() === '') continue
      try {
        const parsed = JSON.parse(line) as AssistantMessage
        if (typeof parsed.role === 'string' && typeof parsed.content === 'string') messages.push(parsed)
      } catch { /* skip malformed line */ }
    }
  } catch { /* unreadable history -> start fresh */ }
  return messages
}

/** Append one message to the persisted history. Tool payloads (e.g. full
 *  outline / chapter text) are capped so the jsonl and later LLM context
 *  don't grow unboundedly. */
function appendHistory(outputDir: string, message: AssistantMessage): void {
  mkdirSync(outputDir, { recursive: true })
  const entry: AssistantMessage = message.role === 'tool' && message.content.length > 4000
    ? { ...message, content: message.content.slice(0, 4000) + '\n…（已截断，如需完整内容请重新调用工具）' }
    : message
  appendFileSync(join(outputDir, ASSISTANT_HISTORY_FILE), JSON.stringify(entry) + '\n', 'utf8')
}

/** 清空助手对话记录（删除历史文件）。 */
export function clearAssistantHistory(outputDir: string): void {
  const file = join(outputDir, ASSISTANT_HISTORY_FILE)
  if (existsSync(file)) rmSync(file, { force: true })
}

// ----------------------------------------------------------------- context

/** Render the project snapshot the assistant sees. */
function renderProjectSnapshot(project: ProjectState): string {
  const sections: string[] = []
  sections.push(`书名：${project.bookName}`)
  sections.push(`总纲节选（如需全文用 outline_text 工具）：\n${project.outline.slice(0, 2500)}`)
  // 写作资产名称化（占位小，需要详情用 assets_status）。
  const assetNames: string[] = []
  if (project.assets?.genre !== undefined) assetNames.push(`题材：${project.assets.genre.name}`)
  if (project.assets?.primaryProgression !== undefined) assetNames.push(`主推进：${project.assets.primaryProgression.name}`)
  if ((project.assets?.styleAssets?.length ?? 0) > 0) assetNames.push(`写法：${project.assets!.styleAssets!.map(s => s.name).join('、')}`)
  if ((project.assets?.antiAiRules?.length ?? 0) > 0) assetNames.push(`文戒自定义：${project.assets!.antiAiRules!.map(r => r.name).join('、')}`)
  if (assetNames.length > 0) sections.push(`【写作资产】${assetNames.join(' · ')}`)
  if (project.bible !== undefined) {
    const bible = project.bible
    sections.push('【道藏】')
    if (bible.genre !== '') sections.push(`题材基调：${bible.genre}`)
    if (bible.worldRules.length > 0) sections.push('世界规则：\n' + bible.worldRules.map(r => `- ${r}`).join('\n'))
    if (bible.characters.length > 0) {
      sections.push('角色卡：')
      for (const card of bible.characters) {
        const roleName = { protagonist: '主角', supporting: '配角', antagonist: '反派', other: '其他' }[card.role]
        sections.push(`- ${card.name}（${roleName}）：${card.traits.join('、')}${card.goals !== '' ? `；目标：${card.goals}` : ''}`)
      }
    }
    if (bible.redLines.length > 0) sections.push('写作红线：\n' + bible.redLines.map(r => `- ${r}`).join('\n'))
  }
  if (project.world !== undefined) {
    const world = project.world
    sections.push('【大世界】')
    if (world.realms.length > 0) sections.push('境界体系：' + world.realms.map((r, i) => `${i + 1}.${r.name}（${r.description.slice(0, 40)}）`).join(' → '))
    if (world.regions.length > 0) sections.push('区域：' + world.regions.map(r => r.name).join('、'))
    if (world.factions.length > 0) sections.push('势力：' + world.factions.map(f => `${f.name}（${f.kind}）`).join('、'))
  }
  if (project.volumes !== undefined && project.volumes.length > 0) {
    sections.push('【卷结构】')
    for (const v of project.volumes) {
      sections.push(`第${v.no}卷《${v.title}》：${v.summary}（章节 ${v.chapterStart}-${v.chapterEnd}）`)
    }
  }
  if (project.chapters.length > 0) {
    // 快照只列最近 30 章（长书时防止上下文膨胀；更早章节可用
    // book_overview scope=volume:N 或 chapter_text 按需查看）。
    const shown = project.chapters.slice(-30)
    sections.push(`【章节计划与进度（最近 ${shown.length} 章）】`)
    for (const c of shown) {
      const statusText = { pending: '待生成', generating: '生成中', written: '待审稿', reviewing: '审稿中', approved: '已通过', rejected: '待修订', error: '失败' }[c.status]
      sections.push(`第${c.no}章《${c.title}》[${statusText}]${c.chars !== undefined ? ` ${c.chars}字` : ''}${c.summary !== undefined && c.summary !== '' ? ` 摘要：${c.summary}` : ''}`)
    }
    if (project.chapters.length > shown.length) {
      sections.push(`（还有 ${project.chapters.length - shown.length} 章未列出，可用 book_overview scope=volume:N 查看）`)
    }
    // 最近两章正文节选（讨论细节时参考）
    const written = project.chapters.filter(c => c.status === 'approved' || c.status === 'written')
    const recent = written.slice(-2)
    if (recent.length > 0) {
      sections.push('【最近章节正文节选】')
      for (const c of recent) {
        sections.push(`第${c.no}章《${c.title}》（节选，如需全文用 chapter_text）：${c.beats.slice(0, 300)}`)
      }
    }
  }
  if (project.foreshadows.length > 0) {
    sections.push('【暗线】')
    for (const f of project.foreshadows) {
      sections.push(`- [${f.status}] ${f.description}${f.targetChapter !== undefined ? `（预计 ${f.targetChapter} 章回收）` : ''}`)
    }
  }
  if ((project.facts ?? []).length > 0) {
    sections.push('【已确立编年录（最近 40 条，回答设定问题必须遵守）】')
    for (const f of (project.facts ?? []).slice(-40)) {
      sections.push(`- [第${f.chapterNo}章] ${f.text}`)
    }
  }
  if (project.blurb !== undefined && project.blurb !== '') {
    sections.push(`【卷首语】${project.blurb}`)
  }
  return sections.join('\n')
}

/** The assistant system prompt. */
function assistantSystemPrompt(project: ProjectState): string {
  return [
    '你是「编辑老师」——服务这本书作者的资深中文网文编辑。',
    '人设：二十年网文老编辑，懂套路、懂市场、懂节奏，说话直接但句句有用。',
    '座右铭：「书是你的，但坑我替你盯着。」',
    '职责边界：陪作者讨论剧情/人设/世界观/爽点节奏并落地修改、维护全书一致性；不闲聊、不彩虹屁、不无意义长篇大论。',
    '==================== 模块正式名称（回复作者时一律使用，禁止使用括号里的旧称） ====================',
    '总纲 = 总纲；道藏 = 道藏；暗线 = 暗线；卷首语 = 卷首语；编年录 = 编年录。',
    '==================== 当前项目快照 ====================',
    renderProjectSnapshot(project),
    '==================== 快照结束 ====================',
    '',
    '工作规则（严格遵守）：',
    '1. 全量知情：回答和修改必须基于项目真实数据，禁止编造书中不存在的设定。需要完整信息时，先调用 book_overview 获取全书上下文（总纲全文/道藏/大世界/编年录/全部章节要点/暗线/卷首语）；需要某章正文用 chapter_text。',
    '2. 修改流程：改前用一句话说明意图 → 执行工具 → 改后简要汇报。',
    '3. 连锁维护：改动可能波及其它位置（其它章节、设定、编年录、卷首语）时，执行后主动调用 impact_analysis 分析影响面，并把「必须同步」的项一并处理或明确提示作者逐项确认。',
    '4. 删除红线：删除章节、清空设定等破坏性操作必须等作者明确同意。',
    '5. 品质门槛：建议必须具体——指出问题在哪一章、哪一段、哪一句，并给出可落地的改法；禁止"建议增强冲突"这类空话。',
    '6. 设定忠诚：忠于总纲、道藏、大世界、编年录；发现书中已有内容与设定冲突时，主动指出并给修正方案。',
    '7. 中文回复，简洁有干货。',
    '',
    '可用工具：',
    '- book_overview：{"scope": "recent|full|volume:2"(可选，默认 recent)}。返回全书上下文包（总纲/道藏/大世界/章节要点/编年录/暗线/卷首语）。recent=最近30章；full=全部章节（书很长时慎用）；volume:N=只看第N卷。',
    '- facts_query：{"keyword": "关键词"}。从编年录按关键词检索相关事实（如灵石、境界名、人物名）。',
    '- impact_analysis：{"change": "要做的修改描述"}。分析这次改动会波及哪些位置，返回影响清单（定位到章节/设定/编年录）。',
    '- outline_text：无参数。返回当前总纲全文。',
    '- outline_replace：{"old": "要替换的原文片段", "new": "新文本"}。在总纲中替换一段文字（old 必须能在总纲中找到）。',
    '- bible_set_rule：{"index": 序号(0起), "text": "新规则文本"} 或 {"append": "追加的规则"}。修改道藏的世界规则。',
    '- bible_set_redline：同上，修改写作红线。',
    '- chapter_text：{"no": 章节号}。返回该章正文。',
    '- chapter_rewrite：{"no": 章节号, "instructions": "修改要求", "target": "原文片段(可选，留空整章)"}。按讨论结果修订章节；给了 target 只改该自然段。',
    '- chapter_generate：{"no": 章节号}。重新生成该章。',
    '- chapter_review：{"no": 章节号}。对该章执行 AI 审稿。',
    '- foreshadow_add：{"description": "暗线描述", "targetChapter": 预计回收章(可选)}。新增暗线。',
    '- foreshadow_update：{"id": "暗线id", "status": "planned|planted|progressing|resolved|abandoned"}。更新暗线状态。',
    '- export_txt：无参数。导出全本 TXT。',
    '- assets_status：无参数。查看本书当前写作资产（题材/推进模式/反AI规则/写法）。',
    '- assets_set_genre：{"name": "题材名", "description": "题材说明(可选)"}。设置本书题材基底。',
    '- assets_set_progression：{"name": "模式名", "driver": "驱动力", "primary": true/false}。设置主/辅助推进模式。',
    '- assets_add_rule：{"name": "规则名(可选)", "avoid": "要避免的表达问题", "fix": "修正方向(可选)}。新增反 AI 规则。',
    '',
    '回答质量要求（非常重要）：',
    '- 具体：回答必须引用项目里的真实内容（人名、境界、章节、暗线、设定），禁止空泛套话。快照里没有的信息，先调用工具获取（chapter_text / outline_text）再回答。',
    '- 专业：给建议时说明理由，指出问题所在章节/段落，给出可直接落地的修改方案（改什么、怎么改）。',
    '- 主动：作者说"改一下"，主动调用对应工具执行，不要只给建议不动手；执行前用一句话说明意图，执行后简短汇报结果。',
    '- 忠于设定：以总纲、道藏、编年录为准，不得自相矛盾；发现问题（如剧情与设定冲突）主动指出。',
    '- 中文回复；文字量适中，别啰嗦。',
    '',
    '使用规则（非常重要）：',
    '- 当你想执行任何工具时，你的【整个回复】必须只包含动作指令标签，格式如下（不要有任何解释文字、不要用自然语言说"我要去改"，直接输出标签）：',
    '  正确示例：<dsh-action name="outline_replace">{"old":"要替换的原文","new":"新文本"}</dsh-action>',
    '  正确示例：<dsh-action name="chapter_text">{"no":1}</dsh-action>',
    '  错误示例（绝对不要这样回复）："好的，我先看一下总纲，马上改。" ← 这只是文字，不会执行任何操作',
    '  错误示例（绝对不要这样回复）："先拉完整上下文确认改动落地情况，避免继续空转。" ← 没有动作标签，不会执行任何操作',
    '  错误示例（绝对不要这样回复）："现在处理暗线库，我先看当前列表定位 id。" ← 没有动作标签，不会执行任何操作',
    '- 铁律：只要你想执行任何操作，你的【整个回复】必须只包含一个动作标签，禁止先说话、禁止解释"我要做什么"、禁止铺垫——直接输出标签。',
    '- 如果你收到「格式提示」（宿主说你没有输出动作标签）：你的下一条回复必须只输出动作标签，禁止再解释、禁止再道歉、禁止再描述计划。',
    '- 工具调用是自动的：你输出标签后，宿主会执行并把结果反馈给你，你再基于结果继续。',
    '- 每次回复最多调用 1 个动作；执行结果会反馈给你，你可以继续讨论或再调用。',
    '- 需要先看总纲/章节再决定怎么改？那就先输出一个 outline_text / chapter_text 的标签，等结果回来。',
    '- chapter_rewrite 的 target 参数：从章节正文中复制一小段（一句话或几句话即可），不要带换行、不要带引号，取连续文本片段。',
    '- 如果工具执行失败（例如片段未找到），根据错误信息修正参数后自动重试一次，不要直接放弃或让作者手动操作。',
    '- 修改前先向作者说明你要改什么、为什么；动作执行后简要汇报结果。',
    '- 涉及删除类操作（删除章节、清空设定）必须等作者明确同意。',
    '- 严格忠于道藏与总纲；不得自行发明与既有设定冲突的内容。',
    '- 用中文回复。',
  ].join('\n')
}

// ------------------------------------------------------------- action exec

/** Execute one action directive. Returns a text result (or throws). */
/**
 * Execute one action directive as an async generator: yields live progress
 * text (chapter text being generated/rewritten), then yields the final result
 * string. Throws on failure.
 */
export async function* executeAction(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  name: string,
  args: Record<string, unknown>,
): AsyncGenerator<string, string, unknown> {
  const str = (value: unknown): string => typeof value === 'string' ? value : ''
  const num = (value: unknown): number | undefined => typeof value === 'number' ? value : undefined

  /** Forward live text deltas from a streaming chapter job (text only). */
  const forward = async function* (stream: AsyncGenerator<{ frame: 'start' } | { frame: 'delta'; text: string } | { frame: 'done'; file: string; chars: number } | { frame: 'drafted'; chars: number; draft: string }, void, unknown>): AsyncGenerator<string, void, unknown> {
    for await (const step of stream) {
      if (step.frame === 'delta') yield step.text
    }
  }

  switch (name) {
    case 'book_overview': {
      // 全书上下文包（分片：默认最近 30 章；scope=full 全量；scope=volume:N 指定卷）。
      const scopeArg = str(args.scope)
      const scope = scopeArg === 'full'
        ? 'full' as const
        : /^volume:(\d+)$/.test(scopeArg)
          ? Number(scopeArg.slice(7))
          : 'recent' as const
      return bookOverview(project, scope)
    }
    case 'facts_query': {
      // 从编年录按关键词检索相关事实。
      const keyword = str(args.keyword).trim()
      if (keyword === '') throw new Error('facts_query 需要 keyword')
      const hits = (project.facts ?? []).filter(f => f.text.includes(keyword)).slice(-30)
      if (hits.length === 0) return `编年录中未找到与「${keyword}」相关的事实记录。`
      return `编年录中与「${keyword}」相关的事实（${hits.length} 条）：\n` + hits.map(f => `- [第${f.chapterNo}章] ${f.text}`).join('\n')
    }
    case 'impact_analysis': {
      const change = str(args.change)
      if (change === '') throw new Error('impact_analysis 需要 change（要做的修改描述）')
      const items = await analyzeImpact(ctx, config, project, outputDir, change)
      if (items.length === 0) return '影响分析：未发现需要同步修改的位置。'
      const lines = items.map((it, i) => `${i + 1}. [${it.location}]「${it.quote}」${it.suggestion !== '' ? ` → ${it.suggestion}` : ''}（${it.kind === 'must' ? '必须同步' : it.kind === 'optional' ? '建议' : '备注'}）`)
      return `影响分析：这次改动波及 ${items.length} 处——\n${lines.join('\n')}\n请据此提示作者逐项处理；章节内的修改可引导作者在工作区查看。`
    }
    case 'outline_text': {
      return project.outline
    }
    case 'outline_replace': {
      const old = str(args.old)
      const next = str(args.new)
      if (old === '' || !project.outline.includes(old)) {
        throw new Error(`总纲中未找到片段「${old.slice(0, 40)}…」`)
      }
      project.outline = project.outline.replace(old, next)
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      return `总纲已修改：替换了 ${old.length} 字符的片段。`
    }
    case 'bible_set_rule': {
      if (project.bible === undefined) throw new Error('尚无道藏，请先提炼')
      const index = num(args.index)
      if (index !== undefined) {
        project.bible.worldRules[index] = str(args.text)
      } else if (str(args.append) !== '') {
        project.bible.worldRules.push(str(args.append))
      } else {
        throw new Error('bible_set_rule 需要 index+text 或 append')
      }
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      return `世界规则已更新（当前 ${project.bible.worldRules.length} 条）。`
    }
    case 'bible_set_redline': {
      if (project.bible === undefined) throw new Error('尚无道藏，请先提炼')
      const index = num(args.index)
      if (index !== undefined) {
        project.bible.redLines[index] = str(args.text)
      } else if (str(args.append) !== '') {
        project.bible.redLines.push(str(args.append))
      } else {
        throw new Error('bible_set_redline 需要 index+text 或 append')
      }
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      return `写作红线已更新（当前 ${project.bible.redLines.length} 条）。`
    }
    case 'chapter_text': {
      const no = num(args.no)
      if (no === undefined) throw new Error('chapter_text 需要 no')
      const chapter = project.chapters.find(c => c.no === no)
      if (chapter === undefined) throw new Error(`章节 ${no} 不存在`)
      const body = readChapterFile(outputDir, chapter)
      if (body === undefined) throw new Error(`章节 ${no} 尚未生成`)
      return body
    }
    case 'chapter_rewrite': {
      const no = num(args.no)
      if (no === undefined) throw new Error('chapter_rewrite 需要 no')
      const instructions = str(args.instructions)
      const target = str(args.target)
      for await (const chunk of forward(rewriteChapterStream(ctx, config, project, outputDir, no, instructions, target === '' ? undefined : target))) {
        yield chunk
      }
      // Draft mode: the assistant acts on the user's explicit instruction, so
      // apply the draft immediately — summarize/review must see the new body.
      const chapter = project.chapters.find(c => c.no === no)
      const draft = chapter?.pendingDraft
      if (chapter === undefined || draft === undefined || draft === '') {
        throw new Error(`章节 ${no} 修订后没有产出草稿`)
      }
      const fileName = chapterFileName(chapter)
      mkdirSync(outputDir, { recursive: true })
      writeFileSync(join(outputDir, fileName), `# 第${chapter.no}章 ${chapter.title}\n\n${draft}\n`, 'utf8')
      chapter.pendingDraft = undefined
      chapter.status = 'written'
      chapter.chars = draft.length
      chapter.file = fileName
      chapter.review = undefined
      chapter.error = undefined
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      yield '（已采纳修订稿，正在生成章节摘要与编年录…）'
      try {
        await summarizeAndExtractFacts(ctx, config, project, outputDir, no)
      } catch { /* best-effort */ }
      yield '（正在 AI 审稿…）'
      const report = await reviewChapter(ctx, config, project, outputDir, no)
      return `章节 ${no} 已${target === '' ? '整章' : '局部'}修订完成（${project.chapters.find(c => c.no === no)?.chars ?? '?'} 字）。重新审稿：${report.score} 分 — ${report.verdict}`
    }
    case 'chapter_generate': {
      const no = num(args.no)
      if (no === undefined) throw new Error('chapter_generate 需要 no')
      for await (const chunk of forward(generateChapterStream(ctx, config, project, outputDir, no))) {
        yield chunk
      }
      yield '（正在生成章节摘要与编年录…）'
      try {
        await summarizeAndExtractFacts(ctx, config, project, outputDir, no)
      } catch { /* best-effort */ }
      yield '（正在 AI 审稿…）'
      const report = await reviewChapter(ctx, config, project, outputDir, no)
      return `章节 ${no} 已生成（${project.chapters.find(c => c.no === no)?.chars ?? '?'} 字）。审稿：${report.score} 分 — ${report.verdict}`
    }
    case 'chapter_review': {
      const no = num(args.no)
      if (no === undefined) throw new Error('chapter_review 需要 no')
      const report = await reviewChapter(ctx, config, project, outputDir, no)
      const issues = report.issues.map(i => `[${i.severity}] ${i.item} → ${i.suggestion}`).join('\n')
      return `章节 ${no} 审稿：${report.score} 分 — ${report.verdict}\n${issues}`
    }
    case 'foreshadow_add': {
      const description = str(args.description)
      if (description === '') throw new Error('foreshadow_add 需要 description')
      const targetChapter = num(args.targetChapter)
      project.foreshadows.push({
        id: `fs-${Date.now().toString(36)}`,
        description,
        targetChapter,
        status: 'planned',
      })
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      return `已新增暗线：「${description.slice(0, 50)}」`
    }
    case 'foreshadow_update': {
      const id = str(args.id)
      const status = str(args.status) as 'planned' | 'planted' | 'progressing' | 'resolved' | 'abandoned'
      const target = project.foreshadows.find(f => f.id === id)
      if (target === undefined) throw new Error(`暗线 ${id} 不存在`)
      if (!['planned', 'planted', 'progressing', 'resolved', 'abandoned'].includes(status)) {
        throw new Error(`非法状态 ${status}`)
      }
      target.status = status
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      return `暗线已更新为 ${status}：「${target.description.slice(0, 50)}」`
    }
    case 'export_txt': {
      const result = exportBook(outputDir, project, 'txt')
      return `已导出 TXT：${result.file}（${result.chars} 字，${result.chapters} 章）`
    }
    case 'assets_status': {
      const assets = project.assets
      if (assets === undefined) return '本书尚未配置写作资产。'
      const parts: string[] = []
      if (assets.genre !== undefined) parts.push(`题材：${assets.genre.name}`)
      if (assets.primaryProgression !== undefined) parts.push(`主推进：${assets.primaryProgression.name}`)
      if (assets.auxiliaryProgressions.length > 0) parts.push(`辅助推进：${assets.auxiliaryProgressions.map(m => m.name).join('、')}`)
      if (assets.antiAiRules.length > 0) parts.push(`自定义反AI规则：${assets.antiAiRules.map(r => r.name).join('、')}`)
      if (assets.styleAssets.length > 0) parts.push(`写法资产：${assets.styleAssets.map(s => s.name).join('、')}`)
      return parts.length > 0 ? parts.join('\n') : '本书尚未配置写作资产。'
    }
    case 'assets_set_genre': {
      const name = str(args.name)
      const description = str(args.description)
      if (name === '') throw new Error('assets_set_genre 需要 name')
      if (project.assets === undefined) project.assets = emptyProjectAssets()
      project.assets.genre = { name, description, children: [] }
      project.assets.updatedAt = new Date().toISOString()
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      return `题材已设为「${name}」`
    }
    case 'assets_set_progression': {
      const name = str(args.name)
      const driver = str(args.driver)
      const primary = args.primary !== false
      if (name === '') throw new Error('assets_set_progression 需要 name')
      if (project.assets === undefined) project.assets = emptyProjectAssets()
      const mode = {
        name,
        driver: driver !== '' ? driver : name,
        readerExpectation: str(args.readerExpectation),
        payoffs: Array.isArray(args.payoffs) ? args.payoffs.filter((v): v is string => typeof v === 'string') : [],
        risks: Array.isArray(args.risks) ? args.risks.filter((v): v is string => typeof v === 'string') : [],
        primary,
      }
      if (primary) project.assets.primaryProgression = mode
      else {
        if (project.assets.auxiliaryProgressions === undefined) project.assets.auxiliaryProgressions = []
        project.assets.auxiliaryProgressions.push(mode)
      }
      project.assets.updatedAt = new Date().toISOString()
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      return `推进模式${primary ? '（主）' : '（辅助）'}已设置：「${name}」`
    }
    case 'assets_add_rule': {
      const name = str(args.name)
      const avoid = str(args.avoid)
      if (avoid === '') throw new Error('assets_add_rule 需要 avoid（要避免的表达问题）')
      if (project.assets === undefined) project.assets = emptyProjectAssets()
      if (project.assets.antiAiRules === undefined) project.assets.antiAiRules = []
      project.assets.antiAiRules.push({
        name: name !== '' ? name : `自定义规则 ${project.assets.antiAiRules.length + 1}`,
        avoid,
        fix: str(args.fix),
      })
      project.assets.updatedAt = new Date().toISOString()
      project.updatedAt = new Date().toISOString()
      saveProject(outputDir, project)
      return `已新增反 AI 规则「${name !== '' ? name : avoid.slice(0, 20)}」`
    }
    default:
      throw new Error(`未知工具 ${name}`)
  }
}

// ------------------------------------------------------------------- chat

/** Extract the first action directive from a reply (tolerant to common tag misspellings). */
function extractAction(reply: string): { name: string; args: Record<string, unknown>; index: number } | undefined {
  // 容错：dsh-action 的常见误拼（dash-action / dsah-action / dhs-action 等）。
  const match = /<([a-z_]*d[a-z]?sh?-action)\s+name="([^"]+)"\s*>([\s\S]*?)<\/\1>/.exec(reply)
  if (match === null) return undefined
  const rawArgs = match[3]?.trim() ?? ''
  let args: Record<string, unknown>
  try {
    args = rawArgs === '' ? {} : JSON.parse(rawArgs) as Record<string, unknown>
  } catch {
    throw new Error(`动作参数不是合法 JSON：${rawArgs.slice(0, 80)}`)
  }
  return { name: match[2] ?? '', args, index: match.index }
}

/** Render the recent history as LLM messages (skipping tool chatter in early rounds). */
function historyToMessages(history: AssistantMessage[]): Message[] {
  const recent = history.slice(-MAX_HISTORY_MESSAGES)
  const messages: Message[] = []
  for (const entry of recent) {
    if (entry.role === 'user') {
      messages.push(createUserMessage({
        content: [{ type: 'text', text: entry.content }],
        source: { kind: 'plugin', plugin: 'dsh-novel-forge' },
      }))
    } else if (entry.role === 'assistant') {
      messages.push(createAssistantMessage({
        content: [{ type: 'text', text: entry.content }],
        source: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      }))
    } else if (entry.role === 'tool') {
      // 工具结果（book_overview/总纲全文等可能很大）截断后进上下文，
      // 避免多轮对话上下文翻倍膨胀触发「上下文到限制」。
      const body = entry.content.length > 2000
        ? entry.content.slice(0, 2000) + '\n…（结果过长已截断，需要完整内容请重新调用工具）'
        : entry.content
      messages.push(createUserMessage({
        content: [{ type: 'text', text: `【工具 ${entry.tool ?? ''} 的执行结果】\n${body}` }],
        source: { kind: 'plugin', plugin: 'dsh-novel-forge' },
      }))
    }
  }
  return messages
}

/** One non-streaming LLM chat turn (used inside the tool loop). */
async function chatOnce(
  ctx: Context,
  config: NovelConfig,
  system: string,
  history: AssistantMessage[],
): Promise<string> {
  const messages = historyToMessages(history)
  // 纪律提醒贴在最后一条消息（当前用户输入）末尾：紧邻模型要生成回复的位置，
  // 比放在 system 里更不容易被长上下文稀释（位置效应）。
  // 注意：dsh-llm 的消息/内容块对象是只读的，必须重建新对象，不能直接改属性。
  const last = messages[messages.length - 1]
  if (last?.role === 'user' && Array.isArray(last.content)) {
    const blocks = last.content as ContentBlock[]
    const idx = blocks.findIndex(b => b.type === 'text')
    if (idx !== -1) {
      const textBlock = blocks[idx] as { type: 'text'; text: string }
      const newBlocks: ContentBlock[] = blocks.map((b, i) => i === idx
        ? { ...textBlock, text: textBlock.text + '\n\n（回复格式提醒：如果你需要执行任何操作，你的回复必须【只包含】一个 <dsh-action name="工具名">{"参数":值}</dsh-action> 标签，禁止先说话、禁止解释、禁止铺垫；如果你只是在回答或讨论，正常回复即可，不要输出标签。）' }
        : b)
      messages[messages.length - 1] = { ...last, content: newBlocks }
    }
  }
  const request: GenerateOptions = {
    provider: config.provider,
    model: config.model,
    messages,
    system,
    // v4-flash 推理模型：reasoning channel 占预算，给足避免回复被截断。
    maxTokens: Math.max(config.maxTokens, 16000),
    temperature: 0.7,
  }
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream(request)) {
    assembler.push(chunk)
  }
  const finish = assembler.finish
  if (finish.kind === 'error' || finish.kind === 'aborted') {
    throw new Error(`助手调用失败（${finish.kind}）: ${finish.failure.message}`)
  }
  const blocks = assembler.blocks()
  const textBlocks = blocks
    .filter((block): block is Extract<StreamChunk, { type: 'block-end' }>['block'] & { type: 'text' } => block.type === 'text')
    .map(block => block.text)
  let text = textBlocks.join('\n').trim()
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

/** Run one user turn. Yields stream frames; persists history. */
export async function* runAssistantTurn(
  ctx: Context,
  config: NovelConfig,
  project: ProjectState,
  outputDir: string,
  userMessage: string,
): AsyncGenerator<
  | { frame: 'delta'; text: string }
  | { frame: 'tool'; name: string; status: 'start' | 'done' | 'error'; detail?: string }
  | { frame: 'toolDelta'; name: string; text: string },
  void,
  unknown
> {
  const history = loadAssistantHistory(outputDir)
  const system = assistantSystemPrompt(project)

  // Persist the user message.
  const userEntry: AssistantMessage = { role: 'user', content: userMessage, ts: new Date().toISOString() }
  history.push(userEntry)
  appendHistory(outputDir, userEntry)

  let round = 0
  /** 已提示模型输出动作标签的次数（0 = 尚未提示；超过上限则按纯文字回复结束，防死循环）。 */
  let nudged = 0
  const MAX_NUDGES = 6
  /** 连续收到 hex 乱码回复的次数（≥2 次判定 LLM 侧异常，放弃本轮避免死循环）。 */
  let garbleCount = 0
  for (;;) {
    if (round++ > 20) break
    const reply = await chatOnce(ctx, config, system, history)

    // 异常输出防护：全 hex/二进制乱码（模型偶发把回复编码成十六进制）——丢弃重试一次。
    const hexLike = reply.length > 120 && /^[0-9a-fA-F\s]+$/.test(reply.slice(0, 2000))
    if (hexLike) {
      garbleCount++
      if (garbleCount >= 2) {
        const garbleEntry: AssistantMessage = { role: 'assistant', content: '（模型本次返回了异常编码内容，已忽略；请重新描述你的问题。）', ts: new Date().toISOString() }
        history.push(garbleEntry)
        appendHistory(outputDir, garbleEntry)
        yield { frame: 'delta', text: garbleEntry.content }
        return
      }
      continue
    }

    const action = extractAction(reply)

    if (action === undefined) {
      // No parseable action tag. If the reply clearly intends to modify
      // something (or contains a malformed action tag), nudge — repeatedly,
      // with escalating firmness, until the model emits a tag or gives up.
      const intendsAction = /(改|修改|修订|重写|替换|调整|生成|新增|删除|导出|看看|查看|调出|读一下|加上|加一个|去掉|删掉|把.+改成|定位|处理|转轨|检查|确认|搜索|找一下|列一下|查一下|查一遍|查一查|再查|查查|核实|核对|清点|盘点|看一下|看下|继续)/.test(reply)
      // 兜底：回复提到任何可操作对象名词（即使动词是"看/查/说"的变体）也视为有操作意图，
      // 避免"先查一遍编年录"这类措辞漏网被静默当作纯聊天。
      const mentionsTarget = /(编年录|道藏|暗线|总纲|卷首语|章节|正文|规则|红线|伏笔|简介|大纲|事实|设定|世界|角色|人物|第\s*\d+\s*章)/.test(reply)
      const strayTag = /<[a-z_-]*action[^>]*>/.test(reply)
      if ((intendsAction || mentionsTarget || strayTag) && nudged < MAX_NUDGES) {
        const nudge = nudged === 0
          ? '你的上一条回复表达了想操作项目的意图（或动作标签格式有误），因此没有执行任何操作。请直接输出动作标签来执行，格式必须为 <dsh-action name="工具名">{"参数":值}</dsh-action>（注意拼写是 dsh-action，不是 dash-action；标签成对出现，参数为合法 JSON）。如果需要先看内容，先输出 outline_text 或 chapter_text 标签。'
          : `你第 ${nudged + 1} 次表达了操作意图但没有输出动作标签，因此仍未执行任何操作。铁律：你的【整个回复】现在必须只包含一个 <dsh-action> 标签（例如 <dsh-action name="chapter_text">{"no":1}</dsh-action>），禁止任何解释、铺垫或"我这就去"之类的文字。若你其实不打算执行任何操作，请明确回复「不执行」。`
        nudged++
        history.push({ role: 'tool', content: nudge, tool: 'format-hint', ts: new Date().toISOString() })
        appendHistory(outputDir, { role: 'tool', content: nudge, tool: 'format-hint', ts: new Date().toISOString() })
        continue
      }
      // Plain prose reply — done.
      const assistantEntry: AssistantMessage = { role: 'assistant', content: reply, ts: new Date().toISOString() }
      history.push(assistantEntry)
      appendHistory(outputDir, assistantEntry)
      // Stream the prose (without any stray action markup).
      yield { frame: 'delta', text: reply }
      return
    }

    // Execute the action, then feed the result back and continue.
    const { name, args, index } = action
    const prose = reply.slice(0, index).trim()
    yield { frame: 'tool', name, status: 'start' }
    let result: string
    try {
      // executeAction is an async generator: it yields live progress text
      // (chapter text being generated) and returns the final result string.
      // Iterate manually so we see both the yielded deltas and the return.
      const iterator = executeAction(ctx, config, project, outputDir, name, args)[Symbol.asyncIterator]()
      result = ''
      for (;;) {
        const step = await iterator.next()
        if (step.done === true) {
          result = typeof step.value === 'string' ? step.value : ''
          break
        }
        const chunk = step.value
        if (typeof chunk === 'string' && chunk !== '') {
          yield { frame: 'toolDelta', name, text: chunk }
        }
      }
      yield { frame: 'tool', name, status: 'done', detail: result.slice(0, 200) }
    } catch (error) {
      result = `执行失败：${(error as Error).message}`
      yield { frame: 'tool', name, status: 'error', detail: (error as Error).message }
    }

    // Persist assistant prose + tool result as history entries.
    if (prose !== '') {
      history.push({ role: 'assistant', content: prose, ts: new Date().toISOString() })
      appendHistory(outputDir, { role: 'assistant', content: prose, ts: new Date().toISOString() })
    }
    history.push({ role: 'tool', content: result, tool: name, ts: new Date().toISOString() })
    appendHistory(outputDir, { role: 'tool', content: result, tool: name, ts: new Date().toISOString() })

    round++
    if (round >= MAX_TOOL_ROUNDS) {
      const message = `（已连续执行 ${round} 次修改操作，本轮停止。如需继续请再说。）`
      history.push({ role: 'assistant', content: message, ts: new Date().toISOString() })
      appendHistory(outputDir, { role: 'assistant', content: message, ts: new Date().toISOString() })
      yield { frame: 'delta', text: message }
      return
    }
  }
}

export { chapterFileName }
