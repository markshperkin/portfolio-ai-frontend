'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { streamChat } from '@/lib/sse'
import { DripQueue } from '@/lib/drip'
import { saveMessages } from '@/lib/sessionStore'
import { SuggestedPrompts } from './SuggestedPrompts'
import { BootupBanner } from './BootupBanner'
import type { SSEEvent } from '@/lib/sse-events'

type Message = { role: 'user' | 'assistant'; content: string; citations?: string[] }
type RetrievalStatus = 'planning' | 'extracting' | 'retrieving' | 'searching' | 'synthesizing' | null

type JdfitStepKey = 'extracting' | 'retrieving' | 'synthesizing'
type JdfitStepState = { key: JdfitStepKey; label: string; done: boolean; active: boolean }

type StepSpeed = {
  minInterval: number
  maxInterval: number
  minIncrement: number
  maxIncrement: number
}

// Speeds tuned to expected durations: extracting ~6s, retrieving ~2s, synthesizing ~30s
const JDFIT_STEP_SPEEDS: Record<JdfitStepKey, StepSpeed> = {
  extracting:   { minInterval: 300, maxInterval: 700, minIncrement: 2,   maxIncrement: 5   },
  retrieving:   { minInterval: 100, maxInterval: 250, minIncrement: 5,   maxIncrement: 10  },
  synthesizing: { minInterval: 300, maxInterval: 700, minIncrement: 0.9, maxIncrement: 2.1 },
}

const JDFIT_STEPS_INIT: JdfitStepState[] = [
  { key: 'extracting',   label: 'extracting requirements', done: false, active: true  },
  { key: 'retrieving',   label: 'retrieving evidence',     done: false, active: false },
  { key: 'synthesizing', label: 'synthesizing report',     done: false, active: false },
]

type Props = {
  initialMessages?: Message[]
  showBanner?: boolean
  postBannerMessages?: Message[]
}

const COMMANDS = [
  { name: '/whoami',    description: 'What I am' },
  { name: '/help',      description: 'All commands' },
  { name: '/hire-mark', description: "Mark's contact info" },
  { name: '/resume',    description: 'Download résumé' },
  { name: '/jdfit',     description: 'Paste a JD → fit report' },
]

function linkifyUrls(text: string): string {
  return text.replace(/(?<!\()(?<!\[)(https?:\/\/[^\s)\]]+)/g, '[$1]($1)')
}

// Anything starting with / renders immediately without char-by-char drip
function isSlashCommand(text: string): boolean {
  return /^\s*\//.test(text)
}

function getGhostSuffix(input: string): string {
  if (!input.startsWith('/')) return ''
  const lower = input.toLowerCase()
  const match = COMMANDS.find((c) => c.name.startsWith(lower) && c.name !== lower)
  return match ? match.name.slice(input.length) : ''
}

function isCommandRecognized(input: string): boolean {
  const lower = input.trim().toLowerCase()
  return COMMANDS.some((c) => lower === c.name || lower.startsWith(c.name + ' '))
}

function getCommandMatch(input: string) {
  const lower = input.trim().toLowerCase()
  return COMMANDS.find((c) => lower === c.name || lower.startsWith(c.name + ' ')) ?? null
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

const STATUS_LABELS: Record<string, string> = {
  planning: 'Planning queries…',
  extracting: 'Extracting requirements…',
  retrieving: 'Retrieving…',
  searching: 'Looking in knowledge base…',
  synthesizing: 'Synthesizing…',
}

function StatusSpinner({ status }: { status: string }) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="text-yellow-600 text-sm font-mono">
      {SPINNER_FRAMES[frame]} {STATUS_LABELS[status] ?? status}
    </div>
  )
}

function ProgressRow({ label, done, active, speed }: { label: string; done: boolean; active: boolean; speed: StepSpeed }) {
  const [pct, setPct] = useState(0)
  const [frame, setFrame] = useState(0)
  const tickRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Irregular slow ticks while active
  useEffect(() => {
    if (!active || done) {
      if (tickRef.current) clearTimeout(tickRef.current)
      return
    }
    const tick = () => {
      setPct((p) => {
        if (p >= 88) return p
        const inc = Math.random() * (speed.maxIncrement - speed.minIncrement) + speed.minIncrement
        return Math.min(p + inc, 88)
      })
      const delay = Math.random() * (speed.maxInterval - speed.minInterval) + speed.minInterval
      tickRef.current = setTimeout(tick, delay)
    }
    const delay = Math.random() * (speed.maxInterval - speed.minInterval) + speed.minInterval
    tickRef.current = setTimeout(tick, delay)
    return () => { if (tickRef.current) clearTimeout(tickRef.current) }
  }, [active, done, speed])

  // Smooth fill to 100% on completion
  useEffect(() => {
    if (!done) return
    if (tickRef.current) clearTimeout(tickRef.current)
    const fill = () => {
      setPct((p) => {
        if (p >= 100) return 100
        const next = p + 4
        if (next < 100) tickRef.current = setTimeout(fill, 30)
        return Math.min(next, 100)
      })
    }
    tickRef.current = setTimeout(fill, 30)
    return () => { if (tickRef.current) clearTimeout(tickRef.current) }
  }, [done])

  // Spinner frame for active row
  useEffect(() => {
    if (!active || done) return
    const t = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80)
    return () => clearInterval(t)
  }, [active, done])

  const BAR_WIDTH = 20
  const filled = Math.round((pct / 100) * BAR_WIDTH)
  const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled)
  const pctStr = String(Math.round(pct)).padStart(3)

  return (
    <div className={`font-mono text-sm ${done ? 'text-green-400' : active ? 'text-yellow-600' : 'text-gray-600'}`}>
      <span className="inline-block w-4">{done ? '✓' : active ? SPINNER_FRAMES[frame] : ' '}</span>
      {' '}{label.padEnd(26)}[{bar}] {pctStr}%
    </div>
  )
}

function JdfitProgressBars({ steps }: { steps: JdfitStepState[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {steps.map((step) => (
        <ProgressRow key={step.key} label={step.label} done={step.done} active={step.active} speed={JDFIT_STEP_SPEEDS[step.key]} />
      ))}
    </div>
  )
}

const LINE_HEIGHT_PX = 24
const MAX_TEXTAREA_LINES = 5
const PASTE_CHIP_LINE_THRESHOLD = 5
const PASTE_CHIP_CHAR_THRESHOLD = 400

export function ChatStream({ initialMessages = [], showBanner = false, postBannerMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<RetrievalStatus>(null)
  const [jdfitSteps, setJdfitSteps] = useState<JdfitStepState[]>([])
  const jdfitClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [bannerDone, setBannerDone] = useState(!showBanner)
  const postBannerRef = useRef(postBannerMessages)
  const dripRef = useRef<DripQueue | null>(null)
  const assistantBufRef = useRef('')
  const isSlashRef = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pasteMapRef = useRef<Map<string, string>>(new Map())
  const pasteCountRef = useRef(0)

  // Auto-grow textarea up to MAX_TEXTAREA_LINES, then scroll
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const maxHeight = LINE_HEIGHT_PX * MAX_TEXTAREA_LINES
    el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px'
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [input])

  useEffect(() => {
    if (messages.length > 0) saveMessages(messages)
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  const appendChar = (char: string) => {
    assistantBufRef.current += char
    setMessages((prev) => {
      const next = [...prev]
      next[next.length - 1] = { ...next[next.length - 1], content: assistantBufRef.current }
      return next
    })
  }

  const appendDirect = (text: string) => {
    assistantBufRef.current += text
    setMessages((prev) => {
      const next = [...prev]
      next[next.length - 1] = { ...next[next.length - 1], content: assistantBufRef.current }
      return next
    })
  }

  const expandPastes = (text: string): string => {
    let result = text
    pasteMapRef.current.forEach((value, key) => {
      result = result.split(key).join(value)
    })
    return result
  }

  const submit = async (text?: string) => {
    const raw = (text ?? input).trim()
    if (!raw || streaming) return
    const content = expandPastes(raw)
    setInput('')
    pasteMapRef.current.clear()
    pasteCountRef.current = 0
    setStreaming(true)
    setStatus(null)
    setJdfitSteps([])
    if (jdfitClearRef.current) clearTimeout(jdfitClearRef.current)
    assistantBufRef.current = ''
    isSlashRef.current = isSlashCommand(content)

    const userMsg: Message = { role: 'user', content: raw }
    const sendableHistory = messages.filter((m) => m.role !== 'assistant' || m.content.length > 0)
    const history = [...sendableHistory, { role: 'user' as const, content }].slice(-8)
    setMessages([...messages, userMsg, { role: 'assistant', content: '' }])

    const drip = new DripQueue(appendChar, () => {
      setStreaming(false)
      setStatus(null)
    })
    dripRef.current = drip

    try {
      for await (const event of streamChat(history)) {
        handleEvent(event, drip)
      }
    } catch {
      drip.flush()
      assistantBufRef.current += assistantBufRef.current ? '\n\n[Connection lost]' : '[Connection lost]'
      setMessages((prev) => {
        const next = [...prev]
        next[next.length - 1] = { ...next[next.length - 1], content: assistantBufRef.current }
        return next
      })
      setStreaming(false)
      setStatus(null)
    }
  }

  const handleEvent = (event: SSEEvent, drip: DripQueue) => {
    switch (event.type) {
      case 'retrieval_step':
        setStatus(event.step as RetrievalStatus)
        if (event.step === 'extracting') {
          setJdfitSteps(JDFIT_STEPS_INIT.map((s) => ({ ...s })))
        } else if (event.step === 'retrieving') {
          setJdfitSteps((prev) => prev.map((s) =>
            s.key === 'extracting' ? { ...s, done: true, active: false } :
            s.key === 'retrieving' ? { ...s, active: true } : s
          ))
        } else if (event.step === 'synthesizing') {
          setJdfitSteps((prev) => prev.map((s) =>
            s.key === 'retrieving'   ? { ...s, done: true, active: false } :
            s.key === 'synthesizing' ? { ...s, active: true } : s
          ))
        }
        break
      case 'delta':
        if (isSlashRef.current) {
          appendDirect(event.text)
        } else {
          drip.enqueue(event.text)
        }
        break
      case 'citation':
        setMessages((prev) => {
          const next = [...prev]
          next[next.length - 1] = { ...next[next.length - 1], citations: event.sources.map((s) => s.title) }
          return next
        })
        break
      case 'action':
        if (event.action_type === 'download') {
          const a = document.createElement('a')
          a.href = event.url
          a.download = ''
          a.click()
        } else {
          window.open(event.url, '_blank')
        }
        break
      case 'debug':
        console.log('[planner queries]', event.data)
        break
      case 'done':
        if (isSlashRef.current) {
          setJdfitSteps((prev) => {
            if (prev.length === 0) return prev
            const next = prev.map((s) => s.key === 'synthesizing' ? { ...s, done: true, active: false } : s)
            jdfitClearRef.current = setTimeout(() => setJdfitSteps([]), 800)
            return next
          })
          setStreaming(false)
          setStatus(null)
        } else {
          drip.flush()
        }
        break
      case 'error':
        drip.flush()
        appendDirect(event.message)
        setStreaming(false)
        setStatus(null)
        break
    }
  }

  useEffect(() => () => dripRef.current?.destroy(), [])

  const handleBannerComplete = useCallback(() => {
    setBannerDone(true)
    if (postBannerRef.current?.length) {
      setMessages(postBannerRef.current)
    }
  }, [])

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text')
    const lines = text.split('\n')
    if (lines.length > PASTE_CHIP_LINE_THRESHOLD || text.length > PASTE_CHIP_CHAR_THRESHOLD) {
      e.preventDefault()
      pasteCountRef.current += 1
      const token = `[Pasted #${pasteCountRef.current}: ${lines.length} lines]`
      pasteMapRef.current.set(token, text)
      const el = textareaRef.current
      if (el) {
        const start = el.selectionStart
        const end = el.selectionEnd
        setInput((prev) => prev.slice(0, start) + token + prev.slice(end))
        // Restore cursor after token
        requestAnimationFrame(() => {
          el.selectionStart = start + token.length
          el.selectionEnd = start + token.length
        })
      } else {
        setInput((prev) => prev + token)
      }
    }
  }

  const showPrompts = !streaming

  return (
    <div className="flex flex-col h-[100dvh] max-w-4xl mx-auto p-2 sm:p-4 gap-2">
      <div className="flex-1 overflow-y-auto scrollbar-none flex flex-col gap-3 pb-2">
        {showBanner && (
          <BootupBanner onComplete={handleBannerComplete} />
        )}
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === 'assistant' ? 'border-l-2 border-green-900 bg-green-950/10 pl-3 py-0.5 rounded-r' : ''}>
            {msg.role === 'user' && <span className="text-gray-500">{'> '}</span>}
            {msg.role === 'assistant' ? (
              <span className="prose prose-invert prose-sm max-w-none align-top">
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                    pre: ({ children }) => <pre className="bg-transparent p-0">{children}</pre>,
                    code: ({ children }) => <code className="text-green-300 font-mono">{children}</code>,
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-green-400 underline hover:text-green-300 transition-colors">
                        {children}
                      </a>
                    ),
                  }}
                >
                  {linkifyUrls(msg.content)}
                </ReactMarkdown>
              </span>
            ) : (
              <span className="text-green-400 whitespace-pre-wrap">{msg.content}</span>
            )}
            {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
              <div className="mt-2">
                <div className="text-xs text-gray-600 uppercase tracking-wider mb-0.5">Citations</div>
                <div className="text-xs text-gray-500 italic">{msg.citations.join(' · ')}</div>
              </div>
            )}
          </div>
        ))}
        {jdfitSteps.length > 0
          ? <JdfitProgressBars steps={jdfitSteps} />
          : status && <StatusSpinner status={status} />
        }
        <div ref={bottomRef} />
      </div>

      {showPrompts && <SuggestedPrompts onSelect={(p) => submit(p)} disabled={streaming} />}

      <div className="flex gap-2 border-t border-gray-700 pt-2 items-end">
        <span className="text-green-400 pb-1">❯</span>
        <div className="relative flex-1">
          {/* color + ghost overlay */}
          {(getCommandMatch(input) || getGhostSuffix(input)) && (
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none whitespace-pre-wrap break-words text-sm leading-6 font-mono overflow-hidden"
            >
              {getCommandMatch(input) ? (
                <>
                  <span className="text-blue-400">{input.slice(0, getCommandMatch(input)!.name.length)}</span>
                  <span className="text-gray-200">{input.slice(getCommandMatch(input)!.name.length)}</span>
                </>
              ) : (
                <span style={{ color: 'transparent' }}>{input}</span>
              )}
              {getGhostSuffix(input) && <span className="text-gray-600">{getGhostSuffix(input)}</span>}
            </div>
          )}
          <textarea
            ref={textareaRef}
            rows={1}
            className={`w-full bg-transparent outline-none caret-green-400 resize-none leading-6 scrollbar-none text-sm font-mono ${
              getCommandMatch(input) ? 'text-transparent' : 'text-gray-200'
            }`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                const ghost = getGhostSuffix(input)
                if (ghost) {
                  e.preventDefault()
                  setInput(input + ghost)
                  return
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            onPaste={handlePaste}
            disabled={streaming || !bannerDone}
            autoFocus
            placeholder={streaming ? '' : !bannerDone ? '' : 'Ask about Mark…'}
          />
        </div>
        <button
          onClick={() => submit()}
          disabled={streaming || !bannerDone || !input.trim()}
          className="flex-shrink-0 w-7 h-7 mb-0.5 rounded-full bg-green-500 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-green-400 transition-colors"
          aria-label="Send"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
            <path d="M2 21l21-9L2 3v7l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
