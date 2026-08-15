/**
 * AI 助手页签：与 AI 编辑对话讨论剧情，助手可通过动作指令直接修改
 * 大纲 / 设定圣经 / 章节。流式渲染回复，工具调用以事件行展示。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { NovelApi } from '../api.ts'
import { tt } from './helpers.ts'
import type { AssistantFrame, AssistantMessage } from '../../protocol.ts'
import css from './panel.module.css'

/** One chat bubble (either side). */
interface ChatLine {
  id: number
  role: 'user' | 'assistant'
  text: string
  /** Tool events interleaved with the assistant reply. */
  tools: Array<{ name: string; status: 'start' | 'done' | 'error'; detail?: string }>
  /** Live output while a tool runs (generated text streamed into the bubble). */
  live?: string
}

/** Props. */
export interface AssistantTabProps {
  api: NovelApi
}

/** The assistant conversation tab. */
export function AssistantTab({ api }: AssistantTabProps) {
  const [lines, setLines] = useState<ChatLine[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const idRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  /** Append a bubble (or extend the current assistant bubble). */
  const pushLine = useCallback((line: Omit<ChatLine, 'id'>) => {
    setLines(prev => {
      const last = prev[prev.length - 1]
      // Extend the live assistant bubble while streaming.
      if (line.role === 'assistant' && last !== undefined && last.role === 'assistant' && last.tools.length === 0) {
        return [...prev.slice(0, -1), { ...last, text: last.text + line.text }]
      }
      return [...prev, { ...line, id: idRef.current++ }]
    })
  }, [])

  /** Push a tool event onto the current assistant bubble. */
  const pushTool = useCallback((tool: ChatLine['tools'][number]) => {
    setLines(prev => {
      const last = prev[prev.length - 1]
      if (last === undefined || last.role !== 'assistant') {
        return [...prev, { id: idRef.current++, role: 'assistant', text: '', tools: [tool] }]
      }
      return [...prev.slice(0, -1), { ...last, tools: [...last.tools, tool], live: undefined }]
    })
  }, [])

  /** Append live tool output onto the current assistant bubble. */
  const pushToolDelta = useCallback((text: string) => {
    setLines(prev => {
      const last = prev[prev.length - 1]
      if (last === undefined || last.role !== 'assistant') return prev
      return [...prev.slice(0, -1), { ...last, live: (last.live ?? '') + text }]
    })
  }, [])

  /** Load persisted history on mount. */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const history = await api.assistantHistory()
        if (cancelled) return
        const restored: ChatLine[] = []
        for (const entry of history) {
          if (entry.role === 'user') {
            restored.push({ id: idRef.current++, role: 'user', text: entry.content, tools: [] })
          } else if (entry.role === 'assistant') {
            restored.push({ id: idRef.current++, role: 'assistant', text: entry.content, tools: [] })
          } else if (entry.role === 'tool') {
            const last = restored[restored.length - 1]
            if (last !== undefined && last.role === 'assistant') {
              last.tools.push({ name: entry.tool ?? 'tool', status: 'done', detail: entry.content.slice(0, 120) })
            }
          }
        }
        setLines(restored)
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [api])

  /** Auto-scroll to the newest line. */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  /** Send one message. */
  const handleSend = async (): Promise<void> => {
    const message = input.trim()
    if (message === '' || busy) return
    setInput('')
    setError('')
    pushLine({ role: 'user', text: message, tools: [] })
    // Start an empty assistant bubble.
    setLines(prev => [...prev, { id: idRef.current++, role: 'assistant', text: '', tools: [] }])
    setBusy(true)
    try {
      await api.assistant(message, (frame: AssistantFrame) => {
        if (frame.type === 'delta') {
          pushLine({ role: 'assistant', text: frame.text, tools: [] })
        } else if (frame.type === 'tool') {
          pushTool({
            name: frame.name,
            status: frame.status,
            detail: frame.detail,
          })
        } else if (frame.type === 'toolDelta') {
          pushToolDelta(frame.text)
        } else if (frame.type === 'error') {
          pushTool({ name: 'error', status: 'error', detail: frame.message })
        }
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={css.card} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <span className={css.cardTitle}>{tt('tab.assistant')}</span>
      <span className={css.meta}>{tt('assistant.hint')}</span>
      {error !== '' && <span style={{ color: 'var(--nf-error)', fontSize: 12 }}>{tt('common.error')}: {error}</span>}
      <div
        ref={scrollRef}
        className={css.chatScroll}
      >
        {lines.length === 0 && <span className={css.meta}>{tt('assistant.empty')}</span>}
        {lines.map(line => (
          <div key={line.id} className={line.role === 'user' ? css.chatBubbleUser : css.chatBubbleAssistant}>
            {line.role === 'user' && <div className={css.chatRole}>你</div>}
            {line.text !== '' && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{line.text}</div>}
            {line.live !== undefined && line.live !== '' && (
              <div className={css.toolLive}>{line.live}</div>
            )}
            {line.tools.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4, fontSize: 11 }}>
                {line.tools.map((tool, i) => (
                  <span key={i} style={{ color: tool.status === 'error' ? 'var(--nf-error)' : tool.status === 'start' ? 'var(--nf-accent)' : 'var(--nf-success)' }}>
                    {tool.status === 'start'
                      ? tt('assistant.toolStart', { name: tool.name })
                      : tool.status === 'done'
                        ? tt('assistant.toolDone', { name: tool.name, detail: tool.detail ?? '' })
                        : tt('assistant.toolError', { name: tool.name, detail: tool.detail ?? '' })}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <span className={css.meta} style={{ color: 'var(--nf-accent)' }}>…</span>}
      </div>
      <div className={css.row} style={{ marginTop: 8 }}>
        <textarea
          className={css.textarea}
          style={{ minHeight: 64, flex: 1 }}
          placeholder={tt('assistant.placeholder')}
          value={input}
          onChange={e => { setInput(e.target.value) }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void handleSend()
            }
          }}
        />
        <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy || input.trim() === ''} onClick={() => { void handleSend() }}>
          {tt('assistant.send')}
        </button>
      </div>
    </div>
  )
}
