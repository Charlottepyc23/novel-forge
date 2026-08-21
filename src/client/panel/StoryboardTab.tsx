/**
 * 分镜工作台：① 编剧级剧情骨架 → ② 导演级分镜表（镜头级）→ ③ 视频提示词（后续版本）。
 * 定位：辅助人工——每级可重新生成、可复制，产出可导出。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { ChapterPlan, ProjectState, StoryboardPrompt, StoryboardSkeleton, StoryboardTable } from '../../protocol.ts'
import css from './panel.module.css'

export function StoryboardTab({
  api,
  project,
  chapters,
  onProjectChanged,
  styleId,
  filterId,
  onProgress,
}: {
  api: NovelApi
  project: ProjectState | null
  chapters: ChapterPlan[]
  /** 生成成功且已持久化后触发（刷新项目，切章/重进可恢复）。 */
  onProjectChanged?: () => void | Promise<void>
  /** 漫剧基底风格 id（画面措辞随风格）。 */
  styleId?: string
  /** 可选滤镜风格 id。 */
  filterId?: string
  /** 上报到「工作进度」控制台（分镜三步生成）。 */
  onProgress?: (text: string, kind?: 'info' | 'done' | 'error') => void
}) {
  const written = useMemo(() => chapters.filter(c => c.status !== 'pending' && c.status !== 'generating' && c.status !== 'error').sort((a, b) => a.no - b.no), [chapters])
  const [chapterNo, setChapterNo] = useState<number | null>(written[0]?.no ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [skeleton, setSkeleton] = useState<StoryboardSkeleton | null>(null)
  const [table, setTable] = useState<StoryboardTable | null>(null)
  const [tableBusy, setTableBusy] = useState(false)
  const [prompts, setPrompts] = useState<StoryboardPrompt[] | null>(null)
  const [promptsBusy, setPromptsBusy] = useState(false)
  const [copied, setCopied] = useState('')
  const [expandedShots, setExpandedShots] = useState<Set<string>>(new Set())
  const [promptsExpanded, setPromptsExpanded] = useState(false)
  /** 重新生成期间抑制「从持久化恢复旧缓存」的回填（防旧产物复活）。 */
  const suppressRestoreRef = useRef(false)
  const markRestoreSuppressed = (): void => {
    suppressRestoreRef.current = true
    window.setTimeout(() => { suppressRestoreRef.current = false }, 500)
  }

  // 章节列表变化时保持选中有效章节
  useEffect(() => {
    if (chapterNo === null || !written.some(c => c.no === chapterNo)) {
      setChapterNo(written[0]?.no ?? null)
      setSkeleton(null)
      setTable(null)
      setPrompts(null)
    }
  }, [written, chapterNo])

  // 从项目持久化恢复：切章节 / 重新进入本页时，读回已保存的骨架与分镜表（本地已有则不覆盖）。
  // 重新生成期间（markRestoreSuppressed）跳过恢复，避免旧的下游产物（分镜表/提示词）被拉回来。
  useEffect(() => {
    if (chapterNo === null) return
    if (suppressRestoreRef.current === true) return
    const entry = (project?.storyboards ?? []).find(e => e.chapterNo === chapterNo)
    setSkeleton(prev => prev ?? entry?.skeleton ?? null)
    setTable(prev => prev ?? entry?.table ?? null)
    setPrompts(prev => prev ?? entry?.prompts ?? null)
  }, [chapterNo, project?.storyboards])

  const generate = async (chain: boolean): Promise<void> => {
    if (chapterNo === null) return
    setBusy(true)
    setError('')
    setSkeleton(null)
    setTable(null)
    setPrompts(null)
    setStepState(1)
    onProgress?.('第' + chapterNo + '章 剧情骨架生成中…')
    try {
      const result = await api.storyboardSkeleton(chapterNo)
      setSkeleton(result.skeleton)
      markRestoreSuppressed()
      void onProjectChanged?.()
      onProgress?.('第' + chapterNo + '章 剧情骨架已生成（' + result.skeleton.beats.length + ' 个节拍）', 'done')
      // 重新生成：骨架已变、下游已清空，级联自动进入第 ② 步并重算分镜表。
      if (chain) await generateTable(result.skeleton)
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      onProgress?.('第' + chapterNo + '章 剧情骨架生成失败：' + m, 'error')
    } finally {
      setBusy(false)
    }
  }

  /** ② 生成分镜表（骨架 → 镜头级）。forceSkeleton 供①级联重算时传入新骨架。 */
  const generateTable = async (forceSkeleton?: StoryboardSkeleton): Promise<void> => {
    if (chapterNo === null) return
    const sk = forceSkeleton ?? skeleton
    if (sk === null) return
    setStepState(2)
    setTableBusy(true)
    setError('')
    setTable(null)
    setPrompts(null)
    onProgress?.('第' + chapterNo + '章 分镜表生成中…')
    try {
      const result = await api.storyboardTable(chapterNo, sk, styleId, filterId)
      setTable(result.table)
      markRestoreSuppressed()
      void onProjectChanged?.()
      onProgress?.('第' + chapterNo + '章 分镜表已生成（' + result.table.shots.length + ' 个镜头）', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      onProgress?.('第' + chapterNo + '章 分镜表生成失败：' + m, 'error')
    } finally {
      setTableBusy(false)
    }
  }

  /** ③ 生成视频提示词（分镜表 → 即梦可粘贴）。 */
  const generatePrompts = async (): Promise<void> => {
    if (chapterNo === null || table === null) return
    setStepState(3)
    setPromptsBusy(true)
    setError('')
    setPrompts(null)
    onProgress?.('第' + chapterNo + '章 视频提示词生成中…')
    try {
      const result = await api.storyboardPrompts(chapterNo, table, styleId, filterId)
      setPrompts(result.prompts)
      markRestoreSuppressed()
      void onProjectChanged?.()
      onProgress?.('第' + chapterNo + '章 视频提示词已生成（' + result.prompts.length + ' 条）', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      onProgress?.('第' + chapterNo + '章 视频提示词生成失败：' + m, 'error')
    } finally {
      setPromptsBusy(false)
    }
  }

  const [stepState, setStepState] = useState(1)

  if (project === null) {
    return <div className={css.card}><span className={css.meta}>请先开书或选择一本书，再进入分镜工作台。</span></div>
  }
  const maxStep = prompts !== null ? 3 : table !== null ? 2 : skeleton !== null ? 1 : 0
  const step = Math.min(stepState, Math.max(maxStep, 1))

  return (
    <div className={css.card}>
      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className={css.cardTitle}>🎬 分镜工作台</span>
        <span className={css.meta}>三步向导 · {styleId !== undefined ? '按当前方案风格生成' : '未选方案风格'}</span>
      </div>

      {/* 步骤条 */}
      <div className={css.row} style={{ gap: 6, margin: '8px 0', flexWrap: 'wrap' }}>
        {[1, 2, 3].map(n => (
          <button
            key={n}
            type="button"
            className={`${css.button} ${css.buttonSmall} ${step === n ? css.buttonPrimary : ''}`}
            disabled={n > maxStep}
            onClick={() => { setStepState(n) }}
          >
            {n === 1 ? '① 剧情骨架' : n === 2 ? '② 分镜表' : '③ 视频提示词'}
            {n <= maxStep && step !== n ? ' ✓' : ''}
          </button>
        ))}
      </div>

      <div className={css.row} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className={css.field} style={{ flex: 1, minWidth: 200 }}>
          <label className={css.fieldLabel}>选择章节</label>
          <select
            className={css.input}
            value={chapterNo ?? ''}
            onChange={e => { setChapterNo(Number(e.target.value)); setError('') }}
          >
            {written.length === 0 && <option value="">（没有已写章节）</option>}
            {written.map(c => (
              <option key={c.no} value={c.no}>第{c.no}章 {c.title}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className={`${css.button} ${css.buttonPrimary}`}
          disabled={busy || chapterNo === null}
          onClick={() => { void generate(false) }}
        >
          {busy ? '编剧分析中…' : '✍️ 生成剧情骨架'}
        </button>
        {skeleton !== null && (
          <button type="button" className={css.button} disabled={busy} onClick={() => { void generate(true) }}>
            🔄 重新生成（并继续生成分镜表）
          </button>
        )}
      </div>

      {error !== '' && <div className={css.importError}>{error}</div>}

      {step === 1 && (skeleton === null ? (
        <div className={css.meta} style={{ marginTop: 8 }}>
          生成后这里显示本章剧情骨架：弧线 + 节拍链（事件 / 情绪走向 / 叙事功能 / 因果）。
          骨架是「完整剧情」的根——确认骨架没问题后，进入下一步展开为分镜表。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <div className={css.importPreview}>
            <span>📖 本章弧线：{skeleton.arc}</span>
          </div>
          {skeleton.beats.map((b, i) => (
            <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 3, border: '1px solid var(--nf-border)', borderRadius: 10, padding: '8px 10px' }}>
              <div className={css.row} style={{ flexWrap: 'wrap' }}>
                <b>节拍 {i + 1}</b>
                <span className={`${css.badge} ${b.function === '高潮' ? css.badgeDone : b.function === '转折' ? css.badgeWritten : css.badgePending}`}>{b.function}</span>
                <span className={css.meta}>{b.emotion}</span>
              </div>
              <span>{b.event}</span>
              {b.cause !== undefined && <span className={css.meta}>承接：{b.cause}</span>}
            </div>
          ))}
          <div className={css.row}>
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall}`}
              onClick={() => {
                const text = `第${skeleton.chapterNo}章 弧线：${skeleton.arc}\n\n` + skeleton.beats.map((b, i) => `${i + 1}. [${b.function}] ${b.event}（情绪：${b.emotion}）${b.cause !== undefined ? `［承接：${b.cause}］` : ''}`).join('\n')
                void navigator.clipboard?.writeText(text)
              }}
            >
              📋 复制骨架
            </button>
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
              onClick={() => { setStepState(2); if (table === null) void generateTable() }}
            >
              🎬 下一步：生成分镜表
            </button>
            <span className={css.meta}>共 {skeleton.beats.length} 个节拍 · 骨架可重新生成（后续版本支持直接编辑）</span>
          </div>
        </div>
      ))}

      {step === 2 && table !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <b>🎬 分镜表（{table.shots.length} 个镜头）</b>
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall}`}
              onClick={() => {
                if (expandedShots.size > 0) setExpandedShots(new Set())
                else setExpandedShots(new Set(table.shots.map(s => s.id)))
              }}
            >
              {expandedShots.size > 0 ? '▴ 收起全部' : '▾ 展开全部'}
            </button>
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall}`}
              onClick={() => {
                const text = table.shots.map(s => {
                  const beat = skeleton?.beats.find(b => b.id === s.beatId)
                  return `镜头 ${s.id}（节拍 ${beat?.id ?? s.beatId} · ${s.shot} · ${s.camera} · ${s.duration}s）\n画面：${s.visual}\n台词：${s.line !== '' ? s.line : '（无）'}\n音效：${s.sound !== '' ? s.sound : '（无）'}\n光效：${s.light !== '' ? s.light : '（无）'}\n承接：${s.prevState} → ${s.nextState}`
                }).join('\n\n')
                void navigator.clipboard?.writeText(`第${table.chapterNo}章分镜表\n\n` + text)
              }}
            >
              📋 复制分镜表
            </button>
            <span className={css.meta}>按骨架节拍展开 · 镜头间状态连续</span>
            {table.usedScenes !== undefined && table.usedScenes.length > 0 && (
              <span className={css.meta}>🏞️ 使用场景：{table.usedScenes.join('、')}</span>
            )}
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall}`}
              disabled={tableBusy}
              onClick={() => { void generateTable() }}
            >
              🔄 重新生成分镜表
            </button>
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
              onClick={() => { setStepState(3); if (prompts === null) void generatePrompts() }}
            >
              🎬 下一步：生成视频提示词
            </button>
          </div>
          {table.shots.map(s => {
            const beat = skeleton?.beats.find(b => b.id === s.beatId)
            return (
              <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 3, border: '1px solid var(--nf-border)', borderRadius: 10, padding: '8px 10px' }}>
                <div className={css.row} style={{ flexWrap: 'wrap' }}>
                  <b>镜头 {s.id}</b>
                  <span className={css.badge}>{s.shot}</span>
                  <span className={css.meta}>{s.camera} · {s.duration}s</span>
                  {beat !== undefined && <span className={css.meta}>节拍 {beat.id}「{beat.function}」</span>}
                </div>
                <span>🎞️ {s.visual}</span>
                <div className={css.row} style={{ flexWrap: 'wrap' }}>
                  <span className={css.meta}>💬 {s.line !== '' ? s.line : '（无台词）'}</span>
                  <span className={css.meta}>🔊 {s.sound !== '' ? s.sound : '（无音效）'}</span>
                  <span className={css.meta}>💡 {s.light !== '' ? s.light : '（无光效）'}</span>
                </div>
                <span className={css.meta}>承接：{s.prevState} → {s.nextState}</span>
              </div>
            )
          })}
        </div>
      )}

      {step === 3 && prompts !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <b>🎬 视频提示词（{prompts.length} 个镜头）</b>
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall}`}
              disabled={promptsBusy}
              onClick={() => { void generatePrompts() }}
            >
              🔄 重新生成视频提示词
            </button>
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall}`}
              onClick={() => {
                const text = prompts.map(x => `【镜头 ${x.shotId}】${x.text}`).join('\n\n')
                void navigator.clipboard?.writeText(`第${table?.chapterNo ?? ''}章视频提示词\n\n` + text)
              }}
            >
              📋 复制全部（即梦可逐条粘贴）
            </button>
          </div>
          {prompts.map(x => (
            <div key={x.shotId} style={{ display: 'flex', flexDirection: 'column', gap: 3, border: '1px solid var(--nf-accent)', borderRadius: 10, padding: '8px 10px' }}>
              <div className={css.row} style={{ flexWrap: 'wrap' }}>
                <b>镜头 {x.shotId}</b>
                <span className={css.meta}>即梦/Seedance 提示词</span>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  className={`${css.button} ${css.buttonSmall}`}
                  onClick={() => {
                    void navigator.clipboard?.writeText(x.text)
                    setCopied(x.shotId)
                    setTimeout(() => { setCopied('') }, 1500)
                  }}
                >
                  {copied === x.shotId ? '✅ 已复制' : '📋 复制'}
                </button>
              </div>
              <span style={{ fontSize: 13, lineHeight: 1.7 }}>{x.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}