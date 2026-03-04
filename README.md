# AICoPilot 1.0 — Voice AI Agent Platform

A full-stack Voice AI Agent Platform built with Next.js, MongoDB, and shadcn/ui. Create and manage AI-powered voice agents for inbound and outbound calls.

## Quick Start — Deploy & Use

### 1. Copy the environment template

```bash
cp .env.example .env
```

### 2. Fill in your API keys in `.env`

Open `.env` and add your keys. All platform-level keys are optional — set the ones you have:

| Variable | Service | Purpose |
|---|---|---|
| `MONGO_URL` | MongoDB | Database connection string |
| `JWT_SECRET` | — | Secret for signing auth tokens (change in production) |
| `ADMIN_EMAILS` | — | Comma-separated super admin emails |
| `DEEPGRAM_API_KEY` | Deepgram | Speech-to-text for voice agents |
| `ELEVENLABS_API_KEY` | ElevenLabs | Text-to-speech for voice agents |
| `TWILIO_ACCOUNT_SID` | Twilio | Voice calls & phone numbers |
| `TWILIO_AUTH_TOKEN` | Twilio | Voice calls & phone numbers |
| `GHL_API_KEY` | GoHighLevel | CRM integration |
| `CALCOM_API_KEY` | Cal.com | Calendar scheduling |

### 3. Install & run

```bash
yarn install
yarn dev
```

That's it! Every key you set in `.env` is automatically available to all users as a **Platform Provided** integration — no manual setup needed in the dashboard.

### How platform keys work

- **Platform-level keys** (set in `.env`): Available to all users automatically. Shown as "Platform Provided" on the Integrations page.
- **Workspace-level keys** (set by users in the dashboard): Override platform keys for that specific workspace.
- If a user hasn't configured their own key and a platform key exists, the platform key is used.

## Architecture

- **Frontend**: Next.js 14 + React + Tailwind CSS + shadcn/ui
- **Backend**: Next.js API Routes (proxied through FastAPI)
- **Database**: MongoDB
- **Auth**: JWT-based with role-based access control

## Features

- Admin panel with user/client management
- Role-based permissions (Super Admin, Moderator, User)
- Voice agent creation with customizable prompts
- Integration management (Twilio, Deepgram, ElevenLabs, GHL, Cal.com)
- Bulk contact import (CSV)
- Audit logging
- Encrypted secret storage (AES-256-GCM)

