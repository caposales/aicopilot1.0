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

// ElevenLabs voices (pre-defined list)
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

      return jsonResponse({
        token,
        user: { id: user.id, email: user.email, name: user.name, workspaceId: user.workspaceId, role: user.role },
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

    // Get voices list (public)
    if (route === '/voices' && method === 'GET') {
      return jsonResponse({ voices: ELEVENLABS_VOICES })
    }

    // Get pre-made prompts (public)
    if (route === '/prompts' && method === 'GET') {
      return jsonResponse({ prompts: PREMADE_PROMPTS })
    }

    // ====== PROTECTED ROUTES ======
    const user = await authenticateRequest(request, db)

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
        callTransferEnabled: body.callTransferEnabled || false,
        callTransferNumber: body.callTransferNumber || '',
        calendarBookingEnabled: body.calendarBookingEnabled || false,
        postCallWebhookEnabled: body.postCallWebhookEnabled || false,
        postCallWebhookUrl: body.postCallWebhookUrl || '',
        promptTemplateId: body.promptTemplateId || '',
        customPrompt: body.customPrompt || '',
        phoneNumber: body.phoneNumber || null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      await db.collection('agents').insertOne(agent)
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
      
      if (!isAdminEmail(user.email)) {
        return errorResponse('Forbidden: Admin access required', 403)
      }
      
      return jsonResponse({ isAdmin: true })
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
      if (!isAdminEmail(user.email)) return errorResponse('Forbidden', 403)
      
      const users = await db.collection('users')
        .find({}, { projection: { _id: 0, password: 0 } })
        .sort({ createdAt: -1 })
        .toArray()
      
      // Mark admins
      const usersWithAdminFlag = users.map(u => ({
        ...u,
        isAdmin: isAdminEmail(u.email)
      }))
      
      return jsonResponse({ users: usersWithAdminFlag })
    }

    // Admin: Delete user
    if (route.match(/^\/admin\/users\/[^/]+$/) && method === 'DELETE') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!isAdminEmail(user.email)) return errorResponse('Forbidden', 403)
      
      const userId = path[2]
      
      // Get user to check if admin
      const targetUser = await db.collection('users').findOne({ id: userId })
      if (!targetUser) return errorResponse('User not found', 404)
      
      // Prevent deleting admins
      if (isAdminEmail(targetUser.email)) {
        return errorResponse('Cannot delete admin users', 403)
      }
      
      // Delete user and their workspace
      await Promise.all([
        db.collection('users').deleteOne({ id: userId }),
        db.collection('workspaces').deleteOne({ id: targetUser.workspaceId }),
        db.collection('agents').deleteMany({ workspaceId: targetUser.workspaceId }),
        db.collection('integrations').deleteMany({ workspaceId: targetUser.workspaceId })
      ])
      
      return jsonResponse({ success: true })
    }

    // Admin: List all agents
    if (route === '/admin/agents' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!isAdminEmail(user.email)) return errorResponse('Forbidden', 403)
      
      const agents = await db.collection('agents')
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .toArray()
      
      return jsonResponse({ agents })
    }

    // Admin: Delete agent
    if (route.match(/^\/admin\/agents\/[^/]+$/) && method === 'DELETE') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!isAdminEmail(user.email)) return errorResponse('Forbidden', 403)
      
      const agentId = path[2]
      const result = await db.collection('agents').deleteOne({ id: agentId })
      
      if (result.deletedCount === 0) return errorResponse('Agent not found', 404)
      return jsonResponse({ success: true })
    }

    // Admin: List all call logs
    if (route === '/admin/call-logs' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!isAdminEmail(user.email)) return errorResponse('Forbidden', 403)
      
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
      if (!isAdminEmail(user.email)) return errorResponse('Forbidden', 403)
      
      const logId = path[2]
      const result = await db.collection('call_logs').deleteOne({ id: logId })
      
      if (result.deletedCount === 0) return errorResponse('Call log not found', 404)
      return jsonResponse({ success: true })
    }

    // Admin: List all error logs
    if (route === '/admin/error-logs' && method === 'GET') {
      if (!user) return errorResponse('Unauthorized', 401)
      if (!isAdminEmail(user.email)) return errorResponse('Forbidden', 403)
      
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
      if (!isAdminEmail(user.email)) return errorResponse('Forbidden', 403)
      
      const logId = path[2]
      const result = await db.collection('error_logs').deleteOne({ id: logId })
      
      if (result.deletedCount === 0) return errorResponse('Error log not found', 404)
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
