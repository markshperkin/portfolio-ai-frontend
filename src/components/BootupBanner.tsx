'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { DripQueue } from '@/lib/drip'

const HEADER = `\
███╗   ███╗  █████╗  ██████╗  ██╗  ██╗
████╗ ████║ ██╔══██╗ ██╔══██╗ ██║ ██╔╝
██╔████╔██║ ███████║ ██████╔╝ █████╔╝
██║╚██╔╝██║ ██╔══██║ ██╔══██╗ ██╔═██╗
██║ ╚═╝ ██║ ██║  ██║ ██║  ██║ ██║  ██╗
╚═╝     ╚═╝ ╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═╝  ╚═╝
                              G P T  v1.0`

const TAGLINE = `

Mark's GPT — a RAG-backed assistant trained on Mark Shperkin's
actual work: projects, experience, skills, and more.
Ask anything. I'll cite my sources.`

type CheckResult = { status: string; detail: string }
type Readiness = {
  status: string
  knowledge_base: CheckResult
  model: CheckResult
}

function pad(label: string, width: number) {
  return label + ' ' + '.'.repeat(Math.max(1, width - label.length - 1))
}

function buildChecks(r: Readiness): string {
  const kb = r.knowledge_base
  const mdl = r.model
  const col = 32
  const kbTag = kb.status === 'ok' ? '[  OK  ]' : '[ FAIL ]'
  const kbDetail = kb.status === 'ok' ? `online — ${kb.detail} chunks` : kb.detail
  const mdlTag = mdl.status === 'ok' ? '[  OK  ]' : '[ FAIL ]'
  const mdlDetail = mdl.status === 'ok' ? 'ready' : mdl.detail

  return (
    '\n\n' +
    `${kbTag} ${pad('RAG knowledge base', col)} ${kbDetail}\n` +
    `${mdlTag} ${pad('model: claude haiku 4.5', col)} ${mdlDetail}`
  )
}

const FALLBACK: Readiness = {
  status: 'error',
  knowledge_base: { status: 'error', detail: 'unavailable' },
  model: { status: 'error', detail: 'unavailable' },
}

type Props = { onComplete: () => void }

export function BootupBanner({ onComplete }: Props) {
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const doneRef = useRef(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  const finish = useCallback(() => {
    if (doneRef.current) return
    doneRef.current = true
    setDone(true)
    onCompleteRef.current()
  }, [])

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const fetchReadiness = fetch('/api/readiness', {
      signal: AbortSignal.timeout(15_000),
    })
      .then((r) => r.json() as Promise<Readiness>)
      .catch(() => FALLBACK)

    if (reducedMotion) {
      fetchReadiness.then((r) => {
        setText(HEADER + buildChecks(r) + TAGLINE)
        finish()
      })
      return
    }

    // Drip header immediately; when fetch resolves (whenever that is), enqueue
    // checks + tagline into the same queue. finish() is only called after the
    // queue fully drains AND all content has been enqueued.
    let allEnqueued = false
    const drip = new DripQueue(
      (char) => setText((prev) => prev + char),
      () => { if (allEnqueued) finish() },
    )

    drip.enqueue(HEADER)

    fetchReadiness.then((r) => {
      drip.enqueue(buildChecks(r) + TAGLINE)
      allEnqueued = true
    })

    return () => drip.destroy()
  }, [finish])

  return (
    <div className="w-full py-4">
      <pre className="text-green-400 text-sm leading-relaxed whitespace-pre-wrap font-mono">
        {text}
        {!done && <span className="animate-pulse">▋</span>}
      </pre>
    </div>
  )
}
