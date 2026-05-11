import type { SSEEvent } from './sse-events'

/**
 * Parse raw SSE text chunks into typed SSEEvent objects.
 * Handles partial chunks by accumulating a buffer.
 */
export function parseSseChunk(buffer: string, chunk: string): { events: SSEEvent[]; remaining: string } {
  const text = buffer + chunk
  const parts = text.split('\n\n')
  const remaining = parts.pop() ?? ''
  const events: SSEEvent[] = []

  for (const part of parts) {
    const lines = part.split('\n')
    let eventType = ''
    let data = ''
    for (const line of lines) {
      if (line.startsWith('event: ')) eventType = line.slice(7).trim()
      if (line.startsWith('data: ')) data = line.slice(6).trim()
    }
    if (!eventType || !data) continue
    try {
      const payload = JSON.parse(data)
      events.push({ type: eventType, ...payload } as SSEEvent)
    } catch {
      // malformed — skip
    }
  }

  return { events, remaining }
}

/**
 * Stream POST /api/chat and yield parsed SSE events.
 */
export async function* streamChat(
  messages: { role: string; content: string }[],
  sessionId?: string,
): AsyncGenerator<SSEEvent> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, session_id: sessionId }),
  })

  if (!res.ok || !res.body) {
    yield { type: 'error', code: 'fetch_error', message: 'Connection failed. Try again.' }
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    const { events, remaining } = parseSseChunk(buffer, chunk)
    buffer = remaining
    for (const event of events) yield event
  }
}
