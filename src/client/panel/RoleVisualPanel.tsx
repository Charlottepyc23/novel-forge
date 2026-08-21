// 角色形象完整面板（提取自 NovelPanel roleImage tab，左导航与漫剧工作台共用）
// 形象锚点 / 四类生图提示词（中英 Tab 分开）/ 参考图集 / 视觉规则 / 豆包生成
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { NovelApi } from '../api.ts'
import type { ProjectState } from '../../protocol.ts'
import css from './panel.module.css'

export function RoleVisualPanel({
  api,
  project,
  refresh,
  styleId,
  filterId,
  imageApiEnabled,
  onGotoRoles,
  onProgress,
}: {
  api: NovelApi
  project: ProjectState | null
  refresh: () => void | Promise<void>
  styleId?: string
  filterId?: string
  imageApiEnabled?: boolean
  onGotoRoles?: () => void
  /** 上报到「工作进度」控制台（角色形象页 / 漫剧工作台共用）。 */
  onProgress?: (text: string, kind?: 'info' | 'done' | 'error') => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [roleImageTarget, setRoleImageTarget] = useState<string | null>(null)
  const [roleImageLabel, setRoleImageLabel] = useState('立绘')
  const [detailRoleName, setDetailRoleName] = useState<string | null>(null)
  const [detailUploadLabel, setDetailUploadLabel] = useState('立绘')
  /** 提示词包全局中英切换（浮窗内所有提示词块共用）。 */
  const [kitLang, setKitLang] = useState<'zh' | 'en'>('zh')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  /** 浮窗挂到 document.body 时复制的面板配色变量（--nf-*），保证主题一致。 */
  const [portalVars, setPortalVars] = useState<Record<string, string>>({})

  // Esc 关闭浮窗（仅浮窗打开时监听）
  useEffect(() => {
    if (detailRoleName === null) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setDetailRoleName(null)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [detailRoleName])

  const notify = (msg: string): void => { setNotice(msg); setTimeout(() => { setNotice('') }, 3000) }
  const report = (text: string, kind: 'info' | 'done' | 'error' = 'info'): void => { onProgress?.(text, kind) }

  /** 打开角色详情浮窗：记录目标并复制当前面板主题变量（浮窗在 body 下渲染需要）。 */
  const openDetail = (name: string): void => {
    setDetailRoleName(name)
    setDetailUploadLabel('立绘')
    if (rootRef.current !== null) {
      const cs = getComputedStyle(rootRef.current)
      const vars: Record<string, string> = {}
      for (let i = 0; i < cs.length; i++) {
        const key = cs[i]
        if (key.startsWith('--nf-')) {
          const v = cs.getPropertyValue(key).trim()
          if (v !== '') vars[key] = v
        }
      }
      setPortalVars(vars)
    }
  }

  const handleVisual = async (name: string): Promise<void> => {
    setBusy(true); setError('')
    report('生成「' + name + '」形象锚点（按当前方案风格）…')
    try {
      await api.roles({ op: 'visual', name, styleId, filterId })
      await refresh()
      notify('已生成「' + name + '」形象锚点（按当前方案风格）')
      report('已生成「' + name + '」形象锚点（按当前方案风格）', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('生成「' + name + '」形象锚点失败：' + m, 'error')
    } finally { setBusy(false) }
  }

  const handleImageUpload = async (name: string, file: File, label = '立绘'): Promise<void> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
      reader.readAsDataURL(file)
    })
    setBusy(true); setError('')
    report('上传「' + name + '」图集（' + label + '）…')
    try {
      await api.roles({ op: 'image', name, dataUrl, label })
      await refresh()
      notify('已上传「' + name + '」' + label)
      report('已上传「' + name + '」' + label, 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('上传「' + name + '」图集失败：' + m, 'error')
    } finally {
      setBusy(false)
      setRoleImageTarget(null)
      if (inputRef.current !== null) inputRef.current.value = ''
    }
  }

  const handleImageGenerate = async (name: string): Promise<void> => {
    setBusy(true); setError('')
    report('豆包生成「' + name + '」参考图…')
    try {
      await api.roles({ op: 'imageGenerate', name })
      await refresh()
      notify('已生成「' + name + '」参考图')
      report('已生成「' + name + '」参考图', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('豆包生成「' + name + '」参考图失败：' + m, 'error')
    } finally { setBusy(false) }
  }

  const extractRules = async (): Promise<void> => {
    setBusy(true); setError('')
    report('从道藏提炼视觉规则…')
    try {
      const result = await api.visualRules({ op: 'extract' })
      await refresh()
      notify('已提炼 ' + result.rules.length + ' 条视觉规则（已注入所有提示词）')
      report('已提炼 ' + result.rules.length + ' 条视觉规则（已注入所有提示词）', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('提炼视觉规则失败：' + m, 'error')
    } finally { setBusy(false) }
  }

  const refineKit = async (name: string): Promise<void> => {
    setBusy(true); setError('')
    report('生成「' + name + '」四类精修提示词（按当前方案风格）…')
    try {
      await api.roles({ op: 'promptKit', name, styleId, filterId })
      await refresh()
      notify('已生成「' + name + '」四类精修提示词（按当前方案风格）')
      report('已生成「' + name + '」四类精修提示词（按当前方案风格）', 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('生成「' + name + '」精修提示词失败：' + m, 'error')
    } finally { setBusy(false) }
  }

  const removeGallery = async (label: string): Promise<void> => {
    if (detailRoleName === null) return
    try {
      await api.roles({ op: 'removeImage', name: detailRoleName, label })
      await refresh()
      report('已移除「' + detailRoleName + '」图集 ' + label, 'done')
    } catch (err) {
      const m = (err as Error).message
      setError(m)
      report('移除「' + detailRoleName + '」图集 ' + label + ' 失败：' + m, 'error')
    }
  }

  if (project === null) {
    return <div className={css.card}><span className={css.meta}>请先开书或选择一本书。</span></div>
  }

  const roles = project.roles ?? []

  return (
    <div ref={rootRef} className={css.card} style={{ flex: 1, minHeight: 0 }}>
      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className={css.cardTitle} style={{ fontSize: 17, fontWeight: 700 }}>🖼️ 角色形象</span>
        <span className={css.meta}>{styleId !== undefined ? '按当前方案风格（' + styleId + '）' : '未指定方案风格'} · 复制提示词即可在即梦、豆包等工具出图</span>
      </div>

      <input
        ref={inputRef}
        type='file'
        accept='image/*'
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          const target = roleImageTarget
          if (file === undefined || target === null) return
          const readDataUrl = (): Promise<string> => new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
            reader.readAsDataURL(file!)
          })
          void (async () => {
            const dataUrl = await readDataUrl()
            if (target.endsWith('||scene')) {
              const sceneName = target.slice(0, -'||scene'.length)
              setBusy(true); setError('')
              try {
                report('上传场景「' + sceneName + '」' + roleImageLabel + '…')
                await api.scenes({ op: 'image', name: sceneName, dataUrl, label: roleImageLabel })
                await refresh()
                notify('已上传场景「' + sceneName + '」' + roleImageLabel)
                report('已上传场景「' + sceneName + '」' + roleImageLabel, 'done')
              } catch (err) {
                const m = (err as Error).message
                setError(m)
                report('上传场景「' + sceneName + '」失败：' + m, 'error')
              } finally {
                setBusy(false)
                setRoleImageTarget(null)
                if (inputRef.current !== null) inputRef.current.value = ''
              }
            } else {
              await handleImageUpload(target, file, roleImageLabel)
            }
          })()
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div className={css.row} style={{ flexWrap: 'wrap', gap: 6, justifyContent: 'space-between' }}>
          <span className={css.row} style={{ gap: 6 }}>
            <button type='button' className={css.button + ' ' + css.buttonSmall} disabled={busy} onClick={() => { void extractRules() }}>⚠️ 提炼视觉规则</button>
            <button type='button' className={css.button + ' ' + css.buttonSmall} onClick={() => { void refresh(); notify('角色库已刷新') }}>🔄 刷新角色库</button>
          </span>
        </div>

        {(project.visualRules ?? []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', marginTop: 4 }}>
            <span className={css.meta} style={{ fontSize: 11 }}>⚠️ 本书视觉规则：</span>
            {(project.visualRules ?? []).map((r, i) => <span key={i} style={{ border: '1px solid var(--nf-warn, #b8860b)', borderRadius: 999, padding: '0 8px', fontSize: 10, color: 'var(--nf-warn, #b8860b)' }}>{r}</span>)}
          </div>
        )}

        {error !== '' && <div className={css.importError}>{error}</div>}
        {notice !== '' && <div className={css.importResult} style={{ padding: '6px 10px' }}>{notice}</div>}

        {roles.length === 0 ? (
          <div className={css.shelfEmpty} style={{ minHeight: 140, flex: 1 }}>
            <span className={css.shelfEmptyIcon}>🎭</span>
            <span className={css.shelfEmptyTitle}>角色库为空</span>
            <span className={css.meta}>请先到「角色库」提炼角色并生成形象锚点</span>
            {onGotoRoles !== undefined && <button type='button' className={css.button + ' ' + css.buttonSmall} onClick={onGotoRoles}>去角色库</button>}
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
              {roles.map(r => (
                <div key={r.name} onClick={() => { openDetail(r.name) }} style={{ border: '1px solid var(--nf-border)', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', background: 'var(--nf-bg-raise)' }}>
                  <div style={{ aspectRatio: '3/4', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', background: 'var(--nf-bg-inset)' }}>
                    {r.imageUrl !== undefined
                      ? <img src={r.imageUrl} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span className={css.meta}>暂无形象</span>}
                    <span style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 999, padding: '0 6px', fontSize: 9 }}>{r.roleLabel}</span>
                  </div>
                  <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <b style={{ fontSize: 13 }}>{r.name}</b>
                    <div className={css.meta} style={{ fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.imagePrompt !== undefined ? '✓ 锚点' : '⚠ 无锚点'} · {(r.identity ?? '').slice(0, 14)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {detailRoleName !== null && (() => {
              const detailRole = roles.find(r => r.name === detailRoleName)
              if (detailRole === undefined) return null
              const g = detailRole.gallery ?? []
              const byLabel = (key: string) => g.filter(x => x.label === key)
              const byPrefix = (pre: string) => g.filter(x => x.label.startsWith(pre))
              const group = {
                portrait: byLabel('立绘')[0],
                sheet: byLabel('四视图')[0],
                expressions: byPrefix('表情-'),
                others: g.filter(x => x.label !== '立绘' && x.label !== '四视图' && !x.label.startsWith('表情-')),
              }
              const hasMain = group.portrait !== undefined || group.sheet !== undefined
              const anchor = detailRole.imagePrompt
              const expressions = detailRole.expressions ?? ['平静']
              const kit = detailRole.promptKit
              const blocks: Array<{ key: string; title: string; zh: string; en: string }> = []
              if (kit !== undefined) {
                blocks.push({ key: 'portrait', title: '立绘', zh: kit.portrait.zh, en: kit.portrait.en })
                blocks.push({ key: 'sheet', title: '四视图', zh: kit.sheet.zh, en: kit.sheet.en })
                for (const e of kit.expressions) blocks.push({ key: 'exp-' + e.name, title: '表情·' + e.name, zh: e.zh, en: e.en })
                blocks.push({ key: 'details', title: '细节', zh: kit.details.zh, en: kit.details.en })
              } else if (anchor !== undefined) {
                const expName = (n: string) => n.replace(/^表情-/, '')
                blocks.push({ key: 'portrait', title: '立绘', zh: anchor.zh, en: anchor.en })
                for (const n of expressions) blocks.push({ key: 'exp-' + n, title: '表情·' + expName(n), zh: '脸部特写（头部到锁骨），纯白背景，五官与角色定稿完全一致，只换情绪表达（' + n + '）', en: 'face close-up, ' + anchor.en })
              }
              const blockCard = (b: { key: string; title: string; zh: string; en: string }) => (
                <div key={b.key} style={{ border: '1px solid var(--nf-border)', borderRadius: 8, padding: 8 }}>
                  <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 11 }}>{b.title}</b>
                    <button type='button' className={css.button + ' ' + css.buttonSmall} style={{ padding: '1px 6px', fontSize: 10 }} onClick={() => { void navigator.clipboard?.writeText(kitLang === 'zh' ? b.zh : b.en); notify('已复制「' + b.title + '」' + (kitLang === 'zh' ? '中文' : '英文')) }}>复制</button>
                  </div>
                  <div className={css.meta} style={{ fontSize: 11, lineHeight: 1.6, marginTop: 4 }}>{kitLang === 'zh' ? b.zh : b.en}</div>
                </div>
              )
              return createPortal(
                <div style={{ ...portalVars, position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2147483000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={e => { if (e.target === e.currentTarget) setDetailRoleName(null) }}>
                  <div style={{ position: 'relative', background: 'var(--nf-bg)', border: '1px solid var(--nf-border)', borderRadius: 16, padding: 16, width: 'min(860px, 100%)', maxHeight: '88vh', overflow: 'auto', marginTop: 24 }}>
                    <button type='button' className={css.iconButton} style={{ position: 'absolute', top: 10, right: 10 }} onClick={() => { setDetailRoleName(null) }}>✕</button>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 22 }}>{detailRole.name}</b>
                        <span className={css.badge} style={{ borderColor: 'var(--nf-accent)', color: 'var(--nf-accent)' }}>{detailRole.roleLabel}</span>
                        <span className={css.badge} style={{ borderColor: 'var(--nf-info)', color: 'var(--nf-info)' }}>🎨 提示词风格：{detailRole.promptStyleId ?? '未记录'}</span>
                      </div>
                      <div className={css.meta} style={{ marginTop: 4 }}>{detailRole.identity}</div>
                    </div>

                    {styleId !== undefined && detailRole.promptStyleId !== styleId && (
                      <div style={{ border: '1px solid var(--nf-warn, #b8860b)', borderRadius: 10, padding: '8px 10px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 12, color: 'var(--nf-warn, #b8860b)' }}>⚠️ 提示词风格与当前方案不一致（当前：{styleId}，角色：{detailRole.promptStyleId ?? '未记录'}）</b>
                        <button type='button' className={css.button + ' ' + css.buttonSmall} disabled={busy} onClick={() => { void handleVisual(detailRole.name) }}>✨ 按当前风格重生成锚点</button>
                        <button type='button' className={css.button + ' ' + css.buttonSmall} disabled={busy} onClick={() => { void refineKit(detailRole.name) }}>✨ 按当前风格重生成精修包</button>
                      </div>
                    )}

                    <details style={{ marginBottom: 10, fontSize: 12 }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--nf-text-2)' }}>🖼 图集（{g.length}）</summary>
                      <div style={{ marginTop: 8 }}>
                        {hasMain && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 12 }}>
                            {group.portrait !== undefined && (
                              <div style={{ border: '1px solid var(--nf-border)', borderRadius: 10, overflow: 'hidden' }}>
                                <img src={group.portrait.dataUrl} alt='立绘' style={{ width: '100%', objectFit: 'cover' }} />
                                <div className={css.meta} style={{ padding: '2px 8px', fontSize: 10 }}>立绘</div>
                              </div>
                            )}
                            {group.sheet !== undefined && (
                              <div style={{ border: '1px solid var(--nf-border)', borderRadius: 10, overflow: 'hidden' }}>
                                <img src={group.sheet.dataUrl} alt='四视图' style={{ width: '100%', objectFit: 'cover' }} />
                                <div className={css.meta} style={{ padding: '2px 8px', fontSize: 10 }}>四视图</div>
                              </div>
                            )}
                          </div>
                        )}
                        {group.expressions.length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <b style={{ fontSize: 13 }}>表情设定</b>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginTop: 4 }}>
                              {group.expressions.map(img => (
                                <div key={img.label} style={{ position: 'relative', border: '1px solid var(--nf-border)', borderRadius: 10, overflow: 'hidden' }}>
                                  <img src={img.dataUrl} alt={img.label} style={{ width: '100%', objectFit: 'cover' }} />
                                  <div style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, padding: '2px 6px' }}>{img.label}</div>
                                  <button type='button' className={css.iconButton} style={{ position: 'absolute', top: 4, right: 4 }} onClick={() => { void removeGallery(img.label) }}>×</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {group.others.length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <b style={{ fontSize: 13 }}>场景 / 细节</b>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, marginTop: 4 }}>
                              {group.others.map(img => (
                                <div key={img.label} style={{ position: 'relative', border: '1px solid var(--nf-border)', borderRadius: 10, overflow: 'hidden' }}>
                                  <img src={img.dataUrl} alt={img.label} style={{ width: '100%', objectFit: 'cover' }} />
                                  <div style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, padding: '2px 6px' }}>{img.label}</div>
                                  <button type='button' className={css.iconButton} style={{ position: 'absolute', top: 4, right: 4 }} onClick={() => { void removeGallery(img.label) }}>×</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </details>

                    {/* 基本信息：紧凑卡片，不再与提示词包左右分栏 */}
                    <div style={{ border: '1px solid var(--nf-border)', borderRadius: 10, padding: '8px 10px', marginBottom: 10, fontSize: 12 }}>
                      <b style={{ fontSize: 12 }}>基本信息</b>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '2px 14px', marginTop: 4, lineHeight: 1.7 }}>
                        <div><span className={css.meta}>性格：</span>{(detailRole.traits ?? []).join('、') || '—'}</div>
                        <div><span className={css.meta}>目标：</span>{detailRole.goals || '—'}</div>
                        <div><span className={css.meta}>关系：</span>{(detailRole.relations ?? []).join('、') || '—'}</div>
                        <div><span className={css.meta}>成长线：</span>{(detailRole.arc ?? []).join('；') || '—'}</div>
                      </div>
                    </div>

                    {/* 提示词包：全局中英切换 + 复制全部 + 分栏卡片 */}
                    <div>
                      <div className={css.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 8 }}>
                        <b style={{ fontSize: 13 }}>📄 提示词包</b>
                        <span className={css.row} style={{ gap: 6, flexWrap: 'wrap' }}>
                          <button type='button' className={css.button + ' ' + css.buttonSmall + (kitLang === 'zh' ? ' ' + css.buttonPrimary : '')} onClick={() => { setKitLang('zh') }}>🇨🇳 中文</button>
                          <button type='button' className={css.button + ' ' + css.buttonSmall + (kitLang === 'en' ? ' ' + css.buttonPrimary : '')} onClick={() => { setKitLang('en') }}>🇬🇧 English</button>
                          {blocks.length > 0 && (
                            <button type='button' className={css.button + ' ' + css.buttonSmall} onClick={() => {
                              const text = blocks.map(b => '【' + b.title + '】\n' + (kitLang === 'zh' ? b.zh : b.en)).join('\n\n')
                              void navigator.clipboard?.writeText(text).then(() => { notify('已复制全部提示词（' + (kitLang === 'zh' ? '中文' : '英文') + '）') }).catch(() => { /* ignore */ })
                            }}>📋 复制全部</button>
                          )}
                          {anchor !== undefined && kit === undefined && (
                            <button type='button' className={css.button + ' ' + css.buttonSmall} disabled={busy} onClick={() => { void refineKit(detailRole.name) }}>✨ 生成精修版</button>
                          )}
                        </span>
                      </div>
                      {anchor === undefined && <span className={css.meta}>未生成锚点——点下方「✨ 生成锚点」</span>}
                      {blocks.length > 0 && (
                        <>
                          {blocks.filter(b => b.key === 'portrait' || b.key === 'sheet').length > 0 && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 8 }}>
                              {blocks.filter(b => b.key === 'portrait' || b.key === 'sheet').map(b => blockCard(b))}
                            </div>
                          )}
                          {blocks.some(b => b.key.startsWith('exp-')) && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8, marginTop: 8 }}>
                              {blocks.filter(b => b.key.startsWith('exp-')).map(b => blockCard(b))}
                            </div>
                          )}
                          {blocks.filter(b => b.key === 'details').length > 0 && (
                            <div style={{ marginTop: 8 }}>{blocks.filter(b => b.key === 'details').map(b => blockCard(b))}</div>
                          )}
                        </>
                      )}
                      {anchor !== undefined && (
                        <div className={css.meta} style={{ fontSize: 10, marginTop: 6 }}>关键词：{(anchor.tags ?? []).join('、')}</div>
                      )}
                    </div>

                    <div style={{ borderTop: '1px solid var(--nf-border)', paddingTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {anchor === undefined && (
                        <button type='button' className={css.button + ' ' + css.buttonSmall} disabled={busy} onClick={() => { void handleVisual(detailRole.name) }}>✨ 生成锚点</button>
                      )}
                      {anchor !== undefined && imageApiEnabled === true && (
                        <button type='button' className={css.button + ' ' + css.buttonSmall} disabled={busy} onClick={() => { void handleImageGenerate(detailRole.name) }}>豆包生成</button>
                      )}
                      {anchor !== undefined && (
                        <button type='button' className={css.button + ' ' + css.buttonSmall} onClick={() => {
                          const text = [anchor.en, (anchor.tags ?? []).join(', ')].filter(Boolean).join('\n')
                          void navigator.clipboard?.writeText(text).then(() => { notify('已复制「' + detailRole.name + '」英文生图提示词') }).catch(() => { /* ignore */ })
                        }}>复制提示词</button>
                      )}
                      <input
                        className={css.input}
                        style={{ width: 140, fontSize: 12, padding: '3px 6px' }}
                        placeholder='图集标签'
                        value={detailUploadLabel}
                        onChange={e => { setDetailUploadLabel(e.target.value) }}
                      />
                      <button type='button' className={css.button + ' ' + css.buttonSmall} disabled={busy} onClick={() => {
                        setRoleImageLabel(detailUploadLabel.trim() !== '' ? detailUploadLabel.trim() : '立绘')
                        setRoleImageTarget(detailRole.name)
                        inputRef.current?.click()
                      }}>📤 上传图</button>
                    </div>
                  </div>
                </div>,
                document.body,
              )
            })() }
          </>
        )}
      </div>
    </div>
  )
}