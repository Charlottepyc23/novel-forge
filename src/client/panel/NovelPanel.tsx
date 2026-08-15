/**
 * The novel-forge workbench panel: tabs — 工作流 (guided pipeline), 大纲
 * (outline), 章节 (chapter plan + per-chapter write/review/rewrite/polish),
 * 设定库 (story bible), 伏笔 (foreshadows), 设置 (config). Generation and
 * review streams land in the progress console.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { PanelController } from './controller.ts'
import { tt } from './helpers.ts'
import { AssistantTab } from './AssistantTab.tsx'
import { AssetsTab } from './AssetsTab.tsx'
import { BookshelfBar } from './BookshelfBar.tsx'
import { extractDocxTextFromBuffer } from '../docx.ts'
import type {
  BookshelfSnapshot,
  ChapterPlan,
  Foreshadow,
  JobFrame,
  NovelConfig,
  ProjectState,
  ReviewReport,
  StoryBible,
  Volume,
} from '../../protocol.ts'
import css from './panel.module.css'

/** The panel's tab identifiers. */
export type NovelTab = 'workflow' | 'overview' | 'plan' | 'bible' | 'assets' | 'foreshadow' | 'assistant' | 'settings'

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
}

/** The tab bar definition. */
const TABS: ReadonlyArray<{ id: NovelTab; label: string }> = [
  { id: 'workflow', label: tt('tab.workflow') },
  { id: 'overview', label: tt('tab.overview') },
  { id: 'plan', label: tt('tab.plan') },
  { id: 'bible', label: tt('tab.bible') },
  { id: 'assets', label: '写作资产' },
  { id: 'foreshadow', label: tt('tab.foreshadow') },
  { id: 'assistant', label: tt('tab.assistant') },
  { id: 'settings', label: tt('tab.settings') },
]

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
  const [rewriteInstruction, setRewriteInstruction] = useState('')
  const [localTarget, setLocalTarget] = useState('')
  const progressId = useRef(0)

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

  /** Refresh status (config + project + files). */
  const refresh = useCallback(async (showError = true) => {
    try {
      const status = await api.status()
      setConfig(status.config)
      setConfigDraft(status.config)
      setProject(status.project ?? null)
      setGeneratedFiles(status.generatedFiles)
      const nextOutline = status.project?.outline
      if (nextOutline !== undefined && outlineText === '') {
        setOutlineText(nextOutline)
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
      pushProgress(`提炼设定圣经失败：${(err as Error).message}`, 'error')
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
      setProject(prev => {
        const base = prev ?? {
          bookName: '', outline: outlineText, chapters: [] as ChapterPlan[],
          foreshadows: [] as Foreshadow[], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }
        return { ...base, chapters: [...base.chapters, ...result.chapters], updatedAt: new Date().toISOString() }
      })
      pushProgress(tt('workflow.planDone', { n: result.chapters.length }), 'done')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`生成章节计划失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  /** Shared frame handler for generate/rewrite/polish streams. */
  const applyJobFrame = useCallback((frame: JobFrame, label: (no: number) => string) => {
    if (frame.type === 'start') {
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === frame.no ? { ...c, status: 'generating', error: undefined } : c),
      })
      pushProgress(label(frame.no))
    } else if (frame.type === 'delta') {
      if (frame.text.length % 3000 < 600) {
        pushProgress(`…已生成 ${frame.text.length} 字`)
      }
    } else if (frame.type === 'done' || frame.type === 'rewritten') {
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === frame.no ? { ...c, status: 'written', chars: frame.chars, file: frame.file, review: undefined } : c),
      })
      pushProgress(tt('progress.done', { no: frame.no, chars: frame.chars, file: frame.file }), 'done')
      setGeneratedFiles(prev => prev.includes(frame.file) ? prev : [...prev, frame.file])
    } else if (frame.type === 'review') {
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === frame.no ? { ...c, status: frame.report.passed ? 'approved' : 'rejected', review: frame.report } : c),
      })
      pushProgress(tt('progress.reviewed', {
        no: frame.no,
        score: frame.report.score,
        verdict: frame.report.verdict,
      }), frame.report.passed ? 'done' : 'error')
    } else if (frame.type === 'error') {
      setProject(prev => prev === null ? prev : {
        ...prev,
        chapters: prev.chapters.map(c => c.no === frame.no ? { ...c, status: 'error', error: frame.message } : c),
      })
      pushProgress(tt('progress.error', { no: frame.no, message: frame.message }), 'error')
    }
  }, [pushProgress])

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

  /** Batch-write all remaining chapters in sequence. */
  const handleWriteAll = async (): Promise<void> => {
    const remaining = chapters.filter(c => c.status === 'pending' || c.status === 'error')
    if (remaining.length === 0) return
    setBusy(true)
    setBusyLabel(`${tt('plan.writeAllPending')}（共 ${remaining.length} 章）`)
    setError('')
    let failed = 0
    for (const chapter of remaining) {
      pushProgress(`▶ 开始生成第 ${chapter.no} 章《${chapter.title}》`)
      try {
        await api.generate(chapter.no, true, frame => { applyJobFrame(frame, n => tt('progress.generating', { no: n, title: (project?.chapters.find(c => c.no === n)?.title ?? '') })) })
      } catch (err) {
        failed++
        pushProgress(`第 ${chapter.no} 章失败：${(err as Error).message}`, 'error')
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

  /** Rewrite one chapter (whole-chapter or local target). */
  const handleRewrite = async (no: number): Promise<void> => {
    setBusy(true)
    setBusyLabel(`${tt('plan.rewrite')} 第${no}章`)
    setError('')
    try {
      await api.rewrite(no, rewriteInstruction, localTarget, frame => { applyJobFrame(frame, n => tt('progress.rewriting', { no: n })) })
      setRewriteInstruction('')
      setLocalTarget('')
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`第 ${no} 章修订失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
      await refresh(false)
    }
  }

  /** Polish one chapter. */
  const handlePolish = async (no: number): Promise<void> => {
    setBusy(true)
    setBusyLabel(`${tt('plan.polish')} 第${no}章`)
    setError('')
    try {
      await api.polish(no, frame => { applyJobFrame(frame, n => tt('progress.polishing', { no: n })) })
    } catch (err) {
      setError((err as Error).message)
      pushProgress(`第 ${no} 章润色失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy(false)
      setBusyLabel('')
      await refresh(false)
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

  /** Workflow timeline row: step dot + connector + label + optional action. */
  const workflowRow = (stepNo: number, done: boolean, label: string, hint: string, buttonLabel: string, onClick: () => void, disabled: boolean) => (
    <div className={css.workflowRow}>
      <span className={`${css.workflowDot} ${done ? css.workflowDotDone : css.workflowDotActive}`}>{done ? '✓' : stepNo}</span>
      <div className={css.workflowBody}>
        <span className={css.workflowLabel}>{label}</span>
        <span className={css.workflowHint}>{hint}</span>
      </div>
      {!done && (
        <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={disabled || busy} onClick={onClick}>
          {buttonLabel}
        </button>
      )}
    </div>
  )

  return (
    <div className={css.panel}>
      <div className={css.panelHeader}>
        <h2 className={css.panelTitle}>
          {tt('panel.title')}
          {project?.bookName !== '' && project?.bookName !== undefined && (
            <span className={css.badge} style={{ borderColor: 'var(--nf-accent)', color: 'var(--nf-accent)', fontSize: 11 }}>{project.bookName}</span>
          )}
        </h2>
        <button type="button" className={css.iconButton} title={tt('common.close')} aria-label={tt('common.close')} onClick={() => { controller.close() }}>×</button>
      </div>
      {shelf !== null && (
        <BookshelfBar
          api={api}
          shelf={shelf}
          onSwitch={() => {
            void refreshShelf()
            // 切换书后重置本地编辑状态，重新拉取目标书。
            setOutlineText('')
            setProject(null)
            setGeneratedFiles([])
            setChapterText('')
            setExpandedChapter(null)
            setProgress([])
            void refresh(false)
          }}
        />
      )}
      <div className={css.tabBar} role="tablist">
        {TABS.map(tab => (
          <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} data-active={activeTab === tab.id ? '' : undefined} className={css.tab} onClick={() => { setActiveTab(tab.id) }}>
            {tab.label}
          </button>
        ))}
      </div>
      <div className={css.panelContent}>
        {error !== '' && <div className={css.card} style={{ borderColor: 'var(--nf-error)' }}><span style={{ color: 'var(--nf-error)' }}>{tt('common.error')}: {error}</span></div>}
        {notice !== '' && <div className={css.card}><span style={{ color: 'var(--nf-success)' }}>{notice}</span></div>}
        {busy && busyLabel !== '' && <div className={css.card}><span style={{ color: 'var(--nf-accent)' }}>{busyLabel}…</span></div>}

        {activeTab === 'workflow' && (
          <div className={css.card}>
            <span className={css.cardTitle}>{tt('workflow.title')}</span>
            <div className={css.meta}>{tt('workflow.progress', {
              bible: bible !== undefined ? '✓' : '—',
              volumes: volumes !== undefined ? '✓' : '—',
              plan: chapters.length > 0 ? '✓' : '—',
              done: doneCount,
              total: chapters.length,
            })}</div>
            <div className={css.workflowList}>
              {workflowRow(1, project !== null, tt('workflow.step1'), '从 docx 或粘贴文本导入全书大纲', tt('workflow.loadOutline'), () => { void handleLoadDocx(false) }, false)}
              {workflowRow(2, bible !== undefined, tt('workflow.step2'), '提炼人设 / 世界观 / 金手指规则 / 写作红线', tt('workflow.genBible'), () => { void handleBible() }, project === null)}
              {workflowRow(3, volumes !== undefined, tt('workflow.step3'), '按剧情弧线划分全书卷结构', tt('workflow.genVolumes'), () => { void handleVolumes() }, project === null)}
              {workflowRow(4, chapters.length > 0, tt('workflow.step4'), '每章标题 + 剧情要点 + 字数目标', tt('workflow.genPlan'), () => { void handlePlan() }, project === null)}
              {workflowRow(5, doneCount > 0, tt('workflow.step5'), '逐章生成，自动摘要 + AI 审稿', tt('plan.write'), () => { setActiveTab('plan') }, false)}
              {workflowRow(6, doneCount > 0, tt('workflow.step6'), '去 AI 味润色 / 导出全本', tt('settings.exportTxt'), () => { void handleExport('txt') }, false)}
            </div>
          </div>
        )}

        {activeTab === 'overview' && (
          <>
            <div className={css.card}>
              <div className={css.row} style={{ justifyContent: 'space-between' }}>
                <span className={css.cardTitle}>{tt('tab.overview')}</span>
                {project !== null && <span className={css.meta}>{tt('overview.bookName')}: {project.bookName}</span>}
              </div>
              {/* 拖拽 / 文件选择导入 docx */}
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

        {activeTab === 'plan' && (
          <>
            <div className={css.card}>
              <div className={css.row} style={{ justifyContent: 'space-between' }}>
                <span className={css.cardTitle}>{tt('tab.plan')}</span>
                <div className={css.row}>
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
                </div>
              </div>
              {volumes !== undefined && volumes.length > 0 && (
                <div className={css.row}>
                  {volumes.map(v => (
                    <span key={v.no} className={css.badge} style={{ borderColor: 'var(--nf-accent)', color: 'var(--nf-accent)' }}>
                      {v.no}. {v.title}（{v.chapterStart}-{v.chapterEnd}）
                    </span>
                  ))}
                </div>
              )}
            </div>

            {chapters.length > 0 && (
              <div className={css.card}>
                <div className={css.row} style={{ justifyContent: 'space-between' }}>
                  <span className={css.meta}>共 {chapters.length} 章 · 已完成 {doneCount} · 待生成 {pendingCount}</span>
                  {pendingCount > 0 && (
                    <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { void handleWriteAll() }}>
                      {tt('plan.writeAllPending')}（{pendingCount}）
                    </button>
                  )}
                </div>
                <div className={css.chapterList}>
                  {chapters.map(chapter => {
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
                              <div className={css.meta}><b>{tt('plan.beats')}:</b> {chapter.beats}</div>
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
                                  <div className={css.meta} style={{ fontWeight: 600 }}>修订（可整章或局部）</div>
                                  <div className={css.field}>
                                    <label className={css.fieldLabel}>要修改的原文片段（从上面正文复制一段；留空 = 整章修订）</label>
                                    <textarea
                                      className={css.textarea}
                                      style={{ minHeight: 56 }}
                                      placeholder="例如：林越咬紧牙关：…（复制正文中的原句）"
                                      value={localTarget}
                                      onChange={e => { setLocalTarget(e.target.value) }}
                                    />
                                  </div>
                                  <div className={css.row}>
                                    <input
                                      className={css.input}
                                      style={{ flex: 1 }}
                                      placeholder="修订指令（如：这段对话太生硬，改得更口语化）"
                                      value={rewriteInstruction}
                                      onChange={e => { setRewriteInstruction(e.target.value) }}
                                    />
                                    <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy || busyAny} onClick={() => { void handleRewrite(chapter.no) }}>
                                      {tt('plan.rewrite')}
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
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={() => { void handlePolish(chapter.no) }}>
                              {tt('plan.polish')}
                            </button>
                          )}
                          {chapter.status === 'rejected' && (
                            <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy || busyAny} onClick={() => { void handleWriteChapter(chapter.no, true) }}>
                              {tt('plan.rewrite')}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className={css.card}>
              <span className={css.cardTitle}>{tt('plan.progress')}</span>
              <div className={css.progress}>
                {progress.length === 0 && <span className={css.meta}>{tt('progress.empty')}</span>}
                {progress.map(line => (
                  <div key={line.id} className={line.kind === 'done' ? css.progressLineDone : line.kind === 'error' ? css.progressLineError : css.progressLine}>
                    {line.text}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'bible' && (
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
                {bible.worldRules.length > 0 && (
                  <div>
                    <b>{tt('bible.worldRules')}（{bible.worldRules.length}）</b>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>{bible.worldRules.map((r, i) => <li key={i}>{r}</li>)}</ul>
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
        )}

        {activeTab === 'assets' && (
          <AssetsTab api={api} />
        )}

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

        {activeTab === 'assistant' && (
          <AssistantTab api={api} />
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
      </div>
    </div>
  )
}
