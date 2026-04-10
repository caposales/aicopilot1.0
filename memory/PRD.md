# AI Copilot 1.0 - Product Requirements Document

## Original Problem Statement
User has an AI agent making platform (Next.js + MongoDB + Twilio) for call bots. They requested:
1. Embeddable chatbot widget feature
2. Real-time in-browser voice demo to test agent knowledge and response speed (like a phone call but without Twilio)
3. Using Deepgram (STT) + Groq LLM + ElevenLabs (TTS) for the voice demo
4. Ability for AI to execute real actions (e.g., Cal.com booking) via function calling

## Architecture
- **Frontend**: Next.js 14 with Tailwind CSS, shadcn/ui components
- **Backend**: FastAPI WebSocket server (`server.py`) + Next.js API routes
- **Database**: MongoDB (`test_database`)
- **LLM**: Groq (llama-3.1-8b-instant) with tool/function calling
- **Speech-to-Text**: Deepgram WebSocket API (real-time streaming)
- **Text-to-Speech**: ElevenLabs WebSocket API (streaming)
- **Auth**: JWT-based authentication
- **Integrations**: Cal.com API for appointment booking

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
- [x] Real-time voice demo page
- [x] Cal.com function calling for voice agent (booking appointments)

## What's Been Implemented

### April 10, 2026 - Cal.com Function Calling Integration
1. **Cal.com Service**: `/backend/cal_service.py` - Full Cal.com API integration
   - `check_availability()` - Check available time slots
   - `create_booking()` - Book appointments
   - `get_event_types()` - List event types
   - `get_bookings()` - List existing bookings

2. **LLM Function Calling**: Updated `server.py` respond() function
   - Groq LLM with tools/function calling support
   - Two-pass approach: First LLM call detects tool call, executes function, second LLM call verbalizes result
   - Proper tool message format with `tool_call_id` for Groq API

3. **Frontend Integration**: Updated `/dashboard/demo/page.js`
   - Fetches Cal.com API key from `/api/integrations/demo-keys`
   - Sends Cal.com config to WebSocket on connection
   - Visual indicator showing "Cal.com booking enabled"

4. **New API Endpoint**: `/api/integrations/demo-keys`
   - Returns decrypted integration keys for authenticated users
   - Used by demo page to pass keys to WebSocket

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

### P0 (Critical) - COMPLETED
- [x] Real-time voice demo with function calling
- [x] Cal.com booking integration for voice agent

### P1 (High Priority)
- Agent Templates
- Knowledge Base Upload (PDF, docs)
- Admin Dashboard
- Embeddable AI chatbot widget generation

### P2 (Medium Priority)
- Twilio telephony integration for real phone numbers
- Analytics dashboard for conversations
- Export conversation logs
- Rate limiting for public endpoints

### P3 (Future)
- Multilingual support
- Integration with CRM (GHL, etc.)
- White-label options

## Known Issues
- ElevenLabs TTS requires user to have voices in their account (currently 0 voices - may cause issues)
- Deepgram temporary token generation requires higher API key permissions (using direct API key)
- Browser echo cancellation is imperfect - users should use headphones for best results

## Next Tasks
1. User testing of voice demo with Cal.com booking (requires microphone)
2. Add more function calling capabilities (e.g., lead qualification, CRM updates)
3. Agent Templates feature
4. Knowledge Base Upload
