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
  const [done, setDone] = useState(false)
  const doneRef = useRef(false)
  // keep a stable ref to onComplete so finish() never changes identity
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    setText(BANNER_TEXT)
    setDone(true)
    onCompleteRef.current()
  }, []) // stable — no deps

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      finish()
      return
    }

    const drip = new DripQueue(
      (char) => setText((prev) => prev + char),
      finish,
    )
    drip.enqueue(BANNER_TEXT)

    return () => drip.destroy()
  }, [finish]) // finish is stable, this runs exactly once

  return (
    <div className="w-full py-4">
      <pre className="text-green-400 text-sm leading-relaxed whitespace-pre-wrap font-mono">
        {text}
        {!done && <span className="animate-pulse">▋</span>}
      </pre>
    </div>
  )
}
