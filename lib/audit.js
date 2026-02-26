// Audit logging utility

export const AUDIT_ACTIONS = {
  // Auth actions
  USER_LOGIN: 'user_login',
  USER_LOGOUT: 'user_logout',
  USER_REGISTER: 'user_register',
  PASSWORD_RESET: 'password_reset',
  
  // Admin actions
  ADMIN_INVITE_SENT: 'admin_invite_sent',
  ADMIN_ROLE_CHANGED: 'admin_role_changed',
  USER_DELETED: 'user_deleted',
  
  // Agent actions
  AGENT_CREATED: 'agent_created',
  AGENT_UPDATED: 'agent_updated',
  AGENT_DELETED: 'agent_deleted',
  
  // Contact actions
  CONTACTS_IMPORTED: 'contacts_imported',
  CONTACT_CREATED: 'contact_created',
  CONTACT_DELETED: 'contact_deleted',
  
  // Integration actions
  INTEGRATION_CONFIGURED: 'integration_configured',
  INTEGRATION_REMOVED: 'integration_removed'
}

export async function logAuditEvent(db, {
  action,
  userId,
  userEmail,
  workspaceId,
  targetId,
  targetType,
  details,
  ipAddress
}) {
  const auditLog = {
    id: crypto.randomUUID(),
    action,
    userId,
    userEmail,
    workspaceId,
    targetId,
    targetType,
    details: details || {},
    ipAddress: ipAddress || 'unknown',
    createdAt: new Date()
  }
  
  await db.collection('audit_logs').insertOne(auditLog)
  
  // Also log to console for debugging
  console.log(`[AUDIT] ${action} by ${userEmail} - ${JSON.stringify(details)}`)
  
  return auditLog
}

export async function getAuditLogs(db, filters = {}, limit = 100) {
  const query = {}
  
  if (filters.userId) query.userId = filters.userId
  if (filters.workspaceId) query.workspaceId = filters.workspaceId
  if (filters.action) query.action = filters.action
  if (filters.startDate) query.createdAt = { $gte: new Date(filters.startDate) }
  if (filters.endDate) {
    query.createdAt = query.createdAt || {}
    query.createdAt.$lte = new Date(filters.endDate)
  }
  
  const logs = await db.collection('audit_logs')
    .find(query, { projection: { _id: 0 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray()
  
  return logs
}
