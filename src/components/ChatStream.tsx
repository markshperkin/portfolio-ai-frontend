'use client'

import { useEffect, useRef, useState } from 'react'
import { streamChat } from '@/lib/sse'
import { DripQueue } from '@/lib/drip'
import type { SSEEvent } from '@/lib/sse-events'

type Message = { role: 'user' | 'assistant'; content: string }

type RetrievalStatus = 'retrieving' | 'searching' | 'synthesizing' | null

export function ChatStream() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<RetrievalStatus>(null)
  const [streaming, setStreaming] = useState(false)
  const [citations, setCitations] = useState<string[]>([])
  const dripRef = useRef<DripQueue | null>(null)
  const assistantBufRef = useRef('')

  const appendChar = (char: string) => {
    assistantBufRef.current += char
    setMessages(prev => {
      const next = [...prev]
      next[next.length - 1] = { role: 'assistant', content: assistantBufRef.current }
      return next
    })
  }

  const submit = async () => {
    if (!input.trim() || streaming) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    setInput('')
    setStreaming(true)
    setStatus(null)
    setCitations([])
    assistantBufRef.current = ''

    const history = [...messages, userMsg]
    setMessages([...history, { role: 'assistant', content: '' }])

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
      setStreaming(false)
    }
  }

  const handleEvent = (event: SSEEvent, drip: DripQueue) => {
    switch (event.type) {
      case 'retrieval_step':
        setStatus(event.step)
        break
      case 'delta':
        drip.enqueue(event.text)
        break
      case 'citation':
        setCitations(event.sources.map(s => s.title))
        break
      case 'done':
        drip.flush()
        setStreaming(false)
        setStatus(null)
        break
      case 'error':
        drip.flush()
        assistantBufRef.current += `\n\n⚠ ${event.message}`
        setMessages(prev => {
          const next = [...prev]
          next[next.length - 1] = { role: 'assistant', content: assistantBufRef.current }
          return next
        })
        setStreaming(false)
        break
    }
  }

  useEffect(() => () => dripRef.current?.destroy(), [])

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4 gap-4">
      <div className="flex-1 overflow-y-auto flex flex-col gap-3">
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === 'user' ? 'text-green-400' : 'text-gray-200'}>
            <span className="text-gray-500">{msg.role === 'user' ? '> ' : '$ '}</span>
            {msg.content}
            {msg.role === 'assistant' && i === messages.length - 1 && citations.length > 0 && (
              <div className="mt-1 text-xs text-gray-500">
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
      </div>

      <div className="flex gap-2">
        <span className="text-green-400">❯</span>
        <input
          className="flex-1 bg-transparent outline-none text-gray-200 caret-green-400"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          disabled={streaming}
          autoFocus
          placeholder={streaming ? '' : 'Ask about Mark…'}
        />
      </div>
    </div>
  )
}
