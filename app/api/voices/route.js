import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ marker: "API_VOICES_DEDICATED_ROUTE_WORKS" })
}
