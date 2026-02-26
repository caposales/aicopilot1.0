// Admin role-based permissions utility

// Role hierarchy: super_admin > moderator > user
const ADMIN_ROLES = {
  SUPER_ADMIN: 'super_admin',
  MODERATOR: 'moderator',
  USER: 'user'
}

// Super admin emails from env (full access)
const SUPER_ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',').map(e => e.trim().toLowerCase()) || []

// Permissions by role
const ROLE_PERMISSIONS = {
  super_admin: {
    canViewUsers: true,
    canDeleteUsers: true,
    canAssignRoles: true,
    canInviteAdmins: true,
    canViewAllContent: true,
    canDeleteContent: true,
    canViewAuditLogs: true,
    canManageSystemSettings: true,
    canViewClientDetails: true
  },
  moderator: {
    canViewUsers: true,
    canDeleteUsers: false,
    canAssignRoles: false,
    canInviteAdmins: false,
    canViewAllContent: true,
    canDeleteContent: false,
    canViewAuditLogs: true,
    canManageSystemSettings: false,
    canViewClientDetails: true
  },
  user: {
    canViewUsers: false,
    canDeleteUsers: false,
    canAssignRoles: false,
    canInviteAdmins: false,
    canViewAllContent: false,
    canDeleteContent: false,
    canViewAuditLogs: false,
    canManageSystemSettings: false,
    canViewClientDetails: false
  }
}

export function isAdminEmail(email) {
  if (!email) return false
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase())
}

export function isSuperAdmin(email) {
  if (!email) return false
  return SUPER_ADMIN_EMAILS.includes(email.toLowerCase())
}

export function getAdminEmails() {
  return SUPER_ADMIN_EMAILS
}

export function getAdminRole(user) {
  if (!user) return ADMIN_ROLES.USER
  
  // Check if super admin by email
  if (isSuperAdmin(user.email)) {
    return ADMIN_ROLES.SUPER_ADMIN
  }
  
  // Check stored admin role
  if (user.adminRole === ADMIN_ROLES.MODERATOR) {
    return ADMIN_ROLES.MODERATOR
  }
  
  return ADMIN_ROLES.USER
}

export function hasPermission(user, permission) {
  const role = getAdminRole(user)
  return ROLE_PERMISSIONS[role]?.[permission] || false
}

export function isAnyAdmin(user) {
  const role = getAdminRole(user)
  return role === ADMIN_ROLES.SUPER_ADMIN || role === ADMIN_ROLES.MODERATOR
}

export { ADMIN_ROLES, ROLE_PERMISSIONS }
