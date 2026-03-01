import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/db'
import { verifyToken, extractTokenFromHeader } from '@/lib/auth'
import { decrypt } from '@/lib/encryption'

// CORS helper (same style as your catch-all)
function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
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

// OPTIONS for CORS
export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

// Fallback voices (used when not connected)
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

async function getUserFromAuth(request, db) {
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

    // Must be logged in (we need workspaceId to find the stored ElevenLabs key)
    const user = await getUserFromAuth(request, db)
    if (!user) {
      // If not logged in, still return something so UI doesn't crash
      return jsonResponse({ voices: FALLBACK_VOICES, source: 'fallback_not_logged_in' })
    }

    // Load integration doc
    const integrations = await db.collection('integrations').findOne({ workspaceId: user.workspaceId })

    const configured = !!integrations?.elevenlabs?.configured
    const encryptedKey = integrations?.elevenlabs?.apiKey

    if (!configured || !encryptedKey) {
      return jsonResponse({ voices: FALLBACK_VOICES, source: 'fallback_not_configured' })
    }

    // Decrypt stored API key
    let apiKey = null
    try {
      apiKey = decrypt(encryptedKey)
    } catch (e) {
      console.error('Failed to decrypt ElevenLabs key:', e)
      return jsonResponse({ voices: FALLBACK_VOICES, source: 'fallback_decrypt_failed' })
    }

    // Fetch voices from ElevenLabs
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
        'accept': 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      console.error('ElevenLabs voices error:', response.status, errText)
      return jsonResponse({ voices: FALLBACK_VOICES, source: 'fallback_elevenlabs_error' })
    }

    const data = await response.json()

    // Normalize for your UI
    const voices = (data?.voices || []).map(v => ({
      id: v.voice_id,
      name: v.name,
      description: (v.labels && (v.labels.description || v.labels.accent || v.labels.gender)) || '',
      avatar: '',
    }))

    return jsonResponse({ voices, source: 'elevenlabs' })
  } catch (error) {
    console.error('GET /api/voices error:', error)
    return errorResponse('Internal server error', 500)
  }
}
