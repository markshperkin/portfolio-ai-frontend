# portfolio-ai-frontend

Next.js 15 frontend for Mark's GPT — a terminal-aesthetic AI chat interface that streams responses from the RAG backend in real time.

## What It Does

Presents a CLI-style chat UI where visitors can ask questions about Mark Shperkin in plain English. Connects to the backend over Server-Sent Events (SSE), renders responses character-by-character with a typewriter effect, and displays cited sources after each answer.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15.3.2 (App Router, standalone output) |
| UI | React 19, TypeScript 5 (strict) |
| Styling | Tailwind CSS 3.4, `@tailwindcss/typography` |
| Font | JetBrains Mono (Google Fonts) |
| Markdown | react-markdown 10 |
| Streaming | Browser `ReadableStream` + SSE parser |
| Deployment | Docker (multi-stage, Node 20 Alpine), Caddy, Hostinger VPS |

## Project Structure

```
src/
├── app/
│   ├── layout.tsx           # Root layout — JetBrains Mono, metadata
│   ├── page.tsx             # Entry: loads session history, renders ChatStream
│   ├── globals.css          # Dark theme (#1c1c1c bg), scrollbar hiding
│   └── api/chat/route.ts    # Next.js proxy → backend /api/chat (streams SSE)
├── components/
│   ├── ChatStream.tsx       # Main chat UI — SSE consumer, drip queue, state
│   ├── BootupBanner.tsx     # ASCII boot animation (prefers-reduced-motion aware)
│   └── SuggestedPrompts.tsx # Quick-start prompt buttons
└── lib/
    ├── sse.ts               # parseSseChunk() + streamChat() async generator
    ├── sse-events.ts        # TypeScript SSE event union types (mirrors backend models.py)
    ├── sessionStore.ts      # loadMessages() / saveMessages() via sessionStorage
    └── drip.ts              # DripQueue — char-by-char render, adaptive batching
```

## Key Design Decisions

**Drip queue**: `DripQueue` emits chars at 5ms/tick. When the queue is large it batches `ceil(queue.length / 80)` chars per tick to avoid falling behind. Slash command responses bypass the drip and render directly.

**SSE proxy**: `api/chat/route.ts` proxies the backend stream so the browser never calls the backend directly. Sets `X-Accel-Buffering: no` to prevent proxy buffering.

**Session storage**: Conversation persists across same-tab refreshes; lost on tab close — consistent with the stateless backend.

**Terminal aesthetic**: Green text (`text-green-400`) on dark background, `>` for user prompts, `$` for assistant responses, monospace font throughout.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend base URL |

## Running Locally

```bash
npm install
NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

## Deployment

Push to `test` or `prod` branch → GitHub Actions runs ESLint + TypeScript check → builds Docker image → pushes to GHCR (`ghcr.io/markshperkin/portfolio-ai-frontend:<branch>`) → SSH-deploys to VPS.
