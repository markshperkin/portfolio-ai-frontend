'use client'

import { useEffect, useState } from 'react'
import { BootupBanner } from '@/components/BootupBanner'
import { ChatStream } from '@/components/ChatStream'
import { loadMessages } from '@/lib/sessionStore'
import type { StoredMessage } from '@/lib/sessionStore'

const ANNOUNCEMENT: StoredMessage = {
  role: 'assistant',
  content: `Ask me about Mark in plain English — "tell me about Tutor-AI", "what's his strongest AI work?", "how do I reach him?".

You can also run slash commands:
  whoami          → what I am
  /help           → all commands
  sudo hire-mark  → Mark's contact info
  cat resume.pdf  → download his résumé`,
}

type Phase = 'loading' | 'bootup' | 'chat'

export default function Home() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [initialMessages, setInitialMessages] = useState<StoredMessage[]>([ANNOUNCEMENT])

  useEffect(() => {
    const saved = loadMessages()
    if (saved.length > 0) {
      // Same-tab reload with prior conversation — restore and skip bootup
      setInitialMessages(saved)
      setPhase('chat')
    } else {
      setPhase('bootup')
    }
  }, [])

  if (phase === 'loading') return null

  if (phase === 'bootup') {
    return <BootupBanner onComplete={() => setPhase('chat')} />
  }

  return <ChatStream initialMessages={initialMessages} />
}
