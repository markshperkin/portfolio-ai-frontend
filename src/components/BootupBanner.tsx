'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { DripQueue } from '@/lib/drip'

const BANNER_TEXT = `\
███╗   ███╗  █████╗  ██████╗  ██╗  ██╗
████╗ ████║ ██╔══██╗ ██╔══██╗ ██║ ██╔╝
██╔████╔██║ ███████║ ██████╔╝ █████╔╝
██║╚██╔╝██║ ██╔══██║ ██╔══██╗ ██╔═██╗
██║ ╚═╝ ██║ ██║  ██║ ██║  ██║ ██║  ██╗
╚═╝     ╚═╝ ╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═╝  ╚═╝
                              G P T

[  OK  ] knowledge base .............. online
[  OK  ] rag pipeline ................ ready
[  OK  ] model: claude haiku 4.5 ..... ready

Mark's GPT — a RAG-backed assistant trained on Mark Shperkin's
actual work: projects, experience, skills, and more.
Ask anything. I'll cite my sources.`

type Props = {
  onComplete: () => void
}

export function BootupBanner({ onComplete }: Props) {
  const [text, setText] = useState('')
  const dripRef = useRef<DripQueue | null>(null)
  const doneRef = useRef(false)

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    setText(BANNER_TEXT)
    onComplete()
  }, [onComplete])

  useEffect(() => {
    // Respect prefers-reduced-motion — render instantly
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      finish()
      return
    }

    const drip = new DripQueue(
      (char) => setText((prev) => prev + char),
      finish,
    )
    dripRef.current = drip
    drip.enqueue(BANNER_TEXT)

    return () => drip.destroy()
  }, [finish])

  // Skip on click or any keydown
  useEffect(() => {
    const skip = () => {
      dripRef.current?.destroy()
      finish()
    }
    window.addEventListener('click', skip, { once: true })
    window.addEventListener('keydown', skip, { once: true })
    return () => {
      window.removeEventListener('click', skip)
      window.removeEventListener('keydown', skip)
    }
  }, [finish])

  return (
    <div className="min-h-screen p-8">
      <pre className="text-green-400 text-sm leading-relaxed whitespace-pre-wrap font-mono">
        {text}
        <span className="animate-pulse">▋</span>
      </pre>
    </div>
  )
}
