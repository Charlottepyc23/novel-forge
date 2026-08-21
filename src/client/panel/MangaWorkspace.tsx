/**
 * 漫剧工作台：
 *  状态A（无方案）→ 风格选择页（风格库内嵌，创建方案）
 *  状态B（有方案）→ 主工作页：方案切换器 + ②角色 | ③场景 | ④分镜 三导航
 */
import { useMemo, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { ChapterPlan, ImageModelConfig, MangaPlan, ProjectState, RoleRecord } from '../../protocol.ts'
import { STYLE_CATEGORIES, STYLE_LIBRARY, findStyle, stylesByCategory, type StyleCategory } from '../../style-library.ts'
import { StyleCard } from './StyleCard.tsx'
import { StoryboardTab } from './StoryboardTab.tsx'
import { RoleVisualPanel } from './RoleVisualPanel.tsx'
import { SceneLibrary } from './SceneLibrary.tsx'
import css from './panel.module.css'

export function MangaWorkspace({
  api,
  project,
  chapters,
  onProjectChanged,
  imageApiEnabled,
  imageModels,
  onProgress,
}: {
  api: NovelApi
  project: ProjectState | null
  chapters: ChapterPlan[]
  /** 方案/资产变更已持久化后触发（刷新项目）。 */
  onProjectChanged?: () => void | Promise<void>
  /** 是否启用生图。 */
  imageApiEnabled?: boolean
  /** 生图模型库（AI 生图可选模型）。 */
  imageModels?: ImageModelConfig[]
  /** 上报到「AI进度」控制台（漫剧工作台内所有 LLM/方案操作）。 */
  onProgress?: (text: string, kind?: 'info' | 'done' | 'error') => void
}) {
  const plans = useMemo(() => project?.mangaPlans ?? [], [project?.mangaPlans])
  const activePlan = plans.find(p => p.active) ?? null

  // 状态A：风格选择页
  const [showCreate, setShowCreate] = useState(false)
  const [cat, setCat] = useState<StyleCategory>('3d')
  const [selStyle, setSelStyle] = useState('')
  const [selFilter, setSelFilter] = useState('')
  const [planName, setPlanName] = useState('')

  // 状态B：主工作页
  const [section, setSection] = useState<'roles' | 'scenes' | 'storyboard'>('roles')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [roleCands, setRoleCands] = useState<RoleRecord[] | null>(null)

  const baseStyles = useMemo(() => STYLE_LIBRARY.filter(s => s.stackable !== true).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)), [])
  const filterStyles = useMemo(() => STYLE_LIBRARY.filter(s => s.stackable === true), [])
  const activeStyle = activePlan !== null ? findStyle(activePlan.styleId) : undefined
  const activeFilter = activePlan?.filterId !== undefined ? findStyle(activePlan.filterId) : undefined

  const refresh = async (): Promise<void> => { await onProjectChanged?.() }

  const mutate = async (req: import('../../protocol.ts').MangaPlansRequest): Promise<boolean> => {
    const opLabel = req.op === 'create' ? '创建漫剧方案「' + (req.name ?? '') + '」' : req.op === 'activate' ? '切换漫剧方案' : '删除漫剧方案'
    setBusy(true)
    setError('')
    onProgress?.(opLabel + '…')
    try {
      await api.manhuaPlans(req)
      onProgress?.(opLabel + ' 完成', 'done')
      return true
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      onProgress?.(opLabel + ' 失败：' + m, 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  const createPlan = async (): Promise<void> => {
    const n = planName.trim()
    if (n === '' || selStyle === '') {
      setError('请选择基底风格并填写方案名')
      return
    }
    const ok = await mutate({ op: 'create', name: n, styleId: selStyle, filterId: selFilter !== '' ? selFilter : undefined })
    if (ok) {
      setShowCreate(false)
      setPlanName('')
      setSelStyle('')
      setSelFilter('')
      setSection('roles')
      await refresh()
    }
  }

  const pickStyle = (id: string): void => {
    setSelStyle(id)
    if (planName.trim() === '') {
      const s = findStyle(id)
      setPlanName(`${project?.bookName ?? '本书'} · ${s?.name ?? ''}版`)
    }
  }

  // 角色区操作
  const extractRoles = async (): Promise<void> => {
    if (activePlan === null) return
    setBusy(true); setError('')
    onProgress?.('按当前方案提炼角色…')
    try {
      const r = await api.roles({ op: 'extract', styleId: activePlan.styleId, filterId: activePlan.filterId })
      setRoleCands(r.candidates ?? [])
      onProgress?.('角色提炼完成：' + (r.candidates ?? []).length + ' 个候选', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      onProgress?.('角色提炼失败：' + m, 'error')
    } finally { setBusy(false) }
  }
  const adoptRole = async (r: RoleRecord): Promise<void> => {
    setBusy(true); setError('')
    onProgress?.('采纳角色「' + r.name + '」…')
    try {
      await api.roles({ op: 'adopt', role: r })
      setRoleCands(prev => (prev ?? []).filter(x => x.name !== r.name))
      await refresh()
      onProgress?.('已采纳角色「' + r.name + '」', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      onProgress?.('采纳角色「' + r.name + '」失败：' + m, 'error')
    } finally { setBusy(false) }
  }
  const genRoleVisual = async (name: string): Promise<void> => {
    if (activePlan === null) return
    setBusy(true); setError('')
    onProgress?.('生成「' + name + '」形象锚点（按当前方案风格）…')
    try {
      await api.roles({ op: 'visual', name, styleId: activePlan.styleId, filterId: activePlan.filterId })
      await refresh()
      onProgress?.('已生成「' + name + '」形象锚点（按当前方案风格）', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      onProgress?.('生成「' + name + '」形象锚点失败：' + m, 'error')
    } finally { setBusy(false) }
  }

  if (project === null) {
    return <div className={css.card}><span className={css.meta}>请先开书或选择一本书，再进入漫剧工作台。</span></div>
  }

  /* ============ 状态A：风格选择页 ============ */
  if (showCreate || plans.length === 0) {
    const list = stylesByCategory(cat)
    return (
      <div className={css.card}>
        <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span className={css.cardTitle}>🎬 漫剧工作台 · 选择视觉风格</span>
          {plans.length > 0 && <button type="button" className={css.button} disabled={busy} onClick={() => { setShowCreate(false); setSection('roles') }}>返回工作台</button>}
        </div>
        <span className={css.meta}>选一个基底风格（影视类可作滤镜叠加），创建方案后进入 角色 / 场景 / 分镜。</span>

        <div className={css.row} style={{ gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
          {STYLE_CATEGORIES.map(c => (
            <button key={c.id} type="button" className={`${css.button} ${cat === c.id ? css.buttonPrimary : ''}`} style={{ flex: 1, minWidth: 120 }} onClick={() => { setCat(c.id) }}>
              {c.icon} {c.label}（{stylesByCategory(c.id).length}）
            </button>
          ))}
        </div>
        <div className={css.meta}>{STYLE_CATEGORIES.find(c => c.id === cat)?.desc}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, margin: '10px 0' }}>
          {list.map(s => (
            <StyleCard key={s.id} style={s} selected={selStyle === s.id} onClick={() => { pickStyle(s.id) }} />
          ))}
        </div>

        {filterStyles.length > 0 && (
          <div className={css.field}>
            <label className={css.fieldLabel}>叠加滤镜（可选）</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button type="button" className={`${css.button} ${css.buttonSmall} ${selFilter === '' ? css.buttonPrimary : ''}`} onClick={() => { setSelFilter('') }}>无</button>
              {filterStyles.map(s => (
                <button key={s.id} type="button" className={`${css.button} ${css.buttonSmall} ${selFilter === s.id ? css.buttonPrimary : ''}`} onClick={() => { setSelFilter(s.id) }}>{s.name}</button>
              ))}
            </div>
          </div>
        )}

        <div className={css.field}>
          <label className={css.fieldLabel}>方案名</label>
          <input className={css.input} value={planName} placeholder="例如：《保质期》3D 皮克斯版" onChange={e => { setPlanName(e.target.value) }} />
        </div>
        {error !== '' && <div className={css.importError}>{error}</div>}
        <div className={css.row}>
          <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy || selStyle === '' || planName.trim() === ''} onClick={() => { void createPlan() }}>
            {busy ? '创建中…' : '🎬 创建方案'}
          </button>
          <span className={css.meta}>{selStyle !== '' ? `已选：${findStyle(selStyle)?.name ?? selStyle}` : '点击卡片选择基底风格'}</span>
        </div>
      </div>
    )
  }

  /* ============ 状态B：主工作页 ============ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* 方案切换器 */}
      <div className={css.card}>
        <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span className={css.cardTitle}>🎬 {activePlan?.name ?? '漫剧工作台'}</span>
          <div className={css.row}>
            <span className={css.badge}>🎨 {activeStyle?.name ?? activePlan?.styleId}</span>
            {activeFilter !== undefined && <span className={css.badge}>＋{activeFilter.name}</span>}
            <select
              className={css.input}
              style={{ width: 'auto', padding: '4px 8px' }}
              value={activePlan?.id ?? ''}
              onChange={async e => { if (await mutate({ op: 'activate', id: e.target.value })) await refresh() }}
            >
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" className={`${css.button} ${css.buttonSmall}`} onClick={() => { setShowCreate(true); setSelStyle(''); setPlanName('') }}>＋ 新建</button>
            <button
              type="button"
              className={`${css.button} ${css.buttonSmall}`}
              disabled={busy}
              onClick={async () => {
                if (activePlan === null) return
                if (!window.confirm(`删除方案「${activePlan.name}」？该方案的分镜产出不受影响（骨架共享）。`)) return
                if (await mutate({ op: 'remove', id: activePlan.id })) {
                  setSection('roles')
                  await refresh()
                }
              }}
            >
              🗑 删除当前方案
            </button>
          </div>
        </div>
        {/* 三导航 */}
        <div className={css.row} style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <button type="button" className={`${css.button} ${css.buttonSmall} ${section === 'roles' ? css.buttonPrimary : ''}`} onClick={() => { setSection('roles') }}>
            🖼️ 角色（{(project.roles ?? []).length}）
          </button>
          <button type="button" className={`${css.button} ${css.buttonSmall} ${section === 'scenes' ? css.buttonPrimary : ''}`} onClick={() => { setSection('scenes') }}>
            🏞️ 场景（{(project.scenes ?? []).length}）
          </button>
          <button type="button" className={`${css.button} ${css.buttonSmall} ${section === 'storyboard' ? css.buttonPrimary : ''}`} onClick={() => { setSection('storyboard') }}>
            🎬 分镜
          </button>
        </div>
      </div>

      {error !== '' && <div className={css.importError}>{error}</div>}

      {/* ② 角色 */}
      {section === 'roles' && (
        <RoleVisualPanel
          api={api}
          project={project}
          refresh={() => refresh()}
          styleId={activePlan?.styleId}
          filterId={activePlan?.filterId}
          imageApiEnabled={imageApiEnabled}
          imageModels={imageModels}
          onProgress={onProgress}
        />
      )}

      {/* ③ 场景（完整版场景库：提炼/采纳/编辑/图集/详情浮窗） */}
      {section === 'scenes' && (
        <SceneLibrary
          api={api}
          project={project}
          refresh={() => refresh()}
          styleId={activePlan?.styleId}
          filterId={activePlan?.filterId}
          onProgress={onProgress}
        />
      )}

      {/* ④ 分镜 */}
      {section === 'storyboard' && (
        <StoryboardTab
          api={api}
          project={project}
          chapters={chapters}
          onProjectChanged={onProjectChanged}
          styleId={activePlan?.styleId}
          filterId={activePlan?.filterId}
          onProgress={onProgress}
        />
      )}
    </div>
  )
}