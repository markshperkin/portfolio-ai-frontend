'use client'

import { useEffect, useState } from 'react'
import { ChatStream } from '@/components/ChatStream'
import { loadMessages } from '@/lib/sessionStore'
import type { StoredMessage } from '@/lib/sessionStore'

const ANNOUNCEMENT: StoredMessage = {
  role: 'assistant',
  content: `Ask me about Mark in plain English.

You can also run slash commands:
  whoami          → what I am
  /help           → all commands
  sudo hire-mark  → Mark's contact info
  cat resume.pdf  → download his résumé`,
}

type Phase = 'loading' | 'chat'

export default function Home() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [initialMessages, setInitialMessages] = useState<StoredMessage[]>([ANNOUNCEMENT])
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    const saved = loadMessages()
    if (saved.length > 0) {
      setInitialMessages(saved)
      setShowBanner(false)
    } else {
      setShowBanner(true)
    }
    setPhase('chat')
  }, [])

  if (phase === 'loading') return null

  return (
    <ChatStream
      initialMessages={showBanner ? [] : initialMessages}
      showBanner={showBanner}
      postBannerMessages={showBanner ? initialMessages : undefined}
    />
  )
}
