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
                              G P T  v1.4`

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

function modelLine(mdl: CheckResult, col: number): string {
  if (mdl.status === 'error') {
    return `[ FAIL ] ${pad('model: haiku down, sonnet down', col)} unavailable`
  }
  if (mdl.detail === 'sonnet') {
    return `[ WARN ] ${pad('model: claude haiku down', col)} claude sonnet ready`
  }
  return `[  OK  ] ${pad('model: claude haiku 4.5', col)} ready`
}

function buildChecks(r: Readiness): string {
  const kb = r.knowledge_base
  const mdl = r.model
  const col = 32
  const kbTag = kb.status === 'ok' ? '[  OK  ]' : '[ FAIL ]'
  const kbDetail = kb.status === 'ok' ? `online — ${kb.detail} chunks` : kb.detail

  return (
    '\n\n' +
    `${kbTag} ${pad('RAG knowledge base', col)} ${kbDetail}\n` +
    modelLine(mdl, col)
  )
}

const FALLBACK: Readiness = {
  status: 'error',
  knowledge_base: { status: 'error', detail: 'unavailable' },
  model: { status: 'error', detail: 'unavailable' },
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function SpinnerLines() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80)
    return () => clearInterval(t)
  }, [])
  const s = SPINNER_FRAMES[frame]
  return (
    <span>
      {'\n\n'}
      {s} RAG knowledge base{'\n'}
      {s} model
    </span>
  )
}

type Props = { onComplete: () => void }

export function BootupBanner({ onComplete }: Props) {
  const [text, setText] = useState('')
  const [done, setDone] = useState(false)
  const [fetchPending, setFetchPending] = useState(false)
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
    // Reset for StrictMode double-invoke — each run starts clean
    setText('')
    setDone(false)
    setFetchPending(false)
    doneRef.current = false

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let cancelled = false

    const fetchReadiness = fetch('/api/health', {
      signal: AbortSignal.timeout(15_000),
    })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<Readiness>
      })
      .catch(() => FALLBACK)

    if (reducedMotion) {
      fetchReadiness.then((r) => {
        if (cancelled) return
        setText(HEADER + buildChecks(r) + TAGLINE)
        finish()
      })
      return () => { cancelled = true }
    }

    // drip2 handles checks + tagline after fetch resolves
    const drip2 = new DripQueue(
      (char) => setText((prev) => prev + char),
      () => finish(),
    )

    // fetchResult and headerDone coordinate between drip1's onDrain and the fetch callback
    let fetchResult: Readiness | null = null
    let headerDone = false

    const drip1 = new DripQueue(
      (char) => setText((prev) => prev + char),
      () => {
        headerDone = true
        if (fetchResult) {
          drip2.enqueue(buildChecks(fetchResult) + TAGLINE)
        } else {
          setFetchPending(true)
        }
      },
    )

    drip1.enqueue(HEADER)

    fetchReadiness.then((r) => {
      if (cancelled) return
      fetchResult = r
      if (headerDone) {
        setFetchPending(false)
        drip2.enqueue(buildChecks(r) + TAGLINE)
      }
      // else: drip1's onDrain will pick up fetchResult and start drip2
    })

    return () => {
      cancelled = true
      drip1.destroy()
      drip2.destroy()
    }
  }, [finish])

  return (
    <div className="w-full py-4">
      <pre className="text-green-400 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-mono">
        {text}
        {fetchPending && <SpinnerLines />}
        {!done && !fetchPending && <span className="animate-pulse">▋</span>}
      </pre>
    </div>
  )
}
