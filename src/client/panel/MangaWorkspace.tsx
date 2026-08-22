/**
 * 漫剧工作台（方案X：9 步页容器）：
 * 顶部常驻：方案切换器 + 全流程步骤条（唯一导航）；
 * 主体按步骤渲染独立页面：①创建方案 ②视觉规则 ③剧情骨架 ④分镜表 ⑤导入角色 ⑥角色定妆 ⑦视频提示词 ⑧场景库 ⑨导出使用。
 * 每步页面只显示自己的内容；前置不足显示明确提示，不静默降级、不夹带别区内容。
 */
import { useMemo, useState } from 'react'
import type { NovelApi } from '../api.ts'
import type { ChapterPlan, ImageModelConfig, MangaPlan, ProjectState } from '../../protocol.ts'
import { STYLE_CATEGORIES, STYLE_LIBRARY, findStyle, stylesByCategory, type StyleCategory } from '../../style-library.ts'
import { StyleCard } from './StyleCard.tsx'
import { StoryboardTab } from './StoryboardTab.tsx'
import { MangaRoleLibrary } from './MangaRoleLibrary.tsx'
import { SceneLibrary } from './SceneLibrary.tsx'
import { FlowGuide, type FlowTarget } from './FlowGuide.tsx'
import css from './panel.module.css'

/** 步骤页编号：1建方案 2视觉规则 3骨架 4分镜表 5导入 6定妆 7提示词 8场景 9导出。 */
type StepView = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

const FLOW_TARGET_TO_VIEW: Record<FlowTarget, StepView> = {
  plan: 1,
  rules: 2,
  skeleton: 3,
  table: 4,
  import: 5,
  makeup: 6,
  prompts: 7,
  scenes: 8,
  export: 9,
}

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
  /** 是否启用生图（漫剧卡出定妆图）。 */
  imageApiEnabled?: boolean
  /** 生图模型库（出定妆图时可选择模型）。 */
  imageModels?: ImageModelConfig[]
  /** 上报到「AI进度」控制台（漫剧工作台内所有 LLM/方案操作）。 */
  onProgress?: (text: string, kind?: 'info' | 'done' | 'error') => void
}) {
  const plans = useMemo(() => project?.mangaPlans ?? [], [project?.mangaPlans])
  const activePlan = plans.find(p => p.active) ?? null

  const [view, setView] = useState<StepView>(3)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // 风格选择表单（第①步页）
  const [cat, setCat] = useState<StyleCategory>('3d')
  const [selStyle, setSelStyle] = useState('')
  const [selFilter, setSelFilter] = useState('')
  const [planName, setPlanName] = useState('')

  // 无方案时强制停在创建方案页。
  const effectiveView: StepView = plans.length === 0 ? 1 : view

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
      setPlanName('')
      setSelStyle('')
      setSelFilter('')
      await refresh()
      setView(2)
    }
  }

  const pickStyle = (id: string): void => {
    setSelStyle(id)
    if (planName.trim() === '') {
      const s = findStyle(id)
      setPlanName((project?.bookName ?? '本书') + ' · ' + (s?.name ?? '') + '版')
    }
  }

  /** 流程第②步：从道藏提炼视觉规则（注入所有提示词）。 */
  const extractRules = async (): Promise<void> => {
    setBusy(true)
    setError('')
    onProgress?.('从道藏提炼视觉规则…')
    try {
      const r = await api.visualRules({ op: 'extract' })
      await refresh()
      onProgress?.('已提炼 ' + r.rules.length + ' 条视觉规则（已注入所有提示词）', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      onProgress?.('提炼视觉规则失败：' + m, 'error')
    } finally {
      setBusy(false)
    }
  }

  /** 全流程步骤条导航：步骤 → 对应页面。 */
  const navigateFlow = (target: FlowTarget): void => {
    setError('')
    setView(FLOW_TARGET_TO_VIEW[target])
  }

  /** 分镜「下一步」回调：1骨架→3、2分镜表→4、3提示词→7（对应步骤页编号）。 */
  const goStep = (n: 1 | 2 | 3): void => {
    setView(n === 1 ? 3 : n === 2 ? 4 : 7)
  }

  if (project === null) {
    return <div className={css.card}><span className={css.meta}>请先开书或选择一本书，再进入漫剧工作台。</span></div>
  }

  const rules = project.visualRules ?? []
  const anchoredCards = (project.mangaRoles ?? []).filter(c => c.status === 'anchored')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-10)' }}>
      {/* 顶部常驻：方案切换器 + 全流程步骤条（唯一导航） */}
      <div className={css.card}>
        <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span className={css.cardTitle}>🎬 {activePlan?.name ?? '漫剧工作台'}</span>
          <div className={css.row}>
            <span className={css.badge}>🎨 {activeStyle?.name ?? activePlan?.styleId}</span>
            {activeFilter !== undefined && <span className={css.badge}>＋{activeFilter.name}</span>}
            <select
              className={css.input}
              style={{ width: 'auto', padding: 'var(--nf-space-4) var(--nf-space-10)', fontSize: 'var(--nf-fs-12)', borderRadius: 'var(--nf-radius-8)' }}
              value={activePlan?.id ?? ''}
              onChange={async e => { if (await mutate({ op: 'activate', id: e.target.value })) await refresh() }}
            >
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" className={css.button + ' ' + css.buttonSmall} style={{ minWidth: 84 }} onClick={() => { setSelStyle(''); setPlanName(''); setView(1) }}>＋ 新建</button>
            <button
              type="button"
              className={css.button + ' ' + css.buttonSmall}
              disabled={busy}
              onClick={async () => {
                if (activePlan === null) return
                if (!window.confirm('删除方案「' + activePlan.name + '」？该方案的分镜产出不受影响（骨架共享）。')) return
                if (await mutate({ op: 'remove', id: activePlan.id })) {
                  await refresh()
                  setView(1)
                }
              }}
            >
              🗑 删除当前方案
            </button>
          </div>
        </div>
        <FlowGuide project={project} onNavigate={navigateFlow} />
      </div>

      {error !== '' && <div className={css.importError}>{error}</div>}

      {/* ① 创建方案页 */}
      {effectiveView === 1 && (
        <div className={css.card}>
          <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span className={css.cardTitle}>① 创建方案 · 选择视觉风格</span>
            {plans.length > 0 && <button type="button" className={css.button} disabled={busy} onClick={() => { setView(3) }}>返回工作台</button>}
          </div>
          <span className={css.meta}>选一个基底风格（影视类可叠加滤镜）并命名。此后所有提示词按此风格生成。</span>

          <div className={css.row} style={{ gap: 'var(--nf-space-8)', flexWrap: 'wrap', margin: '10px 0' }}>
            {STYLE_CATEGORIES.map(c => (
              <button key={c.id} type="button" className={css.button + (cat === c.id ? ' ' + css.buttonPrimary : '')} style={{ flex: 1, minWidth: 120 }} onClick={() => { setCat(c.id) }}>
                {c.icon} {c.label}（{stylesByCategory(c.id).length}）
              </button>
            ))}
          </div>
          <div className={css.meta}>{STYLE_CATEGORIES.find(c => c.id === cat)?.desc}</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--nf-space-12)', margin: '10px 0' }}>
            {stylesByCategory(cat).map(s => (
              <StyleCard key={s.id} style={s} selected={selStyle === s.id} onClick={() => { pickStyle(s.id) }} />
            ))}
          </div>

          {filterStyles.length > 0 && (
            <div className={css.field}>
              <label className={css.fieldLabel}>叠加滤镜（可选）</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nf-space-6)' }}>
                <button type="button" className={css.button + ' ' + css.buttonSmall + (selFilter === '' ? ' ' + css.buttonPrimary : '')} onClick={() => { setSelFilter('') }}>无</button>
                {filterStyles.map(s => (
                  <button key={s.id} type="button" className={css.button + ' ' + css.buttonSmall + (selFilter === s.id ? ' ' + css.buttonPrimary : '')} onClick={() => { setSelFilter(s.id) }}>{s.name}</button>
                ))}
              </div>
            </div>
          )}

          <div className={css.field}>
            <label className={css.fieldLabel}>方案名</label>
            <input className={css.input} value={planName} placeholder="例如：《保质期》3D 皮克斯版" onChange={e => { setPlanName(e.target.value) }} />
          </div>
          <div className={css.row}>
            <button type="button" className={css.button + ' ' + css.buttonPrimary} disabled={busy || selStyle === '' || planName.trim() === ''} onClick={() => { void createPlan() }}>
              {busy ? '创建中…' : '🎬 创建方案'}
            </button>
            <span className={css.meta}>{selStyle !== '' ? '已选：' + (findStyle(selStyle)?.name ?? selStyle) : '点击卡片选择基底风格'}</span>
          </div>
        </div>
      )}

      {/* ② 视觉规则页 */}
      {effectiveView === 2 && (
        <div className={css.card}>
          <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span className={css.cardTitle}>② 视觉规则</span>
            <button
              type="button"
              className={css.button + ' ' + css.buttonSmall}
              disabled={busy}
              onClick={() => { void extractRules() }}
              title="从道藏提炼 3-6 条视觉世界观规则，自动注入所有生图/生视频提示词"
            >
              {busy ? '提炼中…' : '⚠️ 提炼视觉规则（从道藏）'}
            </button>
          </div>
          <span className={css.meta} style={{ display: 'block', marginTop: 'var(--nf-space-4)' }}>
            AI 从道藏提炼 3-6 条「画面必须遵守」的视觉世界观规则（如：货架上的商品都是活人），自动注入分镜表、角色锚点、视频提示词等所有提示词。
          </span>
          {rules.length > 0 ? (
            <div className={css.row} style={{ flexWrap: 'wrap', gap: 'var(--nf-space-4)', marginTop: 'var(--nf-space-8)' }}>
              <span className={css.meta} style={{ fontSize: 'var(--nf-fs-12)' }}>已内嵌到所有提示词：</span>
              {rules.map((r, i) => (
                <span key={i} style={{ border: '1px solid var(--nf-warn, #b8860b)', borderRadius: 'var(--nf-radius-999)', padding: '0 var(--nf-space-8)', fontSize: 'var(--nf-fs-12)', color: 'var(--nf-warn, #b8860b)' }}>{r}</span>
              ))}
            </div>
          ) : (
            <span className={css.meta} style={{ marginTop: 'var(--nf-space-4)' }}>还没提炼——点上方按钮生成第一条视觉规则。</span>
          )}
          <div className={css.row} style={{ marginTop: 'var(--nf-space-10)' }}>
            <button type="button" className={css.button + ' ' + css.buttonSmall + ' ' + css.buttonPrimary} onClick={() => { setView(3) }}>下一步：③ 剧情骨架</button>
          </div>
        </div>
      )}

      {/* ③④⑦ 分镜步骤页（同一实例，mode 切换） */}
      {(effectiveView === 3 || effectiveView === 4 || effectiveView === 7) && (
        <StoryboardTab
          api={api}
          project={project}
          chapters={chapters}
          onProjectChanged={onProjectChanged}
          styleId={activePlan?.styleId}
          filterId={activePlan?.filterId}
          mode={effectiveView === 3 ? 'skeleton' : effectiveView === 4 ? 'table' : 'prompts'}
          onGoStep={goStep}
          onProgress={onProgress}
        />
      )}

      {/* ⑤⑥ 角色页（同一实例，focus 切换） */}
      {(effectiveView === 5 || effectiveView === 6) && (
        <MangaRoleLibrary
          api={api}
          project={project}
          refresh={() => refresh()}
          styleId={activePlan?.styleId}
          filterId={activePlan?.filterId}
          imageApiEnabled={imageApiEnabled}
          imageModels={imageModels}
          focus={effectiveView === 5 ? 'import' : 'cards'}
          showCards={effectiveView !== 5}
          onProgress={onProgress}
        />
      )}

      {/* ⑧ 场景库页 */}
      {effectiveView === 8 && (
        <SceneLibrary
          api={api}
          project={project}
          refresh={() => refresh()}
          styleId={activePlan?.styleId}
          filterId={activePlan?.filterId}
          onProgress={onProgress}
        />
      )}

      {/* ⑨ 导出使用页 */}
      {effectiveView === 9 && (
        <div className={css.card}>
          <span className={css.cardTitle}>⑨ 导出使用</span>
          <span className={css.meta} style={{ display: 'block', marginTop: 'var(--nf-space-4)' }}>
            把视频提示词复制到外部工具（即梦 / 豆包 / ComfyUI）出图生视频：
          </span>
          <ol style={{ margin: '6px 0 0', paddingLeft: 'var(--nf-space-20)', fontSize: 'var(--nf-fs-12)', lineHeight: 1.9, color: 'var(--nf-text)' }}>
            <li>去「⑦ 视频提示词」页复制——每条已带风格词块、视觉规则与定妆绑定标注</li>
            <li>出图/生视频时，按镜头绑定的漫剧卡取定妆参考图（IP-Adapter 类方案锁脸锁服装）</li>
            <li>场景卡与视觉规则已内嵌在提示词里，无需额外粘贴</li>
          </ol>
          <div className={css.row} style={{ marginTop: 'var(--nf-space-10)', flexWrap: 'wrap' }}>
            <button type="button" className={css.button + ' ' + css.buttonSmall + ' ' + css.buttonPrimary} onClick={() => { setView(7) }}>去复制视频提示词</button>
            <button type="button" className={css.button + ' ' + css.buttonSmall} onClick={() => { setView(6) }}>查看定妆卡</button>
          </div>
          {anchoredCards.length > 0 && (
            <div style={{ marginTop: 'var(--nf-space-10)' }}>
              <span className={css.meta}>已定妆角色（{anchoredCards.length}）：</span>
              <div className={css.row} style={{ flexWrap: 'wrap', gap: 'var(--nf-space-8)', marginTop: 'var(--nf-space-6)' }}>
                {anchoredCards.map(c => (
                  <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nf-space-4)', alignItems: 'center', border: '1px solid var(--nf-border)', borderRadius: 'var(--nf-radius-10)', padding: 'var(--nf-space-6)' }}>
                    {c.imageUrl !== undefined ? (
                      <img src={c.imageUrl} alt={c.name} style={{ maxHeight: 90, borderRadius: 'var(--nf-radius-6)' }} />
                    ) : (
                      <span style={{ fontSize: 'var(--nf-fs-12)', color: 'var(--nf-text-dim, #888)' }}>（无定妆图）</span>
                    )}
                    <span style={{ fontSize: 'var(--nf-fs-12)' }}>{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
