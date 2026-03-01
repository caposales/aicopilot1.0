import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/db'
import { hashPassword, verifyPassword, generateToken, verifyToken, extractTokenFromHeader } from '@/lib/auth'
import { encrypt, decrypt, maskSecret } from '@/lib/encryption'
import { isAdminEmail, isSuperAdmin, getAdminRole, hasPermission, isAnyAdmin, ADMIN_ROLES } from '@/lib/admin'
import { logAuditEvent, getAuditLogs, AUDIT_ACTIONS } from '@/lib/audit'

// Helper function to handle CORS
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

// Auth middleware
async function authenticateRequest(request, db) {
  const authHeader = request.headers.get('authorization')
  const token = extractTokenFromHeader(authHeader)

  if (!token) {
    return null
  }

  const decoded = verifyToken(token)
  if (!decoded) {
    return null
  }

  const user = await db.collection('users').findOne({ id: decoded.userId })
  return user
}

// OPTIONS handler for CORS
export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

// ElevenLabs voices (pre-defined fallback list)
const ELEVENLABS_VOICES = [
  { id: 'rachel', name: 'Rachel', description: 'Warm and professional', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=rachel' },
  { id: 'adam', name: 'Adam', description: 'Deep and authoritative', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=adam' },
  { id: 'emily', name: 'Emily', description: 'Friendly and approachable', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=emily' },
  { id: 'josh', name: 'Josh', description: 'Casual and conversational', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=josh' },
  { id: 'bella', name: 'Bella', description: 'Soft and calming', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bella' },
  { id: 'antoni', name: 'Antoni', description: 'Clear and articulate', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=antoni' },
  { id: 'domi', name: 'Domi', description: 'Energetic and upbeat', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=domi' },
  { id: 'elli', name: 'Elli', description: 'Young and vibrant', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=elli' },
]

// Pre-made prompts
const PREMADE_PROMPTS = [
  { id: 'customer-service', name: 'Customer Service', prompt: 'You are a helpful customer service representative. Be polite, empathetic, and solution-oriented. Always acknowledge the customer\'s concerns before providing solutions.' },
  { id: 'appointment-booking', name: 'Appointment Booking', prompt: 'You are an appointment scheduling assistant. Help callers book appointments by collecting their name, preferred date/time, and contact information. Confirm availability and send confirmation.' },
  { id: 'lead-qualification', name: 'Lead Qualification', prompt: 'You are a lead qualification specialist. Ask questions to understand the caller\'s needs, budget, timeline, and decision-making authority. Qualify leads based on responses.' },
  { id: 'technical-support', name: 'Technical Support', prompt: 'You are a technical support agent. Help users troubleshoot issues by asking clarifying questions and providing step-by-step solutions. Escalate complex issues when necessary.' },
  { id: 'sales-inquiry', name: 'Sales Inquiry', prompt: 'You are a sales representative. Answer questions about products/services, provide pricing information, and guide callers toward a purchase decision.' },
]

// Helper: get ElevenLabs API key for a workspace
async function getElevenLabsApiKey(db, workspaceId) {
  const integrations = await db.collection('integrations').findOne({ workspaceId })
  const encryptedKey = integrations?.elevenlabs?.apiKey
  const configured = integrations?.elevenlabs?.configured

  if (!configured || !encryptedKey) return null
  try {
    return decrypt(encryptedKey)
  } catch (e) {
    console.error('Failed to decrypt ElevenLabs key:', e)
    return null
  }
}

// Helper: binary response with CORS headers
function binaryResponse(buffer, contentType = 'application/octet-stream', status = 200) {
  const res = new NextResponse(buffer, { status })
  res.headers.set('Content-Type', contentType)
  return handleCORS(res)
}

// Route handler function
async function handleRoute(request, { params }) {
  const { path = [] } = params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    const db = await connectToMongo()

    // ====== PUBLIC ROUTES ======

    // Health check
    if (route === '/' && method === 'GET') {
      return jsonResponse({ message: 'ENT Solutions API', version: '1.0.0' })
    }

    // Register
    if (route === '/auth/register' && method === 'POST') {
      const body = await request.json()
      const { email, password, name, companyName } = body

      if (!email || !password || !name) {
        return errorResponse('Email, password, and name are required')
      }

      const existingUser = await db.collection('users').findOne({ email: email.toLowerCase() })
      if (existingUser) {
        return errorResponse('Email already registered', 409)
      }

      // Create workspace first
      const workspaceId = uuidv4()
      const workspace = {
        id: workspaceId,
        name: companyName || `${name}'s Workspace`,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      await db.collection('workspaces').insertOne(workspace)

      // Create user
      const userId = uuidv4()
      const hashedPassword = await hashPassword(password)
      const user = {
        id: userId,
        email: email.toLowerCase(),
        name,
        password: hashedPassword,
        workspaceId,
        role: 'owner',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      await db.collection('users').insertOne(user)

      const token = generateToken({ userId, workspaceId, email: user.email })

      return jsonResponse({
        token,
        user: { id: userId, email: user.email, name, workspaceId, role: 'owner' },
        workspace
      }, 201)
    }

    // Login
    if (route === '/auth/login' && method === 'POST') {
      const body = await request.json()
      const { email, password } = body

      if (!email || !password) {
        return errorResponse('Email and password are required')
      }

      const user = await db.collection('users').findOne({ email: email.toLowerCase() })
      if (!user) {
        return errorResponse('Invalid credentials', 401)
      }

      const isValid = await verifyPassword(password, user.password)
      if (!isValid) {
        return errorResponse('Invalid credentials', 401)
      }

      const workspace = await db.collection('workspaces').findOne({ id: user.workspaceId })
      const token = generateToken({ userId: user.id, workspaceId: user.workspaceId, email: user.email })

      // Audit log
      await logAuditEvent(db, {
        action: AUDIT_ACTIONS.USER_LOGIN,
        userId: user.id,
        userEmail: user.email,
        workspaceId: user.workspaceId,
        details: { method: 'email' }
      })

      // Get admin role
      const adminRole = getAdminRole(user)

      return jsonResponse({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          workspaceId: user.workspaceId,
          role: user.role,
          adminRole: adminRole
        },
        workspace
      })
    }

    // Forgot Password (MOCK - logs reset link to console)
    if (route === '/auth/forgot-password' && method === 'POST') {
      const body = await request.json()
      const { email } = body

      if (!email) {
        return errorResponse('Email is required')
      }

      const user = await db.collection('users').findOne({ email: email.toLowerCase() })

      // Always return success to prevent email enumeration
      if (!user) {
        console.log(`[FORGOT PASSWORD] No user found for email: ${email}`)
        return jsonResponse({ success: true, message: 'If the email exists, a reset link has been sent' })
      }

      // Generate reset token
      const resetToken = uuidv4()
      const resetExpiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

      // Store reset token
      await db.collection('password_resets').insertOne({
        id: uuidv4(),
        userId: user.id,
        token: resetToken,
        expiresAt: resetExpiry,
        used: false,
        createdAt: new Date()
      })

      // MOCK: Log the reset link to console instead of sending email
      const resetLink = `${process.env.NEXT_PUBLIC_BASE_URL}/reset-password?token=${resetToken}`
      console.log('================================================')
      console.log('[MOCK EMAIL] Password Reset Link')
      console.log(`To: ${email}`)
      console.log(`Reset Link: ${resetLink}`)
      console.log(`Expires: ${resetExpiry.toISOString()}`)
      console.log('================================================')

      return jsonResponse({ success: true, message: 'If the email exists, a reset link has been sent' })
    }

    // Reset Password
    if (route === '/auth/reset-password' && method === 'POST') {
      const body = await request.json()
      const { token, newPassword } = body

      if (!token || !newPassword) {
        return errorResponse('Token and new password are required')
      }

      if (newPassword.length < 6) {
        return errorResponse('Password must be at least 6 characters')
      }

      // Find valid reset token
      const resetRecord = await db.collection('password_resets').findOne({
        token,
        used: false,
        expiresAt: { $gt: new Date() }
      })

      if (!resetRecord) {
        return errorResponse('Invalid or expired reset token', 400)
      }

      // Update password
      const hashedPassword = await hashPassword(newPassword)
      await db.collection('users').updateOne(
        { id: resetRecord.userId },
        { $set: { password: hashedPassword, updatedAt: new Date() } }
      )

      // Mark token as used
      await db.collection('password_resets').updateOne(
        { id: resetRecord.id },
        { $set: { used: true } }
      )

      return jsonResponse({ success: true, message: 'Password reset successfully' })
    }

    // Google OAuth Callback
    if (route === '/auth/google/callback' && method === 'POST') {
      const body = await request.json()
      const { sessionId } = body

      if (!sessionId) {
        return errorResponse('Session ID is required')
      }

      try {
        // Exchange session_id for user data from Emergent Auth
        const authResponse = await fetch('https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data', {
          method: 'GET',
          headers: {
            'X-Session-ID': sessionId
          }
        })

        if (!authResponse.ok) {
          const errorText = await authResponse.text()
          console.error('Emergent Auth error:', errorText)
          return errorResponse('Google authentication failed', 401)
        }

        const googleUser = await authResponse.json()
        const { email, name, picture } = googleUser

        if (!email) {
          return errorResponse('No email received from Google', 400)
        }

        // Check if user already exists
        let user = await db.collection('users').findOne({ email: email.toLowerCase() })
        let workspace

        if (user) {
          // Existing user - update their info if needed
          await db.collection('users').updateOne(
            { id: user.id },
            { $set: { name: name || user.name, picture, updatedAt: new Date() } }
          )
          workspace = await db.collection('workspaces').findOne({ id: user.workspaceId })
        } else {
          // New user - create workspace and user
          const workspaceId = uuidv4()
          workspace = {
            id: workspaceId,
            name: `${name || email.split('@')[0]}'s Workspace`,
            createdAt: new Date(),
            updatedAt: new Date()
          }
          await db.collection('workspaces').insertOne(workspace)

          const userId = uuidv4()
          user = {
            id: userId,
            email: email.toLowerCase(),
            name: name || email.split('@')[0],
            picture,
            password: null, // Google users don't have a password
            authProvider: 'google',
            workspaceId,
            role: 'owner',
            createdAt: new Date(),
            updatedAt: new Date()
          }
          await db.collection('users').insertOne(user)
        }

        // Generate JWT token
        const token = generateToken({ userId: user.id, workspaceId: user.workspaceId, email: user.email })

        return jsonResponse({
          token,
          user: { id: user.id, email: user.email, name: user.name, workspaceId: user.workspaceId, role: user.role, picture: user.picture },
          workspace
        })

      } catch (error) {
        console.error('Google OAuth error:', error)
        return errorResponse('Google authentication failed', 500)
      }
    }

    // Get voices list
    // IMPORTANT: If the request includes an auth token and ElevenLabs is configured for that workspace,
    // return REAL ElevenLabs voices. Otherwise return the fallback static list.
    if (route === '/voices' && method === 'GET') {
      const user = await authenticateRequest(request, db)
      if (!user) {
        return jsonResponse({ voices: ELEVENLABS_VOICES })
      }

      const apiKey = await getElevenLabsApiKey(db, user.workspaceId)
      if (!apiKey) {
        return jsonResponse({ voices: ELEVENLABS_VOICES })
      }

      const res = await fetch('https://api.elevenlabs.io/v2/voices', {
        headers: { 'xi-api-key': apiKey }
      })

      if (!res.ok) {
        const details = await res.text()
        console.error('Failed to fetch ElevenLabs voices:', details)
        return jsonResponse({ voices: ELEVENLABS_VOICES })
      }

      const data = await res.json()
      const voices = (data.voices || []).map(v => ({
        id: v.voice_id,
        name: v.name,
        description: v.description || 'ElevenLabs voice',
        avatar: v.preview_url || ''
      }))

      return jsonResponse({ voices })
    }

    // Get pre-made prompts (public)
    if (route === '/prompts' && method === 'GET') {
      return jsonResponse({ prompts: PREMADE_PROMPTS })
    }

    // ====== PROTECTED ROUTES ======
    const user = await authenticateRequest(request, db)

    // ElevenLabs TTS preview (protected) - returns audio/mpeg
    // POST /api/tts/elevenlabs  { text, voiceId }
    if (route === '/tts/elevenlabs' && method === 'POST') {
      if (!user) return errorResponse('Unauthorized', 401)

      const body = await request.json().catch(() => ({}))
      const text = body?.text
      const voiceId = body?.voiceId

      if (!text || !voiceId) {
        return errorResponse('text and voiceId are required', 400)
      }

      const apiKey = await getElevenLabsApiKey(db, user.workspaceId)
      if (!apiKey) {
        return errorResponse('ElevenLabs not configured', 400)
      }

      const elevenRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2'
        })
      })

      if (!elevenRes.ok) {
        const details = await elevenRes.text()
        console.error('ElevenLabs TTS failed:', details)
        return errorResponse('ElevenLabs TTS failed', 502)
      }

      const audioBuffer = await elevenRes.arrayBuffer()
      return binaryResponse(audioBuffer, 'audio/mpeg', 200)
    }

    // Get current user
    if (route === '/auth/me' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)

      const workspace = await db.collection('workspaces').findOne({ id: user.workspaceId })
      return jsonResponse({
        user: { id: user.id, email: user.email, name: user.name, workspaceId: user.workspaceId, role: user.role },
        workspace
      })
    }

    // ====== AGENTS ======

    // Create agent
    if (route === '/agents' && method === 'POST') {
      if (!user) return errorResponse('Unauthorized', 401)

      const body = await request.json()
      const agentId = uuidv4()

      const agent = {
        id: agentId,
        workspaceId: user.workspaceId,
        name: body.name || 'New Agent',
        agentType: body.agentType || 'inbound',
        initialMessage: body.initialMessage || 'Hello! How can I help you today?',
        voiceId: body.voiceId || 'rachel',
        language: body.language || 'en-US',
        interruptSensitivity: body.interruptSensitivity || 'high',
        responseSpeed: body.responseSpeed || 'auto',
        aiCreativity: body.aiCreativity ?? 0.7,
        // Call Transfer Settings
        callTransferEnabled: body.callTransferEnabled || false,
        callTransferNumber: body.callTransferNumber || '',
        callTransferConditions: body.callTransferConditions || 'on_request', // 'on_request', 'on_escalation', 'always_offer'
        callTransferMessage: body.callTransferMessage || 'I\'ll transfer you to a specialist now.',
        // Calendar Booking Settings
        calendarBookingEnabled: body.calendarBookingEnabled || false,
        calendarProvider: body.calendarProvider || 'calcom', // 'calcom', 'ghl'
        calendarEventType: body.calendarEventType || '',
        bookingConfirmationMessage: body.bookingConfirmationMessage || 'Your appointment has been booked!',
        // Webhook Settings
        postCallWebhookEnabled: body.postCallWebhookEnabled || false,
        postCallWebhookUrl: body.postCallWebhookUrl || '',
        // Prompt Settings
        promptTemplateId: body.promptTemplateId || '',
        customPrompt: body.customPrompt || '',
        // Phone Number
        phoneNumber: body.phoneNumber || null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      await db.collection('agents').insertOne(agent)

      // Audit log
      await logAuditEvent(db, {
        action: AUDIT_ACTIONS.AGENT_CREATED,
        userId: user.id,
        userEmail: user.email,
        workspaceId: user.workspaceId,
        targetId: agentId,
        targetType: 'agent',
        details: { agentName: agent.name, agentType: agent.agentType }
      })

      return jsonResponse(agent, 201)
    }

    // List agents
    if (route === '/agents' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)

      const agents = await db.collection('agents')
        .find({ workspaceId: user.workspaceId })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray()

      const cleanedAgents = agents.map(({ _id, ...rest }) => rest)
      return jsonResponse({ agents: cleanedAgents })
    }

    // Get single agent
    if (route.match(/^\/agents\/[^/]+$/) && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)

      const agentId = path[1]
      const agent = await db.collection('agents').findOne({ id: agentId, workspaceId: user.workspaceId })

      if (!agent) return errorResponse('Agent not found', 404)

      const { _id, ...cleanAgent } = agent
      return jsonResponse(cleanAgent)
    }

    // Update agent
    if (route.match(/^\/agents\/[^/]+$/) && method === 'PUT') {
      if (!user) return errorResponse('Unauthorized', 401)

      const agentId = path[1]
      const body = await request.json()

      const updateData = {
        ...body,
        updatedAt: new Date()
      }
      delete updateData.id
      delete updateData.workspaceId
      delete updateData._id

      const result = await db.collection('agents').findOneAndUpdate(
        { id: agentId, workspaceId: user.workspaceId },
        { $set: updateData },
        { returnDocument: 'after' }
      )

      if (!result) return errorResponse('Agent not found', 404)

      const { _id, ...cleanAgent } = result
      return jsonResponse(cleanAgent)
    }

    // Delete agent
    if (route.match(/^\/agents\/[^/]+$/) && method === 'DELETE') {
      if (!user) return errorResponse('Unauthorized', 401)

      const agentId = path[1]
      const result = await db.collection('agents').deleteOne({ id: agentId, workspaceId: user.workspaceId })

      if (result.deletedCount === 0) return errorResponse('Agent not found', 404)

      return jsonResponse({ success: true })
    }

    // ====== INTEGRATIONS ======

    // Get integrations (masked)
    if (route === '/integrations' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)

      let integrations = await db.collection('integrations').findOne({ workspaceId: user.workspaceId })

      if (!integrations) {
        integrations = {
          id: uuidv4(),
          workspaceId: user.workspaceId,
          twilio: { configured: false },
          ghl: { configured: false },
          calcom: { configured: false },
          deepgram: { configured: false },
          elevenlabs: { configured: false },
          createdAt: new Date(),
          updatedAt: new Date()
        }
        await db.collection('integrations').insertOne(integrations)
      }

      // Return masked version
      const masked = {
        id: integrations.id,
        twilio: {
          configured: integrations.twilio?.configured || false,
          accountSid: integrations.twilio?.accountSid ? maskSecret(decrypt(integrations.twilio.accountSid)) : null,
        },
        ghl: {
          configured: integrations.ghl?.configured || false,
          apiKey: integrations.ghl?.apiKey ? maskSecret(decrypt(integrations.ghl.apiKey)) : null,
        },
        calcom: {
          configured: integrations.calcom?.configured || false,
          apiKey: integrations.calcom?.apiKey ? maskSecret(decrypt(integrations.calcom.apiKey)) : null,
        },
        deepgram: {
          configured: integrations.deepgram?.configured || false,
          apiKey: integrations.deepgram?.apiKey ? maskSecret(decrypt(integrations.deepgram.apiKey)) : null,
        },
        elevenlabs: {
          configured: integrations.elevenlabs?.configured || false,
          apiKey: integrations.elevenlabs?.apiKey ? maskSecret(decrypt(integrations.elevenlabs.apiKey)) : null,
        }
      }

      return jsonResponse(masked)
    }

    // Update Twilio integration
    if (route === '/integrations/twilio' && method === 'POST') {
      if (!user) return errorResponse('Unauthorized', 401)

      const body = await request.json()
      const { accountSid, authToken } = body

      if (!accountSid || !authToken) {
        return errorResponse('Account SID and Auth Token are required')
      }

      const updateData = {
        'twilio.configured': true,
        'twilio.accountSid': encrypt(accountSid),
        'twilio.authToken': encrypt(authToken),
        updatedAt: new Date()
      }

      await db.collection('integrations').updateOne(
        { workspaceId: user.workspaceId },
        { $set: updateData },
        { upsert: true }
      )

      return jsonResponse({ success: true, configured: true })
    }

    // Update GHL integration
    if (route === '/integrations/ghl' && method === 'POST') {
      if (!user) return errorResponse('Unauthorized', 401)

      const body = await request.json()
      const { apiKey, locationId } = body

      if (!apiKey) {
        return errorResponse('API Key is required')
      }

      const updateData = {
        'ghl.configured': true,
        'ghl.apiKey': encrypt(apiKey),
        'ghl.locationId': locationId || '',
        updatedAt: new Date()
      }

      await db.collection('integrations').updateOne(
        { workspaceId: user.workspaceId },
        { $set: updateData },
        { upsert: true }
      )

      return jsonResponse({ success: true, configured: true })
    }

    // Update Cal.com integration
    if (route === '/integrations/calcom' && method === 'POST') {
      if (!user) return errorResponse('Unauthorized', 401)

      const body = await request.json()
      const { apiKey } = body

      if (!apiKey) {
        return errorResponse('API Key is required')
      }

      const updateData = {
        'calcom.configured': true,
        'calcom.apiKey': encrypt(apiKey),
        updatedAt: new Date()
      }

      await db.collection('integrations').updateOne(
        { workspaceId: user.workspaceId },
        { $set: updateData },
        { upsert: true }
      )

      return jsonResponse({ success: true, configured: true })
    }

    // Update Deepgram integration
    if (route === '/integrations/deepgram' && method === 'POST') {
      if (!user) return errorResponse('Unauthorized', 401)

      const body = await request.json()
      const { apiKey } = body

      if (!apiKey) {
        return errorResponse('API Key is required')
      }

      const updateData = {
        'deepgram.configured': true,
        'deepgram.apiKey': encrypt(apiKey),
        updatedAt: new Date()
      }

      await db.collection('integrations').updateOne(
        { workspaceId: user.workspaceId },
        { $set: updateData },
        { upsert: true }
      )

      return jsonResponse({ success: true, configured: true })
    }

    // Update ElevenLabs integration
    if (route === '/integrations/elevenlabs' && method === 'POST') {
      if (!user) return errorResponse('Unauthorized', 401)

      const body = await request.json()
      const { apiKey } = body

      if (!apiKey) {
        return errorResponse('API Key is required')
      }

      const updateData = {
        'elevenlabs.configured': true,
        'elevenlabs.apiKey': encrypt(apiKey),
        updatedAt: new Date()
      }

      await db.collection('integrations').updateOne(
        { workspaceId: user.workspaceId },
        { $set: updateData },
        { upsert: true }
      )

      return jsonResponse({ success: true, configured: true })
    }

    // Remove integration
    if (route.match(/^\/integrations\/(twilio|ghl|calcom|deepgram|elevenlabs)$/) && method === 'DELETE') {
      if (!user) return errorResponse('Unauthorized', 401)

      const provider = path[1]
      const updateData = {
        [`${provider}.configured`]: false,
        [`${provider}.apiKey`]: null,
        [`${provider}.accountSid`]: null,
        [`${provider}.authToken`]: null,
        updatedAt: new Date()
      }

      await db.collection('integrations').updateOne(
        { workspaceId: user.workspaceId },
        { $set: updateData }
      )

      return jsonResponse({ success: true })
    }

    // ====== CALL LOGS ======

    // List call logs
    if (route === '/call-logs' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)

      const callLogs = await db.collection('call_logs')
        .find({ workspaceId: user.workspaceId })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray()

      const cleaned = callLogs.map(({ _id, ...rest }) => rest)
      return jsonResponse({ callLogs: cleaned })
    }

    // Get single call log
    if (route.match(/^\/call-logs\/[^/]+$/) && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)

      const callId = path[1]
      const callLog = await db.collection('call_logs').findOne({ id: callId, workspaceId: user.workspaceId })

      if (!callLog) return errorResponse('Call log not found', 404)

      const { _id, ...clean } = callLog
      return jsonResponse(clean)
    }

    // ====== ERROR LOGS ======

    // List error logs
    if (route === '/error-logs' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)

      const errorLogs = await db.collection('error_logs')
        .find({ workspaceId: user.workspaceId })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray()

      const cleaned = errorLogs.map(({ _id, ...rest }) => rest)
      return jsonResponse({ errorLogs: cleaned })
    }

    // ====== PHONE NUMBERS ======

    // List purchased numbers
    if (route === '/phone-numbers' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)

      const numbers = await db.collection('phone_numbers')
        .find({ workspaceId: user.workspaceId })
        .sort({ purchasedAt: -1 })
        .limit(100)
        .toArray()

      const cleaned = numbers.map(({ _id, ...rest }) => rest)
      return jsonResponse({ phoneNumbers: cleaned })
    }

    // ====== DASHBOARD STATS ======

    if (route === '/dashboard/stats' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)

      const [agentCount, callCount, phoneCount] = await Promise.all([
        db.collection('agents').countDocuments({ workspaceId: user.workspaceId }),
        db.collection('call_logs').countDocuments({ workspaceId: user.workspaceId }),
        db.collection('phone_numbers').countDocuments({ workspaceId: user.workspaceId })
      ])

      // Get recent calls
      const recentCalls = await db.collection('call_logs')
        .find({ workspaceId: user.workspaceId })
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray()

      const cleaned = recentCalls.map(({ _id, ...rest }) => rest)

      return jsonResponse({
        totalAgents: agentCount,
        totalCalls: callCount,
        totalPhoneNumbers: phoneCount,
        recentCalls: cleaned
      })
    }

    // ====== ADMIN ROUTES ======

    // Verify admin access
    if (route === '/admin/verify' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)

      if (!isAnyAdmin(user)) {
        return errorResponse('Forbidden: Admin access required', 403)
      }

      const role = getAdminRole(user)
      return jsonResponse({ isAdmin: true, role, isSuperAdmin: isSuperAdmin(user.email) })
    }

    // Admin stats
    if (route === '/admin/stats' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!isAdminEmail(user.email)) return errorResponse('Forbidden', 403)

      const [userCount, workspaceCount, agentCount, callCount, phoneCount, errorCount] = await Promise.all([
        db.collection('users').countDocuments(),
        db.collection('workspaces').countDocuments(),
        db.collection('agents').countDocuments(),
        db.collection('call_logs').countDocuments(),
        db.collection('phone_numbers').countDocuments(),
        db.collection('error_logs').countDocuments()
      ])

      // Get recent users
      const recentUsers = await db.collection('users')
        .find({}, { projection: { _id: 0, password: 0 } })
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray()

      // Get recent calls
      const recentCalls = await db.collection('call_logs')
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray()

      return jsonResponse({
        totalUsers: userCount,
        totalWorkspaces: workspaceCount,
        totalAgents: agentCount,
        totalCalls: callCount,
        totalPhoneNumbers: phoneCount,
        totalErrors: errorCount,
        recentUsers,
        recentCalls
      })
    }

    // Admin: List all users
    if (route === '/admin/users' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!isAnyAdmin(user)) return errorResponse('Forbidden', 403)

      const users = await db.collection('users')
        .find({}, { projection: { _id: 0, password: 0 } })
        .sort({ createdAt: -1 })
        .toArray()

      // Add admin role info to each user
      const usersWithRoles = users.map(u => ({
        ...u,
        adminRole: getAdminRole(u),
        isSuperAdmin: isSuperAdmin(u.email)
      }))

      return jsonResponse({ users: usersWithRoles })
    }

    // Admin: Delete user
    if (route.match(/^\/admin\/users\/[^/]+$/) && method === 'DELETE') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!hasPermission(user, 'canDeleteUsers')) return errorResponse('Forbidden: Super admin required', 403)

      const userId = path[2]

      // Get user to check if admin
      const targetUser = await db.collection('users').findOne({ id: userId })
      if (!targetUser) return errorResponse('User not found', 404)

      // Prevent deleting super admins
      if (isSuperAdmin(targetUser.email)) {
        return errorResponse('Cannot delete super admin users', 403)
      }

      // Delete user and their workspace
      await Promise.all([
        db.collection('users').deleteOne({ id: userId }),
        db.collection('workspaces').deleteOne({ id: targetUser.workspaceId }),
        db.collection('agents').deleteMany({ workspaceId: targetUser.workspaceId }),
        db.collection('integrations').deleteMany({ workspaceId: targetUser.workspaceId }),
        db.collection('contacts').deleteMany({ workspaceId: targetUser.workspaceId })
      ])

      await logAuditEvent(db, {
        action: AUDIT_ACTIONS.USER_DELETED,
        userId: user.id,
        userEmail: user.email,
        targetId: userId,
        targetType: 'user',
        details: { deletedEmail: targetUser.email }
      })

      return jsonResponse({ success: true })
    }

    // Admin: List all agents
    if (route === '/admin/agents' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!isAnyAdmin(user)) return errorResponse('Forbidden', 403)

      const agents = await db.collection('agents')
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .toArray()

      // Add workspace/owner info
      const agentsWithOwner = await Promise.all(agents.map(async (agent) => {
        const workspace = await db.collection('workspaces').findOne({ id: agent.workspaceId })
        const owner = await db.collection('users').findOne({ workspaceId: agent.workspaceId, role: 'owner' })
        return {
          ...agent,
          workspaceName: workspace?.name || 'Unknown',
          ownerEmail: owner?.email || 'Unknown'
        }
      }))

      return jsonResponse({ agents: agentsWithOwner })
    }

    // Admin: Delete agent
    if (route.match(/^\/admin\/agents\/[^/]+$/) && method === 'DELETE') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!hasPermission(user, 'canDeleteContent')) return errorResponse('Forbidden: Super admin required', 403)

      const agentId = path[2]
      const agent = await db.collection('agents').findOne({ id: agentId })
      if (!agent) return errorResponse('Agent not found', 404)

      await db.collection('agents').deleteOne({ id: agentId })

      await logAuditEvent(db, {
        action: AUDIT_ACTIONS.AGENT_DELETED,
        userId: user.id,
        userEmail: user.email,
        targetId: agentId,
        targetType: 'agent',
        details: { agentName: agent.name, workspaceId: agent.workspaceId }
      })

      return jsonResponse({ success: true })
    }

    // Admin: List all call logs
    if (route === '/admin/call-logs' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!isAnyAdmin(user)) return errorResponse('Forbidden', 403)

      const callLogs = await db.collection('call_logs')
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray()

      return jsonResponse({ callLogs })
    }

    // Admin: Delete call log
    if (route.match(/^\/admin\/call-logs\/[^/]+$/) && method === 'DELETE') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!hasPermission(user, 'canDeleteContent')) return errorResponse('Forbidden: Super admin required', 403)

      const logId = path[2]
      const result = await db.collection('call_logs').deleteOne({ id: logId })

      if (result.deletedCount === 0) return errorResponse('Call log not found', 404)
      return jsonResponse({ success: true })
    }

    // Admin: List all error logs
    if (route === '/admin/error-logs' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!isAnyAdmin(user)) return errorResponse('Forbidden', 403)

      const errorLogs = await db.collection('error_logs')
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray()

      return jsonResponse({ errorLogs })
    }

    // Admin: Delete error log
    if (route.match(/^\/admin\/error-logs\/[^/]+$/) && method === 'DELETE') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!hasPermission(user, 'canDeleteContent')) return errorResponse('Forbidden: Super admin required', 403)

      const logId = path[2]
      const result = await db.collection('error_logs').deleteOne({ id: logId })

      if (result.deletedCount === 0) return errorResponse('Error log not found', 404)
      return jsonResponse({ success: true })
    }

    // ====== ADMIN ROLE & INVITE MANAGEMENT ======

    // Admin: Get admin role info
    if (route === '/admin/role' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!isAnyAdmin(user)) return errorResponse('Forbidden', 403)

      const role = getAdminRole(user)
      const permissions = {}
      const permissionKeys = ['canViewUsers', 'canDeleteUsers', 'canAssignRoles', 'canInviteAdmins',
        'canViewAllContent', 'canDeleteContent', 'canViewAuditLogs',
        'canManageSystemSettings', 'canViewClientDetails']
      permissionKeys.forEach(key => {
        permissions[key] = hasPermission(user, key)
      })

      return jsonResponse({ role, permissions, isSuperAdmin: isSuperAdmin(user.email) })
    }

    // Admin: Send invite (mock - console log)
    if (route === '/admin/invite' && method === 'POST') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!hasPermission(user, 'canInviteAdmins')) return errorResponse('Forbidden: Super admin required', 403)

      const body = await request.json()
      const { email, role, name } = body

      if (!email || !role) {
        return errorResponse('Email and role are required')
      }

      if (!['moderator', 'super_admin'].includes(role)) {
        return errorResponse('Invalid role. Must be moderator or super_admin')
      }

      // Check if user already exists
      const existingUser = await db.collection('users').findOne({ email: email.toLowerCase() })
      if (existingUser) {
        // Update their admin role
        await db.collection('users').updateOne(
          { id: existingUser.id },
          { $set: { adminRole: role, updatedAt: new Date() } }
        )

        await logAuditEvent(db, {
          action: AUDIT_ACTIONS.ADMIN_ROLE_CHANGED,
          userId: user.id,
          userEmail: user.email,
          targetId: existingUser.id,
          targetType: 'user',
          details: { targetEmail: email, newRole: role }
        })

        return jsonResponse({ success: true, message: 'User role updated', existed: true })
      }

      // Create invite token
      const inviteToken = uuidv4()
      const invite = {
        id: uuidv4(),
        email: email.toLowerCase(),
        name: name || '',
        role,
        token: inviteToken,
        invitedBy: user.id,
        invitedByEmail: user.email,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        used: false,
        createdAt: new Date()
      }

      await db.collection('admin_invites').insertOne(invite)

      // Mock email - log to console
      const inviteLink = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/?invite=${inviteToken}`
      console.log('================================================')
      console.log('[MOCK EMAIL] Admin Invite')
      console.log(`To: ${email}`)
      console.log(`Role: ${role}`)
      console.log(`Invite Link: ${inviteLink}`)
      console.log(`Expires: ${invite.expiresAt.toISOString()}`)
      console.log('================================================')

      await logAuditEvent(db, {
        action: AUDIT_ACTIONS.ADMIN_INVITE_SENT,
        userId: user.id,
        userEmail: user.email,
        details: { inviteEmail: email, role }
      })

      return jsonResponse({ success: true, inviteLink, message: 'Invite sent (check console)' })
    }

    // Admin: List invites
    if (route === '/admin/invites' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!hasPermission(user, 'canInviteAdmins')) return errorResponse('Forbidden', 403)

      const invites = await db.collection('admin_invites')
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray()

      return jsonResponse({ invites })
    }

    // Admin: Change user role
    if (route.match(/^\/admin\/users\/[^/]+\/role$/) && method === 'PUT') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!hasPermission(user, 'canAssignRoles')) return errorResponse('Forbidden: Super admin required', 403)

      const userId = path[2]
      const body = await request.json()
      const { adminRole } = body

      if (!['moderator', 'user', null].includes(adminRole)) {
        return errorResponse('Invalid role')
      }

      const targetUser = await db.collection('users').findOne({ id: userId })
      if (!targetUser) return errorResponse('User not found', 404)

      // Can't change super admin's role (they're defined by email)
      if (isSuperAdmin(targetUser.email)) {
        return errorResponse('Cannot change role of super admin', 403)
      }

      await db.collection('users').updateOne(
        { id: userId },
        { $set: { adminRole: adminRole, updatedAt: new Date() } }
      )

      await logAuditEvent(db, {
        action: AUDIT_ACTIONS.ADMIN_ROLE_CHANGED,
        userId: user.id,
        userEmail: user.email,
        targetId: userId,
        targetType: 'user',
        details: { targetEmail: targetUser.email, newRole: adminRole || 'user' }
      })

      return jsonResponse({ success: true })
    }

    // ====== AUDIT LOGS ======

    // Admin: Get audit logs
    if (route === '/admin/audit-logs' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!hasPermission(user, 'canViewAuditLogs')) return errorResponse('Forbidden', 403)

      const url = new URL(request.url)
      const filters = {
        userId: url.searchParams.get('userId'),
        workspaceId: url.searchParams.get('workspaceId'),
        action: url.searchParams.get('action'),
        startDate: url.searchParams.get('startDate'),
        endDate: url.searchParams.get('endDate')
      }

      const limit = parseInt(url.searchParams.get('limit')) || 100
      const logs = await getAuditLogs(db, filters, limit)

      return jsonResponse({ auditLogs: logs })
    }

    // ====== CLIENT MANAGEMENT (for admin) ======

    // Admin: Get all clients with details
    if (route === '/admin/clients' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!hasPermission(user, 'canViewClientDetails')) return errorResponse('Forbidden', 403)

      // Get all workspaces with their owners
      const workspaces = await db.collection('workspaces')
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .toArray()

      // Get owner info for each workspace
      const clientsWithDetails = await Promise.all(workspaces.map(async (ws) => {
        const owner = await db.collection('users').findOne(
          { workspaceId: ws.id, role: 'owner' },
          { projection: { _id: 0, password: 0 } }
        )
        const agentCount = await db.collection('agents').countDocuments({ workspaceId: ws.id })
        const contactCount = await db.collection('contacts').countDocuments({ workspaceId: ws.id })
        const integrations = await db.collection('integrations').findOne({ workspaceId: ws.id })

        return {
          ...ws,
          owner: owner || null,
          stats: {
            agents: agentCount,
            contacts: contactCount,
            hasIntegrations: {
              twilio: integrations?.twilio?.configured || false,
              ghl: integrations?.ghl?.configured || false,
              calcom: integrations?.calcom?.configured || false
            }
          }
        }
      }))

      return jsonResponse({ clients: clientsWithDetails })
    }

    // Admin: Get single client details
    if (route.match(/^\/admin\/clients\/[^/]+$/) && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!hasPermission(user, 'canViewClientDetails')) return errorResponse('Forbidden', 403)

      const workspaceId = path[2]

      const workspace = await db.collection('workspaces').findOne({ id: workspaceId })
      if (!workspace) return errorResponse('Client not found', 404)

      const [owner, agents, contacts, integrations, callLogs] = await Promise.all([
        db.collection('users').findOne({ workspaceId, role: 'owner' }, { projection: { _id: 0, password: 0 } }),
        db.collection('agents').find({ workspaceId }, { projection: { _id: 0 } }).toArray(),
        db.collection('contacts').find({ workspaceId }, { projection: { _id: 0 } }).limit(100).toArray(),
        db.collection('integrations').findOne({ workspaceId }, { projection: { _id: 0 } }),
        db.collection('call_logs').find({ workspaceId }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(50).toArray()
      ])

      // Mask integration secrets
      const maskedIntegrations = integrations ? {
        twilio: { configured: integrations.twilio?.configured || false },
        ghl: { configured: integrations.ghl?.configured || false },
        calcom: { configured: integrations.calcom?.configured || false },
        deepgram: { configured: integrations.deepgram?.configured || false },
        elevenlabs: { configured: integrations.elevenlabs?.configured || false }
      } : null

      return jsonResponse({
        workspace: { ...workspace, _id: undefined },
        owner,
        agents,
        contacts,
        integrations: maskedIntegrations,
        recentCalls: callLogs
      })
    }

    // ====== CONTACTS ======

    // Create contact
    if (route === '/contacts' && method === 'POST') {
      if (!user) return errorResponse('Unauthorized', 401)

      const body = await request.json()
      const contactId = uuidv4()

      const contact = {
        id: contactId,
        workspaceId: user.workspaceId,
        firstName: body.firstName || '',
        lastName: body.lastName || '',
        email: body.email || '',
        phone: body.phone || '',
        company: body.company || '',
        tags: body.tags || [],
        notes: body.notes || '',
        customFields: body.customFields || {},
        createdAt: new Date(),
        updatedAt: new Date()
      }

      await db.collection('contacts').insertOne(contact)

      await logAuditEvent(db, {
        action: AUDIT_ACTIONS.CONTACT_CREATED,
        userId: user.id,
        userEmail: user.email,
        workspaceId: user.workspaceId,
        targetId: contactId,
        targetType: 'contact',
        details: { contactName: `${contact.firstName} ${contact.lastName}` }
      })

      return jsonResponse(contact, 201)
    }

    // List contacts
    if (route === '/contacts' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)

      const url = new URL(request.url)
      const limit = parseInt(url.searchParams.get('limit')) || 100
      const skip = parseInt(url.searchParams.get('skip')) || 0
      const search = url.searchParams.get('search')

      const query = { workspaceId: user.workspaceId }
      if (search) {
        query.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { company: { $regex: search, $options: 'i' } }
        ]
      }

      const [contacts, total] = await Promise.all([
        db.collection('contacts')
          .find(query, { projection: { _id: 0 } })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        db.collection('contacts').countDocuments(query)
      ])

      return jsonResponse({ contacts, total, limit, skip })
    }

    // Bulk import contacts
    if (route === '/contacts/bulk' && method === 'POST') {
      if (!user) return errorResponse('Unauthorized', 401)

      const body = await request.json()
      const { contacts: contactsData } = body

      if (!Array.isArray(contactsData) || contactsData.length === 0) {
        return errorResponse('Contacts array is required')
      }

      if (contactsData.length > 1000) {
        return errorResponse('Maximum 1000 contacts per import')
      }

      const contacts = contactsData.map(c => ({
        id: uuidv4(),
        workspaceId: user.workspaceId,
        firstName: c.firstName || c.first_name || '',
        lastName: c.lastName || c.last_name || '',
        email: c.email || '',
        phone: c.phone || c.phoneNumber || c.phone_number || '',
        company: c.company || c.companyName || c.company_name || '',
        tags: c.tags || [],
        notes: c.notes || '',
        customFields: c.customFields || {},
        createdAt: new Date(),
        updatedAt: new Date()
      }))

      await db.collection('contacts').insertMany(contacts)

      await logAuditEvent(db, {
        action: AUDIT_ACTIONS.CONTACTS_IMPORTED,
        userId: user.id,
        userEmail: user.email,
        workspaceId: user.workspaceId,
        details: { count: contacts.length }
      })

      return jsonResponse({ success: true, imported: contacts.length })
    }

    // Delete contact
    if (route.match(/^\/contacts\/[^/]+$/) && method === 'DELETE') {
      if (!user) return errorResponse('Unauthorized', 401)

      const contactId = path[1]
      const result = await db.collection('contacts').deleteOne({ id: contactId, workspaceId: user.workspaceId })

      if (result.deletedCount === 0) return errorResponse('Contact not found', 404)

      await logAuditEvent(db, {
        action: AUDIT_ACTIONS.CONTACT_DELETED,
        userId: user.id,
        userEmail: user.email,
        workspaceId: user.workspaceId,
        targetId: contactId,
        targetType: 'contact'
      })

      return jsonResponse({ success: true })
    }

    // Route not found
    return errorResponse(`Route ${route} not found`, 404)

  } catch (error) {
    console.error('API Error:', error)
    return errorResponse('Internal server error', 500)
  }
}

// Export all HTTP methods
export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
