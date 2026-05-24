'use client'

const PROMPTS = [
  "Tell me about Mark's Thesis",
  'How do I reach Mark?',
  'Does Mark know how to play backgammon?',
  'Does Mark know how to swim?',
  "Tell me about Mark's work ethic.",
  "What are Mark's career goals?",
  "Tell me about a time Mark delivered something hard under conditions most people would have used as an excuse to ship less. What does that pattern say about how he'd handle pressure on my team?",
  "What quotes does Mark live by?",
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
