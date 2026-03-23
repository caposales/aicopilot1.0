# AI Copilot 1.0 - Product Requirements Document

## Original Problem Statement
User has an AI agent making platform (Next.js + MongoDB + Twilio) for call bots. They requested adding an embeddable chatbot widget feature with:
- Both general AI chat and custom knowledge base bots
- Basic colors/branding customization
- Both script tag and iframe embed options
- Using Emergent Universal API key for AI (gpt-5.2)
- Floating bubble style widget

## Architecture
- **Frontend**: Next.js 14 with Tailwind CSS, shadcn/ui components
- **Backend**: Next.js API routes (catch-all pattern)
- **Database**: MongoDB
- **AI**: Emergent Universal API (gpt-5.2 via integrations.emergentagent.com)
- **Auth**: JWT-based authentication

## User Personas
1. **Business Owner**: Wants to add AI chatbot to their website without coding
2. **Marketing Agency**: Needs customizable chatbots for multiple client sites
3. **Developer**: Wants easy embed options (script tag or iframe)

## Core Requirements
- [x] Chatbot CRUD operations (create, read, update, delete)
- [x] Customizable appearance (color, position, branding)
- [x] Knowledge base support for custom training
- [x] Embeddable widget (script tag)
- [x] Embeddable widget (iframe)
- [x] AI chat using Emergent LLM API
- [x] Multi-turn conversation support
- [x] Test page for previewing chatbots

## What's Been Implemented (March 23, 2026)

### Chatbot Widget Feature
1. **New Dashboard Page**: `/dashboard/chatbots` - Create and manage chatbot widgets
2. **ChatbotEditor Component**: Full CRUD UI with tabs for settings, appearance, knowledge base, and embed code
3. **API Endpoints**:
   - `POST /api/chatbots` - Create chatbot
   - `GET /api/chatbots` - List chatbots
   - `GET /api/chatbots/:id` - Get single chatbot
   - `PUT /api/chatbots/:id` - Update chatbot
   - `DELETE /api/chatbots/:id` - Delete chatbot
   - `GET /api/chatbots/:id/widget.js` - Embeddable widget script
   - `POST /api/chatbots/:id/chat` - AI chat endpoint (public)
   - `GET /api/chatbots/:id/test` - Test page
   - `GET /api/chatbots/:id/embed` - iframe embed page

4. **Widget Features**:
   - Floating bubble that opens chat window
   - Customizable colors and positioning
   - Welcome message
   - Typing indicator
   - Message history
   - Knowledge base integration for context-aware responses

5. **Navigation**: Added "Chatbots" link in Sidebar

## Prioritized Backlog

### P0 (Critical)
- None remaining

### P1 (High Priority)
- Analytics dashboard for chatbot conversations
- Export conversation logs
- Rate limiting for public chat endpoint

### P2 (Medium Priority)
- File upload for knowledge base (PDF, docs)
- Multiple chatbot personas/agents per widget
- Chatbot conversation analytics
- A/B testing for welcome messages

### P3 (Future)
- Voice input/output for chatbot
- Multilingual support
- Integration with CRM (GHL, etc.)
- White-label options for agencies

## Next Tasks
1. Test external URL routing (may need ingress configuration)
2. Add conversation analytics/logs view in dashboard
3. Consider rate limiting for public endpoints
