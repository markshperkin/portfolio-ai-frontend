'use client'

import { useEffect, useRef, useState } from 'react'
import { streamChat } from '@/lib/sse'
import { DripQueue } from '@/lib/drip'
import { saveMessages } from '@/lib/sessionStore'
import { SuggestedPrompts } from './SuggestedPrompts'
import type { SSEEvent } from '@/lib/sse-events'

type Message = { role: 'user' | 'assistant'; content: string }
type RetrievalStatus = 'retrieving' | 'searching' | 'synthesizing' | null

type Props = {
  initialMessages?: Message[]
}

// Commands that should render immediately without char-by-char drip
const SLASH_PATTERN = /^\s*(whoami|\/help|sudo\s+hire-?mark|cat\s+resume\.pdf)\s*[.!?]?\s*$/i

function isSlashCommand(text: string): boolean {
  return SLASH_PATTERN.test(text)
}

export function ChatStream({ initialMessages = [] }: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<RetrievalStatus>(null)
  const [streaming, setStreaming] = useState(false)
  const [citations, setCitations] = useState<string[]>([])
  const dripRef = useRef<DripQueue | null>(null)
  const assistantBufRef = useRef('')
  const isSlashRef = useRef(false)
  const bottomRef = useRef<HTMLDivElement>(null)

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
      next[next.length - 1] = { role: 'assistant', content: assistantBufRef.current }
      return next
    })
  }

  const appendDirect = (text: string) => {
    assistantBufRef.current += text
    setMessages((prev) => {
      const next = [...prev]
      next[next.length - 1] = { role: 'assistant', content: assistantBufRef.current }
      return next
    })
  }

  const submit = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || streaming) return
    setInput('')
    setStreaming(true)
    setStatus(null)
    setCitations([])
    assistantBufRef.current = ''
    isSlashRef.current = isSlashCommand(content)

    const userMsg: Message = { role: 'user', content }
    const sendableHistory = messages.filter((m) => m.role !== 'assistant' || m.content.length > 0)
    const history = [...sendableHistory, userMsg]
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
      // Network drop mid-stream: flush whatever arrived, re-enable input
      drip.flush()
      assistantBufRef.current += assistantBufRef.current ? '\n\n[Connection lost]' : '[Connection lost]'
      setMessages((prev) => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: assistantBufRef.current }
        return next
      })
      setStreaming(false)
      setStatus(null)
    }
  }

  const handleEvent = (event: SSEEvent, drip: DripQueue) => {
    switch (event.type) {
      case 'retrieval_step':
        setStatus(event.step)
        break
      case 'delta':
        if (isSlashRef.current) {
          // Slash commands: render immediately, no char-by-char drip
          appendDirect(event.text)
        } else {
          drip.enqueue(event.text)
        }
        break
      case 'citation':
        setCitations(event.sources.map((s) => s.title))
        break
      case 'action':
        // cat resume.pdf → trigger download or new-tab open
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

  const showPrompts = messages.length <= 1 && !streaming

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4 gap-2">
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-2">
        {messages.map((msg, i) => (
          <div key={i}>
            <span className="text-gray-500">
              {msg.role === 'user' ? '> ' : '$ '}
            </span>
            <span className={msg.role === 'user' ? 'text-green-400' : 'text-gray-200'}>
              {msg.content}
            </span>
            {msg.role === 'assistant' && i === messages.length - 1 && citations.length > 0 && (
              <div className="mt-1 text-xs text-gray-500 pl-4">
                Sources: {citations.join(', ')}
              </div>
            )}
          </div>
        ))}
        {status && (
          <div className="text-yellow-600 text-sm animate-pulse">
            {status === 'retrieving' && 'Retrieving…'}
            {status === 'searching' && 'Looking in knowledge base…'}
            {status === 'synthesizing' && 'Synthesizing…'}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {showPrompts && <SuggestedPrompts onSelect={(p) => submit(p)} disabled={streaming} />}

      <div className="flex gap-2 border-t border-gray-800 pt-2">
        <span className="text-green-400">❯</span>
        <input
          className="flex-1 bg-transparent outline-none text-gray-200 caret-green-400"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          disabled={streaming}
          autoFocus
          placeholder={streaming ? '' : 'Ask about Mark…'}
        />
      </div>
    </div>
  )
}
