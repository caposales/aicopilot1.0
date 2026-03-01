import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/db'
import { verifyToken, extractTokenFromHeader } from '@/lib/auth'
import { decrypt } from '@/lib/encryption'

// Helper function to handle CORS
function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

function jsonResponse(data, status = 200) {
  return handleCORS(NextResponse.json(data, { status }))
}

function errorResponse(message, status = 400) {
  return handleCORS(NextResponse.json({ error: message }, { status }))
}

export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

// Fallback list (only used when ElevenLabs integration isn’t configured)
const FALLBACK_VOICES = [
  { id: 'rachel', name: 'Rachel', description: 'Warm and professional', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=rachel' },
  { id: 'adam', name: 'Adam', description: 'Deep and authoritative', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=adam' },
  { id: 'emily', name: 'Emily', description: 'Friendly and approachable', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=emily' },
  { id: 'josh', name: 'Josh', description: 'Casual and conversational', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=josh' },
  { id: 'bella', name: 'Bella', description: 'Soft and calming', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bella' },
  { id: 'antoni', name: 'Antoni', description: 'Clear and articulate', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=antoni' },
  { id: 'domi', name: 'Domi', description: 'Energetic and upbeat', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=domi' },
  { id: 'elli', name: 'Elli', description: 'Young and vibrant', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=elli' },
]

async function getUserFromRequest(request, db) {
  const authHeader = request.headers.get('authorization')
  const token = extractTokenFromHeader(authHeader)
  if (!token) return null

  const decoded = verifyToken(token)
  if (!decoded?.userId) return null

  const user = await db.collection('users').findOne({ id: decoded.userId })
  return user || null
}

export async function GET(request) {
  try {
    const db = await connectToMongo()

    // We try to auth (because integrations are per-workspace)
    const user = await getUserFromRequest(request, db)

    // If no auth, just return fallback public voices
    if (!user) {
      return jsonResponse({ source: 'fallback', voices: FALLBACK_VOICES })
    }

    const integrations = await db.collection('integrations').findOne({ workspaceId: user.workspaceId })

    const eleven = integrations?.elevenlabs
    const isConfigured = !!eleven?.configured && !!eleven?.apiKey

    if (!isConfigured) {
      return jsonResponse({ source: 'fallback', voices: FALLBACK_VOICES })
    }

    const apiKey = decrypt(eleven.apiKey)

    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('ElevenLabs voices fetch failed:', res.status, text)
      return jsonResponse({ source: 'fallback', voices: FALLBACK_VOICES })
    }

    const data = await res.json()

    const voices = (data?.voices || []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      description: v?.labels?.description || v?.description || '',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(v.voice_id)}`,
      // Optional: keep raw fields if you want later
      // category: v.category,
      // labels: v.labels,
    }))

    return jsonResponse({ source: 'elevenlabs', voices })
  } catch (err) {
    console.error('GET /api/voices error:', err)
    return errorResponse('Internal server error', 500)
  }
}
