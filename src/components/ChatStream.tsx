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
type RetrievalStatus = 'extracting' | 'retrieving' | 'searching' | 'synthesizing' | null

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

const LINE_HEIGHT_PX = 24
const MAX_TEXTAREA_LINES = 5
const PASTE_CHIP_LINE_THRESHOLD = 5
const PASTE_CHIP_CHAR_THRESHOLD = 400

export function ChatStream({ initialMessages = [], showBanner = false, postBannerMessages }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<RetrievalStatus>(null)
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
      case 'done':
        if (isSlashRef.current) {
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
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4 gap-2">
      <div className="flex-1 overflow-y-auto scrollbar-none flex flex-col gap-3 pb-2">
        {showBanner && (
          <BootupBanner onComplete={handleBannerComplete} />
        )}
        {messages.map((msg, i) => (
          <div key={i}>
            <span className="text-gray-500">
              {msg.role === 'user' ? '> ' : '$ '}
            </span>
            {msg.role === 'assistant' ? (
              <span className="prose prose-invert prose-sm max-w-none align-top">
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                    pre: ({ children }) => <pre className="bg-transparent p-0">{children}</pre>,
                    code: ({ children }) => <code className="text-green-300 font-mono">{children}</code>,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </span>
            ) : (
              <span className="text-green-400 whitespace-pre-wrap">{msg.content}</span>
            )}
            {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
              <div className="mt-1 text-xs text-gray-500 pl-4">
                Sources: {msg.citations.join(', ')}
              </div>
            )}
          </div>
        ))}
        {status && (
          <div className="text-yellow-600 text-sm animate-pulse">
            {status === 'extracting' && 'Extracting requirements…'}
            {status === 'retrieving' && 'Retrieving…'}
            {status === 'searching' && 'Looking in knowledge base…'}
            {status === 'synthesizing' && 'Synthesizing…'}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {showPrompts && <SuggestedPrompts onSelect={(p) => submit(p)} disabled={streaming} />}

      <div className="flex gap-2 border-t border-gray-800 pt-2 items-end">
        <span className="text-green-400 pb-1">❯</span>
        <div className="relative flex-1">
          {/* ghost autocomplete layer */}
          {getGhostSuffix(input) && (
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none whitespace-pre-wrap break-words text-sm leading-6 font-mono overflow-hidden"
            >
              <span style={{ color: 'transparent' }}>{input}</span>
              <span className="text-gray-600">{getGhostSuffix(input)}</span>
            </div>
          )}
          <textarea
            ref={textareaRef}
            rows={1}
            className={`w-full bg-transparent outline-none caret-green-400 resize-none leading-6 scrollbar-none ${
              isCommandRecognized(input) ? 'text-blue-400' : 'text-gray-200'
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
