/**
 * The novel-forge workbench panel: tabs — 工作流 (guided pipeline), 大纲
 * (outline), 章节 (chapter plan + per-chapter write/review/rewrite/polish),
 * 设定库 (story bible), 伏笔 (foreshadows), 设置 (config). Generation and
 * review streams land in the progress console.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { NovelApi } from '../api.ts'
import type { PanelController } from './controller.ts'
import { tt } from './helpers.ts'
import { AssistantTab } from './AssistantTab.tsx'
import { AssetsTab } from './AssetsTab.tsx'
import { ShelfView } from './ShelfView.tsx'
import { CreateBookView } from './CreateBookView.tsx'
import { WorldTab } from './WorldTab.tsx'
import { extractDocxTextFromBuffer } from '../docx.ts'
import type {
  BookshelfSnapshot,
  ChapterPlan,
  Foreshadow,
  JobFrame,
  NovelConfig,
  Plotline,
  ProjectState,
  ReviewReport,
  SensitiveHit,
  StoryBible,
  Volume,
} from '../../protocol.ts'
import css from './panel.module.css'

/** The panel's tab identifiers. */
export type NovelTab =
  | 'workflow' | 'overview' | 'blurb' | 'plan' | 'bible' | 'world' | 'foreshadow' | 'assistant' | 'settings'
  | 'characters' | 'facts' | 'plotlines'
  | 'assetsGenre' | 'assetsProgression' | 'assetsTemplates' | 'assetsRules' | 'assetsStyle'

/** Panel shell props. */
export interface NovelPanelProps {
  /** The panel state owner (open/close/toggle). */
  controller: PanelController
  /** The API client every tab operates through. */
  api: NovelApi
}

/** One progress console line. */
interface ProgressLine {
  id: number
  text: string
  kind: 'info' | 'done' | 'error'
  /** Live line: a single in-place-updating row (generation counter + bar). */
  live?: boolean
  /** 0..1 completion ratio for the live line's progress bar. */
  ratio?: number
}

/** The navigation groups (AI-Novel-Writing-Assistant style grouping). */
const NAV_GROUPS: ReadonlyArray<{ id: string; label: string; items: ReadonlyArray<{ id: NovelTab; label: string; icon: string }> }> = [
  {
    id: 'create',
    label: '创作',
    items: [
      { id: 'workflow', label: tt('tab.workflow'), icon: '🛠️' },
      { id: 'overview', label: tt('tab.overview'), icon: '📄' },
      { id: 'blurb', label: '卷首语', icon: '📖' },
      { id: 'plan', label: tt('tab.plan'), icon: '📚' },
      { id: 'plotlines', label: tt('tab.plotlines'), icon: '🧵' },
    ],
  },
  {
    id: 'tools',
    label: '工具',
    items: [
      { id: 'assistant', label: tt('tab.assistant'), icon: '💬' },
    ],
  },
  {
    id: 'db',
    label: '数据库',
    items: [
      { id: 'bible', label: tt('tab.bible'), icon: '📖' },
      { id: 'world', label: '大世界', icon: '🌍' },
      { id: 'characters', label: '人物志', icon: '👥' },
      { id: 'foreshadow', label: tt('tab.foreshadow'), icon: '🔮' },
      { id: 'facts', label: tt('tab.facts'), icon: '📜' },
      { id: 'assetsGenre', label: '题材基底', icon: '🏷️' },
      { id: 'assetsProgression', label: '推进模式', icon: '📈' },
      { id: 'assetsTemplates', label: '笔法帖', icon: '🖋️' },
      { id: 'assetsRules', label: '文戒', icon: '🚫' },
      { id: 'assetsStyle', label: '心法', icon: '🎨' },
    ],
  },
]

/** Settings tab — pinned to the bottom of the nav rail. */
const SETTINGS_TAB: { id: NovelTab; label: string; icon: string } = { id: 'settings', label: tt('tab.settings'), icon: '⚙️' }

/** 构建时注入的插件版本（tsdown define 替换为字符串字面量）。 */
declare const __NOVEL_FORGE_VERSION__: string | undefined
const PLUGIN_VERSION: string = typeof __NOVEL_FORGE_VERSION__ !== 'undefined' ? __NOVEL_FORGE_VERSION__ : '0.0.0'
/** GitHub 仓库地址（关于区块点击跳转）。 */
const REPO_URL = 'https://github.com/watersxya/dsh-novel-forge'

/** Whether any chapter is being generated right now. */
function anyGenerating(chapters: ChapterPlan[] | undefined): boolean {
  return (chapters ?? []).some(c => c.status === 'generating' || c.status === 'reviewing')
}

/** Status badge class + label. */
function statusBadge(chapter: ChapterPlan): { cls: string; label: string } {
  switch (chapter.status) {
    case 'pending': return { cls: css.badgePending, label: tt('plan.pending') }
    case 'generating': return { cls: css.badgeGenerating, label: tt('plan.generating') }
    case 'written': return { cls: css.badgeWritten, label: tt('plan.written') }
    case 'reviewing': return { cls: css.badgeGenerating, label: tt('plan.reviewing') }
    case 'approved': return { cls: css.badgeDone, label: tt('plan.approved') }
    case 'rejected': return { cls: css.badgeRejected, label: tt('plan.rejected') }
    case 'error': return { cls: css.badgeError, label: tt('plan.error') }
  }
}

/** One review issue line (severity-colored, theme-aware). */
function severityColor(severity: string): string {
  return severity === 'high' ? 'var(--nf-error)' : severity === 'medium' ? 'var(--nf-warn)' : 'var(--nf-info)'
}

/** One row of a chapter-level diff (paragraph granularity). */
type DiffRow =
  | { kind: 'same'; text: string }
  | { kind: 'change'; old: string; neu: string }
  | { kind: 'del'; text: string }
  | { kind: 'add'; text: string }

/**
 * Paragraph-level LCS diff between an original chapter body and its
 * rewrite/polish draft. Adjacent delete+add runs merge into "change" pairs
 * (the common case: a reworded paragraph shown as old → new).
 */
function paragraphDiff(oldText: string, newText: string): DiffRow[] {
  const split = (t: string): string[] =>
    t.replace(/^#\s+.*$/m, '').trim().split(/\n{2,}/).map(p => p.trim()).filter(p => p !== '')
  const a = split(oldText)
  const b = split(newText)
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const rows: DiffRow[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      rows.push({ kind: 'same', text: a[i]! })
      i++
      j++
    } else if (i < n && (j >= m || dp[i + 1]![j]! >= dp[i]![j + 1]!)) {
      rows.push({ kind: 'del', text: a[i]! })
      i++
    } else if (j < m) {
      rows.push({ kind: 'add', text: b[j]! })
      j++
    } else if (i < n) {
      rows.push({ kind: 'del', text: a[i]! })
      i++
    } else {
      rows.push({ kind: 'add', text: b[j]! })
      j++
    }
  }
  // Merge adjacent del/add runs into change pairs.
  const merged: DiffRow[] = []
  let k = 0
  while (k < rows.length) {
    const row = rows[k]!
    if (row.kind !== 'del' && row.kind !== 'add') {
      merged.push(row)
      k++
      continue
    }
    const dels: string[] = []
    const adds: string[] = []
    while (k < rows.length && (rows[k]!.kind === 'del' || rows[k]!.kind === 'add')) {
      if (rows[k]!.kind === 'del') dels.push((rows[k] as { text: string }).text)
      else adds.push((rows[k] as { text: string }).text)
      k++
    }
    if (dels.length > 0 && adds.length > 0) {
      merged.push({ kind: 'change', old: dels.join('\n\n'), neu: adds.join('\n\n') })
    } else if (dels.length > 0) {
      for (const d of dels) merged.push({ kind: 'del', text: d })
    } else {
      for (const ad of adds) merged.push({ kind: 'add', text: ad })
    }
  }
  return merged
}

/** 把章节 beats 按结构标签渲染（本章目标/剧情要点/爽点/结尾钩子 等）。 */
function renderBeats(beats: string): ReactElement {
  const lines = beats.split('\n')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {lines.map((line, i) => {
        const trimmed = line.trim()
        const match = /^([^：:]{2,14})[：:]/.exec(trimmed)
        if (match !== null) {
          return (
            <div key={i}>
              <b style={{ color: 'var(--nf-accent)' }}>{match[1]}</b>
              {trimmed.slice(match[0].length)}
            </div>
          )
        }
        return <div key={i}>{line}</div>
      })}
    </div>
  )
}

/** The diff list of a draft-vs-original comparison (scrollable). */
function DiffList({ original, draft, fontSize }: { original: string; draft: string; fontSize?: number }): ReactElement {  const rows = useMemo(() => paragraphDiff(original, draft), [original, draft])
  const changed = rows.filter(r => r.kind === 'change').length
  const added = rows.filter(r => r.kind === 'add').length
  const removed = rows.filter(r => r.kind === 'del').length
  const [onlyChanges, setOnlyChanges] = useState(false)
  const shown = onlyChanges ? rows.filter(r => r.kind !== 'same') : rows
  return (
    <>
      <div className={css.diffLegend}>
        <span className={css.legendOld}>■ 原稿</span>
        <span className={css.legendNew}>■ 新稿</span>
        <span className={css.meta}>
          原 {original.length} 字 → 新 {draft.length} 字 · 修改 {changed} · 新增 {added} · 删除 {removed}
        </span>
        <label className={css.onlyChanges}>
          <input
            type="checkbox"
            checked={onlyChanges}
            onChange={e => { setOnlyChanges(e.target.checked) }}
          />
          只看改动
        </label>
      </div>
      <div className={css.diffList} style={fontSize !== undefined ? { fontSize } : undefined}>
        {shown.map((row, idx) => {
          if (row.kind === 'same') {
            return (
              <details key={idx} className={css.diffSame}>
                <summary>第 {idx + 1} 段 · 未改动（点击展开）</summary>
                <div className={css.diffSameBody}>{row.text}</div>
              </details>
            )
          }
          if (row.kind === 'change') {
            return (
              <div key={idx} className={css.diffChange}>
                <div className={css.diffColumn}>
                  <span className={css.diffTagOld}>原稿</span>
                  <div className={css.diffOld}>{row.old}</div>
                </div>
                <div className={css.diffColumn}>
                  <span className={css.diffTagNew}>新稿</span>
                  <div className={css.diffNew}>{row.neu}</div>
                </div>
              </div>
            )
          }
          if (row.kind === 'del') {
            return (
              <div key={idx} className={css.diffDel}>
                <span className={css.diffTagOld}>原稿</span>
                <span className={css.diffText}>{row.text}</span>
              </div>
            )
          }
          return (
            <div key={idx} className={css.diffAdd}>
              <span className={css.diffTagNew}>新稿</span>
              <span className={css.diffText}>{row.text}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}

/** The novel-forge panel. */
export function NovelPanel({ controller, api }: NovelPanelProps) {
  const [activeTab, setActiveTab] = useState<NovelTab>('workflow')
  const [config, setConfig] = useState<NovelConfig | null>(null)
  const [project, setProject] = useState<ProjectState | null>(null)
  const [generatedFiles, setGeneratedFiles] = useState<string[]>([])
  const [outlineText, setOutlineText] = useState('')
  const [customDocxPath, setCustomDocxPath] = useState('')
  const [shelf, setShelf] = useState<BookshelfSnapshot | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [planCount, setPlanCount] = useState(30)
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [progress, setProgress] = useState<ProgressLine[]>([])
  const [configDraft, setConfigDraft] = useState<NovelConfig | null>(null)
  const [expandedChapter, setExpandedChapter] = useState<number | null>(null)
  const [chapterText, setChapterText] = useState('')
  const progressId = useRef(0)
  /** id of the single live progress row (generation counter), if any. */
  const liveProgressId = useRef<number | null>(null)
  /** last chars value rendered into the live row (throttle for streaming). */
  const lastDeltaChars = useRef(0)
  /** cumulative chars received this job (delta frames carry increments). */
  const liveChars = useRef(0)
  /** chapter no of the job currently streaming (delta frames carry no `no`). */
  const currentJobNo = useRef(0)
  /** prominent top-of-panel progress bar while a chapter is being written. */
  const [liveBar, setLiveBar] = useState<{ text: string; ratio?: number } | null>(null)
  /** 润色/修订工作区：左栏原文（可选中局部目标）+ 右栏指令/预览/应用。 */
  const [workspace, setWorkspace] = useState<{
    no: number
    title: string
    original: string
    instruction: string
    draft: string | null
  } | null>(null)
  /** 工作区左栏当前选中的文字（局部修订目标）。 */
  const [wsSelected, setWsSelected] = useState('')
  /** 工作区预览区：diff 对比视图开关。 */
  const [wsShowDiff, setWsShowDiff] = useState(false)
  /** 工作区原文 textarea 引用（用于捕获选中文字）。 */
  const wsEditorRef = useRef<HTMLTextAreaElement | null>(null)
  /** 工作区：手动编辑后的 AI 审查结果（不落盘）。 */
  const [wsCheckReport, setWsCheckReport] = useState<ReviewReport | null>(null)
  /** 手动审查结果中作者勾选要修复的问题（issue 下标）。 */
  const [wsChecked, setWsChecked] = useState<number[]>([])
  /** 编辑页字号（localStorage 记忆，仅影响显示）。 */
  const [editorFontSize, setEditorFontSize] = useState<number>(() => {
    try {
      const v = Number(window.localStorage.getItem('dsh-novel-forge.editor.fontSize'))
      return v >= 12 && v <= 24 ? v : 14
    } catch { return 14 }
  })
  const changeEditorFontSize = (next: number): void => {
    const v = Math.min(24, Math.max(12, next))
    setEditorFontSize(v)
    try { window.localStorage.setItem('dsh-novel-forge.editor.fontSize', String(v)) } catch { /* ignore */ }
  }
  /** 面板主题（localStorage 记忆）：'liquid'=iOS 液态玻璃（绿） / 'classic'=经典毛玻璃（蓝） / 'neumorph'=新拟物（浅色）。 */
  const [panelTheme, setPanelTheme] = useState<'liquid' | 'classic' | 'neumorph'>(() => {
    try {
      const v = window.localStorage.getItem('dsh-novel-forge.theme')
      return v === 'classic' || v === 'neumorph' ? v : 'liquid'
    } catch { return 'liquid' }
  })
  const changePanelTheme = (next: 'liquid' | 'classic' | 'neumorph'): void => {
    setPanelTheme(next)
    try { window.localStorage.setItem('dsh-novel-forge.theme', next) } catch { /* ignore */ }
  }
  /** 有未采纳草稿的章节号（refresh 后检测到遗留草稿时提示）。 */
  const [draftNo, setDraftNo] = useState<number | null>(null)
  /** 大纲页「更新大纲」编辑区是否展开。 */
  const [updatingOutline, setUpdatingOutline] = useState(false)
  /** 全书质检结果（null = 未运行）。 */
  const [auditIssues, setAuditIssues] = useState<import('../../protocol.ts').AuditIssue[] | null>(null)
  /** 角色卡（从事实库聚合）。 */
  const [charCards, setCharCards] = useState<import('../../protocol.ts').RoleStatusCard[] | null>(null)
  /** 世界观规则编辑草稿（bible tab，每行一条）。 */
  const [worldRulesDraft, setWorldRulesDraft] = useState('')
  /** 小说简介编辑草稿。 */
  const [blurbDraft, setBlurbDraft] = useState('')
  /** 书名编辑草稿（简介页改名用）。 */
  const [bookNameDraft, setBookNameDraft] = useState('')
  /** 封面 dataUrl（无封面为 null）。 */
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null)
  /** 封面文件选择。 */
  const coverFileRef = useRef<HTMLInputElement | null>(null)
  /** 章节列表按卷折叠（存已折叠的卷号）。 */
  const [collapsedVolumes, setCollapsedVolumes] = useState<number[]>([])
  /** 章节页当前选中的卷（'all' = 全部卷显示在一起）。 */
  const [selectedVolume, setSelectedVolume] = useState<number | 'all'>('all')
  /** 剧情线编辑草稿（null = 未在编辑）。 */
  const [plotlineDraft, setPlotlineDraft] = useState<{
    id: string
    name: string
    kind: Plotline['kind']
    goal: string
    progress: string
    status: Plotline['status']
  } | null>(null)
  /** 角色知情度编辑草稿（角色名 → 文本，每行一条）。 */
  const [knowledgeDraft, setKnowledgeDraft] = useState<Record<string, string>>({})
  /** 全书敏感词检查结果（null = 未运行）。 */
  const [sensHits, setSensHits] = useState<SensitiveHit[] | null>(null)
  const [sensScanned, setSensScanned] = useState(0)
  /** npm 最新版本（更新检测；null = 未检测/检测失败）。 */
  const [npmLatest, setNpmLatest] = useState<string | null>(null)
  /** 活动输出容器：自动滚动锚点（有新活动时跟随到底部）。 */
  const progressEndRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [progress])

  /** 后台检测 npm 最新版本（失败静默，不打扰）。 */
  useEffect(() => {
    let cancelled = false
    void fetch('https://registry.npmjs.org/@waterwx%2Fdsh-novel-forge')
      .then(response => response.json() as Promise<{ 'dist-tags'?: { latest?: string } }>)
      .then(data => {
        if (!cancelled && data['dist-tags']?.latest !== undefined) setNpmLatest(data['dist-tags'].latest)
      })
      .catch(() => { /* best-effort */ })
    return () => { cancelled = true }
  }, [])
  /** AI 助手悬浮窗：是否打开。 */
  const [assistantOpen, setAssistantOpen] = useState(false)
  /** 悬浮窗位置（相对面板，localStorage 记忆）。 */
  const [assistantPos, setAssistantPos] = useState(() => {
    try {
      const raw = window.localStorage.getItem('dsh-novel-forge.assistant.float')
      if (raw !== null) {
        const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown }
        return { x: typeof parsed.x === 'number' ? parsed.x : 260, y: typeof parsed.y === 'number' ? parsed.y : 60 }
      }
    } catch { /* ignore */ }
    return { x: 260, y: 60 }
  })
  /** 悬浮窗尺寸（localStorage 记忆）。 */
  const [assistantSize, setAssistantSize] = useState(() => {
    try {
      const raw = window.localStorage.getItem('dsh-novel-forge.assistant.size')
      if (raw !== null) {
        const parsed = JSON.parse(raw) as { w?: unknown; h?: unknown }
        return { w: typeof parsed.w === 'number' ? parsed.w : 420, h: typeof parsed.h === 'number' ? parsed.h : 460 }
      }
    } catch { /* ignore */ }
    return { w: 420, h: 460 }
  })
  /** 拖拽/缩放状态。 */
  const dragState = useRef<{ type: 'move' | 'resize'; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number } | null>(null)

  /** 悬浮窗位置/尺寸持久化。 */
  useEffect(() => {
    try {
      window.localStorage.setItem('dsh-novel-forge.assistant.float', JSON.stringify(assistantPos))
      window.localStorage.setItem('dsh-novel-forge.assistant.size', JSON.stringify(assistantSize))
    } catch { /* ignore */ }
  }, [assistantPos, assistantSize])

  /** 全局拖拽/缩放监听（挂一次，靠 dragState 判断）。 */
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const s = dragState.current
      if (s === null) return
      if (s.type === 'move') {
        setAssistantPos({
          x: Math.max(-340, Math.min(s.origX + e.clientX - s.startX, 3000)),
          y: Math.max(0, Math.min(s.origY + e.clientY - s.startY, 3000)),
        })
      } else {
        setAssistantSize({
          w: Math.max(320, Math.min(s.origW + e.clientX - s.startX, 1400)),
          h: Math.max(220, Math.min(s.origH + e.clientY - s.startY, 1200)),
        })
      }
    }
    const onUp = (): void => { dragState.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])
  /** 左侧导航折叠状态（localStorage 记忆，参照 AI-Novel-Writing-Assistant 侧边栏）。 */
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try { return window.localStorage.getItem('dsh-novel-forge.nav.collapsed') === 'true' } catch { return false }
  })
  /** 视图：shelf = 书架首页；create = 开书向导；workspace = 当前书工作台。 */
  const [viewMode, setViewMode] = useState<'shelf' | 'create' | 'workspace'>('shelf')

  /** Refresh bookshelf. */
  const refreshShelf = useCallback(async () => {
    try {
      const snapshot = await api.bookshelf()
      setShelf(snapshot)
    } catch { /* shelf is best-effort */ }
  }, [api])

  /** Append a progress console line. */
  const pushProgress = useCallback((text: string, kind: ProgressLine['kind'] = 'info') => {
    setProgress(prev => [...prev.slice(-300), { id: progressId.current++, text, kind }])
  }, [])

  /** Update the single live progress row in place (create it on first call). */
  const setLiveProgress = useCallback((text: string, ratio?: number) => {
    setProgress(prev => {
      if (liveProgressId.current !== null) {
        return prev.map(l => l.id === liveProgressId.current ? { ...l, text, ratio } : l)
      }
      const id = progressId.current++
      liveProgressId.current = id
      return [...prev.slice(-300), { id, text, kind: 'info', live: true, ratio }]
    })
  }, [])

  /** Remove the live progress row (a job finished / failed). */
  const clearLiveProgress = useCallback(() => {
    if (liveProgressId.current === null) return
    const id = liveProgressId.current
    liveProgressId.current = null
    setProgress(prev => prev.filter(l => l.id !== id))
  }, [])

  /** Refresh status (config + project + files). */
  const refresh = useCallback(async (showError = true, forceOutline = false) => {
    try {
      const status = await api.status()
      setConfig(status.config)
      setConfigDraft(status.config)
      setProject(status.project ?? null)
      setGeneratedFiles(status.generatedFiles)
      const withDraft = status.project?.chapters.find(c => c.pendingDraft !== undefined && c.pendingDraft !== '')
      setDraftNo(withDraft?.no ?? null)
      const nextOutline = status.project?.outline
      // forceOutline：切换书/开书后强制同步大纲（refresh 闭包里的
      // outlineText 可能是旧值，导致 `=== ''` 条件失效、大纲不同步、
      // 「生成章节计划」按钮被禁用）。
      if (forceOutline || (nextOutline !== undefined && outlineText === '')) {
        setOutlineText(nextOutline ?? '')
      }
    } catch (err) {
      if (showError) setError((err as Error).message)
    }
  }, [api, outlineText])

  /** Handle a docx file (pick or drag): parse locally, save outline. */
  const handleDocxFile = useCallback(async (file: File) => {
    setBusy(true)
    setBusyLabel(tt('overview.loadingOutline'))
    setError('')
    try {
      const buffer = await file.arrayBuffer()
      const outline = extractDocxTextFromBuffer(buffer)
      if (outline.length < 50) {
        throw new Error('大纲内容过短（<50 字符），请检查文件')
      }
      setOutlineText(outline)
      await api.saveOutline(outline)
      await refresh(false)
      pushProgress(`已从「${file.name}」读取大纲（${outline.length} 字）`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`读取大纲失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }, [api, pushProgress, refresh])

  useEffect(() => {
    void refresh()
    void refreshShelf()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 进入简介页时预填已保存的简介。 */
  useEffect(() => {
    if (activeTab === 'blurb') {
      if (blurbDraft === '' && project?.blurb !== undefined && project.blurb !== '') {
        setBlurbDraft(project.blurb)
      }
      if (bookNameDraft === '' && project?.bookName !== undefined && project.bookName !== '') {
        setBookNameDraft(project.bookName)
      }
      void loadCover()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, project?.blurb, project?.bookName])

  /** Load the outline from docx (default path or custom). */
  const handleLoadDocx = async (useCustom: boolean): Promise<void> => {
    setBusy(true)
    setBusyLabel(tt('overview.loadingOutline'))
    setError('')
    try {
      const result = await api.loadOutline(useCustom ? customDocxPath || undefined : undefined)
      setOutlineText(result.outline)
      // Persist into the project (load-or-create).
      await api.saveOutline(result.outline)
      await refresh(false)
      pushProgress(`大纲已读取（${result.chars} 字）：${result.bookName}${result.path !== undefined ? ` ← ${result.path}` : ''}`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`读取大纲失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** Save the edited outline. */
  const handleSaveOutline = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await api.saveOutline(outlineText)
      setNotice(tt('overview.saved'))
      pushProgress(tt('overview.saved'), 'done')
      await refresh(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 大纲页「更新大纲」展开/收起（展开时预填当前大纲文本）。 */
  const handleToggleUpdateOutline = (): void => {
    if (!updatingOutline && project !== null) setOutlineText(project.outline)
    setUpdatingOutline(v => !v)
  }

  /** 重置项目：清空全部进度，从新大纲重新开始（二次确认）。 */
  const handleResetProject = async (): Promise<void> => {
    if (project === null) return
    if (!window.confirm('将清空本书全部进度（道藏/卷计划/章节计划/已生成章节/暗线/写作资产/编年录），且不可恢复。确定用新总纲重置？')) return
    setBusy(true)
    setError('')
    try {
      const result = await api.reset(outlineText)
      setUpdatingOutline(false)
      pushProgress(`已重置项目：${result.bookName}（从新大纲重新开始）`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`重置失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
      await refresh(false)
    }
  }

  /** 全书一致性质检（LLM 扫描已生成章节）。 */
  const handleAudit = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel('全书一致性质检中…')
    setError('')
    try {
      const result = await api.audit()
      setAuditIssues(result.issues)
      pushProgress(result.issues.length === 0
        ? `全书质检完成：${result.auditedChapters} 章未发现矛盾 🎉`
        : `全书质检完成：发现 ${result.issues.length} 处疑似矛盾`, result.issues.length === 0 ? 'done' : 'error')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`全书质检失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 角色卡刷新。 */
  const handleCharactersRefresh = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel('聚合角色卡中…')
    setError('')
    try {
      const result = await api.charactersRefresh()
      setCharCards(result.cards)
      pushProgress(`角色卡已刷新：${result.cards.length} 个角色`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`角色卡刷新失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 事实库回填（历史章节批量抽取）。 */
  const handleFactsBackfill = async (): Promise<void> => {    if (doneCount === 0) return
    setBusy(true)
    setBusyLabel('回填历史章节事实中…')
    setError('')
    try {
      const result = await api.factsBackfill()
      pushProgress(result.filled > 0
        ? `事实库回填完成：${result.filled} 章已抽取事实`
        : '事实库无需回填（所有章节都已有事实记录）', 'done')
      await refresh(false)
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`事实库回填失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 剧情线：保存草稿（新增或更新）。 */
  const handlePlotlineSave = async (): Promise<void> => {
    if (plotlineDraft === null) return
    const line: Plotline = {
      id: plotlineDraft.id,
      name: plotlineDraft.name.trim(),
      kind: plotlineDraft.kind,
      goal: plotlineDraft.goal.trim(),
      progress: plotlineDraft.progress.trim(),
      status: plotlineDraft.status,
      chapters: plotlineDraft.id !== ''
        ? (project?.plotlines?.find(l => l.id === plotlineDraft.id)?.chapters ?? [])
        : [],
      createdAt: plotlineDraft.id !== ''
        ? (project?.plotlines?.find(l => l.id === plotlineDraft.id)?.createdAt ?? new Date().toISOString())
        : new Date().toISOString(),
    }
    if (line.name === '') {
      setError('剧情线名称不能为空')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api.plotlines({ op: plotlineDraft.id !== '' ? 'update' : 'add', line })
      setProject(prev => prev === null ? prev : { ...prev, plotlines: result.plotlines, updatedAt: new Date().toISOString() })
      setPlotlineDraft(null)
      pushProgress(plotlineDraft.id !== '' ? `剧情线已更新：${line.name}` : `剧情线已创建：${line.name}`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`保存剧情线失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  /** 剧情线：删除。 */
  const handlePlotlineRemove = async (id: string): Promise<void> => {
    if (!window.confirm('确定删除这条剧情线？关联章节记录会一并移除。')) return
    setBusy(true)
    setError('')
    try {
      const result = await api.plotlines({ op: 'remove', id })
      setProject(prev => prev === null ? prev : { ...prev, plotlines: result.plotlines, updatedAt: new Date().toISOString() })
      pushProgress('剧情线已删除', 'done')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 剧情线：把本章关联到某条线（推进节点）。 */
  const handlePlotlineLink = async (id: string, chapterNo: number): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const result = await api.plotlines({ op: 'link', id, chapterNo })
      setProject(prev => prev === null ? prev : { ...prev, plotlines: result.plotlines, updatedAt: new Date().toISOString() })
      pushProgress(`已把第 ${chapterNo} 章关联到剧情线`, 'done')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 全书敏感词检查（硬匹配内置词库）。 */
  const handleSensitiveScan = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel('敏感词检查中…')
    setError('')
    try {
      const result = await api.sensitiveCheck({ all: true })
      setSensHits(result.hits)
      setSensScanned(result.scannedChapters)
      pushProgress(result.hits.length > 0
        ? `敏感词检查：${result.hits.length} 处命中（${new Set(result.hits.map(h => h.chapterNo)).size} 章受影响）`
        : `敏感词检查完成：扫描 ${result.scannedChapters} 章，未命中违禁词`, result.hits.length > 0 ? 'error' : 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`敏感词检查失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 保存角色知情度（bible.characters 整体更新）。 */
  const handleKnowledgeSave = async (): Promise<void> => {
    if (bible === undefined) return
    const characters = bible.characters.map(card => ({
      ...card,
      knowledge: (knowledgeDraft[card.name] ?? (card.knowledge ?? []).join('\n'))
        .split('\n').map(l => l.trim()).filter(l => l !== ''),
    }))
    setBusy(true)
    setError('')
    try {
      const result = await api.biblePatch({ characters })
      setProject(prev => prev === null || prev.bible === undefined ? prev : { ...prev, bible: result.bible, updatedAt: new Date().toISOString() })
      pushProgress('角色知情度已保存（生成/审稿都会严格遵守信息差）', 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`保存知情度失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  /** 保存世界观规则编辑（bible tab，每行一条）。 */
  const handleSaveWorldRules = async (): Promise<void> => {
    if (bible === undefined) return
    const rules = worldRulesDraft.split('\n').map(line => line.trim()).filter(line => line !== '')
    setBusy(true)
    setError('')
    try {
      const result = await api.biblePatch({ worldRules: rules })
      setProject(prev => prev === null ? prev : { ...prev, bible: result.bible, updatedAt: new Date().toISOString() })
      pushProgress(`世界观规则已保存（${rules.length} 条）`, 'done')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 简介：AI 全量生成。 */
  const handleBlurbGenerate = async (): Promise<void> => {
    if (project === null) return
    setBusy(true)
    setBusyLabel('AI 生成简介中…')
    setError('')
    try {
      const result = await api.blurb('generate')
      setBlurbDraft(result.blurb)
      pushProgress(`简介已生成（${result.blurb.length} 字）`, 'done')
      await refresh(false)
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`简介生成失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 简介：按已写开头 AI 补全。 */
  const handleBlurbComplete = async (): Promise<void> => {
    if (project === null) return
    if (blurbDraft.trim() === '') return
    setBusy(true)
    setBusyLabel('AI 补全简介中…')
    setError('')
    try {
      const result = await api.blurb('generate', undefined, blurbDraft)
      setBlurbDraft(result.blurb)
      pushProgress(`简介已补全（${result.blurb.length} 字）`, 'done')
      await refresh(false)
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`简介补全失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 简介：手动保存。 */
  const handleBlurbSave = async (): Promise<void> => {
    if (project === null) return
    setBusy(true)
    setError('')
    try {
      const result = await api.blurb('save', blurbDraft)
      pushProgress(`简介已保存（${result.blurb.length} 字）`, 'done')
      await refresh(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 加载封面（进入简介页时）。 */
  const loadCover = useCallback(async (): Promise<void> => {
    try {
      const result = await api.coverGet()
      setCoverDataUrl(result.dataUrl)
    } catch { /* best-effort */ }
  }, [api])

  /** 封面上传（本地预览 + 落盘）。 */
  const handleCoverUpload = (file: File | undefined): void => {
    if (file === undefined) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null
      if (dataUrl === null) return
      setCoverDataUrl(dataUrl)
      void (async () => {
        setBusy(true)
        setError('')
        try {
          await api.coverPost('upload', dataUrl)
          pushProgress(`封面已上传：${file.name}`, 'done')
          await refresh(false)
        } catch (err) {
          setError((err as Error).message)
          pushProgress(`封面上传失败：${(err as Error).message}`, 'error')
          await loadCover()
        } finally {
          setBusy(false)
        }
      })()
    }
    reader.readAsDataURL(file)
  }

  /** 工作区：AI 审查当前编辑的正文（不落盘）。 */
  const handleWsCheck = async (): Promise<void> => {
    if (workspace === null) return
    if (workspace.original.trim().length < 50) {
      setError('正文过短（<50 字），请先编辑内容')
      return
    }
    setBusy(true)
    setBusyLabel(`AI 审查 第${workspace.no}章`)
    setError('')
    try {
      const result = await api.chapterCheck(workspace.no, workspace.original)
      setWsCheckReport(result.report)
      // 默认勾选 high 问题（无 high 则勾选全部 medium），作者可自行增删。
      const highIdx = result.report.issues.map((it, i) => ({ it, i })).filter(x => x.it.severity === 'high').map(x => x.i)
      const mediumIdx = result.report.issues.map((it, i) => ({ it, i })).filter(x => x.it.severity === 'medium').map(x => x.i)
      setWsChecked(highIdx.length > 0 ? highIdx : mediumIdx)
      pushProgress(`审查完成：${result.report.score} 分 — ${result.report.verdict}`, result.report.passed ? 'done' : 'error')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`AI 审查失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 工作区：保存手动编辑的正文（备份 .bak；沿用审查报告或自动审稿，保存即出结论）。 */
  const handleWsSave = async (): Promise<void> => {
    if (workspace === null) return
    if (workspace.original.trim().length < 50) {
      setError('正文过短（<50 字），未保存')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api.chapterSave(workspace.no, workspace.original, wsCheckReport ?? undefined)
      const report = result.report
      setWorkspace(null)
      setDraftNo(null)
      setWsCheckReport(null)
      setWsChecked([])
      if (report !== undefined) {
        pushProgress(`已保存并审稿：${report.score} 分 — ${report.verdict}（${report.passed ? '通过' : '未通过'}）`, report.passed ? 'done' : 'error')
      } else {
        pushProgress(`已保存第 ${workspace.no} 章编辑（${result.chars} 字，原稿已备份 .bak）`, 'done')
      }
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`保存失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
      await refresh(false)
    }
  }

  /** 移除封面。 */
  const handleCoverRemove = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await api.coverPost('remove')
      setCoverDataUrl(null)
      pushProgress('封面已移除', 'info')
      await refresh(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 重命名当前书（同步项目与书架）。 */
  const handleRename = async (): Promise<void> => {
    const name = bookNameDraft.trim()
    if (name === '' || project === null || name === project.bookName) return
    setBusy(true)
    setError('')
    try {
      const result = await api.rename(name)
      pushProgress(`书名已改为《${result.bookName}》`, 'done')
      await refresh(false)
      await refreshShelf()
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`改名失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  /** Extract the story bible. */
  const handleBible = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel(tt('bible.gen'))
    setError('')
    try {
      const result = await api.bible(outlineText || undefined)
      setProject(prev => prev === null ? prev : { ...prev, bible: result.bible, updatedAt: new Date().toISOString() })
      const bible: StoryBible = result.bible
      pushProgress(tt('workflow.bibleDone', {
        n: bible.worldRules.length,
        c: bible.characters.length,
        r: bible.redLines.length,
      }), 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`提炼道藏失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** Plan volumes. */
  const handleVolumes = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel(tt('workflow.genVolumes'))
    setError('')
    try {
      const result = await api.volumes(outlineText || undefined)
      setProject(prev => prev === null ? prev : { ...prev, volumes: result.volumes, updatedAt: new Date().toISOString() })
      pushProgress(tt('workflow.volumesDone', { n: result.volumes.length }), 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`生成卷计划失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** Generate the chapter plan via LLM. */
  const handlePlan = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel(tt('plan.generate'))
    setError('')
    try {
      const result = await api.plan(outlineText || undefined, planCount)
      let freshCount = 0
      setProject(prev => {
        const base = prev ?? {
          bookName: '', outline: outlineText, chapters: [] as ChapterPlan[],
          foreshadows: [] as Foreshadow[], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }
        // 追加时按标题去重，避免重复生成计划导致剧情「重头再来」。
        const existingTitles = new Set(base.chapters.map(c => c.title))
        const fresh = result.chapters.filter(c => !existingTitles.has(c.title))
        freshCount = fresh.length
        if (fresh.length === 0) return base
        return { ...base, chapters: [...base.chapters, ...fresh], updatedAt: new Date().toISOString() }
      })
      pushProgress(tt('workflow.planDone', { n: freshCount }), 'done')
      if (freshCount < result.chapters.length) {
        pushProgress(`已跳过 ${result.chapters.length - freshCount} 个与已有章节同名的重复章节`, 'error')
      }
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`生成章节计划失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** 打开某章的工作区（读取服务器原文；有遗留草稿时预载草稿；可预填修订指令）。 */
  const openWorkspace = useCallback(async (no: number, instruction?: string): Promise<void> => {
    try {
      const [chapterRes, statusRes] = await Promise.all([api.chapter(no), api.status()])
      const chapter = statusRes.project?.chapters.find(c => c.no === no)
      if (chapter === undefined) return
      // 未显式给指令时：若本章审稿未通过，自动预填「按审稿意见修订」，
      // 把高优先级问题带进修订指令（作者点「修订」即可直接改）。
      let autoInstruction = instruction ?? ''
      if (autoInstruction === '' && chapter.review !== undefined && !chapter.review.passed) {
        const high = chapter.review.issues.filter(i => i.severity === 'high')
        const picked = high.length > 0 ? high.slice(0, 3) : chapter.review.issues.slice(0, 3)
        autoInstruction = '按审稿意见修订（优先处理）：\n' + picked.map(i => `[${i.severity}] ${i.item} → ${i.suggestion}`).join('\n')
      }
      setWorkspace({
        no,
        title: chapter.title,
        original: chapterRes.markdown,
        instruction: autoInstruction,
        draft: chapter.pendingDraft !== undefined && chapter.pendingDraft !== '' ? chapter.pendingDraft : null,
      })
      setWsSelected('')
      setWsShowDiff(true)
      setWsCheckReport(null)
      setWsChecked([])
    } catch { /* best-effort */ }
  }, [api])

  /** 捕获工作区原文 textarea 中选中的文字（局部修订目标）。 */
  const captureWsSelection = (): void => {
    const el = wsEditorRef.current
    if (el === null) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    if (end > start) setWsSelected(el.value.slice(start, end).trim())
    else setWsSelected('')
  }

  /** 工作区：去 AI 味润色（流式 → 预览草稿）。 */
  const handleWsPolish = async (): Promise<void> => {
    if (workspace === null) return
    setBusy(true)
    setBusyLabel(`${tt('plan.polish')} 第${workspace.no}章`)
    setError('')
    try {
      await api.polish(workspace.no, frame => { applyJobFrame(frame, n => tt('progress.polishing', { no: n })) })
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`第 ${workspace.no} 章润色失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
      await refresh(false)
    }
  }

  /** 工作区：按指令修订（whole=true 整章，false 仅修订选中片段）。 */
  const handleWsRewrite = async (whole: boolean, overrideInstruction?: string): Promise<void> => {
    if (workspace === null) return
    const target = whole ? '' : wsSelected
    const instruction = overrideInstruction ?? workspace.instruction
    setBusy(true)
    setBusyLabel(`${tt('plan.rewrite')} 第${workspace.no}章`)
    setError('')
    try {
      await api.rewrite(workspace.no, instruction, target, frame => { applyJobFrame(frame, n => tt('progress.rewriting', { no: n })) })
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`第 ${workspace.no} 章修订失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
      await refresh(false)
    }
  }

  /** 工作区：按审查报告中勾选的问题一键修订（预填指令 + 立即整章修订到草稿）。 */
  const handleWsReviseByReport = async (): Promise<void> => {
    if (workspace === null || wsCheckReport === null) return
    const picked = wsChecked
      .map(i => wsCheckReport.issues[i])
      .filter((it): it is ReviewReport['issues'][number] => it !== undefined)
      .slice(0, 5)
    if (picked.length === 0) return
    const instruction = '按审稿意见修订（优先处理）：\n' + picked.map(i => `[${i.severity}] ${i.item} → ${i.suggestion}`).join('\n')
    setWorkspace({ ...workspace, instruction })
    await handleWsRewrite(true, instruction)
  }

  /** 采纳草稿：覆盖正文文件并刷新。 */
  const handleDraftApply = async (no: number): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const result = await api.draftApply(no)
      setWorkspace(null)
      setDraftNo(null)
      pushProgress(`已采纳第 ${no} 章新稿（${result.chars} 字）→ ${result.file}`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`采纳第 ${no} 章草稿失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
      await refresh(false)
    }
  }

  /** 放弃草稿：保留原稿，仅清空草稿。 */
  const handleDraftDiscard = async (no: number): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await api.draftDiscard(no)
      setWorkspace(null)
      setDraftNo(null)
      pushProgress(`已放弃第 ${no} 章草稿，保留原稿`, 'info')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`放弃第 ${no} 章草稿失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
      await refresh(false)
    }
  }

  /** Shared frame handler for generate/rewrite/polish streams. */
  const applyJobFrame = useCallback((frame: JobFrame, label: (no: number) => string) => {
    if (frame.type === 'start') {
      clearLiveProgress()
      setLiveBar(null)
      lastDeltaChars.current = 0
      liveChars.current = 0
      currentJobNo.current = frame.no
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === frame.no ? { ...c, status: 'generating', error: undefined } : c),
      })
      pushProgress(label(frame.no))
    } else if (frame.type === 'delta') {
      // One live row updated in place — no per-token console spam. The
      // server streams incremental text, so accumulate locally.
      const chars = (liveChars.current += frame.text.length)
      const target = project?.chapters.find(c => c.no === currentJobNo.current)?.targetChars ?? 0
      if (chars < 50 || chars - lastDeltaChars.current >= 200) {
        lastDeltaChars.current = chars
        const text = target > 0 ? `已生成 ${chars} / ${target} 字` : `已生成 ${chars} 字`
        const ratio = target > 0 ? Math.min(chars / target, 1) : undefined
        setLiveProgress(text, ratio)
        setLiveBar({ text, ratio })
      }
    } else if (frame.type === 'done' || frame.type === 'rewritten') {
      clearLiveProgress()
      setLiveBar(null)
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === frame.no ? { ...c, status: 'written', chars: frame.chars, file: frame.file, review: undefined } : c),
      })
      pushProgress(tt('progress.done', { no: frame.no, chars: frame.chars, file: frame.file }), 'done')
      setGeneratedFiles(prev => prev.includes(frame.file) ? prev : [...prev, frame.file])
    } else if (frame.type === 'review') {
      clearLiveProgress()
      setLiveBar(null)
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === frame.no ? { ...c, status: frame.report.passed ? 'approved' : 'rejected', review: frame.report } : c),
      })
      pushProgress(tt('progress.reviewed', {
        no: frame.no,
        score: frame.report.score,
        verdict: frame.report.verdict,
      }), frame.report.passed ? 'done' : 'error')
    } else if (frame.type === 'drafted') {
      // 润色/重写完成：产物作为待确认草稿，展示在工作区预览，由用户决定。
      clearLiveProgress()
      setLiveBar(null)
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === frame.no ? { ...c, pendingDraft: frame.draft } : c),
      })
      pushProgress(`第 ${frame.no} 章润色完成（${frame.chars} 字），请查看预览后应用或放弃`)
      setDraftNo(frame.no)
      setWsShowDiff(false)
      setWorkspace(prev => prev !== null && prev.no === frame.no ? { ...prev, draft: frame.draft } : prev)
    } else if (frame.type === 'error') {
      clearLiveProgress()
      setLiveBar(null)
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === frame.no ? { ...c, status: 'error', error: frame.message } : c),
      })
      pushProgress(tt('progress.error', { no: frame.no, message: frame.message }), 'error')
    }
  }, [pushProgress, setLiveProgress, clearLiveProgress, project])

  /** Generate one chapter, streaming frames into the console. */
  const handleWriteChapter = async (no: number, skipReview: boolean): Promise<void> => {
    setBusy(true)
    setBusyLabel(`${tt('plan.write')} 第${no}章`)
    setError('')
    try {
      await api.generate(no, skipReview, frame => { applyJobFrame(frame, n => tt('progress.generating', { no: n, title: (project?.chapters.find(c => c.no === n)?.title ?? '') })) })
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`第 ${no} 章失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
      await refresh(false)
    }
  }

  /** Batch-write all remaining chapters in sequence (auto-retry once per chapter). */
  const handleWriteAll = async (): Promise<void> => {
    const remaining = chapters.filter(c => c.status === 'pending' || c.status === 'error')
    if (remaining.length === 0) return
    setBusy(true)
    setBusyLabel(`${tt('plan.writeAllPending')}（共 ${remaining.length} 章）`)
    setError('')
    let failed = 0
    const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))
    for (const chapter of remaining) {
      pushProgress(`▶ 开始生成第 ${chapter.no} 章《${chapter.title}》`)
      let lastError: unknown = null
      // 失败自动重试：最多尝试 2 次，间隔 3 秒（网络抖动/LLM 偶发失败自愈）。
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await api.generate(chapter.no, true, frame => { applyJobFrame(frame, n => tt('progress.generating', { no: n, title: (project?.chapters.find(c => c.no === n)?.title ?? '') })) })
          lastError = null
          break
        } catch (err) {
          lastError = err
          if (attempt < 2) {
            pushProgress(`第 ${chapter.no} 章第 ${attempt} 次尝试失败（${(err as Error).message}），3 秒后自动重试…`, 'error')
            await sleep(3000)
          }
        }
      }
      if (lastError !== null) {
        failed++
        pushProgress(`第 ${chapter.no} 章失败：${(lastError as Error).message}`, 'error')
      }
    }
    setBusy(false)
    setBusyLabel('')
    await refresh(false)
    pushProgress(failed === 0
      ? `批量生成完成：${remaining.length} 章全部完成`
      : `批量生成结束：${remaining.length - failed} 章完成，${failed} 章失败`, failed === 0 ? 'done' : 'error')
  }

  /** Review one chapter. */
  const handleReview = async (no: number): Promise<void> => {
    setBusy(true)
    setBusyLabel(`${tt('plan.review')} 第${no}章`)
    setError('')
    try {
      const result = await api.review(no)
      const report: ReviewReport = result.report
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === no ? { ...c, status: report.passed ? 'approved' : 'rejected', review: report } : c),
      })
      pushProgress(tt('progress.reviewed', { no, score: report.score, verdict: report.verdict }), report.passed ? 'done' : 'error')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** Approve a chapter manually. */
  const handleApprove = (no: number): void => {
    setProject(prev => prev === null ? prev : {
      ...prev,
      chapters: prev.chapters.map(c => c.no === no ? { ...c, status: 'approved' } : c),
      updatedAt: new Date().toISOString(),
    })
  }

  /** Toggle chapter preview. */
  const handleToggleChapter = async (no: number): Promise<void> => {
    if (expandedChapter === no) {
      setExpandedChapter(null)
      setChapterText('')
      return
    }
    setExpandedChapter(no)
    setChapterText('')
    try {
      const result = await api.chapter(no)
      setChapterText(result.markdown)
    } catch (err) {
      setChapterText(`（${(err as Error).message}）`)
    }
  }

  /** Suggest foreshadows via LLM. */
  const handleSuggestForeshadows = async (): Promise<void> => {
    setBusy(true)
    setBusyLabel(tt('foreshadow.suggest'))
    setError('')
    try {
      const result = await api.foreshadow({ suggest: true })
      setProject(prev => prev === null ? prev : { ...prev, foreshadows: [...(prev?.foreshadows ?? []), ...result.foreshadows], updatedAt: new Date().toISOString() })
      pushProgress(`AI 已建议 ${result.foreshadows.length} 条伏笔`, 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`伏笔建议失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** Save the settings draft. */
  const handleSaveConfig = async (): Promise<void> => {
    if (configDraft === null) return
    setBusy(true)
    setError('')
    try {
      const result = await api.patchConfig({
        outlinePath: configDraft.outlinePath,
        outputDir: configDraft.outputDir,
        provider: configDraft.provider,
        model: configDraft.model,
        chapterChars: configDraft.chapterChars,
        maxTokens: configDraft.maxTokens,
        reviewPassScore: configDraft.reviewPassScore,
        autoReview: configDraft.autoReview,
      })
      setConfig(result.config)
      setConfigDraft(result.config)
      setNotice(tt('settings.saved'))
      pushProgress(tt('settings.saved'), 'done')
      await refresh(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** Export the book. */
  const handleExport = async (format: 'txt' | 'md'): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      const result = await api.exportBook(format)
      setNotice(tt('settings.exported', { file: result.file, chars: result.chars, chapters: result.chapters }))
      pushProgress(tt('settings.exported', { file: result.file, chars: result.chars, chapters: result.chapters }), 'done')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const busyAny = anyGenerating(project?.chapters)
  const chapters = project?.chapters ?? []
  const doneCount = chapters.filter(c => c.status === 'approved' || c.status === 'written' || c.status === 'rejected').length
  const pendingCount = chapters.filter(c => c.status === 'pending' || c.status === 'error').length
  const bible: StoryBible | undefined = project?.bible
  const volumes: Volume[] | undefined = project?.volumes
  const foreshadows: Foreshadow[] = project?.foreshadows ?? []

  /** 章节按卷分组（未分卷章节单独一组；章节多时可按卷折叠浏览）。 */
  const chapterGroups = useMemo(() => {
    const groups: Array<{ no: number; title: string; chapters: ChapterPlan[] }> = []
    if (volumes !== undefined) {
      for (const v of volumes) {
        const list = chapters.filter(c => c.volume === v.no)
        if (list.length > 0) groups.push({ no: v.no, title: `第${v.no}卷 · ${v.title}`, chapters: list })
      }
    }
    const unassigned = chapters.filter(c => c.volume === 0)
    if (unassigned.length > 0) groups.push({ no: 0, title: '未分卷', chapters: unassigned })
    if (groups.length === 0) groups.push({ no: 0, title: '全部章节', chapters })
    return groups
  }, [chapters, volumes])

  // --------------------------------------------------- dashboard (workflow)
  const approvedCount = chapters.filter(c => c.status === 'approved').length
  const reviewPendingCount = chapters.filter(c => c.status === 'written' || c.status === 'rejected').length
  const totalChars = chapters.reduce((sum, c) => sum + (c.chars ?? 0), 0)
  const firstChapter = chapters[0]
  const currentVolumeName = (() => {
    if (firstChapter === undefined || volumes === undefined || volumes.length === 0) return '—'
    const vol = volumes.find(v => v.no === firstChapter.volume)
    return vol !== undefined ? vol.title : `第 ${firstChapter.volume} 卷`
  })()
  const lastUpdated = project?.updatedAt !== undefined
    ? new Date(project.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'

  /** 创作旅程 6 阶段（完成/当前/未到）。 */
  const journeyStages: Array<{ id: string; label: string; done: boolean }> = [
    { id: 'outline', label: '大纲', done: project !== null },
    { id: 'bible', label: '设定', done: bible !== undefined },
    { id: 'volumes', label: '卷计划', done: volumes !== undefined },
    { id: 'plan', label: '章节计划', done: chapters.length > 0 },
    { id: 'write', label: '正文', done: chapters.some(c => (c.chars ?? 0) > 0) },
    { id: 'review', label: '审稿', done: approvedCount > 0 },
  ]
  const journeyDoneCount = journeyStages.filter(s => s.done).length
  const journeyPercent = Math.round((journeyDoneCount / journeyStages.length) * 100)
  const currentStageId = journeyStages.find(s => !s.done)?.id

  /** 主行动卡片：推荐下一步（AI-Novel-Writing-Assistant 首页主卡模式）。 */
  const nextAction = useMemo((): { eyebrow: string; title: string; reason: string; actionLabel: string; onClick: () => void } | null => {
    if (project === null) {
      return {
        eyebrow: '开始你的第一本书',
        title: '导入小说大纲',
        reason: '从 docx 文件或粘贴文本开始，AI 会把一份大纲「编译」成完整的小说。',
        actionLabel: '导入大纲',
        onClick: () => { setActiveTab('overview') },
      }
    }
    if (bible === undefined) {
      return {
        eyebrow: '推荐下一步',
        title: '提炼道藏',
        reason: '人设、世界观、金手指规则、写作红线是后续所有生成的地基，越完整质量越高。',
        actionLabel: '生成道藏',
        onClick: () => { void handleBible() },
      }
    }
    if (volumes === undefined) {
      return {
        eyebrow: '推荐下一步',
        title: '规划全书卷结构',
        reason: '按剧情弧线划分卷，章节计划才有骨架可依。',
        actionLabel: '生成卷计划',
        onClick: () => { void handleVolumes() },
      }
    }
    if (chapters.length === 0) {
      return {
        eyebrow: '推荐下一步',
        title: '生成章节计划',
        reason: 'LLM 根据大纲拆解每章标题与剧情要点，然后就可以逐章生成正文。',
        actionLabel: '生成章节计划',
        onClick: () => { void handlePlan() },
      }
    }
    const drafting = chapters.find(c => c.pendingDraft !== undefined && c.pendingDraft !== '')
    if (drafting !== undefined) {
      return {
        eyebrow: '需要你确认',
        title: `第 ${drafting.no} 章有未采纳的润色草稿`,
        reason: '打开工作区查看对比，决定采纳新稿或保留原稿（原稿未被改动）。',
        actionLabel: '打开工作区',
        onClick: () => { void openWorkspace(drafting.no) },
      }
    }
    if (pendingCount > 0) {
      return {
        eyebrow: '继续创作',
        title: `还有 ${pendingCount} 章待生成`,
        reason: '批量生成剩余章节，顶部进度条会实时显示每章字数与进度。',
        actionLabel: `批量生成（${pendingCount}）`,
        onClick: () => { void handleWriteAll() },
      }
    }
    if (reviewPendingCount > 0) {
      return {
        eyebrow: '推荐下一步',
        title: `${reviewPendingCount} 章待审稿`,
        reason: '审稿通过后章节才算完成；不通过的可按意见在工作区修订。',
        actionLabel: '去审稿',
        onClick: () => { setActiveTab('plan') },
      }
    }
    return {
      eyebrow: '全部完成 🎉',
      title: '《' + project.bookName + '》已全部生成',
      reason: '可以去 AI 味润色（对比后采纳）、按卷复查或导出全本（TXT/MD）。',
      actionLabel: '导出全本',
      onClick: () => { void handleExport('txt') },
    }
  }, [project, bible, volumes, chapters, pendingCount, reviewPendingCount, openWorkspace])

  /** 待办队列（失败/草稿/待审稿，点击直达）。 */
  const todos = useMemo(() => {
    const items: Array<{ tone: 'danger' | 'warning' | 'info' | 'success'; title: string; description: string; actionLabel: string; onClick: () => void }> = []
    for (const chapter of chapters) {
      if (chapter.status === 'error') {
        items.push({
          tone: 'danger',
          title: `第 ${chapter.no} 章《${chapter.title}》生成失败`,
          description: chapter.error ?? '',
          actionLabel: '去处理',
          onClick: () => { setActiveTab('plan') },
        })
      }
      if (items.length >= 3) return items
    }
    const drafting = chapters.find(c => c.pendingDraft !== undefined && c.pendingDraft !== '')
    if (drafting !== undefined && items.length < 3) {
      items.push({
        tone: 'warning',
        title: `第 ${drafting.no} 章《${drafting.title}》有未采纳草稿`,
        description: '原稿未被改动，采纳或放弃由你决定',
        actionLabel: '打开工作区',
        onClick: () => { void openWorkspace(drafting.no) },
      })
    }
    for (const chapter of chapters) {
      if ((chapter.status === 'written' || chapter.status === 'rejected') && items.length < 3) {
        items.push({
          tone: 'info',
          title: `第 ${chapter.no} 章《${chapter.title}》待审稿`,
          description: chapter.status === 'rejected' ? '审稿未通过，可按意见修订' : '等待 AI 审稿确认',
          actionLabel: '去审稿',
          onClick: () => { setActiveTab('plan') },
        })
      }
    }
    return items
  }, [chapters, openWorkspace])

  /** 资产健康（设定/卷/写作资产/伏笔）。 */
  const assetSummary = (() => {
    const assets = project?.assets
    const parts: string[] = []
    if (assets?.genre !== undefined) parts.push(`题材：${assets.genre.name}`)
    if (assets?.primaryProgression !== undefined) parts.push(`推进：${assets.primaryProgression.name}`)
    if ((assets?.styleAssets?.length ?? 0) > 0) parts.push(`写法：${assets!.styleAssets!.length} 套`)
    return parts.length > 0 ? parts.join(' · ') : '题材 / 推进 / 写法未绑定'
  })()
  const assetCount = (() => {
    const assets = project?.assets
    let n = 0
    if (assets?.genre !== undefined) n++
    if (assets?.primaryProgression !== undefined) n++
    n += assets?.auxiliaryProgressions?.length ?? 0
    n += assets?.styleAssets?.length ?? 0
    n += assets?.antiAiRules?.length ?? 0
    return n
  })()

  return (
    <div className={css.panel} data-nf-theme={panelTheme}>
      {viewMode === 'shelf' ? (
        /* 书架首页：默认视图，选择一本书进入工作台 */
        <ShelfView
          api={api}
          shelf={shelf ?? { books: [], activeBookId: null }}
          onOpenBook={async (id) => {
            setBusy(true)
            try {
              await api.bookActivate(id)
              // 切换书后重置本地编辑状态，重新拉取目标书。
              setOutlineText('')
              setProject(null)
              setGeneratedFiles([])
              setChapterText('')
              setExpandedChapter(null)
              setProgress([])
              setAuditIssues(null)
              setCharCards(null)
              await refresh(false, true)
              await refreshShelf()
              setViewMode('workspace')
            } catch (err) {
              setError((err as Error).message)
            } finally {
              setBusy(false)
            }
          }}
          onAddBook={() => { setViewMode('create') }}
        />
      ) : viewMode === 'create' ? (
        /* 开书向导：独立页面 */
        <CreateBookView
          api={api}
          onBack={() => { setViewMode('shelf') }}
          onCreated={async (id) => {
            setBusy(true)
            try {
              setOutlineText('')
              setProject(null)
              setGeneratedFiles([])
              setChapterText('')
              setExpandedChapter(null)
              setProgress([])
              setAuditIssues(null)
              setCharCards(null)
              await refresh(false, true)
              await refreshShelf()
              setViewMode('workspace')
            } catch (err) {
              setError((err as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        />
      ) : (
        <>
      <div className={css.panelHeader}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          <h2 className={css.panelTitle}>
            <button type="button" className={css.iconButton} title="返回书架" aria-label="返回书架" onClick={() => { setViewMode('shelf') }}>
              ←
            </button>
            {tt('panel.title')}
          </h2>
          {(project?.bookName !== '' && project?.bookName !== undefined) && (
            <div className={css.panelSubtitle}>
              <span>📖 {project.bookName}</span>
              {chapters.length > 0 && (
                <span className={css.headerProgress}>
                  已完成 <b>{doneCount}</b>/{chapters.length} 章
                  <span className={css.headerProgressDot} />
                  通过 <b>{chapters.filter(c => c.status === 'approved').length}</b>
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            className={css.iconButton}
            title={navCollapsed ? '展开导航栏' : '收起导航栏'}
            aria-label={navCollapsed ? '展开导航栏' : '收起导航栏'}
            onClick={() => {
              setNavCollapsed(prev => {
                const next = !prev
                try { window.localStorage.setItem('dsh-novel-forge.nav.collapsed', String(next)) } catch { /* ignore */ }
                return next
              })
            }}
          >
            {navCollapsed ? '▸' : '◂'}
          </button>
          <button type="button" className={css.iconButton} title={tt('common.close')} aria-label={tt('common.close')} onClick={() => { controller.close() }}>×</button>
        </div>
      </div>
      <div className={css.panelBody}>
        <nav className={`${css.panelNav} ${navCollapsed ? css.panelNavCollapsed : ''}`} role="tablist" aria-label="工作台导航">
          {/* 分组导航（创作 / 工具 / 数据库） */}
          {NAV_GROUPS.map(group => (
            <div key={group.id} className={css.navGroup}>
              {!navCollapsed && <div className={css.navGroupLabel}>{group.label}</div>}
              {group.items.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id || (tab.id === 'assistant' && assistantOpen)}
                  data-active={activeTab === tab.id || (tab.id === 'assistant' && assistantOpen) ? '' : undefined}
                  className={css.navTab}
                  title={tab.label}
                  onClick={() => {
                    if (tab.id === 'assistant') {
                      setAssistantOpen(true)
                    } else {
                      setActiveTab(tab.id)
                    }
                  }}
                >
                  <span className={css.navTabIcon}>{tab.icon}</span>
                  {!navCollapsed && <span className={css.navTabLabel}>{tab.label}</span>}
                  {/* 状态角标：章节待办 / 伏笔待埋 / 工作流进度 */}
                  {tab.id === 'plan' && (pendingCount > 0 || reviewPendingCount > 0) && (
                    <span className={`${css.navTabBadge} ${chapters.some(c => c.status === 'error') ? css.navTabBadgeDanger : css.navTabBadgeWarn}`}>
                      {chapters.some(c => c.status === 'error') ? `!${pendingCount + reviewPendingCount}` : pendingCount + reviewPendingCount}
                    </span>
                  )}
                  {tab.id === 'foreshadow' && foreshadows.some(f => f.status === 'planned') && (
                    <span className={css.navTabBadge}>{foreshadows.filter(f => f.status === 'planned').length}</span>
                  )}
                  {tab.id === 'workflow' && chapters.length > 0 && (
                    <span className={`${css.navTabBadge} ${css.navTabBadgeDone}`}>{journeyPercent}%</span>
                  )}
                </button>
              ))}
              {!navCollapsed && <div className={css.navGroupSep} />}
            </div>
          ))}
          {/* 设置沉底 */}
          <div className={css.navSpacer} />
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === SETTINGS_TAB.id}
            data-active={activeTab === SETTINGS_TAB.id ? '' : undefined}
            className={css.navTab}
            title={SETTINGS_TAB.label}
            onClick={() => { setActiveTab(SETTINGS_TAB.id) }}
          >
            <span className={css.navTabIcon}>{SETTINGS_TAB.icon}</span>
            {!navCollapsed && <span className={css.navTabLabel}>{SETTINGS_TAB.label}</span>}
          </button>
          {/* 关于：版本 + GitHub + 更新检测 */}
          <div className={css.navAbout}>
            <button
              type="button"
              className={css.navAboutRow}
              title="打开 GitHub 仓库"
              onClick={() => { window.open(REPO_URL, '_blank', 'noopener') }}
            >
              <span>ℹ️ v{PLUGIN_VERSION}</span>
              <span className={css.meta}>GitHub ↗</span>
            </button>
            {npmLatest !== null && npmLatest !== PLUGIN_VERSION && (
              <button
                type="button"
                className={css.navAboutUpdate}
                title="查看更新方法"
                onClick={() => {
                  window.alert(
                    `检测到新版本 v${npmLatest}（当前 v${PLUGIN_VERSION}）\n\n更新方式：\n\n【npm 安装】\ncd ~/.dsh/profiles/web && pnpm add @waterwx/dsh-novel-forge@latest\n然后重启 dsh web\n\n【GitHub 安装】\ndsh plugin --profile web add github:watersxya/dsh-novel-forge\n\n【本地开发】\n拉取最新代码 → pnpm install && pnpm build → 重启 dsh web`,
                  )
                }}
              >
                📦 有新版本 v{npmLatest}
              </button>
            )}
          </div>
        </nav>
        <div className={css.panelContent}>
        {error !== '' && <div className={css.card} style={{ borderColor: 'var(--nf-error)' }}><span style={{ color: 'var(--nf-error)' }}>{tt('common.error')}: {error}</span></div>}
        {notice !== '' && <div className={css.card}><span style={{ color: 'var(--nf-success)' }}>{notice}</span></div>}
        {busy && busyLabel !== '' && (
          <div className={css.card}>
            <div className={css.busyRow}>
              <span style={{ color: 'var(--nf-accent)' }}>{busyLabel}…</span>
              {liveBar !== null && <span className={css.liveText}>{liveBar.text}</span>}
            </div>
            {liveBar?.ratio !== undefined && (
              <div className={css.bigProgressBar}>
                <div className={css.bigProgressBarFill} style={{ width: `${Math.round(liveBar.ratio * 100)}%` }} />
              </div>
            )}
          </div>
        )}

        {/* 遗留草稿提示：刷新页面后仍有未采纳的润色/修订草稿 */}
        {workspace === null && draftNo !== null && (
          <div className={css.card} style={{ borderColor: 'var(--nf-info)' }}>
            <div className={css.busyRow}>
              <span style={{ color: 'var(--nf-info)' }}>第 {draftNo} 章有未采纳的润色/修订草稿（原稿未被改动）</span>
              <span style={{ display: 'flex', gap: 8 }}>
                <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void openWorkspace(draftNo) }}>
                  打开工作区
                </button>
                <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { void handleDraftDiscard(draftNo) }}>
                  放弃
                </button>
              </span>
            </div>
          </div>
        )}

        {/* 章节编辑页（独占整页：点「编辑」进入，返回后回到原页面；无卡片盒子，撑满内容区） */}
        {workspace !== null && (
          <div className={css.wsPage}>
            <div className={css.wsPageHeader}>
              <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setWorkspace(null) }} title="返回章节列表（草稿不丢失）">
                ← 返回
              </button>
              <span className={css.cardTitle}>第 {workspace.no} 章《{workspace.title}》</span>
              <span className={css.meta}>{workspace.original.length} 字</span>
              <span style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 'auto' }}>
                <button type="button" className={css.iconButton} title="减小字号" aria-label="减小字号" onClick={() => { changeEditorFontSize(editorFontSize - 1) }}>A−</button>
                <span className={css.meta}>{editorFontSize}px</span>
                <button type="button" className={css.iconButton} title="增大字号" aria-label="增大字号" onClick={() => { changeEditorFontSize(editorFontSize + 1) }}>A＋</button>
                <button type="button" className={css.iconButton} title="关闭工作区" aria-label="关闭工作区" onClick={() => { setWorkspace(null) }}>×</button>
              </span>
            </div>
            <div className={css.wsColumns}>
              <div className={css.wsColumn}>
                <div className={css.meta}>
                  原文（{workspace.original.length} 字）— 在正文中选中文字可作为「修订选中」的局部目标
                </div>
                <textarea
                  ref={wsEditorRef}
                  className={`${css.textarea} ${css.wsEditor}`}
                  style={{ fontSize: editorFontSize }}
                  value={workspace.original}
                  onChange={e => { setWorkspace({ ...workspace, original: e.target.value }) }}
                  onMouseUp={captureWsSelection}
                  onKeyUp={captureWsSelection}
                  onSelect={captureWsSelection}
                  spellCheck={false}
                />
              </div>
              <div className={css.wsColumn}>
                <div className={css.meta} style={{ fontWeight: 600 }}>AI 修正指令</div>
                <textarea
                  className={css.textarea}
                  style={{ minHeight: 60 }}
                  placeholder="输入修正要求，例如：压缩冗余、加强冲突、这段对话更口语化…（可留空）"
                  value={workspace.instruction}
                  onChange={e => { setWorkspace({ ...workspace, instruction: e.target.value }) }}
                />
                {wsSelected !== '' ? (
                  <div className={css.wsSelected}>
                    <div className={css.meta}>当前选中内容（将用于精准修订）</div>
                    <div className={css.wsSelectedText}>{wsSelected}</div>
                  </div>
                ) : (
                  <div className={css.meta}>未选中内容时仅支持整章润色/修订。</div>
                )}
                <div className={css.row} style={{ flexWrap: 'wrap' }}>
                  {workspace.instruction.includes('按审稿意见修订') && (
                    <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleWsRewrite(true) }} title="AI 按已预填的审稿意见自动修订整章（无需自己找问题）">
                      🔧 按意见修订
                    </button>
                  )}
                  <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleWsPolish() }}>
                    ✨ 去AI味润色
                  </button>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || workspace.instruction.trim() === ''} onClick={() => { void handleWsRewrite(true) }}>
                    整章修订
                  </button>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || wsSelected === ''} onClick={() => { void handleWsRewrite(false) }}>
                    修订选中
                  </button>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || workspace.original.trim().length < 50} onClick={() => { void handleWsCheck() }}>
                    🔍 AI 审查
                  </button>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || workspace.original.trim().length < 50} onClick={() => { void handleWsSave() }}>
                    💾 保存并审稿
                  </button>
                </div>
                {/* 手动编辑后的 AI 审查结果 */}
                {wsCheckReport !== null && (
                  <div className={css.wsPreview} style={{ borderColor: wsCheckReport.passed ? 'var(--nf-success)' : 'var(--nf-warn)' }}>
                    <div className={css.busyRow}>
                      <span className={css.meta} style={{ fontWeight: 600 }}>AI 审查结果</span>
                      <span style={{ color: wsCheckReport.passed ? 'var(--nf-success)' : 'var(--nf-error)' }}>
                        {wsCheckReport.score} 分 — {wsCheckReport.passed ? '通过' : '未通过'}
                      </span>
                    </div>
                    <div className={css.meta}><b>总评：</b>{wsCheckReport.verdict}</div>
                    {wsCheckReport.issues.length > 0 && (
                      <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3, fontSize: editorFontSize - 1, maxHeight: '45vh', overflowY: 'auto' }}>
                        {wsCheckReport.issues.map((issue, i) => (
                          <li key={i} style={{ color: severityColor(issue.severity), display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                            <input
                              type="checkbox"
                              style={{ marginTop: 1 }}
                              checked={wsChecked.includes(i)}
                              onChange={e => {
                                setWsChecked(prev => e.target.checked ? [...prev, i] : prev.filter(x => x !== i))
                              }}
                              title="勾选后可由「修复所选问题」一起修订"
                            />
                            <span>
                              [{issue.severity}] {issue.item}
                              {issue.suggestion !== '' && <span style={{ color: 'var(--nf-text-2)' }}> → {issue.suggestion}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <span className={css.meta}>审查只读不落盘；勾选要修的问题，点下方按钮一键修订；改完点「💾 保存为正文」才写入文件（原稿自动备份 .bak）。</span>
                    {wsCheckReport.issues.length > 0 && wsChecked.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
                          disabled={busy}
                          onClick={() => { void handleWsReviseByReport() }}
                          title="自动按勾选的问题修订整章，产出草稿预览（不落盘），对比后应用或放弃"
                        >
                          🔧 修复所选问题（{wsChecked.length}）
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {workspace.draft !== null && (
                  <div className={css.wsPreview} style={{ flex: 1, minHeight: 0 }}>
                    <div className={css.busyRow}>
                      <span className={css.meta}>优化预览（{workspace.draft.length} 字）</span>
                      <span style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setWsShowDiff(v => !v) }}>
                          {wsShowDiff ? '显示文本' : '查看对比'}
                        </button>
                        <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleDraftApply(workspace.no) }}>
                          ✅ 应用预览
                        </button>
                        <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { void handleDraftDiscard(workspace.no) }}>
                          ↩️ 放弃
                        </button>
                      </span>
                    </div>
                    {wsShowDiff
                      ? <DiffList original={workspace.original} draft={workspace.draft} fontSize={editorFontSize} />
                      : <pre className={css.wsPreviewText} style={{ fontSize: editorFontSize }}>{workspace.draft}</pre>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 编辑页打开时独占整页：隐藏其余所有页面内容 */}
        {workspace === null && (<>
        {activeTab === 'workflow' && (
          <>
            {/* ⭐ 主行动大卡片 */}
            <div className={css.dashHero}>
              <div className={css.dashHeroEyebrow}>
                <span className={css.dashHeroSparkle}>✨</span>
                {nextAction?.eyebrow ?? '开始'}
              </div>
              {project !== null && (
                <div className={css.dashHeroTitle}>
                  <span className={css.meta}>正在创作</span>
                  <h3 className={css.dashHeroBook}>《{project.bookName}》</h3>
                </div>
              )}
              {nextAction !== null && (
                <div className={css.dashHeroAction}>
                  <span className={css.dashHeroArrow}>→</span>
                  <div className={css.dashHeroActionBody}>
                    <div className={css.dashHeroActionTitle}>{nextAction.title}</div>
                    <div className={css.meta}>{nextAction.reason}</div>
                  </div>
                  <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { nextAction.onClick() }}>
                    {nextAction.actionLabel}
                  </button>
                </div>
              )}
              {/* 创作旅程进度 */}
              <div className={css.dashJourney}>
                <div className={css.busyRow}>
                  <span className={css.meta} style={{ fontWeight: 600 }}>创作旅程</span>
                  <span className={css.meta}>{journeyPercent}% · 已完成 {journeyDoneCount}/{journeyStages.length} 步</span>
                </div>
                <div className={css.dashJourneyBar}>
                  <div className={css.dashJourneyFill} style={{ width: `${journeyPercent}%` }} />
                </div>
                <div className={css.dashJourneyStages}>
                  {journeyStages.map(stage => (
                    <span
                      key={stage.id}
                      className={`${css.dashStage} ${stage.done ? css.dashStageDone : stage.id === currentStageId ? css.dashStageCurrent : ''}`}
                    >
                      <span className={css.dashStageDot}>{stage.done ? '✓' : stage.id === currentStageId ? '●' : '○'}</span>
                      {stage.label}
                    </span>
                  ))}
                </div>
              </div>
              {/* HeroFact 4 格 */}
              <div className={css.dashFacts}>
                <div className={css.dashFact}><span className={css.meta}>已沉淀章节</span><b>{doneCount} 章</b></div>
                <div className={css.dashFact}><span className={css.meta}>累计字数</span><b>{totalChars} 字</b></div>
                <div className={css.dashFact}><span className={css.meta}>当前卷</span><b>{currentVolumeName}</b></div>
                <div className={css.dashFact}><span className={css.meta}>最近创作</span><b>{lastUpdated}</b></div>
              </div>
            </div>

            {/* 全书进度条（原章节页进度移入工作流） */}
            <div className={css.card} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span className={css.meta} style={{ fontWeight: 600 }}>
                📊 全书进度：已完成 <b style={{ color: 'var(--nf-accent)' }}>{doneCount}</b>/{chapters.length} 章（{chapters.length > 0 ? Math.round((doneCount / chapters.length) * 100) : 0}%）
              </span>
              <span className={css.meta}>
                待生成 {pendingCount} · 待审稿 {reviewPendingCount} · 通过 {approvedCount}
              </span>
            </div>

            {/* 剧情线进度（工作流实时视图） */}
            <div className={css.card}>
              <span className={css.cardTitle}>🧵 {tt('plotlines.workflowTitle')}</span>
              {(project?.plotlines ?? []).filter(l => l.status === 'active' || l.status === 'paused').length === 0 ? (
                <span className={css.meta}>{tt('plotlines.workflowEmpty')}</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(project?.plotlines ?? []).filter(l => l.status === 'active' || l.status === 'paused').map(line => {
                    const kindLabel = { main: tt('plotlines.kindMain'), branch: tt('plotlines.kindBranch'), character: tt('plotlines.kindCharacter'), mystery: tt('plotlines.kindMystery') }[line.kind]
                    return (
                      <div key={line.id} style={{ border: '1px solid var(--nf-border)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
                        <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <b>{line.name}</b>
                            <span className={css.badge} style={{ borderColor: 'var(--nf-accent)', color: 'var(--nf-accent)' }}>{kindLabel}</span>
                            {line.status === 'paused' && <span className={css.badge} style={{ borderColor: 'var(--nf-warn)', color: 'var(--nf-warn)' }}>{tt('plotlines.statusPaused')}</span>}
                          </span>
                          <span className={css.meta}>{tt('plotlines.chapters')} {line.chapters.length} 章</span>
                        </div>
                        {line.progress !== '' && <div className={css.meta}>{line.progress}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 状态摘要条 */}
            <div className={css.assetGrid}>
              <div className={css.assetStat}>
                <span className={css.assetStatLabel}>已通过审稿</span>
                <span className={css.assetStatValue} style={{ color: approvedCount > 0 ? 'var(--nf-success)' : undefined }}>{approvedCount}</span>
                <span className={css.assetStatDetail}>章节已 approved</span>
              </div>
              <div className={css.assetStat}>
                <span className={css.assetStatLabel}>待生成</span>
                <span className={css.assetStatValue} style={{ color: pendingCount > 0 ? 'var(--nf-warn)' : undefined }}>{pendingCount}</span>
                <span className={css.assetStatDetail}>pending + error</span>
              </div>
              <div className={css.assetStat}>
                <span className={css.assetStatLabel}>待审稿</span>
                <span className={css.assetStatValue} style={{ color: reviewPendingCount > 0 ? 'var(--nf-info)' : undefined }}>{reviewPendingCount}</span>
                <span className={css.assetStatDetail}>written + rejected</span>
              </div>
              <div className={css.assetStat}>
                <span className={css.assetStatLabel}>总字数</span>
                <span className={css.assetStatValue}>{totalChars}</span>
                <span className={css.assetStatDetail}>已生成正文累计</span>
              </div>
            </div>

            {/* 双栏：左待办队列 + 右资产健康 */}
            <div className={css.dashGrid}>
              <div className={css.card}>
                <span className={css.cardTitle}>待办队列</span>
                {todos.length === 0 ? (
                  <span className={css.meta}>🎉 暂无待办，一切顺畅</span>
                ) : (
                  todos.map((todo, i) => (
                    <div key={i} className={`${css.todoItem} ${todo.tone === 'danger' ? css.todoDanger : todo.tone === 'warning' ? css.todoWarning : css.todoInfo}`}>
                      <span className={css.todoText}>
                        {todo.title}
                        {todo.description !== '' && <span className={css.meta}> — {todo.description}</span>}
                      </span>
                      <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { todo.onClick() }}>
                        {todo.actionLabel}
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className={css.card}>
                <div className={css.row} style={{ justifyContent: 'space-between' }}>
                  <span className={css.cardTitle}>资产健康</span>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || doneCount === 0} onClick={() => { void handleAudit() }} title="LLM 扫描全本已生成章节，检查人名/境界/资源/时间线矛盾">
                    🔍 全书质检
                  </button>
                </div>
                <div className={css.assetGrid}>
                  <div className={css.assetStat}>
                    <span className={css.assetStatLabel}>道藏</span>
                    <span className={css.assetStatValue} style={{ color: bible !== undefined ? 'var(--nf-success)' : 'var(--nf-text-3)' }}>
                      {bible !== undefined ? `✓ ${bible.worldRules.length} 条规则` : '未生成'}
                    </span>
                    <span className={css.assetStatDetail}>
                      {bible !== undefined ? `${bible.characters.length} 人物 · ${bible.redLines.length} 红线` : '提炼人设 / 世界观 / 金手指'}
                    </span>
                  </div>
                  <div className={css.assetStat}>
                    <span className={css.assetStatLabel}>卷计划</span>
                    <span className={css.assetStatValue} style={{ color: volumes !== undefined ? 'var(--nf-success)' : 'var(--nf-text-3)' }}>
                      {volumes !== undefined ? `${volumes.length} 卷` : '未生成'}
                    </span>
                    <span className={css.assetStatDetail} title={volumes?.map(v => v.title).join(' / ')}>
                      {volumes !== undefined ? volumes.map(v => v.title).join(' / ') : '按剧情弧线划分全书'}
                    </span>
                  </div>
                  <div className={css.assetStat}>
                    <span className={css.assetStatLabel}>写作资产</span>
                    <span className={css.assetStatValue} style={{ color: assetCount > 0 ? 'var(--nf-success)' : 'var(--nf-text-3)' }}>
                      {assetCount} 项
                    </span>
                    <span className={css.assetStatDetail} title={assetSummary}>{assetSummary}</span>
                  </div>
                  <div className={css.assetStat}>
                    <span className={css.assetStatLabel}>伏笔</span>
                    <span className={css.assetStatValue}>{foreshadows.length} 条</span>
                    <span className={css.assetStatDetail}>
                      {foreshadows.filter(f => f.status === 'planned').length} 待埋 · {foreshadows.filter(f => f.status === 'resolved').length} 已回收
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 全书质检结果 */}
            {auditIssues !== null && (
              <div className={css.card} style={{ borderColor: auditIssues.length > 0 ? 'var(--nf-error)' : 'var(--nf-success)' }}>
                <div className={css.row} style={{ justifyContent: 'space-between' }}>
                  <span className={css.cardTitle}>
                    🔍 全书质检{auditIssues.length === 0 ? '：未发现矛盾 🎉' : `：${auditIssues.length} 处疑似矛盾`}
                  </span>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setAuditIssues(null) }}>
                    收起
                  </button>
                </div>
                {auditIssues.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {auditIssues.map((issue, i) => (
                      <div key={i} className={`${css.todoItem} ${issue.severity === 'high' ? css.todoDanger : issue.severity === 'medium' ? css.todoWarning : css.todoInfo}`}>
                        <span className={css.todoText}>
                          <span>
                            {issue.chapterNo > 0 ? `第 ${issue.chapterNo} 章` : '未定位章节'} · [{issue.severity}] {issue.item}
                          </span>
                          {issue.suggestion !== '' && <span className={css.meta}>建议：{issue.suggestion}</span>}
                        </span>
                        {issue.chapterNo > 0 && (
                          <button
                            type="button"
                            className={`${css.button} ${css.buttonSmall}`}
                            disabled={busy}
                            onClick={() => { void openWorkspace(issue.chapterNo, `按质检意见修订：${issue.item}（建议：${issue.suggestion}）`) }}
                          >
                            去修订
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 📟 活动输出：无论生成 / 审稿 / 润色 / 质检 / 助手操作，全部活动实时显示于此 */}
            <div className={css.card}>
              <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span className={css.cardTitle}>📟 活动输出（{progress.length}）</span>
                <div className={css.row}>
                  <span className={css.meta}>生成/审稿/润色/质检等所有操作都会记录在这里</span>
                  {progress.length > 0 && (
                    <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setProgress([]) }}>
                      清空
                    </button>
                  )}
                </div>
              </div>
              <div className={css.progress} style={{ maxHeight: 260, overflowY: 'auto' }}>
                {progress.length === 0 && <span className={css.meta}>{tt('progress.empty')}</span>}
                {progress.map(line => (
                  <div key={line.id} className={line.kind === 'done' ? css.progressLineDone : line.kind === 'error' ? css.progressLineError : line.live === true ? css.progressLineLive : css.progressLine}>
                    {line.live === true && (
                      <span className={css.progressBar}>
                        <span className={css.progressBarFill} style={{ width: `${Math.round((line.ratio ?? 0) * 100)}%` }} />
                      </span>
                    )}
                    {line.text}
                  </div>
                ))}
                <div ref={progressEndRef} />
              </div>
            </div>
          </>
        )}

        {activeTab === 'overview' && (
          <>
            <div className={css.card}>
              <div className={css.row} style={{ justifyContent: 'space-between' }}>
                <span className={css.cardTitle}>{tt('tab.overview')}</span>
                {project !== null && (
                  <div className={css.row}>
                    <span className={css.meta}>
                      {tt('overview.bookName')}: {project.bookName} · {project.outline.length} 字
                      {project.outlinePath !== undefined && <span> · {project.outlinePath}</span>}
                    </span>
                    <button type="button" className={css.button} disabled={busy} onClick={() => { handleToggleUpdateOutline() }}>
                      {updatingOutline ? '收起' : '更新大纲'}
                    </button>
                  </div>
                )}
              </div>
              {project === null ? (
                <>
                  {/* 未开书：导入大纲（开书动作） */}
                  <div
                    className={`${css.dropzone} ${dragActive ? css.dropzoneActive : ''}`}
                    onClick={() => { fileInputRef.current?.click() }}
                    onDragOver={e => { e.preventDefault(); setDragActive(true) }}
                    onDragLeave={() => { setDragActive(false) }}
                    onDrop={e => {
                      e.preventDefault()
                      setDragActive(false)
                      const file = e.dataTransfer.files?.[0]
                      if (file !== undefined) void handleDocxFile(file)
                    }}
                  >
                    <span className={css.dropzoneIcon}>📄</span>
                    <span>点击选择本机 docx 大纲，或将文件拖到这里</span>
                    <span className={css.meta}>也支持粘贴文本到下方编辑区</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file !== undefined) void handleDocxFile(file)
                        e.target.value = ''
                      }}
                    />
                  </div>
                  <div className={css.row} style={{ justifyContent: 'space-between' }}>
                    <span className={css.meta}>{tt('overview.outlineChars')}: {outlineText.length}</span>
                    <button type="button" className={css.button} disabled={busy || outlineText.length < 50} onClick={() => { void handleSaveOutline() }}>
                      {tt('overview.saveOutline')}
                    </button>
                  </div>
                  <textarea
                    className={css.textarea}
                    value={outlineText}
                    placeholder={tt('overview.outlineHint')}
                    onChange={e => { setOutlineText(e.target.value) }}
                    spellCheck={false}
                  />
                </>
              ) : updatingOutline ? (
                <>
                  <div className={css.meta}>
                    大纲是本书的「出生证明」。更新时请二选一：<b>仅更新文本</b>（保留设定/章节/正文全部进度），或
                    <b>重置项目</b>（从新总纲重新开始，清空道藏/卷/章节/正文/暗线/资产/编年录，不可恢复）。
                  </div>
                  <textarea
                    className={css.textarea}
                    value={outlineText}
                    placeholder="粘贴新版大纲文本…"
                    onChange={e => { setOutlineText(e.target.value) }}
                    spellCheck={false}
                  />
                  <div className={css.row}>
                    <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy || outlineText.length < 50} onClick={() => { void handleSaveOutline() }}>
                      仅更新文本（保留进度）
                    </button>
                    <button type="button" className={`${css.button} ${css.buttonDanger}`} disabled={busy || outlineText.length < 50} onClick={() => { void handleResetProject() }}>
                      重置项目并更新（清空进度）
                    </button>
                    <span className={css.meta}>{outlineText.length} 字</span>
                  </div>
                </>
              ) : (
                /* 只读展示：大纲是开书时的出生证明 */
                <pre className={css.outlineReadonly}>{project.outline}</pre>
              )}
            </div>
            <div className={css.card}>
              <span className={css.cardTitle}>{tt('status.files')}（{generatedFiles.length}）</span>
              <div className={css.fileList}>
                {generatedFiles.length === 0 && <span>{tt('status.projectNone')}</span>}
                {generatedFiles.map(file => <span key={file}>{file}</span>)}
              </div>
            </div>
          </>
        )}

        {/* 卷首语：面向读者的作品门面 */}
        {activeTab === 'blurb' && (
          <div className={css.card}>
            <div className={css.row} style={{ justifyContent: 'space-between' }}>
              <span className={css.cardTitle}>卷首语</span>
              <div className={css.row}>
                <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy || project === null} onClick={() => { void handleBlurbGenerate() }}>
                  ✨ AI 生成
                </button>
                <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || project === null || blurbDraft.trim() === ''} onClick={() => { void handleBlurbComplete() }}>
                  ✍️ AI 补全
                </button>
                {project?.blurb !== undefined && (
                  <button
                    type="button"
                    className={`${css.button} ${css.buttonSmall}`}
                    disabled={busy || project === null}
                    onClick={() => {
                      if (window.confirm('重新生成会覆盖当前简介（可先复制保存），确定？')) void handleBlurbGenerate()
                    }}
                  >
                    🔄 重新生成
                  </button>
                )}
              </div>
            </div>
            {/* 书名（可改名，同步书架） */}
            <div className={css.row}>
              <input
                className={css.input}
                style={{ flex: 1, maxWidth: 320 }}
                placeholder="书名"
                value={bookNameDraft}
                onChange={e => { setBookNameDraft(e.target.value) }}
                onKeyDown={e => { if (e.key === 'Enter') void handleRename() }}
              />
              <button
                type="button"
                className={`${css.button} ${css.buttonSmall}`}
                disabled={busy || bookNameDraft.trim() === '' || bookNameDraft.trim() === project?.bookName}
                onClick={() => { void handleRename() }}
              >
                💾 改书名
              </button>
            </div>
            {/* 封面 */}
            <div className={css.row} style={{ alignItems: 'flex-start', gap: 14 }}>
              <div className={css.coverPreview}>
                {coverDataUrl !== null ? (
                  <img src={coverDataUrl} alt="封面" />
                ) : (
                  <span className={css.coverPlaceholder}>暂无封面</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className={css.row}>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || project === null} onClick={() => { coverFileRef.current?.click() }}>
                    📤 上传封面
                  </button>
                  <input
                    ref={coverFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    onChange={e => {
                      handleCoverUpload(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                  {coverDataUrl !== null && (
                    <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { void handleCoverRemove() }}>
                      🗑️ 移除
                    </button>
                  )}
                </div>
                <span className={css.meta}>支持 PNG / JPG / WebP，建议 3:4 竖版；保存于输出目录 cover.*。</span>
              </div>
            </div>
            <span className={css.meta}>
              面向读者的作品门面（120-250 字）：突出核心卖点与开局钩子，不剧透。点击 ✨AI 生成全量生成；或先写几句再点 ✍️AI 补全续写完整；不满意可 🔄 重新生成。
            </span>
            {project === null ? (
              <span className={css.meta}>请先在大纲页导入大纲建立项目。</span>
            ) : (
              <>
                <textarea
                  className={css.textarea}
                  style={{ minHeight: 140 }}
                  placeholder="点击 ✨AI 生成，或先写下开头几句，再点 ✍️AI 补全…"
                  value={blurbDraft}
                  onChange={e => { setBlurbDraft(e.target.value) }}
                  spellCheck={false}
                />
                <div className={css.row}>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || blurbDraft.trim() === ''} onClick={() => { void handleBlurbSave() }}>
                    💾 保存简介
                  </button>
                  <span className={css.meta}>
                    {blurbDraft.length} 字 · 已保存：{project.blurb !== undefined ? `${project.blurb.length} 字` : '无'}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'plan' && (
          <>
            <div className={css.card}>
              <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span className={css.cardTitle}>{tt('tab.plan')}</span>
                <div className={css.row} style={{ flexWrap: 'wrap' }}>
                  <span className={css.meta}>{tt('plan.generateHint')}</span>
                  <input
                    className={css.input}
                    style={{ width: 72 }}
                    type="number"
                    min={1}
                    max={200}
                    value={planCount}
                    onChange={e => { const v = Number(e.target.value); if (Number.isInteger(v)) setPlanCount(v) }}
                  />
                  <span className={css.meta}>{tt('plan.count')}</span>
                  <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy || outlineText.length < 50} onClick={() => { void handlePlan() }}>
                    {tt('plan.generate')}
                  </button>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || doneCount === 0} onClick={() => { void handleSensitiveScan() }} title={tt('sensitive.hint')}>
                    🔞 {tt('sensitive.scanAll')}
                  </button>
                </div>
              </div>
            </div>

            {sensHits !== null && (
              <div className={css.card} style={{ borderColor: sensHits.length > 0 ? 'var(--nf-warn)' : 'var(--nf-success)' }}>
                <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <span className={css.cardTitle}>
                    {sensHits.length === 0
                      ? tt('sensitive.clean', { n: sensScanned })
                      : tt('sensitive.hits', { n: sensHits.length, chapters: new Set(sensHits.map(h => h.chapterNo)).size })}
                  </span>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setSensHits(null) }}>收起</button>
                </div>
                <span className={css.meta}>{tt('sensitive.hint')}</span>
                {sensHits.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto', fontSize: 12 }}>
                    {sensHits.map((hit, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', border: '1px solid var(--nf-border)', borderRadius: 6, padding: '4px 8px' }}>
                        <span className={css.badge} style={{ borderColor: 'var(--nf-warn)', color: 'var(--nf-warn)', flex: 'none' }}>
                          {hit.chapterNo > 0 ? `第${hit.chapterNo}章` : '文本'}
                        </span>
                        <span className={css.meta} style={{ flex: 1 }}>
                          <b style={{ color: 'var(--nf-error)' }}>{hit.word}</b> ×{hit.count} · [{hit.category}]
                        </span>
                        {hit.chapterNo > 0 && (
                          <button
                            type="button"
                            className={`${css.button} ${css.buttonSmall}`}
                            disabled={busy}
                            onClick={() => { void openWorkspace(hit.chapterNo, tt('sensitive.fixPrefill', { word: hit.word, category: hit.category })) }}
                          >
                            {tt('sensitive.goFix')}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {chapters.length > 0 && (
              <div className={css.card}>
                <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div className={css.row} style={{ flexWrap: 'wrap', gap: 6 }}>
                    {(volumes !== undefined && volumes.length > 0) && (
                      <>
                        <button
                          type="button"
                          className={`${css.button} ${css.buttonSmall} ${selectedVolume === 'all' ? css.buttonPrimary : ''}`}
                          onClick={() => { setSelectedVolume('all') }}
                        >
                          全部卷
                        </button>
                        {volumes.map(v => (
                          <button
                            key={v.no}
                            type="button"
                            className={`${css.button} ${css.buttonSmall} ${selectedVolume === v.no ? css.buttonPrimary : ''}`}
                            onClick={() => { setSelectedVolume(v.no) }}
                            title={`第${v.no}卷 · ${v.chapterStart}-${v.chapterEnd} 章`}
                          >
                            {v.no}. {v.title}（{v.chapterStart}-{v.chapterEnd}）
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                  {pendingCount > 0 && (
                    <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleWriteAll() }}>
                      {tt('plan.writeAllPending')}（{pendingCount}）
                    </button>
                  )}
                </div>
                <div className={css.chapterList}>
                  {chapterGroups.filter(g => selectedVolume === 'all' || g.no === selectedVolume).map(group => {
                    const collapsed = group.no !== 0 && collapsedVolumes.includes(group.no)
                    const groupDone = group.chapters.filter(c => c.status === 'approved' || c.status === 'written' || c.status === 'rejected').length
                    return (
                      <div key={group.no} className={css.volumeGroup}>
                        <div
                          className={css.volumeGroupHeader}
                          onClick={() => {
                            if (group.no !== 0) {
                              setCollapsedVolumes(prev => prev.includes(group.no) ? prev.filter(x => x !== group.no) : [...prev, group.no])
                            }
                          }}
                        >
                          <span className={css.volumeGroupToggle}>{group.no !== 0 ? (collapsed ? '▸' : '▾') : '📖'}</span>
                          <b>{group.title}</b>
                          <span className={css.meta}>（{group.chapters.length} 章 · 已完成 {groupDone}）</span>
                        </div>
                        {!collapsed && group.chapters.map(chapter => {
                    const badge = statusBadge(chapter)
                    const expanded = expandedChapter === chapter.no
                    const review: ReviewReport | undefined = chapter.review
                    return (
                      <div key={chapter.no} className={css.chapter}>
                        <span className={css.chapterNum}>{chapter.no}</span>
                        <div className={css.chapterMain}>
                          <div className={css.chapterTitle}>
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} style={{ padding: '1px 6px' }} onClick={() => { void handleToggleChapter(chapter.no) }}>
                              {expanded ? '−' : '+'}
                            </button>
                            <span>{chapter.title}</span>
                            {chapter.status === 'approved' && chapter.chars !== undefined && (
                              <span className={css.meta}>{chapter.chars}{tt('common.chars')}</span>
                            )}
                            {chapter.volume > 0 && <span className={css.meta}>{tt('plan.volumes')}{chapter.volume}</span>}
                          </div>
                          {!expanded && <div className={css.chapterBeats} title={chapter.beats}>{chapter.beats}</div>}
                          {expanded && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div className={css.meta}><b>{tt('plan.beats')}:</b></div>
                              <div className={css.meta}>{renderBeats(chapter.beats)}</div>
                              {chapter.summary !== undefined && chapter.summary !== '' && (
                                <div className={css.meta}><b>{tt('plan.summary')}:</b> {chapter.summary}</div>
                              )}
                              <pre className={css.chapterPreview}>{chapterText || `（${tt('common.loading')}）`}</pre>
                              {review !== undefined && (
                                <div className={css.reviewBox}>
                                  <div className={css.row} style={{ justifyContent: 'space-between' }}>
                                    <b>{tt('plan.reviewReport')}</b>
                                    <span style={{ color: review.passed ? 'var(--nf-success)' : 'var(--nf-error)' }}>
                                      {tt('plan.reviewScore')}: {review.score} — {review.passed ? tt('plan.reviewPass') : tt('plan.reviewFail')}
                                    </span>
                                  </div>
                                  <div className={css.meta}><b>{tt('plan.reviewVerdict')}:</b> {review.verdict}</div>
                                  {review.issues.length > 0 && (
                                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                                      {review.issues.map((issue, i) => (
                                        <li key={i} style={{ color: severityColor(issue.severity) }}>
                                          [{issue.severity}] {issue.item} → {issue.suggestion}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}
                              {(chapter.status === 'rejected' || chapter.status === 'written' || chapter.status === 'approved') && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  <div className={css.meta} style={{ fontWeight: 600 }}>
                                    润色 / 修订 — 在右上角打开工作区：左栏原文可直接选中文字做局部修订，右栏输入指令后预览，确认后再应用（未应用不改动原稿）
                                  </div>
                                  <div className={css.row}>
                                    <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy || busyAny} onClick={() => { void openWorkspace(chapter.no) }}>
                                      {tt('plan.rewrite')} / {tt('plan.polish')}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <span className={`${css.badge} ${badge.cls}`}>{badge.label}</span>
                        <div className={css.chapterActions}>
                          {(chapter.status === 'pending' || chapter.status === 'error') && (
                            <button
                              type="button"
                              className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
                              disabled={busy || busyAny}
                              onClick={() => { void handleWriteChapter(chapter.no, true) }}
                            >
                              {tt('plan.write')}
                            </button>
                          )}
                          {(chapter.status === 'written' || chapter.status === 'rejected') && (
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={() => { void handleReview(chapter.no) }}>
                              {tt('plan.review')}
                            </button>
                          )}
                          {chapter.status === 'written' && (
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={() => { handleApprove(chapter.no) }}>
                              {tt('plan.approve')}
                            </button>
                          )}
                          {(chapter.status === 'written' || chapter.status === 'rejected' || chapter.status === 'approved') && (
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={() => { void openWorkspace(chapter.no) }} title="手动编辑正文 → AI 审查 → 保存">
                              ✏️ 编辑
                            </button>
                          )}
                          {(chapter.status === 'written' || chapter.status === 'rejected' || chapter.status === 'approved') && (
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={() => { void openWorkspace(chapter.no) }}>
                              {tt('plan.polish')}
                            </button>
                          )}
                          {chapter.status === 'rejected' && (
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={() => { void openWorkspace(chapter.no) }} title="按审稿意见修订（自动带入意见）">
                              按意见修订
                            </button>
                          )}
                          {chapter.status === 'rejected' && (
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={() => { void handleWriteChapter(chapter.no, true) }} title="整章重新生成">
                              重新生成
                            </button>
                          )}
                        </div>
                      </div>
                    )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'bible' && (
          <>
          <div className={css.card}>
            <div className={css.row} style={{ justifyContent: 'space-between' }}>
              <span className={css.cardTitle}>{tt('bible.title')}</span>
              <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleBible() }}>
                {tt('bible.gen')}
              </button>
            </div>
            {bible === undefined ? (
              <span className={css.meta}>{tt('bible.none')}</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {bible.genre !== '' && (
                  <div><b>{tt('bible.genre')}:</b> <span className={css.meta}>{bible.genre}</span></div>
                )}
                {/* 世界观规则独立卡片（可编辑，每行一条） */}
                {bible.worldRules.length > 0 && (
                  <div style={{ border: '1px solid var(--nf-border)', borderRadius: 10, padding: '8px 10px' }}>
                    <div className={css.row} style={{ justifyContent: 'space-between' }}>
                      <b>{tt('bible.worldRules')}（{bible.worldRules.length}）</b>
                      <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setWorldRulesDraft(bible.worldRules.join('\n')) }}>
                        编辑
                      </button>
                    </div>
                    {worldRulesDraft !== '' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                        <textarea
                          className={css.textarea}
                          style={{ minHeight: 120 }}
                          value={worldRulesDraft}
                          onChange={e => { setWorldRulesDraft(e.target.value) }}
                          placeholder="每条规则一行…"
                        />
                        <div className={css.row}>
                          <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleSaveWorldRules() }}>
                            保存规则
                          </button>
                          <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setWorldRulesDraft('') }}>
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                    {worldRulesDraft === '' && (
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12 }}>{bible.worldRules.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    )}
                  </div>
                )}
                {bible.characters.length > 0 && (
                  <div>
                    <b>{tt('bible.characters')}（{bible.characters.length}）</b>
                    {bible.characters.map(card => (
                      <div key={card.name} style={{ marginTop: 4, fontSize: 12 }}>
                        <b>{card.name}</b> <span className={css.meta}>[{card.role}] {card.traits.join('、')}</span>
                        {card.goals !== '' && <div className={css.meta}>目标：{card.goals}</div>}
                        {card.relations !== '' && <div className={css.meta}>关系：{card.relations}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {bible.redLines.length > 0 && (
                  <div>
                    <b>{tt('bible.redLines')}（{bible.redLines.length}）</b>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--nf-error)' }}>{bible.redLines.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  </div>
                )}
                {bible.style.length > 0 && (
                  <div>
                    <b>{tt('bible.style')}（{bible.style.length}）</b>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>{bible.style.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  </div>
                )}
              </div>
            )}
          </div>
          </>
        )}

        {/* 大世界：境界体系 / 区域 / 势力 */}
        {activeTab === 'world' && (
          <WorldTab
            api={api}
            world={project?.world}
            onChanged={w => {
              setProject(prev => prev === null ? prev : { ...prev, world: w, updatedAt: new Date().toISOString() })
              pushProgress(`大世界已保存：${w.realms.length} 境界 · ${w.regions.length} 区域 · ${w.factions.length} 势力`, 'done')
            }}
          />
        )}

        {/* 人物志：从编年录聚合的当前状态（独立导航页） */}
        {activeTab === 'characters' && (
          <div className={css.card}>
            <div className={css.row} style={{ justifyContent: 'space-between' }}>
              <span className={css.cardTitle}>人物志（当前状态）</span>
              <div className={css.row}>
                <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || doneCount === 0} onClick={() => { void handleFactsBackfill() }} title="历史章节（编年录功能上线前生成的）批量抽取事实">
                  📥 回填编年录
                </button>
                <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy || (project?.facts ?? []).length === 0} onClick={() => { void handleCharactersRefresh() }}>
                  ↻ 从编年录刷新
                </button>
              </div>
            </div>
            {charCards === null ? (
              <span className={css.meta}>
                {(project?.facts ?? []).length === 0
                  ? '暂无编年录（生成章节后自动积累人物状态/境界/资源/关系等事实），刷新按钮将在有事实后可用。'
                  : '点击「从编年录刷新」聚合各人物当前状态（境界/资源/伤势/心境）。'}
              </span>
            ) : charCards.length === 0 ? (
              <span className={css.meta}>未识别到人物信息。</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {charCards.map(card => (
                  <div key={card.name} style={{ border: '1px solid var(--nf-border)', borderRadius: 8, padding: '6px 10px', fontSize: 12 }}>
                    <div className={css.row} style={{ justifyContent: 'space-between' }}>
                      <b>{card.name}</b>
                      <span className={css.meta}>
                        {card.role === 'protagonist' ? '主角' : card.role === 'supporting' ? '配角' : card.role === 'antagonist' ? '反派' : '其他'}
                        {' · 出场 '}{card.appearances} 次 · 最近 第 {card.lastChapter} 章
                      </span>
                    </div>
                    {card.status !== '' && <div className={css.meta}>状态：{card.status}</div>}
                  </div>
                ))}
              </div>
            )}
            <span className={css.meta}>人物志由「道藏」人物名单 + 「编年录」聚合而来，随章节生成自动保持最新。</span>
          </div>
        )}

        {/* 角色知情度：信息差管理 */}
        {activeTab === 'characters' && (
          <div className={css.card}>
            <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span className={css.cardTitle}>角色知情度（信息差管理）</span>
              <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy || (bible?.characters ?? []).length === 0} onClick={() => { void handleKnowledgeSave() }}>
                💾 保存知情度
              </button>
            </div>
            <span className={css.meta}>
              填写每个角色「已经知道」的事实/秘密（每行一条）。生成与审稿会严格遵守：未列出的信息该角色一律不知道——避免"不该知道的人知道了"。
            </span>
            {(bible?.characters ?? []).length === 0 ? (
              <span className={css.meta}>暂无角色卡——先在「道藏」提炼设定。</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {bible!.characters.map(card => (
                  <div key={card.name} style={{ border: '1px solid var(--nf-border)', borderRadius: 10, padding: '8px 10px', fontSize: 12 }}>
                    <div className={css.row} style={{ justifyContent: 'space-between' }}>
                      <b>{card.name}</b>
                      <span className={css.meta}>
                        {card.role === 'protagonist' ? '主角' : card.role === 'supporting' ? '配角' : card.role === 'antagonist' ? '反派' : '其他'}
                      </span>
                    </div>
                    <textarea
                      className={css.textarea}
                      style={{ minHeight: 52, fontSize: 12 }}
                      placeholder="每行一条该角色知道的信息，例如：林越的真实身份 / 古玉残片的秘密…"
                      value={knowledgeDraft[card.name] ?? (card.knowledge ?? []).join('\n')}
                      onChange={e => { setKnowledgeDraft(prev => ({ ...prev, [card.name]: e.target.value })) }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 写作资产 5 个子分类（左侧导航直达） */}
        {activeTab === 'assetsGenre' && <AssetsTab api={api} initialTab="genre" />}
        {activeTab === 'assetsProgression' && <AssetsTab api={api} initialTab="progression" />}
        {activeTab === 'assetsTemplates' && <AssetsTab api={api} initialTab="templates" />}
        {activeTab === 'assetsRules' && <AssetsTab api={api} initialTab="rules" />}
        {activeTab === 'assetsStyle' && <AssetsTab api={api} initialTab="style" />}

        {activeTab === 'foreshadow' && (
          <div className={css.card}>
            <div className={css.row} style={{ justifyContent: 'space-between' }}>
              <span className={css.cardTitle}>{tt('foreshadow.title')}（{foreshadows.length}）</span>
              <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleSuggestForeshadows() }}>
                {tt('foreshadow.suggest')}
              </button>
            </div>
            {foreshadows.length === 0 ? (
              <span className={css.meta}>{tt('foreshadow.none')}</span>
            ) : (
              <div className={css.chapterList}>
                {foreshadows.map(f => {
                  const statusLabel = { planned: tt('foreshadow.planned'), planted: tt('foreshadow.planted'), progressing: tt('foreshadow.progressing'), resolved: tt('foreshadow.resolved'), abandoned: tt('foreshadow.abandoned') }[f.status]
                  const statusColor = f.status === 'resolved' ? 'var(--nf-success)' : f.status === 'planted' || f.status === 'progressing' ? 'var(--nf-accent)' : f.status === 'abandoned' ? 'var(--nf-text-3)' : 'var(--nf-info)'
                  return (
                    <div key={f.id} className={css.chapter}>
                      <div className={css.chapterMain}>
                        <div className={css.chapterTitle}>
                          <span>{f.description}</span>
                        </div>
                        <div className={css.meta}>
                          {f.plantedChapter !== undefined && <span>{tt('foreshadow.plantedAt')} 第{f.plantedChapter}章 · </span>}
                          {f.targetChapter !== undefined && <span>{tt('foreshadow.target')} 第{f.targetChapter}章 · </span>}
                          {f.resolvedNote !== undefined && f.resolvedNote !== '' && <span>回收：{f.resolvedNote} · </span>}
                        </div>
                      </div>
                      <span className={css.badge} style={{ borderColor: statusColor, color: statusColor }}>{statusLabel}</span>
                      <div className={css.row} style={{ gap: 4 }}>
                        {f.status === 'planned' && (
                          <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => {
                            void api.foreshadow({ id: f.id, status: 'planted', plantedChapter: doneCount + 1 }).then(r => setProject(prev => prev === null ? prev : { ...prev, foreshadows: r.foreshadows }))
                          }}>
                            {tt('foreshadow.setPlanted')}
                          </button>
                        )}
                        {(f.status === 'planted' || f.status === 'progressing') && (
                          <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => {
                            void api.foreshadow({ id: f.id, status: 'resolved', resolvedNote: `第${doneCount}章回收` }).then(r => setProject(prev => prev === null ? prev : { ...prev, foreshadows: r.foreshadows }))
                          }}>
                            {tt('foreshadow.setResolved')}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && configDraft !== null && (
          <div className={css.card}>
            <span className={css.cardTitle}>{tt('settings.title')}</span>
            <div className={css.field}>
              <label className={css.fieldLabel}>{tt('settings.outlinePath')}</label>
              <input className={css.input} value={configDraft.outlinePath} onChange={e => { setConfigDraft({ ...configDraft, outlinePath: e.target.value }) }} />
            </div>
            <div className={css.field}>
              <label className={css.fieldLabel}>{tt('settings.outputDir')}</label>
              <input className={css.input} value={configDraft.outputDir} onChange={e => { setConfigDraft({ ...configDraft, outputDir: e.target.value }) }} />
            </div>
            <div className={css.row}>
              <div className={css.field} style={{ flex: 1 }}>
                <label className={css.fieldLabel}>{tt('settings.provider')}</label>
                <input className={css.input} value={configDraft.provider} onChange={e => { setConfigDraft({ ...configDraft, provider: e.target.value }) }} />
              </div>
              <div className={css.field} style={{ flex: 1 }}>
                <label className={css.fieldLabel}>{tt('settings.model')}</label>
                <input className={css.input} value={configDraft.model} onChange={e => { setConfigDraft({ ...configDraft, model: e.target.value }) }} />
              </div>
            </div>
            <div className={css.row}>
              <div className={css.field} style={{ flex: 1 }}>
                <label className={css.fieldLabel}>{tt('settings.chapterChars')}</label>
                <input className={css.input} type="number" min={1000} max={20000} value={configDraft.chapterChars} onChange={e => { setConfigDraft({ ...configDraft, chapterChars: Number(e.target.value) }) }} />
              </div>
              <div className={css.field} style={{ flex: 1 }}>
                <label className={css.fieldLabel}>{tt('settings.maxTokens')}</label>
                <input className={css.input} type="number" min={2000} max={64000} value={configDraft.maxTokens} onChange={e => { setConfigDraft({ ...configDraft, maxTokens: Number(e.target.value) }) }} />
              </div>
            </div>
            <div className={css.row}>
              <div className={css.field} style={{ flex: 1 }}>
                <label className={css.fieldLabel}>{tt('settings.reviewPassScore')}</label>
                <input className={css.input} type="number" min={0} max={100} value={configDraft.reviewPassScore} onChange={e => { setConfigDraft({ ...configDraft, reviewPassScore: Number(e.target.value) }) }} />
              </div>
              <div className={css.field} style={{ flex: 1 }}>
                <label className={css.fieldLabel}>{tt('settings.editorFontSize')}</label>
                <select
                  className={css.input}
                  value={editorFontSize}
                  onChange={e => { changeEditorFontSize(Number(e.target.value)) }}
                >
                  {[12, 13, 14, 15, 16, 18, 20, 22, 24].map(v => (
                    <option key={v} value={v}>{v}px</option>
                  ))}
                </select>
                <span className={css.meta}>{tt('settings.editorFontSizeHint')}</span>
              </div>
              <div className={css.field} style={{ flex: 1 }}>
                <label className={css.fieldLabel}>{tt('settings.autoReview')}</label>
                <select
                  className={css.input}
                  value={configDraft.autoReview ? '1' : '0'}
                  onChange={e => { setConfigDraft({ ...configDraft, autoReview: e.target.value === '1' }) }}
                >
                  <option value="1">✓ 是</option>
                  <option value="0">✗ 否</option>
                </select>
              </div>
            </div>
            <div className={css.row}>
              <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleSaveConfig() }}>
                {tt('settings.save')}
              </button>
              <button type="button" className={css.button} onClick={() => { void api.openFolder() }}>
                {tt('settings.openFolder')}
              </button>
              <span className={css.meta}>当前：{config?.provider} / {config?.model} · {config?.outputDir}</span>
            </div>
            <div className={css.row}>
              <span className={css.cardTitle}>{tt('settings.export')}</span>
              <button type="button" className={css.button} disabled={busy || chapters.length === 0} onClick={() => { void handleExport('txt') }}>
                {tt('settings.exportTxt')}
              </button>
              <button type="button" className={css.button} disabled={busy || chapters.length === 0} onClick={() => { void handleExport('md') }}>
                {tt('settings.exportMd')}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className={css.card}>
            <span className={css.cardTitle}>{tt('settings.theme')}</span>
            <div className={css.row} style={{ gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`${css.button} ${css.buttonSmall} ${panelTheme === 'liquid' ? css.buttonPrimary : ''}`}
                onClick={() => { changePanelTheme('liquid') }}
                title="iOS 液态玻璃质感 · 绿色强调（当前默认）"
              >
                🧊 {tt('settings.themeLiquid')}
              </button>
              <button
                type="button"
                className={`${css.button} ${css.buttonSmall} ${panelTheme === 'classic' ? css.buttonPrimary : ''}`}
                onClick={() => { changePanelTheme('classic') }}
                title="经典 iOS 毛玻璃 · 蓝色强调"
              >
                💠 {tt('settings.themeClassic')}
              </button>
              <button
                type="button"
                className={`${css.button} ${css.buttonSmall} ${panelTheme === 'neumorph' ? css.buttonPrimary : ''}`}
                onClick={() => { changePanelTheme('neumorph') }}
                title="新拟物派 · 双阴影立体（仅浅色；深色下自动回退液态）"
              >
                🔘 {tt('settings.themeNeumorph')}
              </button>
              <span className={css.meta}>{tt('settings.themeHint')}</span>
            </div>
          </div>
        )}

        {activeTab === 'facts' && (
          <div className={css.card}>
            <div className={css.busyRow} style={{ flexWrap: 'wrap' }}>
              <span className={css.cardTitle}>{tt('facts.title', { n: (project?.facts ?? []).length })}</span>
              <button
                type="button"
                className={`${css.button} ${css.buttonSmall}`}
                disabled={busy || chapters.length === 0}
                onClick={() => { void handleFactsBackfill() }}
                title="用 LLM 从历史章节正文重新抽取事实，补齐缺失的编年录条目"
              >
                📥 {tt('facts.backfill')}
              </button>
            </div>
            <span className={css.meta}>{tt('facts.hint')}</span>
            {(project?.facts ?? []).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '60vh', overflowY: 'auto', fontSize: 12 }}>
                {[...(project?.facts ?? [])].reverse().map((fact, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span className={css.badge} style={{ borderColor: 'var(--nf-text-3)', color: 'var(--nf-text-3)', flex: 'none', marginTop: 1 }}>
                      第 {fact.chapterNo} 章
                    </span>
                    <span className={css.meta}>{fact.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className={css.meta}>暂无事实条目——写一章后会自动生成，或点击上方「回填」。</span>
            )}
          </div>
        )}

        {activeTab === 'plotlines' && (
          <div className={css.card} style={{ flex: 1, minHeight: 0 }}>
            <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span className={css.cardTitle}>{tt('tab.plotlines')}（{project?.plotlines?.length ?? 0}）</span>
              {plotlineDraft === null && (
                <button
                  type="button"
                  className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
                  onClick={() => { setPlotlineDraft({ id: '', name: '', kind: 'main', goal: '', progress: '', status: 'active' }) }}
                >
                  {tt('plotlines.new')}
                </button>
              )}
            </div>
            <span className={css.meta}>{tt('plotlines.hint')}</span>

            {plotlineDraft !== null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--nf-accent)', borderRadius: 12, padding: 10 }}>
                <div className={css.row} style={{ flexWrap: 'wrap' }}>
                  <div className={css.field} style={{ flex: 2, minWidth: 160 }}>
                    <label className={css.fieldLabel}>{tt('plotlines.name')}</label>
                    <input className={css.input} value={plotlineDraft.name} onChange={e => { setPlotlineDraft({ ...plotlineDraft, name: e.target.value }) }} placeholder="如：集齐古玉残片" />
                  </div>
                  <div className={css.field} style={{ flex: 1 }}>
                    <label className={css.fieldLabel}>{tt('plotlines.kind')}</label>
                    <select className={css.input} value={plotlineDraft.kind} onChange={e => { setPlotlineDraft({ ...plotlineDraft, kind: e.target.value as Plotline['kind'] }) }}>
                      <option value="main">{tt('plotlines.kindMain')}</option>
                      <option value="branch">{tt('plotlines.kindBranch')}</option>
                      <option value="character">{tt('plotlines.kindCharacter')}</option>
                      <option value="mystery">{tt('plotlines.kindMystery')}</option>
                    </select>
                  </div>
                  <div className={css.field} style={{ flex: 1 }}>
                    <label className={css.fieldLabel}>{tt('plotlines.status')}</label>
                    <select className={css.input} value={plotlineDraft.status} onChange={e => { setPlotlineDraft({ ...plotlineDraft, status: e.target.value as Plotline['status'] }) }}>
                      <option value="active">{tt('plotlines.statusActive')}</option>
                      <option value="paused">{tt('plotlines.statusPaused')}</option>
                      <option value="resolved">{tt('plotlines.statusResolved')}</option>
                      <option value="abandoned">{tt('plotlines.statusAbandoned')}</option>
                    </select>
                  </div>
                </div>
                <div className={css.field}>
                  <label className={css.fieldLabel}>{tt('plotlines.goal')}</label>
                  <textarea className={css.textarea} style={{ minHeight: 48 }} value={plotlineDraft.goal} onChange={e => { setPlotlineDraft({ ...plotlineDraft, goal: e.target.value }) }} />
                </div>
                <div className={css.field}>
                  <label className={css.fieldLabel}>{tt('plotlines.progress')}</label>
                  <textarea className={css.textarea} style={{ minHeight: 40 }} value={plotlineDraft.progress} onChange={e => { setPlotlineDraft({ ...plotlineDraft, progress: e.target.value }) }} placeholder="如：已取得第二枚残片，正追踪第三枚线索" />
                </div>
                <div className={css.row}>
                  <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handlePlotlineSave() }}>
                    {tt('plotlines.save')}
                  </button>
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setPlotlineDraft(null) }}>
                    {tt('plotlines.cancel')}
                  </button>
                </div>
              </div>
            )}

            {(project?.plotlines ?? []).length === 0 ? (
              <span className={css.meta}>{tt('plotlines.empty')}</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}>
                {(project?.plotlines ?? []).map(line => {
                  const kindLabel = { main: tt('plotlines.kindMain'), branch: tt('plotlines.kindBranch'), character: tt('plotlines.kindCharacter'), mystery: tt('plotlines.kindMystery') }[line.kind]
                  const statusLabel = { active: tt('plotlines.statusActive'), paused: tt('plotlines.statusPaused'), resolved: tt('plotlines.statusResolved'), abandoned: tt('plotlines.statusAbandoned') }[line.status]
                  const statusColor = line.status === 'resolved' ? 'var(--nf-success)' : line.status === 'abandoned' ? 'var(--nf-text-3)' : line.status === 'paused' ? 'var(--nf-warn)' : 'var(--nf-accent)'
                  return (
                    <div key={line.id} style={{ border: '1px solid var(--nf-border)', borderRadius: 10, padding: '8px 12px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <b>{line.name}</b>
                          <span className={css.badge} style={{ borderColor: 'var(--nf-accent)', color: 'var(--nf-accent)' }}>{kindLabel}</span>
                          <span className={css.badge} style={{ borderColor: statusColor, color: statusColor }}>{statusLabel}</span>
                        </span>
                        <span style={{ display: 'flex', gap: 6 }}>
                          <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { setPlotlineDraft({ id: line.id, name: line.name, kind: line.kind, goal: line.goal, progress: line.progress, status: line.status }) }}>
                            {tt('plotlines.edit')}
                          </button>
                          <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={() => { void handlePlotlineRemove(line.id) }}>
                            {tt('plotlines.remove')}
                          </button>
                        </span>
                      </div>
                      {line.goal !== '' && <div className={css.meta}><b>{tt('plotlines.goal')}：</b>{line.goal}</div>}
                      {line.progress !== '' && <div className={css.meta}><b>{tt('plotlines.progress')}：</b>{line.progress}</div>}
                      <div className={css.meta}>
                        {tt('plotlines.chapters')}：{line.chapters.length > 0 ? line.chapters.map(n => `第${n}章`).join('、') : '—'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
        </>)}
        </div>
      </div>
      </>
      )}

      {/* AI 助手悬浮窗：可拖动、可拉大小，不占用工作台 */}
      {assistantOpen && (
        <div
          className={css.assistantFloat}
          style={{ left: assistantPos.x, top: assistantPos.y, width: assistantSize.w, height: assistantSize.h }}
        >
          <div
            className={css.assistantFloatHeader}
            onMouseDown={e => {
              e.preventDefault()
              dragState.current = { type: 'move', startX: e.clientX, startY: e.clientY, origX: assistantPos.x, origY: assistantPos.y, origW: assistantSize.w, origH: assistantSize.h }
            }}
          >
            <span>💬 AI 助手 <span className={css.meta}>（拖动标题栏移动 · 右下角拉大小）</span></span>
            <button type="button" className={css.iconButton} title="关闭" aria-label="关闭 AI 助手" onClick={() => { setAssistantOpen(false) }}>×</button>
          </div>
          <div className={css.assistantFloatBody}>
            <AssistantTab api={api} />
          </div>
          <div
            className={css.assistantResize}
            onMouseDown={e => {
              e.preventDefault()
              e.stopPropagation()
              dragState.current = { type: 'resize', startX: e.clientX, startY: e.clientY, origX: assistantPos.x, origY: assistantPos.y, origW: assistantSize.w, origH: assistantSize.h }
            }}
          />
        </div>
      )}
    </div>
  )
}
