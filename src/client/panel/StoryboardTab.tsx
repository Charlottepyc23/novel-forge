/**
 * 分镜工作台：① 编剧级剧情骨架 → ② 导演级分镜表（镜头级）→ ③ 视频提示词（后续版本）。
 * 定位：辅助人工——每级可重新生成、可复制，产出可导出。
 */
import { useEffect, useMemo, useState } from 'react'
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
  useEffect(() => {
    if (chapterNo === null) return
    const entry = (project?.storyboards ?? []).find(e => e.chapterNo === chapterNo)
    setSkeleton(prev => prev ?? entry?.skeleton ?? null)
    setTable(prev => prev ?? entry?.table ?? null)
    setPrompts(prev => prev ?? entry?.prompts ?? null)
  }, [chapterNo, project?.storyboards])

  const generate = async (): Promise<void> => {
    if (chapterNo === null) return
    setBusy(true)
    setError('')
    setSkeleton(null)
    setTable(null)
    setPrompts(null)
    try {
      const result = await api.storyboardSkeleton(chapterNo)
      setSkeleton(result.skeleton)
      void onProjectChanged?.()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** ② 生成分镜表（骨架 → 镜头级）。 */
  const generateTable = async (): Promise<void> => {
    if (chapterNo === null || skeleton === null) return
    setTableBusy(true)
    setError('')
    setTable(null)
    try {
      const result = await api.storyboardTable(chapterNo, skeleton, styleId, filterId)
      setTable(result.table)
      void onProjectChanged?.()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setTableBusy(false)
    }
  }

  /** ③ 生成视频提示词（分镜表 → 即梦可粘贴）。 */
  const generatePrompts = async (): Promise<void> => {
    if (chapterNo === null || table === null) return
    setPromptsBusy(true)
    setError('')
    setPrompts(null)
    try {
      const result = await api.storyboardPrompts(chapterNo, table, styleId, filterId)
      setPrompts(result.prompts)
      void onProjectChanged?.()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPromptsBusy(false)
    }
  }

  if (project === null) {
    return <div className={css.card}><span className={css.meta}>请先开书或选择一本书，再进入分镜工作台。</span></div>
  }

  return (
    <div className={css.card}>
      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className={css.cardTitle}>🎬 分镜工作台</span>
        <span className={css.meta}>① 剧情骨架 → ② 分镜表（本节）→ ③ 视频提示词（后续版本）</span>
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
          onClick={() => { void generate() }}
        >
          {busy ? '编剧分析中…' : '✍️ 生成剧情骨架'}
        </button>
        {skeleton !== null && (
          <button type="button" className={css.button} disabled={busy} onClick={() => { void generate() }}>
            🔄 重新生成
          </button>
        )}
      </div>

      {error !== '' && <div className={css.importError}>{error}</div>}

      {skeleton === null ? (
        <div className={css.meta} style={{ marginTop: 8 }}>
          生成后这里显示本章剧情骨架：弧线 + 节拍链（事件 / 情绪走向 / 叙事功能 / 因果）。
          骨架是「完整剧情」的根——确认骨架没问题后，后续版本再展开为分镜表与视频提示词。
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
              disabled={tableBusy}
              onClick={() => { void generateTable() }}
            >
              {tableBusy ? '导演分镜中…' : '🎬 ② 生成分镜表'}
            </button>
            <span className={css.meta}>共 {skeleton.beats.length} 个节拍 · 骨架可重新生成（后续版本支持直接编辑）</span>
          </div>
        </div>
      )}

      {table !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <b>🎬 分镜表（{table.shots.length} 个镜头）</b>
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
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`}
              disabled={promptsBusy}
              onClick={() => { void generatePrompts() }}
            >
              {promptsBusy ? '提示词生成中…' : '🎬 ③ 生成视频提示词'}
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

      {prompts !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <b>🎬 视频提示词（{prompts.length} 个镜头）</b>
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