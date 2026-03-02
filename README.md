# AI Copilot 1.0

A voice-AI agent platform. Connect your ElevenLabs voices and Twilio phone numbers, create AI agents, and manage inbound/outbound calls — all from one dashboard.

---

## Fastest Way to Go Live: Vercel + MongoDB Atlas

Your app is a **Next.js 14** application. All business logic lives in the Next.js API routes (`app/api/`). The Python file in `backend/` is only a local dev proxy — **you do not deploy it**.

### What you need before starting

| Service | Free tier? | What you do there |
|---------|-----------|-------------------|
| [Vercel](https://vercel.com) | ✅ Yes | Hosts the Next.js app |
| [MongoDB Atlas](https://cloud.mongodb.com) | ✅ Yes (M0) | Hosts the database |
| [ElevenLabs](https://elevenlabs.io) | ✅ Yes | Voice AI — copy your API key |
| [Twilio](https://twilio.com) | Paid (trial available) | Phone numbers — copy Account SID + Auth Token |

---

## Step 1 — Set up MongoDB Atlas (5 minutes)

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com) → **Create a free M0 cluster**.
2. Under **Database Access** → add a user with a strong password (save it).
3. Under **Network Access** → click **Add IP Address** → choose **Allow access from anywhere** (`0.0.0.0/0`).
   > ⚠️ This is fine to get started. For production, lock it down: either add [Vercel's outbound IP ranges](https://vercel.com/docs/edge-network/regions) or use a VPC-peered Atlas cluster.
4. On your cluster → click **Connect** → **Drivers** → copy the connection string. It looks like:
   ```
   mongodb+srv://youruser:yourpassword@cluster0.xxxxx.mongodb.net
   ```
   Replace `<password>` with your actual password and remove any trailing `/?retryWrites=...` if present.

---

## Step 2 — Deploy to Vercel (3 minutes)

1. Go to [vercel.com/new](https://vercel.com/new) and sign in with GitHub.
2. Click **Import** next to your repository.
3. Vercel auto-detects Next.js — leave all framework settings as-is.
4. Before clicking **Deploy**, expand **Environment Variables** and add every variable from the table below.
5. Click **Deploy**. Your app will be live at `https://your-project.vercel.app` in ~2 minutes.

### Required Environment Variables

Add these in **Vercel → Project → Settings → Environment Variables**:

| Variable | Example value | Notes |
|----------|--------------|-------|
| `MONGO_URL` | `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net` | From Atlas Step 2 above |
| `DB_NAME` | `aicopilot` | Any name you want — Atlas creates it automatically |
| `JWT_SECRET` | *(random 32+ chars)* | Generate: `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | *(exactly 32 chars)* | Generate: `openssl rand -hex 16` |
| `ADMIN_EMAILS` | `you@gmail.com` | Your email — grants admin access |
| `NEXT_PUBLIC_BASE_URL` | `https://your-project.vercel.app` | Your Vercel URL (update after first deploy) |
| `CORS_ORIGINS` | `https://your-project.vercel.app` | Set to your Vercel URL. Using `*` works but is not recommended for production |

> **Tip:** Generate secrets in one command:
> ```bash
> openssl rand -hex 32   # for JWT_SECRET
> openssl rand -hex 16   # for ENCRYPTION_KEY (gives exactly 32 hex chars)
> ```

---

## Step 3 — Connect ElevenLabs

1. In your deployed app, log in and go to **Settings → Integrations**.
2. Paste your [ElevenLabs API key](https://elevenlabs.io/app/settings/api-keys).
3. Your voices will appear in the Agent editor automatically.

---

## Step 4 — Connect Twilio

1. In **Settings → Integrations**, paste your Twilio **Account SID** and **Auth Token** (from [console.twilio.com](https://console.twilio.com)).
2. Your purchased phone numbers will appear in the dashboard.
3. For inbound calls on a Twilio number, set the number's **Voice webhook URL** in the Twilio console to:
   ```
   https://your-project.vercel.app/api/twilio/inbound
   ```

---

## Step 5 — Create your first Admin user

1. Register an account using the email you put in `ADMIN_EMAILS`.
2. You automatically get admin access — navigate to `/admin` to manage workspaces, agents, and users.

---

## Redeploying after code changes

Every `git push` to your **main** branch triggers an automatic redeploy on Vercel — no action needed.

To update environment variables: Vercel → Project → Settings → Environment Variables → save → **Redeploy**.

---

## Local development

```bash
# 1. Copy the example env file
cp .env.example .env.local

# 2. Fill in your values in .env.local

# 3. Install dependencies
npm install

# 4. Start the dev server
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000).

> The `backend/` directory contains a local-only Python reverse proxy used in the original dev environment. It is **not needed** for Vercel or any cloud deployment.

---

## Architecture

```
GitHub repo
    │
    └─▶ Vercel (Next.js 14)
            ├── /app            ← React pages (dashboard, admin, agents)
            ├── /app/api        ← All backend logic (auth, agents, Twilio, ElevenLabs…)
            └── /lib/db.js      ← MongoDB Atlas connection
```
