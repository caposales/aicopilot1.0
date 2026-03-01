import { getDb } from '@/lib/db'
import { decrypt } from '@/lib/encryption'

export async function GET() {
  try {
    const db = await getDb()

    const integration = await db
      .collection('integrations')
      .findOne({ type: 'elevenlabs' })

    if (!integration?.apiKey) {
      return Response.json({ voices: [] })
    }

    const apiKey = decrypt(integration.apiKey)

    const res = await fetch('https://api.elevenlabs.io/v2/voices', {
      headers: {
        'xi-api-key': apiKey
      }
    })

    if (!res.ok) {
      const details = await res.text()
      return Response.json(
        { error: 'Failed to fetch ElevenLabs voices', details },
        { status: 502 }
      )
    }

    const data = await res.json()

    const voices = (data.voices || []).map(v => ({
      id: v.voice_id,
      name: v.name,
      description: v.description || 'ElevenLabs voice',
      avatar: v.preview_url || ''
    }))

    return Response.json({ voices })
  } catch (e) {
    console.error(e)
    return Response.json({ error: 'Server error' }, { status: 500 })
  }
}
