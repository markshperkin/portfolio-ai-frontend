import { NextRequest } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export async function GET(_req: NextRequest) {
  try {
    const upstream = await fetch(`${API_URL}/api/health`, {
      signal: AbortSignal.timeout(15_000),
    })
    const data = await upstream.json()
    return Response.json(data, { status: upstream.status })
  } catch {
    return Response.json({ status: 'error' }, { status: 503 })
  }
}
