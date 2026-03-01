import { NextResponse } from 'next/server'

export async function GET(request) {
  const url = new URL(request.url)

  const r = await fetch(`${url.origin}/api/voices`, {
    headers: {
      authorization: request.headers.get('authorization') || '',
    },
    cache: 'no-store',
  })

  const data = await r.json()
  return NextResponse.json(data, { status: r.status })
}
