export type StoredMessage = { role: 'user' | 'assistant'; content: string; citations?: string[] }

const KEY = 'marks_gpt_messages'

export function loadMessages(): StoredMessage[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as StoredMessage[]) : []
  } catch {
    return []
  }
}

export function saveMessages(messages: StoredMessage[]): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(KEY, JSON.stringify(messages))
  } catch {
    // quota or private browsing — ignore
  }
}
