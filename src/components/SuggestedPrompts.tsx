'use client'

const PROMPTS = [
  "What are Mark's career goals?",
  "How does Mark perform under pressure?",
  "What's the most ambitious thing Mark has shipped end-to-end?",
  "Tell me about Mark's Thesis",
  "What quotes does Mark live by?",
  "What did 20 years of competitive swimming teach Mark about engineering?",
]

type Props = {
  onSelect: (prompt: string) => void
  disabled?: boolean
}

export function SuggestedPrompts({ onSelect, disabled }: Props) {
  return (
    <div className="flex flex-wrap gap-2 pb-2">
      {PROMPTS.map((p) => (
        <button
          key={p}
          onClick={() => !disabled && onSelect(p)}
          disabled={disabled}
          className="text-xs border border-gray-700 text-gray-400 px-3 py-1 rounded hover:border-green-600 hover:text-green-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {p}
        </button>
      ))}
    </div>
  )
}
