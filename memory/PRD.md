# AI Copilot 1.0 - Product Requirements Document

## Original Problem Statement
User has an AI agent making platform (Next.js + MongoDB + Twilio) for call bots. They requested:
1. Embeddable chatbot widget feature
2. Real-time in-browser voice demo to test agent knowledge and response speed (like a phone call but without Twilio)
3. Using Deepgram (STT) + OpenAI (LLM) + ElevenLabs (TTS) for the voice demo

## Architecture
- **Frontend**: Next.js 14 with Tailwind CSS, shadcn/ui components
- **Backend**: Next.js API routes (catch-all pattern)
- **Database**: MongoDB
- **AI**: Emergent Universal API (gpt-5.2 via integrations.emergentagent.com)
- **Speech-to-Text**: Deepgram WebSocket API (real-time streaming)
- **Text-to-Speech**: ElevenLabs API (with browser fallback)
- **Auth**: JWT-based authentication

## User Personas
1. **Business Owner**: Wants to test AI agent responsiveness before going live
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
- [x] Real-time voice demo page (IN PROGRESS)

## What's Been Implemented

### March 30, 2026 - Real-Time Voice Demo
1. **Demo Page**: `/dashboard/demo` - Test agents with real-time voice
2. **Architecture**:
   - Browser captures microphone audio using ScriptProcessor (PCM)
   - Audio streams to Deepgram WebSocket for real-time STT
   - Transcripts sent to OpenAI for AI response
   - Response sent to ElevenLabs for TTS audio playback
   - Fallback to browser Web Speech API if ElevenLabs unavailable

3. **API Endpoints**:
   - `POST /api/demo/deepgram-token` - Returns Deepgram API key for WebSocket auth
   - `POST /api/demo/tts` - ElevenLabs TTS generation
   - `POST /api/demo/stream` - Fast AI response endpoint

4. **Features**:
   - Real-time speech transcription display
   - Visual status indicators (Listening, Processing, Speaking)
   - Call duration timer
   - Agent selection panel
   - Conversation history display

### March 23, 2026 - Chatbot Widget Feature
1. **New Dashboard Page**: `/dashboard/chatbots` - Create and manage chatbot widgets
2. **ChatbotEditor Component**: Full CRUD UI with tabs
3. **API Endpoints**: Full CRUD + widget.js + chat + test + embed

## Prioritized Backlog

### P0 (Critical) - IN PROGRESS
- Real-time voice demo testing and refinement

### P1 (High Priority)
- Agent Templates
- Knowledge Base Upload (PDF, docs)
- Admin Dashboard

### P2 (Medium Priority)
- Analytics dashboard for conversations
- Export conversation logs
- Rate limiting for public endpoints

### P3 (Future)
- Multilingual support
- Integration with CRM (GHL, etc.)
- White-label options

## Known Issues
- ElevenLabs TTS requires user to have voices in their account (currently 0 voices - falls back to browser TTS)
- Deepgram temporary token generation requires higher API key permissions (using direct API key as fallback)

## Next Tasks
1. User testing of voice demo feature (requires microphone)
2. Add ElevenLabs voice selection when user has voices
3. Consider adding Deepgram integration to Integrations page
