/**
 * 漫剧工作台：方案管理（基底风格 + 可选滤镜）→ 分镜（骨架/分镜表，按方案风格生成）。
 * 骨架为故事层（所有方案共享）；分镜表画面措辞随方案风格。
 */
import { useMemo, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { ChapterPlan, MangaPlan, ProjectState } from '../../protocol.ts'
import { STYLE_LIBRARY, findStyle } from '../../style-library.ts'
import { StoryboardTab } from './StoryboardTab.tsx'
import css from './panel.module.css'

export function MangaWorkspace({
  api,
  project,
  chapters,
  onProjectChanged,
}: {
  api: NovelApi
  project: ProjectState | null
  chapters: ChapterPlan[]
  /** 方案变更已持久化后触发（刷新项目）。 */
  onProjectChanged?: () => void | Promise<void>
}) {
  const plans = useMemo(() => project?.mangaPlans ?? [], [project?.mangaPlans])
  const activePlan = plans.find(p => p.active) ?? null
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [styleId, setStyleId] = useState('')
  const [filterId, setFilterId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 基底候选：非 stackable 风格按 weight 降序（推荐池），+ 全部基底风格
  const baseStyles = useMemo(() => STYLE_LIBRARY.filter(s => s.stackable !== true).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)), [])
  const filterStyles = useMemo(() => STYLE_LIBRARY.filter(s => s.stackable === true), [])

  const mutate = async (req: import('../../protocol.ts').MangaPlansRequest): Promise<boolean> => {
    setBusy(true)
    setError('')
    try {
      await api.manhuaPlans(req)
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  const createPlan = async (): Promise<void> => {
    const n = name.trim()
    if (n === '' || styleId === '') {
      setError('请填写方案名并选择基底风格')
      return
    }
    const ok = await mutate({ op: 'create', name: n, styleId, filterId: filterId !== '' ? filterId : undefined })
    if (ok) {
      setShowCreate(false)
      setName('')
      setStyleId('')
      setFilterId('')
      await refreshProject()
    }
  }

  const refreshProject = async (): Promise<void> => {
    await onProjectChanged?.()
  }

  if (project === null) {
    return <div className={css.card}><span className={css.meta}>请先开书或选择一本书，再进入漫剧工作台。</span></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* ① 方案管理 */}
      <div className={css.card}>
        <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span className={css.cardTitle}>🎬 漫剧方案</span>
          <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy} onClick={() => { setShowCreate(!showCreate) }}>
            {showCreate ? '收起' : '＋ 新建方案'}
          </button>
        </div>
        <span className={css.meta}>同一本书可建多套视觉演绎（基底风格 + 可选滤镜）；分镜画面措辞随激活方案。</span>

        {showCreate && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--nf-info)', borderRadius: 12, padding: 10, marginTop: 8 }}>
            <div className={css.field}>
              <label className={css.fieldLabel}>方案名</label>
              <input className={css.input} value={name} placeholder="例如：《保质期》3D 皮克斯版" onChange={e => { setName(e.target.value) }} />
            </div>
            <div className={css.field}>
              <label className={css.fieldLabel}>基底风格（按推荐度排序）</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {baseStyles.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className={`${css.button} ${css.buttonSmall} ${styleId === s.id ? css.buttonPrimary : ''}`}
                    title={s.traits}
                    onClick={() => { setStyleId(s.id) }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            {filterStyles.length > 0 && (
              <div className={css.field}>
                <label className={css.fieldLabel}>叠加滤镜（可选）</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button type="button" className={`${css.button} ${css.buttonSmall} ${filterId === '' ? css.buttonPrimary : ''}`} onClick={() => { setFilterId('') }}>无</button>
                  {filterStyles.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className={`${css.button} ${css.buttonSmall} ${filterId === s.id ? css.buttonPrimary : ''}`}
                      title={s.traits}
                      onClick={() => { setFilterId(s.id) }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {error !== '' && <div className={css.importError}>{error}</div>}
            <div className={css.row}>
              <button type="button" className={`${css.button} ${css.buttonSmall} ${css.buttonPrimary}`} disabled={busy || name.trim() === '' || styleId === ''} onClick={() => { void createPlan() }}>
                创建方案
              </button>
            </div>
          </div>
        )}

        {plans.length === 0 ? (
          <div className={css.meta} style={{ marginTop: 8 }}>尚无漫剧方案——新建一个方案，选择基底风格开始。</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {plans.map(p => {
              const style = findStyle(p.styleId)
              const filter = p.filterId !== undefined ? findStyle(p.filterId) : undefined
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                    border: `1px solid ${p.active ? 'var(--nf-accent)' : 'var(--nf-border)'}`, borderRadius: 10, padding: '8px 10px',
                  }}
                >
                  <b>{p.name}</b>
                  <span className={css.badge}>{style?.name ?? p.styleId}</span>
                  {filter !== undefined && <span className={css.badge}>＋{filter.name}</span>}
                  {p.active && <span className={`${css.badge} ${css.badgeDone}`}>激活中</span>}
                  <div style={{ flex: 1 }} />
                  {!p.active && (
                    <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={async () => { if (await mutate({ op: 'activate', id: p.id })) await refreshProject() }}>
                      激活
                    </button>
                  )}
                  <button type="button" className={`${css.button} ${css.buttonSmall}`} disabled={busy} onClick={async () => { if (await mutate({ op: 'remove', id: p.id })) await refreshProject() }}>
                    删除
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ② 分镜（按激活方案风格） */}
      {plans.length === 0 ? null : (
        <StoryboardTab
          api={api}
          project={project}
          chapters={chapters}
          onProjectChanged={onProjectChanged}
          styleId={activePlan?.styleId}
          filterId={activePlan?.filterId}
        />
      )}
    </div>
  )
}