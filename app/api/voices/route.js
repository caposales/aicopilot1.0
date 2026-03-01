import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/db'
import { verifyToken, extractTokenFromHeader } from '@/lib/auth'
import { decrypt } from '@/lib/encryption'

function json(data, status = 200) {
  return NextResponse.json(data, { status })
}

async function getUser(db, request) {
  const authHeader = request.headers.get('authorization')
  const token = extractTokenFromHeader(authHeader)
  if (!token) return null

  const decoded = verifyToken(token)
  if (!decoded?.userId) return null

  return await db.collection('users').findOne({ id: decoded.userId })
}

export async function GET(request) {
  try {
    const db = await connectToMongo()
    const user = await getUser(db, request)

    if (!user) {
      return json({ voices: [] })
    }

    const integrations = await db.collection('integrations').findOne({
      workspaceId: user.workspaceId,
    })

    if (!integrations?.elevenlabs?.configured || !integrations?.elevenlabs?.apiKey) {
      return json({ voices: [] })
    }

    const apiKey = decrypt(integrations.elevenlabs.apiKey)

    const r = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': apiKey,
      },
      cache: 'no-store',
    })

    if (!r.ok) {
      const text = await r.text()
      console.error('ElevenLabs error:', text)
      return json({ voices: [] })
    }

    const data = await r.json()

    const voices = (data.voices || []).map(v => ({
      id: v.voice_id,
      name: v.name,
      description: v.category || 'ElevenLabs Voice',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${v.voice_id}`,
    }))

    return json({ voices })
  } catch (err) {
    console.error(err)
    return json({ voices: [] })
  }
}
