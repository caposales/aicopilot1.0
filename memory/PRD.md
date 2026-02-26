# ENT Solutions - Voice AI Agent Platform PRD

## Overview
A comprehensive Voice AI Agent Platform for businesses to create and manage AI-powered voice agents for inbound and outbound calls.

## Original Problem Statement
- Add admin page with email whitelist authorization
- Implement role-based permissions (Super Admin vs Moderator)
- Add admin user creation/invite feature with audit logging
- Platform provides Deepgram/ElevenLabs keys, clients bring Twilio/GHL/Cal.com
- Add bulk contact import functionality
- Enhanced agent settings with call transfer and calendar booking options
- Admin panel to view all clients with drill-down to agents/settings

## Architecture
- **Frontend**: Next.js 14 with React, Tailwind CSS, shadcn/ui components
- **Backend**: Next.js API Routes (proxied through FastAPI)
- **Database**: MongoDB
- **Authentication**: JWT-based with email whitelist for admins

## User Personas

### 1. Super Admin
- Full platform access
- Can invite/manage other admins
- Can view all clients and their data
- Can delete users and content
- Can access audit logs

### 2. Moderator
- Read-only admin access
- Can view users, clients, and audit logs
- Cannot delete or modify data
- Cannot invite admins

### 3. Client/User
- Manages their own workspace
- Creates/configures voice agents
- Imports and manages contacts
- Configures integrations (Twilio, GHL, Cal.com)

## Core Features Implemented

### Admin Panel ✅
- **Dashboard**: Platform stats, recent users, recent activity
- **User Management**: View all users, change roles, delete users
- **Client Management**: View all workspaces, drill-down to see agents/contacts
- **Content Management**: Manage agents, call logs, error logs across platform
- **Audit Logs**: Track all system activities (login, agent creation, contacts imported)

### Role-Based Permissions ✅
- Super Admin: Full access (defined by ADMIN_EMAILS env)
- Moderator: View-only access (assigned via admin panel)
- Regular User: Own workspace only

### Admin Invite System ✅
- Super admins can invite new admins
- Mock email implementation (logs to console)
- Invite updates existing user roles if found

### Bulk Contact Import ✅
- CSV paste or file upload
- Supports common field names (first_name, email, phone, etc.)
- Up to 1000 contacts per import
- Audit logged

### Enhanced Agent Settings ✅
- **Call Transfer**:
  - Enable/disable toggle
  - Transfer phone number
  - Transfer conditions (on request, on escalation, always offer)
  - Custom transfer message
  
- **Calendar Booking**:
  - Enable/disable toggle
  - Provider selection (Cal.com or GoHighLevel)
  - Event type ID
  - Confirmation message

### Audit Logging ✅
Tracks:
- User login/logout/register
- Admin invite sent, role changes
- User deleted
- Agent created/updated/deleted
- Contacts imported, created, deleted
- Integration configured

## Configuration

### Environment Variables
```
ADMIN_EMAILS=admin@example.com,admin2@example.com  # Super admin emails
JWT_SECRET=your-secret-key
MONGO_URL=mongodb://localhost:27017
DB_NAME=test_database
```

### Test Credentials
- Admin: admin@example.com / admin123
- Regular User: user@test.com / user123

## What's Been Implemented (Feb 2026)

### Phase 1 - Admin Foundation ✅
- Admin page with email whitelist authorization
- Super Admin vs Moderator roles
- Admin sidebar with navigation

### Phase 2 - Enhanced Admin ✅
- Admin dashboard with stats
- User management with role controls
- Client management with drill-down views
- Audit log viewer with filters
- Admin invite functionality (mock email)

### Phase 3 - Client Features ✅
- Contacts page with CRUD operations
- Bulk contact import (CSV paste/upload)
- Enhanced agent editor with:
  - Call transfer settings
  - Calendar booking settings (Cal.com/GHL)

## Prioritized Backlog

### P0 (Critical)
- [ ] Integrate actual Deepgram/ElevenLabs keys for voice
- [ ] Implement real Twilio integration for calls
- [ ] Connect Cal.com/GHL calendar booking

### P1 (Important)
- [ ] Real email sending for admin invites
- [ ] Outbound calling campaign feature
- [ ] Call recording and transcription

### P2 (Nice to Have)
- [ ] Export contacts to CSV
- [ ] Batch agent operations
- [ ] Custom analytics dashboard
- [ ] Webhook testing interface

## Next Tasks
1. Obtain Deepgram/ElevenLabs API keys for voice AI
2. Client Twilio integration for phone numbers
3. Cal.com/GHL OAuth integration for booking
4. Real email provider (Resend/SendGrid) for invites
